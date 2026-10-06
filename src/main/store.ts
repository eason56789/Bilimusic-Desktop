/** JSON 持久化存储(userData 下) */
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { Library, Playlist, Settings, Song, DownloadRecord, UserProfile } from '@shared/types'

const defaultSettings: Settings = {
  theme: 'system',
  accent: '#0f6cbd',
  downloadDir: '',
  neteaseQuality: 'exhigh',
  filterLongVideo: true,
  longVideoMinutes: 10,
  filterLoopTitles: false,
  filterKeywords: '',
  searchOrder: 'totalrank',
  sleepTimerMinutes: 0,
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  windowEffect: 'acrylic',
  glassAlpha: 0.82,
  pageAnimation: 'scale',
  lyricOffsetMs: 0,
  lyricAlign: 'center',
  playbackRate: 1,
  volume: 0.9,
  onboarded: false,
  lyricBlurEnabled: true,
  lyricBlurAmount: 1,
  lyricBlurCurrent: 0,
  lyricBlurNear: 1,
  lyricBlurMid: 2,
  lyricBlurFar: 2,
  sleepFadeOut: true,
  preservePitch: true,
  customCss: '',
  uiScale: 'standard',
  lyricSize: 'standard',
  density: 'standard',
  uiModules: {
    navSearch: true,
    navPlaylists: true,
    navDownloads: true,
    navRecent: true,
    navSettings: true,
    npMore: true,
    npSpectrum: true,
    npQualityBadge: true,
    barMore: true,
    barVolume: true,
    searchRecommend: true
  }
}

interface StoreData extends Library {
  biliCookie: string
  neteaseCookies: Record<string, string>
}

/** ===== 登录态加密 =====
 * 落盘时不写明文 cookie:优先用系统密钥环(safeStorage)加密;
 * 环境不支持加密时(部分 Linux 无 keyring)回退为明文,与历史行为一致。 */
const ENC_PREFIX = 'enc:'

interface StoredCookies {
  biliCookieEnc?: string
  neteaseCookiesEnc?: string
}

function encryptToBlob(text: string): string | null {
  if (!text) return ''
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return ENC_PREFIX + safeStorage.encryptString(text).toString('base64')
  } catch (e) {
    console.warn('[Store] cookie encrypt failed, fallback to plaintext', e)
    return null
  }
}

function decryptBlob(blob: unknown): string | null {
  if (typeof blob !== 'string' || !blob.startsWith(ENC_PREFIX)) return null
  try {
    return safeStorage.decryptString(Buffer.from(blob.slice(ENC_PREFIX.length), 'base64'))
  } catch (e) {
    console.warn('[Store] cookie decrypt failed(可能更换了系统账户/密钥),忽略已存登录态', e)
    return null
  }
}

const emptyData = (): StoreData => ({
  songs: {},
  playlists: [],
  recentPlays: [],
  searchHistory: [],
  downloads: [],
  downloadedIds: [],
  settings: { ...defaultSettings },
  biliCookie: '',
  neteaseCookies: {},
  biliProfile: null,
  neteaseProfile: null
})

let data: StoreData = emptyData()
let filePath = ''
let saveTimer: NodeJS.Timeout | null = null

export function initStore(): void {
  const dir = join(app.getPath('userData'))
  mkdirSync(dir, { recursive: true })
  filePath = join(dir, 'library.json')
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<StoreData> & StoredCookies
      // 加密字段解密回内存(旧存档为明文,直接使用;解密失败则丢弃该登录态)
      const bili = decryptBlob(raw.biliCookieEnc)
      if (bili !== null) raw.biliCookie = bili
      const ne = decryptBlob(raw.neteaseCookiesEnc)
      if (ne !== null) {
        try {
          raw.neteaseCookies = JSON.parse(ne) as Record<string, string>
        } catch {
          /* 忽略损坏的 cookie 数据 */
        }
      }
      delete raw.biliCookieEnc
      delete raw.neteaseCookiesEnc
      data = { ...emptyData(), ...raw, settings: { ...defaultSettings, ...(raw.settings ?? {}) } }
    }
  } catch (e) {
    console.error('[Store] load failed, using empty store', e)
    data = emptyData()
  }
  // 默认下载目录
  if (!data.settings.downloadDir) {
    assignDefaultDownloadDir()
  }
  // 迁移:初版歌词模糊默认值偏高(4/8/12),若仍是初版值则静默降级为 2/4/7
  const s = data.settings
  if (
    s.lyricBlurAmount === 8 &&
    s.lyricBlurCurrent === 0 &&
    s.lyricBlurNear === 4 &&
    s.lyricBlurMid === 8 &&
    s.lyricBlurFar === 12
  ) {
    s.lyricBlurNear = 2
    s.lyricBlurMid = 4
    s.lyricBlurFar = 7
  }
  // 迁移:二版默认(2/4/7)仍偏重,静默降级为对齐手机端的 1/0/1/2/2
  if (
    s.lyricBlurAmount === 8 &&
    s.lyricBlurCurrent === 0 &&
    s.lyricBlurNear === 2 &&
    s.lyricBlurMid === 4 &&
    s.lyricBlurFar === 7
  ) {
    s.lyricBlurAmount = 1
    s.lyricBlurCurrent = 0
    s.lyricBlurNear = 1
    s.lyricBlurMid = 2
    s.lyricBlurFar = 2
  }
  // 迁移:补齐后增的界面定制字段(旧存档缺失)
  if (!s.uiModules) s.uiModules = { ...defaultSettings.uiModules }
  else s.uiModules = { ...defaultSettings.uiModules, ...s.uiModules }
  if (!s.uiScale) s.uiScale = 'standard'
  if (!s.lyricSize) s.lyricSize = 'standard'
  if (!s.density) s.density = 'standard'
  if (typeof s.customCss !== 'string') s.customCss = ''
  if (typeof s.volume !== 'number' || !isFinite(s.volume)) s.volume = defaultSettings.volume
  s.volume = Math.min(1, Math.max(0, s.volume))
  // 设置页入口永远可用:历史存档可能把它关掉导致无法回到设置,无条件恢复
  s.uiModules.navSettings = true
}

/** 默认下载目录(初始化与恢复出厂共用) */
function assignDefaultDownloadDir(): void {
  try {
    data.settings.downloadDir = join(app.getPath('music'), 'BiliMusic')
  } catch {
    data.settings.downloadDir = join(app.getPath('downloads'), 'BiliMusic')
  }
}

/**
 * 恢复出厂:清空全部数据与设置(歌曲/歌单/播放记录/搜索历史/下载记录/登录态),
 * 删除库文件并写回空存档。已下载的音频文件保留在用户目录,不删除。
 */
export function resetStore(): void {
  const keepDownloadDir = data.settings.downloadDir
  data = emptyData()
  if (keepDownloadDir) data.settings.downloadDir = keepDownloadDir
  else assignDefaultDownloadDir()
  if (filePath && existsSync(filePath)) {
    try {
      unlinkSync(filePath)
    } catch (e) {
      console.warn('[Store] remove old library file failed', e)
    }
  }
  saveStore()
}

export function getStore(): StoreData {
  return data
}

/** 库文件落盘路径(备份/恢复用) */
export function getLibraryFilePath(): string {
  return filePath
}

export function saveStore(): void {
  if (!filePath) return
  try {
    const tmp = `${filePath}.tmp`
    // 落盘副本:可用系统加密时,cookie 只写加密字段,不写明文
    const out: StoreData & StoredCookies = { ...data }
    const biliBlob = encryptToBlob(data.biliCookie)
    const neBlob = encryptToBlob(JSON.stringify(data.neteaseCookies))
    if (biliBlob !== null && neBlob !== null) {
      out.biliCookie = ''
      out.neteaseCookies = {}
      out.biliCookieEnc = biliBlob
      out.neteaseCookiesEnc = neBlob
    }
    writeFileSync(tmp, JSON.stringify(out), 'utf8')
    renameSync(tmp, filePath)
  } catch (e) {
    console.error('[Store] save failed', e)
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveStore, 300)
}

// ============ Library 操作 ============

export function upsertSong(song: Song): void {
  data.songs[song.id] = song
  scheduleSave()
}

export function upsertSongs(songs: Song[]): void {
  for (const s of songs) data.songs[s.id] = s
  scheduleSave()
}

export function createPlaylist(name: string, description = ''): Playlist {
  const pl: Playlist = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    coverUrl: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songIds: [],
    favoriteFolderId: null,
    favoriteFolderName: null,
    neteasePlaylistId: null
  }
  data.playlists.push(pl)
  scheduleSave()
  return pl
}

export function deletePlaylist(id: string): void {
  data.playlists = data.playlists.filter((p) => p.id !== id)
  scheduleSave()
}

export function addToPlaylist(playlistId: string, songs: Song[]): Playlist | null {
  const pl = data.playlists.find((p) => p.id === playlistId)
  if (!pl) return null
  for (const s of songs) data.songs[s.id] = s
  const ids = songs.map((s) => s.id)
  pl.songIds = [...pl.songIds, ...ids.filter((id) => !pl.songIds.includes(id))]
  if (!pl.coverUrl && songs[0]?.coverUrl) pl.coverUrl = songs[0].coverUrl
  pl.updatedAt = Date.now()
  scheduleSave()
  return pl
}

export function removeFromPlaylist(playlistId: string, songId: string): Playlist | null {
  const pl = data.playlists.find((p) => p.id === playlistId)
  if (!pl) return null
  pl.songIds = pl.songIds.filter((id) => id !== songId)
  pl.updatedAt = Date.now()
  scheduleSave()
  return pl
}

export function addRecent(song: Song): void {
  data.songs[song.id] = song
  data.recentPlays = [
    { song, playedAt: Date.now() },
    ...data.recentPlays.filter((r) => r.song.id !== song.id)
  ].slice(0, 200)
  scheduleSave()
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  ;(data.settings as unknown as Record<string, unknown>)[key as string] = value
  scheduleSave()
}

export function addSearchHistory(q: string): void {
  data.searchHistory = [q, ...data.searchHistory.filter((s) => s !== q)].slice(0, 30)
  scheduleSave()
}

export function removeSearchHistory(q: string): void {
  data.searchHistory = data.searchHistory.filter((s) => s !== q)
  scheduleSave()
}

export function addDownloadRecord(record: DownloadRecord): void {
  const idx = data.downloads.findIndex((d) => d.id === record.id)
  if (idx >= 0) data.downloads[idx] = record
  else data.downloads.unshift(record)
  if (record.status === 'completed' && !data.downloadedIds.includes(record.song.id)) {
    data.downloadedIds.push(record.song.id)
  }
  scheduleSave()
}

export function removeDownloadRecord(id: string): void {
  data.downloads = data.downloads.filter((d) => d.id !== id)
  scheduleSave()
}

export function setProfile(kind: 'bili' | 'netease', profile: UserProfile | null): void {
  if (kind === 'bili') data.biliProfile = profile
  else data.neteaseProfile = profile
  scheduleSave()
}

export function setBiliCookieStore(cookie: string): void {
  data.biliCookie = cookie
  scheduleSave()
}

export function setNeteaseCookieStore(cookies: Record<string, string>): void {
  data.neteaseCookies = cookies
  scheduleSave()
}
