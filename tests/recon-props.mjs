/** 侦察:各组件实际收到的 JSX 属性名 + tokens.* 用量 */
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

const TARGETS = [
  'Button','Text','Title1','Title2','Input','Textarea','Switch','Checkbox','Radio','RadioGroup',
  'Slider','Dropdown','Option','Field','Card','Divider','Spinner','ProgressBar','Tooltip',
  'Menu','MenuList','MenuItem','MenuPopover','MenuTrigger','Dialog','DialogSurface','DialogBody',
  'DialogTitle','DialogContent','DialogActions','TabList','Tab','Persona','Toast','ToastTitle','ToastBody','Toaster'
]
const props = new Map(TARGETS.map((t) => [t, new Map()]))
const tokCount = new Map()

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  // tokens.X
  for (const m of src.matchAll(/\btokens\.([A-Za-z0-9_]+)/g)) {
    tokCount.set(m[1], (tokCount.get(m[1]) || 0) + 1)
  }
  for (const t of TARGETS) {
    // <T ...  (到第一个 > 或 />)
    const re = new RegExp(`<${t}(?=[\\s/>])([^>]*)`, 'g')
    for (const m of src.matchAll(re)) {
      const raw = m[1]
      // 属性名: 行首或空白后紧跟标识符,后接 = 或空白/换行
      for (const a of raw.matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9_]*)\s*(?==|\s|$)/g)) {
        const name = a[1]
        if (['key', 'ref'].includes(name)) continue
        const mm = props.get(t)
        mm.set(name, (mm.get(name) || 0) + 1)
      }
    }
  }
}
console.log('=== JSX PROPS PER COMPONENT ===')
for (const [t, mm] of props) {
  if (!mm.size) continue
  console.log(
    t + ': ' + [...mm.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(' ')
  )
}
console.log('=== TOKENS USAGE (' + tokCount.size + ') ===')
console.log([...tokCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join('\n'))
