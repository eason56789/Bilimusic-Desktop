/**
 * 精简版 VisualizerShell
 *
 * 上游 folia 的 VisualizerShell(285 行)承担背景分层、字体注入、hover 返回按钮,
 * 并依赖 i18next / lucide-react / folium 插件注册表 / 播放器浮层布局等本项目没有的模块。
 * 歌词样式真正用到它的只有三件事,这里只保留这些:
 *   - 一个铺满的绝对定位画布容器(layer 0);
 *   - 字体族注入到子树(CSS 变量 + inline fontFamily 由各样式自己用 resolveThemeFontStack);
 *   - 背景层(可选,由 backdrop 传入)。
 *
 * 这样每个样式组件可以几乎原样引用 `VisualizerShell`,不必把整套宿主一起搬。
 */
import React, { forwardRef } from 'react'
import LatentBackground from './backgrounds/LatentBackground'

export interface VisualizerShellSharedProps {
  [k: string]: any
}

export interface VisualizerShellProps {
  theme: {
    backgroundColor: string
    primaryColor: string
  }
  audioPower?: unknown
  audioBands?: unknown
  sharedProps?: Record<string, any>
  renderBackground?: boolean
  className?: string
  children?: React.ReactNode
  /** 背景层(没有就画纯色) */
  backdrop?: React.ReactNode
}

/** 与上游同名:样式里直接 import 用 */
export const VisualizerShell = forwardRef<HTMLDivElement, VisualizerShellProps>(
  ({ theme, className, children, backdrop, sharedProps }, ref) => {
    // 隐现背景:开启时由它提供背景色,shell 不再画不透明底
    const latent = sharedProps?.latentBackground as boolean | undefined
    return (
      <div
        ref={ref}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: latent ? 'transparent' : theme.backgroundColor,
          isolation: 'isolate'
        }}
      >
        {latent && (
          <LatentBackground
            theme={theme as any}
            coverUrl={sharedProps?.coverUrl ?? null}
            audioPower={sharedProps?.audioPower}
            audioBands={sharedProps?.audioBands}
            paused={sharedProps?.paused ?? false}
          />
        )}
        {backdrop}
        {children}
      </div>
    )
  }
)

VisualizerShell.displayName = 'VisualizerShell'

export default VisualizerShell
