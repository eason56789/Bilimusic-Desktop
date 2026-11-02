/**
 * 播放条布局占位(上游 src/hooks/usePlayerBottomBarBottomPx 的精简替代)
 *
 * 上游用它给字幕留出底部控制条的空间,依赖 playerChrome 设置、预览模式与若干 store。
 * 本项目全屏歌词页的控制条是浮动的(热区显隐),字幕不需要为其让位太多,
 * 这里给一个固定留白即可。
 */
export function usePlayerBottomBarBottomPx(): number {
  return 52
}

export const playerBottomBarLiveOffset = { get: (): number => 0 }
export const useIsPlayerBottomBarHost = (): boolean => false
export const usePreviewBottomBarOffset = (): number => 0

export const usePlayerSubtitleBottomPx = (..._args: unknown[]): number => 52
