// stub: 上游 services/analysis/drumHits 依赖 htdemucs 音轨分离模型与 Web Worker;
// 本项目宿主不做鼓点分析,这里只保留 pendolo 用到的常量与「无鼓点」读取。
export type DrumHitKind = 0 | 1 | 2
export const DRUM_KICK: DrumHitKind = 0
export const DRUM_SNARE: DrumHitKind = 1
export const DRUM_HAT: DrumHitKind = 2

export interface DrumHits {
    times: Float64Array
    strengths: Float32Array
    kinds: Uint8Array
    /** While the track is still separating: the time (s) the hits reach, none after it known yet. */
    until?: number
}

export interface DrumAnalysis {
    hits: DrumHits
    drumEnergy: Float32Array
    mixEnergy: Float32Array
}

/** 降级:没有任何鼓点数据,返回 null(样式据此关闭鼓面特效)。 */
export const getDrumHits = (_key: string | null): DrumHits | null => null

export const setWantedDrumTrack = (_key: string | null): void => {
    // 降级:no-op
}

export const drumHitsSettled = (_key: string): boolean => true

export const loadTrackDrumHits = async (_key: string, _readBytes: () => Promise<ArrayBuffer | null>): Promise<DrumAnalysis | null> => null
