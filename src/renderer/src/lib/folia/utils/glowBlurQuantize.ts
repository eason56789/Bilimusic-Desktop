/**
 * 光晕模糊与发光文字工具(上游 utils/glowBlurQuantize 的精简实现)
 *
 * 上游按性能档位决定是否把 blur 半径量化到整数;本实现统一不量化(连续值更平滑)。
 * 后面三个 canvas 辅助函数是 fume 等样式画"外发光文字"用的。
 */
export const isGlowBlurQuantized = (): boolean => false

export const quantizeGlowBlur = (px: number): number =>
  isGlowBlurQuantized() ? Math.round(px) : px

export const quantizeShadowBlur = quantizeGlowBlur

/** 设置"发光"阴影:先画模糊阴影再叠实心字,实现外发光 */
export function setCanvasTextGlow(
  ctx: CanvasRenderingContext2D,
  blurPx: number,
  color: string
): void {
  ctx.shadowBlur = quantizeGlowBlur(blurPx)
  ctx.shadowColor = color
}

/** 清除发光阴影 */
export function clearCanvasTextGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

/** 用当前 fillStyle 画一段发光文字 */
export function fillGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
): void {
  if (!text) return
  ctx.fillText(text, x, y)
}
