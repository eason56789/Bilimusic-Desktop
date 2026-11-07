/**
 * folia 运行时:类型与常量
 *
 * 上游 folia 的 visualizer props 用 framer-motion 的 MotionValue
 * (currentTime / audioPower / audioBands),样式逐帧读 .get()。
 * 本项目宿主(FoliaStage)用真 motionValue() 建对象并逐帧 set,
 * 所以这里不再提供"假 MotionValue",只放类型与各样式 tuning 的默认值。
 */


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

/* ===================== lumiere 的 tuning(与上游 types.ts 一致) ===================== */

/** 绘光画质档位。`full` 全分辨率;`balanced` / `low` 把光场与辉光降采样、烟雾倍频数封顶,用于省电。 */
export type LumiereRenderQuality = 'full' | 'balanced' | 'low'

export interface LumiereTuning {
  /** 分辨率与抗锯齿:默认跟随全局挡位(utils/lyricRenderQuality.ts)。 */
  render: LyricRenderOverride
  /** 光强倍率, 0.3..2. */
  lightIntensity: number
  /** 随音乐变亮, 0..2 (0 = 不随音乐变). */
  audioResponse: number
  /** 烟雾浓度, 0..2. */
  fogDensity: number
  /** 暗场强度, 0..1:光后面铺一层主题背景色压暗的底(0 = 共享背景原样透出)。浅色主题保底 0.94。 */
  darkField: number
  /** 浮尘数量, 0..2. */
  moteAmount: number
  /** 图形辉光, 0..2. */
  bloom: number
  /** 文字辉光, 0..2. */
  textBloom: number
  /** 未唱字透明度, 0.05..0.6. */
  unlitOpacity: number
  /** 邻行:1 = 上一行 + 当前行,2 = 上一行 + 当前行 + 下一行. */
  windowNeighbors: 1 | 2
  /** 崩解强度, 0..2. */
  decay: number
  /** 背景歌词亮度, 0..2 (0 = 关). */
  echo: number
  /** 烟雾细节(倍频数), integer 2..6. */
  fogOctaves: number
  /** 线稿. */
  lineArt: boolean
  /** 前景散景. */
  frontBokeh: boolean
  /** 所有换位都走轨迹线. */
  trails: boolean
  /** 隐藏所有歌词换位的轨迹线,保留字的飞行与轨迹过渡. */
  hideTrails: boolean
  /** 轨迹过渡:段落之间也在同一个光场里交接。改它会重新编译程序. */
  seamlessTransitions: boolean
  /** 画框. */
  overlayFrame: boolean
  /** 仅显示歌词文字:只画歌词与字上的效果。 */
  textOnly: boolean
  /** 关键字着色(主题 wordColors). */
  keywordColors: boolean
  /** 主题图标(主题 lyricsIcons 画成线稿). */
  themeIcons: boolean
  /** 主题色占比, 0..1. */
  themeColorMix: number
  /** 画质. */
  renderQuality: LumiereRenderQuality
}

export const DEFAULT_LUMIERE_TUNING: LumiereTuning = {
  render: { scale: 'global', antialias: 'global' },
  lightIntensity: 1,
  audioResponse: 1,
  fogDensity: 1,
  darkField: 0.75,
  moteAmount: 1,
  bloom: 1,
  textBloom: 1,
  unlitOpacity: 0.22,
  windowNeighbors: 2,
  decay: 1,
  echo: 1,
  fogOctaves: 5,
  lineArt: true,
  frontBokeh: true,
  trails: true,
  hideTrails: false,
  seamlessTransitions: true,
  overlayFrame: true,
  textOnly: false,
  keywordColors: true,
  themeIcons: true,
  themeColorMix: 0.3,
  renderQuality: 'full'
}

/* ===================== monet 的 tuning(与上游 types.ts 一致) ===================== */

export type MonetBackgroundSource = 'cover-derived' | 'uploaded-global'
export type MonetBackgroundLayout = 'full-overlay' | 'half-pane-gradient'
export type MonetBackgroundWashColorMode = 'theme' | 'custom'
export type MonetAudioStyle = 'bar' | 'line'
export type MonetPortraitSource = 'cover' | 'custom'

export interface MonetBackgroundTuning {
  backgroundSource: MonetBackgroundSource
  backgroundLayout: MonetBackgroundLayout
  backgroundBlurPx: number
  backgroundOverlayOpacity: number
  backgroundGrayscale: number
  backgroundSaturation: number
  backgroundWash: number
  backgroundHalfPaneOffsetX: number
  backgroundWashColorMode: MonetBackgroundWashColorMode
  backgroundWashCustomColor: string
  /** 整张背景图的缓慢缩放漂移;纯 CSS 合成层动画,不参与背景烘焙。 */
  backgroundDriftEnabled: boolean
  /** 漂移幅度 0..1,同时决定位移距离和为防止露边而预放大的倍率。 */
  backgroundDriftStrength: number
  /** 是否在烘焙的 overlay 里绘制那几条 1px 竖向纹理。 */
  backgroundStreaksEnabled: boolean
}

export interface MonetTuning {
  /** 分辨率与抗锯齿(#929):默认跟随全局挡位。 */
  render: LyricRenderOverride
  keywordColoringEnabled: boolean
  showDescription: boolean
  showAudioVisualization: boolean
  audioStyle: MonetAudioStyle
  fontScale: number
  portraitSource: MonetPortraitSource
  portraitOffsetX?: number
  portraitStyle?: 'square' | 'rectangular'
  showPortraitDragHanger?: boolean
}

export const DEFAULT_MONET_BACKGROUND_TUNING: MonetBackgroundTuning = {
  backgroundSource: 'cover-derived',
  backgroundLayout: 'full-overlay',
  backgroundBlurPx: 6,
  backgroundOverlayOpacity: 0.74,
  backgroundGrayscale: 0,
  backgroundSaturation: 1.05,
  backgroundWash: 0.34,
  backgroundHalfPaneOffsetX: 0,
  backgroundWashColorMode: 'theme',
  backgroundWashCustomColor: '#8fb7ff',
  backgroundDriftEnabled: true,
  backgroundDriftStrength: 0.5,
  backgroundStreaksEnabled: true
}

export const DEFAULT_MONET_TUNING: MonetTuning = {
  render: { scale: 'global', antialias: 'global' },
  keywordColoringEnabled: true,
  showDescription: true,
  showAudioVisualization: true,
  audioStyle: 'bar',
  fontScale: 1.2,
  portraitSource: 'cover',
  portraitOffsetX: 0,
  portraitStyle: 'square',
  showPortraitDragHanger: true
}

/** monet 的全局上传图片(存档形状:blob;展示形状:url) */
export interface StoredMonetBackgroundImage {
  id: string
  name: string
  mimeType: string
  blob: Blob
}

export interface MonetBackgroundImage {
  id: string
  name: string
  url: string
}

export interface StoredMonetPortraitImage {
  id: string
  name: string
  mimeType: string
  blob: Blob
}

export interface MonetPortraitImage {
  id: string
  name: string
  url: string
}

/* ===================== pendolo 的 tuning(与上游 types.ts 一致) ===================== */

export interface PendoloTuning {
  /** 分辨率与抗锯齿(#929):默认跟随「动画与性能」里的全局挡位。 */
  render: LyricRenderOverride
  arcRadius: number
  arcAngleDeg: number
  wheelCenterX: number
  wheelCenterY: number
  tickSnappiness: number
  activeScale: number
  showGearDecor: 'none' | 'subtle' | 'full'
  showCenterGradient?: boolean
  showCoverOnWatchFace?: boolean
  enableLineGlow?: boolean
}

export const DEFAULT_PENDOLO_TUNING: PendoloTuning = {
  render: { scale: 'global', antialias: 'global' },
  arcRadius: 0.52,
  arcAngleDeg: 100,
  wheelCenterX: 0.0,
  wheelCenterY: 0.5,
  tickSnappiness: 2.0,
  activeScale: 1.4,
  showGearDecor: 'subtle',
  showCenterGradient: true,
  showCoverOnWatchFace: false,
  enableLineGlow: false
}

/* ===================== nebbia / sonnet 的 tuning(定义在各自 styles/<style>/types.ts,这里转出) ===================== */

export { DEFAULT_NEBBIA_TUNING } from './styles/nebbia/types'
export type { NebbiaTuning } from './styles/nebbia/types'

export { DEFAULT_SONNET_TUNING } from './styles/sonnet/types'
export type { SonnetTuning, SonnetOuterFrameMode } from './styles/sonnet/types'
