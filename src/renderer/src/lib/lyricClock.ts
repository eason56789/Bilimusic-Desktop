/** 歌词时钟:播放位置 → 歌词时间轴的统一换算。所有歌词视图必须走这里,禁止手写公式。 */
import { getEffectiveLyricOffset, isPitchShiftingActive } from '../store'

/** 歌词提前量基准(ms):歌词略早于发声高亮更符合感知,历史各视图已按此调好 */
export const LYRIC_LEAD_MS = 200

/** bm-pitch 变调 worklet 的平均延迟(ms,见 pitch-worklet.js:扫描窗 2048/2 + dMin 256 @48kHz) */
export const WORKLET_DELAY_MS = 57

/**
 * 播放位置 → 歌词时间轴位置(ms):
 *   posMs = t*1000 + 提前量 + 用户偏移 - 变调延迟
 * 偏移语义与「歌词偏移」弹窗一致:正值 = 歌词提前(行更早激活)。
 * 变调激活时声音相对时钟晚 ~57ms 出来,同步减掉,否则歌词系统性偏早。
 */
export function lyricPosMs(currentTimeSec: number): number {
  return (
    currentTimeSec * 1000 +
    LYRIC_LEAD_MS +
    getEffectiveLyricOffset() -
    (isPitchShiftingActive() ? WORKLET_DELAY_MS : 0)
  )
}

/** 点歌词行跳转的落点:让 currentTime 恰好停在該行激活的时刻(与 lyricPosMs 互逆) */
export function lyricSeekSec(lineTimeMs: number): number {
  return Math.max(
    0,
    (lineTimeMs - LYRIC_LEAD_MS - getEffectiveLyricOffset() + (isPitchShiftingActive() ? WORKLET_DELAY_MS : 0)) / 1000
  )
}
