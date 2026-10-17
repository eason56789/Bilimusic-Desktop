/* 扫描 @fluentui 各包源码,列出组件真实写出的 data-* 属性与 aria-* 状态属性。
 * 目的:M3 造型层的选择器必须只依赖"真实存在于 DOM"的钩子。 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'node_modules/@fluentui'
const pkgs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('react-'))
  .map((e) => path.join(ROOT, e.name))

const dataAttrs = new Map() // 属性名 → 出现次数
const ariaAttrs = new Map()

function walk(d) {
  let ents = []
  try {
    ents = fs.readdirSync(d, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue
      walk(p)
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.map')) {
      let src = ''
      try {
        src = fs.readFileSync(p, 'utf8')
      } catch {
        continue
      }
      for (const m of src.matchAll(/['"`](data-[a-zA-Z0-9-]+)['"`]/g)) {
        dataAttrs.set(m[1], (dataAttrs.get(m[1]) ?? 0) + 1)
      }
      for (const m of src.matchAll(/['"`](aria-[a-zA-Z0-9-]+)['"`]/g)) {
        ariaAttrs.set(m[1], (ariaAttrs.get(m[1]) ?? 0) + 1)
      }
    }
  }
}
for (const p of pkgs) walk(p)

const dump = (map) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${String(v).padStart(4)}  ${k}`)
    .join('\n')

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync(
  'tests/.out/fluent-data-attrs.txt',
  `### data-* (${dataAttrs.size})\n${dump(dataAttrs)}\n\n### aria-* (${ariaAttrs.size})\n${dump(ariaAttrs)}\n`
)
console.log('### data-* attributes')
console.log(dump(dataAttrs))
console.log('\n### aria-* (top 40)')
console.log(dump(ariaAttrs).split('\n').slice(0, 40).join('\n'))
