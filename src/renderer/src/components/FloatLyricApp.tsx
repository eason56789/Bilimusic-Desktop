/** 悬浮歌词窗(#float 路由):独立置顶小窗
 *
 * 视觉(对齐 QQ 音乐悬浮歌词):
 *  - 未悬停:只有歌词本身,无背景框/边框/阴影,完全融入桌面
 *  - 悬停:淡入深色玻璃底 + 顶部操作条
 *  - 锁定:鼠标穿透且悬停无反应,仅顶端中央热区出现解锁/设置小按钮(主进程恢复点击)
 *  - 当前行逐字走光(已唱=金色,未唱=蓝色),翻译紧随其下
 *  - 歌词过长时自动加宽窗口(主进程按需 setBounds),短句回到用户基准宽度
 *
 * 拖动/缩放:整窗为拖动区(-webkit-app-region: drag),四边四角自绘缩放热区
 *      因此渲染层收不到 mousemove,悬停由主进程轮询光标位置后推送(float:hover)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FluentProvider, Button, makeStyles } from '@fluentui/react-components'
import {
  DismissRegular,
  LockClosedRegular,
  LockOpenRegular,
  NextRegular,
  PauseRegular,
  PlayRegular,
  PreviousRegular,
  SettingsRegular,
  Speaker1Regular,
  SpeakerMuteRegular,
  ArrowLeftRegular,
  ArrowRightRegular
} from '@fluentui/react-icons'
import { api } from '../lib/api'
import { buildTheme } from '../lib/theme'
import { calcRevealChars } from '../lib/karaoke'
import type { FloatLyricState } from '@shared/types'

/** 歌词固定配色(两档主题通用,不跟随主界面深浅) */
const SUNG = '#ffd54a'
const UNSUNG = '#4d9fff'
const TRANS = '#66b3ff'
const TRANS_DIM = 'rgba(120,180,255,0.85)'

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderRadius: '14px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
    border: '1px solid transparent',
    boxShadow: 'none',
    userSelect: 'none',
    transition: 'background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease',
    // 整窗可拖动:歌词区也是拖动把手(与参考图一致)
    WebkitAppRegion: 'drag' as unknown as 'drag'
  },
  /** 悬停态:深色玻璃底淡入(未悬停完全透明) */
  rootHover: {
    background: 'rgba(16,18,24,0.72)',
    backdropFilter: 'blur(24px) saturate(1.4)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.38)'
  },
  /** 操作条:悬停时滑入,平时完全不占位也不可见 */
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    flexShrink: 0,
    padding: '3px 6px',
    background: 'rgba(0,0,0,0.22)',
    WebkitAppRegion: 'no-drag' as unknown as 'no-drag',
    transition: 'opacity 0.16s ease, max-height 0.16s ease',
    overflow: 'hidden'
  },
  barHidden: {
    opacity: 0,
    maxHeight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    visibility: 'hidden' as const,
    pointerEvents: 'none' as const
  },
  barShown: { opacity: 1, maxHeight: '40px' },
  btn: {
    minWidth: '26px',
    width: '26px',
    height: '24px',
    padding: 0,
    color: 'rgba(255,255,255,0.88)',
    ':hover': { background: 'rgba(255,255,255,0.14)' }
  },
  /** 锁定态:顶端中央解锁热区容器(主进程只在这个区域恢复点击),平时完全不可见 */
  lockZone: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    height: '34px',
    WebkitAppRegion: 'no-drag' as unknown as 'no-drag'
  },
  /** 解锁/设置小按钮组:圆角胶囊,仅悬停热区时出现 */
  lockPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px 6px',
    borderRadius: '17px',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.14)'
  },
  lyrics: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: '0 18px',
    textAlign: 'center'
  },
  current: {
    fontWeight: 700,
    lineHeight: 1.25,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    letterSpacing: '0.01em',
    textShadow: '0 1px 6px rgba(0,0,0,0.55)'
  },
  trans: {
    fontWeight: 600,
    lineHeight: 1.25,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    textShadow: '0 1px 6px rgba(0,0,0,0.5)'
  },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    whiteSpace: 'pre-line',
    textAlign: 'center'
  },
  /** 自绘缩放热区(无边框窗口拿不到系统缩放边) */
  grip: {
    position: 'absolute',
    WebkitAppRegion: 'no-drag' as unknown as 'no-drag',
    zIndex: 5
  }
})

/** 逐字走光的歌词行:rAF 直接写字符颜色(不走 React state,避免每帧重渲) */
function KaraokeLine({
  text,
  charTimes,
  lineStartMs,
  lineEndMs,
  clockRef,
  className,
  fontSize,
  sung,
  unsung
}: {
  text: string
  charTimes: number[] | null
  lineStartMs: number
  lineEndMs: number
  /** 取当前播放位置(ms)的函数:由推送的 posMs+pushedAt 插值而来 */
  clockRef: React.MutableRefObject<() => number>
  className: string
  fontSize: string
  sung: string
  unsung: string
}) {
  const chars = useMemo(() => Array.from(text), [text])
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const litRef = useRef(-1)

  useEffect(() => {
    let raf = 0
    const paint = (litFloat: number): void => {
      const total = chars.length
      const lit = Math.min(total, Math.max(0, Math.floor(litFloat)))
      const frac = litFloat - lit
      const prev = litRef.current
      if (lit !== prev) {
        const lo = Math.min(lit, prev)
        const hi = Math.max(lit, prev)
        for (let i = Math.max(0, lo); i < Math.min(total, hi); i++) {
          const el = refs.current[i]
          if (el) el.style.color = i < lit ? sung : unsung
        }
        litRef.current = lit
      }
      // 边界字符:金色→蓝色平滑过渡
      if (lit < total) {
        const b = refs.current[lit]
        if (b) b.style.color = frac > 0 ? `color-mix(in srgb, ${sung} ${Math.round(frac * 100)}%, ${unsung})` : unsung
      }
    }
    const tick = (): void => {
      paint(calcRevealChars(text, charTimes, clockRef.current(), lineStartMs, lineEndMs))
      raf = requestAnimationFrame(tick)
    }
    litRef.current = -1
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, charTimes, lineStartMs, lineEndMs, chars.length, clockRef, sung, unsung])

  return (
    <div className={className} style={{ fontSize }}>
      {chars.map((c, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          style={{ color: unsung, transition: 'color 0.12s linear' }}
        >
          {c}
        </span>
      ))}
    </div>
  )
}

type GripDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** 缩放热区:贴边 6px,四角 12px */
function gripStyle(dir: GripDir): React.CSSProperties {
  const T = 6
  const C = 14
  const base: React.CSSProperties = { position: 'absolute' }
  const cursor: Record<GripDir, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize'
  }
  const map: Record<GripDir, React.CSSProperties> = {
    n: { top: 0, left: C, right: C, height: T },
    s: { bottom: 0, left: C, right: C, height: T },
    w: { top: C, bottom: C, left: 0, width: T },
    e: { top: C, bottom: C, right: 0, width: T },
    nw: { top: 0, left: 0, width: C, height: C },
    ne: { top: 0, right: 0, width: C, height: C },
    sw: { bottom: 0, left: 0, width: C, height: C },
    se: { bottom: 0, right: 0, width: C, height: C }
  }
  return { ...base, ...map[dir], cursor: cursor[dir] }
}

/** 悬浮窗内容:状态来自主窗口推送,控制指令发回主窗口 */
function FloatContent() {
  const styles = useStyles()
  const [st, setSt] = useState<FloatLyricState | null>(null)
  const [hover, setHover] = useState(false)
  const [dragDir, setDragDir] = useState<GripDir | null>(null)

  useEffect(() => api.onFloatState?.((s) => setSt(s)) ?? (() => {}), [])
  useEffect(() => api.onFloatHover?.((inside) => setHover(inside)) ?? (() => {}), [])

  /** 位置插值:推送间隔内用本地时钟外推(播放中),暂停时冻结在推送位置 */
  const anchorRef = useRef({ posMs: 0, pushedAt: 0, rate: 1, playing: false })
  useEffect(() => {
    anchorRef.current = {
      posMs: st?.posMs ?? 0,
      pushedAt: st?.pushedAt ?? Date.now(),
      rate: st?.rate ?? 1,
      playing: !!st?.playing
    }
  }, [st])
  const clock = useRef<() => number>(() => 0)
  clock.current = () => {
    const a = anchorRef.current
    if (!a.playing) return a.posMs
    return a.posMs + (Date.now() - a.pushedAt) * a.rate
  }

  const dark = true // 歌词区固定深色,不受主界面深浅影响
  const accent = st?.accent ?? '#0f6cbd'
  const theme = useMemo(() => buildTheme(dark, accent), [accent])

  const loading = !!st?.loading
  const locked = !!st?.locked
  const send = (cmd: Parameters<NonNullable<typeof api.floatSendControl>>[0]): void => {
    api.floatSendControl?.(cmd)
  }

  const pal = { sung: SUNG, unsung: UNSUNG, trans: TRANS, transDim: TRANS_DIM }
  const scale = st?.fontScale ?? 1
  // 字号随窗口高度自适应 × 用户字号缩放
  const curSize = `calc(clamp(15px, 26vh, 34px) * ${scale})`
  const transSize = `calc(clamp(13px, 21vh, 28px) * ${scale})`

  const hasLine = !!st?.lineText
  const teaser = !hasLine && st?.hasCurrent ? st.nextText : ''
  const subLine = st?.showTrans && st?.transText ? st.transText : st?.showNextLine && hasLine ? st.nextText : ''
  const subIsTrans = !!st?.showTrans && !!st?.transText

  /** 歌词过长时自动加宽窗口:测量当前句宽度 + 两侧留白,超窗口才请求扩展 */
  const lyricsRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<{ key: string; needed: number | null }>({ key: '', needed: null })
  useEffect(() => {
    const key = `${st?.lineText ?? ''}|${scale}|${subLine}`
    if (fitRef.current.key === key) return
    fitRef.current.key = key
    const box = lyricsRef.current
    if (!box) return
    // 下一帧量:此时字符 span 已按当前字号布局
    const raf = requestAnimationFrame(() => {
      // 只量歌词行(children[0]=当前句, children[1]=翻译/下一句),不要量到操作条
      const line = box.children[0] as HTMLElement | null
      const sub = box.children[1] as HTMLElement | null
      const w1 = line?.scrollWidth ?? 0
      const w2 = sub?.scrollWidth ?? 0
      const needText = Math.max(w1, w2)
      if (!needText) {
        api.floatFitWidth?.(null)
        return
      }
      // 文本宽 + 左右 padding(36) + 余量
      const needed = Math.ceil(needText + 36 + 12)
      api.floatFitWidth?.(needed > window.innerWidth ? needed : null)
    })
    return () => cancelAnimationFrame(raf)
  }, [st?.lineText, subLine, scale, st?.hasCurrent])

  /** 自绘缩放:拖动期间直接按屏幕坐标差调整窗口尺寸 */
  const dragRef = useRef<{ dir: GripDir; sx: number; sy: number; b: { x: number; y: number; width: number; height: number } } | null>(
    null
  )
  const onGripDown = useCallback((dir: GripDir) => {
    return (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      setDragDir(dir)
      dragRef.current = {
        dir,
        sx: e.screenX,
        sy: e.screenY,
        b: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight }
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [])
  const onGripMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (!d) return
    const dx = e.screenX - d.sx
    const dy = e.screenY - d.sy
    let { x, y, width, height } = d.b
    if (d.dir.includes('e')) width = d.b.width + dx
    if (d.dir.includes('s')) height = d.b.height + dy
    if (d.dir.includes('w')) {
      width = d.b.width - dx
      x = d.b.x + dx
    }
    if (d.dir.includes('n')) {
      height = d.b.height - dy
      y = d.b.y + dy
    }
    // 最小尺寸约束(避免拖成一条线)
    const MINW = 320
    const MINH = 96
    if (width < MINW) {
      if (d.dir.includes('w')) x -= MINW - width
      width = MINW
    }
    if (height < MINH) {
      if (d.dir.includes('n')) y -= MINH - height
      height = MINH
    }
    api.floatSetBounds?.({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
  }, [])
  const onGripUp = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragDir(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已释放 */
    }
  }, [])

  const dirs: GripDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  return (
    <FluentProvider theme={theme} style={{ height: '100%', background: 'transparent' }}>
      <div className={`${styles.root} ${hover && !locked ? styles.rootHover : ''}`}>
        {locked ? (
          // 锁定:窗口鼠标穿透且悬停无任何反应;仅顶端中央热区(主进程判定)出现
          // 解锁/设置小按钮,此时主进程已临时恢复点击,两个按钮都能点
          <div className={styles.lockZone}>
            {hover ? (
              <div className={styles.lockPill}>
                <Button
                  appearance="subtle"
                  size="small"
                  className={styles.btn}
                  icon={<LockOpenRegular />}
                  title="解锁悬浮窗(恢复鼠标操作)"
                  onClick={() => send('lock')}
                />
                <Button
                  appearance="subtle"
                  size="small"
                  className={styles.btn}
                  icon={<SettingsRegular />}
                  title="歌词设置"
                  onClick={() => api.floatMenuOpen?.()}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {!locked ? (
          <div className={`${styles.bar} ${hover ? styles.barShown : styles.barHidden}`}>
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={st?.muted ? <SpeakerMuteRegular /> : <Speaker1Regular />}
              title={st?.muted ? '取消静音' : '静音'}
              onClick={() => send('mute')}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<PreviousRegular />}
              disabled={!st?.hasCurrent}
              title="上一首"
              onClick={() => send('prev')}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={loading ? <PlayRegular style={{ opacity: 0.45 }} /> : st?.playing ? <PauseRegular /> : <PlayRegular />}
              disabled={!st?.hasCurrent || loading}
              title={loading ? '音源加载中…' : st?.playing ? '暂停' : '播放'}
              onClick={() => send('toggle')}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<NextRegular />}
              disabled={!st?.hasCurrent}
              title="下一首"
              onClick={() => send('next')}
            />
            <span style={{ width: 1, height: 16, margin: '0 4px', background: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<ArrowLeftRegular />}
              disabled={!st?.hasCurrent}
              title="上一句歌词"
              onClick={() => send('prevLine')}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<ArrowRightRegular />}
              disabled={!st?.hasCurrent}
              title="下一句歌词"
              onClick={() => send('nextLine')}
            />
            <span style={{ width: 1, height: 16, margin: '0 4px', background: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<LockOpenRegular />}
              title="锁定(鼠标穿透,不挡下层操作)"
              onClick={() => send('lock')}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<SettingsRegular />}
              title="歌词设置"
              onClick={() => api.floatMenuOpen?.()}
            />
            <Button
              appearance="subtle"
              size="small"
              className={styles.btn}
              icon={<DismissRegular />}
              title="关闭悬浮窗"
              onClick={() => send('hide')}
            />
          </div>
        ) : null}

        <div className={styles.lyrics} ref={lyricsRef}>
          {st?.hasCurrent ? (
            <>
              {hasLine ? (
                <KaraokeLine
                  key={`${st.lineIndex}-${st.lineText.length}`}
                  text={st.lineText}
                  charTimes={st.charTimes ?? null}
                  lineStartMs={st.lineStartMs ?? 0}
                  lineEndMs={st.lineEndMs ?? 0}
                  clockRef={clock}
                  className={styles.current}
                  fontSize={curSize}
                  sung={pal.sung}
                  unsung={pal.unsung}
                />
              ) : (
                // 前奏/间奏:把下一句作为预告(未唱色)
                <div
                  className={styles.current}
                  style={{ fontSize: curSize, color: teaser ? pal.unsung : 'rgba(255,255,255,0.6)' }}
                >
                  {teaser || '♪'}
                </div>
              )}
              {subLine ? (
                <div
                  className={styles.trans}
                  style={{ fontSize: transSize, color: subIsTrans ? pal.trans : pal.transDim }}
                >
                  {subLine}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>{'尚未播放\n在主窗口中单击歌曲开始'}</div>
          )}
        </div>

        {/* 四边四角缩放热区(悬停/拖动时可用;锁定态窗口整体鼠标穿透) */}
        {!locked &&
          dirs.map((d) => (
            <div
              key={d}
              style={gripStyle(d)}
              onPointerDown={onGripDown(d)}
              onPointerMove={onGripMove}
              onPointerUp={onGripUp}
              onPointerCancel={onGripUp}
            />
          ))}
      </div>
    </FluentProvider>
  )
}

export function FloatLyricApp() {
  return <FloatContent />
}
