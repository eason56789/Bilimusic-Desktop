import { readFileSync, existsSync } from 'node:fs'

const files = [
  'node_modules/@fluentui/tokens/lib/tokens.js',
  'node_modules/@fluentui/tokens/lib/themes/web/lightTheme.js',
  'node_modules/@fluentui/react-theme/lib/index.js'
]
for (const f of files) {
  if (!existsSync(f)) {
    console.log('MISSING', f)
    continue
  }
  const s = readFileSync(f, 'utf8')
  console.log('=====', f, s.length)
  console.log(s.slice(0, 900))
  const i = s.indexOf('colorNeutralForeground3')
  if (i >= 0) console.log('...ctx:', JSON.stringify(s.slice(Math.max(0, i - 120), i + 160)))
}
