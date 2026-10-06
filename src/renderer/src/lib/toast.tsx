/** 轻量 toast 桥(App 挂载 Toaster 后注入控制器);点击任意 toast 立即消失 */
import type { ReactNode } from 'react'
import { Toast, ToastTitle, ToastBody } from '@fluentui/react-components'

type ToastDispatcher = (content: ReactNode, options?: Record<string, unknown>) => void
type ToastDismisser = (toastId: string) => void

let dispatcher: ToastDispatcher | null = null
let dismisser: ToastDismisser | null = null

export function setToastController(
  d: ToastDispatcher | null,
  dismiss?: ToastDismisser
): void {
  dispatcher = d
  dismisser = dismiss ?? null
}

let seq = 0

function showToast(
  title: string,
  message: string | undefined,
  intent: 'info' | 'success' | 'error' | 'warning',
  timeout: number
): void {
  const toastId = `t-${++seq}`
  const dismiss = () => dismisser?.(toastId)
  dispatcher?.(
    <div
      onClick={dismiss}
      style={{ cursor: 'pointer' }}
      title="点击关闭"
    >
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {message ? <ToastBody>{message}</ToastBody> : null}
      </Toast>
    </div>,
    { timeout, intent, toastId }
  )
}

export function toast(title: string, message?: string): void {
  showToast(title, message, 'info', 3500)
}

export function toastError(title: string, message?: string): void {
  showToast(title, message, 'error', 5000)
}

export function toastSuccess(title: string, message?: string): void {
  showToast(title, message, 'success', 3000)
}
