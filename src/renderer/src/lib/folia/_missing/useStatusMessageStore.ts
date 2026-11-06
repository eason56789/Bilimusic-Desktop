// stub: 上游依赖播放器全局状态(useStatusMessageStore,zustand 的全局 toast),此处降级为 no-op。
export interface StatusMessageInput {
    type: 'error' | 'success' | 'info'
    text: string
    note?: string
    nonce?: number
}

export const setStatusMessage = (message: StatusMessageInput): void => {
    // 降级:播放器浮层 toast 属于宿主应用,这里只打到控制台。
    if (typeof console !== 'undefined') {
        console.info(`[folia status] ${message.type}: ${message.text}`)
    }
}

export default { setStatusMessage }
