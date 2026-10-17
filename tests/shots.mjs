/* 截图脚本:通过 CDP 切到指定界面样式并截图各页面。
 * 用法:node tests/shots.mjs <fluent|md3> */
import { writeFileSync, mkdirSync } from 'node:fs'

const style = process.argv[2] ?? 'md3'
const port = process.env.CDP_PORT ?? '9444'
const outDir = `tests/.out/shots/${style}`
mkdirSync(outDir, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url))
if (!page) {
  console.error('NO_PAGE')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error('WS_ERROR'))
})
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) return { error: JSON.stringify(r.exceptionDetails).slice(0, 600) }
  return r.result?.value
}
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, 'base64'))
  console.log('  saved', `${style}/${name}.png`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Runtime.enable')

// 1) 切换界面样式:直接改 store 里的设置
const switched = await evalJs(`(async () => {
  const w = window
  const store = w.__store ?? null
  return { hasStore: !!store, keys: Object.keys(w).filter(k => /store|api/i.test(k)).slice(0, 20) }
})()`)
console.log('probe:', JSON.stringify(switched))
await shot('01-initial')
void sleep
ws.close()
