/**
 * QQ 音乐:匿名搜索(歌曲/歌单/歌手) / vkey 取流 / 评论
 * - 搜索: musicu.fcg DoSearchForQQMusicDesktop(search_type 0=歌曲 1=歌手 3=歌单)
 * - 歌手歌曲: musicu.fcg music.web_singer_info_svr get_singer_detail_info
 * - 取流: vkey.GetVkeyServer CgiGetVkey(免费/试听曲目返回 purl,VIP 专享为空)
 * - 评论: c.y.qq.com fcg_global_comment_h5(cmd=8 热评 / cmd=6 最新,topid 用数字 songid)
 */
import type { Song, SourcePlaylistBrief, SourceArtistBrief } from '@shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function postMusicu(req: Record<string, unknown>, comm: Record<string, string>): Promise<any> {
  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: 'https://y.qq.com/',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ comm, req }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`QQ音乐 HTTP ${resp.status}`)
  return await resp.json()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** 取流 guid(匿名环境固定值即可,CgiGetVkey 要求纯数字) */
const QQ_GUID = '10000'

/** QQ 是否付费/无试听(pay.play: 0 免费 1 VIP;action.msgpay 同样标记) */
function qqUnplayable(pay: any): boolean {
  if (!pay) return false
  // pay_play=1 需要会员;time_free>0 表示前 N 秒可试听(可播)
  return pay.pay_play === 1 && !(Number(pay.time_free) > 0)
}

/** 搜索命中项(歌曲) → Song:搜索结果与歌手歌曲列表结构一致,共用一份映射 */
function qqSongFromItem(it: any): Song | null {
  const mid = String(it.mid ?? '')
  const name = decodeEntities(String(it.name ?? it.title ?? '').trim())
  if (!mid || !name) return null
  const artist =
    (Array.isArray(it.singer)
      ? it.singer.map((s: any) => decodeEntities(String(s?.name ?? '')))
      : []
    )
      .filter(Boolean)
      .join(' / ') || '未知'
  const albumMid = String(it.album?.mid ?? '')
  // interval 为秒;部分返回 int64 包装 {value}
  const iv = it.interval?.value ?? it.interval ?? 0
  return {
    id: `qq-${it.id ?? mid}`,
    title: name,
    artist,
    album: decodeEntities(String(it.album?.name ?? '')),
    coverUrl: albumMid ? `https://y.qq.com/music/photo_new/T002R500x500M000${albumMid}.jpg` : null,
    duration: Math.max(0, Math.round(Number(iv) || 0)),
    source: 'QQMUSIC',
    page: 1,
    addedAt: Date.now(),
    qqMid: mid,
    qqId: Number(it.id) || undefined,
    vipOnly: qqUnplayable(it.pay)
  }
}

/** 匿名搜索歌曲(每页 30 条上限) */
export async function searchQqSongs(keyword: string, page = 1, pageSize = 30): Promise<Song[]> {
  const json = await postMusicu(
    {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: {
        num_per_page: String(Math.min(60, Math.max(1, pageSize))),
        page_num: String(Math.max(1, page)),
        query: keyword,
        search_type: 0
      }
    },
    { ct: '19', cv: '1859', uin: '0', format: 'json' }
  )
  const list: any[] = json?.req?.data?.body?.song?.list ?? []
  return list.map(qqSongFromItem).filter((s): s is Song => s !== null)
}

/**
 * 搜索接口的"分段"结果(歌手段/歌单段)偶发返回空列表(突发请求/进程内首个请求时实测出现),
 * 空结果时短延迟重试;仍为空则如实返回空(关键词确实无结果)。
 */
async function searchSectionWithRetry<T>(
  build: () => Promise<any>,
  pick: (json: any) => any[] | undefined,
  map: (it: any) => T | null
): Promise<T[]> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const json = await build()
      const list = pick(json) ?? []
      const mapped = list.map(map).filter((x): x is T => x !== null)
      if (mapped.length > 0) return mapped
      lastError = null
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
  }
  if (lastError) throw lastError
  return []
}

/** 歌单搜索(QQ 音乐分享/歌单广场,songlist 段) */
export async function searchQqPlaylists(
  keyword: string,
  page = 1,
  pageSize = 20
): Promise<SourcePlaylistBrief[]> {
  return searchSectionWithRetry(
    () =>
      postMusicu(
        {
          method: 'DoSearchForQQMusicDesktop',
          module: 'music.search.SearchCgiService',
          param: {
            num_per_page: String(Math.min(50, Math.max(1, pageSize))),
            page_num: String(Math.max(1, page)),
            query: keyword,
            search_type: 3
          }
        },
        { ct: '19', cv: '1859', uin: '0', format: 'json' }
      ),
    (json) => json?.req?.data?.body?.songlist?.list,
    (it): SourcePlaylistBrief | null => {
      const id = String(it?.dissid ?? '')
      if (!id) return null
      const play = Number(it?.listennum ?? 0)
      const fav = Number(it?.favnum ?? 0)
      return {
        id,
        name: decodeEntities(String(it?.dissname ?? '').trim()) || `QQ音乐歌单 ${id}`,
        coverUrl: String(it?.imgurl ?? '') || undefined,
        count: Number(it?.song_count ?? it?.songnum ?? 0),
        creator: decodeEntities(String(it?.creator?.name ?? it?.nick ?? '')),
        playCount: play > 0 ? play : undefined,
        // 匿名接口不返回收藏数(favnum 恒为 0),有则展示
        favCount: fav > 0 ? fav : undefined
      }
    }
  )
}

/** 歌手搜索(singer 段:mid 用于后续拉热门歌曲) */
export async function searchQqArtists(
  keyword: string,
  page = 1,
  pageSize = 20
): Promise<SourceArtistBrief[]> {
  return searchSectionWithRetry(
    () =>
      postMusicu(
        {
          method: 'DoSearchForQQMusicDesktop',
          module: 'music.search.SearchCgiService',
          param: {
            num_per_page: String(Math.min(50, Math.max(1, pageSize))),
            page_num: String(Math.max(1, page)),
            query: keyword,
            search_type: 1
          }
        },
        { ct: '19', cv: '1859', uin: '0', format: 'json' }
      ),
    (json) => json?.req?.data?.body?.singer?.list,
    (it): SourceArtistBrief | null => {
      const id = String(it?.singerMID ?? '')
      if (!id) return null
      return {
        id,
        name: decodeEntities(String(it?.singerName ?? '').trim()) || `歌手 ${id}`,
        avatar: String(it?.singerPic ?? '') || undefined,
        musicCount: Number(it?.songNum ?? 0) || undefined
      }
    }
  )
}

/** 歌手热门歌曲(music.web_singer_info_svr,默认按热度排序) */
export async function getQqArtistSongs(
  singerMid: string,
  page = 1,
  pageSize = 50
): Promise<Song[]> {
  const num = Math.min(100, Math.max(1, pageSize))
  const begin = Math.max(0, (Math.max(1, page) - 1) * num)
  const json = await postMusicu(
    {
      module: 'music.web_singer_info_svr',
      method: 'get_singer_detail_info',
      param: { sort: 5, singermid: singerMid, num: String(num), begin: String(begin) }
    },
    { ct: '19', cv: '1859', uin: '0', format: 'json' }
  )
  const list: any[] = json?.req?.data?.songlist ?? []
  return list.map(qqSongFromItem).filter((s): s is Song => s !== null)
}

/** 歌手粉丝数(歌曲详情页展示用) */
export async function getQqArtistFans(singerMid: string): Promise<number | null> {
  try {
    const json = await postMusicu(
      {
        module: 'music.web_singer_info_svr',
        method: 'get_singer_detail_info',
        param: { sort: 5, singermid: singerMid, num: '1', begin: '0' }
      },
      { ct: '19', cv: '1859', uin: '0', format: 'json' }
    )
    const fans = Number(json?.req?.data?.singer_info?.fans ?? 0)
    return fans > 0 ? fans : null
  } catch {
    return null
  }
}

/** vkey 取流:返回直链(免费/试听曲目),VIP 专享返回 null */
export async function getQqSongUrl(songMid: string): Promise<{ url: string; quality: string } | null> {
  const json = await postMusicu(
    {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: QQ_GUID,
        songmid: [songMid],
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20'
      }
    },
    { ct: '24', cv: '0', uin: '0', format: 'json' }
  )
  const data = json?.req?.data
  const info = data?.midurlinfo?.[0]
  const purl = String(info?.purl ?? '')
  if (!purl) return null
  const sip = String(data?.sip?.[0] ?? 'http://aqqmusic.tc.qq.com/')
  // purl 是相对路径带查询串,拼 sip 主机;http 主机既有 aqqmusic.tc.qq.com 也有流媒体域名
  const url = purl.startsWith('http') ? purl : sip + purl
  const filename = String(info?.filename ?? '')
  const quality = filename.endsWith('.flac') ? 'FLAC' : filename.endsWith('.m4a') ? 'M4A' : 'MP3'
  return { url, quality: `QQ音乐 ${quality}` }
}

/**
 * 评论(匿名可用的是"热评池"单页,实测 cmd=6/cmd=8 匿名态返回同一列表且 pagenum 被忽略):
 * - hot:  按接口原始顺序(热度)
 * - time: 本地按时间倒序重排(降级,但可用)
 * - offset>0 时不再请求(无翻页能力,返回空)
 */
export async function getQqComments(
  songId: number,
  offset = 0,
  limit = 20,
  order: 'hot' | 'time' = 'hot'
): Promise<{
  total: number
  comments: { id: string; user: string; avatar: string; content: string; time: number; likes: number }[]
  hasMore: boolean
}> {
  if (offset > 0) return { total: 0, comments: [], hasMore: false }
  const params = new URLSearchParams({
    g_tk: '5381',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    cmd: '8',
    biztype: '1',
    topid: String(songId),
    reqtype: '2',
    pagenum: '0',
    pagesize: String(Math.min(30, Math.max(5, limit))),
    needmusiccrit: '0',
    lasthotcommentid: '',
    domain: 'qq.com',
    platform: 'yqq',
    needNewCode: '0',
    loginUin: '0',
    hostUin: '0',
    notice: '0'
  })
  const resp = await fetch(
    `https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?${params}`,
    {
      headers: {
        'User-Agent': UA,
        Referer: `https://y.qq.com/n/ryqq/songDetail/${songId}`
      },
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!resp.ok) throw new Error(`QQ评论 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const box = json?.hot_comment ?? json?.comment
  const list: any[] = box?.commentlist ?? []
  const total = Number(box?.commenttotal ?? json?.comment?.commenttotal ?? 0)
  let comments = list.map((c) => ({
    id: String(c.commentid ?? ''),
    user: decodeEntities(String(c.nick ?? '未知')),
    avatar: String(c.avatarurl ?? ''),
    // 主评论内容在 rootcommentcontent;回复内容在 middlecommentcontent
    content: decodeEntities(String(c.rootcommentcontent ?? c.middlecommentcontent ?? c.content ?? '')),
    // QQ 该接口 time 为秒,统一成毫秒
    time: (Number(c.time) || 0) * 1000,
    likes: Number(c.praisenum ?? 0)
  }))
  if (order === 'time') comments = [...comments].sort((a, b) => b.time - a.time)
  return { total, comments, hasMore: false }
}
