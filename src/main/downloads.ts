/** 下载引擎:队列 + 并发控制 + 进度推送 */
import { BrowserWindow, app } from 'electron'
import {
  createWriteStream,
  copyFileSync,
  mkdirSync,
  existsSync,
  statSync,
  renameSync,
  unlinkSync
} from 'fs'
import { join } from 'path'
import type { DownloadRecord, Song } from '@shared/types'
import { resolvePlayUrl, getCidForPage, bvidFromSongId, pageFromSongId, searchVideos } from './api/bilibili'
import { getSongUrl } from './api/netease'
import { getStore, addDownloadRecord, removeDownloadRecord } from './store'

const queue: DownloadRecord[] = []
let active = 0
const MAX_CONCURRENT = 3
/** 已请求取消的任务 id */
const cancelRequested = new Set<string>()

function broadcast(record: DownloadRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dl:update', record)
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
}

async function resolveDownloadUrl(
  song: Song
): Promise<{ url: string; referer: string; ext: string } | null> {
  if (song.source === 'NETEASE' && song.neteaseId) {
    // 使用设置中的音质(与在线播放保持一致),而非固定 exhigh
    const info = await getSongUrl(song.neteaseId, getStore().settings.neteaseQuality)
    if (!info.url) return null
    const ext = info.type || 'mp3'
    return { url: info.url, referer: 'https://music.163.com', ext }
  }
  // QQ/酷狗:无直连音源 → 按「标题 歌手」搜B站,取时长最接近的视频取流
  if ((song.source === 'QQMUSIC' || song.source === 'KUGOU') && !song.neteaseId) {
    const results = await searchVideos(`${song.title} ${song.artist}`, 1, 'totalrank')
    if (results.length === 0) return null
    const picked =
      song.duration > 0
        ? results.reduce((a, b) =>
            Math.abs(b.duration - song.duration) < Math.abs(a.duration - song.duration) ? b : a
          )
        : results[0]
    return await resolveDownloadUrl(picked)
  }
  if (song.source === 'BILIBILI' && song.bvid) {
    const bvid = bvidFromSongId(song.bvid || song.id)
    const page = song.page || pageFromSongId(song.id)
    const cid = await getCidForPage(bvid, page)
    if (cid <= 0) return null
    // 优先 DASH 纯音频(文件小)
    const resolved = await resolvePlayUrl(bvid, cid)
    if (!resolved) return null
    const ext = resolved.fragmented ? 'm4a' : 'mp4'
    return { url: resolved.url, referer: 'https://www.bilibili.com/', ext }
  }
  // LOCAL 无远程地址:由 processOne 直接复制文件,不走网络下载
  return null
}

function downloadFile(
  url: string,
  referer: string,
  dest: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {})
      }
    })
      .then(async (resp) => {
        if (!resp.ok || !resp.body) {
          reject(new Error(`HTTP ${resp.status}`))
          return
        }
        const total = parseInt(resp.headers.get('content-length') ?? '0', 10)
        const writer = createWriteStream(dest)
        const reader = resp.body.getReader()
        let received = 0
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            received += value.byteLength
            if (!writer.write(Buffer.from(value))) {
              await new Promise<void>((r) => writer.once('drain', r))
            }
            onProgress(received, total)
          }
          writer.end()
          writer.on('finish', () => resolve())
          writer.on('error', (e) => reject(e))
        } catch (e) {
          writer.destroy()
          reject(e)
        }
      })
      .catch(reject)
  })
}

/** 解析下载目录(设置缺失时兜底到系统音乐目录,避免相对路径落盘) */
function downloadDir(): string {
  const dir = getStore().settings.downloadDir
  if (dir) return dir
  try {
    return join(app.getPath('music'), 'BiliMusic')
  } catch {
    return join(app.getPath('downloads'), 'BiliMusic')
  }
}

async function processOne(record: DownloadRecord): Promise<void> {
  const dir = downloadDir()
  let tmpPath = ''
  try {
    mkdirSync(dir, { recursive: true })
    const song = record.song
    if (song.source === 'LOCAL' && song.localPath) {
      // 本地歌曲:直接复制到下载目录(不再走网络)
      if (!existsSync(song.localPath)) throw new Error('本地文件不存在')
      const ext = song.localPath.split('.').pop() ?? 'mp3'
      const finalPath = join(dir, sanitizeFileName(`${song.title} - ${song.artist}.${ext}`))
      tmpPath = `${finalPath}.part`
      record.received = 0
      record.total = statSync(song.localPath).size
      record.status = 'downloading'
      broadcast({ ...record })
      copyFileSync(song.localPath, tmpPath)
      if (existsSync(finalPath)) unlinkSync(finalPath)
      renameSync(tmpPath, finalPath)
      record.status = 'completed'
      record.filePath = finalPath
      record.received = statSync(finalPath).size
    } else {
      const resolved = await resolveDownloadUrl(song)
      if (!resolved) throw new Error('无法获取音频地址')
      const name = sanitizeFileName(`${song.title} - ${song.artist}.${resolved.ext}`)
      const finalPath = join(dir, name)
      tmpPath = `${finalPath}.part`
      let lastEmit = 0
      await downloadFile(resolved.url, resolved.referer, tmpPath, (received, total) => {
        if (cancelRequested.has(record.id)) throw new Error('__CANCELLED__')
        record.received = received
        record.total = total
        record.status = 'downloading'
        const now = Date.now()
        if (now - lastEmit > 300) {
          lastEmit = now
          broadcast({ ...record })
        }
      })
      if (existsSync(finalPath)) unlinkSync(finalPath)
      renameSync(tmpPath, finalPath)
      record.status = 'completed'
      record.filePath = finalPath
      record.received = existsSync(finalPath) ? statSync(finalPath).size : record.received
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === '__CANCELLED__' || cancelRequested.has(record.id)) {
      // 取消:清理本次任务的临时文件(与任务同名,含扩展名)并移除记录
      cancelRequested.delete(record.id)
      try {
        if (tmpPath && existsSync(tmpPath)) unlinkSync(tmpPath)
      } catch (err) {
        console.warn('[Download] cleanup part file failed', err)
      }
      removeDownloadRecord(record.id)
      // 与 pending 取消一致:通知渲染层移除该行,而非留下"已取消"错误行
      broadcast({
        id: record.id,
        song: record.song,
        status: 'error',
        received: 0,
        total: 0,
        createdAt: record.createdAt,
        __removed: true
      } as unknown as DownloadRecord)
      return
    }
    record.status = 'error'
    record.error = msg
  }
  addDownloadRecord({ ...record })
  broadcast({ ...record })
}

async function pump(): Promise<void> {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const record = queue.shift()
    if (!record) break
    active++
    processOne(record)
      .catch((e) => console.error('[Download] task error', e))
      .finally(() => {
        active--
        pump()
      })
  }
}

/** 移除单条下载记录并通知渲染层(完成/失败后的删除) */
export function removeDownload(id: string): void {
  removeDownloadRecord(id)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(
      'dl:update',
      { id, song: { id: '' }, status: 'error', received: 0, total: 0, createdAt: 0, __removed: true } as unknown as DownloadRecord
    )
  }
}

/** 取消下载:pending 从队列移除,downloading 中断并删除记录 */
export function cancelDownload(id: string): void {
  cancelRequested.add(id)
  const qi = queue.findIndex((r) => r.id === id)
  if (qi >= 0) {
    queue.splice(qi, 1)
    cancelRequested.delete(id)
    removeDownload(id)
  }
}

export function enqueueDownload(songs: Song[]): void {
  const activeIds = new Set(
    getStore()
      .downloads.filter((d) => d.status === 'pending' || d.status === 'downloading')
      .map((d) => d.song.id)
  )
  const seen = new Set<string>()
  for (const song of songs) {
    // 已在下载中/队列中(含同一批次内重复)的跳过
    if (activeIds.has(song.id) || seen.has(song.id)) continue
    seen.add(song.id)
    const record: DownloadRecord = {
      id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      song,
      status: 'pending',
      received: 0,
      total: 0,
      createdAt: Date.now()
    }
    addDownloadRecord({ ...record })
    broadcast({ ...record })
    queue.push(record)
  }
  pump()
}

/** 恢复上次未完成的任务状态为 error(应用启动时调用) */
export function finalizeStaleDownloads(): void {
  const { downloads } = getStore()
  for (const d of downloads) {
    if (d.status === 'pending' || d.status === 'downloading') {
      d.status = 'error'
      d.error = '应用重启,任务中断'
      addDownloadRecord({ ...d })
    }
  }
}
