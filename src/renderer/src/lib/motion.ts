/**
 * 动效基础设施:统一时长/缓动/位移的单一出处。
 *
 * 设计约束:
 * - 所有动效只读 CSS 变量(--bm-mo-*),由 applyMotionVars 一处写入。
 *   关闭档把时长设成 0ms、位移/模糊归零,等于全局静止,不必逐处判断。
 * - 曲线沿用工程内既有族 cubic-bezier(0.16, 1, 0.3, 1)(styles.css 的页面切换即用此曲线),
 *   不引入第二套手感。
 * - 系统「减少动态效果」只在用户选了「完整」时把档位压到「舒缓」;
 *   用户显式选「关闭」永远优先。
 *
 * 速率模型(三层):
 *   最终时长 = 基准时长 × 档位倍率 ÷ 全局速率 ÷ 该通道速率
 *   1) 档位(motionLevel):决定有无动效、模糊/位移幅度
 *   2) 全局速率(motionSpeed):一把调快/调慢所有时间轴
 *   3) 通道速率(motionFine):分别微调 列表入场/错开/页面/悬停/封面/歌单信息
 */
import { useEffect, useState } from 'react'
import { useStore } from '../store'

export type MotionLevel = 'full' | 'calm' | 'off'

/** 统一缓动:出场(快速启动、长尾收束)的数值形式,给需要自己插值的调用方(如 framer-motion) */
export const EASE_OUT_BEZIER: [number, number, number, number] = [0.16, 1, 0.3, 1]
/** 统一缓动:出场(快速启动、长尾收束);字符串由同一份数值生成,避免两处抄出偏差 */
export const EASE_OUT = `cubic-bezier(${EASE_OUT_BEZIER.join(', ')})`
/** 统一缓动:进场/退场(对称、略柔和);同样由数值生成字符串,保持单一出处 */
export const EASE_IN_OUT_BEZIER: [number, number, number, number] = [0.4, 0, 0.2, 1]
export const EASE_IN_OUT = `cubic-bezier(${EASE_IN_OUT_BEZIER.join(', ')})`

/** 各场景基准时长(ms),除以各种倍率后写入 CSS 变量 */
export const MOTION = {
  /** 逐项入场的单项时长 */
  item: 420,
  /** 相邻项的错开间隔 */
  stagger: 36,
  /** 页面切入 */
  pageIn: 300,
  /** 页面切出 */
  pageOut: 180,
  /** 悬停/按压等即时反馈 */
  hover: 160,
  /** 封面由模糊到清晰 */
  cover: 260,
  /** 歌单信息(简介/元信息)迟到到达时的入场 —— 与下方内容的位移共用这一个时长 */
  meta: 420,
  /** 位移基准(px),乘档位幅度 */
  lift: 10,
  /** 模糊基准(px),乘档位幅度 */
  blur: 6
} as const

/** 各档位的倍率:时长、位移与模糊强度 */
const LEVELS: Record<MotionLevel, { dur: number; lift: number; blur: number; stagger: number }> = {
  full: { dur: 1, lift: 1, blur: 1, stagger: 1 },
  // 舒缓:去掉模糊、位移减半,错开更紧凑(时长略短,避免拖沓)
  calm: { dur: 0.75, lift: 0.35, blur: 0, stagger: 0.5 },
  off: { dur: 0, lift: 0, blur: 0, stagger: 0 }
}

/** 分通道速率:1=标准,>1 更快(时长更短),<1 更慢 */
export interface MotionFine {
  /** 列表单项入场时长 */
  list: number
  /** 相邻项错开间隔 */
  stagger: number
  /** 页面切换(进+出) */
  page: number
  /** 悬停/按压反馈 */
  hover: number
  /** 封面渐显 */
  cover: number
  /** 歌单信息(简介/元信息)迟到到达时的入场 + 下方内容位移 */
  meta: number
}

export const DEFAULT_FINE: MotionFine = {
  list: 1,
  stagger: 1,
  page: 1,
  hover: 1,
  cover: 1,
  meta: 1
}

/** 速率允许范围 */
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2

function clampSpeed(v: unknown, fallback = 1): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n))
}

/** 把用户存的(可能缺字段/越界的)分通道速率规整成完整对象 */
export function normalizeFine(raw: unknown): MotionFine {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<MotionFine>
  return {
    list: clampSpeed(o.list, 1),
    stagger: clampSpeed(o.stagger, 1),
    page: clampSpeed(o.page, 1),
    hover: clampSpeed(o.hover, 1),
    cover: clampSpeed(o.cover, 1),
    meta: clampSpeed(o.meta, 1)
  }
}

/** 计算最终时长(ms),供设置页展示"实际毫秒数"与 applyMotionVars 共用 */
export interface ComputedDurations {
  item: number
  stagger: number
  pageIn: number
  pageOut: number
  hover: number
  cover: number
  meta: number
  lift: number
  blur: number
}

export function computeDurations(
  level: MotionLevel,
  speed = 1,
  fine: MotionFine = DEFAULT_FINE
): ComputedDurations {
  const cfg = LEVELS[level]
  const sp = clampSpeed(speed)
  const f = normalizeFine(fine)
  /** 统一换算:基准 × 档位倍率 ÷ 全局速率 ÷ 通道速率 */
  const ms = (base: number, levelMul: number, channel: number): number =>
    Math.max(0, Math.round((base * levelMul) / sp / channel))
  return {
    item: ms(MOTION.item, cfg.dur, f.list),
    // 错开间隔的档位倍率是独立的 cfg.stagger(舒缓档更紧凑)
    stagger: ms(MOTION.stagger, cfg.stagger, f.stagger),
    pageIn: ms(MOTION.pageIn, cfg.dur, f.page),
    pageOut: ms(MOTION.pageOut, cfg.dur, f.page),
    hover: ms(MOTION.hover, cfg.dur, f.hover),
    cover: ms(MOTION.cover, cfg.dur, f.cover),
    meta: ms(MOTION.meta, cfg.dur, f.meta),
    lift: Number((MOTION.lift * cfg.lift).toFixed(2)),
    blur: Number((MOTION.blur * cfg.blur).toFixed(2))
  }
}

function systemPrefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** 读取用户档位;系统减弱动效时把「完整」降级为「舒缓」 */
export function useMotionLevel(): MotionLevel {
  const setting = useStore((s) => s.library?.settings.motionLevel ?? 'full')
  const [reduced, setReduced] = useState(systemPrefersReduced)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  if (setting === 'off') return 'off'
  if (reduced && setting === 'full') return 'calm'
  return setting
}

/** 读取分通道速率(缺字段时回落到标准值) */
export function useMotionFine(): MotionFine {
  const raw = useStore((s) => s.library?.settings.motionFine)
  return normalizeFine(raw)
}

/**
 * 把档位 + 全局速率 + 分通道速率写成 CSS 变量。
 * 挂在 documentElement 上,任何组件都能直接消费,用户自定义 CSS 也能覆盖。
 */
export function applyMotionVars(
  level: MotionLevel,
  speed = 1,
  fine: MotionFine = DEFAULT_FINE
): ComputedDurations {
  const root = document.documentElement
  const d = computeDurations(level, speed, fine)
  const on = level !== 'off'
  root.setAttribute('data-bm-motion', level)
  root.style.setProperty('--bm-mo-on', on ? '1' : '0')
  root.style.setProperty('--bm-mo-speed', String(clampSpeed(speed)))
  root.style.setProperty('--bm-mo-dur-item', `${d.item}ms`)
  root.style.setProperty('--bm-mo-dur-page-in', `${d.pageIn}ms`)
  root.style.setProperty('--bm-mo-dur-page-out', `${d.pageOut}ms`)
  root.style.setProperty('--bm-mo-dur-hover', `${d.hover}ms`)
  root.style.setProperty('--bm-mo-dur-cover', `${d.cover}ms`)
  root.style.setProperty('--bm-mo-dur-meta', `${d.meta}ms`)
  root.style.setProperty('--bm-mo-stagger', `${d.stagger}ms`)
  root.style.setProperty('--bm-mo-lift', `${d.lift.toFixed(2)}px`)
  root.style.setProperty('--bm-mo-blur', `${d.blur.toFixed(2)}px`)
  return d
}

/** 供非 React 场景(如一次性订阅)判断当前位移幅度 */
export function motionScale(level: MotionLevel): number {
  return LEVELS[level].lift
}
