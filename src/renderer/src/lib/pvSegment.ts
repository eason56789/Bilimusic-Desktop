/**
 * 文字PV 歌词分词:歌词行 → 词段(segment) → 字素(grapheme)
 *
 * 核心约定(参考「词=排版单位,字=动画单位」):
 *  - segment 用于排版:一个词是一个排版块(hero 会放大 3~5.5 倍)
 *  - grapheme 用于动画:每个字按它真实的演唱时间独立入场
 *
 * 分词优先级:Intl.Segmenter(word) → 无 ICU 时按字符回退。
 * 每个词段都保留"无损拼接"校验:拼回原文不一致就丢弃,避免时间轴错位。
 */
import type { LyricLine } from '@shared/types'
import { resolveCharTimes } from './karaoke'

/** 字素:一个字(或一个不可拆的字符簇,如 emoji)及其演唱时间 */
export interface PvGrapheme {
  char: string
  /** 文本中的字符下标(用于对齐上色) */
  index: number
  startTime: number
  /** 本字唱完的时间(下一个字开始 或 行末) */
  endTime: number
}

/** 词段:排版单位 */
export interface PvSegment {
  text: string
  startOffset: number
  endOffset: number
  graphemes: PvGrapheme[]
  startTime: number
  endTime: number
  /** 纯标点/空白段(false):不参与 hero 评选,并入前一个词 */
  isWordLike: boolean
}

/** 是否"实词"(非纯标点/空白/符号) */
function isWordLike(s: string): boolean {
  return !/^[\s\p{P}\p{S}]+$/u.test(s)
}

/** 按字素簇切分(emoji/组合字符不会被拆开) */
function graphemesOf(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    } catch {
      /* 老运行时没有 grapheme 粒度 */
    }
  }
  return Array.from(text)
}

/** 词边界(字符下标区间);无 Intl.Segmenter 时整行一个词 */
function wordRanges(text: string): { start: number; end: number }[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      const seg = new Seg(undefined, { granularity: 'word' })
      const out: { start: number; end: number }[] = []
      let pos = 0
      for (const s of seg.segment(text)) {
        // 部分实现对不齐,用累计下标兜底,保证区间连续且不重不漏
        const start = typeof s.index === 'number' ? s.index : pos
        const end = start + s.segment.length
        out.push({ start, end })
        pos = end
      }
      if (out.length > 0 && out[0].start === 0 && out[out.length - 1].end === text.length) return out
    } catch {
      /* 回退 */
    }
  }
  return [{ start: 0, end: text.length }]
}

/**
 * 把一行歌词切成词段。charTimes 与"字素序列"对齐
 * (YRC/CJK 里 text.length 与字素数一致;不一致时按字素序号取时间)。
 *
 * PV 舞台强制逐字:没有逐字数据时按行时长把时间平均分给每个字素
 * (与参考实现一致——PV 的入场动效必须有字级时间轴才成立)。
 */
export function segmentLine(line: LyricLine, lineEndMs: number): PvSegment[] {
  const text = line.text
  if (!text) return []
  const charTimes = resolveCharTimes(text, line.wordTimes, line.words)

  // 1) 字素 + 时间
  const graphemeTexts = graphemesOf(text)
  let cursor = 0
  const graphemes: PvGrapheme[] = graphemeTexts.map((g, i) => {
    const index = cursor
    cursor += g.length
    const t = charTimes && charTimes[Math.min(i, charTimes.length - 1)]
    return { char: g, index, startTime: t ?? line.timeMs, endTime: line.timeMs }
  })
  // 没有逐字数据:按行时长平均分配(每字等长)
  if (!charTimes && graphemes.length > 0) {
    const span = Math.max(600, (lineEndMs - line.timeMs) * 0.92)
    const per = span / graphemes.length
    graphemes.forEach((g, i) => {
      g.startTime = line.timeMs + i * per
      g.endTime = g.startTime + per
    })
  }
  // 字素结束时间 = 下一个字素开始;最后一个用行末兜底
  for (let i = 0; i < graphemes.length; i++) {
    graphemes[i].endTime = graphemes[i + 1]?.startTime ?? Math.max(lineEndMs, graphemes[i].startTime)
  }
  // 有时间轴时确保线性推进(同一时间戳的字共享过渡)
  if (charTimes || graphemes.length > 0) {
    for (let i = 0; i < graphemes.length; i++) {
      if (graphemes[i].endTime <= graphemes[i].startTime) {
        graphemes[i].endTime = graphemes[i].startTime + 200
      }
    }
  }

  // 2) 词边界 → 段
  const ranges = wordRanges(text)
  const segs: PvSegment[] = []
  for (const r of ranges) {
    const piece = text.slice(r.start, r.end)
    if (!piece) continue
    const gs = graphemes.filter((g) => g.index >= r.start && g.index < r.end)
    if (gs.length === 0) continue
    segs.push({
      text: piece,
      startOffset: r.start,
      endOffset: r.end,
      graphemes: gs,
      startTime: gs[0].startTime,
      endTime: gs[gs.length - 1].endTime,
      isWordLike: isWordLike(piece)
    })
  }

  // 3) 非实词段(标点/空白)并入前一个段:避免标点单独飞入
  const merged: PvSegment[] = []
  for (const s of segs) {
    const prev = merged[merged.length - 1]
    if (!s.isWordLike && prev) {
      prev.text += s.text
      prev.endOffset = s.endOffset
      prev.graphemes = prev.graphemes.concat(s.graphemes)
      prev.endTime = s.endTime
    } else {
      merged.push({ ...s })
    }
  }
  // 首个段若是纯标点,并入后一个段
  if (merged.length > 1 && !merged[0].isWordLike) {
    const first = merged.shift() as PvSegment
    merged[0].text = first.text + merged[0].text
    merged[0].startOffset = first.startOffset
    merged[0].graphemes = first.graphemes.concat(merged[0].graphemes)
    merged[0].startTime = first.startTime
  }
  return merged
}
