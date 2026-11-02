/**
 * 上游 renderQuality/useLyricRenderQuality 的精简实现。
 * 返回 { scale, antialias }:cadenza 等样式把它乘进像素比。
 */
import { useMemo } from 'react'
import { GLOBAL_LYRIC_RENDER_SCALE, type LyricRenderOverride } from '../../utils/lyricRenderQuality'

export interface LyricRenderQualityState {
  scale: number
  antialias: boolean
}

export function useLyricRenderQuality(override?: LyricRenderOverride): LyricRenderQualityState {
  return useMemo(() => {
    const s =
      override && override.scale !== 'global' ? (override.scale as number) : GLOBAL_LYRIC_RENDER_SCALE
    return { scale: s, antialias: true }
  }, [override?.scale, override?.antialias])
}

export default useLyricRenderQuality
