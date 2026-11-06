// stub: 上游依赖播放器数据库(IndexedDB)与资产服务,此处降级实现:不持久化,读取一律返回 null。
// 样式对 null 都有分支(回退到封面)。
import type { StoredMonetPortraitImage } from '../bridge'

const SUPPORTED_IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml)$/i

export const getMonetPortraitImage = async (): Promise<StoredMonetPortraitImage | null> => null

export const saveMonetPortraitImage = async (_image: StoredMonetPortraitImage): Promise<void> => {
    // 降级:不做持久化
}

export const clearMonetPortraitImage = async (): Promise<void> => {
    // 降级:不做持久化
}

export const isSupportedMonetPortraitFile = (file: File): boolean => SUPPORTED_IMAGE_TYPES.test(file.type)

export const buildStoredMonetPortraitImage = (file: File): StoredMonetPortraitImage => ({
    id: `monet-portrait-${Date.now()}`,
    name: file.name,
    mimeType: file.type,
    blob: file,
})
