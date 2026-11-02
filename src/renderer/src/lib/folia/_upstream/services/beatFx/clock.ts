/** 节拍时钟(上游 services/beatFx/clock 的最小实现):以音频时间为准,不维护独立 ticker */
export interface BeatClock { now: number; beats: number[] }
export const getBeatClock = (): BeatClock => ({ now: performance.now() / 1000, beats: [] })
export const beatClockNow = (): number => performance.now() / 1000
export const onBeat = (_cb: (t: number) => void): (() => void) => () => {}
export default { getBeatClock, beatClockNow, onBeat }

/** ---- 上游 clock 的其余导出(宽松签名,保持样式可编译) ---- */
export type BeatFxEvent = { time: number; strength: number; kind?: string }
export const resolveBeatFxAccentGain = (..._args: unknown[]): number => 0
export const resolveBeatFxAccent = (..._args: unknown[]): number => 0
export const subscribeBeatFx = (..._args: unknown[]): (() => void) => () => {}
export const getBeatFxEvents = (): BeatFxEvent[] => []
