/**
 * folia 视觉样式 ↔ 本项目的数据桥接
 *
 * folia(AGPL-3.0,https://github.com/chthollyphile/folia-major)的每个歌词样式
 * 都消费同一个 props 契约 VisualizerSharedProps:lines: Line[]、theme: Theme、
 * currentTime / audioPower(MotionValue)等。这里把本项目的 LyricLine / Settings
 * 转成那套形状。
 *
 * 两个必须注意的差异:
 *  1) **时间单位**:folia 全程用「秒」,本项目 LyricLine 用「毫秒」。
 *  2) 字体/颜色来自 Theme;本项目的主题只有一个 accent,其余字段要按模式推导。
 */
import type { LyricLine, Settings } from '@shared/types'
import type { LineRenderHints } from './utils/renderHints'

/* ===================== folia 类型(与上游 src/types.ts 同名同形) ===================== */

export interface FoliaWord {
  text: string
  /** 秒 */
  startTime: number
  /** 秒 */
  endTime: number
  syllables?: { text: string; startTime: number; endTime: number }[]
}

export interface FoliaLine {
  words: FoliaWord[]
  /** 秒 */
  startTime: number
  /** 秒 */
  endTime: number
  fullText: string
  translation?: string
  romanization?: string
  isChorus?: boolean
  id?: string
  /** 上游 Line 的可选字段(样式偶有读取,这里保持可选以兼容) */
  wordSegments?: string[]
  autoWordSegments?: string[]
  renderHints?: LineRenderHints
  songPart?: string
  blockIndex?: number
  alternateTexts?: { text: string; kind?: string }[]
  /** cappella 用:同一时间轴多角色(本项目恒缺省,样式自动回退默认发送者) */
  agentId?: string
}

/** 上游命名别名(部分模块按 Word / Line / Theme 导入) */
export type Word = FoliaWord
export type Line = FoliaLine
export type Theme = FoliaTheme

/* ===================== 字幕相关类型(上游 types.ts 同名) ===================== */

export type SubtitleContentMode = 'translation' | 'romanization' | 'both' | 'none'

export type SubtitleOverlayRowSource = 'current' | 'next' | 'translation' | 'romanization'
export type SubtitleOverlayFollowRow = Exclude<SubtitleOverlayRowSource, 'current'>

export type SubtitleOverlayLayout =
  | Exclude<SubtitleOverlayRowSource, 'next'>
  | `current+${SubtitleOverlayFollowRow}`
  | `current+${SubtitleOverlayFollowRow}+${SubtitleOverlayFollowRow}`

export interface FoliaTheme {
  name: string
  backgroundColor: string
  primaryColor: string
  accentColor: string
  secondaryColor: string
  fontStyle: 'sans' | 'serif' | 'mono'
  fontFamily?: string
  fontFamilyStack?: string[]
  fontWeight?: number
  wordColors?: { word: string; color: string }[]
  lyricsIcons?: string[]
  animationIntensity: 'calm' | 'normal' | 'chaotic'
}

/* ===================== 转换 ===================== */

/** 把毫秒的逐字数据展开成 folia 的 Word[](秒) */
function toFoliaWords(line: LyricLine, lineEndMs: number): FoliaWord[] {
  const text = line.text ?? ''
  if (!text) return []
  const chars = Array.from(text)
  // 优先 words(带时间分段);否则按字符均分
  if (line.words && line.words.length > 0) {
    return line.words
      .filter((w) => w.text)
      .map((w, i, arr) => ({
        text: w.text,
        startTime: w.timeMs / 1000,
        // 下一个词起点作为本词终点;末词用行末兜底
        endTime: (arr[i + 1]?.timeMs ?? Math.max(lineEndMs, w.timeMs + 300)) / 1000
      }))
  }
  if (line.wordTimes && line.wordTimes.length === chars.length) {
    return chars.map((c, i) => ({
      text: c,
      startTime: (line.wordTimes as number[])[i] / 1000,
      endTime: ((line.wordTimes as number[])[i + 1] ?? Math.max(lineEndMs, (line.wordTimes as number[])[i] + 300)) / 1000
    }))
  }
  // 无逐字:按行时长均分
  const span = Math.max(300, lineEndMs - line.timeMs)
  const per = span / Math.max(1, chars.length)
  return chars.map((c, i) => ({
    text: c,
    startTime: (line.timeMs + i * per) / 1000,
    endTime: (line.timeMs + (i + 1) * per) / 1000
  }))
}

/** LyricLine[] → folia Line[](秒;末行用给定兜底时长) */
export function toFoliaLines(lines: LyricLine[], fallbackDurMs = 6000): FoliaLine[] {
  const out: FoliaLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l || !l.text || !l.text.trim()) continue
    // 行末 = 下一行起点(与渲染色块交接一致),末行给兜底
    const nextStart = lines[i + 1]?.timeMs
    const lineEndMs = nextStart != null && nextStart > l.timeMs ? nextStart : l.timeMs + fallbackDurMs
    out.push({
      words: toFoliaWords(l, lineEndMs),
      startTime: l.timeMs / 1000,
      endTime: lineEndMs / 1000,
      fullText: l.text,
      translation: l.trans,
      isChorus: /副歌|chorus|サビ/i.test(l.text) || undefined,
      id: `line-${i}`
    })
  }
  return out
}

/** 由本项目设置推导 folia Theme */
export function toFoliaTheme(settings: Settings | undefined, isDark: boolean): FoliaTheme {
  const accent = settings?.accent || '#7aa2ff'
  return {
    name: isDark ? 'BiliMusic Dark' : 'BiliMusic Light',
    backgroundColor: isDark ? '#0b0b0e' : '#f5f5f4',
    primaryColor: isDark ? '#f2f2f0' : '#141414',
    accentColor: accent,
    secondaryColor: isDark ? 'rgba(242,242,240,0.66)' : 'rgba(20,20,20,0.62)',
    fontStyle: 'sans',
    fontWeight: 700,
    animationIntensity: 'normal'
  }
}

/** 当前播放行下标(找不到返回 -1,folia 用 -1 表示"还没开始") */
export function findLineIndex(lines: FoliaLine[], timeSec: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].startTime <= timeSec) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  // 该行已结束且还有下一行:返回 -1 之外的最近行更安全,保持 vs 上游一致
  return ans
}

/* ===================== 音频与备用文本类型 ===================== */

/** 上游 AudioBands 全部是 framer-motion 的 MotionValue(样式里会 useSpring 它们) */
export interface AudioBands {
  bass: import('framer-motion').MotionValue<number>
  lowMid: import('framer-motion').MotionValue<number>
  mid: import('framer-motion').MotionValue<number>
  vocal: import('framer-motion').MotionValue<number>
  treble: import('framer-motion').MotionValue<number>
  spectrum?: import('framer-motion').MotionValue<Uint8Array<ArrayBuffer>>
}

export interface LyricAlternateText {
  text: string
  kind?: string
  label?: string
  role?: string
}

/* ===================== 各样式 tuning(上游 types.ts 的默认值) ===================== */

export interface CladdaghTuning {
  focusScaleRatio: number
  radiusScale: number
  ellipseTiltDeg: number
  showAxisLine: boolean
  letterSpacingOffset: number
}

export const DEFAULT_CLADDAGH_TUNING: CladdaghTuning = {
  focusScaleRatio: 0.65,
  radiusScale: 1.0,
  ellipseTiltDeg: 45,
  showAxisLine: true,
  letterSpacingOffset: 0
}

export { DEFAULT_CLASSIC_TUNING, DEFAULT_PARTITA_TUNING, DEFAULT_CADENZA_TUNING, DEFAULT_FUME_TUNING, DEFAULT_LUMIERE_TUNING, DEFAULT_MONET_TUNING, DEFAULT_MONET_BACKGROUND_TUNING, DEFAULT_PENDOLO_TUNING } from './motion'
export type { ClassicTuning, PartitaTuning, CadenzaTuning, FumeTuning, LumiereTuning, LumiereRenderQuality, MonetTuning, MonetBackgroundTuning, MonetBackgroundSource, MonetBackgroundLayout, MonetBackgroundWashColorMode, MonetAudioStyle, MonetPortraitSource, MonetBackgroundImage, StoredMonetBackgroundImage, MonetPortraitImage, StoredMonetPortraitImage, PendoloTuning, LyricRenderOverride, LyricRenderScale } from './motion'


export { DEFAULT_NEBBIA_TUNING, DEFAULT_SONNET_TUNING } from './motion'
export type { NebbiaTuning, SonnetTuning, SonnetOuterFrameMode } from './motion'

