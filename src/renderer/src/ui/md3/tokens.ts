/**
 * Material Design 3 设计令牌(HCT 动态色彩系统)
 *
 * 取色链路与 Google M3 一致:源色 → HCT → 色调板(TonalPalette) → 色彩角色(MaterialDynamicColors)。
 * 产出的 --md-sys-color-* 与 Material Theme Builder / Android 端同名同值。
 */
import {
  Hct,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
  hexFromArgb,
  type DynamicScheme
} from '@material/material-color-utilities'

/** M3 配色变体(Material You 的 scheme variant) */
export type M3Variant =
  | 'expressive'
  | 'tonalSpot'
  | 'vibrant'
  | 'neutral'
  | 'monochrome'
  | 'rainbow'
  | 'fruitSalad'
  | 'content'
  | 'fidelity'

export const M3_VARIANTS: { value: M3Variant; label: string }[] = [
  { value: 'tonalSpot', label: '色调点(标准)' },
  { value: 'expressive', label: '表达性' },
  { value: 'vibrant', label: '鲜明' },
  { value: 'neutral', label: '中性' },
  { value: 'monochrome', label: '单色' },
  { value: 'rainbow', label: '彩虹' },
  { value: 'fruitSalad', label: '果味沙拉' },
  { value: 'content', label: '内容' },
  { value: 'fidelity', label: '高保真' }
]

/** 默认变体。
 *  刻意不用 expressive:该方案的调色板把色相旋转 +240°(见 material-color-utilities 的
 *  DynamicScheme 实现),浅蓝种子会产出**绿色**主色 —— 用户选「默认蓝」却得到一套绿 UI,
 *  观感割裂且与主题色控件自相矛盾。tonalSpot 是 Material You 的规范默认,
 *  保留种子色相,选什么色就是什么色的界面。 */
export const DEFAULT_M3_VARIANT: M3Variant = 'tonalSpot'

type SchemeCtor = new (hct: Hct, dark: boolean, contrast: number) => DynamicScheme

const SCHEMES: Record<M3Variant, SchemeCtor> = {
  expressive: SchemeExpressive,
  tonalSpot: SchemeTonalSpot,
  vibrant: SchemeVibrant,
  neutral: SchemeNeutral,
  monochrome: SchemeMonochrome,
  rainbow: SchemeRainbow,
  fruitSalad: SchemeFruitSalad,
  content: SchemeContent,
  fidelity: SchemeFidelity
}

/** 规范定义的色彩角色(取色一律走 DynamicScheme getter,故为规范色调值) */
const ROLE_GETTERS = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'primaryFixed',
  'primaryFixedDim',
  'onPrimaryFixed',
  'onPrimaryFixedVariant',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'onSurface',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'surfaceVariant',
  'onSurfaceVariant',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'outline',
  'outlineVariant',
  'scrim',
  'shadow',
  'surfaceTint'
] as const

export type M3Role = (typeof ROLE_GETTERS)[number] | 'success' | 'onSuccess' | 'warning' | 'onWarning'

export type M3Roles = Record<M3Role, string>

/** 源色解析:#rgb / #rrggbb,非法回退默认蓝 */
export function parseSeed(accent: string): number {
  const hex = (accent || '#0f6cbd').replace('#', '').trim()
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex.padEnd(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  return Number.isFinite(n) ? (n | 0xff000000) >>> 0 : 0xff0f6cbd
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * 生成 M3 色彩角色表。
 * @param dark 深色模式
 * @param accent 源色(seed)
 * @param variant 配色变体,默认 tonalSpot(见 DEFAULT_M3_VARIANT)
 * @param contrast -1 ~ 1(标准 0)
 */
export function m3Roles(
  dark: boolean,
  accent: string,
  variant: M3Variant = DEFAULT_M3_VARIANT,
  contrast = 0
): M3Roles {
  const Scheme = SCHEMES[variant] ?? SchemeTonalSpot
  const scheme = new Scheme(Hct.fromInt(parseSeed(accent)), dark, clamp(contrast, -1, 1))
  const out = {} as Record<string, string>
  for (const role of ROLE_GETTERS) {
    const argb = (scheme as unknown as Record<string, unknown>)[role]
    out[role] = typeof argb === 'number' ? hexFromArgb(argb) : '#000000'
  }
  // M3 规范无 success/warning 角色,按同色调板补语义色(与 M3 色调 40/80 对齐)
  out.success = dark ? '#6dd58c' : '#146c2e'
  out.onSuccess = dark ? '#00391c' : '#ffffff'
  out.warning = dark ? '#f5bd4c' : '#7a5900'
  out.onWarning = dark ? '#402d00' : '#ffffff'
  return out as M3Roles
}

/** 角色名 → CSS 变量名(onPrimaryContainer → --md-sys-color-on-primary-container) */
export function roleVar(role: string): string {
  return `--md-sys-color-${role.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
}

/** 源色色相(调试/派生用) */
export function m3Hue(accent: string): number {
  return Math.round(Hct.fromInt(parseSeed(accent)).hue)
}

/* ==================== 字阶(材料规范数值) ==================== */

export const M3_TYPE = {
  'display-large': { fontSize: 57, lineHeight: 64, weight: 400, tracking: -0.25 },
  'display-medium': { fontSize: 45, lineHeight: 52, weight: 400, tracking: 0 },
  'display-small': { fontSize: 36, lineHeight: 44, weight: 400, tracking: 0 },
  'headline-large': { fontSize: 32, lineHeight: 40, weight: 400, tracking: 0 },
  'headline-medium': { fontSize: 28, lineHeight: 36, weight: 400, tracking: 0 },
  'headline-small': { fontSize: 24, lineHeight: 32, weight: 400, tracking: 0 },
  'title-large': { fontSize: 22, lineHeight: 28, weight: 500, tracking: 0 },
  'title-medium': { fontSize: 16, lineHeight: 24, weight: 500, tracking: 0.15 },
  'title-small': { fontSize: 14, lineHeight: 20, weight: 500, tracking: 0.1 },
  'body-large': { fontSize: 16, lineHeight: 24, weight: 400, tracking: 0.5 },
  'body-medium': { fontSize: 14, lineHeight: 20, weight: 400, tracking: 0.25 },
  'body-small': { fontSize: 12, lineHeight: 16, weight: 400, tracking: 0.4 },
  'label-large': { fontSize: 14, lineHeight: 20, weight: 500, tracking: 0.1 },
  'label-medium': { fontSize: 12, lineHeight: 16, weight: 500, tracking: 0.5 },
  'label-small': { fontSize: 11, lineHeight: 16, weight: 500, tracking: 0.5 }
} as const

export type M3TypeRole = keyof typeof M3_TYPE

/** 应用层尺寸标签(100~900)→ M3 字体角色 */
export const M3_SIZE_TO_TYPE: Record<number, M3TypeRole> = {
  100: 'label-small',
  200: 'body-small',
  300: 'body-medium',
  400: 'body-large',
  500: 'title-large',
  600: 'headline-small',
  700: 'headline-medium',
  800: 'display-small',
  900: 'display-medium'
}

/** 字重标签 → 数值 */
export const M3_WEIGHT: Record<string, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  light: 300
}

/* ==================== 形状 / 海拔 / 动效 ==================== */

/** M3 形状比例 */
export const M3_SHAPE = {
  none: '0px',
  extraSmall: '4px',
  small: '8px',
  medium: '12px',
  large: '16px',
  largeIncreased: '20px',
  extraLarge: '28px',
  extraLargeIncreased: '32px',
  full: '9999px'
} as const

/** M3 海拔阴影(5 级) */
export const M3_ELEVATION = {
  level0: 'none',
  level1: '0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)',
  level2: '0 1px 2px 0 rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)',
  level3: '0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15)',
  level4: '0 2px 3px 0 rgba(0,0,0,0.30), 0 6px 10px 4px rgba(0,0,0,0.15)',
  level5: '0 4px 4px 0 rgba(0,0,0,0.30), 0 8px 12px 6px rgba(0,0,0,0.15)'
} as const

/** M3 缓动曲线 */
export const M3_MOTION = {
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
  standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  linear: 'cubic-bezier(0, 0, 1, 1)'
} as const

/** M3 时长 */
export const M3_DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800
} as const

/** 中文友好字体栈:Roboto(拉丁)+ 系统中文 */
export const M3_FONT_STACK =
  "Roboto, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
export const M3_MONO_STACK = "'Roboto Mono', 'Cascadia Mono', Consolas, monospace"
export const M3_ICON_FONT = "'Material Symbols Rounded'"

/**
 * 生成 :root 级 M3 规范 CSS 变量表(色彩角色 + 字阶 + 形状 + 海拔 + 动效 + 状态层)。
 *
 * 注意:这里只产出 --md-sys-* / --md-ref-* 规范变量,不再把 Fluent 的
 * --color* / --fontSize* 别名指向 M3 —— 那些 token 由 FluentProvider 的
 * class 作用域规则(.fui-FluentProvider.<id>)下发,优先级高于 :root,
 * 所以必须经由 theme 对象覆盖(见 ./theme.ts),否则会被 provider 盖掉。
 */
export function m3RootCss(roles: M3Roles, dark: boolean): string {
  const v: string[] = []
  const set = (name: string, value: string): void => {
    v.push(`  ${name}: ${value};`)
  }

  v.push(`  color-scheme: ${dark ? 'dark' : 'light'};`)
  for (const [k, val] of Object.entries(roles)) set(roleVar(k), val)

  // 语义色的容器配对(M3 规范无 success/warning,按规范色 12% 容器补出)
  set('--md-sys-color-success-container', 'color-mix(in srgb, var(--md-sys-color-success) 16%, var(--md-sys-color-surface))')
  set('--md-sys-color-warning-container', 'color-mix(in srgb, var(--md-sys-color-warning) 16%, var(--md-sys-color-surface))')
  set('--md-sys-color-on-success-container', 'var(--md-sys-color-on-surface)')
  set('--md-sys-color-on-warning-container', 'var(--md-sys-color-on-surface)')

  // ---- 字阶 ----
  set('--md-ref-typeface-plain', M3_FONT_STACK)
  set('--md-ref-typeface-mono', M3_MONO_STACK)
  for (const [role, t] of Object.entries(M3_TYPE)) {
    set(`--md-sys-typescale-${role}-size`, `${t.fontSize}px`)
    set(`--md-sys-typescale-${role}-line-height`, `${t.lineHeight}px`)
    set(`--md-sys-typescale-${role}-weight`, String(t.weight))
    set(`--md-sys-typescale-${role}-tracking`, `${t.tracking}px`)
  }

  // ---- 形状(M3 形状比例) ----
  set('--md-sys-shape-corner-none', M3_SHAPE.none)
  set('--md-sys-shape-corner-extra-small', M3_SHAPE.extraSmall)
  set('--md-sys-shape-corner-small', M3_SHAPE.small)
  set('--md-sys-shape-corner-medium', M3_SHAPE.medium)
  set('--md-sys-shape-corner-large', M3_SHAPE.large)
  set('--md-sys-shape-corner-large-increased', M3_SHAPE.largeIncreased)
  set('--md-sys-shape-corner-extra-large', M3_SHAPE.extraLarge)
  set('--md-sys-shape-corner-extra-large-increased', M3_SHAPE.extraLargeIncreased)
  set('--md-sys-shape-corner-full', M3_SHAPE.full)

  // ---- 海拔(0-5) ----
  for (const [k, val] of Object.entries(M3_ELEVATION)) set(`--md-sys-elevation-${k}`, val)

  // ---- 动效 ----
  for (const [k, val] of Object.entries(M3_MOTION)) set(`--md-sys-motion-${k}-easing`, val)
  for (const [k, val] of Object.entries(M3_DURATION)) set(`--md-sys-motion-duration-${k}`, `${val}ms`)

  // ---- 状态层不透明度(规范值) ----
  set('--md-sys-state-hover-opacity', '0.08')
  set('--md-sys-state-focus-opacity', '0.1')
  set('--md-sys-state-pressed-opacity', '0.1')
  set('--md-sys-state-dragged-opacity', '0.16')
  set('--md-sys-state-disabled-opacity', '0.38')
  set('--md-sys-state-disabled-container-opacity', '0.12')

  // ---- 图标字体(Material Symbols) ----
  set('--md-icon-font', M3_ICON_FONT)

  return `:root {\n${v.join('\n')}\n}\n`
}
