/**
 * 通过分享链接导入歌单(网易云 / QQ音乐 / 酷狗音乐)
 * - parsePlaylistLink 是纯函数,负责从 URL 中识别平台与歌单 id
 * - fetchPlaylistByLink 负责拉取歌单内容(短链先跟随后再解析)
 */
import type { Song } from '@shared/types'
import { getPlaylistDetailWithMeta } from './netease'
import { fetchQqPlaylist, fetchKugouPlaylist } from './qqkugou'

export type LinkPlatform = 'netease' | 'qq' | 'kugou'

export interface ParsedLink {
  platform: LinkPlatform
  /** 歌单 id(十进制字符串) */
  id: string
}

export interface LinkedPlaylist {
  platform: LinkPlatform
  /** 远端歌单 id(网易云用于回填 neteasePlaylistId 以支持后续同步) */
  playlistId: string
  name: string
  coverUrl: string
  songs: Song[]
}

/** 需要跟随后再解析的短链域名(仅官方短链域名,避免对任意链接发起请求) */
const SHORT_LINK_HOSTS = ['163cn.tv', '163cn.cn']

/**
 * 从歌单分享链接解析平台与 id。
 * 无法识别时返回 null(调用方可尝试跟随后再解析一次)。
 */
export function parsePlaylistLink(input: string): ParsedLink | null {
  const raw = input.trim()
  if (!raw) return null
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  const path = u.pathname
  // hash 路由(如 music.163.com/#/playlist?id=)也要参与匹配
  const all = `${path}${u.search}${u.hash}`

  // ---- 网易云 ----
  if (/(^|\.)music\.163\.com$/.test(host)) {
    // 必须带 playlist 语境,避免 song?id= / album?id= 误判成歌单
    if (!/playlist/i.test(all)) return null
    const m = /[?&#]id=(\d+)/.exec(u.search + u.hash) || /playlist\/(\d+)/.exec(path)
    if (m) return { platform: 'netease', id: m[1] }
    return null
  }

  // ---- QQ音乐 ----
  if (/(^|\.)(y\.qq\.com|qq\.music\.com)$/.test(host)) {
    const m =
      /\/playlist\/(\d+)/.exec(path) ||
      /\/playlist_detail\/(\d+)/.exec(path) ||
      /disstid=(\d+)/.exec(all) ||
      // taoge.html 是手机客户端分享歌单的标准页面(/n2/m/share/details/taoge.html?id=)
      ((/playlist|taoge/i.test(all) || /[?&#]type=cd/.test(all)) && /[?&#]id=(\d+)/.exec(all))
    if (m) return { platform: 'qq', id: m[1] }
    // QQ音乐App短链(c6.y.qq.com/base/fcgi-bin/u?__=xxx):需跟随重定向,标记为待跟随
    if (/\/u$/.test(path)) return { platform: 'qq', id: '' }
    return null
  }

  // ---- 酷狗 ----
  if (/(^|\.)kugou\.com$/.test(host)) {
    const m =
      /\/special\/[^/]+\/(\d+)(?:\.html)?/.exec(path) || // www.kugou.com/yy/special/single/9277467.html(实测有效)
      /specialid=(\d+)/.exec(all) ||
      (/playlist/i.test(all) && /[?&#]id=(\d+)/.exec(all)) // 老式 #/playlist?id=(id 应为 specialid)
    if (m) return { platform: 'kugou', id: m[1] }
    // 短链(如 m.kugou.com/plist/list/xxx):id 为空,调用方抓页面内嵌的 specialid
    if (/\/(plist|playlist)\//.test(path)) return { platform: 'kugou', id: '' }
    return null
  }

  // ---- 网易云短链(163cn.tv) ----
  if (/(^|\.)163cn\.(tv|cn)$/.test(host)) {
    return { platform: 'netease', id: '' }
  }
  return null
}

/** 跟随重定向解析短链(仅允许的短链域名),10s 超时 */
async function followShortLink(url: string): Promise<ParsedLink | null> {
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    })
    if (!resp.url || resp.url === url) return null
    const parsed = parsePlaylistLink(resp.url)
    if (parsed?.id) return parsed
    return null
  } catch (e) {
    console.warn('[LinkImport] follow short link failed', e)
    return null
  }
}

/**
 * 酷狗短链(m.kugou.com/plist/list/xxx)无重定向,页面内嵌 `specialid`,
 * 抓页面正则提取。仅允许 kugou.com 域名(限制请求目标)。
 */
async function extractKugouSpecialId(url: string): Promise<string | null> {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
  } catch {
    return null
  }
  if (!/(^|\.)kugou\.com$/.test(u.hostname.toLowerCase())) return null
  try {
    const resp = await fetch(u.href, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    })
    const html = await resp.text()
    const m = html.match(/specialid\s*[:=]\s*["']?(\d+)/i)
    if (m) return m[1]
    const m2 = html.match(/special\/[^/]+\/(\d+)/)
    return m2 ? m2[1] : null
  } catch (e) {
    console.warn('[LinkImport] kugou short page failed', e)
    return null
  }
}

/** 识别链接并拉取歌单内容 */
export async function fetchPlaylistByLink(input: string): Promise<LinkedPlaylist> {
  let parsed = parsePlaylistLink(input)
  const needFollow = !parsed || !parsed.id
  if (needFollow) {
    const host = (() => {
      try {
        return new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`)
          .hostname.toLowerCase()
      } catch {
        return ''
      }
    })()
    if (SHORT_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      parsed = (await followShortLink(input)) ?? parsed
    }
    // QQ音乐App短链(u?__=xxx):302 跳转到完整分享页后再解析
    if (parsed?.platform === 'qq' && !parsed.id) {
      parsed = (await followShortLink(input)) ?? parsed
    }
    // 酷狗短链:页面内嵌 specialid
    if (parsed?.platform === 'kugou' && !parsed.id) {
      const kg = await extractKugouSpecialId(input)
      if (kg) parsed = { platform: 'kugou', id: kg }
    }
  }
  if (!parsed || !parsed.id) {
    throw new Error(
      '无法识别歌单链接:支持网易云 music.163.com/163cn.tv、QQ音乐 y.qq.com、酷狗 kugou.com(/yy/special/single/xxx.html 或 /plist/) 的歌单分享链接'
    )
  }
  switch (parsed.platform) {
    case 'netease': {
      const { name, coverUrl, songs } = await getPlaylistDetailWithMeta(Number(parsed.id))
      if (songs.length === 0) throw new Error('网易云歌单为空或不可访问')
      return {
        platform: 'netease',
        playlistId: parsed.id,
        name: name || `网易云歌单 ${parsed.id}`,
        coverUrl,
        songs
      }
    }
    case 'qq':
      return await fetchQqPlaylist(parsed.id)
    case 'kugou':
      return await fetchKugouPlaylist(parsed.id)
  }
}
