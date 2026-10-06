/**
 * 网易云音乐 API 客户端 (移植自安卓端 NeteaseApiClient.kt)
 */
import type { Song } from '@shared/types'
import { weApiEncrypt, eApiEncrypt, linuxApiEncrypt, md5Hex } from './neteaseCrypto'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
/** 登录相关请求使用手机 UA(与安卓端一致),降低"网络环境存在安全风险"风控 */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

/** 持久化 cookie(name → value),由 store 注入/保存 */
let cookies: Record<string, string> = {}
let cookieSaver: ((c: Record<string, string>) => void) | null = null

export function setNeteaseCookies(c: Record<string, string>): void {
  cookies = { ...c }
  if (!cookies.os) cookies.os = 'pc'
  if (!cookies.appver) cookies.appver = '8.10.35'
}

export function getNeteaseCookies(): Record<string, string> {
  return { ...cookies }
}

export function onNeteaseCookieChange(saver: (c: Record<string, string>) => void): void {
  cookieSaver = saver
}

export function neteaseHasLogin(): boolean {
  return !!cookies['MUSIC_U']
}

function mergeSetCookies(headers: Headers): void {
  const list: string[] =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  let changed = false
  for (const c of list) {
    const first = c.split(';')[0]
    const idx = first.indexOf('=')
    if (idx <= 0) continue
    const name = first.slice(0, idx).trim()
    const value = first.slice(idx + 1).trim()
    if (name && value && cookies[name] !== value) {
      cookies[name] = value
      changed = true
    }
  }
  if (changed) cookieSaver?.({ ...cookies })
}

function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

interface RequestOptions {
  method?: string
  useCookies?: boolean
  mobile?: boolean
}

async function request(
  url: string,
  params: Record<string, unknown>,
  mode: 'WEAPI' | 'EAPI' | 'API' | 'LINUX',
  opts: RequestOptions = {}
): Promise<string> {
  const method = (opts.method ?? 'POST').toUpperCase()
  const useCookies = opts.useCookies ?? true
  const reqUrl = new URL(url)
  let bodyParams: Record<string, string>
  const headers: Record<string, string> = {
    'User-Agent': opts.mobile ? MOBILE_UA : UA,
    Referer: 'https://music.163.com',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9'
  }

  if (mode === 'WEAPI') {
    bodyParams = weApiEncrypt(params)
    if (useCookies) headers.Cookie = cookieHeader()
    const csrf = useCookies ? (cookies['__csrf'] ?? '') : ''
    reqUrl.searchParams.set('csrf_token', csrf)
  } else if (mode === 'EAPI') {
    bodyParams = eApiEncrypt(reqUrl.pathname, params)
    if (useCookies) headers.Cookie = cookieHeader()
  } else if (mode === 'LINUX') {
    bodyParams = linuxApiEncrypt(params)
    if (useCookies) headers.Cookie = cookieHeader()
  } else {
    bodyParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    if (useCookies) headers.Cookie = cookieHeader()
  }

  let resp: Response
  if (method === 'POST') {
    const body = new URLSearchParams(bodyParams).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    resp = await fetch(reqUrl.toString(), { method, headers, body })
  } else {
    for (const [k, v] of Object.entries(bodyParams)) reqUrl.searchParams.set(k, v)
    resp = await fetch(reqUrl.toString(), { method: 'GET', headers })
  }
  mergeSetCookies(resp.headers)
  const text = await resp.text()
  if (!resp.ok) throw new Error(`网易云 HTTP ${resp.status}: ${text.slice(0, 200)}`)
  return text
}

async function callWeApi(path: string, params: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<any> {
  const p = path.startsWith('/') ? path : `/${path}`
  return JSON.parse(await request(`https://music.163.com/weapi${p}`, params, 'WEAPI', opts))
}

async function callEApi(path: string, params: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<any> {
  const p = path.startsWith('/') ? path : `/${path}`
  return JSON.parse(await request(`https://interface.music.163.com/eapi${p}`, params, 'EAPI', opts))
}

async function callApi(path: string, params: Record<string, unknown> = {}): Promise<any> {
  const p = path.startsWith('/') ? path : `/${path}`
  return JSON.parse(await request(`https://music.163.com/api${p}`, params, 'API'))
}

async function getApi(url: string): Promise<any> {
  return JSON.parse(await request(url, {}, 'API', { method: 'GET' }))
}

export async function ensureWeapiSession(): Promise<void> {
  try {
    await request('https://music.163.com/', {}, 'API', { method: 'GET' })
  } catch {
    /* ignore */
  }
}

// ============ 登录 ============

export function sendCaptcha(phone: string): Promise<any> {
  return request(
    'https://interface.music.163.com/weapi/sms/captcha/sent',
    { cellphone: phone, ctcode: '86' },
    'WEAPI',
    { useCookies: false, mobile: true }
  ).then((t) => JSON.parse(t))
}

export function loginByCaptcha(phone: string, captcha: string): Promise<any> {
  return callEApi(
    '/w/login/cellphone',
    {
      phone,
      countrycode: '86',
      remember: 'true',
      type: '1',
      captcha
    },
    { mobile: true }
  )
}

export function loginByPassword(phone: string, password: string): Promise<any> {
  return callEApi(
    '/w/login/cellphone',
    {
      phone,
      countrycode: '86',
      remember: 'true',
      password: md5Hex(password),
      type: '1'
    },
    { mobile: true }
  )
}

/** 网易云二维码登录 */
export async function getNeteaseQRKey(): Promise<string | null> {
  try {
    const json = await request(
      'https://music.163.com/weapi/login/qrcode/unikey',
      { type: '1' },
      'WEAPI',
      { useCookies: false }
    ).then((t) => JSON.parse(t))
    return json?.unikey ?? null
  } catch (e) {
    console.error('[Netease] QR key error', e)
    return null
  }
}

export async function pollNeteaseQR(key: string): Promise<{
  status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'
  message: string
}> {
  try {
    const json = await request(
      'https://music.163.com/weapi/login/qrcode/client/login',
      { key, type: '1' },
      'WEAPI',
      { useCookies: false }
    ).then((t) => JSON.parse(t))
    switch (json.code) {
      case 802:
        return { status: 'scanned', message: '已扫描,请在手机上确认' }
      case 803:
        return { status: 'ok', message: '登录成功' }
      case 800:
        return { status: 'expired', message: '二维码已过期' }
      case 801:
        return { status: 'waiting', message: '等待扫码...' }
      default:
        return { status: 'error', message: json.message ?? `状态: ${json.code}` }
    }
  } catch (e) {
    console.error('[Netease] QR poll error', e)
    return { status: 'error', message: '网络错误' }
  }
}

export async function getNeteaseAccount(): Promise<{
  userId: number
  nickname: string
  avatar: string
} | null> {
  const json = await callWeApi('/w/nuser/account/get')
  if (json.code !== 200 || !json.profile) return null
  return {
    userId: json.profile.userId,
    nickname: json.profile.nickname,
    avatar: json.profile.avatarUrl
  }
}

// ============ 搜索 ============

function songFromNetease(raw: any): Song {
  // fee=1 需要 VIP;fee=4 数字专辑;privilege.st<0 或无法播放也视为受限
  const fee = raw.fee ?? raw.privilege?.fee ?? 0
  const priv = raw.privilege
  const blocked = priv && typeof priv.st === 'number' && priv.st < 0
  return {
    id: `netease-${raw.id}`,
    title: raw.name ?? '未知',
    artist: (raw.ar ?? raw.artists ?? []).map((a: any) => a.name).join(' / ') || '未知',
    album: (raw.al ?? raw.album ?? {}).name ?? '',
    coverUrl: (raw.al ?? raw.album ?? {}).picUrl ?? null,
    duration: Math.round(((raw.dt ?? raw.duration ?? 0) as number) / 1000),
    source: 'NETEASE',
    page: 1,
    neteaseId: raw.id,
    addedAt: Date.now(),
    vipOnly: fee === 1 || fee === 4 || !!blocked
  }
}

export async function searchSongs(
  keyword: string,
  limit = 30,
  offset = 0
): Promise<{ songs: Song[]; hasMore: boolean; total: number }> {
  // 注意: cloudsearch/get/web 在桌面端会返回 50000005 反爬拦截,使用经典 search/get
  const json = await callWeApi('/search/get', {
    s: keyword,
    type: '1',
    limit: String(limit),
    offset: String(offset)
  })
  const result = json?.result ?? {}
  const songs: Song[] = (result.songs ?? []).map(songFromNetease)
  // 旧版 search/get 不返回封面,用 song/detail 一次性补齐
  if (songs.some((s) => !s.coverUrl)) {
    try {
      const ids = songs.filter((s) => !s.coverUrl).map((s) => s.neteaseId!) ?? []
      if (ids.length > 0) {
        const details = await getSongDetail(ids).catch(() => [] as Song[])
        const coverMap = new Map(details.map((d) => [d.id, d.coverUrl ?? null]))
        for (const s of songs) {
          if (!s.coverUrl && coverMap.has(s.id)) s.coverUrl = coverMap.get(s.id) ?? null
        }
      }
    } catch {
      /* 封面补齐失败不影响搜索 */
    }
  }
  return { songs, hasMore: !!result.more, total: result.songCount ?? songs.length }
}

export async function searchPlaylists(
  keyword: string,
  limit = 30,
  offset = 0
): Promise<any[]> {
  const json = await callWeApi('/search/get', {
    s: keyword,
    type: '1000',
    limit: String(limit),
    offset: String(offset)
  })
  return json?.result?.playlists ?? []
}

// ============ 歌曲信息/URL/歌词 ============

export interface NeteaseSongUrl {
  url: string | null
  type: string // mp3 / flac
  level: string
}

export async function getSongUrl(songId: number, level = 'exhigh'): Promise<NeteaseSongUrl> {
  const call = async () =>
    callEApi('/song/enhance/player/url/v1', {
      ids: `[${songId}]`,
      level,
      encodeType: 'flac'
    })
  let json = await call()
  if (json.code === 301 && neteaseHasLogin()) {
    await ensureWeapiSession()
    json = await call()
  }
  const info = json?.data?.[0]
  return {
    url: info?.url ?? null,
    type: info?.type ?? 'mp3',
    level: info?.level ?? level
  }
}

export async function getSongDetail(ids: number[]): Promise<Song[]> {
  const detailParam = `[${ids.map((id) => `{"id":${id}}`).join(',')}]`
  const json = await callWeApi('/v3/song/detail', {
    c: detailParam,
    ids: `[${ids.join(',')}]`
  })
  return (json?.songs ?? []).map(songFromNetease)
}

export interface NeteaseLyric {
  lrc: string
  yrc?: string
  tlyric?: string
}

export async function getLyricNew(songId: number): Promise<NeteaseLyric> {
  const call = async () =>
    callEApi('/song/lyric/v1', {
      id: String(songId),
      cp: 'false',
      lv: '0',
      tv: '1',
      rv: '0',
      yv: '1',
      ytv: '1',
      yrv: '0'
    })
  let json = await call()
  if (json.code === 301 && neteaseHasLogin()) {
    await ensureWeapiSession()
    json = await call()
  }
  return {
    lrc: json?.lrc?.lyric ?? '',
    yrc: json?.yrc?.lyric,
    tlyric: json?.tlyric?.lyric
  }
}

// ============ 歌单 ============

export async function getUserPlaylists(
  userId: number
): Promise<{ id: number; name: string; coverUrl?: string; count: number }[]> {
  const json = await callWeApi('/user/playlist', {
    uid: String(userId),
    offset: '0',
    limit: '1000',
    includeVideo: 'true'
  })
  return (json?.playlist ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    coverUrl: p.coverImgUrl,
    count: p.trackCount ?? 0
  }))
}

export async function getPlaylistDetail(playlistId: number): Promise<Song[]> {
  return (await getPlaylistDetailWithMeta(playlistId)).songs
}

/** 歌单详情 + 名称/封面(链接导入需要歌单名) */
export async function getPlaylistDetailWithMeta(
  playlistId: number
): Promise<{ name: string; coverUrl: string; songs: Song[] }> {
  const json = await request(
    `https://music.163.com/api/v6/playlist/detail?id=${playlistId}&n=100000&s=8`,
    {},
    'API',
    { method: 'GET' }
  ).then((t) => JSON.parse(t))
  const name: string = json?.playlist?.name ?? ''
  const coverUrl: string = json?.playlist?.coverImgUrl ?? ''
  const trackIds: number[] = (json?.playlist?.trackIds ?? []).map((t: any) => t.id)
  const songs: Song[] = []
  const batch = 500
  for (let i = 0; i < trackIds.length; i += batch) {
    const part = await getSongDetail(trackIds.slice(i, i + batch))
    songs.push(...part)
  }
  return { name, coverUrl, songs }
}

/** 歌手搜索(type=100) */
export async function searchArtists(keyword: string, limit = 20): Promise<any[]> {
  const json = await callWeApi('/search/get', {
    s: keyword,
    type: '100',
    limit: String(limit),
    offset: '0'
  })
  return json?.result?.artists ?? []
}

/** 歌手热门歌曲 */
export async function getArtistSongs(artistId: number): Promise<Song[]> {
  const json = await callWeApi('/artist/top/song', {
    id: String(artistId),
    order: 'hot'
  })
  return (json?.songs ?? []).map(songFromNetease)
}

/** 歌单搜索结果 → 简要信息 */
export async function searchPlaylistBrief(keyword: string, limit = 20): Promise<any[]> {
  const list = await searchPlaylists(keyword, limit, 0)
  return list.map((p: any) => ({
    id: p.id,
    name: p.name,
    coverUrl: p.coverImgUrl,
    count: p.trackCount ?? 0,
    creator: p.creator?.nickname ?? ''
  }))
}

/** 网易云推荐歌单(主页展示,无需登录) */
export async function getPersonalizedPlaylists(limit = 12): Promise<any[]> {
  const map = (list: any[]) =>
    list.map((p: any) => ({
      id: p.id,
      name: p.name,
      coverUrl: p.picUrl,
      count: p.playCount ?? 0,
      creator: p.creator?.nickname ?? ''
    }))
  // 明文公开接口优先,失败再走 weapi
  try {
    const json = await callApi('/personalized/playlist', { limit: String(limit), total: 'true' })
    const list = json?.result ?? []
    if (list.length > 0) return map(list)
  } catch {
    /* fallthrough */
  }
  const json2 = await callWeApi('/personalized', { limit: String(limit) })
  return map(json2?.result ?? [])
}

// ============ 评论(公开接口) ============

export interface NeteaseComment {
  id: number
  user: string
  avatar: string
  content: string
  time: number
  likedCount: number
}

export async function getMusicComments(
  songId: number,
  offset = 0,
  limit = 20
): Promise<{ total: number; comments: NeteaseComment[]; hasMore: boolean }> {
  const json = await getApi(
    `https://music.163.com/api/v1/resource/comments/R_SO_4_${songId}?limit=${limit}&offset=${offset}`
  )
  const map = (c: any): NeteaseComment => ({
    id: c.commentId,
    user: c.user?.nickname ?? '未知',
    avatar: c.user?.avatarUrl ?? '',
    content: c.content ?? '',
    time: c.time ?? 0,
    likedCount: c.likedCount ?? 0
  })
  return {
    total: json?.total ?? 0,
    comments: (json?.comments ?? []).map(map),
    hasMore: !!json?.more
  }
}
