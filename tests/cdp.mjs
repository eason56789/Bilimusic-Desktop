/** CDP 诊断/截图工具:连上应用的 remote-debugging-port,执行 evaluate / 截图
 *  用法:node cdp.mjs eval "表达式"  |  node cdp.mjs shot out.png  |  node cdp.mjs evalfile file.js */
import { writeFileSync } from 'node:fs'

const port = process.env.CDP_PORT ?? '9222'
const [, , cmd, arg] = process.argv

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && /index\.html|localhost/.test(t.url))
if (!page) {
  console.error('NO_PAGE ' + JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url }))))
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
await send('Runtime.enable')

if (cmd === 'shot') {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(arg, Buffer.from(data, 'base64'))
  console.log('SAVED ' + arg)
} else if (cmd === 'click') {
  // 用法:node cdp.mjs click x y  (视口坐标)
  const [x, y] = arg.split(',').map((n) => Number(n.trim()))
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      clickCount: type === 'mousePressed' ? 1 : 1
    })
  }
  console.log(`CLICKED ${x},${y}`)
} else {
  const expr = cmd === 'evalfile' ? readFileSync(arg, 'utf8') : arg
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true
  })
  console.log(JSON.stringify(r.result?.value ?? r, null, 1).slice(0, 4000))
}
ws.close()
