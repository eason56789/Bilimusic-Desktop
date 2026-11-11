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
import { getQqRichLyrics, findQqRichLyrics } from './qqLyrics'
import { getLyrics as getQishuiLyrics } from './qishui'

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
 * 解析网易云 YRC(逐字歌词)。线上实际存在两种格式:
 *
 * A) 标准 YRC 文本(带逐字时间):
 *    [start,dur](wordStart,wordDur,0)word(wordStart,wordDur,0)word...
 *
 * B) 逐行 JSON(无逐字时间,只有整行时间):
 *    {"t":0,"c":[{"tx":"编曲: "},{"tx":"Alan Walker"}]}
 *   网易部分曲目(如 Faded 36990266)的 yrc 字段返回的是这种格式。
 *   此前只认 A,遇到 B 会解析出 0 行,而调用方"yrc 非空就不再回退 lrc",
 *   导致整首歌拿不到任何歌词。这里补上 B 的解析(无 wordTimes,走普通行渲染)。
 */
export function parseYrc(yrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of yrc.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    // 格式 B:整行是一个 JSON 对象
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as {
          t?: number
          c?: { tx?: string }[]
        }
        const text = (obj.c ?? [])
          .map((seg) => seg?.tx ?? '')
          .join('')
          .trim()
        if (!text || typeof obj.t !== 'number' || !isFinite(obj.t)) continue
        lines.push({ timeMs: obj.t, text })
      } catch {
        // 非法 JSON 行直接跳过,不影响其余行
      }
      continue
    }

    // 格式 A
    const head = trimmed.match(/^\[(\d+),(\d+)\]/)
    if (!head) continue
    const start = parseInt(head[1], 10)
    const body = trimmed.replace(/^\[(\d+),(\d+)\]/, '')
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

import { assessTimelineIssue } from './lyricSanity'
export { assessTimelineIssue }

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
 *
 * 对齐难点:主歌词可能来自 yrc(逐字精确时间),而 tlyric 跟的是 lrc 的行时间,
 * 两者可能整首存在恒定偏差(实测 Faded:yrc 11090 vs lrc 10420,差 670ms)。
 * 固定 500ms 容差会把大量行判为"无译文",放宽到 2s 又会把相邻句的译文配错。
 *
 * 做法:
 * 1) 先按「最近时间点」为每一行找候选译文,用较宽窗口(3s)收集偏差样本;
 * 2) 取偏差的**中位数**作为整首的时间基准偏移(抗离群,不受个别错配影响);
 * 3) 用「基准偏移 + 1s 容差」重新就近匹配,只接受落在这个窗口里的译文。
 * 偏移恒定的情况下能把整体平移吸收掉;偏移本就为 0 时,行为与原先一致。
 */
export function mergeTranslation(lines: LyricLine[], tlyric: string): LyricLine[] {
  if (!tlyric || lines.length === 0) return lines
  const trans = parseLrc(tlyric)
  if (trans.length === 0) return lines

  const keys = trans.map((t) => t.timeMs)
  const keyToText = new Map<number, string>()
  for (const t of trans) keyToText.set(t.timeMs, t.text)

  /** 在有序 keys 里找离 target 最近的时间点,返回 [key, 距离] */
  const nearestKey = (target: number): [number, number] => {
    let lo = 0
    let hi = keys.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (keys[mid] < target) lo = mid + 1
      else hi = mid
    }
    let bestKey = keys[lo]
    let bestD = Math.abs(bestKey - target)
    if (lo > 0 && Math.abs(keys[lo - 1] - target) < bestD) {
      bestKey = keys[lo - 1]
      bestD = Math.abs(keys[lo - 1] - target)
    }
    return [bestKey, bestD]
  }

  // ---- 1) 收集偏差样本:只取 3s 内、且译文与原文不同的配对 ----
  const diffs: number[] = []
  for (const l of lines) {
    const [k, d] = nearestKey(l.timeMs)
    if (d > 3000) continue
    const txt = (keyToText.get(k) ?? '').trim()
    if (!txt || txt === l.text.trim()) continue
    diffs.push(k - l.timeMs)
  }

  // ---- 2) 中位数偏移(样本太少则不修正,避免被个别行带偏) ----
  let offset = 0
  if (diffs.length >= Math.max(3, Math.floor(lines.length * 0.2))) {
    diffs.sort((a, b) => a - b)
    const med = diffs[Math.floor(diffs.length / 2)]
    // 只有偏移足够大(超过原容差)才启用,避免无谓扰动
    if (Math.abs(med) > 500) offset = med
  }

  // ---- 3) 按偏移重新对齐 ----
  const TOL = 1000
  return lines.map((l) => {
    const [k, d] = nearestKey(l.timeMs + offset)
    if (d > TOL) return l
    const txt = (keyToText.get(k) ?? '').trim()
    if (!txt || txt === l.text.trim()) return l
    return { ...l, trans: txt }
  })
}



/**
 * 从网易云返回里选出最合适的歌词行。
 * yrc 优先(带逐字,渲染为卡拉OK),但 yrc 解析失败或行数明显少于 lrc 时回退 lrc:
 * 线上 yrc 有 JSON 格式变体,历史上只认标准格式会导致整首无歌词。
 */
export function pickLines(ly: { yrc?: string; lrc?: string }): LyricLine[] {
  const fromYrc = ly.yrc ? parseYrc(ly.yrc) : []
  const fromLrc = parseLrc(ly.lrc ?? '')
  // yrc 有逐字数据才值得优先;行数不到 lrc 的六成说明 yrc 不完整(常见于只有元信息行)
  if (fromYrc.length > 0 && fromYrc.length >= fromLrc.length * 0.6) return fromYrc
  return fromLrc.length > 0 ? fromLrc : fromYrc
}

/** 一行是否带逐字时间(卡拉OK/PV 需要) */
const hasCharTiming = (l: LyricLine): boolean =>
  (Array.isArray(l.wordTimes) && l.wordTimes.length > 1) || (Array.isArray(l.words) && l.words.length > 1)

/** 歌词是否整体具备逐字能力(抽样判断,避免个别行缺数据就误判) */
export function hasRichTiming(lines: LyricLine[]): boolean {
  if (lines.length === 0) return false
  const sample = lines.filter((l) => l.text.trim().length > 1).slice(0, 12)
  if (sample.length === 0) return false
  const rich = sample.filter(hasCharTiming).length
  return rich >= Math.ceil(sample.length * 0.5)
}

/**
 * 逐字补齐:如果当前歌词没有逐字数据,按「QQ 原生 QRC → 网易云 yrc」找带逐字的版本。
 *
 * 用户的诉求是"任一平台拿不到逐字就去别的平台找,三家都没有才强制逐字"。
 * QQ 歌曲且 qqMid 已知时优先走 QQ 原生 QRC(逐字精度与原生一致,免去搜索匹配的错配风险),
 * 拿不到再按「标题 + 歌手」到网易云搜索并按行数/时间接近度挑最匹配的一首。
 */
async function enrichWithRichTiming(song: Song, lines: LyricLine[]): Promise<LyricLine[] | null> {
  if (hasRichTiming(lines)) return null

  // 来源 0:跨平台去 QQ 音乐找最匹配的一首(QQ 逐字覆盖最全,任何来源的歌都先试)
  if (!song.qqMid) {
    try {
      const cross = await findQqRichLyrics(song.title, song.artist, song.duration)
      if (
        cross &&
        cross.length > 0 &&
        hasRichTiming(cross) &&
        // 时间轴 sanity:末行明显超出/早于音频时长 = 拿错版本,不要
        !assessTimelineIssue(cross, song.duration) &&
        (lines.length === 0 || cross.length >= Math.max(4, lines.length * 0.5)) &&
        (lines.length === 0 || Math.abs(cross[0].timeMs - lines[0].timeMs) <= 20_000)
      ) {
        return stripLines(cross)
      }
    } catch (e) {
      console.warn('[Lyrics] qq cross-platform enrichment failed', e)
    }
  }

  // 来源 1:QQ 原生 QRC
  if (song.qqMid) {
    try {
      const qq = await getQqRichLyrics(song.qqMid, song.qqId)
      const rich = qq?.lines ?? []
      if (
        rich.length > 0 &&
        hasRichTiming(rich) &&
        // 行数太少说明 QRC 不完整,不值得替换
        (lines.length === 0 || rich.length >= Math.max(4, lines.length * 0.5)) &&
        // 首行时间差太大说明不是同一版本(现场版/remix)
        (lines.length === 0 || Math.abs(rich[0].timeMs - lines[0].timeMs) <= 20_000) &&
        // 精确 mid 拿到的 QRC 也过一遍时长印证:QRC 数据本身也可能异常
        !assessTimelineIssue(rich, song.duration)
      ) {
        return stripLines(rich)
      }
    } catch (e) {
      console.warn('[Lyrics] qq qrc enrichment failed', e)
    }
  }

  // 来源 2:网易云 yrc
  try {
    const r = await searchSongs(`${song.title} ${song.artist}`, 8, 0)
    if (!r.songs.length) return null
    // 优先同名;再按时长接近度排序(与播放中的音频对不上时间轴的候选没有价值)
    const ordered = [
      ...r.songs.filter((s) => s.title.trim() === song.title.trim()),
      ...r.songs.filter((s) => s.title.trim() !== song.title.trim())
    ]
      .filter((s) => s.neteaseId)
      .sort((a, b) => {
        const da = song.duration > 0 && a.duration > 0 ? Math.abs(a.duration - song.duration) : Number.MAX_SAFE_INTEGER
        const db = song.duration > 0 && b.duration > 0 ? Math.abs(b.duration - song.duration) : Number.MAX_SAFE_INTEGER
        return da - db
      })
    for (const cand of ordered.slice(0, 4)) {
      // 时长差过大:几乎不可能是同一录音(现场版/加长版/翻唱)
      if (song.duration > 0 && cand.duration > 0 && Math.abs(cand.duration - song.duration) > 15) continue
      const ly = await getLyricNew(cand.neteaseId as number)
      const rich = ly.yrc ? parseYrc(ly.yrc) : []
      if (rich.length === 0 || !hasRichTiming(rich)) continue
      // 行数太少说明 yrc 不完整,不值得替换
      if (rich.length < Math.max(4, lines.length * 0.5)) continue
      // 首行时间差太大说明不是同一版本(现场版/remix)
      if (lines.length > 0 && Math.abs(rich[0].timeMs - lines[0].timeMs) > 20_000) continue
      // 时间轴 sanity:末行超出/早于音频时长过多 = 拿错版本
      if (assessTimelineIssue(rich, song.duration)) continue
      const out = stripLines(rich)
      if (ly.tlyric) return mergeTranslation(out, ly.tlyric)
      return out
    }
  } catch (e) {
    console.warn('[Lyrics] rich-timing enrichment failed', e)
  }
  return null
}

export async function getLyrics(song: Song): Promise<LyricsResult> {
  const cached = lyricCache.get(song.id)
  if (cached) return cached
  let result: LyricsResult = { lines: [], provider: 'none' }
  try {
    // QQ 原生 QRC 逐字歌词:QQMUSIC 源且 mid 已知时最优先(逐字精度最好),
    // 失败/无 QRC 再走下方网易云兜底
    if (song.source === 'QQMUSIC' && song.qqMid) {
      const qq = await getQqRichLyrics(song.qqMid, song.qqId)
      if (qq && qq.lines.length > 0 && hasRichTiming(qq.lines)) {
        result = { lines: stripLines(qq.lines), provider: 'qq', title: song.title }
      }
    }
    // 汽水原生逐字歌词(QISHUI 源,逐字精度与 QQ QRC 同级)
    if (song.source === 'QISHUI' && song.qishuiId) {
      const qs = await getQishuiLyrics(song.qishuiId)
      if (qs.length > 0) {
        result = { lines: qs, provider: 'qishui', title: song.title }
      }
    }
    // 有精确 neteaseId 优先取网易云歌词:精确 ID 命中的是同一条录音,
    // 远比跨源「标题+歌手」模糊搜索可靠(后者容易拿到现场/翻唱版,整条时间轴错位)。
    // 旧顺序是 QQ 搜索在前,网易云 yrc 反而排后面,这里纠正为精确源优先。
    if (result.lines.length === 0 && song.neteaseId) {
      try {
        const ly = await getLyricNew(song.neteaseId)
        let lines = pickLines(ly)
        if (lines.length > 0) {
          lines = stripLines(lines)
          if (ly.tlyric) lines = mergeTranslation(lines, ly.tlyric)
          result = { lines, provider: 'netease', title: song.title }
        }
      } catch (e) {
        console.warn('[Lyrics] netease native lookup failed', e)
      }
    }
    // 没有精确 ID/原生失败:到 QQ 找一份匹配的逐字歌词(内部有时长硬过滤,
    // 拿到结果后再过一遍时间轴 sanity,防止现场/切片版溜进来)
    if (result.lines.length === 0) {
      try {
        const cross = await findQqRichLyrics(song.title, song.artist, song.duration)
        if (cross && cross.length > 0 && hasRichTiming(cross)) {
          const issue = assessTimelineIssue(cross, song.duration)
          if (issue) {
            console.warn('[Lyrics] qq cross-search rejected:', issue)
          } else {
            result = { lines: stripLines(cross), provider: 'qq', title: song.title }
          }
        }
      } catch (e) {
        console.warn('[Lyrics] qq cross lookup failed', e)
      }
    }
    // QQ/酷狗无自建歌词:按「标题 歌手」到网易云搜索。
    // 候选打分:艺人匹配为门槛,时长最接近者优先——旧逻辑直接取第一条,经常拿到错版本。
    if (result.lines.length === 0 && (song.source === 'QQMUSIC' || song.source === 'KUGOU')) {
      try {
        const r = await searchSongs(`${song.title} ${song.artist}`, 8, 0)
        const firstArtist = song.artist.split(' / ')[0]?.trim() ?? ''
        const scored = r.songs
          .filter((s) => s.neteaseId)
          .map((s) => {
            const artistOk = !firstArtist || !s.artist || s.artist.includes(firstArtist)
            const d =
              song.duration > 0 && s.duration > 0 ? Math.abs(s.duration - song.duration) : Number.MAX_SAFE_INTEGER
            return { s, artistOk, d }
          })
          .filter((x) => x.artistOk)
          .sort((a, b) => a.d - b.d)
        const cand = scored[0]?.s ?? r.songs.find((s) => s.neteaseId)
        if (cand?.neteaseId) {
          const ly = await getLyricNew(cand.neteaseId)
          let lines = pickLines(ly)
          if (lines.length > 0 && !assessTimelineIssue(lines, song.duration)) {
            lines = stripLines(lines)
            if (ly.tlyric) lines = mergeTranslation(lines, ly.tlyric)
            result = { lines, provider: 'netease', title: song.title }
          }
        }
      } catch (e) {
        console.warn('[Lyrics] qq/kugou netease search failed', e)
      }
    }
    if (result.lines.length === 0 && song.source === 'BILIBILI' && song.bvid) {
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
  // 逐字补齐:主来源只有整行时间时,去其它来源找一份带逐字的版本
  if (result.lines.length > 0 && !hasRichTiming(result.lines)) {
    const rich = await enrichWithRichTiming(song, result.lines)
    if (rich && rich.length > 0) {
      // provider 仍标注原来源:逐字数据来自网易云,但行文本沿用原平台更可靠
      result = { ...result, lines: rich }
    }
  }
  lyricCache.set(song.id, result)
  if (lyricCache.size > 200) {
    const first = lyricCache.keys().next().value
    if (first) lyricCache.delete(first)
  }
  return result
}
