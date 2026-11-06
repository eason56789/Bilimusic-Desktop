// stub: 上游依赖播放器的 lucide 图标懒加载服务(services/lucideIconResolver,dynamicIconImports 分包加载),
// 此处降级实现:图标一律解析不到(resolveLucideIconNode 返回 null),样式按「还没加载完」路径降级,
// 不画主题图标(lumiere 线稿 / hanabi 拼贴贴纸都有自己的空图降级)。
import type { IconNode } from 'lucide-react';

/** 把主题的 lyricsIcons 列表收敛成合法的图标名(去空、去重、大小写不敏感去重)。 */
export const resolveLucideIconNames = (
    icons?: readonly (string | null | undefined)[] | null,
): string[] => {
    if (!icons) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of icons) {
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
};

/** 同步取一个已加载图标的 IconNode;降级实现永远返回 null(调用方按未加载处理)。 */
export const resolveLucideIconNode = (_name: string): IconNode | null => null;

/** 预加载一批图标;降级实现立即完成,什么也不加载。 */
export const loadLucideIcons = async (
    _names?: readonly (string | null | undefined)[] | null,
): Promise<void> => {
    /* 降级:noop */
};

export type LucideIconStatus = 'loading' | 'ready' | 'missing';
