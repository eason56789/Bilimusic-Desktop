/**
 * 图标外观层:经典模式用 Fluent 图标,MD3 模式用 Material Symbols Rounded。
 *
 * 两套图标集同名导出(名称沿用应用里已有的 Fluent 命名),调用处无需改动。
 * MD3 侧以字体连字渲染,因此 style / className / fontSize 直接生效。
 */
import type { CSSProperties, ReactNode } from 'react'
import {
  AddRegular as FAddRegular,
  ArrowClockwiseRegular as FArrowClockwiseRegular,
  ArrowDownloadRegular as FArrowDownloadRegular,
  ArrowLeftRegular as FArrowLeftRegular,
  ArrowMinimizeRegular as FArrowMinimizeRegular,
  ArrowRepeat1Regular as FArrowRepeat1Regular,
  ArrowRepeatAllRegular as FArrowRepeatAllRegular,
  ArrowRightRegular as FArrowRightRegular,
  ArrowShuffleRegular as FArrowShuffleRegular,
  ArrowSwapRegular as FArrowSwapRegular,
  ArrowSyncRegular as FArrowSyncRegular,
  ChatMultipleRegular as FChatMultipleRegular,
  CheckmarkCircleRegular as FCheckmarkCircleRegular,
  CheckmarkRegular as FCheckmarkRegular,
  ChevronDownRegular as FChevronDownRegular,
  ChevronUpRegular as FChevronUpRegular,
  ClockRegular as FClockRegular,
  CloudArrowDownRegular as FCloudArrowDownRegular,
  ColorRegular as FColorRegular,
  DarkThemeRegular as FDarkThemeRegular,
  DeleteRegular as FDeleteRegular,
  DismissRegular as FDismissRegular,
  EditRegular as FEditRegular,
  ErrorCircleRegular as FErrorCircleRegular,
  Eye24Regular as FEye24Regular,
  EyeOff24Regular as FEyeOff24Regular,
  FolderAddRegular as FFolderAddRegular,
  FolderOpenRegular as FFolderOpenRegular,
  GaugeRegular as FGaugeRegular,
  HeartRegular as FHeartRegular,
  HistoryRegular as FHistoryRegular,
  InfoRegular as FInfoRegular,
  ListRegular as FListRegular,
  MoreHorizontalRegular as FMoreHorizontalRegular,
  MusicNote2Regular as FMusicNote2Regular,
  NextRegular as FNextRegular,
  NoteEditRegular as FNoteEditRegular,
  OpenRegular as FOpenRegular,
  PauseRegular as FPauseRegular,
  PersonRegular as FPersonRegular,
  PersonVoiceRegular as FPersonVoiceRegular,
  PlayRegular as FPlayRegular,
  PowerRegular as FPowerRegular,
  PreviousRegular as FPreviousRegular,
  QrCodeRegular as FQrCodeRegular,
  SaveRegular as FSaveRegular,
  SearchRegular as FSearchRegular,
  SelectAllOnRegular as FSelectAllOnRegular,
  SettingsRegular as FSettingsRegular,
  SparkleRegular as FSparkleRegular,
  Speaker1Regular as FSpeaker1Regular,
  SpeakerMuteRegular as FSpeakerMuteRegular,
  WeatherMoonRegular as FWeatherMoonRegular,
  WeatherSunnyRegular as FWeatherSunnyRegular
} from '@fluentui/react-icons'
import { useUiStyle } from './styleContext'

export type IconProps = {
  className?: string
  style?: CSSProperties
  /** Fluent 图标的填充色属性 */
  primaryFill?: string
  fontSize?: number | string
  color?: string
}

/** Fluent 图标名 → Material Symbols 名称 */
const MATERIAL_NAMES: Record<string, string> = {
  AddRegular: 'add',
  ArrowClockwiseRegular: 'refresh',
  ArrowDownloadRegular: 'download',
  ArrowLeftRegular: 'arrow_back',
  ArrowMinimizeRegular: 'remove',
  ArrowRepeat1Regular: 'repeat_one',
  ArrowRepeatAllRegular: 'repeat',
  ArrowRightRegular: 'arrow_forward',
  ArrowShuffleRegular: 'shuffle',
  ArrowSwapRegular: 'swap_horiz',
  ArrowSyncRegular: 'sync',
  ChatMultipleRegular: 'forum',
  CheckmarkCircleRegular: 'check_circle',
  CheckmarkRegular: 'check',
  ChevronDownRegular: 'keyboard_arrow_down',
  ChevronUpRegular: 'keyboard_arrow_up',
  ClockRegular: 'schedule',
  CloudArrowDownRegular: 'cloud_download',
  ColorRegular: 'palette',
  DarkThemeRegular: 'contrast',
  DeleteRegular: 'delete',
  DismissRegular: 'close',
  EditRegular: 'edit',
  ErrorCircleRegular: 'error',
  Eye24Regular: 'visibility',
  EyeOff24Regular: 'visibility_off',
  FolderAddRegular: 'create_new_folder',
  FolderOpenRegular: 'folder_open',
  GaugeRegular: 'speed',
  HeartRegular: 'favorite',
  HistoryRegular: 'history',
  InfoRegular: 'info',
  ListRegular: 'format_list_bulleted',
  MoreHorizontalRegular: 'more_horiz',
  MusicNote2Regular: 'music_note',
  NextRegular: 'skip_next',
  NoteEditRegular: 'edit_note',
  OpenRegular: 'open_in_new',
  PauseRegular: 'pause',
  PersonRegular: 'person',
  PersonVoiceRegular: 'record_voice_over',
  PlayRegular: 'play_arrow',
  PowerRegular: 'power_settings_new',
  PreviousRegular: 'skip_previous',
  QrCodeRegular: 'qr_code_2',
  SaveRegular: 'save',
  SearchRegular: 'search',
  SelectAllOnRegular: 'select_all',
  SettingsRegular: 'settings',
  SparkleRegular: 'auto_awesome',
  Speaker1Regular: 'volume_up',
  SpeakerMuteRegular: 'volume_off',
  WeatherMoonRegular: 'bedtime',
  WeatherSunnyRegular: 'light_mode'
}

/** Fluent 图标名 → 组件。
 *  刻意写成静态字面量映射:若用 `import * as FluentIcons` 再按名取值,
 *  Rollup 无法摇树,会把整套图标集(1.5k+ 个)打进产物(实测 1.7MB → 18.6MB)。 */
const FLUENT: Record<string, (p: IconProps) => ReactNode> = {
  AddRegular: FAddRegular,
  ArrowClockwiseRegular: FArrowClockwiseRegular,
  ArrowDownloadRegular: FArrowDownloadRegular,
  ArrowLeftRegular: FArrowLeftRegular,
  ArrowMinimizeRegular: FArrowMinimizeRegular,
  ArrowRepeat1Regular: FArrowRepeat1Regular,
  ArrowRepeatAllRegular: FArrowRepeatAllRegular,
  ArrowRightRegular: FArrowRightRegular,
  ArrowShuffleRegular: FArrowShuffleRegular,
  ArrowSwapRegular: FArrowSwapRegular,
  ArrowSyncRegular: FArrowSyncRegular,
  ChatMultipleRegular: FChatMultipleRegular,
  CheckmarkCircleRegular: FCheckmarkCircleRegular,
  CheckmarkRegular: FCheckmarkRegular,
  ChevronDownRegular: FChevronDownRegular,
  ChevronUpRegular: FChevronUpRegular,
  ClockRegular: FClockRegular,
  CloudArrowDownRegular: FCloudArrowDownRegular,
  ColorRegular: FColorRegular,
  DarkThemeRegular: FDarkThemeRegular,
  DeleteRegular: FDeleteRegular,
  DismissRegular: FDismissRegular,
  EditRegular: FEditRegular,
  ErrorCircleRegular: FErrorCircleRegular,
  Eye24Regular: FEye24Regular,
  EyeOff24Regular: FEyeOff24Regular,
  FolderAddRegular: FFolderAddRegular,
  FolderOpenRegular: FFolderOpenRegular,
  GaugeRegular: FGaugeRegular,
  HeartRegular: FHeartRegular,
  HistoryRegular: FHistoryRegular,
  InfoRegular: FInfoRegular,
  ListRegular: FListRegular,
  MoreHorizontalRegular: FMoreHorizontalRegular,
  MusicNote2Regular: FMusicNote2Regular,
  NextRegular: FNextRegular,
  NoteEditRegular: FNoteEditRegular,
  OpenRegular: FOpenRegular,
  PauseRegular: FPauseRegular,
  PersonRegular: FPersonRegular,
  PersonVoiceRegular: FPersonVoiceRegular,
  PlayRegular: FPlayRegular,
  PowerRegular: FPowerRegular,
  PreviousRegular: FPreviousRegular,
  QrCodeRegular: FQrCodeRegular,
  SaveRegular: FSaveRegular,
  SearchRegular: FSearchRegular,
  SelectAllOnRegular: FSelectAllOnRegular,
  SettingsRegular: FSettingsRegular,
  SparkleRegular: FSparkleRegular,
  Speaker1Regular: FSpeaker1Regular,
  SpeakerMuteRegular: FSpeakerMuteRegular,
  WeatherMoonRegular: FWeatherMoonRegular,
  WeatherSunnyRegular: FWeatherSunnyRegular
}

/** Material Symbols 字形(MD3 模式) */
function MaterialIcon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={`md3-icon material-symbols-rounded ${className ?? ''}`}
      style={style}
    >
      {name}
    </span>
  )
}

/** 生成一个图标组件(MD3 模式自动切到同名 Material Symbols 字形) */
function makeIcon(fluentName: string): (props: IconProps) => ReactNode {
  const FluentIcon = FLUENT[fluentName]
  const materialName = MATERIAL_NAMES[fluentName]
  const Comp = (props: IconProps): ReactNode => {
    const style = useUiStyle()
    if (style === 'md3' && materialName) {
      const { primaryFill, color, fontSize, className, style: s } = props
      return (
        <MaterialIcon
          name={materialName}
          className={className}
          style={{
            fontSize: fontSize ?? undefined,
            color: color ?? primaryFill ?? undefined,
            ...s
          }}
        />
      )
    }
    return FluentIcon ? <FluentIcon {...props} /> : null
  }
  Comp.displayName = `Icon(${fluentName})`
  return Comp
}

export const AddRegular = makeIcon('AddRegular')
export const ArrowClockwiseRegular = makeIcon('ArrowClockwiseRegular')
export const ArrowDownloadRegular = makeIcon('ArrowDownloadRegular')
export const ArrowLeftRegular = makeIcon('ArrowLeftRegular')
export const ArrowMinimizeRegular = makeIcon('ArrowMinimizeRegular')
export const ArrowRepeat1Regular = makeIcon('ArrowRepeat1Regular')
export const ArrowRepeatAllRegular = makeIcon('ArrowRepeatAllRegular')
export const ArrowRightRegular = makeIcon('ArrowRightRegular')
export const ArrowShuffleRegular = makeIcon('ArrowShuffleRegular')
export const ArrowSwapRegular = makeIcon('ArrowSwapRegular')
export const ArrowSyncRegular = makeIcon('ArrowSyncRegular')
export const ChatMultipleRegular = makeIcon('ChatMultipleRegular')
export const CheckmarkCircleRegular = makeIcon('CheckmarkCircleRegular')
export const CheckmarkRegular = makeIcon('CheckmarkRegular')
export const ChevronDownRegular = makeIcon('ChevronDownRegular')
export const ChevronUpRegular = makeIcon('ChevronUpRegular')
export const ClockRegular = makeIcon('ClockRegular')
export const CloudArrowDownRegular = makeIcon('CloudArrowDownRegular')
export const ColorRegular = makeIcon('ColorRegular')
export const DarkThemeRegular = makeIcon('DarkThemeRegular')
export const DeleteRegular = makeIcon('DeleteRegular')
export const DismissRegular = makeIcon('DismissRegular')
export const EditRegular = makeIcon('EditRegular')
export const ErrorCircleRegular = makeIcon('ErrorCircleRegular')
export const Eye24Regular = makeIcon('Eye24Regular')
export const EyeOff24Regular = makeIcon('EyeOff24Regular')
export const FolderAddRegular = makeIcon('FolderAddRegular')
export const FolderOpenRegular = makeIcon('FolderOpenRegular')
export const GaugeRegular = makeIcon('GaugeRegular')
export const HeartRegular = makeIcon('HeartRegular')
export const HistoryRegular = makeIcon('HistoryRegular')
export const InfoRegular = makeIcon('InfoRegular')
export const ListRegular = makeIcon('ListRegular')
export const MoreHorizontalRegular = makeIcon('MoreHorizontalRegular')
export const MusicNote2Regular = makeIcon('MusicNote2Regular')
export const NextRegular = makeIcon('NextRegular')
export const NoteEditRegular = makeIcon('NoteEditRegular')
export const OpenRegular = makeIcon('OpenRegular')
export const PauseRegular = makeIcon('PauseRegular')
export const PersonRegular = makeIcon('PersonRegular')
export const PersonVoiceRegular = makeIcon('PersonVoiceRegular')
export const PlayRegular = makeIcon('PlayRegular')
export const PowerRegular = makeIcon('PowerRegular')
export const PreviousRegular = makeIcon('PreviousRegular')
export const QrCodeRegular = makeIcon('QrCodeRegular')
export const SaveRegular = makeIcon('SaveRegular')
export const SearchRegular = makeIcon('SearchRegular')
export const SelectAllOnRegular = makeIcon('SelectAllOnRegular')
export const SettingsRegular = makeIcon('SettingsRegular')
export const SparkleRegular = makeIcon('SparkleRegular')
export const Speaker1Regular = makeIcon('Speaker1Regular')
export const SpeakerMuteRegular = makeIcon('SpeakerMuteRegular')
export const WeatherMoonRegular = makeIcon('WeatherMoonRegular')
export const WeatherSunnyRegular = makeIcon('WeatherSunnyRegular')
