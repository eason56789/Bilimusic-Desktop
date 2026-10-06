/** 播放器 + 全局状态(zustand) */
import { create } from 'zustand'
import type { Library, LyricsResult, Song, Settings } from '@shared/types'
import { api } from './lib/api'
import { toast, toastError } from './lib/toast'

export type PlayMode = 'loop' | 'shuffle' | 'single'
export type PageKey = 'search' | 'playlists' | 'downloads' | 'settings' | 'recent'
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
let triedHtml5For: string | null = null
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
  /** 当前播放音质描述(如 极高 320k MP3 / 320k / 本地文件) */
  quality: string | null

  // actions
  init(): Promise<void>
  refreshLibrary(): Promise<void>
  setPage(p: PageKey): void
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
  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  setPlaybackRate(rate: number): void
  playAt(index: number): void
  removeFromQueue(index: number): void
  clearQueue(): void
  /** 用一首歌替换队列当前曲目并播放(换源等场景) */
  replaceCurrentAndPlay(song: Song): Promise<void>
}

export const useStore = create<PlayerState>((set, get) => {
  /** 实际开始播放一首歌 */
  const startPlayback = async (song: Song, html5Fallback = false) => {
    const el = getAudio()
    // keepMeta 是一次性标记:本次播放保留原曲歌词,消费后失效(重播/落库不会误保留)
    const keepMeta = song.keepMeta === true
    if (keepMeta) song.keepMeta = false
    set({
      current: song,
      loading: true,
      lyrics: keepMeta ? get().lyrics : null,
      position: 0,
      duration: song.duration,
      quality: null
    })
    // VIP 歌曲且未登录网易云 → 直接走 B 站垫底,不浪费一次取流
    const neLogged = !!get().library?.neteaseProfile
    if (song.source === 'NETEASE' && song.vipOnly && !neLogged) {
      await fallbackToBilibili(song, '网易云需要 VIP,自动切换到哔哩哔哩音源')
      return
    }
    // QQ音乐/酷狗歌曲只存元数据:直接经B站搜索取流播放(标题/封面/歌手/歌词保留)
    if (
      (song.source === 'QQMUSIC' || song.source === 'KUGOU') &&
      !song.bvid &&
      !song.neteaseId
    ) {
      const platform = song.source === 'QQMUSIC' ? 'QQ音乐' : '酷狗音乐'
      await fallbackToBilibili(
        song,
        `${platform}歌曲已通过哔哩哔哩搜索播放(保留原标题与歌词)`
      )
      return
    }
    try {
      const prepared = await api.audioPrepare(song, html5Fallback)
      if (get().current?.id !== song.id) return
      el.src = prepared.url
      const st = get().library?.settings
      el.playbackRate = st?.playbackRate ?? 1
      // 倍速保持音调(2026 播放器标配)
      const pitch = st?.preservePitch ?? true
      ;(el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = pitch
      ;(el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = pitch
      // 建立音频图(频谱可视化 + 均衡器)
      if (st) ensureEqChain(st)
      try {
        await el.play()
        set({ playing: true, loading: false, quality: prepared.quality ?? null })
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
        // 自动播放被拦截等
        set({ playing: false, loading: false })
        const de = playErr as DOMException
        console.warn('play() rejected', de?.name, de?.message)
      }
      // 换源播放不重拉歌词(保留原曲歌词)
      if (keepMeta) return
      api
        .lyricsGet(song)
        .then((ly) => {
          if (get().current?.id === song.id) set({ lyrics: ly })
        })
        .catch(() => {})
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 网易云任何取流失败都垫底到 B 站(无源/VIP/风控)
      if (song.source === 'NETEASE') {
        await fallbackToBilibili(song, `网易云暂无可用音源(${msg}),自动切换到哔哩哔哩`)
        return
      }
      set({ loading: false })
      toastError('播放失败', msg)
    }
  }

  /** 网易云 → B站 音源回退(只换音频流,标题/封面/歌手/歌词全部保留原曲) */
  const fallbackToBilibili = async (song: Song, reason: string) => {
    try {
      toast('切换音源', reason)
      const results = await api.biliSearch(`${song.title} ${song.artist}`, 1, 'totalrank')
      if (results.length === 0) {
        set({ loading: false })
        toastError('播放失败', 'B站也未找到该歌曲')
        return
      }
      const best = results.reduce((a, b) =>
        song.duration > 0 &&
        Math.abs(b.duration - song.duration) < Math.abs(a.duration - song.duration)
          ? b
          : a
      )
      const picked =
        song.duration > 0 && Math.abs(best.duration - song.duration) <= 50 ? best : results[0]
      // 只换音频流:保留原曲的标题/封面/歌手/neteaseId,仅用 B 站视频取流
      const audioOnly: Song = {
        ...song,
        id: picked.id,
        source: 'BILIBILI',
        bvid: picked.bvid,
        page: picked.page,
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
      await startPlayback(audioOnly)
      // 最近播放记录原曲(重播时重新走垫底逻辑,已登录用户可直接用网易云音源)
      api
        .libraryAddRecent(song)
        .then(() => get().refreshLibrary())
        .catch(() => {})
      // 垫底发生在歌词请求之前:补拉原曲歌词
      api
        .lyricsGet(song)
        .then((ly) => {
          if (get().current?.id === audioOnly.id) set({ lyrics: ly })
        })
        .catch(() => {})
    } catch (err) {
      set({ loading: false })
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

  const bindAudioEvents = () => {
    const el = getAudio()
    el.addEventListener('timeupdate', () => {
      set({ position: el.currentTime })
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
      if (current.source === 'BILIBILI' && triedHtml5For !== current.id) {
        // m4s 可能不被支持 → 换 html5 mp4(同一首歌重试,保留当前歌词)
        triedHtml5For = current.id
        current.keepMeta = true
        await startPlayback(current, true)
      } else if (current.source === 'NETEASE') {
        await fallbackToBilibili(current, '网易云播放失败,自动切换到哔哩哔哩')
      } else if (playing) {
        set({ playing: false })
        toastError('播放失败', '音频无法播放')
      }
    })
    el.addEventListener('pause', () => set({ playing: false }))
    el.addEventListener('play', () => set({ playing: true }))
  }
  bindAudioEvents()

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

  return {
    library: null,
    page: 'search',
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
    quality: null,

    async init() {
      const lib = await api.libraryGet()
      set({ library: lib })
      // 恢复上次的音量(未持久化过则用默认 0.9)
      const v = typeof lib.settings.volume === 'number' ? lib.settings.volume : 0.9
      const el = getAudio()
      el.volume = v
      if (v > 0) lastVolume = v
      set({ volume: v, muted: v === 0 })
    },
    async refreshLibrary() {
      const lib = await api.libraryGet()
      set({ library: lib })
    },
    setPage(p) {
      set({ page: p })
    },

    async playQueue(songs, startIndex = 0) {
      if (songs.length === 0) return
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
      const el = getAudio()
      if (!el.src) return
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
      set({ nowPlayingOpen: open })
    },
    setLyrics(l) {
      set({ lyrics: l })
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

    async updateSetting(key, value) {
      const settings = await api.librarySetSetting(key, value)
      const lib = get().library
      if (lib) set({ library: { ...lib, settings } })
    },

    playAt(index) {
      const { queue } = get()
      if (index < 0 || index >= queue.length) return
      triedHtml5For = null
      set({ queueIndex: index })
      startPlayback(queue[index])
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
      getAudio().playbackRate = rate
      get().updateSetting('playbackRate', rate)
    },

    async replaceCurrentAndPlay(song) {
      const { queue, current } = get()
      const q = [...queue]
      // 按 id 定位当前曲(队列项可能因移除/换源与 queueIndex 错位):
      // 找到 → 原位替换;找不到 → 追加为新的一项,避免覆盖错误的队列项
      const idx = current ? q.findIndex((s) => s.id === current.id) : -1
      const at = idx >= 0 ? idx : q.length
      q[at] = song
      set({ queue: q, queueIndex: at })
      triedHtml5For = null
      await startPlayback(song)
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
