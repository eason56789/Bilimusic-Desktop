// 上游 Theme(bridge 的 FoliaTheme 之外)还带 name/description/provider/wordColors/lyricsIcons 等
// 字段,町景的招牌文案、配色与图标同步会读它们。桥接层没有这些字段时按 undefined 降级:
// 本文件只把类型放宽(全部可选),不改 bridge 的契约;运行时缺失时样式里已有 `?? ''` / `?? []` 兜底。
import type { Theme } from '../../bridge';

export type MachiTheme = Theme & {
    name?: string | null;
    description?: string | null;
    provider?: string | null;
    wordColors?: readonly { word: string; color: string }[];
    lyricsIcons?: readonly string[];
};
