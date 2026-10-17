// 按文件过滤关键词命中(替代 findstr,避免中文代码页问题)
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src')
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
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (keys.some((k) => line.includes(k))) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 180)}`)
  })
}
console.log(hits.join('\n') || '(no hits)')
