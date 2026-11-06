// stub: 上游 services/beatFx/beatEffects.ts 依赖播放器的 SmartBeatSettings 全局设置;
// 这里只保留 hanabi 用到的效果 id 表(常量,纯数据)。

export type BeatEffectSource = 'beats' | 'drums' | 'stems';

/** 智能动感模式的效果 id 表(照抄上游 beatEffects.ts,hmdb 其余样式共用)。 */
export const BEAT_EFFECT_IDS = {
    sonnetLensTear: 'sonnet.lensTear',
    dioramaRipple: 'diorama.ripple',
    pendoloDrumhead: 'pendolo.drumhead',
    pendoloGearBeats: 'pendolo.gearBeats',
    latentPulse: 'latent.pulse',
    hanabiBeatBursts: 'hanabi.beatBursts',
    hanabiBeatPulse: 'hanabi.beatPulse',
    temperaInkFlash: 'tempera.inkFlash',
    machiNeonPulse: 'machi.neonPulse',
    machiDrumRipple: 'machi.drumRipple',
    machiScreenFlash: 'machi.screenFlash',
    nebbiaDrizzleRide: 'nebbia.drizzleRide',
    nebbiaAquaBeat: 'nebbia.aquaBeat',
} as const;
