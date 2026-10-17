/** 用法提取:按组件打印所有 JSX 属性片段(截断),作为 M3 组件层的接口契约 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'src/renderer/src'
const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e).replace(/\\/g, '/')
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e)) files.push(p)
  }
})(root)

const TARGETS = process.argv[2]
  ? process.argv[2].split(',')
  : [
      'Text','Title1','Title2','Button','MenuItem','Tooltip','Tab','TabList','Dialog','DialogSurface',
      'DialogBody','DialogTitle','DialogContent','DialogActions','Radio','RadioGroup','Spinner','Input',
      'Switch','Checkbox','Slider','Dropdown','Option','Field','Textarea','Card','Divider','ProgressBar',
      'Persona','Menu','MenuPopover','MenuTrigger','Toast','ToastTitle','ToastBody','Toaster','FluentProvider'
    ]

const out = new Map(TARGETS.map((t) => [t, new Map()]))
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const t of TARGETS) {
    const re = new RegExp(`<${t}(?=[\\s/>])([\\s\\S]*?)/?>`, 'g')
    for (const m of src.matchAll(re)) {
      // 属性片段:到第一个 > 之前,压平空白
      const raw = m[1].split('\n').map((s) => s.trim()).join(' ').trim()
      if (!raw) {
        out.get(t).set('(no props)', (out.get(t).get('(no props)') || 0) + 1)
        continue
      }
      out.get(t).set(raw.slice(0, 220), (out.get(t).get(raw.slice(0, 220)) || 0) + 1)
    }
  }
}
for (const [t, mm] of out) {
  if (!mm.size) continue
  console.log(`\n##### ${t} (${mm.size} distinct)`)
  for (const [k, v] of [...mm.entries()].sort((a, b) => b[1] - a[1])) console.log(`  [${v}] ${k}`)
}
