/**
 * 网易云音乐 API 客户端 (移植自安卓端 NeteaseApiClient.kt)
 */
import type {
  Song,
  NeteasePlaylistMeta,
  NeteaseArtistDetail,
  ChartCatalog,
  ChartDetail,
  ChartBrief
} from '@shared/types'
import { createHash, randomBytes } from 'crypto'
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
  /** 附加 cookie(人机验证窗口种下的 .163.com 凭据;与全局 cookie 独立) */
  extraCookies?: string
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
    const base = useCookies ? cookieHeader() : ''
    const cookie = [base, opts.extraCookies ?? ''].filter(Boolean).join('; ')
    if (cookie) headers.Cookie = cookie
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

/**
 * 手机号登录(验证码 / 密码)—— PC 网页版 WEAPI 会话流程,规避风控。
 *
 * 之前的实现走 EAPI /w/login/cellphone(密文里没有设备指纹 header,UA 又是手机),
 * 网易服务端判定异常环境,报「网络环境存在安全风险」。现按 NeteaseCloudMusicApiEnhanced
 * 的网页协议实现:
 *   1. 每次登录前先注册匿名令牌(MUSIC_A,register/anonimous,含设备 id 签名);
 *   2. 完整反风控 cookie 指纹:os/appver/osver/channel/deviceId + _ntes_nuid/_ntes_nnid
 *      + WNMCID/WEVNSM/NMTID(与真实网页客户端一致);
 *   3. 发验证码带 secrete='music_middleuser_pclogin'(PC 网页登录流程标识);
 *   4. 发码与登录共用同一个 cookie 会话,服务端下发的 __csrf 持续回填;
 *   5. 登录请求带 csrf_token,成功以 Set-Cookie 中的 MUSIC_U 为准。
 * 登录成功后把会话 cookie 合并进全局 cookies 并触发持久化(与扫码登录同一落点)。
 */
const LOGIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const LOGIN_SESSION_TTL = 10 * 60_000

interface LoginSession {
  cookies: Record<string, string>
  expiresAt: number
  phone?: string
  countrycode?: string
}
let loginSession: LoginSession | null = null

/** 52 位大写十六进制设备 id(api-enhanced 同款) */
function generateDeviceId(): string {
  const hexChars = '0123456789ABCDEF'
  let s = ''
  for (let i = 0; i < 52; i++) s += hexChars[Math.floor(Math.random() * hexChars.length)]
  return s
}

/** 云音乐 dll 设备签名:deviceId 与固定密钥逐字符异或后取 MD5-Base64 */
function cloudmusicDllEncodeId(deviceId: string): string {
  const key = '3go8&$8*3*3h0k(2)2'
  const xored = deviceId
    .split('')
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
    .join('')
  return createHash('md5').update(xored, 'utf8').digest('base64')
}

/** 随机十六进制串(WordArray.random(16) 等价:16 字节 → 32 位 hex) */
function randomHex32(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 完整反风控 cookie 指纹(每次会话生成新值,deviceId 持久化)。
 * 字段集与 NeteaseCloudMusicApiEnhanced 的 processCookieObject 一致。
 */
function buildRiskCookies(): Record<string, string> {
  if (!cookies.deviceId) cookies.deviceId = generateDeviceId()
  const nuid = randomHex32()
  const now = Date.now()
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let wn = ''
  for (let i = 0; i < 6; i++) wn += letters[Math.floor(Math.random() * letters.length)]
  return {
    os: 'pc',
    appver: '3.1.17.204416',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
    deviceId: cookies.deviceId,
    _ntes_nuid: nuid,
    _ntes_nnid: `${nuid},${now}`,
    WNMCID: `${wn}.${now}.01.0`,
    WEVNSM: '1.0.0',
    NMTID: randomHex32()
  }
}

/**
 * 注册匿名令牌(MUSIC_A):未登录请求的关键风控 cookie,一次获取长期有效。
 * 服务端按 username = base64(`${deviceId} ${dll签名}`) 校验设备身份。
 */
async function ensureAnonymousToken(): Promise<void> {
  if (cookies.MUSIC_A) return
  try {
    const deviceId = generateDeviceId()
    const session: LoginSession = {
      cookies: buildRiskCookies(),
      expiresAt: Date.now() + LOGIN_SESSION_TTL
    }
    const encoded = Buffer.from(`${deviceId} ${cloudmusicDllEncodeId(deviceId)}`, 'utf8').toString('base64')
    const json = await loginRequest('register/anonimous', { username: encoded }, session)
    if (json?.code === 200) {
      Object.assign(cookies, session.cookies)
      cookieSaver?.({ ...cookies })
    }
  } catch {
    /* 匿名令牌失败不阻断登录,继续用基础指纹 */
  }
}

/** 登录会话:反风控指纹 + 匿名令牌(+ 人机验证完成后窗口会话里种下的 cookie) */
async function freshLoginSession(phone?: string, countrycode?: string, extraCookies?: string): Promise<LoginSession> {
  await ensureAnonymousToken()
  const base = buildRiskCookies()
  const session: LoginSession = {
    cookies: {
      ...base,
      ...(cookies.MUSIC_A ? { MUSIC_A: cookies.MUSIC_A } : {}),
      ...(cookies.__csrf ? { __csrf: cookies.__csrf } : {})
    },
    expiresAt: Date.now() + LOGIN_SESSION_TTL,
    phone,
    countrycode
  }
  if (extraCookies) {
    for (const pair of extraCookies.split(';')) {
      const idx = pair.indexOf('=')
      if (idx > 0) {
        const name = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (name) session.cookies[name] = value
      }
    }
  }
  return session
}

function readLoginSetCookies(headers: Headers): Record<string, string> {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  const out: Record<string, string> = {}
  for (const c of list) {
    const first = c.split(';')[0]
    const idx = first.indexOf('=')
    if (idx <= 0) continue
    const name = first.slice(0, idx).trim()
    const value = first.slice(idx + 1).trim()
    if (name) out[name] = value
  }
  return out
}

async function loginRequest(path: string, data: Record<string, unknown>, session: LoginSession): Promise<any> {
  const bodyParams = weApiEncrypt({ ...data, csrf_token: session.cookies.__csrf ?? '' })
  const cookieStr = Object.entries(session.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  const resp = await fetch(`https://music.163.com/weapi/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': LOGIN_UA,
      Referer: 'https://music.163.com/',
      Cookie: cookieStr
    },
    body: new URLSearchParams(bodyParams as Record<string, string>).toString(),
    signal: AbortSignal.timeout(20_000)
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`网易云登录请求失败 HTTP ${resp.status}`)
  const json = JSON.parse(text)
  // 服务端下发的 cookie(含 __csrf / MUSIC_U)回填会话,下一步请求继续携带
  Object.assign(session.cookies, readLoginSetCookies(resp.headers))
  return json
}

/** 登录成功收尾:会话 cookie 合入全局(供调用方持久化),清掉会话 */
function finishLogin(session: LoginSession): void {
  Object.assign(cookies, session.cookies)
  cookieSaver?.({ ...cookies })
  loginSession = null
}

/** 发送短信验证码。同一手机号的发码与登录共用会话(10 分钟有效)。 */
export async function sendCaptcha(phone: string, ctcode = '86', extraCookies?: string): Promise<any> {
  if (
    !loginSession ||
    loginSession.expiresAt < Date.now() ||
    loginSession.phone !== phone ||
    loginSession.countrycode !== ctcode
  ) {
    loginSession = await freshLoginSession(phone, ctcode)
  }
  if (extraCookies) {
    for (const pair of extraCookies.split(';')) {
      const idx = pair.indexOf('=')
      if (idx > 0) {
        const name = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (name) loginSession.cookies[name] = value
      }
    }
  }
  const json = await loginRequest(
    'sms/captcha/sent',
    { ctcode, cellphone: phone, secrete: 'music_middleuser_pclogin' },
    loginSession
  )
  if (json?.code !== 200) {
    loginSession = null
    return { ...json, message: json?.message ?? '验证码发送失败,请稍后重试' }
  }
  if (json?.data !== true) return { ...json, code: 500, message: '网易云未确认发送验证码,请稍后重试' }
  loginSession.expiresAt = Date.now() + LOGIN_SESSION_TTL
  return json
}

const LOGIN_CODE_MESSAGES: Record<number, string> = {
  400: '手机号或验证码无效',
  501: '手机号尚未注册',
  502: '登录凭证校验失败',
  503: '验证码错误或已过期',
  405: '操作过于频繁,请稍后重试'
}

function withFriendlyMessage(json: any): any {
  if (json?.code === 200) return json
  return {
    ...json,
    message:
      LOGIN_CODE_MESSAGES[json?.code] ??
      (json?.message ? `${json.message} (${json?.code})` : `登录失败(${json?.code}),请尝试扫码登录`)
  }
}

export async function loginByCaptcha(phone: string, captcha: string, ctcode = '86', extraCookies?: string): Promise<any> {
  // 复用发码会话(风控要求发码与登录同一 cookie 会话);过期或换号才重建
  if (!loginSession || loginSession.expiresAt < Date.now() || loginSession.phone !== phone) {
    loginSession = await freshLoginSession(phone, ctcode)
  }
  if (extraCookies) {
    for (const pair of extraCookies.split(';')) {
      const idx = pair.indexOf('=')
      if (idx > 0) {
        const name = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (name) loginSession.cookies[name] = value
      }
    }
  }
  const json = await loginRequest(
    'w/login/cellphone',
    { type: '1', https: 'true', phone, countrycode: ctcode, captcha, remember: 'true', secureCaptcha: '' },
    loginSession
  )
  if (json?.code !== 200) return withFriendlyMessage(json)
  if (!loginSession.cookies.MUSIC_U && !cookies.MUSIC_U) {
    return { code: 502, message: '网易云未返回有效登录凭证' }
  }
  finishLogin(loginSession)
  return json
}

export async function loginByPassword(phone: string, password: string, ctcode = '86', extraCookies?: string): Promise<any> {
  const session = await freshLoginSession(phone, ctcode, extraCookies)
  const json = await loginRequest(
    'w/login/cellphone',
    { type: '0', https: 'true', phone, countrycode: ctcode, password: md5Hex(password), remember: 'true', secureCaptcha: '' },
    session
  )
  if (json?.code !== 200) return withFriendlyMessage(json)
  if (!session.cookies.MUSIC_U && !cookies.MUSIC_U) {
    return { code: 502, message: '网易云未返回有效登录凭证' }
  }
  finishLogin(session)
  return json
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
  return qrStateFromJson(await pollNeteaseQRJson(key))
}

/** 二维码轮询原始响应(保留 code/-462 等风控载荷,供验证窗口流程重试) */
export async function pollNeteaseQRJson(key: string, extraCookies?: string): Promise<any> {
  try {
    return JSON.parse(
      await request(
        'https://music.163.com/weapi/login/qrcode/client/login',
        { key, type: '1' },
        'WEAPI',
        { useCookies: false, extraCookies }
      )
    )
  } catch (e) {
    console.error('[Netease] QR poll error', e)
    return { code: -1, message: '网络错误' }
  }
}

export function qrStateFromJson(json: any): {
  status: 'waiting' | 'scanned' | 'ok' | 'expired' | 'error'
  message: string
} {
  switch (json?.code) {
    case 802:
      return { status: 'scanned', message: '已扫描,请在手机上确认' }
    case 803:
      return { status: 'ok', message: '登录成功' }
    case 800:
      return { status: 'expired', message: '二维码已过期' }
    case 801:
      return { status: 'waiting', message: '等待扫码...' }
    default:
      return { status: 'error', message: json?.message ?? `状态: ${json?.code}` }
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
  /** 试听片段(freeTrialInfo 存在;VIP/付费歌非 VIP 账号下发) */
  trial?: boolean
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
    level: info?.level ?? level,
    trial: !!info?.freeTrialInfo || info?.level === 'trial'
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

/** 单曲原始明细(歌曲详情弹窗展示:发行时间/人气/VIP 标记/歌手 id 等) */
export async function getSongDetailRaw(id: number): Promise<{
  albumName?: string
  publishTime?: number
  pop?: number
  fee?: number
  artistId?: number
} | null> {
  const json = await callWeApi('/v3/song/detail', {
    c: `[{"id":${id}}]`,
    ids: `[${id}]`
  })
  const s = json?.songs?.[0]
  if (!s) return null
  return {
    albumName: s.al?.name ?? s.album?.name,
    publishTime: s.publishTime ?? s.album?.publishTime,
    pop: typeof s.pop === 'number' ? Math.round(s.pop) : undefined,
    fee: typeof s.fee === 'number' ? s.fee : undefined,
    artistId: s.ar?.[0]?.id ?? s.artists?.[0]?.id
  }
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

/**
 * 按歌手名解析网易云歌手 id(全屏播放页点歌手名打开主页用)。
 * 优先精确同名,其次首条结果;找不到返回 null。
 */
export async function findArtistIdByName(name: string): Promise<number | null> {
  const kw = name.trim()
  if (!kw) return null
  try {
    const list = await searchArtists(kw, 10)
    if (!Array.isArray(list) || list.length === 0) return null
    const exact = list.find((a: { name?: string }) => String(a.name ?? '').trim() === kw)
    const id = Number((exact ?? list[0])?.id)
    return isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

/** 歌手热门歌曲 */
export async function getArtistSongs(artistId: number): Promise<Song[]> {
  const json = await callWeApi('/artist/top/song', {
    id: String(artistId),
    order: 'hot'
  })
  return (json?.songs ?? []).map(songFromNetease)
}

/** 歌单元信息(详情页展示:描述/播放量/创建时间/创作者等) */
export async function getPlaylistMeta(playlistId: number): Promise<NeteasePlaylistMeta> {
  const json = await request(
    `https://music.163.com/api/v6/playlist/detail?id=${playlistId}&n=10&s=8`,
    {},
    'API',
    { method: 'GET' }
  ).then((t) => JSON.parse(t))
  const p = json?.playlist ?? {}
  return {
    id: playlistId,
    name: p.name ?? '',
    coverUrl: p.coverImgUrl ?? undefined,
    description: p.description ?? undefined,
    playCount: p.playCount ?? undefined,
    subscribedCount: p.subscribedCount ?? undefined,
    shareCount: p.shareCount ?? undefined,
    commentCount: p.commentCount ?? undefined,
    createTime: p.createTime ?? undefined,
    updateTime: p.updateTime ?? undefined,
    creator: p.creator?.nickname ?? undefined,
    tags: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : undefined,
    trackCount: p.trackCount ?? undefined
  }
}

/** 歌手详情(简介/图片/歌曲数/专辑数 + 粉丝数) */
export async function getArtistDetail(artistId: number): Promise<NeteaseArtistDetail> {
  // 基础资料 + 热歌列表(附带 musicSize/albumSize/briefDesc)
  const json = await callWeApi(`/v1/artist/${artistId}`, {})
  const a = json?.artist ?? {}
  let fansCount: number | undefined
  try {
    const fans = await callWeApi('/artist/follow/count/get', { id: String(artistId) })
    const n = Number(fans?.data?.fansCnt)
    if (isFinite(n) && n >= 0) fansCount = n
  } catch {
    /* 粉丝数拿不到不影响主流程 */
  }
  return {
    id: artistId,
    name: a.name ?? '',
    avatar: a.picUrl ?? undefined,
    cover: a.picUrl ?? undefined,
    briefDesc: a.briefDesc ?? undefined,
    alias: Array.isArray(a.alias) && a.alias.length > 0 ? a.alias : undefined,
    musicSize: a.musicSize ?? undefined,
    albumSize: a.albumSize ?? undefined,
    mvSize: a.mvSize ?? undefined,
    fansCount
  }
}

/** 歌单搜索结果 → 简要信息(播放量/收藏数一并带出,便于列表卡片展示) */
export async function searchPlaylistBrief(keyword: string, limit = 20): Promise<any[]> {
  const list = await searchPlaylists(keyword, limit, 0)
  return list.map((p: any) => ({
    id: p.id,
    name: p.name,
    coverUrl: p.coverImgUrl,
    count: p.trackCount ?? 0,
    creator: p.creator?.nickname ?? '',
    // bookCount = 收藏数(search/get 的歌单段没有 subscribedCount)
    playCount: Number(p.playCount ?? 0) || undefined,
    favCount: Number(p.bookCount ?? p.subscribedCount ?? 0) || undefined
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

// ============ 排行榜 ============

/**
 * 榜单目录:/api/toplist 明文公开接口(无需登录、无需加密),返回全部榜单
 * (飙升/新歌/原创/热歌 + 电音/说唱/国风/ACG/日语/韩语等分类榜)。
 */
export async function getChartCatalog(): Promise<ChartCatalog> {
  const label = '网易云音乐'
  try {
    const json = await getApi('https://music.163.com/api/toplist')
    const list: any[] = json?.list ?? []
    if (list.length === 0) {
      return { platform: 'netease', label, groups: [], error: '网易云榜单目录为空' }
    }
    const charts: ChartBrief[] = list
      .map((c: any): ChartBrief | null => {
        const id = String(c?.id ?? '')
        const name = String(c?.name ?? '').trim()
        if (!id || !name) return null
        return {
          id,
          name,
          coverUrl: c?.coverImgUrl ? String(c.coverImgUrl) : undefined,
          updateTip: c?.updateFrequency ? String(c.updateFrequency) : undefined
        }
      })
      .filter((c): c is ChartBrief => c !== null)
    // 官榜在前(飙升/新歌/原创/热歌),其余分类榜按接口顺序排后
    return { platform: 'netease', label, groups: [{ name: '', charts }] }
  } catch (e) {
    return {
      platform: 'netease',
      label,
      groups: [],
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * 榜单曲目:/api/playlist/detail?id=<toplistId> 返回 result.tracks(已含 ar/al/dt,无需再补详情)。
 * 老接口给的是原始字段名 artists/album/duration,由 songFromNetease 兼容读取。
 */
export async function getChartSongs(chartId: string): Promise<ChartDetail> {
  const id = encodeURIComponent(String(chartId))
  const json = await getApi(`https://music.163.com/api/playlist/detail?id=${id}`)
  const result = json?.result ?? {}
  const tracks: any[] = result?.tracks ?? []
  let songs = tracks.map(songFromNetease)
  // 该接口偶发只回 trackIds(曲目明细被裁掉),此时按 id 批量补详情
  if (songs.length === 0 && Array.isArray(result?.trackIds) && result.trackIds.length > 0) {
    const ids = result.trackIds.slice(0, 100).map((t: any) => Number(t.id)).filter((n: number) => n > 0)
    songs = await getSongDetail(ids).catch(() => [] as Song[])
  }
  return {
    id: String(chartId),
    name: String(result?.name ?? ''),
    platform: 'netease',
    coverUrl: result?.coverImgUrl ? String(result.coverImgUrl) : undefined,
    updateTip: result?.updateFrequency ? String(result.updateFrequency) : undefined,
    intro: result?.description ? String(result.description).slice(0, 300) : undefined,
    songs,
    total: Number(result?.trackCount ?? 0) || songs.length
  }
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
  limit = 20,
  order: 'hot' | 'time' = 'hot'
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
  // 该公开接口的 comments 恒为时间倒序(实测 sortType/sort 参数被忽略),
  // 热度排序取响应内置的 hotComments(仅首页返回,无分页)。
  if (order === 'hot') {
    if (offset > 0) return { total: json?.total ?? 0, comments: [], hasMore: false }
    const hot = (json?.hotComments ?? []).map(map)
    return { total: hot.length, comments: hot, hasMore: false }
  }
  return {
    total: json?.total ?? 0,
    comments: (json?.comments ?? []).map(map),
    hasMore: !!json?.more
  }
}

// ============ 播放记录(读 / 写) ============

export interface ScrobbleResult {
  ok: boolean
  code?: number
  error?: string
}

/**
 * 上传播放记录(打卡):客户端把一首歌实际播放 ≥30s 的行为上报给网易云,
 * 记入听歌排行与"最近在听"。body 结构与网易云网页端一致(WEAPI)。
 */
export async function scrobble(songId: number, timePlayed = 30): Promise<ScrobbleResult> {
  if (!neteaseHasLogin()) return { ok: false, error: '未登录网易云' }
  if (!Number.isFinite(songId) || songId <= 0) return { ok: false, error: '缺少网易云歌曲 id' }
  try {
    const json = await callWeApi('/api/feedback/weblog', {
      logs: JSON.stringify([
        {
          action: 'play',
          json: {
            download: 0,
            end: 'play',
            id: songId,
            sourceId: '',
            sourceLoad: '',
            time: Math.floor(timePlayed),
            type: 'song',
            wifi: 0,
            source: 'list'
          }
        }
      ])
    })
    return json?.code === 200
      ? { ok: true, code: 200 }
      : { ok: false, code: json?.code, error: json?.message ?? `code ${json?.code}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/**
 * 云端播放记录(听歌排行):先取最近一周(type=0),为空再取累计(type=1)。
 * 需登录(拿 uid);条目里的 song 走统一的 songFromNetease 映射。
 */
export async function getPlayRecord(): Promise<{
  songs: Song[]
  notLoggedIn: boolean
  error?: string
}> {
  if (!neteaseHasLogin()) return { songs: [], notLoggedIn: true }
  try {
    const account = await getNeteaseAccount().catch(() => null)
    if (!account) return { songs: [], notLoggedIn: true }
    const fetchType = (type: string) =>
      callWeApi('/api/play/record', { uid: account.userId, type, limit: '50' })
    let json = await fetchType('0')
    let list: any[] = json?.weekData ?? []
    if (list.length === 0) {
      json = await fetchType('1')
      list = json?.allData ?? []
    }
    const songs = list
      .map((it: any) => songFromNetease(it.song ?? it))
      .filter((s: Song) => !!s.neteaseId)
    return { songs, notLoggedIn: false }
  } catch (e) {
    return { songs: [], notLoggedIn: false, error: String(e) }
  }
}

/** 搜索推荐(输入联想):suggest/keyword 联想词;不可用时不返回任何词(避免无关推荐) */
export async function searchSuggest(keyword: string): Promise<string[]> {
  const out: string[] = []
  const push = (v: unknown): void => {
    const s = String(v ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  const parse = (json: any): void => {
    const r = json?.result ?? json?.data ?? {}
    if (typeof r?.match === 'string') push(r.match)
    for (const key of ['songs', 'artists', 'albums', 'playlists'] as const) {
      for (const item of (r[key] ?? []).slice(0, 3)) {
        if (!item?.name) continue
        push(
          key === 'songs' && Array.isArray(item.artists) && item.artists.length
            ? `${item.name} - ${item.artists.map((a: any) => a.name).join('/')}`
            : item.name
        )
      }
    }
  }
  // 官方联想接口(与网页版同款);csrf 缺失时先预热会话
  try {
    if (!cookies['__csrf']) await ensureWeapiSession()
    const json = JSON.parse(
      await request('https://music.163.com/weapi/search/suggest/keyword', { keyword, limit: 8 }, 'WEAPI')
    )
    parse(json)
    if (out.length > 0) return out.slice(0, 8)
    // 兼容变体:csrf_token 放在加密载荷里再试一次
    const json2 = JSON.parse(
      await request('https://music.163.com/weapi/search/suggest/keyword', { keyword, limit: 8, csrf_token: cookies['__csrf'] ?? '' }, 'WEAPI')
    )
    parse(json2)
    if (out.length > 0) return out.slice(0, 8)
    // 兼容变体:热门搜索联想(与输入相关的热搜匹配)
    const hot = JSON.parse(
      await request('https://music.163.com/weapi/hotsearchlist/get', {}, 'WEAPI')
    )
    const words: string[] = []
    for (const it of hot?.data ?? []) if (it?.searchWord) words.push(String(it.searchWord))
    if (words.length === 0) for (const it of hot?.result?.hots ?? []) if (it?.first) words.push(String(it.first))
    const kw = keyword.toLowerCase()
    for (const w of words) {
      if (w.toLowerCase().includes(kw) || kw.includes(w.toLowerCase())) push(w)
    }
    return out.slice(0, 8)
  } catch {
    return out.slice(0, 8)
  }
}
