/* 清点 renderer 从 @fluentui/react-components 导入的全部组件,以及各自影响造型的 props。
 * 结论用于设计控件外观层(ui/controls.tsx)需要包裹哪些组件。 */
import fs from 'node:fs'
import path from 'node:path'

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx$/.test(e.name)) acc.push(p)
  }
  return acc
}

/** Fluent 组件里会改变"造型"(而非内容)的 props */
const SHAPE_PROPS = [
  'appearance', 'size', 'shape', 'iconOnly', 'layout', 'orientation', 'vertical',
  'labelPosition', 'checked', 'iconPosition', 'resize', 'thickness', 'circular', 'inline'
]

const files = walk('src/renderer/src')
const comps = {}       // 组件名 → 出现次数
const propsPerComp = {} // 组件名 → Set(props)

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = f.replace(/\\/g, '/')

  // 该文件导入了哪些组件
  const imported = new Set()
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'@fluentui\/react-components'/g)) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim()
      if (n && /^[A-Z]/.test(n)) imported.add(n)
    }
  }

  for (const name of imported) {
    // 统计 JSX 使用次数(开标签)
    const uses = [...src.matchAll(new RegExp(`<${name}\\b`, 'g'))].length
    if (!uses) continue
    comps[name] = (comps[name] ?? 0) + uses
    propsPerComp[name] = propsPerComp[name] ?? new Set()
    // 抓该组件开标签内的 props
    for (const m of src.matchAll(new RegExp(`<${name}\\b([\\s\\S]{0,500}?)/?>`, 'g'))) {
      const body = m[1]
      for (const sp of SHAPE_PROPS) {
        if (new RegExp(`\\b${sp}\\s*[=/>]`).test(body)) propsPerComp[name].add(sp)
      }
    }
  }
}

const rows = Object.entries(comps)
  .sort((a, b) => b[1] - a[1])
  .map(([n, c]) => `${n.padEnd(22)} uses=${String(c).padStart(3)}  shape-props=[${[...(propsPerComp[n] ?? [])].join(', ')}]`)

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/component-inventory.txt', rows.join('\n') + '\n')
console.log('components used:', Object.keys(comps).length)
console.log(rows.join('\n'))
console.log('\n=== 需要 data- 镜像的(带造型 props) ===')
for (const [n, c] of Object.entries(comps).sort((a, b) => b[1] - a[1])) {
  const sp = [...(propsPerComp[n] ?? [])]
  if (sp.length) console.log(`${n.padEnd(22)} uses=${String(c).padStart(3)}  [${sp.join(', ')}]`)
}
