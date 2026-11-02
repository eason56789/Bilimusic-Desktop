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

export const resolveLyricAntialias = (): boolean => true

export function resolveLyricRenderOverride(override?: LyricRenderOverride): {
  pixelRatio: number
  antialias: boolean
} {
  const scale = override && override.scale !== 'global' ? (override.scale as number) : GLOBAL_LYRIC_RENDER_SCALE
  return { pixelRatio: resolveLyricPixelRatio(window.devicePixelRatio || 1, scale), antialias: true }
}
