// stub: 上游 lyricRenderQualityPin 由视频导出层提供 Context,本项目宿主没有导出链路,
// 因此永远不钉(null),全局挡位直接回落到降级的设置 store。
import { createContext, useContext } from 'react';
import { useVisualizerSettingsStore } from './useVisualizerSettingsStore';
import type { LyricRenderQuality } from '../utils/lyricRenderQuality';

export const LyricRenderQualityPinContext = createContext<LyricRenderQuality | null>(null);

/** 钉住的那一组(导出时),没钉时是 null。 */
export const useLyricRenderQualityPin = (): LyricRenderQuality | null => useContext(LyricRenderQualityPinContext);

/** 全局挡位:钉住时用钉住的值,否则是「动画与性能」里的设置。 */
export const useGlobalLyricRenderQuality = (): LyricRenderQuality => {
    const pinned = useLyricRenderQualityPin();
    const global = useVisualizerSettingsStore(state => state.lyricRenderQuality);
    return pinned ?? global;
};
