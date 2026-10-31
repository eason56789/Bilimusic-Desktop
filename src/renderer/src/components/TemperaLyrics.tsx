/**
 * 凝彩(Tempera)完整复刻:帧级运镜 + 构图块 stagger + 深度视差 + 反相。
 *
 * 逐条对照 folia-major 的 temperaSceneBuilder / temperaShotFrame / temperaBlocks /
 * temperaTextView / temperaCamera / temperaMotion 搬运。
 *
 * 图层顺序(从后到前,严格对齐源码的 display list):
 *   1. 纸底 + 纸面网点(screentone,alpha 0.05)
 *   2. 通栏晕影(overlay)
 *   3. 构图色块(块级 stagger)
 *   4. 水印巨字(alpha 0.16,在滤镜之下 —— 字会反相压过它)
 *   5. 文字层:**差分滤镜**(字形 + 投影 + 残影都在这一层,一起反相)
 *   6. 边缘碎片字(alpha 0.42)
 *
 * 关键机制:
 *  - 块级 stagger: alpha = base * easeEnter((t-delay)/span),位置 = base + enter*(1-e) + drift*creep
 *  - 字形深度: 大字号领跑镜头、小字号滞后并更暗(FAR_GLYPH_ALPHA)
 *  - 反相: mix-blend-mode: difference,保证字压在任何色块上都可读
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles } from '@fluentui/react-components'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { lineEndTime } from '../lib/karaoke'
import { resolveTrans } from '../lib/transDecide'
import { layoutTemperaWords, type TemperaWord } from '../lib/tempera'
import {
  LIGHT_PALETTE,
  DARK_PALETTE,
  buildPalette,
  dotGrid,
  hash01,
  hashSeed,
  luminance,
  polyPath,
  wavyPath,
  scribblePath,
  type TemperaPalette
} from '../lib/temperaPrims'
import { buildComposition, pickKind, SHOT_PROFILES, type TemperaKind, type ShapeItem } from '../lib/temperaShots'

/** 一句编译后的完整场景(构图块 + 逐字 + 装饰),prev/cur 两份共用这个形状 */
interface CompiledScene {
  kind: TemperaKind
  profile: (typeof SHOT_PROFILES)[TemperaKind]
  words: TemperaWord[]
  shapes: ShapeItem[]
  flowAngle: number
  dur: number
  startMs: number
  unloadMs: number
  seed: number
  phase: number
}

/* ===================== 运动学常量(对齐 temperaBlocks / temperaMotion) ===================== */

/** 每个图元的 stagger 距离 = max(w,h) * 0.09 */
const CARRIER_RATE = 0.09
/** 入场缓动窗口(秒) */
const ENTER_SPAN = 1.1
/** drift:缩放 ±2%,旋转 ±0.69° */
const DRIFT_SCALE = 0.02
const DRIFT_ROTATION = 0.012
/** 字形入场:settle 最短 0.34s,窗口上限 1.35s */
const MIN_SETTLE = 0.34
const MAX_REVEAL = 1.35
/** 投影:字号倍数 + alpha */
const SHADOW_DX = 0.06
const SHADOW_DY = 0.08
const SHADOW_ALPHA = 0.34
/** 远景字更暗 */
const FAR_GLYPH_ALPHA = 0.5
const MIN_GLYPH_SHADE = 0.2
const GLYPH_LEAD_NEAR = 0.5
const GLYPH_LAG_FAR = 0.4
const GLYPH_PARALLAX_CAP = 0.07
/** 残影(echo) */
const ECHO_ALPHA = 0.5
/** 唱后字距展开量 */
const RELEASE_TRACKING = 0.055

const useStyles = makeStyles({
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    // 不能用 isolation:isolate —— 它会把 difference 的混合范围限制在本组件内
    isolation: 'auto'
  },
  camera: {
    position: 'absolute',
    inset: 0,
    willChange: 'transform',
    transformOrigin: 'center center'
  },
  layer: { position: 'absolute', inset: 0 },
  paperBg: { position: 'absolute', inset: 0 },
  /**
   * 晕影:极轻。参考图是干净的浅纸,压太重会让整幅画面发灰、文字对比全失。
   */
  vignette: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'radial-gradient(ellipse 96% 96% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.05) 86%, rgba(0,0,0,0.13) 100%)'
  },
  /** 构图 SVG:铺满容器,坐标用 px(由组件按实测尺寸写 viewBox) */
  shape: { position: 'absolute', inset: 0, width: '100%', height: '100%', willChange: 'transform, opacity' },
  /** 纸底:纯 CSS 铺满,不受 SVG viewBox 影响 */
  paperLayer: { position: 'absolute', inset: 0 },
  /** 水印巨字:压在滤镜之下,字会反相压过它 */
  watermark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    whiteSpace: 'pre',
    fontWeight: 900,
    lineHeight: 1,
    color: 'transparent',
    pointerEvents: 'none',
    willChange: 'transform'
  },
  /**
   * 文字层:**差分反相**(对齐 temperaDifferenceFilter)。
   * 源码是逐像素"选墨色还是纸色":背景亮 → 落墨;背景暗 → 落纸。这样字形天然成为
   * 色块构图的**活蒙版**,压过暗块时自动翻成纸色。
   * CSS 用 `difference` 叠白色得到的是 `|bg - 255|`,等于把明暗反转 —— 正是需要的效果,
   * 但前提是纸底必须在本层**之前**渲染(见下方图层顺序)。
   */
  textLayer: {
    position: 'absolute',
    inset: 0,
    mixBlendMode: 'difference' as unknown as 'normal',
    willChange: 'transform'
  },
  glyph: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    willChange: 'transform, opacity',
    // 纯白 + difference = 对背景做明度反转,等价于源码的"纸色/墨色二选一"
    color: '#ffffff'
  },
  glyphShadow: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    // 与字形同色:差分滤镜按**背景**决定颜色,投影自然跟随字形一起反相
    color: '#ffffff',
    pointerEvents: 'none'
  },
  glyphEcho: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    pointerEvents: 'none'
  },
  /** 边缘碎片字:不参与反相(源码放在 textLayer 外) */
  fragment: {
    position: 'absolute',
    whiteSpace: 'pre',
    fontWeight: 600,
    lineHeight: 1,
    pointerEvents: 'none'
  },
  sub: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '5%',
    textAlign: 'center',
    fontWeight: 500,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    zIndex: 6
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(160,160,158,0.9)',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    lineHeight: 1.7
  }
})

/** 缓动:长尾减速(对齐 easeTemperaEnter) */
function easeEnter(v: number): number {
  const t = Math.min(1, Math.max(0, v))
  let low = 0
  let high = 1
  let p = t
  for (let i = 0; i < 12; i++) {
    const inv = 1 - p
    const x = 3 * inv * inv * p * 0.22 + 3 * inv * p * p * 1 + p * p * p
    if (x < t) low = p
    else high = p
    p = (low + high) / 2
  }
  const inv = 1 - p
  return 3 * inv * inv * p * 1 + 3 * inv * p * p * 1 + p * p * p
}

/** 缓动:中段匀速(对齐 easeTemperaInOut) */
function easeInOut(v: number): number {
  const t = Math.min(1, Math.max(0, v))
  let low = 0
  let high = 1
  let p = t
  for (let i = 0; i < 12; i++) {
    const inv = 1 - p
    const x = 3 * inv * inv * p * 0.62 + 3 * inv * p * p * 0.32 + p * p * p
    if (x < t) low = p
    else high = p
    p = (low + high) / 2
  }
  const inv = 1 - p
  return 3 * inv * inv * p * 0 + 3 * inv * p * p * 1 + p * p * p
}

/** 轻微过冲(对齐 easeTemperaSoftBack,c = 1.42) */
function easeSoftBack(v: number): number {
  const t = Math.min(1, Math.max(0, v))
  const c = 1.42
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** 入场样式(7 种方向变体,幅度沿用布局给的距离) */
const ENTER_STYLES = ['slide', 'from-left', 'from-right', 'from-above', 'from-below', 'swing', 'stamp'] as const
type EnterStyle = (typeof ENTER_STYLES)[number]

interface EnterFrame {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
}

function resolveEnterFrame(
  style: EnterStyle,
  inp: { enterX: number; enterY: number; enterRotation: number; enterScale: number },
  travel: number,
  linear: number
): EnterFrame {
  const settle = easeSoftBack(linear)
  const uniform = inp.enterScale + (1 - inp.enterScale) * settle
  const magnitude = Math.hypot(inp.enterX, inp.enterY)
  const directional = (dirX: number, dirY: number, rotScale: number): EnterFrame => {
    const len = Math.hypot(dirX, dirY) || 1
    return {
      x: (dirX / len) * magnitude * travel,
      y: (dirY / len) * magnitude * travel,
      rotation: inp.enterRotation * rotScale * travel,
      scaleX: uniform,
      scaleY: uniform
    }
  }
  switch (style) {
    case 'from-left':
      return directional(-1, 0.12, 0.4)
    case 'from-right':
      return directional(1, -0.12, 0.4)
    case 'from-above':
      return directional(0.12, -1, 0.4)
    case 'from-below':
      return directional(-0.12, 1, 0.4)
    case 'swing':
      return {
        x: inp.enterX * 0.6 * travel,
        y: inp.enterY * 0.6 * travel,
        rotation: (inp.enterRotation + Math.sign(inp.enterRotation || 1) * 0.95) * travel,
        scaleX: uniform,
        scaleY: uniform
      }
    case 'stamp':
      return {
        x: 0,
        y: 0,
        rotation: inp.enterRotation * 0.6 * travel,
        scaleX: 1 + travel * 0.7,
        scaleY: 1 + travel * 0.7
      }
    case 'slide':
    default:
      return {
        x: inp.enterX * travel,
        y: inp.enterY * travel,
        rotation: inp.enterRotation * travel,
        scaleX: uniform,
        scaleY: uniform
      }
  }
}

/** 镜头:恒定速度与缓动混合,中段永不停顿(对齐 temperaCamera) */
function cameraAt(
  profile: { travel: number; zoomStart: number; zoomEnd: number; rotation: number },
  progress: number
): { x: number; y: number; scale: number; rotation: number } {
  const clamped = clamp01(progress)
  const eased = clamped * 0.5 + easeInOut(clamped) * 0.5
  const overshoot = Math.max(0, progress - 1) * 0.35
  const amount = eased + overshoot
  return {
    x: 0,
    y: -profile.travel * amount,
    scale: profile.zoomStart + (profile.zoomEnd - profile.zoomStart) * amount,
    rotation: profile.rotation * 0.3 * amount
  }
}

/** 呼吸:双频正弦,幅度 0.006/0.002/0.0015 */
function breathAt(time: number, phase: number): { x: number; y: number; scale: number; rotation: number } {
  const tau = time * Math.PI * 2
  return {
    x: (Math.sin(tau * 0.13 + phase) * 0.65 + Math.sin(tau * 0.31 + phase * 1.7) * 0.35) * 0.006,
    y: (Math.cos(tau * 0.11 + phase * 2.3) * 0.65 + Math.sin(tau * 0.29 + phase * 0.9) * 0.35) * 0.006,
    scale: Math.sin(tau * 0.09 + phase * 1.3) * 0.002,
    rotation: Math.sin(tau * 0.07 + phase * 2.9) * 0.0015
  }
}

/** 边缘碎片字(对齐 buildTemperaFragmentViews) */
interface Fragment {
  char: string
  x: number
  y: number
  rotation: number
  scale: number
}

function buildFragments(seed: number, text: string, palette: TemperaPalette): Fragment[] {
  const chars = Array.from(text).filter((c) => !/\s/.test(c))
  if (chars.length === 0) return []
  const count = 3 + Math.floor(hash01(seed, 4, 131) * 3)
  const out: Fragment[] = []
  for (let i = 0; i < count; i++) {
    const edge = 0.03 + hash01(seed, i, 137) * 0.13
    const fromLeft = hash01(seed, i, 141) > 0.5
    out.push({
      char: chars[Math.floor(hash01(seed, i, 149) * chars.length) % chars.length],
      x: fromLeft ? edge : 1 - edge,
      y: 0.08 + hash01(seed, i, 151) * 0.84,
      rotation: (hash01(seed, i, 157) - 0.5) * 0.5,
      scale: 0.26 + hash01(seed, i, 163) * 0.2
    })
  }
  void palette
  return out
}

export interface TemperaLyricsProps {
  lines: LyricLine[]
  activeIdx: number
}

export function TemperaLyrics({ lines, activeIdx }: TemperaLyricsProps): JSX.Element {
  const styles = useStyles()
  const settings = useStore((s) => s.library?.settings)
  const offset = settings?.lyricOffsetMs ?? 0
  const scale = settings?.pvScale ?? 1
  const motion = settings?.pvMotion ?? 1
  const showDecor = settings?.pvDecor !== false
  const accent = settings?.pvAccent ?? ''
  const transMode = settings?.lyricTransMode ?? 'both'
  const transAlpha = settings?.lyricTransAlpha ?? 0.8

  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1280, h: 720 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth || 1280, h: el.clientHeight || 720 })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const active = activeIdx >= 0 ? lines[activeIdx] : null
  const display = active ?? lines[0] ?? null
  const next = activeIdx >= 0 ? lines[activeIdx + 1] : lines[1]
  const endMs = display ? lineEndTime(display.timeMs, lines[activeIdx + 1]?.timeMs) : 0
  /**
   * 本句**实际会被卸载**的时刻:即下一句的开始时间。
   *
   * 注意不能用 endMs:它被 15s 封顶(间奏/尾奏保护),而组件在下一句开始时才切换。
   * 若拿封顶值当淡出终点,超出 15s 的那段 fadeOut 会恒为 0,整句被钉在透明度下限上
   * —— 就是"有一小段时间不透明度很低"的根因。
   */
  const unloadMs = display ? (lines[activeIdx + 1]?.timeMs ?? endMs) : 0

  /**
   * 调色板:凝彩必须**只有纸与墨**。
   *
   * 之前把 app 主题色(暖黄)混进调色板,结果文字底出现黄色块 —— 参考里根本没有彩色。
   * 所以这里固定用中性纸墨阶梯;`pvAccent` 只在用户显式填了合法 hex 时才作为纸色微调,
   * 且会被拉回同一明度,不会引入饱和色。
   */
  const palette = useMemo<TemperaPalette>(() => {
    const custom = accent.trim()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(custom)) {
      // 用户指定了纸色:仍强制中性(只取明度,不取色相)
      const l = luminance(custom)
      const paper = l > 140 ? '#cdcdcb' : '#242424'
      return buildPalette(paper, l > 140 ? '#141414' : '#ececeb')
    }
    void DARK_PALETTE
    return LIGHT_PALETTE
  }, [accent])

  // 编译:构图图元 + 逐字布局 + 水印 + 碎片(按句缓存)
  const compiled = useMemo(() => {
    if (!display) return null
    const graphemes = Array.from(display.text).filter((c) => !/\s/.test(c))
    const seedKey = `${display.timeMs}:${display.text}`
    const seed = hashSeed(seedKey)
    const isChorus = /副歌|chorus|サビ/i.test(display.text)
    const kind: TemperaKind = pickKind(seed, isChorus, graphemes.length, 0)
    const profile = SHOT_PROFILES[kind]
    const availW = size.w * profile.w
    // 基础字号(对齐 temperaSceneBuilder:width / max(5, maxGraphemes*1.05) * 1.5,夹在 34..150)
    const rawBase = Math.max(
      34,
      Math.min(150, (size.w / Math.max(5, Math.max(1, graphemes.length) * 1.05)) * 1.5)
    )
    const baseFont = rawBase * profile.fontScale * scale
    const words = layoutTemperaWords(display.text, availW, baseFont, display.timeMs, endMs, seedKey)
    // 用稳定 seed 重新指派入场样式(布局里已按字序轮换,这里保持一致)
    words.forEach((w, i) => {
      const h = hash01(seed, i, 193)
      const idx = Math.floor(h * ENTER_STYLES.length) % ENTER_STYLES.length
      w.style = ENTER_STYLES[idx]
      const prev = words[i - 1]
      if (prev && prev.style === w.style) {
        w.style = ENTER_STYLES[(ENTER_STYLES.indexOf(w.style) + 1) % ENTER_STYLES.length]
      }
    })
    const shapes = buildComposition(kind, size.w, size.h, seed, palette, showDecor, profile.rotation)

    // 水印巨字:最长的那几个字,字号 2.6~4.5 倍,alpha 0.16(对齐 buildTemperaWatermark)
    const watermark =
      showDecor && profile.mood !== 'loud' && hash01(seed, 4, 107) <= 0.62
        ? (() => {
            const src = graphemes.slice(0, 12).join('')
            if (!src) return null
            return {
              text: src,
              x: 0.28 + hash01(seed, 5, 107) * 0.44,
              y: 0.26 + hash01(seed, 6, 107) * 0.48,
              rotation: (hash01(seed, 7, 107) - 0.5) * 0.5,
              size: Math.max(48, baseFont * (2.6 + hash01(seed, 8, 107) * 1.9))
            }
          })()
        : null

    // 边缘碎片字:安静场景(quiet / 短句)才出
    const fragments =
      showDecor && (profile.mood === 'quiet' || graphemes.length <= 6)
        ? buildFragments(seed, display.text, palette)
        : []

    // 纸面网点:间距 max(26, sqrt(w*h/6000)),alpha 0.05
    const toneSpacing = Math.max(26, Math.sqrt((size.w * size.h) / 6000))
    const screentone = dotGrid(size.w, size.h, toneSpacing, 1.6)

    // 每句的 flow 角(镜头推进方向),对齐 hash01(seed,3,197)*2π
    const flowAngle = hash01(seed, 3, 197) * Math.PI * 2

    return {
      kind,
      profile,
      words,
      shapes: buildComposition(kind, size.w, size.h, seed, palette, showDecor, flowAngle),
      watermark,
      fragments,
      screentone,
      flowAngle,
      dur: Math.max(400, endMs - display.timeMs),
      /** 本句开始/被卸载的绝对时刻:交接窗口按 unload 起算 */
      startMs: display.timeMs,
      unloadMs,
      seed,
      phase: hash01(seed, 9, 173) * Math.PI * 2
    }
  }, [display, endMs, unloadMs, size.w, size.h, scale, showDecor, palette])

  /**
   * 上一句的场景(交接期间仍在场)。
   *
   * 对齐 folia 的 shot 交接:`isHandingOff = shotIndex < activeShotIndex && exit < 1`,
   * 旧 shot 在交接窗口内**继续渲染并沿 flow 推出去**,新 shot 从上游推进来。
   *
   * 这里用 React 官方的「渲染期读上一值」模式(而不是 effect + setState):
   * 若放到 effect 里,prev 会晚一帧才出现 —— 那一帧只有还没入场的新句,就是白闪。
   * 渲染期直接取 ref 里的上一份编译结果,换句的那次 render 就同时有两句。
   */
  const lastCompiledRef = useRef<CompiledScene | null>(null)
  let prevCompiled: CompiledScene | null = null
  if (compiled && lastCompiledRef.current && lastCompiledRef.current !== compiled) {
    prevCompiled = lastCompiledRef.current
  }
  useEffect(() => {
    lastCompiledRef.current = compiled
  }, [compiled])

  const cameraRef = useRef<HTMLDivElement>(null)
  const glyphRefs = useRef<(HTMLSpanElement | null)[]>([])
  const shadowRefs = useRef<(HTMLSpanElement | null)[]>([])
  const echoRefs = useRef<(HTMLSpanElement | null)[]>([])
  const shapeRefs = useRef<(SVGGElement | null)[]>([])
  const watermarkRef = useRef<HTMLSpanElement>(null)
  /** 当前句 / 上一句的整场容器:交接时两层同时在场 */
  const curSceneRef = useRef<HTMLDivElement>(null)
  const prevSceneRef = useRef<HTMLDivElement>(null)
  const prevShapeRefs = useRef<(SVGGElement | null)[]>([])

  // 逐帧:镜头(轨迹 + 呼吸 + 推镜) + 双场景交接 + 构图 stagger + 逐字(入场 + 视差)
  useEffect(() => {
    const camEl = cameraRef.current
    if (!display || !compiled || !camEl) return
    const { words, profile, dur, shapes } = compiled
    const startMs = display.timeMs
    const carry = Math.max(size.w, size.h) * CARRIER_RATE
    const shortSide = Math.min(size.w, size.h)
    // 最大字号,用于算深度(对齐 depth = clamp01((size/biggest - 0.4)/0.6))
    const biggest = words.reduce((m, w) => Math.max(m, w.fontSize), 1)

    let raf = 0
    let lastCam = ''

    const paint = (): void => {
      const now = getAudioElement().currentTime * 1000 + 200 - offset
      const p = (now - startMs) / dur
      const elapsed = (now - startMs) / 1000
      const progress = clamp01(p)

      /**
       * 句间交接(shot handoff),数值严格对照 folia temperaShotFrame.ts:
       *
       *   handoff = clamp(shotDur * 0.3, 0.4, 1.1) 秒
       *   exit    = clamp01((t - shotEnd) / handoff)
       *   travel  = exit * span * 0.55 - (1 - enter) * span * 0.32
       *   alpha   = 1 - exit          // 进场时不透明;只有退场才淡
       *   scale   = 1 - exit * 0.08
       *
       * 关键:**每个场景自带镜头**(folia 的 view.container.position 就含该 shot 的相机)。
       * 之前把相机放在共享层、按当前句计算,换句瞬间相机从旧句终点跳回新句起点,
       * 整个画面(连着上一句)跟着跳 —— 这才是"硬转"的根源。
       * 现在相机进到各场景容器里:旧句的相机继续越过终点漂移(progress>1 的 overshoot),
       * 新句的相机从自己的起点开始,两层各自连续, frame 永不跳变。
       */
      const span = Math.max(size.w, size.h)
      const curFlowX = Math.cos(compiled.flowAngle)
      const curFlowY = Math.sin(compiled.flowAngle)
      const cam = cameraAt(compiled.profile, p)
      const br = breathAt(now / 1000, compiled.phase)

      // ---- 当前句:自带相机 + 从上游推进来(front-loaded,占 handoff 的 0.8) ----
      const curScene = curSceneRef.current
      let curCamX = 0
      let curCamY = 0
      if (curScene) {
        const curVisMs = Math.max(400, compiled.unloadMs - compiled.startMs)
        const handoffMs = Math.min(1100, Math.max(400, curVisMs * 0.3))
        const enter = easeEnter(clamp01((now - startMs) / (handoffMs * 0.8)))
        const travel = -(1 - enter) * span * 0.32
        curCamX = cam.x * size.w * motion + curFlowX * travel
        curCamY = cam.y * size.h * motion + curFlowY * travel
        const camScale = (1 + (cam.scale - 1) * motion + br.scale) * (1 + br.scale * 0)
        curScene.style.transform = `translate3d(${curCamX.toFixed(1)}px, ${curCamY.toFixed(1)}px, 0) scale(${camScale.toFixed(
          4
        )}) rotate(${((cam.rotation + br.rotation) * 57.2958).toFixed(2)}deg)`
        curScene.style.opacity = '1'
      }

      // ---- 上一句:自己的相机越过终点继续漂移 + 沿 flow 推出去 + 淡出 ----
      const prevScene = prevSceneRef.current
      if (prevScene && prevCompiled) {
        const prevVisMs = Math.max(400, prevCompiled.unloadMs - prevCompiled.startMs)
        const handoffMs = Math.min(1100, Math.max(400, prevVisMs * 0.3))
        const exitP = clamp01((now - prevCompiled.unloadMs) / handoffMs)
        const exitE = easeInOut(exitP)
        const pProg = (now - prevCompiled.startMs) / Math.max(1, prevCompiled.dur)
        const pCam = cameraAt(prevCompiled.profile, pProg)
        const travel = exitE * span * 0.55
        const pfX = Math.cos(prevCompiled.flowAngle)
        const pfY = Math.sin(prevCompiled.flowAngle)
        const px = pCam.x * size.w * motion + pfX * travel
        const py = pCam.y * size.h * motion + pfY * travel
        const pScale = (1 + (pCam.scale - 1) * motion) * (1 - exitE * 0.08)
        prevScene.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) scale(${pScale.toFixed(
          4
        )}) rotate(${(pCam.rotation * 57.2958).toFixed(2)}deg)`
        prevScene.style.opacity = (1 - exitE).toFixed(3)
        prevScene.style.visibility = exitP >= 1 ? 'hidden' : 'visible'
      } else if (prevScene) {
        prevScene.style.visibility = 'hidden'
      }

      // ---- 共享镜头层:只做呼吸(全局微动),不再承担场景相机 ----
      const brX = br.x * size.w * motion
      const brY = br.y * size.h * motion
      const camKey = `${brX.toFixed(2)}|${brY.toFixed(2)}|${br.scale.toFixed(5)}|${(br.rotation * 57.2958).toFixed(3)}`
      if (camKey !== lastCam) {
        lastCam = camKey
        camEl.style.transform = `translate3d(${brX.toFixed(2)}px, ${brY.toFixed(2)}px, 0) scale(${(
          1 + br.scale
        ).toFixed(5)}) rotate(${(br.rotation * 57.2958).toFixed(3)}deg)`
        camEl.style.opacity = '1'
      }

      // ---- 构图块 stagger(对齐 temperaBlocks.updateTime) ----
      // alpha = base * easeEnter((t - delay)/span)
      // pos   = base + enter*(1-e) - flow*(behind),behind = (1-e)*carry - creep
      const creepAmt = easeInOut(progress) * carry * 0.35
      for (let i = 0; i < shapes.length; i++) {
        const node = shapeRefs.current[i]
        if (!node) continue
        const it = shapes[i]
        const e = easeEnter((elapsed - it.delay) / ENTER_SPAN)
        node.style.opacity = (it.baseAlpha * e).toFixed(3)
        if (e <= 0.001) continue
        // behind:入场时沿 flow 方向退后,落定后缓慢"creep"前移(只会移除位移,不会把图元推到画布外)
        const behind = (1 - e) * carry - creepAmt
        const drift = clamp01(elapsed / 6)
        const dx = it.enterDX * (1 - e) - curFlowX * behind + it.driftX * drift
        const dy = it.enterDY * (1 - e) - curFlowY * behind + it.driftY * drift
        // drift:缩放双正弦(±2%),只有显式要求时才加
        const float = it.driftX !== 0 || it.driftY !== 0 ? 1 + Math.sin(elapsed * 0.5 + compiled.phase) * DRIFT_SCALE : 1
        // grow:横向张开(以自身包围盒中心为轴)
        const gx = it.grow > 0 ? Math.max(0.0001, e) : float
        const gy = float
        node.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${gx.toFixed(3)}, ${gy.toFixed(3)})`
        if (it.driftX !== 0 || it.driftY !== 0) {
          node.style.transform += ` rotate(${(Math.sin(elapsed * 0.33 + compiled.phase) * DRIFT_ROTATION).toFixed(4)}rad)`
        }
      }

      // ---- 水印巨字:缓慢漂移,alpha 固定 0.16 ----
      if (watermarkRef.current) {
        const drift = Math.sin(elapsed * 0.18 + compiled.phase) * shortSide * 0.006
        watermarkRef.current.style.transform = `translate3d(calc(-50% + ${drift.toFixed(1)}px), calc(-50% + ${(
          drift * 0.6
        ).toFixed(1)}px), 0)`
      }

      // ---- 逐字:入场 + 深度视差 + 唱后 tracking(对齐 temperaShotFrame glyph) ----
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const node = glyphRefs.current[i]
        if (!node) continue
        // settle 窗口:最短 0.34s,占本字时长的 stretch 倍
        const lineDur = Math.max(0.4, dur / 1000)
        const settleAt = w.startTime + Math.max(MIN_SETTLE * 1000, (w.endTime - w.startTime) * 0.5)
        const winMs = Math.max(120, settleAt - w.startTime)
        const linear = clamp01((now - w.startTime) / winMs)
        const travel = 1 - easeEnter(linear)
        const frame = resolveEnterFrame(
          w.style as EnterStyle,
          { enterX: w.enterX, enterY: w.enterY, enterRotation: w.enterRotation, enterScale: w.enterScale },
          travel,
          linear
        )
        const reveal = clamp01((now - w.startTime) / Math.min(winMs, MAX_REVEAL * 1000))
        const alpha = easeInOut(clamp01(reveal * 2.4))
        // 唱后 tracking:整句落定后字距缓慢展开(让完成的句子"活着")
        const release = clamp01((now - w.endTime) / Math.max(500, lineDur * 1000 * 0.4))
        const track = easeInOut(release) * (w.trackingX - w.x) * RELEASE_TRACKING * 10
        // 深度视差:大字号领跑、小字号滞后并更暗
        const depth = clamp01((w.fontSize / biggest - 0.4) / 0.6)
        const lead = depth * GLYPH_LEAD_NEAR - (1 - depth) * GLYPH_LAG_FAR
        const cap = shortSide * GLYPH_PARALLAX_CAP
        const depthX = Math.max(-cap, Math.min(cap, curCamX * lead))
        const depthY = Math.max(-cap, Math.min(cap, curCamY * lead))
        const shade = Math.max(MIN_GLYPH_SHADE, FAR_GLYPH_ALPHA + depth * (1 - FAR_GLYPH_ALPHA))
        const x = w.x + frame.x + track + depthX
        const y = w.y + frame.y + depthY
        const tf = `translate3d(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(
          2
        )}px), 0) rotate(${frame.rotation.toFixed(4)}rad) scale(${frame.scaleX.toFixed(3)}, ${frame.scaleY.toFixed(3)})`
        node.style.transform = tf
        // 不乘 shade:差分反相靠**满不透明**才能得到纯纸色/纯墨色;
        // 一旦半透明,反相结果就被背景稀释成灰。远近层次交给字号和残影表达。
        node.style.opacity = alpha.toFixed(3)

        // 投影:同层,一起反相(对齐 addChildAt(shadow, 0))
        const sh = shadowRefs.current[i]
        if (sh) {
          sh.style.transform = `translate3d(calc(-50% + ${(x + w.fontSize * SHADOW_DX).toFixed(2)}px), calc(-50% + ${(
            y +
            w.fontSize * SHADOW_DY
          ).toFixed(2)}px), 0) rotate(${frame.rotation.toFixed(4)}rad) scale(${frame.scaleX.toFixed(
            3
          )}, ${frame.scaleY.toFixed(3)})`
          sh.style.opacity = (alpha * SHADOW_ALPHA).toFixed(3)
        }

        // 残影:两层,越远越淡(depth = 1 + i*0.85,alpha / (i+1.4))
        const ec = echoRefs.current[i]
        if (ec) {
          const echoTravel = 1 - easeEnter(clamp01((now - w.startTime - 90) / winMs))
          const ex = w.x + frame.x * echoTravel + track * 0.7 + depthX * 0.8
          const ey = w.y + frame.y * echoTravel + depthY * 0.8
          ec.style.transform = `translate3d(calc(-50% + ${ex.toFixed(2)}px), calc(-50% + ${ey.toFixed(
            2
          )}px), 0) rotate(${(frame.rotation * 0.8).toFixed(4)}rad) scale(${(frame.scaleX * 1.02).toFixed(3)})`
          ec.style.opacity = (alpha * ECHO_ALPHA * travel).toFixed(3)
        }
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [display, compiled, unloadMs, offset, motion, size.w, size.h])

  useEffect(() => {
    glyphRefs.current = []
    shadowRefs.current = []
    echoRefs.current = []
    shapeRefs.current = []
    prevShapeRefs.current = []
  }, [compiled, prevCompiled])

  if (!display) {
    return (
      <div className={styles.root} ref={boxRef} style={{ background: palette.paper }}>
        <div className={styles.empty}>{'♪\n暂无歌词'}</div>
      </div>
    )
  }

  const trans = resolveTrans(display, {
    mode: transMode,
    scale: settings?.lyricTransScale ?? 0.78,
    alpha: transAlpha,
    layout: 'below',
    isActive: true
  })
  const subText = trans.text || (next ? next.text : '')
  const cx = (compiled?.profile.cx ?? 0.5) - 0.5
  const cy = (compiled?.profile.cy ?? 0.5) - 0.5

  return (
    <div className={styles.root} ref={boxRef} style={{ background: palette.paper }}>
      <div className={styles.camera} ref={cameraRef}>
        {/* 纸面网点:半调印刷质感,跟着镜头一起动 */}
        <svg className={styles.layer} viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
          {/* 兜底纸底:比画布大 40%,镜头推到 1.16 倍外加 pan 也不会露出发暗的边 */}
          <rect x={-size.w * 0.2} y={-size.h * 0.2} width={size.w * 1.4} height={size.h * 1.4} fill={palette.paper} />
          <g fill={palette.tone4} fillOpacity={0.05}>
            {(compiled?.screentone ?? []).map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />
            ))}
          </g>
        </svg>

        {/* 上一句整场:交接窗口内仍渲染,沿 flow 推出去并淡出(rAF 驱动) */}
        {prevCompiled ? (
          <div
            ref={prevSceneRef}
            style={{ position: 'absolute', inset: 0, willChange: 'transform, opacity' }}
          >
            {prevCompiled.shapes.map((it, i) => (
              <svg key={i} className={styles.shape} viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
                <g
                  ref={(el) => {
                    prevShapeRefs.current[i] = el
                  }}
                  style={{ transformOrigin: '50% 50%' }}
                >
                  {it.node}
                </g>
              </svg>
            ))}
            {prevCompiled.words.map((w: TemperaWord, i) => (
              <span
                key={`pg-${i}`}
                className={styles.glyph}
                style={{
                  fontSize: `${w.fontSize}px`,
                  left: `${50 + cx * 100}%`,
                  top: `${50 + cy * 100}%`,
                  transform: `translate3d(calc(-50% + ${w.x}px), calc(-50% + ${w.y}px), 0)`,
                  opacity: 1
                }}
              >
                {w.text}
              </span>
            ))}
          </div>
        ) : null}

        {/* 当前句整场:从上游沿 flow 推进来(rAF 驱动) */}
        <div ref={curSceneRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
          {/* 构图层:每个图元独立 stagger */}
          {(compiled?.shapes ?? []).map((it, i) => (
            <svg
              key={i}
              className={styles.shape}
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="none"
            >
              <g
                ref={(el) => {
                  shapeRefs.current[i] = el
                }}
                style={{ transformOrigin: '50% 50%' }}
              >
                {it.node}
              </g>
            </svg>
          ))}
        </div>

        {/* 水印巨字:压在滤镜之下,字会反相压过它 */}
        {compiled?.watermark ? (
          <span
            ref={watermarkRef}
            className={styles.watermark}
            style={{
              fontSize: `${Math.round(compiled.watermark.size * scale)}px`,
              color: 'transparent',
              WebkitTextStroke: `0.014em ${palette.tone4}`,
              opacity: 0.16,
              transform: `translate3d(-50%, -50%, 0) rotate(${compiled.watermark.rotation.toFixed(3)}rad)`,
              left: `${compiled.watermark.x * 100}%`,
              top: `${compiled.watermark.y * 100}%`
            }}
          >
            {compiled.watermark.text}
          </span>
        ) : null}

        {/* 文字层:整层差分反相(字形 + 投影 + 残影一起反相) */}
        <div className={styles.textLayer}>
          {/* 投影:先画,压在字形下面 */}
          {(compiled?.words ?? []).map((w: TemperaWord, i) => (
            <span
              key={`sh-${i}`}
              ref={(el) => {
                shadowRefs.current[i] = el
              }}
              className={styles.glyphShadow}
              style={{
                fontSize: `${w.fontSize}px`,
                left: `${50 + cx * 100}%`,
                top: `${50 + cy * 100}%`,
                opacity: 0
              }}
            >
              {w.text}
            </span>
          ))}
          {(compiled?.words ?? []).map((w: TemperaWord, i) => (
            <span
              key={`gl-${i}`}
              ref={(el) => {
                glyphRefs.current[i] = el
              }}
              className={styles.glyph}
              style={{
                fontSize: `${w.fontSize}px`,
                left: `${50 + cx * 100}%`,
                top: `${50 + cy * 100}%`,
                opacity: 0
              }}
            >
              {w.text}
            </span>
          ))}
        </div>

        {/* 残影:压在文字层之上,不参与反相 */}
        {(compiled?.words ?? []).map((w: TemperaWord, i) => (
          <span
            key={`ec-${i}`}
            ref={(el) => {
              echoRefs.current[i] = el
            }}
            className={styles.glyphEcho}
            style={{
              fontSize: `${w.fontSize}px`,
              left: `${50 + cx * 100}%`,
              top: `${50 + cy * 100}%`,
              color: palette.ink,
              opacity: 0
            }}
          >
            {w.text}
          </span>
        ))}

        {/* 边缘碎片字(alpha 0.42) */}
        {(compiled?.fragments ?? []).map((f, i) => (
          <span
            key={`fr-${i}`}
            className={styles.fragment}
            style={{
              left: `${f.x * 100}%`,
              top: `${f.y * 100}%`,
              fontSize: `${Math.round(Math.max(12, (compiled?.words[0]?.fontSize ?? 40) * f.scale))}px`,
              color: palette.ink,
              opacity: 0.42,
              transform: `translate(-50%, -50%) rotate(${f.rotation.toFixed(3)}rad)`
            }}
          >
            {f.char}
          </span>
        ))}
      </div>

      {/* 晕影:画面外的暗角(不随镜头动) */}
      <div className={styles.vignette} />

      {subText ? (
        <div className={styles.sub} style={{ fontSize: `${Math.round(17 * scale)}px`, color: palette.ink, opacity: 0.52 }}>
          {subText}
        </div>
      ) : null}
    </div>
  )
}

export default TemperaLyrics
