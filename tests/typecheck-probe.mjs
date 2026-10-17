/* 验证 typecheck 是否真能捕获"导入路径不存在"这类错误:
 * 临时在 lib/theme.ts 插入一个指向不存在模块的 import,跑 tsc,再还原。
 * 目的是确认 npm run typecheck 的绿灯可信 —— 之前它放过了一个坏路径,
 * 直到 electron-vite build 才炸。 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const TARGET = 'src/renderer/src/lib/theme.ts'
const original = fs.readFileSync(TARGET, 'utf8')
const probe = `${original}\nimport { __probe__ } from './ui/md3/__does_not_exist__'\nconsole.log(__probe__)\n`

const runTsc = (clean) =>
  spawnSync(
    'node',
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '-p',
      'tsconfig.web.json',
      ...(clean ? ['--incremental', 'false'] : [])
    ],
    { encoding: 'utf8', shell: false }
  )

const strip = (s) => (s ?? '').replace(/\x1b\[[0-9;]*m/g, '')

const results = []
try {
  fs.writeFileSync(TARGET, probe)
  const a = runTsc(false)
  results.push(`[incremental (默认)] status=${a.status}\n${strip(a.stdout)}${strip(a.stderr)}`)
  const b = runTsc(true)
  results.push(`[--incremental false] status=${b.status}\n${strip(b.stdout)}${strip(b.stderr)}`)
} finally {
  fs.writeFileSync(TARGET, original)
}

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/typecheck-probe.log', results.join('\n\n'))
console.log(results.join('\n\n'))
