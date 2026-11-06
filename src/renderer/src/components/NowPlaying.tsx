/** 全屏播放页:左封面右歌词(视觉平衡)+ 开关动画 + 完整功能菜单 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Menu,
  MenuDivider,
  MenuList,
  MenuItem,
  MenuPopover,
  MenuTrigger,
  Spinner,
  ProgressBar,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  PauseRegular,
  PlayRegular,
  PreviousRegular,
  NextRegular,
  ArrowRepeatAllRegular,
  ArrowShuffleRegular,
  ArrowRepeat1Regular,
  ChevronDownRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
  Speaker1Regular,
  SpeakerMuteRegular,
  MoreHorizontalRegular,
  ChatMultipleRegular,
  ListRegular,
  ArrowSwapRegular,
  ClockRegular,
  GaugeRegular,
  SettingsRegular,
  ArrowDownloadRegular,
  InfoRegular,
  NoteEditRegular,
  MusicNote2Regular,
  ArrowSyncRegular,
  OpenRegular,
  CheckmarkRegular,
  LockClosedRegular,
  LockOpenRegular,
  HeartRegular,
  HeartFilled,
  TextEffectsRegular,
  TextAlignCenterRegular
} from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { api } from '../lib/api'
import { toastSuccess, toastError } from '../lib/toast'
import { Cover } from './Cover'
import { NiceSlider } from './NiceSlider'
import { SpectrumBars } from './SpectrumBars'
import { LyricLineRow } from './LyricLineRow'
import { PvLyricsSafe } from './PvLyrics'
import { CommentsBody } from './PlayerDialogs'
import { badgeOf } from '../lib/sourceBadge'
import { formatTime } from './SongList'

/** 文字PV 版式显示名 */
const PV_ARRANGE_LABEL: Record<string, string> = {
  pv: '逐字PV',
  partita: '云阶',
  claddagh: '回环',
  still: '时计',
  tempera: '凝彩',
  jizura: '印刷分镜',
  classic: '经典',
  tilt: '倾斜',
  cadenza: '商籁',
  fume: '雾里',
  cappella: '群唱',
  monet: '莫奈',
  pendolo: '钟摆',
  lumiere: '绘光',
  hanabi: '花火',
  nebbia: '雾笺',
  sonnet: '诗节',
  diorama: '镜台',
  machi: '町景'
}

const PV_LAYOUT_LABEL: Record<string, string> = {
  'type-impact': '巨字炸裂',
  'editorial-column': '竖排专栏',
  'fragment-collage': '碎片拼贴',
  'tracking-ribbon': '单行带状',
  'mask-reveal': '中轴落入',
  'quiet-tableau': '静场堆叠'
}

/** 右侧评论停靠面板宽度(px):播放内容整体左移同样的量 */const COMMENTS_PANEL_W = 360
/** 面板滑入/内容左移的同一条曲线 */
const PANEL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const useStyles = makeStyles({
  fullscreen: {
    position: 'fixed',
    inset: '0',
    zIndex: 1000,
    overflow: 'hidden',
    background: tokens.colorNeutralBackground3,
    display: 'flex',
    flexDirection: 'column'
  },
  bgWrap: { position: 'absolute', inset: '0', overflow: 'hidden', zIndex: 0 },
  bgImg: {
    width: '110%',
    height: '110%',
    objectFit: 'cover',
    filter: 'blur(72px) brightness(0.45) saturate(1.2)',
    transform: 'scale(1.2)'
  },
  content: {
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
        // 不设 width:100%:定宽会无视 margin-right,评论面板展开时无法左移
        // (列flex子项默认stretch,收起时等效满宽)
      },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    height: '52px',
    padding: '0 12px 0 16px',
    flexShrink: 0
  },
  topDrag: { flex: 1, height: '100%', WebkitAppRegion: 'drag' },
  /** 主体:等分两栏,左封面右歌词,各自内部居中 → 视觉平衡 */
  middle: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.1fr)',
    gap: 'clamp(24px, 4vw, 64px)',
    padding: '0 clamp(32px, 5vw, 96px)',
    minHeight: 0,
    alignItems: 'center',
    maxWidth: '1440px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box'
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '22px',
    minWidth: 0,
    maxHeight: '100%',
    justifyContent: 'center'
  },
  coverShadow: {
    boxShadow: '0 24px 72px rgba(0,0,0,0.55)',
    borderRadius: '16px',
    lineHeight: 0
  },
  meta: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    height: '88%',
    minHeight: 0,
    position: 'relative'
  },
  lyrics: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    padding: '10vh 8px',
    position: 'relative',
    maskImage: 'linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)',
    textAlign: 'center'
  },
  empty: {
    color: 'rgba(255,255,255,0.45)',
    padding: '8px 12px',
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center'
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px clamp(32px, 6vw, 120px) 28px',
    flexShrink: 0,
    maxWidth: '1440px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box'
  },
  ctrlRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px'
  },
  sideRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px'
  },
  timeText: { color: 'rgba(255,255,255,0.7)', fontSize: tokens.fontSizeBase200, minWidth: '42px' },
  /** 右侧评论停靠面板(默认收起到屏外,open 时滑入) */
  commentsPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: `${COMMENTS_PANEL_W}px`,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    // 顶部让开40px原生窗口按钮区(关闭/最大化/最小化),排序行不再被盖住
    padding: '46px 16px 14px',
    boxSizing: 'border-box',
    // 半透明玻璃:透出播放页的模糊封面背景
    background: 'rgba(18,18,18,0.42)',
    backdropFilter: 'blur(40px) saturate(1.3)',
    borderLeft: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px 0 0 14px',
    transform: `translateX(${COMMENTS_PANEL_W + 24}px)`,
    transition: `transform 0.32s ${PANEL_EASE}`,
    pointerEvents: 'none'
  },
  commentsPanelOpen: { transform: 'translateX(0)', pointerEvents: 'auto' }
})

export function NowPlaying() {
  const styles = useStyles()
  const open = useStore((s) => s.nowPlayingOpen)
  const current = useStore((s) => s.current)
  const playing = useStore((s) => s.playing)
  const loading = useStore((s) => s.loading)
  const loadProgress = useStore((s) => s.loadProgress)
  const lyrics = useStore((s) => s.lyrics)
  const position = useStore((s) => s.position)
  const duration = useStore((s) => s.duration)
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const mode = useStore((s) => s.mode)
  const queue = useStore((s) => s.queue)
  const sleepEnd = useStore((s) => s.sleepTimerEnd)
  const quality = useStore((s) => s.quality)
  /** 进度条高潮点标记(设置可关) */
  const highlights = useStore((s) => s.highlights)
  const rate = useStore((s) => s.library?.settings.playbackRate ?? 1)
  const st = useStore((s) => s.library?.settings)
  // 歌词偏移需响应式:此前经 getState() 读取,暂停时调整偏移不会立即重算当前行
  const lyricOffset = useStore((s) => s.library?.settings.lyricOffsetMs ?? 0)
  // 歌词对齐:居中 / 靠左(手机端样式)
  const lyricAlign = useStore((s) => s.library?.settings.lyricAlign ?? 'center')
  const leftAlign = lyricAlign === 'left'
  /** 歌词视觉样式:经典滚动列表 / 文字PV(与「更多操作」同级按钮切换) */
  const lyricStyle = useStore((s) => s.library?.settings.lyricStyle ?? 'classic')
  const pvMode = lyricStyle === 'pv'
  const pvAnim = useStore((s) => s.library?.settings.pvAnim ?? 'pop')
  const pvLayout = useStore((s) => s.library?.settings.pvLayout ?? 'center')
  const pvDecor = useStore((s) => s.library?.settings.pvDecor !== false)
  /** 排布样式:逐字PV / 云阶 / 回环 / 时计 */
  const pvArrange = useStore((s) => s.library?.settings.pvArrange ?? 'pv')
  /** PV 主色:空=跟随主题强调色 */
  const accentColor = (() => {
    const raw = st?.pvAccent?.trim()
    return raw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : st?.accent || '#7aa2ff'
  })()

  /**
   * PV 舞台控制区显隐:默认完全隐藏(只留歌词舞台)。
   * 触发区是**顶部 14%**(收起 / 更多)与**底部 22%**(进度条与播放控制)两条热区 ——
   * 原先只认底部,导致左上角"收起"永远显现不出来,也就点不到。
   * 菜单/弹窗打开时恒显。
   */
  const [chromeHot, setChromeHot] = useState(false)
  /**
   * 全屏状态:F11 或顶栏按钮切换。全屏时窗口铺满显示器(原生全屏,不是最大化),
   * PV 舞台本来就 fixed inset:0,所以会自动跟着铺满。
   */
  const [isFs, setIsFs] = useState(false)
  const toggleFs = (): void => {
    void api.windowToggleFullscreen().then((v) => setIsFs(v))
  }
  useEffect(() => {
    void api.windowIsFullscreen().then((v) => setIsFs(v))
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        toggleFs()
        return
      }
      // 全屏下 Esc 先退全屏,不直接收起播放页(避免一下退两级)
      if (e.key === 'Escape' && isFs) {
        e.preventDefault()
        void api.windowSetFullscreen(false).then((v) => setIsFs(v))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isFs])
  useEffect(() => {
    if (!pvMode || !open) {
      setChromeHot(false)
      return
    }
    const onMove = (e: MouseEvent): void => {
      const topBand = window.innerHeight * 0.14
      const bottomBand = window.innerHeight * 0.78
      setChromeHot(e.clientY <= topBand || e.clientY >= bottomBand)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [pvMode, open])
  /** 菜单/弹窗打开时保持控制区可见,否则点不到按钮(activeDialog 直接读 store,避免声明顺序问题) */
  const chromePinned = !!useStore((s) => s.activeDialog)
  const pvChrome = !pvMode || chromeHot || chromePinned ? 1 : 0
  const dlg = useStore((s) => s.activeDialog)
  const setDlg = useStore((s) => s.setActiveDialog)
  const commentsOpen = dlg === 'comments'
  const floatLyric = useStore((s) => s.library?.settings.floatLyric ?? false)
  const floatLocked = useStore((s) => s.library?.settings.floatLyricLocked ?? false)
  const favoriteIds = useStore((s) => s.library?.favoriteIds)
  const faved = !!current && !!favoriteIds?.includes(current.id)
  const { setNowPlayingOpen, togglePlay, next, prev, seek, setVolume, cycleMode } =
    useStore.getState()

  /** 平滑播放位置(ms,含200ms提前量与歌词偏移):rAF驱动,
   *  消除 timeupdate 4Hz 带来的 ~0.25s 切句滞后(对齐手机端帧插值) */
  const [smoothMs, setSmoothMs] = useState(() => position * 1000 + 200 - lyricOffset)
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = (): void => {
      const v = getAudioElement().currentTime * 1000 + 200 - lyricOffset
      setSmoothMs((prev) => (Math.abs(prev - v) > 1 ? v : prev))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, lyricOffset])

  const activeIdx = useMemo(() => {
    if (!lyrics || lyrics.lines.length === 0) return -1
    const pos = smoothMs
    let idx = -1
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeMs <= pos) idx = i
      else break
    }
    return idx
  }, [lyrics, smoothMs])

  const activeRef = useRef<HTMLDivElement | null>(null)
  const registerActive = useCallback((el: HTMLDivElement | null) => {
    activeRef.current = el
  }, [])
  const seekLine = useCallback((timeMs: number) => {
    useStore.getState().seek(timeMs / 1000)
  }, [])

  // 歌词手动浏览:滚轮/触摸滚动介入后暂停跟随与分层模糊,
  // 停止滚动 3 秒后才回到当前句,回位后模糊恢复
  const wheelAtRef = useRef(0)
  const [lyricsBrowsing, setLyricsBrowsing] = useState(false)
  const noteBrowsing = useCallback(() => {
    wheelAtRef.current = Date.now()
    setLyricsBrowsing(true)
  }, [])
  useEffect(() => {
    if (!lyricsBrowsing) return
    const t = setInterval(() => {
      if (Date.now() - wheelAtRef.current >= 3000) setLyricsBrowsing(false)
    }, 300)
    return () => clearInterval(t)
  }, [lyricsBrowsing])

  // 切句滚动:手动 500ms easeInOutCubic(对齐手机端 0.5s FastOutSlowIn;
  // 替代 scrollIntoView——其动画时长不可控且每帧争抢)
  // 手动浏览期间挂起,回位(lyricsBrowsing→false)时立即补一次滚动
  useEffect(() => {
    if (lyricsBrowsing) return
    const el = activeRef.current
    const container = el?.closest('.lyrics-scroll') as HTMLElement | null
    if (!el || !container) return
    const target = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2
    const start = container.scrollTop
    const delta = target - start
    if (Math.abs(delta) < 1) return
    const t0 = performance.now()
    let raf = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / 500)
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      container.scrollTop = start + delta * e
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [activeIdx, open, lyricsBrowsing])

  /** 分层模糊(对齐手机端):按与当前句的距离分档;前奏(未命中当前行)时不模糊。
   *  手动浏览歌词期间同样不模糊,回位后恢复。
   *  桌面字号(16px)远小于手机(24sp),同数值视觉更重,乘0.6的桌面系数。 */
  const lineBlur = (i: number): number => {
    if (lyricsBrowsing) return 0
    if (!st || !st.lyricBlurEnabled || st.lyricBlurAmount <= 0) return 0
    if (activeIdx < 0) return 0
    const d = Math.abs(i - activeIdx)
    let v: number
    if (d === 0) v = st.lyricBlurCurrent
    else if (d === 1) v = st.lyricBlurNear
    else if (d === 2) v = st.lyricBlurMid
    else v = st.lyricBlurFar
    return Math.round(v * 0.6 * 10) / 10
  }

  // Esc:先关打开的弹窗/评论面板,再收起播放页
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (dlg) setDlg(null)
        else setNowPlayingOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dlg])


  const ModeIcon =
    mode === 'loop'
      ? ArrowRepeatAllRegular
      : mode === 'shuffle'
        ? ArrowShuffleRegular
        : ArrowRepeat1Regular
  const modeText = mode === 'loop' ? '列表循环' : mode === 'shuffle' ? '随机播放' : '单曲循环'

  const sleepText = (() => {
    if (!sleepEnd) return null
    const left = Math.max(0, sleepEnd - Date.now())
    const m = Math.floor(left / 60000)
    const s = Math.floor((left % 60000) / 1000)
    return `${m}:${String(s).padStart(2, '0')}`
  })()

  const downloadCurrent = () => {
    if (!current) return
    api.downloadAdd([current])
    toastSuccess('已加入下载队列', current.title)
  }

  const shareCurrent = async () => {
    if (!current) return
    const url =
      current.neteaseId
        ? `https://music.163.com/song?id=${current.neteaseId}`
        : current.bvid
          ? `https://www.bilibili.com/video/${current.bvid}`
          : ''
    if (!url) return
    await api.appCopy(url)
    toastSuccess('链接已复制到剪贴板')
  }

  const hasPages = current?.source === 'BILIBILI' && !!current.bvid

  /** 收藏当前播放的曲目(与列表行内心形共用同一套后端/刷新逻辑) */
  const toggleFavCurrent = async (): Promise<void> => {
    if (!current) return
    const r = await api.libraryToggleFavorite(current)
    await useStore.getState().refreshLibrary()
    toastSuccess(r.favorited ? '已收藏' : '已取消收藏', current.title)
  }

  return (
    <>
      <div className={`np-root ${styles.fullscreen}`} data-open={open} aria-hidden={!open}>
        <div className={styles.bgWrap}>
          {current?.coverUrl ? (
            <img
              className={styles.bgImg}
              src={`bmedia://img/?url=${encodeURIComponent(current.coverUrl.startsWith('//') ? `https:${current.coverUrl}` : current.coverUrl)}`}
              alt=""
              crossOrigin="anonymous"
            />
          ) : null}
        </div>
        <div
          className={styles.content}
          style={{
            // 评论面板展开时内容整体左移(收起时回到0)
            marginRight: commentsOpen ? COMMENTS_PANEL_W : 0,
            transition: `margin-right 0.32s ${PANEL_EASE}`
          }}
        >
          {/* 顶栏:左=收起,右=更多(避开原生窗口按钮)。PV 舞台时随控制区一起淡出 */}
          <div
            className={styles.topBar}
            style={{
              opacity: pvChrome,
              pointerEvents: pvChrome > 0.5 ? 'auto' : 'none',
              transition: 'opacity 0.32s ease',
              // PV 舞台是铺满视口的 fixed 层:顶栏必须抬到它上面,否则鼠标移上去不显现、也点不到
              position: 'relative',
              zIndex: 4
            }}
          >
            <Tooltip content="收起(Esc)" relationship="label">
              <Button
                appearance="subtle"
                icon={<ChevronDownRegular />}
                onClick={() => setNowPlayingOpen(false)}
                style={{ color: 'rgba(255,255,255,0.85)' }}
                className="titlebar-nodrag"
              >
                收起
              </Button>
            </Tooltip>
            {/* 全屏按钮紧跟收起:放右侧会与原生窗口按钮(最小化)重叠 */}
            <Tooltip content={isFs ? '退出全屏(F11)' : '全屏(F11)'} relationship="label">
              <Button
                appearance="subtle"
                icon={isFs ? <FullScreenMinimizeRegular /> : <FullScreenMaximizeRegular />}
                onClick={toggleFs}
                style={{ color: 'rgba(255,255,255,0.85)' }}
                className="titlebar-nodrag"
              />
            </Tooltip>
            <div className={styles.topDrag} />
            <div style={{ width: 140, flexShrink: 0 }} />
          </div>

          {/* PV 舞台:fixed 铺满视口 —— content 带 marginRight(评论面板),absolute 会被它限制。
              不预留底部空间:背景必须铺满整窗,播放条改为浮在上面。 */}
          {pvMode ? (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column' }}>
              {lyrics && lyrics.lines.length > 0 ? (
                <PvLyricsSafe lines={lyrics.lines} activeIdx={activeIdx} smoothMs={smoothMs} />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.45)',
                    whiteSpace: 'pre-line',
                    textAlign: 'center',
                    lineHeight: 1.7
                  }}
                >
                  {current?.source === 'BILIBILI'
                    ? '该视频暂无 AI 字幕\n登录 B 站后可获取更多字幕'
                    : current
                      ? '暂无歌词\n可通过右上角菜单编辑或导入歌词'
                      : ''}
                </div>
              )}
            </div>
          ) : (
          <div
            className={styles.middle}
            style={
              commentsOpen
                ? { gridTemplateColumns: 'minmax(200px, 0.9fr) minmax(260px, 1.2fr)' }
                : undefined
            }
          >
            <div className={styles.leftCol}>
              <div className={styles.coverShadow}>
                {/* 全屏播放才加载完整大图;列表/播放条统一用 CDN 缩略图 */}
                <Cover
                  url={current?.coverUrl}
                  size={commentsOpen ? 220 : 340}
                  radius={16}
                  iconSize={68}
                  quality="full"
                />
              </div>
              <div className={styles.meta}>
                <Text
                  size={700}
                  weight="semibold"
                  style={{
                    color: '#fff',
                    display: 'block',
                    wordBreak: 'break-word',
                    lineHeight: 1.3
                  }}
                >
                  {current?.title ?? '尚未播放'}
                </Text>
                <Text size={400} style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {/* 多歌手各自可点(如"周杰伦 / 李硕 / 张鑫"),分隔符不带链接;点击搜索网易云歌手并打开主页 */}
                  {(current?.artist ?? '')
                    .split(' / ')
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .map((name, i, arr) => (
                      <span key={`${name}-${i}`}>
                        <span
                          role="button"
                          tabIndex={0}
                          title={`打开${name}的主页`}
                          style={{
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textDecorationColor: 'rgba(255,255,255,0.35)',
                            textUnderlineOffset: '3px'
                          }}
                          onClick={async (e) => {
                            e.stopPropagation()
                            // 先收起全屏播放(立刻响应),再后台查歌手 id;查到后跳转主页
                            useStore.getState().setNowPlayingOpen(false)
                            const r = await api.neteaseFindArtist(name)
                            if (r.ok && r.data) useStore.getState().openArtistPage(r.data)
                            else toastError('未找到该歌手')
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              ;(e.currentTarget as HTMLElement).click()
                            }
                          }}
                        >
                          {name}
                        </span>
                        {i < arr.length - 1 ? ' / ' : ''}
                      </span>
                    ))}
                  {current?.album ? ` · ${current.album}` : ''}
                </Text>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: tokens.fontSizeBase100,
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: current ? badgeOf(current.source).bgStrong : 'rgba(15,108,189,0.25)',
                      color: 'rgba(255,255,255,0.9)'
                    }}
                  >
                    {current ? badgeOf(current.source).label : ''}
                  </span>
                  {quality && st?.uiModules.npQualityBadge !== false && (
                    <span
                      style={{
                        fontSize: tokens.fontSizeBase100,
                        padding: '2px 10px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.9)'
                      }}
                    >
                      {quality}
                    </span>
                  )}
                  {rate !== 1 && (
                    <span
                      style={{
                        fontSize: tokens.fontSizeBase100,
                        padding: '2px 10px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.9)'
                      }}
                    >
                      {rate}x
                    </span>
                  )}
                  {sleepText && (
                    <span
                      style={{
                        fontSize: tokens.fontSizeBase100,
                        padding: '2px 10px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.9)'
                      }}
                    >
                      ⏱ {sleepText}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.rightCol}>
              {/* 音源加载遮罩:两种样式共用(加载中盖住歌词区) */}
              {loading && current && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 14,
                    zIndex: 4,
                    background: 'rgba(10,10,12,0.55)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 16
                  }}
                >
                  <Spinner size="large" />
                  <Text style={{ color: 'rgba(255,255,255,0.92)' }}>
                    {loadProgress?.stage === 'downloading' ? '正在下载音频…' : '正在解析音源…'}
                  </Text>
                  {loadProgress?.stage === 'downloading' && loadProgress.total ? (
                    <div style={{ width: 220 }}>
                      <ProgressBar
                        value={Math.min(0.999, (loadProgress.received ?? 0) / loadProgress.total)}
                      />
                      <Text
                        size={200}
                        style={{ color: 'rgba(255,255,255,0.7)', display: 'block', textAlign: 'center', marginTop: 4 }}
                      >
                        {Math.round(((loadProgress.received ?? 0) / loadProgress.total) * 100)}%
                      </Text>
                    </div>
                  ) : null}
                </div>
              )}
              {/* 经典歌词:PV 舞台已在更外层独占整窗,这里只负责滚动列表样式 */}
              <div
                  className={`${styles.lyrics} lyrics-scroll`}
                  style={{ textAlign: leftAlign ? 'left' : 'center' }}
                  onWheel={noteBrowsing}
                  onTouchMove={noteBrowsing}
                >
                  {lyrics && lyrics.lines.length > 0 ? (
                    lyrics.lines.map((line, i) => {
                      const isActive = i === activeIdx
                      const beforeFirst = activeIdx < 0 && i === 0
                      return (
                        <LyricLineRow
                          key={`${line.timeMs}-${i}`}
                          line={line}
                          isActive={isActive}
                          blur={beforeFirst ? 0 : lineBlur(i)}
                          nextTimeMs={lyrics.lines[i + 1]?.timeMs ?? line.timeMs + 5000}
                          countdownRemainingMs={
                            beforeFirst && smoothMs < line.timeMs
                              ? Math.ceil((line.timeMs - smoothMs) / 500) * 500
                              : null
                          }
                          leftAlign={leftAlign}
                          registerActive={isActive ? registerActive : undefined}
                          onSeek={seekLine}
                        />
                      )
                    })
                  ) : (
                    <div className={styles.empty}>
                      {/* 多行提示需 whiteSpace: pre-line,否则 \n 在 JSX 中不换行 */}
                      <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                        <div style={{ fontSize: 20, marginBottom: 8 }}>♪</div>
                        {current?.source === 'BILIBILI'
                          ? '该视频暂无 AI 字幕\n登录 B 站后可获取更多字幕'
                          : current
                            ? '暂无歌词\n可通过右上角菜单编辑或导入歌词'
                            : ''}
                      </div>
                    </div>
                  )}
                </div>
            </div>
          </div>
          )}

          {/* 控制区:PV 舞台时默认隐藏,鼠标移到窗口下方才淡入(只留进度条与播放控制) */}
          <div
            className={styles.controls}
            style={{
              opacity: pvChrome,
              transform: pvMode ? `translateY(${(1 - pvChrome) * 18}px)` : undefined,
              pointerEvents: pvChrome > 0.5 ? 'auto' : 'none',
              transition: 'opacity 0.32s ease, transform 0.32s ease',
              // PV 舞台是铺满视口的 fixed 层:控制区也改成 fixed 吸附底部,浮在它上面
              position: pvMode ? 'fixed' : undefined,
              left: pvMode ? 0 : undefined,
              right: pvMode ? 0 : undefined,
              bottom: pvMode ? 0 : undefined,
              zIndex: pvMode ? 3 : undefined
            }}
          >
            {/* 实时频谱可视化(2026 播放器标配) */}
            {st?.uiModules.npSpectrum !== false && <SpectrumBars height={56} bars={64} />}
            <div className={styles.sideRow}>
              <span className={styles.timeText}>{formatTime(position)}</span>
              <NiceSlider
                value={Math.min(position, duration || 1)}
                max={Math.max(duration, 1)}
                onChange={(v) => seek(v)}
                disabled={!current}
                highlights={st?.showChorusMarks !== false ? highlights : undefined}
                ariaLabel="播放进度"
              />
              <span className={styles.timeText} style={{ textAlign: 'right' }}>
                {formatTime(duration)}
              </span>
            </div>
            <div className={styles.ctrlRow}>
              <Tooltip content={modeText} relationship="label">
                <Button
                  appearance="subtle"
                  icon={<ModeIcon />}
                  onClick={() => cycleMode()}
                  style={{ color: 'rgba(255,255,255,0.85)' }}
                />
              </Tooltip>
              <Tooltip content="上一首" relationship="label">
                <Button
                  appearance="subtle"
                  size="large"
                  icon={<PreviousRegular />}
                  onClick={() => prev()}
                  disabled={!current}
                  style={{ color: 'rgba(255,255,255,0.92)' }}
                />
              </Tooltip>
              <Button
                appearance="primary"
                shape="circular"
                size="large"
                style={{ width: '60px', height: '60px', minWidth: '60px', padding: 0 }}
                icon={
                  loading ? (
                    <Spinner size="tiny" style={{ color: '#fff' }} />
                  ) : playing ? (
                    <PauseRegular fontSize={24} />
                  ) : (
                    <PlayRegular fontSize={24} />
                  )
                }
                onClick={() => togglePlay()}
                disabled={!current || loading}
              />
              <Tooltip content="下一首" relationship="label">
                <Button
                  appearance="subtle"
                  size="large"
                  icon={<NextRegular />}
                  onClick={() => next(true)}
                  disabled={!current}
                  style={{ color: 'rgba(255,255,255,0.92)' }}
                />
              </Tooltip>
              <Tooltip content={faved ? '取消收藏' : '收藏'} relationship="label">
                <Button
                  appearance="subtle"
                  size="large"
                  aria-label={faved ? '取消收藏' : '收藏'}
                  icon={faved ? <HeartFilled /> : <HeartRegular />}
                  onClick={() => void toggleFavCurrent()}
                  disabled={!current}
                  style={{
                    color: faved ? tokens.colorPaletteRedForeground1 : 'rgba(255,255,255,0.92)'
                  }}
                />
              </Tooltip>
              <Tooltip content={`音量 ${Math.round((muted ? 0 : volume) * 100)}%`} relationship="label">
                <NiceSlider
                  value={muted ? 0 : volume}
                  max={1}
                  onChange={(v) => setVolume(v)}
                  onCommit={(v) => setVolume(v, true)}
                  live
                  width="110px"
                  trackHeight={3}
                  hoverHeight={6}
                  ariaLabel="音量"
                />
              </Tooltip>
              {/* 歌词样式:经典 / 文字PV(与「更多操作」同级;PV 下再展开细化选项) */}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip content={pvMode ? '歌词样式:文字PV' : '歌词样式:经典'} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<TextEffectsRegular />}
                      style={{
                        color: pvMode ? accentColor : 'rgba(255,255,255,0.85)',
                        background: pvMode ? `${accentColor}22` : undefined
                      }}
                    >
                      {pvMode ? 'PV' : ''}
                    </Button>
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem
                      icon={!pvMode ? <CheckmarkRegular /> : undefined}
                      onClick={() => void useStore.getState().updateSetting('lyricStyle', 'classic')}
                    >
                      经典歌词(滚动列表)
                    </MenuItem>
                    <MenuItem
                      icon={pvMode ? <CheckmarkRegular /> : undefined}
                      onClick={() => void useStore.getState().updateSetting('lyricStyle', 'pv')}
                    >
                      文字PV(整屏大字 + 动效)
                    </MenuItem>
                    <MenuDivider />
                    {/* 排布样式:同一套 PV 舞台,换整行的摆法(参考 folia 的多种歌词样式) */}
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<TextEffectsRegular />} disabled={!pvMode}>
                          排布样式({PV_ARRANGE_LABEL[pvArrange]})
                        </MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {(
                            [
                              ['pv', '逐字PV(词块 + 镜头)'],
                              ['partita', '云阶(分栏词块)'],
                              ['claddagh', '回环(圆弧排布)'],
                              ['still', '时计(静态三行)'],
                              ['tempera', '凝彩(构图色块 + 反相大字)'],
                              ['classic', '经典(逐词高亮滚动)'],
                              ['tilt', '倾斜(随机断行倾斜)'],
                              ['cadenza', '商籁(逐字飞入)'],
                              ['fume', '雾里(活字印刷)'],
                              ['cappella', '群唱(聊天气泡)'],
                              ['monet', '莫奈(海报版面)'],
                              ['pendolo', '钟摆(钟盘弧线)'],
                              ['lumiere', '绘光(体积光刻字)'],
                              ['hanabi', '花火(烟花PV)'],
                              ['nebbia', '雾笺(起雾车窗)'],
                              ['sonnet', '诗节(翻页诗稿)'],
                              ['diorama', '镜台(3D点阵)'],
                              ['machi', '町景(微缩街景)']
                            ] as const
                          ).map(([k, label]) => (
                            <MenuItem
                              key={k}
                              icon={pvArrange === k ? <CheckmarkRegular /> : undefined}
                              onClick={() => void useStore.getState().updateSetting('pvArrange', k)}
                            >
                              {label}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<ArrowRepeatAllRegular />} disabled={!pvMode}>
                          入场动效
                        </MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {(
                            [
                              ['pop', '弹出 Pop'],
                              ['rise', '上浮 Rise'],
                              ['slam', '砸落 Slam'],
                              ['wave', '波浪 Wave'],
                              ['typewriter', '打字机 Typewriter']
                            ] as const
                          ).map(([k, label]) => (
                            <MenuItem
                              key={k}
                              icon={pvAnim === k ? <CheckmarkRegular /> : undefined}
                              onClick={() => void useStore.getState().updateSetting('pvAnim', k)}
                            >
                              {label}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<TextAlignCenterRegular />} disabled={!pvMode}>
                          版式{pvLayout !== 'auto' ? `(${PV_LAYOUT_LABEL[pvLayout]})` : '(自动)'}
                        </MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {(
                            [
                              ['auto', '自动(按句轮转)'],
                              ['type-impact', '巨字炸裂(副歌)'],
                              ['editorial-column', '竖排专栏'],
                              ['fragment-collage', '碎片拼贴'],
                              ['tracking-ribbon', '单行带状'],
                              ['mask-reveal', '中轴落入'],
                              ['quiet-tableau', '静场堆叠']
                            ] as const
                          ).map(([k, label]) => (
                            <MenuItem
                              key={k}
                              icon={pvLayout === k ? <CheckmarkRegular /> : undefined}
                              onClick={() => void useStore.getState().updateSetting('pvLayout', k)}
                            >
                              {label}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <MenuItem
                      icon={pvDecor ? <CheckmarkRegular /> : undefined}
                      disabled={!pvMode}
                      onClick={() => void useStore.getState().updateSetting('pvDecor', !pvDecor)}
                    >
                      装饰层(网格/光圈/角框)
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              {st?.uiModules.npMore !== false && (
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip content="更多操作" relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<MoreHorizontalRegular />}
                      style={{ color: 'rgba(255,255,255,0.85)' }}
                    />
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<ChatMultipleRegular />} onClick={() => setDlg('comments')}>
                      评论
                    </MenuItem>
                    {hasPages && (
                      <MenuItem icon={<ListRegular />} onClick={() => setDlg('pages')}>
                        选择分P
                      </MenuItem>
                    )}
                    <MenuItem icon={<ListRegular />} onClick={() => setDlg('queue')}>
                      播放队列{queue.length > 0 ? ` (${queue.length})` : ''}
                    </MenuItem>
                    <MenuItem icon={<InfoRegular />} onClick={() => setDlg('info')}>
                      歌曲详情
                    </MenuItem>
                    <MenuItem icon={<NoteEditRegular />} onClick={() => setDlg('lyricEdit')}>
                      歌词编辑
                    </MenuItem>
                    <MenuItem icon={<MusicNote2Regular />} onClick={() => setDlg('lyricReplace')}>
                      更换歌词
                    </MenuItem>
                    <MenuItem icon={<ArrowSyncRegular />} onClick={() => setDlg('lyricOffset')}>
                      歌词偏移
                    </MenuItem>
                    <MenuItem
                      icon={<ArrowDownloadRegular />}
                      disabled={!current}
                      onClick={downloadCurrent}
                    >
                      下载
                    </MenuItem>
                    <MenuItem icon={<OpenRegular />} disabled={!current} onClick={shareCurrent}>
                      分享链接
                    </MenuItem>
                    <MenuItem icon={<ArrowSwapRegular />} disabled={!current} onClick={() => setDlg('source')}>
                      更换音源
                    </MenuItem>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<OpenRegular />}>
                          悬浮歌词窗{floatLyric ? (floatLocked ? '(已锁定)' : '(已开启)') : ''}
                        </MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={floatLyric ? <CheckmarkRegular /> : undefined}
                            onClick={() =>
                              void useStore.getState().updateSetting('floatLyric', !floatLyric)
                            }
                          >
                            {floatLyric ? '关闭悬浮歌词窗' : '开启悬浮歌词窗'}
                          </MenuItem>
                          <MenuItem
                            icon={floatLocked ? <LockClosedRegular /> : <LockOpenRegular />}
                            disabled={!floatLyric}
                            onClick={() =>
                              void useStore
                                .getState()
                                .updateSetting('floatLyricLocked', !floatLocked)
                            }
                          >
                            {floatLocked ? '解除锁定(恢复可交互)' : '锁定(鼠标穿透,不挡操作)'}
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<ClockRegular />}>定时关闭{sleepText ? ` (${sleepText})` : ''}</MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {[15, 30, 45, 60, 90, 120].map((m) => (
                            <MenuItem key={m} onClick={() => useStore.getState().startSleepTimer(m)}>
                              {m} 分钟
                            </MenuItem>
                          ))}
                          <MenuItem onClick={() => setDlg('sleep')}>自定义时长 / 管理...</MenuItem>
                          <MenuItem onClick={() => useStore.getState().cancelSleepTimer()}>
                            关闭定时
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <MenuItem icon={<GaugeRegular />}>倍速播放 ({rate}x)</MenuItem>
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                            <MenuItem
                              key={r}
                              icon={r === rate ? <CheckmarkRegular /> : undefined}
                              onClick={() => useStore.getState().setPlaybackRate(r)}
                            >
                              {r}x {r === 1 ? '(正常)' : ''}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                    <MenuItem icon={<SettingsRegular />} onClick={() => setDlg('eq')}>
                      均衡器
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              )}
            </div>
          </div>
        </div>

        {/* 右侧评论停靠面板:打开时上层内容(marginRight)整体左移让位 */}
        <div
          className={`${styles.commentsPanel} ${commentsOpen ? styles.commentsPanelOpen : ''}`}
          data-comments-panel={commentsOpen ? 'open' : 'closed'}
        >
          <CommentsBody
            song={current}
            active={open && commentsOpen}
            fill
            onClose={() => setDlg(null)}
          />
        </div>
      </div>
    </>
  )
}
