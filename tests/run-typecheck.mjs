/* 直接跑两个 tsc 子项目并把完整输出落盘(避免 shell 吞掉 stdout) */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const run = (proj) =>
  spawnSync('node', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', proj], {
    encoding: 'utf8',
    shell: false
  })

const a = run('tsconfig.node.json')
const b = run('tsconfig.web.json')
const strip = (s) => (s ?? '').replace(/\x1b\[[0-9;]*m/g, '')
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync(
  'tests/.out/typecheck.log',
  [
    `### tsconfig.node.json status=${a.status}`,
    strip(a.stdout),
    strip(a.stderr),
    `### tsconfig.web.json status=${b.status}`,
    strip(b.stdout),
    strip(b.stderr)
  ].join('\n')
)
console.log('node status', a.status, '| web status', b.status)
const out = strip(b.stdout) + strip(a.stdout)
if (out.trim()) {
  console.log(out.split(/\r?\n/).slice(0, 40).join('\n'))
} else {
  console.log('(no diagnostics)')
}
