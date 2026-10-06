/**
 * 歌词行(memo):非当前行纯文本;当前行为 KTV 逐字上色
 * (单层逐字 span,rAF 只写边界字符颜色,CSS transition 提供羽化过渡;
 *  对齐手机端逐字卡拉OK,天然支持换行与左/居中对齐)。
 * smoothMs 仅 active 行每帧变化,其余行 props 恒定被 memo 挡住。
 */
import { memo, useEffect, useMemo, useRef } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { calcRevealChars, resolveCharTimes, lineEndTime } from '../lib/karaoke'

const UNLIT = 'rgba(255,255,255,0.35)'
const LIT = '#ffffff'

const useStyles = makeStyles({
  line: {
    padding: '9px 16px',
    fontSize: 'var(--lyric-size, 20px)',
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.4)',
    transition:
      'color 0.45s cubic-bezier(0.22, 1, 0.36, 1), font-size 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), filter 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
    whiteSpace: 'pre-wrap',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    ':hover': {
      color: 'rgba(255,255,255,0.75)',
      background: 'rgba(255,255,255,0.05)'
    }
  },
  active: {
    fontSize: 'calc(var(--lyric-size, 20px) * 1.2)',
    fontWeight: tokens.fontWeightSemibold,
    transform: 'scale(1.04)',
    color: '#ffffff'
  },
  /** 倒计时圆点行(前奏未开唱) */
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    padding: '2px 0 4px'
  },
  dotsLeft: { justifyContent: 'flex-start' },
  dotWrap: {
    display: 'inline-flex',
    transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease'
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.9)',
    animation: 'ktv-dot-breathe 1.4s ease-in-out infinite'
  }
})

/** 剥离行首行尾音乐装饰符号(♪♫等) */
function cleanEdge(t: string): string {
  return t.replace(/^[\s♪♫♬♩🎵🎶]+/, '').replace(/[\s♪♫♬♩🎵🎶]+$/, '') || t
}

/** 前奏卡拉OK倒计时圆点:剩 3/2/1s 依次点亮,整体呼吸(对齐手机端) */
function CountdownDots({ remainingMs, left }: { remainingMs: number; left: boolean }) {
  const styles = useStyles()
  const thresholds = [3000, 2000, 1000]
  return (
    <div className={`${styles.dots} ${left ? styles.dotsLeft : ''}`} aria-hidden>
      {thresholds.map((th, i) => {
        const lit = remainingMs <= th
        return (
          <span
            key={th}
            className={styles.dotWrap}
            style={{ opacity: lit ? 1 : 0.22, transform: lit ? 'scale(1.2)' : 'scale(1)' }}
          >
            <span className={styles.dot} style={{ animationDelay: `${i * 0.15}s` }} />
          </span>
        )
      })}
    </div>
  )
}

/**
 * 当前句逐字上色:rAF 读音频时钟 → calcRevealChars 得到已唱字符浮点数 →
 * 只把「边界字符」与跨过区间的字符颜色写到 DOM(不走 React state,每帧 0-2 次 DOM 写)。
 */
function KaraokeChars({
  text,
  charTimes,
  lineStartMs,
  lineEndMs,
  left
}: {
  text: string
  charTimes: number[] | null
  lineStartMs: number
  lineEndMs: number
  left: boolean
}) {
  const styles = useStyles()
  const chars = useMemo(() => Array.from(text), [text])
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const litRef = useRef(-1)
  // 歌词偏移极少变化,订阅它而不经 props(避免每帧重渲)
  const offset = useStore((s) => s.library?.settings.lyricOffsetMs ?? 0)

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
          if (el) el.style.color = i < lit ? LIT : UNLIT
        }
        litRef.current = lit
      }
      if (lit < total) {
        const b = refs.current[lit]
        if (b) b.style.color = `rgba(255,255,255,${(0.35 + 0.65 * frac).toFixed(3)})`
      }
    }
    const tick = (): void => {
      const now = getAudioElement().currentTime * 1000 + 200 - offset
      paint(calcRevealChars(text, charTimes, now, lineStartMs, lineEndMs))
      raf = requestAnimationFrame(tick)
    }
    litRef.current = -1
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, charTimes, lineStartMs, lineEndMs, offset, chars.length])

  return (
    <span style={{ color: UNLIT, display: left ? 'inline' : undefined }}>
      {chars.map((c, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          style={{ transition: 'color 0.16s linear' }}
        >
          {c}
        </span>
      ))}
    </span>
  )
}

export interface LyricLineRowProps {
  line: LyricLine
  isActive: boolean
  /** 距当前句的距离决定的模糊像素(0=不模糊) */
  blur: number
  /** 下一行起始 ms(行末推进窗口) */
  nextTimeMs: number
  /** 前奏倒计时剩余 ms(仅首行且未开唱时传) */
  countdownRemainingMs?: number | null
  /** 靠左样式(手机端) */
  leftAlign?: boolean
  /** active 行的 DOM 注册(父级滚动定位用) */
  registerActive?: (el: HTMLDivElement | null) => void
  onSeek: (timeMs: number) => void
}

export const LyricLineRow = memo(function LyricLineRow({
  line,
  isActive,
  blur,
  nextTimeMs,
  countdownRemainingMs,
  leftAlign,
  registerActive,
  onSeek
}: LyricLineRowProps) {
  const styles = useStyles()
  const text = cleanEdge(line.text)

  // 逐字时间轴:wordTimes 等长直接用;否则由 words 展开并对齐 trim 偏移
  const charTimes = useMemo(
    () => (isActive ? resolveCharTimes(line.text, line.wordTimes, line.words) : null),
    [isActive, line]
  )
  const endMs = useMemo(() => lineEndTime(line.timeMs, nextTimeMs), [line.timeMs, nextTimeMs])

  return (
    <div
      ref={isActive ? registerActive : undefined}
      className={`song-lyric-line ${styles.line} ${isActive ? styles.active : ''}`}
      style={{
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        transformOrigin: leftAlign ? 'left center' : 'center'
      }}
      onClick={() => onSeek(line.timeMs)}
    >
      {countdownRemainingMs != null && countdownRemainingMs > 0 && (
        <CountdownDots remainingMs={countdownRemainingMs} left={!!leftAlign} />
      )}
      {isActive ? (
        <KaraokeChars
          key={`${line.timeMs}-${text.length}`}
          text={text}
          charTimes={charTimes}
          lineStartMs={line.timeMs}
          lineEndMs={endMs}
          left={!!leftAlign}
        />
      ) : (
        text
      )}
    </div>
  )
})
