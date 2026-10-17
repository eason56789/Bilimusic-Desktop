/**
 * 主题入口:经典 Fluent / Material 3 Expressive 两套。
 *
 * - fluent:沿用 Fluent 官方 webLightTheme / webDarkTheme(仅按主题色改品牌色)
 * - md3:交给 ./ui/md3/theme.ts 产出**完整的** M3 主题(459 个 Fluent token
 *   全部由 M3 色彩角色/字阶/形状/海拔/动效派生),组件造型层见 ./ui/md3/components.ts
 */
import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'
import { buildM3Theme, DEFAULT_M3_VARIANT } from '../ui/md3/theme'
import type { M3Variant } from '../ui/md3/tokens'

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

/**
 * 构建 FluentProvider 主题。
 * md3 模式下返回的是从 M3 色彩角色完整派生的主题对象(不是"改几个圆角")。
 */
export function buildTheme(
  dark: boolean,
  accent: string,
  uiStyle: 'fluent' | 'md3' = 'fluent',
  variant: M3Variant = DEFAULT_M3_VARIANT,
  contrast = 0
): Theme {
  const base = dark ? webDarkTheme : webLightTheme
  const a = accent || '#0f6cbd'
  if (uiStyle === 'md3') return buildM3Theme(dark, a, variant, contrast).theme
  if (a.toLowerCase() === '#0f6cbd') return base
  return {
    ...base,
    colorBrandBackground: a,
    colorBrandBackgroundHover: shade(a, 0.08),
    colorBrandBackgroundPressed: shade(a, -0.08),
    colorBrandBackgroundSelected: shade(a, -0.05),
    colorBrandForeground1: a,
    colorBrandForeground2: shade(a, 0.12),
    colorBrandForegroundLink: a,
    colorBrandForegroundLinkHover: shade(a, 0.12),
    colorBrandForegroundLinkPressed: shade(a, -0.05),
    colorBrandForegroundOnLight: a,
    colorBrandStroke1: a,
    colorBrandStroke2: shade(a, 0.12),
    colorBrandStroke2Hover: shade(a, 0.2),
    colorBrandStroke2Pressed: shade(a, -0.05)
  } as Theme
}
