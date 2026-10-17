/* 把导入了 Button / Card 的文件,其 '@fluentui/react-components' 导入源改写为 ui/controls 外观层。
 * 外观层 `export *` 透出其余组件,故只需换导入源,导入名单一字不动。 */
import fs from 'node:fs'
import path from 'node:path'

const NEED = ['Button', 'Card']

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const changed = []
for (const f of walk('src/renderer/src')) {
  const rel = f.replace(/\\/g, '/')
  if (rel.includes('/ui/controls.tsx')) continue

  const src = fs.readFileSync(f, 'utf8')
  let mutated = false
  const out = src.replace(/import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-components'/g, (full, inner) => {
    const names = inner
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    if (!names.some((n) => NEED.includes(n))) return full

    // 从 src/renderer/src 到 ui/controls 的相对路径
    const segs = rel.split('/').slice('src/renderer/src'.split('/').length, -1)
    const target = segs.length ? `${'../'.repeat(segs.length)}ui/controls` : './ui/controls'
    mutated = true
    return full.replace("'@fluentui/react-components'", `'${target}'`)
  })
  if (mutated) {
    fs.writeFileSync(f, out)
    changed.push(rel)
  }
}

console.log('rerouted:', changed.length)
for (const c of changed) console.log('  ', c)
