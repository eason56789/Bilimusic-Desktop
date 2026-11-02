/**
 * 上游缺失模块
 *
 * 上游 folia 的这份源码快照缺该模块。这里给一个**宽松桩**:
 * 需要的具名导出都以 any 提供,运行时返回安全空值。
 * 样式会因此少掉这部分效果(节拍/图标/贴图等),排版与文字动画照常工作。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const getBeatEffectStrength: any = (() => undefined)
export const getBeatFxHeard: any = (() => undefined)
export const getBeatFxEvents: any = (() => undefined)
export const getBeatFxTrackScale: any = (() => undefined)
export const isBeatFxReady: any = false

export default {}
