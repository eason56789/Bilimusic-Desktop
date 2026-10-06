/**
 * 网易云音乐 API 加密 (移植自安卓端 NeteaseCrypto.kt)
 * weapi: AES-CBC 双层 + RSA(no padding)
 * eapi: AES-ECB
 */
import {
  createCipheriv,
  createHash,
  publicEncrypt,
  constants,
  randomInt
} from 'crypto'

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PRESET_KEY = '0CoJUm6Qyw8W8jud'
const IV = '0102030405060708'
const LINUX_KEY = 'rFgB&h#%2?^eDg:Q'
const EAPI_KEY = 'e82ckenh8dichen8'
const EAPI_FORMAT = '%s-36cd479b6b5-%s-36cd479b6b5-%s'
const EAPI_SALT = 'nobody%suse%smd5forencrypt'
// 网易云公开 RSA 公钥(与安卓端一致)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFb
t7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZ
MldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`

export function randomSecretKey(): string {
  let s = ''
  for (let i = 0; i < 16; i++) s += BASE62[randomInt(BASE62.length)]
  return s
}

export function md5Hex(data: string): string {
  return createHash('md5').update(data, 'utf8').digest('hex')
}

function aesCbcEncryptBase64(text: string, key: string): string {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(IV, 'utf8'))
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64')
}

function aesEcbEncryptHex(text: string, key: string): string {
  const cipher = createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null)
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('hex')
}

/** RSA no-padding 加密(等价于 BigInteger modPow),输出 hex */
function rsaNoPaddingHex(data: Buffer): string {
  // 1024-bit 模长 = 128 字节,no-padding 需要左填充到模长
  const padded = Buffer.concat([Buffer.alloc(128 - data.length, 0), data])
  const encrypted = publicEncrypt(
    { key: PUBLIC_KEY, padding: constants.RSA_NO_PADDING },
    padded
  )
  return encrypted.toString('hex')
}

export function weApiEncrypt(payload: Record<string, unknown>): Record<string, string> {
  const jsonStr = JSON.stringify(payload)
  const secretKey = randomSecretKey()
  const enc1 = aesCbcEncryptBase64(jsonStr, PRESET_KEY)
  const params = aesCbcEncryptBase64(enc1, secretKey)
  const encSecKey = rsaNoPaddingHex(Buffer.from(secretKey.split('').reverse().join(''), 'utf8'))
  return { params, encSecKey }
}

export function eApiEncrypt(url: string, payload: Record<string, unknown>): Record<string, string> {
  const data = JSON.stringify(payload)
  const apiPath = url.replace('/eapi', '/api')
  const message = EAPI_FORMAT.replace('%s', apiPath)
    .replace('%s', data)
    .replace('%s', md5Hex(EAPI_SALT.replace('%s', apiPath).replace('%s', data)))
  const cipher = aesEcbEncryptHex(message, EAPI_KEY).toUpperCase()
  return { params: cipher }
}

export function linuxApiEncrypt(payload: Record<string, unknown>): Record<string, string> {
  return { eparams: aesEcbEncryptHex(JSON.stringify(payload), LINUX_KEY) }
}
