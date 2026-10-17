/* 确认 Fluent Button 的 root 槽是否把剩余 props(含 data-*)铺到 <button> 上。
 * 这决定"M3 造型层能否用 data-md3-* 做钩子"。 */
import fs from 'node:fs'

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return '!! MISSING ' + e.message
  }
}

const files = [
  'node_modules/@fluentui/react-button/lib/components/Button/renderButton.js',
  'node_modules/@fluentui/react-button/lib/components/Button/Button.js',
  'node_modules/@fluentui/react-tabs/lib/components/TabList/useTabList.js'
]
const out = []
for (const f of files) out.push(`\n${'='.repeat(20)} ${f}\n${read(f)}`)
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/render-button.txt', out.join('\n'))
console.log(out.join('\n'))
