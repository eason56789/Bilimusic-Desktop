// stub: 上游依赖播放器全局状态(useVisualizerSettingsStore,zustand),此处降级实现。
// 只保留样式读取的字段:全局歌词渲染挡位与智能动感模式设置。字段为常量,不响应设置页。
import type { LyricRenderQuality } from '../utils/lyricRenderQuality'
import type { SmartBeatSettings } from './beatEffects'

export interface VisualizerSettingsState {
    lyricRenderQuality: LyricRenderQuality
    smartBeat: SmartBeatSettings
    /** 全局帧率挡位(machi 的画质自适应会读);上游是设置页的字段,这里给常见默认 60。 */
    visualizerFrameRate: number
}

const state: VisualizerSettingsState = {
    lyricRenderQuality: { scale: 1, antialias: 'auto' },
    smartBeat: { mode: 'off', beatStrength: 1, downbeatStrength: 1, effects: {} },
    visualizerFrameRate: 60,
}

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

const notify = () => listeners.forEach((listener) => listener())

/** 与上游同名:样式里 `useVisualizerSettingsStore(state => state.xxx)` 这样用。 */
export const useVisualizerSettingsStore = Object.assign(
    <T,>(selector: (state: VisualizerSettingsState) => T): T => selector(state),
    {
        getState: () => state,
        setState: (patch: Partial<VisualizerSettingsState>) => {
            Object.assign(state, patch)
            notify()
        },
        subscribe,
    },
)

export default useVisualizerSettingsStore
