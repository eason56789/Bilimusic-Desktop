/**
 * folia 样式宿主(全屏歌词用)
 *
 * 用法:arrange 里任一 folia 样式 id(见 FOLIA_STYLES)都会走到这里。
 * 这个组件只做三件事:桥接数据、驱动时间/音频、渲染所选样式。
 */
import { useStore } from '../store'
import type { LyricLine } from '@shared/types'
import { FoliaStage, useFoliaData } from './FoliaStage'

export interface FoliaLyricsProps {
  lines: LyricLine[]
  /** folia 样式 id(如 'still' / 'classic' / 'hanabi') */
  styleId: string
}

export function FoliaLyrics({ lines, styleId }: FoliaLyricsProps): JSX.Element {
  const { lines: foliaLines, theme } = useFoliaData(lines)
  // 让样式在歌词变化时重挂载(部分样式内部持有一次性初始化状态)
  const key = `${styleId}:${foliaLines.length}:${foliaLines[0]?.startTime ?? 0}`
  return <FoliaStage key={key} lines={foliaLines} theme={theme} styleId={styleId} />
}

export default FoliaLyrics
