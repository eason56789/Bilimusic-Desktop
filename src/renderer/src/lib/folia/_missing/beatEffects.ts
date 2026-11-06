// stub: 上游 services/beatFx/beatEffects.ts 只依赖 types.ts 里的两个设置类型;
// 此处把这两个类型定义搬进本文件,其余按上游原样保留(声明数据,无副作用)。
// The beat effects of 智能动感模式, each one a named thing a picture does on the music: declared on
// the visualizer or background registry entry that draws it, switched and scaled one by one in that
// mode's own settings, under the one 智能动感模式 switch.

/** A part of an effect with its own slider: a stable key (stored) and the i18n key of its name. */
export interface BeatEffectPart {
    key: string
    nameKey: string
}

/** 一个效果在设置里的开关与强度(stub:从上游 types.ts 搬来)。 */
export interface BeatEffectSetting {
    on: boolean
    strength: number
    parts?: Record<string, number>
}

/** 智能动感模式的设置(stub:从上游 types.ts 搬来;effects 未写过的效果用默认值)。 */
export interface SmartBeatSettings {
    mode: 'off' | 'on' | 'cached'
    /** 0..1,全局强度;轻拍/重拍各一对。 */
    beatStrength: number
    downbeatStrength: number
    effects: Record<string, BeatEffectSetting>
}

export type BeatEffectSource = 'beats' | 'drums' | 'stems'

export interface BeatEffectDef {
    /** Stable, stored in settings and exported configs: `<mode>.<name>`. */
    id: string
    /** i18n key of its four-character name (options.beatEffect_*). */
    nameKey: string
    /** i18n key of what it does. */
    descKey: string
    source: BeatEffectSource
    /** Its parts, each with its own strength slider in place of the one; see the header. */
    parts?: readonly BeatEffectPart[]
    /** Never plays and is not offered. */
    retired?: boolean
}

/** The strength range of every effect; 1 is the look it was tuned to, the middle of the slider. */
export const BEAT_EFFECT_STRENGTH_MAX = 2
export const BEAT_EFFECT_DEFAULT: BeatEffectSetting = { on: true, strength: 1 }

/** Every effect id in the app, so code that plays one names it rather than spelling it. */
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
} as const

/** The effects the old 轻拍 / 重拍 strengths scaled (one pair for every picture, before effects had their own). */
export const LEGACY_BEAT_LIST_EFFECT_IDS: readonly string[] = [BEAT_EFFECT_IDS.sonnetLensTear, BEAT_EFFECT_IDS.dioramaRipple]

/** The id a part plays under in the live strengths (beatFxLive `getBeatEffectStrength`). */
export const beatEffectPartId = (id: string, part: string): string => `${id}:${part}`

/** A part's strength in an effect's setting, 1 for one never touched. */
export const resolveBeatEffectPartStrength = (setting: BeatEffectSetting, part: string): number => setting.parts?.[part] ?? 1

/** The effect's setting, or the default for one never touched. */
export const resolveBeatEffectSetting = (settings: SmartBeatSettings, id: string): BeatEffectSetting =>
    settings.effects[id] ?? BEAT_EFFECT_DEFAULT

/**
 * The effects that read drum hits (`source: 'drums'`), on any picture.
 */
export const DRUM_BEAT_EFFECT_IDS: readonly string[] = [
    BEAT_EFFECT_IDS.pendoloDrumhead,
    BEAT_EFFECT_IDS.temperaInkFlash,
    BEAT_EFFECT_IDS.machiDrumRipple,
    BEAT_EFFECT_IDS.machiScreenFlash,
]

/** Whether any drum-hit effect is switched on, whichever picture is on screen. */
export const anyDrumBeatEffectOn = (settings: SmartBeatSettings): boolean =>
    DRUM_BEAT_EFFECT_IDS.some((id) => resolveBeatEffectSetting(settings, id).on)

/** Whether the effects play at all: 智能动感模式 on, or on what is already stored (`cached`). */
export const smartBeatActive = (settings: SmartBeatSettings): boolean => settings.mode !== 'off'

/** Whether a track with nothing stored is analysed now (`on`). Under `cached` no run is ever started for the beat FX. */
export const smartBeatMayAnalyse = (settings: SmartBeatSettings): boolean => settings.mode === 'on'

/** Whether the effect plays: 智能动感模式 active, the effect not retired and switched on itself. */
export const isBeatEffectLive = (settings: SmartBeatSettings, effect: BeatEffectDef): boolean =>
    smartBeatActive(settings) && !effect.retired && resolveBeatEffectSetting(settings, effect.id).on

/** The effects a registry entry offers in its settings: every one not retired. */
export const offeredBeatEffects = (effects: readonly BeatEffectDef[] | undefined): readonly BeatEffectDef[] =>
    (effects ?? []).filter((effect) => !effect.retired)
