// stub: 上游 stores/usePlayerChromeSettingsStore.ts 是播放器全局 UI 状态(zustand);
// 这里降级为常量状态(不透明播放页)。NebbiaSettingsPanel 只读 transparentPlayerBackground
// 与 enablePlayerPageNativeBlur 两个字段。
import { useSyncExternalStore } from 'react';

export interface PlayerChromeSettingsState {
    bottomBarHeight: number;
    showBottomBar: boolean;
    transparentPlayerBackground: boolean;
    enablePlayerPageNativeBlur: boolean;
}

const state: PlayerChromeSettingsState = {
    bottomBarHeight: 52,
    showBottomBar: true,
    transparentPlayerBackground: false,
    enablePlayerPageNativeBlur: false,
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const usePlayerChromeSettingsStore = Object.assign(
    <T>(selector: (s: PlayerChromeSettingsState) => T): T =>
        useSyncExternalStore(
            subscribe,
            () => selector(state),
            () => selector(state),
        ),
    { getState: () => state },
);

export default usePlayerChromeSettingsStore;
