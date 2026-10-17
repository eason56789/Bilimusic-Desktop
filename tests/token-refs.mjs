import fs from 'node:fs'

const s = fs.readFileSync('node_modules/@fluentui/tokens/lib/tokens.js', 'utf8')
const want = [
  'fontSizeBase300',
  'lineHeightBase300',
  'fontFamilyBase',
  'borderRadiusMedium',
  'borderRadiusCircular',
  'borderRadius2XLarge',
  'shadow4',
  'shadow16',
  'shadow28',
  'curveEasyEase',
  'durationNormal',
  'fontWeightSemibold',
  'strokeWidthThin',
  'colorNeutralBackground1',
  'colorNeutralForeground1',
  'colorBrandBackground',
  'colorNeutralStroke1',
  'spacingHorizontalM',
  'colorPaletteRedForeground1',
  'colorCompoundBrandStroke',
  'colorStrokeFocus2',
  'colorNeutralBackground1Hover',
  'colorSubtleBackgroundHover',
  'colorNeutralBackground1Selected',
  'colorBrandBackground2',
  'colorNeutralBackground3',
  'colorNeutralBackground6',
  'fontSizeBase100',
  'fontSizeBase500',
  'fontSizeBase600',
  'lineHeightBase200',
  'colorNeutralForeground3',
  'colorNeutralForegroundDisabled',
  'colorNeutralStrokeAccessible'
]
const out = []
for (const w of want) {
  const re = new RegExp('export const ' + w + '\\s*=\\s*([^;]+);')
  const m = s.match(re)
  out.push(m ? `${w} = ${m[1].replace(/\s+/g, ' ').trim()}` : `${w} :: NOT FOUND`)
}
fs.writeFileSync('tests/.out/token-refs.txt', out.join('\n'))
console.log(out.join('\n'))
