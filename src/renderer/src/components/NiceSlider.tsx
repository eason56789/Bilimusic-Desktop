/** 现代圆角进度/音量条:实心轨道 + 悬停放大手柄(替代 Fluent 默认虚线滑条) */
import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

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

export function NiceSlider({
  value,
  max,
  onChange,
  onCommit,
  live = false,
  trackHeight = 4,
  hoverHeight = 8,
  width,
  disabled = false,
  ariaLabel
}: {
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
}) {
  const styles = useStyles()
  const ref = useRef<HTMLDivElement>(null)
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

  return (
    <div
      ref={ref}
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
}
