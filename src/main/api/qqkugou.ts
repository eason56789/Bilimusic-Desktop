/**
 * QQ音乐 / 酷狗音乐 歌单抓取(链接导入用)
 * 两个平台均只有元数据入库:播放时经B站搜索取流,歌词经网易云搜索。
 */
import type { Song } from '@shared/types'
import type { LinkedPlaylist } from './linkImport'

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
      const songmid = it.songmid ?? it.mid ?? ''
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
        addedAt: Date.now()
      }
    })
    .filter((s): s is Song => s !== null)
  if (songs.length === 0) throw new Error('QQ音乐歌单解析失败')
  return {
    platform: 'qq',
    playlistId: id,
    name: decodeEntities(String(cd.dissname ?? `QQ音乐歌单 ${id}`)),
    coverUrl: String(cd.disscover ?? ''),
    songs
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
      const hash = String(it.hash ?? '').toUpperCase()
      const filename = String(it.filename ?? '')
      if (!hash || !filename) continue
      // filename 形如 "歌手 - 歌名"(可含多级 " - ",取最后一段为歌名)
      const parts = filename.split(' - ')
      const artist = parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : '未知'
      const title = parts.length > 1 ? parts[parts.length - 1].trim() : filename.trim()
      if (!title) continue
      songs.push({
        id: `kg-${hash}`,
        title: decodeEntities(title),
        artist: decodeEntities(artist),
        album: '',
        coverUrl: null,
        duration: Math.max(0, Math.round(Number(it.duration ?? 0))),
        source: 'KUGOU',
        page: 1,
        addedAt: Date.now()
      })
    }
    if (list.length === 0) break
    if (total > 0 ? songs.length >= total : list.length < pageSize) break
    if (list.length < pageSize) break
  }
  if (songs.length === 0) throw new Error('酷狗歌单为空或不可访问(可能链接失效)')
  return {
    platform: 'kugou',
    playlistId: id,
    name: decodeEntities(String(info.specialname ?? `酷狗歌单 ${id}`)),
    coverUrl: String(info.imgurl ?? ''),
    songs
  }
}
