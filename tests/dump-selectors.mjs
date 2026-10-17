/* 打印 components.ts 中所有依赖 DOM 属性的选择器行,便于精确重写为 data-md3-* 钩子 */
import fs from 'node:fs'

const src = fs.readFileSync('src/renderer/src/ui/md3/components.ts', 'utf8')
const lines = src.split(/\r?\n/)
const out = []
lines.forEach((l, i) => {
  if (/data-checked|data-circular|iconOnly|:has\(|\[appearance|\[size=|\[shape=|not\(\[appearance\]\)/.test(l)) {
    out.push(`${String(i + 1).padStart(4)}| ${l}`)
  }
})
console.log(out.join('\n'))
console.log('\n--- total lines:', lines.length)
