/** 节拍特效(上游 services/beatFx/beatEffects 的最小实现):不产生任何节拍冲击 */
export interface BeatEffectDef { id: string; name?: string; [k: string]: unknown }
export interface BeatAccent { zoom?: number; tilt?: number; [k: string]: unknown }
export const DEFAULT_BEAT_EFFECT: BeatEffectDef = { id: 'none' }
export const resolveBeatAccent = (): BeatAccent => ({ zoom: 0, tilt: 0 })
export const getBeatEffects = (): BeatEffectDef[] => []
export default { DEFAULT_BEAT_EFFECT, resolveBeatAccent, getBeatEffects }

export const resolveBeatFxAccentGainFromDef = (..._args: unknown[]): number => 0
export const beatEffectById = (..._args: unknown[]): BeatEffectDef => DEFAULT_BEAT_EFFECT
export const BEAT_EFFECT_PRESETS: BeatEffectDef[] = []
