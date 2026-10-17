/** 侦察:renderer 里用到 @fluentui/react-components 的完整 API 面 + 每个标识符的用量 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'src/renderer/src'
const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e).replace(/\\/g, '/')
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e)) files.push(p)
  }
})(root)

const used = new Map()
const perFile = {}
let otherImports = new Map()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const re = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g
  let m
  const mine = []
  while ((m = re.exec(src))) {
    const mod = m[2]
    if (mod.startsWith('@fluentui/react-components')) {
      for (const n of m[1].split(',')) {
        const t = n.trim()
        if (!t) continue
        used.set(t, (used.get(t) || 0) + 1)
        mine.push(t)
      }
    } else if (mod.startsWith('@fluentui/')) {
      otherImports.set(mod, (otherImports.get(mod) || 0) + 1)
      for (const n of m[1].split(',')) {
        const t = n.trim()
        if (!t) continue
        used.set(t, (used.get(t) || 0) + 1)
        mine.push(t)
      }
    }
  }
  if (mine.length) perFile[f] = mine
}

// 统计 JSX/代码里的实际使用次数(粗略:出现次数-import 1次)
const counts = new Map()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const name of used.keys()) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    const n = (src.match(re) || []).length
    if (n > 1) counts.set(name, (counts.get(name) || 0) + (n - 1))
  }
}

console.log('=== FLUENT_API (' + used.size + ') ===')
for (const [k, v] of [...used.entries()].sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0))) {
  console.log(String(counts.get(k) || 0).padStart(4), k)
}
console.log('=== OTHER FLUENT MODULES ===')
for (const [k, v] of otherImports) console.log(v, k)
console.log('=== PER FILE ===')
for (const [f, names] of Object.entries(perFile)) console.log(f, '::', names.join(','))
