/**
 * 跨平台歌手主页统一入口:把各平台歌手信息归一成同一个模型,
 * 渲染层的歌手页只认这一个接口(加平台标识、缺字段不显示)。
 *
 * 平台现状:
 *  - 网易云:资料最全(简介/别名/粉丝/歌曲数/专辑数/MV数)
 *  - QQ音乐:有 mid + 头像 + 粉丝数 + 歌曲数(无简介)
 *  - 酷狗:有 singerid + 头像 + 歌曲数(无简介/粉丝)
 *  - 汽水/B站:暂无歌手详情接口,只返回可得的最小信息
 */
import type { Song, UnifiedArtistDetail, ArtistPlatform } from '@shared/types'
import { findArtistIdByName, getArtistDetail, getArtistSongs } from './netease'
import { getQqArtistProfile, getQqArtistSongs, searchQqArtists } from './qqmusic'
import { getKugouArtistProfile, getKugouArtistSongs, searchKugouArtists } from './kugou'

/** 平台中文名(歌手页顶部标识) */
export const ARTIST_PLATFORM_LABEL: Record<ArtistPlatform, string> = {
  netease: '网易云音乐',
  qq: 'QQ音乐',
  kugou: '酷狗音乐',
  qishui: '汽水音乐',
  bilibili: '哔哩哔哩'
}

/**
 * 按歌手名跨平台找一位有资料的歌手。
 * 顺序:网易云(资料最全)→ 酷狗 → QQ。
 * QQ 歌手搜索接口匿名常被风控(返回空),故放最后并允许失败。
 */
export async function findArtistAcrossPlatforms(
  name: string
): Promise<{ platform: ArtistPlatform; id: string } | null> {
  const kw = name.trim()
  if (!kw) return null
  // 网易云:按名称查 id(命中即用,资料最全)
  try {
    const id = await findArtistIdByName(kw)
    if (id) return { platform: 'netease', id: String(id) }
  } catch {
    /* 继续下一个平台 */
  }
  // 酷狗:歌手搜索可用
  try {
    const list = await searchKugouArtists(kw, 1, 10)
    const hit = list.find((b) => b.name === kw) ?? list[0]
    if (hit?.id) return { platform: 'kugou', id: hit.id }
  } catch {
    /* 继续下一个平台 */
  }
  // QQ:歌手搜索接口常被风控,失败即放弃
  try {
    const list = await searchQqArtists(kw, 1, 10)
    const hit = list.find((b) => b.name === kw) ?? list[0]
    if (hit?.id) return { platform: 'qq', id: hit.id }
  } catch {
    /* 忽略 */
  }
  return null
}

/** 歌手详情(统一模型) */
export async function getUnifiedArtistDetail(
  platform: ArtistPlatform,
  id: string
): Promise<UnifiedArtistDetail | null> {
  if (!id) return null
  try {
    if (platform === 'netease') {
      const d = await getArtistDetail(Number(id))
      if (!d?.name) return null
      return {
        platform,
        id,
        name: d.name,
        avatar: d.avatar,
        alias: d.alias,
        briefDesc: d.briefDesc,
        musicCount: d.musicSize,
        albumSize: d.albumSize,
        mvSize: d.mvSize,
        fansCount: d.fansCount
      }
    }
    if (platform === 'qq') {
      // QQ 歌手详情接口一次给全:名称/头像/别名/粉丝数
      const p = await getQqArtistProfile(id).catch(() => null)
      // 歌曲数:QQ 详情接口不给,用名称回查搜索结果(按 mid 精确匹配)
      let musicCount: number | undefined
      if (p?.name) {
        const brief = await searchQqArtists(p.name, 1, 10).catch(() => [])
        musicCount = brief.find((b) => b.id === id)?.musicCount
      }
      return {
        platform,
        id,
        name: p?.name || `歌手 ${id}`,
        avatar: p?.avatar,
        alias: p?.alias,
        musicCount,
        fansCount: p?.fansCount
      }
    }
    if (platform === 'kugou') {
      const p = await getKugouArtistProfile(id).catch(() => null)
      return {
        platform,
        id,
        name: p?.name || `歌手 ${id}`,
        avatar: p?.avatar,
        briefDesc: p?.briefDesc,
        musicCount: p?.musicCount
      }
    }
    if (platform === 'qishui' || platform === 'bilibili') {
      // 这两个平台没有歌手详情接口:只给出 id,页面显示为「暂无资料」
      return { platform, id, name: `歌手 ${id}` }
    }
  } catch (e) {
    console.warn('[artist] unified detail failed', platform, id, e)
  }
  return null
}

/** 歌手热门歌曲(跨平台) */
export async function getUnifiedArtistSongs(
  platform: ArtistPlatform,
  id: string
): Promise<Song[]> {
  if (!id) return []
  try {
    if (platform === 'netease') return await getArtistSongs(Number(id))
    if (platform === 'qq') return await getQqArtistSongs(id, 1, 50)
    if (platform === 'kugou') return await getKugouArtistSongs(id, 1, 50)
  } catch (e) {
    console.warn('[artist] unified songs failed', platform, id, e)
  }
  return []
}
