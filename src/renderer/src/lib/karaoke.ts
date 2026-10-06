/**
 * KTV 逐字走光算法(移植自手机端 PlayerLyrics.kt 的 calcRevealChars)
 * 返回"已唱字符数"的浮点值,含字内线性插值;渲染层按 text.length 归一化成遮罩进度。
 * 无逐字数据时返回 text.length(整句直接全亮,不做模拟推进)。
 */
export interface KaraokeWord {
  text: string
  timeMs: number
}

/** 组内最小过渡时长(手机端 MIN_WORD_MS):防止相邻时间戳为 0 造成瞬间跳字 */
const MIN_WORD_MS = 200
/** 无下一行时的行末兜底窗口 */
const LINE_FALLBACK_MS = 5000

export function calcRevealChars(
  text: string,
  charTimes: number[] | null,
  nowMs: number,
  lineStartMs: number,
  lineEndMs: number
): number {
  if (!text) return 0
  if (!charTimes || charTimes.length === 0) {
    // 无逐字:整句直接全亮
    return text.length
  }
  const n = charTimes.length
  // 相邻同时间戳字符分组(英文单词/空格共享过渡)
  const groups: { t: number; cnt: number }[] = []
  let gi = 0
  while (gi < n) {
    const t = charTimes[gi]
    let cnt = 0
    while (gi < n && charTimes[gi] === t) {
      cnt++
      gi++
    }
    groups.push({ t, cnt })
  }
  let gidx = -1
  for (let i = 0; i < groups.length; i++) {
    if (nowMs >= groups[i].t) gidx = i
    else break
  }
  if (gidx === -1) return 0
  let charOffset = 0
  for (let i = 0; i < gidx; i++) charOffset += groups[i].cnt
  const curStart = groups[gidx].t
  const curCount = groups[gidx].cnt
  const nextStart = gidx + 1 < groups.length ? groups[gidx + 1].t : lineEndMs
  const dur = Math.max(MIN_WORD_MS, nextStart - curStart)
  const frac = Math.min(1, Math.max(0, (nowMs - curStart) / dur))
  return charOffset + frac * curCount
}

/**
 * 把 KTV 分段(words)展开成与 text 逐字符对齐的时间轴。
 * parseYrc 的 text 是 words 拼接后 trim 的结果,可能比拼接串短(首尾空格),
 * 因此先找 text 在拼接串中的偏移再裁剪;对不齐返回 null(渲染层退回整行走光)。
 */
export function buildCharTimes(text: string, words: KaraokeWord[] | undefined): number[] | null {
  if (!words || words.length === 0 || !text) return null
  const joined = words.map((w) => w.text).join('')
  const lead = joined.length - joined.trimStart().length
  if (joined.slice(lead, lead + text.length) !== text) return null
  const arr: number[] = []
  for (const w of words) {
    for (let i = 0; i < w.text.length; i++) arr.push(w.timeMs)
  }
  const out = arr.slice(lead, lead + text.length)
  return out.length === text.length ? out : null
}

/** 逐字时间数组若与 text 等长直接用(YRC wordTimes 与 text 等长时) */
export function resolveCharTimes(
  text: string,
  wordTimes: number[] | undefined,
  words: KaraokeWord[] | undefined
): number[] | null {
  if (wordTimes && wordTimes.length === text.length) return wordTimes
  return buildCharTimes(text, words)
}

/** 下一行起始时间(行末推进窗口):取下一行,兜底当前行 +5s */
export function lineEndTime(lineTimeMs: number, nextLineTimeMs?: number): number {
  return nextLineTimeMs ?? lineTimeMs + LINE_FALLBACK_MS
}
