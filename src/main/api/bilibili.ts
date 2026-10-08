/**
 * Bilibili API 客户端 (移植自安卓端 BilibiliApiClient.kt / BilibiliLogin.kt)
 */
import type { Song, BiliPage } from '@shared/types'
import { wbiSign, buildQuery, refreshWbiKey } from './wbi'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 用户 cookie(登录后设置),由 store 模块注入 */
export let biliCookie = ''
let cookieSaver: ((c: string) => void) | null = null
/** cookie 发生变化(含设备字段合并)时回调,ipc 层接 store 持久化 */
export function onBiliCookieChange(saver: (c: string) => void): void {
  cookieSaver = saver
}
export function setBiliCookie(c: string): void {
  biliCookie = c
  deviceCookieReady = false // cookie 变更后需重新补齐设备字段
}

let deviceCookieReady = false
/**
 * 补齐设备 cookie(buvid3/buvid4/b_nut 等):登录轮询只收集账号 cookie,
 * 缺设备字段的请求会被网页接口风控(收藏夹/播放记录返回空)。
 * 访问主站抓 Set-Cookie 合并进 biliCookie,进程内只做一次。
 */
export async function ensureBiliDeviceCookies(): Promise<void> {
  if (deviceCookieReady) return
  deviceCookieReady = true
  try {
    const resp = await fetch('https://www.bilibili.com/', {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }
    })
    const c = collectSetCookie(resp.headers)
    if (c) {
      biliCookie = mergeCookieStrings(biliCookie, c)
      cookieSaver?.(biliCookie)
    }
  } catch (e) {
    console.warn('[Bilibili] device cookie fetch failed, will retry', e)
    deviceCookieReady = false
  }
}

function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': UA,
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com'
  }
  if (extra) Object.assign(h, extra)
  return h
}

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  await ensureBiliDeviceCookies()
  const h = baseHeaders()
  if (biliCookie && !h.Cookie) h.Cookie = biliCookie
  if (headers) Object.assign(h, headers)
  const resp = await fetch(url, { headers: h })
  const text = await resp.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`B站响应解析失败 HTTP ${resp.status}`)
  }
}

/**
 * 带 WBI 签名的 GET:签名按天缓存(wbi.ts 内),仅当服务端判定签名失效(-403/-352)时
 * 强制刷新密钥并重试一次。此前每个请求都先 refreshWbiKey(),等于每次多打一次 nav 接口。
 */
async function wbiGetJson(
  buildUrl: (q: Record<string, string>) => string,
  params: Record<string, string>,
  headers?: Record<string, string>
): Promise<any> {
  const signed = await wbiSign(params)
  let json = await getJson(buildUrl(signed), headers)
  if (json?.code === -403 || json?.code === -352) {
    await refreshWbiKey()
    const retry = await wbiSign(params)
    json = await getJson(buildUrl(retry), headers)
  }
  return json
}

export function bvidFromSongId(songId: string): string {
  return songId.replace(/_p\d+$/, '')
}

export function pageFromSongId(songId: string): number {
  const m = songId.match(/_p(\d+)$/)
  return m ? parseInt(m[1], 10) : 1
}

function songFromVideo(v: {
  bvid: string
  title: string
  author: string
  coverUrl: string
  duration: number
  page?: number
}): Song {
  const page = v.page ?? 1
  return {
    id: page > 1 ? `${v.bvid}_p${page}` : v.bvid,
    title: v.title.replace(/<[^>]*>/g, ''),
    artist: v.author || '未知',
    coverUrl: v.coverUrl?.startsWith('//') ? `https:${v.coverUrl}` : v.coverUrl || null,
    duration: v.duration,
    source: 'BILIBILI',
    bvid: v.bvid,
    page,
    addedAt: Date.now()
  }
}

// ============ 搜索 ============

export async function searchVideos(
  keyword: string,
  page = 1,
  order = 'totalrank'
): Promise<Song[]> {
  try {
    const json = await wbiGetJson(
      (q) => `https://api.bilibili.com/x/web-interface/wbi/search/type?${buildQuery(q)}`,
      {
        search_type: 'video',
        keyword,
        page: page.toString(),
        page_size: '20',
        platform: 'pc',
        web_location: '1430654',
        order
      },
      {
        Referer: `https://search.bilibili.com/video?keyword=${encodeURIComponent(keyword)}`,
        Origin: 'https://search.bilibili.com'
      }
    )
    if (json.code !== 0 || !json.data?.result) return []
    return (json.data.result as any[])
      .filter((it) => it.bvid)
      .map((it) =>
        songFromVideo({
          bvid: it.bvid,
          title: it.title ?? '',
          author: it.author ?? '未知',
          coverUrl: it.pic ?? '',
          duration: parseDuration(it.duration ?? '0:00')
        })
      )
  } catch (e) {
    console.error('[Bilibili] search error', e)
    return []
  }
}

function parseDuration(d: string): number {
  if (!d) return 0
  const parts = d.split(':')
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + +parts[2]
  if (parts.length === 2) return +parts[0] * 60 + +parts[1]
  const n = parseInt(d, 10)
  return isNaN(n) ? 0 : n
}

export async function fetchSuggestions(keyword: string): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://s.search.bilibili.com/main/suggest?term=${encodeURIComponent(keyword)}`,
      { headers: baseHeaders() }
    )
    const json = (await resp.json()) as { result?: { value?: string }[] }
    return (json.result ?? [])
      .map((it) => (it.value ?? '').replace(/<[^>]*>/g, ''))
      .filter((s) => s.trim())
  } catch {
    return []
  }
}

// ============ 视频信息 / 分P ============

export async function getVideoPages(bvid: string): Promise<BiliPage[]> {
  try {
    const json = await getJson(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`)
    if (json.code !== 0 || !Array.isArray(json.data)) return []
    return json.data.map((p: any) => ({
      cid: p.cid,
      page: p.page,
      part: p.part ?? '',
      duration: p.duration ?? 0
    }))
  } catch (e) {
    console.error('[Bilibili] pages error', e)
    return []
  }
}

export async function getCidForPage(bvid: string, page: number): Promise<number> {
  const pages = await getVideoPages(bvid)
  const target = pages[page - 1] ?? pages[0]
  return target?.cid ?? 0
}

export interface BiliVideoDetail {
  aid: number
  bvid: string
  cid: number
  duration: number
  title: string
  owner: string
  cover: string
  stat?: { view: number; like: number; favorite: number; danmaku: number }
}

export async function getVideoDetail(bvid: string): Promise<BiliVideoDetail | null> {
  try {
    const json = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
    if (json.code !== 0 || !json.data) return null
    const d = json.data
    return {
      aid: d.aid,
      bvid,
      cid: d.cid,
      duration: d.duration,
      title: d.title,
      owner: d.owner?.name ?? '',
      cover: d.pic ?? '',
      stat: d.stat
        ? {
            view: d.stat.view,
            like: d.stat.like,
            favorite: d.stat.favorite,
            danmaku: d.stat.danmaku
          }
        : undefined
    }
  } catch {
    return null
  }
}

// ============ 播放地址 ============

interface DashAudio {
  id: number
  baseUrl: string
  bandwidth: number
  size: number
}

/** B站 DASH 音频 quality id → 描述 */
export function dashAudioQuality(id: number): string {
  switch (id) {
    case 30251:
      return 'Hi-Res 无损'
    case 30250:
      return '杜比全景声'
    case 30280:
      return '320k'
    case 30232:
      return '132k'
    case 30216:
      return '64k'
    default:
      return `${id}`
  }
}

/** 获取播放地址,返回 { url, fragmented, quality } */
export async function resolvePlayUrl(
  bvid: string,
  cid: number,
  opts: { preferHtml5?: boolean } = {}
): Promise<{ url: string; fragmented: boolean; quality?: string } | null> {
  // html5 完整 mp4(兼容性最好)
  if (opts.preferHtml5) {
    const h5 = await fetchHtml5Url(bvid, cid)
    if (h5) return { url: h5, fragmented: false, quality: '标准 128k' }
  }
  // DASH 纯音频 fnval=80 → 16 → html5 兜底
  for (const fnval of ['80', '16']) {
    const dash = await fetchPlayUrl(bvid, cid, fnval)
    if (dash?.dashAudio)
      return {
        url: dash.dashAudio.baseUrl,
        fragmented: true,
        quality: dashAudioQuality(dash.dashAudio.id)
      }
    if (dash?.durl) return { url: dash.durl, fragmented: false, quality: '标准' }
  }
  const h5 = await fetchHtml5Url(bvid, cid)
  if (h5) return { url: h5, fragmented: false, quality: '标准 128k' }
  return null
}

async function fetchPlayUrl(
  bvid: string,
  cid: number,
  fnval: string
): Promise<{ dashAudio?: DashAudio; durl?: string } | null> {
  try {
    const json = await wbiGetJson(
      (q) => `https://api.bilibili.com/x/player/wbi/playurl?${buildQuery(q)}`,
      { bvid, cid: cid.toString(), qn: '80', fnval, fourk: '1', fnver: '0' },
      { Referer: `https://www.bilibili.com/video/${bvid}` }
    )
    if (json.code !== 0 || !json.data) return null
    const rawAudio: any = json.data.dash?.audio?.find((a: any) => a.baseUrl || a.base_url)
    const durl: string | undefined = json.data.durl?.find((d: any) => d.url)?.url
    return {
      dashAudio: rawAudio
        ? { id: rawAudio.id, baseUrl: rawAudio.baseUrl ?? rawAudio.base_url, bandwidth: rawAudio.bandwidth ?? 0, size: rawAudio.size ?? 0 }
        : undefined,
      durl
    }
  } catch (e) {
    console.error('[Bilibili] playurl error', e)
    return null
  }
}

async function fetchHtml5Url(bvid: string, cid: number): Promise<string | null> {
  try {
    const qs = new URLSearchParams({
      bvid,
      cid: cid.toString(),
      qn: '64',
      fnval: '0',
      platform: 'html5',
      high_quality: '1'
    }).toString()
    const resp = await fetch(`https://api.bilibili.com/x/player/playurl?${qs}`, {
      headers: baseHeaders({ Referer: `https://www.bilibili.com/video/${bvid}` })
    })
    const json = (await resp.json()) as any
    if (json.code !== 0 || !json.data) return null
    return json.data.durl?.find((d: any) => d.url)?.url ?? null
  } catch {
    return null
  }
}

// ============ 字幕/歌词 ============

interface SubtitleItem {
  lan: string
  lan_doc: string
  subtitle_url: string
  type: number // 1 = AI
}

export async function getVideoSubtitles(
  bvid: string,
  cid: number,
  aid?: number
): Promise<SubtitleItem[]> {
  try {
    const params: Record<string, string> = { bvid, cid: cid.toString() }
    if (aid && aid > 0) params.aid = aid.toString()
    const json = await wbiGetJson(
      (q) => `https://api.bilibili.com/x/player/wbi/v2?${buildQuery(q)}`,
      params
    )
    if (json.code !== 0) return []
    return (json.data?.subtitle?.subtitles ?? []) as SubtitleItem[]
  } catch (e) {
    console.error('[Bilibili] subtitles error', e)
    return []
  }
}

export interface RawLyricLine {
  timeMs: number
  text: string
}

export async function fetchSubtitleContent(subtitleUrl: string): Promise<RawLyricLine[]> {
  try {
    const full = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl
    const resp = await fetch(full, { headers: baseHeaders() })
    const text = await resp.text()
    let arr: any[] = []
    try {
      const parsed = JSON.parse(text)
      arr = Array.isArray(parsed) ? parsed : (parsed.body ?? [])
    } catch {
      return []
    }
    return arr
      .map((item) => ({
        timeMs: Math.round((item.from ?? 0) * 1000),
        text: (item.content ?? '').trim()
      }))
      .filter((l) => l.text)
  } catch (e) {
    console.error('[Bilibili] subtitle fetch error', e)
    return []
  }
}

// ============ 收藏夹 ============

/** 从 cookie 取当前用户 mid(收藏夹列表的 up_mid 必须是真实 uid,传 0 会 -400) */
function currentUid(): string {
  return (
    biliCookie
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('DedeUserID='))
      ?.split('=')[1] ?? '0'
  )
}

export async function getFavoriteFolders(): Promise<
  { id: number; title: string; coverUrl?: string; songCount: number }[]
> {
  try {
    const json = await getJson(
      `https://api.bilibili.com/x/v3/fav/folder/created/list?pn=1&ps=30&up_mid=${currentUid()}&platform=web`
    )
    if (json.code !== 0 || !json.data?.list) return []
    return (json.data.list as any[])
      .filter((it) => it.id)
      .map((it) => ({
        id: it.id as number,
        title: (it.title as string) || '未命名',
        coverUrl: it.cover,
        songCount: it.media_count ?? 0
      }))
  } catch (e) {
    console.error('[Bilibili] fav folders error', e)
    return []
  }
}

export async function getFavoriteResources(
  mediaId: number
): Promise<{ songs: Song[]; complete: boolean }> {
  const all: Song[] = []
  let page = 1
  let hasMore = true
  // complete=false 表示中途出错(仅用于同步:不完整的拉取只增不删)
  let complete = true
  try {
    while (hasMore && page < 50) {
      const r = await getFavoriteResourcesPaged(mediaId, page, 20)
      if (r.songs.length === 0 && !r.hasMore) {
        complete = false
        break
      }
      all.push(...r.songs)
      hasMore = r.hasMore
      page++
    }
  } catch (e) {
    console.error('[Bilibili] fav resources error', e)
    complete = false
  }
  return { songs: all, complete }
}

/** 收藏夹单条媒体 → 歌曲 */
function favMediaToSong(m: any): Song | null {
  if (!m.bvid) return null
  return songFromVideo({
    bvid: m.bvid,
    title: m.title || '未知',
    author: m.upper?.name ?? '未知',
    coverUrl: m.cover ?? '',
    duration: m.duration ?? 0
  })
}

/** 分页拉取收藏夹内容(打开时按页获取,20 条/页) */
export async function getFavoriteResourcesPaged(
  mediaId: number,
  page = 1,
  pageSize = 20
): Promise<{ songs: Song[]; total: number; hasMore: boolean }> {
  try {
    const json = await getJson(
      `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${pageSize}&platform=web`
    )
    const medias = json.data?.medias
    if (json.code !== 0 || !medias) return { songs: [], total: 0, hasMore: false }
    const songs = (medias as any[])
      .map(favMediaToSong)
      .filter((s): s is Song => s !== null)
    // total 字段兼容两种布局(实测 data.page.total 恒 0,data.total 才是真实总数)
    const total: number = Number(json.data?.total ?? json.data?.page?.total ?? 0)
    const hasMore = total > 0 ? page * pageSize < total : songs.length >= pageSize
    return { songs, total, hasMore }
  } catch (e) {
    console.error('[Bilibili] fav page error', e)
    return { songs: [], total: 0, hasMore: false }
  }
}

// ============ 播放记录 ============

/** 从 /video/BVxxx 形式的 uri 中提取 bvid */
function bvidFromUri(uri: string): string {
  const m = uri.match(/BV[0-9A-Za-z]{10}/)
  return m ? m[0] : ''
}

export interface WatchHistoryResult {
  songs: Song[]
  /** false = 中途出错(同步时只增不删)或未登录 */
  complete: boolean
  /** true = 未登录(code -101) */
  notLoggedIn: boolean
}

/** 播放记录列表项解析(顶层字段与 history/archive 子对象两种布局都做防御) */
function historyItemToSong(it: any): Song | null {
  const business: string = it.history?.business ?? it.business ?? 'archive'
  if (business !== 'archive') return null // 只要视频(排除直播/专栏/课程)
  const bvid: string = it.history?.bvid || it.bvid || bvidFromUri(String(it.uri ?? ''))
  if (!bvid) return null
  const title: string = String(it.title ?? it.archive?.title ?? '').trim()
  if (!title) return null
  const page: number = Math.max(1, Number(it.history?.page ?? 1) || 1)
  const part: string = String(it.history?.part ?? '').trim()
  const author: string =
    it.author_name || it.owner?.name || it.author || it.archive?.author || '未知'
  const rawCover: string = it.cover || it.covers?.url || it.archive?.cover || it.pic || ''
  const cover = rawCover.startsWith('//') ? `https:${rawCover}` : rawCover
  const duration = Math.round(Number(it.duration ?? it.archive?.duration ?? 0))
  return {
    id: page > 1 ? `${bvid}_p${page}` : bvid,
    // 多P视频标注分P名,便于区分同视频的不同P
    title: part ? `${title} · ${part}` : title,
    artist: String(author),
    coverUrl: cover || null,
    duration,
    source: 'BILIBILI',
    bvid,
    page,
    addedAt: Date.now()
  }
}

export interface WatchHistoryPage {
  songs: Song[]
  nextMax: string
  nextViewAt: string
  hasMore: boolean
  notLoggedIn: boolean
  /** 请求失败(非未登录):同步时按"不完整拉取"处理 */
  error?: boolean
}

/** 单页拉取播放记录(cursor 分页,20条/页,打开时才获取、下翻加载更多)
 *  注意:type 必须传字符串枚举('archive'),传数字 0 会 -400 */
export async function getWatchHistoryPage(
  max = '0',
  viewAt = '0',
  ps = 20
): Promise<WatchHistoryPage> {
  try {
    const url =
      `https://api.bilibili.com/x/web-interface/history/cursor?type=archive` +
      `&max=${encodeURIComponent(max)}&view_at=${encodeURIComponent(viewAt)}`
    const json = await getJson(url)
    if (json.code === -101) {
      return { songs: [], nextMax: max, nextViewAt: viewAt, hasMore: false, notLoggedIn: true }
    }
    if (json.code !== 0 || !json.data) {
      console.error('[Bilibili] history page code=', json.code, 'msg=', json.message)
      return {
        songs: [],
        nextMax: max,
        nextViewAt: viewAt,
        hasMore: false,
        notLoggedIn: false,
        error: true
      }
    }
    const list: any[] = json.data.list ?? []
    const songs = list.map(historyItemToSong).filter((s): s is Song => s !== null)
    const c = json.data.cursor
    const nextMax = String(c?.max ?? '')
    const nextViewAt = String(c?.view_at ?? 0)
    const hasMore =
      list.length > 0 &&
      !!nextMax &&
      !(nextMax === max && nextViewAt === viewAt)
    return { songs, nextMax, nextViewAt, hasMore, notLoggedIn: false }
  } catch (e) {
    console.error('[Bilibili] history page error', e)
    return { songs: [], nextMax: max, nextViewAt: viewAt, hasMore: false, notLoggedIn: false }
  }
}

/**
 * 拉取B站播放记录(取最近 pages×20 条,导入/同步用)
 * 接口需登录,未登录返回 code -101。
 */
export async function getWatchHistory(pages = 3): Promise<WatchHistoryResult> {
  const songs: Song[] = []
  let complete = true
  let notLoggedIn = false
  let max = '0'
  let viewAt = '0'
  for (let i = 0; i < pages; i++) {
    const r = await getWatchHistoryPage(max, viewAt, 20)
    if (r.notLoggedIn) {
      notLoggedIn = true
      complete = false
      break
    }
    if (r.error) {
      complete = false
      break
    }
    songs.push(...r.songs)
    if (!r.hasMore) break
    max = r.nextMax
    viewAt = r.nextViewAt
  }
  const seen = new Set<string>()
  const dedup = songs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
  return { songs: dedup, complete, notLoggedIn }
}



// ============ 扫码登录 ============

export interface QRLoginState {
  status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'
  message: string
  cookie?: string
}

function collectSetCookie(headers: Headers): string {
  const cookies: string[] =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  return cookies
    .map((c) => c.split(';')[0])
    .filter((c) => c.includes('='))
    .join('; ')
}

function mergeCookieStrings(a: string, b: string): string {
  const map = new Map<string, string>()
  for (const part of [...a.split(';'), ...b.split(';')]) {
    const t = part.trim()
    if (!t.includes('=')) continue
    const idx = t.indexOf('=')
    map.set(t.slice(0, idx), t.slice(idx + 1))
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function getLoginQRCode(): Promise<{ url: string; key: string } | null> {
  try {
    const resp = await fetch(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header',
      { headers: baseHeaders() }
    )
    const json = (await resp.json()) as any
    if (json.code !== 0) return null
    return { url: json.data.url, key: json.data.qrcode_key }
  } catch (e) {
    console.error('[Bilibili] QR error', e)
    return null
  }
}

export async function pollLoginQR(key: string): Promise<QRLoginState> {
  try {
    const resp = await fetch(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${key}&source=main-fe-header`,
      { headers: baseHeaders() }
    )
    const json = (await resp.json()) as any
    if (json.code !== 0) return { status: 'error', message: json.message ?? '请求失败' }
    const d = json.data
    switch (d.code) {
      case 0: {
        let cookie = collectSetCookie(resp.headers)
        const sso = d.url as string
        if (sso) {
          try {
            const ssoResp = await fetch(sso, { headers: baseHeaders(), redirect: 'follow' })
            ssoResp.body?.cancel().catch(() => {})
            const c = collectSetCookie(ssoResp.headers)
            if (c) cookie = mergeCookieStrings(cookie, c)
          } catch {
            /* ignore */
          }
        }
        if (!cookie.includes('SESSDATA') && sso.includes('SESSDATA=')) {
          const q = sso.substring(sso.indexOf('?') + 1)
          cookie = mergeCookieStrings(
            cookie,
            q
              .split('&')
              .filter((kv) => kv.includes('='))
              .map((kv) => `${decodeURIComponent(kv.split('=')[0])}=${decodeURIComponent(kv.split('=')[1])}`)
              .join('; ')
          )
        }
        return { status: 'ok', message: '登录成功', cookie }
      }
      case 86090:
        return { status: 'scanned', message: '已扫描,请在手机上确认' }
      case 86101:
        return { status: 'waiting', message: '等待扫码...' }
      case 86038:
        return { status: 'expired', message: '二维码已过期' }
      default:
        return { status: 'error', message: `状态: ${d.code}` }
    }
  } catch (e) {
    console.error('[Bilibili] QR poll error', e)
    return { status: 'error', message: '网络错误' }
  }
}

/** 获取当前登录用户信息(nav 接口,使用已设置的 cookie) */
export async function getUserInfo(): Promise<{
  uid: number
  nickname: string
  avatar: string
  isLogin: boolean
} | null> {
  try {
    const json = await getJson('https://api.bilibili.com/x/web-interface/nav')
    if (json.code !== 0) return null
    const d = json.data
    if (!d?.isLogin) return null
    return { uid: d.mid, nickname: d.uname ?? '', avatar: d.face ?? '', isLogin: true }
  } catch (e) {
    console.error('[Bilibili] getUserInfo error', e)
    return null
  }
}

/** 视频评论(offset=已加载条数,每页20条;order: hot=综合热度(legacy 分页) / time=按时间(游标)) */
export async function getVideoComments(
  bvid: string,
  offset: number,
  order: 'hot' | 'time' = 'hot'
): Promise<{ total: number; hasMore: boolean; comments: { id: string; user: string; avatar: string; content: string; time: number; likes: number }[] }> {
  if (order === 'time') return getVideoCommentsByTime(bvid, offset)
  try {
    const detail = await getVideoDetail(bvid)
    if (!detail) return { total: 0, hasMore: false, comments: [] }
    const page = Math.max(1, Math.floor(offset / 20) + 1)
    const json = await getJson(
      'https://api.bilibili.com/x/v2/reply?type=1&oid=' + detail.aid + '&pn=' + page + '&ps=20&sort=2'
    )
    if (json.code !== 0) return { total: 0, hasMore: false, comments: [] }
    const d = json.data ?? {}
    const replies: any[] = d.replies ?? []
    const total = d.page?.count ?? replies.length
    const comments = replies.map((r) => ({
      id: String(r.rpid),
      user: r.member?.uname ?? '',
      avatar: r.member?.avatar ?? '',
      content: r.content?.message ?? '',
      // B站 ctime 是 Unix 秒,统一乘 1000 转毫秒(与网易云评论时间单位一致)
      time: (r.ctime ?? 0) * 1000,
      likes: r.like ?? 0
    }))
    return { total, hasMore: offset + comments.length < total, comments }
  } catch (e) {
    console.error('[Bilibili] comments error', e)
    return { total: 0, hasMore: false, comments: [] }
  }
}

/** x/v2/reply/wbi/main 的按时间分页游标(存 pagination_reply.offset;offset=0 开新页时覆盖) */
const timeReplyCursors = new Map<string, string>()

/**
 * 按时间排序的评论:x/v2/reply/wbi/main,WBI 签名,mode=2=最新评论(实测 ctime 严格倒序;
 * legacy 端点的 sort=0 实测恒返回空)。参数与网页端发起的请求逐项一致
 * (无 ps/next,恒带 pagination_str/seek_rpid/web_location/locate-json)。
 * 分页用 cursor.pagination_reply.offset(与手机端一致)。
 * 注意:匿名访问服务端降级为"最新3条 + is_end=true"(浏览器满指纹 cookie 实测同样如此),
 * 登录(B站扫码)后应返回完整分页——降级结果如实返回,由 UI 提示登录。
 */
async function getVideoCommentsByTime(
  bvid: string,
  offset: number
): Promise<{ total: number; hasMore: boolean; comments: { id: string; user: string; avatar: string; content: string; time: number; likes: number }[] }> {
  try {
    const detail = await getVideoDetail(bvid)
    if (!detail) return { total: 0, hasMore: false, comments: [] }
    let paginationOffset = ''
    if (offset > 0) {
      const stored = timeReplyCursors.get(bvid)
      if (!stored || stored === 'END') return { total: 0, hasMore: false, comments: [] }
      paginationOffset = stored
    }
    const json = await wbiGetJson(
      (q) => 'https://api.bilibili.com/x/v2/reply/wbi/main?' + new URLSearchParams(q).toString(),
      {
        oid: String(detail.aid),
        type: '1',
        mode: '2',
        pagination_str: JSON.stringify({ offset: paginationOffset }),
        plat: '1',
        seek_rpid: '',
        web_location: '1315875',
        'x-bili-locale-json': '{"c_locale":{"language":"zh","script":"Hans"},"always_translate":false}'
      }
    )
    if (json.code !== 0) return { total: 0, hasMore: false, comments: [] }
    const d = json.data ?? {}
    const replies: any[] = d.replies ?? []
    const cursor = d.cursor ?? {}
    const nextOffset = cursor.pagination_reply && cursor.pagination_reply.offset
      ? String(cursor.pagination_reply.offset)
      : ''
    const isEnd = cursor.is_end === true || replies.length === 0 || !nextOffset
    timeReplyCursors.set(bvid, isEnd ? 'END' : nextOffset)
    const comments = replies.map((r) => ({
      id: String(r.rpid),
      user: r.member?.uname ?? '',
      avatar: r.member?.avatar ?? '',
      content: r.content?.message ?? '',
      time: (r.ctime ?? 0) * 1000,
      likes: r.like ?? 0
    }))
    const total = cursor.all_count ?? 0
    return { total, hasMore: !isEnd, comments }
  } catch (e) {
    console.error('[Bilibili] time comments error', e)
    return { total: 0, hasMore: false, comments: [] }
  }
}
