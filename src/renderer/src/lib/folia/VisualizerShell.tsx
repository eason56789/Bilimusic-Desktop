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
import { useStore } from '../../store'

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
    // 高端动画关闭档不再挂这张流光画布(它每帧跟随音频重绘,是歌词页最贵的一块),
    // 退回 theme.backgroundColor 纯色底,歌词与封面照常显示
    const hifi = useStore((s) => s.library?.settings.motionHifi !== false)
    const latent = !!sharedProps?.latentBackground && hifi
    // 自定义底图:最底层用户图片(暗化后保证歌词可读);启用时优先于流光背景
    const customBg = sharedProps?.customBgImage as string | null | undefined
    const customOn = (sharedProps?.customBgEnabled as boolean | undefined) && !!customBg
    const dim = Math.min(80, Math.max(0, (sharedProps?.customBgDim as number | undefined) ?? 45)) / 100
    const blur = Math.min(40, Math.max(0, (sharedProps?.customBgBlur as number | undefined) ?? 0))
    return (
      <div
        ref={ref}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: latent || customOn ? 'transparent' : theme.backgroundColor,
          isolation: 'isolate'
        }}
      >
        {customOn && (
          <>
            <img
              src={customBg ?? undefined}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                // 模糊时放大一点点,避免边缘露出透明缝
                transform: blur > 0 ? 'scale(1.05)' : undefined,
                filter: blur > 0 ? `blur(${blur}px)` : undefined,
                pointerEvents: 'none'
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `rgba(0,0,0,${dim})`,
                pointerEvents: 'none'
              }}
            />
          </>
        )}
        {!customOn && latent && (
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
