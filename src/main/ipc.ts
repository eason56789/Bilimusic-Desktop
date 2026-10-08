/** 所有 ipcMain.handle 注册 */
import { ipcMain, dialog, shell, app, BrowserWindow, clipboard, nativeTheme } from 'electron'
import { extname, join, basename } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  rmSync
} from 'fs'
import { tmpdir } from 'os'
import type {
  Library,
  Playlist,
  PreparedAudio,
  Song,
  Settings,
  UserProfile
} from '@shared/types'
import * as bilibili from './api/bilibili'
import * as netease from './api/netease'
import { fetchPlaylistByLink } from './api/linkImport'
import { computeSyncPlan } from './syncDelta'
import { getLyrics } from './api/lyrics'
import { prepareAudio, coverProxyUrl, clearAudioCache, getCacheDir } from './audio'
import { enqueueDownload, cancelDownload, removeDownload } from './downloads'
import {
  getStore,
  saveStore,
  upsertSong,
  upsertSongs,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  addRecent,
  addListenTime,
  setSetting,
  addSearchHistory,
  removeSearchHistory,
  setBiliCookieStore,
  setNeteaseCookieStore,
  setProfile,
  resetStore,
  getLibraryFilePath
} from './store'
import { setBiliCookie, onBiliCookieChange } from './api/bilibili'
import { setNeteaseCookies, onNeteaseCookieChange, getNeteaseCookies } from './api/netease'
import {
  showFloat,
  getFloatWindow,
  forwardFloatState,
  forwardFloatControl,
  openMainWindow
} from './float'
import type { FloatLyricState, FloatControlCmd } from '@shared/types'
import QRCode from 'qrcode'

/** 对话框宿主窗口:优先当前聚焦窗口,退回第一个窗口(避免 getFocusedWindow() 为 null 时崩溃) */
function dialogHost(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

/** 主题切换即时生效:更新 nativeTheme 与标题栏按钮颜色 */
function applyThemeNow(theme: string): void {
  nativeTheme.themeSource = theme === 'system' ? 'system' : (theme as 'light' | 'dark')
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.setTitleBarOverlay({
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1b1b1b'
      })
    } catch {
      /* 登录窗口等无 overlay 的窗口忽略 */
    }
  }
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data }
}

function err(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

function librarySnapshot(): Library {
  const d = getStore()
  return {
    songs: d.songs,
    playlists: d.playlists,
    recentPlays: d.recentPlays,
    searchHistory: d.searchHistory,
    downloads: d.downloads,
    downloadedIds: d.downloadedIds,
    settings: d.settings,
    biliProfile: d.biliProfile,
    neteaseProfile: d.neteaseProfile,
    listenStats: d.listenStats
  }
}

function bvidOf(song: Song): string {
  return (song.bvid ?? song.id).replace(/_p\d+$/, '')
}

function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function registerIpc(): void {
  // B站设备 cookie 合并后持久化(收藏夹/播放记录等接口需要 buvid3)
  onBiliCookieChange(setBiliCookieStore)
  // ===== 搜索 =====
  ipcMain.handle('api:biliSearch', async (_e, keyword: string, page: number, order: string) => {
    return bilibili.searchVideos(keyword, page, order)
  })
  ipcMain.handle('api:biliSuggest', (_e, keyword: string) => bilibili.fetchSuggestions(keyword))
  ipcMain.handle('api:neteaseSearch', async (_e, keyword: string, offset: number) => {
    try {
      return ok(await netease.searchSongs(keyword, 30, offset))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteaseSearchPlaylists', async (_e, keyword: string) => {
    try {
      return ok(await netease.searchPlaylistBrief(keyword, 20))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteaseSearchArtists', async (_e, keyword: string) => {
    try {
      const list = await netease.searchArtists(keyword, 20)
      return ok(
        list.map((a: any) => ({
          id: a.id,
          name: a.name,
          avatar: a.img1v1Url ?? a.picUrl ?? '',
          musicCount: a.musicSize
        }))
      )
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteaseArtistSongs', async (_e, artistId: number) => {
    try {
      return ok(await netease.getArtistSongs(artistId))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteasePlaylistSongs', async (_e, id: number) => {
    try {
      return ok(await netease.getPlaylistDetail(id))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteasePersonalized', async () => {
    try {
      return ok(await netease.getPersonalizedPlaylists(12))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle(
    'api:comments',
    async (
      _e,
      song: Song,
      offset: number,
      order: 'hot' | 'time' = 'hot',
      platform?: 'bilibili' | 'netease'
    ) => {
      try {
        const nePayload = (r: { total: number; hasMore: boolean; comments: any[] }) => ({
          total: r.total,
          hasMore: r.hasMore,
          comments: r.comments.map((c) => ({
            id: String(c.id),
            user: c.user,
            avatar: c.avatar,
            content: c.content,
            time: c.time,
            likes: c.likedCount
          }))
        })
        const fetchBili = async () => {
          if (!song.bvid) return { ok: false as const, error: '没有可查看的B站评论' }
          return ok(await bilibili.getVideoComments(bvidOf(song), offset, order))
        }
        const fetchNetease = async () => {
          let id = song.neteaseId
          if (!id) {
            // QQ音乐/酷狗等仅元数据歌曲:按"标题+歌手"搜网易云,取时长最接近的一首的评论
            const kw = `${song.title} ${song.artist}`.trim()
            const res = await netease.searchSongs(kw, 5, 0)
            const pool = (res.songs ?? []).filter((s: Song) => s.neteaseId > 0)
            if (pool.length === 0) return { ok: false as const, error: '网易云未找到对应歌曲' }
            id = pool.reduce((best, s) =>
              Math.abs(s.duration - song.duration) < Math.abs(best.duration - song.duration) ? s : best
            ).neteaseId
          }
          const r = await netease.getMusicComments(id, offset, 20, order)
          return ok(nePayload(r))
        }
        // 兜底场景显式指定平台(网易云垫底B站 / QQ酷狗B站取流时,两个平台都可看)
        if (platform === 'bilibili') return fetchBili()
        if (platform === 'netease') return fetchNetease()
        // 默认:原曲平台优先;放宽为"有bvid就能看B站"(QQ/酷狗兜底视频同样适用)
        if (song.neteaseId) return fetchNetease()
        if (song.bvid) return fetchBili()
        return { ok: false, error: '该来源暂不支持评论(可在播放后查看B站评论)' }
      } catch (e) {
        return err(e)
      }
    }
  )
  ipcMain.handle('api:songDetail', async (_e, song: Song) => {
    try {
      const rows: Record<string, string> = {
        歌曲名称: song.title,
        歌手: song.artist,
        专辑: song.album ?? '-',
        来源:
          song.source === 'NETEASE'
            ? '网易云音乐'
            : song.source === 'BILIBILI'
              ? '哔哩哔哩'
              : song.source === 'QQMUSIC'
                ? 'QQ音乐(经B站取流)'
                : song.source === 'KUGOU'
                  ? '酷狗音乐(经B站取流)'
                  : '本地音频',
        时长: formatDuration(song.duration),
        状态:
          song.source === 'BILIBILI'
            ? 'B站视频音频'
            : getStore().downloadedIds.includes(song.id)
              ? '已下载'
              : '在线播放'
      }
      if (song.neteaseId) {
        // 有 neteaseId 视为网易云原曲(垫底/换源只换音频流):详情显示原曲信息
        rows['来源'] =
          song.source === 'BILIBILI' ? '网易云音乐(音频来自B站)' : '网易云音乐'
        rows['状态'] =
          song.source === 'BILIBILI'
            ? 'B站音频(仅换源)'
            : getStore().downloadedIds.includes(song.id)
              ? '已下载'
              : '在线播放'
        rows['链接'] = `https://music.163.com/song?id=${song.neteaseId}`
        const detail = await netease.getSongDetail([song.neteaseId]).catch(() => [])
        const d = detail[0]
        if (d) {
          rows['专辑'] = d.album ?? rows['专辑']
          rows['专辑ID/曲风'] = String(d.neteaseId)
        }
      } else if (song.source === 'BILIBILI' && song.bvid) {
        const p = song.page > 1 ? `?p=${song.page}` : ''
        rows['链接'] = `https://www.bilibili.com/video/${bvidOf(song)}${p}`
        const detail = await bilibili.getVideoDetail(bvidOf(song)).catch(() => null)
        if (detail) {
          rows['UP主'] = detail.owner
          rows['播放量'] = String(detail.stat?.view ?? '-')
          rows['点赞'] = String(detail.stat?.like ?? '-')
          rows['弹幕'] = String(detail.stat?.danmaku ?? '-')
        }
      } else if (song.localPath) {
        rows['路径'] = song.localPath
      }
      return ok(rows)
    } catch (e) {
      return err(e)
    }
  })

  // ===== 播放 =====
  ipcMain.handle(
    'audio:prepare',
    async (_e, song: Song, html5Fallback?: boolean): Promise<PreparedAudio> => {
      return prepareAudio(song, html5Fallback, getStore().settings.neteaseQuality)
    }
  )
  ipcMain.handle('lyrics:get', (_e, song: Song) => getLyrics(song))
  ipcMain.handle('pages:get', (_e, bvid: string) => bilibili.getVideoPages(bvid))

  // ===== 库 =====
  ipcMain.handle('library:get', () => librarySnapshot())
  ipcMain.handle('library:addSong', (_e, song: Song) => {
    upsertSong(song)
    return true
  })
  ipcMain.handle('library:createPlaylist', (_e, name: string, description?: string) =>
    createPlaylist(name, description)
  )
  ipcMain.handle('library:deletePlaylist', (_e, id: string) => {
    deletePlaylist(id)
    return true
  })
  ipcMain.handle('library:updatePlaylist', (_e, p: { id: string; name: string; description?: string }) => {
    const pl = getStore().playlists.find((x) => x.id === p.id)
    if (pl) {
      pl.name = p.name
      pl.description = p.description ?? pl.description
      pl.updatedAt = Date.now()
      saveStore()
    }
    return pl
  })
  ipcMain.handle('library:addToPlaylist', (_e, playlistId: string, songs: Song[]) => {
    addToPlaylist(playlistId, songs)
    return librarySnapshot().playlists
  })
  ipcMain.handle('library:removeFromPlaylist', (_e, playlistId: string, songId: string) => {
    removeFromPlaylist(playlistId, songId)
    return librarySnapshot().playlists
  })
  ipcMain.handle('library:addRecent', (_e, song: Song) => {
    addRecent(song)
    return true
  })
  ipcMain.handle('library:clearRecent', () => {
    getStore().recentPlays = []
    saveStore()
    return true
  })
  ipcMain.handle('library:addSearchHistory', (_e, q: string) => {
    addSearchHistory(q)
    return true
  })
  ipcMain.handle('library:removeSearchHistory', (_e, q: string) => {
    removeSearchHistory(q)
    return true
  })
  ipcMain.handle('library:clearSearchHistory', () => {
    getStore().searchHistory = []
    saveStore()
    return true
  })
  ipcMain.handle(
    'library:setSetting',
    <K extends keyof Settings>(_e: unknown, key: K, value: Settings[K]) => {
      setSetting(key, value)
      // 主题即时应用(此前仅在启动时应用,切换后标题栏按钮颜色要等重启才更新)
      if (key === 'theme' && typeof value === 'string') applyThemeNow(value)
      return getStore().settings
    }
  )

  // ===== 导入 =====
  ipcMain.handle('library:addListenTime', (_e, ms: number) => {
    const v = Number(ms)
    if (!isFinite(v) || v <= 0) {
      return getStore().listenStats ?? { totalMs: 0, todayMs: 0, date: '' }
    }
    return addListenTime(v)
  })

  ipcMain.handle('bili:favFolders', () => bilibili.getFavoriteFolders())
  // 在线视图:收藏夹/播放记录分页拉取(打开时才获取)
  ipcMain.handle('bili:favPage', (_e, folderId: number, page: number) =>
    bilibili.getFavoriteResourcesPaged(folderId, page, 20)
  )
  ipcMain.handle('bili:historyPage', (_e, max: string, viewAt: string) =>
    bilibili.getWatchHistoryPage(max, viewAt, 20)
  )
  ipcMain.handle('bili:importFav', async (_e, folderId: number, folderName: string) => {
    const { songs } = await bilibili.getFavoriteResources(folderId)
    if (songs.length === 0) return null
    upsertSongs(songs)
    const pl = createPlaylist(folderName, `B站收藏夹导入 · ${songs.length}首`)
    pl.favoriteFolderId = folderId
    pl.favoriteFolderName = folderName
    pl.songIds = songs.map((s) => s.id)
    pl.syncedIds = [...pl.songIds]
    if (songs[0].coverUrl) pl.coverUrl = songs[0].coverUrl
    saveStore()
    return pl
  })
  /**
   * 同步单个歌单(B站收藏夹/网易云歌单/播放记录):
   * 按 syncedIds 快照增量更新,手动加入的歌曲不会被删除。
   */
  async function syncOnePlaylist(
    pl: Playlist
  ): Promise<{ ok: true; data: { added: number; removed: number; total: number } } | { ok: false; error: string }> {
    let remote: Song[] = []
    let complete = true
    if (pl.favoriteFolderId) {
      const r = await bilibili.getFavoriteResources(pl.favoriteFolderId)
      remote = r.songs
      complete = r.complete
    } else if (pl.neteasePlaylistId) {
      remote = await netease.getPlaylistDetail(pl.neteasePlaylistId)
    } else if (pl.biliHistory) {
      const r = await bilibili.getWatchHistory()
      if (r.notLoggedIn) return { ok: false, error: '请先在「设置 → 账号」中登录哔哩哔哩' }
      remote = r.songs
      complete = r.complete
    } else {
      return { ok: false, error: '该歌单不是同步导入的歌单,无法同步' }
    }
    if (remote.length === 0) {
      return complete
        ? { ok: false, error: '远端歌单为空(可能已被删除)' }
        : { ok: false, error: '拉取失败(可能未登录或网络异常)' }
    }
    upsertSongs(remote)
    const plan = computeSyncPlan(pl.songIds, pl.syncedIds ?? [], remote.map((s) => s.id), complete)
    pl.songIds = plan.songIds
    pl.syncedIds = plan.syncedIds
    pl.updatedAt = Date.now()
    saveStore()
    return ok({ added: plan.added, removed: plan.removed, total: pl.songIds.length })
  }

  // 导入B站播放记录(最近观看的视频,可后续同步);已存在则直接同步,避免建重复歌单
  ipcMain.handle('bili:importHistory', async () => {
    try {
      const existing = getStore().playlists.find((p) => p.biliHistory)
      if (existing) {
        const r = await syncOnePlaylist(existing)
        if (!r.ok) return r
        return ok({ id: existing.id, count: r.data.total })
      }
      const { songs, notLoggedIn } = await bilibili.getWatchHistory()
      if (notLoggedIn) return { ok: false, error: '请先在「设置 → 账号」中登录哔哩哔哩' }
      if (songs.length === 0) return { ok: false, error: '没有获取到播放记录(或记录为空)' }
      upsertSongs(songs)
      const pl = createPlaylist('B站播放记录', `B站播放记录导入 · ${songs.length}首`)
      pl.biliHistory = true
      pl.songIds = songs.map((s) => s.id)
      pl.syncedIds = [...pl.songIds]
      if (songs[0].coverUrl) pl.coverUrl = songs[0].coverUrl
      saveStore()
      return ok({ id: pl.id, count: songs.length })
    } catch (e) {
      return err(e)
    }
  })
  // 同步可同步歌单(B站收藏夹/网易云歌单/播放记录)
  ipcMain.handle('library:syncPlaylist', async (_e, playlistId: string) => {
    try {
      const pl = getStore().playlists.find((p) => p.id === playlistId)
      if (!pl) return { ok: false, error: '歌单不存在' }
      return await syncOnePlaylist(pl)
    } catch (e) {
      return err(e)
    }
  })
  // 通过分享链接导入歌单(网易云/QQ音乐/酷狗)
  ipcMain.handle('playlist:importByLink', async (_e, link: string) => {
    try {
      const linked = await fetchPlaylistByLink(link)
      upsertSongs(linked.songs)
      const platformText =
        linked.platform === 'netease' ? '网易云' : linked.platform === 'qq' ? 'QQ音乐' : '酷狗'
      // 数量在歌单详情页会单独显示,描述里不再重复
      const pl = createPlaylist(linked.name, `${platformText}链接导入`)
      // 网易云歌单回填 id → 后续可「同步」
      if (linked.platform === 'netease') pl.neteasePlaylistId = Number(linked.playlistId)
      pl.songIds = linked.songs.map((s) => s.id)
      pl.syncedIds = [...pl.songIds]
      if (linked.songs[0]?.coverUrl) pl.coverUrl = linked.songs[0].coverUrl
      saveStore()
      return ok({ id: pl.id, name: pl.name, count: pl.songIds.length })
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('netease:userPlaylists', async () => {
    try {
      const acct = await netease.getNeteaseAccount()
      if (!acct) return ok([])
      return ok(await netease.getUserPlaylists(acct.userId))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('netease:importPlaylist', async (_e, id: number, name: string) => {
    const songs = await netease.getPlaylistDetail(id)
    if (songs.length === 0) return null
    upsertSongs(songs)
    const pl = createPlaylist(name, '网易云歌单导入')
    pl.neteasePlaylistId = id
    pl.songIds = songs.map((s) => s.id)
    pl.syncedIds = [...pl.songIds]
    if (songs[0].coverUrl) pl.coverUrl = songs[0].coverUrl
    saveStore()
    return pl
  })

  // ===== B站登录 =====
  /** 登录成功后的公共收尾:写入 cookie 并拉取资料(拉资料失败不影响登录本身) */
  async function finishBiliLogin(cookie: string): Promise<void> {
    setBiliCookie(cookie)
    setBiliCookieStore(cookie)
    try {
      const info = await bilibili.getUserInfo()
      if (info && info.isLogin) {
        const profile: UserProfile = {
          uid: info.uid,
          nickname: info.nickname,
          avatar: coverProxyUrl(info.avatar) ?? ''
        }
        setProfile('bili', profile)
      }
    } catch (e) {
      // cookie 已保存,资料下次启动/刷新时可再拉取
      console.warn('[Auth] fetch bili profile failed', e)
    }
  }
  ipcMain.handle('auth:biliQRStart', async () => {
    try {
      const qr = await bilibili.getLoginQRCode()
      if (!qr) return null
      const imageDataUrl = await QRCode.toDataURL(qr.url, { width: 220, margin: 1 })
      return { imageDataUrl, key: qr.key }
    } catch (e) {
      console.error('[Auth] bili QR start', e)
      return null
    }
  })
  ipcMain.handle('auth:biliQRPoll', async (_e, key: string) => {
    const state = await bilibili.pollLoginQR(key)
    if (state.status === 'ok' && state.cookie) {
      await finishBiliLogin(state.cookie)
    }
    return { status: state.status, message: state.message }
  })
  // 内嵌官方登录窗口(密码/短信/滑块全由B站页面自己处理),成功后自动回填 cookie
  let biliLoginWin: BrowserWindow | null = null
  ipcMain.handle('auth:biliWebLogin', async () => {
    if (biliLoginWin && !biliLoginWin.isDestroyed()) {
      biliLoginWin.focus()
      return { ok: false, message: '登录窗口已打开' }
    }
    return await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const win = new BrowserWindow({
        width: 540,
        height: 700,
        title: '哔哩哔哩登录',
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          // 独立持久分区:保留网页登录会话,下次免重登
          partition: 'persist:bili-login',
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      biliLoginWin = win
      let settled = false
      /** 检测到登录后立即置位:防止 finishBiliLogin 期间轮询重复触发 */
      let resolving = false
      let poll: ReturnType<typeof setInterval> | null = null
      const settle = (r: { ok: boolean; message: string }) => {
        if (settled) return
        settled = true
        if (poll) clearInterval(poll)
        if (!win.isDestroyed()) win.destroy()
        biliLoginWin = null
        resolve(r)
      }
      // 轮询检测登录完成(SESSDATA + DedeUserID 齐备)
      const check = async () => {
        if (settled || resolving || win.isDestroyed()) return
        try {
          const ses = win.webContents.session
          const cookies = await ses.cookies.get({ url: 'https://www.bilibili.com/' })
          const hasSess = cookies.some((c) => c.name === 'SESSDATA')
          const hasUid = cookies.some((c) => c.name === 'DedeUserID')
          if (hasSess && hasUid) {
            const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
            resolving = true
            if (poll) clearInterval(poll)
            try {
              await finishBiliLogin(cookieStr)
            } catch (e) {
              console.warn('[Auth] finish bili login failed', e)
            }
            settle({ ok: true, message: '登录成功' })
          }
        } catch {
          /* ignore */
        }
      }
      poll = setInterval(check, 700)
      win.webContents.on('did-navigate', () => check())
      win.webContents.on('did-navigate-in-page', () => check())
      win.on('closed', () => {
        if (!settled) {
          settled = true
          if (poll) clearInterval(poll)
          biliLoginWin = null
          resolve({ ok: false, message: '已取消登录' })
        }
      })
      win.loadURL('https://passport.bilibili.com/login')
    })
  })
  ipcMain.handle('auth:biliLogout', () => {
    setBiliCookie('')
    setBiliCookieStore('')
    setProfile('bili', null)
    return true
  })

  // ===== 网易云登录 =====
  ipcMain.handle('auth:neQRStart', async () => {
    try {
      const key = await netease.getNeteaseQRKey()
      if (!key) return null
      const imageDataUrl = await QRCode.toDataURL(
        `https://music.163.com/login?codekey=${key}`,
        { width: 220, margin: 1 }
      )
      return { imageDataUrl, key }
    } catch (e) {
      console.error('[Auth] ne QR start', e)
      return null
    }
  })
  ipcMain.handle('auth:neQRPoll', async (_e, key: string) => {
    const state = await netease.pollNeteaseQR(key)
    if (state.status === 'ok') {
      const acct = await netease.getNeteaseAccount().catch(() => null)
      setNeteaseCookieStore(getNeteaseCookies())
      if (acct) {
        setProfile('netease', {
          uid: acct.userId,
          nickname: acct.nickname,
          avatar: coverProxyUrl(acct.avatar) ?? ''
        })
      }
    }
    return state
  })
  ipcMain.handle('auth:neCaptcha', async (_e, phone: string) => {
    try {
      const json = await netease.sendCaptcha(phone)
      return { ok: json.code === 200, message: json.message ?? (json.code === 200 ? '已发送' : '发送失败') }
    } catch (e) {
      return err(e) as { ok: false; error: string } & { ok: boolean; message?: string }
    }
  })
  ipcMain.handle('auth:neLoginCaptcha', async (_e, phone: string, captcha: string) => {
    try {
      const json = await netease.loginByCaptcha(phone, captcha)
      if (json.code === 200) {
        setNeteaseCookieStore(getNeteaseCookies())
        const acct = await netease.getNeteaseAccount().catch(() => null)
        if (acct) {
          setProfile('netease', {
            uid: acct.userId,
            nickname: acct.nickname,
            avatar: coverProxyUrl(acct.avatar) ?? ''
          })
        }
        return { ok: true, message: '登录成功' }
      }
      return { ok: false, message: json.message ?? `错误码 ${json.code}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('auth:neLoginPassword', async (_e, phone: string, password: string) => {
    try {
      const json = await netease.loginByPassword(phone, password)
      if (json.code === 200) {
        setNeteaseCookieStore(getNeteaseCookies())
        const acct = await netease.getNeteaseAccount().catch(() => null)
        if (acct) {
          setProfile('netease', {
            uid: acct.userId,
            nickname: acct.nickname,
            avatar: coverProxyUrl(acct.avatar) ?? ''
          })
        }
        return { ok: true, message: '登录成功' }
      }
      return { ok: false, message: json.message ?? `错误码 ${json.code}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('auth:neLogout', () => {
    setNeteaseCookies({})
    setNeteaseCookieStore({})
    setProfile('netease', null)
    return true
  })

  // ===== 下载 =====
  ipcMain.handle('download:add', (_e, songs: Song[]) => {
    enqueueDownload(songs)
    return true
  })
  ipcMain.handle('download:cancel', (_e, id: string) => {
    cancelDownload(id)
    return true
  })
  ipcMain.handle('download:removeRecord', (_e, id: string) => {
    removeDownload(id)
    return true
  })
  ipcMain.handle('download:clear', (_e, failedOnly?: boolean) => {
    const store = getStore()
    store.downloads = failedOnly
      ? store.downloads.filter((d) => d.status !== 'error')
      : store.downloads.filter((d) => d.status === 'downloading' || d.status === 'pending')
    saveStore()
    return true
  })
  ipcMain.handle('download:openDir', async () => {
    const dir = getStore().settings.downloadDir
    if (!dir) return false
    // 目录可能尚未创建(首次使用/被手动删除):先建再打开,否则 openPath 静默失败
    try {
      mkdirSync(dir, { recursive: true })
    } catch (e) {
      console.warn('[Download] mkdir failed', dir, e)
    }
    const err = await shell.openPath(dir)
    if (err) console.warn('[Download] openPath failed', err)
    return true
  })
  ipcMain.handle('download:chooseDir', async () => {
    const options = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const win = dialogHost()
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.filePaths.length > 0) {
      setSetting('downloadDir', result.filePaths[0])
      return result.filePaths[0]
    }
    return null
  })
  ipcMain.handle('download:openFile', async (_e, recordId: string) => {
    const rec = getStore().downloads.find((d) => d.id === recordId)
    if (rec?.filePath) await shell.showItemInFolder(rec.filePath)
    return true
  })

  // ===== 应用 =====
  ipcMain.handle('app:openCacheDir', async () => {
    await shell.openPath(getCacheDir())
    return true
  })
  ipcMain.handle('app:clearCache', () => clearAudioCache())
  ipcMain.handle('app:version', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform
  }))

  // ===== 备份 / 恢复 / 恢复出厂 =====
  const execFileAsync = promisify(execFile)

  /** 收集已完成且文件存在的下载记录(对齐手机端:备份包含已下载歌曲) */
  function completedDownloadFiles(): string[] {
    const seen = new Set<string>()
    const files: string[] = []
    for (const d of getStore().downloads) {
      if (d.status !== 'completed' || !d.filePath) continue
      if (!existsSync(d.filePath) || seen.has(d.filePath)) continue
      seen.add(d.filePath)
      files.push(d.filePath)
    }
    return files
  }

  ipcMain.handle('app:backupCreate', async () => {
    let tmp: string | null = null
    try {
      const win = dialogHost()
      const date = new Date().toISOString().slice(0, 10)
      const opts = {
        title: '选择备份保存位置',
        defaultPath: `BiliMusic-备份-${date}.zip`,
        filters: [{ name: 'BiliMusic 备份', extensions: ['zip'] }]
      }
      const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (result.canceled || !result.filePath) return { ok: false, error: '已取消' }
      const dest = result.filePath.endsWith('.zip') ? result.filePath : `${result.filePath}.zip`

      saveStore() // 先把内存数据落盘,确保备份是最新状态
      const libPath = getLibraryFilePath()
      if (!libPath || !existsSync(libPath)) return { ok: false, error: '库文件不存在' }

      tmp = mkdtempSync(join(tmpdir(), 'bilimusic-backup-'))
      copyFileSync(libPath, join(tmp, 'library.json'))
      const audioFiles = completedDownloadFiles()
      writeFileSync(
        join(tmp, 'manifest.json'),
        JSON.stringify(
          {
            app: 'BiliMusic',
            platform: 'desktop',
            exportedAt: new Date().toISOString(),
            audioCount: audioFiles.length
          },
          null,
          2
        )
      )
      if (audioFiles.length > 0) {
        const dlDir = join(tmp, 'downloads')
        mkdirSync(dlDir)
        const used = new Set<string>()
        for (const f of audioFiles) {
          let name = basename(f)
          let i = 1
          while (used.has(name)) {
            const extIdx = name.lastIndexOf('.')
            name =
              extIdx > 0
                ? `${name.slice(0, extIdx)}_${i}${name.slice(extIdx)}`
                : `${name}_${i}`
            i++
          }
          used.add(name)
          copyFileSync(f, join(dlDir, name))
        }
      }
      // Windows 自带 bsdtar:-a 按扩展名(.zip)打包
      await execFileAsync('tar', ['-a', '-cf', dest, '-C', tmp, '.'])
      return ok({ path: dest, audioCount: audioFiles.length })
    } catch (e) {
      console.error('[Backup] create failed', e)
      return err(e)
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true })
    }
  })

  ipcMain.handle('app:restoreBackup', async () => {
    let tmp: string | null = null
    try {
      const win = dialogHost()
      const opts = {
        title: '选择备份文件',
        filters: [{ name: 'BiliMusic 备份', extensions: ['zip'] }],
        properties: ['openFile'] as 'openFile'[]
      }
      const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: '已取消' }
      const src = picked.filePaths[0]

      const libPath = getLibraryFilePath()
      if (!libPath) return { ok: false, error: '库文件路径未初始化' }

      tmp = mkdtempSync(join(tmpdir(), 'bilimusic-restore-'))
      await execFileAsync('tar', ['-a', '-xf', src, '-C', tmp])

      // 校验备份内容
      const backupLibPath = join(tmp, 'library.json')
      if (!existsSync(backupLibPath)) return { ok: false, error: '备份文件不完整(缺少 library.json)' }
      let backupLib: { songs?: unknown; playlists?: unknown; settings?: { downloadDir?: string } }
      try {
        backupLib = JSON.parse(readFileSync(backupLibPath, 'utf8'))
      } catch {
        return { ok: false, error: '备份文件损坏(library.json 无法解析)' }
      }
      if (typeof backupLib !== 'object' || backupLib === null || !backupLib.songs || !backupLib.playlists) {
        return { ok: false, error: '这不是有效的 BiliMusic 备份文件' }
      }

      // 回滚点:替换前先备份当前库文件
      const rollback = `${libPath}.restore-bak`
      if (existsSync(libPath)) copyFileSync(libPath, rollback)
      try {
        copyFileSync(backupLibPath, libPath)
        // 恢复的音频复制到当前下载目录(保留当前机器的目录设置)
        const currentDownloadDir = getStore().settings.downloadDir
        const dlDir = join(tmp, 'downloads')
        let restored = 0
        if (existsSync(dlDir)) {
          mkdirSync(currentDownloadDir, { recursive: true })
          for (const f of readdirSync(dlDir)) {
            copyFileSync(join(dlDir, f), join(currentDownloadDir, f))
            restored++
          }
        }
        // 修回下载目录为本机当前值,再落盘
        backupLib.settings = backupLib.settings ?? {}
        backupLib.settings.downloadDir = currentDownloadDir
        writeFileSync(libPath, JSON.stringify(backupLib))
        try {
          rmSync(rollback, { force: true })
        } catch {
          /* 回滚点清理失败无碍 */
        }
        // 内存数据已过期,重启应用后从新库文件加载
        app.relaunch()
        app.exit(0)
        return ok({ message: `恢复完成${restored > 0 ? `,已还原 ${restored} 首已下载歌曲` : ''}` })
      } catch (e) {
        // 失败回滚
        if (existsSync(rollback)) copyFileSync(rollback, libPath)
        throw e
      }
    } catch (e) {
      console.error('[Backup] restore failed', e)
      return err(e)
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true })
    }
  })

  ipcMain.handle('app:factoryReset', () => {
    resetStore()
    return true
  })
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
    return true
  })
  ipcMain.handle('app:pickLocalAudio', async () => {
    const options = {
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [{ name: '音频', extensions: ['mp3', 'flac', 'm4a', 'wav', 'ogg', 'm4s'] }]
    }
    const win = dialogHost()
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.filePaths
  })
  ipcMain.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on('window:maximizeToggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('app:copy', (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
    return true
  })
  ipcMain.handle('app:pickLyricFile', async () => {
    const options = {
      properties: ['openFile'] as 'openFile'[],
      filters: [{ name: '歌词文件', extensions: ['lrc', 'txt', 'yrc'] }]
    }
    const win = dialogHost()
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.filePaths.length === 0) return null
    const p = result.filePaths[0]
    const allowed = ['.lrc', '.txt', '.yrc']
    if (!allowed.includes(extname(p).toLowerCase())) return null
    return readFileSync(p, 'utf8')
  })
  ipcMain.handle('app:setWindowEffect', (e, effect: 'none' | 'mica' | 'acrylic') => {
    // 作用于发起请求的窗口(而非固定第一个,避免登录窗口打开时张冠李戴)
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
    if (!win) return false
    try {
      // Windows:backgroundMaterial;其它平台 vibrancy 兜底
      if (process.platform === 'win32') {
        const mat = effect === 'none' ? 'none' : effect === 'mica' ? 'mica' : 'acrylic'
        win.setBackgroundMaterial(mat)
      } else if (process.platform === 'darwin') {
        win.setVibrancy(
          effect === 'none' ? null : effect === 'mica' ? 'under-window' : 'fullscreen-ui'
        )
      }
      return true
    } catch (e) {
      console.warn('[Window] set effect failed', e)
      return false
    }
  })

  // ===== 悬浮歌词窗 =====
  ipcMain.handle('float:show', (_e, show: boolean) => showFloat(show))
  ipcMain.on('float:state', (e, state: FloatLyricState) => {
    // 只接受主窗口推送(悬浮窗自己不回灌,防止回环)
    if (BrowserWindow.fromWebContents(e.sender) === getFloatWindow()) return
    forwardFloatState(state)
  })
  ipcMain.on('float:control', (e, cmd: FloatControlCmd) => {
    // 只接受悬浮窗发起的指令
    if (BrowserWindow.fromWebContents(e.sender) !== getFloatWindow()) return
    forwardFloatControl(cmd)
  })
  ipcMain.handle('float:openMain', () => {
    openMainWindow()
  })
}
