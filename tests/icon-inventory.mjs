import fs from 'node:fs'
import path from 'node:path'

const root = 'src/renderer/src'
const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p)
  }
})(root)

const names = new Set()
const per = []
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const re = /import\s*\{([^}]*)\}\s*from\s*'@fluentui\/react-icons'/g
  let m
  const ns = []
  while ((m = re.exec(s))) {
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim()
      if (n) {
        ns.push(n)
        names.add(n)
      }
    }
  }
  if (ns.length) per.push(f.split('\\').join('/') + ' :: ' + ns.join(','))
}
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync(
  'tests/.out/icon-inventory.txt',
  `FILES ${per.length} ICONS ${names.size}\n` +
    per.join('\n') +
    '\n--- ALL NAMES ---\n' +
    [...names].sort().join('\n')
)
console.log('files', per.length, 'icons', names.size)
