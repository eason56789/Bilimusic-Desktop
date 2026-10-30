/**
 * QQ音乐 / 酷狗音乐 歌单抓取(链接导入 / 搜索结果预览共用)
 * - QQ:歌单曲目带 songmid/songid,可直接走 vkey 原生取流
 * - 酷狗:歌单曲目带 hash/album_audio_id,可直接走原生取流;封面取 trans_param.union_cover
 */
import type { Song } from '@shared/types'
import type { LinkedPlaylist } from './linkImport'
import { normalizeKugouCover, songFromKugouFileItem } from './kugou'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** HTML 实体解码(QQ 返回的歌名里常见 &amp; 等) */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
}

async function getJson(url: string, referer: string): Promise<any> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'application/json, text/plain, */*'
    },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return await resp.json()
}

// ============ QQ音乐 ============

export async function fetchQqPlaylist(id: string): Promise<LinkedPlaylist> {
  // qzone 详情接口(公开歌单无需登录):type=1 返回 songlist
  const url =
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg' +
    `?type=1&json=1&utf8=1&onlysong=0&format=json&disstid=${encodeURIComponent(id)}`
  const json = await getJson(url, 'https://y.qq.com/')
  const cd = Array.isArray(json?.cdlist) ? json.cdlist[0] : null
  const list: any[] = cd?.songlist ?? []
  if (!cd || list.length === 0) {
    // subcode 4000 "check privacy error!" = 创建者设置了隐私权限,匿名无法访问
    if (json?.subcode === 4000 || /privacy/i.test(String(json?.msg ?? ''))) {
      throw new Error('该QQ歌单设置了隐私权限,无法匿名导入')
    }
    if (json?.code === 10) {
      throw new Error('QQ歌单不存在或已失效')
    }
    throw new Error('QQ音乐歌单为空或不可访问(可能需要登录或链接失效)')
  }
  const songs: Song[] = list
    .map((it): Song | null => {
      const songid = it.songid ?? it.songId
      const songmid = String(it.songmid ?? it.mid ?? '')
      if (!songid && !songmid) return null
      const name = decodeEntities(String(it.songname ?? it.title ?? '').trim())
      if (!name) return null
      const singerRaw = it.singer ?? it.singers ?? []
      const artist =
        (Array.isArray(singerRaw)
          ? singerRaw.map((s: any) => decodeEntities(String(s?.name ?? s ?? '')))
          : [String(singerRaw)]
        )
          .filter(Boolean)
          .join(' / ') || '未知'
      return {
        id: `qq-${songid ?? songmid}`,
        title: name,
        artist,
        album: decodeEntities(String(it.albumname ?? it.album?.name ?? '')),
        coverUrl: it.albummid ? `https://y.qq.com/music/photo_new/T002R500x500M000${it.albummid}.jpg` : null,
        duration: Math.max(0, Math.round(Number(it.interval ?? it.duration ?? 0))),
        source: 'QQMUSIC',
        page: 1,
        addedAt: Date.now(),
        // 原生取流/评论所需:歌单曲目同样带 mid 与数字 id
        qqMid: songmid || undefined,
        qqId: Number(songid) || undefined
      }
    })
    .filter((s): s is Song => s !== null)
  if (songs.length === 0) throw new Error('QQ音乐歌单解析失败')
  // 封面:logo 是歌单封面(旧字段 album_pic_mid/pic_mid 常为空)
  const cover = String(cd.logo ?? cd.dir_pic_url2 ?? cd.headurl ?? '').trim()
  const play = Number(cd.visitnum ?? 0)
  const fav = Number(cd.favnum ?? 0)
  return {
    platform: 'qq',
    playlistId: id,
    name: decodeEntities(String(cd.dissname ?? `QQ音乐歌单 ${id}`)),
    coverUrl: cover,
    songs,
    description: decodeEntities(String(cd.desc ?? '')),
    creator: decodeEntities(String(cd.nickname ?? cd.nick ?? '')),
    playCount: play > 0 ? play : undefined,
    favCount: fav > 0 ? fav : undefined
  }
}

// ============ 酷狗 ============
// 注意:酷狗歌单的接口命名空间是 special(不是 playlist),参数名 specialid;
// mobilecdnbj 域名走 http(https 证书在部分网络下不匹配),明文参数即可,无需签名。

export async function fetchKugouPlaylist(id: string): Promise<LinkedPlaylist> {
  const base = 'http://mobilecdnbj.kugou.com/api/v3/special'
  const q = `?plateform=web&appid=1005&specialid=${encodeURIComponent(id)}`
  const referer = 'https://www.kugou.com/'

  // 歌单元信息(名称/封面/总数)
  const infoJson = await getJson(`${base}/info${q}`, referer).catch(() => null)
  const info = infoJson?.data ?? {}
  const total = Number(info.songcount ?? 0)

  // 曲目分页拉取
  const songs: Song[] = []
  const pageSize = 50
  const maxPages = 40 // 安全上限(最多 2000 首)
  for (let page = 1; page <= maxPages; page++) {
    const json = await getJson(`${base}/song${q}&page=${page}&pagesize=${pageSize}`, referer)
    const list: any[] = json?.data?.info ?? []
    for (const it of list) {
      // 曲目映射与歌手曲目共用:hash/album_audio_id 原生可用,封面取 trans_param.union_cover
      const song = songFromKugouFileItem(it)
      if (song) songs.push(song)
    }
    if (list.length === 0) break
    if (total > 0 ? songs.length >= total : list.length < pageSize) break
    if (list.length < pageSize) break
  }
  if (songs.length === 0) throw new Error('酷狗歌单为空或不可访问(可能链接失效)')
  const fav = Number(info.collectcount ?? 0)
  const play = Number(info.playcount ?? 0)
  return {
    platform: 'kugou',
    playlistId: id,
    name: decodeEntities(String(info.specialname ?? `酷狗歌单 ${id}`)),
    coverUrl: normalizeKugouCover(info.imgurl) ?? '',
    songs,
    description: decodeEntities(String(info.intro ?? '')),
    creator: decodeEntities(String(info.nickname ?? '')),
    playCount: play > 0 ? play : undefined,
    favCount: fav > 0 ? fav : undefined
  }
}

/**
 * 酷狗概念版歌单(新版分享链接 t1.kugou.com/xxx 跳转到 activity.kugou.com 分享页,
 * 页面里带 global_specialid=collection_x_y_z 形式的歌单 id)。
 *
 * 这类歌单在旧 v3 special 接口上取不到,必须走 mobiles.kugou.com 的 v5 special/song;
 * filename 形如 "S.H.E - 天灰",拆成歌手/歌名。
 */
export async function fetchKugouCollectionPlaylist(
  globalId: string,
  specialId?: string
): Promise<LinkedPlaylist> {
  const UA_KG =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const referer = 'https://www.kugou.com/'
  const pageSize = 100
  const maxPages = 50
  const songs: Song[] = []
  let total = 0
  let meta: Record<string, unknown> = {}

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://mobiles.kugou.com/api/v5/special/song?specialid=${encodeURIComponent(specialId ?? '')}` +
      `&global_collection_id=${encodeURIComponent(globalId)}` +
      `&page=${page}&pagesize=${pageSize}&plat=0&version=8000`
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA_KG, Referer: referer },
      signal: AbortSignal.timeout(20_000)
    })
    if (!resp.ok) throw new Error(`酷狗概念版歌单 HTTP ${resp.status}`)
    const json = (await resp.json()) as {
      data?: { info?: Record<string, unknown>[]; total?: number }
      errcode?: number
      error?: string
    }
    if (json.errcode && json.errcode !== 0) {
      throw new Error(`酷狗概念版歌单接口错误:${json.error ?? json.errcode}`)
    }
    const list = json?.data?.info ?? []
    if (page === 1) {
      total = Number(json?.data?.total ?? 0)
      meta = (json?.data ?? {}) as Record<string, unknown>
    }
    for (const it of list) {
      const filename = String(it.filename ?? '').trim()
      // filename 通常是 "歌手 - 歌名";没有分隔符时整串当歌名
      const dash = filename.indexOf(' - ')
      const artist = dash > 0 ? filename.slice(0, dash).trim() : '未知'
      const title = dash > 0 ? filename.slice(dash + 3).trim() : filename
      const hash = String(it.hash ?? it.sqhash ?? it['320hash'] ?? '').toUpperCase()
      if (!hash || !title) continue
      const duration = Math.max(0, Math.round(Number(it.duration ?? 0)))
      songs.push({
        id: `kg-${hash}`,
        title,
        artist,
        album: decodeEntities(String(it.album_name ?? '')) || undefined,
        coverUrl: normalizeKugouCover(String(it.album_image ?? it.imgurl ?? '')) ?? undefined,
        duration,
        source: 'KUGOU',
        page: 1,
        addedAt: Date.now(),
        kugouHash: hash,
        kugouMixId: it.album_audio_id ? String(it.album_audio_id) : undefined,
        kugouAlbumId: it.album_id ? String(it.album_id) : undefined
      })
    }
    if (list.length === 0) break
    if (total > 0 && songs.length >= total) break
    if (list.length < pageSize) break
  }
  if (songs.length === 0) throw new Error('酷狗概念版歌单为空或不可访问(可能链接失效)')

  // 概念版 song 接口不返回歌单元信息,另取 v5 special/info 补名称/封面/简介
  let metaInfo: Record<string, unknown> = {}
  if (specialId) {
    try {
      const ir = await fetch(
        `https://mobiles.kugou.com/api/v5/special/info?specialid=${encodeURIComponent(specialId)}` +
          `&global_collection_id=${encodeURIComponent(globalId)}&plat=0&version=8000`,
        { headers: { 'User-Agent': UA_KG, Referer: referer }, signal: AbortSignal.timeout(15_000) }
      )
      if (ir.ok) {
        const ij = (await ir.json()) as { data?: Record<string, unknown> }
        metaInfo = ij?.data ?? {}
      }
    } catch {
      /* 名称取不到就用兜底名 */
    }
  }
  const merged = { ...meta, ...metaInfo }

  return {
    platform: 'kugou',
    playlistId: globalId,
    name: decodeEntities(String(merged.specialname ?? merged.name ?? `酷狗歌单 ${globalId}`)),
    coverUrl: normalizeKugouCover(String(merged.imgurl ?? merged.img ?? '')) ?? '',
    songs,
    description: decodeEntities(String(merged.intro ?? merged.desc ?? '')),
    creator: decodeEntities(String(merged.nickname ?? merged.username ?? '')),
    playCount:
      Number(merged.playcount ?? merged.play_count ?? 0) > 0
        ? Number(merged.playcount ?? merged.play_count)
        : undefined,
    favCount:
      Number(merged.collectcount ?? merged.collect_count ?? 0) > 0
        ? Number(merged.collectcount ?? merged.collect_count)
        : undefined
  }
}
