/**
 * 酷狗音乐:匿名搜索 / 取流
 * - 搜索: songsearch.kugou.com song_search_v2
 * - 取流: m.kugou.com getSongInfo.php(免费曲目返回直链,VIP 专享 url 为空)
 * - 评论: 无公开匿名接口,评论区走"网易云同名搜索"兜底(与旧版 QQ/酷狗行为一致)
 */
import type { Song } from '@shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** 匿名搜索(每页 30 条) */
export async function searchKugouSongs(keyword: string, page = 1, pageSize = 30): Promise<Song[]> {
  const url =
    'https://songsearch.kugou.com/song_search_v2?keyword=' +
    encodeURIComponent(keyword) +
    `&page=${Math.max(1, page)}&pagesize=${Math.min(50, Math.max(1, pageSize))}&platform=WebFilter&format=json`
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const list: any[] = json?.data?.lists ?? []
  return list
    .map((it): Song | null => {
      // 优先无损/320k hash 作为取流 hash(实际取流接口按 hash 返回可用音质)
      const hash = String(it.SQFileHash || it.HQFileHash || it.FileHash || '').toUpperCase()
      const name = decodeEntities(String(it.SongName ?? '').trim())
      if (!hash || !name) return null
      const artist = decodeEntities(String(it.SingerName ?? '未知').trim())
      const imgRaw = String(it.Image ?? it.AlbumImage ?? '')
      const coverUrl = imgRaw
        ? imgRaw.startsWith('http')
          ? imgRaw.replace('{size}', '480')
          : `https://imge.kugou.com/stdmusic/480/${imgRaw}`
        : null
      return {
        id: `kg-${hash}`,
        title: name,
        artist,
        album: decodeEntities(String(it.AlbumName ?? '')),
        coverUrl,
        duration: Math.max(0, Math.round(Number(it.Duration ?? 0))),
        source: 'KUGOU',
        page: 1,
        addedAt: Date.now(),
        kugouHash: hash,
        kugouMixId: String(it.MixSongID ?? it.EMixSongID ?? '') || undefined,
        kugouAlbumId: String(it.AlbumID ?? '') || undefined,
        // 付费标记:Privilege 非 0 且 PayType 非 0 → 大概率 VIP 专享(播放时仍会先试一次取流)
        vipOnly: Number(it.PayType ?? 0) > 0 && Number(it.Privilege ?? 0) > 0
      }
    })
    .filter((s): s is Song => s !== null)
}

/** 取流:返回 128k/320k mp3 直链或者 flac(免费曲目);VIP 专享 / 无版权返回 null */
export async function getKugouSongUrl(
  hash: string
): Promise<{ url: string; quality: string } | null> {
  const url = `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(hash)}`
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://m.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) return null
  const json = (await resp.json()) as any
  const direct = String(json?.url ?? '')
  if (!direct) return null
  const br = Number(json?.bitRate ?? 0)
  const ext = String(json?.extName ?? 'mp3').toLowerCase()
  const quality =
    ext === 'flac' ? '酷狗 FLAC' : br >= 320 ? '酷狗 320k' : br >= 192 ? '酷狗 192k' : '酷狗 128k'
  return { url: direct, quality }
}

/**
 * 歌曲统计:酷狗搜索条目自带 OwnerCount(收藏/使用人数,与"收藏量"同口径)
 * 与 HeatLevel(热度等级 0-10)。没有公开播放量接口。
 * 按 hash 在搜索结果里精确匹配拿字段(搜索接口才有,取流接口没有)。
 */
export async function getKugouSongStats(
  hash: string,
  title: string,
  artist: string
): Promise<{ favCount?: number; heatLevel?: number }> {
  const upper = hash.toUpperCase()
  const tryKeyword = async (kw: string) => {
    const url =
      'https://songsearch.kugou.com/song_search_v2?keyword=' +
      encodeURIComponent(kw) +
      '&page=1&pagesize=30&platform=WebFilter&format=json'
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as any
    const list: any[] = json?.data?.lists ?? []
    return (
      list.find(
        (it) =>
          [it.FileHash, it.HQFileHash, it.SQFileHash].some(
            (h) => String(h ?? '').toUpperCase() === upper
          )
      ) ?? null
    )
  }
  try {
    let hit = await tryKeyword(`${title} ${artist}`.trim())
    if (!hit) hit = await tryKeyword(title)
    if (!hit) return {}
    return {
      favCount: typeof hit.OwnerCount === 'number' ? hit.OwnerCount : undefined,
      heatLevel: typeof hit.HeatLevel === 'number' ? hit.HeatLevel : undefined
    }
  } catch {
    return {}
  }
}
