// stub: 上游 services/lucideIconResolver 依赖 lucide-react 的 dynamicIconImports 按需加载表,
// 此处降级为一张小的静态图标表(覆盖主题 lyricsIcons 常见图标);未收录的名字返回 null/missing,
// 样式对 missing 都有回退分支(如 pendolo 的 ?? Star)。
import { Bell, Circle, Heart, Music, Music2, Sparkles, Star, type IconNode, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
    Bell,
    Circle,
    Heart,
    Music,
    Music2,
    Sparkles,
    Star,
}

export type LucideIconStatus = 'loading' | 'ready' | 'missing'

/** 降级:没有按需加载,直接返回。 */
export const loadLucideIcons = async (_names?: readonly unknown[]): Promise<void> => {}

export const hasLucideIcon = async (name: string): Promise<boolean> => Boolean(name && ICONS[name])

/** The icon component for an exact export name, or null when it is unknown. */
export const resolveLucideIcon = (name: string | null | undefined): LucideIcon | null =>
    name ? ICONS[name] ?? null : null

/** 降级:不提供 IconNode 数据(canvas/Pixi 自绘图标的上游用法)——恒 null,样式按 null 分支降级。 */
export const resolveLucideIconNode = (_name: string | null | undefined): IconNode | null => null

export const getLucideIconStatus = (name: string | null | undefined): LucideIconStatus =>
    name && ICONS[name] ? 'ready' : 'missing'

export const resolveLucideIconNames = (names?: readonly string[]): string[] =>
    (names ?? []).filter((name): name is string => Boolean(name && ICONS[name]))

/** Subscribes to icon arrivals (useSyncExternalStore shape);降级下永不变更。 */
export const subscribeLucideIcons = (listener: () => void) => {
    void listener
    return () => {}
}

export const getLucideIconRevision = (): number => 0
