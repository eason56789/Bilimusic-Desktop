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
import { resolveTrans } from '../lib/transDecide'

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
    color: '#ffffff',
    // 当前句的柔和光晕:译文行用同一份值,两者视觉同级
    textShadow: '0 0 12px rgba(255,255,255,0.45)'
  },
  /** 倒计时圆点行(前奏未开唱) */
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    padding: '2px 0 4px'
  },
  dotsLeft: { justifyContent: 'flex-start' },
  /** 译文行:默认在原文下方另起一行。字号/字重/颜色/透明度由行内样式控制(与原文同级) */
  trans: {
    display: 'block',
    lineHeight: 1.5,
    marginTop: '2px',
    whiteSpace: 'pre-wrap'
  },
  /** 译文与原文同一行(紧跟其后) */
  transInline: {
    display: 'inline',
    marginLeft: '10px'
  },
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
  // 歌词不透明度(对齐手机端):当前句 / 非当前句 各自独立;拖动中即时生效
  const alphaCurrent = useStore((s) => s.library?.settings.lyricAlphaCurrent ?? 1)
  const alphaInactive = useStore((s) => s.library?.settings.lyricAlphaInactive ?? 0.75)
  // 译文显示模式:仅原文 / 原文+翻译 / 仅翻译
  const transMode = useStore((s) => s.library?.settings.lyricTransMode ?? 'both')
  const transScale = useStore((s) => s.library?.settings.lyricTransScale ?? 0.78)
  const transAlpha = useStore((s) => s.library?.settings.lyricTransAlpha ?? 0.8)
  const transLayout = useStore((s) => s.library?.settings.lyricTransLayout ?? 'below')
  const trans = resolveTrans(line, {
    mode: transMode,
    scale: transScale,
    alpha: transAlpha,
    layout: transLayout,
    isActive
  })

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
        // 整行统一的不透明度(当前句/非当前句),原文与译文共享 —— 这是"同级"的基础
        opacity: isActive ? alphaCurrent : alphaInactive,
        transformOrigin: leftAlign ? 'left center' : 'center'
      }}
      onClick={() => onSeek(line.timeMs)}
    >
      {countdownRemainingMs != null && countdownRemainingMs > 0 && (
        <CountdownDots remainingMs={countdownRemainingMs} left={!!leftAlign} />
      )}
      {/* 「仅翻译」模式下隐藏原文,但保留其 DOM(逐字高亮定时器仍在跑,切换模式可立即恢复) */}
      <span
        style={
          trans.hideOriginal
            ? { display: 'none' }
            : blur > 0.05
              ? { display: 'inline', filter: `blur(${blur}px)` }
              : { display: 'inline' }
        }
      >
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
      </span>
      {trans.text && (
        <span
          className={trans.inline ? styles.transInline : styles.trans}
          // 译文与原文「同级」:同一个 opacity 父级 + 同一套颜色/字重/模糊层级,
          // 看起来是同一行文字的两种语言,而不是"亮的主文 + 暗的附注"。
          //   · 颜色:当前句纯白,非当前句浅白,与原文一致
          //   · 字重:当前句 semibold,与原文 active 样式一致
          //   · 模糊:非当前句跟随分层模糊,换句时同亮同暗
          // 用户仍可用「译文不透明度」整体微调(只乘在译文上,不影响原文)。
          style={{
            fontSize: `calc(var(--lyric-size, 20px) * ${trans.scale})`,
            // 颜色严格对齐原文:当前句纯白、非当前句与 .line 的 rgba(255,255,255,0.4) 一致,
            // 这样两行是同一个亮度层级(父级 opacity 再统一缩放),不会出现
            // "亮的原文 + 暗的译文"或反之。
            color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
            fontWeight: isActive ? tokens.fontWeightSemibold : tokens.fontWeightRegular,
            // 与原文一致的分层模糊(当前句 blur 为 0,自然清晰)
            filter: blur > 0.05 ? `blur(${blur}px)` : 'none',
            // 当前句加一层柔和光晕,与原文逐字高亮的"发光"观感对齐;
            // 非当前句不加,避免远处歌词发亮抢焦点
            textShadow: isActive ? '0 0 12px rgba(255,255,255,0.45)' : 'none',
            // 与原文一致的过渡曲线,换句时不突兀
            transition:
              'color 0.45s cubic-bezier(0.22, 1, 0.36, 1), font-weight 0.45s cubic-bezier(0.22, 1, 0.36, 1), filter 0.45s cubic-bezier(0.22, 1, 0.36, 1), text-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
            opacity: trans.alpha,
            transform: 'none'
          }}
        >
          {trans.text}
        </span>
      )}
    </div>
  )
})
