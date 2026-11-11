/** 全局共享类型 - 主进程与渲染进程共用 */

export type MusicSource = 'BILIBILI' | 'NETEASE' | 'LOCAL' | 'QQMUSIC' | 'KUGOU' | 'QISHUI'

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
  /** 汽水音乐 track id(64 位数字字符串) */
  qishuiId?: string
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
  /** QQ 音乐歌单 dissid(导入后可同步) */
  qqPlaylistId?: number | null
  /** 酷狗歌单 id(specialid 数字或概念版 collection_x_x_x,导入后可同步) */
  kugouPlaylistId?: string | null
  favoriteFolderName?: string | null
  neteasePlaylistId?: number | null
  /** 汽水音乐歌单 id(导入后可同步) */
  qishuiPlaylistId?: string | null
  /** B站播放记录歌单(可同步) */
  biliHistory?: boolean
  /** 上次同步拉到的歌曲 id 快照:下次同步据此算增删,并保护手动加入的歌曲 */
  syncedIds?: string[]
  /**
   * 通用来源标记(可选、向后兼容):导入入口统一写入,按(来源 platform + 来源 id)查重防重复导入。
   * platform 取 'netease' | 'qq' | 'kugou' | 'kugou-concept' | 'bili' 等;
   * 旧歌单无此字段,查重回退到上面各平台专用 id 字段或「名称完全相同 + 来源相同」。
   */
  sourcePlatform?: string | null
  sourceId?: string | null
  /** 在歌单列表中隐藏(不删除,可在「显示设置」里恢复) */
  hidden?: boolean
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
  /**
   * 动效强度:
   * - 'full' 完整(默认):全部动效,含模糊与位移
   * - 'calm' 舒缓:去掉模糊、位移减半,适合低配机/晕动敏感
   * - 'off'  关闭:全局静止,零动画开销
   * 系统「减少动态效果」开启时,'full' 会自动按 'calm' 表现。
   */
  motionLevel: 'full' | 'calm' | 'off'
  /**
   * 动画速率倍率 0.5~2(1=标准)。
   * 同时缩放所有动效的时长与错开间隔;只改时间轴,不改位移/模糊幅度。
   */
  motionSpeed: number
  /**
   * 分通道速率微调(各自 0.5~2,1=跟随全局)。
   * 与 motionSpeed 相乘:最终时长 = 基准 × 档位 ÷ motionSpeed ÷ 通道值。
   * - list:    列表单项入场时长
   * - stagger: 相邻项错开间隔
   * - page:    页面切换(进+出)
   * - hover:   悬停/按压反馈
   * - cover:   封面渐显
   * - meta:    歌单信息(简介/播放量等)迟到到达时的入场与下方内容位移
   */
  motionFine: {
    list: number
    stagger: number
    page: number
    hover: number
    cover: number
    meta: number
  }
  /**
   * 播放条外观:
   * - 'island'  悬浮岛(默认):两侧留白 + 圆角 + 阴影
   * - 'classic' 经典通栏:顶边一条细分隔线,贴满窗口宽度
   */
  playerBarStyle: 'island' | 'classic'
  /** 歌词偏移 ms,正值=歌词提前 */
  lyricOffsetMs: number
  /** 歌词对齐:居中 / 靠左(手机端样式) */
  lyricAlign: 'center' | 'left'
  /** 播放倍速 */
  playbackRate: number
  /** 音调(半音,-12~+12;0=原调。与倍速独立,改调不变速) */
  pitchSemitones: number
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
  /** ===== 歌词翻译(全屏播放页) ===== */
  /**
   * 歌词显示模式:
   * - 'off'       仅原文
   * - 'both'      原文 + 翻译
   * - 'transOnly' 仅翻译(无译文的行回退显示原文,不留空行)
   */
  lyricTransMode: 'off' | 'both' | 'transOnly'
  /** 译文相对原文字号的比例 0.5~1(1=与原文同大) */
  lyricTransScale: number
  /** 译文不透明度 0.3~1 */
  lyricTransAlpha: number
  /** 译文排版:原文下方 / 原文右侧同行 */
  lyricTransLayout: 'below' | 'inline'
  /** ===== 全屏歌词「文字PV」样式(参考 pv.pixjam.cn / folia) ===== */
  /**
   * 歌词视觉样式:
   * - 'classic' 经典滚动列表(KTV 逐字上色,原有样式,默认)
   * - 'pv'      文字PV:当前句大字号居中 + 逐字入场动效 + 装饰排版,整屏只留当前句
   */
  lyricStyle: 'classic' | 'pv'
  /**
   * PV 舞台的排布样式(对齐 folia 的多种歌词样式):
   * - 'pv'       逐字 PV(默认:词块排版 + 6 套镜头版式)
   * - 'partita'  云阶:整行切成词块,按字数分 1~5 栏竖直排布
   * - 'claddagh' 回环:整行沿圆弧排布,字随切线旋转
   * - 'still'    时计:静态三行(上一句/当前句/下一句)
   */
  pvArrange: 'pv' | 'partita' | 'claddagh' | 'still' | 'tempera' | 'jizura' | string
  /** 歌词舞台隐现(流光)背景 */
  latentBackground?: boolean
  /** 歌单列表中隐藏的平台(其导入歌单与在线入口一并隐藏;空 = 全部显示) */
  hiddenPlaylistPlatforms?: ('netease' | 'bili' | 'qq' | 'kugou' | 'qishui')[]
  /** 全屏播放底图:本地图片绝对路径(空 = 未设置) */
  customBgImage?: string
  /** 全屏播放底图启用开关 */
  customBgEnabled?: boolean
  /** 全屏播放底图暗化程度(0-80,百分比) */
  customBgDim?: number
  /** 界面底图:主窗口背景图片绝对路径(空 = 未设置) */
  uiBgImage?: string
  /** 界面底图启用开关 */
  uiBgEnabled?: boolean
  /** 界面底图暗化程度(0-80,百分比) */
  uiBgDim?: number
  /** 全屏底图高斯模糊(0-40,px) */
  customBgBlur?: number
  /** 界面底图高斯模糊(0-40,px) */
  uiBgBlur?: number
  /** 上传播放记录到网易云(歌曲播到 ≥30s 打卡) */
  scrobbleNetease?: boolean
  /** 上传播放记录到QQ音乐 */
  scrobbleQQ?: boolean
  /** 上传播放记录到B站(观看历史) */
  scrobbleBili?: boolean
  /** PV 逐字入场动效 */
  pvAnim: 'pop' | 'rise' | 'slam' | 'wave' | 'typewriter'
  /** PV 版式:自动(按句语义/种子轮转)或指定某套排版 */
  pvLayout: 'auto' | 'type-impact' | 'editorial-column' | 'fragment-collage' | 'tracking-ribbon' | 'mask-reveal' | 'quiet-tableau'
  /** PV 主色(空=跟随主题强调色) */
  pvAccent: string
  /** PV 字号缩放 0.7~1.6 */
  pvScale: number
  /** PV 装饰层:关闭后只剩文字(背景动效/装饰线全关) */
  pvDecor: boolean
  /** PV 运动强度 0~2(0=静止,1=正常) */
  pvMotion: number
  /** ===== 凝彩舞台细化选项(对齐听屿设置面板) ===== */
  /** 色块场景:关闭后不渲染构图色块(只留纸面与文字) */
  pvBlockScenes: boolean
  /** 边角线框:四角 L 形角标 */
  pvFrame: boolean
  /** 文字动态反色(差分反相);关闭后文字用固定墨色 */
  pvInvertText: boolean
  /** 场景转场(句间交接运镜);关闭后直接切换 */
  pvTransition: boolean
  /** 纹理分辨率 0.5~4(纸面网点密度,越高越细、越吃 GPU) */
  pvTexture: number
  /** 镜头运动强度 0~2 */
  pvCameraMotion: number
  /** 逐字动势 0~2(单字入场位移/旋转幅度) */
  pvCharMotion: number
  /** 逐字入场时序 0.25~2(1=默认;越大入场窗口越长、越舒缓) */
  pvCharTiming: number
  /** 镜头平移 0~2 */
  pvPan: number
  /** 歌词远近 0.25~2(1=默认;>1 更近/放大) */
  pvZoom: number
  /** 色彩模式:主题双色 / 黑白灰 / 封面渐变 */
  pvColorMode: 'theme' | 'mono' | 'cover'
  /** 整体后处理滤镜总开关 */
  pvPost: boolean
  /** 胶片颗粒 0~1 */
  pvGrain: number
  /** 对比度增强 0~1 */
  pvContrast: number
  /** RGB 色差 0~1 */
  pvRgbShift: number
  /** 暗角 0~1 */
  pvVignette: number
  /** 透镜扭曲 0~1 */
  pvLens: number
  /** 整句显示歌词(整句同时入场,不做逐字卡拉OK时序) */
  pvWholeLine: boolean
  /** 尾字强调概率 0~1(句尾 1~2 字/词甩到新行放大;0=关闭) */
  pvTailEmphasis: number
  /** 凝彩画面横向平移 -0.5~0.5(占宽度比例;正=向右) */
  pvOffsetX: number
  /** 凝彩画面纵向平移 -0.25~0.5(内部实际值,占高度比例;正=向下;0.11=构图正常位,UI 显示值=此值-0.11) */
  pvOffsetY: number
  /** 凝彩逐字入场:classic=原版7种(默认) / jizura=JIZURA9种 / mixed=全部 / 或某个具体样式名 */
  pvTemperaEnter: string
  /** JIZURA 舞台 mood(glitch/calm/pop/graphic/editorial/emotional…;'auto'=按种子自动) */
  pvJizuraMood: string
  /** JIZURA 舞台 style(如 'noir';'auto'=自动) */
  pvJizuraStyle: string
  /** 搜索默认音源 */
  defaultSearchSource: 'netease' | 'bili' | 'qq' | 'kugou'
  /** 网易云无音源时自动到 B站/QQ/酷狗搜索垫底 */
  neteaseFallback: boolean
  /** 已忽略更新的版本号(启动检查到该版本不再提示) */
  skippedUpdateVersion?: string
  /** 听歌识别 AudD API Token(audd.io 免费注册;空=未配置识别服务) */
  songRecognizeToken?: string
  /** 听歌识别总开关:关闭后搜索页不显示「识曲」按钮(无需清空 Token) */
  songRecognizeEnabled: boolean
  /** 酷狗设备 MID(登录/签名用;首次启动生成并持久化) */
  kugouMid?: string
  /** ===== 轻提示(toast)外观 ===== */
  /** 出现位置:顶部居中滑下 / 右下角 / 顶部右侧;off=关闭所有轻提示 */
  toastPosition: 'top-center' | 'bottom-right' | 'top-right' | 'off'
  /** 停留时长倍数 0.5~2(1=默认:成功 2.2s / 信息 2.6s / 错误 4.2s) */
  toastDuration: number
  /** 视觉样式:HUD 玻璃 / 极简线条 / 实心高对比 */
  toastStyle: 'hud' | 'minimal' | 'solid'
  /** 是否显示意图图标 */
  toastShowIcon: boolean
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
  uid: number | string
  nickname: string
  avatar: string
  extra?: string
}

/** 酷狗登录凭据(token+userid 最小可用集;vip 字段登录响应携带时保存) */
export interface KugouCredential {
  token: string
  userid: string
  vipType?: string
  vipToken?: string
  /** 设备注册返回的 dfid(云歌单服务需要,与 token 一同保存) */
  dfid?: string
}

/** 酷狗身份区分:普通酷狗 与 酷狗概念版(两版 token 不通用,需分别扫码) */
export type KugouPlatform = 'normal' | 'concept'

/** 酷狗登录用户的在线歌单条目(歌单页自动列出,点卡片导入) */
export interface KugouUserPlaylistBrief {
  /** global_collection_id(概念/新版)或 specialid(老版自建) */
  id: string
  name: string
  coverUrl?: string
  count: number
  platform: KugouPlatform
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
  qishuiProfile?: UserProfile | null
  qqProfile?: UserProfile | null
  kugouProfile?: UserProfile | null
  kugouConceptProfile?: UserProfile | null
  /** 听歌时长统计(date=自然日,跨天加载时 todayMs 清零、累计保留) */
  listenStats?: ListenStats
  /** 收藏的歌曲 id(我的收藏,按收藏时间倒序由 favoriteIds 顺序表达) */
  favoriteIds?: string[]
  /** 上次播放会话(重启后恢复当前歌曲与进度;暂停状态,点播放才取流) */
  resumePlayback?: PlaybackResume | null
  /** 每首歌的歌词偏移记忆(songId → ms,正值=歌词提前;優先于全局 lyricOffsetMs) */
  lyricOffsets?: Record<string, number>
  /** 全局偏移方向语义翻转(正值改为提前)时的一次性迁移标记(用于取反旧值) */
  lyricOffsetSignMigrated?: boolean
}

/** 重启恢复用的播放会话快照 */
export interface PlaybackResume {
  queue: Song[]
  queueIndex: number
  /** 上次停留位置(秒) */
  pos: number
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
  /** 试听片段(VIP/付费歌):渲染层应跨平台兜底换完整音源,而不是播 20s 就跳走 */
  preview?: boolean
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
  /** 歌词来源:qq = QQ 音乐原生 QRC(逐字);qishui = 汽水原生逐字 */
  provider: 'bilibili' | 'netease' | 'qq' | 'qishui' | 'none'
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
  /** 聚合模式下来源平台(单平台模式可不带) */
  platform?: CommentPlatform
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

/** 歌手主页数据来源平台(歌手主页顶部标识用) */
export type ArtistPlatform = 'netease' | 'qq' | 'kugou' | 'qishui' | 'bilibili'

/** 跨平台统一的歌手主页数据(各平台字段稀疏,缺失即不显示) */
export interface UnifiedArtistDetail {
  /** 平台 */
  platform: ArtistPlatform
  /** 平台内歌手 id(网易云数字 id;QQ mid;酷狗 singerid;汽水 id) */
  id: string
  name: string
  avatar?: string
  /** 别名/英文名 */
  alias?: string[]
  /** 简介 */
  briefDesc?: string
  /** 歌曲数 */
  musicCount?: number
  /** 专辑数 */
  albumSize?: number
  /** MV 数 */
  mvSize?: number
  /** 粉丝数 */
  fansCount?: number
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

/** 单平台热度/收藏数据 */
export interface PlatformHot {
  platform: 'kugou' | 'qq' | 'netease'
  /** favorite=真实收藏数(酷狗 OwnerCount);heat=平台热度指数 */
  metric: 'favorite' | 'heat'
  value: number
  /** 匹配到的歌曲标题 */
  title: string
}

/** 全网热度聚合结果 */
export interface SongHotResult {
  items: PlatformHot[]
  errors: { platform: string; message: string }[]
}

/** 排行榜所属平台(与 MusicSource 的子集一致,便于取流/标识复用) */
export type ChartPlatform = 'netease' | 'qq' | 'kugou' | 'bilibili'

/** 榜单分组(QQ 的巅峰榜/地区榜/特色榜/全球榜;其余平台为空) */
export interface ChartGroup {
  /** 分组名(无分组时为空字符串) */
  name: string
  charts: ChartBrief[]
}

/** 榜单简要信息(左侧/顶部的榜单列表项) */
export interface ChartBrief {
  /** 平台内榜单 id(网易云=toplist id,QQ=topId,酷狗=rankid,B站=rid) */
  id: string
  name: string
  /** 榜单封面(平台提供时;网易云/QQ 有,酷狗/B站无) */
  coverUrl?: string
  /** 更新时间文案(平台提供时,如 "每天更新") */
  updateTip?: string
  /** 榜单简介(平台提供时) */
  intro?: string
}

/** 榜单详情(选中某榜单后的曲目列表) */
export interface ChartDetail {
  id: string
  name: string
  platform: ChartPlatform
  coverUrl?: string
  updateTip?: string
  /** 榜单简介 */
  intro?: string
  songs: Song[]
  /** 平台声明的总曲目数(可能 > songs.length) */
  total?: number
}

/** 某平台的榜单目录(按分组组织;无分组的平台只有一组,组名为空) */
export interface ChartCatalog {
  platform: ChartPlatform
  /** 平台中文名,用于界面标题 */
  label: string
  groups: ChartGroup[]
  /** 该平台榜单目录获取失败时的原因(此时 groups 为空) */
  error?: string
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
  /** 搜索推荐(输入联想):bili 用站内建议词,netease/qq 用各自联想接口 */
  searchSuggest(source: 'bili' | 'netease' | 'qq' | 'kugou' | 'qishui', keyword: string): Promise<string[]>
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
  /** 全网热度聚合:酷狗真实收藏数 + QQ/网易云热度指数 */
  songHot(song: Song): Promise<ApiResponse<SongHotResult>>
  /** ===== 排行榜 ===== */
  /** 某平台的榜单目录(分组 + 榜单列表) */
  chartCatalog(platform: ChartPlatform): Promise<ApiResponse<ChartCatalog>>
  /** 榜单曲目 */
  chartSongs(platform: ChartPlatform, chartId: string): Promise<ApiResponse<ChartDetail>>
  /** 网易云歌单元信息(描述/播放量/创建时间等) */
  neteasePlaylistMeta(id: number): Promise<ApiResponse<NeteasePlaylistMeta>>
  /** 网易云歌手详情(简介/粉丝数等) */
  neteaseArtistDetail(id: number): Promise<ApiResponse<NeteaseArtistDetail>>
  /** 跨平台歌手详情(统一模型;各平台字段稀疏,缺失即不显示) */
  /** 按歌手名跨平台找人(返回即被单击实体的平台+id) */
  findArtist(name: string): Promise<ApiResponse<{ platform: ArtistPlatform; id: string }>>
  artistDetail(platform: ArtistPlatform, id: string): Promise<ApiResponse<UnifiedArtistDetail>>
  /** 跨平台歌手热门歌曲 */
  artistSongs(platform: ArtistPlatform, id: string): Promise<ApiResponse<Song[]>>
  // 播放
  audioPrepare(song: Song, html5Fallback?: boolean): Promise<PreparedAudio>
  /** 音频加载进度(主进程推送,stage=resolving/downloading/done) */
  onAudioProgress(cb: (p: AudioLoadProgress) => void): () => void
  lyricsGet(song: Song): Promise<LyricsResult>
  /** 记住某首歌的歌词偏移(ms,正值=提前;删掉传 0 会存 0,传 null 清除记忆) */
  lyricSetOffset(songId: string, ms: number | null): Promise<boolean>
  pagesGet(bvid: string): Promise<BiliPage[]>
  commentsGet(
    song: Song,
    offset: number,
    order?: CommentOrder,
    platform?: CommentPlatform,
    /** 聚合模式:多平台评论区合并(按时间/热度混排,带平台标记) */
    aggregate?: boolean
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
  libraryUpdatePlaylist(p: Pick<Playlist, 'id' | 'name' | 'description'> & { hidden?: boolean }): Promise<void>
  libraryAddToPlaylist(playlistId: string, songs: Song[]): Promise<Playlist[]>
  libraryRemoveFromPlaylist(playlistId: string, songId: string): Promise<Playlist[]>
  libraryAddRecent(song: Song): Promise<void>
  libraryClearRecent(): Promise<void>
  /** 保存上次播放会话(切歌立即存,播放中节流 5s;null=清除) */
  playbackSaveResume(r: PlaybackResume | null): void
  /** 切换收藏(加入/取消),返回最新收藏 id 列表 */
  libraryToggleFavorite(song: Song): Promise<{ favorited: boolean; favoriteIds: string[] }>
  /** 收藏的歌曲(按收藏时间倒序) */
  libraryGetFavorites(): Promise<Song[]>
  /** 去掉收藏里的重复曲目(旧版换源改 id 造成);按标题+歌手归并 */
  libraryDedupeFavorites(): Promise<{ removed: number; total: number }>
  libraryAddSearchHistory(q: string): Promise<void>
  libraryRemoveSearchHistory(q: string): Promise<void>
  libraryClearSearchHistory(): Promise<void>
  librarySetSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings>
  /** 恢复默认设置(保留登录态/曲库/引导标记),返回重置后的 Settings;传入分区名数组时只重置这些分区 */
  libraryResetSettings(sections?: string[]): Promise<Settings>
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
  /** QQ 音乐登录用户的歌单列表(自建+收藏,需登录) */
  qqUserPlaylists(): Promise<ApiResponse<{ id: number; name: string; coverUrl?: string; count: number }[]>>
  qqImportPlaylist(id: number, name: string): Promise<Playlist | null>
  /** 导入B站播放记录为歌单 */
  biliImportHistory(): Promise<ApiResponse<{ id: string; count: number }>>
  /** 上传播放记录到网易云(歌曲实际播放 ≥30s 后调用) */
  neteaseScrobble(songId: number, seconds: number): Promise<ApiResponse<{ ok: boolean; code?: number; error?: string }>>
  /** 上传播放记录到B站观看历史 */
  biliReportWatch(bvid: string, cid: number, seconds: number): Promise<ApiResponse<{ ok: boolean; code?: number; error?: string }>>
  /** 上传播放记录到QQ音乐(最近播放) */
  qqReportRecently(songId: number): Promise<ApiResponse<{ ok: boolean; code?: number; error?: string }>>
  /** QQ音乐最近播放(网页端 GetRecentPlayList) */
  qqRecentPlay(): Promise<ApiResponse<{ ok: boolean; notLoggedIn?: boolean; songs: Song[]; error?: string }>>
  /** 汽水音乐:白名单操作透传(登录/二维码/点赞等) */
  qishuiRequest<T = unknown>(operation: string, params?: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }>
  /** 汽水音乐搜索 */
  qishuiSearch(keyword: string, limit?: number): Promise<ApiResponse<Song[]>>
  /** 汽水音乐歌单曲目(分页) */
  qishuiPlaylistTracks(id: string, limit?: number, offset?: number, ownerId?: string): Promise<ApiResponse<{ songs: Song[]; hasMore: boolean }>>
  /** 汽水音乐当前登录账号(未登录为 null) */
  qishuiAccount(): Promise<ApiResponse<{ userId: string; nickname: string; avatar: string } | null>>
  /** 汽水音乐退出登录 */
  qishuiLogout(): Promise<boolean>
  /** 汽水音乐用户歌单列表 */
  qishuiUserPlaylists(): Promise<ApiResponse<{ id: string; name: string; coverUrl?: string; count: number }[]>>
  /** 导入汽水歌单为本地歌单(可同步) */
  qishuiImportPlaylist(id: string, name: string): Promise<ApiResponse<Playlist | null>>
  /** 网易云云端播放记录(听歌排行) */
  neteasePlayRecord(): Promise<ApiResponse<{ songs: Song[]; notLoggedIn: boolean; error?: string }>>
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
  /** 打开内嵌网易云网页登录窗口(扫码/验证码/密码全由官方页面处理),登录成功自动回填 */
  neteaseWebLogin(): Promise<{ ok: boolean; message: string }>
  neteaseQRStart(): Promise<{ imageDataUrl: string; key: string } | null>
  neteaseQRPoll(key: string): Promise<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>
  neteaseSendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>
  neteaseLoginCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>
  neteaseLoginPassword(phone: string, password: string): Promise<{ ok: boolean; message: string }>
  neteaseLogout(): Promise<void>
  /** QQ 音乐:打开内嵌官方授权页(快速登录/扫码),登录后自动 harvest qm_keyst;kind=wx 走微信 OAuth */
  qqWebLogin(kind?: 'qq' | 'wx'): Promise<{ ok: boolean; message: string }>
  qqLogout(): Promise<void>
  /** 酷狗扫码登录:获取二维码(platform 区分普通酷狗/酷狗概念版) */
  kugouQRStart(platform: KugouPlatform): Promise<{ imageDataUrl: string; key: string } | null>
  kugouQRPoll(
    platform: KugouPlatform,
    key: string
  ): Promise<{ status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'; message: string }>
  kugouLogout(platform: KugouPlatform): Promise<void>
  /** 酷狗登录用户的在线歌单(自动列出) */
  kugouUserPlaylists(platform: KugouPlatform): Promise<ApiResponse<KugouUserPlaylistBrief[]>>
  /** 导入酷狗歌单(collection_ 前缀走概念版接口,其余按 specialid) */
  kugouImportPlaylist(platform: KugouPlatform, id: string, name: string): Promise<Playlist | null>
  // 下载
  downloadAdd(songs: Song[]): Promise<void>
  downloadCancel(id: string): Promise<void>
  /** 删除单条下载记录(完成/失败后) */
  downloadRemoveRecord(id: string): Promise<void>
  downloadClear(failedOnly?: boolean): Promise<void>
  downloadOpenDir(): Promise<void>
  downloadChooseDir(): Promise<string | null>
  /** 自定义底图:弹系统文件选择框选图片,返回绝对路径(取消返回 null);路径已登记进本地白名单 */
  settingsPickImage(): Promise<string | null>
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
  /** 全屏切换(PV 舞台 F11 / 按钮):返回切换后的状态 */
  windowToggleFullscreen(): Promise<boolean>
  windowIsFullscreen(): Promise<boolean>
  windowSetFullscreen(on: boolean): Promise<boolean>
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
  // ===== 快捷方式伪装 =====
  /** 可用伪装目标(含本机是否装了真程序 → 图标来源) */
  disguisePresets(): Promise<DisguisePresetInfo[]>
  /** 预设图标 data URL,设置页预览用 */
  disguisePresetIcon(id: string): Promise<string>
  /** 在桌面生成快捷方式(双击后启动的仍是本应用) */
  disguiseCreate(
    presetId: string,
    customName?: string
  ): Promise<{ ok: boolean; path?: string; error?: string }>
}

/** 快捷方式伪装目标(主进程 → 渲染层) */
export interface DisguisePresetInfo {
  id: string
  name: string
  description: string
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
