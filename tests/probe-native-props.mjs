/* 确认 Fluent 是否把 data-* 属性透传到 DOM,以及 Button 的 appearance 判定方式。
 * 用 jsdom 太重,直接读源码 + 静态分析关键函数。 */
import fs from 'node:fs'

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return '!! MISSING ' + e.message
  }
}

const out = []
out.push('### getNativeProps.js')
out.push(read('node_modules/@fluentui/react-utilities/lib/utils/getNativeProps.js'))
out.push('\n### keys.js (data- 判定)')
out.push(read('node_modules/@fluentui/react-utilities/lib/utils/keys.js'))
out.push('\n### useButton.js 全文')
out.push(read('node_modules/@fluentui/react-button/lib/components/Button/useButton.js'))
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/native-props.txt', out.join('\n'))
console.log('written', fs.statSync('tests/.out/native-props.txt').size)

// 精简输出:找 data- 相关证据
const gp = read('node_modules/@fluentui/react-utilities/lib/utils/getNativeProps.js')
for (const line of gp.split(/\r?\n/)) {
  if (/data|startsWith|isNative/i.test(line)) console.log('GP>', line.trim().slice(0, 180))
}
