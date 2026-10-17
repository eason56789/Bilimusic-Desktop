import fs from 'node:fs'
import path from 'node:path'

const want = [
  ['react-button', 'components/Button/renderButton.js', 'Button'],
  ['react-switch', 'components/Switch/renderSwitch.js', 'Switch'],
  ['react-checkbox', 'components/Checkbox/renderCheckbox.js', 'Checkbox'],
  ['react-radio', 'components/Radio/renderRadio.js', 'Radio'],
  ['react-radio', 'components/RadioGroup/renderRadioGroup.js', 'RadioGroup'],
  ['react-slider', 'components/Slider/renderSlider.js', 'Slider'],
  ['react-input', 'components/Input/renderInput.js', 'Input'],
  ['react-textarea', 'components/Textarea/renderTextarea.js', 'Textarea'],
  ['react-tabs', 'components/Tab/renderTab.js', 'Tab'],
  ['react-tabs', 'components/TabList/renderTabList.js', 'TabList'],
  ['react-progress', 'components/ProgressBar/renderProgressBar.js', 'ProgressBar'],
  ['react-menu', 'components/MenuPopover/renderMenuPopover.js', 'MenuPopover'],
  ['react-menu', 'components/MenuItem/renderMenuItem.js', 'MenuItem'],
  ['react-menu', 'components/MenuList/renderMenuList.js', 'MenuList'],
  ['react-dialog', 'components/DialogSurface/renderDialogSurface.js', 'DialogSurface'],
  ['react-dialog', 'components/Dialog/renderDialog.js', 'Dialog'],
  ['react-dialog', 'components/DialogBody/renderDialogBody.js', 'DialogBody'],
  ['react-card', 'components/Card/renderCard.js', 'Card'],
  ['react-tooltip', 'components/Tooltip/renderTooltip.js', 'Tooltip'],
  ['react-toast', 'components/Toast/renderToast.js', 'Toast'],
  ['react-spinner', 'components/Spinner/renderSpinner.js', 'Spinner'],
  ['react-divider', 'components/Divider/renderDivider.js', 'Divider'],
  ['react-field', 'components/Field/renderField.js', 'Field'],
  ['react-persona', 'components/Persona/renderPersona.js', 'Persona'],
  ['react-dropdown', 'components/Dropdown/renderDropdown.js', 'Dropdown']
]

const out = []
for (const [pkg, rel, name] of want) {
  const p = path.join('node_modules/@fluentui', pkg, 'lib', rel)
  out.push(`\n${'='.repeat(20)} ${name}  (${pkg}/${rel})`)
  try {
    out.push(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    out.push('!! MISSING: ' + e.message)
  }
}
fs.mkdirSync('tests/.out', { recursive: true })
fs.writeFileSync('tests/.out/dom-render.txt', out.join('\n'))
console.log('written', out.length, 'sections', fs.statSync('tests/.out/dom-render.txt').size, 'bytes')
