/** 全局共享类型 - 主进程与渲染进程共用 */

export type MusicSource = 'BILIBILI' | 'NETEASE' | 'LOCAL' | 'QQMUSIC' | 'KUGOU'

/** 一首歌曲/音频 */
export interface Song {
  id: string // bvid(_pN) / netease-<id> / local-<hash> / qq-<songid> / kg-<hash>
  title: string
  artist: string
  coverUrl?: string | null
  duration: number // 秒
  /** 来源平台(QQMUSIC/KUGOU 歌曲元数据优先,播放时先试平台原生音源,失败自动跨平台垫底) */
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
  /** QQ 音乐 songmid(vkey 取流所需) */
  qqMid?: string
  /** QQ 音乐数字 id(评论区 topid 所需) */
  qqId?: number
  /** 酷狗 FileHash(取流/评论所需,一般等于 id 去掉 kg- 前缀) */
  kugouHash?: string
  /** 酷狗 album_audio_id / MixSongID(新版接口用) */
  kugouMixId?: string
  /** 酷狗 albumid(取流所需) */
  kugouAlbumId?: string
  /** 收藏数(平台搜索接口返回:酷狗 OwnerCount;其余平台无公开字段时为 undefined) */
  favCount?: number
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
  /** 悬浮歌词窗已锁定(锁定后窗口鼠标穿透,不挡下层操作) */
  floatLyricLocked: boolean
  /** 悬浮歌词窗位置与尺寸(拖动/缩放后记忆) */
  floatLyricBounds?: { x: number; y: number; width: number; height: number }
  /** 悬浮窗位置/尺寸布局版本(2=QQ音乐式底部居中默认布局;旧存档一次性重置) */
  floatLyricBoundsVersion?: number
  /** 悬浮窗字号缩放 0.7~1.6(1=默认) */
  floatFontScale: number
  /** 悬浮窗显示翻译歌词 */
  floatShowTrans: boolean
  /** 悬浮窗双行显示:翻译缺失时用下一句占位 */
  floatShowNextLine: boolean
  /** 关闭主窗口行为:每次询问 / 后台运行(隐藏到托盘,音乐继续) / 直接退出 */
  closeBehavior: 'ask' | 'tray' | 'quit'
  /** 进度条上显示高潮点(副歌段)标记 */
  showChorusMarks: boolean
  /** 当前歌词不透明度 0.3~1(对齐手机端) */
  lyricAlphaCurrent: number
  /** 非当前歌词不透明度 0.05~1(对齐手机端) */
  lyricAlphaInactive: number
  /** 搜索默认音源 */
  defaultSearchSource: 'netease' | 'bili' | 'qq' | 'kugou'
  /** 网易云无音源时自动到 B站/QQ/酷狗搜索垫底 */
  neteaseFallback: boolean
  /** 已忽略更新的版本号(启动检查到该版本不再提示) */
  skippedUpdateVersion?: string
  /** 听歌识别 AudD API Token(audd.io 免费注册;空=未启用识别) */
  songRecognizeToken?: string
}

/** 网易云歌单元信息(详情页展示) */
export interface NeteasePlaylistMeta {
  id: number
  name: string
  coverUrl?: string
  description?: string
  playCount?: number
  subscribedCount?: number
  shareCount?: number
  commentCount?: number
  createTime?: number
  updateTime?: number
  creator?: string
  tags?: string[]
  trackCount?: number
}

/** 网易云歌手详情(歌手主页展示) */
export interface NeteaseArtistDetail {
  id: number
  name: string
  avatar?: string
  cover?: string
  briefDesc?: string
  alias?: string[]
  musicSize?: number
  albumSize?: number
  mvSize?: number
  fansCount?: number
}

/** 音频加载进度(主进程 → 渲染层) */
export interface AudioLoadProgress {
  /** 音源解析中(URL 获取) */
  stage: 'resolving' | 'downloading' | 'done'
  /** 已下载字节(仅 downloading 阶段) */
  received?: number
  /** 总字节(未知时为 0) */
  total?: number
}

/** 更新信息(GitHub release) */
export interface UpdateInfo {
  version: string
  url: string
  notes: string
  publishedAt?: string
}

/**
 * 更新检查结果(三态):
 * - update:发现更高版本,info 为版本详情(渲染层弹更新窗口)
 * - latest:已是最新(渲染层右下角提示)
 * - error:检查失败(网络/接口异常,渲染层如实提示失败原因)
 */
export type UpdateCheckResult =
  | { status: 'update'; info: UpdateInfo }
  | { status: 'latest'; version: string }
  | { status: 'error'; message: string }

/** 悬浮歌词窗状态载荷(主窗口渲染层 → 悬浮窗) */
export interface FloatLyricState {
  hasCurrent: boolean
  title: string
  artist: string
  playing: boolean
  /** 音源加载中(小窗播放键禁用) */
  loading: boolean
  /** 当前歌词行文本(前奏时为空) */
  lineText: string
  /** 当前行逐字时间(ms,与 lineText 等长):小窗逐字上色(已唱=金/未唱=蓝) */
  charTimes?: number[] | null
  /** 当前行起止(ms):逐字推进窗口 */
  lineStartMs?: number
  lineEndMs?: number
  /** 当前行翻译(双语显示;无翻译时为空) */
  transText?: string
  /** 下一句歌词(无翻译时作为预告行) */
  nextText: string
  lineIndex: number
  lineCount: number
  /** 推送时的播放位置(ms,已含提前量;悬浮窗按 pushedAt 自行插值) */
  posMs?: number
  /** 推送时刻(Date.now()):悬浮窗据此平滑插值,避免 400ms 一跳 */
  pushedAt?: number
  /** 播放倍速(插值用) */
  rate?: number
  /** 静音态(小窗静音按钮图标) */
  muted?: boolean
  /** 悬浮窗已锁定(锁定后鼠标穿透/不可拖动) */
  locked?: boolean
  /** 字号缩放(设置项 floatFontScale) */
  fontScale?: number
  /** 显示翻译行 */
  showTrans?: boolean
  /** 翻译缺失时用下一句占位 */
  showNextLine?: boolean
  dark: boolean
  accent: string
}

/** 悬浮歌词窗 → 主窗口的控制指令 */
export type FloatControlCmd =
  | 'toggle'
  | 'prev'
  | 'next'
  | 'hide'
  /** 静音开关 */
  | 'mute'
  /** 上一句 / 下一句歌词(定位到该句起始) */
  | 'prevLine'
  | 'nextLine'
  /** 锁定/解锁悬浮窗(锁定后鼠标穿透,避免挡操作) */
  | 'lock'
  /** 从悬浮窗唤起主窗口 */
  | 'openMain'

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
  /** 翻译行(网易云 tlyric,按时间对齐;悬浮歌词窗双语显示) */
  trans?: string
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
export type CommentPlatform = 'bilibili' | 'netease' | 'qq'

export interface NeteasePlaylistBrief {
  id: number
  name: string
  coverUrl?: string
  count: number
  creator: string
  /** 播放量(搜索接口返回) */
  playCount?: number
  /** 收藏数(搜索接口 bookCount:收藏该歌单的人数) */
  favCount?: number
}

export interface NeteaseArtistBrief {
  id: number
  name: string
  avatar?: string
  musicCount?: number
}

/** 平台歌单简要信息(QQ音乐 / 酷狗 搜索结果) */
export interface SourcePlaylistBrief {
  /** 远端歌单 id(QQ=disstid,酷狗=specialid) */
  id: string
  name: string
  coverUrl?: string
  /** 歌曲数 */
  count: number
  creator?: string
  /** 播放量(平台提供时) */
  playCount?: number
  /** 收藏数(平台提供时) */
  favCount?: number
}

/** 平台歌手简要信息(QQ音乐 / 酷狗 搜索结果) */
export interface SourceArtistBrief {
  /** QQ=歌手 mid,酷狗=singerid */
  id: string
  name: string
  avatar?: string
  musicCount?: number
}

/** 平台歌单详情(预览/导入用) */
export interface SourcePlaylistDetail {
  name: string
  coverUrl?: string
  description?: string
  creator?: string
  playCount?: number
  favCount?: number
  songs: Song[]
}

/** 进度条高潮点(点标记;进度条上以圆点呈现) */
export interface HighlightPoint {
  /** 高潮起始毫秒(进度条上圆点位置) */
  timeMs: number
  /** 数据来源 */
  kind?: 'climax' | 'chorus'
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
  /** 按歌手名解析网易云歌手 id(全屏播放页点歌手名打开主页) */
  neteaseFindArtist(name: string): Promise<ApiResponse<number | null>>
  neteaseArtistSongs(artistId: number): Promise<ApiResponse<Song[]>>
  neteasePlaylistSongs(id: number): Promise<ApiResponse<Song[]>>
  neteasePersonalized(): Promise<ApiResponse<NeteasePlaylistBrief[]>>
  /** QQ音乐搜索 */
  qqSearch(keyword: string, page: number): Promise<ApiResponse<Song[]>>
  /** QQ音乐歌单搜索 */
  qqSearchPlaylists(keyword: string, page: number): Promise<ApiResponse<SourcePlaylistBrief[]>>
  /** QQ音乐歌手搜索 */
  qqSearchArtists(keyword: string, page: number): Promise<ApiResponse<SourceArtistBrief[]>>
  /** QQ音乐歌手热门歌曲(artistId = 歌手 mid) */
  qqArtistSongs(artistId: string): Promise<ApiResponse<Song[]>>
  /** 酷狗搜索 */
  kugouSearch(keyword: string, page: number): Promise<ApiResponse<Song[]>>
  /** 酷狗歌单搜索 */
  kugouSearchPlaylists(keyword: string, page: number): Promise<ApiResponse<SourcePlaylistBrief[]>>
  /** 酷狗歌手搜索 */
  kugouSearchArtists(keyword: string, page: number): Promise<ApiResponse<SourceArtistBrief[]>>
  /** 酷狗歌手热门歌曲(artistId = singerid) */
  kugouArtistSongs(artistId: string): Promise<ApiResponse<Song[]>>
  /** 平台歌单详情(QQ音乐 dissid / 酷狗 specialid) */
  sourcePlaylistSongs(
    platform: 'qq' | 'kugou',
    id: string
  ): Promise<ApiResponse<SourcePlaylistDetail>>
  /** 把平台歌单导入为本地歌单 */
  libraryImportSourcePlaylist(
    platform: 'qq' | 'kugou',
    id: string,
    name?: string
  ): Promise<ApiResponse<{ id: string; name: string; count: number }>>
  /** 进度条高潮点:酷狗原生 climax_info(无则为 null,渲染层回退歌词副歌检测) */
  songClimax(song: Song): Promise<HighlightPoint[] | null>
  /** 网易云歌单元信息(描述/播放量/创建时间等) */
  neteasePlaylistMeta(id: number): Promise<ApiResponse<NeteasePlaylistMeta>>
  /** 网易云歌手详情(简介/粉丝数等) */
  neteaseArtistDetail(id: number): Promise<ApiResponse<NeteaseArtistDetail>>
  // 播放
  audioPrepare(song: Song, html5Fallback?: boolean): Promise<PreparedAudio>
  /** 音频加载进度(主进程推送,stage=resolving/downloading/done) */
  onAudioProgress(cb: (p: AudioLoadProgress) => void): () => void
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
  /** Cookie 登录:B站 Cookie 字符串(SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx) */
  biliCookieLogin(cookie: string): Promise<{ ok: boolean; message: string }>
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
  /** 检查 GitHub release 版本(返回三态:有更新 / 已最新 / 检查失败) */
  checkUpdate(): Promise<UpdateCheckResult>
  /** 主进程推送"发现新版本"(启动自动检查命中时) */
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void
  /** 主进程推送"已是最新版本"(每次启动检查后右下角提示) */
  onUpdateLatest(cb: (version: string) => void): () => void
  windowMinimize(): void
  windowMaximizeToggle(): void
  windowClose(): void
  /** 关闭窗口询问:主进程推送,渲染层弹窗让用户选择(后台运行/直接退出) */
  onWindowCloseAsk(cb: () => void): () => void
  /** 用户对关闭询问的决定:tray=后台运行 quit=直接退出 cancel=取消 */
  windowCloseDecide(action: 'tray' | 'quit' | 'cancel'): Promise<void>
  /** 主进程推送事件 */
  onDlUpdate(cb: (record: DownloadRecord) => void): () => void
  // 悬浮歌词窗
  /** 创建/销毁悬浮歌词窗 */
  floatShow(show: boolean): Promise<boolean>
  /** 悬浮窗接收"鼠标是否在窗口内"(主进程轮询;拖动区收不到 mousemove) */
  onFloatHover(cb: (inside: boolean) => void): () => void
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
  /** 缩放手柄拖动结果(主进程夹到工作区并落盘) */
  floatSetBounds(b: { x: number; y: number; width: number; height: number }): void
  /** 歌词过长时请求加宽窗口(null=恢复基准宽度) */
  floatFitWidth(needed: number | null): void
  /** 恢复悬浮窗默认位置/尺寸 */
  floatResetBounds(): Promise<void>
  /** 打开/关闭悬浮窗设置菜单 */
  floatMenuOpen(): void
  floatMenuClose(): void
  /** 菜单窗口读取当前悬浮窗设置 */
  floatMenuGet(): Promise<FloatMenuState>
  /** 菜单窗接收主进程回推的最新设置(改完后菜单立即刷新) */
  onFloatMenuState(cb: (s: FloatMenuState) => void): () => void
  /** 菜单内修改设置(主窗口统一落盘) */
  floatMenuSet(key: string, value: unknown): void
  /** 主窗口接收菜单设置变更 */
  onFloatMenuSet(cb: (p: { key: string; value: unknown }) => void): () => void
  // ===== 听歌识别 =====
  /** 枚举可捕获系统音频的桌面源(Windows loopback) */
  desktopSources(): Promise<{ id: string; name: string }[]>
  /** 发起识别:WAV 字节 → 歌名/歌手(未配置 token 时抛可读错误) */
  recognizeAudio(wav: ArrayBuffer): Promise<RecognizedSong>
  /** AudD API token 读写(设置页) */
  getRecognizeToken(): Promise<string>
  setRecognizeToken(token: string): Promise<void>
}

/** 听歌识别结果 */
export interface RecognizedSong {
  title: string
  artist: string
  album?: string
  provider: 'audd'
}

/** 悬浮窗设置菜单读取的状态 */
export interface FloatMenuState {
  fontScale: number
  showTrans: boolean
  showNextLine: boolean
  locked: boolean
  /** 当前曲目名(菜单顶部展示,可为空) */
  title: string
}
