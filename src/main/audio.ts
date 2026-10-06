/**
 * 音频准备与 bmedia:// 自定义协议
 * - B站: DASH音频(m4s)下载到本地缓存后播放(带 html5 mp4 兜底)
 * - 网易云: 直接代理其 CDN URL(设置 Referer 头)
 * - 封面图代理 bmedia://img?url=...
 */
import { protocol, app } from 'electron'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
  unlinkSync
} from 'fs'
import { join, resolve, sep } from 'path'
import type { Song, PreparedAudio } from '@shared/types'
import {
  resolvePlayUrl,
  getCidForPage,
  bvidFromSongId,
  pageFromSongId
} from './api/bilibili'
import { getSongUrl } from './api/netease'

let cacheDir = ''

export function getCacheDir(): string {
  return cacheDir
}

// registerSchemesAsPrivileged 必须在 app ready 之前调用(模块加载时即注册)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'bmedia',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

export function initAudio(): void {
  cacheDir = join(app.getPath('userData'), 'cache', 'audio')
  mkdirSync(cacheDir, { recursive: true })
}

export function registerAudioProtocol(): void {
  protocol.handle('bmedia', (req) => handleBMedia(req))
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    ...extra
  }
}

/** 仅允许代理 http/https 远程资源,拦截 file:// 等本地协议 */
function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).protocol
    return p === 'https:' || p === 'http:'
  } catch {
    return false
  }
}

async function handleBMedia(req: Request): Promise<Response> {
  const url = new URL(req.url)
  try {
    // 封面图代理
    if (url.hostname === 'img') {
      const target = url.searchParams.get('url') ?? ''
      if (!target) return new Response('missing url', { status: 400 })
      if (!isHttpUrl(target)) return new Response('bad url', { status: 400 })
      const resp = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' }
      })
      const headers = corsHeaders({
        'Content-Type': resp.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      })
      return new Response(resp.body, { status: resp.status, headers })
    }
    // 本地缓存文件
    if (url.hostname === 'local') {
      const p = url.searchParams.get('path') ?? ''
      return serveLocalFile(p, req)
    }
    // 远程流代理
    if (url.hostname === 'proxy') {
      const target = url.searchParams.get('url') ?? ''
      const referer = url.searchParams.get('referer') ?? ''
      if (!target) return new Response('missing url', { status: 400 })
      if (!isHttpUrl(target)) return new Response('bad url', { status: 400 })
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
      if (referer) headers.Referer = referer
      const range = req.headers.get('range')
      if (range) headers.Range = range
      const resp = await fetch(target, { headers })
      const outHeaders = corsHeaders({
        'Content-Type': resp.headers.get('content-type') ?? 'application/octet-stream',
        'Accept-Ranges': resp.headers.get('accept-ranges') ?? 'bytes'
      })
      for (const h of ['content-range', 'content-length']) {
        const v = resp.headers.get(h)
        if (v) outHeaders[h] = v
      }
      return new Response(resp.body, { status: resp.status, headers: outHeaders })
    }
    return new Response('not found', { status: 404 })
  } catch (e) {
    console.error('[bmedia] error', url.hostname, url.searchParams.get('url') ?? req.url, e)
    return new Response('error', { status: 500 })
  }
}

/** 允许直接读取的音频扩展名(本地歌曲可能位于任意目录,凭扩展名放行音频文件) */
const AUDIO_EXT_RE = /\.(mp3|flac|m4a|m4s|mp4|wav|ogg|aac|opus|webm)$/i

function serveLocalFile(p: string, req: Request): Response {
  // 仅放行:播放缓存目录内,或扩展名为音频的本地文件(拒绝任意文档读取)
  const rp = resolve(p)
  const inCache = cacheDir !== '' && (rp === cacheDir || rp.startsWith(cacheDir + sep))
  if (!inCache && !AUDIO_EXT_RE.test(rp)) {
    return new Response('forbidden', { status: 403 })
  }
  if (!existsSync(p)) return new Response('not found', { status: 404 })
  const stat = statSync(p)
  const total = stat.size
  const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase()
  const mime =
    ext === 'm4s' || ext === 'm4a' || ext === 'mp4'
      ? 'audio/mp4'
      : ext === 'mp3'
        ? 'audio/mpeg'
        : ext === 'flac'
          ? 'audio/flac'
          : 'application/octet-stream'
  const range = req.headers.get('range')
  const baseHeaders = corsHeaders({
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  })
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    let start = m && m[1] ? parseInt(m[1], 10) : 0
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1
    if (isNaN(start)) start = 0
    if (isNaN(end) || end >= total) end = total - 1
    if (start > end) start = 0
    const stream = createReadStream(p, { start, end })
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': `${end - start + 1}`
      }
    })
  }
  const stream = createReadStream(p)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': `${total}` }
  })
}

// ============ 音频准备 ============

function downloadToCache(url: string, cachePath: string, referer: string): Promise<boolean> {
  return new Promise((resolve) => {
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: referer
      }
    })
      .then((resp) => {
        const body = resp.body
        if (!resp.ok || !body) {
          resolve(false)
          return
        }
        const writer = createWriteStream(cachePath)
        ;(async () => {
          const reader = body.getReader()
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              if (!writer.write(Buffer.from(value))) {
                await new Promise<void>((r) => writer.once('drain', r))
              }
            }
            writer.end()
            writer.on('finish', () => resolve(true))
            writer.on('error', () => resolve(false))
          } catch {
            writer.destroy()
            resolve(false)
          }
        })()
      })
      .catch(() => resolve(false))
  })
}

/** 网易云 CDN 直链带签名会过期(约 20 分钟),缓存需带 TTL,避免重放过期链接 */
const NETEASE_URL_TTL_MS = 10 * 60 * 1000
const neteaseUrlCache = new Map<string, { url: string; quality: string; at: number }>()

/** 网易云 level → 中文音质描述 */
function neteaseLevelText(level: string, type: string): string {
  const fmt = type ? ` ${type.toUpperCase()}` : ''
  switch (level) {
    case 'standard':
      return `标准${fmt}`
    case 'higher':
      return `较高${fmt}`
    case 'exhigh':
      return `极高 320k${fmt}`
    case 'lossless':
      return `无损${fmt}`
    case 'hires':
      return `Hi-Res${fmt}`
    case 'jyeffect':
      return `高清环绕声${fmt}`
    case 'sky':
      return `沉浸环绕声${fmt}`
    case 'jymaster':
      return `超清母带${fmt}`
    default:
      return `${level}${fmt}`
  }
}

export async function prepareAudio(
  song: Song,
  html5Fallback = false,
  neteaseQuality = 'exhigh'
): Promise<PreparedAudio> {
  if (song.source === 'LOCAL' && song.localPath && existsSync(song.localPath)) {
    return {
      url: `bmedia://local/?path=${encodeURIComponent(song.localPath)}`,
      cachePath: song.localPath,
      quality: '本地文件'
    }
  }

  if (song.source === 'NETEASE' && song.neteaseId) {
    const cacheKey = `${song.neteaseId}@${neteaseQuality}`
    const hit = neteaseUrlCache.get(cacheKey)
    const fresh = hit && Date.now() - hit.at < NETEASE_URL_TTL_MS ? hit : null
    let direct = fresh?.url ?? null
    let quality = fresh?.quality ?? ''
    if (!direct) {
      if (hit) neteaseUrlCache.delete(cacheKey)
      const info = await getSongUrl(song.neteaseId, neteaseQuality)
      direct = info.url
      quality = neteaseLevelText(info.level || neteaseQuality, info.type)
      if (direct) neteaseUrlCache.set(cacheKey, { url: direct, quality, at: Date.now() })
    }
    if (direct) {
      // 部分链接为 http,统一走代理避免混合内容问题
      return {
        url: `bmedia://proxy/?url=${encodeURIComponent(direct)}`,
        quality: quality || neteaseLevelText(neteaseQuality, '')
      }
    }
    // 网易云无音源 → 由调用方回退到 B 站
    throw new Error('netease-no-source')
  }

  if (song.source === 'BILIBILI' && song.bvid) {
    const bvid = bvidFromSongId(song.bvid || song.id)
    const page = song.page || pageFromSongId(song.id)
    const cid = await getCidForPage(bvid, page)
    if (cid <= 0) throw new Error('no-cid')
    const suffix = page > 1 ? `_p${page}` : ''
    const ext = html5Fallback ? 'mp4' : 'm4s'
    const cachePath = join(cacheDir, `${bvid}${suffix}.${ext}`)
    if (existsSync(cachePath) && statSync(cachePath).size > 10240) {
      return {
        url: `bmedia://local/?path=${encodeURIComponent(cachePath)}`,
        cachePath,
        quality: ext === 'mp4' ? '标准 128k' : 'B站音频'
      }
    }
    const resolved = await resolvePlayUrl(bvid, cid, { preferHtml5: html5Fallback })
    if (!resolved) throw new Error('no-audio-url')
    const ok = await downloadToCache(resolved.url, cachePath, 'https://www.bilibili.com/')
    if (ok && existsSync(cachePath) && statSync(cachePath).size > 10240) {
      return {
        url: `bmedia://local/?path=${encodeURIComponent(cachePath)}`,
        cachePath,
        quality: resolved.quality
      }
    }
    // 下载失败 → 边播边代理
    return {
      url: `bmedia://proxy/?url=${encodeURIComponent(resolved.url)}&referer=${encodeURIComponent('https://www.bilibili.com/')}`,
      isFragmented: resolved.fragmented,
      quality: resolved.quality
    }
  }
  throw new Error('unsupported song')
}

export function coverProxyUrl(cover: string | null | undefined): string | null {
  if (!cover) return null
  if (cover.startsWith('bmedia://') || cover.startsWith('data:')) return cover
  return `bmedia://img/?url=${encodeURIComponent(cover)}`
}

export async function clearAudioCache(): Promise<number> {
  let count = 0
  let files: string[] = []
  try {
    files = readdirSync(cacheDir)
  } catch (e) {
    console.error('[Audio] read cache dir error', e)
    return 0
  }
  // 逐文件容错:单个文件被占用不应中断整体清理(统计失败条数日志)
  for (const f of files) {
    try {
      unlinkSync(join(cacheDir, f))
      count++
    } catch (e) {
      console.warn('[Audio] skip locked file', f, e)
    }
  }
  return count
}
