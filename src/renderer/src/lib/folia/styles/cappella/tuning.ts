/**
 * Cappella 调优类型与默认值(移植自上游 types.ts + tuning.ts,去掉设置面板/存储依赖;
 * 本项目样式调优目前走默认值)
 */
export type CappellaEmojiPackSource = 'builtin' | 'custom'
export type CappellaAvatarSource = 'cover' | 'builtin' | 'color' | 'custom'

export interface CappellaEmojiImage {
  id: string
  name: string
  url: string
}

export interface CappellaAvatarImage {
  id: string
  name: string
  url: string
}

export interface CappellaTuning {
  showEmoMessages: boolean
  emojiPackSource: CappellaEmojiPackSource
  avatarSource: CappellaAvatarSource
}

export const DEFAULT_CAPPELLA_TUNING: CappellaTuning = {
  showEmoMessages: true,
  emojiPackSource: 'builtin',
  avatarSource: 'cover'
}

/** A stored tuning, or a part of one, as a whole valid tuning. */
export const resolveStoredCappellaTuning = (parsed: Partial<CappellaTuning>): CappellaTuning => ({
  showEmoMessages: parsed.showEmoMessages ?? DEFAULT_CAPPELLA_TUNING.showEmoMessages,
  emojiPackSource: parsed.emojiPackSource === 'custom' ? 'custom' : 'builtin',
  avatarSource:
    parsed.avatarSource === 'builtin' || parsed.avatarSource === 'color' || parsed.avatarSource === 'cover' || parsed.avatarSource === 'custom'
      ? parsed.avatarSource
      : DEFAULT_CAPPELLA_TUNING.avatarSource
})
