/* 查 Slider 的实现:vertical / disabled 等 props 是否落 DOM,以及 M3 造型层可用的钩子 */
import fs from 'node:fs'
import path from 'node:path'

const out = []
const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return '!! MISSING ' + e.message
  }
}
out.push('### useSlider.js\n' + read('node_modules/@fluentui/react-slider/lib/components/Slider/useSlider.js'))
out.push('\n### useSliderStyles.styles.js(仅挑 r: {} 重置块)\n')
const styles = read('node_modules/@fluentui/react-slider/lib/components/Slider/useSliderStyles.styles.js')
out.push(styles.slice(0, 6000))

fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/slider-src.txt', out.join('\n'))
console.log('written', fs.statSync('tests/.out/slider-src.txt').size)
console.log(out[0].slice(0, 3000))
