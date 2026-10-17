/**
 * Material Design 3 组件造型层。
 *
 * 这一层是「M3 搬过来」的落地部分:颜色/字阶/形状/海拔/动效已经由 theme.ts 通过
 * Fluent 的 token 体系整体下发,本文件只负责 **M3 规范里各组件的造型与状态** ——
 * 也就是 token 无法表达的部分:
 *   · 按钮的 M3 变体(填充/色调/描边/文本)与尺寸(40px 高、药丸圆角、label-large 标签)
 *   · 开关的 52×32 轨道 + 24/28 滑块
 *   · 复选框 18px / 圆角 2px、单选框 20px / 内点 10px
 *   · 滑块的 4px 轨道与 4×44 药丸手柄(M3 手柄不是圆形)
 *   · 标签页的 3px 圆角指示条(横向)与导航栏药丸(竖向)
 *   · 菜单/对话框/卡片/提示/吐司的 M3 容器色与圆角、海拔
 *   · 焦点环、禁用态不透明度、状态层叠色
 *
 * 选择器基于 Fluent v9 稳定的 fui-* 类名(见 tests/.out/fui-classes.txt)与
 * 各组件的 slot 结构(见 tests/.out/dom-render.txt)。
 * 全部规则限定在 .md3-ui 下,经典 Fluent 外观不受影响。
 *
 * 注意:appearance / size / shape 这些 props **不会**被 Fluent 写到 DOM 上
 * (useButton 内部直接解构掉了),所以按钮变体一律用 ui/controls.tsx 外观层
 * 镜像出来的 data-md3-* 属性来选,写 [appearance='primary'] 是选不中的。
 */

/** M3 语义变量引用简写 */
const c = (role: string): string => `var(--md-sys-color-${role})`
const shape = (s: string): string => `var(--md-sys-shape-corner-${s})`
const el = (level: number): string => `var(--md-sys-elevation-level${level})`

/** 状态层:M3 用 on-surface 的固定不透明度叠色 */
const stateLayer = (pct: number): string => `color-mix(in srgb, ${c('on-surface')} ${pct}%, transparent)`

export function m3ComponentCss(): string {
  return `
/* ==========================================================================
   Material 3 · 组件造型层(仅在 .md3-ui 下生效;经典 Fluent 外观保持原样)
   ========================================================================== */
.md3-ui {
  font-family: var(--md-ref-typeface-plain);
  letter-spacing: 0;
}

/* --------------------------------------------------------------------------
   1. 按钮(Button / CompoundButton / MenuButton / ToggleButton)
   M3 规格:高 40dp、药丸圆角、水平内边距 24dp、标签为 label-large。
   Fluent 的 appearance 语义与 M3 变体的对应:
     primary → filled(填充)  | secondary → outlined(描边)
     subtle/transparent → text(文本) | outline → outlined
   -------------------------------------------------------------------------- */
.md3-ui .fui-Button {
  min-height: 40px;
  padding: 10px 24px;
  border-radius: ${shape('full')};
  font-family: var(--md-ref-typeface-plain);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: var(--md-sys-typescale-label-large-line-height);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing),
    box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing),
    border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing);
}
.md3-ui .fui-Button__icon {
  font-size: 18px;
}

/* --- filled:填充按钮(primary)= primary / on-primary --- */
.md3-ui .fui-Button[data-md3-appearance='primary'] {
  background-color: ${c('primary')};
  color: ${c('on-primary')};
  border-color: transparent;
  box-shadow: ${el(0)};
}
.md3-ui .fui-Button[data-md3-appearance='primary']:hover {
  background-color: color-mix(in srgb, ${c('primary')} 92%, ${c('on-primary')});
  border-color: transparent;
  box-shadow: ${el(1)};
}
.md3-ui .fui-Button[data-md3-appearance='primary']:active {
  background-color: color-mix(in srgb, ${c('primary')} 88%, ${c('on-primary')});
  box-shadow: ${el(0)};
}
.md3-ui .fui-Button[data-md3-appearance='primary'] .fui-Button__icon {
  color: ${c('on-primary')};
}

/* --- 默认(无 appearance,即 Fluent 的 secondary)= tonal:secondary-container --- */
.md3-ui .fui-Button[data-md3-appearance='secondary'],
.md3-ui .fui-Button[data-md3-appearance='tonal'] {
  background-color: ${c('secondary-container')};
  color: ${c('on-secondary-container')};
  border-color: transparent;
}
.md3-ui .fui-Button[data-md3-appearance='secondary']:hover,
.md3-ui .fui-Button[data-md3-appearance='tonal']:hover {
  background-color: color-mix(in srgb, ${c('secondary-container')} 92%, ${c('on-secondary-container')});
  border-color: transparent;
}
.md3-ui .fui-Button[data-md3-appearance='secondary']:active,
.md3-ui .fui-Button[data-md3-appearance='tonal']:active {
  background-color: color-mix(in srgb, ${c('secondary-container')} 88%, ${c('on-secondary-container')});
}

/* --- outlined:描边按钮 = outline 边 + primary 文本 --- */
.md3-ui .fui-Button[data-md3-appearance='outline'] {
  background-color: transparent;
  color: ${c('primary')};
  border: 1px solid ${c('outline')};
}
.md3-ui .fui-Button[data-md3-appearance='outline']:hover {
  background-color: color-mix(in srgb, ${c('primary')} 8%, transparent);
  border-color: ${c('outline')};
}
.md3-ui .fui-Button[data-md3-appearance='outline']:active {
  background-color: color-mix(in srgb, ${c('primary')} 10%, transparent);
}

/* --- text:文本按钮 = 透明底 + primary 文本 --- */
.md3-ui .fui-Button[data-md3-appearance='subtle'],
.md3-ui .fui-Button[data-md3-appearance='transparent'] {
  background-color: transparent;
  color: ${c('primary')};
  border-color: transparent;
  padding: 10px 12px;
}
.md3-ui .fui-Button[data-md3-appearance='subtle']:hover,
.md3-ui .fui-Button[data-md3-appearance='transparent']:hover {
  background-color: color-mix(in srgb, ${c('primary')} 8%, transparent);
}
.md3-ui .fui-Button[data-md3-appearance='subtle']:active,
.md3-ui .fui-Button[data-md3-appearance='transparent']:active {
  background-color: color-mix(in srgb, ${c('primary')} 10%, transparent);
}
/* 文本按钮里的图标也走 primary(M3 文本按钮图标同色) */
.md3-ui .fui-Button[data-md3-appearance='subtle'] .fui-Button__icon,
.md3-ui .fui-Button[data-md3-appearance='transparent'] .fui-Button__icon {
  color: ${c('primary')};
}

/* --- 图标按钮:40px 方形圆角,无文本内边距。
       Fluent 的 iconOnly 判定是「有图标且无文本」,由外观层镜像成 data-md3-icon-only。
       不能用 :has(> .fui-Button__icon:only-child) —— 文本节点不算元素节点,
       带文字的按钮会一起命中,导致标签被挤成竖排。 --- */
.md3-ui .fui-Button[data-md3-icon-only='true'] {
  min-width: 40px;
  width: 40px;
  padding: 0;
  border-radius: ${shape('full')};
}
/* M3 的按钮一律是全圆角(药丸),没有"圆角矩形按钮"这一档。
   Fluent 的 shape 默认值恰是 'rounded',若照搬会覆盖上面的药丸圆角,
   故这里只保留显式的 square(方角)与 circular(全圆)两种逃逸口。 */
.md3-ui .fui-Button[data-md3-shape='circular'] {
  border-radius: ${shape('full')};
}
.md3-ui .fui-Button[data-md3-shape='square'] {
  border-radius: ${shape('none')};
}

/* --- 尺寸:小号 32dp、大号 56dp(M3 按钮高度档) --- */
.md3-ui .fui-Button[data-md3-size='small'] {
  min-height: 32px;
  padding: 6px 16px;
  border-radius: ${shape('full')};
}
.md3-ui .fui-Button[data-md3-size='large'] {
  min-height: 56px;
  padding: 16px 32px;
}
.md3-ui .fui-Button[data-md3-size='small'] .fui-Button__icon,
.md3-ui .fui-Button[data-md3-size='tiny'] .fui-Button__icon {
  font-size: 16px;
}

/* --- 禁用态:M3 = on-surface 38% 文本 + on-surface 12% 容器 --- */
.md3-ui .fui-Button:disabled,
.md3-ui .fui-Button[aria-disabled='true'] {
  background-color: color-mix(in srgb, ${c('on-surface')} 12%, transparent);
  color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
  border-color: transparent;
  box-shadow: ${el(0)};
}
.md3-ui .fui-Button[data-md3-appearance='subtle']:disabled,
.md3-ui .fui-Button[data-md3-appearance='transparent']:disabled {
  background-color: transparent;
}

/* --- ToggleButton(选中 = secondary-container,未选 = 描边) --- */
.md3-ui .fui-ToggleButton {
  border-radius: ${shape('full')};
}
.md3-ui .fui-ToggleButton[aria-pressed='true'] {
  background-color: ${c('secondary-container')};
  color: ${c('on-secondary-container')};
}

/* --------------------------------------------------------------------------
   2. 输入框(Input / Textarea / Dropdown / Combobox / SearchBox)
   M3 描边式文本框:1px outline,聚焦时 2px primary,圆角 extra-small。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Input,
.md3-ui .fui-Textarea,
.md3-ui .fui-Dropdown,
.md3-ui .fui-Combobox,
.md3-ui .fui-Select,
.md3-ui .fui-SearchBox {
  border-radius: ${shape('extra-small')};
  background-color: transparent;
  border: 1px solid ${c('outline')};
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-standard-easing);
}
.md3-ui .fui-Input:hover,
.md3-ui .fui-Textarea:hover,
.md3-ui .fui-Dropdown:hover,
.md3-ui .fui-Combobox:hover,
.md3-ui .fui-SearchBox:hover {
  border-color: ${c('on-surface')};
  background-color: transparent;
}
/* 聚焦:2px primary 描边(M3 聚焦态描边加粗) */
.md3-ui .fui-Input:focus-within,
.md3-ui .fui-Textarea:focus-within,
.md3-ui .fui-Dropdown:focus-within,
.md3-ui .fui-Combobox:focus-within,
.md3-ui .fui-SearchBox:focus-within,
.md3-ui .fui-Input[data-fui-focus-within] {
  border-color: ${c('primary')};
  box-shadow: inset 0 0 0 1px ${c('primary')};
}
.md3-ui .fui-Input__input,
.md3-ui .fui-Textarea__textarea {
  font-family: var(--md-ref-typeface-plain);
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
  letter-spacing: var(--md-sys-typescale-body-large-tracking);
  color: ${c('on-surface')};
}
.md3-ui .fui-Input__input::placeholder,
.md3-ui .fui-Textarea__textarea::placeholder {
  color: ${c('on-surface-variant')};
}
.md3-ui .fui-Input__contentBefore,
.md3-ui .fui-Input__contentAfter,
.md3-ui .fui-SearchBox__contentBefore,
.md3-ui .fui-SearchBox__contentAfter {
  color: ${c('on-surface-variant')};
}
/* 禁用 = on-surface 12% 底 + 38% 文本 */
.md3-ui .fui-Input:has(.fui-Input__input:disabled),
.md3-ui .fui-Textarea:has(.fui-Textarea__textarea:disabled) {
  background-color: color-mix(in srgb, ${c('on-surface')} 4%, transparent);
  border-color: color-mix(in srgb, ${c('on-surface')} 12%, transparent);
}
.md3-ui .fui-Input__input:disabled,
.md3-ui .fui-Textarea__textarea:disabled {
  color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
}

/* 字段标签与提示:label-medium / body-small */
.md3-ui .fui-Field__label,
.md3-ui .fui-Label {
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  color: ${c('on-surface-variant')};
}
.md3-ui .fui-Field__hint {
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  color: ${c('on-surface-variant')};
}

/* --------------------------------------------------------------------------
   3. 开关(Switch)M3 规格:轨道 52×32、滑块 24(选中 28)、全圆角
   Fluent 结构中 indicator 是轨道、其内 <i> 是滑块,选中时 translateX(20px);
   52 - 24 - 4*2 = 20,故沿用 Fluent 的位移量即可,只需改尺寸。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Switch__indicator {
  width: 52px;
  height: 32px;
  box-sizing: border-box;
  /* 2px 边框 + 2px 内边距 = 滑块距轨道外缘 4px(对齐 M3 的 24px 手柄 / 4px 留白),
     同时让滑块行程恰好等于 Fluent 硬编码的 translateX(20px),无需覆盖位移量 */
  padding: 2px;
  font-size: 24px;
  border-width: 2px;
  border-color: ${c('outline')};
  background-color: ${c('surface-container-highest')};
}
.md3-ui .fui-Switch__indicator > * {
  transition-duration: var(--md-sys-motion-duration-medium2);
  transition-timing-function: var(--md-sys-motion-emphasized-easing);
}
/* 选中轨道:primary,无边框(Fluent 把 checked 放在隐藏 input 上,故用 :checked 兄弟选择器) */
.md3-ui .fui-Switch__input:checked ~ .fui-Switch__indicator {
  background-color: ${c('primary')};
  border-color: ${c('primary')};
}
/* 未选中:轨道用 surface-container-highest + outline 环 */
.md3-ui .fui-Switch__input:not(:checked):enabled ~ .fui-Switch__indicator {
  background-color: ${c('surface-container-highest')};
  border-color: ${c('outline')};
}
.md3-ui .fui-Switch__input:not(:checked):enabled:hover ~ .fui-Switch__indicator {
  background-color: color-mix(in srgb, ${c('on-surface')} 8%, ${c('surface-container-highest')});
}
.md3-ui .fui-Switch__input:checked:enabled:hover ~ .fui-Switch__indicator {
  background-color: color-mix(in srgb, ${c('primary')} 92%, ${c('on-primary')});
}
/* 选中滑块 = on-primary;未选中 = outline(M3 未选中手柄是描边圆圈) */
.md3-ui .fui-Switch__input:checked ~ .fui-Switch__indicator > * {
  color: ${c('on-primary')};
}
.md3-ui .fui-Switch__input:not(:checked) ~ .fui-Switch__indicator > * {
  color: ${c('outline')};
}
/* 小号开关(size="small")暂无使用处:轨道类的格里芬哈希随构建变化,
   不写死哈希,等真用到时再用 data-* 钩子补。 */
.md3-ui .fui-Switch__label {
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
  color: ${c('on-surface')};
}
.md3-ui .fui-Switch__input:disabled ~ .fui-Switch__label {
  color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
}

/* --------------------------------------------------------------------------
   4. 复选框(Checkbox)M3:18px、圆角 2px、2px 描边;选中 = primary 填充 + 白勾
   -------------------------------------------------------------------------- */
.md3-ui .fui-Checkbox__indicator {
  width: 18px;
  height: 18px;
  font-size: 14px;
  border-radius: 2px;
  border-width: 2px;
}
/* 圆形/大号变体暂无使用处:其类名是格里芬哈希,随构建变化,不写死。 */
/* 选中填充 primary + on-primary 勾 */
.md3-ui .fui-Checkbox__input:checked ~ .fui-Checkbox__indicator {
  background-color: ${c('primary')};
  border-color: ${c('primary')};
  color: ${c('on-primary')};
}
.md3-ui .fui-Checkbox__input:checked:hover ~ .fui-Checkbox__indicator {
  background-color: color-mix(in srgb, ${c('primary')} 92%, ${c('on-primary')});
  border-color: transparent;
}
/* 未选中:2px outline 环 */
.md3-ui .fui-Checkbox__input:not(:checked) ~ .fui-Checkbox__indicator {
  border-color: ${c('outline')};
  background-color: transparent;
}
.md3-ui .fui-Checkbox__input:not(:checked):hover ~ .fui-Checkbox__indicator {
  border-color: ${c('on-surface')};
}
.md3-ui .fui-Checkbox:hover {
  color: ${c('on-surface-variant')};
}
.md3-ui .fui-Checkbox__label {
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
}

/* --------------------------------------------------------------------------
   5. 单选框(Radio)M3:20px 外圈,内点 10px;选中 = primary 双环
   -------------------------------------------------------------------------- */
.md3-ui .fui-Radio__indicator {
  width: 20px;
  height: 20px;
  border-width: 2px;
}
.md3-ui .fui-Radio__indicator::after {
  width: 20px;
  height: 20px;
  transform: scale(0.5);
}
.md3-ui .fui-Radio__input:not(:checked) ~ .fui-Radio__indicator {
  border-color: ${c('outline')};
}
.md3-ui .fui-Radio__input:not(:checked):hover ~ .fui-Radio__indicator {
  border-color: ${c('on-surface')};
}
.md3-ui .fui-Radio__input:checked ~ .fui-Radio__indicator {
  border-color: ${c('primary')};
  color: ${c('primary')};
}
.md3-ui .fui-Radio__input:checked:hover ~ .fui-Radio__indicator {
  border-color: color-mix(in srgb, ${c('primary')} 92%, ${c('on-primary')});
  color: color-mix(in srgb, ${c('primary')} 92%, ${c('on-primary')});
}
.md3-ui .fui-Radio__label {
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
}
.md3-ui .fui-Radio__input:enabled:not(:checked) ~ .fui-Radio__label {
  color: ${c('on-surface')};
}
.md3-ui .fui-Radio__input:enabled:checked ~ .fui-Radio__label {
  color: ${c('on-surface')};
}

/* --------------------------------------------------------------------------
   6. 滑块(Slider)M3:轨道 4px(选中段 primary / 未选中段 surface-variant)、
   手柄 4×44 药丸 —— M3 的手柄不是圆形,这是与 Fluent 最显著的造型差异。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Slider {
  --fui-Slider__rail--size: 4px;
  --fui-Slider__thumb--size: 20px;
}
.md3-ui .fui-Slider__rail {
  border-radius: ${shape('full')};
}
/* 手柄:M3 竖直药丸 4×44 */
.md3-ui .fui-Slider__thumb {
  width: 4px;
  height: 44px;
  border-radius: ${shape('full')};
  box-shadow: none;
  background-color: ${c('primary')};
}
.md3-ui .fui-Slider__thumb::before {
  border: none;
  border-radius: ${shape('full')};
}
.md3-ui .fui-Slider__thumb:hover {
  width: 6px;
}
/* 轨道颜色:未选中段 surface-variant(由 Fluent 的 --fui-Slider__rail--color 驱动) */
.md3-ui .fui-Slider {
  --fui-Slider__rail--color: ${c('surface-variant')};
  --fui-Slider__progress--color: ${c('primary')};
  --fui-Slider__thumb--color: ${c('primary')};
}
/* 禁用:on-surface 38% / 12% */
.md3-ui .fui-Slider[aria-disabled='true'],
.md3-ui .fui-Slider:has(.fui-Slider__input:disabled) {
  --fui-Slider__rail--color: color-mix(in srgb, ${c('on-surface')} 12%, transparent);
  --fui-Slider__progress--color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
  --fui-Slider__thumb--color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
}

/* --------------------------------------------------------------------------
   7. 标签页(Tab / TabList)
   横向 = M3 主标签(3px 圆角指示条,选中 primary);
   竖向 = M3 导航抽屉项(全圆角药丸,选中 secondary-container)。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Tab {
  font-size: var(--md-sys-typescale-title-small-size);
  line-height: var(--md-sys-typescale-title-small-line-height);
  font-weight: var(--md-sys-typescale-title-small-weight);
  letter-spacing: var(--md-sys-typescale-title-small-tracking);
  transition:
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing);
}
/* 横向指示条:3px 圆角、贴底、两端留白(M3 主标签) */
.md3-ui .fui-TabList[aria-orientation='horizontal'] .fui-Tab::after {
  height: 3px;
  border-radius: ${shape('full')};
  left: 12px;
  right: 12px;
  bottom: 0;
}
.md3-ui .fui-TabList[aria-orientation='horizontal'] .fui-Tab[aria-selected='true'] {
  color: ${c('primary')};
}
/* 竖向导航项:全圆角药丸 + 选中 secondary-container */
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab {
  border-radius: ${shape('full')};
  min-height: 48px;
  padding: 0 16px;
  justify-content: flex-start;
  color: ${c('on-surface-variant')};
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
}
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab::after,
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab::before {
  display: none;
}
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab[aria-selected='true'] {
  background-color: ${c('secondary-container')};
  color: ${c('on-secondary-container')};
}
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab[aria-selected='true']:hover {
  background-color: color-mix(in srgb, ${c('secondary-container')} 92%, ${c('on-secondary-container')});
}
.md3-ui .fui-TabList[aria-orientation='vertical'] .fui-Tab:not([aria-selected='true']):hover {
  background-color: ${stateLayer(8)};
}
.md3-ui .fui-Tab__icon {
  font-size: 22px;
}

/* --------------------------------------------------------------------------
   8. 菜单(Menu / MenuPopover / MenuItem)
   M3 菜单:surface-container 容器、extra-small 圆角、海拔 2;菜单项全圆角状态层。
   -------------------------------------------------------------------------- */
.md3-ui .fui-MenuPopover,
.md3-ui .fui-PopoverSurface {
  border-radius: ${shape('extra-small')};
  background-color: ${c('surface-container')};
  border: none;
  box-shadow: ${el(2)};
  padding: 8px;
}
.md3-ui .fui-MenuList {
  gap: 0;
}
.md3-ui .fui-MenuItem {
  min-height: 48px;
  border-radius: ${shape('full')};
  padding: 0 12px;
  font-size: var(--md-sys-typescale.label-large-size);
  line-height: var(--md-sys-typescale-label-large-line-height);
  font-weight: var(--md-sys-typescale-label-large-weight);
  letter-spacing: var(--md-sys-typescale-label-large-tracking);
  color: ${c('on-surface')};
  transition: background-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-standard-easing);
}
.md3-ui .fui-MenuItem:hover {
  background-color: ${stateLayer(8)};
}
.md3-ui .fui-MenuItem:active {
  background-color: ${stateLayer(10)};
}
.md3-ui .fui-MenuItem[aria-disabled='true'] {
  color: color-mix(in srgb, ${c('on-surface')} 38%, transparent);
}
.md3-ui .fui-MenuItem__icon {
  color: ${c('on-surface-variant')};
  font-size: 20px;
}
.md3-ui .fui-MenuItem__subText,
.md3-ui .fui-MenuItem__secondaryContent {
  color: ${c('on-surface-variant')};
  font-size: var(--md-sys-typescale-body-small-size);
}
.md3-ui .fui-MenuDivider {
  background-color: ${c('outline-variant')};
  margin: 8px 0;
}
.md3-ui .fui-MenuGroupHeader {
  color: ${c('on-surface-variant')};
  font-size: var(--md-sys-typescale-label-medium-size);
}

/* --------------------------------------------------------------------------
   9. 对话框(Dialog)M3:surface-container-high 容器、extra-large 圆角(28px)、
   海拔 3;遮罩 = scrim 32%。
   -------------------------------------------------------------------------- */
.md3-ui .fui-DialogSurface {
  border-radius: ${shape('extra-large')};
  background-color: ${c('surface-container-high')};
  box-shadow: ${el(3)};
  padding: 24px;
  border: none;
}
.md3-ui .fui-DialogSurface__backdrop {
  background-color: color-mix(in srgb, ${c('scrim')} 32%, transparent);
  backdrop-filter: none;
}
.md3-ui .fui-DialogTitle {
  font-size: var(--md-sys-typescale-headline-small-size);
  line-height: var(--md-sys-typescale-headline-small-line-height);
  font-weight: var(--md-sys-typescale-headline-small-weight);
  color: ${c('on-surface')};
  padding: 0;
}
.md3-ui .fui-DialogContent {
  color: ${c('on-surface-variant')};
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
}
.md3-ui .fui-DialogBody {
  gap: 16px;
}
.md3-ui .fui-DialogActions {
  gap: 8px;
  padding: 0;
}
/* Drawer 同族容器语言 */
.md3-ui .fui-Drawer,
.md3-ui .fui-OverlayDrawer {
  border-radius: 0 ${shape('extra-large')} ${shape('extra-large')} 0;
  background-color: ${c('surface-container-low')};
}
.md3-ui .fui-OverlayDrawer__backdrop {
  background-color: color-mix(in srgb, ${c('scrim')} 32%, transparent);
}

/* --------------------------------------------------------------------------
   10. 卡片(Card)M3:surface-container-low、medium 圆角(12px)、海拔 0→1
   -------------------------------------------------------------------------- */
.md3-ui .fui-Card {
  border-radius: ${shape('medium')};
  background-color: ${c('surface-container-low')};
  box-shadow: ${el(0)};
  border: none;
  transition:
    box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing),
    background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing);
}
/* 可交互卡片:悬停抬升到海拔 1(M3 卡片状态层 + elevation) */
.md3-ui button.fui-Card:hover,
.md3-ui a.fui-Card:hover,
.md3-ui .fui-Card[data-md3-interactive='true']:hover {
  box-shadow: ${el(1)};
  background-color: ${c('surface-container')};
}
.md3-ui .fui-Card[data-md3-appearance='filled-alternative'] {
  background-color: ${c('surface-container-highest')};
}
.md3-ui .fui-Card[data-md3-appearance='outline'] {
  background-color: ${c('surface')};
  border: 1px solid ${c('outline-variant')};
  box-shadow: ${el(0)};
}
.md3-ui .fui-CardHeader__header {
  font-size: var(--md-sys-typescale-title-medium-size);
  line-height: var(--md-sys-typescale-title-medium-line-height);
  font-weight: var(--md-sys-typescale-title-medium-weight);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
}
.md3-ui .fui-CardHeader__description {
  font-size: var(--md-sys-typescale-body-medium-size);
  color: ${c('on-surface-variant')};
}

/* --------------------------------------------------------------------------
   11. 进度条(ProgressBar)M3 线性:4px 全圆角轨道 + primary 指示段
   -------------------------------------------------------------------------- */
.md3-ui .fui-ProgressBar {
  height: 4px;
}
.md3-ui .fui-ProgressBar__bar {
  border-radius: ${shape('full')};
}
.md3-ui .fui-ProgressBar .fui-ProgressBar__bar {
  background-color: ${c('primary')};
}

/* --------------------------------------------------------------------------
   12. 加载指示(Spinner)M3 圆形进度:4px 描边、primary
   -------------------------------------------------------------------------- */
.md3-ui .fui-Spinner {
  --fui-Spinner--strokeWidth: 4px;
  color: ${c('primary')};
}
.md3-ui .fui-Spinner__label {
  font-size: var(--md-sys-typescale-body-medium-size);
  color: ${c('on-surface-variant')};
}

/* --------------------------------------------------------------------------
   13. 提示(Tooltip)与吐司(Toast)
   M3 提示/信息条:inverse-surface 容器 + inverse-on-surface 文本,extra-small 圆角。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Tooltip__content {
  border-radius: ${shape('extra-small')};
  background-color: ${c('inverse-surface')};
  color: ${c('inverse-on-surface')};
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  padding: 6px 8px;
}
.md3-ui .fui-Toast {
  border-radius: ${shape('extra-small')};
  background-color: ${c('inverse-surface')};
  color: ${c('inverse-on-surface')};
  box-shadow: ${el(3)};
  font-size: var(--md-sys-typescale-body-medium-size);
}
.md3-ui .fui-ToastTitle {
  color: ${c('inverse-on-surface')};
  font-size: var(--md-sys-typescale-title-small-size);
  font-weight: var(--md-sys-typescale-title-small-weight);
}
.md3-ui .fui-ToastBody {
  color: ${c('inverse-on-surface')};
}
.md3-ui .fui-ToastBody__subtitle {
  color: color-mix(in srgb, ${c('inverse-on-surface')} 80%, transparent);
}
.md3-ui .fui-ToastFooter .fui-Button[data-md3-appearance='subtle'],
.md3-ui .fui-Toast .fui-Button[data-md3-appearance='subtle'] {
  color: ${c('inverse-primary')};
}

/* --------------------------------------------------------------------------
   14. 分隔线 / 徽标 / 头像 / Persona
   -------------------------------------------------------------------------- */
.md3-ui .fui-Divider {
  background-color: ${c('outline-variant')};
}
.md3-ui .fui-Divider__wrapper {
  color: ${c('on-surface-variant')};
  font-size: var(--md-sys-typescale-label-medium-size);
}
.md3-ui .fui-Badge {
  border-radius: ${shape('full')};
  font-size: var(--md-sys-typescale-label-small-size);
  font-weight: var(--md-sys-typescale-label-small-weight);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
}
.md3-ui .fui-Persona__primaryText {
  font-size: var(--md-sys-typescale-body-large-size);
  color: ${c('on-surface')};
}
.md3-ui .fui-Persona__secondaryText {
  font-size: var(--md-sys-typescale-body-small-size);
  color: ${c('on-surface-variant')};
}
.md3-ui .fui-Persona__avatar {
  border-radius: ${shape('full')};
}

/* --------------------------------------------------------------------------
   15. 下拉选项(Option)与列表项状态层
   -------------------------------------------------------------------------- */
.md3-ui .fui-Option {
  min-height: 44px;
  border-radius: ${shape('full')};
  font-size: var(--md-sys-typescale-body-large-size);
}
.md3-ui .fui-Option:hover {
  background-color: ${stateLayer(8)};
}
.md3-ui .fui-Option[aria-selected='true'] {
  background-color: ${c('secondary-container')};
  color: ${c('on-secondary-container')};
}
.md3-ui .fui-Option__checkIcon {
  color: ${c('primary')};
}

/* --------------------------------------------------------------------------
   16. 焦点环(M3:2px primary,带 2px 内缩留白)
   Fluent 的焦点环由 colorStrokeFocus1/2 + strokeWidth 驱动,已在 theme 中对齐;
   这里只补 M3 的圆角跟随与偏移,避免方形环套在药丸控件上。
   -------------------------------------------------------------------------- */
.md3-ui .fui-Button[data-fui-focus-visible]::after,
.md3-ui .fui-Tab[data-fui-focus-visible]::after {
  border-radius: inherit;
}
.md3-ui [data-fui-focus-visible] {
  outline-color: ${c('primary')};
}

/* --------------------------------------------------------------------------
   17. Material Symbols 图标字形
   -------------------------------------------------------------------------- */
.md3-ui .md3-icon,
.md3-ui .material-symbols-rounded {
  font-family: var(--md-icon-font);
  font-weight: normal;
  font-style: normal;
  font-size: 20px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  transition: font-variation-settings var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing);
}
/* 激活态图标填充(M3 的 selected 图标用实心) */
.md3-ui .fui-Tab[aria-selected='true'] .md3-icon,
.md3-ui .fui-Button[data-md3-appearance='primary'] .md3-icon,
.md3-ui .fui-ToggleButton[aria-pressed='true'] .md3-icon {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

/* --------------------------------------------------------------------------
   18. 滚动条与选区(M3 取 outline / primary)
   -------------------------------------------------------------------------- */
.md3-ui ::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, ${c('on-surface')} 30%, transparent);
  border-radius: ${shape('full')};
  background-clip: content-box;
  border: 2px solid transparent;
}
.md3-ui ::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, ${c('on-surface')} 50%, transparent);
  background-clip: content-box;
  border: 2px solid transparent;
}
.md3-ui ::selection {
  background: ${c('primary-container')};
  color: ${c('on-primary-container')};
}

/* --------------------------------------------------------------------------
   19. 应用自有类(song-row / dl-row / 品牌标记等)的 M3 造型对齐
   -------------------------------------------------------------------------- */
.md3-ui .song-row {
  border-radius: ${shape('full')};
  transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-emphasized-easing);
}
.md3-ui .song-row:hover {
  background-color: ${stateLayer(8)};
}
.md3-ui .dl-row {
  border-radius: ${shape('large')};
}
.md3-ui .cover-fallback {
  border-radius: ${shape('small')};
}
.md3-ui .eq-bar {
  background: ${c('primary')};
  border-radius: ${shape('full')};
}
`.trim()
}
