/**
 * JIZURA 引擎加载器(barrel)
 *
 * 来源:https://github.com/852wa/JIZURA(MIT License,Copyright (c) 2026 hakoniwa)
 * 见 THIRD_PARTY_NOTICES.md。文件保持原样搬运,仅此 barrel 为本项目新增。
 *
 * JIZURA 的所有模块都是「IIFE + 挂到全局 window.J + 注册到注册表」的副作用模块,
 * 没有 ESM 导出。因此这里按**文件名字母序**依次 import 触发注册 —— 与原项目
 * build.py 的 `sorted(glob.glob('src/*.js'))` 顺序完全一致,不能调换。
 */
import './01_util'
import './02_fonts'
import './02b_lang'
import './03_text'
import './04_styles'
import './05_anim'
import './05b_registry'
import './06_layouts'
import './07_decor'
import './08_planner'
import './08b_omakase'
import './09_render'
import './11p_bgcamB'
import './11p_decor'
import './11p_decorB'
import './11p_enter'
import './11p_enterB'
import './11p_exit'
import './11p_exitB'
import './11p_fxB'
import './11p_horror1'
import './11p_horror2'
import './11p_horror3'
import './11p_kinetic1'
import './11p_kinetic2'
import './11p_kinetic3'
import './11p_layoutsA'
import './11p_layoutsB'
import './11p_layoutsC'
import './11p_layoutsD'
import './11p_looks'
import './11p_styles'
import './11p_treattrans'
import './11p_typo1'
import './11p_typo2'
import './11p_typo3'
import './11q_sets'

/** JIZURA 引擎实例(由上面各模块挂到 window.J) */
export interface JizuraApi {
  defaultProject: () => JizuraProject
  parseLyrics: (raw: string) => { lines: any[]; meta: Record<string, string> }
  plan: (project: JizuraProject, audio: unknown) => JizuraPlan
  Renderer: new () => { frame: (ctx: CanvasRenderingContext2D, plan: JizuraPlan, t: number, opt?: any) => void }
  ensureFonts?: (text: string, keys: string[]) => Promise<void>
  fontsOfPlan?: (plan: JizuraPlan) => string[]
  [k: string]: any
}

export interface JizuraProject {
  lyrics: string
  style?: string
  mood?: string | null
  aspect?: string
  res?: number
  fps?: number
  seed?: number
  extra?: boolean
  wa?: boolean
  horror?: boolean
  typo?: boolean
  kinetic?: boolean
  lang?: string
  fx?: Record<string, any>
  timing?: Record<string, any>
  [k: string]: any
}

export interface JizuraPlan {
  W: number
  H: number
  duration: number
  cuts: any[]
  [k: string]: any
}

/** 取引擎(JIZURA 模块把 API 挂在 window.J 上) */
export function getJizura(): JizuraApi {
  const J = (window as unknown as { J?: JizuraApi }).J
  if (!J) throw new Error('JIZURA 引擎未加载')
  return J
}

/** 引擎是否已就绪(用于组件在首帧前判断) */
export function hasJizura(): boolean {
  return !!(window as unknown as { J?: unknown }).J
}
