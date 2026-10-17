/* 收集 renderer 中所有 @fluentui/react-icons 的图标名,用于核对图标外观层覆盖面 */
import fs from 'node:fs'
import path from 'node:path'

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const files = walk('src/renderer/src')
const names = new Set()
const perFile = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const re = /import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-icons'/g
  const local = []
  let m
  while ((m = re.exec(src))) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim()
      if (n) {
        names.add(n)
        local.push(n)
      }
    }
  }
  if (local.length) perFile.push({ file: f.replace(/\\/g, '/'), icons: local })
}

const arr = [...names].sort()
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/icon-usage.json', JSON.stringify({ total: arr.length, perFile }, null, 2))
fs.writeFileSync('tests/.out/icon-usage.txt', `${arr.length}\n${arr.join('\n')}\n`)
console.log(`total=${arr.length}`)
console.log(arr.join('\n'))
