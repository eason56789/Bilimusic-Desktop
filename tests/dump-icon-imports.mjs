/* 打印所有直接从 @fluentui/react-icons 导入的语句(用于改走图标外观层) */
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

const out = []
for (const f of walk('src/renderer/src')) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  const rel = f.replace(/\\/g, '/')
  // 找到 '@fluentui/react-icons' 所在行,向上找 import 起点
  lines.forEach((l, i) => {
    if (!l.includes('@fluentui/react-icons')) return
    let start = i
    while (start > 0 && !/^\s*import\s/.test(lines[start])) start--
    const isMulti = /import\s*\{[^}]*$/.test(lines[start])
    const depth = rel.startsWith('src/renderer/src/components/') || rel.startsWith('src/renderer/src/pages/') ? '../ui/icons' : './ui/icons'
    out.push(`=== ${rel}  (lines ${start + 1}-${i + 1}, multi=${isMulti}, target=${depth})`)
    for (let k = start; k <= i; k++) out.push(`  ${String(k + 1).padStart(4)}| ${lines[k]}`)
  })
}
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/icon-imports.txt', out.join('\n') + '\n')
console.log(out.join('\n'))
