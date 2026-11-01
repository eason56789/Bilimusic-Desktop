/**
 * 凝彩(Tempera)歌词样式:高还原 folia-major 的 block-PV。
 *
 * 截图里那种"中央灰色矩形 + 双层描边框 + 交叉细线 + 右上菱形"就是它的 frame-window 构图。
 *
 * 三层结构(照抄源码分层):
 *  1. **构图层**:按 shot kind 画几何色块/描边框/斜线填充 —— 纯 DOM + CSS 渐变/边框也能高还原
 *  2. **文字层**:整块居中对齐,逐词独立入场(7 种方向样式),字随镜头做视差
 *  3. **滤镜层**:对比反相(invert)让字压在哪层色块上都保持可读 —— 这是凝彩最标志性的效果
 *
 * 运动学严格对齐 temperaMotion / temperaCamera:
 *  - 入场 easeTemperaEnter = cubic-bezier(0.22,1,0.36,1)(长尾减速)
 *  - 缩放 easeTemperaSoftBack(c=1.42)轻微过冲落定
 *  - 镜头恒定速度 + inout 混合(中段不停顿),呼吸幅度 0.006
 */
import { useMemo } from 'react'

/** 构图种类:这里实现截图同款与几个常用族(其余可在后续扩充) */
export type TemperaKind =
  | 'frame-window'
  | 'double-frame'
  | 'circle-window'
  | 'quad-split'
  | 'duo-split'
  | 'tri-column'
  | 'diagonal-halves'
  | 'band-strip'
  | 'corner-brackets'
  | 'quiet-line'

/** 构图配置(对齐 TemperaShotProfile) */
export interface TemperaProfile {
  /** 文字区中心与尺寸(视口比例) */
  cx: number
  cy: number
  w: number
  h: number
  /** 文字区旋转(rad) */
  rotation: number
  /** 字号倍数 */
  fontScale: number
  /** 入场向量(字号倍数) */
  enterX: number
  enterY: number
  /** 镜头:沿 flow 角的位移 + 缩放区间 */
  travel: number
  zoomStart: number
  zoomEnd: number
  mood: 'quiet' | 'neutral' | 'loud'
}

/** 构图配置表(数值取自 folia temperaShotProfiles) */
export const TEMPERA_PROFILES: Record<TemperaKind, TemperaProfile> = {
  'frame-window': { cx: 0.5, cy: 0.5, w: 0.7, h: 0.34, rotation: 0, fontScale: 1, enterX: 0, enterY: 0.9, travel: 0.1, zoomStart: 1.04, zoomEnd: 1.12, mood: 'quiet' },
  'double-frame': { cx: 0.5, cy: 0.5, w: 0.72, h: 0.4, rotation: 0, fontScale: 1, enterX: 0.6, enterY: 0.8, travel: 0.11, zoomStart: 1.05, zoomEnd: 1.13, mood: 'neutral' },
  'circle-window': { cx: 0.5, cy: 0.5, w: 0.62, h: 0.34, rotation: 0, fontScale: 0.96, enterX: 0, enterY: 1, travel: 0.09, zoomStart: 1.06, zoomEnd: 1.1, mood: 'quiet' },
  'quad-split': { cx: 0.5, cy: 0.5, w: 0.82, h: 0.4, rotation: 0, fontScale: 1, enterX: 0.9, enterY: 0.9, travel: 0.09, zoomStart: 1.08, zoomEnd: 1.16, mood: 'loud' },
  'duo-split': { cx: 0.5, cy: 0.52, w: 0.86, h: 0.46, rotation: 0, fontScale: 1, enterX: 0, enterY: 1.3, travel: 0.11, zoomStart: 1.06, zoomEnd: 1.13, mood: 'neutral' },
  'tri-column': { cx: 0.5, cy: 0.5, w: 0.7, h: 0.5, rotation: 0, fontScale: 0.95, enterX: -1.2, enterY: 0, travel: 0.12, zoomStart: 1.04, zoomEnd: 1.12, mood: 'neutral' },
  'diagonal-halves': { cx: 0.5, cy: 0.5, w: 0.78, h: 0.4, rotation: -0.075, fontScale: 1, enterX: 1.1, enterY: 1.1, travel: 0.12, zoomStart: 1.06, zoomEnd: 1.14, mood: 'neutral' },
  'band-strip': { cx: 0.5, cy: 0.5, w: 0.9, h: 0.22, rotation: 0, fontScale: 0.9, enterX: -1, enterY: 0, travel: 0.13, zoomStart: 1.03, zoomEnd: 1.1, mood: 'quiet' },
  'corner-brackets': { cx: 0.5, cy: 0.5, w: 0.74, h: 0.36, rotation: 0, fontScale: 1, enterX: 0, enterY: 0.9, travel: 0.1, zoomStart: 1.04, zoomEnd: 1.12, mood: 'quiet' },
  'quiet-line': { cx: 0.5, cy: 0.5, w: 0.68, h: 0.24, rotation: 0, fontScale: 0.92, enterX: 0, enterY: 0.7, travel: 0.07, zoomStart: 1.02, zoomEnd: 1.07, mood: 'quiet' }
}

/* ===================== 缓动(对齐 temperaMotionEasing) ===================== */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function cubicCoord(p1: number, p2: number, t: number): number {
  const inv = 1 - t
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t
}

export function resolveCubicBezier(x1: number, y1: number, x2: number, y2: number, value: number): number {
  const target = clamp01(value)
  if (target === 0 || target === 1) return target
  let low = 0
  let high = 1
  let param = target
  for (let i = 0; i < 12; i++) {
    const x = cubicCoord(x1, x2, param)
    if (x < target) low = param
    else high = param
    param = (low + high) / 2
  }
  return cubicCoord(y1, y2, param)
}

/** 长尾减速:起势果断,尾部慢慢爬(凝彩的手感核心) */
export const easeEnter = (v: number): number => resolveCubicBezier(0.22, 1, 0.36, 1, v)
export const easeInOut = (v: number): number => resolveCubicBezier(0.62, 0, 0.32, 1, v)

/** 轻微过冲落定(用于缩放) */
export function easeSoftBack(v: number): number {
  const t = clamp01(v)
  const c = 1.42
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/* ===================== 入场样式(每种词随机分配) ===================== */

export const BASE_ENTER_STYLES = [
  'slide',
  'from-left',
  'from-right',
  'from-above',
  'from-below',
  'swing',
  'stamp'
] as const

/**
 * JIZURA 移植系列(852wa/JIZURA,11p_enterB.js)。
 * JIZURA 的入场是「对 glyph 的纯时间驱动变换函数」;这里摘出核心运动公式,
 * 颜色/滤镜效果一律映射为几何变换 + 透明度(凝彩文字走差分反相,只有纸/墨二色)。
 * 原型对应:springIn / pendulum / rollIn / rockSettle / stopMotion / ripple / zoomAlt / windBlown / crtOn。
 */
export const JIZURA_ENTER_STYLES = [
  'jizura-spring',
  'jizura-pendulum',
  'jizura-roll',
  'jizura-rock',
  'jizura-stopmotion',
  'jizura-ripple',
  'jizura-zoom',
  'jizura-wind',
  'jizura-crt'
] as const

export const ENTER_STYLES = [...BASE_ENTER_STYLES, ...JIZURA_ENTER_STYLES] as const
export type EnterStyle = (typeof ENTER_STYLES)[number]

/**
 * 入场样式候选池(按设置选择方案):
 *  - 'classic' :只有 GitHub 原版 7 种(默认 —— 与推送版本完全一致)
 *  - 'jizura'  :只有 JIZURA 移植的 9 种
 *  - 'mixed'   :16 种一起按种子轮换
 */
export type EnterPool = 'classic' | 'jizura' | 'mixed'

export function enterPoolOf(pool: EnterPool | string | undefined): readonly EnterStyle[] {
  if (pool === 'jizura') return JIZURA_ENTER_STYLES
  if (pool === 'mixed') return ENTER_STYLES
  return BASE_ENTER_STYLES
}

export interface EnterFrame {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  echo: number
  /** 可选的样式内透明度(1=默认);用于「等相位到再出现」的入场,组件会乘到 charAlpha 上 */
  alpha?: number
}

/* ---------- JIZURA 移植用的缓动/随机工具(对应 J.spring / E.outBack / J.r / J.rs) ---------- */

/** JIZURA 的阻尼弹簧:1 出发,过冲一次后精确归 0 */
function jzSpring(t: number, k: number, f: number): number {
  const x = Math.min(1, Math.max(0, t))
  return Math.exp(-k * x) * Math.cos(f * Math.PI * x) * (1 - x * x * x)
}

function jzOutBack(t: number, s: number): number {
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + (s + 1) * x * x * x + s * x * x
}

const jzOCubic = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const jzOQuint = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 5)
const jzClamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const jzLerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** 确定性伪随机 [0,1)(JIZURA 用种子哈希,这里用正弦哈希,同效) */
function jzRand(seed: number, salt: number): number {
  const s = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** JIZURA 的 J.rs:带符号随机 [-1,1) */
const jzRandSigned = (seed: number, salt: number): number => jzRand(seed, salt) * 2 - 1

/** 入场方案/样式选项(设置页「逐字入场」下拉共用) */
export const TEMPERA_ENTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'classic', label: '经典混合(朴素 7 种,推荐)' },
  { value: 'jizura', label: '物理纸感混合(9 种弹跳/滚落/涟漪)' },
  { value: 'mixed', label: '全部混合(共 16 种,最杂)' },
  { value: 'slide', label: '固定:基础滑入' },
  { value: 'from-left', label: '固定:从左入场' },
  { value: 'from-right', label: '固定:从右入场' },
  { value: 'from-above', label: '固定:从上入场' },
  { value: 'from-below', label: '固定:从下入场' },
  { value: 'swing', label: '固定:钟摆甩入' },
  { value: 'stamp', label: '固定:印章砸下' },
  { value: 'jizura-spring', label: '固定:弹簧弹起' },
  { value: 'jizura-pendulum', label: '固定:吊牌摆正' },
  { value: 'jizura-roll', label: '固定:滚轮转入' },
  { value: 'jizura-rock', label: '固定:摇摆落地' },
  { value: 'jizura-stopmotion', label: '固定:定格逐帧' },
  { value: 'jizura-ripple', label: '固定:涟漪浮出' },
  { value: 'jizura-zoom', label: '固定:景深交替' },
  { value: 'jizura-wind', label: '固定:乘风而来' },
  { value: 'jizura-crt', label: '固定:CRT 开机' }
]

/** 解析某个入场样式在 travel(1→0)、linear(0→1) 时的偏移/旋转/缩放 */
export function resolveEnterFrame(
  style: EnterStyle,
  inp: {
    enterX: number
    enterY: number
    enterRotation: number
    enterScale: number
    /** 每字稳定种子(驱动 JIZURA 系列的随机方向/相位;缺省 0) */
    seed?: number
    /** 字号 px(JIZURA 系列的位移/直径都按字号倍数取) */
    fontSize?: number
  },
  travel: number,
  linear: number
): EnterFrame {
  const settle = easeSoftBack(linear)
  const uniform = inp.enterScale + (1 - inp.enterScale) * settle
  const magnitude = Math.hypot(inp.enterX, inp.enterY)
  const directional = (dirX: number, dirY: number): EnterFrame => {
    const len = Math.hypot(dirX, dirY) || 1
    return {
      x: (dirX / len) * magnitude * travel,
      y: (dirY / len) * magnitude * travel,
      rotation: inp.enterRotation * 0.4 * travel,
      scaleX: uniform,
      scaleY: uniform,
      echo: travel
    }
  }
  switch (style) {
    case 'from-left':
      return directional(-1, 0.12)
    case 'from-right':
      return directional(1, -0.12)
    case 'from-above':
      return directional(0.12, -1)
    case 'from-below':
      return directional(-0.12, 1)
    case 'swing':
      return {
        x: inp.enterX * 0.6 * travel,
        y: inp.enterY * 0.6 * travel,
        rotation: (inp.enterRotation + Math.sign(inp.enterRotation || 1) * 0.95) * travel,
        scaleX: uniform,
        scaleY: uniform,
        echo: travel * 0.8
      }
    case 'stamp':
      return {
        x: 0,
        y: 0,
        rotation: inp.enterRotation * 0.6 * travel,
        scaleX: 1 + travel * 0.7,
        scaleY: 1 + travel * 0.7,
        echo: 0
      }
    /* ===================== JIZURA 移植系列(q = linear:0 出现 → 1 落定) ===================== */
    case 'jizura-spring': {
      // springIn:每字从下方被弹簧射上来,过冲越过落点再回弹稳住
      const q = jzClamp01(linear)
      const f = jzSpring(q, 4.2, 3)
      const v = (jzSpring(q + 0.01, 4.2, 3) - f) / 0.01
      // 速度越快纵向拉伸越狠,横向按体积守恒压缩
      const st = 1 + Math.min(0.5, Math.abs(v) * 0.075)
      const cp = 1 / Math.sqrt(st)
      return { x: 0, y: f * (inp.fontSize ?? 40) * 1.7, rotation: 0, scaleX: cp, scaleY: st, echo: 1 - q }
    }
    case 'jizura-pendulum': {
      // pendulum:字挂在上方的钉子上,像吊牌一样荡进摆正
      const q = jzClamp01(linear)
      const dir = jzRand(inp.seed ?? 0, 41) < 0.5 ? -1 : 1
      const ang = dir * 62 * jzSpring(q, 3.1, 2.4) // 摆角(度)
      const r = (ang * Math.PI) / 180
      const L = (inp.fontSize ?? 40) * 0.95 // 摆长 ≈ 字高一半 + 悬挂段
      return {
        x: -L * Math.sin(r),
        y: L * Math.cos(r) - L,
        rotation: r,
        scaleX: uniform,
        scaleY: uniform,
        echo: 1 - q
      }
    }
    case 'jizura-roll': {
      // rollIn:字沿行像轮子滚进来,旋转量与滚动距离严格耦合
      const q = jzClamp01(linear)
      const dir = jzRand(inp.seed ?? 0, 43) < 0.5 ? -1 : 1
      const D = (inp.fontSize ?? 40) * 2.3
      const off = dir * D * (1 - jzOutBack(q, 1.25))
      const r = Math.max(4, (inp.fontSize ?? 40) * 0.5) // 轮半径
      const k = jzLerp(0.72, 1, jzOCubic(q))
      return { x: off, y: 0, rotation: -off / r, scaleX: k, scaleY: k, echo: 1 - q }
    }
    case 'jizura-rock': {
      // rockSettle:斜着掉下来,砸在一个角上左右摇晃直到摆平
      const q = jzClamp01(linear)
      const fs = inp.fontSize ?? 40
      const hw = fs * 0.5
      const hh = fs * 0.5
      const sgn = jzRand(inp.seed ?? 0, 45) < 0.5 ? -1 : 1
      const th0 = sgn * (16 + 10 * jzRand(inp.seed ?? 0, 46)) // 初始倾角(度)
      const tL = 0.3
      let th: number
      let dy: number
      if (q < tL) {
        const t = q / tL
        th = th0
        dy = -(1 - t * t) * hh * 4 // 下落段
      } else {
        const t = (q - tL) / (1 - tL)
        th = th0 * Math.pow(1 - t, 1.5) * Math.cos(Math.PI * (1.4 * t + 1.9 * t * t)) // 衰减摇晃
        dy = 0
      }
      // 绕落地的那个角旋转(把角固定在原位)
      const r = (th * Math.PI) / 180
      const c = Math.cos(r)
      const s = Math.sin(r)
      const cx = th >= 0 ? hw : -hw
      const cy = hh
      return {
        x: cx - (cx * c - cy * s),
        y: dy + cy - (cx * s + cy * c),
        rotation: r,
        scaleX: uniform,
        scaleY: uniform,
        echo: 1 - q
      }
    }
    case 'jizura-stopmotion': {
      // stopMotion:定格动画 —— 字在几个" Held 顿帧"之间跳向落点,每帧都带一点手作抖动
      const q = jzClamp01(linear)
      const fs = inp.fontSize ?? 40
      const K = 5
      const k = Math.min(K - 1, Math.floor(q * K))
      if (k >= K - 1) return { x: 0, y: 0, rotation: 0, scaleX: uniform, scaleY: uniform, echo: 0 }
      const f = 1 - jzOCubic(k / (K - 1))
      const ang = jzRand(inp.seed ?? 0, 82) * Math.PI * 2
      const D = fs * (0.7 + 0.5 * jzRand(inp.seed ?? 0, 83))
      return {
        x: Math.cos(ang) * D * f + jzRandSigned(inp.seed ?? 0, k * 7 + 84) * fs * 0.05,
        y: Math.sin(ang) * D * f + jzRandSigned(inp.seed ?? 0, k * 7 + 85) * fs * 0.05,
        rotation:
          jzRandSigned(inp.seed ?? 0, k * 7 + 86) * ((22 * Math.PI) / 180) * f +
          jzRandSigned(inp.seed ?? 0, 87) * ((6 * Math.PI) / 180) * f,
        scaleX: uniform * (1 + jzRandSigned(inp.seed ?? 0, k * 7 + 88) * 0.14 * f),
        scaleY: uniform * (1 + jzRandSigned(inp.seed ?? 0, k * 7 + 88) * 0.14 * f),
        echo: 1 - q
      }
    }
    case 'jizura-ripple': {
      // ripple:环形波从中点扩散,波峰扫过哪一刻哪颗字才浮出,并随波峰起伏一次
      const q = jzClamp01(linear)
      const seed = inp.seed ?? 0
      const d = 0.15 + 0.85 * jzRand(seed, 53) // 到环心的相对距离(逐字种子近似)
      const q2 = jzClamp01((q - 0.68 * d) / 0.32)
      if (q2 <= 0) return { x: 0, y: 0, rotation: 0, scaleX: uniform, scaleY: uniform, echo: 1, alpha: 0 }
      const w = Math.sin(q2 * Math.PI * 2) * Math.pow(1 - q2, 2)
      const push = (inp.fontSize ?? 40) * 0.28 * w
      const th = jzRand(seed, 54) * Math.PI * 2
      const s = 1 + 0.4 * Math.sin(q2 * Math.PI) * (1 - q2)
      return {
        x: Math.cos(th) * push,
        y: Math.sin(th) * push,
        rotation: 0,
        scaleX: s,
        scaleY: s,
        echo: 1 - q2,
        alpha: jzClamp01(q2 * 5)
      }
    }
    case 'jizura-zoom': {
      // zoomAlt:景深交替 —— 一半字从镜头前猛扎进来(巨大→等倍),另一半从远处长出来(过冲放大)
      const q = jzClamp01(linear)
      if (jzRand(inp.seed ?? 0, 61) < 0.5) {
        const e = jzOQuint(q)
        const s = jzLerp(2.4, 1, e)
        return { x: 0, y: 0, rotation: 0, scaleX: s, scaleY: s, echo: 1 - q, alpha: jzClamp01(q * 2.5) }
      }
      const s = Math.max(0.02, jzOutBack(q, 2.2))
      return { x: 0, y: 0, rotation: 0, scaleX: s, scaleY: s, echo: 1 - q, alpha: jzClamp01(q * 4) }
    }
    case 'jizura-wind': {
      // windBlown(逐字版):整笔被一阵侧风卷进来,像叶子一样扑腾着落定
      const q = jzClamp01(linear)
      const seed = inp.seed ?? 0
      const dir = jzRand(seed, 71) < 0.5 ? -1 : 1
      const ph = jzRand(seed, 72) * Math.PI * 2
      const D = (inp.fontSize ?? 40) * 5
      const k = 1 - jzOCubic(q)
      return {
        x: -dir * D * k * (0.8 + 0.4 * jzRand(seed, 73)),
        y: (Math.sin(ph + k * 6) * 0.55 - 0.5 * jzRandSigned(seed, 74)) * (inp.fontSize ?? 40) * k,
        rotation: Math.sin(ph * 2 + k * 7) * ((170 * Math.PI) / 180) * k,
        scaleX: 1 - 0.3 * k,
        scaleY: 1 - 0.3 * k,
        echo: 1 - q,
        alpha: jzClamp01(q * 4)
      }
    }
    case 'jizura-crt': {
      // crtOn:CRT 通电 —— 先是一条水平亮线,再纵向撑开成字(过冲),同时横向收拢
      const q = jzClamp01(linear)
      const ky = Math.max(0.012, jzOutBack(jzClamp01((q - 0.24) / 0.5), 1.6))
      const kx = jzLerp(1.18, 1, jzOCubic(jzClamp01((q - 0.24) / 0.5)))
      return { x: 0, y: 0, rotation: 0, scaleX: kx, scaleY: ky, echo: 1 - q, alpha: jzClamp01((q - 0.2) / 0.06) }
    }
    case 'slide':
    default:
      return {
        x: inp.enterX * travel,
        y: inp.enterY * travel,
        rotation: inp.enterRotation * travel,
        scaleX: uniform,
        scaleY: uniform,
        echo: travel
      }
  }
}

/* ===================== 镜头(对齐 temperaCamera) ===================== */

export interface CamFrame {
  x: number
  y: number
  scale: number
  rotation: number
}

export function cameraAt(profile: TemperaProfile, progress: number): CamFrame {
  const clamped = clamp01(progress)
  // 恒定速度与缓动混合:中段永不停顿
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

export const BREATH_MAX_OFFSET = 0.006
export const BREATH_MAX_SCALE = 0.002
export const BREATH_MAX_ROTATION = 0.0015

export function breathAt(time: number, phase = 0): CamFrame {
  const tau = time * Math.PI * 2
  return {
    x: (Math.sin(tau * 0.13 + phase) * 0.65 + Math.sin(tau * 0.31 + phase * 1.7) * 0.35) * BREATH_MAX_OFFSET,
    y: (Math.cos(tau * 0.11 + phase * 2.3) * 0.65 + Math.sin(tau * 0.29 + phase * 0.9) * 0.35) * BREATH_MAX_OFFSET,
    scale: Math.sin(tau * 0.09 + phase * 1.3) * BREATH_MAX_SCALE,
    rotation: Math.sin(tau * 0.07 + phase * 2.9) * BREATH_MAX_ROTATION
  }
}

/* ===================== 逐词入场规划 ===================== */

export interface TemperaWord {
  text: string
  /** 相对文字区中心的偏移(px,排版后) */
  x: number
  y: number
  /** 该词的入场样式(同段内相邻词不同,制造拼贴感) */
  style: EnterStyle
  /** 入场向量(px) */
  enterX: number
  enterY: number
  /** 入场微旋转 */
  enterRotation: number
  /** 起始缩放 */
  enterScale: number
  /** 每字稳定种子(JIZURA 系列入场的随机方向/相位) */
  seed: number
  startTime: number
  settleTime: number
  /** 这个词唱完的时间(驱动唱后 tracking 展开) */
  endTime: number
  fontSize: number
  /** 唱后展开量:字距轻微变宽,让完成的句子"活着" */
  trackingX: number
}

/** 稳定哈希 */
function hash01(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 10000) / 10000
}

function isCjk(ch: string): boolean {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(ch)
}

/**
 * 单字前进宽度(em 倍数)。
 *
 * 之前所有非中日韩字符一律按 0.6em 估算,英文长句会**严重低估**总宽 ——
 * 布局以为还放得下,实际字已经压在一起、最后还要靠容器裁切。
 * 这里按字符类别分级:窄字母(i/l/j/t/f/r/空格/标点)、宽字母(m/w/M/W)、大写、数字。
 * 注:这是估算值,排版时还会按实测行宽再做一次矫正(见组件里的 measure 校正)。
 */
function advanceOf(ch: string, fontPx: number): number {
  if (/^\s+$/.test(ch)) return fontPx * 0.3
  if (isCjk(ch)) return fontPx
  // 窄字形
  if (/[iljtfrI.,:;'!|`]/.test(ch)) return fontPx * 0.32
  // 宽字形
  if (/[mwMW]/.test(ch)) return fontPx * 0.86
  // 大写
  if (/[A-Z]/.test(ch)) return fontPx * 0.68
  // 数字
  if (/[0-9]/.test(ch)) return fontPx * 0.58
  // 其余小写与标点
  return fontPx * 0.56
}

/** 按词切分(标点粘前一词) */
export function splitWords(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      const out: string[] = []
      let buf = ''
      for (const s of new Seg(undefined, { granularity: 'word' }).segment(text)) {
        if (s.isWordLike) buf += s.segment
        else if (buf) {
          out.push(buf + s.segment)
          buf = ''
        } else if (out.length > 0) out[out.length - 1] += s.segment
      }
      if (buf) out.push(buf)
      return out.length > 0 ? out : [text]
    } catch {
      /* 回退 */
    }
  }
  return [text]
}

/**
 * 凝彩逐字布局(强制逐字 + 空格必换行):
 *  - 排版单位是**字**
 *  - **句中出现空格 → 该处一定换行**(用户明确要求:英文一句一组词,不要挤成一条)
 *  - 单个 token 超过可用宽度时再逐字硬断,避免溢出
 *  - **尾字强调**:按句子种子有概率把最后 1~2 个字(CJK)/最后一个词(英文)
 *    甩到新的一行并放大字号 —— 编辑排版式的"收笔重音"
 *  - 每行按自身宽度水平居中,整体垂直居中
 *  - 时间轴按"非空白字数"平均分,空格只占时间、不出字形
 */
export function layoutTemperaWords(
  text: string,
  availW: number,
  fontSize: number,
  lineStartMs: number,
  lineEndMs: number,
  seedKey: string,
  /** 尾字强调概率 0~1(0=关闭;默认 0.38) */
  tailProb = 0.38,
  /** 入场样式候选池(默认只用 GitHub 原版 7 种) */
  pool: EnterPool | string = 'classic',
  /**
   * 每个可见字符的真实演唱起点(ms),来自 wordTimes / words(QRC、YRC)。
   * 长度与 text 去掉空白后的字符数一致;传 null/undefined 时按行时长平均分配。
   */
  charTimes?: number[] | null
): TemperaWord[] {
  const styles = enterPoolOf(pool)
  /** 多行之间的行高倍数 */
  const LINE_HEIGHT = 1.18

  /** 单字前进宽度 */
  const measureText = (s: string, fsz: number): number => {
    let w = 0
    for (const c of s) w += advanceOf(c, fsz)
    return w
  }

  // ---- 0) 尾字强调:决定是否把句尾甩出去 ----
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return []
  const visibleAll = Array.from(text.replace(/\s/g, '')).length
  let headText = text
  let tailText = ''
  let tailScale = 1
  const tailRoll = hash01(`${seedKey}:tail`)
  const canTail =
    visibleAll >= 6 &&
    tailProb > 0.001 &&
    tailRoll < tailProb &&
    (tokens.length >= 2 || Array.from(tokens[0]).length >= 6)
  if (canTail) {
    tailScale = 1.28 + hash01(`${seedKey}:tscale`) * 0.18
    if (tokens.length >= 2) {
      // 多词句:甩出最后一个词;太长(超过全句六成)就不甩,避免头轻脚重
      const lastTok = tokens[tokens.length - 1]
      if (Array.from(lastTok).length <= Math.ceil(visibleAll * 0.6)) {
        tailText = lastTok
        headText = text.slice(0, text.lastIndexOf(lastTok))
      }
    } else {
      // 单个长 token(CJK 常见):甩出末尾 1~2 个字
      const chars = Array.from(tokens[0])
      const n = hash01(`${seedKey}:tn`) > 0.5 ? 2 : 1
      tailText = chars.slice(-n).join('')
      headText = chars.slice(0, chars.length - n).join('')
    }
  }

  // ---- 1) 定行:head / tail 各自跑"空格必换行 + 超宽硬断 + 必要时缩字号" ----
  const layoutLines = (
    src: string,
    font: number
  ): { lines: string[]; fs: number } => {
    const srcTokens = src
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    let fs = font
    let lines: string[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      lines = []
      for (const tok of srcTokens) {
        const tw = measureText(tok, fs)
        if (tw <= availW) {
          lines.push(tok)
          continue
        }
        // 超宽 token(很长的英文单词):按字累积断开
        let cur = ''
        let curW = 0
        for (const c of tok) {
          const cw = advanceOf(c, fs)
          if (cur && curW + cw > availW) {
            lines.push(cur)
            cur = c
            curW = cw
          } else {
            cur += c
            curW += cw
          }
        }
        if (cur) lines.push(cur)
      }
      const widest = lines.reduce((m, l) => Math.max(m, measureText(l, fs)), 0)
      // 只有单个 token 也会被硬断成多行时,才需要缩字号;多行本身是设计,不缩
      const overflows = widest > availW * 1.0001
      if (!overflows) break
      const fit = widest > 0 ? availW / widest : 1
      fs *= Math.min(1, Math.max(0.5, fit))
    }
    return { lines, fs }
  }

  const head = layoutLines(headText, fontSize)
  const tail = tailText ? layoutLines(tailText, fontSize * tailScale) : null
  /** 每行各自的字号(head 与 tail 不同) */
  const rows = [
    ...head.lines.map((t) => ({ text: t, fs: head.fs })),
    ...(tail ? tail.lines.map((t) => ({ text: t, fs: tail.fs })) : [])
  ]
  if (rows.length === 0) return []
  /** tail 行前的额外呼吸(编辑排版的"甩出去"感) */
  const tailGap = tail ? Math.min(head.fs, tail.fs) * 0.14 : 0

  // ---- 2) 逐行排版:每行各自水平居中,整体垂直居中(各行行高按自身字号) ----
  const lineDur = Math.max(300, lineEndMs - lineStartMs)
  // 把所有字的演唱时长先按「非空白字数」平均分
  const visibleCount = rows.reduce((n, r) => n + Array.from(r.text.replace(/\s/g, '')).length, 0)
  const perChar = lineDur / Math.max(1, visibleCount)
  /**
   * 优先用真实逐字时间(QRC/YRC)。charTimes 与 text 逐字符对齐(含空白位),
   * 这里按「非空白字符」顺序取值,保证换行/尾字强调打乱行结构后仍对得上。
   * 长度不足则整体退回平均分配,避免半截数据造成错位。
   */
  const hasRealTimes = !!charTimes && charTimes.length > 0
  const blockH = rows.reduce((s, r) => s + r.fs * LINE_HEIGHT, 0) + tailGap

  const out: TemperaWord[] = []
  let charIndex = 0
  let cursorY = -blockH / 2
  rows.forEach((row, li) => {
    const fs = row.fs
    const lineHeightPx = fs * LINE_HEIGHT
    const chars = Array.from(row.text)
    const widths = chars.map((c) => advanceOf(c, fs))
    const totalW = widths.reduce((a, b) => a + b, 0)
    let cursor = -totalW / 2
    const rowY = cursorY + lineHeightPx / 2
    cursorY += lineHeightPx + (tail && li === head.lines.length - 1 ? tailGap : 0)

    chars.forEach((c, ci) => {
      const cw = widths[ci]
      const cx = cursor + cw / 2
      cursor += cw
      // 空格不产出字形,但占一个时间片(演唱上有停顿感)
      if (/^\s$/.test(c)) {
        charIndex += 1
        return
      }
      const idx = charIndex
      const h = hash01(`${seedKey}:${idx}`)
      let style = styles[Math.floor(h * styles.length) % styles.length]
      const prev = out[out.length - 1]
      if (prev && prev.style === style) {
        style = styles[(styles.indexOf(style) + 1) % styles.length]
      }
      /**
       * 时间轴:有真实逐字时间就用它(QRC/YRC),否则按可见字数平均分配。
       * 逐字数据长度对不上可见字数时整体退回平均值,避免半截错位。
       */
      const useReal = hasRealTimes && (charTimes as number[]).length >= visibleCount
      const realStart = useReal ? (charTimes as number[])[idx] : NaN
      const realNext = useReal ? (charTimes as number[])[idx + 1] : NaN
      const startTime = Number.isFinite(realStart) ? realStart : lineStartMs + idx * perChar
      // 每字的演唱时长:下一字起点 - 本字起点(末字用行末兜底)
      const rawDur = Number.isFinite(realNext)
        ? Math.max(60, realNext - startTime)
        : Number.isFinite(realStart)
          ? Math.max(60, lineEndMs - startTime)
          : perChar
      const motionWin = Math.min(1100, Math.max(420, rawDur * 0.9))
      const settleTime = Math.min(lineEndMs + motionWin * 0.2, startTime + motionWin)
      const dirX = h > 0.5 ? 1 : -1
      const mag = fs * (0.28 + h * 0.22)
      out.push({
        text: c,
        x: cx,
        y: rowY,
        style,
        enterX: dirX * mag,
        enterY: (h > 0.3 ? 1 : -1) * mag * 0.7,
        enterRotation: (hash01(`${seedKey}:rot:${idx}`) - 0.5) * 0.09,
        enterScale: 0.9 + hash01(`${seedKey}:sc:${idx}`) * 0.08,
        seed: hash01(`${seedKey}:sd:${idx}`) * 1000,
        startTime,
        settleTime,
        endTime: startTime + rawDur,
        fontSize: fs,
        trackingX: cx * 1.06
      })
      charIndex += 1
    })
  })
  return out
}

/** 选择构图(按句子种子稳定;副歌偏 loud,静场偏 quiet) */
export function pickTemperaKind(seedKey: string, isChorus: boolean, wordCount: number): TemperaKind {
  if (wordCount <= 2) return 'quiet-line'
  if (isChorus) {
    const loud: TemperaKind[] = ['quad-split', 'duo-split', 'diagonal-halves', 'band-strip']
    return loud[Math.floor(hash01(seedKey) * loud.length) % loud.length]
  }
  const all: TemperaKind[] = [
    'frame-window',
    'double-frame',
    'circle-window',
    'tri-column',
    'corner-brackets',
    'band-strip',
    'diagonal-halves'
  ]
  return all[Math.floor(hash01(seedKey) * all.length) % all.length]
}
