/** 所有 ipcMain.handle 注册 */
import { ipcMain, dialog, shell, app, BrowserWindow, clipboard, nativeTheme, session } from 'electron'
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
  ArtistPlatform,
  KugouCredential,
  KugouPlatform,
  Library,
  Playlist,
  PreparedAudio,
  Song,
  Settings,
  UserProfile,
  HighlightPoint,
  ChartPlatform,
  ChartCatalog,
  ChartDetail
} from '@shared/types'
import * as bilibili from './api/bilibili'
import * as netease from './api/netease'
import * as qqmusic from './api/qqmusic'
import { getQqUserPlaylists } from './api/qqmusic'
import * as kugou from './api/kugou'
import { createKugouQr, pollKugouQr } from './api/kugouLogin'
import { getSongHot } from './api/songHot'
import { fetchPlaylistByLink } from './api/linkImport'
import { fetchQqPlaylist, fetchKugouPlaylist, fetchKugouCollectionPlaylist, fetchKugouUserPlaylists } from './api/qqkugou'
import { computeSyncPlan } from './syncDelta'
import { getLyrics } from './api/lyrics'
import * as qishui from './api/qishui'
import { prepareAudio, coverProxyUrl, clearAudioCache, getCacheDir, registerLocalPath } from './audio'
import { enqueueDownload, cancelDownload, removeDownload } from './downloads'
import { checkUpdateDetailed } from './update'
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
  setLyricOffset,
  addSearchHistory,
  removeSearchHistory,
  setBiliCookieStore,
  setNeteaseCookieStore,
  setQqAuthStore,
  setKugouTokenStore,
  setProfile,
  resetStore,
  getLibraryFilePath,
  defaultSettings
} from './store'
import { setBiliCookie, onBiliCookieChange } from './api/bilibili'
import { findArtistAcrossPlatforms, getUnifiedArtistDetail, getUnifiedArtistSongs } from './api/artist'
import { setNeteaseCookies, onNeteaseCookieChange, getNeteaseCookies } from './api/netease'
import { setQqAuth, getQqProfile } from './api/qqmusic'
import {
  showFloat,
  getFloatWindow,
  forwardFloatState,
  forwardFloatControl,
  openMainWindow,
  setFloatLocked,
  applyUserBounds,
  fitFloatWidth,
  resetFloatBounds,
  openFloatMenu,
  closeFloatMenu,
  forwardMenuSetting,
  getFloatMenuState,
  notifyFloatMenuState
} from './float'
import { recognizeAudio, getAuddToken, setAuddToken } from './api/recognize'
import { PRESETS, createShortcut, iconDataUrl, getPreset } from './disguise'
import type { FloatLyricState, FloatControlCmd, PlaybackResume } from '@shared/types'
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

/** 清空内嵌登录网页的持久会话(B站/QQ;登出/恢复出厂时调用,防止换人使用时被旧账号秒登录) */
function clearBiliLoginPartition(): void {
  for (const name of ['persist:bili-login', 'persist:qq-login']) {
    try {
      void session
        .fromPartition(name)
        .clearStorageData()
        .catch((e) => console.warn('[Auth] clear partition failed', name, e))
    } catch (e) {
      console.warn('[Auth] clear partition failed', name, e)
    }
  }
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
    qqProfile: d.qqProfile,
    kugouProfile: d.kugouProfile,
    kugouConceptProfile: d.kugouConceptProfile,
    qishuiProfile: d.qishuiProfile ?? null,
    listenStats: d.listenStats,
    // 收藏 id 列表必须随快照下发:渲染层的行内心形/播放条/全屏页都读它判断收藏态,
    // 之前漏了这一项,导致「已收藏」永远显示成未收藏
    favoriteIds: d.favoriteIds ?? [],
    // 每首歌的歌词偏移记忆(新字段漏下发会导致「本歌记忆」重启后失效)
    lyricOffsets: d.lyricOffsets ?? {},
    lyricOffsetSignMigrated: d.lyricOffsetSignMigrated,
    resumePlayback: d.resumePlayback ?? null
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

/** 解析粘贴的 B站 Cookie:支持裸值(SESSDATA=xxx; bili_jct=xxx)、多行、JSON 片段 */function parseBiliCookieString(raw: string): string | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  let src = text
  // 兼容从浏览器复制 JSON(cookie 数组或 {name,value} 对象)
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const j = JSON.parse(text)
      const arr = Array.isArray(j) ? j : [j]
      src = arr
        .map((c: any) => (c?.name && c?.value != null ? `${c.name}=${c.value}` : ''))
        .filter(Boolean)
        .join('; ')
    } catch {
      /* 按普通字符串继续 */
    }
  }
  // 去掉 "Cookie:" 前缀、换行、多余逗号
  src = src.replace(/^\s*cookie\s*:\s*/i, '').replace(/[\r\n]+/g, '; ').replace(/(;\s*)+/g, '; ')
  const pairs: string[] = []
  for (const seg of src.split(';')) {
    const s = seg.trim()
    if (!s) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const name = s.slice(0, eq).trim()
    const value = s.slice(eq + 1).trim()
    if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) continue
    // 过滤掉粘贴 URL 时带出来的查询参数名
    if (['https', 'http', 'www'].includes(name.toLowerCase())) continue
    pairs.push(`${name}=${value}`)
  }
  // 必需字段:SESSDATA(登录态核心);bili_jct 用于写操作,能带就带
  const has = (n: string) => pairs.some((p) => p.startsWith(n + '='))
  if (!has('SESSDATA')) return null
  if (!has('DedeUserID')) {
    // 部分用户只粘了 SESSDATA:补空 DedeUserID 让后续接口自行判断(资料拉取会给出准确结果)
    pairs.push('DedeUserID=')
  }
  return pairs.join('; ')
}

// ===== 跨平台同名曲匹配(评论/歌词兜底) =====

/** 标题归一化:去掉括号后缀、标点与空白,便于比较同名曲 */
function normalizeTitle(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '')
    .replace(/[\s\-_·,，.。!！?？'"“”‘’:;:、|/\\]/g, '')
}

/** 取第一顺位歌手名(多歌手用 / 、& 分隔) */
function firstArtist(s: string): string {
  return String(s ?? '')
    .split(/[/、&,，]|\sfeat\.?/i)[0]
    .trim()
    .toLowerCase()
}

/** 翻唱/伴奏/片段等非原版标记:同名但带这些词的候选应降权 */
const COVER_HINTS = [
  'cover', '翻唱', '原唱', '伴奏', 'remix', 'dj', '片段', '女声', '男声', '吉他',
  '钢琴', '纯音乐', '抖音', '加速', '慢速', '童声', '合唱', '清唱', 'demo', 'live版'
]

/** 候选匹配打分:标题相似 + 歌手一致 + 时长接近 - 非原版降权 */
function scoreCandidate(src: Song, cand: Song): number {
  const t1 = normalizeTitle(src.title)
  const t2 = normalizeTitle(cand.title)
  if (!t1 || !t2) return -1
  let score = 0
  if (t1 === t2) score += 60
  else if (t2.includes(t1) || t1.includes(t2)) score += 35
  const a1 = firstArtist(src.artist)
  const a2 = firstArtist(cand.artist)
  if (a1 && a2 && (a2.includes(a1) || a1.includes(a2))) score += 25
  if (src.duration > 0 && cand.duration > 0) {
    const d = Math.abs(cand.duration - src.duration)
    if (d <= 3) score += 20
    else if (d <= 10) score += 12
    else if (d <= 30) score += 4
    else if (d > 90) score -= 12
  }
  const raw = cand.title.toLowerCase()
  const extra = t2.replace(t1, '')
  if (COVER_HINTS.some((h) => extra.includes(h.toLowerCase()) || raw.includes(h))) score -= 28
  return score
}

/** 从候选里挑最像原曲的一首(阈值内),失败返回 null */
function pickBestMatch(src: Song, pool: Song[]): Song | null {
  const usable = pool.filter((s) => s && s.title)
  if (usable.length === 0) return null
  let best = usable[0]
  let bestScore = scoreCandidate(src, best)
  for (const cand of usable.slice(1)) {
    const sc = scoreCandidate(src, cand)
    if (sc > bestScore) {
      best = cand
      bestScore = sc
    }
  }
  return bestScore >= 25 ? best : null
}

/**
 * 用「标题 歌手」在网易云找原曲(QQ/酷狗仅元数据歌曲的评论与歌词兜底)。
 * 先用去掉括号后缀的干净标题搜索,再退回完整标题;最后按打分挑最像的。
 */
async function findNeteaseMatch(song: Song): Promise<Song | null> {
  const clean = song.title.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ').replace(/\s+/g, ' ').trim()
  const queries = [`${clean} ${song.artist}`.trim(), `${song.title} ${song.artist}`.trim(), clean || song.title]
  const seen = new Set<string>()
  const pool: Song[] = []
  for (const q of queries) {
    if (!q || seen.has(q)) continue
    seen.add(q)
    try {
      const res = await netease.searchSongs(q, 20, 0)
      for (const s of res.songs ?? []) {
        if ((s.neteaseId ?? 0) > 0) pool.push(s)
      }
    } catch {
      /* 换下一个查询 */
    }
    // 首个查询就能挑出高置信候选时直接返回,省一次搜索
    const hit = pickBestMatch(song, pool)
    if (hit && scoreCandidate(song, hit) >= 45) return hit
  }
  return pickBestMatch(song, pool)
}

/** 用「标题 歌手」在 QQ音乐找原曲(酷狗等歌曲的 QQ 评论兜底) */
async function findQqMatch(song: Song): Promise<Song | null> {
  const clean = song.title.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ').replace(/\s+/g, ' ').trim()
  const queries = [`${clean} ${song.artist}`.trim(), `${song.title} ${song.artist}`.trim()]
  const seen = new Set<string>()
  const pool: Song[] = []
  for (const q of queries) {
    if (!q || seen.has(q)) continue
    seen.add(q)
    try {
      const hits = await qqmusic.searchQqSongs(q, 1, 20)
      pool.push(...hits)
    } catch {
      /* 换下一个查询 */
    }
    const hit = pickBestMatch(song, pool)
    if (hit && scoreCandidate(song, hit) >= 45) return hit
  }
  return pickBestMatch(song, pool)
}

/** 设置分区 → 该分区包含的设置键(供"按分区恢复默认"使用;名称与设置页侧栏一致) */
const SECTION_SETTING_KEYS: Record<string, (keyof Settings)[]> = {
  外观: [
    'theme',
    'accent',
    'windowEffect',
    'glassAlpha',
    'pageAnimation',
    'motionLevel',
    'motionSpeed',
    'motionFine',
    'playerBarStyle',
    'uiScale',
    'density',
    'customCss',
    'uiModules',
    'toastPosition',
    'toastDuration',
    'toastStyle',
    'toastShowIcon'
  ],
  播放: [
    'eqEnabled',
    'eqGains',
    'playbackRate',
    'pitchSemitones',
    'volume',
    'preservePitch',
    'sleepTimerMinutes',
    'sleepFadeOut'
  ],
  歌词: [
    'lyricStyle',
    'pvArrange',
    'pvAnim',
    'pvLayout',
    'pvAccent',
    'pvScale',
    'pvDecor',
    'pvMotion',
    'pvBlockScenes',
    'pvFrame',
    'pvInvertText',
    'pvTransition',
    'pvTexture',
    'pvCameraMotion',
    'pvCharMotion',
    'pvCharTiming',
    'pvPan',
    'pvZoom',
    'pvColorMode',
    'pvPost',
    'pvGrain',
    'pvContrast',
    'pvRgbShift',
    'pvVignette',
    'pvLens',
    'pvWholeLine',
    'pvTailEmphasis',
    'pvOffsetX',
    'pvOffsetY',
    'lyricOffsetMs',
    'lyricAlign',
    'lyricBlurEnabled',
    'lyricBlurAmount',
    'lyricBlurCurrent',
    'lyricBlurNear',
    'lyricBlurMid',
    'lyricBlurFar',
    'lyricTransMode',
    'lyricTransScale',
    'lyricTransAlpha',
    'lyricTransLayout',
    'lyricSize'
  ],
  搜索: [
    'defaultSearchSource',
    'neteaseFallback',
    'filterLongVideo',
    'longVideoMinutes',
    'filterLoopTitles',
    'filterKeywords',
    'searchOrder'
  ],
  听歌识别: ['songRecognizeEnabled', 'songRecognizeToken'],
  下载: ['downloadDir']
}

export function registerIpc(): void {
  // 自定义底图:启动时把设置里已存的图片路径登记进 bmedia://local 白名单
  const savedBg = getStore().settings.customBgImage
  if (savedBg) registerLocalPath(savedBg)
  const savedUiBg = getStore().settings.uiBgImage
  if (savedUiBg) registerLocalPath(savedUiBg)
  ipcMain.handle('settings:pickImage', async () => {
    const options = {
      properties: ['openFile'] as ('openFile')[],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    }
    const win = dialogHost()
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (!file) return null
    registerLocalPath(file)
    return file
  })
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
  ipcMain.handle('api:neteaseFindArtist', async (_e, name: string) => {
    try {
      return ok(await netease.findArtistIdByName(name))
    } catch (e) {
      return err(e)
    }
  })
  // 按歌手名跨平台找人(用于歌曲详情里的歌手名点击)
  ipcMain.handle('api:findArtist', async (_e, name: unknown) => {
    try {
      if (typeof name !== 'string') return { ok: false, error: '参数错误' }
      const hit = await findArtistAcrossPlatforms(name)
      return hit ? { ok: true, data: hit } : { ok: false, error: '未找到该歌手' }
    } catch (e) {
      return err(e)
    }
  })
  // 跨平台歌手主页(统一模型 + 数据来源平台标识)
  ipcMain.handle('api:artistDetail', async (_e, platform: unknown, id: unknown) => {
    try {
      if (typeof platform !== 'string' || typeof id !== 'string') return { ok: false, error: '参数错误' }
      const d = await getUnifiedArtistDetail(platform as ArtistPlatform, id)
      return d ? { ok: true, data: d } : { ok: false, error: '未找到歌手信息' }
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:artistSongs', async (_e, platform: unknown, id: unknown) => {
    try {
      if (typeof platform !== 'string' || typeof id !== 'string') return { ok: false, error: '参数错误' }
      return ok(await getUnifiedArtistSongs(platform as ArtistPlatform, id))
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
  ipcMain.handle('api:neteasePlaylistMeta', async (_e, id: number) => {
    try {
      return ok(await netease.getPlaylistMeta(id))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:neteaseArtistDetail', async (_e, id: number) => {
    try {
      return ok(await netease.getArtistDetail(id))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:qqSearch', async (_e, keyword: string, page: number) => {
    try {
      return ok(await qqmusic.searchQqSongs(keyword, page, 30))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:qqSearchPlaylists', async (_e, keyword: string, page: number) => {
    try {
      return ok(await qqmusic.searchQqPlaylists(keyword, page, 20))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:qqSearchArtists', async (_e, keyword: string, page: number) => {
    try {
      return ok(await qqmusic.searchQqArtists(keyword, page, 20))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:qqArtistSongs', async (_e, artistId: string) => {
    try {
      return ok(await qqmusic.getQqArtistSongs(artistId, 1, 50))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:kugouSearch', async (_e, keyword: string, page: number) => {
    try {
      return ok(await kugou.searchKugouSongs(keyword, page, 30))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:kugouSearchPlaylists', async (_e, keyword: string, page: number) => {
    try {
      return ok(await kugou.searchKugouPlaylists(keyword, page, 20))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:kugouSearchArtists', async (_e, keyword: string, page: number) => {
    try {
      return ok(await kugou.searchKugouArtists(keyword, page, 20))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('api:kugouArtistSongs', async (_e, artistId: string) => {
    try {
      return ok(await kugou.getKugouArtistSongs(artistId, 1, 50))
    } catch (e) {
      return err(e)
    }
  })
  // 平台歌单详情(搜索结果预览:曲目 + 名称/封面/播放量/收藏数)
  ipcMain.handle(
    'api:sourcePlaylistSongs',
    async (_e, platform: 'qq' | 'kugou', id: string) => {
      try {
        const pl = platform === 'qq' ? await fetchQqPlaylist(id) : await fetchKugouPlaylist(id)
        return ok({
          name: pl.name,
          coverUrl: pl.coverUrl || undefined,
          description: pl.description,
          creator: pl.creator,
          playCount: pl.playCount,
          favCount: pl.favCount,
          songs: pl.songs
        })
      } catch (e) {
        return err(e)
      }
    }
  )
  // 平台歌单 → 本地歌单(QQ/酷狗搜索结果「导入为歌单」)
  /**
   * 来源歌单查重:按(来源 platform + 来源 id)找已导入的本地歌单。
   * 匹配顺序:通用 sourcePlatform/sourceId 标记 → 旧版专用 id 字段
   * (neteasePlaylistId/qqPlaylistId/kugouPlaylistId/favoriteFolderId)
   * → 回退「sourcePlatform 相同 + 名称完全相同」(旧存档没有通用标记时的兜底)。
   */
  function findImportedPlaylist(platform: string, sourceId: string, name?: string): Playlist | undefined {
    const pls = getStore().playlists
    const sid = String(sourceId)
    const isKugou =
      platform === 'kugou' || platform === 'kugou-concept' || platform === 'normal' || platform === 'concept'
    const byGeneric = (p: Playlist): boolean =>
      p.sourcePlatform === platform && p.sourceId != null && String(p.sourceId) === sid
    const byLegacy = (p: Playlist): boolean =>
      platform === 'netease'
        ? p.neteasePlaylistId != null && String(p.neteasePlaylistId) === sid
        : platform === 'qq'
          ? p.qqPlaylistId != null && String(p.qqPlaylistId) === sid
          : isKugou
            ? p.kugouPlaylistId != null && p.kugouPlaylistId === sid
            : platform === 'bili'
              ? p.favoriteFolderId != null && String(p.favoriteFolderId) === sid
              : false
    return (
      pls.find(byGeneric) ??
      pls.find(byLegacy) ??
      (name ? pls.find((p) => p.sourcePlatform === platform && p.name === name) : undefined)
    )
  }
  ipcMain.handle(
    'library:importSourcePlaylist',
    async (_e, platform: 'qq' | 'kugou', id: string, name?: string) => {
      try {
        // 查重兜底:同一来源歌单只导入一次,已导入过直接返回已有歌单,不再新建
        const existing = findImportedPlaylist(platform, id, name?.trim() || undefined)
        if (existing) {
          return ok({ id: existing.id, name: existing.name, count: existing.songIds.length })
        }
        const pl = platform === 'qq' ? await fetchQqPlaylist(id) : await fetchKugouPlaylist(id)
        if (pl.songs.length === 0) return { ok: false as const, error: '歌单内容为空或不可访问' }
        upsertSongs(pl.songs)
        const platformText = platform === 'qq' ? 'QQ音乐' : '酷狗'
        const created = createPlaylist(name?.trim() || pl.name, `${platformText}导入`)
        if (pl.coverUrl) created.coverUrl = pl.coverUrl
        created.songIds = pl.songs.map((s) => s.id)
        created.syncedIds = [...created.songIds]
        created.sourcePlatform = platform
        created.sourceId = id
        saveStore()
        return ok({ id: created.id, name: created.name, count: created.songIds.length })
      } catch (e) {
        return err(e)
      }
    }
  )
  // 进度条高潮点:酷狗原生 climax_info(其余平台由渲染层按歌词副歌推导)
  ipcMain.handle('api:songClimax', async (_e, song: Song): Promise<HighlightPoint[] | null> => {
    const hash =
      song.kugouHash || (String(song.id).startsWith('kg-') ? String(song.id).slice(3) : '')
    if (!hash) return null
    try {
      return await kugou.getKugouClimax(hash)
    } catch {
      return null
    }
  })
  ipcMain.handle('api:songHot', async (_e, song: Song) => {
    try {
      return ok(await getSongHot(song))
    } catch (e) {
      return err(e)
    }
  })
  // ===== 排行榜 =====
  // 目录缓存:榜单曲目接口(酷狗)不返回榜名,用目录里的名称回填;同时避免切榜单反复拉目录
  const chartCatalogCache = new Map<ChartPlatform, { at: number; data: ChartCatalog }>()
  const CHART_CATALOG_TTL = 30 * 60 * 1000

  const chartApi = {
    netease: () => netease,
    qq: () => qqmusic,
    kugou: () => kugou,
    bilibili: () => bilibili
  }

  async function currentCatalog(platform: ChartPlatform): Promise<ChartCatalog> {
    const hit = chartCatalogCache.get(platform)
    if (hit && Date.now() - hit.at < CHART_CATALOG_TTL && !hit.data.error) return hit.data
    const data = await chartApi[platform]().getChartCatalog()
    // 只有成功结果才进缓存,失败下次重试
    if (!data.error) chartCatalogCache.set(platform, { at: Date.now(), data })
    return data
  }

  ipcMain.handle('api:chartCatalog', async (_e, platform: ChartPlatform) => {
    try {
      if (!chartApi[platform]) return err(new Error(`未知平台 ${platform}`))
      return ok(await currentCatalog(platform))
    } catch (e) {
      return err(e)
    }
  })

  ipcMain.handle('api:chartSongs', async (_e, platform: ChartPlatform, chartId: string) => {
    try {
      if (!chartApi[platform]) return err(new Error(`未知平台 ${platform}`))
      const detail: ChartDetail = await chartApi[platform]().getChartSongs(String(chartId))
      // 榜名/封面/简介:曲目接口缺这些字段时,用目录里的信息补齐(酷狗 B站 都没有)
      if (!detail.name || !detail.coverUrl || !detail.intro) {
        const cat = await currentCatalog(platform).catch(() => null)
        const brief = cat?.groups.flatMap((g) => g.charts).find((c) => c.id === String(chartId))
        if (brief) {
          if (!detail.name) detail.name = brief.name
          if (!detail.coverUrl) detail.coverUrl = brief.coverUrl
          if (!detail.intro) detail.intro = brief.intro
          if (!detail.updateTip) detail.updateTip = brief.updateTip
        }
      }
      return ok(detail)
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
      platform?: 'bilibili' | 'netease' | 'qq',
      aggregate?: boolean
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
          if (song.bvid) return ok(await bilibili.getVideoComments(bvidOf(song), offset, order))
          // 非 B站 歌曲:按「歌名 歌手」搜一个视频,取其评论区(B站评论区是视频级的)
          try {
            const hits = await bilibili.searchVideos(`${song.title} ${song.artist}`, 1, 'totalrank')
            const hit = hits[0]
            if (!hit?.bvid) return { ok: false as const, error: 'B站未找到同名视频' }
            return ok(await bilibili.getVideoComments(hit.bvid, offset, order))
          } catch {
            return { ok: false as const, error: 'B站评论获取失败' }
          }
        }
        const fetchNetease = async () => {
          let id = song.neteaseId
          if (!id) {
            // QQ音乐/酷狗等仅元数据歌曲:按"标题+歌手"搜网易云,打分挑原曲(避开翻唱/伴奏)
            const hit = await findNeteaseMatch(song)
            if (!hit?.neteaseId) return { ok: false as const, error: '网易云未找到对应歌曲' }
            id = hit.neteaseId
          }
          const r = await netease.getMusicComments(id, offset, 20, order)
          return ok(nePayload(r))
        }
        // QQ 音乐原生评论(搜索/导入的 QQ 歌曲都带 qqId;其它平台按同名曲搜 QQ 兜底)
        const fetchQq = async () => {
          let qid = song.qqId
          let mid = song.qqMid
          if (!qid || !mid) {
            // 只有 mid(旧数据)或无平台 id(酷狗等):搜同款解析数字 id
            try {
              if (mid) {
                const hits = await qqmusic.searchQqSongs(`${song.title} ${song.artist}`, 1, 5)
                const hit = hits.find((h) => h.qqMid === mid) ?? hits[0]
                qid = hit?.qqId
              } else {
                const hit = await findQqMatch(song)
                qid = hit?.qqId
                mid = hit?.qqMid
              }
            } catch {
              /* ignore */
            }
          }
          if (!qid) return fetchNetease()
          const r = await qqmusic.getQqComments(qid, offset, 20, order)
          return ok(r)
        }
        // 聚合模式:并发拉取所有可用平台的评论区,合并混排(带平台标记)
        if (aggregate) {
          const jobs: Array<{ p: 'bilibili' | 'netease' | 'qq'; run: () => Promise<any> }> = []
          if (song.bvid) jobs.push({ p: 'bilibili', run: fetchBili })
          jobs.push({ p: 'netease', run: fetchNetease })
          jobs.push({ p: 'qq', run: fetchQq })
          const results = await Promise.all(
            jobs.map(async ({ p, run }) => {
              try {
                const r = await run()
                return r.ok && r.data ? { p, ...r.data } : null
              } catch {
                return null
              }
            })
          )
          const valid = results.filter((r): r is NonNullable<typeof r> => !!r && r.comments.length > 0)
          if (valid.length === 0) return { ok: false, error: '各平台均未找到评论区' }
          // 合并去重(同平台同人同内容视为一条),按 热度/时间 混排
          const seen = new Set<string>()
          const merged = valid
            .flatMap((r) => r.comments.map((c: any) => ({ ...c, platform: r.p })))
            // QQ 侧存在已删除/纯表情的原评:内容为空的不进聚合结果
            .filter((c: any) => String(c.content ?? '').trim().length > 0)
            .filter((c) => {
              const key = c.platform + ':' + c.user + ':' + c.content.slice(0, 60)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
          merged.sort((a, b) => (order === 'hot' ? b.likes - a.likes : b.time - a.time))
          const perPage = 30
          const pageComments = merged.slice(offset, offset + perPage)
          return ok({
            total: merged.length,
            hasMore: offset + perPage < merged.length,
            comments: pageComments
          })
        }
        // 兜底场景显式指定平台(网易云垫底B站 / QQ酷狗B站取流时,平台间可切)
        if (platform === 'bilibili') return fetchBili()
        if (platform === 'netease') return fetchNetease()
        if (platform === 'qq') return fetchQq()
        // 默认:原曲平台优先
        if (song.source === 'QQMUSIC' || song.qqMid) return fetchQq()
        // 酷狗无公开匿名评论接口:按"标题+歌手"搜网易云评论,失败再试 QQ 音乐
        if (song.source === 'KUGOU') {
          const ne = await fetchNetease()
          if (ne.ok) return ne
          const qq = await fetchQq()
          if (qq.ok) return qq
          return ne
        }
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
        // 更详细的歌曲信息:专辑/曲风/发行时间/人气(weapi v3 明细)
        const raw = await netease.getSongDetailRaw(song.neteaseId).catch(() => null)
        if (raw) {
          rows['专辑'] = raw.albumName ?? rows['专辑']
          rows['歌曲ID'] = String(song.neteaseId)
          if (raw.publishTime) {
            const d = new Date(raw.publishTime)
            rows['发行时间'] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          }
          if (raw.pop != null) rows['人气'] = `${raw.pop} / 100`
          if (raw.fee === 1) rows['付费'] = 'VIP 专享'
          else if (raw.fee === 4) rows['付费'] = '购买专辑'
          else if (raw.fee === 8) rows['付费'] = '低音质免费'
          if (raw.artistId) {
            const fans = await netease
              .getArtistDetail(raw.artistId)
              .then((d) => d.fansCount)
              .catch(() => undefined)
            if (fans != null) rows['歌手粉丝数'] = String(fans)
          }
        }
      } else if (song.source === 'QQMUSIC') {
        rows['来源'] = 'QQ音乐'
        rows['链接'] = song.qqMid ? `https://y.qq.com/n/ryqq/songDetail/${song.qqMid}` : ''
        rows['状态'] = getStore().downloadedIds.includes(song.id) ? '已下载' : '在线播放'
        if (song.qqId) rows['歌曲ID'] = String(song.qqId)
        if (song.favCount != null) rows['收藏数'] = String(song.favCount)
      } else if (song.source === 'KUGOU') {
        rows['来源'] = '酷狗音乐'
        rows['状态'] = getStore().downloadedIds.includes(song.id) ? '已下载' : '在线播放'
        if (song.kugouHash) rows['文件Hash'] = song.kugouHash
        if (song.kugouAlbumId) rows['专辑ID'] = song.kugouAlbumId
        // 收藏数:搜索结果里已带(OwnerCount);历史入库的歌再按同名曲补查一次
        let fav = song.favCount
        if (fav == null && song.kugouHash) {
          fav =
            (await kugou
              .searchKugouSongs(`${song.title} ${song.artist}`.trim(), 1, 20)
              .then((list) =>
                list.find((s) => s.kugouHash?.toUpperCase() === song.kugouHash?.toUpperCase())
              )
              .then((hit) => hit?.favCount)
              .catch(() => undefined)) ?? undefined
        }
        if (fav != null) rows['收藏数'] = String(fav)
      } else if (song.source === 'BILIBILI' && song.bvid) {
        const p = song.page > 1 ? `?p=${song.page}` : ''
        rows['链接'] = `https://www.bilibili.com/video/${bvidOf(song)}${p}`
        const detail = await bilibili.getVideoDetail(bvidOf(song)).catch(() => null)
        if (detail) {
          rows['UP主'] = detail.owner
          rows['播放量'] = String(detail.stat?.view ?? '-')
          rows['点赞'] = String(detail.stat?.like ?? '-')
          rows['收藏'] = String(detail.stat?.favorite ?? '-')
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
    async (e, song: Song, html5Fallback?: boolean): Promise<PreparedAudio> => {
      // 加载进度实时推给请求方窗口(全屏播放页进度条)
      const sender = e.sender
      return prepareAudio(song, html5Fallback, getStore().settings.neteaseQuality, (p) => {
        try {
          if (!sender.isDestroyed()) sender.send('audio:progress', p)
        } catch {
          /* 窗口销毁竞态忽略 */
        }
      })
    }
  )
  ipcMain.handle('lyrics:get', (_e, song: Song) => getLyrics(song))
  // 每首歌的歌词偏移记忆:null=清除记忆(回退全局偏移)
  ipcMain.handle('lyrics:setSongOffset', (_e, songId: unknown, ms: unknown) => {
    if (typeof songId !== 'string') return false
    if (ms !== null && typeof ms !== 'number') return false
    return setLyricOffset(songId, ms as number | null)
  })
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
  ipcMain.handle(
    'library:updatePlaylist',
    (_e, p: { id: string; name: string; description?: string; hidden?: boolean }) => {
      const pl = getStore().playlists.find((x) => x.id === p.id)
      if (pl) {
        pl.name = p.name
        pl.description = p.description ?? pl.description
        if (p.hidden != null) pl.hidden = p.hidden
        pl.updatedAt = Date.now()
        saveStore()
      }
      return pl
    }
  )
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
  // 上次播放会话(重启恢复):切歌/节流后发一次,只落库不回传
  ipcMain.on('playback:saveResume', (_e, r: PlaybackResume | null) => {
    const d = getStore()
    if (!r || !Array.isArray(r.queue) || !(r.queueIndex >= 0 && r.queueIndex < r.queue.length)) {
      d.resumePlayback = null
    } else {
      d.resumePlayback = {
        queue: r.queue,
        queueIndex: Math.floor(r.queueIndex),
        pos: isFinite(r.pos) && r.pos > 0 ? Math.min(r.pos, 86_400) : 0
      }
    }
    saveStore()
  })
  // 收藏:加入时插入队首(最新收藏在前),同时把歌曲元数据存进库以便收藏页展示
  ipcMain.handle('library:toggleFavorite', (_e, song: Song) => {
    const st = getStore()
    const ids = st.favoriteIds ?? []
    const has = ids.includes(song.id)
    if (has) {
      st.favoriteIds = ids.filter((id) => id !== song.id)
    } else {
      upsertSong(song)
      st.favoriteIds = [song.id, ...ids]
    }
    saveStore()
    return { favorited: !has, favoriteIds: st.favoriteIds }
  })
  ipcMain.handle('library:getFavorites', () => {
    const st = getStore()
    const ids = st.favoriteIds ?? []
    return ids.map((id) => st.songs[id]).filter((s): s is Song => !!s)
  })
  /**
   * 去掉收藏里的重复曲目。
   * 旧版「更换音源」会把 id 换成新平台的 id,同一首歌因此重复收藏成两条(如 B站版 + 网易云版)。
   * 按 标题+歌手 归并,保留收藏顺序靠前的那条。
   */
  ipcMain.handle('library:dedupeFavorites', () => {
    const st = getStore()
    const ids = st.favoriteIds ?? []
    const seen = new Set<string>()
    const kept: string[] = []
    for (const id of ids) {
      const s = st.songs[id]
      // 元数据缺失的条目原样保留,避免误删用户数据
      if (!s) {
        kept.push(id)
        continue
      }
      const key = `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(id)
    }
    const removed = ids.length - kept.length
    if (removed > 0) {
      st.favoriteIds = kept
      saveStore()
    }
    return { removed, total: kept.length }
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
    (_e: unknown, key: unknown, value: unknown) => {
      // 白名单 + 类型校验:渲染层(含悬浮菜单转发链路)不能注入任意设置键
      const defaults = defaultSettings as unknown as Record<string, unknown>
      if (
        typeof key !== 'string' ||
        !(key in defaults) ||
        value === null ||
        typeof value !== typeof defaults[key]
      ) {
        return getStore().settings
      }
      const k = key as keyof Settings
      setSetting(k, value as Settings[typeof k])
      // 自定义底图换图:新路径登记进 bmedia://local 白名单
      if (k === 'customBgImage' && typeof value === 'string' && value) registerLocalPath(value)
      if (k === 'uiBgImage' && typeof value === 'string' && value) registerLocalPath(value)
      // 主题即时应用(此前仅在启动时应用,切换后标题栏按钮颜色要等重启才更新)
      if (key === 'theme' && typeof value === 'string') applyThemeNow(value)
      // 悬浮窗锁定即时生效(鼠标穿透/恢复)
      if (key === 'floatLyricLocked') setFloatLocked(!!value)
      // 悬浮窗相关设置:把最新值推回已打开的设置菜单,避免菜单显示旧值
      if (
        key === 'floatFontScale' ||
        key === 'floatShowTrans' ||
        key === 'floatShowNextLine' ||
        key === 'floatLyricLocked'
      ) {
        notifyFloatMenuState()
      }
      return getStore().settings
    }
  )

  // 恢复默认设置:只重置 Settings 对象;登录态、曲库、已下载歌曲均不受影响。
  // 传入分区名数组时,只重置这些分区包含的设置键;不传 = 全部恢复默认。
  ipcMain.handle('library:resetSettings', (_e: unknown, sections?: unknown) => {
    const st = getStore()
    const sel = Array.isArray(sections)
      ? (sections as unknown[]).filter((s): s is string => typeof s === 'string')
      : null
    if (!sel || sel.length === 0) {
      // 保留"已完成引导"标记,避免重置后重新弹首启引导
      st.settings = { ...defaultSettings, onboarded: true }
    } else {
      const defs = defaultSettings as unknown as Record<string, unknown>
      const next = { ...st.settings } as unknown as Record<string, unknown>
      for (const name of sel) {
        for (const k of SECTION_SETTING_KEYS[name] ?? []) {
          const v = defs[k]
          // 数组/对象字段拷贝一份,避免与出厂默认共享引用
          next[k] = Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...(v as object) } : v
        }
      }
      st.settings = { ...(next as unknown as Settings), onboarded: true }
    }
    saveStore()
    applyThemeNow(st.settings.theme)
    setFloatLocked(!!st.settings.floatLyricLocked)
    notifyFloatMenuState()
    return st.settings
  })

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
  // 播放记录上报(歌曲实际播放 ≥30s 后由播放器调用):网易云打卡 / B站观看历史
  ipcMain.handle('netease:scrobble', (_e, songId: number, seconds: number) => netease.scrobble(songId, seconds))
  ipcMain.handle('bili:reportWatch', (_e, bvid: string, cid: number, seconds: number) =>
    bilibili.reportWatch(bvid, cid, seconds)
  )
  // 网易云云端播放记录(听歌排行,最近一周优先,空则累计)
  ipcMain.handle('qq:reportRecently', (_e, songId: number) => qqmusic.reportRecently(songId))
  ipcMain.handle('qq:recentPlay', async () => {
    try {
      return { ok: true, data: await qqmusic.getRecentPlay(50) }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('netease:playRecord', async () => {
    try {
      const r = await netease.getPlayRecord()
      return { ok: true, data: r }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
  ipcMain.handle('bili:importFav', async (_e, folderId: number, folderName: string) => {
    // 查重兜底:同一收藏夹只导入一次,已导入过直接返回已有歌单
    const existing = findImportedPlaylist('bili', String(folderId), folderName)
    if (existing) return existing
    const { songs } = await bilibili.getFavoriteResources(folderId)
    if (songs.length === 0) return null
    upsertSongs(songs)
    const pl = createPlaylist(folderName, `B站收藏夹导入 · ${songs.length}首`)
    pl.favoriteFolderId = folderId
    pl.favoriteFolderName = folderName
    pl.sourcePlatform = 'bili'
    pl.sourceId = String(folderId)
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
    } else if (pl.qqPlaylistId) {
      const linked = await fetchQqPlaylist(String(pl.qqPlaylistId))
      remote = linked.songs
      complete = true
    } else if (pl.qishuiPlaylistId) {
      // 汽水歌单:分页拉全量(每页 50)
      remote = []
      for (let offset = 0; offset < 2000; offset += 50) {
        const page = await qishui.getPlaylistTracks(String(pl.qishuiPlaylistId), 50, offset)
        remote.push(...page.songs)
        if (!page.hasMore || page.songs.length === 0) break
      }
      complete = true
    } else if (pl.kugouPlaylistId) {
      // 概念版 collection_ 走 v5 分享接口,普通 specialid 走 v3
      const linked = /^collection_/.test(pl.kugouPlaylistId)
        ? await fetchKugouCollectionPlaylist(pl.kugouPlaylistId)
        : await fetchKugouPlaylist(pl.kugouPlaylistId)
      remote = linked.songs
      complete = true
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
      // 查重兜底:同一来源歌单只导入一次,已导入过直接返回已有歌单
      const existing = findImportedPlaylist(linked.platform, linked.playlistId, linked.name)
      if (existing) return ok({ id: existing.id, name: existing.name, count: existing.songIds.length })
      upsertSongs(linked.songs)
      const platformText =
        linked.platform === 'netease' ? '网易云' : linked.platform === 'qq' ? 'QQ音乐' : '酷狗'
      // 数量在歌单详情页会单独显示,描述里不再重复
      const pl = createPlaylist(linked.name, `${platformText}链接导入`)
      // 回填来源 id → 分类展示与「同步」都靠它
      if (linked.platform === 'netease') pl.neteasePlaylistId = Number(linked.playlistId)
      else if (linked.platform === 'qq') pl.qqPlaylistId = Number(linked.playlistId)
      else if (linked.platform === 'kugou') pl.kugouPlaylistId = linked.playlistId
      pl.sourcePlatform = linked.platform
      pl.sourceId = linked.playlistId
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
    // 查重兜底:已导入过(按来源 id)直接返回已有歌单,不再新建
    const existing = findImportedPlaylist('netease', String(id), name)
    if (existing) return existing
    const songs = await netease.getPlaylistDetail(id)
    if (songs.length === 0) return null
    upsertSongs(songs)
    const pl = createPlaylist(name, '网易云歌单导入')
    pl.neteasePlaylistId = id
    pl.sourcePlatform = 'netease'
    pl.sourceId = String(id)
    pl.songIds = songs.map((s) => s.id)
    pl.syncedIds = [...pl.songIds]
    if (songs[0].coverUrl) pl.coverUrl = songs[0].coverUrl
    saveStore()
    return pl
  })

  // ===== QQ 音乐用户歌单(需登录) =====
  ipcMain.handle('qq:userPlaylists', async () => {
    try {
      return ok(await getQqUserPlaylists())
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qq:importPlaylist', async (_e, id: number, name: string) => {
    // 查重兜底:已导入过(按来源 id)直接返回已有歌单,不再新建
    const existing = findImportedPlaylist('qq', String(id), name)
    if (existing) return existing
    // 失败直接抛出(与 netease:importPlaylist 一致,渲染层 catch 显示)
    const linked = await fetchQqPlaylist(String(id))
    if (linked.songs.length === 0) return null
    upsertSongs(linked.songs)
    const pl = createPlaylist(name, 'QQ音乐歌单导入')
    pl.qqPlaylistId = id
    pl.sourcePlatform = 'qq'
    pl.sourceId = String(id)
    pl.songIds = linked.songs.map((s) => s.id)
    pl.syncedIds = [...pl.songIds]
    if (linked.coverUrl) pl.coverUrl = linked.coverUrl
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
  // Cookie 登录:粘贴 SESSDATA 等字段,解析后写入并拉取资料验证
  ipcMain.handle('auth:biliCookieLogin', async (_e, rawCookie: string) => {
    try {
      const parsed = parseBiliCookieString(rawCookie)
      if (!parsed) {
        return { ok: false, message: '未找到有效字段。请粘贴包含 SESSDATA=... 的完整 Cookie' }
      }
      await finishBiliLogin(parsed)
      const info = await bilibili.getUserInfo().catch(() => null)
      if (info && info.isLogin) {
        return { ok: true, message: `登录成功:${info.nickname}` }
      }
      // cookie 已保存但资料没拉回来:仍算成功(部分接口受限),提示用户
      return { ok: true, message: 'Cookie 已保存(资料拉取失败,可能已过期,请核对 SESSDATA)' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('auth:biliLogout', () => {
    setBiliCookie('')
    setBiliCookieStore('')
    setProfile('bili', null)
    // 同步清掉内嵌登录窗的持久会话:否则下次"网页登录"会被旧账号自动登录
    clearBiliLoginPartition()
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
  /** 网易云网页登录窗口(与B站网页登录同款交互) */
  let neLoginWin: BrowserWindow | null = null
  ipcMain.handle('auth:neWebLogin', async () => {
    if (neLoginWin && !neLoginWin.isDestroyed()) {
      neLoginWin.focus()
      return { ok: false, message: '登录窗口已打开' }
    }
    return await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const win = new BrowserWindow({
        width: 540,
        height: 700,
        title: '网易云音乐登录',
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          // 独立持久分区:保留网页登录会话,下次免重登
          partition: 'persist:netease-web',
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      neLoginWin = win
      let settled = false
      let poll: ReturnType<typeof setInterval> | null = null
      const settle = (r: { ok: boolean; message: string }) => {
        if (settled) return
        settled = true
        if (poll) clearInterval(poll)
        if (!win.isDestroyed()) win.destroy()
        neLoginWin = null
        resolve(r)
      }
      // 轮询检测登录完成(MUSIC_U 出现即视为登录成功,验证码/密码/扫码全由官方页面处理)
      const check = async () => {
        if (settled || win.isDestroyed()) return
        try {
          const ses = win.webContents.session
          const cookies = await ses.cookies.get({ url: 'https://music.163.com/' })
          if (!cookies.some((c) => c.name === 'MUSIC_U' && c.value)) return
          const record: Record<string, string> = {}
          for (const c of cookies) record[c.name] = c.value
          netease.setNeteaseCookies(record)
          const acct = await netease.getNeteaseAccount().catch(() => null)
          if (!acct) return // MUSIC_U 存在但资料还没就绪:下一轮再确认
          setNeteaseCookieStore(getNeteaseCookies())
          setProfile('netease', {
            uid: acct.userId,
            nickname: acct.nickname,
            avatar: coverProxyUrl(acct.avatar) ?? ''
          })
          settle({ ok: true, message: `登录成功:${acct.nickname}` })
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
          neLoginWin = null
          resolve({ ok: false, message: '已取消登录' })
        }
      })
      win.loadURL('https://music.163.com/#/login')
    })
  })

  /** 扫码轮询在验证流程期间会阻塞数分钟:并发调用合并到同一 promise */
  let neQRPollInFlight: Promise<{
    status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'
    message: string
  }> | null = null
  ipcMain.handle('auth:neQRPoll', (_e, key: string) => {
    if (neQRPollInFlight) return neQRPollInFlight
    neQRPollInFlight = (async () => {
      // 扫码轮询同样会撞上风控(-462/8821「请完成验证操作」):接入验证窗口流程,
      // 弹出滑块验证页,完成后携带窗口 cookie 重试;普通状态码会立即跳出并关窗。
      const json = await withNeteaseVerify((extra) => netease.pollNeteaseQRJson(key, extra))
      const state = netease.qrStateFromJson(json)
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
    })().finally(() => {
      neQRPollInFlight = null
    })
    return neQRPollInFlight
  })

  /**
   * 网易云登录风控(-462)处理:请求被拦时,服务端会随响应给出人机验证地址
   * (data.verifyUrl,网易云「加密页面」滑块/拼图)。这里自动弹出一个小窗让用户完成
   * 验证,期间每 3 秒把验证窗口会话里种下的 .163.com cookie 合并给重试函数,
   * 直到请求不再 -462(成功或变成业务错误)或超时(3 分钟)。
   */
  let neVerifyWin: BrowserWindow | null = null
  async function withNeteaseVerify(run: (extraCookies?: string) => Promise<any>): Promise<any> {
    let json = await run()
    // -462:网络环境风险;8821:需要行为验证码 —— 两者都带 data.verifyUrl 加密验证页
    if ((json?.code !== -462 && json?.code !== 8821) || !json?.data?.verifyUrl) return json
    if (neVerifyWin && !neVerifyWin.isDestroyed()) neVerifyWin.destroy()
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const win = new BrowserWindow({
      width: 440,
      height: 580,
      title: '安全验证',
      parent,
      ...(parent ? { parent } : {}),
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, partition: 'persist:netease-verify' }
    })
    neVerifyWin = win
    // 加密验证页会检查 UA:Electron 默认 UA 会被判"请在 app 内打开",
    // 纯浏览器 UA 又会跳到官网下载页 —— 必须伪装成网易云 PC 客户端内嵌浏览器
    win.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.17.204416'
    )
    const collectVerifyCookies = async (): Promise<string | undefined> => {
      try {
        const list = await win.webContents.session.cookies.get({})
        const ours = list.filter((c) => /163\.com$/.test((c.domain ?? '').replace(/^\./, '')))
        if (ours.length === 0) return undefined
        return ours.map((c) => `${c.name}=${c.value}`).join('; ')
      } catch {
        return undefined
      }
    }
    // 关闭窗口即放弃
    const closed = new Promise<void>((resolve) => win.on('closed', () => resolve()))
    win.loadURL(json.data.verifyUrl).catch(() => {})
    const deadline = Date.now() + 3 * 60_000
    while (Date.now() < deadline) {
      const winner = await Promise.race([
        (async () => {
          await new Promise((r) => setTimeout(r, 3000))
          return 'retry'
        })(),
        closed.then(() => 'closed')
      ])
      if (winner === 'closed' || win.isDestroyed()) return json
      const extra = await collectVerifyCookies()
      json = await run(extra)
      if (json?.code !== -462 && json?.code !== 8821) break
    }
    if (!win.isDestroyed()) win.destroy()
    neVerifyWin = null
    return json
  }

  ipcMain.handle('auth:neCaptcha', async (_e, phone: string) => {
    try {
      const json = await withNeteaseVerify((extra) => netease.sendCaptcha(phone, '86', extra))
      return { ok: json.code === 200, message: json.message ?? (json.code === 200 ? '已发送' : '发送失败') }
    } catch (e) {
      return err(e) as { ok: false; error: string } & { ok: boolean; message?: string }
    }
  })
  ipcMain.handle('auth:neLoginCaptcha', async (_e, phone: string, captcha: string) => {
    try {
      const json = await withNeteaseVerify((extra) => netease.loginByCaptcha(phone, captcha, '86', extra))
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
      const json = await withNeteaseVerify((extra) => netease.loginByPassword(phone, password, '86', extra))
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

  // ===== 搜索推荐(输入联想):按来源分发,失败静默返回空 =====
  ipcMain.handle('search:suggest', async (_e, source: string, keyword: string): Promise<string[]> => {
    const kw = String(keyword ?? '').trim()
    if (!kw || kw.length > 100) return []
    try {
      if (source === 'netease') return await netease.searchSuggest(kw)
      if (source === 'bili') return await bilibili.fetchSuggestions(kw)
      if (source === 'qq') return await qqmusic.searchSuggest(kw)
      if (source === 'qishui') return await qishui.searchSuggest(kw)
      return []
    } catch {
      return []
    }
  })

  // ===== 汽水音乐(字节):npm qishui-music-api 协议桥 + 登录态/搜索/歌单 =====
  ipcMain.handle('qishui:request', (_e, operation: string, params: Record<string, unknown>) =>
    qishui.qishuiRequest(operation, params ?? {})
  )
  ipcMain.handle('qishui:search', async (_e, keyword: string, limit?: number) => {
    try {
      return ok(await qishui.searchSongs(keyword, limit ?? 30))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qishui:playlistTracks', async (_e, id: string, limit?: number, offset?: number, ownerId?: string) => {
    try {
      return ok(await qishui.getPlaylistTracks(id, limit ?? 50, offset ?? 0, ownerId))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qishui:account', async () => {
    try {
      const acct = await qishui.getAccount()
      if (acct) {
        setProfile('qishui', {
          uid: acct.userId,
          nickname: acct.nickname,
          avatar: coverProxyUrl(acct.avatar) ?? ''
        })
      } else {
        setProfile('qishui', null)
      }
      return ok(acct)
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qishui:userPlaylists', async () => {
    try {
      return ok(await qishui.getUserPlaylists(50))
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qishui:importPlaylist', async (_e, id: string, name: string) => {
    try {
      // 查重兜底:已导入过(按来源 id)直接返回已有歌单,不再新建
      const existing = findImportedPlaylist('qishui', String(id), name)
      if (existing) return ok(existing)
      const songs = await qishui.importPlaylistTracks(id)
      if (songs.length === 0) return { ok: false, error: '歌单为空或获取失败' }
      upsertSongs(songs)
      const pl = createPlaylist(name, '汽水音乐歌单导入')
      pl.qishuiPlaylistId = String(id)
      pl.sourcePlatform = 'qishui'
      pl.sourceId = String(id)
      pl.songIds = songs.map((s2) => s2.id)
      pl.syncedIds = [...pl.songIds]
      if (songs[0].coverUrl) pl.coverUrl = songs[0].coverUrl
      saveStore()
      return ok(pl)
    } catch (e) {
      return err(e)
    }
  })
  ipcMain.handle('qishui:logout', () => {
    void qishui.qishuiRequest('logout').catch(() => {})
    setProfile('qishui', null)
    return true
  })

  // ===== QQ 音乐登录(内嵌官方授权页:QQ 互联 / 微信 OAuth 二选一,
  //      登录后 wx_redirect.html 在页面内完成 code 兑换并种下 qm_keyst,轮询 harvest 即可) =====
  let qqLoginWin: BrowserWindow | null = null
  const QQ_LOGIN_URL =
    'https://graph.qq.com/oauth2.0/show?which=Login&display=pc&client_id=100497308&response_type=code' +
    '&redirect_uri=' + encodeURIComponent('https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/') +
    '&scope=get_user_info,get_app_friends&state=state'
  // 微信登录(QQ音乐微信 appid + snsapi_login),与 QQ 流程同回跳页(login_type=2)
  const QQ_WX_LOGIN_URL =
    'https://open.weixin.qq.com/connect/qrconnect?appid=wx48db31d50e334801&response_type=code&scope=snsapi_login&state=STATE' +
    '&redirect_uri=' + encodeURIComponent('https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/')
  /** 窗口会话里 qq.com 域的全部 cookie(全量拉取后按域过滤,规避 get({domain}) 匹配语义差异) */
  async function qqDomainCookies(win: BrowserWindow): Promise<Electron.Cookie[]> {
    try {
      const all = await win.webContents.session.cookies.get({})
      return all.filter((c) => !!c.domain && /qq\.com$/.test(c.domain.replace(/^\./, '')))
    } catch {
      return []
    }
  }
  /** 读取当前窗口 qq.com 域 cookie 并检测登录态;返回 cookie 串或 null(未检测到登录态) */
  async function harvestQqCookies(win: BrowserWindow): Promise<string | null> {
    const cookies = await qqDomainCookies(win)
    // 登录态核心是 qm_keyst(QQ/微信登录都会种);uin 字段微信账号可能不同名,不再强求
    const has = (n: string) => cookies.some((c) => c.name === n && c.value)
    if (!has('qm_keyst')) return null
    const merged = new Map<string, string>()
    for (const c of cookies) if (!merged.has(c.name)) merged.set(c.name, c.value)
    return [...merged].map(([n, v]) => `${n}=${v}`).join('; ')
  }
  /** 列出窗口 qq.com 域的全部 cookie 名(诊断用) */
  async function qqCookieNames(win: BrowserWindow): Promise<string> {
    const cookies = await qqDomainCookies(win)
    return cookies.map((c) => c.name).join(',') || '无'
  }
  ipcMain.handle('auth:qqWebLogin', async (_e, kind: 'qq' | 'wx' = 'qq') => {
    if (qqLoginWin && !qqLoginWin.isDestroyed()) {
      qqLoginWin.focus()
      return { ok: false, message: '登录窗口已打开' }
    }
    // 关键:开窗前清掉分区里残留的旧登录会话,否则 harvest 会在窗口打开瞬间
    // 把上次的 qm_keyst 当成本次登录成功(表现为"点了微信登录却登上了QQ号")
    try {
      await session.fromPartition('persist:qq-login').clearStorageData()
    } catch (e) {
      console.warn('[Auth] clear qq-login session failed', e)
    }
    return await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const wx = kind === 'wx'
      const win = new BrowserWindow({
        width: wx ? 500 : 640,
        height: 620,
        title: wx ? 'QQ音乐登录(微信)' : 'QQ音乐登录',
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          // 独立持久分区:保留网页登录会话,下次免重登
          partition: 'persist:qq-login',
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      qqLoginWin = win
      let settled = false
      let poll: ReturnType<typeof setInterval> | null = null
      const finish = async (cancelMessage: string) => {
        if (settled) return
        settled = true
        if (poll) clearInterval(poll)
        // 页面可能已自行关闭(closed 后 cookie 仍可读),关闭前做最后一次 harvest
        const cookieStr = win.isDestroyed() ? null : await harvestQqCookies(win)
        const cookieDiag = await qqCookieNames(win)
        if (!win.isDestroyed()) win.destroy()
        qqLoginWin = null
        if (cookieStr) {
          try {
            setQqAuth({ cookie: cookieStr })
            setQqAuthStore({ cookie: cookieStr, musicid: '', musickey: '', refreshKey: '' })
            const p = await getQqProfile().catch(() => null)
            setProfile('qq', {
              uid: Number(/uin=(o?\d+)/.exec(cookieStr)?.[1]?.replace(/^o/, '') ?? 0),
              nickname: p?.nickname ?? 'QQ音乐用户',
              avatar: p?.avatar ?? ''
            })
          } catch (e) {
            console.warn('[Auth] finish qq login failed', e)
          }
          resolve({ ok: true, message: '登录成功' })
        } else {
          // 诊断:带上窗口里实际存在的 cookie 名,便于定位微信登录的 cookie 字段差异
          resolve({ ok: false, message: `${cancelMessage}(cookie: ${cookieDiag})` })
        }
      }
      poll = setInterval(async () => {
        if (!settled && (await harvestQqCookies(win))) void finish('已取消登录')
      }, 600)
      win.on('closed', () => void finish('已取消登录'))
      win.loadURL(wx ? QQ_WX_LOGIN_URL : QQ_LOGIN_URL)
    })
  })
  ipcMain.handle('auth:qqLogout', () => {
    setQqAuth({ cookie: '' })
    setQqAuthStore(null)
    setProfile('qq', null)
    return true
  })

  // ===== 酷狗登录(普通版 / 概念版,QR 两步流程) =====
  ipcMain.handle('auth:kgQRStart', async (_e, platform: KugouPlatform) => {
    try {
      const qr = await createKugouQr(platform === 'concept' ? 'concept' : 'normal')
      if (!qr) return null
      const imageDataUrl = await QRCode.toDataURL(qr.content, { width: 220, margin: 1 })
      return { imageDataUrl, key: qr.key }
    } catch (e) {
      console.error('[Auth] kugou QR start', e)
      return null
    }
  })
  ipcMain.handle('auth:kgQRPoll', async (_e, platform: KugouPlatform, key: string) => {
    try {
      const state = await pollKugouQr(platform === 'concept' ? 'concept' : 'normal', key)
      if (state.status === 'ok') {
        const cred: KugouCredential = { token: state.token, userid: state.userid }
        if (state.vipType) cred.vipType = state.vipType
        if (state.vipToken) cred.vipToken = state.vipToken
        setKugouTokenStore(platform, cred)
        setProfile(platform === 'concept' ? 'kugouConcept' : 'kugou', {
          uid: Number(state.userid) || 0,
          nickname: state.vipType ? `酷狗用户 ${state.userid}(VIP)` : `酷狗用户 ${state.userid}`,
          avatar: ''
        })
      }
      return { status: state.status, message: state.message }
    } catch (e) {
      return { status: 'error' as const, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('auth:kgLogout', (_e, platform: KugouPlatform) => {
    setKugouTokenStore(platform, null)
    setProfile(platform === 'concept' ? 'kugouConcept' : 'kugou', null)
    return true
  })
  // 酷狗登录用户的在线歌单(歌单页自动列出)
  ipcMain.handle('kugou:userPlaylists', async (_e, platform: KugouPlatform) => {
    try {
      return ok(await fetchKugouUserPlaylists(platform === 'concept' ? 'concept' : 'normal'))
    } catch (e) {
      return err(e)
    }
  })
  // 导入酷狗歌单(collection_ 前缀走概念版收藏接口,其余按老版 specialid)
  ipcMain.handle('kugou:importPlaylist', async (_e, platform: KugouPlatform, id: string, name: string) => {
    // 查重兜底:已导入过(按来源 id)直接返回已有歌单,不再新建(normal/concept 归同一酷狗家族)
    const existing = findImportedPlaylist(platform === 'concept' ? 'kugou-concept' : 'kugou', id, name)
    if (existing) return existing
    const linked = /^collection_/.test(id)
      ? await fetchKugouCollectionPlaylist(id)
      : await fetchKugouPlaylist(id)
    if (linked.songs.length === 0) return null
    upsertSongs(linked.songs)
    const pl = createPlaylist(name, platform === 'concept' ? '酷狗概念版歌单导入' : '酷狗歌单导入')
    pl.kugouPlaylistId = linked.playlistId
    pl.sourcePlatform = platform === 'concept' ? 'kugou-concept' : 'kugou'
    pl.sourceId = linked.playlistId
    pl.songIds = linked.songs.map((s) => s.id)
    pl.syncedIds = [...pl.songIds]
    if (linked.coverUrl) pl.coverUrl = linked.coverUrl
    saveStore()
    return pl
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
  // 手动检查更新(渲染层"关于"区按钮;启动自动检查在 index.ts)
  ipcMain.handle('app:checkUpdate', async () => {
    return await checkUpdateDetailed()
  })

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
            // 同名文件不静默覆盖:追加 (n) 序号
            let name = f
            let i = 1
            while (existsSync(join(currentDownloadDir, name))) {
              const extIdx = name.lastIndexOf('.')
              name =
                extIdx > 0
                  ? `${name.slice(0, extIdx)} (${i})${name.slice(extIdx)}`
                  : `${name} (${i})`
              i++
            }
            copyFileSync(join(dlDir, f), join(currentDownloadDir, name))
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
    // 恢复出厂同时清掉:音频缓存(缓存的歌曲文件)与内嵌 B 站登录会话
    clearAudioCache()
    clearBiliLoginPartition()
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
  /** 全屏切换(PV 舞台用):返回切换后的状态,渲染进程据此更新按钮图标 */
  ipcMain.handle('window:toggleFullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    const next = !win.isFullScreen()
    win.setFullScreen(next)
    return next
  })
  ipcMain.handle('window:isFullscreen', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false
  })
  ipcMain.handle('window:setFullscreen', (e, on: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    win.setFullScreen(!!on)
    return !!on
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
  // 缩放手柄:渲染层上报新尺寸,主进程夹到工作区并落盘
  ipcMain.on('float:setBounds', (e, b: { x: number; y: number; width: number; height: number }) => {
    if (BrowserWindow.fromWebContents(e.sender) !== getFloatWindow()) return
    if (!b || !isFinite(b.width) || !isFinite(b.height)) return
    applyUserBounds(b)
  })
  // 歌词过长自动加宽:null=回到基准宽度
  ipcMain.on('float:fitWidth', (e, needed: number | null) => {
    if (BrowserWindow.fromWebContents(e.sender) !== getFloatWindow()) return
    fitFloatWidth(typeof needed === 'number' && isFinite(needed) ? needed : null)
  })
  ipcMain.handle('float:resetBounds', () => {
    resetFloatBounds()
  })
  // 设置菜单:打开/关闭/改设置
  ipcMain.on('float:menuOpen', (e) => {
    if (BrowserWindow.fromWebContents(e.sender) !== getFloatWindow()) return
    openFloatMenu()
  })
  ipcMain.on('float:menuClose', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w === getFloatWindow() || w?.webContents.getURL().includes('#floatmenu')) closeFloatMenu()
  })
  ipcMain.on('float:menuSet', (e, key: string, value: unknown) => {
    const url = e.sender.getURL()
    if (!url.includes('#floatmenu')) return
    forwardMenuSetting(key, value)
  })
  ipcMain.handle('float:menuGet', (e) => {
    const url = e.sender.getURL()
    if (!url.includes('#floatmenu')) return null
    return getFloatMenuState()
  })

  // ===== 听歌识别 =====
  ipcMain.handle('api:desktopSources', async () => {
    const { desktopCapturer } = await import('electron')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false
    })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })
  ipcMain.handle('api:recognizeAudio', async (_e, wav: ArrayBuffer) => {
    // 总开关关闭时直接拒绝:入口按钮虽已隐藏,但主进程仍要兜底,
    // 避免通过其他途径(快捷键/脚本)发起识别而绕过用户设置。
    // 抛错而非返回空对象——渲染层以 catch 区分失败,返回空对象会被当成"识别成功但无标题"。
    if (getStore().settings.songRecognizeEnabled === false) {
      throw new Error('听歌识别已在设置中关闭')
    }
    return recognizeAudio(Buffer.from(wav))
  })
  ipcMain.handle('api:getRecognizeToken', () => getAuddToken())
  ipcMain.handle('api:setRecognizeToken', (_e, token: string) => {
    setAuddToken(typeof token === 'string' ? token.trim() : '')
  })

  // ===== 快捷方式伪装 =====
  ipcMain.handle('disguise:presets', () =>
    PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
  )
  ipcMain.handle('disguise:icon', (_e, id: string) => iconDataUrl(id))
  ipcMain.handle('disguise:create', async (_e, presetId: string, customName?: string) => {
    try {
      // 只接受已知预设,避免渲染层传入任意名称在桌面建文件
      if (!getPreset(presetId)) return { ok: false, error: '未知的伪装目标' }
      const r = await createShortcut(presetId, customName)
      return { ok: true, path: r.path }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
