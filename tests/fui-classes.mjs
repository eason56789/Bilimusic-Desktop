/** 提取 Fluent 组件真实 DOM 类名(fui-*),作为 MD3 造型层的选择器依据 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

mkdirSync('tests/.out', { recursive: true })
const root = 'node_modules/@fluentui'
const hits = new Map()

function walk(d) {
  let ents
  try {
    ents = readdirSync(d, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      walk(p)
      continue
    }
    if (!/\.(js|mjs|cjs)$/.test(e.name)) continue
    let s
    try {
      s = readFileSync(p, 'utf8')
    } catch {
      continue
    }
    for (const m of s.matchAll(/['"`]([A-Za-z0-9_-]*fui-[A-Za-z0-9_-]+)['"`]/g)) {
      const cls = m[1]
      if (!hits.has(cls)) hits.set(cls, p)
    }
  }
}
walk(root)

const keys = [...hits.keys()].sort()
console.log('TOTAL', keys.length)
const out = keys.map((k) => k).join('\n')
writeFileSync('tests/.out/fui-classes.txt', out, 'utf8')
console.log(out)
