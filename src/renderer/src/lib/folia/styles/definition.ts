/**
 * 上游 definition.ts 的精简替代:只保留各样式 render 函数用到的 props 形状。
 * 完整契约见 lib/folia/bridge.ts 与 FoliaStage.tsx 的宿主实现。
 *
 * 注意:currentTime / audioPower / audioBands 用**真的** framer-motion MotionValue,
 * 因为上游样式会对它们调用 useSpring / useTransform,假对象做不到。
 */
import type { MotionValue } from 'framer-motion'
import type {
  AudioBands,
  CladdaghTuning,
  Line,
  SubtitleContentMode,
  SubtitleOverlayLayout,
  Theme
} from '../bridge'
import type {
  CadenzaTuning,
  ClassicTuning,
  FumeTuning,
  PartitaTuning,
  TiltTuning
} from '../motion'

export interface VisualizerSharedProps {
  currentTime: MotionValue<number>
  duration?: number
  currentLineIndex: number
  lines: Line[]
  theme: Theme
  subtitleTheme?: Theme
  isDaylight?: boolean
  audioPower: MotionValue<number>
  audioBands: AudioBands
  showText?: boolean
  songTitle?: string | null
  songArtist?: string | null
  songAlbum?: string | null
  coverUrl?: string | null
  seed?: string | number
  staticMode?: boolean
  lyricsFontScale?: number
  subtitleFontScale?: number
  /** 各样式自己的 tuning(上游由设置面板注入;这里给默认值即可) */
  claddaghTuning?: CladdaghTuning
  classicTuning?: ClassicTuning
  partitaTuning?: PartitaTuning
  tiltTuning?: TiltTuning
  cadenzaTuning?: CadenzaTuning
  fumeTuning?: FumeTuning
  isPreviewMode?: boolean
  renderQuality?: unknown
  background?: VisualizerBackgroundConfig
  /** 字幕相关(VisualizerSubtitleOverlay 会读) */
  subtitleContentMode?: SubtitleContentMode
  subtitleOverlayLayout?: SubtitleOverlayLayout
  subtitleOverlayOpacity?: number
  subtitleOverlayBackground?: boolean
  showSubtitleTranslation?: boolean
  hideTranslationSubtitle?: boolean
  showHarmonySubtitle?: boolean
  harmonySubtitleBackground?: boolean
  subtitleUpcomingLyricsBlur?: boolean
  isPlayerChromeHidden?: boolean
  paused?: boolean
  backgroundStaticMode?: boolean
  visualizerOpacity?: number
}

export interface VisualizerBackgroundConfig {
  mode?: string
  opacity?: number
  blur?: number
  [k: string]: unknown
}

export interface VisualizerQuickControlsProps {
  [k: string]: unknown
}

export interface VisualizerEntryModule {
  default: unknown
}
