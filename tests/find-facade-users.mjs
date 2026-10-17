/* 找出哪些文件从 react-components 导入了 Button / Card(M3 造型层需要 data-* 镜像),
 * 以及每个文件里还导入了什么(便于改写导入源时保持名单不变)。 */
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

const NEED = ['Button', 'Card']
const rows = []
for (const f of walk('src/renderer/src')) {
  const rel = f.replace(/\\/g, '/')
  if (rel.includes('/ui/controls.tsx')) continue
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-components'/g)) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    const hit = names.filter((n) => NEED.includes(n))
    if (hit.length) rows.push(`${rel}  →  需要 ${hit.join(', ')}  (共 ${names.length} 个导入)`)
  }
}
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/need-facade.txt', rows.join('\n') + '\n')
console.log('files needing facade:', rows.length)
console.log(rows.join('\n'))
