/**
 * 歌曲百科(参考开源项目 NeriPlayer 的实现,数据来自网易云音乐):
 *  - /api/song/play/about/block/page  曲风/语种/BPM/奖项 + 相似歌曲 + 相关歌单
 *  - /api/song/creators               创作团队(作词/作曲/编曲/制作人)
 *  - /api/song/detail?ids=[id]        专辑/发行公司/发行时间
 *  - /api/v1/artist/{id}              艺人资料(复用 netease.getArtistDetail)
 * 四个接口均匿名可用;不存在的歌曲同样返回 200,只是缺对应板块,解析层返回空。
 * 任一接口失败只降级对应板块,不影响其余数据。
 */
import { getNeteaseCookies, getArtistDetail } from './netease'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function wikiGet(url: string): Promise<any> {
  const cookie = Object.entries(getNeteaseCookies())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Referer: 'https://music.163.com',
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      ...(cookie ? { Cookie: cookie } : {})
    }
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`网易云百科 HTTP ${resp.status}: ${text.slice(0, 160)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('网易云百科响应不是 JSON')
  }
}

export interface NeteaseWikiSimilarSong {
  songId: number
  name: string
  artist: string
  coverUrl?: string
}

export interface NeteaseWikiRelatedPlaylist {
  playlistId: number
  name: string
  coverUrl?: string
  playCount?: number
}

export interface NeteaseWikiAward {
  title: string
  detail?: string
}

export interface NeteaseWikiCredits {
  lyricists: string[]
  composers: string[]
  arrangers: string[]
  producers: string[]
  other: { role: string; names: string[] }[]
}

export interface NeteaseSongWiki {
  songId: number
  genres: string[]
  tags: string[]
  language?: string
  bpm?: number
  awards: NeteaseWikiAward[]
  appearances: string[]
  albumName?: string
  albumPicUrl?: string
  albumCompany?: string
  publishTime?: number
  artist?: {
    id: number
    name: string
    avatar?: string
    briefDesc?: string
    musicSize?: number
    albumSize?: number
    fansCount?: number
  }
  credits?: NeteaseWikiCredits
  similarSongs: NeteaseWikiSimilarSong[]
  relatedPlaylists: NeteaseWikiRelatedPlaylist[]
}

/* ---------- 解析辅助:缺失/null/空一律按"无数据"处理,不用空值冒充 ---------- */

function trimStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s.length > 0 ? s : undefined
}

function positiveNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function arr(v: any): any[] {
  return Array.isArray(v) ? v : []
}

function findBlock(json: any, code: string): any | null {
  const blocks = arr(json?.data?.blocks)
  return blocks.find((b) => trimStr(b?.code) === code) ?? null
}

/** creative 按类型过滤后取每个 resource 的主标题(曲风/标签/影视节目共用) */
function resourceTitles(json: any, blockCode: string, creativeType: string): string[] {
  const block = findBlock(json, blockCode)
  const out: string[] = []
  for (const creative of arr(block?.creatives)) {
    if (trimStr(creative?.creativeType) !== creativeType) continue
    for (const res of arr(creative?.resources)) {
      const title = trimStr(res?.uiElement?.mainTitle?.title)
      if (title) out.push(title)
    }
  }
  return out
}

function firstCreative(json: any, blockCode: string, creativeType: string): any | null {
  const block = findBlock(json, blockCode)
  for (const creative of arr(block?.creatives)) {
    if (trimStr(creative?.creativeType) === creativeType) return creative
  }
  return null
}

/** textLinks 的第一个 text(语种 / BPM 的取值处) */
function firstTextLink(creative: any): string | undefined {
  for (const link of arr(creative?.uiElement?.textLinks)) {
    const text = trimStr(link?.text)
    if (text) return text
  }
  return undefined
}

const BLOCK_BASIC = 'SONG_PLAY_ABOUT_SONG_BASIC'
const BLOCK_SIMILAR = 'SONG_PLAY_ABOUT_SIMILAR_SONG'
const BLOCK_PLAYLIST = 'SONG_PLAY_ABOUT_RELATED_PLAYLIST'

/** 组装歌曲百科:四个接口各自降级,任一失败不影响其余板块 */
export async function getSongWiki(songId: number): Promise<NeteaseSongWiki> {
  const wiki: NeteaseSongWiki = {
    songId,
    genres: [],
    tags: [],
    awards: [],
    appearances: [],
    similarSongs: [],
    relatedPlaylists: []
  }

  // 1) 百科主板块(曲风/语种/BPM/奖项 + 相似歌曲 + 相关歌单,同一份响应不重复请求)
  let summary: any = null
  try {
    summary = await wikiGet(`https://music.163.com/api/song/play/about/block/page?songId=${songId}`)
  } catch {
    /* 主板块失败时其余板块仍尝试 */
  }
  if (summary?.code === 200) {
    wiki.genres = resourceTitles(summary, BLOCK_BASIC, 'songTag')
    wiki.tags = resourceTitles(summary, BLOCK_BASIC, 'songBizTag')
    const langText = firstTextLink(firstCreative(summary, BLOCK_BASIC, 'language') ?? {})
    if (langText) wiki.language = langText
    const bpmText = firstTextLink(firstCreative(summary, BLOCK_BASIC, 'bpm') ?? {})
    const bpmNum = bpmText ? Number(bpmText) : NaN
    if (Number.isFinite(bpmNum) && bpmNum > 0) wiki.bpm = Math.round(bpmNum)

    // 奖项:主标题 + 副标题拼接
    const awardBlock = findBlock(summary, BLOCK_BASIC)
    for (const creative of arr(awardBlock?.creatives)) {
      if (trimStr(creative?.creativeType) !== 'songAward') continue
      for (const res of arr(creative?.resources)) {
        const title = trimStr(res?.uiElement?.mainTitle?.title)
        if (!title) continue
        const detail = arr(res?.uiElement?.subTitles)
          .map((s) => trimStr(s?.title))
          .filter(Boolean)
          .join(' ')
        wiki.awards.push(detail ? { title, detail } : { title })
      }
    }
    wiki.appearances = resourceTitles(summary, BLOCK_BASIC, 'entertainment')

    // 相似歌曲
    const simBlock = findBlock(summary, BLOCK_SIMILAR)
    for (const creative of arr(simBlock?.creatives)) {
      for (const res of arr(creative?.resources)) {
        if (trimStr(res?.resourceType) !== 'SONG') continue
        if (res?.valid === false) continue
        const simId = positiveNum(res?.resourceId)
        const name = trimStr(res?.uiElement?.mainTitle?.title)
        if (!simId || !name) continue
        const artist = arr(res?.uiElement?.subTitles)
          .map((s) => trimStr(s?.title))
          .filter(Boolean)[0]
        const cover = trimStr(res?.uiElement?.images?.[0]?.imageUrl)
        wiki.similarSongs.push({
          songId: simId,
          name,
          artist: artist ?? '',
          coverUrl: cover?.replace('http://', 'https://')
        })
      }
    }

    // 相关歌单
    const plBlock = findBlock(summary, BLOCK_PLAYLIST)
    for (const creative of arr(plBlock?.creatives)) {
      for (const res of arr(creative?.resources)) {
        if (trimStr(res?.resourceType) !== 'PLAYLIST') continue
        const plId = positiveNum(res?.resourceId)
        const name = trimStr(res?.uiElement?.mainTitle?.title)
        if (!plId || !name) continue
        const cover = trimStr(res?.uiElement?.images?.[0]?.imageUrl)
        wiki.relatedPlaylists.push({
          playlistId: plId,
          name,
          coverUrl: cover?.replace('http://', 'https://'),
          playCount: positiveNum(res?.resourceExt?.playCount)
        })
      }
    }
  }

  // 2) 歌曲详情(专辑/发行公司/发行时间/艺人 id) —— 加分项,失败留空
  let detailSong: any | null = null
  try {
    const detail = await wikiGet(`https://music.163.com/api/song/detail?ids=%5B${songId}%5D`)
    detailSong = detail?.songs?.[0] ?? null
    if (detailSong) {
      wiki.albumName = trimStr(detailSong?.album?.name)
      wiki.albumPicUrl = trimStr(detailSong?.album?.picUrl)?.replace('http://', 'https://')
      wiki.albumCompany = trimStr(detailSong?.album?.company)
      wiki.publishTime = positiveNum(detailSong?.publishTime)
    }
  } catch {
    /* ignore */
  }

  // 3) 创作团队 —— 加分项,失败留空
  try {
    const cr = await wikiGet(`https://music.163.com/api/song/creators?songId=${songId}`)
    const roles = arr(cr?.data?.songCreatorsRoleVos)
    const credits: NeteaseWikiCredits = {
      lyricists: [],
      composers: [],
      arrangers: [],
      producers: [],
      other: []
    }
    for (const role of roles) {
      const roleName = trimStr(role?.roleName)
      const names = arr(role?.creatorMetaVOS)
        .map((c) => trimStr(c?.artistName))
        .filter(Boolean) as string[]
      if (!roleName || names.length === 0) continue
      if (roleName === '作词') credits.lyricists = names
      else if (roleName === '作曲') credits.composers = names
      else if (roleName === '编曲') credits.arrangers = names
      else if (roleName === '制作人') credits.producers = names
      else credits.other.push({ role: roleName, names })
    }
    const hasAny =
      credits.lyricists.length +
        credits.composers.length +
        credits.arrangers.length +
        credits.producers.length +
        credits.other.length >
      0
    if (hasAny) wiki.credits = credits
  } catch {
    /* ignore */
  }

  // 4) 艺人资料 —— 加分项,失败留空(复用已有 getArtistDetail,含粉丝数)
  try {
    const artistId = positiveNum(detailSong?.artists?.[0]?.id)
    if (artistId) {
      const a = await getArtistDetail(artistId)
      wiki.artist = {
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        briefDesc: a.briefDesc,
        musicSize: a.musicSize,
        albumSize: a.albumSize,
        fansCount: a.fansCount
      }
    }
  } catch {
    /* ignore */
  }

  return wiki
}
