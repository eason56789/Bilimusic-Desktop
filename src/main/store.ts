/** JSON 持久化存储(userData 下) */
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type {
  KugouCredential,
  Library,
  Playlist,
  Settings,
  Song,
  DownloadRecord,
  UserProfile
} from '@shared/types'

export const defaultSettings: Settings = {
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
  pitchSemitones: 0,
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
  floatLyric: false,
  floatLyricLocked: false,
  floatLyricBoundsVersion: 2,
  floatFontScale: 1,
  floatShowTrans: true,
  floatShowNextLine: true,
  closeBehavior: 'ask',
  showChorusMarks: true,
  lyricAlphaCurrent: 1,
  lyricAlphaInactive: 0.75,
  lyricTransMode: 'both',
  lyricTransScale: 0.78,
  lyricTransAlpha: 0.8,
  lyricTransLayout: 'below',
  lyricStyle: 'classic',
  pvArrange: 'pv',
  pvAnim: 'pop',
  pvLayout: 'auto',
  pvAccent: '',
  pvScale: 1,
  pvDecor: true,
  pvMotion: 1,
  pvBlockScenes: true,
  pvFrame: true,
  pvInvertText: true,
  pvTransition: true,
  pvTexture: 1,
  pvCameraMotion: 1,
  pvCharMotion: 1,
  pvCharTiming: 1,
  pvPan: 1,
  pvZoom: 1,
  pvColorMode: 'mono',
  pvPost: true,
  pvGrain: 0.15,
  pvContrast: 0,
  pvRgbShift: 0,
  pvVignette: 0.4,
  pvLens: 0.15,
  pvWholeLine: false,
  pvTailEmphasis: 0.38,
  pvOffsetX: 0,
  /** 纵移存的是内部实际值;滑杆显示值 = 实际值 - 0.11(0.11 才是构图正常位) */
  pvOffsetY: 0.11,
  pvTemperaEnter: 'classic',
  pvJizuraMood: 'auto',
  pvJizuraStyle: 'auto',
  defaultSearchSource: 'netease',
  neteaseFallback: true,
  songRecognizeEnabled: true,
  toastPosition: 'top-center',
  toastDuration: 1,
  toastStyle: 'hud',
  toastShowIcon: true,
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

/** 酷狗双身份凭据(normal=普通酷狗 / concept=酷狗概念版) */
export interface KugouCredentials {
  normal?: KugouCredential
  concept?: KugouCredential
}

/** QQ 音乐登录凭据(cookie 串用于接口请求,refreshKey 留作静默续期) */
export interface QqAuthData {
  cookie: string
  musicid: string
  musickey: string
  refreshKey: string
}

interface StoreData extends Library {
  biliCookie: string
  neteaseCookies: Record<string, string>
  qqAuth: QqAuthData
  kugouTokens: KugouCredentials
}

/** ===== 登录态加密 =====
 * 落盘时不写明文 cookie:优先用系统密钥环(safeStorage)加密;
 * 环境不支持加密时(部分 Linux 无 keyring)回退为明文,与历史行为一致。 */
const ENC_PREFIX = 'enc:'

interface StoredSecrets {
  biliCookieEnc?: string
  neteaseCookiesEnc?: string
  /** AudD 识别 token(与 cookie 同样加密落盘) */
  songRecognizeTokenEnc?: string
  qqAuthEnc?: string
  kugouTokensEnc?: string
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
  qqAuth: { cookie: '', musicid: '', musickey: '', refreshKey: '' },
  kugouTokens: {},
  biliProfile: null,
  neteaseProfile: null,
  qqProfile: null,
  kugouProfile: null,
  kugouConceptProfile: null,
  listenStats: { totalMs: 0, todayMs: 0, date: localToday() }
})

/** 本地时区日期 YYYY-MM-DD(听歌时长按自然日分桶) */
function localToday(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

let data: StoreData = emptyData()
let filePath = ''
let saveTimer: NodeJS.Timeout | null = null

export function initStore(): void {
  const dir = join(app.getPath('userData'))
  mkdirSync(dir, { recursive: true })
  filePath = join(dir, 'library.json')
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<StoreData> & StoredSecrets
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
      if (raw.settings) {
        const st = raw.settings as Settings & { songRecognizeTokenEnc?: string }
        const tk = decryptBlob(st.songRecognizeTokenEnc)
        if (tk !== null) st.songRecognizeToken = tk
        delete st.songRecognizeTokenEnc
      }
      const qqBlob = decryptBlob(raw.qqAuthEnc)
      if (qqBlob !== null) {
        try {
          raw.qqAuth = JSON.parse(qqBlob) as StoreData['qqAuth']
        } catch {
          /* 忽略损坏的 QQ 凭据 */
        }
      }
      delete raw.qqAuthEnc
      const kgBlob = decryptBlob(raw.kugouTokensEnc)
      if (kgBlob !== null) {
        try {
          raw.kugouTokens = JSON.parse(kgBlob) as KugouCredentials
        } catch {
          /* 忽略损坏的酷狗凭据 */
        }
      }
      delete raw.kugouTokensEnc
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
  // 听歌时长:旧存档缺失则初始化;跨天加载则今日清零(累计保留)
  const today = localToday()
  const ls = data.listenStats
  if (!ls || typeof ls.totalMs !== 'number' || typeof ls.todayMs !== 'number' || !ls.date) {
    data.listenStats = { totalMs: 0, todayMs: 0, date: today }
  } else if (ls.date !== today) {
    ls.todayMs = 0
    ls.date = today
  }
  // 关闭窗口行为:旧存档缺失(由 defaultSettings 补齐)或非法值兜底
  if (s.closeBehavior !== 'ask' && s.closeBehavior !== 'tray' && s.closeBehavior !== 'quit') {
    s.closeBehavior = 'ask'
  }
  // 界面样式已统一为经典 Fluent:清掉历史存档里的 uiStyle 字段(MD3 风格已移除)
  delete (s as unknown as Record<string, unknown>).uiStyle
  // 凝彩纵移基准调整:正常位 0.25 → 0.11(整幅构图再上移 14%),旧存档的旧基准值一并迁移
  if (Math.abs((typeof s.pvOffsetY === 'number' ? s.pvOffsetY : 0.25) - 0.25) < 1e-6) {
    s.pvOffsetY = 0.11
  }
  if (typeof s.showChorusMarks !== 'boolean') s.showChorusMarks = defaultSettings.showChorusMarks
  // 悬浮窗布局升级:旧存档记的是旧式窄条位置,统一换成 QQ 音乐式底部居中默认布局
  if (s.floatLyricBoundsVersion !== 2) {
    s.floatLyricBoundsVersion = 2
    delete s.floatLyricBounds
  }
  if (typeof s.floatFontScale !== 'number' || !isFinite(s.floatFontScale)) s.floatFontScale = 1
  s.floatFontScale = Math.min(1.6, Math.max(0.7, s.floatFontScale))
  if (typeof s.floatShowTrans !== 'boolean') s.floatShowTrans = true
  if (typeof s.floatShowNextLine !== 'boolean') s.floatShowNextLine = true
  // 启动时修剪不再被任何列表引用的歌曲元数据,防止 library.json 无限膨胀
  pruneSongs()
}

/**
 * 移除未被 歌单/收藏/最近播放/下载记录 引用的歌曲元数据。
 * 本地歌曲(source=LOCAL)永远保留:它可能只存在于库中,删了会导致本地文件入口消失。
 */
export function pruneSongs(): number {
  const keep = new Set<string>()
  for (const p of data.playlists) for (const id of p.songIds) keep.add(id)
  for (const id of data.favoriteIds ?? []) keep.add(id)
  for (const r of data.recentPlays) keep.add(r.song.id)
  for (const d of data.downloads) keep.add(d.song.id)
  for (const id of data.downloadedIds) keep.add(id)
  let removed = 0
  for (const id of Object.keys(data.songs)) {
    if (keep.has(id) || data.songs[id]?.source === 'LOCAL') continue
    delete data.songs[id]
    removed++
  }
  if (removed > 0) scheduleSave()
  return removed
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
    // 落盘副本:可用系统加密时,cookie/识别 token 只写加密字段,不写明文
    const out: StoreData & StoredSecrets = { ...data }
    const biliBlob = encryptToBlob(data.biliCookie)
    const neBlob = encryptToBlob(JSON.stringify(data.neteaseCookies))
    if (biliBlob !== null && neBlob !== null) {
      out.biliCookie = ''
      out.neteaseCookies = {}
      out.biliCookieEnc = biliBlob
      out.neteaseCookiesEnc = neBlob
    }
    const token = data.settings.songRecognizeToken
    if (token) {
      const tkBlob = encryptToBlob(token)
      if (tkBlob !== null) {
        out.settings = { ...out.settings, songRecognizeToken: '' }
        out.songRecognizeTokenEnc = tkBlob
      }
    }
    const qqBlob = encryptToBlob(JSON.stringify(data.qqAuth))
    const kgBlob = encryptToBlob(JSON.stringify(data.kugouTokens ?? {}))
    if (qqBlob !== null && kgBlob !== null) {
      out.qqAuth = { cookie: '', musicid: '', musickey: '', refreshKey: '' }
      out.kugouTokens = {}
      out.qqAuthEnc = qqBlob
      out.kugouTokensEnc = kgBlob
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

/**
 * 累加听歌时长(渲染层播放中每10s/暂停时冲刷)。
 * 单次上限1分钟:防御异常灌入;跨天自动分桶,累计不清零。
 */
export function addListenTime(ms: number): { totalMs: number; todayMs: number; date: string } {
  if (!isFinite(ms) || ms <= 0) {
    return data.listenStats ?? { totalMs: 0, todayMs: 0, date: localToday() }
  }
  const today = localToday()
  if (!data.listenStats || data.listenStats.date !== today) {
    data.listenStats = { totalMs: data.listenStats?.totalMs ?? 0, todayMs: 0, date: today }
  }
  const capped = Math.min(Math.round(ms), 60_000)
  data.listenStats.totalMs += capped
  data.listenStats.todayMs += capped
  scheduleSave()
  return { ...data.listenStats }
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

export function setProfile(
  kind: 'bili' | 'netease' | 'qq' | 'kugou' | 'kugouConcept',
  profile: UserProfile | null
): void {
  if (kind === 'bili') data.biliProfile = profile
  else if (kind === 'netease') data.neteaseProfile = profile
  else if (kind === 'qq') data.qqProfile = profile
  else if (kind === 'kugou') data.kugouProfile = profile
  else data.kugouConceptProfile = profile
  scheduleSave()
}

export function setQqAuthStore(auth: QqAuthData | null): void {
  data.qqAuth = auth ?? { cookie: '', musicid: '', musickey: '', refreshKey: '' }
  scheduleSave()
}

export function setKugouTokenStore(
  platform: 'normal' | 'concept',
  cred: KugouCredential | null
): void {
  data.kugouTokens = { ...data.kugouTokens }
  if (cred) data.kugouTokens[platform] = cred
  else delete data.kugouTokens[platform]
  scheduleSave()
}

export function getKugouCredentials(): KugouCredentials {
  return data.kugouTokens ?? {}
}

/** 酷狗设备 MID:首次生成随机 guid → md5 → hex 视为大整数转十进制,持久化复用 */
export function getOrCreateKugouMid(): string {
  const existing = data.settings.kugouMid
  if (existing) return existing
  const guid = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0')
  const hex = createHash('md5').update(guid).digest('hex')
  const mid = BigInt('0x' + hex).toString(10)
  data.settings.kugouMid = mid
  scheduleSave()
  return mid
}

/** 换一个全新的酷狗设备 mid(设备注册只在首次返回 dfid,旧 mid 注册过就再也拿不到) */
export function rotateKugouMid(): string {
  data.settings.kugouMid = undefined
  return getOrCreateKugouMid()
}

export function setBiliCookieStore(cookie: string): void {
  data.biliCookie = cookie
  scheduleSave()
}

export function setNeteaseCookieStore(cookies: Record<string, string>): void {
  data.neteaseCookies = cookies
  scheduleSave()
}
