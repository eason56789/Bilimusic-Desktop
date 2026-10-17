/* CDP 通用执行:node tests/cdp-eval.mjs "<表达式>" */
import { readFileSync } from 'node:fs'

const port = process.env.CDP_PORT ?? '9444'
const expr = process.argv[2]?.startsWith('@') ? readFileSync(process.argv[2].slice(1), 'utf8') : process.argv[2]

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url))
if (!page) {
  console.log('NO_PAGE')
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
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
const r = await send('Runtime.evaluate', {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
  timeout: 90000
})
// Set/Map 无法 returnByValue,故先转成普通对象再回传
const value = r.result?.value ?? r.exceptionDetails ?? r
console.log(JSON.stringify(value, null, 1).slice(0, 12000))
ws.close()
