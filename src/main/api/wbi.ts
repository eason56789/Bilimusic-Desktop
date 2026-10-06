/**
 * Bilibili WBI 签名 (移植自安卓端 WbiSign.kt)
 * 参考: https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md
 */
import { createHash } from 'crypto'

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13
]

let cachedMixinKey: string | null = null
let cacheDay = -1

function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((i) => (i < orig.length ? orig[i] : '')).join('')
}

function md5(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex')
}

function urlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '%20')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function extractFileName(url: string): string {
  const last = url.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot >= 0 ? last.slice(0, dot) : last
}

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86400000)
}

export async function getMixinKeyFromServer(): Promise<string> {
  const today = dayOfYear()
  if (cachedMixinKey && cacheDay === today) return cachedMixinKey
  try {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.bilibili.com/'
      }
    })
    const json = (await resp.json()) as {
      code: number
      data?: { wbi_img?: { img_url?: string; sub_url?: string } }
    }
    // 未登录时 code=-101,但 wbi_img 依然存在
    const wbi = json.data?.wbi_img
    const imgKey = wbi?.img_url ? extractFileName(wbi.img_url) : ''
    const subKey = wbi?.sub_url ? extractFileName(wbi.sub_url) : ''
    if (imgKey && subKey) {
      cachedMixinKey = getMixinKey(imgKey + subKey)
      cacheDay = today
      return cachedMixinKey
    }
    console.warn('[WbiSign] failed to get keys, code:', json.code)
  } catch (e) {
    console.error('[WbiSign] error getting keys', e)
  }
  cachedMixinKey = '9b288b8f10ef90b6a4e5e7a1e5e7a1e5'
  cacheDay = today
  return cachedMixinKey
}

export async function refreshWbiKey(): Promise<void> {
  cachedMixinKey = null
  cacheDay = -1
  await getMixinKeyFromServer()
}

/** 为请求参数添加 WBI 签名 */
export async function wbiSign(
  params: Record<string, string>
): Promise<Record<string, string>> {
  const mixinKey = await getMixinKeyFromServer()
  const p: Record<string, string> = { ...params, wts: Math.floor(Date.now() / 1000).toString() }
  const keys = Object.keys(p).sort()
  const query = keys
    .map((k) => `${urlEncode(k)}=${urlEncode((p[k] ?? '').replace(/[!'()*]/g, ''))}`)
    .join('&')
  return { ...p, w_rid: md5(query + mixinKey) }
}

export function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}
