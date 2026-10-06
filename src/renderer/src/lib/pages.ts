/** 分P → 队列歌曲构造(PagesDialog 与右键菜单共用) */
import type { BiliPage, Song } from '@shared/types'

/**
 * 把B站视频的全部分P构造成可播放的歌曲列表。
 * id 规则与搜索结果一致:第1P 用裸 bvid,第N P 用 `<bvid>_p<N>`。
 * 多P 时标题追加「· P N」便于在队列里区分;单P 返回空数组(无需铺队列)。
 */
export function pagesToSongs(base: Song, pages: BiliPage[]): Song[] {
  const bvid = base.bvid ?? base.id.replace(/_p\d+$/, '')
  if (pages.length <= 1) return []
  return pages.map((p) => {
    const page = p.page > 0 ? p.page : 1
    // 基准标题可能已带「· P N...」后缀(如播放记录的「· 分P名」),避免叠加
    const cleanTitle = base.title.replace(/ · P\d+.*$/, '')
    return {
      ...base,
      id: page > 1 ? `${bvid}_p${page}` : bvid,
      bvid,
      page,
      duration: p.duration || base.duration,
      title: page > 1 ? `${cleanTitle} · P${page}` : cleanTitle
    }
  })
}
