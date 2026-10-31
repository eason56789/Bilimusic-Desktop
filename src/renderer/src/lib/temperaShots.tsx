/**
 * 凝彩构图层(对照 folia-major 的 compositions/* 15 个文件,按真实形态精简但保留语汇)。
 *
 * 每个构图产出一组 `ShapeItem`,由组件按 `delay` 做块级 stagger。
 * 关键约束(照抄源码):
 *  - 所有通栏色块都加 **bleed**(溢出画布 17%),否则推镜时露底
 *  - `enterDX/DY` 是**入场向量**(从该偏移滑到 0),不是位置
 *  - `grow` 是**以图元包围盒中心为轴心的横向张开**,不是等比放大
 *  - hatch 只能裁到凸多边形上
 */
import {
  TAU,
  hatchLines,
  hatchSpec,
  polyBounds,
  polyPath,
  cutPath,
  rectPoly,
  circlePoly,
  diamondPoly,
  roundedRectPoly,
  rotatePoly,
  ellipsePoly,
  heartPoly,
  lobedPoly,
  scallopBandPoly,
  starPoly,
  annularSectorPoly,
  arcRibbonPoly,
  scribblePath,
  wavyPath,
  crossRow,
  dotRow,
  dotGrid,
  discField,
  hash01,
  mixColor,
  type TemperaPalette,
  type HatchSpec
} from './temperaPrims'

/** 一个构图图元 */
export interface ShapeItem {
  /** SVG 片段 */
  node: JSX.Element
  /** 入场延迟(秒) */
  delay: number
  /** 入场向量(px):从该偏移滑到 0 */
  enterDX: number
  enterDY: number
  /** 落定后持续漂移(px,6 秒爬满) */
  driftX: number
  driftY: number
  baseAlpha: number
  /** 横向张开量(0..1,以自身包围盒中心为轴) */
  grow: number
}

/** 构图种类(对齐 folia 的 121 种里最常用的族,命名保持一致以便对照) */
export type TemperaKind =
  /* 分割族 */
  | 'duo-split'
  | 'quad-split'
  | 'tri-column'
  | 'thirds-stack'
  | 'checker-quad'
  | 'corner-wedge'
  | 'diagonal-halves'
  | 'cross-axis'
  | 'offset-halves'
  | 'stair-blocks'
  | 'pillar-gap'
  | 'corner-quad'
  | 'sliver-stack'
  /* 色带族 */
  | 'band-strip'
  | 'horizon-band'
  | 'deep-dive'
  | 'tone-ramp'
  | 'double-band'
  | 'tilt-band'
  | 'edge-rails'
  | 'gradient-wall'
  | 'terrace'
  /* 框/窗族 */
  | 'frame-window'
  | 'double-frame'
  | 'circle-window'
  | 'ladder-frame'
  | 'corner-brackets'
  | 'inset-box'
  | 'bracket-pair'
  | 'arch-window'
  | 'grid-cells'
  | 'keyhole'
  /* 海报族 */
  | 'poster-panel'
  | 'diamond-stack'
  | 'slash-poster'
  | 'arrow-wedge'
  | 'edge-bleed'
  | 'triangle-mass'
  | 'ribbon-cross'
  | 'half-disc'
  | 'stacked-slabs'
  | 'wedge-pair'
  /* 稀疏族 */
  | 'quiet-line'
  | 'starfield-dots'
  | 'ripple-lines'
  | 'hair-grid'
  | 'margin-rule'
  | 'dot-drift'
  | 'arc-sweep'
  | 'blank-page'
  /* 电影遮幅族 */
  | 'cinema-scope'
  | 'cinema-wide'
  | 'cinema-academy'
  | 'cinema-square'
  | 'cinema-twin'
  /* 圆润族 */
  | 'bubble-drift'
  | 'cloud-window'
  | 'heart-burst'
  | 'sparkle-field'
  | 'petal-arc'
  | 'scallop-band'
  | 'ribbon-loop'
  | 'round-plate'
  | 'halo-burst'
  /* 挖孔族 */
  | 'iris-hole'
  | 'slot-rail'
  | 'punch-row'
  | 'ring-eye'
  | 'notch-stack'
  | 'dot-sieve'
  /* 仪表族 */
  | 'sight-mark'
  | 'dial-scale'
  | 'chevron-run'
  | 'tally-column'
  | 'grid-focus'
  | 'strobe-slats'
  | 'radial-comb'
  | 'bracket-target'
  /* 营造族 */
  | 'apex-mass'
  | 'ziggurat'
  | 'slab-wall'
  | 'cantilever'
  | 'pylon-pair'
  | 'bunker-slit'
  | 'plinth-stack'
  | 'void-core'
  | 'ridge-line'
  | 'chasm'
  | 'overhang'
  | 'reverment'
  | 'tower-crop'
  | 'lintel'
  | 'gnomon'
  /* 物语族(无共享装饰) */
  | 'monogatari-card'
  | 'monogatari-rule'
  | 'monogatari-edge'
  | 'monogatari-stack'
  | 'monogatari-flash'

/** 每种构图的镜头参数(对齐 TemperaShotProfile) */
export interface ShotProfile {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
  fontScale: number
  enterX: number
  enterY: number
  travel: number
  zoomStart: number
  zoomEnd: number
  mood: 'quiet' | 'neutral' | 'loud'
  /** false 时不叠交叉线与角标(物语族) */
  sharedDecor?: boolean
}

/** 通用默认值,个别构图覆盖 */
const BASE: ShotProfile = {
  cx: 0.5,
  cy: 0.5,
  w: 0.74,
  h: 0.38,
  rotation: 0,
  fontScale: 1,
  enterX: 0,
  enterY: 0.9,
  travel: 0.1,
  zoomStart: 1.04,
  zoomEnd: 1.12,
  mood: 'quiet'
}

export const SHOT_PROFILES: Record<TemperaKind, ShotProfile> = {
  /* 分割族 */
  'duo-split': { ...BASE, w: 0.86, h: 0.44, enterY: 1.1, travel: 0.11, mood: 'neutral' },
  'quad-split': { ...BASE, w: 0.82, h: 0.4, enterX: 0.9, enterY: 0.9, travel: 0.09, zoomStart: 1.08, zoomEnd: 1.16, mood: 'loud' },
  'tri-column': { ...BASE, w: 0.7, h: 0.5, fontScale: 0.95, enterX: -1.2, enterY: 0, travel: 0.12, mood: 'neutral' },
  'thirds-stack': { ...BASE, w: 0.8, h: 0.34, enterX: -0.6, travel: 0.11, mood: 'neutral' },
  'checker-quad': { ...BASE, w: 0.78, h: 0.4, enterY: 1.2, travel: 0.1, mood: 'neutral' },
  'corner-wedge': { ...BASE, w: 0.76, h: 0.4, enterX: 0.8, travel: 0.11, mood: 'neutral' },
  'diagonal-halves': { ...BASE, w: 0.78, h: 0.4, rotation: -0.075, enterX: 1.1, enterY: 1.1, travel: 0.12, mood: 'neutral' },
  'cross-axis': { ...BASE, w: 0.74, h: 0.28, enterY: 0.7, travel: 0.1, mood: 'loud' },
  'offset-halves': { ...BASE, w: 0.8, h: 0.4, enterX: 0.6, travel: 0.11, mood: 'neutral' },
  'stair-blocks': { ...BASE, w: 0.78, h: 0.36, enterX: -0.7, travel: 0.12, mood: 'neutral' },
  'pillar-gap': { ...BASE, w: 0.5, h: 0.44, enterY: 0.95, travel: 0.1, mood: 'quiet' },
  'corner-quad': { ...BASE, w: 0.72, h: 0.38, enterX: 0.7, travel: 0.11, mood: 'neutral' },
  'sliver-stack': { ...BASE, w: 0.6, h: 0.4, enterX: -0.9, travel: 0.12, mood: 'neutral' },

  /* 色带族 */
  'band-strip': { ...BASE, w: 0.9, h: 0.22, fontScale: 0.9, enterX: -1, enterY: 0, travel: 0.13, zoomStart: 1.03, zoomEnd: 1.1, mood: 'quiet' },
  'horizon-band': { ...BASE, w: 0.88, h: 0.28, enterY: 0.8, travel: 0.11, mood: 'quiet' },
  'deep-dive': { ...BASE, w: 0.84, h: 0.3, enterY: 1, travel: 0.12, mood: 'neutral' },
  'tone-ramp': { ...BASE, w: 0.86, h: 0.26, enterX: -0.9, travel: 0.12, mood: 'quiet' },
  'double-band': { ...BASE, w: 0.88, h: 0.32, enterX: -0.7, travel: 0.11, mood: 'neutral' },
  'tilt-band': { ...BASE, w: 0.86, h: 0.26, rotation: -0.04, enterX: 1, travel: 0.13, mood: 'loud' },
  'edge-rails': { ...BASE, w: 0.84, h: 0.3, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'gradient-wall': { ...BASE, w: 0.86, h: 0.3, enterY: 0.8, travel: 0.12, mood: 'neutral' },
  terrace: { ...BASE, w: 0.82, h: 0.32, enterX: -0.8, travel: 0.12, mood: 'neutral' },

  /* 框/窗族 */
  'frame-window': { ...BASE, w: 0.7, h: 0.34, travel: 0.1, mood: 'quiet' },
  'double-frame': { ...BASE, w: 0.72, h: 0.4, enterX: 0.6, enterY: 0.8, travel: 0.11, zoomStart: 1.05, zoomEnd: 1.13, mood: 'neutral' },
  'circle-window': { ...BASE, w: 0.62, h: 0.34, fontScale: 0.96, enterY: 1, travel: 0.09, zoomStart: 1.06, zoomEnd: 1.1, mood: 'quiet' },
  'ladder-frame': { ...BASE, w: 0.72, h: 0.38, enterY: 0.7, travel: 0.1, mood: 'quiet' },
  'corner-brackets': { ...BASE, w: 0.74, h: 0.36, travel: 0.1, mood: 'quiet' },
  'inset-box': { ...BASE, w: 0.7, h: 0.36, enterY: 0.6, travel: 0.09, mood: 'quiet' },
  'bracket-pair': { ...BASE, w: 0.62, h: 0.4, enterY: 0.6, travel: 0.09, mood: 'quiet' },
  'arch-window': { ...BASE, w: 0.58, h: 0.4, enterY: 0.9, travel: 0.1, mood: 'quiet' },
  'grid-cells': { ...BASE, w: 0.68, h: 0.36, enterY: 0.5, travel: 0.09, mood: 'quiet' },
  keyhole: { ...BASE, w: 0.54, h: 0.42, enterY: 0.8, travel: 0.1, mood: 'quiet' },

  /* 海报族 */
  'poster-panel': { ...BASE, w: 0.8, h: 0.44, rotation: -0.06, enterX: -1, travel: 0.13, mood: 'loud' },
  'diamond-stack': { ...BASE, w: 0.78, h: 0.42, enterX: 0.9, travel: 0.12, mood: 'loud' },
  'slash-poster': { ...BASE, w: 0.86, h: 0.34, rotation: -0.05, enterX: 1, travel: 0.13, mood: 'loud' },
  'arrow-wedge': { ...BASE, w: 0.8, h: 0.36, enterY: 1, travel: 0.12, mood: 'loud' },
  'edge-bleed': { ...BASE, w: 0.62, h: 0.42, enterX: -1.1, travel: 0.13, mood: 'loud' },
  'triangle-mass': { ...BASE, w: 0.72, h: 0.4, enterX: 1, travel: 0.12, mood: 'loud' },
  'ribbon-cross': { ...BASE, w: 0.84, h: 0.34, rotation: -0.03, enterX: 0.8, travel: 0.12, mood: 'loud' },
  'half-disc': { ...BASE, w: 0.7, h: 0.4, enterX: 0.9, travel: 0.12, mood: 'loud' },
  'stacked-slabs': { ...BASE, w: 0.76, h: 0.42, rotation: -0.03, enterX: 0.5, enterY: 0.5, travel: 0.11, mood: 'loud' },
  'wedge-pair': { ...BASE, w: 0.6, h: 0.4, enterX: 0.7, travel: 0.12, mood: 'neutral' },

  /* 稀疏族 */
  'quiet-line': { ...BASE, w: 0.68, h: 0.24, fontScale: 0.92, enterY: 0.7, travel: 0.07, zoomStart: 1.02, zoomEnd: 1.07, mood: 'quiet' },
  'starfield-dots': { ...BASE, w: 0.74, h: 0.3, enterY: 0.5, travel: 0.08, mood: 'quiet' },
  'ripple-lines': { ...BASE, w: 0.76, h: 0.32, enterX: -0.5, travel: 0.09, mood: 'quiet' },
  'hair-grid': { ...BASE, w: 0.7, h: 0.32, enterY: 0.4, travel: 0.08, mood: 'quiet' },
  'margin-rule': { ...BASE, w: 0.66, h: 0.3, enterY: 0.5, travel: 0.08, mood: 'quiet' },
  'dot-drift': { ...BASE, w: 0.72, h: 0.3, enterX: 0.4, travel: 0.08, mood: 'quiet' },
  'arc-sweep': { ...BASE, w: 0.7, h: 0.3, enterX: -0.4, travel: 0.09, mood: 'quiet' },
  'blank-page': { ...BASE, w: 0.62, h: 0.26, fontScale: 0.9, enterY: 0.6, travel: 0.07, mood: 'quiet' },

  /* 电影遮幅族 */
  'cinema-scope': { ...BASE, w: 0.82, h: 0.26, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'cinema-wide': { ...BASE, w: 0.82, h: 0.3, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'cinema-academy': { ...BASE, w: 0.74, h: 0.36, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'cinema-square': { ...BASE, w: 0.6, h: 0.4, enterY: 0.7, travel: 0.1, mood: 'quiet' },
  'cinema-twin': { ...BASE, w: 0.78, h: 0.32, enterX: -0.5, travel: 0.1, mood: 'neutral' },

  /* 圆润族 */
  'bubble-drift': { ...BASE, w: 0.76, h: 0.36, enterY: 0.8, travel: 0.1, mood: 'quiet' },
  'cloud-window': { ...BASE, w: 0.6, h: 0.34, enterY: 0.7, travel: 0.09, mood: 'quiet' },
  'heart-burst': { ...BASE, w: 0.66, h: 0.38, enterY: 0.9, travel: 0.11, mood: 'loud' },
  'sparkle-field': { ...BASE, w: 0.74, h: 0.34, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'petal-arc': { ...BASE, w: 0.72, h: 0.34, enterY: 0.7, travel: 0.1, mood: 'quiet' },
  'scallop-band': { ...BASE, w: 0.82, h: 0.3, enterY: 0.8, travel: 0.11, mood: 'neutral' },
  'ribbon-loop': { ...BASE, w: 0.8, h: 0.32, enterX: -0.6, travel: 0.11, mood: 'neutral' },
  'round-plate': { ...BASE, w: 0.66, h: 0.36, enterY: 0.7, travel: 0.09, mood: 'quiet' },
  'halo-burst': { ...BASE, w: 0.68, h: 0.38, enterY: 0.8, travel: 0.11, mood: 'loud' },

  /* 挖孔族 */
  'iris-hole': { ...BASE, w: 0.56, h: 0.36, enterY: 0.6, travel: 0.09, mood: 'quiet' },
  'slot-rail': { ...BASE, w: 0.8, h: 0.26, enterY: 0.5, travel: 0.1, mood: 'quiet' },
  'punch-row': { ...BASE, w: 0.84, h: 0.28, enterY: 0.5, travel: 0.1, mood: 'quiet' },
  'ring-eye': { ...BASE, w: 0.58, h: 0.36, enterY: 0.7, travel: 0.09, mood: 'neutral' },
  'notch-stack': { ...BASE, w: 0.62, h: 0.38, enterY: 0.6, travel: 0.09, mood: 'quiet' },
  'dot-sieve': { ...BASE, w: 0.8, h: 0.32, enterY: 0.5, travel: 0.1, mood: 'quiet' },

  /* 仪表族 */
  'sight-mark': { ...BASE, w: 0.66, h: 0.36, enterY: 0.6, travel: 0.1, mood: 'neutral' },
  'dial-scale': { ...BASE, w: 0.54, h: 0.34, enterY: 0.7, travel: 0.09, mood: 'neutral' },
  'chevron-run': { ...BASE, w: 0.82, h: 0.3, enterY: 0.8, travel: 0.11, mood: 'loud' },
  'tally-column': { ...BASE, w: 0.6, h: 0.36, enterY: 0.6, travel: 0.1, mood: 'quiet' },
  'grid-focus': { ...BASE, w: 0.72, h: 0.34, enterY: 0.5, travel: 0.09, mood: 'quiet' },
  'strobe-slats': { ...BASE, w: 0.84, h: 0.28, enterY: 0.7, travel: 0.11, mood: 'loud' },
  'radial-comb': { ...BASE, w: 0.68, h: 0.34, enterX: -0.8, travel: 0.11, mood: 'neutral' },
  'bracket-target': { ...BASE, w: 0.58, h: 0.36, enterY: 0.6, travel: 0.09, mood: 'quiet' },

  /* 营造族 */
  'apex-mass': { ...BASE, w: 0.76, h: 0.34, enterY: 0.8, travel: 0.11, mood: 'neutral' },
  ziggurat: { ...BASE, w: 0.74, h: 0.34, enterY: 0.8, travel: 0.11, mood: 'neutral' },
  'slab-wall': { ...BASE, w: 0.6, h: 0.38, enterX: 0.6, travel: 0.1, mood: 'neutral' },
  cantilever: { ...BASE, w: 0.74, h: 0.3, enterX: -0.7, travel: 0.11, mood: 'neutral' },
  'pylon-pair': { ...BASE, w: 0.58, h: 0.34, enterY: 0.7, travel: 0.1, mood: 'neutral' },
  'bunker-slit': { ...BASE, w: 0.66, h: 0.3, enterY: 0.6, travel: 0.1, mood: 'neutral' },
  'plinth-stack': { ...BASE, w: 0.68, h: 0.34, enterY: 0.8, travel: 0.1, mood: 'neutral' },
  'void-core': { ...BASE, w: 0.54, h: 0.36, enterY: 0.8, travel: 0.1, mood: 'neutral' },
  'ridge-line': { ...BASE, w: 0.78, h: 0.32, enterY: 0.8, travel: 0.11, mood: 'neutral' },
  chasm: { ...BASE, w: 0.58, h: 0.34, enterY: 0.7, travel: 0.1, mood: 'neutral' },
  overhang: { ...BASE, w: 0.66, h: 0.32, enterY: 0.7, travel: 0.1, mood: 'neutral' },
  reverment: { ...BASE, w: 0.72, h: 0.32, enterX: -0.6, travel: 0.11, mood: 'neutral' },
  'tower-crop': { ...BASE, w: 0.6, h: 0.34, enterX: 0.7, travel: 0.1, mood: 'neutral' },
  lintel: { ...BASE, w: 0.78, h: 0.28, enterX: -0.6, travel: 0.1, mood: 'neutral' },
  gnomon: { ...BASE, w: 0.66, h: 0.32, enterY: 0.7, travel: 0.1, mood: 'neutral' },

  /* 物语族:不叠共享装饰 */
  'monogatari-card': { ...BASE, w: 0.78, h: 0.3, enterY: 0.5, travel: 0.08, mood: 'quiet', sharedDecor: false },
  'monogatari-rule': { ...BASE, w: 0.76, h: 0.26, enterY: 0.5, travel: 0.08, mood: 'quiet', sharedDecor: false },
  'monogatari-edge': { ...BASE, w: 0.7, h: 0.32, enterX: -0.4, travel: 0.09, mood: 'quiet', sharedDecor: false },
  'monogatari-stack': { ...BASE, w: 0.72, h: 0.28, enterY: 0.4, travel: 0.08, mood: 'quiet', sharedDecor: false },
  'monogatari-flash': { ...BASE, w: 0.74, h: 0.3, enterY: 0.6, travel: 0.09, mood: 'neutral', sharedDecor: false }
}

/* ============================ 构建上下文 ============================ */

interface Ctx {
  w: number
  h: number
  /** 溢出量:所有通栏色块都要加,否则推镜露底 */
  b: number
  /** 单位长度 */
  unit: number
  pal: TemperaPalette
  seed: number
  showDecor: boolean
  items: ShapeItem[]
  flowAngle: number
}

const bleedOf = (w: number, h: number): number => Math.max(w, h) * 0.17

function makeCtx(pal: TemperaPalette, w: number, h: number, seed: number, showDecor: boolean, flowAngle: number): Ctx {
  return { w, h, b: bleedOf(w, h), unit: Math.min(w, h), pal, seed, showDecor, items: [], flowAngle }
}

type PushOpts = {
  delay?: number
  dx?: number
  dy?: number
  driftX?: number
  driftY?: number
  alpha?: number
  grow?: number
}

function add(ctx: Ctx, node: JSX.Element, opts: PushOpts = {}): void {
  ctx.items.push({
    node,
    delay: opts.delay ?? 0,
    enterDX: opts.dx ?? 0,
    enterDY: opts.dy ?? 0,
    driftX: opts.driftX ?? 0,
    driftY: opts.driftY ?? 0,
    baseAlpha: opts.alpha ?? 1,
    grow: opts.grow ?? 0
  })
}

const fill = (poly: number[], color: string, alpha = 1): JSX.Element => (
  <path d={polyPath(poly)} fill={color} fillOpacity={alpha} />
)

/**
 * 墨块:比 tone4 更深,逼近 ink(墨的 88%)。
 *
 * 参考帧里每句几乎都有一块**近黑**实心区域承载反差 —— 这是"印刷感"的真正来源:
 * 浅纸上的字压到墨块上,差分反相把字翻成纸色,于是文字成了色块的**活蒙版**。
 * 只用 tone1..tone4(最深只到墨的 72%)整幅会发灰,失掉这种黑白对撞。
 */
const inkBlock = (p: TemperaPalette): string => mixColor(p.paper, p.ink, 0.88)

const fillHoles = (outer: number[], holes: number[][], color: string, alpha = 1): JSX.Element => (
  <path d={cutPath(outer, holes)} fill={color} fillOpacity={alpha} fillRule="evenodd" />
)

const outline = (poly: number[], color: string, width: number, alpha = 1): JSX.Element => (
  <path d={polyPath(poly)} fill="none" stroke={color} strokeWidth={width} strokeOpacity={alpha} />
)

/** 网纹填充:平行线段裁剪到凸多边形 */
function hatch(ctx: Ctx, poly: number[], spec: HatchSpec, color: string, alpha: number): JSX.Element {
  const segs = hatchLines(poly, spec)
  if (segs.length === 0) return <g />
  let d = ''
  for (const s of segs) d += `M${s[0].toFixed(1)} ${s[1].toFixed(1)} L${s[2].toFixed(1)} ${s[3].toFixed(1)} `
  return <path d={d} fill="none" stroke={color} strokeWidth={spec.width} strokeOpacity={alpha} strokeLinecap="butt" />
}

/** 通栏色块(带 bleed) */
const bleedRect = (ctx: Ctx): number[] => rectPoly(-ctx.b, -ctx.b, ctx.w + 2 * ctx.b, ctx.h + 2 * ctx.b)

/** 加一块场地底色 */
function addField(ctx: Ctx, color: string, alpha = 0.92, span = 0.5): void {
  add(ctx, fill(bleedRect(ctx), color, alpha), { delay: 0, alpha })
}

/** 加一组贯穿引导线 */
function addCrossing(ctx: Ctx, count: number): void {
  const lines = crossingLinesSafe(ctx, count)
  if (lines.length === 0) return
  const p = ctx.pal
  add(
    ctx,
    <path
      d={lines.map((l) => `M${l[0].toFixed(1)} ${l[1].toFixed(1)} L${l[2].toFixed(1)} ${l[3].toFixed(1)}`).join(' ')}
      fill="none"
      stroke={p.tone4}
      strokeWidth={1.3}
      strokeOpacity={0.6}
    />,
    { delay: 0.14, dx: ctx.w * 0.25 }
  )
}

/** 角标 motif(菱形/网纹双块/叉行/涂鸦) */
function addMotif(ctx: Ctx): void {
  const p = ctx.pal
  const px = hash01(ctx.seed, 61, 7) > 0.5 ? ctx.w * 0.14 : ctx.w * 0.86
  const py = hash01(ctx.seed, 63, 7) > 0.5 ? ctx.h * 0.18 : ctx.h * 0.82
  const motif = ['diamonds', 'hatch-twin', 'band-cross', 'doodle'][Math.floor(hash01(ctx.seed, 65, 7) * 4) % 4]
  if (motif === 'diamonds') {
    const rings: JSX.Element[] = []
    for (let r = 0; r < 3; r++) {
      const k = 1 - r * 0.22
      rings.push(
        <path
          key={r}
          d={polyPath(diamondPoly(px, py, 34 * k, 34 * k))}
          fill="none"
          stroke={p.tone4}
          strokeWidth={r % 2 === 0 ? 3.5 : 1.4}
          strokeOpacity={0.8}
        />
      )
    }
    add(ctx, <g>{rings}</g>, { delay: 0.34 })
  } else if (motif === 'hatch-twin') {
    const spec = hatchSpec(ctx.seed, 67)
    for (let i = 0; i < 2; i++) {
      const box = rectPoly(px - 34 + i * 46, py - 26, 38, 38)
      add(ctx, hatch(ctx, box, { ...spec, spacing: spec.spacing * (i === 0 ? 1 : 0.55) }, p.tone4, 0.75), {
        delay: 0.34 + i * 0.05,
        grow: 1
      })
      add(ctx, outline(box, p.tone4, 1.2, 0.6), { delay: 0.38 + i * 0.05 })
    }
  } else if (motif === 'band-cross') {
    const marks = crossRow(ctx.seed, 71, px - ctx.w * 0.1, py, 5, ctx.w * 0.05, 8)
    add(
      ctx,
      <g stroke={p.tone4} strokeWidth={2} strokeOpacity={0.8}>
        {marks.map((m, i) => {
          const c = Math.cos(m.rotation + Math.PI / 4) * m.size
          const s = Math.sin(m.rotation + Math.PI / 4) * m.size
          return (
            <g key={i}>
              <line x1={m.x - c} y1={m.y - s} x2={m.x + c} y2={m.y + s} />
              <line x1={m.x - s} y1={m.y + c} x2={m.x + s} y2={m.y - c} />
            </g>
          )
        })}
      </g>,
      { delay: 0.34, grow: 1 }
    )
  } else {
    const r = ctx.unit * 0.08
    add(
      ctx,
      <path
        d={scribblePath(ctx.seed, 73, px, py, r, 3)}
        fill="none"
        stroke={p.tone4}
        strokeWidth={1.5}
        strokeOpacity={0.72}
      />,
      { delay: 0.34 }
    )
  }
}

/** crossingLines 的包装(避免循环导入命名冲突) */
function crossingLinesSafe(ctx: Ctx, count: number): number[][] {
  const total = Math.min(3, Math.max(0, Math.round(count)))
  const out: number[][] = []
  for (let i = 0; i < total; i++) {
    const anchorY = ctx.h * (0.18 + hash01(ctx.seed, i, 31) * 0.64)
    const sign = hash01(ctx.seed, i, 36) > 0.5 ? 1 : -1
    const angle = sign * (0.07 + hash01(ctx.seed, i, 40) * 0.11)
    const reach = ctx.w * 0.9
    out.push([-ctx.w * 0.3, anchorY - Math.tan(angle) * reach, ctx.w * 1.3, anchorY + Math.tan(angle) * reach])
  }
  return out
}

/* ============================ 构图主体 ============================ */

export function buildComposition(
  kind: TemperaKind,
  w: number,
  h: number,
  seed: number,
  pal: TemperaPalette,
  showDecor: boolean,
  flowAngle: number
): ShapeItem[] {
  const ctx = makeCtx(pal, w, h, seed, showDecor, flowAngle)
  const p = pal
  const H = (i: number, salt: number): number => hash01(seed, i, salt)

  /* ---------- 分割族 ---------- */
  switch (kind) {
    case 'duo-split': {
      const horizontal = H(1, 3) > 0.5
      // 一块墨 + 一块纸:上下或左右平分的硬对撞
      if (horizontal) {
        add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, h * 0.52 + ctx.b), inkBlock(p), 0.97), { dy: -h * 0.55 })
        add(ctx, fill(rectPoly(-ctx.b, h * 0.52, w + 2 * ctx.b, h * 0.48 + ctx.b), p.paper, 0.97), { dy: h * 0.55 })
      } else {
        add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w * 0.5 + ctx.b, h + 2 * ctx.b), inkBlock(p), 0.97), { dx: -w * 0.5 })
        add(ctx, fill(rectPoly(w * 0.5, -ctx.b, w * 0.5 + ctx.b, h + 2 * ctx.b), p.paper, 0.97), { dx: w * 0.5 })
      }
      add(ctx, fill(horizontal ? rectPoly(-ctx.b, h * 0.52 - 1.5, w + 2 * ctx.b, 3) : rectPoly(w * 0.5 - 1.5, -ctx.b, 3, h + 2 * ctx.b), inkBlock(p), 0.9), { delay: 0.16 })
      break
    }
    case 'quad-split': {
      const sx = w * (0.42 + H(2, 7) * 0.16)
      const sy = h * (0.42 + H(3, 11) * 0.16)
      // 对角两个墨块 + 对角两个纸/浅灰:这是参考图最典型的黑白对撞
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, sx + ctx.b, sy + ctx.b), inkBlock(p), 0.97), { dx: -w * 0.3, dy: -h * 0.3 })
      add(ctx, fill(rectPoly(sx, -ctx.b, w - sx + ctx.b, sy + ctx.b), p.tone1, 0.97), { dx: w * 0.3, dy: -h * 0.3 })
      add(ctx, fill(rectPoly(-ctx.b, sy, sx + ctx.b, h - sy + ctx.b), p.tone1, 0.97), { dx: -w * 0.3, dy: h * 0.3 })
      add(ctx, fill(rectPoly(sx, sy, w - sx + ctx.b, h - sy + ctx.b), p.paper, 0.97), { dx: w * 0.3, dy: h * 0.3 })
      add(ctx, fill(rectPoly(sx - 1.5, -ctx.b, 3, h + 2 * ctx.b), inkBlock(p), 0.9), { delay: 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, sy - 1.5, w + 2 * ctx.b, 3), inkBlock(p), 0.9), { delay: 0.24 })
      break
    }
    case 'tri-column': {
      const edge = w * (0.26 + H(4, 13) * 0.06)
      // 中央墨柱(参考帧"道过"那种白竖条压深底,这里是反过来的墨柱)
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, edge + ctx.b, h + 2 * ctx.b), p.paper, 0.97), { dx: -w * 0.25 })
      add(ctx, fill(rectPoly(edge, -ctx.b, w - 2 * edge, h + 2 * ctx.b), inkBlock(p), 0.97), { dy: -h * 0.3 })
      add(ctx, fill(rectPoly(w - edge, -ctx.b, edge + ctx.b, h + 2 * ctx.b), p.paper, 0.97), { dx: w * 0.25 })
      break
    }
    case 'thirds-stack': {
      const band = h * 0.34
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, band + ctx.b), p.tone2, 0.96), { dx: -w * 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, band, w + 2 * ctx.b, band), p.tone4, 0.96), { dx: w * 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, band * 2, w + 2 * ctx.b, h - 2 * band + ctx.b), p.tone1, 0.96), { dx: -w * 0.2 })
      break
    }
    case 'checker-quad': {
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w / 2 + ctx.b, h / 2 + ctx.b), p.tone4, 0.96), { dy: -h * 0.35 })
      add(ctx, fill(rectPoly(w / 2, -ctx.b, w / 2 + ctx.b, h / 2 + ctx.b), p.tone1, 0.96), { dy: -h * 0.35 })
      add(ctx, fill(rectPoly(-ctx.b, h / 2, w / 2 + ctx.b, h / 2 + ctx.b), p.tone1, 0.96), { dy: h * 0.35 })
      add(ctx, fill(rectPoly(w / 2, h / 2, w / 2 + ctx.b, h / 2 + ctx.b), p.tone4, 0.96), { dy: h * 0.35 })
      break
    }
    case 'corner-wedge': {
      const fromLeft = H(5, 17) > 0.5
      const apexX = fromLeft ? w * 0.78 : w * 0.22
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.96))
      const tri = fromLeft
        ? [-ctx.b, -ctx.b, apexX, -ctx.b, -ctx.b, h + ctx.b]
        : [w + ctx.b, -ctx.b, apexX, -ctx.b, w + ctx.b, h + ctx.b]
      add(ctx, fill(tri, inkBlock(p), 0.96), { dx: fromLeft ? -w * 0.4 : w * 0.4 })
      break
    }
    case 'diagonal-halves': {
      const lean = h * (0.2 + H(6, 19) * 0.3)
      add(ctx, fill([-ctx.b, -ctx.b, w + ctx.b, -ctx.b, w + ctx.b, lean, -ctx.b, h - lean], p.tone2, 0.96), { dy: -h * 0.4 })
      add(ctx, fill([-ctx.b, h - lean, w + ctx.b, lean, w + ctx.b, h + ctx.b, -ctx.b, h + ctx.b], inkBlock(p), 0.96), { dy: h * 0.4 })
      break
    }
    case 'cross-axis': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(rectPoly((w - w * 0.11) / 2, -ctx.b, w * 0.11, h + 2 * ctx.b), p.tone4, 0.95), { delay: 0.06, dy: -h * 0.5 })
      add(ctx, fill(rectPoly(-ctx.b, (h - h * 0.13) / 2, w + 2 * ctx.b, h * 0.13), p.tone3, 0.95), { delay: 0.12, dx: w * 0.5 })
      break
    }
    case 'offset-halves': {
      const step = h * (0.06 + H(7, 23) * 0.06)
      const seam = w * 0.48
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, seam + ctx.b, h * 0.5 + step + ctx.b), p.tone1, 0.96), { dx: -w * 0.3 })
      add(ctx, fill(rectPoly(seam, -ctx.b, w - seam + ctx.b, h * 0.5 - step + ctx.b), p.tone3, 0.96), { dx: w * 0.3 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.5 + step, seam + ctx.b, h * 0.5 - step + ctx.b), p.tone4, 0.96), { dx: -w * 0.2 })
      add(ctx, fill(rectPoly(seam, h * 0.5 - step, w - seam + ctx.b, h * 0.5 + step + ctx.b), p.tone2, 0.96), { dx: w * 0.2 })
      break
    }
    case 'stair-blocks': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const tones = [p.tone1, p.tone2, p.tone3, p.tone4]
      for (let i = 0; i < 4; i++) {
        add(ctx, fill(rectPoly(w * (0.06 + i * 0.2), h * (0.1 + i * 0.16), w * 0.3, h * 0.34), tones[i], 0.94), {
          delay: i * 0.06,
          dx: -w * 0.2,
          dy: h * 0.12
        })
      }
      break
    }
    case 'pillar-gap': {
      const gap = w * (0.26 + H(8, 29) * 0.08)
      const side = (w - gap) / 2
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, side + ctx.b, h + 2 * ctx.b), p.tone4, 0.96), { dx: -w * 0.3 })
      add(ctx, fill(rectPoly(w - side, -ctx.b, side + ctx.b, h + 2 * ctx.b), p.tone4, 0.96), { dx: w * 0.3 })
      break
    }
    case 'corner-quad': {
      const sx = w * (0.6 + H(9, 31) * 0.12)
      const sy = h * (0.62 + H(10, 37) * 0.1)
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, sx + ctx.b, sy + ctx.b), p.tone2, 0.96), { dy: -h * 0.25 })
      add(ctx, fill(rectPoly(sx, -ctx.b, w - sx + ctx.b, sy + ctx.b), p.tone4, 0.96), { dx: w * 0.25 })
      add(ctx, fill(rectPoly(-ctx.b, sy, sx + ctx.b, h - sy + ctx.b), p.tone1, 0.96), { dx: -w * 0.25 })
      add(ctx, fill(rectPoly(sx, sy, w - sx + ctx.b, h - sy + ctx.b), p.tone3, 0.96), { dy: h * 0.25 })
      break
    }
    case 'sliver-stack': {
      const fromLeft = H(11, 41) > 0.5
      const slabW = w * 0.46
      const left = fromLeft ? -ctx.b : w - slabW
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const sliver = (h + 2 * ctx.b) / 9
      for (let i = 0; i < 9; i += 2) {
        add(ctx, fill(rectPoly(left, -ctx.b + sliver * i, slabW + ctx.b, sliver), p.tone4, 0.92), {
          delay: i * 0.02,
          dx: (fromLeft ? -1 : 1) * w * 0.2
        })
      }
      break
    }

    /* ---------- 色带族 ---------- */
    case 'band-strip': {
      // 墨底 + 纸带:参考帧"我好"那种居中大色带
      add(ctx, fill(bleedRect(ctx), inkBlock(p), 0.97), { delay: 0 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.37, w + 2 * ctx.b, h * 0.3), p.paper, 0.98), { dx: -w * 0.5 })
      add(
        ctx,
        <g stroke={p.tone4} strokeWidth={1.4} strokeOpacity={0.75} fill="none">
          <line x1={-ctx.b} y1={h * 0.37 - 10} x2={w + ctx.b} y2={h * 0.37 - 22} />
          <line x1={-ctx.b} y1={h * 0.67 + 22} x2={w + ctx.b} y2={h * 0.67 + 10} />
        </g>,
        { delay: 0.12, dx: w * 0.25 }
      )
      const marks = crossRow(seed, 17, w * 0.06, h * 0.37 - h * 0.16, 4, w * 0.055, 9)
      add(
        ctx,
        <g stroke={p.ink} strokeWidth={2} strokeOpacity={0.8}>
          {marks.map((m, i) => {
            const c = Math.cos(m.rotation + Math.PI / 4) * m.size
            const s = Math.sin(m.rotation + Math.PI / 4) * m.size
            return (
              <g key={i}>
                <line x1={m.x - c} y1={m.y - s} x2={m.x + c} y2={m.y + s} />
                <line x1={m.x - s} y1={m.y + c} x2={m.x + s} y2={m.y - c} />
              </g>
            )
          })}
        </g>,
        { delay: 0.2 }
      )
      break
    }
    case 'horizon-band': {
      const waterline = h * (0.5 + H(1, 23) * 0.12)
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, waterline + ctx.b), p.tone1, 0.94), { dy: -h * 0.3 })
      add(ctx, fill(rectPoly(-ctx.b, waterline, w + 2 * ctx.b, h - waterline + ctx.b), p.tone3, 0.95), { delay: 0.05, dy: h * 0.3 })
      const water = rectPoly(-ctx.b, waterline, w + 2 * ctx.b, h - waterline + ctx.b)
      add(ctx, hatch(ctx, water, { ...hatchSpec(seed, 29), angle: 0 }, p.tone4, 0.55), { delay: 0.1, grow: 1 })
      add(
        ctx,
        <path d={wavyPath(seed, 31, -ctx.b, w + ctx.b, waterline, h * 0.012, 30)} fill="none" stroke={p.ink} strokeWidth={2.2} strokeOpacity={0.85} />,
        { delay: 0.16 }
      )
      break
    }
    case 'deep-dive': {
      const bh = (h + 2 * ctx.b) / 4
      const tones = [p.tone1, p.tone2, p.tone3, p.tone4]
      for (let i = 0; i < 4; i++) {
        const top = -ctx.b + bh * i
        add(ctx, fill(rectPoly(-ctx.b, top, w + 2 * ctx.b, bh + 1), tones[i], 0.95), { delay: i * 0.06, dy: h * 0.3 })
        if (i >= 1) {
          add(ctx, <path d={wavyPath(seed, 37 + i, -ctx.b, w + ctx.b, top, h * 0.008, 24)} fill="none" stroke={p.paper} strokeWidth={1.6} strokeOpacity={0.5} />, {
            delay: i * 0.06 + 0.05
          })
        }
      }
      break
    }
    case 'tone-ramp': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      const spec = hatchSpec(seed, 33)
      const cw = (w + 2 * ctx.b) / 4
      for (let i = 0; i < 4; i++) {
        const col = rectPoly(-ctx.b + cw * i, -ctx.b, cw, h + 2 * ctx.b)
        add(ctx, hatch(ctx, col, { ...spec, spacing: spec.spacing * (1.6 - i * 0.32) }, p.tone4, 0.6), { delay: i * 0.06, grow: 1 })
      }
      break
    }
    case 'double-band': {
      const slot = h * (0.2 + H(51, 43) * 0.08)
      const rail = h * 0.3
      const top = (h - slot) / 2 - rail
      add(ctx, fill(rectPoly(-ctx.b, top, w + 2 * ctx.b, rail), p.tone3, 0.95), { dx: -w * 0.4 })
      add(ctx, fill(rectPoly(-ctx.b, top + rail + slot, w + 2 * ctx.b, rail), p.tone4, 0.95), { delay: 0.07, dx: w * 0.4 })
      break
    }
    case 'tilt-band': {
      const lean = h * (0.14 + H(53, 47) * 0.14)
      const half = h * 0.17
      const band = [-ctx.b, h * 0.5 + lean - half, w + ctx.b, h * 0.5 - lean - half, w + ctx.b, h * 0.5 - lean + half, -ctx.b, h * 0.5 + lean + half]
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(band, inkBlock(p), 0.95), { delay: 0.06, dx: -w * 0.35 })
      add(ctx, hatch(ctx, band, { ...hatchSpec(seed, 59), angle: Math.PI / 2 }, p.paper, 0.3), { delay: 0.12, grow: 1 })
      break
    }
    case 'edge-rails': {
      const rail = h * (0.16 + H(61, 53) * 0.06)
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, rail + ctx.b), p.tone3, 0.94), { dy: -h * 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, h - rail, w + 2 * ctx.b, rail + ctx.b), p.tone3, 0.94), { delay: 0.06, dy: h * 0.2 })
      add(
        ctx,
        <g stroke={p.tone4} strokeWidth={1.2} strokeOpacity={0.6} fill="none">
          <line x1={-ctx.b} y1={rail + 8} x2={w + ctx.b} y2={rail + 8} />
          <line x1={-ctx.b} y1={h - rail - 8} x2={w + ctx.b} y2={h - rail - 8} />
        </g>,
        { delay: 0.16, dx: w * 0.2 }
      )
      break
    }
    case 'gradient-wall': {
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.94))
      const downward = H(71, 59) > 0.5
      const spec = hatchSpec(seed, 43)
      const bh = h / 5
      for (let i = 0; i < 5; i++) {
        const rank = downward ? i : 4 - i
        const top = bh * i - (i === 0 ? ctx.b : 0)
        const bottom = bh * (i + 1) + (i === 4 ? ctx.b : 0)
        const bandP = rectPoly(-ctx.b, top, w + 2 * ctx.b, bottom - top)
        add(ctx, hatch(ctx, bandP, { ...spec, spacing: spec.spacing * (1.9 - rank * 0.34) }, p.tone4, 0.55), {
          delay: i * 0.05,
          grow: 1
        })
      }
      break
    }
    case 'terrace': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const tones = [p.tone1, p.tone2, p.tone3, p.tone4]
      for (let i = 0; i < 4; i++) {
        const left = w * i * 0.14 - ctx.b
        const top = (h / 4) * i
        add(ctx, fill(rectPoly(left, top, w + 2 * ctx.b - left - ctx.b, h / 4 + 1), tones[i], 0.94), {
          delay: i * 0.06,
          dx: -w * 0.25
        })
      }
      break
    }

    /* ---------- 框/窗族 ---------- */
    case 'frame-window': {
      const cx = w / 2
      const cy = h / 2
      const rx = w * 0.42
      const ry = h * 0.44
      add(ctx, hatch(ctx, diamondPoly(cx, cy, rx * 0.78, ry * 0.78), hatchSpec(seed, 23, 1.4), p.tone2, 0.45), { grow: 1, delay: 0.02 })
      for (let r = 0; r < 3; r++) {
        const k = 1 - r * 0.22
        add(ctx, outline(diamondPoly(cx, cy, rx * k, ry * k), p.ink, r % 2 === 0 ? 3.5 : 1.4, 0.9), { delay: 0.08 + r * 0.04, dy: h * 0.06 })
      }
      break
    }
    case 'double-frame': {
      const offset = w * 0.05
      const box = rectPoly(w * 0.16, h * 0.2, w * 0.68, h * 0.6)
      const shifted = rectPoly(w * 0.16 + offset, h * 0.2 + offset * 0.6, w * 0.68, h * 0.6)
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(shifted, p.tone3, 0.8), { delay: 0.06, dx: offset * 3 })
      add(ctx, hatch(ctx, shifted, hatchSpec(seed, 43), p.tone4, 0.4), { delay: 0.1, grow: 1 })
      add(ctx, outline(box, p.ink, 3.5, 0.9), { delay: 0.14, dy: -h * 0.08 })
      break
    }
    case 'circle-window': {
      const r = ctx.unit * 0.34
      add(ctx, fill(bleedRect(ctx), p.tone3, 0.92))
      add(ctx, hatch(ctx, bleedRect(ctx), hatchSpec(seed, 47), p.tone4, 0.4), { delay: 0.04, grow: 1 })
      add(ctx, fill(circlePoly(w / 2, h / 2, r), p.paper, 0.95), { delay: 0.08 })
      add(ctx, outline(circlePoly(w / 2, h / 2, r), p.ink, 3, 0.9), { delay: 0.14 })
      add(ctx, outline(circlePoly(w / 2, h / 2, r * 1.12), p.ink, 1.2, 0.55), { delay: 0.2 })
      break
    }
    case 'ladder-frame': {
      const left = w * 0.14
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      for (let i = 0; i < 5; i++) {
        const y = h * (0.18 + i * 0.14)
        const run = w * (0.06 + i * 0.03)
        add(
          ctx,
          <g stroke={p.tone4} strokeWidth={i % 2 === 0 ? 3 : 1.4} strokeOpacity={0.85} fill="none">
            <line x1={left} y1={y} x2={left + run} y2={y} />
            <line x1={left} y1={y} x2={left} y2={y + h * 0.14} />
          </g>,
          { delay: i * 0.05, dx: -w * 0.1 }
        )
      }
      add(ctx, <line x1={w * 0.9} y1={-ctx.b} x2={w * 0.9} y2={h + ctx.b} stroke={p.tone4} strokeWidth={1.4} strokeOpacity={0.6} />, {
        delay: 0.28,
        dy: h * 0.2
      })
      break
    }
    case 'corner-brackets': {
      const inset = ctx.unit * 0.12
      const arm = ctx.unit * 0.16
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.9))
      const corners: [number, number, number, number][] = [
        [inset, inset, 1, 1],
        [w - inset, inset, -1, 1],
        [inset, h - inset, 1, -1],
        [w - inset, h - inset, -1, -1]
      ]
      corners.forEach(([x, y, sx, sy], i) => {
        add(
          ctx,
          <g stroke={p.ink} strokeWidth={3.5} strokeOpacity={0.9} fill="none">
            <line x1={x} y1={y} x2={x + arm * sx} y2={y} />
            <line x1={x} y1={y} x2={x} y2={y + arm * sy} />
          </g>,
          { delay: i * 0.05, dx: sx * w * 0.06, dy: sy * h * 0.06 }
        )
      })
      break
    }
    case 'inset-box': {
      const box = rectPoly(w * 0.14, h * 0.2, w * 0.72, h * 0.6)
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(box, p.tone3, 0.55), { delay: 0.05, dy: h * 0.06 })
      add(ctx, outline(box, p.ink, 2.4, 0.85), { delay: 0.1 })
      break
    }
    case 'bracket-pair': {
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.9))
      const arm = w * 0.09
      const top = h * 0.26
      const bottom = h * 0.74
      ;[0.16, 0.84].forEach((xf, i) => {
        const x = w * xf
        const side = i === 0 ? 1 : -1
        add(
          ctx,
          <g stroke={p.ink} strokeWidth={4} strokeOpacity={0.9} fill="none">
            <line x1={x} y1={top} x2={x + arm * side} y2={top} />
            <line x1={x} y1={top} x2={x} y2={bottom} />
            <line x1={x} y1={bottom} x2={x + arm * side} y2={bottom} />
          </g>,
          { delay: i * 0.07, dx: side * w * 0.08 }
        )
      })
      break
    }
    case 'arch-window': {
      const r = w * 0.24
      const cx = w / 2
      const shoulder = h * 0.42
      add(ctx, fill(bleedRect(ctx), p.tone3, 0.92))
      add(ctx, fill(circlePoly(cx, shoulder, r, 48), p.paper, 0.95), { delay: 0.05, dy: -h * 0.08 })
      add(ctx, fill(rectPoly(cx - r, shoulder, 2 * r, h * 0.4), p.paper, 0.95), { delay: 0.05, dy: h * 0.08 })
      add(ctx, outline(circlePoly(cx, shoulder, r, 48), p.ink, 2.4, 0.8), { delay: 0.12 })
      add(ctx, outline(rectPoly(cx - r, shoulder, 2 * r, h * 0.4), p.ink, 2.4, 0.8), { delay: 0.12 })
      break
    }
    case 'grid-cells': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const cw = w * 0.76 / 3
      const ch = h * 0.64 / 3
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const cell = rectPoly(w * 0.12 + cw * col, h * 0.18 + ch * row, cw, ch)
          if (row === 1 && col === 1) add(ctx, fill(cell, p.tone4, 0.75), { delay: (row * 3 + col) * 0.03 })
          add(ctx, outline(cell, p.tone4, 1.2, 0.6), { delay: (row * 3 + col) * 0.03 })
        }
      }
      break
    }
    case 'keyhole': {
      const r = ctx.unit * 0.19
      const cx = w / 2
      const cy = h * 0.36
      add(ctx, fill(bleedRect(ctx), p.tone4, 0.94))
      add(ctx, fill(circlePoly(cx, cy, r, 48), p.paper, 0.96), { delay: 0.05 })
      add(ctx, fill(rectPoly(cx - r * 0.55, cy, r * 1.1, h * 0.46), p.paper, 0.96), { delay: 0.08, dy: h * 0.1 })
      add(ctx, outline(circlePoly(cx, cy, r, 48), p.ink, 2, 0.7), { delay: 0.14 })
      break
    }

    /* ---------- 海报族 ---------- */
    case 'poster-panel': {
      const tilt = -0.06
      add(ctx, fill(bleedRect(ctx), p.paper, 1))
      const d1 = diamondPoly(w / 2 - w * 0.12, h / 2, w * 0.42, h * 0.66)
      add(ctx, fill(rotatePoly(d1, w / 2, h / 2, tilt), p.ink, 0.92), { dx: -w * 0.6 })
      const d2 = diamondPoly(w / 2 + w * 0.2, h / 2 - h * 0.06, w * 0.3, h * 0.48)
      add(ctx, hatch(ctx, rotatePoly(d2, w / 2, h / 2, tilt), hatchSpec(seed, 41), p.tone4, 0.7), { delay: 0.08, grow: 1 })
      add(ctx, outline(rotatePoly(d2, w / 2, h / 2, tilt), p.ink, 2, 0.8), { delay: 0.12 })
      add(ctx, <path d={wavyPath(seed, 43, w * 0.2, w * 0.8, h / 2 + h * 0.42, h * 0.02)} fill="none" stroke={p.tone4} strokeWidth={2} strokeOpacity={0.7} />, {
        delay: 0.2,
        dy: h * 0.1
      })
      break
    }
    case 'diamond-stack': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const tones = [p.ink, p.tone4, p.tone3]
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.28
        add(
          ctx,
          fill(diamondPoly(w * (0.34 + i * 0.24), h * (0.52 - i * 0.14), w * 0.3 * k, h * 0.46 * k), tones[i], 0.93),
          { delay: i * 0.07, dx: w * 0.25, dy: -h * 0.12 }
        )
      }
      break
    }
    case 'slash-poster': {
      const lean = h * 0.34
      const band = [-ctx.b, h * 0.24 + lean, w + ctx.b, h * 0.24 - lean, w + ctx.b, h * 0.72 - lean, -ctx.b, h * 0.72 + lean]
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(band, inkBlock(p), 0.94), { delay: 0.05, dx: -w * 0.4 })
      add(ctx, hatch(ctx, band, { ...hatchSpec(seed, 67), angle: Math.PI / 3 }, p.paper, 0.3), { delay: 0.1, grow: 1 })
      add(ctx, outline(band, p.ink, 2.2, 0.8), { delay: 0.14 })
      break
    }
    case 'arrow-wedge': {
      const apex = h * (0.24 + H(3, 71) * 0.14)
      const thick = h * 0.2
      const tri = [-ctx.b, h + ctx.b, w / 2, apex, w + ctx.b, h + ctx.b]
      add(ctx, fill(tri, inkBlock(p), 0.94), { delay: 0.05, dy: h * 0.3 })
      add(ctx, hatch(ctx, tri, { ...hatchSpec(seed, 73), angle: -Math.PI / 4 }, p.paper, 0.35), { delay: 0.1, grow: 1 })
      add(
        ctx,
        <polyline
          points={`${-ctx.b},${h * 0.9} ${w / 2},${apex - thick * 0.4} ${w + ctx.b},${h * 0.9}`}
          fill="none"
          stroke={p.ink}
          strokeWidth={2}
          strokeOpacity={0.7}
        />,
        { delay: 0.16, dy: -h * 0.1 }
      )
      break
    }
    case 'edge-bleed': {
      const fromLeft = H(4, 79) > 0.5
      const cover = w * 0.42
      const mass = fromLeft ? rectPoly(-ctx.b, -ctx.b, cover + ctx.b, h + 2 * ctx.b) : rectPoly(w - cover, -ctx.b, cover + ctx.b, h + 2 * ctx.b)
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(mass, p.ink, 0.93), { delay: 0.05, dx: fromLeft ? -w * 0.4 : w * 0.4 })
      add(ctx, hatch(ctx, mass, hatchSpec(seed, 83), p.paper, 0.22), { delay: 0.12, grow: 1 })
      break
    }
    case 'triangle-mass': {
      const fromLeft = H(91, 89) > 0.5
      const apexX = fromLeft ? w * 1.02 : -w * 0.02
      const tri = [fromLeft ? -ctx.b : w + ctx.b, -ctx.b, fromLeft ? -ctx.b : w + ctx.b, h + ctx.b, apexX, h * (0.3 + H(93, 97) * 0.3)]
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(tri, inkBlock(p), 0.94), { delay: 0.05, dx: fromLeft ? -w * 0.35 : w * 0.35 })
      add(ctx, hatch(ctx, tri, hatchSpec(seed, 101), p.paper, 0.24), { delay: 0.12, grow: 1 })
      break
    }
    case 'ribbon-cross': {
      const half = h * 0.14
      const lean = h * 0.3
      const ribbon = (sign: number): number[] => [
        -ctx.b,
        h * 0.5 + sign * lean - half,
        w + ctx.b,
        h * 0.5 - sign * lean - half,
        w + ctx.b,
        h * 0.5 - sign * lean + half,
        -ctx.b,
        h * 0.5 + sign * lean + half
      ]
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(ribbon(1), p.tone3, 0.8), { delay: 0.05, dx: -w * 0.3 })
      add(ctx, fill(ribbon(-1), p.tone4, 0.8), { delay: 0.11, dx: w * 0.3 })
      break
    }
    case 'half-disc': {
      const fromRight = H(103, 107) > 0.5
      const r = Math.hypot(w, h) * 0.62
      const cx = fromRight ? w + r * 0.55 : -r * 0.55
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(circlePoly(cx, h * 0.5, r, 64), p.tone4, 0.94), { delay: 0.05, dx: fromRight ? w * 0.3 : -w * 0.3 })
      add(ctx, outline(circlePoly(cx, h * 0.5, r, 64), p.ink, 2, 0.6), { delay: 0.12 })
      break
    }
    case 'stacked-slabs': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      const tones = [p.tone2, p.tone3, p.tone4]
      for (let i = 0; i < 3; i++) {
        const rot = -0.09 + i * 0.08
        const slab = rotatePoly(
          rectPoly(w / 2 - (w * (0.84 - i * 0.1)) / 2, h / 2 - (h * (0.6 - i * 0.06)) / 2, w * (0.84 - i * 0.1), h * (0.6 - i * 0.06)),
          w / 2,
          h / 2,
          rot
        )
        add(ctx, fill(slab, tones[i], 0.93), { delay: i * 0.07, dx: w * 0.2, dy: h * 0.12 })
      }
      break
    }
    case 'wedge-pair': {
      const waist = w * (0.2 + H(109, 113) * 0.1)
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill([-ctx.b, -ctx.b, (w - waist) / 2, h * 0.5, -ctx.b, h + ctx.b], p.tone4, 0.94), { delay: 0.05, dx: -w * 0.25 })
      add(ctx, fill([w + ctx.b, -ctx.b, (w + waist) / 2, h * 0.5, w + ctx.b, h + ctx.b], p.tone4, 0.94), { delay: 0.11, dx: w * 0.25 })
      break
    }

    /* ---------- 稀疏族 ---------- */
    case 'quiet-line': {
      const gw = w * 0.7
      const gx = (w - gw) / 2
      ;[0.38, 0.5, 0.62].forEach((yf, i) => {
        add(ctx, <rect x={gx} y={h * yf} width={gw} height={1} fill={p.line} />, {
          delay: i * 0.08,
          dx: (i % 2 === 0 ? -1 : 1) * w * 0.2
        })
      })
      add(
        ctx,
        <path d={scribblePath(seed, 47, w * 0.2, h * 0.26, ctx.unit * 0.09, 2)} fill="none" stroke={p.tone4} strokeWidth={1.6} strokeOpacity={0.7} />,
        { delay: 0.24, driftX: w * 0.004 }
      )
      break
    }
    case 'starfield-dots': {
      const spacing = Math.max(24, Math.sqrt((w * h) / 900))
      const marks = dotGrid(w + ctx.b, h + ctx.b, spacing, 2.6)
      const dense = marks.filter((m) => m.y > h * 0.45)
      const sparse = marks.filter((m) => m.y <= h * 0.45 && (Math.round(m.x + m.y) % 3 < 1))
      if (dense.length) {
        add(
          ctx,
          <g fill={p.tone4} fillOpacity={0.45}>
            {dense.map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />
            ))}
          </g>,
          { dy: h * 0.2 }
        )
      }
      if (sparse.length) {
        add(
          ctx,
          <g fill={p.tone4} fillOpacity={0.25}>
            {sparse.map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />
            ))}
          </g>,
          { delay: 0.08, dy: -h * 0.15 }
        )
      }
      break
    }
    case 'ripple-lines': {
      for (let i = 0; i < 7; i++) {
        const y = h * (0.16 + i * 0.11)
        const amp = h * (0.006 + i * 0.004)
        add(
          ctx,
          <path d={wavyPath(seed, 89 + i, -ctx.b, w + ctx.b, y, amp, 26)} fill="none" stroke={p.tone4} strokeWidth={i % 3 === 0 ? 2 : 1.1} strokeOpacity={0.55} />,
          { delay: i * 0.045, dx: (i % 2 === 0 ? -1 : 1) * w * 0.15 }
        )
      }
      break
    }
    case 'hair-grid': {
      const v: JSX.Element[] = []
      for (let i = 0; i <= 6; i++) v.push(<line key={`v${i}`} x1={(w / 6) * i} y1={-ctx.b} x2={(w / 6) * i} y2={h + ctx.b} />)
      add(ctx, <g stroke={p.line} strokeWidth={1} strokeOpacity={0.8}>{v}</g>, { dy: -h * 0.1 })
      const hz: JSX.Element[] = []
      for (let i = 0; i <= 4; i++) hz.push(<line key={`h${i}`} x1={-ctx.b} y1={(h / 4) * i} x2={w + ctx.b} y2={(h / 4) * i} />)
      add(ctx, <g stroke={p.line} strokeWidth={1} strokeOpacity={0.8}>{hz}</g>, { delay: 0.08, dx: w * 0.1 })
      break
    }
    case 'margin-rule': {
      const fromLeft = H(121, 127) > 0.5
      const x = fromLeft ? w * 0.12 : w * 0.88
      add(ctx, fill(rectPoly(x - 3, -ctx.b, 6, h + 2 * ctx.b), p.tone4, 0.9), { dy: h * 0.15 })
      for (let i = 0; i < 3; i++) {
        add(ctx, <rect x={x + (fromLeft ? 22 : -22) - 3.5} y={h * (0.32 + i * 0.18)} width={7} height={7} fill={p.tone4} fillOpacity={0.8} />, {
          delay: 0.22 + i * 0.04,
          driftX: w * 0.003
        })
      }
      break
    }
    case 'dot-drift': {
      const spacing = Math.max(22, Math.sqrt((w * h) / 1200))
      const marks = dotGrid(w + ctx.b, h + ctx.b, spacing, 2.4)
      const near = marks.filter((m) => m.x + m.y > (w + h) * 0.5)
      const far = marks.filter((m) => m.x + m.y <= (w + h) * 0.5 && Math.round(m.x + m.y) % 2 < 1)
      if (near.length)
        add(ctx, <g fill={p.tone4} fillOpacity={0.5}>{near.map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />)}</g>, { dx: w * 0.12 })
      if (far.length)
        add(ctx, <g fill={p.tone4} fillOpacity={0.24}>{far.map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />)}</g>, { delay: 0.08, dx: -w * 0.12 })
      break
    }
    case 'arc-sweep': {
      const cx = H(131, 137) > 0.5 ? w * 1.15 : -w * 0.15
      const cy = h * 1.05
      const base = Math.hypot(w, h) * 0.42
      for (let i = 0; i < 5; i++) {
        add(ctx, outline(circlePoly(cx, cy, base + i * base * 0.22, 72), p.tone4, i % 2 === 0 ? 1.8 : 1, 0.55), { delay: i * 0.05, dy: h * 0.08 })
      }
      break
    }
    case 'blank-page': {
      add(ctx, <line x1={w * 0.18} y1={h * 0.7} x2={w * 0.36} y2={h * 0.7} stroke={p.line} strokeWidth={1.4} strokeOpacity={0.8} />, { dx: -w * 0.12 })
      add(
        ctx,
        <path d={scribblePath(seed, 139, w * 0.82, h * 0.26, ctx.unit * 0.06, 2)} fill="none" stroke={p.tone4} strokeWidth={1.4} strokeOpacity={0.6} />,
        { delay: 0.28 }
      )
      break
    }

    /* ---------- 电影遮幅族 ---------- */
    case 'cinema-scope':
    case 'cinema-wide':
    case 'cinema-academy':
    case 'cinema-square': {
      const aspects: Record<string, number> = {
        'cinema-scope': 2.39,
        'cinema-wide': 1.85,
        'cinema-academy': 1.33,
        'cinema-square': 1
      }
      const aspect = aspects[kind] ?? 1.85
      const fillK = 0.84 + (H(157, 163) - 0.5) * 0.06
      const maxW = w * fillK
      const maxH = h * fillK
      const winW = Math.min(maxW, maxH * aspect)
      const winH = winW / aspect
      const hole = rectPoly((w - winW) / 2, (h - winH) / 2, winW, winH)
      add(ctx, fill(hole, p.tone1, 0.35), { delay: 0.02 })
      add(ctx, hatch(ctx, hole, hatchSpec(seed, 149, 1.5), p.tone4, 0.2), { delay: 0.1, grow: 1 })
      const hx = (w - winW) / 2
      const hy = (h - winH) / 2
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, hy + ctx.b), p.tone4, 0.96), { dy: -h * 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, hy + winH, w + 2 * ctx.b, h - hy - winH + ctx.b), p.tone4, 0.96), { dy: h * 0.2 })
      add(ctx, fill(rectPoly(-ctx.b, hy, hx + ctx.b, winH), p.tone4, 0.96), { dx: -w * 0.2 })
      add(ctx, fill(rectPoly(hx + winW, hy, w - hx - winW + ctx.b, winH), p.tone4, 0.96), { dx: w * 0.2 })
      add(ctx, outline(hole, p.ink, 1.6, 0.5), { delay: 0.2 })
      break
    }
    case 'cinema-twin': {
      add(ctx, fill(bleedRect(ctx), p.tone4, 0.96))
      const left = rectPoly(w * 0.08, h * 0.16, w * 0.5, h - h * 0.32)
      const right = rectPoly(w * 0.62, h * 0.26, w * 0.28, h * 0.48)
      add(ctx, fill(left, p.tone1, 0.4), { dx: -w * 0.14 })
      add(ctx, fill(right, p.tone1, 0.85), { delay: 0.08, dx: w * 0.14 })
      add(ctx, outline(left, p.ink, 1.6, 0.5), { delay: 0.16 })
      add(ctx, outline(right, p.ink, 1.6, 0.5), { delay: 0.21 })
      add(ctx, hatch(ctx, right, hatchSpec(seed, 151), p.tone4, 0.35), { delay: 0.24, grow: 1 })
      break
    }

    /* ---------- 圆润族 ---------- */
    case 'bubble-drift': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      const big = discField(seed, 11, w, h, 8, ctx.unit * 0.115)
      const small = discField(seed, 17, w, h, 13, ctx.unit * 0.042)
      add(ctx, <g>{big.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.radius} fill={p.tone3} fillOpacity={0.88} />)}</g>, { delay: 0.05, dy: h * 0.16 })
      add(ctx, <g fill="none" stroke={p.ink} strokeWidth={2} strokeOpacity={0.55}>{big.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.radius} />)}</g>, { delay: 0.12, dy: h * 0.12 })
      add(ctx, <g>{small.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.radius} fill={p.tone4} fillOpacity={0.7} />)}</g>, { delay: 0.18, dy: h * 0.22 })
      break
    }
    case 'cloud-window': {
      const cx = w / 2
      const cy = h * 0.52
      const rx = w * 0.3
      const ry = h * 0.3
      add(ctx, fill(bleedRect(ctx), p.tone3, 0.92))
      add(ctx, fill(lobedPoly(cx, cy + h * 0.025, rx * 1.05, ry * 1.05, 9, 0.1), p.tone4, 0.5), { delay: 0.04 })
      add(ctx, fill(lobedPoly(cx, cy, rx, ry, 9, 0.1), p.paper, 0.96), { delay: 0.08 })
      add(ctx, outline(lobedPoly(cx, cy, rx, ry, 9, 0.1), p.ink, 2.4, 0.85), { delay: 0.12 })
      break
    }
    case 'heart-burst': {
      const lean = H(3, 83) > 0.5 ? 1 : -1
      const cx = w / 2
      const cy = h * 0.52
      const rx = w * 0.32
      const ry = h * 0.4
      add(ctx, fill(bleedRect(ctx), p.tone4, 0.94))
      add(ctx, fill(rotatePoly(heartPoly(cx + lean * w * 0.022, cy + h * 0.025, rx, ry), cx, cy, lean * 0.06), p.tone2, 0.6), { delay: 0.04 })
      add(ctx, fill(rotatePoly(heartPoly(cx, cy, rx, ry), cx, cy, lean * 0.06), p.paper, 0.95), { delay: 0.08, dy: h * 0.1 })
      add(ctx, outline(rotatePoly(heartPoly(cx, cy, rx, ry), cx, cy, lean * 0.06), p.ink, 3, 0.9), { delay: 0.14, dy: h * 0.08 })
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 0.4 : 0.24
        const hx = lean > 0 ? w * (0.88 + i * 0.08) : w * (0.12 - i * 0.08)
        const hy = h * (0.24 + i * 0.42)
        add(ctx, fill(rotatePoly(heartPoly(hx, hy, rx * s, ry * s), hx, hy, -lean * 0.22), p.tone2, 0.9), {
          delay: 0.2 + i * 0.06,
          dx: lean * w * 0.12
        })
      }
      break
    }
    case 'sparkle-field': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.88))
      const seeds = discField(seed, 23, w, h, 9, ctx.unit * 0.07)
      seeds.slice(0, 5).forEach((d, i) => {
        add(ctx, fill(starPoly(d.x, d.y, d.radius, d.radius * 0.16, 4, H(i, 29) * 0.9), p.tone4, 0.9), {
          delay: 0.06 + i * 0.05
        })
      })
      seeds.slice(5).forEach((d) => {
        add(ctx, <circle cx={d.x} cy={d.y} r={d.radius * 0.22} fill={p.tone4} fillOpacity={0.7} />, { delay: 0.24 })
      })
      add(ctx, <line x1={w * 0.08} y1={h * 0.74} x2={w * 0.92} y2={h * 0.72} stroke={p.tone4} strokeWidth={1.2} strokeOpacity={0.5} />, { delay: 0.3, dx: -w * 0.12 })
      break
    }
    case 'petal-arc': {
      const fromLeft = H(5, 89) > 0.5
      const hubX = fromLeft ? -w * 0.1 : w * 1.1
      const hubY = h * 0.12
      const rx = w * 0.26
      const ry = h * 0.085
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.92))
      for (let i = 0; i < 5; i++) {
        const base = ellipsePoly(hubX + (fromLeft ? rx : -rx), hubY, rx, ry, 28)
        const rot = (fromLeft ? 1 : -1) * (0.18 + i * 0.3)
        add(ctx, fill(rotatePoly(base, hubX, hubY, rot), i % 2 === 0 ? p.tone3 : p.tone1, 0.9), { delay: i * 0.05, dy: -h * 0.1 })
        add(ctx, outline(rotatePoly(base, hubX, hubY, rot), p.ink, 1.6, 0.5), { delay: 0.06 + i * 0.05 })
      }
      add(ctx, fill(lobedPoly(hubX, hubY, w * 0.11, w * 0.11, 6, 0.34), p.tone4, 0.9), { delay: 0.28 })
      break
    }
    case 'scallop-band': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.9))
      add(ctx, fill(scallopBandPoly(-ctx.b, w + ctx.b, -ctx.b, h * 0.28, 9), p.tone3, 0.92), { delay: 0.04, dy: -h * 0.18 })
      add(ctx, fill(scallopBandPoly(-ctx.b, w + ctx.b, h + ctx.b, h * 0.72, 9), p.tone4, 0.92), { delay: 0.1, dy: h * 0.18 })
      add(ctx, outline(scallopBandPoly(-ctx.b, w + ctx.b, -ctx.b, h * 0.28, 9), p.ink, 2, 0.75), { delay: 0.14, dy: -h * 0.12 })
      add(ctx, outline(scallopBandPoly(-ctx.b, w + ctx.b, h + ctx.b, h * 0.72, 9), p.ink, 2, 0.75), { delay: 0.18, dy: h * 0.12 })
      const pitch = (w + 2 * ctx.b) / 9
      for (let i = 0; i < 5; i++) {
        add(ctx, <circle cx={-ctx.b + pitch * (i + 2)} cy={h * 0.28} r={ctx.unit * 0.018} fill={p.ink} fillOpacity={0.7} />, { delay: 0.26 })
      }
      break
    }
    case 'ribbon-loop': {
      const sag = h * (0.06 + H(7, 97) * 0.05) * (H(9, 97) > 0.5 ? 1 : -1)
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.92))
      add(ctx, fill(arcRibbonPoly(-ctx.b, w + ctx.b, h * 0.68, h * 0.06, -sag), p.tone4, 0.7), { delay: 0.04, dx: -w * 0.16 })
      add(ctx, fill(arcRibbonPoly(-ctx.b, w + ctx.b, h * 0.5, h * 0.3, sag), p.paper, 0.95), { delay: 0.08, dx: w * 0.18 })
      add(ctx, outline(arcRibbonPoly(-ctx.b, w + ctx.b, h * 0.5, h * 0.3, sag), p.ink, 2.6, 0.85), { delay: 0.14, dx: w * 0.14 })
      const knotX = w * (H(11, 97) > 0.5 ? 0.24 : 0.76)
      const knotY = h * 0.5 + Math.sin(((knotX + ctx.b) / (w + 2 * ctx.b)) * Math.PI) * sag
      ;[-1, 1].forEach((side, i) => {
        const loop = rotatePoly(ellipsePoly(knotX + side * w * 0.055, knotY, w * 0.05, h * 0.07, 26), knotX, knotY, side * 0.3)
        add(ctx, fill(loop, p.tone4, 0.92), { delay: 0.2 + i * 0.04 })
        add(ctx, outline(loop, p.ink, 2, 0.8), { delay: 0.24 + i * 0.04 })
      })
      add(ctx, fill(roundedRectPoly(knotX - w * 0.018, knotY - h * 0.035, w * 0.036, h * 0.07, h * 0.02), p.tone4, 0.95), { delay: 0.28 })
      break
    }
    case 'round-plate': {
      add(ctx, fill(bleedRect(ctx), p.tone3, 0.92))
      const plate = roundedRectPoly(w * 0.16, h * 0.24, w * 0.68, h * 0.52, ctx.unit * 0.11)
      const inner = roundedRectPoly(w * 0.19, h * 0.29, w * 0.62, h * 0.42, ctx.unit * 0.08)
      add(ctx, fill(plate, p.paper, 0.95), { delay: 0.05, dy: h * 0.06 })
      add(ctx, hatch(ctx, inner, hatchSpec(seed, 101, 1.3), p.tone2, 0.35), { delay: 0.1, grow: 1 })
      add(ctx, outline(plate, p.ink, 3, 0.9), { delay: 0.12 })
      add(ctx, outline(inner, p.tone4, 1.2, 0.55), { delay: 0.16 })
      break
    }
    case 'halo-burst': {
      const cx = w * (0.44 + H(13, 103) * 0.12)
      const cy = h * 0.5
      const reach = Math.hypot(w, h) * 0.7
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      for (let i = 0; i < 14; i += 2) {
        const angle = (i / 14) * TAU + H(i, 107) * 0.09
        const spread = 0.11
        add(
          ctx,
          fill(
            [
              cx,
              cy,
              cx + Math.cos(angle - spread) * reach,
              cy + Math.sin(angle - spread) * reach,
              cx + Math.cos(angle + spread) * reach,
              cy + Math.sin(angle + spread) * reach
            ],
            p.tone3,
            0.55
          ),
          { delay: 0.04 + i * 0.012 }
        )
      }
      add(ctx, fill(ellipsePoly(cx, cy, ctx.unit * 0.34, ctx.unit * 0.34, 48), p.paper, 0.94), { delay: 0.14 })
      add(ctx, outline(circlePoly(cx, cy, ctx.unit * 0.34, 48), p.ink, 3, 0.75), { delay: 0.2 })
      add(ctx, outline(circlePoly(cx, cy, ctx.unit * 0.44, 48), p.ink, 1.4, 0.75), { delay: 0.26 })
      break
    }

    /* ---------- 挖孔族 ---------- */
    case 'iris-hole': {
      const cx = w * 0.68
      const cy = h * 0.42
      const r = ctx.unit * 0.3
      const hole = circlePoly(cx, cy, r, 56)
      add(ctx, fillHoles(bleedRect(ctx), [hole], p.tone3, 0.94), { delay: 0.02 })
      add(ctx, outline(hole, p.ink, 3, 0.9), { delay: 0.08 })
      add(ctx, fill(rectPoly(-ctx.b, cy - ctx.unit * 0.035, cx - r * 0.7 + ctx.b, ctx.unit * 0.07), p.tone4, 0.9), { delay: 0.14, dx: -w * 0.12 })
      add(ctx, outline(circlePoly(cx, cy, r * 1.14, 56), p.tone4, 1.4, 0.6), { delay: 0.2 })
      break
    }
    case 'slot-rail': {
      const top = h * 0.22
      const slot = rectPoly(-ctx.b, top, w + 2 * ctx.b, h * 0.16)
      add(ctx, fillHoles(bleedRect(ctx), [slot], p.tone4, 0.94), { delay: 0.02 })
      add(ctx, outline(slot, p.ink, 2.4, 0.8), { delay: 0.1 })
      add(ctx, fill(rectPoly(w * 0.66, top - h * 0.06, w * 0.12, h * 0.28), p.tone2, 0.95), { delay: 0.16, dy: -h * 0.1 })
      add(ctx, <line x1={0} y1={top + h * 0.22} x2={w} y2={top + h * 0.22} stroke={p.tone2} strokeWidth={1.4} strokeOpacity={0.55} />, { delay: 0.22, dx: w * 0.14 })
      break
    }
    case 'punch-row': {
      const r = ctx.unit * 0.028
      const holes: number[][] = []
      for (let i = 0; i < 9; i++) {
        const x = w * (0.08 + i * 0.105)
        holes.push(circlePoly(x, h * 0.14, r, 20))
        holes.push(circlePoly(x, h * 0.86, r, 20))
      }
      add(ctx, fillHoles(bleedRect(ctx), holes, p.tone3, 0.94), { delay: 0.02 })
      add(ctx, <g stroke={p.tone4} strokeWidth={1.6} strokeOpacity={0.6} fill="none"><line x1={0} y1={h * 0.22} x2={w} y2={h * 0.22} /><line x1={0} y1={h * 0.78} x2={w} y2={h * 0.78} /></g>, { delay: 0.12, dx: w * 0.12 })
      break
    }
    case 'ring-eye': {
      const cx = w * 0.5
      const cy = h * 0.5
      const inner = ctx.unit * 0.31
      const outer = ctx.unit * 0.44
      const holes: number[][] = []
      for (let i = 0; i < 12; i++) {
        holes.push(annularSectorPoly(cx, cy, inner, outer, (i / 12) * TAU + 0.03, ((i + 1) / 12) * TAU - 0.03, 8))
      }
      add(ctx, fillHoles(bleedRect(ctx), holes, p.tone3, 0.94), { delay: 0.02 })
      add(ctx, outline(circlePoly(cx, cy, inner, 64), p.ink, 2.4, 0.85), { delay: 0.12 })
      add(ctx, outline(circlePoly(cx, cy, outer, 64), p.ink, 2.4, 0.85), { delay: 0.12 })
      break
    }
    case 'notch-stack': {
      const holes: number[][] = []
      for (let i = 0; i < 4; i++) {
        const size = ctx.unit * (0.26 - i * 0.05)
        holes.push(rectPoly(w * (0.6 + i * 0.06), h * (0.1 + i * 0.19), size, size))
      }
      add(ctx, fillHoles(bleedRect(ctx), holes, p.tone4, 0.94), { delay: 0.02 })
      holes.forEach((hle, i) => add(ctx, outline(hle, p.ink, 2, 0.75), { delay: 0.1 + i * 0.04 }))
      break
    }
    case 'dot-sieve': {
      const holes: number[][] = []
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 5; col++) {
          const density = 1 - col / 4.5
          if (H(row * 9 + col, 139) > density) continue
          const x = w * (0.06 + col * 0.105) + (row % 2 === 0 ? 0 : w * 0.05)
          const y = h * (0.1 + row * 0.16)
          holes.push(circlePoly(x, y, ctx.unit * 0.045 * density + ctx.unit * 0.012, 18))
        }
      }
      add(ctx, fillHoles(bleedRect(ctx), holes, p.tone2, 0.92), { delay: 0.02 })
      break
    }

    /* ---------- 仪表族 ---------- */
    case 'sight-mark': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      add(ctx, <g stroke={p.tone4} strokeWidth={1.4} strokeOpacity={0.6}><line x1={-ctx.b} y1={h / 2} x2={w + ctx.b} y2={h / 2} /><line x1={w / 2} y1={-ctx.b} x2={w / 2} y2={h + ctx.b} /></g>, { delay: 0.04, dx: w * 0.1 })
      add(ctx, fill(rectPoly(w * 0.24, h * 0.36, w * 0.52, h * 0.28), p.tone3, 0.94), { delay: 0.1, dy: h * 0.06 })
      add(ctx, outline(rectPoly(w * 0.2, h * 0.32, w * 0.6, h * 0.36), p.ink, 2.4, 0.85), { delay: 0.16 })
      break
    }
    case 'dial-scale': {
      const cx = w * 0.5
      const cy = h * 0.5
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.92))
      add(ctx, fill(annularSectorPoly(cx, cy, ctx.unit * 0.34, ctx.unit * 0.44, 0, TAU - 0.006, 60), p.tone4, 0.92), { delay: 0.05 })
      const ticks: JSX.Element[] = []
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU
        const r1 = ctx.unit * (i % 6 === 0 ? 0.46 : 0.475)
        ticks.push(<line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * ctx.unit * 0.5} y2={cy + Math.sin(a) * ctx.unit * 0.5} />)
      }
      add(ctx, <g stroke={p.ink} strokeWidth={1.6} strokeOpacity={0.7}>{ticks}</g>, { delay: 0.14 })
      break
    }
    case 'chevron-run': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      for (let i = 0; i < 5; i++) {
        const y = h * (0.02 + i * 0.24)
        const rise = h * 0.12
        const thick = h * 0.07
        const chev = [-ctx.b, y, w * 0.5, y - rise, w + ctx.b, y, w + ctx.b, y + thick, w * 0.5, y - rise + thick, -ctx.b, y + thick]
        add(ctx, fill(chev, i === 2 ? p.tone4 : p.tone3, i === 2 ? 0.95 : 0.7), { delay: i * 0.04, dy: -h * 0.12 })
      }
      break
    }
    case 'tally-column': {
      const x = w * 0.82
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.92))
      const marks: JSX.Element[] = []
      for (let i = 0; i < 11; i++) {
        const y = h * (0.1 + i * 0.075)
        marks.push(<line key={i} x1={x} y1={y} x2={x + w * (i % 4 === 0 ? 0.12 : 0.06)} y2={y} />)
      }
      add(ctx, <g stroke={p.tone4} strokeWidth={2.4} strokeOpacity={0.75}>{marks}</g>, { delay: 0.06, dx: w * 0.1 })
      add(ctx, fill(rectPoly(w * 0.8, h * 0.4, w * 0.16, h * 0.12), p.tone4, 0.95), { delay: 0.16, dx: w * 0.14 })
      add(ctx, <line x1={x} y1={h * 0.06} x2={x} y2={h * 0.92} stroke={p.ink} strokeWidth={1.6} strokeOpacity={0.6} />, { delay: 0.2 })
      break
    }
    case 'grid-focus': {
      const left = w * 0.08
      const top = h * 0.12
      const cw = (w * 0.84) / 4
      const chh = (h * 0.76) / 3
      const hole1 = rectPoly(left, top, cw, chh)
      const hole2 = rectPoly(left + cw * 3, top + chh * 2, cw, chh)
      add(ctx, fillHoles(bleedRect(ctx), [hole1, hole2], p.tone2, 0.92), { delay: 0.02 })
      add(ctx, outline(hole1, p.ink, 2, 0.7), { delay: 0.1 })
      add(ctx, outline(hole2, p.ink, 2, 0.7), { delay: 0.14 })
      add(ctx, fill(rectPoly(left + cw * 3, top, cw, chh), p.tone4, 0.95), { delay: 0.08, dx: w * 0.08 })
      const grid: JSX.Element[] = []
      for (let i = 0; i <= 4; i++) grid.push(<line key={`v${i}`} x1={left + cw * i} y1={top} x2={left + cw * i} y2={top + chh * 3} />)
      for (let i = 0; i <= 3; i++) grid.push(<line key={`h${i}`} x1={left} y1={top + chh * i} x2={left + cw * 4} y2={top + chh * i} />)
      add(ctx, <g stroke={p.tone4} strokeWidth={1.2} strokeOpacity={0.6}>{grid}</g>, { delay: 0.16 })
      break
    }
    case 'strobe-slats': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      const fractions = [0.06, 0.03, 0.09, 0.04, 0.34, 0.04, 0.08, 0.03, 0.06]
      let cursor = w * 0.03
      fractions.forEach((fr, i) => {
        add(ctx, fill(rectPoly(cursor, -ctx.b, w * fr, h + 2 * ctx.b), fr > 0.2 ? p.tone2 : p.tone4, fr > 0.2 ? 0.9 : 0.85), {
          delay: i * 0.03,
          dy: (i % 2 === 0 ? 1 : -1) * h * 0.14
        })
        cursor += w * (fr + 0.02)
      })
      break
    }
    case 'radial-comb': {
      const hubX = w * 1.06
      const hubY = h * 1.1
      const reach = Math.hypot(w, h) * 1.3
      add(ctx, fill(bleedRect(ctx), p.tone2, 0.92))
      const rays: JSX.Element[] = []
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + 0.16 + i * 0.062
        rays.push(<line key={i} x1={hubX} y1={hubY} x2={hubX + Math.cos(a) * reach} y2={hubY + Math.sin(a) * reach} />)
      }
      add(ctx, <g stroke={p.tone4} strokeWidth={2.6} strokeOpacity={0.8}>{rays}</g>, { delay: 0.06 })
      break
    }
    case 'bracket-target': {
      const box = rectPoly(w * 0.28, h * 0.54, w * 0.44, h * 0.34)
      add(ctx, fillHoles(bleedRect(ctx), [box], p.tone3, 0.94), { delay: 0.02 })
      add(ctx, outline(box, p.ink, 2.4, 0.85), { delay: 0.08 })
      const arm = ctx.unit * 0.08
      const corners: [number, number, number, number][] = [
        [w * 0.28, h * 0.54, 1, 1],
        [w * 0.72, h * 0.54, -1, 1],
        [w * 0.28, h * 0.88, 1, -1],
        [w * 0.72, h * 0.88, -1, -1]
      ]
      corners.forEach(([x, y, sx, sy], i) => {
        const ox = x + sx * w * 0.03
        const oy = y + sy * h * 0.04
        add(
          ctx,
          <g stroke={p.ink} strokeWidth={3.5} strokeOpacity={0.9} fill="none">
            <line x1={ox} y1={oy} x2={ox + arm * sx} y2={oy} />
            <line x1={ox} y1={oy} x2={ox} y2={oy + arm * sy} />
          </g>,
          { delay: 0.12 + i * 0.04, dx: sx * w * 0.05 }
        )
      })
      break
    }

    /* ---------- 营造族 ---------- */
    case 'apex-mass': {
      const apexX = w * (0.46 + H(3, 227) * 0.12)
      const apexY = h * 0.38
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill([-ctx.b, h + ctx.b, apexX, apexY, w + ctx.b, h + ctx.b], p.tone3, 0.95), { dy: h * 0.1 })
      add(ctx, hatch(ctx, [apexX, apexY, w + ctx.b, h + ctx.b, apexX + w * 0.24, h + ctx.b], hatchSpec(seed, 229, 0.7), p.tone4, 0.5), { delay: 0.16, grow: 1 })
      break
    }
    case 'ziggurat': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      const tones = [p.tone4, p.tone3, p.tone3, p.tone2]
      for (let c = 0; c < 4; c++) {
        const half = w * (0.44 - c * 0.09)
        const top = h * (0.9 - c * 0.13) - h * 0.13
        add(ctx, fill(rectPoly(w / 2 - half, top, half * 2, h * 0.13 + ctx.b), tones[c], 0.95), { delay: 0.04 + c * 0.05, dy: h * 0.08 })
      }
      break
    }
    case 'slab-wall': {
      const edge = w * 0.36
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(edge, -ctx.b, w - edge + ctx.b, h + 2 * ctx.b), p.tone3, 0.95))
      add(ctx, <line x1={edge} y1={-ctx.b} x2={edge} y2={h + ctx.b} stroke={p.ink} strokeWidth={3.5} strokeOpacity={0.9} />, { delay: 0.1, dx: w * 0.06 })
      add(ctx, hatch(ctx, rectPoly(w * 0.62, h * 0.1, w * 0.3, h * 0.8), hatchSpec(seed, 233, 0.7), p.tone4, 0.5), { delay: 0.16, grow: 1 })
      break
    }
    case 'cantilever': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(w * 0.16, h * 0.5, w * 0.1, h * 0.5 + ctx.b), p.tone4, 0.95), { delay: 0.02, dy: h * 0.1 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.34, w * 0.78 + ctx.b, h * 0.16), p.tone3, 0.95), { delay: 0.08, dx: -w * 0.14 })
      add(ctx, hatch(ctx, rectPoly(w * 0.3, h * 0.36, w * 0.44, h * 0.12), hatchSpec(seed, 239, 0.7), p.paper, 0.35), { delay: 0.16, grow: 1 })
      break
    }
    case 'pylon-pair': {
      const bay = rectPoly(w * 0.26, h * 0.3, w * 0.48, h * 0.7 + ctx.b)
      add(ctx, fillHoles(bleedRect(ctx), [bay], p.tone1, 0.94), { delay: 0.02 })
      add(ctx, outline(bay, p.ink, 2, 0.6), { delay: 0.12 })
      ;[0.1, 0.74].forEach((xf, i) => {
        add(ctx, fill(rectPoly(w * xf, h * 0.28, w * 0.16, h * 0.72 + ctx.b), p.tone4, 0.95), { delay: 0.04 + i * 0.05, dy: h * 0.08 })
      })
      add(ctx, fill(rectPoly(w * 0.04, h * 0.14, w * 0.92, h * 0.16), p.tone3, 0.95), { delay: 0.14, dy: -h * 0.1 })
      break
    }
    case 'bunker-slit': {
      const slit = rectPoly(-ctx.b, h * 0.62, w + 2 * ctx.b, h * 0.06)
      add(ctx, fillHoles(bleedRect(ctx), [slit], p.tone1, 0.94), { delay: 0.02 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.34, w + 2 * ctx.b, h * 0.28), p.tone4, 0.95), { delay: 0.05, dy: -h * 0.08 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.68, w + 2 * ctx.b, h * 0.32 + ctx.b), p.tone4, 0.95), { delay: 0.08, dy: h * 0.1 })
      add(ctx, <line x1={-ctx.b} y1={h * 0.34} x2={w + ctx.b} y2={h * 0.34} stroke={p.ink} strokeWidth={3} strokeOpacity={0.85} />, { delay: 0.14 })
      break
    }
    case 'plinth-stack': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(w * 0.06, h * 0.72, w * 0.88, h * 0.28 + ctx.b), p.tone4, 0.95))
      add(ctx, fill(rectPoly(w * 0.16, h * 0.52, w * 0.68, h * 0.2), p.tone3, 0.95), { delay: 0.08 })
      add(ctx, fill(rectPoly(w * 0.28, h * 0.34, w * 0.44, h * 0.18), p.tone2, 0.95), { delay: 0.14, dy: h * 0.06 })
      add(ctx, hatch(ctx, rectPoly(w * 0.2, h * 0.76, w * 0.6, h * 0.16), hatchSpec(seed, 243, 0.7), p.tone4, 0.5), { delay: 0.18, grow: 1 })
      break
    }
    case 'void-core': {
      const core = rectPoly(w * 0.22, h * 0.34, w * 0.56, h * 0.46)
      add(ctx, fillHoles(bleedRect(ctx), [core], p.tone3, 0.95), { delay: 0.02 })
      add(ctx, outline(core, p.ink, 3.5, 0.9), { delay: 0.08 })
      add(ctx, hatch(ctx, rectPoly(w * 0.04, h * 0.36, w * 0.14, h * 0.42), hatchSpec(seed, 247, 0.7), p.tone4, 0.45), { delay: 0.14, grow: 1 })
      break
    }
    case 'ridge-line': {
      const lift = H(5, 251) * 0.06
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(
        ctx,
        fill(
          [
            -ctx.b,
            h * (0.68 + lift),
            w * 0.34,
            h * (0.4 + lift),
            w * 0.62,
            h * (0.58 + lift),
            w + ctx.b,
            h * (0.34 + lift),
            w + ctx.b,
            h + ctx.b,
            -ctx.b,
            h + ctx.b
          ],
          p.tone3,
          0.95
        ),
        { dy: h * 0.08 }
      )
      add(
        ctx,
        hatch(
          ctx,
          [w * 0.34, h * (0.42 + lift), w * 0.62, h * (0.6 + lift), w * 0.62, h + ctx.b, w * 0.34, h + ctx.b],
          hatchSpec(seed, 253, 0.7),
          p.tone4,
          0.45
        ),
        { delay: 0.16, grow: 1 }
      )
      break
    }
    case 'chasm': {
      const gap = rectPoly(w * 0.46, -ctx.b, w * 0.1, h + 2 * ctx.b)
      add(ctx, fillHoles(bleedRect(ctx), [gap], p.tone1, 0.94), { delay: 0.02 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.3, w * 0.46 + ctx.b, h * 0.7 + ctx.b), p.tone3, 0.95), { dx: -w * 0.1 })
      add(ctx, fill(rectPoly(w * 0.56, h * 0.2, w * 0.44 + ctx.b, h * 0.8 + ctx.b), p.tone4, 0.95), { delay: 0.08, dx: w * 0.1 })
      break
    }
    case 'overhang': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(-ctx.b, -ctx.b, w + 2 * ctx.b, h * 0.34 + ctx.b), p.tone4, 0.95), { dy: -h * 0.1 })
      add(ctx, fill(rectPoly(w * 0.72, h * 0.34, w * 0.28 + ctx.b, h * 0.66 + ctx.b), p.tone3, 0.95), { delay: 0.08, dx: w * 0.1 })
      add(ctx, fill(rectPoly(-ctx.b, h * 0.34, w + 2 * ctx.b, h * 0.14), p.tone2, 0.5), { delay: 0.16 })
      break
    }
    case 'reverment': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(
        ctx,
        fill([-ctx.b, h * 0.72, w * 0.62, h * 0.3, w + ctx.b, h * 0.34, w + ctx.b, h + ctx.b, -ctx.b, h + ctx.b], p.tone3, 0.95),
        { dy: h * 0.1 }
      )
      const ribs: JSX.Element[] = []
      for (let i = 0; i < 9; i++) {
        const x = w * (0.04 + i * 0.11)
        const top = Math.max(h * (0.72 - (x / (w * 0.62)) * 0.42), h * 0.3) + h * 0.03
        ribs.push(<line key={i} x1={x} y1={top} x2={x - w * 0.03} y2={h + ctx.b} />)
      }
      add(ctx, <g stroke={p.tone4} strokeWidth={2.4} strokeOpacity={0.5}>{ribs}</g>, { delay: 0.16 })
      break
    }
    case 'tower-crop': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(w * 0.58, h * 0.18, w * 0.42 + ctx.b, h * 0.82 + ctx.b), p.tone4, 0.95), { dx: w * 0.08, dy: h * 0.06 })
      add(ctx, hatch(ctx, rectPoly(w * 0.62, h * 0.26, w * 0.12, h * 0.6), hatchSpec(seed, 257, 0.7), p.paper, 0.3), { delay: 0.16, grow: 1 })
      break
    }
    case 'lintel': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill(rectPoly(-ctx.b, h * 0.4, w + 2 * ctx.b, h * 0.2), p.tone3, 0.95), { dx: -w * 0.16 })
      ;[0.18, 0.66].forEach((xf, i) => {
        add(ctx, fill(rectPoly(w * xf, h * 0.6, w * 0.16, h * 0.12), p.tone4, 0.95), { delay: 0.12 + i * 0.04, dy: h * 0.06 })
      })
      break
    }
    case 'gnomon': {
      add(ctx, fill(bleedRect(ctx), p.tone1, 0.94))
      add(ctx, fill([w * 0.42, h * 0.86, w + ctx.b, h * 0.6, w + ctx.b, h * 0.78, w * 0.46, h * 0.94], p.tone2, 0.6), { delay: 0.1, dx: w * 0.1 })
      add(ctx, fill([w * 0.3, h + ctx.b, w * 0.36, h * 0.16, w * 0.42, h * 0.16, w * 0.46, h + ctx.b], inkBlock(p), 0.95), { delay: 0.04, dy: h * 0.08 })
      break
    }

    /* ---------- 物语族 ---------- */
    case 'monogatari-card': {
      add(ctx, fill(bleedRect(ctx), H(167, 173) > 0.5 ? p.tone4 : p.tone1, 1))
      add(ctx, <line x1={w * 0.12} y1={h * 0.9} x2={w * 0.88} y2={h * 0.9} stroke={p.paper} strokeWidth={1.2} strokeOpacity={0.45} />, { delay: 0.22, dx: w * 0.15 })
      break
    }
    case 'monogatari-rule': {
      add(ctx, fill(bleedRect(ctx), H(167, 173) > 0.5 ? p.tone4 : p.tone1, 1))
      const y = h * (0.62 + H(179, 181) * 0.08)
      add(ctx, fill(rectPoly(-ctx.b, y, w + 2 * ctx.b, h * 0.012), p.paper, 0.85), { delay: 0.12, dx: -w * 0.3 })
      add(ctx, <line x1={-ctx.b} y1={y + h * 0.05} x2={w + ctx.b} y2={y + h * 0.05} stroke={p.paper} strokeWidth={1} strokeOpacity={0.35} />, { delay: 0.2, dx: w * 0.2 })
      break
    }
    case 'monogatari-edge': {
      const fieldTone = H(167, 173) > 0.5 ? p.tone4 : p.tone1
      add(ctx, fill(bleedRect(ctx), fieldTone, 1))
      const bandW = w * (0.1 + H(191, 193) * 0.05)
      const fromLeft = H(197, 199) > 0.5
      const spine = rectPoly(fromLeft ? -ctx.b : w - bandW, -ctx.b, bandW + ctx.b, h + 2 * ctx.b)
      add(ctx, fill(spine, fieldTone === p.tone4 ? p.tone1 : p.tone4, 0.95), { delay: 0.1, dx: (fromLeft ? -1 : 1) * w * 0.2 })
      add(ctx, hatch(ctx, spine, hatchSpec(seed, 211), p.paper, 0.2), { delay: 0.18, grow: 1 })
      break
    }
    case 'monogatari-stack': {
      add(ctx, fill(bleedRect(ctx), H(167, 173) > 0.5 ? p.tone4 : p.tone1, 1))
      add(
        ctx,
        <g stroke={p.paper} strokeWidth={1.1} strokeOpacity={0.4}>
          <line x1={w * 0.25} y1={-ctx.b} x2={w * 0.25} y2={h + ctx.b} />
          <line x1={w * 0.75} y1={-ctx.b} x2={w * 0.75} y2={h + ctx.b} />
        </g>,
        { delay: 0.14, dy: h * 0.12 }
      )
      break
    }
    case 'monogatari-flash': {
      add(ctx, fill(bleedRect(ctx), p.tone4, 1))
      const marks = crossRow(seed, 223, w * 0.1, h * 0.18, 4, w * 0.05, 10)
      add(
        ctx,
        <g stroke={p.paper} strokeWidth={2.4} strokeOpacity={0.6}>
          {marks.map((m, i) => {
            const c = Math.cos(m.rotation + Math.PI / 4) * m.size
            const s = Math.sin(m.rotation + Math.PI / 4) * m.size
            return (
              <g key={i}>
                <line x1={m.x - c} y1={m.y - s} x2={m.x + c} y2={m.y + s} />
                <line x1={m.x - s} y1={m.y + c} x2={m.x + s} y2={m.y - c} />
              </g>
            )
          })}
        </g>,
        { delay: 0.2, dx: -w * 0.1 }
      )
      break
    }

    default:
      break
  }

  /* ---------- 共享装饰:交叉引导线 + 角标 ---------- */
  const profile = SHOT_PROFILES[kind]
  if (profile?.sharedDecor !== false) {
    addCrossing(ctx, 1 + Math.floor(hash01(seed, 31, 5) * 2))
    if (showDecor) addMotif(ctx)
  }

  return ctx.items
}

/** 构图选择:按句子种子稳定,副歌偏 loud */
export function pickKind(seed: number, isChorus: boolean, graphemeCount: number, index: number): TemperaKind {
  if (graphemeCount <= 2) return 'quiet-line'
  const loud: TemperaKind[] = [
    'quad-split',
    'duo-split',
    'diagonal-halves',
    'poster-panel',
    'slash-poster',
    'chevron-run',
    'strobe-slats',
    'stacked-slabs',
    'diamond-stack',
    'tilt-band'
  ]
  const neutral: TemperaKind[] = [
    'band-strip',
    'double-band',
    'deep-dive',
    'terrace',
    'offset-halves',
    'stair-blocks',
    'corner-quad',
    'tri-column',
    'thirds-stack',
    'horizon-band',
    'gradient-wall',
    'apex-mass',
    'ziggurat',
    'ridge-line',
    'reverment',
    'apex-mass',
    'chasm',
    'lintel',
    'reverment',
    'cinema-twin',
    'ribbon-cross',
    'wedge-pair',
    'sight-mark',
    'dial-scale',
    'radial-comb',
    'chevron-run',
    'ring-eye',
    'halo-burst',
    'bubble-drift',
    'scallop-band',
    'ribbon-loop'
  ]
  const quiet: TemperaKind[] = [
    // 只保留**仍然有成块构图**的安静类:纯线/点阵太淡,抽中时整屏几乎空白
    'frame-window',
    'double-frame',
    'circle-window',
    'arch-window',
    'keyhole',
    'corner-brackets',
    'bracket-pair',
    'inset-box',
    'ladder-frame',
    'grid-cells',
    'cinema-scope',
    'cinema-wide',
    'cinema-academy',
    'cinema-square',
    'cloud-window',
    'round-plate',
    'iris-hole',
    'slot-rail',
    'punch-row',
    'notch-stack',
    'grid-focus',
    'bracket-target',
    'slab-wall',
    'cantilever',
    'pylon-pair',
    'bunker-slit',
    'plinth-stack',
    'void-core',
    'overhang',
    'tower-crop',
    'gnomon',
    'monogatari-edge',
    'monogatari-stack',
    'monogatari-flash',
    'heart-burst',
    'tone-ramp',
    'edge-rails',
    'deep-dive',
    'terrace'
  ]
  const pick = (pool: TemperaKind[]): TemperaKind => pool[Math.floor(hash01(seed, index, 211) * pool.length) % pool.length]
  if (isChorus) return pick(loud)
  // 权重上调深色构图:参考视频里绝大多数句子都有成块的墨/纸对撞,稀疏版式只是点缀
  const r = hash01(seed, index, 223)
  if (r < 0.46) return pick(loud)
  if (r < 0.88) return pick(neutral)
  return pick(quiet)
}

/** 反向映射:旧版 kind 名 → 新名(防止已存的设置炸掉) */
export function normalizeKind(raw: unknown): TemperaKind {
  const all = Object.keys(SHOT_PROFILES)
  if (typeof raw === 'string' && all.includes(raw)) return raw as TemperaKind
  return 'frame-window'
}

export { TAU }
