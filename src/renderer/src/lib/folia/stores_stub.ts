/** 上游 stores 的最小替身:只保留样式读取的字段 */
export const usePlayerChromeSettingsStore = Object.assign(
  (selector?: (s: { bottomBarHeight: number; showBottomBar: boolean }) => unknown) => {
    const state = { bottomBarHeight: 52, showBottomBar: true }
    return selector ? selector(state) : state
  },
  { getState: () => ({ bottomBarHeight: 52, showBottomBar: true }) }
)

export const motionSignals = { playerBottomBarLiveOffset: { get: () => 0 } }
