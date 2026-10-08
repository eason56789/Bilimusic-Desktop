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
  FloatControlCmd
} from '@shared/types'

const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

const api: DesktopApi = {
  biliSearch: (keyword, page, order) => invoke('api:biliSearch', keyword, page, order),
  biliSuggest: (keyword) => invoke('api:biliSuggest', keyword),
  neteaseSearch: (keyword, offset) => invoke('api:neteaseSearch', keyword, offset),
  neteaseSearchPlaylists: (keyword) => invoke('api:neteaseSearchPlaylists', keyword),
  neteaseSearchArtists: (keyword) => invoke('api:neteaseSearchArtists', keyword),
  neteaseArtistSongs: (artistId) => invoke('api:neteaseArtistSongs', artistId),
  neteasePlaylistSongs: (id) => invoke('api:neteasePlaylistSongs', id),
  neteasePersonalized: () => invoke('api:neteasePersonalized'),

  audioPrepare: (song: Song, html5Fallback?: boolean) =>
    invoke('audio:prepare', song, html5Fallback),
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
  appBackupCreate: () => invoke('app:backupCreate'),
  appRestoreBackup: () => invoke('app:restoreBackup'),
  appFactoryReset: () => invoke<boolean>('app:factoryReset'),
  appRelaunch: () => invoke<boolean>('app:relaunch'),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximizeToggle: () => ipcRenderer.send('window:maximizeToggle'),
  windowClose: () => ipcRenderer.send('window:close'),

  onDlUpdate: (cb: (record: DownloadRecord) => void) => {
    const listener = (_e: unknown, record: DownloadRecord) => cb(record)
    ipcRenderer.on('dl:update', listener)
    return () => ipcRenderer.removeListener('dl:update', listener)
  },

  // 悬浮歌词窗
  floatShow: (show) => invoke<boolean>('float:show', show),
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
  floatOpenMain: () => invoke('float:openMain')
} as DesktopApi

contextBridge.exposeInMainWorld('api', api)

// 供 TS 类型引用
export type { PreparedAudio, LyricsResult, BiliPage, NeteaseSearchResult }
