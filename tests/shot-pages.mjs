/* 截图:按页面逐个截图,用于 MD3 外观验证。
 * 用法:node tests/shot-pages.mjs <fluent|md3> [variant] */
import { writeFileSync, mkdirSync } from 'node:fs'

const style = process.argv[2] ?? 'md3'
const outDir = `tests/.out/shots/${style}`
mkdirSync(outDir, { recursive: true })

const port = process.env.CDP_PORT ?? '9444'
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
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.exceptionDetails ? { error: JSON.stringify(r.exceptionDetails).slice(0, 400) } : r.result?.value
}
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, 'base64'))
  console.log('  saved', `${style}/${name}.png`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Runtime.enable')
await send('Page.enable')

// 切页面用 Tab 的 value 属性更可靠
const goto = async (value) => {
  await evalJs(`(() => {
    const t = document.querySelector('.fui-Tab[value="${value}"]')
    if (t) t.click()
    return !!t
  })()`)
  await sleep(900)
}

const pages = [
  ['search', '01-search'],
  ['playlists', '02-playlists'],
  ['downloads', '03-downloads'],
  ['recent', '04-recent'],
  ['settings', '05-settings']
]
for (const [v, name] of pages) {
  const ok = await goto(v)
  void ok
  await shot(name)
}
// 设置页截图后回到设置顶部,便于看外观选择器
await evalJs(`document.querySelector('.fui-Tab[value="settings"]')?.click()`)
await sleep(600)
await shot('05b-settings-top')

ws.close()
console.log('done')
