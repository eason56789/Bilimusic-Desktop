/** 现代圆角进度/音量条:实心轨道 + 悬停放大手柄(替代 Fluent 默认虚线滑条) */
import { forwardRef, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import type { HighlightPoint } from '@shared/types'

const useStyles = makeStyles({
  hit: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    touchAction: 'none',
    userSelect: 'none'
  },
  track: {
    position: 'relative',
    width: '100%',
    borderRadius: '999px',
    background: 'rgba(128,128,128,0.32)',
    overflow: 'visible',
    transition: 'height 0.12s ease'
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '999px',
    background: `linear-gradient(90deg, ${tokens.colorBrandBackground}, ${tokens.colorBrandForeground2})`,
    transition: 'width 0.08s linear'
  },
  /** 高潮点:轨道上的小圆点标记(点,不是段;白色) */
  mark: {
    position: 'absolute',
    top: '50%',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 0 4px rgba(255,255,255,0.55)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none'
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
    transform: 'translate(-50%, -50%)',
    transition: 'width 0.12s ease, height 0.12s ease',
    pointerEvents: 'none'
  }
})

export interface NiceSliderProps {
  value: number
  max: number
  onChange: (v: number) => void
  /** 拖动结束(或键盘操作)时回调最终值,用于落盘等一次性动作 */
  onCommit?: (v: number) => void
  /** 拖动时实时回调(音量),否则松手才回调(进度) */
  live?: boolean
  trackHeight?: number
  hoverHeight?: number
  width?: string | number
  disabled?: boolean
  ariaLabel?: string
  /** 高潮点(副歌/高潮段起点):毫秒时间点,轨道上画圆点 */
  highlights?: HighlightPoint[]
}

/**
 * 为什么是 forwardRef:Fluent 的 Tooltip 会给子元素挂 ref 去测量定位锚点。
 * 普通函数组件接不了 ref,React 会报 "Function components cannot be given refs",
 * 悬浮提示也拿不到锚点(位置会飘)。这里把外部 ref 转给底层那个可交互的 div。
 */
export const NiceSlider = forwardRef<HTMLDivElement, NiceSliderProps>(function NiceSlider(
  {
    value,
    max,
    onChange,
    onCommit,
    live = false,
    trackHeight = 4,
    hoverHeight = 8,
    width,
    disabled = false,
    ariaLabel,
    highlights
  }: NiceSliderProps,
  forwardedRef
) {
  const styles = useStyles()
  const ref = useRef<HTMLDivElement | null>(null)
  /** 内部量坐标与被 Tooltip 挂 ref 的是同一个元素,这里把两个 ref 合流 */
  const setHitRef = (node: HTMLDivElement | null): void => {
    ref.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    // React 把 ForwardedRef 收窄成只读 RefObject,这里要写入,显式转成可变 ref
    else if (forwardedRef) (forwardedRef as MutableRefObject<HTMLDivElement | null>).current = node
  }
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [dragVal, setDragVal] = useState(0)

  const safeMax = max > 0 ? max : 1
  const cur = dragging ? dragVal : Math.min(value, safeMax)
  const pct = Math.min(100, Math.max(0, (cur / safeMax) * 100))

  const posToVal = (clientX: number): number => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * safeMax
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    const v = posToVal(e.clientX)
    setDragVal(v)
    if (live) onChange(v)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging || disabled) return
    const v = posToVal(e.clientX)
    setDragVal(v)
    if (live) onChange(v)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    // 直接用事件坐标计算,避免快速点击时 state 尚未更新读到旧值
    const v = posToVal(e.clientX)
    setDragVal(v)
    setDragging(false)
    if (!live) onChange(v)
    onCommit?.(v)
  }

  /** 键盘操作(可访问性):←/→ 与 ↑/↓ 微调,Home/End 到两端 */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    const step = safeMax / 20
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(safeMax, cur + step)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, cur - step)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = safeMax
    if (next == null) return
    e.preventDefault()
    e.stopPropagation()
    onChange(next)
    onCommit?.(next)
  }

  const showThumb = hover || dragging
  const thumbSize = dragging ? 14 : hover ? 12 : 10
  const h = hover || dragging ? hoverHeight : trackHeight

  /** 高潮点位置(%):2% 内的点合并,避免糊成一片 */
  const markPcts: number[] = []
  for (const s of highlights ?? []) {
    const at = (s.timeMs / 1000 / safeMax) * 100
    if (!isFinite(at) || at < 0 || at >= 100) continue
    if (markPcts.some((p) => Math.abs(p - at) < 2)) continue
    markPcts.push(at)
  }

  return (
    <div
      ref={setHitRef}
      className={styles.hit}
      style={{ height: '18px', width: width ?? '100%', borderRadius: '999px' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onKeyDown={onKeyDown}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(cur)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <div className={styles.track} style={{ height: `${h}px` }}>
        <div className={styles.fill} style={{ width: `${pct}%`, opacity: disabled ? 0.5 : 1 }} />
        {/* 高潮点:轨道上的圆点标记(点,不是段) */}
        {markPcts.map((at) => (
          <div
            key={at}
            className={styles.mark}
            style={{ left: `${at}%`, opacity: disabled ? 0.4 : 1 }}
            title="高潮点"
          />
        ))}
        {!disabled && (
          <div
            className={styles.thumb}
            style={{
              left: `${pct}%`,
              width: `${showThumb ? thumbSize : 10}px`,
              height: `${showThumb ? thumbSize : 10}px`
            }}
          />
        )}
      </div>
    </div>
  )
})
