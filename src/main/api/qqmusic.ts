/**
 * QQ 音乐:匿名搜索 / vkey 取流 / 评论
 * - 搜索: musicu.fcg DoSearchForQQMusicDesktop
 * - 取流: vkey.GetVkeyServer CgiGetVkey(免费/试听曲目返回 purl,VIP 专享为空)
 * - 评论: c.y.qq.com fcg_global_comment_h5(cmd=8 热评 / cmd=6 最新,topid 用数字 songid)
 */
import type { Song } from '@shared/types'

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
  return list
    .map((it): Song | null => {
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
    })
    .filter((s): s is Song => s !== null)
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

/**
 * 歌曲统计:收藏量(GetSongFansNumberById,匿名可用)+ 评论总数。
 * 播放量没有公开匿名接口(music.musicAsset.SongPlayInfoRead 系列全部 500003),
 * 页面 SSR 里也没有,所以只展示能拿到的两项。
 */
export async function getQqSongStats(songId: number): Promise<{
  favCount?: number
  favText?: string
  commentCount?: number
}> {
  const out: { favCount?: number; favText?: string; commentCount?: number } = {}
  try {
    const json = await postMusicu(
      {
        module: 'music.musicasset.SongFavRead',
        method: 'GetSongFansNumberById',
        param: { v_songId: [songId] }
      },
      { ct: '24', cv: '0', uin: '0', format: 'json' }
    )
    const d = json?.req?.data ?? {}
    const n = d?.m_numbers?.[String(songId)]
    const show = d?.m_show?.[String(songId)]
    if (typeof n === 'number' && n > 0) out.favCount = n
    if (typeof show === 'string' && show) out.favText = show
  } catch {
    /* ignore */
  }
  try {
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
      pagesize: '1',
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
        headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' },
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (resp.ok) {
      const j = (await resp.json()) as any
      const total = Number(j?.hot_comment?.commenttotal ?? j?.comment?.commenttotal ?? 0)
      if (total > 0) out.commentCount = total
    }
  } catch {
    /* ignore */
  }
  return out
}
