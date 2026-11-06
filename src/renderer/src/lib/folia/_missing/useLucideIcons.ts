// stub: 上游 hooks/useLucideIcons 依赖 services/lucideIconResolver 的按需加载;
// 此处降级:图标表是静态的,无需触发加载,revision 恒为 0。
import { useEffect } from 'react'
import { loadLucideIcons } from './lucideIconResolver'

/**
 * Starts loading `names` and returns a revision that changes whenever an icon finishes loading.
 * 降级实现:不加载,恒返回 0(保持与上游相同的调用形态)。
 */
export const useLucideIcons = (names: readonly string[] | undefined): number => {
    const signature = names?.join('\n') ?? ''

    useEffect(() => {
        if (signature) {
            void loadLucideIcons(signature.split('\n'))
        }
    }, [signature])

    return 0
}

export default useLucideIcons
