/* 审查 M3 造型层的选择器:把每个依赖 DOM 属性/状态的选择器与"实测存在的钩子"清单对照。
 * 实测清单来自 CDP 全站扫描(tests/.out/probe-all-attrs.json)。 */
import fs from 'node:fs'

const KNOWN = {
  // 实测存在的 data-* 钩子
  data: [
    'data-fui-focus-visible',
    'data-fui-focus-within',
    'data-fui-icon',
    'data-tabster',
    'data-toaster-position',
    'data-popper-placement',
    'data-md3-appearance', // 我们外观层镜像的
    'data-md3-size',
    'data-md3-shape',
    'data-md3-icon-only',
    'data-md3-interactive'
  ],
  // 实测存在的 aria-* 钩子
  aria: [
    'aria-selected',
    'aria-checked',
    'aria-disabled',
    'aria-pressed',
    'aria-orientation',
    'aria-expanded',
    'aria-label',
    'aria-hidden'
  ],
  // 实测存在的结构性伪类/属性
  struct: [':hover', ':focus-within', ':active', ':disabled', ':checked', ':not(', ':has(', 'tabindex', 'role']
}

const src = fs.readFileSync('src/renderer/src/ui/md3/components.ts', 'utf8')
const lines = src.split(/\r?\n/)

const suspicious = []
lines.forEach((l, i) => {
  if (!l.includes('.md3-ui')) return
  // 抓所有 [attr...] 里的属性名(属性名含数字,如 data-md3-appearance)
  for (const m of l.matchAll(/\[([a-zA-Z][a-zA-Z0-9-]*)/g)) {
    const attr = m[1]
    const okData = KNOWN.data.includes(attr)
    const okAria = KNOWN.aria.includes(attr)
    if (!okData && !okAria) suspicious.push(`${String(i + 1).padStart(4)}| 未知属性 [${attr}]  →  ${l.trim().slice(0, 100)}`)
  }
  // 格里芬哈希:形如 .f1abc23 的类名(不稳定,构建后可能变)
  for (const m of l.matchAll(/\.(f[a-z0-9]{6,})(?![\w-])/g)) {
    const cls = m[1]
    if (/^fui-/.test(cls)) continue
    suspicious.push(`${String(i + 1).padStart(4)}| 疑似格里芬哈希 .${cls}  →  ${l.trim().slice(0, 100)}`)
  }
})

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/selector-audit.txt', suspicious.join('\n') + `\n\n总计 ${suspicious.length} 条可疑\n`)
console.log(suspicious.join('\n'))
console.log('\n总计', suspicious.length, '条可疑')
