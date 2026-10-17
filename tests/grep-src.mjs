// 搜索 renderer 源码里的关键词(规避 findstr 的代码页问题)
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src', 'renderer', 'src')
const keys = process.argv.slice(2)

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const hits = []
for (const file of walk(SRC)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (keys.some((k) => line.includes(k))) {
      hits.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim().slice(0, 200)}`)
    }
  })
}
console.log(hits.join('\n') || '(no hits)')
