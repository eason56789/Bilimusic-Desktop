/**
 * 上游 stores/visualizerSettingsPersistence.ts 的纯工具部分(签名与上游一致)。
 * 只碰 localStorage,不依赖播放器全局状态,所以放 utils/ 而不是 _missing/。
 * 上游同文件的其余导出(visualizerMode / smartBeat 设置等播放器级状态)不在这里。
 */
import type { StoredTuning } from '../tuningDefinition'

/** 从 localStorage 读一份样式 tuning:没存过、解析失败或 read 抛错都回 defaults。 */
export const readStoredTuning = <T>({ defaults, storage }: Pick<StoredTuning<T>, 'defaults' | 'storage'>): T => {
    if (typeof window === 'undefined') {
        return defaults
    }

    let saved: string | null = null
    try {
        saved = window.localStorage.getItem(storage.key)
    } catch {
        return defaults
    }
    for (const olderKey of storage.olderKeys ?? []) {
        saved ??= window.localStorage.getItem(olderKey)
    }
    if (!saved) return defaults

    try {
        return storage.read(JSON.parse(saved))
    } catch {
        return defaults
    }
}

/** 把一份 tuning 整体写进 localStorage。 */
export const writeStoredTuning = (key: string, tuning: unknown) => {
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(key, JSON.stringify(tuning))
        } catch {
            // 存不进就存不进:下次还是 defaults
        }
    }
}
