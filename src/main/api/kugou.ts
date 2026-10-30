/**
 * 酷狗音乐:匿名搜索 / 歌单·歌手搜索 / 取流 / 高潮点
 * - 搜索: songsearch.kugou.com song_search_v2
 * - 歌单·歌手搜索: mobilecdnbj.kugou.com api/v3/search/{special,singer}
 * - 取流: m.kugou.com getSongInfo.php(免费曲目返回直链,VIP 专享 url 为空)
 * - 评论: 无公开匿名接口,评论区走"网易云/QQ同名搜索"兜底(与旧版 QQ/酷狗行为一致)
 */
import type {
  Song,
  SourcePlaylistBrief,
  SourceArtistBrief,
  HighlightPoint,
  ChartCatalog,
  ChartDetail,
  ChartBrief
} from '@shared/types'

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

/**
 * 归一化酷狗封面 URL:
 * - `imge.kugou.com/stdmusic/{size}/xxx.jpg`(占位符需替换成尺寸档,否则服务端会给极小图)
 * - `singerimg.kugou.com/uploadpic/softhead/{size}/xxx.jpg`(歌手头像)
 * - 已是具体尺寸的 URL 原样返回
 */
export function normalizeKugouCover(raw: unknown, size = 480): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.includes('{size}')) return s.replace(/\{size\}/g, String(size))
  // 无占位符但带 /数字/ 尺寸段的,统一换成目标档位
  if (/kugou\.com/.test(s) && /\/(\d{3})\//.test(s)) {
    return s.replace(/\/(\d{3})\//, `/${size}/`)
  }
  return s
}

/** 从搜索命中项里挑最可用的封面(Image → AlbumImage → trans_param.union_cover) */
function coverOf(it: any): string | null {
  return (
    normalizeKugouCover(it?.Image) ??
    normalizeKugouCover(it?.AlbumImage) ??
    normalizeKugouCover(it?.trans_param?.union_cover)
  )
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
      const coverUrl = coverOf(it)
      const fav = Number(it.OwnerCount ?? 0)
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
        // 收藏数:酷狗搜索接口的 OwnerCount
        favCount: fav > 0 ? fav : undefined,
        // 付费标记:Privilege 非 0 且 PayType 非 0 → 大概率 VIP 专享(播放时仍会先试一次取流)
        vipOnly: Number(it.PayType ?? 0) > 0 && Number(it.Privilege ?? 0) > 0
      }
    })
    .filter((s): s is Song => s !== null)
}

/**
 * 歌单曲目 / 歌手曲目 → Song。
 * 这两类接口只给 `filename`(形如 "歌手 - 歌名")与 album_id/album_audio_id,
 * 没有结构化歌名歌手,按 " - " 拆分;封面取 trans_param.union_cover(缺失则回退 null)。
 */
export function songFromKugouFileItem(it: any, fallbackArtist = ''): Song | null {
  const hash = String(it?.hash || it?.['320hash'] || it?.sqhash || '').toUpperCase()
  const filename = decodeEntities(String(it?.filename ?? '').trim())
  if (!hash || !filename) return null
  const parts = filename.split(' - ')
  const artist =
    parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() || fallbackArtist : fallbackArtist || '未知'
  const title = parts.length > 1 ? parts[parts.length - 1].trim() : filename
  if (!title) return null
  const coverUrl =
    normalizeKugouCover(it?.trans_param?.union_cover) ??
    normalizeKugouCover(it?.album_image) ??
    normalizeKugouCover(it?.img)
  const priv = Number(it?.privilege ?? 0)
  const pay = Number(it?.pay_type ?? 0)
  return {
    id: `kg-${hash}`,
    title,
    artist,
    album: decodeEntities(String(it?.album_name ?? '')),
    coverUrl,
    duration: Math.max(0, Math.round(Number(it?.duration ?? 0))),
    source: 'KUGOU',
    page: 1,
    addedAt: Date.now(),
    kugouHash: hash,
    kugouMixId: String(it?.album_audio_id ?? '') || undefined,
    kugouAlbumId: String(it?.album_id ?? '') || undefined,
    vipOnly: pay > 0 && priv > 0
  }
}

/** 歌单搜索(酷狗歌单广场为 special 命名空间) */
export async function searchKugouPlaylists(
  keyword: string,
  page = 1,
  pageSize = 20
): Promise<SourcePlaylistBrief[]> {
  const url =
    'http://mobilecdnbj.kugou.com/api/v3/search/special?keyword=' +
    encodeURIComponent(keyword) +
    `&page=${Math.max(1, page)}&pagesize=${Math.min(50, Math.max(1, pageSize))}&showtype=1&version=9108`
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗歌单搜索 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const list: any[] = json?.data?.info ?? []
  return list
    .map((it): SourcePlaylistBrief | null => {
      const id = String(it?.specialid ?? '')
      if (!id) return null
      const fav = Number(it?.collectcount ?? 0)
      return {
        id,
        name: decodeEntities(String(it?.specialname ?? '').trim()) || `酷狗歌单 ${id}`,
        coverUrl: normalizeKugouCover(it?.imgurl) ?? undefined,
        count: Number(it?.songcount ?? 0),
        creator: decodeEntities(String(it?.nickname ?? '')),
        playCount: Number(it?.playcount ?? 0) || undefined,
        favCount: fav > 0 ? fav : undefined
      }
    })
    .filter((s): s is SourcePlaylistBrief => s !== null)
}

/** 歌手搜索(该接口返回裸数组或 data.info,two 形态都兼容) */
export async function searchKugouArtists(
  keyword: string,
  page = 1,
  pageSize = 20
): Promise<SourceArtistBrief[]> {
  const url =
    'http://mobilecdnbj.kugou.com/api/v3/search/singer?keyword=' +
    encodeURIComponent(keyword) +
    `&page=${Math.max(1, page)}&pagesize=${Math.min(50, Math.max(1, pageSize))}&showtype=1&version=9108`
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗歌手搜索 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const raw: any[] = Array.isArray(json) ? json : (json?.data?.info ?? json?.data ?? [])
  return (Array.isArray(raw) ? raw : [])
    .map((it): SourceArtistBrief | null => {
      const id = String(it?.singerid ?? '')
      if (!id) return null
      return {
        id,
        name: decodeEntities(String(it?.singername ?? '').trim()) || `歌手 ${id}`,
        avatar: normalizeKugouCover(it?.imgurl ?? it?.singerimg) ?? undefined,
        musicCount: Number(it?.songcount ?? it?.musiccount ?? 0) || undefined
      }
    })
    .filter((s): s is SourceArtistBrief => s !== null)
}

/** 歌手热门歌曲(sort=1 按热度) */
export async function getKugouArtistSongs(
  singerId: string,
  page = 1,
  pageSize = 50
): Promise<Song[]> {
  const url =
    'http://mobilecdnbj.kugou.com/api/v3/singer/song?singerid=' +
    encodeURIComponent(singerId) +
    `&page=${Math.max(1, page)}&pagesize=${Math.min(100, Math.max(1, pageSize))}&sort=1&version=9108`
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗歌手歌曲 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const list: any[] = json?.data?.info ?? []
  return list
    .map((it) => songFromKugouFileItem(it))
    .filter((s): s is Song => s !== null)
}

interface KugouSongInfo {
  url: string
  quality: string
  /** 原生高潮片段起点(点标记,毫秒) */
  climax: HighlightPoint | null
  /** 专辑封面(部分曲目有,可补封面) */
  cover: string | null
  at: number
}

/** getSongInfo 响应缓存(直链带签名,8 分钟过期;climax/封面同一份响应里取) */
const kgInfoCache = new Map<string, KugouSongInfo>()
const KG_INFO_TTL_MS = 8 * 60 * 1000

/** 拉取(或命中缓存的)酷狗曲目信息;失败返回 null */
async function fetchKugouSongInfo(hash: string): Promise<KugouSongInfo | null> {
  const hit = kgInfoCache.get(hash)
  if (hit && Date.now() - hit.at < KG_INFO_TTL_MS) return hit
  const url = `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(hash)}`
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://m.kugou.com/' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as any
    const direct = String(json?.url ?? '')
    const br = Number(json?.bitRate ?? 0)
    const ext = String(json?.extName ?? 'mp3').toLowerCase()
    const quality =
      ext === 'flac' ? '酷狗 FLAC' : br >= 320 ? '酷狗 320k' : br >= 192 ? '酷狗 192k' : '酷狗 128k'
    // climax_info: { start_time, end_time } 毫秒;酷狗自己的"高潮片段"标记。
    // 进度条只画一个点,取片段起点(有片段即认为高潮从此开始)
    const startMs = Number(json?.climax_info?.start_time ?? 0)
    const endMs = Number(json?.climax_info?.end_time ?? 0)
    const climax =
      isFinite(startMs) && isFinite(endMs) && endMs > startMs + 3000 && startMs > 0
        ? { timeMs: startMs, kind: 'climax' as const }
        : null
    const info: KugouSongInfo = {
      url: direct,
      quality,
      climax,
      cover: normalizeKugouCover(json?.img ?? json?.imgUrl),
      at: Date.now()
    }
    kgInfoCache.set(hash, info)
    if (kgInfoCache.size > 300) {
      const first = kgInfoCache.keys().next().value
      if (first) kgInfoCache.delete(first)
    }
    return info
  } catch {
    return null
  }
}

/** 取流:返回 128k/320k mp3 直链或者 flac(免费曲目);VIP 专享 / 无版权返回 null */
export async function getKugouSongUrl(
  hash: string
): Promise<{ url: string; quality: string } | null> {
  const info = await fetchKugouSongInfo(hash)
  if (!info?.url) return null
  return { url: info.url, quality: info.quality }
}

/** 曲目高潮点(进度条标记):酷狗原生 climax_info,取不到返回 null */
export async function getKugouClimax(hash: string): Promise<HighlightPoint[] | null> {
  const info = await fetchKugouSongInfo(hash)
  return info?.climax ? [info.climax] : null
}

/** 曲目封面(库内老数据缺封面时补齐用) */
export async function getKugouCover(hash: string): Promise<string | null> {
  const info = await fetchKugouSongInfo(hash)
  return info?.cover ?? null
}

// ============ 排行榜 ============

/**
 * 榜单目录:mobilecdnbj api/v3/rank/list(56 个榜,含 TOP500/电音/纯音乐/国潮等)。
 * 该域名的 HTTPS 证书主机名不匹配(ERR_TLS_CERT_ALTNAME_INVALID),必须走 HTTP —
 * 与 qqkugou.ts 里歌单/歌手搜索的处理一致。
 */
export async function getChartCatalog(): Promise<ChartCatalog> {
  const label = '酷狗音乐'
  try {
    const resp = await fetch(
      'http://mobilecdnbj.kugou.com/api/v3/rank/list?version=9108&plat=0&showtype=2',
      { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!resp.ok) throw new Error(`酷狗 HTTP ${resp.status}`)
    const json = (await resp.json()) as any
    const info: any[] = json?.data?.info ?? []
    const charts: ChartBrief[] = info
      .map((r: any): ChartBrief | null => {
        const id = String(r?.rankid ?? '')
        const name = decodeEntities(String(r?.rankname ?? '').trim())
        if (!id || !name) return null
        // 酷狗该接口不返回榜单封面,取 update_frequency/简介文本作为副标题
        const tip = r?.update_frequency ? `更新频率 ${r.update_frequency}` : undefined
        const intro = r?.intro ? decodeEntities(String(r.intro)).slice(0, 80) : undefined
        return { id, name, updateTip: tip, intro }
      })
      .filter((c): c is ChartBrief => c !== null)
    if (charts.length === 0) {
      return { platform: 'kugou', label, groups: [], error: '酷狗榜单目录为空' }
    }
    return { platform: 'kugou', label, groups: [{ name: '', charts }] }
  } catch (e) {
    return { platform: 'kugou', label, groups: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 榜单曲目:api/v3/rank/song。该接口给 filename("歌手 - 歌名")+ hash + album_id,
 * 没有结构化歌名歌手,复用 songFromKugouFileItem 拆分。
 */
export async function getChartSongs(chartId: string, pageSize = 100): Promise<ChartDetail> {
  const resp = await fetch(
    `http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&plat=0&pagesize=${pageSize}&page=1&rankid=${encodeURIComponent(chartId)}`,
    { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }, signal: AbortSignal.timeout(15_000) }
  )
  if (!resp.ok) throw new Error(`酷狗 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const info: any[] = json?.data?.info ?? []
  const songs = info
    .map((it: any) => songFromKugouFileItem(it))
    .filter((s): s is Song => s !== null)
  // song 接口不返回榜单名,由 ipc 层用目录缓存的名称回填
  return {
    id: String(chartId),
    name: '',
    platform: 'kugou',
    songs,
    total: Number(json?.data?.total ?? 0) || songs.length
  }
}
