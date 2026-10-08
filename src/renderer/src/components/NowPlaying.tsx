/** 全屏播放页:左封面右歌词(视觉平衡)+ 开关动画 + 完整功能菜单 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Menu,
  MenuList,
  MenuItem,
  MenuPopover,
  MenuTrigger,
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
  CheckmarkRegular
} from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { api } from '../lib/api'
import { toastSuccess } from '../lib/toast'
import { Cover } from './Cover'
import { NiceSlider } from './NiceSlider'
import { SpectrumBars } from './SpectrumBars'
import { LyricLineRow } from './LyricLineRow'
import { CommentsBody } from './PlayerDialogs'
import { badgeOf } from '../lib/sourceBadge'
import { formatTime } from './SongList'

/** 右侧评论停靠面板宽度(px):播放内容整体左移同样的量 */
const COMMENTS_PANEL_W = 360
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
  const lyrics = useStore((s) => s.lyrics)
  const position = useStore((s) => s.position)
  const duration = useStore((s) => s.duration)
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const mode = useStore((s) => s.mode)
  const queue = useStore((s) => s.queue)
  const sleepEnd = useStore((s) => s.sleepTimerEnd)
  const quality = useStore((s) => s.quality)
  const rate = useStore((s) => s.library?.settings.playbackRate ?? 1)
  const st = useStore((s) => s.library?.settings)
  // 歌词偏移需响应式:此前经 getState() 读取,暂停时调整偏移不会立即重算当前行
  const lyricOffset = useStore((s) => s.library?.settings.lyricOffsetMs ?? 0)
  // 歌词对齐:居中 / 靠左(手机端样式)
  const lyricAlign = useStore((s) => s.library?.settings.lyricAlign ?? 'center')
  const leftAlign = lyricAlign === 'left'
  const dlg = useStore((s) => s.activeDialog)
  const setDlg = useStore((s) => s.setActiveDialog)
  const commentsOpen = dlg === 'comments'
  const floatLyric = useStore((s) => s.library?.settings.floatLyric ?? false)
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
          {/* 顶栏:左=收起,右=更多(避开原生窗口按钮) */}
          <div className={styles.topBar}>
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
            <div className={styles.topDrag} />
            <div style={{ width: 140, flexShrink: 0 }} />
          </div>

          {/* 主体:左右等分平衡(评论面板展开时压缩两栏最小宽,避免溢出) */}
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
                <Cover url={current?.coverUrl} size={commentsOpen ? 220 : 340} radius={16} iconSize={68} />
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
                  {current?.artist ?? ''}
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

          {/* 控制区 */}
          <div className={styles.controls}>
            {/* 实时频谱可视化(2026 播放器标配) */}
            {st?.uiModules.npSpectrum !== false && <SpectrumBars height={56} bars={64} />}
            <div className={styles.sideRow}>
              <span className={styles.timeText}>{formatTime(position)}</span>
              <NiceSlider
                value={Math.min(position, duration || 1)}
                max={Math.max(duration, 1)}
                onChange={(v) => seek(v)}
                disabled={!current}
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
                icon={playing ? <PauseRegular fontSize={24} /> : <PlayRegular fontSize={24} />}
                onClick={() => togglePlay()}
                disabled={!current}
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
                    <MenuItem
                      icon={floatLyric ? <CheckmarkRegular /> : <OpenRegular />}
                      onClick={() => void useStore.getState().updateSetting('floatLyric', !floatLyric)}
                    >
                      悬浮歌词窗
                    </MenuItem>
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
        <div className={`${styles.commentsPanel} ${commentsOpen ? styles.commentsPanelOpen : ''}`}>
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
