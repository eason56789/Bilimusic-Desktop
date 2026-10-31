/**
 * 文字PV 运动学:严格对齐 folia sonnetMotion。
 *
 * 手感的三个来源(照抄其数值,不再自创):
 *  1. 入场用 **expoOut**(快起慢收),而非 smooth —— 这是"打击感"而不是"软绵绵"
 *  2. 逐字位移衰减 (1-p) 线性收敛,叠加上小幅交替入场向量
 *  3. 呼吸抖动频率比 0.13/0.31、幅度 0.006 —— 极轻,肉眼几乎察觉不到单帧跳跃
 *
 * 之前的"鬼畜"来自:位移幅度过大(0.26em)、旋转 ±6°、缓动用了 smooth、
 * 以及把位移/旋转/缩放同时叠在嵌套 transform 里(误差累积)。
 */

/** 三次贝塞尔单维求值 */
export function cubicCoordinate(p1: number, p2: number, t: number): number {
  const inv = 1 - t
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t
}

/** CSS 风格 cubic-bezier(x1,y1,x2,y2):先解 x 再取 y(对齐 folia resolveCubicBezier) */
export function resolveCubicBezier(x1: number, y1: number, x2: number, y2: number, value: number): number {
  const target = Math.min(1, Math.max(0, value))
  if (target === 0 || target === 1) return target
  let low = 0
  let high = 1
  let param = target
  for (let i = 0; i < 12; i++) {
    const x = cubicCoordinate(x1, x2, param)
    if (x < target) low = param
    else high = param
    param = (low + high) / 2
  }
  return cubicCoordinate(y1, y2, param)
}

/** 主缓动(镜头/呼吸用) */
export const easeInOut = (v: number): number => resolveCubicBezier(0.65, 0, 0.35, 1, v)

/** 逐字入场缓动:**expoOut**(folia 用它做"打击感") */
export function easeExpoOut(v: number): number {
  const x = Math.min(1, Math.max(0, v))
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** 逐字入场进度:0=未开始,1=落定 */
export function glyphProgress(nowMs: number, startMs: number, settleMs: number): number {
  return easeExpoOut(clamp01((nowMs - startMs) / Math.max(80, settleMs - startMs)))
}

export type PvCamKind =
  | 'type-impact'
  | 'editorial-column'
  | 'fragment-collage'
  | 'tracking-ribbon'
  | 'mask-reveal'
  | 'quiet-tableau'

export interface PvCamFrame {
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * 镜头轨迹:每种排版一条起止路径。
 * 系数对齐 folia resolveShotMotionFrame —— 位移都是画布比例的个位数百分比,
 * 缩放 1±0.05,旋转 ±0.006rad 级别,绝不会"晃"。
 */
export function cameraAt(kind: PvCamKind, progress: number, intensity = 1): PvCamFrame {
  const p = clamp01(progress)
  const k = intensity
  switch (kind) {
    case 'type-impact':
      return { x: 0, y: (0.01 - 0.02 * p) * k, scale: 1 + 0.02 * Math.sin(Math.PI * p) * k, rotation: 0 }
    case 'editorial-column':
      return {
        x: (-0.055 + 0.095 * easeInOut(p)) * k,
        y: (0.025 - 0.04 * easeInOut(p)) * k,
        scale: 0.98 + 0.07 * easeInOut(p),
        rotation: (-0.006 + 0.01 * easeInOut(p)) * k
      }
    case 'fragment-collage':
      return {
        x: (-0.03 + 0.06 * easeInOut(p)) * k,
        y: Math.sin(Math.PI * p) * 0.02 * k,
        scale: 0.99 + 0.05 * easeInOut(p),
        rotation: 0
      }
    case 'tracking-ribbon':
      // 横向摆幅最大的一档,但仍是画布 12% 以内的缓慢平移
      return {
        x: (-0.06 + 0.12 * easeInOut(p)) * k,
        y: 0,
        scale: 1 + 0.02 * easeInOut(p),
        rotation: 0
      }
    case 'mask-reveal':
      return { x: 0, y: (0.06 - 0.08 * easeInOut(p)) * k, scale: 1 + 0.03 * easeInOut(p), rotation: 0 }
    case 'quiet-tableau':
    default:
      return {
        x: Math.sin(Math.PI * p) * 0.012 * k,
        y: (0.006 - 0.012 * p) * k,
        scale: 1,
        rotation: 0
      }
  }
}

/**
 * 呼吸浮动:两路不成整数比的正弦叠加(肉眼几乎不可察,只为"不死板")。
 * 幅度对齐 folia resolveSonnetCameraBreath:画布比例 0.006 级。
 */
export function breathAt(timeSec: number, intensity = 1): PvCamFrame {
  const th = timeSec * Math.PI * 2
  return {
    x: (Math.sin(0.13 * th) + Math.sin(0.31 * th)) * 0.006 * intensity,
    y: (Math.sin(0.17 * th) + Math.sin(0.29 * th)) * 0.005 * intensity,
    scale: Math.sin(0.09 * th) * 0.002 * intensity,
    rotation: Math.sin(0.07 * th) * 0.0015 * intensity
  }
}
