/**
 * 歌词译文的渲染决策(纯函数,无任何浏览器/React 依赖,便于单测)。
 * 组件 LyricLineRow 与优化路径共用这一份规则,避免"设置页改了但渲染不生效"。
 */
import type { LyricLine } from '@shared/types'

/** 显示模式:仅原文 / 原文+翻译 / 仅翻译 */
export type LyricTransMode = 'off' | 'both' | 'transOnly'

export interface TransView {
  /** 需要渲染的译文文本;空串表示不渲染译文 */
  text: string
  /** 是否与原文同一行显示(右侧) */
  inline: boolean
  /** 译文字号系数(相对 --lyric-size,已含当前句的 1.2 倍放大) */
  scale: number
  /** 译文不透明度 */
  alpha: number
  /** 是否隐藏原文(仅翻译模式下为 true) */
  hideOriginal: boolean
}

/** 当前句原文字号相对基准的放大倍数(与 LyricLineRow 的 active 样式一致) */
export const ACTIVE_SCALE = 1.2

const NONE: TransView = { text: '', inline: false, scale: 1, alpha: 1, hideOriginal: false }

/**
 * 决定某一行的显示方式。
 *
 * 三种模式:
 * - 'off'       仅原文:译文一律不渲染
 * - 'both'      原文+翻译:两者共存(排版可为下方/右侧)
 * - 'transOnly' 仅翻译:原文隐藏,只显示译文
 *
 * 通用规则:
 * - 本行没有译文(纯音乐 / 翻译缺失) → 'off'/'both' 下不渲染译文;
 *   'transOnly' 下没有译文可显示时**回退显示原文**,避免整行空白
 * - 译文与原文相同(网易云偶尔把原文塞进 tlyric)→ 视为无翻译
 * - 字号:按原文基准缩放;当前句放大 1.2 倍,译文跟随同样的放大再乘用户比例
 */
export function resolveTrans(
  line: Pick<LyricLine, 'text' | 'trans'>,
  opts: {
    mode: LyricTransMode
    scale: number
    alpha: number
    layout: 'below' | 'inline'
    isActive: boolean
  }
): TransView {
  const raw = (line.trans ?? '').trim()
  if (opts.mode === 'off') return NONE

  const hasTrans = raw.length > 0 && raw !== line.text.trim()
  const scale = opts.scale * (opts.isActive ? ACTIVE_SCALE : 1)

  if (!hasTrans) {
    // 仅翻译模式但没有译文:回退显示原文,不留空行
    return opts.mode === 'transOnly' ? { ...NONE, hideOriginal: false } : NONE
  }

  return {
    text: raw,
    inline: opts.layout === 'inline',
    scale,
    alpha: opts.alpha,
    hideOriginal: opts.mode === 'transOnly'
  }
}
