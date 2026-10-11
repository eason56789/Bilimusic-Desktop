/**
 * 探针2:未登录下手机端接口 vs 桌面端接口 实测对比。
 * 1) 搜索: 手机 weapi /cloudsearch/get/web  vs  桌面 weapi /search/get
 * 2) 推荐: 手机 weapi /personalized/playlist  vs  桌面 API 明文 /personalized/playlist
 */
import { weApiEncrypt } from '../src/main/api/neteaseCrypto'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const GUEST_COOKIE = 'os=pc; appver=8.10.35'

async function weapi(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(weApiEncrypt(params)).toString()
  const url = `https://music.163.com/weapi${path}?csrf_token=`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: 'https://music.163.com',
      Cookie: GUEST_COOKIE,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
  return await resp.json()
}

async function apiPlain(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString()
  const resp = await fetch(`https://music.163.com/api${path}?${qs}`, {
    headers: { 'User-Agent': UA, Referer: 'https://music.163.com', Cookie: GUEST_COOKIE }
  })
  return await resp.json()
}

function brief(j: any): string {
  const songs = j?.result?.songs ?? j?.result ?? []
  const n = Array.isArray(songs) ? songs.length : -1
  return `code=${j?.code} songs=${n} first=${n > 0 ? JSON.stringify(songs[0]?.name ?? songs[0]?.id) : '-'}`
}

async function main(): Promise<void> {
  const kw = '周杰伦'
  console.log(`keyword=${kw} (未登录)`)

  console.log('--- 搜索 ---')
  try {
    const mobile = await weapi('/cloudsearch/get/web', {
      s: kw, type: '1', limit: '5', offset: '0', total: 'true'
    })
    console.log('手机 weapi /cloudsearch/get/web : ' + brief(mobile))
  } catch (e) { console.log('手机 cloudsearch ERROR ' + (e as Error).message) }
  try {
    const desktop = await weapi('/search/get', {
      s: kw, type: '1', limit: '5', offset: '0'
    })
    console.log('桌面 weapi /search/get         : ' + brief(desktop))
  } catch (e) { console.log('桌面 search/get ERROR ' + (e as Error).message) }

  console.log('--- 推荐歌单 ---')
  try {
    const mobile = await weapi('/personalized/playlist', { limit: '6', total: 'true' })
    console.log('手机 weapi /personalized/playlist : ' + brief(mobile))
    const arr: any[] = mobile?.result ?? []
    const it = Array.isArray(arr) ? arr[0] : undefined
    console.log('result isArray=' + Array.isArray(arr) + ' first fields=' + (it ? Object.keys(it).join(',') : '-'))
    if (it) console.log(`picUrl=${it.picUrl} trackCount=${it.trackCount} playCount=${it.playCount} creator=${JSON.stringify(it.creator)}`)
  } catch (e) { console.log('手机 personalized ERROR ' + (e as Error).message) }
  try {
    const desktop = await apiPlain('/personalized/playlist', { limit: '6', total: 'true' })
    console.log('桌面 API 明文 /personalized/playlist: ' + brief(desktop))
  } catch (e) { console.log('桌面 personalized ERROR ' + (e as Error).message) }
}

main().catch((e) => { console.error('probe failed', e); process.exit(1) })
