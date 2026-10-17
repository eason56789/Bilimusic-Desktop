/**
 * 界面样式上下文:让无 props 传入的深层组件(如图标)也能感知当前是经典 Fluent 还是 MD3。
 * uiStyle 存于 settings,由 <UiStyleBoundary> 在根处写入。
 */
import { createContext, useContext, type ReactNode } from 'react'

export type UiStyle = 'fluent' | 'md3'

const UiStyleContext = createContext<UiStyle>('fluent')

export function useUiStyle(): UiStyle {
  return useContext(UiStyleContext)
}

export function UiStyleBoundary({ value, children }: { value: UiStyle; children: ReactNode }) {
  return <UiStyleContext.Provider value={value}>{children}</UiStyleContext.Provider>
}
