/**
 * 酷狗扫码登录(普通版 / 概念版)
 * 协议(逆向自听屿 1.2.2 实际运行代码,勿凭记忆改动):
 *  1. 生成二维码:GET login-user.kugou.com/v2/qrcode,appid=1001(生成接口固定 1001),
 *     qrcode_txt 里带 appid=3116(确认页身份),Bs 签名。
 *  2. 轮询:GET /v2/get_userinfo_qrcode,appid=3116(轮询用 3116,不是 1005),Bs 签名。
 *     状态码:0=过期 1=等待扫码 2=已扫待确认 4=成功(响应直接带 token/userid)。
 *  3. 成功后不需要任何设备注册或 token 换绑,直接保存 {token, userid, vipToken, vipType}。
 *
 * Bs 签名:md5(NVPh5oo7…盐 + "k=v" 串排序后拼接 + NVPh5oo7…盐)(无 body)
 */
import { createHash } from 'crypto'
import type { KugouPlatform } from '@shared/types'
import { getOrCreateKugouMid } from '../store'

const SIGN_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const UA_KG =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CREATE_HOST = 'https://login-user.kugou.com/v2/qrcode'
const POLL_HOST = 'https://login-user.kugou.com/v2/get_userinfo_qrcode'
const QR_TEXT_BASE = 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid='
/** 生成二维码接口固定 appid=1001;确认页/轮询身份用概念版 3116(听屿原样) */
const QR_CREATE_APPID = '1001'
const QR_IDENTITY_APPID = '3116'
const SRC_APPID = '2919'
const QR_CLIENTVER = '11440'

function md5Hex(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex')
}

/**
 * Bs 签名:把全部 query 参数的 "k=v" 串排序后拼接,夹在盐值中间 md5。
 * 注意是先拼 "k=v" 再对整串排序(与 Rs 的先按 key 排序不同)。
 */
function webSign(params: Record<string, string>): string {
  const joined = Object.keys(params)
    .map((k) => `${k}=${params[k]}`)
    .sort()
    .join('')
  return md5Hex(`${SIGN_SALT}${joined}${SIGN_SALT}`)
}

/** 扫码两步的公共 query 基础参数(听屿 zl():dfid/uuid 固定,mid 即 uuid) */
function qrBaseParams(): Record<string, string> {
  const mid = getOrCreateKugouMid()
  return {
    dfid: '-',
    mid,
    uuid: mid,
    clientver: QR_CLIENTVER,
    clienttime: String(Math.floor(Date.now() / 1000))
  }
}

async function signedGet(url: string, params: Record<string, string>): Promise<any> {
  const all = { ...params }
  all.signature = webSign(all)
  const qs = Object.keys(all)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(all[k])}`)
    .join('&')
  const resp = await fetch(`${url}?${qs}`, {
    headers: { 'User-Agent': UA_KG, Referer: 'https://www.kugou.com/', Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`酷狗登录 HTTP ${resp.status}`)
  return await resp.json()
}

/** 生成扫码登录二维码:返回 {key, content}(content 供手机酷狗扫码) */
export async function createKugouQr(
  _platform: KugouPlatform
): Promise<{ key: string; content: string } | null> {
  const json = await signedGet(CREATE_HOST, {
    ...qrBaseParams(),
    appid: QR_CREATE_APPID,
    type: '1',
    plat: '4',
    qrcode_txt: `${QR_TEXT_BASE}${QR_IDENTITY_APPID}&`,
    srcappid: SRC_APPID
  })
  const key = String(json?.data?.qrcode ?? json?.data?.qrcode_key ?? json?.data?.key ?? json?.qrcode ?? json?.key ?? '').trim()
  if (!key) return null
  return { key, content: `${QR_TEXT_BASE}${QR_IDENTITY_APPID}&qrcode=${key}` }
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
 * 轮询扫码状态:0 过期 / 1 等待扫码 / 2 已扫待确认 / 4 成功(带 token+userid)。
 * 成功后不需要任何设备注册或 token 换绑,凭据直接可用(云歌单协议见 qqkugou.ts)。
 */
export async function pollKugouQr(_platform: KugouPlatform, key: string): Promise<KugouQrStatus> {
  const json = await signedGet(POLL_HOST, {
    ...qrBaseParams(),
    plat: '4',
    appid: QR_IDENTITY_APPID,
    srcappid: SRC_APPID,
    qrcode: key
  })
  const data = (json?.data ?? {}) as Record<string, unknown>
  const status = Number(data.status ?? json?.status ?? -1)
  switch (status) {
    case 2:
      return { status: 'scanned', message: '已扫描,请在手机上确认' }
    case 0:
      return { status: 'expired', message: '二维码已过期' }
    case 4: {
      const token = String(data.token ?? '')
      const userid = String(data.userid ?? data.user_id ?? data.KugooID ?? '')
      if (!token || !userid) {
        return { status: 'error', message: '授权成功但未返回凭据' }
      }
      return {
        status: 'ok',
        message: '登录成功',
        token,
        userid,
        ...(data.vip_type ? { vipType: String(data.vip_type) } : {}),
        ...(data.vip_token ? { vipToken: String(data.vip_token) } : {})
      }
    }
    default:
      return { status: 'waiting', message: '等待扫码...' }
  }
}
