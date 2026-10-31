/**
 * 酷狗扫码登录(普通版 / 概念版)
 * 流程(MakcRe/KuGouMusicApi 核实):Web 签名 → v2/qrcode 取 key → 轮询 v2/get_userinfo_qrcode,
 * status=4 时响应直接带 token/userid。整个流程匿名可发起。
 *
 * Web 签名: md5(NVPh5oo7... + sort(所有query的 k=v 串拼接) + POST体(GET为空) + NVPh5oo7...)
 */
import { createHash } from 'crypto'
import type { KugouPlatform } from '@shared/types'
import { getOrCreateKugouMid } from '../store'

const SIGN_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const UA_KG =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
/** 轮询域名/生成域名不同:生成固定 appid=1014,确认页按身份(普通 1005 / 概念 3116) */
const CREATE_HOST = 'https://login-user.kugou.com/v2/qrcode'
const POLL_HOST = 'https://login-user.kugou.com/v2/get_userinfo_qrcode'
const QR_TEXT_BASE = 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid='

/** 普通版与概念版的平台参数(已核实 KuGouMusicApi util/config.json) */
const PLATFORM_CONF: Record<KugouPlatform, { appid: string; clientver: string }> = {
  normal: { appid: '1005', clientver: '20489' },
  concept: { appid: '3116', clientver: '11440' }
}

function md5Hex(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex')
}

/**
 * Web 签名:把全部 query 参数按 "k=v" 整串字典序排序后拼接,夹在盐值中间 md5。
 * 注意是对拼接后的整串排序(不是按 key 排序后拼接)。
 */
function webSign(params: Record<string, string>): string {
  const joined = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('')
  return md5Hex(SIGN_SALT + joined + SIGN_SALT)
}

/** 通用请求参数(appid 按 platform;生成二维码的接口固定用 1014) */
function commonParams(platform: KugouPlatform, appidOverride?: string): Record<string, string> {
  const conf = PLATFORM_CONF[platform]
  return {
    appid: appidOverride ?? conf.appid,
    clientver: conf.clientver,
    clienttime: String(Math.floor(Date.now() / 1000)),
    mid: getOrCreateKugouMid(),
    dfid: '-',
    uuid: '-',
    srcappid: '2919'
  }
}

async function signedGet(
  url: string,
  platform: KugouPlatform,
  extraParams: Record<string, string>,
  appidOverride?: string
): Promise<any> {
  const params = { ...commonParams(platform, appidOverride), ...extraParams }
  params.signature = webSign(params)
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const resp = await fetch(`${url}?${qs}`, {
    headers: { 'User-Agent': UA_KG, Referer: 'https://www.kugou.com/' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗登录 HTTP ${resp.status}`)
  return await resp.json()
}

/** 生成扫码登录二维码:返回 {key, content}(content 供手机酷狗扫码) */
export async function createKugouQr(
  platform: KugouPlatform
): Promise<{ key: string; content: string } | null> {
  // 生成接口固定 appid=1014;确认页身份由扫码内容里的 appid 决定
  const json = await signedGet(CREATE_HOST, platform, {
    type: '1',
    plat: '4',
    qrcode_txt: `${QR_TEXT_BASE}${PLATFORM_CONF[platform].appid}&`
  }, '1014')
  const key = String(json?.data?.qrcode ?? json?.data?.key ?? '')
  if (!key) return null
  return { key, content: `${QR_TEXT_BASE}${PLATFORM_CONF[platform].appid}&qrcode=${key}` }
}

export type KugouQrStatus =
  | { status: 'waiting' | 'scanned' | 'expired' | 'error'; message: string }
  | {
      status: 'ok'
      message: string
      token: string
      userid: string
      vipType?: string
      vipToken?: string
    }

/**
 * 轮询扫码状态(实测):0 过期 / 1 等待扫码 / 2 已扫待确认 / 4 成功(带 token+userid)。
 * (实测新 key 未扫码即返回 1,故 1=waiting、2=scanned)
 */
export async function pollKugouQr(platform: KugouPlatform, key: string): Promise<KugouQrStatus> {
  const json = await signedGet(POLL_HOST, platform, { plat: '4', qrcode: key })
  const status = Number(json?.data?.status ?? json?.status ?? -1)
  switch (status) {
    case 2:
      return { status: 'scanned', message: '已扫描,请在手机上确认' }
    case 0:
      return { status: 'expired', message: '二维码已过期' }
    case 4: {
      const token = String(json?.data?.token ?? '')
      const userid = String(json?.data?.userid ?? json?.data?.user_id ?? '')
      if (!token || !userid) {
        return { status: 'error', message: '授权成功但未返回凭据' }
      }
      return {
        status: 'ok',
        message: '登录成功',
        token,
        userid,
        ...(json?.data?.vip_type ? { vipType: String(json.data.vip_type) } : {}),
        ...(json?.data?.vip_token ? { vipToken: String(json.data.vip_token) } : {})
      }
    }
    default:
      return { status: 'waiting', message: '等待扫码...' }
  }
}
