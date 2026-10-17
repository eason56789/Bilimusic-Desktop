// 统计 renderer 里实际用到的 Fluent 「外观/尺寸」类 props,确保 M3 组件层覆盖所有变体。
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src', 'renderer', 'src')

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const counters = {}
const bump = (k) => (counters[k] = (counters[k] || 0) + 1)

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(SRC, file).replace(/\\/g, '/')
  for (const m of src.matchAll(/\bappearance=["'{]([^"'}\n]+)["'}]/g)) bump(`${rel} :: appearance=${m[1]}`)
  for (const m of src.matchAll(/\bshape=["'{]([^"'}\n]+)["'}]/g)) bump(`${rel} :: shape=${m[1]}`)
  for (const m of src.matchAll(/\bsize=["']?(small|medium|large|tiny|extra-small|extra-large)["']?/g))
    bump(`${rel} :: size=${m[1]}`)
  for (const m of src.matchAll(/\b(?:icon|iconPosition|layout)=["'](before|after|horizontal|vertical|aside|icon|primary|secondary)["']/g))
    bump(`${rel} :: ${m[0]}`)
}

const out = Object.keys(counters)
  .sort()
  .map((k) => `${String(counters[k]).padStart(3)}  ${k}`)
fs.mkdirSync(path.join(process.cwd(), 'tests', '.out'), { recursive: true })
const dest = path.join(process.cwd(), 'tests', '.out', 'appearances.txt')
fs.writeFileSync(dest, out.join('\n'), 'utf8')
console.log('written', dest, out.length, 'lines')
