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

// ===== 颜色工具(MD3 色调表面用) =====

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace('#', '')
  const num = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16)
  const r = ((num >> 16) & 0xff) / 255
  const g = ((num >> 8) & 0xff) / 255
  const b = (num & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

/** HSL → hex:h 0-360,s/l 0-1 */
function hsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * MD3 色调表面:把表面色向品牌色相轻微偏移(very low saturation),
 * 得到 Material 3 那种"染色中性色",而不是纯灰。
 */
function tonalSurface(accentHex: string, dark: boolean, level: number): string {
  const { h } = hexToHsl(accentHex)
  const hue = isFinite(h) ? h : 220
  if (dark) {
    // 深色:亮度 9% → 26%,饱和度随亮度略升(MD3 深色表面)
    const l = 0.09 + level * 0.042
    const s = 0.08 + level * 0.035
    return hsl(hue, s, l)
  }
  // 浅色:亮度 99% → 87%
  const l = 0.99 - level * 0.028
  const s = 0.1 + level * 0.04
  return hsl(hue, s, l)
}

/** MD3 品牌色组(基于 accent 派生 primary / container 语义色) */
function md3BrandTokens(accent: string, dark: boolean): Partial<Theme> {
  const { h, s } = hexToHsl(accent)
  const hue = isFinite(h) ? h : 220
  const sat = Math.max(0.35, Math.min(0.9, s))
  const primary = accent
  // onPrimary:按亮度选白/黑(阈值 0.6)
  const onPrimary = hexToHsl(accent).l > 0.6 ? hsl(hue, 0.4, 0.12) : '#ffffff'
  const containerL = dark ? 0.28 : 0.9
  const onContainerL = dark ? 0.92 : 0.18
  return {
    colorBrandBackground: primary,
    colorBrandBackgroundHover: shade(primary, dark ? 0.1 : 0.06),
    colorBrandBackgroundPressed: shade(primary, -0.08),
    colorBrandBackgroundSelected: shade(primary, -0.05),
    colorBrandBackground2: hsl(hue, sat * 0.5, containerL),
    colorBrandForeground1: dark ? hsl(hue, sat, 0.78) : hsl(hue, sat, 0.4),
    colorBrandForeground2: dark ? hsl(hue, sat, 0.85) : hsl(hue, sat, 0.32),
    colorBrandForegroundLink: dark ? hsl(hue, sat, 0.75) : hsl(hue, sat, 0.42),
    colorBrandForegroundLinkHover: dark ? hsl(hue, sat, 0.85) : hsl(hue, sat, 0.36),
    colorBrandForegroundLinkPressed: dark ? hsl(hue, sat, 0.65) : hsl(hue, sat, 0.5),
    colorBrandForegroundOnLight: dark ? hsl(hue, sat, 0.75) : hsl(hue, sat, 0.4),
    colorBrandStroke1: dark ? hsl(hue, sat, 0.7) : hsl(hue, sat, 0.45),
    colorBrandStroke2: hsl(hue, sat * 0.5, containerL),
    colorBrandStroke2Hover: hsl(hue, sat * 0.6, dark ? containerL + 0.06 : containerL - 0.06),
    colorBrandStroke2Pressed: hsl(hue, sat * 0.55, dark ? containerL - 0.05 : containerL + 0.05),
    // 前景/强调(用于文字按钮)
    colorCompoundBrandBackground: primary,
    colorCompoundBrandBackgroundHover: shade(primary, dark ? 0.1 : 0.06),
    colorCompoundBrandBackgroundPressed: shade(primary, -0.08),
    colorCompoundBrandStroke: primary,
    colorCompoundBrandStrokeHover: shade(primary, dark ? 0.1 : 0.06),
    colorCompoundBrandStrokePressed: shade(primary, -0.08),
    colorCompoundBrandForeground1: dark ? hsl(hue, sat, 0.78) : hsl(hue, sat, 0.4),
    colorCompoundBrandForeground1Hover: dark ? hsl(hue, sat, 0.86) : hsl(hue, sat, 0.34),
    colorCompoundBrandForeground1Pressed: dark ? hsl(hue, sat, 0.68) : hsl(hue, sat, 0.48),
    // 焦点环
    colorStrokeFocus2: primary,
    // selected 背景(Tab/列表选中)
    colorNeutralBackground1Selected: hsl(hue, sat * 0.42, dark ? 0.3 : 0.88),
    colorNeutralBackground2Selected: hsl(hue, sat * 0.42, dark ? 0.32 : 0.86),
    colorNeutralBackground3Selected: hsl(hue, sat * 0.4, dark ? 0.34 : 0.88),
    colorNeutralBackground4Selected: hsl(hue, sat * 0.4, dark ? 0.36 : 0.9),
    colorSubtleBackgroundSelected: hsl(hue, sat * 0.4, dark ? 0.32 : 0.88),
    colorSubtleBackgroundHover: hsl(hue, sat * 0.3, dark ? 0.22 : 0.94),
    colorSubtleBackgroundPressed: hsl(hue, sat * 0.3, dark ? 0.26 : 0.9),
    // onPrimary 供 filled 按钮文字(MD3 filled = primary 底 + onPrimary 字)
    colorNeutralForegroundOnBrand: onPrimary,
    colorNeutralForegroundInverted: dark ? '#111111' : '#ffffff'
  } as Partial<Theme>
}

/** MD3 Expressive token 覆盖:大圆角 + 染色表面 + 柔和 elevation */
function md3Tokens(base: Theme, accent: string, dark: boolean): Theme {
  const surfaces: Record<string, string> = {
    colorNeutralBackground1: tonalSurface(accent, dark, 0),
    colorNeutralBackground2: tonalSurface(accent, dark, 1),
    colorNeutralBackground3: tonalSurface(accent, dark, 2),
    colorNeutralBackground4: tonalSurface(accent, dark, 3),
    colorNeutralBackground5: tonalSurface(accent, dark, 4),
    colorNeutralBackground6: tonalSurface(accent, dark, 5),
    // 半透明/静态背景
    colorNeutralBackgroundStatic: dark ? tonalSurface(accent, true, 2) : tonalSurface(accent, false, 9),
    colorNeutralBackgroundAlpha: dark ? 'rgba(20,20,24,0.5)' : 'rgba(255,255,255,0.5)',
    // 描边向"轮廓色"靠拢(MD3 outline = 中性带色调)
    colorNeutralStroke1: dark ? tonalSurface(accent, true, 7) : tonalSurface(accent, false, 7),
    colorNeutralStroke2: dark ? tonalSurface(accent, true, 5) : tonalSurface(accent, false, 5),
    colorNeutralStroke3: dark ? tonalSurface(accent, true, 4) : tonalSurface(accent, false, 4),
    colorNeutralStrokeAccessible: dark ? tonalSurface(accent, true, 8) : tonalSurface(accent, false, 8),
    colorNeutralStroke1Hover: dark ? tonalSurface(accent, true, 8) : tonalSurface(accent, false, 8)
  }
  return {
    ...base,
    ...md3BrandTokens(accent, dark),
    ...surfaces,
    // ===== MD3 形状系统:显著更大的圆角 =====
    borderRadiusSmall: '8px',
    borderRadiusMedium: '12px',
    borderRadiusLarge: '16px',
    borderRadiusXLarge: '28px',
    borderRadiusCircular: '9999px',
    // ===== elevation:MD3 阴影更柔、更大扩散 =====
    shadow2: '0 1px 2px rgba(0,0,0,0.16), 0 1px 3px 1px rgba(0,0,0,0.09)',
    shadow4: '0 1px 2px rgba(0,0,0,0.16), 0 2px 6px 2px rgba(0,0,0,0.1)',
    shadow8: '0 4px 8px 3px rgba(0,0,0,0.11), 0 1px 3px rgba(0,0,0,0.16)',
    shadow16: '0 6px 10px 4px rgba(0,0,0,0.11), 0 2px 3px rgba(0,0,0,0.16)',
    shadow28: '0 10px 14px 6px rgba(0,0,0,0.11), 0 4px 8px rgba(0,0,0,0.16)',
    shadow64: '0 16px 24px 8px rgba(0,0,0,0.12), 0 8px 12px rgba(0,0,0,0.18)'
  } as Theme
}

/**
 * 主题构建:经典 Fluent / Material 3 Expressive。
 * md3 时在 Fluent token 基础上覆盖形状/色调/品牌色,再由 buildMd3PresetCss 补组件级造型。
 */
export function buildTheme(dark: boolean, accent: string, uiStyle: 'fluent' | 'md3' = 'fluent'): Theme {
  const base = dark ? webDarkTheme : webLightTheme
  const a = accent || '#0f6cbd'
  if (uiStyle === 'md3') return md3Tokens(base, a, dark)
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

/**
 * MD3 组件级造型 CSS(配合 .md3-ui 类使用):
 * 药丸按钮 / 大圆角窗体 / 弹性交互 / 染色滚动条等。
 */
export function buildMd3PresetCss(): string {
  return `
/* ===== Material 3 Expressive 造型层(仅 .md3-ui 下生效) ===== */
.md3-ui .fui-Button {
  border-radius: 9999px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: transform .18s cubic-bezier(.2,0,0,1), box-shadow .18s cubic-bezier(.2,0,0,1), background-color .15s ease;
}
.md3-ui .fui-Button:not([disabled]):active { transform: scale(.96); }
.md3-ui .fui-Button[shape="circular"] { border-radius: 9999px; }
.md3-ui .fui-Tab {
  border-radius: 9999px;
  transition: background-color .18s cubic-bezier(.2,0,0,1);
}
/* MD3 二级标签:选中态 = 药丸填充(隐藏 Fluent 下划线指示器) */
.md3-ui .fui-Tab::after { display: none; }
.md3-ui .fui-Tab[aria-selected="true"] {
  background: var(--colorNeutralBackground1Selected, rgba(15,108,189,0.14));
  font-weight: 600;
}
.md3-ui .fui-Tab[aria-selected="true"]:hover {
  background: var(--colorNeutralBackground1Selected, rgba(15,108,189,0.14));
}
.md3-ui .fui-Tab:not([aria-selected="true"]):hover {
  background: var(--colorSubtleBackgroundHover, rgba(128,128,128,0.12));
}
.md3-ui .fui-TabList[aria-orientation="vertical"] .fui-Tab { min-height: 40px; }
.md3-ui .fui-DialogSurface { border-radius: 28px; }
.md3-ui .fui-MenuPopover { border-radius: 16px; padding: 6px; }
.md3-ui .fui-MenuItem { border-radius: 10px; }
.md3-ui .fui-Card { border-radius: 20px; }
.md3-ui .fui-Input, .md3-ui .fui-Dropdown, .md3-ui .fui-Combobox {
  border-radius: 9999px;
}
.md3-ui .fui-Textarea, .md3-ui .fui-Field .fui-Textarea { border-radius: 20px; }
.md3-ui .fui-ProgressBar .fui-ProgressBar__bar, .md3-ui .fui-ProgressBar__bar { border-radius: 9999px; }
.md3-ui .fui-Slider__rail { border-radius: 9999px; }
.md3-ui .fui-Spinner { color: var(--colorBrandForeground1); }
.md3-ui .fui-Toast { border-radius: 16px; }
.md3-ui .fui-Tooltip { border-radius: 8px; }
.md3-ui .fui-Persona { border-radius: 16px; }
.md3-ui .fui-Divider { opacity: .7; }
/* 列表行/卡片悬停的弹性反馈 */
.md3-ui .song-row { border-radius: 14px; transition: background-color .15s ease, transform .18s cubic-bezier(.2,0,0,1); }
.md3-ui .song-row:hover { transform: translateX(2px); }
/* 滚动条染成品牌色调 */
.md3-ui ::-webkit-scrollbar-thumb { border-radius: 9999px; }
`.trim()
}
