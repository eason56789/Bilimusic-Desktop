/** preload: 以类型安全方式暴露主进程 API */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Song,
  Settings,
  Library,
  PreparedAudio,
  LyricsResult,
  BiliPage,
  NeteaseSearchResult,
  DownloadRecord,
  Playlist,
  DesktopApi,
  FloatLyricState,
  FloatControlCmd,
  FloatMenuState
} from '@shared/types'

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

const api: DesktopApi = {
  biliSearch: (keyword, page, order) => invoke('api:biliSearch', keyword, page, order),
  biliSuggest: (keyword) => invoke('api:biliSuggest', keyword),
  neteaseSearch: (keyword, offset) => invoke('api:neteaseSearch', keyword, offset),
  neteaseSearchPlaylists: (keyword) => invoke('api:neteaseSearchPlaylists', keyword),
  neteaseSearchArtists: (keyword) => invoke('api:neteaseSearchArtists', keyword),
  neteaseFindArtist: (name) => invoke('api:neteaseFindArtist', name),
  neteaseArtistSongs: (artistId) => invoke('api:neteaseArtistSongs', artistId),
  neteasePlaylistSongs: (id) => invoke('api:neteasePlaylistSongs', id),
  neteasePersonalized: () => invoke('api:neteasePersonalized'),
  qqSearch: (keyword, page) => invoke('api:qqSearch', keyword, page),
  qqSearchPlaylists: (keyword, page) => invoke('api:qqSearchPlaylists', keyword, page),
  qqSearchArtists: (keyword, page) => invoke('api:qqSearchArtists', keyword, page),
  qqArtistSongs: (artistId) => invoke('api:qqArtistSongs', artistId),
  kugouSearch: (keyword, page) => invoke('api:kugouSearch', keyword, page),
  kugouSearchPlaylists: (keyword, page) => invoke('api:kugouSearchPlaylists', keyword, page),
  kugouSearchArtists: (keyword, page) => invoke('api:kugouSearchArtists', keyword, page),
  kugouArtistSongs: (artistId) => invoke('api:kugouArtistSongs', artistId),
  sourcePlaylistSongs: (platform, id) => invoke('api:sourcePlaylistSongs', platform, id),
  libraryImportSourcePlaylist: (platform, id, name) =>
    invoke('library:importSourcePlaylist', platform, id, name),
  songClimax: (song) => invoke('api:songClimax', song),
  songHot: (song) => invoke('api:songHot', song),
  chartCatalog: (platform) => invoke('api:chartCatalog', platform),
  chartSongs: (platform, chartId) => invoke('api:chartSongs', platform, chartId),
  neteasePlaylistMeta: (id) => invoke('api:neteasePlaylistMeta', id),
  neteaseArtistDetail: (id) => invoke('api:neteaseArtistDetail', id),

  audioPrepare: (song: Song, html5Fallback?: boolean) =>
    invoke('audio:prepare', song, html5Fallback),
  onAudioProgress: (cb) => {
    const listener = (_e: unknown, p: import('@shared/types').AudioLoadProgress) => cb(p)
    ipcRenderer.on('audio:progress', listener)
    return () => ipcRenderer.removeListener('audio:progress', listener)
  },
  lyricsGet: (song: Song) => invoke('lyrics:get', song),
  pagesGet: (bvid: string) => invoke('pages:get', bvid),
  commentsGet: (song, offset, order, platform) => invoke('api:comments', song, offset, order, platform),
  songDetail: (song) => invoke('api:songDetail', song),
  appCopy: (text) => invoke('app:copy', text),
  appOpenExternal: (url) => invoke('app:openExternal', url),
  appPickLyricFile: () => invoke('app:pickLyricFile'),
  windowSetEffect: (effect) => invoke('app:setWindowEffect', effect),

  libraryGet: () => invoke<Library>('library:get'),
  libraryAddSong: (song: Song) => invoke('library:addSong', song),
  libraryCreatePlaylist: (name, description) =>
    invoke<Playlist>('library:createPlaylist', name, description),
  libraryDeletePlaylist: (id) => invoke('library:deletePlaylist', id),
  libraryUpdatePlaylist: (p) => invoke('library:updatePlaylist', p),
  libraryAddToPlaylist: (playlistId, songs) =>
    invoke<Playlist[]>('library:addToPlaylist', playlistId, songs),
  libraryRemoveFromPlaylist: (playlistId, songId) =>
    invoke<Playlist[]>('library:removeFromPlaylist', playlistId, songId),
  libraryAddRecent: (song) => invoke('library:addRecent', song),
  libraryClearRecent: () => invoke('library:clearRecent'),
  libraryToggleFavorite: (song) => invoke('library:toggleFavorite', song),
  libraryGetFavorites: () => invoke('library:getFavorites'),
  libraryDedupeFavorites: () => invoke('library:dedupeFavorites'),
  libraryAddSearchHistory: (q) => invoke('library:addSearchHistory', q),
  libraryRemoveSearchHistory: (q) => invoke('library:removeSearchHistory', q),
  libraryClearSearchHistory: () => invoke('library:clearSearchHistory'),
  librarySetSetting: (key, value) => invoke<Settings>('library:setSetting', key, value),
  libraryAddListenTime: (ms) => invoke('library:addListenTime', ms),

  importBiliFavorites: (folderId, folderName) =>
    invoke<Playlist | null>('bili:importFav', folderId, folderName),
  biliFavFolders: () =>
    invoke<{ id: number; title: string; coverUrl?: string; songCount: number }[]>(
      'bili:favFolders'
    ),
  biliFavPage: (folderId, page) => invoke('bili:favPage', folderId, page),
  biliHistoryPage: (max, viewAt) => invoke('bili:historyPage', max, viewAt),
  importNeteasePlaylist: (id, name) => invoke<Playlist | null>('netease:importPlaylist', id, name),
  neteaseUserPlaylists: () =>
    invoke<{
      ok: boolean
      data?: { id: number; name: string; coverUrl?: string; count: number }[]
      error?: string
    }>('netease:userPlaylists'),
  qqUserPlaylists: () =>
    invoke<{
      ok: boolean
      data?: { id: number; name: string; coverUrl?: string; count: number }[]
      error?: string
    }>('qq:userPlaylists'),
  qqImportPlaylist: (id, name) => invoke('qq:importPlaylist', id, name),
  biliImportHistory: () => invoke('bili:importHistory'),
  librarySyncPlaylist: (id) => invoke('library:syncPlaylist', id),
  playlistImportByLink: (url) => invoke('playlist:importByLink', url),

  biliQRStart: () => invoke<{ imageDataUrl: string; key: string } | null>('auth:biliQRStart'),
  biliQRPoll: (key) =>
    invoke<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>(
      'auth:biliQRPoll',
      key
    ),
  biliLogout: () => invoke('auth:biliLogout'),
  /** 打开内嵌官方登录窗口(密码/短信/滑块全由B站页面处理) */
  biliWebLogin: () => invoke<{ ok: boolean; message: string }>('auth:biliWebLogin'),
  biliCookieLogin: (cookie) => invoke<{ ok: boolean; message: string }>('auth:biliCookieLogin', cookie),
  neteaseQRStart: () => invoke<{ imageDataUrl: string; key: string } | null>('auth:neQRStart'),
  neteaseQRPoll: (key) =>
    invoke<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>(
      'auth:neQRPoll',
      key
    ),
  neteaseSendCaptcha: (phone) =>
    invoke<{ ok: boolean; message: string }>('auth:neCaptcha', phone),
  neteaseLoginCaptcha: (phone, captcha) =>
    invoke<{ ok: boolean; message: string }>('auth:neLoginCaptcha', phone, captcha),
  neteaseLoginPassword: (phone, password) =>
    invoke<{ ok: boolean; message: string }>('auth:neLoginPassword', phone, password),
  neteaseLogout: () => invoke('auth:neLogout'),
  qqWebLogin: (kind) => invoke<{ ok: boolean; message: string }>('auth:qqWebLogin', kind),
  qqLogout: () => invoke('auth:qqLogout'),
  kugouQRStart: (platform) => invoke('auth:kgQRStart', platform),
  kugouQRPoll: (platform, key) => invoke('auth:kgQRPoll', platform, key),
  kugouLogout: (platform) => invoke('auth:kgLogout', platform),

  downloadAdd: (songs) => invoke('download:add', songs),
  downloadCancel: (id) => invoke('download:cancel', id),
  downloadRemoveRecord: (id) => invoke('download:removeRecord', id),
  downloadClear: (failedOnly?: boolean) => invoke('download:clear', failedOnly),
  downloadOpenDir: () => invoke('download:openDir'),
  downloadChooseDir: () => invoke<string | null>('download:chooseDir'),
  downloadOpenFile: (recordId) => invoke('download:openFile', recordId),

  appOpenCacheDir: () => invoke('app:openCacheDir'),
  appClearCache: () => invoke<number>('app:clearCache'),
  appVersion: () => invoke<{ version: string; electron: string; platform: string }>('app:version'),
  appPickLocalAudio: () => invoke<string[]>('app:pickLocalAudio'),
  checkUpdate: () => invoke('app:checkUpdate'),
  onUpdateAvailable: (cb) => {
    const listener = (_e: unknown, info: import('@shared/types').UpdateInfo) => cb(info)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateLatest: (cb) => {
    const listener = (_e: unknown, version: string) => cb(version)
    ipcRenderer.on('update:latest', listener)
    return () => ipcRenderer.removeListener('update:latest', listener)
  },
  appBackupCreate: () => invoke('app:backupCreate'),
  appRestoreBackup: () => invoke('app:restoreBackup'),
  appFactoryReset: () => invoke<boolean>('app:factoryReset'),
  appRelaunch: () => invoke<boolean>('app:relaunch'),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximizeToggle: () => ipcRenderer.send('window:maximizeToggle'),
  windowClose: () => ipcRenderer.send('window:close'),
  // 关闭窗口询问(主进程 → 渲染层弹窗)
  onWindowCloseAsk: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('window:closeAsk', listener)
    return () => ipcRenderer.removeListener('window:closeAsk', listener)
  },
  windowCloseDecide: (action) => invoke('window:closeDecide', action),

  onDlUpdate: (cb: (record: DownloadRecord) => void) => {
    const listener = (_e: unknown, record: DownloadRecord) => cb(record)
    ipcRenderer.on('dl:update', listener)
    return () => ipcRenderer.removeListener('dl:update', listener)
  },

  // 悬浮歌词窗
  floatShow: (show) => invoke<boolean>('float:show', show),
  /** 悬浮窗接收"鼠标是否在窗口内"(主进程轮询;拖动区收不到 mousemove) */
  onFloatHover: (cb) => {
    const listener = (_e: unknown, inside: boolean) => cb(inside)
    ipcRenderer.on('float:hover', listener)
    return () => ipcRenderer.removeListener('float:hover', listener)
  },
  floatPostState: (state) => ipcRenderer.send('float:state', state),
  onFloatState: (cb) => {
    const listener = (_e: unknown, state: FloatLyricState) => cb(state)
    ipcRenderer.on('float:state', listener)
    return () => ipcRenderer.removeListener('float:state', listener)
  },
  floatSendControl: (cmd) => ipcRenderer.send('float:control', cmd),
  onFloatControl: (cb) => {
    const listener = (_e: unknown, cmd: FloatControlCmd) => cb(cmd)
    ipcRenderer.on('float:control', listener)
    return () => ipcRenderer.removeListener('float:control', listener)
  },
  floatOpenMain: () => invoke('float:openMain'),
  /** 缩放手柄拖动结果:主进程夹到工作区并落盘 */
  floatSetBounds: (b) => ipcRenderer.send('float:setBounds', b),
  /** 歌词过长时请求加宽(null=恢复基准宽度) */
  floatFitWidth: (needed) => ipcRenderer.send('float:fitWidth', needed),
  /** 恢复默认位置/尺寸(QQ音乐式底部居中) */
  floatResetBounds: () => invoke('float:resetBounds'),
  /** 打开悬浮窗设置菜单 */
  floatMenuOpen: () => ipcRenderer.send('float:menuOpen'),
  floatMenuClose: () => ipcRenderer.send('float:menuClose'),
  floatMenuGet: () => invoke('float:menuGet'),
  /** 菜单窗接收主进程回推的最新设置(改完后菜单立即刷新,不用重开) */
  onFloatMenuState: (cb) => {
    const listener = (_e: unknown, s: FloatMenuState) => cb(s)
    ipcRenderer.on('float:menuState', listener)
    return () => ipcRenderer.removeListener('float:menuState', listener)
  },
  /** 菜单内改设置(主窗口统一落盘) */
  floatMenuSet: (key, value) => ipcRenderer.send('float:menuSet', key, value),
  /** 主窗口接收菜单设置变更 */
  onFloatMenuSet: (cb) => {
    const listener = (_e: unknown, p: { key: string; value: unknown }) => cb(p)
    ipcRenderer.on('float:menuSet', listener)
    return () => ipcRenderer.removeListener('float:menuSet', listener)
  },

  // 听歌识别
  desktopSources: () => invoke<{ id: string; name: string }[]>('api:desktopSources'),
  recognizeAudio: (wav) => invoke('api:recognizeAudio', wav),
  getRecognizeToken: () => invoke<string>('api:getRecognizeToken'),
  setRecognizeToken: (token) => invoke('api:setRecognizeToken', token),

  // 快捷方式伪装
  disguisePresets: () => invoke('disguise:presets'),
  disguisePresetIcon: (id) => invoke<string>('disguise:icon', id),
  disguiseCreate: (presetId, customName) => invoke('disguise:create', presetId, customName)
} as DesktopApi

contextBridge.exposeInMainWorld('api', api)

// 供 TS 类型引用
export type { PreparedAudio, LyricsResult, BiliPage, NeteaseSearchResult }
