// 从 Fluent 组件样式源码里抽取"结构关键行"(嵌套选择器 + 几何/颜色声明),
// 用于编写 M3 组件造型层时准确覆盖 ::before/::after 与各状态选择器。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const NM = path.join(ROOT, 'node_modules', '@fluentui')

const TARGETS = [
  'react-switch/lib/components/Switch/useSwitchStyles.styles.js',
  'react-checkbox/lib/components/Checkbox/useCheckboxStyles.styles.js',
  'react-radio/lib/components/Radio/useRadioStyles.styles.js',
  'react-slider/lib/components/Slider/useSliderStyles.styles.js',
  'react-tabs/lib/components/Tab/useTabStyles.styles.js',
  'react-tabs/lib/components/TabList/useTabListStyles.styles.js',
  'react-button/lib/components/Button/useButtonStyles.styles.js',
  'react-progress/lib/components/ProgressBar/useProgressBarStyles.styles.js',
  'react-input/lib/components/Input/useInputStyles.styles.js',
  'react-menu/lib/components/MenuItem/useMenuItemStyles.styles.js'
]

const SEL = /^\s*(['"]?)(:?[:[.]|\s*['"]?&)|::before|::after/
const KEY =
  /(width|height|minWidth|minHeight|maxWidth|maxHeight|borderRadius|border|background|backgroundColor|backgroundImage|color|padding|margin|inset|transform|boxShadow|position|transition|fontSize|fontWeight|lineHeight|outline|opacity|display|gap|flex|top|left|right|bottom|alignItems|justifyContent)\s*:/

const out = []
for (const rel of TARGETS) {
  const file = path.join(NM, rel)
  out.push(`\n==================== ${rel}`)
  if (!fs.existsSync(file)) {
    out.push('!! MISSING')
    continue
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const isSel = /^['"]?&?[:[.]/.test(t) || /^['"]?::/.test(t) || /\[(disabled|checked|aria|data)/.test(t)
    if (isSel || KEY.test(t)) out.push('  ' + t)
  }
}

const dest = path.join(ROOT, 'tests', '.out', 'component-styles.txt')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, out.join('\n'), 'utf8')
console.log('written', dest, fs.statSync(dest).size)
