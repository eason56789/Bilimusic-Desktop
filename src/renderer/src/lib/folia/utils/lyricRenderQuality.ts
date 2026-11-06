/**
 * 歌词画布分辨率与抗锯齿(上游 utils/lyricRenderQuality 的精简实现)
 *
 * 上游按「性能与动效」全局档位 × 样式自己的 override 算像素比。
 * 签名与上游一致,方便样式代码零改动:
 *   resolveLyricPixelRatio(devicePixelRatio, scale?) -> 实际像素比
 */
export type LyricRenderScale = 0.5 | 0.75 | 1 | 1.5 | 2

export interface LyricRenderOverride {
  scale: 'global' | LyricRenderScale
  antialias: 'global' | 'on' | 'off'
}

/** 全局画质档(本项目固定 1,即不超采样也不降采样) */
export const GLOBAL_LYRIC_RENDER_SCALE: LyricRenderScale = 1

/**
 * 实际像素比:设备像素比 × 分辨率倍数,并钳到 2(避免 4K 屏上显存爆掉)。
 * 与上游公式一致。
 */
export function resolveLyricPixelRatio(devicePixelRatio: number, scale?: number): number {
  const k = typeof scale === 'number' && isFinite(scale) && scale > 0 ? scale : GLOBAL_LYRIC_RENDER_SCALE
  return Math.min(2, Math.max(0.5, (devicePixelRatio || 1) * k))
}

export type LyricAntialias = 'auto' | 'on' | 'off'

export interface LyricRenderQuality {
  scale: LyricRenderScale
  antialias: LyricAntialias
}

/** 上游同名的可选值表(lumiere / hanabi 的渲染行与 tuning 归一化用)。 */
export const LYRIC_RENDER_SCALES = [0.5, 0.75, 1, 1.5, 2] as const satisfies readonly LyricRenderScale[]
export const LYRIC_ANTIALIAS_MODES = ['auto', 'on', 'off'] as const satisfies readonly LyricAntialias[]
/** 样式覆盖里抗锯齿的取值(「自动」只在全局挡位里有:就是跟着样式自己的默认)。 */
export const LYRIC_ANTIALIAS_OVERRIDES = ['global', 'on', 'off'] as const satisfies readonly LyricRenderOverride['antialias'][]

export const DEFAULT_LYRIC_RENDER_QUALITY: LyricRenderQuality = { scale: 1, antialias: 'auto' }
export const DEFAULT_LYRIC_RENDER_OVERRIDE: LyricRenderOverride = { scale: 'global', antialias: 'global' }

export const isLyricRenderScale = (value: unknown): value is LyricRenderScale =>
  (LYRIC_RENDER_SCALES as readonly unknown[]).includes(value)

/** 样式 tuning 里存着的覆盖读成合法值;没有这一项(旧的存档)就是全跟随全局。 */
export function normalizeLyricRenderOverride(raw: unknown): LyricRenderOverride {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof LyricRenderOverride, unknown>>
  return {
    scale: isLyricRenderScale(input.scale) ? input.scale : 'global',
    antialias: input.antialias === 'on' || input.antialias === 'off' ? input.antialias : 'global'
  }
}

/** 面板里显示的分辨率倍数(“1.5×”)。 */
export const formatLyricRenderScale = (scale: LyricRenderScale) => `${scale}×`

/**
 * 抗锯齿开不开:兼容两种调用——上游签名 (antialias, styleDefault);本项目旧的无参调用
 * (恒 true)。auto/global 跟样式默认,显式 on/off 照办,真布尔值(本项目 useLyricRenderQuality
 * 的返回)也照办。
 */
export const resolveLyricAntialias = (antialias?: unknown, styleDefault?: boolean): boolean => {
  if (antialias === undefined || antialias === null || antialias === 'auto' || antialias === 'global') {
    return styleDefault ?? true
  }
  if (antialias === 'on' || antialias === true) return true
  if (antialias === 'off' || antialias === false) return false
  return styleDefault ?? true
}

export function resolveLyricRenderOverride(override?: LyricRenderOverride): {
  pixelRatio: number
  antialias: boolean
} {
  const scale = override && override.scale !== 'global' ? (override.scale as number) : GLOBAL_LYRIC_RENDER_SCALE
  return { pixelRatio: resolveLyricPixelRatio(window.devicePixelRatio || 1, scale), antialias: true }
}

/** 歌词/3D 画布像素密度的硬上限(上游 src/utils/lyricRenderQuality.ts 同名常量,machi 画质层引用)。 */
export const MAX_LYRIC_PIXEL_RATIO = 3
