// stub: 上游 services/analysis/vocalEnvelope.ts 依赖播放器的音轨分轨/频谱分析全局缓存;
// 这里降级为「永远没有人声包络」,nebbia(雾笺)对 null 已有完整分支(雨点按频段、车随机颠)。
// 签名与上游一致,nebbiaHits.ts / nebbiaDrizzleRide.ts / createNebbiaRuntime.ts 直接用。

/** 人声包络的帧率(上游固定 50)。 */
export const VOCAL_FPS = 50;

export interface VocalEnvelope {
    fps: number;
    /** 每帧的响度,dB。 */
    db: Float32Array;
    /** 整首歌唱得响的地方,dB(db 的 97 分位)。 */
    top: number;
    /** 一个吐字开始的帧,升序。 */
    onsets: Uint32Array;
    /** 从第几帧开始读(之前的分轨不可用);整轨可用时缺省。 */
    from?: number;
}

export const getVocalEnvelope = (_key: string | null): VocalEnvelope | null => null;

export const vocalLevelAt = (_t: number): number => 0;
