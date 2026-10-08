/** 全局共享类型 - 主进程与渲染进程共用 */

export type MusicSource = 'BILIBILI' | 'NETEASE' | 'LOCAL' | 'QQMUSIC' | 'KUGOU'

/** 一首歌曲/音频 */
export interface Song {
  id: string // bvid(_pN) / netease-<id> / local-<hash> / qq-<songid> / kg-<hash>
  title: string
  artist: string
  coverUrl?: string | null
  duration: number // 秒
  /** 来源平台(QQMUSIC/KUGOU 歌曲只存元数据:播放时自动经B站搜索取流、歌词经网易云搜索) */
  source: MusicSource
  bvid?: string
  page: number
  neteaseId?: number
  localPath?: string
  album?: string
  addedAt: number
  /** 网易云 VIP 专供(无登录/无会员时直接走 B 站垫底) */
  vipOnly?: boolean
  /** 换源播放:保留原曲的封面/歌词/标题,仅用新的 source/bvid/neteaseId 取音频流 */
  keepMeta?: boolean
}

export interface Playlist {
  id: string
  name: string
  description?: string
  coverUrl?: string | null
  createdAt: number
  updatedAt: number
  songIds: string[]
  favoriteFolderId?: number | null
  favoriteFolderName?: string | null
  neteasePlaylistId?: number | null
  /** B站播放记录歌单(可同步) */
  biliHistory?: boolean
  /** 上次同步拉到的歌曲 id 快照:下次同步据此算增删,并保护手动加入的歌曲 */
  syncedIds?: string[]
}

export interface RecentPlay {
  song: Song
  playedAt: number
}

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error'

export interface DownloadRecord {
  id: string
  song: Song
  status: DownloadStatus
  received: number
  total: number
  error?: string
  filePath?: string
  createdAt: number
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  accent: string
  downloadDir: string
  neteaseQuality: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'
  filterLongVideo: boolean
  longVideoMinutes: number
  filterLoopTitles: boolean
  filterKeywords: string
  searchOrder: string
  sleepTimerMinutes: number
  eqEnabled: boolean
  eqGains: number[] // 10 band dB values
  /** 窗口材质:无 / 云母(Mica)/ 亚克力(Acrylic),仅 Windows 11 有效 */
  windowEffect: 'none' | 'mica' | 'acrylic'
  /** 玻璃表面不透明度 0.35~1(开启窗口材质时生效) */
  glassAlpha: number
  /** 页面切换动画 */
  pageAnimation: 'none' | 'fade' | 'slide' | 'scale'
  /** 歌词偏移 ms,正值=歌词提前 */
  lyricOffsetMs: number
  /** 歌词对齐:居中 / 靠左(手机端样式) */
  lyricAlign: 'center' | 'left'
  /** 播放倍速 */
  playbackRate: number
  /** 音量 0~1(持久化,下次启动恢复) */
  volume: number
  /** 是否已完成首次启动引导 */
  onboarded: boolean
  /** ===== 歌词模糊(对齐手机端) ===== */
  /** 歌词分层模糊总开关 */
  lyricBlurEnabled: boolean
  /** 模糊总体强度 0~30(0=全部关闭) */
  lyricBlurAmount: number
  /** 当前句模糊 0~30(默认0) */
  lyricBlurCurrent: number
  /** 隔1句模糊 0~30(默认4) */
  lyricBlurNear: number
  /** 隔2句模糊 0~30(默认8) */
  lyricBlurMid: number
  /** 其余歌词模糊 0~30(默认12) */
  lyricBlurFar: number
  /** 睡眠定时结束前渐弱音量 */
  sleepFadeOut: boolean
  /** 倍速时保持音调(preservesPitch) */
  preservePitch: boolean
  /** 元素级自定义样式(进阶):注入到渲染进程的 CSS */
  customCss: string
  /** 界面整体大小 */
  uiScale: 'small' | 'standard' | 'large' | 'xlarge'
  /** 全屏歌词字号 */
  lyricSize: 'small' | 'standard' | 'large' | 'xlarge'
  /** 列表密度 */
  density: 'compact' | 'standard' | 'relaxed'
  /** 界面模块显隐开关(元素级定制) */
  uiModules: {
    /** 侧边栏各项 */
    navSearch: boolean
    navPlaylists: boolean
    navDownloads: boolean
    navRecent: boolean
    navSettings: boolean
    /** 全屏播放页 */
    npMore: boolean
    npSpectrum: boolean
    npQualityBadge: boolean
    /** 迷你播放条 */
    barMore: boolean
    barVolume: boolean
    /** 搜索页 */
    searchRecommend: boolean
  }
  /** 悬浮歌词小窗(独立置顶小窗,主窗口推送播放状态) */
  floatLyric: boolean
  /** 悬浮歌词窗位置与尺寸(拖动/缩放后记忆) */
  floatLyricBounds?: { x: number; y: number; width: number; height: number }
}

/** 悬浮歌词窗状态载荷(主窗口渲染层 → 悬浮窗) */
export interface FloatLyricState {
  hasCurrent: boolean
  title: string
  artist: string
  playing: boolean
  /** 当前歌词行文本(前奏时为空) */
  lineText: string
  /** 下一句歌词(预告) */
  nextText: string
  lineIndex: number
  lineCount: number
  dark: boolean
  accent: string
}

/** 悬浮歌词窗 → 主窗口的控制指令 */
export type FloatControlCmd = 'toggle' | 'prev' | 'next' | 'hide'

export interface UserProfile {
  uid: number
  nickname: string
  avatar: string
  extra?: string
}

export interface Library {
  songs: Record<string, Song>
  playlists: Playlist[]
  recentPlays: RecentPlay[]
  searchHistory: string[]
  downloads: DownloadRecord[]
  downloadedIds: string[]
  settings: Settings
  biliProfile?: UserProfile | null
  neteaseProfile?: UserProfile | null
  /** 听歌时长统计(date=自然日,跨天加载时 todayMs 清零、累计保留) */
  listenStats?: ListenStats
}

/** 听歌时长统计 */
export interface ListenStats {
  totalMs: number
  todayMs: number
  /** YYYY-MM-DD(本地时区) */
  date: string
}

export interface PreparedAudio {
  url: string // bmedia://... 可直接赋给 <audio src>
  cachePath?: string
  /** m4s(fmp4) 时 Chrome 可能不支持,渲染层遇到 error 后带 html5Fallback=true 重试 */
  isFragmented?: boolean
  /** 音质描述,如 无损 FLAC / 320k / 标准 128k / 本地文件 */
  quality?: string
}

export interface LyricLine {
  timeMs: number
  text: string
  /** 逐字时间(ms),与 text 可见字符一一对应,空数组表示无逐字数据 */
  wordTimes?: number[]
  /** KTV 逐字分段(网易 YRC),有则全屏页按字高亮 */
  words?: { text: string; timeMs: number }[]
}

export interface LyricsResult {
  lines: LyricLine[]
  provider: 'bilibili' | 'netease' | 'none'
  title?: string
}

/** 渲染进程可用 API(由 preload 注入) */
export interface BiliPage {
  cid: number
  page: number
  part: string
  duration: number
}

export interface NeteaseSearchResult {
  songs: Song[]
  hasMore: boolean
  total: number
}

export interface CommentItem {
  id: string
  user: string
  avatar: string
  content: string
  time: number
  likes: number
}

export interface CommentsResult {
  total: number
  hasMore: boolean
  comments: CommentItem[]
}

/** 评论排序:热度(B站综合/点赞,网易云热门评论) / 时间(最新在前) */
export type CommentOrder = 'hot' | 'time'

/** 评论来源平台:兜底场景(网易云垫底B站/QQ酷狗B站取流)下可切换查看 */
export type CommentPlatform = 'bilibili' | 'netease'

export interface NeteasePlaylistBrief {
  id: number
  name: string
  coverUrl?: string
  count: number
  creator: string
}

export interface NeteaseArtistBrief {
  id: number
  name: string
  avatar?: string
  musicCount?: number
}

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface DesktopApi {
  // 搜索
  biliSearch(keyword: string, page: number, order: string): Promise<Song[]>
  biliSuggest(keyword: string): Promise<string[]>
  neteaseSearch(keyword: string, offset: number): Promise<ApiResponse<NeteaseSearchResult>>
  neteaseSearchPlaylists(keyword: string): Promise<ApiResponse<NeteasePlaylistBrief[]>>
  neteaseSearchArtists(keyword: string): Promise<ApiResponse<NeteaseArtistBrief[]>>
  neteaseArtistSongs(artistId: number): Promise<ApiResponse<Song[]>>
  neteasePlaylistSongs(id: number): Promise<ApiResponse<Song[]>>
  neteasePersonalized(): Promise<ApiResponse<NeteasePlaylistBrief[]>>
  // 播放
  audioPrepare(song: Song, html5Fallback?: boolean): Promise<PreparedAudio>
  lyricsGet(song: Song): Promise<LyricsResult>
  pagesGet(bvid: string): Promise<BiliPage[]>
  commentsGet(
    song: Song,
    offset: number,
    order?: CommentOrder,
    platform?: CommentPlatform
  ): Promise<ApiResponse<CommentsResult>>
  songDetail(song: Song): Promise<ApiResponse<Record<string, string>>>
  // 应用操作
  appCopy(text: string): Promise<void>
  appOpenExternal(url: string): Promise<void>
  appPickLyricFile(): Promise<string | null>
  windowSetEffect(effect: 'none' | 'mica' | 'acrylic'): Promise<boolean>
  // 歌单
  libraryGet(): Promise<Library>
  libraryAddSong(song: Song): Promise<void>
  libraryCreatePlaylist(name: string, description?: string): Promise<Playlist>
  libraryDeletePlaylist(id: string): Promise<void>
  libraryUpdatePlaylist(p: Pick<Playlist, 'id' | 'name' | 'description'>): Promise<void>
  libraryAddToPlaylist(playlistId: string, songs: Song[]): Promise<Playlist[]>
  libraryRemoveFromPlaylist(playlistId: string, songId: string): Promise<Playlist[]>
  libraryAddRecent(song: Song): Promise<void>
  libraryClearRecent(): Promise<void>
  libraryAddSearchHistory(q: string): Promise<void>
  libraryRemoveSearchHistory(q: string): Promise<void>
  libraryClearSearchHistory(): Promise<void>
  librarySetSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings>
  /** 累加听歌时长(渲染层播放中每10s/暂停时冲刷),返回最新统计 */
  libraryAddListenTime(ms: number): Promise<ListenStats>
  // 导入
  importBiliFavorites(folderId: number, folderName: string): Promise<Playlist | null>
  biliFavFolders(): Promise<{ id: number; title: string; coverUrl?: string; songCount: number }[]>
  /** 分页拉取收藏夹内容(在线视图:打开时按页获取) */
  biliFavPage(folderId: number, page: number): Promise<{ songs: Song[]; total: number; hasMore: boolean }>
  /** 分页拉取播放记录(cursor,在线视图:打开时获取 20 条,下翻加载更多) */
  biliHistoryPage(max: string, viewAt: string): Promise<{
    songs: Song[]
    nextMax: string
    nextViewAt: string
    hasMore: boolean
    notLoggedIn: boolean
  }>
  importNeteasePlaylist(id: number, name: string): Promise<Playlist | null>
  neteaseUserPlaylists(): Promise<ApiResponse<{ id: number; name: string; coverUrl?: string; count: number }[]>>
  /** 导入B站播放记录为歌单 */
  biliImportHistory(): Promise<ApiResponse<{ id: string; count: number }>>
  /**
   * 同步可同步歌单(B站收藏夹/网易云歌单/播放记录):按上次同步快照增量更新,
   * 手动加入的歌曲不会被删除
   */
  librarySyncPlaylist(id: string): Promise<ApiResponse<{ added: number; removed: number; total: number }>>
  /** 通过链接导入歌单(支持网易云 / QQ音乐 / 酷狗音乐) */
  playlistImportByLink(url: string): Promise<ApiResponse<{ id: string; name: string; count: number }>>
  /** 备份(库数据+设置+已下载歌曲,zip):弹保存对话框,返回保存路径与歌曲数 */
  appBackupCreate(): Promise<ApiResponse<{ path: string; audioCount: number }>>
  /** 恢复备份:弹打开对话框,校验并替换数据(失败自动回滚),成功后重启应用 */
  appRestoreBackup(): Promise<ApiResponse<{ message: string }>>
  /** 恢复出厂设置:清空全部数据与设置,重启应用(已下载的歌曲文件保留在原目录) */
  appFactoryReset(): Promise<boolean>
  /** 重启应用(恢复备份/重置后由渲染层触发) */
  appRelaunch(): Promise<boolean>
  // 登录
  biliQRStart(): Promise<{ imageDataUrl: string; key: string } | null>
  biliQRPoll(key: string): Promise<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>
  /** 打开内嵌官方登录窗口(密码/短信/滑块验证全由B站页面处理),登录成功自动回填 */
  biliWebLogin(): Promise<{ ok: boolean; message: string }>
  biliLogout(): Promise<void>
  neteaseQRStart(): Promise<{ imageDataUrl: string; key: string } | null>
  neteaseQRPoll(key: string): Promise<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>
  neteaseSendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>
  neteaseLoginCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>
  neteaseLoginPassword(phone: string, password: string): Promise<{ ok: boolean; message: string }>
  neteaseLogout(): Promise<void>
  // 下载
  downloadAdd(songs: Song[]): Promise<void>
  downloadCancel(id: string): Promise<void>
  /** 删除单条下载记录(完成/失败后) */
  downloadRemoveRecord(id: string): Promise<void>
  downloadClear(failedOnly?: boolean): Promise<void>
  downloadOpenDir(): Promise<void>
  downloadChooseDir(): Promise<string | null>
  downloadOpenFile(recordId: string): Promise<void>
  // 应用
  appOpenCacheDir(): Promise<void>
  appClearCache(): Promise<number>
  appVersion(): Promise<{ version: string; electron: string; platform: string }>
  appPickLocalAudio(): Promise<string[]>
  windowMinimize(): void
  windowMaximizeToggle(): void
  windowClose(): void
  /** 主进程推送事件 */
  onDlUpdate(cb: (record: DownloadRecord) => void): () => void
  // 悬浮歌词窗
  /** 创建/销毁悬浮歌词窗 */
  floatShow(show: boolean): Promise<boolean>
  /** 主窗口推送播放状态到悬浮窗 */
  floatPostState(state: FloatLyricState): void
  /** 悬浮窗接收状态(悬浮窗内注册) */
  onFloatState(cb: (state: FloatLyricState) => void): () => void
  /** 悬浮窗发送控制指令(悬浮窗内注册) */
  floatSendControl(cmd: FloatControlCmd): void
  /** 主窗口接收控制指令(主窗口内注册) */
  onFloatControl(cb: (cmd: FloatControlCmd) => void): () => void
  /** 从悬浮窗唤起主窗口 */
  floatOpenMain(): Promise<void>
}
