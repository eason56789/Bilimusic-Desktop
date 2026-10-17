/* 读 Fluent 组件源码,确认 appearance / size / shape 等 props 是否被写到 DOM 属性上。
 * 这决定 M3 造型层能否用 [appearance='primary'] 这类选择器。 */
import fs from 'node:fs'
import path from 'node:path'

const files = [
  ['react-button', 'lib/components/Button/useButton.js', 'Button:useButton'],
  ['react-button', 'lib/components/Button/useButtonStyles.styles.js', 'Button:styles'],
  ['react-switch', 'lib/components/Switch/useSwitch.js', 'Switch:useSwitch'],
  ['react-tabs', 'lib/components/Tab/useTab.js', 'Tab:useTab'],
  ['react-input', 'lib/components/Input/useInput.js', 'Input:useInput']
]

const out = []
for (const [pkg, rel, name] of files) {
  const p = path.join('node_modules/@fluentui', pkg, rel)
  out.push(`\n${'='.repeat(24)} ${name}  (${pkg}/${rel})`)
  try {
    out.push(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    out.push('!! MISSING: ' + e.message)
  }
}
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/prop-reflection.txt', out.join('\n'))
console.log('written', fs.statSync('tests/.out/prop-reflection.txt').size, 'bytes')

// 直接搜关键证据:是否有把 appearance/size 塞进 attributes 的代码
const probe = []
for (const [pkg, rel, name] of files) {
  const p = path.join('node_modules/@fluentui', pkg, rel)
  let src = ''
  try {
    src = fs.readFileSync(p, 'utf8')
  } catch {
    continue
  }
  for (const line of src.split(/\r?\n/)) {
    if (/appearance|root\s*=|primaryButton|size\b/.test(line) && /attributes|rest|\.\.\./.test(line)) {
      probe.push(`${name}: ${line.trim().slice(0, 160)}`)
    }
  }
}
console.log('\n--- 关键行 ---')
console.log(probe.slice(0, 40).join('\n'))
