/* 为每个 M3 变体打印主要色彩角色,用于挑选观感协调的默认变体。
 * 运行需要打包 M3 依赖(extensionless ESM),故用 esbuild 打一个临时包再跑。 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('tests/.out', { recursive: true })
writeFileSync(
  'tests/.out/_roles-entry.ts',
  `
import { Hct, SchemeExpressive, SchemeTonalSpot, SchemeVibrant, SchemeNeutral, SchemeMonochrome, SchemeRainbow, SchemeFruitSalad, SchemeContent, SchemeFidelity, hexFromArgb } from '@material/material-color-utilities'

const SCHEMES: Record<string, any> = {
  expressive: SchemeExpressive, tonalSpot: SchemeTonalSpot, vibrant: SchemeVibrant,
  neutral: SchemeNeutral, monochrome: SchemeMonochrome, rainbow: SchemeRainbow,
  fruitSalad: SchemeFruitSalad, content: SchemeContent, fidelity: SchemeFidelity
}
const num = (hex: string) => parseInt(hex.replace('#',''), 16)
const roles = ['primary','secondary','tertiary','secondaryContainer','tertiaryContainer','surfaceContainerHigh','onSurface'] as const

const seeds = ['#0f6cbd', '#6b69d6', '#13a10e']
for (const seed of seeds) {
  console.log('\\n############ seed ' + seed)
  for (const [name, C] of Object.entries(SCHEMES)) {
    const s = new C(Hct.fromInt(num(seed)), true, 0)
    const parts = roles.map(r => r + '=' + hexFromArgb((s as any)[r]))
    console.log(name.padEnd(12) + parts.join('  '))
  }
}
`
)

await build({
  entryPoints: ['tests/.out/_roles-entry.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'tests/.out/_roles.mjs',
  logLevel: 'warning'
})
console.log('bundled ok')
