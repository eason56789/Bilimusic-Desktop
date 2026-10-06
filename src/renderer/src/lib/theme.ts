import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

export const ACCENTS: { name: string; color: string }[] = [
  { name: '默认蓝', color: '#0f6cbd' },
  { name: '紫罗兰', color: '#6b69d6' },
  { name: '粉红', color: '#c239b3' },
  { name: '绯红', color: '#c4314b' },
  { name: '青绿', color: '#038387' },
  { name: '草绿', color: '#13a10e' },
  { name: '橙黄', color: '#f7630c' }
]

function shade(hex: string, amount: number): string {
  const n = hex.replace('#', '')
  const num = parseInt(n, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.min(255, Math.max(0, Math.round(r + 255 * amount)))
  g = Math.min(255, Math.max(0, Math.round(g + 255 * amount)))
  b = Math.min(255, Math.max(0, Math.round(b + 255 * amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 基于内置主题浅合并品牌色 token(避免依赖未导出的 createTheme) */
export function buildTheme(dark: boolean, accent: string): Theme {
  const base = dark ? webDarkTheme : webLightTheme
  if (!accent || accent.toLowerCase() === '#0f6cbd') return base
  return {
    ...base,
    colorBrandBackground: accent,
    colorBrandBackgroundHover: shade(accent, 0.08),
    colorBrandBackgroundPressed: shade(accent, -0.08),
    colorBrandBackgroundSelected: shade(accent, -0.05),
    colorBrandForeground1: accent,
    colorBrandForeground2: shade(accent, 0.12),
    colorBrandForegroundLink: accent,
    colorBrandForegroundLinkHover: shade(accent, 0.12),
    colorBrandForegroundLinkPressed: shade(accent, -0.05),
    colorBrandForegroundOnLight: accent,
    colorBrandStroke1: accent,
    colorBrandStroke2: shade(accent, 0.12),
    colorBrandStroke2Hover: shade(accent, 0.2),
    colorBrandStroke2Pressed: shade(accent, -0.05)
  } as Theme
}
