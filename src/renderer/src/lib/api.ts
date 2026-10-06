import type { DesktopApi } from '@shared/types'

declare global {
  interface Window {
    api: DesktopApi
  }
}

export const api: DesktopApi = window.api
