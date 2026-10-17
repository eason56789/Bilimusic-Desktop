/**
 * Material Design 3 的 Fluent 主题映射层。
 *
 * Fluent v9 的组件样式全部经 griffel 编译为 var(--token),而 token 的取值来自
 * FluentProvider 用 theme 对象写出的「类作用域」样式表(.fui-FluentProvider.<id>{...}),
 * 其优先级高于 :root。因此要把 M3 真正搬进来,必须产出一个完整的 M3 派生 Theme 对象,
 * 而不是只覆盖几个圆角 token —— 后者会被 provider 的类作用域规则盖掉。
 *
 * 本文件的职责:
 *   1) 把 M3 色彩角色(39 个)铺满 Fluent 全部 184 个 color* token;
 *   2) 用 M3 字阶(type scale)替换 Fluent 的 fontSize/lineHeight/字重/字族;
 *   3) 用 M3 形状比例(shape scale)替换 Fluent 的 borderRadius;
 *   4) 用 M3 海拔(elevation 0-5)替换 Fluent 的 shadow*;
 *   5) 用 M3 动效曲线与时长替换 Fluent 的 curve* / duration*;
 *   6) 语义色(palette/status)按 M3 色调板取值,而非保留 Fluent 原色。
 *
 * token 名清单依据 tests/.out/theme-inventory.txt(459 个 token 的全量枚举)。
 */
import type { Theme } from '@fluentui/react-components'
import { DEFAULT_M3_VARIANT, M3_DURATION, M3_ELEVATION, M3_MOTION, M3_SIZE_TO_TYPE, M3_TYPE, M3_VARIANTS, m3Roles, type M3Roles, type M3TypeRole, type M3Variant } from './tokens'

export { DEFAULT_M3_VARIANT, M3_VARIANTS, m3Roles }
export type { M3TypeRole, M3Variant, M3Roles }

/** 需要 M3 化但 Fluent 未纳入 theme 对象的额外 CSS 变量(供组件层引用) */
type ExtraVars = Record<string, string>

/* ==================== 色彩语义映射 ==================== */

/** M3 深/浅色下通用的「容器 + 前景」配对(供 palette/status 复用) */
function mix(a: string, b: string, ratioOfB: number): string {
  // 用 color-mix 交给浏览器做线性插值(与 M3 的反色/hover 近似)
  return `color-mix(in srgb, ${a} ${Math.round((1 - ratioOfB) * 100)}%, ${b})`
}

/**
 * 把 M3 色彩角色铺满 Fluent 的 color* token。
 *
 * 命名映射原则(逐族说明):
 *  - NeutralForegroundN:N 越大越弱 → 依次映射 on-surface → on-surface-variant → outline
 *  - NeutralBackgroundN:N 越大越低层 → surface → surface-container-low → … → highest
 *  - Brand*:Fluent 的「品牌」= M3 primary;Brand2 系列 = secondary-container(浅色底强调面)
 *  - CompoundBrand*:开关/滑块/勾选等"复合控件"的选中色 = primary
 *  - Stroke:描边 → outline-variant(轻)/ outline(可访问)
 */
export function m3ColorTokens(roles: M3Roles, dark: boolean): Record<string, string> {
  const { primary, onPrimary, primaryContainer, onPrimaryContainer } = roles
  const { secondaryContainer, onSecondaryContainer } = roles
  const { tertiary, tertiaryContainer, onTertiaryContainer } = roles
  const { error, onError, errorContainer, onErrorContainer } = roles
  const {
    surface,
    onSurface,
    surfaceVariant,
    onSurfaceVariant,
    surfaceContainerLowest,
    surfaceContainerLow,
    surfaceContainer,
    surfaceContainerHigh,
    surfaceContainerHighest,
    surfaceDim,
    surfaceBright,
    outline,
    outlineVariant,
    inverseSurface,
    inverseOnSurface,
    inversePrimary,
    scrim
  } = roles

  /** 状态层:M3 规范 layering(hover 8% / pressed 10% / dragged 16%) */
  const hover = (base: string): string => mix(base, onSurface, dark ? 0.12 : 0.08)
  const pressed = (base: string): string => mix(base, onSurface, dark ? 0.16 : 0.1)
  const selected = (base: string): string => secondaryContainer

  const t: Record<string, string> = {}

  /* ---------- 前景 ---------- */
  t.colorNeutralForeground1 = onSurface
  t.colorNeutralForeground1Hover = onSurface
  t.colorNeutralForeground1Pressed = onSurface
  t.colorNeutralForeground1Selected = onSurface
  t.colorNeutralForeground2 = onSurfaceVariant
  t.colorNeutralForeground2Hover = onSurface
  t.colorNeutralForeground2Pressed = onSurface
  t.colorNeutralForeground2Selected = onSurface
  t.colorNeutralForeground2BrandHover = primary
  t.colorNeutralForeground2BrandPressed = mix(primary, onPrimary, 0.2)
  t.colorNeutralForeground2BrandSelected = primary
  t.colorNeutralForeground3 = onSurfaceVariant
  t.colorNeutralForeground3Hover = onSurface
  t.colorNeutralForeground3Pressed = onSurface
  t.colorNeutralForeground3Selected = onSurface
  t.colorNeutralForeground3BrandHover = primary
  t.colorNeutralForeground3BrandPressed = mix(primary, onPrimary, 0.2)
  t.colorNeutralForeground3BrandSelected = primary
  t.colorNeutralForeground4 = outline
  t.colorNeutralForeground5 = onSurfaceVariant
  t.colorNeutralForeground5Hover = onSurface
  t.colorNeutralForeground5Pressed = onSurface
  t.colorNeutralForeground5Selected = onSurface
  // M3 禁用态:on-surface 38%
  t.colorNeutralForegroundDisabled = `color-mix(in srgb, ${onSurface} 38%, transparent)`
  t.colorNeutralForegroundInvertedDisabled = `color-mix(in srgb, ${inverseOnSurface} 40%, transparent)`

  t.colorBrandForegroundLink = primary
  t.colorBrandForegroundLinkHover = mix(primary, onSurface, 0.12)
  t.colorBrandForegroundLinkPressed = mix(primary, onSurface, 0.28)
  t.colorBrandForegroundLinkSelected = primary
  t.colorNeutralForeground2Link = onSurfaceVariant
  t.colorNeutralForeground2LinkHover = onSurface
  t.colorNeutralForeground2LinkPressed = onSurface
  t.colorNeutralForeground2LinkSelected = onSurface

  t.colorCompoundBrandForeground1 = primary
  t.colorCompoundBrandForeground1Hover = mix(primary, onSurface, 0.12)
  t.colorCompoundBrandForeground1Pressed = mix(primary, onSurface, 0.28)
  t.colorBrandForeground1 = primary
  t.colorBrandForeground2 = mix(primary, onSurface, 0.14)
  t.colorBrandForeground2Hover = mix(primary, onSurface, 0.06)
  t.colorBrandForeground2Pressed = mix(primary, onSurface, 0.34)

  t.colorNeutralForeground1Static = dark ? '#1c1b1f' : onSurface
  t.colorNeutralForegroundStaticInverted = inverseOnSurface
  t.colorNeutralForegroundInverted = inverseOnSurface
  t.colorNeutralForegroundInvertedHover = inverseOnSurface
  t.colorNeutralForegroundInvertedPressed = inverseOnSurface
  t.colorNeutralForegroundInvertedSelected = inverseOnSurface
  t.colorNeutralForegroundInverted2 = inverseOnSurface
  t.colorNeutralForegroundOnBrand = onPrimary
  t.colorNeutralForegroundInvertedLink = inversePrimary
  t.colorNeutralForegroundInvertedLinkHover = inversePrimary
  t.colorNeutralForegroundInvertedLinkPressed = inversePrimary
  t.colorNeutralForegroundInvertedLinkSelected = inversePrimary
  t.colorBrandForegroundInverted = inversePrimary
  t.colorBrandForegroundInvertedHover = inversePrimary
  t.colorBrandForegroundInvertedPressed = inversePrimary
  // OnLight 语义 = "浅色底上的品牌色",即 primary 本身
  t.colorBrandForegroundOnLight = primary
  t.colorBrandForegroundOnLightHover = mix(primary, onSurface, 0.12)
  t.colorBrandForegroundOnLightPressed = mix(primary, onSurface, 0.28)
  t.colorBrandForegroundOnLightSelected = mix(primary, onSurface, 0.18)

  /* ---------- 背景(表面层级) ---------- */
  t.colorNeutralBackground1 = surface
  t.colorNeutralBackground1Hover = hover(surfaceContainerLow)
  t.colorNeutralBackground1Pressed = pressed(surfaceContainer)
  t.colorNeutralBackground1Selected = selected(surface)
  t.colorNeutralBackground2 = surfaceContainerLow
  t.colorNeutralBackground2Hover = hover(surfaceContainer)
  t.colorNeutralBackground2Pressed = pressed(surfaceContainerHigh)
  t.colorNeutralBackground2Selected = selected(surfaceContainerLow)
  t.colorNeutralBackground3 = surfaceContainer
  t.colorNeutralBackground3Hover = hover(surfaceContainerHigh)
  t.colorNeutralBackground3Pressed = pressed(surfaceContainerHighest)
  t.colorNeutralBackground3Selected = selected(surfaceContainer)
  t.colorNeutralBackground4 = surfaceContainerHigh
  t.colorNeutralBackground4Hover = hover(surfaceContainerHighest)
  t.colorNeutralBackground4Pressed = pressed(surfaceContainerHighest)
  t.colorNeutralBackground4Selected = selected(surfaceContainerHigh)
  t.colorNeutralBackground5 = surfaceContainerHighest
  t.colorNeutralBackground5Hover = hover(surfaceContainerHighest)
  t.colorNeutralBackground5Pressed = pressed(surfaceContainerHighest)
  t.colorNeutralBackground5Selected = selected(surfaceContainerHighest)
  t.colorNeutralBackground6 = surfaceContainerHighest
  // 7 在 Fluent 里是"全透明但可 hover"的层
  t.colorNeutralBackground7 = 'transparent'
  t.colorNeutralBackground7Hover = `color-mix(in srgb, ${onSurface} 8%, transparent)`
  t.colorNeutralBackground7Pressed = `color-mix(in srgb, ${onSurface} 10%, transparent)`
  t.colorNeutralBackground7Selected = 'transparent'
  t.colorNeutralBackground8 = surfaceContainerLow
  t.colorNeutralBackgroundInverted = inverseSurface
  t.colorNeutralBackgroundInvertedHover = mix(inverseSurface, inverseOnSurface, 0.08)
  t.colorNeutralBackgroundInvertedPressed = mix(inverseSurface, inverseOnSurface, 0.12)
  t.colorNeutralBackgroundInvertedSelected = mix(inverseSurface, inverseOnSurface, 0.1)
  t.colorNeutralBackgroundStatic = surfaceContainerHighest
  t.colorNeutralBackgroundAlpha = dark ? `${surface}80` : `${surface}80`
  t.colorNeutralBackgroundAlpha2 = dark ? `${surface}cc` : `${surface}cc`

  t.colorSubtleBackground = 'transparent'
  t.colorSubtleBackgroundHover = `color-mix(in srgb, ${onSurface} ${dark ? 12 : 8}%, transparent)`
  t.colorSubtleBackgroundPressed = `color-mix(in srgb, ${onSurface} ${dark ? 16 : 10}%, transparent)`
  t.colorSubtleBackgroundSelected = `color-mix(in srgb, ${onSurface} 12%, transparent)`
  t.colorSubtleBackgroundLightAlphaHover = `color-mix(in srgb, ${onSurface} 8%, transparent)`
  t.colorSubtleBackgroundLightAlphaPressed = `color-mix(in srgb, ${onSurface} 12%, transparent)`
  t.colorSubtleBackgroundLightAlphaSelected = 'transparent'
  t.colorSubtleBackgroundInverted = 'transparent'
  t.colorSubtleBackgroundInvertedHover = 'rgba(0, 0, 0, 0.1)'
  t.colorSubtleBackgroundInvertedPressed = 'rgba(0, 0, 0, 0.3)'
  t.colorSubtleBackgroundInvertedSelected = 'rgba(0, 0, 0, 0.2)'
  t.colorTransparentBackground = 'transparent'
  t.colorTransparentBackgroundHover = 'transparent'
  t.colorTransparentBackgroundPressed = 'transparent'
  t.colorTransparentBackgroundSelected = 'transparent'

  // M3 禁用容器:on-surface 12%
  t.colorNeutralBackgroundDisabled = `color-mix(in srgb, ${onSurface} 12%, ${surface})`
  t.colorNeutralBackgroundDisabled2 = surface
  t.colorNeutralBackgroundInvertedDisabled = `color-mix(in srgb, ${inverseOnSurface} 12%, transparent)`
  t.colorNeutralStencil1 = `color-mix(in srgb, ${onSurface} 10%, transparent)`
  t.colorNeutralStencil2 = `color-mix(in srgb, ${onSurface} 5%, transparent)`
  t.colorNeutralStencil1Alpha = `color-mix(in srgb, ${onSurface} 10%, transparent)`
  t.colorNeutralStencil2Alpha = `color-mix(in srgb, ${onSurface} 5%, transparent)`

  t.colorBackgroundOverlay = scrim
  t.colorScrollbarOverlay = dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'

  /* ---------- 品牌底 ---------- */
  t.colorBrandBackground = primary
  t.colorBrandBackgroundHover = mix(primary, onPrimary, 0.08)
  t.colorBrandBackgroundPressed = mix(primary, onPrimary, 0.16)
  t.colorBrandBackgroundSelected = mix(primary, onPrimary, 0.12)
  t.colorCompoundBrandBackground = primary
  t.colorCompoundBrandBackgroundHover = mix(primary, onPrimary, 0.08)
  t.colorCompoundBrandBackgroundPressed = mix(primary, onPrimary, 0.16)
  t.colorBrandBackgroundStatic = primary
  t.colorBrandBackground2 = secondaryContainer
  t.colorBrandBackground2Hover = mix(secondaryContainer, onSecondaryContainer, 0.08)
  t.colorBrandBackground2Pressed = mix(secondaryContainer, onSecondaryContainer, 0.16)
  t.colorBrandBackground3Static = mix(primary, surface, 0.3)
  t.colorBrandBackground4Static = mix(primary, surface, 0.5)
  t.colorBrandBackgroundInverted = onPrimary
  t.colorBrandBackgroundInvertedHover = mix(onPrimary, primary, 0.08)
  t.colorBrandBackgroundInvertedPressed = mix(onPrimary, primary, 0.16)
  t.colorBrandBackgroundInvertedSelected = mix(onPrimary, primary, 0.12)

  // 卡片:用容器层级而非纯白(Fluent Card 默认 background1)
  t.colorNeutralCardBackground = surfaceContainerLow
  t.colorNeutralCardBackgroundHover = surfaceContainer
  t.colorNeutralCardBackgroundPressed = surfaceContainerHigh
  t.colorNeutralCardBackgroundSelected = secondaryContainer
  t.colorNeutralCardBackgroundDisabled = `color-mix(in srgb, ${onSurface} 12%, ${surface})`

  /* ---------- 描边 ---------- */
  t.colorNeutralStrokeAccessible = outline
  t.colorNeutralStrokeAccessibleHover = mix(outline, onSurface, 0.2)
  t.colorNeutralStrokeAccessiblePressed = mix(outline, onSurface, 0.34)
  t.colorNeutralStrokeAccessibleSelected = primary
  t.colorNeutralStroke1 = outlineVariant
  t.colorNeutralStroke1Hover = outline
  t.colorNeutralStroke1Pressed = mix(outline, onSurface, 0.2)
  t.colorNeutralStroke1Selected = outline
  t.colorNeutralStroke2 = outlineVariant
  t.colorNeutralStroke3 = `color-mix(in srgb, ${outlineVariant} 60%, transparent)`
  t.colorNeutralStroke4 = outlineVariant
  t.colorNeutralStroke4Hover = outline
  t.colorNeutralStroke4Pressed = mix(outline, onSurface, 0.2)
  t.colorNeutralStroke4Selected = outlineVariant
  t.colorNeutralStrokeSubtle = outlineVariant
  t.colorNeutralStrokeOnBrand = onPrimary
  t.colorNeutralStrokeOnBrand2 = onPrimary
  t.colorNeutralStrokeOnBrand2Hover = onPrimary
  t.colorNeutralStrokeOnBrand2Pressed = onPrimary
  t.colorNeutralStrokeOnBrand2Selected = onPrimary
  t.colorBrandStroke1 = primary
  t.colorBrandStroke2 = `color-mix(in srgb, ${primary} 40%, transparent)`
  t.colorBrandStroke2Hover = `color-mix(in srgb, ${primary} 55%, transparent)`
  t.colorBrandStroke2Pressed = `color-mix(in srgb, ${primary} 70%, transparent)`
  t.colorBrandStroke2Contrast = `color-mix(in srgb, ${primary} 40%, transparent)`
  t.colorCompoundBrandStroke = primary
  t.colorCompoundBrandStrokeHover = mix(primary, onPrimary, 0.08)
  t.colorCompoundBrandStrokePressed = mix(primary, onPrimary, 0.16)
  t.colorNeutralStrokeDisabled = `color-mix(in srgb, ${onSurface} 12%, transparent)`
  t.colorNeutralStrokeDisabled2 = `color-mix(in srgb, ${onSurface} 12%, transparent)`
  t.colorNeutralStrokeInvertedDisabled = `color-mix(in srgb, ${inverseOnSurface} 40%, transparent)`
  t.colorTransparentStroke = 'transparent'
  t.colorTransparentStrokeInteractive = 'transparent'
  t.colorTransparentStrokeDisabled = 'transparent'
  t.colorNeutralStrokeAlpha = `color-mix(in srgb, ${onSurface} 10%, transparent)`
  t.colorNeutralStrokeAlpha2 = 'rgba(255, 255, 255, 0.2)'
  // 焦点环:M3 用 primary 双环(Fluent 的结构是 focus1 内 + focus2 外)
  t.colorStrokeFocus1 = surface
  t.colorStrokeFocus2 = primary

  /* ---------- 阴影颜色(M3 elevation 用纯黑 scrim 色) ---------- */
  t.colorNeutralShadowAmbient = 'rgba(0,0,0,0.30)'
  t.colorNeutralShadowKey = 'rgba(0,0,0,0.15)'
  t.colorNeutralShadowAmbientLighter = 'rgba(0,0,0,0.15)'
  t.colorNeutralShadowKeyLighter = 'rgba(0,0,0,0.08)'
  t.colorNeutralShadowAmbientDarker = 'rgba(0,0,0,0.40)'
  t.colorNeutralShadowKeyDarker = 'rgba(0,0,0,0.20)'
  t.colorBrandShadowAmbient = 'rgba(0,0,0,0.30)'
  t.colorBrandShadowKey = 'rgba(0,0,0,0.25)'

  /* ---------- 语义色板:按 M3 语义重定向 ----------
   * 关键取舍:Fluent 的 palette/status 是"品牌无关的固定语义色",而 M3 只有
   * error 是正式角色。这里把「危险/错误」对齐 M3 error(规范要求),其余语义色
   * (成功/警告/信息)保留色相但按 M3 灰阶重算明度,使其与 M3 表面和谐,
   * 同时避免"把成功也染成主题色"这类语义破坏。
   */
  // Red / Danger → M3 error(HCT 规范值)
  t.colorPaletteRedBackground1 = errorContainer
  t.colorPaletteRedBackground2 = mix(errorContainer, error, 0.3)
  t.colorPaletteRedBackground3 = error
  t.colorPaletteRedForeground1 = error
  t.colorPaletteRedForeground2 = onErrorContainer
  t.colorPaletteRedForeground3 = onErrorContainer
  t.colorPaletteRedBorderActive = error
  t.colorPaletteRedBorder1 = mix(error, surface, 0.55)
  t.colorPaletteRedBorder2 = error

  t.colorStatusDangerBackground1 = errorContainer
  t.colorStatusDangerBackground2 = mix(errorContainer, error, 0.4)
  t.colorStatusDangerBackground3 = error
  t.colorStatusDangerBackground3Hover = mix(error, onError, 0.08)
  t.colorStatusDangerBackground3Pressed = mix(error, onError, 0.16)
  t.colorStatusDangerForeground1 = error
  t.colorStatusDangerForeground2 = onErrorContainer
  t.colorStatusDangerForeground3 = error
  t.colorStatusDangerForegroundInverted = onError
  t.colorStatusDangerBorderActive = error
  t.colorStatusDangerBorder1 = mix(error, surface, 0.55)
  t.colorStatusDangerBorder2 = error

  // Green / Success → M3 语义成功色(固定色调,不随 seed 漂移)
  const success = roles.success
  const onSuccess = roles.onSuccess
  const successContainer = `color-mix(in srgb, ${success} 16%, ${surface})`
  t.colorPaletteGreenBackground1 = successContainer
  t.colorPaletteGreenBackground2 = mix(successContainer, success, 0.35)
  t.colorPaletteGreenBackground3 = success
  t.colorPaletteGreenForeground1 = success
  t.colorPaletteGreenForeground2 = dark ? mix(success, onSurface, 0.35) : mix(success, onSurface, 0.45)
  t.colorPaletteGreenForeground3 = onSuccess
  t.colorPaletteGreenBorderActive = success
  t.colorPaletteGreenBorder1 = mix(success, surface, 0.55)
  t.colorPaletteGreenBorder2 = success

  t.colorStatusSuccessBackground1 = successContainer
  t.colorStatusSuccessBackground2 = mix(successContainer, success, 0.4)
  t.colorStatusSuccessBackground3 = success
  t.colorStatusSuccessForeground1 = success
  t.colorStatusSuccessForeground2 = dark ? mix(success, onSurface, 0.35) : mix(success, onSurface, 0.45)
  t.colorStatusSuccessForeground3 = success
  t.colorStatusSuccessForegroundInverted = onSuccess
  t.colorStatusSuccessBorderActive = success
  t.colorStatusSuccessBorder1 = mix(success, surface, 0.55)
  t.colorStatusSuccessBorder2 = success

  // Yellow / Marigold / Warning → M3 语义警告色
  const warning = roles.warning
  const onWarning = roles.onWarning
  const warningContainer = `color-mix(in srgb, ${warning} 16%, ${surface})`
  t.colorPaletteYellowBackground1 = warningContainer
  t.colorPaletteYellowBackground2 = mix(warningContainer, warning, 0.35)
  t.colorPaletteYellowBackground3 = warning
  t.colorPaletteYellowForeground1 = warning
  t.colorPaletteYellowForeground2 = dark ? mix(warning, onSurface, 0.35) : mix(warning, onSurface, 0.5)
  t.colorPaletteYellowBorderActive = warning
  t.colorPaletteYellowBorder1 = mix(warning, surface, 0.55)
  t.colorPaletteYellowBorder2 = warning

  t.colorPaletteMarigoldBackground1 = warningContainer
  t.colorPaletteMarigoldBackground2 = mix(warningContainer, warning, 0.35)
  t.colorPaletteMarigoldBackground3 = warning
  t.colorPaletteMarigoldForeground1 = warning
  t.colorPaletteMarigoldForeground2 = dark ? mix(warning, onSurface, 0.35) : mix(warning, onSurface, 0.5)
  t.colorPaletteMarigoldBorderActive = warning
  t.colorPaletteMarigoldBorder1 = mix(warning, surface, 0.55)
  t.colorPaletteMarigoldBorder2 = warning

  t.colorPaletteDarkOrangeBackground1 = warningContainer
  t.colorPaletteDarkOrangeBackground2 = warningContainer
  t.colorPaletteDarkOrangeBackground3 = warning
  t.colorPaletteDarkOrangeForeground1 = warning
  t.colorPaletteDarkOrangeForeground2 = onWarning
  t.colorPaletteDarkOrangeBorderActive = warning
  t.colorPaletteDarkOrangeBorder1 = mix(warning, surface, 0.55)
  t.colorPaletteDarkOrangeBorder2 = warning

  t.colorStatusWarningBackground1 = warningContainer
  t.colorStatusWarningBackground2 = mix(warningContainer, warning, 0.4)
  t.colorStatusWarningBackground3 = warning
  t.colorStatusWarningForeground1 = warning
  t.colorStatusWarningForeground2 = onWarning
  t.colorStatusWarningForeground3 = warning
  t.colorStatusWarningForegroundInverted = onWarning
  t.colorStatusWarningBorderActive = warning
  t.colorStatusWarningBorder1 = mix(warning, surface, 0.55)
  t.colorStatusWarningBorder2 = warning

  /** 其余色相族:按 M3 中性阶铺底,并把族强调色重定向到对应 M3 角色,
   *  使应用里用到 palette 的地方(如 badge)与 M3 语境一致。 */
  const family = (
    name: string,
    fg1: string,
    bg1: string,
    borderActive: string
  ): void => {
    t[`colorPalette${name}Background1`] = bg1
    t[`colorPalette${name}Background2`] = mix(bg1, fg1, 0.3)
    t[`colorPalette${name}Background3`] = fg1
    t[`colorPalette${name}Foreground1`] = fg1
    t[`colorPalette${name}Foreground2`] = dark ? mix(fg1, onSurface, 0.3) : mix(fg1, onSurface, 0.45)
    t[`colorPalette${name}Foreground3`] = onSurface
    t[`colorPalette${name}BorderActive`] = borderActive
    t[`colorPalette${name}Border1`] = mix(bg1, fg1, 0.5)
    t[`colorPalette${name}Border2`] = fg1
  }

  // 表意色:与 M3 的 primary/secondary/tertiary 三家族对应
  family('Berry', tertiary, tertiaryContainer, tertiary)
  family('Lilac', tertiary, tertiaryContainer, tertiary)
  family('Grape', tertiary, tertiaryContainer, tertiary)
  family('Purple', tertiary, tertiaryContainer, tertiary)
  family('Magenta', tertiary, tertiaryContainer, tertiary)
  family('Plum', tertiary, tertiaryContainer, tertiary)
  family('Pink', tertiary, tertiaryContainer, tertiary)
  family('Cranberry', error, errorContainer, error)
  family('DarkRed', error, errorContainer, error)
  family('Blue', primary, primaryContainer, primary)
  family('RoyalBlue', primary, primaryContainer, primary)
  family('Navy', primary, primaryContainer, primary)
  family('Cornflower', primary, primaryContainer, primary)
  family('Lavender', primary, primaryContainer, primary)
  family('Teal', secondaryContainer, secondaryContainer, secondaryContainer)
  family('LightTeal', secondaryContainer, secondaryContainer, secondaryContainer)
  family('Steel', secondaryContainer, secondaryContainer, secondaryContainer)
  family('Seafoam', success, successContainer, success)
  family('LightGreen', success, successContainer, success)
  family('DarkGreen', success, successContainer, success)
  family('Forest', success, successContainer, success)
  family('Pumpkin', warning, warningContainer, warning)
  family('Peach', warning, warningContainer, warning)
  family('Gold', warning, warningContainer, warning)
  family('Brass', warning, warningContainer, warning)
  family('Brown', surfaceContainerHighest, surfaceContainer, outline)
  family('Beige', surfaceContainerHighest, surfaceContainer, outline)
  family('Mink', surfaceContainerHighest, surfaceContainer, outline)
  family('Platinum', surfaceContainerHighest, surfaceContainer, outline)
  family('Anchor', surfaceContainerHighest, surfaceContainer, outline)

  return t
}

/* ==================== 字阶 / 形状 / 海拔 / 动效 ==================== */

/** M3 type scale 的 lineHeight 除以 fontSize 得到 unitless 行高(Fluent var 需要带单位,故直接用 px) */
const TYPE_BY_FONT_SIZE: Record<number, M3TypeRole> = Object.fromEntries(
  Object.entries(M3_SIZE_TO_TYPE).map(([k, v]) => [Number(k), v])
) as Record<number, M3TypeRole>

/**
 * Fluent 字阶 token → M3 字阶。
 * Fluent 的 Base100..600 / Hero700..1000 一共 10 档,与 M3 的 15 个角色取最接近者对齐,
 * 保证界面里所有 size={n} 的文本都落在 M3 规范字阶上。
 */
function m3TypeTokens(): Record<string, string> {
  const t: Record<string, string> = {}
  const pairs: [string, M3TypeRole][] = [
    ['100', 'label-small'],
    ['200', 'body-small'],
    ['300', 'body-medium'],
    ['400', 'body-large'],
    ['500', 'title-large'],
    ['600', 'headline-small'],
    ['Hero700', 'headline-medium'],
    ['Hero800', 'display-small'],
    ['Hero900', 'display-medium'],
    ['Hero1000', 'display-large']
  ]
  for (const [key, role] of pairs) {
    const spec = M3_TYPE[role]
    const suffix = key.startsWith('Hero') ? key : `Base${key}`
    t[`fontSize${suffix}`] = `${spec.fontSize}px`
    t[`lineHeight${suffix}`] = `${spec.lineHeight}px`
  }
  return t
}

/**
 * Fluent 圆角 → M3 形状比例。
 * Fluent 有 None/Small(2)/Medium(4)/Large(6)/XLarge(8)/2XLarge(12)/3XLarge(16)/4XLarge(24)/5XLarge(32)/6XLarge(40)/Circular。
 * M3 形状:4/8/12/16/20/28/32/full。按"取值最接近且语义等价"逐档映射。
 */
function m3ShapeTokens(): Record<string, string> {
  return {
    borderRadiusNone: '0px',
    borderRadiusSmall: '4px',
    borderRadiusMedium: '8px',
    borderRadiusLarge: '12px',
    borderRadiusXLarge: '16px',
    borderRadius2XLarge: '16px',
    borderRadius3XLarge: '20px',
    borderRadius4XLarge: '28px',
    borderRadius5XLarge: '28px',
    borderRadius6XLarge: '32px',
    borderRadiusCircular: '9999px'
  }
}

/** Fluent 阴影 → M3 海拔等级(0-5) */
function m3ShadowTokens(): Record<string, string> {
  const l = M3_ELEVATION
  const out: Record<string, string> = {
    shadow2: l.level1,
    shadow4: l.level1,
    shadow8: l.level2,
    shadow16: l.level3,
    shadow28: l.level4,
    shadow64: l.level5
  }
  // Brand 阴影同海拔(颜色已通过 colorNeutralShadow* 统一)
  out.shadow2Brand = l.level1
  out.shadow4Brand = l.level1
  out.shadow8Brand = l.level2
  out.shadow16Brand = l.level3
  out.shadow28Brand = l.level4
  out.shadow64Brand = l.level5
  return out
}

/** Fluent 动效曲线 → M3 缓动;时长 → M3 时长 */
function m3MotionTokens(): Record<string, string> {
  const c = M3_MOTION
  const d = M3_DURATION
  return {
    // 曲线:Fluent 的 accelerate/decelerate 语义与 M3 一致,逐一对应
    curveAccelerateMax: c.emphasizedAccelerate,
    curveAccelerateMid: c.emphasizedAccelerate,
    curveAccelerateMin: c.standardAccelerate,
    curveDecelerateMax: c.emphasizedDecelerate,
    curveDecelerateMid: c.standardDecelerate,
    curveDecelerateMin: c.standardDecelerate,
    curveEasyEaseMax: c.emphasized,
    curveEasyEase: c.standard,
    curveLinear: c.linear,
    // 时长
    durationUltraFast: `${d.short1}ms`,
    durationFaster: `${d.short2}ms`,
    durationFast: `${d.short3}ms`,
    durationNormal: `${d.short4}ms`,
    durationGentle: `${d.medium1}ms`,
    durationSlow: `${d.medium2}ms`,
    durationSlower: `${d.medium4}ms`,
    durationUltraSlow: `${d.long2}ms`
  }
}

/* ==================== 主题组装 ==================== */

/** M3 字族(拉丁用 Roboto,中文回落到系统黑体) */
export const M3_TYPEFACE = {
  plain:
    "Roboto, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
  mono: "'Roboto Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace",
  numeric:
    "Roboto, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif"
}

export interface M3ThemeResult {
  /** 可直接喂给 FluentProvider 的完整主题 */
  theme: Theme
  /** M3 规范色彩角色(组件造型层与自定义 CSS 引用) */
  roles: M3Roles
  /** 额外的 --md-sys-* 变量(字体/图标/状态层等) */
  vars: ExtraVars
}

/**
 * 构建一个完整的 M3 主题。
 *
 * @param dark 深色模式
 * @param accent 源色(任意 #rgb / #rrggbb,经 HCT 转成规范色调板)
 * @param variant M3 配色变体(tonalSpot / expressive / vibrant / …)
 * @param contrast 对比度 -1 ~ 1
 */
export function buildM3Theme(
  dark: boolean,
  accent: string,
  variant: M3Variant = DEFAULT_M3_VARIANT,
  contrast = 0
): M3ThemeResult {
  const roles = m3Roles(dark, accent, variant, contrast)

  const theme = {
    ...m3ColorTokens(roles, dark),
    ...m3TypeTokens(),
    ...m3ShapeTokens(),
    ...m3ShadowTokens(),
    ...m3MotionTokens(),
    fontFamilyBase: M3_TYPEFACE.plain,
    fontFamilyMonospace: M3_TYPEFACE.mono,
    fontFamilyNumeric: M3_TYPEFACE.numeric,
    fontWeightRegular: '400',
    fontWeightMedium: '500',
    fontWeightSemibold: '500',
    fontWeightBold: '700',
    // 间距沿用 Fluent 的 4px 基准(M3 同为 4px 栅格,无需改写)
    strokeWidthThin: '1px',
    strokeWidthThick: '2px',
    strokeWidthThicker: '3px',
    strokeWidthThickest: '4px'
  } as unknown as Theme

  const vars: ExtraVars = {
    '--md-icon-font': "'Material Symbols Rounded'",
    '--md-ref-typeface-plain': M3_TYPEFACE.plain,
    '--md-ref-typeface-mono': M3_TYPEFACE.mono
  }

  return { theme, roles, vars }
}
