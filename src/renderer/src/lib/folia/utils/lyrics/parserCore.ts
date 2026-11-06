// stub: 上游 parserCore.ts(1231 行)只被样式用到 isInterludeLine 一处,这里给最小实现。
// 上游 INTERLUDE_FULL_TEXT / isInterludeLine 的原样语义(见上游 src/utils/lyrics/parserCore.ts)。
import type { Line } from '../../bridge';

// 间奏行的占位全文:歌词解析器把无词间奏记成省略号行。
export const INTERLUDE_FULL_TEXT = '......';

export const isInterludeLine = (line: Pick<Line, 'fullText'>): boolean => line.fullText === INTERLUDE_FULL_TEXT;
