/** 全网热度聚合:按歌名+歌手到三个平台查歌曲级数据
 *
 * 实测结论(2026-10):
 *  - 酷狗:OwnerCount 是真实的"收藏/使用人数"(晴天实测 262 万)
 *  - QQ音乐:搜索接口无收藏数字段(仅 hotness 热度指数)
 *  - 网易云:无收藏数接口,popularity 是 0~100 的归一化热度
 * 所以 result 里 hot 字段如实标注指标类型,绝不把热度冒充成收藏数。
 */
import type { Song } from '@shared/types'
import { searchKugouSongs } from './kugou'

export interface PlatformHot {
  platform: 'kugou' | 'qq' | 'netease'
  /** 指标类型:favorite=真实收藏数 / heat=平台热度指数 */
  metric: 'favorite' | 'heat'
  value: number
  /** 匹配到的歌曲标题(便于用户判断是否同一首) */
  title: string
}

export interface SongHotResult {
  /** 按平台聚合的结果(只包含查到数据的平台) */
  items: PlatformHot[]
  /** 各平台原始查询是否成功(失败时渲染层提示"未查到") */
  errors: { platform: string; message: string }[]
}

/** 归一化标题:去括号后缀/空白,便于跨平台匹配 */
function normTitle(s: string): string {
  return s
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim()
}

/** 归一化歌手:取第一个歌手(跨平台多歌手写法差异大) */
function normArtist(s: string): string {
  return s.split(/[\/,&、]/)[0].replace(/\s+/g, '').toLowerCase().trim()
}

/** 酷狗:搜索结果里 OwnerCount 即收藏量,找标题+歌手最接近的一条 */
async function kugouHot(song: Song): Promise<PlatformHot | null> {
  const kw = `${song.title} ${song.artist.split(/[\/,&、]/)[0] || ''}`.trim()
  const list = await searchKugouSongs(kw, 1, 20)
  if (list.length === 0) return null
  const nt = normTitle(song.title)
  const na = normArtist(song.artist)
  let best: Song | null = null
  let bestScore = -1
  for (const s of list) {
    if (s.favCount == null) continue
    let score = 0
    if (normTitle(s.title) === nt) score += 3
    else if (normTitle(s.title).includes(nt) || nt.includes(normTitle(s.title))) score += 1
    if (normArtist(s.artist) === na) score += 3
    else if (normArtist(s.artist).includes(na) || na.includes(normArtist(s.artist))) score += 1
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  // 至少要有点匹配度,避免把不相干的歌算进来
  if (!best || bestScore < 3 || best.favCount == null) return null
  return { platform: 'kugou', metric: 'favorite', value: best.favCount, title: best.title }
}

/** QQ:搜索返回 hotness 热度指数(非收藏数) */
async function qqHot(song: Song): Promise<PlatformHot | null> {
  const { searchQqSongs } = await import('./qqmusic')
  const kw = `${song.title} ${song.artist.split(/[\/,&、]/)[0] || ''}`.trim()
  const list = await searchQqSongs(kw, 1, 20)
  if (list.length === 0) return null
  // QQ 的 hotness 不在 Song 里,重新请求一次拿原始字段
  const raw = await fetchQqHotness(kw)
  if (raw == null) return null
  return { platform: 'qq', metric: 'heat', value: raw, title: list[0]?.title ?? song.title }
}

/** 直接请求 QQ 搜索拿 hotness(它没进 Song 类型) */
async function fetchQqHotness(keyword: string): Promise<number | null> {
  try {
    const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://y.qq.com/'
      },
      body: JSON.stringify({
        comm: { ct: '19', cv: '1859', uin: '0', format: 'json' },
        req: {
          method: 'DoSearchForQQMusicDesktop',
          module: 'music.search.SearchCgiService',
          param: { num_per_page: '5', page_num: '1', query: keyword, search_type: 0 }
        }
      }),
      signal: AbortSignal.timeout(12_000)
    })
    if (!resp.ok) return null
    const j = (await resp.json()) as {
      req?: { data?: { body?: { song?: { list?: { hotness?: number }[] } } } }
    }
    const list = j?.req?.data?.body?.song?.list ?? []
    const h = list.map((x) => Number(x?.hotness ?? 0)).filter((n) => isFinite(n) && n > 0)
    return h.length > 0 ? Math.max(...h) : null
  } catch {
    return null
  }
}

/** 网易云:搜索结果不含 popularity(实测恒为空),改用详情接口的 popularity(0~100) */
async function neteaseHot(song: Song): Promise<PlatformHot | null> {
  try {
    const kw = `${song.title} ${song.artist.split(/[\/,&、]/)[0] || ''}`.trim()
    const resp = await fetch(
      `https://music.163.com/api/search/get?s=${encodeURIComponent(kw)}&type=1&limit=10&offset=0`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          Referer: 'https://music.163.com'
        },
        signal: AbortSignal.timeout(12_000)
      }
    )
    if (!resp.ok) return null
    const j = (await resp.json()) as {
      result?: { songs?: { id?: number; name?: string; artists?: { name?: string }[] }[] }
    }
    const list = j?.result?.songs ?? []
    const nt = normTitle(song.title)
    const na = normArtist(song.artist)
    // 先按标题+歌手挑最匹配的一条,再查它的详情拿 popularity
    let bestId: number | null = null
    let bestName = ''
    let bestScore = -1
    for (const s of list) {
      const sName = String(s?.name ?? '')
      let score = 0
      if (normTitle(sName) === nt) score += 3
      else if (normTitle(sName).includes(nt) || nt.includes(normTitle(sName))) score += 1
      const sArtist = normArtist((s?.artists ?? []).map((a) => String(a?.name ?? '')).join('/'))
      if (sArtist === na) score += 3
      else if (sArtist.includes(na) || na.includes(sArtist)) score += 1
      if (score > bestScore && s?.id) {
        bestScore = score
        bestId = Number(s.id)
        bestName = sName
      }
    }
    if (!bestId || bestScore < 3) return null
    const dr = await fetch(`https://music.163.com/api/song/detail?ids=[${bestId}]`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://music.163.com'
      },
      signal: AbortSignal.timeout(12_000)
    })
    if (!dr.ok) return null
    const dj = (await dr.json()) as { songs?: { popularity?: number }[] }
    const pop = Number(dj?.songs?.[0]?.popularity ?? 0)
    if (!isFinite(pop) || pop <= 0) return null
    return { platform: 'netease', metric: 'heat', value: pop, title: bestName }
  } catch {
    return null
  }
}

/** 聚合查询:三平台并发,单平台失败不影响其它 */
export async function getSongHot(song: Song): Promise<SongHotResult> {
  const tasks: { platform: 'kugou' | 'qq' | 'netease'; run: () => Promise<PlatformHot | null> }[] = [
    { platform: 'kugou', run: () => kugouHot(song) },
    { platform: 'qq', run: () => qqHot(song) },
    { platform: 'netease', run: () => neteaseHot(song) }
  ]
  const items: PlatformHot[] = []
  const errors: { platform: string; message: string }[] = []
  await Promise.all(
    tasks.map(async (t) => {
      try {
        const r = await t.run()
        if (r) items.push(r)
      } catch (e) {
        errors.push({ platform: t.platform, message: e instanceof Error ? e.message : String(e) })
      }
    })
  )
  return { items, errors }
}
