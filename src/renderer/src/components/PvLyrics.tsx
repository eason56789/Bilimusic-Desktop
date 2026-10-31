/**
 * 文字PV 歌词舞台:整屏「歌词即画面」。
 *
 * 管线(严格对齐 folia-major 的 sonnet):
 *   歌词行 → 分词(pvSegment) → 排版(pvLayout) → 字形布局(pvGlyph:绝对坐标) → 运动学(pvMotion)
 *
 * 不鬼畜的三个关键(这是参照 folia 源码后重写的原因):
 *  1. **字级绝对坐标**:每个字的位置在布局阶段一次算好,rAF 只做
 *     `pos = base + enter*(1-p)` 的加法,不再嵌套多层 transform(嵌套会累积误差、放大抖动)
 *  2. **expoOut 入场**:快起慢收,是有"打击感"的落定,而不是 smooth 的软绵绵
 *  3. **克制量级**:入场位移 ≤0.24em、旋转 ≤2°、镜头位移为画布比例的个位数百分比
 *
 * 每帧只写 opacity / transform(translate + scale),不触发布局,不重建 DOM。
 */
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { makeStyles } from '@fluentui/react-components'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { lineEndTime } from '../lib/karaoke'
import { resolveTrans } from '../lib/transDecide'
import { segmentLine } from '../lib/pvSegment'
import { layoutLyrics, pickLayoutKind, normalizeKind, type PvPlacement } from '../lib/pvLayout'
import { buildGlyphs, type PvGlyph } from '../lib/pvGlyph'
import { breathAt, cameraAt, glyphProgress, clamp01 } from '../lib/pvMotion'
import { layoutCladdagh, layoutPartita, layoutStill, type ArcGlyph, type PartitaWordBox } from '../lib/pvArrange'
import { TemperaLyrics } from './TemperaLyrics'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    isolation: 'isolate'
  },
  /** 舞台:所有字形以中心为原点绝对定位 */
  stage: {
    position: 'absolute',
    inset: 0,
    willChange: 'transform',
    transformOrigin: 'center center'
  },
  /** 单个字形:绝对定位到布局坐标,rAF 只改 transform/opacity */
  glyph: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    willChange: 'transform, opacity',
    // 字宽度量与 canvas 接近:不设 letter-spacing,避免布局阶段与实际渲染不符
    letterSpacing: 0
  },
  /** 装饰巨字:空心描边 */
  glyphDecor: {
    fontWeight: 900,
    color: 'transparent'
  },
  /** 装饰:细网格 */
  grid: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    opacity: 0.22,
    backgroundImage:
      'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
    backgroundSize: '58px 58px',
    maskImage: 'radial-gradient(circle at 50% 50%, black 16%, transparent 74%)',
    WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 16%, transparent 74%)'
  },
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 'min(74vh, 640px)',
    aspectRatio: '1',
    marginLeft: 'calc(min(74vh, 640px) / -2)',
    marginTop: 'calc(min(74vh, 640px) / -2)',
    borderRadius: '50%',
    pointerEvents: 'none',
    animation: 'pv-ring-breathe 9s ease-in-out infinite'
  },
  corner: { position: 'absolute', width: '44px', height: '44px', pointerEvents: 'none' },
  marker: {
    position: 'absolute',
    top: '7%',
    left: '5%',
    fontSize: '11px',
    letterSpacing: '0.34em',
    color: 'rgba(255,255,255,0.38)',
    pointerEvents: 'none',
    zIndex: 3
  },
  side: {
    position: 'absolute',
    right: '4%',
    top: '50%',
    transform: 'translateY(-50%)',
    writingMode: 'vertical-rl',
    fontSize: '11px',
    letterSpacing: '0.42em',
    color: 'rgba(255,255,255,0.2)',
    maxHeight: '66%',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 3
  },
  /** 底部字幕:译文 / 下一句 */
  sub: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '4%',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 500,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    zIndex: 3
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    lineHeight: 1.7
  }
})

export interface PvLyricsProps {
  lines: LyricLine[]
  activeIdx: number
  smoothMs: number
}

/**
 * 错误边界:PV 排版是纯计算,异常歌词数据可能抛错。
 * 兜住后只让 PV 区域空白,不连累整个全屏页。
 */
class PvErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(e: unknown): void {
    console.warn('[PvLyrics] render failed, fallback', e)
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** 判断一句是不是副歌(有标记用标记,否则靠强度启发式) */
function isChorusLine(line: LyricLine | null): boolean {
  if (!line) return false
  return /副歌|chorus|サビ/i.test(line.text)
}

const LIT = '#ffffff'
/** 未唱:比之前的 0.22 略提亮,避免整屏只有几个字在亮、观感发闷 */
const DIM = 'rgba(255,255,255,0.26)'

export function PvLyrics({ lines, activeIdx, smoothMs }: PvLyricsProps): JSX.Element {
  const styles = useStyles()
  const settings = useStore((s) => s.library?.settings)
  const offset = settings?.lyricOffsetMs ?? 0
  const scale = settings?.pvScale ?? 1
  const decor = settings?.pvDecor !== false
  const motion = settings?.pvMotion ?? 1
  const transMode = settings?.lyricTransMode ?? 'both'
  const transScale = settings?.lyricTransScale ?? 0.78
  const transAlpha = settings?.lyricTransAlpha ?? 0.8
  const accentRaw = settings?.pvAccent?.trim()
  const accent =
    accentRaw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentRaw) ? accentRaw : settings?.accent || '#7aa2ff'

  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 620 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measureNow = (): void => {
      setSize({ w: el.clientWidth || 900, h: el.clientHeight || 620 })
    }
    const ro = new ResizeObserver(measureNow)
    ro.observe(el)
    measureNow()
    return () => ro.disconnect()
  }, [])

  const active = activeIdx >= 0 ? lines[activeIdx] : null
  const display = active ?? lines[0] ?? null
  const next = activeIdx >= 0 ? lines[activeIdx + 1] : lines[1]
  const endMs = display ? lineEndTime(display.timeMs, lines[activeIdx + 1]?.timeMs) : 0

  // ===== 编译:分词 → 选版式 → 排版 → 字形绝对坐标(按句缓存) =====
  const arrange = settings?.pvArrange ?? 'pv'
  const compiled = useMemo(() => {
    if (!display) return null
    const segs = segmentLine(display, endMs)
    if (segs.length === 0) return null
    const wordCount = segs.filter((s) => s.isWordLike).length
    const stored = settings?.pvLayout ?? 'auto'
    const kind =
      stored === 'auto'
        ? pickLayoutKind(`${display.timeMs}:${display.text}`, isChorusLine(display), wordCount)
        : normalizeKind(stored)
    const placements: PvPlacement[] = layoutLyrics({
      segments: segs,
      kind,
      width: size.w,
      height: size.h,
      fontScale: scale
    })
    const dur = Math.max(400, endMs - display.timeMs)
    // 字形坐标只依赖 placements 与时长:同一句内保持稳定,不会每帧抖动
    const glyphs = buildGlyphs(placements, dur)
    /** 云阶/回环/时计:整行换一种摆法(与 PV 的镜头版式并存) */
    const baseFont = Math.max(28, Math.min(96, (size.w / Math.max(7, wordCount * 2.15)) * scale))
    const partitaBoxes =
      arrange === 'partita'
        ? layoutPartita(display.text, size.w, size.h, baseFont, `${display.timeMs}:${display.text}`)
        : []
    const arcGlyphs =
      arrange === 'claddagh' ? layoutCladdagh(display.text, size.w, size.h, baseFont * 0.92) : []
    const stillLines = arrange === 'still' ? layoutStill(lines, activeIdx) : []
    return { kind, placements, glyphs, dur, baseFont, partitaBoxes, arcGlyphs, stillLines }
  }, [display, endMs, size.w, size.h, scale, settings?.pvLayout, arrange, lines, activeIdx])

  // ===== 渲染:rAF 直接写 style =====
  const stageRef = useRef<HTMLDivElement>(null)
  const glyphRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const stageEl = stageRef.current
    // 只有逐字 PV 需要每帧驱动;云阶/回环/时计是静态排版(不跑 rAF,省电且绝对不抖)
    if (arrange !== 'pv') return
    if (!display || !compiled || !stageEl) return
    const glyphs = compiled.glyphs
    let raf = 0
    /** 上一帧的镜头值:用于检测是否需要写 transform(静止时省掉无意义写入) */
    let lastCam = ''
    const startMs = display.timeMs
    const dur = compiled.dur

    const paint = (): void => {
      const el = getAudioElement()
      const now = el.currentTime * 1000 + 200 - offset
      const p = clamp01((now - startMs) / dur)

      // ---- 镜头:轨迹 + 极轻呼吸(整曲时间,句子之间不断档) ----
      const cam = cameraAt(compiled.kind as Parameters<typeof cameraAt>[0], p, motion)
      const br = breathAt(now / 1000, motion)
      const camX = (cam.x + br.x) * size.w
      const camY = (cam.y + br.y) * size.h
      const camScale = cam.scale + br.scale
      const camRot = (cam.rotation + br.rotation) * 57.2958
      const camKey = `${camX.toFixed(1)}|${camY.toFixed(1)}|${camScale.toFixed(4)}|${camRot.toFixed(2)}`
      if (camKey !== lastCam) {
        lastCam = camKey
        stageEl.style.transform = `translate3d(${camX.toFixed(1)}px, ${camY.toFixed(1)}px, 0) scale(${camScale.toFixed(
          4
        )}) rotate(${camRot.toFixed(2)}deg)`
      }

      // ---- 逐字:位置 = 绝对坐标 + 入场残余位移(纯加法,无嵌套) ----
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i]
        const node = glyphRefs.current[i]
        if (!node) continue
        const gp = glyphProgress(now, g.startTime, g.settleTime)
        const waiting = now < g.startTime
        // 1-p 线性衰减:落定后严格归零,不会持续"抖"
        const remain = 1 - gp
        const x = g.baseX + g.enterX * remain
        const y = g.baseY + g.enterY * remain
        const rot = g.entryRotation * remain
        // 缩放:hero 在 type-impact 下从 0.52 起,其余 0.86 起(对齐 folia)
        const from = g.isHero && compiled.kind === 'type-impact' ? 0.52 : 0.86
        const sc = from + (1 - from) * gp
        // 透明度:0.16 起(不是 0),入场即有实体感
        const alpha = waiting ? 0 : 0.16 + gp * 0.84
        node.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(
          2
        )}px), 0) rotate(${rot.toFixed(4)}rad) scale(${sc.toFixed(3)})`
        node.style.opacity = alpha.toFixed(3)
        // 逐字卡拉OK上色:已唱=白,未唱=暗
        if (!g.isDecoration) {
          node.style.color = waiting ? DIM : LIT
        }
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [arrange, display, compiled, offset, motion, size.w, size.h])

  // 换句:清空 refs(字形数组会整体重建)
  useEffect(() => {
    glyphRefs.current = []
  }, [compiled])

  if (!display) {
    return (
      <div className={styles.root} ref={boxRef}>
        <div className={styles.empty}>{'♪\n暂无歌词\n可通过右上角菜单编辑或导入歌词'}</div>
      </div>
    )
  }

  const trans = resolveTrans(display, {
    mode: transMode,
    scale: transScale,
    alpha: transAlpha,
    layout: 'below',
    isActive: true
  })
  const subText = trans.text || (next ? next.text : '')

  return (
    <div className={styles.root} ref={boxRef}>
      {/* ===== 背景装饰 ===== */}
      {decor ? (
        <>
          <div className={styles.grid} />
          <div
            className={styles.ring}
            style={{ border: `1px solid ${accent}2e`, boxShadow: `inset 0 0 150px ${accent}12` }}
          />
          {[
            { top: '6%', left: '4%', borderTop: `1px solid ${accent}4a`, borderLeft: `1px solid ${accent}4a` },
            { top: '6%', right: '4%', borderTop: `1px solid ${accent}4a`, borderRight: `1px solid ${accent}4a` },
            { bottom: '6%', left: '4%', borderBottom: `1px solid ${accent}4a`, borderLeft: `1px solid ${accent}4a` },
            { bottom: '6%', right: '4%', borderBottom: `1px solid ${accent}4a`, borderRight: `1px solid ${accent}4a` }
          ].map((pos, i) => (
            <div key={i} className={styles.corner} style={pos as React.CSSProperties} />
          ))}
          <div className={styles.marker}>
            {String(Math.max(1, activeIdx + 1)).padStart(2, '0')} · {String(lines.length).padStart(2, '0')}
          </div>
          <div className={styles.side}>{display.text.replace(/\s+/g, '').slice(0, 14)}</div>
        </>
      ) : null}

      {/* ===== 舞台:每个字绝对定位(逐字 PV) ===== */}
      {arrange === 'pv' ? (
        <div className={styles.stage} ref={stageRef}>
          {(compiled?.glyphs ?? []).map((g: PvGlyph, i) => (
            <span
              key={`${i}-${g.char}-${g.startTime}`}
              ref={(el) => {
                glyphRefs.current[i] = el
              }}
              className={`${styles.glyph} ${g.isDecoration ? styles.glyphDecor : ''}`}
              style={{
                fontSize: `${g.fontSize}px`,
                // 初始位置先写好,避免首帧跳到 (0,0)
                transform: `translate3d(calc(-50% + ${g.baseX}px), calc(-50% + ${g.baseY}px), 0)`,
                opacity: 0,
                color: g.isDecoration ? 'transparent' : DIM,
                WebkitTextStroke: g.isDecoration ? `1.5px ${accent}3d` : undefined,
                textShadow: g.isDecoration
                  ? 'none'
                  : g.isHero
                    ? `0 0 30px ${accent}44, 0 2px 10px rgba(0,0,0,0.45)`
                    : '0 1px 8px rgba(0,0,0,0.35)'
              }}
            >
              {g.char === ' ' ? '\u00a0' : g.char}
            </span>
          ))}
        </div>
      ) : null}

      {/* ===== 云阶:整行切词,按字数分栏竖直排布(对齐 folia partita) ===== */}
      {arrange === 'partita' ? (
        <div className={styles.stage}>
          {(compiled?.partitaBoxes ?? []).map((b: PartitaWordBox, i) => (
            <span
              key={`${i}-${b.text}`}
              className={styles.glyph}
              style={{
                fontSize: `${Math.round((compiled?.baseFont ?? 40) * b.fontScale)}px`,
                transform: `translate3d(calc(-50% + ${b.x.toFixed(1)}px), calc(-50% + ${b.y.toFixed(
                  1
                )}px), 0) rotate(${b.rotation.toFixed(4)}rad)`,
                color: LIT,
                // 栏内首词(每栏第一块)作为强调:略亮
                opacity: 1,
                textShadow: `0 0 22px ${accent}3a, 0 2px 9px rgba(0,0,0,0.42)`
              }}
            >
              {b.text}
            </span>
          ))}
        </div>
      ) : null}

      {/* ===== 回环:整行沿圆弧排布,字随切线旋转(对齐 folia claddagh) ===== */}
      {arrange === 'claddagh' ? (
        <div className={styles.stage}>
          {(compiled?.arcGlyphs ?? []).map((g: ArcGlyph, i) => (
            <span
              key={`${i}-${g.char}`}
              className={styles.glyph}
              style={{
                fontSize: `${Math.round((compiled?.baseFont ?? 40) * 0.92)}px`,
                transform: `translate3d(calc(-50% + ${g.x.toFixed(1)}px), calc(-50% + ${g.y.toFixed(
                  1
                )}px), 0) rotate(${g.rotation.toFixed(4)}rad)`,
                color: LIT,
                textShadow: `0 0 20px ${accent}33, 0 2px 9px rgba(0,0,0,0.42)`
              }}
            >
              {g.char === ' ' ? '\u00a0' : g.char}
            </span>
          ))}
        </div>
      ) : null}

      {/* ===== 时计:静态三行,只做字号与透明度区分(对齐 folia still) ===== */}
      {arrange === 'still' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.6rem',
            padding: '0 8%',
            pointerEvents: 'none',
            zIndex: 2
          }}
        >
          {(compiled?.stillLines ?? []).map((l, i) => {
            const cur = l.offset === 0
            return (
              <div
                key={`${i}-${l.text}`}
                style={{
                  fontSize: `${Math.round((compiled?.baseFont ?? 40) * (cur ? 1.15 : 0.72))}px`,
                  fontWeight: cur ? 700 : 600,
                  color: cur ? LIT : 'rgba(255,255,255,0.3)',
                  textAlign: 'center',
                  lineHeight: 1.28,
                  textShadow: cur ? `0 0 24px ${accent}3a, 0 2px 9px rgba(0,0,0,0.42)` : 'none',
                  maxWidth: '100%',
                  wordBreak: 'break-word'
                }}
              >
                {l.text}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* ===== 底部字幕 ===== */}
      {subText ? (
        <div
          className={styles.sub}
          style={{ fontSize: `${Math.round(18 * scale)}px`, opacity: trans.text ? trans.alpha : 0.75 }}
        >
          {subText}
        </div>
      ) : null}
    </div>
  )
}

/** 对外入口:带错误边界的 PV 歌词(失败时静默降级) */
export function PvLyricsSafe(props: PvLyricsProps): JSX.Element {
  // 凝彩走独立组件(构图层与反相混合需要另一套 DOM 结构,不能和逐字舞台共用)
  const arrange = useStore((s) => s.library?.settings.pvArrange ?? 'pv')
  return (
    <PvErrorBoundary
      fallback={
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.45)'
          }}
        >
          歌词排版渲染失败(可在歌词样式里切回经典)
        </div>
      }
    >
      {arrange === 'tempera' ? (
        // 凝彩自己铺满(无需额外定位上下文)
        <TemperaLyrics lines={props.lines} activeIdx={props.activeIdx} />
      ) : (
        <PvLyrics {...props} />
      )}
    </PvErrorBoundary>
  )
}
