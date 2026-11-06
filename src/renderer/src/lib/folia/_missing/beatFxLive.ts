// stub: 上游 services/beatFx/beatFxLive 是全局唯一的实时节拍时钟(由播放器的 RAF 循环喂入,
// 并写入全局 MotionValue);本项目宿主不提供节拍分析,这里降级为「永远安静」的惰性实现:
// 所有读数返回空闲值,所有写入是 no-op。样式对「效果未就绪」都有正常的视觉回退分支。
import { createBeatFxClockState, type BeatFxEvent } from './beatFxClock'

const state = createBeatFxClockState()

const intensities = { beat: 0, downbeat: 0 }
const firedCounts = { beats: 0, downbeats: 0 }
const liveEffects: Record<string, number> = {}
const DEFAULT_BEAT_PERIOD = 0.5

/** Median gap between the installed track's beats, in seconds. */
export const resolveBeatFxBeatPeriod = (events: readonly BeatFxEvent[]): number => {
    const times = [...events].sort((a, b) => a.t - b.t).map((event) => event.t)
    const gaps: number[] = []
    for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1])
    if (gaps.length === 0) return DEFAULT_BEAT_PERIOD
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)] || DEFAULT_BEAT_PERIOD
}

export const setBeatFxIntensities = (_beat: number, _downbeat: number) => {
    // 降级:宿主没有智能动感模式,保持 0。
}
export const getBeatFxIntensities = (): Readonly<{ beat: number; downbeat: number }> => intensities

export const setBeatFxLiveEffects = (_strengths: Readonly<Record<string, number>>) => {
    // 降级:no-op
}
export const getBeatEffectStrength = (_id: string): number => 0
export const isBeatEffectPlaying = (_id: string): boolean => false

export const getBeatFxFiredCounts = (): Readonly<{ beats: number; downbeats: number }> => firedCounts

export const beginBeatFxTrack = (_key: string | null) => {
    // 降级:no-op
}
export const setBeatFxEvents = (_events: BeatFxEvent[], _trackScale?: number) => {
    // 降级:no-op
}
export const isBeatFxReady = (): boolean => false
export const isBeatFxHearing = (): boolean => false
export const getBeatFxHeard = (): Readonly<{ key: string | null; time: number | null }> => ({ key: null, time: null })
export const getBeatFxLastHeard = (_key: string): number => 0
export const stopBeatFx = () => {
    // 降级:no-op
}
export const getBeatFxLastBeat = (): BeatFxEvent | null => null
export const getBeatFxLastDownbeat = (): BeatFxEvent | null => null
export const getBeatFxEvents = (): readonly BeatFxEvent[] => []
export const getBeatFxBeatPeriod = (): number => DEFAULT_BEAT_PERIOD
export const getBeatFxTrackScale = (): number => 1
export const getBeatFxRotationSign = (): number => 1
export const tickBeatFx = (_audioElement: HTMLMediaElement | null, _context: BaseAudioContext | null | undefined) => {
    // 降级:no-op(宿主的 RAF 不必调用它)
}
