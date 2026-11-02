/**
 * folia 运行时:类型与常量
 *
 * 上游 folia 的 visualizer props 用 framer-motion 的 MotionValue
 * (currentTime / audioPower / audioBands),样式逐帧读 .get()。
 * 本项目宿主(FoliaStage)用真 motionValue() 建对象并逐帧 set,
 * 所以这里不再提供"假 MotionValue",只放类型与各样式 tuning 的默认值。
 */

import type { TiltColorScheme } from './bridge'

/* ===================== 各样式 tuning ===================== */

export interface ClassicTuning {
  enableWordRotation: boolean
  breathingFloatMultiplier: number
  useLegacyLayout: boolean
  wordSpacing: number
}

export const DEFAULT_CLASSIC_TUNING: ClassicTuning = {
  enableWordRotation: true,
  breathingFloatMultiplier: 1,
  useLegacyLayout: false,
  wordSpacing: 0.7
}

export interface PartitaTuning {
  showGuideLines: boolean
  useSemanticLayout: boolean
  staggerMin: number
  staggerMax: number
}

export const DEFAULT_PARTITA_TUNING: PartitaTuning = {
  showGuideLines: true,
  useSemanticLayout: true,
  staggerMin: 20,
  staggerMax: 100
}

export interface TiltTuning {
  splitProbability: number
  tiltStyleProbability: number
  colorScheme?: TiltColorScheme
}

export const DEFAULT_TILT_TUNING: TiltTuning = {
  splitProbability: 0.75,
  tiltStyleProbability: 0.35,
  colorScheme: 'default'
}

/* ===================== cadenza / fume 的 tuning(与上游 types.ts 一致) ===================== */

export type LyricRenderScale = 0.5 | 0.75 | 1 | 1.5 | 2

export interface LyricRenderOverride {
  scale: 'global' | LyricRenderScale
  antialias: 'global' | 'on' | 'off'
}

export interface CadenzaTuning {
  render: LyricRenderOverride
  fontScale: number
  widthRatio: number
  motionAmount: number
  glowIntensity: number
  beamIntensity: number
}

export const DEFAULT_CADENZA_TUNING: CadenzaTuning = {
  render: { scale: 'global', antialias: 'global' },
  fontScale: 1.12,
  widthRatio: 0.72,
  motionAmount: 1,
  glowIntensity: 1,
  beamIntensity: 0
}

export interface FumeTuning {
  render: LyricRenderOverride
  hidePrintSymbols: boolean
  disableGeometricBackground: boolean
  backgroundObjectOpacity: number
  textHoldRatio: number
  cameraTrackingMode: 'stepped' | 'smooth'
  cameraSpeed: number
  glowIntensity: number
  heroScale: number
}

export const DEFAULT_FUME_TUNING: FumeTuning = {
  render: { scale: 'global', antialias: 'global' },
  hidePrintSymbols: false,
  disableGeometricBackground: true,
  backgroundObjectOpacity: 0.5,
  textHoldRatio: 1,
  cameraTrackingMode: 'smooth',
  cameraSpeed: 1,
  glowIntensity: 1,
  heroScale: 1
}
