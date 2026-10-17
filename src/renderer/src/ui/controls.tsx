/**
 * 控件外观层:经典 Fluent / Material 3 共用一个调用面。
 *
 * 为什么需要一层:经典 Fluent 把 `appearance` / `size` / `shape` 在内部解构掉了,
 * 它们只参与格里芬(Griffel)样式计算,**不会写进 DOM**(实测 `fui-Button` 上只有
 * type / class / disabled / aria-*)。于是 CSS 里 `[appearance='primary']` 这类选择器
 * 永远命不中——MD3 的填充 /  tonal / 描边 / 文本四种按钮会一起退化成同一种。
 *
 * Fluent 的 getNativeProps 明确放行 `data-*`(源码注释:"all data- and aria- prefixed
 * attributes will be allowed"),因此这里把造型 props 原样镜像成 `data-md3-*` 属性,
 * 供 ui/md3/components.ts 的选择器使用。经典 Fluent 模式下这些属性是惰性的,
 * 不参与任何原有样式,故两套 UI 可以并存。
 *
 * 只需包住"造型 props 不落 DOM 且 MD3 样式依赖它"的组件;其余组件(如 Tabs / Switch /
 * Checkbox / Slider / Radio,它们的状态都能通过 input 状态或 aria-* 选择器拿到)
 * 直接透出即可。
 */
import * as React from 'react'
import {
  Button as FluentButton,
  Card as FluentCard,
  type ButtonProps,
  type CardProps
} from '@fluentui/react-components'

// 其余组件、hooks 与 tokens 原样透出:调用方只改导入源,不改导入名单。
export * from '@fluentui/react-components'

/** 镜像出来的属性名(Fluent 的 props 类型未声明任意 data-*,故此处收口) */
type Md3Attrs = Record<`data-md3-${string}`, string | undefined>

/** 丢掉值为 undefined 的项,避免在 DOM 上留一排空属性 */
function attrs(o: Record<string, string | undefined>): Md3Attrs {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[`data-md3-${k}`] = v
  return out as Md3Attrs
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  // 默认值必须与 useButton 内部一致,否则镜像出去的语义会和实际渲染不同
  const { appearance = 'secondary', size = 'medium', shape = 'rounded', icon, children } = props
  return (
    <FluentButton
      ref={ref}
      {...props}
      {...attrs({
        appearance,
        size,
        shape,
        // Fluenty 的 iconOnly 判定:有图标且无文本
        'icon-only': Boolean(icon) && !children ? 'true' : undefined
      })}
    />
  )
})
Button.displayName = 'BiliMusicButton'

/** 与 useCard 一致的可交互判定:出现任一指针/鼠标事件即视为可交互 */
const CARD_INTERACTIVE_PROPS = ['onClick', 'onMouseDown', 'onMouseUp', 'onPointerDown', 'onPointerUp'] as const

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(props, ref) {
  const { appearance = 'filled' } = props
  const interactive = CARD_INTERACTIVE_PROPS.some(
    (p) => (props as Record<string, unknown>)[p] !== undefined
  )
  return (
    <FluentCard
      ref={ref}
      {...props}
      {...attrs({ appearance, interactive: interactive ? 'true' : undefined })}
    />
  )
})
Card.displayName = 'BiliMusicCard'
