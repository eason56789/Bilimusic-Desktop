/** 歌词获取与解析(B站AI字幕 / 网易云LRC+YRC) */
import type { Song, LyricLine, LyricsResult } from '@shared/types'
import {
  getCidForPage,
  bvidFromSongId,
  pageFromSongId,
  getVideoSubtitles,
  fetchSubtitleContent
} from './bilibili'
import { getLyricNew, searchSongs } from './netease'

/** 解析 LRC 文本 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const matches = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)]
    if (matches.length === 0) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const m of matches) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracRaw = m[3] ?? '0'
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length)
      lines.push({ timeMs: Math.round((min * 60 + sec + frac) * 1000), text })
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * 解析网易云 YRC(逐字歌词)
 * 行格式: [start,dur](wordStart,wordDur,0)word(wordStart,wordDur,0)word...
 */
export function parseYrc(yrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of yrc.split(/\r?\n/)) {
    const head = raw.match(/^\[(\d+),(\d+)\]/)
    if (!head) continue
    const start = parseInt(head[1], 10)
    const body = raw.replace(/^\[(\d+),(\d+)\]/, '')
    const words: { text: string; timeMs: number }[] = []
    const re = /\((\d+),(\d+),\d+\)([^(]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      const wStart = parseInt(m[1], 10)
      const wText = m[3]
      if (!wText) continue
      words.push({ timeMs: wStart, text: wText })
    }
    const text = words.map((w) => w.text).join('').trim()
    if (!text) continue
    lines.push({
      timeMs: start,
      text,
      wordTimes: words.map((w) => w.timeMs),
      words
    })
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

const lyricCache = new Map<string, LyricsResult>()

/**
 * 剥离行首行尾的音乐装饰符号(♪ ♫ ♬ ♩ 🎵 🎶 等),
 * B站AI字幕/部分LRC会给每句前后包一层这类符号。
 * 若剥离后为空(整行只有符号),保留原文。
 */
function stripEdgeDecor(text: string): string {
  const t = text
    .replace(/^[\s♪♫♬♩🎵🎶]+/, '')
    .replace(/[\s♪♫♬♩🎵🎶]+$/, '')
    .trim()
  return t.length > 0 ? t : text
}

function stripLines(lines: LyricLine[]): LyricLine[] {
  // 有逐字时间的行(网易YRC)不清洗,避免与 words 数组错位
  return lines.map((l) => (l.words && l.words.length > 0 ? l : { ...l, text: stripEdgeDecor(l.text) }))
}

/**
 * 把网易云翻译(tlyric)按时间对齐合并进主歌词。
 * tlyric 与 lrc/yrc 的时间戳基本一一对应,少数行会差几十毫秒,
 * 因此用「就近 500ms 内匹配」而不是严格相等。
 */
function mergeTranslation(lines: LyricLine[], tlyric: string): LyricLine[] {
  if (!tlyric || lines.length === 0) return lines
  const trans = parseLrc(tlyric)
  if (trans.length === 0) return lines
  const idx = new Map<number, string>()
  for (const t of trans) idx.set(t.timeMs, t.text)
  const keys = [...idx.keys()].sort((a, b) => a - b)
  const nearest = (ms: number): string | undefined => {
    let best: number | null = null
    for (const k of keys) {
      if (best === null || Math.abs(k - ms) < Math.abs(best - ms)) best = k
      if (k > ms + 500) break
    }
    return best !== null && Math.abs(best - ms) <= 500 ? idx.get(best) : undefined
  }
  return lines.map((l) => {
    const t = nearest(l.timeMs)
    return t && t !== l.text ? { ...l, trans: t } : l
  })
}

export async function getLyrics(song: Song): Promise<LyricsResult> {
  const cached = lyricCache.get(song.id)
  if (cached) return cached
  let result: LyricsResult = { lines: [], provider: 'none' }
  try {
    // 有 neteaseId 优先取网易云歌词(垫底/换源后的 B站流歌曲,标题元数据仍是原曲)
    if (song.neteaseId) {
      const ly = await getLyricNew(song.neteaseId)
      let lines = ly.yrc ? parseYrc(ly.yrc) : []
      if (lines.length === 0) lines = parseLrc(ly.lrc ?? '')
      if (lines.length > 0) {
        lines = stripLines(lines)
        if (ly.tlyric) lines = mergeTranslation(lines, ly.tlyric)
        result = { lines, provider: 'netease', title: song.title }
      }
    } else if (song.source === 'QQMUSIC' || song.source === 'KUGOU') {
      // QQ/酷狗无自建歌词:按「标题 歌手」到网易云搜索,取最接近的一首的歌词
      try {
        const r = await searchSongs(`${song.title} ${song.artist}`, 5, 0)
        const cand =
          r.songs.find((s) => s.artist && song.artist && s.artist.includes(song.artist.split(' / ')[0])) ??
          r.songs[0]
        if (cand?.neteaseId) {
          const ly = await getLyricNew(cand.neteaseId)
          let lines = ly.yrc ? parseYrc(ly.yrc) : []
          if (lines.length === 0) lines = parseLrc(ly.lrc ?? '')
          if (lines.length > 0) {
            lines = stripLines(lines)
            if (ly.tlyric) lines = mergeTranslation(lines, ly.tlyric)
            result = { lines, provider: 'netease', title: song.title }
          }
        }
      } catch (e) {
        console.warn('[Lyrics] qq/kugou netease search failed', e)
      }
    } else if (song.source === 'BILIBILI' && song.bvid) {
      const bvid = bvidFromSongId(song.bvid || song.id)
      const page = song.page || pageFromSongId(song.id)
      const cid = await getCidForPage(bvid, page)
      if (cid > 0) {
        const subs = await getVideoSubtitles(bvid, cid)
        // 优先中文字幕,AI 字幕其次
        const pick =
          subs.find((s) => s.lan?.startsWith('zh')) ?? subs.find((s) => s.type === 1) ?? subs[0]
        if (pick) {
          const lines = await fetchSubtitleContent(pick.subtitle_url)
          if (lines.length > 0)
            result = {
              lines: stripLines(lines.map((l) => ({ timeMs: l.timeMs, text: l.text }))),
              provider: 'bilibili',
              title: song.title
            }
        }
      }
    }
  } catch (e) {
    console.error('[Lyrics] error', e)
  }
  lyricCache.set(song.id, result)
  if (lyricCache.size > 200) {
    const first = lyricCache.keys().next().value
    if (first) lyricCache.delete(first)
  }
  return result
}
