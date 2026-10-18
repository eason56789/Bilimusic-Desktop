/**
 * 进度条"高潮点"检测(纯函数)
 *
 * 数据源优先级:
 *  1. 平台原生高潮片段(酷狗 climax_info,由主进程提供)
 *  2. 歌词副歌推导:副歌的典型特征是"同一段歌词重复出现"(通常 2~4 次),
 *     按连续句块找重复次数最多、块最长的片段,以其**起点**作为高潮点。
 *
 * 输出是"点"而不是"段":进度条上只画圆点标记,不涂区间。
 */
import type { HighlightPoint, LyricLine } from '@shared/types'

/** 归一化歌词文本:去标点/空白,便于比较重复段落 */
function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\-_·,，.。!！?？'"“”‘’:;:、|/\\()（）[\]【】{}<>《》]/g, '')
}

/** 合并过近的点(距上一个点 < minGapMs 时丢弃),避免糊成一片 */
function dedupe(points: HighlightPoint[], minGapMs: number): HighlightPoint[] {
  const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs)
  const out: HighlightPoint[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && p.timeMs - last.timeMs < minGapMs) continue
    out.push(p)
  }
  return out
}

/**
 * 从歌词推导副歌(高潮)点。
 * @param lines 歌词行(时间升序)
 * @param durationSec 歌曲总时长(最后一行结束时间的兜底)
 */
export function detectChorus(lines: LyricLine[], durationSec = 0): HighlightPoint[] {
  const n = lines?.length ?? 0
  if (n < 10) return []
  // 有效行(过滤纯符号/过短行),记录其在原数组中的下标
  const valid: number[] = []
  for (let i = 0; i < n; i++) {
    const t = norm(lines[i].text)
    if (t.length >= 2) valid.push(i)
  }
  if (valid.length < 8) return []
  const totalEnd = durationSec > 0 ? durationSec * 1000 : lines[n - 1].timeMs + 10_000

  /** 行 i 的结束时间 = 下一有效行起始;无下一行时用总时长 */
  const lineEnd = (i: number): number => {
    const at = valid.indexOf(i)
    if (at >= 0 && at + 1 < valid.length) return lines[valid[at + 1]].timeMs
    return Math.max(lines[i].timeMs + 1000, totalEnd)
  }

  interface Candidate {
    len: number
    starts: number[]
    score: number
  }
  let best: Candidate | null = null

  // 块长 1..4 句:更长且重复的块更像副歌(评分按 块长 加权)
  for (let len = 1; len <= 4; len++) {
    const map = new Map<string, number[]>()
    for (let k = 0; k + len - 1 < valid.length; k++) {
      const idxs = valid.slice(k, k + len)
      const key = idxs.map((i) => norm(lines[i].text)).join('\u0001')
      const arr = map.get(key)
      if (arr) arr.push(idxs[0])
      else map.set(key, [idxs[0]])
    }
    for (const starts of map.values()) {
      if (starts.length < 2) continue
      // 单句重复需要更多次才算副歌,避免"oh oh"之类的口头禅误判
      if (len === 1 && starts.length < 4) continue
      const score = starts.length * (len * 2 - 1)
      if (!best || score > best.score || (score === best.score && len > best.len)) {
        best = { len, starts, score }
      }
    }
  }
  if (!best) return []

  // 每个重复块 → 一个高潮点(取块首行时间)
  const points: HighlightPoint[] = best.starts.map((startIdx) => ({
    timeMs: Math.max(0, lines[startIdx].timeMs),
    kind: 'chorus' as const
  }))
  // 少于 30s 间隔的点合并;最多 6 个点(过多会失去提示意义)
  return dedupe(points, 30_000).slice(0, 6)
}
