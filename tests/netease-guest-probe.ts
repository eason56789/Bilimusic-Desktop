/**
 * 一次性探针：验证网易云"未登录取流"在 PC UA vs 手机 UA 下的差异。
 * 用桌面端同款 eapi 加密（neteaseCrypto），同一首歌、同一份游客 cookie，
 * 分别用两种 UA 请求 /eapi/song/enhance/player/url/v1，对比返回。
 */
import { eApiEncrypt, md5Hex } from '../src/main/api/neteaseCrypto'

const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 10; BiliMusic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const GUEST_COOKIE = 'os=pc; appver=8.10.35'

async function searchGuestSong(): Promise<{ id: number; name: string; fee: number }> {
  // API 模式搜索（未登录可用），取第一首
  const url =
    'https://music.163.com/api/search/get?s=' +
    encodeURIComponent('周杰伦') +
    '&type=1&limit=5&offset=0'
  const resp = await fetch(url, {
    headers: {
      'User-Agent': PC_UA,
      Referer: 'https://music.163.com',
      Cookie: GUEST_COOKIE
    }
  })
  const json = await resp.json()
  const songs: any[] = json?.result?.songs ?? []
  const pick = songs.find((s) => s.fee === 0) ?? songs[0]
  if (!pick) throw new Error('search returned no songs: ' + JSON.stringify(json).slice(0, 200))
  return { id: pick.id, name: pick.name, fee: pick.fee }
}

async function probeUrl(
  songId: number,
  ua: string
): Promise<{ code: number; url: string | null; level: string; br: number }> {
  const path = '/eapi/song/enhance/player/url/v1'
  const params = { ids: `[${songId}]`, level: 'exhigh', encodeType: 'flac' }
  const body = new URLSearchParams(eApiEncrypt(path, params)).toString()
  const resp = await fetch(`https://interface.music.163.com${path}`, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      Referer: 'https://music.163.com',
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
  const json = await resp.json()
  const info = json?.data?.[0]
  return {
    code: json?.code ?? -1,
    url: info?.url ?? null,
    level: info?.level ?? '',
    br: info?.br ?? 0
  }
}

async function main(): Promise<void> {
  const song = await searchGuestSong()
  console.log(
    `song: ${song.name} (id=${song.id}, fee=${song.fee}) — fee=0 表示非VIP, 未登录理论上可听标准音质`
  )
  for (const [label, ua] of [
    ['PC(桌面端)', PC_UA],
    ['MOBILE(手机端)', MOBILE_UA]
  ] as const) {
    try {
      const r = await probeUrl(song.id, ua)
      console.log(
        `${label}: code=${r.code} url=${r.url ? 'OK(' + r.url.slice(0, 60) + '...)' : 'NULL'} level=${r.level} br=${r.br}`
      )
    } catch (e) {
      console.log(`${label}: ERROR ${e instanceof Error ? e.message : e}`)
    }
  }
}

main().catch((e) => {
  console.error('probe failed', e)
  process.exit(1)
})
