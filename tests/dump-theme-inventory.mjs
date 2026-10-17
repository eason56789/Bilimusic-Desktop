// 枚举 Fluent 主题对象的 token 全集(按前缀分组),作为 M3→Fluent 映射的覆盖面依据。
import fs from 'node:fs'
import path from 'node:path'

const theme = await import('@fluentui/react-theme')
const light = theme.webLightTheme
const dark = theme.webDarkTheme

const groups = {}
for (const [k, v] of Object.entries(light)) {
  let g
  if (k.startsWith('colorPalette')) g = 'colorPalette'
  else if (k.startsWith('colorStatus')) g = 'colorStatus'
  else if (k.startsWith('color')) g = 'color'
  else if (k.startsWith('fontSizeHero')) g = 'fontSizeHero'
  else if (k.startsWith('fontSize')) g = 'fontSize'
  else if (k.startsWith('lineHeightHero')) g = 'lineHeightHero'
  else if (k.startsWith('lineHeight')) g = 'lineHeight'
  else if (k.startsWith('fontFamily')) g = 'fontFamily'
  else if (k.startsWith('fontWeight')) g = 'fontWeight'
  else if (k.startsWith('borderRadius')) g = 'borderRadius'
  else if (k.startsWith('shadow')) g = 'shadow'
  else if (k.startsWith('curve')) g = 'curve'
  else if (k.startsWith('duration')) g = 'duration'
  else if (k.startsWith('strokeWidth')) g = 'strokeWidth'
  else if (k.startsWith('spacing')) g = 'spacing'
  else g = 'other'
  ;(groups[g] ||= []).push(`${k}  light=${v}  dark=${dark[k]}`)
}

const out = [`TOTAL ${Object.keys(light).length}`]
for (const g of Object.keys(groups).sort()) {
  out.push('', `===== ${g} (${groups[g].length})`)
  out.push(...groups[g].map((l) => '  ' + l))
}

const dest = path.join(process.cwd(), 'tests', '.out', 'theme-inventory.txt')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, out.join('\n'), 'utf8')
console.log('written', dest, out.length, 'lines;', Object.keys(light).length, 'tokens')
console.log('groups:', Object.entries(groups).map(([g, a]) => `${g}:${a.length}`).join(' '))
