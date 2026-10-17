/* 决定性实验:Fluent 组件是否把 data-* 属性铺到 DOM 根元素上?
 * 若可以,M3 造型层就能用 data-md3-* 作为稳定钩子(而非依赖 appearance/size/shape,
 * 因为 useButton 会把它们解构掉、根本不进 DOM)。 */
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'

const out = []
try {
  const { Button, Card, Input, Switch, Checkbox, Slider, Tab, TabList } = await import('@fluentui/react-components')

  out.push('=== Button: appearance + data-* ===')
  out.push(
    renderToStaticMarkup(
      React.createElement(Button, { appearance: 'primary', 'data-md3-appearance': 'primary', 'data-md3-size': 'small' }, 'Primary')
    )
  )

  out.push('\n=== Button: iconOnly(仅图标) ===')
  out.push(
    renderToStaticMarkup(
      React.createElement(Button, { appearance: 'subtle', icon: React.createElement('span', null, 'i') })
    )
  )

  out.push('\n=== Card: appearance + data-* ===')
  out.push(renderToStaticMarkup(React.createElement(Card, { appearance: 'outline', 'data-md3-appearance': 'outline' }, 'c')))

  out.push('\n=== Input: size + data-* ===')
  out.push(renderToStaticMarkup(React.createElement(Input, { size: 'large', 'data-md3-size': 'large' })))

  out.push('\n=== Switch: checked 是否落 DOM ===')
  out.push(renderToStaticMarkup(React.createElement(Switch, { checked: true, label: 's' })))

  out.push('\n=== Checkbox: checked 是否落 DOM ===')
  out.push(renderToStaticMarkup(React.createElement(Checkbox, { checked: true, label: 'c' })))

  out.push('\n=== Slider: vertical 是否落 DOM ===')
  out.push(renderToStaticMarkup(React.createElement(Slider, { vertical: true })))

  out.push('\n=== TabList: appearance / vertical 是否落 DOM ===')
  out.push(
    renderToStaticMarkup(
      React.createElement(
        TabList,
        { appearance: 'subtle', vertical: true },
        React.createElement(Tab, { value: 'a' }, 'A')
      )
    )
  )
} catch (e) {
  out.push('ERROR: ' + (e && e.stack ? e.stack : String(e)))
}

const fs = await import('node:fs')
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/ssr-probe.txt', out.join('\n'))
console.log(out.join('\n'))
