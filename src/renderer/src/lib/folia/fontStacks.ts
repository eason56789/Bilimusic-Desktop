/**
 * 字体栈解析(上游 src/utils/fontStacks 的精简实现)
 *
 * 上游源码包里没有随附该文件,这里按各家样式对它的调用方式还原语义:
 *  - resolveThemeFontStack(theme):歌词正文字体栈
 *  - resolveThemeTranslationFontStack(theme):译文(通常跟随正文,略降字重)
 *  - resolveThemeFontWeight(theme, fallback):字重
 * theme.fontFamilyStack 存在时优先,否则用 fontStyle 推一个跨平台栈。
 */
import type { FoliaTheme } from './bridge'

/** 字体相关的窄主题(Pick),样式里常传它 */
export type ThemeFontLike = Partial<
  Pick<FoliaTheme, 'fontFamily' | 'fontFamilyStack' | 'fontStyle' | 'fontWeight'>
>

const SANS = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  'sans-serif'
]

const SERIF = [
  'Georgia',
  '"Songti SC"',
  '"SimSun"',
  '"Noto Serif SC"',
  'serif'
]

const MONO = ['"SF Mono"', 'Consolas', '"Cascadia Code"', '"Roboto Mono"', 'monospace']

export function resolveThemeFontStack(theme: ThemeFontLike): string {
  if (theme.fontFamilyStack && theme.fontFamilyStack.length > 0) {
    return theme.fontFamilyStack.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ')
  }
  if (theme.fontFamily) return theme.fontFamily
  if (theme.fontStyle === 'serif') return SERIF.join(', ')
  if (theme.fontStyle === 'mono') return MONO.join(', ')
  return SANS.join(', ')
}

export function resolveThemeTranslationFontStack(theme: ThemeFontLike): string {
  // 译文与正文同族即可;上游也是同一套栈(可能由用户单独覆盖,这里从简)
  return resolveThemeFontStack(theme)
}

export function resolveThemeFontWeight(theme: ThemeFontLike, fallback = 700): number {
  return theme.fontWeight ?? fallback
}
