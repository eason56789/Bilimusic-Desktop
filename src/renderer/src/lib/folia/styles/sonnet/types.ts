import type { LyricRenderOverride } from '../../utils/lyricRenderQuality';
import type { Line } from '../../bridge';
import type { GraphemeTiming } from '../../utils/graphemeTiming';

// src/components/visualizer/sonnet/types.ts
// Public, renderer-independent contracts for the deterministic Sonnet PV program.
export type SonnetParagraphKind = 'breath' | 'verse' | 'lift' | 'chorus' | 'break' | 'outro';
export type SonnetParagraphBoundary = 'song-start' | 'time-gap' | 'metadata' | 'duration-cap' | 'line-cap';
export type SonnetShotKind =
    | 'editorial-column'
    | 'type-impact'
    | 'fragment-collage'
    | 'tracking-ribbon'
    | 'mask-reveal'
    | 'poster-blocks'
    | 'quiet-tableau';
export const SONNET_TRANSITION_KINDS = [
    'fast-blur',
    'mono-glitch',
    'camera-pull',
] as const;
export type SonnetTransitionKind = typeof SONNET_TRANSITION_KINDS[number];

export interface SonnetSemanticSegment {
    text: string;
    startOffset: number;
    endOffset: number;
    startTime: number;
    endTime: number;
    wordIndices: number[];
    graphemes: GraphemeTiming[];
    isWordLike: boolean;
}

export interface SonnetCompiledLine {
    sourceIndex: number;
    line: Line;
    renderEndTime: number;
    segments: SonnetSemanticSegment[];
}

export interface SonnetAnimationCue {
    at: number;
    duration: number;
    kind: 'enter' | 'hold' | 'exit' | 'accent';
    segmentStart: number;
    segmentEnd: number;
}

export interface SonnetShot {
    id: string;
    kind: SonnetShotKind;
    startTime: number;
    endTime: number;
    lineIndices: number[];
    cues: SonnetAnimationCue[];
    camera: {
        x: number;
        y: number;
        zoom: number;
        rotation: number;
    };
}

export interface SonnetTransition {
    kind: SonnetTransitionKind;
    startTime: number;
    endTime: number;
}

export interface SonnetParagraph {
    id: string;
    kind: SonnetParagraphKind;
    boundary: SonnetParagraphBoundary;
    startTime: number;
    endTime: number;
    lines: SonnetCompiledLine[];
    shots: SonnetShot[];
    transitionOut: SonnetTransition | null;
}

export interface SonnetProgram {
    version: 1;
    seed: string;
    paragraphGapThreshold: number;
    paragraphs: SonnetParagraph[];
}

export interface SonnetShotTemplate {
    kind: SonnetShotKind;
    supports: (lines: SonnetCompiledLine[], paragraphKind: SonnetParagraphKind) => boolean;
}

export interface SonnetTransitionTemplate {
    kind: SonnetTransitionKind;
}

// —— 从上游 src/types.ts 移入(上游定义在 src/types.ts,SonnetSettingsPanel/tuning.ts 都从那里拿) ——

export type SonnetOuterFrameMode = 'none' | 'frame' | 'full';

export interface SonnetTuning {
  /** 分辨率与抗锯齿（#929）：默认跟随「动画与性能」里的全局挡位（utils/lyricRenderQuality.ts）。 */
  render: LyricRenderOverride;
  cameraIntensity: number;
  typographyMotion: number;
  mgDensity: number;
  showOnlyText: boolean;
  showGuide: boolean;
  showBackgroundMg: boolean;
  showFixedGeo: boolean;
  showGiantDecorativeText: boolean;
  showBackgroundDecor: boolean;
  enableTransitions: boolean;
  outerFrameMode: SonnetOuterFrameMode;
  textureResolution: number;
  /** Master switch for the scene-wide post-process stack (grain + contrast). */
  postProcessEnabled: boolean;
  /** Film grain amount, 0..1. */
  postProcessGrain: number;
  /** Contrast boost, 0..1. */
  postProcessContrast: number;
  /** Fixed print-style passes riding the master switch; strength sliders, 0 disables the pass. */
  postProcessRgbShift: number;
  postProcessHalftone: number;
  /** Vignette strength, 0..2 (2 = double the base darkening). */
  postProcessVignette: number;
  /** Radial lens curvature amount, 0..2. */
  postProcessLensDistortion: number;
  /** Radial chromatic dispersion amount, 0..1. */
  postProcessLensDispersion: number;
}

export const DEFAULT_SONNET_TUNING: SonnetTuning = {
  render: { scale: 'global', antialias: 'global' },
  cameraIntensity: 1,
  typographyMotion: 1,
  mgDensity: 1,
  showOnlyText: false,
  showGuide: true,
  showBackgroundMg: true,
  showFixedGeo: true,
  showGiantDecorativeText: true,
  showBackgroundDecor: true,
  enableTransitions: true,
  outerFrameMode: 'full',
  textureResolution: 1.5,
  postProcessEnabled: false,
  postProcessGrain: 0.2,
  postProcessContrast: 0,
  postProcessRgbShift: 0,
  postProcessHalftone: 0,
  postProcessVignette: 0.85,
  postProcessLensDistortion: 0.3,
  postProcessLensDispersion: 0.6,
};
