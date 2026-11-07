/**
 * 汽水音乐(字节)音源 —— 协议由 npm 包 qishui-music-api 承载(移植自 folia,AGPL-3.0)。
 * 本文件只做三件事:
 *   1. 会话持久化(凭据存 library.json;与其它平台凭据同一安全级别);
 *   2. createQishuiApi 桥(请求走 Electron fetch 且不带浏览器会话 cookie);
 *   3. 实体归一化:track → 本项目 Song(含 display_info 封面),collection → 歌单摘要。
 */
import { createQishuiApi, createQishuiDeviceId, QISHUI_OPERATIONS, isQishuiDeviceId, type QishuiApi, type QishuiSession } from 'qishui-music-api'
import type { Song, LyricLine } from '@shared/types'
import { getStore, saveStore } from '../store'

const SESSION_KEY = 'qishuiSession'
const DEVICE_KEY = 'qishuiDeviceId'

/** 包要求的同步会话库:get/set/clear + revision;凭据存 store(JSON) */
function createSessionStore() {
  let current: QishuiSession | null = null
  let loaded = false
  let revision = 0
  const store = () => getStore() as unknown as Record<string, unknown>
  return {
    get revision() {
      return revision
    },
    // 惰性生成:模块加载早于 initStore(),此时落盘会静默丢失,导致每次重启换 deviceId、登录态失效。
    // 兜底:已存会话对象自带登录时的 deviceId,优先从那里恢复,避免旧存档掉登录。
    get deviceId(): string {
      const saved = store()[DEVICE_KEY]
      if (isQishuiDeviceId(saved)) return saved
      const sess = current ?? this.get()
      const recovered = sess && isQishuiDeviceId(sess.deviceId) ? sess.deviceId : null
      const fresh = recovered ?? createQishuiDeviceId()
      store()[DEVICE_KEY] = fresh
      saveStore()
      return fresh
    },
    get(): QishuiSession | null {
      if (!loaded) {
        loaded = true
        try {
          const raw = store()[SESSION_KEY]
          if (typeof raw === 'string') current = JSON.parse(raw) as QishuiSession
        } catch {
          current = null
        }
      }
      return current
    },
    set(session: QishuiSession): void {
      loaded = true
      current = { ...session, version: 1 }
      revision++
      store()[SESSION_KEY] = JSON.stringify(current)
      // 会话与设备指纹绑定:登录时把会话自带的 deviceId 一并固化,重启后不再掉登录
      if (isQishuiDeviceId(session.deviceId)) store()[DEVICE_KEY] = session.deviceId
      saveStore()
    },
    clear(): void {
      loaded = true
      current = null
      revision++
      delete store()[SESSION_KEY]
      saveStore()
    }
  }
}

const sessions = createSessionStore()

/** 请求统一 omit 凭据:账号由包自己的 header 携带,避免 Electron net.fetch 混入浏览器 cookie */
const withoutCookies = (fetch: typeof globalThis.fetch | undefined) =>
  fetch
    ? ((input: string | Request | URL, options: RequestInit = {}) =>
        fetch(input, { ...options, credentials: 'omit' }))
    : fetch

// api 实例惰性创建:deviceId 的持久化依赖 store 初始化完成(见 createSessionStore 注释)
let apiInstance: QishuiApi | null = null
function ensureApi(): QishuiApi {
  if (!apiInstance) {
    apiInstance = createQishuiApi({
      deviceId: sessions.deviceId,
      sessions,
      fetch: withoutCookies(globalThis.fetch)
    })
  }
  return apiInstance
}

export function isQishuiOperation(operation: string): boolean {
  return (QISHUI_OPERATIONS as readonly string[]).includes(operation)
}

/** 透传一个白名单内的操作(登录/二维码/歌单/点赞等由渲染层直接用) */
export async function qishuiRequest<T = unknown>(
  operation: string,
  params: Record<string, unknown> = {}
): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }> {
  if (!isQishuiOperation(operation)) {
    return { ok: false, error: { code: 'unsupported', message: '不支持的汽水操作' } }
  }
  try {
    const api = ensureApi()
    const result = await api.request<T>(operation as Parameters<typeof api.request>[0], params as never)
    return result
  } catch (e) {
    console.warn('[Qishui] request failed', operation, e)
    return { ok: false, error: { code: 'invalid-response', message: '汽水请求失败' } }
  }
}

/* ===================== 实体归一化(移植自 folia qishuiNormalize) ===================== */

type Rec = Record<string, any>
const rec = (raw: unknown): Rec => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Rec) : {})
const text = (value: unknown) => (value == null ? '' : String(value))

/** display_info.cover_url / base.url_avatar → https 图片地址 */
function qishuiImage(raw: unknown): string {
  if (typeof raw === 'string') return raw.startsWith('https://') ? raw : ''
  const value = rec(raw)
  const url = Array.isArray(value.urls)
    ? (value.urls as unknown[]).find((item) => typeof item === 'string' && item.startsWith('https://'))
    : ''
  if (!url) return ''
  return value.uri && (url as string).endsWith('/')
    ? `${url}${value.uri}${value.template_prefix ? `~${value.template_prefix}-image.image` : ''}`
    : (url as string)
}

/** 汽水 track 实体 → Song(id 形如 qishui-<64位数字>) */
export function songFromQishui(raw: unknown): Song | null {
  try {
    const song = rec(raw)
    const track = song.track_entity ?? song
    const base = rec(track.base_info)
    const id = text(base.id || track.id)
    if (!/^\d+$/.test(id)) return null
    const related = rec(track.related_info)
    const album = rec(related.album_link)
    const artists = Array.isArray(related.artist_links)
      ? related.artist_links
      : rec(base.song_maker_team).composers || []
    return {
      id: `qishui-${id}`,
      title: text(base.name) || '未知',
      artist:
        (Array.isArray(artists) ? artists : [])
          .map((a: Rec) => text(a.name))
          .filter(Boolean)
          .join(' / ') || '未知',
      album: text(album.name),
      coverUrl: qishuiImage(rec(track.display_info).cover_url) || null,
      duration: Math.max(0, Math.round(Number(base.duration_ms) || 0) / 1000),
      source: 'QISHUI',
      page: 1,
      qishuiId: id,
      addedAt: Date.now()
    }
  } catch {
    return null
  }
}

/** 汽水歌单实体 → {id, name, coverUrl, trackCount, ownerId} */
export function playlistFromQishui(raw: unknown): {
  id: string
  name: string
  coverUrl: string | null
  trackCount?: number
  ownerId?: string
} | null {
  try {
    const item = rec(raw)
    const base = rec(item.base_info)
    if (!base.id) return null
    const owner = rec(rec(item.relation_info).owner)
    return {
      id: text(base.id),
      name: text(base.title || base.name) || '未命名歌单',
      coverUrl: qishuiImage(rec(item.display_info).url_cover) || null,
      trackCount: item.resource_cnt?.track_cnt == null ? undefined : Number(item.resource_cnt.track_cnt),
      ownerId: text(base.owner_id || owner.id) || undefined
    }
  } catch {
    return null
  }
}

/** 搜索歌曲(标题/歌手/时长齐全,可直接入队播放) */
export async function searchSongs(keyword: string, limit = 30, offset = 0): Promise<Song[]> {
  const r = await qishuiRequest<{ items?: unknown[] }>('search', {
    query: keyword,
    limit,
    offset
  })
  if (!r.ok) return []
  return ((r.data.items ?? []) as unknown[]).map(songFromQishui).filter((s): s is Song => s !== null)
}

/** 拉取歌单曲目(分页;汽水歌单详情页用) */
export async function getPlaylistTracks(
  id: string,
  limit = 50,
  offset = 0,
  ownerId?: string
): Promise<{ songs: Song[]; hasMore: boolean }> {
  const r = await qishuiRequest<{ items?: unknown[]; hasMore?: boolean }>('playlist_tracks', {
    id: String(id),
    limit,
    offset,
    ...(ownerId ? { ownerId } : {})
  })
  if (!r.ok) return { songs: [], hasMore: false }
  return {
    songs: ((r.data.items ?? []) as unknown[]).map(songFromQishui).filter((s): s is Song => s !== null),
    hasMore: !!r.data.hasMore
  }
}

/** 当前登录用户(未登录返回 null) */
export async function getAccount(): Promise<{
  userId: string
  nickname: string
  avatar: string
} | null> {
  try {
    const r = await qishuiRequest<unknown>('login_status')
    if (!r.ok || !r.data) return null
    const user = rec(r.data)
    if (!user.id) return null
    return { userId: text(user.id), nickname: text(user.nickname), avatar: qishuiImage(user.avatar) }
  } catch {
    return null
  }
}

/** 取一首歌的明文音频地址(播放用;preview=true 表示 VIP 试听片段) */
export async function getAudioUrl(
  trackId: string
): Promise<{ url: string; quality: string; preview: boolean } | null> {
  const r = await qishuiRequest<{ url?: string; quality?: string; preview?: boolean }>('audio', {
    id: String(trackId),
    quality: 'standard'
  })
  if (!r.ok || !r.data?.url) return null
  return {
    url: r.data.url,
    quality: r.data.quality ?? 'standard',
    preview: !!r.data.preview
  }
}

/** 用户歌单列表(登录后;映射为通用 OnlineBrief 形状) */
export async function getUserPlaylists(limit = 50): Promise<
  { id: string; name: string; coverUrl?: string; count: number }[]
> {
  const r = await qishuiRequest<{ items?: unknown[] }>('user_playlists', { limit, offset: 0 })
  if (!r.ok) return []
  const out: { id: string; name: string; coverUrl?: string; count: number }[] = []
  for (const item of (r.data.items ?? []) as unknown[]) {
    const pl = playlistFromQishui(item)
    if (pl && pl.id) out.push({ id: pl.id, name: pl.name, coverUrl: pl.coverUrl ?? undefined, count: pl.trackCount ?? 0 })
  }
  return out
}

/** 导入汽水歌单:拉全量曲目 → upsert → 返回给 ipc 建本地歌单 */
export async function importPlaylistTracks(id: string): Promise<Song[]> {
  const songs: Song[] = []
  for (let offset = 0; offset < 2000; offset += 50) {
    const page = await getPlaylistTracks(id, 50, offset)
    songs.push(...page.songs)
    if (!page.hasMore || page.songs.length === 0) break
  }
  return songs
}

/** 搜索推荐:协议无联想接口,用真实搜索前 5 条作联想词 */
export async function searchSuggest(keyword: string): Promise<string[]> {
  try {
    const songs = await searchSongs(keyword, 5)
    return songs.map((sg) => `${sg.title} - ${sg.artist}`)
  } catch {
    return []
  }
}

/** 汽水歌词:lyric_entity.content 为 [行起点,行时长]<字起点,字时长,0>字 的逐字格式 */
export async function getLyrics(trackId: string): Promise<LyricLine[]> {
  try {
    const r = await qishuiRequest<{ lyric_entity?: { content?: string } }>('lyrics', {
      id: String(trackId)
    })
    const content = r.ok ? (r.data?.lyric_entity?.content ?? '') : ''
    if (!content) return []
    const lines: LyricLine[] = []
    for (const raw of content.split('\n')) {
      const lm = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim())
      if (!lm) continue
      const lineStart = Number(lm[1])
      const body = lm[3]
      let text = ''
      const wordTimes: number[] = []
      const re = /<(\d+),(\d+),\d+>([^<]*)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(body))) {
        const wordStart = lineStart + Number(m[1])
        for (const ch of m[3]) {
          if (ch.trim()) wordTimes.push(wordStart)
          text += ch
        }
      }
      const trimmed = text.trim()
      if (!trimmed) continue
      lines.push({ timeMs: lineStart, text: trimmed, wordTimes })
    }
    return lines
  } catch {
    return []
  }
}
