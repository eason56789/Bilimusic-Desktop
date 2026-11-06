// stub: 上游依赖播放器全局状态(useVisualizerAssetStore,zustand),此处降级实现。
// monet 的头像图/背景图资产:没有数据库持久化,只保存进程内状态。
import { useSyncExternalStore } from 'react'
import type { MonetBackgroundImage, MonetPortraitImage, StoredMonetBackgroundImage, StoredMonetPortraitImage } from '../bridge'

export interface VisualizerAssetState {
    storedMonetPortraitImage: StoredMonetPortraitImage | null
    monetPortraitImage: MonetPortraitImage | null
    isLoadingMonetPortraitImage: boolean
    storedMonetBackgroundImage: StoredMonetBackgroundImage | null
    monetBackgroundImage: MonetBackgroundImage | null
    isLoadingMonetBackgroundImage: boolean
}

let state: VisualizerAssetState = {
    storedMonetPortraitImage: null,
    monetPortraitImage: null,
    isLoadingMonetPortraitImage: false,
    storedMonetBackgroundImage: null,
    monetBackgroundImage: null,
    isLoadingMonetBackgroundImage: false,
}

const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export const useVisualizerAssetStore = Object.assign(
    <T,>(selector: (state: VisualizerAssetState) => T): T =>
        useSyncExternalStore(
            subscribe,
            () => selector(state),
            () => selector(state),
        ),
    {
        getState: () => state,
        setState: (patch: Partial<VisualizerAssetState>) => {
            state = { ...state, ...patch }
            notify()
        },
    },
)

export default useVisualizerAssetStore
