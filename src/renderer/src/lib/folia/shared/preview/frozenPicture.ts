/**
 * 预览快照标记(上游 preview/frozenPicture 的精简替代)
 *
 * 上游用它标记"画面即将抵达"的占位元素,截图/快照时据此判断是否已稳定。
 * 本项目不需要整套快照逻辑,只保留这个属性名常量供样式使用。
 */
export const ARRIVING_MARK = 'data-picture-arriving'

/** 画面是否还有"即将抵达"的占位 */
export const hasArrivingPicture = (root: ParentNode): boolean =>
  root.querySelector(`[${ARRIVING_MARK}]`) !== null
