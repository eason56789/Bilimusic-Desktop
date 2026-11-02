/**
 * react-i18next 的最小替身
 *
 * 上游样式只用到 useTranslation().t(key) 取一句按钮/提示文案。
 * 本项目界面本身是中文单语,直接把 key 或内置中文表返回即可。
 */
const ZH: Record<string, string> = {
  'ui.visualizerRotateWord': '旋转词排版',
  'ui.visualizerWordRotation': '逐词旋转',
  'ui.reset': '重置',
  'ui.visualizerStill': '时计',
  'ui.visualizerClassic': '经典',
  'ui.visualizerTilt': '倾斜'
}

export function useTranslation(): { t: (key: string, opts?: Record<string, unknown>) => string } {
  return {
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === 'string') return opts.defaultValue
      return ZH[key] ?? key
    }
  }
}

export default { useTranslation }
