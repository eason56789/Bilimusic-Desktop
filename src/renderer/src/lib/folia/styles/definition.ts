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
  LumiereTuning,
  MonetPortraitImage,
  MonetTuning,
  PartitaTuning,
  PendoloTuning,
  TiltTuning
} from '../motion'
import type { VisualizerTuningBundle, VisualizerTuningSettings } from '../tuningDefinition'
import type { HanabiTuning } from './hanabi/types'
import type { NebbiaTuning } from './nebbia/types'
import type { SonnetTuning } from './sonnet/types'
import type { DioramaTuning } from '../motion'
import type { MachiTuning } from './machi/types'

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
  cappellaTuning?: import('./cappella/tuning').CappellaTuning
  /** cappella 自定义表情包/头像(上游从资产 store 读;本项目降级为空) */
  cappellaCustomEmojiImages?: import('./cappella/tuning').CappellaEmojiImage[]
  cappellaCustomAvatarImages?: import('./cappella/tuning').CappellaAvatarImage[]
  lumiereTuning?: LumiereTuning
  hanabiTuning?: HanabiTuning
  /** monet / pendolo(上游由设置面板注入;这里给默认值即可) */
  monetTuning?: MonetTuning
  /** monet 的自定义头像图(上游从资产 store 读;本项目降级为 null,样式有 null 分支) */
  monetPortraitImage?: MonetPortraitImage | null
  /** monet 的调音变更(拖动头像等) */
  onMonetTuningChange?: (patch: Partial<MonetTuning>) => void
  pendoloTuning?: PendoloTuning
  nebbiaTuning?: NebbiaTuning
  sonnetTuning?: SonnetTuning
  /** A change the style on screen makes to its own tuning (a part dragged on the stage): the host saves it. */
  onVisualizerTuningChange?: (patch: object) => void
  /** automix 交接(上游 followsSongHandoff 的样式用;本项目宿主不传,降级为 null) */
  songHandoff?: VisualizerSongHandoff | null
  onLyricLineSeek?: (lyricTimeSec: number) => void
  isPanelOpen?: boolean
  onBack?: () => void
  isPreviewMode?: boolean
  renderQuality?: unknown
  background?: VisualizerBackgroundConfig
  /** 上游 definition.ts 同名 prop:各样式 tuning 包(mode 名 -> tuning),entry.tsx 的 read() 用 */
  visualizerTunings?: VisualizerTuningBundle
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
  /** diorama / machi(上游由设置面板注入;这里给默认值即可) */
  dioramaTuning?: DioramaTuning
  machiTuning?: MachiTuning
}

export interface VisualizerBackgroundConfig {
  mode?: string
  opacity?: number
  blur?: number
  [k: string]: unknown
}

/**
 * 上游 definition.ts 的 VisualizerSongHandoff:automix/crossfade 交接时把画面从当前歌
 * 交给下一歌。本项目宿主不传,样式按 null 降级。
 */
export interface VisualizerSongHandoff {
  /** How far the hand-off has come, 0..1: 0 until the blend is announced. */
  progress: MotionValue<number>
  /** The incoming song as the props will name it once the blend settles. */
  seed: string | number
  songTitle?: string | null
  songArtist?: string | null
  songAlbum?: string | null
  coverUrl?: string | null
  theme: Theme
  subtitleTheme?: Theme
  lines: Line[]
  currentTime: MotionValue<number>
  currentLineIndex: number
}

export interface VisualizerQuickControlsProps {
  [k: string]: unknown
}

/**
 * 上游 definition.ts 的 VisualizerSettingsPanelProps:样式设置面板的 props。
 * 本项目宿主暂不登记设置面板,这里先保留形状供面板组件编译。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VisualizerSettingsPanelProps<T = any> {
  t: (key: string) => string
  isDaylight: boolean
  theme: Theme
  controlCardBg: string
  rangeInputClass: string
  /** The style's tuning as the window shows it: with a slider's value while the slider is held. */
  tuning: T
  /** A change to the tuning: shown at once, and saved at once or, while a slider is held, when it is let go. */
  onTuningChange: (patch: Partial<T>) => void
  /** Mark slider drag start so onChange only updates draft. */
  onSliderPointerDown?: () => void
  /** Commit draft values to persistent store on slider release. */
  onSliderCommit?: () => void
  /** The settings store's fields of the styles: for a style's own further actions (a picture uploaded for it, cleared). */
  settings: VisualizerTuningSettings
}

export interface VisualizerEntryModule {
  default: unknown
}
