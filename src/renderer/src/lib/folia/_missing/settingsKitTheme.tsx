// stub: 上游依赖播放器设置窗口的 kit/kitTheme(窗口明暗联动),此处降级为一个可手动设置的 Context。
// settingsTokens 按上游 kit/kitTheme.ts 的同名函数移植(纯 UI 变量,无播放器依赖)。
import React, { createContext, useContext } from 'react'
import type { CSSProperties } from 'react'
import type { Theme } from '../bridge'

export interface SettingsKitTheme {
    isDaylight: boolean
    /** 主题(accent 色等);machi 的取景条等会传。缺省时用中性色。 */
    theme?: Theme
}

export const SettingsKitThemeContext = createContext<SettingsKitTheme>({ isDaylight: false })

export const useSettingsKitTheme = (): SettingsKitTheme => useContext(SettingsKitThemeContext)

/** accent 色上的文字色:按 WCAG 亮度粗算。 */
const onAccentColor = (accent: string): string => {
    const hex = accent.replace('#', '');
    if (hex.length < 6) return isDaylightDefault() ? '#18181b' : '#fafafa';
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.45 ? '#18181b' : '#fafafa';
};
const isDaylightDefault = () => false;

/** 设置窗口的 CSS 变量组(machi 取景条等画在播放页上的部分用它取色)。 */
export const settingsTokens = (isDaylight: boolean, theme?: Theme): CSSProperties => {
    const accent = theme?.accentColor || (isDaylight ? '#18181b' : '#f4f4f5');
    return {
        '--st-win': isDaylight ? '#f3f3f4' : '#1a1a1d',
        '--st-side': isDaylight ? '#e9e9eb' : '#141416',
        '--st-card': isDaylight ? '#ffffff' : '#232327',
        '--st-menu': isDaylight ? '#ffffff' : '#2b2b30',
        '--st-raise': isDaylight ? '#ffffff' : '#45454c',
        '--st-knob': isDaylight ? '#ffffff' : '#ececee',
        '--st-pv': isDaylight ? '#ececef' : '#151517',
        '--st-ok': isDaylight ? '#1e9a5c' : '#56c98d',
        '--st-warn': isDaylight ? '#b97a10' : '#e3a949',
        '--st-err': isDaylight ? '#d04444' : '#ef6f6f',
        '--st-t1': 'var(--text-primary)',
        '--st-t2': 'color-mix(in srgb, var(--text-primary) 62%, transparent)',
        '--st-t3': 'color-mix(in srgb, var(--text-primary) 42%, transparent)',
        '--st-line': 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
        '--st-line2': 'color-mix(in srgb, var(--text-primary) 16%, transparent)',
        '--st-fill': 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
        '--st-fill2': 'color-mix(in srgb, var(--text-primary) 12%, transparent)',
        '--st-track': 'color-mix(in srgb, var(--text-primary) 17%, transparent)',
        '--st-accent': accent,
        '--st-on-accent': onAccentColor(accent),
    } as CSSProperties;
};
