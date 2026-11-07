/**
 * QQ 音乐:匿名搜索(歌曲/歌单/歌手) / vkey 取流 / 评论
 * - 搜索: musicu.fcg DoSearchForQQMusicDesktop(search_type 0=歌曲 1=歌手 3=歌单)
 * - 歌手歌曲: musicu.fcg music.web_singer_info_svr get_singer_detail_info
 * - 取流: vkey.GetVkeyServer CgiGetVkey(免费/试听曲目返回 purl,VIP 专享为空)
 * - 评论: c.y.qq.com fcg_global_comment_h5(cmd=8 热评 / cmd=6 最新,topid 用数字 songid)
 */
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import type {
  Song,
  SourcePlaylistBrief,
  SourceArtistBrief,
  ChartCatalog,
  ChartDetail,
  ChartGroup
} from '@shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 用户 cookie 串(uin=...; qm_keyst=...; ...),由 store 注入/保存;空串=未登录 */
export let qqCookie = ''

/** 注入登录凭据(cookie 串生效,其余字段留作静默续期) */
export function setQqAuth(auth: {
  cookie: string
  musicid?: string
  musickey?: string
  refreshKey?: string
}): void {
  qqCookie = auth.cookie
}

export function getQqCookie(): string {
  return qqCookie
}

/** 从 cookie 取登录 uin(无登录态返回 '0';值可能带 o 前缀;微信登录可能叫 wx_uin/wxuin) */
export function getQqUin(): string {
  const m =
    /(?:^|;\s*)uin=(o?\d+)/.exec(qqCookie) ??
    /(?:^|;\s*)wx_uin=(o?\d+)/.exec(qqCookie) ??
    /(?:^|;\s*)wxuin=(o?\d+)/.exec(qqCookie)
  const raw = m ? m[1] : ''
  return raw.startsWith('o') ? raw.slice(1) : raw || '0'
}

/** QQ g_tk / ptqrtoken 同源的 33 进制散列 */
export function hash33(s: string, h = 0): number {
  for (let i = 0; i < s.length; i++) h += (h << 5) + s.charCodeAt(i)
  return h & 0x7fffffff
}

async function postMusicu(req: Record<string, unknown>, comm: Record<string, string>): Promise<any> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: 'https://y.qq.com/',
    'Content-Type': 'application/json'
  }
  if (qqCookie) headers.Cookie = qqCookie
  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers,
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
        /**
         * 7 = 只搜歌曲(听屿源码实测记录)。历史上 0 也表示歌曲,但 QQ 现在对 0 会稳定
         * 返回空列表(code 2001,表现为偶发/持续空结果),7 才正常出数据 —— 不要改回 0。
         */
        search_type: 7
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

/**
 * vkey 取流:匿名返回免费/试听曲目直链,VIP 专享返回 null;
 * 登录后带 uin/qm_keyst cookie + 真实 uin,VIP 曲目按账号会员权限下发。
 */
export async function getQqSongUrl(songMid: string): Promise<{ url: string; quality: string } | null> {
  const uin = getQqUin()
  const json = await postMusicu(
    {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: QQ_GUID,
        songmid: [songMid],
        songtype: [0],
        uin,
        loginflag: qqCookie ? 1 : 3,
        platform: '20'
      }
    },
    { ct: '24', cv: '0', uin, format: 'json' }
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

// ============ 排行榜 ============

/**
 * 榜单目录:musicu.fcg musicToplist.ToplistInfoServer / GetAll(匿名可用)。
 * 注意返回是 req.data.group[](巅峰榜/地区榜/特色榜/全球榜四组),不是平铺 topList。
 */
export async function getChartCatalog(): Promise<ChartCatalog> {
  const label = 'QQ音乐'
  try {
    const json = await postMusicu(
      {
        module: 'musicToplist.ToplistInfoServer',
        method: 'GetAll',
        param: {}
      },
      { ct: '24', cv: '0', uin: '0', format: 'json' }
    )
    const rawGroups: any[] = json?.req?.data?.group ?? []
    const groups: ChartGroup[] = rawGroups
      .map((g: any): ChartGroup => {
        const charts = (g?.toplist ?? [])
          .map((t: any) => {
            const id = String(t?.topId ?? '')
            const name = decodeEntities(String(t?.title ?? '').trim())
            if (!id || !name) return null
            return {
              id,
              name,
              // QQ 榜单封面:toplist 自带 frontPicUrl/headPicUrl 之一
              coverUrl: String(t?.frontPicUrl ?? t?.headPicUrl ?? t?.picUrl ?? '') || undefined,
              updateTip: String(t?.updateTime ?? t?.period ?? '') || undefined
            }
          })
          .filter((c: any) => c !== null)
        return { name: decodeEntities(String(g?.groupName ?? '')), charts }
      })
      .filter((g: ChartGroup) => g.charts.length > 0)
    if (groups.length === 0) {
      return { platform: 'qq', label, groups: [], error: 'QQ音乐榜单目录为空' }
    }
    return { platform: 'qq', label, groups }
  } catch (e) {
    return { platform: 'qq', label, groups: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** QQ 榜单封面:接口给的常是 `{size}` 占位或小图,统一提升到 300 档 */
function qqChartCover(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  if (s.includes('{size}')) return s.replace(/\{size\}/g, '300')
  return s
}

/** 榜单曲目:GetDetail(topId/offset/num),songInfoList 与搜索结果同构 */
export async function getChartSongs(chartId: string, num = 100): Promise<ChartDetail> {
  const json = await postMusicu(
    {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topId: Number(chartId) || chartId, offset: 0, num, period: '' }
    },
    { ct: '24', cv: '0', uin: '0', format: 'json' }
  )
  const root = json?.req?.data ?? {}
  const list: any[] = root?.songInfoList ?? []
  const songs = list.map(qqSongFromItem).filter((s): s is Song => s !== null)
  // 榜名/封面/简介在 root.data 里(songInfoList 是它的兄弟节点,同挂在 req.data 下)
  const meta = root?.data ?? {}
  return {
    id: String(chartId),
    name: decodeEntities(String(meta?.title ?? root?.title ?? '')),
    platform: 'qq',
    coverUrl: qqChartCover(meta?.frontPicUrl ?? meta?.headPicUrl ?? meta?.picUrl ?? meta?.toplistNamePicUrl),
    updateTip: String(meta?.updateTips ?? meta?.updateTime ?? meta?.period ?? '') || undefined,
    intro: meta?.intro ? decodeEntities(String(meta.intro)).slice(0, 300) : undefined,
    songs,
    total: Number(meta?.totalNum ?? 0) || songs.length
  }
}


/**
 * 拉取当前登录用户资料(fcg_get_profile_homepage,g_tk 由 qm_keyst 推导)。
 * 未登录或拉取失败返回 null,不影响登录本身。
 */
export async function getQqProfile(): Promise<{ uin: string; nickname: string; avatar: string } | null> {
  if (!qqCookie) return null
  const uin = getQqUin()
  if (uin === '0') return null
  const keyst = /(?:^|;\s*)qm_keyst=([^;]+)/.exec(qqCookie)?.[1] ?? ''
  const g = hash33(keyst, 5381)
  try {
    const url =
      'https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?' +
      new URLSearchParams({
        g_tk: String(g),
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: '0',
        cid: '205360838',
        needNewCode: '0',
        loginUin: uin,
        hostUin: '0',
        userid: uin,
        reqfrom: '1'
      }).toString()
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/', Cookie: qqCookie },
      signal: AbortSignal.timeout(10_000)
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as any
    if (json?.code !== 0) return null
    const creator = json?.data?.creator ?? {}
    const nick = String(creator?.nick ?? creator?.name ?? '').trim()
    if (!nick) return null
    return {
      uin,
      nickname: nick,
      avatar: String(creator?.headpic ?? creator?.avatarUrl ?? '')
    }
  } catch {
    return null
  }
}

// ============ QQ 扫码登录(ptqrshow → ptqrlogin → check_sig → OAuth → QQLogin) ============

/** QQ互联参数(QQ音乐):aid 是 QQ音乐互联 appid,pt_3rd_aid/client_id 是 OAuth 应用 id */
const QQ_AID = '716027609'
const QQ_DAID = '383'
const QQ_CLIENT_ID = '100497308'
const PT_REFERER = 'https://xui.ptlogin2.qq.com/'

/** 登录成功后的完整凭据(cookie 串用于接口,refreshKey 留作后续静默续期) */
export interface QqAuth {
  cookie: string
  musicid: string
  musickey: string
  refreshKey: string
}

/** 从 Set-Cookie 数组提取 name=value 对 */
function cookiePairs(setCookies: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of setCookies) {
    const first = c.split(';')[0]
    const idx = first.indexOf('=')
    if (idx <= 0) continue
    out[first.slice(0, idx).trim()] = first.slice(idx + 1).trim()
  }
  return out
}

/** 扫码会话 cookie jar(qrsig → 累积 cookie):浏览器里整条登录链共享 cookie 域,API 链必须自己维护 */
const qrJars = new Map<string, Record<string, string>>()

/** 生成 QQ 扫码登录二维码:返回 PNG dataURL + qrsig(轮询凭据) */
export async function qqQRStart(): Promise<{ imageDataUrl: string; key: string } | null> {
  const params = new URLSearchParams({
    appid: QQ_AID,
    e: '2',
    l: 'M',
    s: '3',
    d: '72',
    v: '4',
    t: String(Math.random()),
    daid: QQ_DAID,
    pt_3rd_aid: QQ_CLIENT_ID
  })
  const resp = await fetch(`https://ssl.ptlogin2.qq.com/ptqrshow?${params}`, {
    headers: { 'User-Agent': UA, Referer: PT_REFERER },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) return null
  const setCookies = typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : []
  const jar = cookiePairs(setCookies)
  const qrsig = jar['qrsig']
  if (!qrsig) return null
  qrJars.set(qrsig, jar)
  const buf = Buffer.from(await resp.arrayBuffer())
  return { imageDataUrl: `data:image/png;base64,${buf.toString('base64')}`, key: qrsig }
}

/** 解析 ptuiCB('0','0','url','0','提示','昵称') 的单引号参数 */
function parsePtuiArgs(text: string): string[] {
  const m = /ptuiCB\((.*)\)/.exec(text)
  if (!m) return []
  const out: string[] = []
  const re = /'((?:\.|[^'])*)'/g
  let a: RegExpExecArray | null
  while ((a = re.exec(m[1]))) out.push(a[1])
  return out
}

/**
 * 轮询扫码状态(实测状态码):66 等待扫码 / 67 已扫待确认 / 65 二维码过期 / 0 登录成功。
 * 成功时返回完整凭据(内部完成 check_sig → OAuth 授权 → QQLogin 三步)。
 */
export async function qqQRPoll(qrsig: string): Promise<QqQrResult> {
  const params = new URLSearchParams({
    u1: 'https://graph.qq.com/oauth2.0/login_jump',
    ptqrtoken: String(hash33(qrsig)),
    ptredirect: '0',
    h: '1',
    t: '1',
    g: '1',
    from_ui: '1',
    ptlang: '2052',
    action: `0-0-${Date.now()}`,
    js_ver: '20102616',
    js_type: '1',
    pt_uistyle: '40',
    aid: QQ_AID,
    daid: QQ_DAID,
    pt_3rd_aid: QQ_CLIENT_ID,
    has_onekey: '1'
  })
  const jar = { ...(qrJars.get(qrsig) ?? {}) }
  const resp = await fetch(`https://ssl.ptlogin2.qq.com/ptqrlogin?${params}`, {
    headers: {
      'User-Agent': UA,
      Referer: PT_REFERER,
      Cookie: Object.entries({ ...jar, qrsig })
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    },
    signal: AbortSignal.timeout(15_000)
  })
  // ptqrlogin 成功响应也可能种 cookie(登录态),并入 jar 供 check_sig 链使用
  const loginSetCookies =
    typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : []
  Object.assign(jar, cookiePairs(loginSetCookies))
  const text = await resp.text()
  const args = parsePtuiArgs(text)
  if (args.length === 0) return { status: 'error', message: '二维码状态解析失败' }
  switch (args[0]) {
    case '66':
      return { status: 'waiting', message: '等待扫码...' }
    case '67':
      return { status: 'scanned', message: '已扫描,请在手机上确认' }
    case '65':
      return { status: 'expired', message: '二维码已过期' }
    case '0':
      break
    default:
      return { status: 'error', message: args[4] ?? `登录失败(${args[0]})` }
  }
  // 成功:args[2] 就是 check_sig 完整回调地址(浏览器原样 GET 它,不手动重拼参数)
  const checkSigUrl = args[2] ?? ''
  if (!/^https?:\/\//.test(checkSigUrl)) return { status: 'error', message: '登录回调解析失败' }
  try {
    return { status: 'ok', message: '登录成功', auth: await finishQqQr(checkSigUrl, jar) }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  } finally {
    // 登录会话已结束(成功或失败),清理本次扫码的 jar
    qrJars.delete(qrsig)
  }
}

export interface QqQrResult {
  status: 'waiting' | 'scanned' | 'expired' | 'error' | 'ok'
  message: string
  auth?: QqAuth
}

/**
 * 原生 http(s) 请求(不跟随重定向):fetch 的 redirect:'manual' 是不透明响应,
 * 拿不到 302 的 Set-Cookie/Location,登录收尾必须读原始响应头。
 */
interface RawResponse {
  status: number
  location: string
  cookies: Record<string, string>
  body: string
}

function rawRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'http:' ? httpRequest : httpsRequest
    const req = mod(
      u,
      { method: opts.method ?? 'GET', headers: { 'User-Agent': UA, ...(opts.headers ?? {}) } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const cookies: Record<string, string> = {}
          for (const c of (res.headers['set-cookie'] ?? []) as string[]) {
            const first = c.split(';')[0]
            const i = first.indexOf('=')
            if (i > 0) cookies[first.slice(0, i).trim()] = first.slice(i + 1).trim()
          }
          resolve({
            status: res.statusCode ?? 0,
            location: String(res.headers.location ?? ''),
            cookies,
            body: Buffer.concat(chunks).toString('utf8')
          })
        })
      }
    )
    req.setTimeout(15_000, () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

/** 手动跟随重定向链(最多 hops 跳,仅限 *.qq.com),逐跳累积 cookie,记录每跳去向 */
async function followRaw(
  url: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
  maxHops = 4,
  seedJar: Record<string, string> = {}
): Promise<{ status: number; location: string; jar: Record<string, string>; hops: string[] }> {
  const jar: Record<string, string> = { ...seedJar }
  const hops: string[] = []
  let cur = url
  let status = 0
  let location = ''
  for (let i = 0; i < maxHops; i++) {
    const headers: Record<string, string> = { Referer: PT_REFERER, ...(opts.headers ?? {}) }
    const cookieHeader = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    if (cookieHeader) headers.Cookie = cookieHeader
    const r = await rawRequest(cur, {
      method: i === 0 ? opts.method : 'GET',
      body: i === 0 ? opts.body : undefined,
      headers
    })
    status = r.status
    location = r.location
    hops.push(`${r.status} ${cur.slice(0, 90)}`)
    Object.assign(jar, r.cookies)
    if (r.status >= 300 && r.status < 400 && r.location) {
      const next = new URL(r.location, cur)
      if (!/(^|\.)qq\.com$/.test(next.hostname)) break
      cur = next.toString()
      continue
    }
    break
  }
  return { status, location, jar, hops }
}

/** 成功后的三步收尾:check_sig 拿 p_skey → OAuth authorize 拿 code → QQLogin 换音乐凭据 */
async function finishQqQr(checkSigUrl: string, seedJar: Record<string, string>): Promise<QqAuth> {
  // 1. check_sig:原样 GET ptqrlogin 给出的回调地址并跟随跳转,携带扫码链累积的 cookie jar
  //    (浏览器里 check_sig 带着 ptlogin 会话 cookie 才会下发真实 p_skey)。
  //    浏览器流程里 login_jump 一跳的 Location 会直接带 OAuth code,优先从跳转链里抓;
  //    抓不到再回退 authorize POST(需要 p_skey 算 g_tk)。
  const check = await followRaw(checkSigUrl, {}, 4, seedJar)
  const codeFromChain = check.hops
    .map((h) => /[?&]code=([^&]+)/.exec(h)?.[1])
    .find(Boolean) as string | undefined
  let code = codeFromChain ?? ''
  if (!code) {
    const pskey = check.jar['p_skey']
    if (!pskey) {
      throw new Error(
        `获取 p_skey 失败(HTTP ${check.status},cookies: ${
          Object.keys(check.jar).join(',') || '无'
        },跳转: ${check.hops.join(' → ')})`
      )
    }

    // 2. OAuth 授权:302 Location 携带 code
    const authBody = new URLSearchParams({
      response_type: 'code',
      client_id: QQ_CLIENT_ID,
      redirect_uri: 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/',
      scope: 'get_user_info,get_app_friends',
      state: 'state',
      switch: '',
      from_ptlogin: '1',
      src: '1',
      update_auth: '1',
      openapi: '1010_1030',
      g_tk: String(hash33(pskey, 5381)),
      auth_time: String(Date.now()),
      ui: `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
    })
    const authResp = await followRaw(
      'https://graph.qq.com/oauth2.0/authorize',
      {
        method: 'POST',
        body: authBody.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: Object.entries(check.jar)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')
        }
      },
      1
    )
    code = /[?&]code=([^&]+)/.exec(authResp.location)?.[1] ?? ''
    if (!code) throw new Error(`获取 OAuth code 失败(HTTP ${authResp.status})`)
  }

  // 3. QQLogin 换音乐凭据(musickey 即 qm_keyst)
  const json = await postMusicu(
    { module: 'QQConnectLogin.LoginServer', method: 'QQLogin', param: { code } },
    { tmeLoginType: '2', format: 'json' }
  )
  const data = json?.req?.data ?? json?.data
  if (json?.code !== 0 || !data?.musickey) {
    throw new Error(`QQ 登录失败(${json?.code ?? '未知'})`)
  }
  const musicid = String(data.musicid ?? data.str_musicid ?? /[?&]uin=(\d+)/.exec(checkSigUrl)?.[1] ?? '0')
  const musickey = String(data.musickey)
  const cookie = `uin=${musicid}; qm_keyst=${musickey}; tmeLoginType=2`
  return {
    cookie,
    musicid,
    musickey,
    refreshKey: String(data.refresh_key ?? '')
  }
}

// ============ QQ 用户歌单(需登录) ============

/**
 * 登录用户的歌单列表:自建走 fcg_user_created_diss(dirid=歌单id,dirid=201 是"我喜欢"),
 * 收藏走 fcg_get_profile_order_asset(reqtype=3,cdlist)。
 * 两接口都是匿名可查公开歌单;带 cookie 时自己的隐私歌单也能拉到。
 */
export async function getQqUserPlaylists(): Promise<
  { id: number; name: string; coverUrl: string; count: number }[]
> {
  if (!qqCookie) throw new Error('未登录 QQ 音乐')
  const uin = getQqUin()
  const headers = { 'User-Agent': UA, Referer: 'https://y.qq.com/portal/profile.html', Cookie: qqCookie }
  const out: { id: number; name: string; coverUrl: string; count: number }[] = []
  const seen = new Set<number>()

  // 自建歌单(含"我喜欢")
  const createdUrl =
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?' +
    new URLSearchParams({
      hostUin: '0',
      hostuin: uin,
      sin: '0',
      size: '200',
      g_tk: '5381',
      loginUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq.json',
      needNewCode: '0'
    }).toString()
  const created: any = await fetch(createdUrl, { headers, signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json())
    .catch(() => null)
  if (created?.code !== 0 && created?.code !== 4000) {
    throw new Error(`获取自建歌单失败(${created?.code ?? '无响应'})`)
  }
  const disslist: any[] = created?.data?.disslist ?? []
  for (const it of disslist) {
    const dirid = Number(it.dirid ?? 0)
    const id = dirid === 201 ? Number(it.tid ?? 0) : dirid
    const name = decodeEntities(String(it.diss_name ?? it.dissname ?? '')).trim()
    if (id > 0 && name && !seen.has(id)) {
      seen.add(id)
      out.push({ id, name, coverUrl: String(it.diss_cover ?? it.imgurl ?? ''), count: Number(it.song_cnt ?? it.song_count ?? 0) })
    }
  }

  // 收藏歌单(失败不阻断,自建列表已可用)
  const favUrl =
    'https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?' +
    new URLSearchParams({ ct: '20', cid: '205360956', userid: uin, reqtype: '3', sin: '0', ein: '99' }).toString()
  const fav: any = await fetch(favUrl, { headers, signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json())
    .catch(() => null)
  const cdlist: any[] = fav?.data?.cdlist ?? []
  for (const it of cdlist) {
    const id = Number(it.disstid ?? it.dissid ?? it.tid ?? 0)
    const name = decodeEntities(String(it.dissname ?? it.diss_name ?? '')).trim()
    if (id > 0 && name && !seen.has(id)) {
      seen.add(id)
      out.push({ id, name, coverUrl: String(it.imgurl ?? it.diss_cover ?? ''), count: Number(it.song_count ?? it.song_cnt ?? 0) })
    }
  }
  return out
}

// ============ 播放记录(读 / 写) ============

/**
 * 上报「最近播放」(ReportPlayRecentlyInfo,与 QQ音乐客户端行为一致;
 * 走 musicu.fcg + 登录 cookie,无需签名通道)。歌曲实际播放 ≥30s 后由播放器调用。
 */
export async function reportRecently(songId: number): Promise<{ ok: boolean; code?: number; error?: string }> {
  const uin = getQqUin()
  if (uin === '0') return { ok: false, error: '未登录QQ音乐' }
  if (!Number.isFinite(songId) || songId <= 0) return { ok: false, error: '缺少QQ音乐歌曲 id' }
  try {
    const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?cgiKey=ReportPlayRecentlyInfo', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Referer: 'https://y.qq.com/',
        'Content-Type': 'application/json',
        Cookie: qqCookie
      },
      body: JSON.stringify({
        comm: { ct: '19', cv: '1859', uin, format: 'json' },
        'music.musicasset.PlayRecentlyWrite.ReportPlayRecentlyInfo': {
          module: 'music.musicasset.PlayRecentlyWrite',
          method: 'ReportPlayRecentlyInfo',
          param: {
            data: [
              {
                id: String(songId),
                type: 2,
                lastTime: Math.floor(Date.now() / 1000),
                listenCnt: 1,
                auxillaryID: '0',
                auxillaryDict: { vip: '1' }
              }
            ]
          }
        }
      }),
      signal: AbortSignal.timeout(15_000)
    })
    const json: any = await resp.json()
    const code = json?.code ?? json?.['music.musicasset.PlayRecentlyWrite.ReportPlayRecentlyInfo']?.code
    return code === 0
      ? { ok: true, code }
      : { ok: false, code, error: `code ${code}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** vecPlayRecord 条目 → Song(条目字段随端版本有差异,做宽松映射) */
function qqSongFromRecord(it: any): Song | null {
  if (!it) return null
  const song = it.song_info ?? it.song ?? it
  // 数值 song id:优先 id/album 里的数字字段,退回 songmid
  const numericId = Number(song.id ?? it.id ?? 0)
  const mid = String(song.mid ?? it.mid ?? '')
  if (!numericId && !mid) return null
  const iv = song.interval?.value ?? song.interval ?? it.interval ?? 0
  return {
    id: numericId ? `qq-${numericId}` : `qq-${mid}`,
    title: decodeEntities(String(song.name ?? song.songname ?? it.songname ?? '')).trim() || '未知',
    artist:
      (Array.isArray(song.singer) ? song.singer : Array.isArray(it.singer) ? it.singer : [])
        .map((s: any) => decodeEntities(String(s?.name ?? '')))
        .filter(Boolean)
        .join(' / ') || '未知',
    album: decodeEntities(String(song.album?.name ?? song.albumname ?? it.albumname ?? '')),
    coverUrl:
      song.album?.mid
        ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.album.mid}.jpg`
        : it.albummid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${it.albummid}.jpg`
          : null,
    duration: Math.round(Number(iv) || 0),
    source: 'QQMUSIC',
    page: 1,
    qqMid: mid || undefined,
    qqId: numericId || undefined,
    addedAt: Date.now()
  }
}

/**
 * QQ音乐「最近播放」(GetRecentPlayList,网页端同款)。
 * 返回最新在前的一段 Song 列表;需登录(cookie 里有 uin)。
 */
export async function getRecentPlay(
  limit = 50
): Promise<{ ok: boolean; notLoggedIn?: boolean; songs: Song[]; error?: string }> {
  const uin = getQqUin()
  if (uin === '0') return { ok: false, notLoggedIn: true, songs: [] }
  try {
    const json = await postMusicu(
      {
        module: 'music.musichallSong.RecentPlayList',
        method: 'GetRecentPlayList',
        param: { uin, begin: 0, num: limit }
      },
      { ct: '19', cv: '1859', uin, format: 'json' }
    )
    const code = json?.code ?? json?.req?.code
    if (code !== 0) return { ok: false, songs: [], error: `code ${code}` }
    const items: any[] =
      json?.req?.data?.vecPlayRecord ?? json?.req?.data?.list ?? []
    return { ok: true, songs: items.map(qqSongFromRecord).filter((s): s is Song => s !== null) }
  } catch (e) {
    return { ok: false, songs: [], error: String(e) }
  }
}

/** 搜索推荐(输入联想):Smartbox 联想词;模块已下线时用真实搜索兜底 */
export async function searchSuggest(keyword: string): Promise<string[]> {
  try {
    const json = await postMusicu(
      {
        req_1: {
          module: 'music.smartboxCgi',
          method: 'GetSmartbox',
          param: { grp: 1, query: keyword, num: 8 }
        }
      },
      { ct: '19', cv: '1859', uin: getQqUin(), format: 'json' }
    )
    const body = json?.req_1?.data?.body ?? {}
    const items: any[] = body.smartbox ?? body.item ?? []
    const out = items
      .map((it) => String(it?.hint_txt ?? it?.hint ?? it?.txt ?? '').trim())
      .filter(Boolean)
      .slice(0, 8)
    if (out.length > 0) return out
  } catch {
    /* smartbox 模块已下线,走真实搜索兜底 */
  }
  try {
    const songs = await searchQqSongs(keyword, 1, 5)
    return songs.map((sg) => `${sg.title} - ${sg.artist}`).slice(0, 8)
  } catch {
    return []
  }
}
