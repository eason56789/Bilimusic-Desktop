/**
 * 封面取色 → folia Theme 生成
 *
 * 移植自 folia(AGPL-3.0)的封面主题管线:
 *  - src/utils/colorPalette.ts            加权 median-cut 主色提取
 *  - src/utils/builtinTheme/coverPaletteAnalysis.ts   色相骨架分析(主色/辅色/调和方案/浓淡)
 *  - src/utils/builtinTheme/themeColorRanges.ts       各角色的饱和度/明度设计区间
 *  - src/utils/builtinTheme/generateBuiltinDualTheme.ts 生成带对比度求解的明暗双主题
 *  - src/utils/themeColorMath.ts          hex 色彩数学(RGB/HSL/WCAG 对比度)
 *
 * 与上游的差异:上游交给完整主题服务(AI/内置双轨),这里只取内置轨道,
 * 并把生成的颜色并回本项目 FoliaTheme,让歌词样式背景真正"跟封面走"。
 */
import { parseColorChannels } from './shared/colorMix'
import type { FoliaTheme } from './bridge'

/* ===================== 色彩数学(上游 themeColorMath) ===================== */

export type Rgb = { r: number; g: number; b: number }
export type Hsl = { h: number; s: number; l: number }

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))
export const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360

const parseThemeColor = (value: string): Rgb | null => {
  const channels = typeof value === 'string' ? parseColorChannels(value) : null
  if (!channels) return null
  return { r: clampChannel(channels.r), g: clampChannel(channels.g), b: clampChannel(channels.b) }
}

const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, '0')).join('')}`

export const hexToHsl = (color: string): Hsl | null => {
  const parsed = parseThemeColor(color)
  if (!parsed) return null
  const red = parsed.r / 255
  const green = parsed.g / 255
  const blue = parsed.b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l: lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === red) hue = ((green - blue) / delta) % 6
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  return { h: normalizeHue(hue * 60), s: clamp01(saturation), l: clamp01(lightness) }
}

const hslToHex = (hsl: Hsl): string => {
  const hue = normalizeHue(hsl.h)
  const saturation = clamp01(hsl.s)
  const lightness = clamp01(hsl.l)
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const offset = lightness - chroma / 2
  const sector = Math.floor(hue / 60) % 6
  const [r, g, b] =
    sector === 0 ? [chroma, secondary, 0]
      : sector === 1 ? [secondary, chroma, 0]
        : sector === 2 ? [0, chroma, secondary]
          : sector === 3 ? [0, secondary, chroma]
            : sector === 4 ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  return rgbToHex({
    r: clampChannel((r + offset) * 255),
    g: clampChannel((g + offset) * 255),
    b: clampChannel((b + offset) * 255)
  })
}

const getRelativeLuminance = (color: string): number => {
  const parsed = parseThemeColor(color)
  if (!parsed) return 0
  const transform = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * transform(parsed.r) + 0.7152 * transform(parsed.g) + 0.0722 * transform(parsed.b)
}

const getContrastRatio = (foreground: string, background: string): number => {
  const luminanceA = getRelativeLuminance(foreground)
  const luminanceB = getRelativeLuminance(background)
  const [lighter, darker] = luminanceA > luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA]
  return (lighter + 0.05) / (darker + 0.05)
}

const getHueDistance = (a: number, b: number): number => {
  const distance = Math.abs(normalizeHue(a) - normalizeHue(b))
  return Math.min(distance, 360 - distance)
}

/** 保持色相不变,沿明度轴把颜色推出对比度下限(上游 adjustLightnessForContrast)。 */
const adjustLightnessForContrast = (color: string, background: string, minRatio: number): string => {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  const goDarker = getRelativeLuminance(background) > 0.35
  const direction = goDarker ? -1 : 1
  let bestColor = hslToHex(hsl)
  let bestRatio = getContrastRatio(bestColor, background)
  for (let index = 0; index <= 50; index += 1) {
    const lightness = clamp01(hsl.l + direction * 0.02 * index)
    const candidate = hslToHex({ ...hsl, l: lightness })
    const ratio = getContrastRatio(candidate, background)
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestColor = candidate
    }
    if (ratio >= minRatio) return candidate
    if (index > 0 && (lightness === 0 || lightness === 1)) break
  }
  return bestColor
}

/* ===================== 封面主色提取(上游 colorPalette,加权 median-cut) ===================== */

interface WeightedColor {
  r: number
  g: number
  b: number
  weight: number
}

interface ColorBucket {
  colors: WeightedColor[]
  weight: number
}

const QUANTIZATION_SHIFT = 4
const MIN_ALPHA = 128

const getChannelRange = (colors: WeightedColor[], channel: 'r' | 'g' | 'b'): number => {
  let min = 255
  let max = 0
  for (const color of colors) {
    min = Math.min(min, color[channel])
    max = Math.max(max, color[channel])
  }
  return max - min
}

const splitBucket = (bucket: ColorBucket): [ColorBucket, ColorBucket] | null => {
  if (bucket.colors.length < 2) return null
  const ranges = {
    r: getChannelRange(bucket.colors, 'r'),
    g: getChannelRange(bucket.colors, 'g'),
    b: getChannelRange(bucket.colors, 'b')
  }
  const channel = (Object.keys(ranges) as Array<keyof typeof ranges>).reduce(
    (widest, candidate) => (ranges[candidate] > ranges[widest] ? candidate : widest),
    'r' as keyof typeof ranges
  )
  const sorted = [...bucket.colors].sort((a, b) => a[channel] - b[channel])
  const midpoint = bucket.weight / 2
  let accumulatedWeight = 0
  let splitIndex = 1
  for (let index = 0; index < sorted.length - 1; index += 1) {
    accumulatedWeight += sorted[index].weight
    splitIndex = index + 1
    if (accumulatedWeight >= midpoint) break
  }
  const left = sorted.slice(0, splitIndex)
  const right = sorted.slice(splitIndex)
  return [
    { colors: left, weight: left.reduce((sum, color) => sum + color.weight, 0) },
    { colors: right, weight: right.reduce((sum, color) => sum + color.weight, 0) }
  ]
}

const averageBucket = (bucket: ColorBucket): WeightedColor => {
  const totals = bucket.colors.reduce(
    (result, color) => ({
      r: result.r + color.r * color.weight,
      g: result.g + color.g * color.weight,
      b: result.b + color.b * color.weight
    }),
    { r: 0, g: 0, b: 0 }
  )
  return {
    r: Math.round(totals.r / bucket.weight),
    g: Math.round(totals.g / bucket.weight),
    b: Math.round(totals.b / bucket.weight),
    weight: bucket.weight
  }
}

const toHex = ({ r, g, b }: WeightedColor): string =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

export const extractRepresentativeColorsFromPixels = (
  pixels: Uint8ClampedArray,
  count = 5
): string[] => {
  if (count <= 0) return []
  const histogram = new Map<number, WeightedColor>()
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < MIN_ALPHA) continue
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const key =
      ((r >> QUANTIZATION_SHIFT) << 8) | ((g >> QUANTIZATION_SHIFT) << 4) | (b >> QUANTIZATION_SHIFT)
    const existing = histogram.get(key)
    if (existing) {
      existing.r += r
      existing.g += g
      existing.b += b
      existing.weight += 1
    } else {
      histogram.set(key, { r, g, b, weight: 1 })
    }
  }
  const colors = [...histogram.values()].map((color) => ({
    r: Math.round(color.r / color.weight),
    g: Math.round(color.g / color.weight),
    b: Math.round(color.b / color.weight),
    weight: color.weight
  }))
  if (colors.length === 0) return []
  const buckets: ColorBucket[] = [
    { colors, weight: colors.reduce((sum, color) => sum + color.weight, 0) }
  ]
  while (buckets.length < Math.min(count, colors.length)) {
    let bucketIndex = -1
    let bestScore = -1
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index]
      if (bucket.colors.length < 2) continue
      const widestRange = Math.max(
        getChannelRange(bucket.colors, 'r'),
        getChannelRange(bucket.colors, 'g'),
        getChannelRange(bucket.colors, 'b')
      )
      const score = widestRange * Math.sqrt(bucket.weight)
      if (score > bestScore) {
        bestScore = score
        bucketIndex = index
      }
    }
    if (bucketIndex < 0) break
    const split = splitBucket(buckets[bucketIndex])
    if (!split) break
    buckets.splice(bucketIndex, 1, ...split)
  }
  return buckets.map(averageBucket).sort((a, b) => b.weight - a.weight).map(toHex)
}

/* ===================== 色相骨架(上游 coverPaletteAnalysis) ===================== */

type HarmonyScheme = 'analogous' | 'complementary' | 'split' | 'triadic' | 'duotone' | 'monochrome'
type PaletteTone = 'ink' | 'tinted' | 'rich'

export type CoverPalette = {
  baseHue: number
  baseSaturation: number
  baseLightness: number
  accentHue: number
  scheme: HarmonyScheme
  tone: PaletteTone
}

const MIN_SUPPORT_SATURATION = 0.15
const MIN_SUPPORT_HUE_DISTANCE = 25
const MAX_SUPPORT_HUE_DISTANCE = 160
const MONOCHROME_SATURATION_CEILING = 0.18

/** 饱和且中等明度的颜色才携带封面特征;近黑/近白只是背景。 */
const getCoverColorScore = ({ s, l }: Hsl): number => s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.2)

const pickWeighted = <T>(random: () => number, entries: { value: T; weight: number }[]): T => {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = random() * total
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.value
  }
  return entries[entries.length - 1].value
}

const pickBaseColor = (parsedColors: Hsl[], random: () => number): Hsl => {
  if (parsedColors.length === 0) {
    return { h: random() * 360, s: 0.35 + random() * 0.3, l: 0.5 }
  }
  const scored = parsedColors.reduce(
    (best, candidate) => (getCoverColorScore(candidate) > getCoverColorScore(best) ? candidate : best),
    parsedColors[0]
  )
  return getCoverColorScore(scored) > 0.02 ? scored : parsedColors[0]
}

const pickSupportHue = (parsedColors: Hsl[], base: Hsl): number | null => {
  const support = parsedColors.find((candidate) => {
    if (candidate.s < MIN_SUPPORT_SATURATION) return false
    const distance = getHueDistance(candidate.h, base.h)
    return distance >= MIN_SUPPORT_HUE_DISTANCE && distance <= MAX_SUPPORT_HUE_DISTANCE
  })
  return support ? support.h : null
}

const pickScheme = (
  baseSaturation: number,
  supportHue: number | null,
  random: () => number
): HarmonyScheme => {
  if (supportHue !== null && random() < 0.65) return 'duotone'
  return pickWeighted<HarmonyScheme>(random, [
    { value: 'analogous', weight: 3 },
    { value: 'complementary', weight: 2 },
    { value: 'split', weight: 2 },
    { value: 'triadic', weight: 1.5 },
    { value: 'monochrome', weight: baseSaturation < MONOCHROME_SATURATION_CEILING ? 2.5 : 0 }
  ])
}

const resolveAccentHue = (
  scheme: HarmonyScheme,
  baseHue: number,
  supportHue: number | null,
  random: () => number
): number => {
  const sign = random() < 0.5 ? -1 : 1
  switch (scheme) {
    case 'duotone':
      return supportHue ?? baseHue
    case 'analogous':
      return baseHue + sign * (20 + random() * 15)
    case 'complementary':
      return baseHue + 150 + random() * 30
    case 'split':
      return baseHue + (sign < 0 ? 150 : 210)
    case 'triadic':
      return baseHue + sign * 120
    case 'monochrome':
    default:
      return baseHue
  }
}

export const analyzeCoverPalette = (coverColors: string[], random: () => number): CoverPalette => {
  const parsedColors = coverColors.map((color) => hexToHsl(color)).filter((color): color is Hsl => color !== null)
  const base = pickBaseColor(parsedColors, random)
  const supportHue = pickSupportHue(parsedColors, base)
  const scheme = pickScheme(base.s, supportHue, random)
  const accentJitter = scheme === 'monochrome' ? 0 : (random() - 0.5) * 16
  return {
    baseHue: normalizeHue(base.h),
    baseSaturation: base.s,
    baseLightness: base.l,
    accentHue: normalizeHue(resolveAccentHue(scheme, base.h, supportHue, random) + accentJitter),
    scheme,
    tone: pickWeighted<PaletteTone>(random, [
      { value: 'ink', weight: 3 },
      { value: 'tinted', weight: 4 },
      { value: 'rich', weight: 2.5 }
    ])
  }
}

/* ===================== 主题生成(上游 themeColorRanges + generateBuiltinDualTheme) ===================== */

type ThemeMode = 'light' | 'dark'
type Range = [number, number]

interface BackgroundTone {
  darkLightness: Range
  darkSaturation: Range
  lightLightness: Range
  lightSaturation: Range
}

const PRIMARY_MIN_CONTRAST = 9
const ACCENT_MIN_CONTRAST = 3.2
const SECONDARY_MIN_CONTRAST = 4.5
const MIN_BACKGROUND_SATURATION = 0.04

const BACKGROUND_TONES: Record<PaletteTone, BackgroundTone> = {
  ink: {
    darkLightness: [0.055, 0.085],
    darkSaturation: [0.1, 0.22],
    lightLightness: [0.94, 0.965],
    lightSaturation: [0.05, 0.12]
  },
  tinted: {
    darkLightness: [0.075, 0.11],
    darkSaturation: [0.2, 0.36],
    lightLightness: [0.92, 0.95],
    lightSaturation: [0.1, 0.2]
  },
  rich: {
    darkLightness: [0.095, 0.14],
    darkSaturation: [0.32, 0.5],
    lightLightness: [0.9, 0.935],
    lightSaturation: [0.18, 0.3]
  }
}

const PRIMARY_RANGES: Record<ThemeMode, { saturation: Range; lightness: Range }> = {
  light: { saturation: [0.15, 0.4], lightness: [0.1, 0.2] },
  dark: { saturation: [0.1, 0.3], lightness: [0.9, 0.96] }
}

const ACCENT_RANGES: Record<ThemeMode, { saturation: Range; lightness: Range }> = {
  light: { saturation: [0.55, 0.88], lightness: [0.38, 0.55] },
  dark: { saturation: [0.55, 0.92], lightness: [0.55, 0.72] }
}

const SECONDARY_RANGES: Record<ThemeMode, { saturation: Range; lightness: Range }> = {
  light: { saturation: [0.15, 0.45], lightness: [0.32, 0.46] },
  dark: { saturation: [0.15, 0.45], lightness: [0.62, 0.76] }
}

const between = (random: () => number, [min, max]: Range): number => min + random() * (max - min)

const lerpHue = (from: number, to: number, amount: number): number => {
  const delta = ((to - from + 540) % 360) - 180
  return normalizeHue(from + delta * amount)
}

const buildBackgroundColor = (mode: ThemeMode, palette: CoverPalette, random: () => number): string => {
  const tone = BACKGROUND_TONES[palette.tone]
  const lightnessRange = mode === 'dark' ? tone.darkLightness : tone.lightLightness
  const saturationRange = mode === 'dark' ? tone.darkSaturation : tone.lightSaturation
  const coverWeight = 0.55 + 0.45 * clamp01(palette.baseSaturation / 0.7)
  return hslToHex({
    h: palette.baseHue,
    s: Math.max(MIN_BACKGROUND_SATURATION, between(random, saturationRange) * coverWeight),
    l: between(random, lightnessRange)
  })
}

interface BuiltColors {
  backgroundColor: string
  primaryColor: string
  accentColor: string
  secondaryColor: string
}

const buildModeColors = (mode: ThemeMode, palette: CoverPalette, random: () => number): BuiltColors => {
  const backgroundColor = buildBackgroundColor(mode, palette, random)

  const primaryRanges = PRIMARY_RANGES[mode]
  const primaryColor = adjustLightnessForContrast(
    hslToHex({
      h: palette.baseHue,
      s: between(random, primaryRanges.saturation),
      l: between(random, primaryRanges.lightness)
    }),
    backgroundColor,
    PRIMARY_MIN_CONTRAST
  )

  const accentRanges = ACCENT_RANGES[mode]
  const accentSaturation = between(random, accentRanges.saturation)
  const accentLightness = between(random, accentRanges.lightness)
  const accent = adjustLightnessForContrast(
    hslToHex({ h: palette.accentHue, s: accentSaturation, l: accentLightness }),
    backgroundColor,
    ACCENT_MIN_CONTRAST
  )
  // 单色/邻近色 accent 可能撞上主文字色:把色相转开 40°。
  const collidesWithPrimary =
    getHueDistance(palette.accentHue, palette.baseHue) < 15 && getContrastRatio(accent, primaryColor) < 1.3
  const accentColor = collidesWithPrimary
    ? adjustLightnessForContrast(
      hslToHex({ h: normalizeHue(palette.accentHue + 40), s: accentSaturation, l: accentLightness }),
      backgroundColor,
      ACCENT_MIN_CONTRAST
    )
    : accent

  const secondaryRanges = SECONDARY_RANGES[mode]
  const secondaryColor = adjustLightnessForContrast(
    hslToHex({
      h: lerpHue(palette.baseHue, palette.accentHue, 0.2 + random() * 0.4),
      s: between(random, secondaryRanges.saturation),
      l: between(random, secondaryRanges.lightness)
    }),
    backgroundColor,
    SECONDARY_MIN_CONTRAST
  )

  return { backgroundColor, primaryColor, accentColor, secondaryColor }
}

/** 由封面主色生成一套(暗色)主题颜色;没有封面时退化为中性深色。 */
export const generateThemeFromCover = (coverColors: string[], isDark: boolean): BuiltColors | null => {
  if (!coverColors || coverColors.length === 0) return null
  const random = Math.random
  const palette = analyzeCoverPalette(coverColors, random)
  return buildModeColors(isDark ? 'dark' : 'light', palette, random)
}

/* ===================== 封面图片加载 + 缓存 ===================== */

const paletteCache = new Map<string, string[]>()
const inflight = new Map<string, Promise<string[] | null>>()
const MAX_COVER_SAMPLE = 64

/** 读取封面图片(项目内 bmedia:// 代理或任意 URL),缩到 MAX_COVER_SAMPLE 后提取主色。 */
export const loadCoverColors = async (coverUrl: string): Promise<string[] | null> => {
  const cached = paletteCache.get(coverUrl)
  if (cached) return cached
  const running = inflight.get(coverUrl)
  if (running) return running

  const task = (async (): Promise<string[] | null> => {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('cover load failed'))
        img.src = coverUrl
      })
      const size = Math.min(image.naturalWidth, image.naturalHeight, MAX_COVER_SAMPLE * 4)
      const canvas = document.createElement('canvas')
      canvas.width = MAX_COVER_SAMPLE
      canvas.height = MAX_COVER_SAMPLE
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      // 居中裁方,避免长封面把主色算偏
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      const sx = (image.naturalWidth - side) / 2
      const sy = (image.naturalHeight - side) / 2
      ctx.drawImage(image, sx, sy, side, side, 0, 0, canvas.width, canvas.height)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const colors = extractRepresentativeColorsFromPixels(data.data, 5)
      if (colors.length > 0) paletteCache.set(coverUrl, colors)
      return colors.length > 0 ? colors : null
    } catch {
      return null
    } finally {
      inflight.delete(coverUrl)
    }
  })()
  inflight.set(coverUrl, task)
  return task
}

/** 忽略缓存强制重取(换歌同 URL 参数变化时不需要,这里只在首次加载失败后重试用)。 */
export const peekCoverColors = (coverUrl: string): string[] | undefined => paletteCache.get(coverUrl)

/**
 * 把封面生成色并进基础主题。
 * - backgroundColor/primaryColor/secondaryColor/accentColor 全部由封面推导;
 * - accentColor 混入 22% 用户主题色,保证和 App 主题不脱节;
 * - 拿不到封面时返回 null(调用方继续用基础主题)。
 */
export const applyCoverTheme = (
  base: FoliaTheme,
  coverColors: string[] | null
): FoliaTheme => {
  if (!coverColors || coverColors.length === 0) return base
  const isDark = getRelativeLuminance(base.backgroundColor) < 0.5
  const generated = generateThemeFromCover(coverColors, isDark)
  if (!generated) return base
  const mixInto = (from: string, to: string, amount: number): string => {
    const a = parseThemeColor(from)
    const b = parseThemeColor(to)
    if (!a || !b) return to
    return rgbToHex({
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    })
  }
  return {
    ...base,
    name: `${base.name} · 封面`,
    backgroundColor: generated.backgroundColor,
    primaryColor: generated.primaryColor,
    secondaryColor: generated.secondaryColor,
    accentColor: mixInto(generated.accentColor, base.accentColor, 0.22)
  }
}
