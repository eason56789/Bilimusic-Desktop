/* 查询 CDP 目标列表(避免 shell 重定向问题) */
const port = process.env.CDP_PORT ?? '9444'
try {
  const r = await fetch(`http://127.0.0.1:${port}/json`)
  const targets = await r.json()
  for (const t of targets) console.log(t.type, '|', t.title, '|', t.url)
} catch (e) {
  console.log('ERR', String(e))
}
