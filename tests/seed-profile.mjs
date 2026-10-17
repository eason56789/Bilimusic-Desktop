/* 给测试档案写入指定界面样式(跳过引导),然后重启应用。
 * 用法:node tests/seed-profile.mjs <fluent|md3> [variant] [contrast] [light|dark|system] */
import fs from 'node:fs'
import path from 'node:path'

const style = process.argv[2] ?? 'md3'
const variant = process.argv[3] ?? 'tonalSpot'
const contrast = Number(process.argv[4] ?? 0)
const theme = process.argv[5] ?? 'dark'
const file = path.join(process.env.APPDATA ?? '', 'BiliMusicTest', 'library.json')

let data = {}
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch {
  data = {}
}
data.settings = {
  ...(data.settings ?? {}),
  onboarded: true,
  uiStyle: style,
  md3Variant: variant,
  md3Contrast: contrast,
  theme,
  windowEffect: 'acrylic',
  accent: '#0f6cbd'
}
fs.writeFileSync(file, JSON.stringify(data, null, 2))
console.log(`seeded ${file} uiStyle=${style} variant=${variant} contrast=${contrast} theme=${theme}`)
