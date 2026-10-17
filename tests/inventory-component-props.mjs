/* 清点 renderer 里 Fluent 组件的实际用法:哪些组件、带哪些影响造型的 props。
 * 用途:M3 造型层需要一个能把 appearance/size/shape 透传到 DOM 的外观层。 */
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

const files = walk('src/renderer/src')
const out = {}

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = f.replace(/\\/g, '/').replace('src/renderer/src/', '')
  // 收集从 react-components 导入的组件名
  const imported = new Set()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-components'/g)) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim()
      if (n) imported.add(n)
    }
  }
  // 找 JSX 里对这些组件的使用及 props(仅取开标签那一行/跨行标签的前几行)
  for (const name of imported) {
    const re = new RegExp(`<${name}\\b([\\s\\S]{0,400}?)(/?>)`, 'g')
    for (const m of src.matchAll(re)) {
      const body = m[1]
      for (const pm of body.matchAll(/\b(appearance|size|shape|layout|orientation|iconPosition|checked|disabled|circular)\s*=\s*("[^"]*"|\{[^}]*\})/g)) {
        const key = `${name}.${pm[1]}`
        const val = pm[2].replace(/[{}"]/g, '')
        out[key] = out[key] ?? {}
        out[key][val] = (out[key][val] ?? 0) + 1
      }
    }
  }
}

const lines = Object.entries(out)
  .sort()
  .map(([k, vals]) => `${k}  →  ${Object.entries(vals).map(([v, c]) => `${v}×${c}`).join(', ')}`)
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/component-props.txt', lines.join('\n') + '\n')

const byComp = {}
for (const [k] of Object.entries(out)) {
  const [comp, prop] = k.split('.')
  byComp[comp] = byComp[comp] ?? new Set()
  byComp[comp].add(prop)
}
console.log('=== 需要透传 props 的组件 ===')
for (const [comp, props] of Object.entries(byComp).sort()) {
  console.log(comp.padEnd(16), [...props].join(', '))
}
console.log('\n' + lines.join('\n'))
