/**
 * 不受帧率限制的动画帧请求(上游 src/utils/frameRateLimiter 的精简替代)
 *
 * 上游用它让某些高频动画(弧形光晕跟随)在 120Hz 屏上也能跑满刷新率,
 * 而不是被 60Hz 的节流卡住。浏览器原生 rAF 本身就是满刷新率,
 * 所以这里直接透传即可。
 */
export const requestUncappedAnimationFrame = (cb: FrameRequestCallback): number =>
  requestAnimationFrame(cb)

export const cancelUncappedAnimationFrame = (handle: number): void => cancelAnimationFrame(handle)
