// stub: 上游依赖播放器数据库(IndexedDB)与资产服务,此处降级实现:不持久化,读取一律返回 null。
// 样式对 null 都有分支(回退到封面派生背景)。
import type { StoredMonetBackgroundImage } from '../bridge'

const SUPPORTED_IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml)$/i

export const getMonetBackgroundImage = async (): Promise<StoredMonetBackgroundImage | null> => null

export const saveMonetBackgroundImage = async (_image: StoredMonetBackgroundImage): Promise<void> => {
    // 降级:不做持久化
}

export const clearMonetBackgroundImage = async (): Promise<void> => {
    // 降级:不做持久化
}

export const isSupportedMonetBackgroundFile = (file: File): boolean => SUPPORTED_IMAGE_TYPES.test(file.type)

export const buildStoredMonetBackgroundImage = (file: File): StoredMonetBackgroundImage => ({
    id: `monet-background-${Date.now()}`,
    name: file.name,
    mimeType: file.type,
    blob: file,
})
