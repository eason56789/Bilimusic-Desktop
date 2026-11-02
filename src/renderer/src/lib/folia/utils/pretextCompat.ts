/**
 * @chenglou/pretext 兼容层
 *
 * 上游 folia 依赖的 pretext 版本里,prepareWithSegments() 返回的对象带
 * `breakableFitAdvances`(每个 segment 的逐字累积宽度,排版换行用)。
 * 本项目装的 pretext 1.0.0 没有这个字段,且测量 API 签名不同,
 * 这里用浏览器 canvas 的 measureText 自行补出等价数据。
 *
 * 用整段前缀测量(而不是单字相加),这样 kerning/shaping 跨字边界仍然准确。
 */

const ctxCache: { ctx?: CanvasRenderingContext2D } = {}

function getCtx(): CanvasRenderingContext2D | null {
  if (ctxCache.ctx) return ctxCache.ctx
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 8
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctxCache.ctx = ctx
    return ctx
  } catch {
    return null
  }
}

/** 一段文字在给定 font 下的自然宽度(px) */
export function measureTextWidth(text: string, fontSpec: string): number {
  const ctx = getCtx()
  if (!ctx) return text.length * 8
  ctx.font = fontSpec
  return ctx.measureText(text).width
}

/**
 * 给 prepared 对象补出 breakableFitAdvances:每个 segment 的逐字累积宽度。
 * 已存在则原样返回;没有 segments 信息时返回空数组,调用方会退化到按整段处理。
 */
export function withBreakableAdvances<T extends object>(
  prepared: T,
  segments: string[] | undefined,
  fontSpec: string
): T & { breakableFitAdvances: number[][] } {
  const p = prepared as T & { breakableFitAdvances?: number[][] }
  if (Array.isArray(p.breakableFitAdvances)) {
    return p as T & { breakableFitAdvances: number[][] }
  }
  const out: number[][] = []
  if (segments) {
    for (const seg of segments) {
      const chars = Array.from(seg)
      const advances: number[] = []
      for (let i = 0; i < chars.length; i++) {
        advances.push(measureTextWidth(chars.slice(0, i + 1).join(''), fontSpec))
      }
      out.push(advances)
    }
  }
  p.breakableFitAdvances = out
  return p as T & { breakableFitAdvances: number[][] }
}

/**
 * 逐字累积偏移(offsets[0]=0,offsets[i]=前 i 个字的宽度)。
 * 与上游 measurePrefixOffsets 同义,供 claddagh 等环形排布用。
 */
export function measurePrefixOffsetsCanvas(
  text: string,
  fontSpec: string,
  extraTracking = 0
): number[] {
  const chars = Array.from(text)
  const offsets: number[] = [0]
  let acc = 0
  for (let i = 0; i < chars.length; i++) {
    const w = measureTextWidth(chars.slice(0, i + 1).join(''), fontSpec)
    acc = w + extraTracking * (i + 1)
    offsets.push(acc)
  }
  return offsets
}
