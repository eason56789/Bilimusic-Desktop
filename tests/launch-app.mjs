/* 前台启动 electron 并捕获输出,用于诊断启动失败(同时也开 CDP 端口) */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = process.env.CDP_PORT ?? '9444'
const USER_DATA = process.env.APP_USER_DATA ?? 'C:\\Users\\eason\\AppData\\Roaming\\BiliMusicTest'
const child = spawn(
  'node_modules/electron/dist/electron.exe',
  ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`],
  { stdio: ['ignore', 'pipe', 'pipe'] }
)
let out = ''
child.stdout.on('data', (d) => (out += String(d)))
child.stderr.on('data', (d) => (out += '[ERR] ' + String(d)))

const t0 = Date.now()
child.on('exit', (code, sig) => {
  fs.mkdirSync('tests/.out', { recursive: true })
  fs.writeFileSync('tests/.out/app-launch.log', `exit=${code} signal=${sig} after=${Date.now() - t0}ms\n${out}`)
  console.log(`EXITED code=${code} after=${Date.now() - t0}ms`)
  console.log(out.slice(0, 3000))
})

setTimeout(async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`)
    const targets = await r.json()
    fs.mkdirSync('tests/.out', { recursive: true })
    fs.writeFileSync(
      'tests/.out/app-launch.log',
      `still running after 15s\n${targets.map((t) => `${t.type} | ${t.title} | ${t.url}`).join('\n')}\n---\n${out}`
    )
    console.log('RUNNING, targets:')
    for (const t of targets) console.log(' ', t.type, '|', t.title, '|', t.url)
    child.unref()
  } catch (e) {
    console.log('CDP not reachable after 15s:', String(e))
    console.log(out.slice(0, 3000))
  }
}, 15000)
