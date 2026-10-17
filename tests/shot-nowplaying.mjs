/* 端到端:搜索 → 单击播放 → 打开全屏播放页 → 打开评论面板 → 截图。
 * 用法:node tests/shot-nowplaying.mjs <输出名> */
import { writeFileSync, mkdirSync } from 'node:fs'

const name = process.argv[2] ?? 'nowplaying'
const port = process.env.CDP_PORT ?? '9444'
const outDir = 'tests/.out/shots'
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
  return r.exceptionDetails ? { error: JSON.stringify(r.exceptionDetails).slice(0, 500) } : r.result?.value
}
const shot = async (n) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${n}.png`, Buffer.from(data, 'base64'))
  console.log('  saved', `${n}.png`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Runtime.enable')

// 1) 搜索并单 click 播放
const r1 = await evalJs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  document.querySelector('.fui-Tab[value="search"]')?.click()
  await sleep(800)
  const input = document.querySelector('.fui-Input__input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '起风了')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)
  const btn = [...document.querySelectorAll('.fui-Button')].find(b => (b.textContent||'').includes('搜索'))
  btn?.click()
  await sleep(4000)
  const rows = [...document.querySelectorAll('.song-row')]
  if (!rows.length) return 'NO_ROWS'
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await sleep(2500)
  return 'PLAYING:' + rows.length
})()`)
console.log('  play:', JSON.stringify(r1))

// 2) 打开全屏播放页(播放条上的「歌词与详情」按钮)
const r2 = await evalJs(`(() => {
  const b = [...document.querySelectorAll('.fui-Button')].find(x => (x.getAttribute('aria-label')||'').includes('歌词与详情'))
  if (b) { b.click(); return 'OPENED' }
  return 'NO_BTN'
})()`)
console.log('  nowplaying:', JSON.stringify(r2))
await sleep(1500)

// 3) 从「更多操作」菜单里点「评论」项(MenuItem 而非按钮)
const r3 = await evalJs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const more = [...document.querySelectorAll('.fui-Button')].find(x => (x.getAttribute('aria-label')||'') === '更多操作')
  if (!more) return 'NO_MORE_BTN'
  more.click()
  await sleep(900)
  const items = [...document.querySelectorAll('[role="menuitem"]')]
  const hit = items.find(el => (el.textContent || '').includes('评论'))
  if (!hit) return 'NO_MENU_ITEM:' + items.map(i => (i.textContent||'').trim().slice(0,8)).join(',')
  hit.click()
  await sleep(2000)
  return 'OPENED'
})()`)
console.log('  comments:', JSON.stringify(r3))
await sleep(2000)

await shot(name)
ws.close()
