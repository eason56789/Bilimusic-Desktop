/** 展示用格式化工具(收藏数/播放量等大数字) */

/** 大数字缩写:12345 → 1.2万;123456789 → 1.2亿 */
export function formatCount(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!isFinite(v) || v <= 0) return '0'
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}亿`
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`
  return String(Math.round(v))
}

/** 收藏数文案(0/未知 → 空串,便于条件渲染) */
export function favText(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (!isFinite(v) || v <= 0) return ''
  return `收藏 ${formatCount(v)}`
}
