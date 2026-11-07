/** 播放器 + 全局状态(zustand) */
import { create } from 'zustand'
import type {
  AudioLoadProgress,
  HighlightPoint,
  Library,
  LyricsResult,
  Song,
  Settings,
  UpdateInfo
} from '@shared/types'
import { api } from './lib/api'
import { detectChorus } from './lib/chorus'
import { toast, toastError } from './lib/toast'

export type PlayMode = 'loop' | 'shuffle' | 'single'
export type PageKey =
  | 'search'
  | 'playlists'
  | 'downloads'
  | 'settings'
  | 'recent'
  | 'favorites'
  | 'charts'
  | 'recognize'
/** 全局共享弹窗(全屏播放页与迷你播放条都能打开) */
export type DialogKey =
  | null
  | 'comments'
  | 'pages'
  | 'info'
  | 'lyricEdit'
  | 'lyricReplace'
  | 'lyricOffset'
  | 'queue'
  | 'eq'
  | 'source'
  | 'sleep'

/** 毫秒 → h:mm:ss / m:ss */
export function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

let audio: HTMLAudioElement | null = null
let audioContext: AudioContext | null = null
let eqNodes: BiquadFilterNode[] = []
let analyserNode: AnalyserNode | null = null
/** 变调节点:用 playbackRate 变速后,用 detune 把音高拉回目标半音 */
let pitchSource: AudioBufferSourceNode | null = null
let triedHtml5For: string | null = null
/** 最近一次播放位置(秒):突发中断重试时续播用(如流断了/超时,不能从头放) */
let lastKnownPos = 0
/** lastKnownPos 属于哪首歌:跨曲兜底时不能沿用上一首/上一次失败的位置 */
let lastKnownPosSongId: string | null = null
/** 播放记录上报:已打过卡的歌曲(每首歌每次播放只报一次,换歌自动重置) */
let scrobbledFor: string | null = null
/** 最近一次 timeupdate 时间戳 + 卡死恢复冷却(看门狗用) */
let lastTimeupdateAt = 0
let recoveringAt = 0
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null
let sleepFadeHandle: ReturnType<typeof setInterval> | null = null
let sleepFadeTimeout: ReturnType<typeof setTimeout> | null = null
let sleepOrigVolume = 1
let sleepFading = false
/** 最近一次非零音量(取消静音/拖回时恢复用) */
let lastVolume = 0.9
/** 频谱取样缓冲区(复用,避免每帧分配) */
let spectrumBuf: Uint8Array<ArrayBuffer> | null = null

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
  }
  return audio
}

/** 音频图:source → EQ链 → 频谱分析 → 喇叭(频谱可视化 + 均衡器共用) */
function ensureEqChain(settings: Settings): void {
  if (audioContext) {
    eqNodes.forEach((n, i) => {
      n.gain.value = settings.eqEnabled ? (settings.eqGains[i] ?? 0) : 0
    })
    return
  }
  try {
    const el = getAudio()
    const ctx = new AudioContext()
    const source = ctx.createMediaElementSource(el)
    const nodes = EQ_FREQS.map((freq, i) => {
      const node = ctx.createBiquadFilter()
      node.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking'
      node.frequency.value = freq
      node.Q.value = 1
      node.gain.value = settings.eqEnabled ? (settings.eqGains[i] ?? 0) : 0
      return node
    })
    let prev: AudioNode = source
    for (const node of nodes) {
      prev.connect(node)
      prev = node
    }
    // 频谱分析节点(全屏页可视化用),Analyser 是透传不影响音质
    const an = ctx.createAnalyser()
    an.fftSize = 256
    an.smoothingTimeConstant = 0.82
    prev.connect(an)
    an.connect(ctx.destination)
    // 全部成功才提交(避免半初始化导致永久无声)
    audioContext = ctx
    eqNodes = nodes
    analyserNode = an
  } catch (e) {
    console.warn('EQ init failed', e)
    audioContext = null
    eqNodes = []
    analyserNode = null
  }
}

/** 读取频谱数据(0..255),供可视化组件 rAF 轮询;无音频图时返回 null */
export function getSpectrum(): Uint8Array | null {
  if (!analyserNode) return null
  if (!spectrumBuf || spectrumBuf.length !== analyserNode.frequencyBinCount) {
    spectrumBuf = new Uint8Array(analyserNode.frequencyBinCount)
  }
  analyserNode.getByteFrequencyData(spectrumBuf)
  return spectrumBuf
}

interface PlayerState {
  library: Library | null
  page: PageKey
  /**
   * 跨页面传递的搜索关键词:识曲页拿到结果后写入并跳到搜索页,
   * 搜索页消费一次就清空(避免返回时又被旧词覆盖用户输入)。
   */
  pendingSearch: string | null
  // player
  queue: Song[]
  queueIndex: number
  current: Song | null
  playing: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  mode: PlayMode
  lyrics: LyricsResult | null
  nowPlayingOpen: boolean
  sleepTimerEnd: number | null
  /** 定时器已暂停 */
  sleepPaused: boolean
  /** 暂停时的剩余毫秒 */
  sleepRemainingMs: number
  /** 本次定时的总时长毫秒(圆环进度用) */
  sleepTotalMs: number
  /** 当前打开的共享弹窗 */
  activeDialog: DialogKey
  /** 弹窗目标歌曲:右键菜单等场景显式指定;空=用当前播放曲目 */
  dialogSong: Song | null
  /** 当前播放音质描述(如 极高 320k MP3 / 320k / 本地文件) */
  quality: string | null
  /** 音源加载进度(resolving/downloading/done;done 或空表示无进度可展示) */
  loadProgress: AudioLoadProgress | null
  /** 进度条高潮点标记(酷狗原生 climax / 歌词副歌推导) */
  highlights: HighlightPoint[]
  /** 当前打开的网易云歌手主页 id(独立页面,与歌单详情同构) */
  artistPageId: number | null
  /** 发现的新版本(启动自动检查/手动检查命中后弹窗) */
  updateInfo: UpdateInfo | null

  // actions
  init(): Promise<void>
  refreshLibrary(): Promise<void>
  setPage(p: PageKey): void
  /** 识曲页 → 搜索页:写入关键词并切页 */
  searchWithQuery(q: string): void
  /** 搜索页取走待搜索词(取后清空) */
  takePendingSearch(): string | null
  playQueue(songs: Song[], startIndex?: number): Promise<void>
  playSongNext(song: Song): void
  togglePlay(): void
  next(manual?: boolean): void
  prev(): void
  seek(t: number): void
  /** 设置音量;persist=true 时持久化(拖动过程传 false,松手传 true) */
  setVolume(v: number, persist?: boolean): void
  setMuted(m: boolean): void
  cycleMode(): void
  setNowPlayingOpen(open: boolean): void
  setLyrics(l: LyricsResult | null): void
  startSleepTimer(minutes: number): void
  /** 以毫秒启动定时(自定义时长/恢复) */
  startSleepTimerMs(ms: number): void
  /** 暂停定时 */
  pauseSleepTimer(): void
  /** 继续定时 */
  resumeSleepTimer(): void
  cancelSleepTimer(): void
  /** 打开/关闭共享弹窗 */
  setActiveDialog(d: DialogKey): void
  /** 打开针对某首歌的弹窗(右键详情/换源等);song 为 null 时回退当前播放 */
  openSongDialog(d: DialogKey, song: Song | null): void
  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  /** 恢复默认设置(保留登录态/曲库),返回重置后的 Settings;传分区名则只重置这些分区 */
  resetSettings(sections?: string[]): Promise<Settings>
  setPlaybackRate(rate: number): void
  /** 设置音调(半音,-12~+12);0=原调 */
  setPitch(semitones: number): void
  /** 升降 n 个半音 */
  stepPitch(delta: number): void
  playAt(index: number): void
  removeFromQueue(index: number): void
  clearQueue(): void
  /** 用一首歌替换队列当前曲目并播放(换源等场景) */
  replaceCurrentAndPlay(song: Song): Promise<void>
  /** 打开网易云歌手主页(独立页) */
  openArtistPage(id: number): void
  /** 关闭歌手主页 */
  closeArtistPage(): void
}

export const useStore = create<PlayerState>((set, get) => {
  /**
   * 重新计算进度条高潮点:
   * 酷狗原生 climax_info 优先;否则按歌词重复段(副歌)推导。
   * 统一取每段起点作为"点"标记。
   */
  const refreshHighlights = async (song: Song, lyrics: LyricsResult | null) => {
    let points: HighlightPoint[] = []
    if (song.kugouHash || song.source === 'KUGOU') {
      try {
        const native = await api.songClimax(song)
        if (native && native.length > 0) points = native
      } catch {
        /* 原生高潮点取不到就用歌词推导 */
      }
    }
    if (points.length === 0 && lyrics && lyrics.lines.length > 0) {
      points = detectChorus(lyrics.lines, song.duration)
    }
    if (get().current?.id === song.id) set({ highlights: points })
  }

  /**
   * 播放请求序号:每次开始播放 +1。
   * 异步取流返回后用「序号是否仍是最新」判断自己是否已被新请求抢占,
   * 被抢占了就静默退出,不再写 current/lyrics/播放状态。
   * 这样连点两首歌时,后一次点击立即生效,前一次的慢请求自动作废,
   * 不需要"加载中禁止点击"这种全局锁。
   *
   * 主进程侧另有一层取消:prepareAudio 收到新请求会 abort 旧的下载
   * (见 audio.ts 的 currentAbort),所以旧歌的大文件下载不会继续占用带宽。
   */
  let playSeq = 0
  /** 当前这次播放请求是否已被更新的请求取代 */
  const isStale = (seq: number): boolean => seq !== playSeq

  /** 上次播放会话落盘:切歌立即存,播放中每 5s 存一次进度(重启后恢复用) */
  let lastResumeSongId: string | null = null
  let lastResumeSaveAt = 0
  const saveResume = (force = false): void => {
    const { queue, queueIndex, current, position } = get()
    if (!current) return
    const now = Date.now()
    if (!force && current.id === lastResumeSongId && now - lastResumeSaveAt < 5000) return
    lastResumeSaveAt = now
    lastResumeSongId = current.id
    try {
      api.playbackSaveResume?.({ queue, queueIndex, pos: position || 0 })
    } catch {
      /* 会话落盘失败不影响播放 */
    }
  }

  /** 实际开始播放一首歌(html5Fallback=m4s 不支持时改用 mp4;resumeAt=续播位置秒) */
  const startPlayback = async (song: Song, html5Fallback = false, resumeAt = 0) => {
    const seq = ++playSeq
    const el = getAudio()
    // keepMeta 是一次性标记:本次播放保留原曲歌词,消费后失效(重播/落库不会误保留)
    const keepMeta = song.keepMeta === true
    if (keepMeta) song.keepMeta = false
    // 续播位置只对"同一首歌的再次尝试"有意义:换源/失败重试时那个不到 1 秒的位置
    // 会让进度条在 0 与断点之间反复横跳,VIP 歌曲尤其明显
    const resume = resumeAt > 3 ? resumeAt : 0
    const keepLyrics = keepMeta ? get().lyrics : null
    set({
      current: song,
      loading: true,
      lyrics: keepLyrics,
      position: resume,
      duration: song.duration,
      quality: null,
      highlights: [],
      loadProgress: { stage: 'resolving' }
    })
    saveResume(true)
    lastKnownPos = resume
    lastKnownPosSongId = song.id
    // 立即停掉上一首的音频:解析新音源(尤其换源要搜别的平台)期间,旧流仍在触发
    // timeupdate,会把新歌的进度位置反复写回旧位置 → 进度条横跳
    if (el.src) {
      try {
        el.pause()
      } catch {
        /* ignore */
      }
      el.removeAttribute('src')
      try {
        el.load()
      } catch {
        /* ignore */
      }
    }
    void refreshHighlights(song, keepLyrics)
    // VIP 歌曲且未登录网易云 → 直接走跨平台垫底,不浪费一次取流(设置可关:关=直接报错)
    const settings = get().library?.settings
    const fallbackEnabled = settings?.neteaseFallback !== false
    const neLogged = !!get().library?.neteaseProfile
    if (song.source === 'NETEASE' && song.vipOnly && !neLogged) {
      if (!fallbackEnabled) {
        set({ loading: false, loadProgress: null })
        toastError('无法播放', '网易云需要 VIP,且已关闭跨平台兜底(可在设置开启)')
        return
      }
      await fallbackToOther(song, '网易云需要 VIP,自动切换到其他音源')
      return
    }
    // 旧版 QQ/酷狗歌曲只存元数据(无平台 id):经跨平台搜索取流,保留原标题与歌词
    if (
      (song.source === 'QQMUSIC' && !song.qqMid) ||
      (song.source === 'KUGOU' && !song.kugouHash)
    ) {
      if (!fallbackEnabled) {
        set({ loading: false, loadProgress: null })
        toastError('无法播放', '该歌曲缺少平台音源信息,且已关闭跨平台兜底')
        return
      }
      const platform = song.source === 'QQMUSIC' ? 'QQ音乐' : '酷狗音乐'
      await fallbackToOther(song, `${platform}歌曲已通过其他平台搜索播放(保留原标题与歌词)`)
      return
    }
    try {
      const prepared = await api.audioPrepare(song, html5Fallback)
      // 已被更新的播放请求抢占:丢弃这次结果,什么都不写
      if (isStale(seq) || get().current?.id !== song.id) return
      // 试听片段(VIP/付费歌,登录后常见):播到 0:20 就触发 ended 跳下一首,
      // 与其放 20s 试听不如直接跨平台换完整音源(keepMeta 换源重放除外,防循环)
      if (
        prepared.preview &&
        !keepMeta &&
        fallbackEnabled &&
        (song.source === 'NETEASE' ||
          song.source === 'QQMUSIC' ||
          song.source === 'KUGOU' ||
          song.source === 'QISHUI')
      ) {
        await fallbackToOther(song, '网易云为试听片段,自动切换完整音源', resume)
        return
      }
      el.src = prepared.url
      const st = get().library?.settings
      // 音调优先:有升降调时用 tape 变速移调(关闭 pitch 保持),否则按倍速+保持音调
      const semi = st?.pitchSemitones ?? 0
      const baseRate = st?.playbackRate ?? 1
      el.playbackRate = semi !== 0 ? baseRate * Math.pow(2, semi / 12) : baseRate
      const pitch = semi !== 0 ? false : (st?.preservePitch ?? true)
      ;(el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = pitch
      ;(el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = pitch
      // 建立音频图(频谱可视化 + 均衡器)
      if (st) ensureEqChain(st)
      try {
        await el.play()
        // play() 是异步的:等它 resolve 期间用户可能已经点了下一首,需再判一次
        if (isStale(seq)) return
        // 续播:中断重试时回到中断位置,而不是从头开始
        if (resume > 1) {
          try {
            el.currentTime = Math.min(resume, isFinite(el.duration) && el.duration > 0 ? el.duration - 0.5 : resume)
          } catch {
            /* 直播流等不可 seek 时忽略 */
          }
        }
        set({ playing: true, loading: false, quality: prepared.quality ?? null, loadProgress: null })
        // AudioContext 恢复失败不能当作播放失败(resume 需用户手势,失败时静音但不报错)
        if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {})
        // 最近播放实时入库并刷新本地状态(keepMeta 播放由调用方记录原曲)
        if (!keepMeta) {
          api.libraryAddRecent(song)
            .then(() => get().refreshLibrary())
            .catch(() => {})
        }
        updateMediaSession(song)
      } catch (playErr) {
        // 已被新请求抢占:旧歌的播放失败不该影响当前这首
        if (isStale(seq)) return
        // 自动播放被拦截等
        const de = playErr as DOMException
        console.warn('play() rejected', de?.name, de?.message)
        // B站 m4s(fmp4)不被支持 / 音源不可用:同一首歌改用 html5 mp4 重试一次
        // (保留当前歌词与续播位置,不重新走一遍跨平台兜底)
        if (song.source === 'BILIBILI' && !html5Fallback && triedHtml5For !== song.id) {
          triedHtml5For = song.id
          song.keepMeta = true
          await startPlayback(song, true, resume)
          return
        }
        // 原生 URL 拿到了但放不出来(试听失效/403/编码不支持):
        // 网易云/QQ/酷狗/汽水同样走跨平台兜底(keepMeta=true 的换源重放除外,防循环)
        if (
          !keepMeta &&
          fallbackEnabled &&
          (song.source === 'NETEASE' ||
            song.source === 'QQMUSIC' ||
            song.source === 'KUGOU' ||
            song.source === 'QISHUI')
        ) {
          await fallbackToOther(song, `原生音源播放失败(${de?.name ?? 'unknown'}),自动切换到其他音源`, resume)
          return
        }
        set({ playing: false, loading: false, loadProgress: null })
      }
      // 换源播放不重拉歌词(保留原曲歌词)
      if (keepMeta) return
      api
        .lyricsGet(song)
        .then((ly) => {
          // 歌词回来时用户可能已切歌:只认当前曲目且请求仍是最新
          if (!isStale(seq) && get().current?.id === song.id) {
            set({ lyrics: ly })
            void refreshHighlights(song, ly)
          }
        })
        .catch(() => {})
    } catch (e) {
      // 已被新请求抢占:这次失败属于旧歌,不要弹错误、不要把 loading 关掉
      if (isStale(seq)) return
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[playback] prepare failed: ${song.source} ${song.title} | ${msg.slice(0, 120)}`)
      // 网易云任何取流失败都垫底到其他平台(无源/VIP/风控);设置关闭时不垫底
      if (song.source === 'NETEASE') {
        if (!fallbackEnabled) {
          set({ loading: false, loadProgress: null })
          toastError('网易云暂无可用音源', '已关闭跨平台兜底(可在设置开启),不再自动搜索其他平台')
          return
        }
        await fallbackToOther(song, `网易云暂无可用音源(${msg}),自动切换到其他音源`, resume)
        return
      }
      // QQ/酷狗原生取流失败(VIP 专享/无版权)→ 跨平台垫底
      if (song.source === 'QQMUSIC' && !keepMeta) {
        if (!fallbackEnabled) {
          set({ loading: false, loadProgress: null })
          toastError('QQ音乐暂无可用音源', '已关闭跨平台兜底(可在设置开启)')
          return
        }
        await fallbackToOther(song, `QQ音乐暂无可用音源(${msg}),自动切换到其他音源`, resume)
        return
      }
      if (song.source === 'KUGOU' && !keepMeta) {
        if (!fallbackEnabled) {
          set({ loading: false, loadProgress: null })
          toastError('酷狗暂无可用音源', '已关闭跨平台兜底(可在设置开启)')
          return
        }
        await fallbackToOther(song, `酷狗暂无可用音源(${msg}),自动切换到其他音源`, resume)
        return
      }
      set({ loading: false, loadProgress: null })
      toastError('播放失败', msg)
    }
  }

  /**
   * 跨平台音源兜底(原 fallbackToBilibili 扩展):
   * B站 → QQ音乐 → 酷狗,只换音频流,标题/封面/歌手/歌词/评论全部保留原曲。
   *
   * B站命中项必须与「更换音源」弹窗里的第一项一致:同一关键词、同一排序
   * (totalrank)、第一页的第一条。此前按"时长最接近"挑,常挑到同名翻唱/Live,
   * 与弹窗首项不一致(VIP 歌曲自动兜底时尤为明显)。
   */
  const fallbackToOther = async (song: Song, reason: string, resumeAt = 0) => {
    console.warn(`[fallback] enter: ${song.source} ${song.title} - ${song.artist} | ${reason}`)
    const tried: string[] = []
    /** 跨曲兜底不做"续播到 0.x 秒"这种无意义跳变(进度条横跳的另一个来源) */
    const resume = resumeAt > 3 ? resumeAt : 0
    /** 时长兜底匹配(QQ/酷狗无候选列表可对照时使用):优先时长接近,否则取第一项 */
    const pickByDuration = (list: Song[]): Song | null => {
      if (list.length === 0) return null
      const best = list.reduce((a, b) =>
        song.duration > 0 &&
        Math.abs(b.duration - song.duration) < Math.abs(a.duration - song.duration)
          ? b
          : a
      )
      return song.duration > 0 && Math.abs(best.duration - song.duration) <= 50 ? best : list[0]
    }
    /**
     * B站兜底候选评分(前 10 项内):
     * 排除「伴奏」,优先「百万豪装」「录音棚」「无损」「Hi-Res」等完整版标记;
     * 全部命中排除词时退回原列表,宁可挑相对最优也不放弃。
     */
    const pickBiliCandidate = (list: Song[]): Song | null => {
      if (list.length === 0) return null
      const score = (s: Song): number => {
        const t = s.title.toLowerCase()
        let v = 0
        if (t.includes('伴奏')) v -= 100
        if (t.includes('翻唱')) v -= 30
        if (t.includes('live') || t.includes('现场')) v -= 15
        if (t.includes('百万豪装')) v += 50
        if (t.includes('录音棚')) v += 45
        if (t.includes('无损')) v += 40
        if (t.includes('hires') || t.includes('hi-res') || t.includes('hi res')) v += 40
        return v
      }
      const pool = list.slice(0, 10).filter((s) => !s.title.toLowerCase().includes('伴奏'))
      const cands = pool.length > 0 ? pool : list.slice(0, 10)
      return cands.reduce((best, s) => (score(s) > score(best) ? s : best), cands[0])
    }
    /** QQ/酷狗候选:同样排除伴奏 */
    const pickQkCandidate = (list: Song[]): Song | null =>
      pickByDuration(list.filter((s) => !s.title.toLowerCase().includes('伴奏')))
    let picked: Song | null = null
    // 1) B站(有现成的缓存/兜底经验):前 10 项里按标题评分选优
    try {
      const list = await api.biliSearch(`${song.title} ${song.artist}`, 1, 'totalrank')
      picked = pickBiliCandidate(list)
      console.warn(`[fallback] bili search hits=${list.length} picked=${picked ? `${picked.title}/${picked.source}` : 'none'}`)
      if (picked) tried.push('B站')
    } catch (e) {
      console.warn('[fallback] bili search failed', e)
    }
    // 2) QQ 音乐
    if (!picked) {
      try {
        const r = await api.qqSearch(`${song.title} ${song.artist}`, 1)
        if (r.ok && r.data) {
          picked = pickQkCandidate(r.data.filter((s2) => !s2.vipOnly))
          if (picked) tried.push('QQ音乐')
        }
      } catch {
        /* 下一个平台 */
      }
    }
    // 3) 酷狗
    if (!picked) {
      try {
        const r = await api.kugouSearch(`${song.title} ${song.artist}`, 1)
        if (r.ok && r.data) {
          picked = pickQkCandidate(r.data.filter((s2) => !s2.vipOnly))
          if (picked) tried.push('酷狗')
        }
      } catch {
        /* noop:下面统一报错 */
      }
    }
    if (!picked) {
      console.warn('[fallback] all platforms missed, giving up')
      set({ loading: false, loadProgress: null })
      toastError('播放失败', 'B站 / QQ音乐 / 酷狗均未找到该歌曲')
      return
    }
    try {
      toast('切换音源', `${reason}(${tried.join(' / ') || 'B站'})`)
      // 只换音频流:保留原曲标题/封面/歌手/neteaseId,换入命中平台字段以走原生音质。
      // 注意 id 必须保持原曲不变 —— 取流只按 source + 各平台字段分发,从不读 id;
      // 一旦改成 picked.id,同一首歌就有了第二个身份,列表高亮与收藏会被拆成两条。
      const audioOnly: Song = {
        ...song,
        source: picked.source,
        bvid: picked.bvid,
        page: picked.page,
        qqMid: picked.qqMid,
        qqId: picked.qqId,
        kugouHash: picked.kugouHash,
        kugouMixId: picked.kugouMixId,
        kugouAlbumId: picked.kugouAlbumId,
        duration: picked.duration || song.duration,
        vipOnly: false,
        keepMeta: true
      }
      // 替换队列中的当前曲目,保持队列连贯
      const { queue, queueIndex } = get()
      const idx = queue.findIndex((s) => s.id === song.id)
      if (idx >= 0) {
        const newQueue = [...queue]
        newQueue[idx] = audioOnly
        set({ queue: newQueue, queueIndex: idx })
      }
      triedHtml5For = null
      set({ playing: false, loading: false })
      await startPlayback(audioOnly, false, resume)
      // 最近播放记录原曲(重播时重新走垫底逻辑,已登录用户可直接用网易云音源)
      api
        .libraryAddRecent(song)
        .then(() => get().refreshLibrary())
        .catch(() => {})
      // 垫底发生在歌词请求之前:补拉原曲歌词
      api
        .lyricsGet(song)
        .then((ly) => {
          if (get().current?.id === audioOnly.id) {
            set({ lyrics: ly })
            void refreshHighlights(audioOnly, ly)
          }
        })
        .catch(() => {})
    } catch (err) {
      set({ loading: false, loadProgress: null })
      toastError('切换音源失败', String(err))
    }
  }

  const updateMediaSession = (song: Song) => {
    // 任务栏/悬浮预览显示当前曲目
    document.title = song.source === 'LOCAL' ? song.title : `${song.title} - ${song.artist}`
    if (!('mediaSession' in navigator)) return
    const cover =
      song.coverUrl ||
      (get().library?.songs[song.id]?.coverUrl ?? null) ||
      null
    // MediaSession 只接受 http/https/data/blob,不能用 bmedia:// 自定义协议
    const artworkSrc = cover
      ? cover.startsWith('//')
        ? `https:${cover}`
        : cover.startsWith('bmedia://')
          ? undefined
          : cover
      : undefined
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? '',
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: '512x512' }] : []
    })
  }

  /**
   * 播放记录上报:一首歌实际播放到 ≥30s 时,按开关各报一次。
   * 网易云走打卡接口(feeback/weblog),B站走 heartbeat 写观看历史。
   * QQ音乐/酷狗没有公开的播放记录上报接口,不做。
   */
  const maybeScrobble = (song: Song, seconds: number): void => {
    if (seconds < 30 || song.id === scrobbledFor) return
    const settings = get().library?.settings
    scrobbledFor = song.id
    if (settings?.scrobbleNetease && song.neteaseId) {
      void api
        .neteaseScrobble(song.neteaseId, Math.min(seconds, 300))
        .then((r) => {
          if (!r.ok) console.warn('[scrobble] 网易云上报失败:', r.error ?? r.data?.error)
        })
        .catch(() => {})
    }
    if (settings?.scrobbleQQ && song.source === 'QQMUSIC') {
      const qqId = song.qqId ?? Number(/qq-(d+)/.exec(song.id)?.[1] ?? 0)
      if (qqId > 0) {
        void api
          .qqReportRecently(qqId)
          .then((r) => {
            if (!r.ok) console.warn('[scrobble] QQ音乐上报失败:', r.error ?? r.data?.error)
          })
          .catch(() => {})
      }
    }
    if (settings?.scrobbleBili && song.source === 'BILIBILI' && song.bvid) {
      void (async () => {
        try {
          // heartbeat 需要 cid:用分P列表里当前页的(取不到就忽略)
          const pages = await api.pagesGet(song.bvid!)
          const page = pages.find((p) => p.page === (song.page || 1)) ?? pages[0]
          if (!page?.cid) return
          const r = await api.biliReportWatch(song.bvid!, page.cid, Math.min(seconds, 600))
          if (!r.ok) console.warn('[scrobble] B站上报失败:', r.error ?? r.data?.error)
        } catch {
          /* cid 获取失败:静默跳过 */
        }
      })()
    }
  }

  const bindAudioEvents = () => {
    const el = getAudio()
    el.addEventListener('timeupdate', () => {
      // 加载中(含换源兜底)不写位置:此刻 el 上可能还挂着上一首/上一段的残留时间轴,
      // 写进去会让进度条在 0 与旧位置之间反复横跳
      if (get().loading) return
      const cur = get().current
      if (!cur || cur.id !== lastKnownPosSongId) return
      set({ position: el.currentTime })
      lastTimeupdateAt = Date.now()
      if (el.currentTime > 0.5) lastKnownPos = el.currentTime
      saveResume()
      maybeScrobble(cur, el.currentTime)
      if ('mediaSession' in navigator && el.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: el.duration,
            playbackRate: el.playbackRate,
            position: Math.min(el.currentTime, el.duration)
          })
        } catch {
          /* ignore */
        }
      }
      const timerEnd = get().sleepTimerEnd
      if (timerEnd && Date.now() >= timerEnd) {
        el.pause()
        get().cancelSleepTimer()
        toast('定时关闭', '播放已停止')
      }
    })
    el.addEventListener('durationchange', () => {
      // 加载中不采信元素时长(可能还是上一首的残留),等新音源元数据就绪后再同步
      if (get().loading) return
      if (isFinite(el.duration)) set({ duration: el.duration })
    })
    el.addEventListener('ended', () => {
      const { mode } = get()
      if (mode === 'single') {
        el.currentTime = 0
        el.play().catch(() => {})
      } else {
        get().next(false)
      }
    })
    el.addEventListener('error', async () => {
      const { current, playing } = get()
      if (!current) return
      // 加载/换源过程中的解析错误由 startPlayback 的 try/catch 统一处理,避免双重兜底
      if (get().loading) return
      // 突发中断(流断/超时):重试时从最后位置续播,不能从头开始。
      // 位置必须是"这首歌"的:换源/失败重试留下的零点几秒不应被当作续播点
      const resumeAt = lastKnownPosSongId === current.id && lastKnownPos > 3 ? lastKnownPos : 0
      const fallbackEnabled = get().library?.settings.neteaseFallback !== false
      if (current.source === 'BILIBILI' && triedHtml5For !== current.id) {
        // m4s 可能不被支持 → 换 html5 mp4(同一首歌重试,保留当前歌词,续播中断位置)
        triedHtml5For = current.id
        current.keepMeta = true
        await startPlayback(current, true, resumeAt)
      } else if (
        fallbackEnabled &&
        (current.source === 'NETEASE' ||
          current.source === 'QQMUSIC' ||
          current.source === 'KUGOU' ||
          current.source === 'QISHUI' ||
          current.keepMeta)
      ) {
        // 原平台流不可用 → 跨平台垫底(续播中断位置)
        await fallbackToOther(current, '音频流中断,自动切换到其他音源', resumeAt)
      } else if (playing) {
        set({ playing: false, loadProgress: null })
        toastError('播放失败', '音频无法播放')
      }
    })
    el.addEventListener('pause', () => {
      set({ playing: false })
      saveResume(true)
    })
    el.addEventListener('play', () => set({ playing: true }))
  }
  bindAudioEvents()

  // ===== 卡死看门狗 =====
  // 流悄悄断掉(代理流 stall,无 error 事件)时,"播放中"但 timeupdate 不再前进;
  // 超过 12s 未前进且缓冲不足 → 以断点位置重新取流续播(缓存命中时极快)
  setInterval(() => {
    const st = get()
    if (!st.playing || !st.current || st.loading) return
    if (st.current.source === 'LOCAL') return
    const el = getAudio()
    if (el.paused) return
    if (el.readyState >= 3) return
    if (!lastTimeupdateAt || Date.now() - lastTimeupdateAt < 12_000) return
    // 冷却 30s:一次恢复失败后不要连续轰炸
    if (Date.now() - recoveringAt < 30_000) return
    recoveringAt = Date.now()
    lastTimeupdateAt = Date.now()
    const resumeAt = lastKnownPos > 1 ? lastKnownPos : 0
    console.warn('[player] stream stalled, recovering at', resumeAt)
    void startPlayback(st.current, false, resumeAt)
  }, 5000)

  // 系统媒体控制
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => get().togglePlay())
    navigator.mediaSession.setActionHandler('pause', () => get().togglePlay())
    navigator.mediaSession.setActionHandler('previoustrack', () => get().prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => get().next(true))
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) get().seek(d.seekTime)
    })
  }

  // 下载进度推送
  api.onDlUpdate((record) => {
    const lib = get().library
    if (!lib) return
    const downloads = [...lib.downloads]
    const idx = downloads.findIndex((d) => d.id === record.id)
    // 取消的任务带 __removed 标记:直接从列表移除
    if ((record as unknown as { __removed?: boolean }).__removed) {
      if (idx >= 0) downloads.splice(idx, 1)
      set({ library: { ...lib, downloads } })
      return
    }
    if (idx >= 0) downloads[idx] = record
    else downloads.unshift(record)
    set({ library: { ...lib, downloads } })
  })

  // 音频加载进度(主进程推送):只认当前正在加载的歌曲
  api.onAudioProgress((p) => {
    const st = get()
    if (!st.loading && p.stage === 'done') return
    set({ loadProgress: p.stage === 'done' ? null : p })
  })

  // 启动自动检查更新命中(主进程推送)→ 弹更新窗
  api.onUpdateAvailable((info) => {
    // 用户在设置里已忽略该版本则不再弹
    if (get().library?.settings.skippedUpdateVersion === info.version) return
    set({ updateInfo: info })
  })

  // 启动自动检查结果:无新版本 / 检查失败 → 右下角轻提示(更新窗口见上)
  api.onUpdateLatest?.((version) => {
    if (version) toast('检查更新', `已是最新版本(v${version})`)
    else toast('检查更新', '未能获取版本信息,可稍后在设置中重试')
  })

  return {
    library: null,
    page: 'search',
    pendingSearch: null,
    queue: [],
    queueIndex: -1,
    current: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    volume: 0.9,
    muted: false,
    mode: 'loop',
    lyrics: null,
    nowPlayingOpen: false,
    sleepTimerEnd: null,
    sleepPaused: false,
    sleepRemainingMs: 0,
    sleepTotalMs: 0,
    activeDialog: null,
    dialogSong: null,
    quality: null,
    loadProgress: null,
    highlights: [],
    artistPageId: null,
    updateInfo: null,

    async init() {
      const lib = await api.libraryGet()
      set({ library: lib })
      // 恢复上次的音量(未持久化过则用默认 0.9)
      const v = typeof lib.settings.volume === 'number' ? lib.settings.volume : 0.9
      const el = getAudio()
      el.volume = v
      if (v > 0) lastVolume = v
      set({ volume: v, muted: v === 0 })
      // 恢复上次播放会话:只恢复曲目元数据/队列/进度(暂停态,不取流),点播放才从头流程走
      const r = lib.resumePlayback
      if (
        r &&
        Array.isArray(r.queue) &&
        r.queue.length > 0 &&
        Number.isInteger(r.queueIndex) &&
        r.queueIndex >= 0 &&
        r.queueIndex < r.queue.length
      ) {
        const song = r.queue[r.queueIndex]
        if (song?.id) {
          set({
            queue: r.queue,
            queueIndex: r.queueIndex,
            current: song,
            position: r.pos > 0 ? r.pos : 0,
            duration: song.duration ?? 0
          })
          lastResumeSongId = song.id
          lastResumeSaveAt = Date.now()
        }
      }
    },
    async refreshLibrary() {
      const lib = await api.libraryGet()
      set({ library: lib })
    },
    setPage(p) {
      // 切页时关闭歌手主页覆盖层(否则侧边栏导航后仍停留在歌手页)
      set({ page: p, artistPageId: null })
    },

    searchWithQuery(q) {
      // 识曲页拿到结果后调用:写入待搜索词并切到搜索页
      set({ pendingSearch: q, page: 'search', artistPageId: null })
    },

    takePendingSearch() {
      const q = get().pendingSearch
      // 取走即清空,避免用户下次回到搜索页时又被旧关键词覆盖输入
      if (q !== null) set({ pendingSearch: null })
      return q
    },

    async playQueue(songs, startIndex = 0) {
      if (songs.length === 0) return
      // 不再因"上一首还在加载"而拒绝:新播放请求会递增序号并 abort 上一个请求,
      // 旧请求回来时发现自己已过期就静默退出,因此这里直接放行、立即生效。
      triedHtml5For = null
      set({ queue: songs, queueIndex: startIndex })
      await startPlayback(songs[startIndex])
    },

    playSongNext(song) {
      const { queue, queueIndex } = get()
      const q = [...queue]
      q.splice(queueIndex + 1, 0, song)
      set({ queue: q })
      toast('已加入下一首播放', song.title)
    },

    togglePlay() {
      const st = get()
      // 加载音源过程中屏蔽播放键:此时 el 还没有可播内容,点击只会引发状态错乱
      if (st.loading) return
      const el = getAudio()
      if (!el.src) {
        // 重启恢复的曲目还没取流:点击播放 = 从上次进度开始走完整取流流程
        if (st.current) void startPlayback(st.current, false, st.position > 3 ? st.position : 0)
        return
      }
      // 元素处于错误态(流中断后):点击播放 = 以断点续播(重新取流),而不是从头开始
      if (el.error && st.current) {
        const resumeAt = lastKnownPos > 1 ? lastKnownPos : 0
        void startPlayback(st.current, true, resumeAt)
        return
      }
      if (el.paused) {
        el.play().catch(() => {})
        if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {})
      } else {
        el.pause()
      }
    },

    next(manual = true) {
      const { queue, queueIndex, mode } = get()
      if (queue.length === 0) return
      let nextIndex: number
      if (mode === 'shuffle' && queue.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * queue.length)
        } while (nextIndex === queueIndex)
      } else {
        nextIndex = queueIndex + 1
        if (nextIndex >= queue.length) {
          if (mode === 'single' && !manual) {
            nextIndex = queueIndex
          } else {
            nextIndex = 0
          }
        }
      }
      triedHtml5For = null
      set({ queueIndex: nextIndex })
      startPlayback(queue[nextIndex])
    },

    prev() {
      const { queue, queueIndex } = get()
      if (queue.length === 0) return
      const el = getAudio()
      if (el.currentTime > 3) {
        el.currentTime = 0
        return
      }
      const prevIndex = queueIndex - 1 < 0 ? queue.length - 1 : queueIndex - 1
      triedHtml5For = null
      set({ queueIndex: prevIndex })
      startPlayback(queue[prevIndex])
    },

    seek(t) {
      const el = getAudio()
      if (isFinite(el.duration)) {
        el.currentTime = t
        set({ position: t })
      } else if (get().current) {
        // 尚未取流(重启恢复态):先记住拖到的位置,开始播放时从这里续播
        set({ position: t })
      }
    },

    /** 设置音量;persist=true 时写入设置(拖动过程不落盘,松手才持久化) */
    setVolume(v, persist = false) {
      const el = getAudio()
      const vol = Math.min(1, Math.max(0, v))
      el.volume = vol
      if (vol > 0) {
        lastVolume = vol
        if (el.muted) el.muted = false
      }
      set({ volume: vol, muted: vol === 0 })
      if (persist) void get().updateSetting('volume', vol)
    },
    setMuted(m) {
      const el = getAudio()
      if (!m && el.volume === 0) {
        // 音量为 0 时取消静音:恢复到上次的非零音量,否则"取消静音"没有任何效果
        const restored = lastVolume > 0 ? lastVolume : 0.9
        el.volume = restored
        el.muted = false
        set({ volume: restored, muted: false })
        void get().updateSetting('volume', restored)
        return
      }
      el.muted = m
      set({ muted: m })
    },
    cycleMode() {
      const order: PlayMode[] = ['loop', 'shuffle', 'single']
      const { mode } = get()
      const nextMode = order[(order.indexOf(mode) + 1) % order.length]
      set({ mode: nextMode })
      toast(
        '播放模式',
        nextMode === 'loop' ? '列表循环' : nextMode === 'shuffle' ? '随机播放' : '单曲循环'
      )
    },
    setNowPlayingOpen(open) {
      // 收起全屏时一并清掉 'comments'。
      // 全屏页里的评论区是右侧停靠面板,但状态仍记在 activeDialog 上;
      // GlobalDialogs 的兜底条件是 dlg==='comments' && !nowPlayingOpen,
      // 若不清,收起全屏的那次渲染里条件立刻成立,评论会以弹窗形态再弹一次。
      // 放在 store 里统一处理:Esc / 收起按钮 / 快捷键等所有入口都能覆盖,
      // 且与 nowPlayingOpen 同一次 set,不存在"先渲染再清理"的闪烁窗口。
      if (!open && get().activeDialog === 'comments') {
        set({ nowPlayingOpen: false, activeDialog: null })
        return
      }
      set({ nowPlayingOpen: open })
    },
    setLyrics(l) {
      set({ lyrics: l })
      const cur = get().current
      if (cur) void refreshHighlights(cur, l)
    },

    startSleepTimer(minutes) {
      get().startSleepTimerMs(Math.round(minutes * 60000))
    },

    startSleepTimerMs(ms) {
      if (sleepTimerHandle) clearTimeout(sleepTimerHandle)
      if (sleepFadeHandle) clearInterval(sleepFadeHandle)
      if (sleepFadeTimeout) clearTimeout(sleepFadeTimeout)
      sleepTimerHandle = null
      sleepFadeHandle = null
      sleepFadeTimeout = null
      // 若上次渐弱进行中,先恢复音量
      if (sleepFading) {
        getAudio().volume = sleepOrigVolume
        sleepFading = false
      }
      if (ms <= 0) {
        set({ sleepTimerEnd: null, sleepPaused: false, sleepRemainingMs: 0, sleepTotalMs: 0 })
        return
      }
      const end = Date.now() + ms
      set({ sleepTimerEnd: end, sleepPaused: false, sleepRemainingMs: 0, sleepTotalMs: ms })
      // 睡眠渐弱:结束前 20 秒音量线性衰减到 0(2026 播放器常见细节)
      const fadeEnabled = get().library?.settings.sleepFadeOut ?? true
      if (fadeEnabled && ms > 25000) {
        sleepFadeTimeout = setTimeout(() => {
          const el = getAudio()
          sleepOrigVolume = el.volume
          sleepFading = true
          const steps = 40
          let i = 0
          sleepFadeHandle = setInterval(() => {
            i++
            el.volume = Math.max(0, sleepOrigVolume * (1 - i / steps))
            if (i >= steps && sleepFadeHandle) {
              clearInterval(sleepFadeHandle)
              sleepFadeHandle = null
            }
          }, 500)
        }, ms - 20000)
      }
      sleepTimerHandle = setTimeout(() => {
        // timeupdate 里可能已到达同一时刻并取消定时:避免重复暂停/重复提示
        if (!get().sleepTimerEnd) return
        const el = getAudio()
        el.pause()
        if (sleepFading) {
          el.volume = sleepOrigVolume
          sleepFading = false
        }
        set({ sleepTimerEnd: null, sleepPaused: false, sleepRemainingMs: 0, sleepTotalMs: 0 })
        toast('定时关闭', '播放已停止')
      }, ms)
      toast('定时关闭', `${fmtDur(ms)} 后停止播放${fadeEnabled && ms > 25000 ? '(结束前 20 秒渐弱)' : ''}`)
    },

    pauseSleepTimer() {
      const end = get().sleepTimerEnd
      if (!end || get().sleepPaused) return
      const remaining = Math.max(0, end - Date.now())
      if (sleepTimerHandle) clearTimeout(sleepTimerHandle)
      if (sleepFadeHandle) clearInterval(sleepFadeHandle)
      if (sleepFadeTimeout) clearTimeout(sleepFadeTimeout)
      sleepTimerHandle = null
      sleepFadeHandle = null
      sleepFadeTimeout = null
      if (sleepFading) {
        getAudio().volume = sleepOrigVolume
        sleepFading = false
      }
      set({ sleepTimerEnd: null, sleepPaused: true, sleepRemainingMs: remaining })
      toast('定时关闭', `已暂停,剩余 ${fmtDur(remaining)}`)
    },

    resumeSleepTimer() {
      if (!get().sleepPaused) return
      get().startSleepTimerMs(get().sleepRemainingMs)
    },
    cancelSleepTimer() {
      if (sleepTimerHandle) clearTimeout(sleepTimerHandle)
      if (sleepFadeHandle) clearInterval(sleepFadeHandle)
      if (sleepFadeTimeout) clearTimeout(sleepFadeTimeout)
      sleepTimerHandle = null
      sleepFadeHandle = null
      sleepFadeTimeout = null
      // 仅在渐弱进行中才恢复音量
      if (sleepFading) {
        getAudio().volume = sleepOrigVolume
        sleepFading = false
      }
      set({ sleepTimerEnd: null, sleepPaused: false, sleepRemainingMs: 0, sleepTotalMs: 0 })
    },

    setActiveDialog(d) {
      set({ activeDialog: d })
    },

    openSongDialog(d, song) {
      set({ activeDialog: d, dialogSong: song })
    },

    async updateSetting(key, value) {
      const settings = await api.librarySetSetting(key, value)
      const lib = get().library
      if (lib) set({ library: { ...lib, settings } })
    },

    async resetSettings(sections?: string[]) {
      const settings = await api.libraryResetSettings(sections)
      const lib = get().library
      if (lib) set({ library: { ...lib, settings } })
      return settings
    },

    playAt(index) {
      const { queue } = get()
      if (index < 0 || index >= queue.length) return
      // 同上:允许在上一首加载中直接切歌,由 startPlayback 的请求序号负责抢占
      triedHtml5For = null
      set({ queueIndex: index })
      void startPlayback(queue[index])
    },

    removeFromQueue(index) {
      const { queue, queueIndex } = get()
      if (index < 0 || index >= queue.length) return
      const q = [...queue]
      q.splice(index, 1)
      let ni = queueIndex
      if (index < queueIndex) ni = queueIndex - 1
      else if (index === queueIndex) ni = Math.min(queueIndex, q.length - 1)
      set({ queue: q, queueIndex: q.length === 0 ? -1 : ni })
    },

    clearQueue() {
      set({ queue: [], queueIndex: -1 })
    },

    setPlaybackRate(rate) {
      const semi = get().library?.settings.pitchSemitones ?? 0
      const el = getAudio()
      // 与音调叠加:rate 最终 = 倍速 × 2^(半音/12)
      el.playbackRate = semi !== 0 ? rate * Math.pow(2, semi / 12) : rate
      if (semi === 0) {
        const pp = el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }
        const keep = get().library?.settings.preservePitch ?? true
        pp.preservesPitch = keep
        pp.webkitPreservesPitch = keep
      }
      get().updateSetting('playbackRate', rate)
    },

    /**
     * 音调(半音):
     * 用 playbackRate 做 tape-style 变调(2^(n/12) 倍速),并关闭 preservesPitch
     * 让音高随速度一起变——这正是"升调不变速"在浏览器里的等效做法需要反过来的地方:
     * 这里播放速度会随音调变化,与手机端"音调"滑杆行为一致(升调=更快更高)。
     * 倍速设置与音调相互独立:最终 rate = 倍速 × 2^(半音/12)。
     */
    setPitch(semitones) {
      const n = Math.max(-12, Math.min(12, Math.round(semitones)))
      const el = getAudio()
      const base = get().library?.settings.playbackRate ?? 1
      el.playbackRate = base * Math.pow(2, n / 12)
      const pp = el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }
      pp.preservesPitch = false
      pp.webkitPreservesPitch = false
      void get().updateSetting('pitchSemitones', n)
    },

    stepPitch(delta) {
      const cur = get().library?.settings.pitchSemitones ?? 0
      get().setPitch(cur + delta)
    },

    async replaceCurrentAndPlay(song) {
      const { queue, current } = get()
      // 换源/分P切换同样不再等待上一个请求:startPlayback 会 abort 旧请求并抢占序号
      const q = [...queue]
      // 按 id 定位当前曲(队列项可能因移除/换源与 queueIndex 错位):
      // 找到 → 原位替换;找不到 → 追加为新的一项,避免覆盖错误的队列项
      const idx = current ? q.findIndex((s) => s.id === current.id) : -1
      const at = idx >= 0 ? idx : q.length
      q[at] = song
      set({ queue: q, queueIndex: at })
      triedHtml5For = null
      await startPlayback(song)
    },

    openArtistPage(id) {
      set({ artistPageId: id })
    },
    closeArtistPage() {
      set({ artistPageId: null })
    }
  }
})

/** 应用均衡器增益(设置变化时调用) */
export function applyEqSettings(settings: Settings): void {
  if (settings.eqEnabled && !audioContext) {
    ensureEqChain(settings)
  }
  eqNodes.forEach((n, i) => {
    n.gain.value = settings.eqEnabled ? (settings.eqGains[i] ?? 0) : 0
  })
}

export function getAudioElement(): HTMLAudioElement {
  return getAudio()
}

// ===== 听歌时长累计 =====
// 每秒轮询播放态:播放中 +1s,每 10 秒与暂停(或切歌间隙)时冲刷到主进程;
// 冲刷失败把毫秒数回补进累加器,不丢账。跨天分桶由主进程处理。
let listenAccMs = 0
let listenLastFlush = 0
async function flushListenTime(): Promise<void> {
  if (listenAccMs <= 0) return
  const ms = listenAccMs
  listenAccMs = 0
  try {
    const stats = await api.libraryAddListenTime(ms)
    const lib = useStore.getState().library
    if (lib) useStore.setState({ library: { ...lib, listenStats: stats } })
  } catch {
    listenAccMs += ms
  }
}
setInterval(() => {
  const st = useStore.getState()
  if (st.playing && st.current) {
    listenAccMs += 1000
    if (Date.now() - listenLastFlush >= 10_000) {
      listenLastFlush = Date.now()
      void flushListenTime()
    }
  } else if (listenAccMs > 0) {
    void flushListenTime()
  }
}, 1000)
