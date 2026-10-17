/* 列出可能占用单实例锁的 BiliMusic 相关进程 */
import { execSync } from 'node:child_process'

const out = execSync('tasklist /fo csv /nh', { encoding: 'utf8', windowsHide: true })
const rows = out
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => l.split('","').map((s) => s.replace(/^"|"$/g, '')))

const hits = rows.filter(([name, , , mem]) => /electron|bilimusic|zcode/i.test(name))
console.log('total processes:', rows.length)
for (const [name, pid, , mem] of hits) console.log(`${name.padEnd(28)} pid=${pid.padStart(8)} mem=${mem}`)
