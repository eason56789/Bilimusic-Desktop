/** 侦察:统计 renderer 里所有 @fluentui/react-icons 的图标名 + 文件清单 + css 清单 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'src/renderer/src'
const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e).replace(/\\/g, '/')
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.(tsx?|css)$/.test(e)) files.push(p)
  }
})(root)

const icons = new Map()
const byFile = {}
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const blocks = src.match(/import\s*\{[^}]*\}\s*from\s*'@fluentui\/react-icons'/g)
  if (!blocks) continue
  const names = new Set()
  for (const b of blocks) {
    const inner = b.match(/\{([^}]*)\}/)[1]
    for (const n of inner.split(',')) {
      const t = n.trim()
      if (t) names.add(t)
    }
  }
  byFile[f] = [...names]
  for (const n of names) icons.set(n, (icons.get(n) || 0) + 1)
}

console.log('FILES', files.length)
console.log('ICON_FILES', Object.keys(byFile).length)
console.log('UNIQUE_ICONS', icons.size)
console.log('---ICONS---')
console.log([...icons.keys()].sort().join('\n'))
console.log('---CSS---')
console.log(files.filter((f) => f.endsWith('.css')).join('\n'))
console.log('---ALL_FILES---')
console.log(files.join('\n'))
