/**
 * 歌词时间轴 sanity 检查(纯函数,零依赖,便于单测):
 * 用音频时长印证候选歌词,拦住「拿错版本」的明显病例。
 */
export interface SanityLine {
  timeMs: number
}

/**
 * 返回 null = 可信;否则返回否决理由(供日志)。
 *  - 末行起点超出 音频时长+20s:时间轴整体靠后(现场版/加长版最常见)
 *  - 末行起点早于 音频时长 45%:歌词只覆盖前一小段(切片/试听/串烧开头)
 * 行数太少或时长未知时不评(交给调用方的行数/时长守卫)。
 */
export function assessTimelineIssue(lines: SanityLine[], durationSec?: number): string | null {
  if (!lines.length || !durationSec || !isFinite(durationSec) || durationSec <= 0) return null
  const last = lines[lines.length - 1]?.timeMs ?? 0
  if (last <= 0) return null
  const dur = durationSec * 1000
  if (last > dur + 20_000) return `last line ${Math.round(last)}ms 超出时长+20s(${Math.round(dur)}ms)`
  if (last < dur * 0.45) return `last line ${Math.round(last)}ms 早于时长的 45%(${Math.round(dur)}ms)`
  return null
}
