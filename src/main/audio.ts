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
import { getQqSongUrl } from './api/qqmusic'
import { getKugouSongUrl } from './api/kugou'
import { getStore } from './store'

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

/**
 * 代理目标域名白名单(封面/音频 CDN):
 * bmedia://img 与 bmedia://proxy 不再是任意 URL 的开放转发通道,
 * 渲染层传入的 target 只允许命中这些后缀(各大平台音视频/图片 CDN)。
 */
const PROXY_HOST_SUFFIXES = [
  // B站(视频 CDN + 图片 + 海外镜像)
  'bilivideo.com',
  'bilivideo.cn',
  'akamaized.net',
  'biliapi.net',
  'hdslb.com',
  // 网易云(音频/图片,126.net 覆盖 music.126.net)
  'music.126.net',
  '126.net',
  // QQ 音乐(vkey 流媒体 sip 主机在 qq.com 下)
  'qq.com',
  // 酷狗(音频与图片 CDN)
  'kugou.com',
  'kgimg.com',
  'kglink.cn'
]

function isAllowedProxyTarget(u: string): boolean {
  if (!isHttpUrl(u)) return false
  try {
    const h = new URL(u).hostname.toLowerCase()
    return PROXY_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s))
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
      if (!isAllowedProxyTarget(target)) return new Response('bad url', { status: 400 })
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
      if (!isAllowedProxyTarget(target)) return new Response('bad url', { status: 400 })
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

/**
 * bmedia://local 可读取的路径白名单(主进程侧维护,渲染层无法注入):
 * 1) 播放缓存目录 2) 下载目录 3) prepareAudio 播放过的本地歌曲 4) 库中登记的本地歌曲。
 * 不再按扩展名放行全盘文件。
 */
const allowedLocalPaths = new Set<string>()

function registerLocalPath(p: string): void {
  try {
    allowedLocalPaths.add(resolve(p))
  } catch {
    /* 非法路径忽略 */
  }
}

function isLocalPathAllowed(rp: string): boolean {
  if (cacheDir !== '' && (rp === cacheDir || rp.startsWith(cacheDir + sep))) return true
  const dl = getStore().settings.downloadDir
  if (dl) {
    const rdl = resolve(dl)
    if (rp === rdl || rp.startsWith(rdl + sep)) return true
  }
  if (allowedLocalPaths.has(rp)) return true
  // 库中登记的本地歌曲(含历史会话/恢复备份进来的)
  for (const s of Object.values(getStore().songs)) {
    if (s.source === 'LOCAL' && s.localPath && resolve(s.localPath) === rp) return true
  }
  return false
}

function serveLocalFile(p: string, req: Request): Response {
  const rp = resolve(p)
  if (!isLocalPathAllowed(rp)) {
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
    let start = 0
    let end = total - 1
    if (m && m[1] === '' && m[2]) {
      // suffix range(bytes=-N):取末尾 N 字节,而不是开头
      const n = Math.min(parseInt(m[2], 10) || 0, total)
      start = total - n
    } else {
      if (m && m[1]) start = parseInt(m[1], 10)
      if (m && m[2]) end = parseInt(m[2], 10)
      if (isNaN(start)) start = 0
      if (isNaN(end) || end >= total) end = total - 1
      if (start > end) start = 0
    }
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

/** 音频加载进度回调(ipc 层转发到渲染层,全屏播放页展示进度) */
export type AudioProgressFn = (p: {
  stage: 'resolving' | 'downloading' | 'done'
  received?: number
  total?: number
}) => void

function downloadToCache(
  url: string,
  cachePath: string,
  referer: string,
  onProgress?: (received: number, total: number) => void,
  signal?: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: referer
      },
      // 支持被新播放请求取消:中止时 fetch/reader 会抛 AbortError
      signal
    })
      .then((resp) => {
        const body = resp.body
        if (!resp.ok || !body) {
          resolve(false)
          return
        }
        const total = Number(resp.headers.get('content-length') ?? 0)
        const writer = createWriteStream(cachePath)
        // finish/error 监听器必须在 end() 之前挂上,否则 end 后立刻出错时 Promise 永不 settle
        writer.on('finish', () => resolve(true))
        writer.on('error', () => resolve(false))
        ;(async () => {
          const reader = body.getReader()
          let received = 0
          let lastReport = 0
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              received += value.byteLength
              // 进度节流 200ms,避免 IPC 风暴
              const now = Date.now()
              if (onProgress && now - lastReport > 200) {
                lastReport = now
                onProgress(received, total)
              }
            if (!writer.write(Buffer.from(value))) {
              await new Promise<void>((r) => writer.once('drain', r))
            }
            }
            if (onProgress) onProgress(received, total)
            writer.end()
          } catch {
            writer.destroy()
            // 中断/网络错误:删掉半截文件,否则下次启动会把它当成有效缓存命中
            try {
              if (existsSync(cachePath)) unlinkSync(cachePath)
            } catch {
              /* 删除失败不影响返回 */
            }
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
/** QQ vkey / 酷狗直链同样带签名过期,统一 8 分钟 TTL */
const STREAM_URL_TTL_MS = 8 * 60 * 1000
const qqUrlCache = new Map<string, { url: string; quality: string; at: number }>()
const kgUrlCache = new Map<string, { url: string; quality: string; at: number }>()

/** 直链缓存条目上限:超过时淘汰最早的(键按插入序,基本等价于最旧) */
const URL_CACHE_MAX = 100

function cachePut(
  m: Map<string, { url: string; quality: string; at: number }>,
  key: string,
  value: { url: string; quality: string; at: number }
): void {
  if (m.size >= URL_CACHE_MAX) {
    const oldest = m.keys().next().value
    if (oldest !== undefined) m.delete(oldest)
  }
  m.set(key, value)
}

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

/**
 * 同一时刻只保留最新的取流任务。
 * 用户快速连点不同歌曲时,新请求会 abort 上一个还没完成的下载,
 * 避免旧歌的几百 MB 缓存下载一直占着带宽、拖慢新歌。
 * 被取消的任务会抛 AbortError,渲染层凭自己的请求序号判定为"已过期"而静默丢弃。
 */
let currentAbort: AbortController | null = null

export async function prepareAudio(
  song: Song,
  html5Fallback = false,
  neteaseQuality = 'exhigh',
  onProgress?: AudioProgressFn
): Promise<PreparedAudio> {
  // 抢占:取消上一个仍在进行的取流
  currentAbort?.abort()
  const ac = new AbortController()
  currentAbort = ac
  const signal = ac.signal

  try {
    return await prepareAudioInner(song, html5Fallback, neteaseQuality, onProgress, signal)
  } finally {
    // 只有自己仍是最新任务时才清空,避免把后来者的 controller 抹掉
    if (currentAbort === ac) currentAbort = null
  }
}

async function prepareAudioInner(
  song: Song,
  html5Fallback: boolean,
  neteaseQuality: string,
  onProgress: AudioProgressFn | undefined,
  signal: AbortSignal
): Promise<PreparedAudio> {
  if (song.source === 'LOCAL' && song.localPath && existsSync(song.localPath)) {
    // 播放即登记:bmedia://local 只放行登记过的本地路径
    registerLocalPath(song.localPath)
    return {
      url: `bmedia://local/?path=${encodeURIComponent(song.localPath)}`,
      cachePath: song.localPath,
      quality: '本地文件'
    }
  }

  if (song.source === 'NETEASE' && song.neteaseId) {
    onProgress?.({ stage: 'resolving' })
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
      if (direct) cachePut(neteaseUrlCache, cacheKey, { url: direct, quality, at: Date.now() })
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

  // QQ 音乐:平台原生音源(vkey 直链,免费/试听曲目可用;VIP 专享抛错交由渲染层垫底)
  if (song.source === 'QQMUSIC' && song.qqMid) {
    onProgress?.({ stage: 'resolving' })
    const cacheKey = `qq:${song.qqMid}`
    const hit = qqUrlCache.get(cacheKey)
    const fresh = hit && Date.now() - hit.at < STREAM_URL_TTL_MS ? hit : null
    let info = fresh ? { url: fresh.url, quality: fresh.quality } : null
    if (!info) {
      if (hit) qqUrlCache.delete(cacheKey)
      info = await getQqSongUrl(song.qqMid)
      if (info) cachePut(qqUrlCache, cacheKey, { ...info, at: Date.now() })
    }
    if (info) {
      return {
        url: `bmedia://proxy/?url=${encodeURIComponent(info.url)}&referer=${encodeURIComponent('https://y.qq.com/')}`,
        quality: info.quality
      }
    }
    throw new Error('qq-no-source')
  }

  // 酷狗:平台原生音源(免费曲目直链;VIP 专享抛错交由渲染层垫底)
  if (song.source === 'KUGOU' && song.kugouHash) {
    onProgress?.({ stage: 'resolving' })
    const cacheKey = `kg:${song.kugouHash}`
    const hit = kgUrlCache.get(cacheKey)
    const fresh = hit && Date.now() - hit.at < STREAM_URL_TTL_MS ? hit : null
    let info = fresh ? { url: fresh.url, quality: fresh.quality } : null
    if (!info) {
      if (hit) kgUrlCache.delete(cacheKey)
      info = await getKugouSongUrl(song.kugouHash)
      if (info) cachePut(kgUrlCache, cacheKey, { ...info, at: Date.now() })
    }
    if (info) {
      return {
        url: `bmedia://proxy/?url=${encodeURIComponent(info.url)}&referer=${encodeURIComponent('https://www.kugou.com/')}`,
        quality: info.quality
      }
    }
    throw new Error('kugou-no-source')
  }

  if (song.source === 'BILIBILI' && song.bvid) {
    const bvid = bvidFromSongId(song.bvid || song.id)
    const page = song.page || pageFromSongId(song.id)
    onProgress?.({ stage: 'resolving' })
    const cid = await getCidForPage(bvid, page)
    if (cid <= 0) throw new Error('no-cid')
    const suffix = page > 1 ? `_p${page}` : ''
    const ext = html5Fallback ? 'mp4' : 'm4s'
    const cachePath = join(cacheDir, `${bvid}${suffix}.${ext}`)
    if (existsSync(cachePath) && statSync(cachePath).size > 10240) {
      onProgress?.({ stage: 'done' })
      return {
        url: `bmedia://local/?path=${encodeURIComponent(cachePath)}`,
        cachePath,
        quality: ext === 'mp4' ? '标准 128k' : 'B站音频'
      }
    }
    const resolved = await resolvePlayUrl(bvid, cid, { preferHtml5: html5Fallback })
    if (!resolved) throw new Error('no-audio-url')
    // 取消后立刻退出:不再落到下面的"边播边代理",那样旧歌仍会占着流
    if (signal.aborted) throw new Error('aborted')
    const ok = await downloadToCache(
      resolved.url,
      cachePath,
      'https://www.bilibili.com/',
      (received, total) => onProgress?.({ stage: 'downloading', received, total }),
      signal
    )
    if (signal.aborted) throw new Error('aborted')
    if (ok && existsSync(cachePath) && statSync(cachePath).size > 10240) {
      onProgress?.({ stage: 'done' })
      return {
        url: `bmedia://local/?path=${encodeURIComponent(cachePath)}`,
        cachePath,
        quality: resolved.quality
      }
    }
    // 下载失败 → 边播边代理
    onProgress?.({ stage: 'done' })
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
