import { SchemeExpressive, Hct, hexFromArgb } from '@material/material-color-utilities'

const argb = 0xff0f6cbd
const hct = Hct.fromInt(argb)
console.log('HCT of accent:', hct.hue.toFixed(1), hct.chroma.toFixed(1), hct.tone.toFixed(1))

for (const dark of [false, true]) {
  const s = new SchemeExpressive(hct, dark, 0, '2021')
  console.log('dark=' + dark)
  for (const k of [
    'primary',
    'onPrimary',
    'primaryContainer',
    'onPrimaryContainer',
    'secondaryContainer',
    'onSecondaryContainer',
    'tertiary',
    'tertiaryContainer',
    'surface',
    'surfaceDim',
    'surfaceBright',
    'surfaceContainerLowest',
    'surfaceContainerLow',
    'surfaceContainer',
    'surfaceContainerHigh',
    'surfaceContainerHighest',
    'onSurface',
    'onSurfaceVariant',
    'outline',
    'outlineVariant',
    'error',
    'inverseSurface',
    'inversePrimary'
  ]) {
    console.log(' ', k.padEnd(24), hexFromArgb(s[k]))
  }
}
