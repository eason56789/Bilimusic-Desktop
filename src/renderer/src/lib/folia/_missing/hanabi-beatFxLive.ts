// stub: 上游 services/beatFx/beatFxLive.ts 是播放器在每帧 tick 里驱动的节拍直播状态
// (beat_this 的节拍表、实时强度、各效果的开关强度),依赖全局播放器。
// 此处降级为「节拍表没装好」的恒定状态:isBeatFxReady 恒 false、强度恒 0、事件表恒空,
// hanabi 的随拍开花 / 随拍推镜于是完全不出现,画面与关掉智能动感模式时一致。
import type { BeatFxEvent } from './hanabi-beatFxClock';

const intensities: Readonly<{ beat: number; downbeat: number }> = { beat: 0, downbeat: 0 };

export const getBeatFxIntensities = (): Readonly<{ beat: number; downbeat: number }> => intensities;

/** 一个效果的实时强度(0..2);降级下永远 0。 */
export const getBeatEffectStrength = (_id: string): number => 0;

export const isBeatEffectPlaying = (_id: string): boolean => false;

export const isBeatFxReady = (): boolean => false;

export const isBeatFxHearing = (): boolean => false;

export const getBeatFxEvents = (): readonly BeatFxEvent[] => [];

export const getBeatFxBeatPeriod = (): number => 0;

/** 节拍表带的全轨强度倍率(1 = 原样)。 */
export const getBeatFxTrackScale = (): number => 1;

/** 每拍左右交替摆的换边符号。 */
export const getBeatFxRotationSign = (): number => 1;

export const getBeatFxFiredCounts = (): Readonly<{ beats: number; downbeats: number }> => ({ beats: 0, downbeats: 0 });

export const getBeatFxLastBeat = (): BeatFxEvent | null => null;

export const getBeatFxLastDownbeat = (): BeatFxEvent | null => null;
