/* 确定 Fluent 的属性过滤会不会保留 data-*:
 * 这决定 M3 造型层能否用 data-md3-variant 这类自定义属性做钩子。 */
import fs from 'node:fs'
import path from 'node:path'

const root = 'node_modules/@fluentui/react-utilities/lib'
const hits = []

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.js') && !e.name.endsWith('.map')) {
      const src = fs.readFileSync(p, 'utf8')
      if (src.includes('export function getNativeProps') || src.includes('const getNativeProps')) {
        hits.push(p)
      }
    }
  }
}
walk(root)

const out = []
for (const p of hits) {
  const src = fs.readFileSync(p, 'utf8')
  const i = src.search(/getNativeProps/)
  out.push(`### ${p}\n${src.slice(Math.max(0, i - 400), i + 1400)}`)
}

// 同时看 properties.js 的 htmlElementProperties 是否含 data 前缀逻辑
const propFile = path.join(root, 'utils/properties.js')
let propSrc = ''
try {
  propSrc = fs.readFileSync(propFile, 'utf8')
} catch (e) {
  propSrc = 'MISSING ' + e.message
}
out.push(`\n### properties.js (head)\n${propSrc.slice(0, 1200)}`)
out.push(`\n### properties.js 中 data 的出现次数: ${(propSrc.match(/data/g) ?? []).length}`)

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/getnativeprops.txt', out.join('\n\n'))
console.log('files with getNativeProps:', hits.length)
for (const h of hits) console.log(' ', h)
console.log('written tests/.out/getnativeprops.txt')
