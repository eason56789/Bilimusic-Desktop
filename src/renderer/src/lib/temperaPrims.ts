/**
 * 凝彩图元库(对照 folia-major 的 temperaHatch / temperaCurves / temperaShapes / temperaPalette)。
 *
 * 这里只产出**几何数据**(点串、线段、路径),不碰 React —— 渲染在组件里统一做,
 * 这样 121 种构图全部共用一套图元,也方便逐图元写 stagger 变换。
 *
 * 三个关键约定(照抄源码,不要改):
 *  1. **bleed = max(w,h) * 0.17**:所有通栏色块都要溢出画布,否则镜头 push 时露底。
 *  2. **hatch 只能裁剪凸多边形**:凹多边形(lobed/heart/star/scallop)只填色或描边。
 *  3. **grow 是以图元自身包围盒中心为轴心的横向张开**,drift 是缩放+旋转的双正弦。
 */

/** 色调阶梯(纸 → 墨):停止点严格对齐 TEMPERA_TONE_STOPS */
export const TONE_STOPS = [0.12, 0.3, 0.52, 0.72] as const

export interface TemperaPalette {
  paper: string
  ink: string
  tone1: string
  tone2: string
  tone3: string
  tone4: string
  /** 已经是半透明的细线色 */
  line: string
  accent: string
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return [128, 128, 128]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (r: number, g: number, b: number): string =>
  '#' +
  [r, g, b]
    .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0'))
    .join('')

/** 线性插值两色,t=0 取 a,t=1 取 b */
export function mixColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a)
  const [r2, g2, b2] = parseHex(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** Rec.709 亮度(0..255) */
export function luminance(color: string): number {
  const [r, g, b] = parseHex(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 把 color 的亮度拉到 target(只动明度不动色相),失败则退回 target 本身 */
function matchLuminance(color: string, target: string): string {
  const tc = parseHex(target)
  const targetL = 0.2126 * tc[0] + 0.7152 * tc[1] + 0.0722 * tc[2]
  const cc = parseHex(color)
  const curL = 0.2126 * cc[0] + 0.7152 * cc[1] + 0.0722 * cc[2]
  if (curL <= 0.001) return target
  const gain = targetL / curL
  const scaled = cc.map((v) => Math.round(clamp(v * gain, 0, 255)))
  const gotL = 0.2126 * scaled[0] + 0.7152 * scaled[1] + 0.0722 * scaled[2]
  if (Math.abs(gotL - targetL) > 1.5) return target
  return toHex(scaled[0], scaled[1], scaled[2])
}

/**
 * 构建整套调色板。
 * 单一色相模式(mono):纸 ↔ 墨的明度阶梯,正是参考图里那种"浅灰纸 + 黑字"。
 */
export function buildPalette(paper: string, ink: string, accent?: string): TemperaPalette {
  const ladder = TONE_STOPS.map((stop) => mixColor(paper, ink, stop))
  return {
    paper,
    ink,
    tone1: ladder[0],
    tone2: ladder[1],
    tone3: ladder[2],
    tone4: ladder[3],
    line: mixColor(paper, ink, 0.55),
    accent: accent && accent.trim() ? accent : ink
  }
}

/** 默认浅纸调色板(参考视频的底色) */
export const LIGHT_PALETTE = buildPalette('#c9c9c7', '#141414')
export const DARK_PALETTE = buildPalette('#17171a', '#ececeb')

/* ============================ 确定性随机 ============================ */

/** FNV-1a 字符串 → 32bit seed */
export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const mixSeed = (seed: number, salt: number): number =>
  Math.imul((Math.trunc(seed) ^ salt) >>> 0, 2654435761) >>> 0

/** 稳定 0..1(对齐 visualizerHash01) */
export function hash01(seed: number, index: number, salt: number): number {
  return mixSeed(seed + Math.imul(index + 1, 97), salt) / 4294967296
}

/* ============================ 多边形 ============================ */

export const TAU = Math.PI * 2

export function rectPoly(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y + h]
}

export function circlePoly(cx: number, cy: number, r: number, segments = 28): number[] {
  const count = Math.max(6, Math.round(segments))
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return out
}

export function diamondPoly(cx: number, cy: number, rx: number, ry: number): number[] {
  return [cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy]
}

export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, segments = 32): number[] {
  const count = Math.max(8, Math.round(segments))
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return out
}

/** 圆角矩形(凸,可 hatch) */
export function roundedRectPoly(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  cornerSegments = 6
): number[] {
  const limit = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  const steps = Math.max(1, Math.round(cornerSegments))
  const out: number[] = []
  const corners: [number, number, number][] = [
    [x + w - limit, y + limit, -Math.PI / 2],
    [x + w - limit, y + h - limit, 0],
    [x + limit, y + h - limit, Math.PI / 2],
    [x + limit, y + limit, Math.PI]
  ]
  for (const [ccx, ccy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2)
      out.push(ccx + Math.cos(a) * limit, ccy + Math.sin(a) * limit)
    }
  }
  return out
}

export function rotatePoly(poly: number[], cx: number, cy: number, angle: number): number[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const out: number[] = []
  for (let i = 0; i < poly.length; i += 2) {
    const dx = poly[i] - cx
    const dy = poly[i + 1] - cy
    out.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos)
  }
  return out
}

/** 花瓣/云朵(凹,只能填色或描边) */
export function lobedPoly(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lobes: number,
  amplitude: number,
  segments = 96
): number[] {
  const count = Math.max(24, Math.round(segments))
  const petals = Math.max(1, Math.round(lobes))
  const swell = Math.max(0, amplitude)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    const scale = (1 + Math.cos(a * petals) * swell) / (1 + swell)
    out.push(cx + Math.cos(a) * rx * scale, cy + Math.sin(a) * ry * scale)
  }
  return out
}

/** 荷叶边(凹) */
export function scallopBandPoly(
  x0: number,
  x1: number,
  flatY: number,
  baseY: number,
  bumps: number,
  segmentsPerBump = 10
): number[] {
  const count = Math.max(1, Math.round(bumps))
  const steps = Math.max(3, Math.round(segmentsPerBump))
  const span = (x1 - x0) / count
  const radius = Math.abs(span) / 2
  const dir = baseY >= flatY ? 1 : -1
  const out: number[] = [x0, flatY, x1, flatY]
  for (let bump = count - 1; bump >= 0; bump--) {
    const ccx = x0 + span * (bump + 0.5)
    for (let step = 0; step <= steps; step++) {
      const a = (step / steps) * Math.PI
      out.push(ccx + Math.cos(a) * (span / 2), baseY + dir * Math.sin(a) * radius)
    }
  }
  return out
}

/** 心形(凹) */
export function heartPoly(cx: number, cy: number, rx: number, ry: number, segments = 64): number[] {
  const count = Math.max(16, Math.round(segments))
  const raw: number[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU
    const x = Math.pow(Math.sin(t), 3) * 16
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    raw.push(x, y)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const halfW = Math.max(1e-6, (maxX - minX) / 2)
  const halfH = Math.max(1e-6, (maxY - minY) / 2)
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const out: number[] = []
  for (let i = 0; i < raw.length; i += 2) {
    out.push(cx + ((raw[i] - midX) / halfW) * rx, cy + ((raw[i + 1] - midY) / halfH) * ry)
  }
  return out
}

/** 环形扇区(凹) */
export function annularSectorPoly(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
  segments = 10
): number[] {
  const steps = Math.max(2, Math.round(segments))
  const out: number[] = []
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps
    out.push(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
  }
  for (let i = steps; i >= 0; i--) {
    const a = start + ((end - start) * i) / steps
    out.push(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
  }
  return out
}

/** 星形(凹):inner 越小越尖 */
export function starPoly(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rotation = 0
): number[] {
  const tips = Math.max(3, Math.round(points))
  const out: number[] = []
  for (let i = 0; i < tips * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = rotation - Math.PI / 2 + (i / (tips * 2)) * TAU
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return out
}

/** 拱形缎带(凹):半正弦带 */
export function arcRibbonPoly(
  x0: number,
  x1: number,
  y: number,
  thickness: number,
  sag: number,
  steps = 28
): number[] {
  const count = Math.max(4, Math.round(steps))
  const half = thickness / 2
  const top: number[] = []
  const bottom: number[] = []
  for (let i = 0; i <= count; i++) {
    const p = i / count
    const x = x0 + (x1 - x0) * p
    const centre = y + Math.sin(p * Math.PI) * sag
    top.push(x, centre - half)
    bottom.push(x, centre + half)
  }
  const out = top.slice()
  for (let i = bottom.length - 2; i >= 0; i -= 2) out.push(bottom[i], bottom[i + 1])
  return out
}

/* ============================ 点串工具 ============================ */

export function polyPath(poly: number[], close = true): string {
  if (poly.length < 4) return ''
  let d = `M${poly[0].toFixed(2)} ${poly[1].toFixed(2)}`
  for (let i = 2; i < poly.length; i += 2) d += ` L${poly[i].toFixed(2)} ${poly[i + 1].toFixed(2)}`
  return close ? d + ' Z' : d
}

/** 带洞填充(奇偶规则):孔必须 ≥3 点 */
export function cutPath(outer: number[], holes: number[][]): string {
  let d = polyPath(outer)
  for (const hole of holes) {
    if (hole.length < 6) continue
    d += ' ' + polyPath(hole)
  }
  return d
}

export function polyBounds(poly: number[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i]
    const y = poly[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/* ============================ hatch 网纹 ============================ */

export interface HatchSpec {
  angle: number
  spacing: number
  width: number
}

/**
 * 四种"网点调子":角度 ∈ {-45°,45°,-60°,30°},间距 ∈ {9,13,18}px。
 * 密度刻意做成粗台阶 —— 同一个形状才会读成**一个调子**而不是莫尔纹。
 */
export function hatchSpec(seed: number, salt: number, scale = 1): HatchSpec {
  const angles = [-Math.PI / 4, Math.PI / 4, -Math.PI / 3, Math.PI / 6]
  const angle = angles[Math.floor(hash01(seed, 1, salt) * 4)] ?? Math.PI / 4
  const density = Math.floor(hash01(seed, 2, salt) * 3)
  const spacing = [9, 13, 18][density] * scale
  const width = Math.max(0.8, spacing * (0.16 + hash01(seed, 3, salt) * 0.14))
  return { angle, spacing, width }
}

function centroidOf(poly: number[]): [number, number] {
  let sx = 0
  let sy = 0
  let n = 0
  for (let i = 0; i < poly.length; i += 2) {
    sx += poly[i]
    sy += poly[i + 1]
    n++
  }
  return n ? [sx / n, sy / n] : [0, 0]
}

/** 无限直线与凸多边形求交(Cyrus–Beck) */
function clipConvex(
  poly: number[],
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  span: number
): number[] | null {
  const [ccx, ccy] = centroidOf(poly)
  let tMin = -span
  let tMax = span
  const n = poly.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const x0 = poly[i * 2]
    const y0 = poly[i * 2 + 1]
    const x1 = poly[j * 2]
    const y1 = poly[j * 2 + 1]
    let nx = y1 - y0
    let ny = -(x1 - x0)
    if (nx * (ccx - x0) + ny * (ccy - y0) > 0) {
      nx = -nx
      ny = -ny
    }
    const denom = nx * dx + ny * dy
    const numer = nx * (ax - x0) + ny * (ay - y0)
    if (Math.abs(denom) < 1e-9) {
      if (numer > 0) return null
      continue
    }
    const t = -numer / denom
    if (denom > 0) tMax = Math.min(tMax, t)
    else tMin = Math.max(tMin, t)
    if (tMin > tMax) return null
  }
  if (tMax - tMin < 0.5) return null
  return [ax + dx * tMin, ay + dy * tMin, ax + dx * tMax, ay + dy * tMax]
}

/** 平行线填充:返回线段数组 [x1,y1,x2,y2](仅凸多边形) */
export function hatchLines(poly: number[], spec: HatchSpec): number[][] {
  const dx = Math.cos(spec.angle)
  const dy = Math.sin(spec.angle)
  const px = -dy
  const py = dx
  const bb = polyBounds(poly)
  const ccx = bb.x + bb.w / 2
  const ccy = bb.y + bb.h / 2
  const diagonal = Math.hypot(bb.w, bb.h)
  const steps = Math.min(160, Math.ceil(diagonal / (spec.spacing * 2)) + 2)
  const out: number[][] = []
  for (let s = -steps; s <= steps; s++) {
    const offset = s * spec.spacing
    const seg = clipConvex(poly, ccx + px * offset, ccy + py * offset, dx, dy, diagonal)
    if (seg) out.push(seg)
  }
  return out
}

/* ============================ 手绘路径 ============================ */

/** 抖动螺旋(涂鸦 motif / 导线痕) */
export function scribblePath(
  seed: number,
  salt: number,
  cx: number,
  cy: number,
  radius: number,
  turns = 2
): string {
  const safeTurns = Math.max(1, turns)
  const total = Math.max(13, Math.round(13 * safeTurns))
  const pts: number[] = []
  for (let i = 0; i <= total; i++) {
    const progress = i / total
    const angle = progress * TAU * safeTurns
    const jitterR = (hash01(seed, i, salt) - 0.5) * radius * 0.26
    const jitterA = (hash01(seed, i, salt + 7) - 0.5) * 0.22
    const r = radius * (0.52 + 0.48 * progress) + jitterR
    pts.push(cx + Math.cos(angle + jitterA) * r, cy + Math.sin(angle + jitterA) * r * 0.82)
  }
  return polyPath(pts, false)
}

/** 波动线(水面/地层线),1.5 个正弦周期 + 逐点抖动 */
export function wavyPath(
  seed: number,
  salt: number,
  x0: number,
  x1: number,
  y: number,
  amplitude: number,
  steps = 24
): string {
  const count = Math.max(2, Math.round(steps))
  const phase = hash01(seed, 0, salt) * TAU
  const pts: number[] = []
  for (let i = 0; i <= count; i++) {
    const p = i / count
    const wave = Math.sin(p * TAU * 1.5 + phase)
    const jitter = (hash01(seed, i, salt) - 0.5) * amplitude * 0.5
    pts.push(x0 + (x1 - x0) * p, y + wave * amplitude + jitter)
  }
  return polyPath(pts, false)
}

/* ============================ 标记行/网格 ============================ */

export interface LineMark {
  x: number
  y: number
  size: number
  rotation: number
}

function markRow(
  seed: number,
  salt: number,
  x0: number,
  y0: number,
  count: number,
  spacing: number,
  size: number,
  angle: number
): LineMark[] {
  const out: LineMark[] = []
  for (let i = 0; i < count; i++) {
    const jitter = (hash01(seed, i, salt) - 0.5) * spacing * 0.16
    const distance = i * spacing + jitter
    out.push({
      x: x0 + Math.cos(angle) * distance,
      y: y0 + Math.sin(angle) * distance,
      size: size * (0.82 + hash01(seed, i, salt + 3) * 0.36),
      rotation: (hash01(seed, i, salt + 11) - 0.5) * 0.3
    })
  }
  return out
}

export function crossRow(
  seed: number,
  salt: number,
  x: number,
  y: number,
  count: number,
  spacing: number,
  size = 9,
  angle = 0
): LineMark[] {
  return markRow(seed, salt, x, y, count, spacing, size, angle)
}

export function dotRow(
  seed: number,
  salt: number,
  x: number,
  y: number,
  count: number,
  spacing: number,
  size = 4,
  angle = Math.PI / 2
): LineMark[] {
  return markRow(seed, salt, x, y, count, spacing, size, angle)
}

/** 交错网点点阵(半调):奇数行偏移半个间距 */
export function dotGrid(w: number, h: number, spacing: number, size = 1.6): LineMark[] {
  const columns = Math.min(200, Math.ceil(w / spacing) + 1)
  const rows = Math.min(200, Math.ceil(h / spacing) + 1)
  const out: LineMark[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      out.push({
        x: column * spacing + (row % 2 === 0 ? 0 : spacing / 2),
        y: row * spacing,
        size,
        rotation: 0
      })
    }
  }
  return out
}

/** 抖动圆盘阵列(气泡/星点) */
export interface Disc {
  x: number
  y: number
  radius: number
}

export function discField(
  seed: number,
  salt: number,
  width: number,
  height: number,
  count: number,
  radius: number
): Disc[] {
  const total = Math.max(1, count)
  const columns = Math.max(1, Math.round(Math.sqrt(total * (width / Math.max(1, height)))))
  const rows = Math.max(1, Math.ceil(total / columns))
  const cellW = width / columns
  const cellH = height / rows
  const out: Disc[] = []
  for (let i = 0; i < total; i++) {
    const column = i % columns
    const row = Math.floor(i / columns)
    out.push({
      x: cellW * (column + 0.15 + hash01(seed, i, salt) * 0.7),
      y: cellH * (row + 0.15 + hash01(seed, i, salt + 3) * 0.7),
      radius: radius * (0.55 + hash01(seed, i, salt + 7) * 0.75)
    })
  }
  return out
}

/** 贯穿画面的交叉引导线(每个 shot 都叠,除非 sharedDecor=false) */
export function crossingLines(seed: number, salt: number, width: number, height: number, count: number): number[][] {
  const total = Math.min(3, Math.max(0, Math.round(count)))
  const out: number[][] = []
  for (let i = 0; i < total; i++) {
    const anchorY = height * (0.18 + hash01(seed, i, salt) * 0.64)
    const sign = hash01(seed, i, salt + 5) > 0.5 ? 1 : -1
    const angle = sign * (0.07 + hash01(seed, i, salt + 9) * 0.11)
    const reach = width * 0.9
    out.push([
      -width * 0.3,
      anchorY - Math.tan(angle) * reach,
      width * 1.3,
      anchorY + Math.tan(angle) * reach
    ])
  }
  return out
}
