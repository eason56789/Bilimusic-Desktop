// stub: 上游依赖播放器设置窗口的 kit/Tooltip(Portal + 定位),此处降级为原生 title 提示。
import React from 'react'

type TooltipProps = {
    /** Without a text there is only the wrapping element. */
    text?: string
    /** For the element that wraps the children. */
    className?: string
    children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ text, className, children }) => (
    <span className={className} title={text}>
        {children}
    </span>
)

export default Tooltip
