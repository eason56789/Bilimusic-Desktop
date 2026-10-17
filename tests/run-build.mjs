import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const r = spawnSync('node', ['node_modules/electron-vite/bin/electron-vite.js', 'build'], {
  encoding: 'utf8',
  cwd: process.cwd(),
  shell: false
})
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync(
  'tests/.out/build2.log',
  `status=${r.status}\nsignal=${r.signal}\nerror=${r.error ? String(r.error) : 'none'}\n--- STDOUT ---\n${r.stdout ?? ''}\n--- STDERR ---\n${r.stderr ?? ''}\n`
)
console.log('status', r.status)
