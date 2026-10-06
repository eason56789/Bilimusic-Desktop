/** 列表行/全屏页的来源徽章配色(深浅主题通用:半透明底 + 品牌色字) */
import { tokens } from '@fluentui/react-components'
import type { MusicSource } from '@shared/types'

export interface SourceBadge {
  label: string
  /** 浅色半透明底(列表行) */
  bg: string
  /** 深色页上的高对比底(全屏播放页,封面模糊背景) */
  bgStrong: string
  color: string
}

export const SOURCE_BADGES: Record<MusicSource, SourceBadge> = {
  NETEASE: {
    label: '网易云',
    bg: 'rgba(201,49,75,0.12)',
    bgStrong: 'rgba(201,49,75,0.25)',
    color: tokens.colorPaletteRedForeground1
  },
  BILIBILI: {
    label: 'B站',
    bg: 'rgba(15,108,189,0.12)',
    bgStrong: 'rgba(15,108,189,0.25)',
    color: tokens.colorPaletteBlueForeground2
  },
  LOCAL: {
    label: '本地',
    bg: 'rgba(19,161,14,0.12)',
    bgStrong: 'rgba(19,161,14,0.25)',
    color: tokens.colorPaletteGreenForeground1
  },
  QQMUSIC: {
    label: 'QQ音乐',
    bg: 'rgba(49,194,124,0.14)',
    bgStrong: 'rgba(49,194,124,0.25)',
    color: '#31c27c'
  },
  KUGOU: {
    label: '酷狗',
    bg: 'rgba(44,169,225,0.14)',
    bgStrong: 'rgba(44,169,225,0.25)',
    color: '#2ca9e1'
  }
}

export function badgeOf(source: MusicSource): SourceBadge {
  return SOURCE_BADGES[source] ?? SOURCE_BADGES.BILIBILI
}
