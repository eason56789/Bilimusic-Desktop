/* 用 tsc 的 --listFilesOnly 检查 typecheck 是否真覆盖了 renderer 源码 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const r = spawnSync(
  'node',
  ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.web.json', '--listFilesOnly'],
  { encoding: 'utf8', shell: false }
)
const lines = (r.stdout ?? '').split(/\r?\n/)
const idx = lines.findIndex((l) => l.includes('BiliMusic-Desktop/src/'))
const all = lines.filter((l) => l.includes('BiliMusic-Desktop/src/'))
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/tsc-files.txt', `status=${r.status}\ntotal=${all.length}\n${all.join('\n')}\n`)
console.log('status', r.status, 'src files', all.length, 'firstIdx', idx)
console.log(all.slice(0, 8).join('\n'))
