/**
 * 自定义头像/表情包管理(上游 customPacks.ts 的降级版)
 *
 * 上游把用户上传的图片存进应用数据库(useVisualizerAssetStore)。
 * 本项目暂不支持自定义上传,这里的实现恒为"无自定义包":
 * builtin 包由 avatarImages.ts / emoImages.ts 的 import.meta.glob 提供。
 */
import type { CappellaAvatarImage, CappellaEmojiImage } from './tuning'

export interface CappellaPackActionResult {
  ok: boolean
  error?: string
}

export const isSupportedCappellaAvatarFile = (_file: File): boolean => false
export const isSupportedCappellaEmojiFile = (_file: File): boolean => false

export const saveCustomCappellaEmojiPack = async (): Promise<CappellaPackActionResult> => ({
  ok: false,
  error: 'notifications.unsupportedInThisBuild'
})

export const clearCustomCappellaEmojiPack = async (): Promise<CappellaPackActionResult> => ({ ok: true })

export const buildStoredCappellaEmojiPack = async (): Promise<CappellaEmojiImage[]> => []

export const saveCustomCappellaAvatar = async (): Promise<CappellaPackActionResult> => ({
  ok: false,
  error: 'notifications.unsupportedInThisBuild'
})

export const clearCustomCappellaAvatar = async (): Promise<CappellaPackActionResult> => ({ ok: true })

export const buildStoredCappellaAvatar = async (): Promise<CappellaAvatarImage[]> => []
