/**
 * QQ 音乐原生逐字歌词(QRC)
 *
 * 协议自参考项目「听屿」的前端 bundle 还原并实测验证:
 * 1) mid → 数字歌曲 id:c.y.qq.com v8/fcg-bin/fcg_play_single_song.fcg?songmid=xxx
 * 2) 取歌词:POST u.y.qq.com/cgi-bin/musicu.fcg
 *    module = music.musichallSong.PlayLyricInfo, method = GetPlayLyricInfo
 *    param.qrc=1 / crypt=1 / ct=19 / cv=2111 / songID=数字id(附 base64 的歌名/歌手/专辑名)
 *    返回 req.data.lyric 为 hex 密文(trans/roma 同为 hex,可空)
 * 3) 解密:hex → 3DES-ECB(key = 24 字节固定盐 '!@#)(*$%123ZXC!@!@#)(NHL',
 *    D-E-D 顺序)→ raw deflate 解压 → QRC 文本(XML 包一层,LyricContent 属性里是正文)
 *    注意 QQ 的 DES 实现位序特殊(听屿 bundle 内自带实现),与 OpenSSL 标准结果不同,
 *    故这里原样移植其实现,不能用 node:crypto 的 des-ede3 代替(已实测密文不匹配)。
 * 4) 格式:[行起点ms,行时长ms]逐字(起点ms,时长ms),另有 <> 变体把逐字标放在字前;
 *    解析为与网易 YRC(parseYrc)同构的 LyricLine(words/wordTimes)。
 */
import { inflateRawSync, inflateSync } from 'zlib'
import type { LyricLine } from '@shared/types'
import { searchQqSongs } from './qqmusic'

const UA = 'okhttp/3.14.9'

// ============ QQ 私有 DES(自「听屿」bundle 原样移植,勿改位序) ============

/** S 盒(8×64) */
const SBOX = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]
]

/** 从 64 位块(8 字节数组)按 QQ 位序取第 t 位放到输出第 n 位 */
function bitAt(block: Uint8Array, t: number, n: number): number {
  const byte = Math.floor(t / 32) * 4 + 3 - Math.floor((t % 32) / 8)
  const bit = 7 - (t % 8)
  return ((block[byte] >> bit) & 1) << n
}

/** 从 32 位整数取第 t 位(高位起)放到输出第 n 位 */
function bitFromWord(e: number, t: number, n: number): number {
  return ((e >>> (31 - t)) & 1) << n
}

/** (e<<t) 截断到 32 位后右移 n */
function shl32(e: number, t: number, n: number): number {
  return (((e << t) & 2147483648) >>> n) >>> 0
}

/** S 盒行/列换算(QQ 位序) */
function sboxIdx(e: number): number {
  return (e & 32) | ((e & 31) >> 1) | ((e & 1) << 4)
}

/** 初始置换 IP:8 字节块 → [L0, R0] */
function ipSplit(e: Uint8Array): [number, number] {
  return [
    (bitAt(e, 57, 31) | bitAt(e, 49, 30) | bitAt(e, 41, 29) | bitAt(e, 33, 28) | bitAt(e, 25, 27) | bitAt(e, 17, 26) | bitAt(e, 9, 25) | bitAt(e, 1, 24) | bitAt(e, 59, 23) | bitAt(e, 51, 22) | bitAt(e, 43, 21) | bitAt(e, 35, 20) | bitAt(e, 27, 19) | bitAt(e, 19, 18) | bitAt(e, 11, 17) | bitAt(e, 3, 16) | bitAt(e, 61, 15) | bitAt(e, 53, 14) | bitAt(e, 45, 13) | bitAt(e, 37, 12) | bitAt(e, 29, 11) | bitAt(e, 21, 10) | bitAt(e, 13, 9) | bitAt(e, 5, 8) | bitAt(e, 63, 7) | bitAt(e, 55, 6) | bitAt(e, 47, 5) | bitAt(e, 39, 4) | bitAt(e, 31, 3) | bitAt(e, 23, 2) | bitAt(e, 15, 1) | bitAt(e, 7, 0)) >>> 0,
    (bitAt(e, 56, 31) | bitAt(e, 48, 30) | bitAt(e, 40, 29) | bitAt(e, 32, 28) | bitAt(e, 24, 27) | bitAt(e, 16, 26) | bitAt(e, 8, 25) | bitAt(e, 0, 24) | bitAt(e, 58, 23) | bitAt(e, 50, 22) | bitAt(e, 42, 21) | bitAt(e, 34, 20) | bitAt(e, 26, 19) | bitAt(e, 18, 18) | bitAt(e, 10, 17) | bitAt(e, 2, 16) | bitAt(e, 60, 15) | bitAt(e, 52, 14) | bitAt(e, 44, 13) | bitAt(e, 36, 12) | bitAt(e, 28, 11) | bitAt(e, 20, 10) | bitAt(e, 12, 9) | bitAt(e, 4, 8) | bitAt(e, 62, 7) | bitAt(e, 54, 6) | bitAt(e, 46, 5) | bitAt(e, 38, 4) | bitAt(e, 30, 3) | bitAt(e, 22, 2) | bitAt(e, 14, 1) | bitAt(e, 6, 0)) >>> 0
  ]
}

/** 逆初始置换:32 位 R/L → 8 字节 */
function ipInverse(l: number, r: number): Uint8Array {
  const out = new Uint8Array(8)
  out[3] = bitFromWord(r, 7, 7) | bitFromWord(l, 7, 6) | bitFromWord(r, 15, 5) | bitFromWord(l, 15, 4) | bitFromWord(r, 23, 3) | bitFromWord(l, 23, 2) | bitFromWord(r, 31, 1) | bitFromWord(l, 31, 0)
  out[2] = bitFromWord(r, 6, 7) | bitFromWord(l, 6, 6) | bitFromWord(r, 14, 5) | bitFromWord(l, 14, 4) | bitFromWord(r, 22, 3) | bitFromWord(l, 22, 2) | bitFromWord(r, 30, 1) | bitFromWord(l, 30, 0)
  out[1] = bitFromWord(r, 5, 7) | bitFromWord(l, 5, 6) | bitFromWord(r, 13, 5) | bitFromWord(l, 13, 4) | bitFromWord(r, 21, 3) | bitFromWord(l, 21, 2) | bitFromWord(r, 29, 1) | bitFromWord(l, 29, 0)
  out[0] = bitFromWord(r, 4, 7) | bitFromWord(l, 4, 6) | bitFromWord(r, 12, 5) | bitFromWord(l, 12, 4) | bitFromWord(r, 20, 3) | bitFromWord(l, 20, 2) | bitFromWord(r, 28, 1) | bitFromWord(l, 28, 0)
  out[7] = bitFromWord(r, 3, 7) | bitFromWord(l, 3, 6) | bitFromWord(r, 11, 5) | bitFromWord(l, 11, 4) | bitFromWord(r, 19, 3) | bitFromWord(l, 19, 2) | bitFromWord(r, 27, 1) | bitFromWord(l, 27, 0)
  out[6] = bitFromWord(r, 2, 7) | bitFromWord(l, 2, 6) | bitFromWord(r, 10, 5) | bitFromWord(l, 10, 4) | bitFromWord(r, 18, 3) | bitFromWord(l, 18, 2) | bitFromWord(r, 26, 1) | bitFromWord(l, 26, 0)
  out[5] = bitFromWord(r, 1, 7) | bitFromWord(l, 1, 6) | bitFromWord(r, 9, 5) | bitFromWord(l, 9, 4) | bitFromWord(r, 17, 3) | bitFromWord(l, 17, 2) | bitFromWord(r, 25, 1) | bitFromWord(l, 25, 0)
  out[4] = bitFromWord(r, 0, 7) | bitFromWord(l, 0, 6) | bitFromWord(r, 8, 5) | bitFromWord(l, 8, 4) | bitFromWord(r, 16, 3) | bitFromWord(l, 16, 2) | bitFromWord(r, 24, 1) | bitFromWord(l, 24, 0)
  return out
}

/** 轮函数 f(R, 子密钥) */
function feistel(e: number, t: number[]): number {
  const expL = (shl32(e, 31, 0) | ((e & 4026531840) >>> 1) | shl32(e, 4, 5) | shl32(e, 3, 6) | ((e & 251658240) >>> 3) | shl32(e, 8, 11) | shl32(e, 7, 12) | ((e & 15728640) >>> 5) | shl32(e, 12, 17) | shl32(e, 11, 18) | ((e & 983040) >>> 7) | shl32(e, 16, 23)) >>> 0
  const expR = (shl32(e, 15, 0) | ((e & 61440) << 15) | shl32(e, 20, 5) | shl32(e, 19, 6) | ((e & 3840) << 13) | shl32(e, 24, 11) | shl32(e, 23, 12) | ((e & 240) << 11) | shl32(e, 28, 17) | shl32(e, 27, 18) | ((e & 15) << 9) | shl32(e, 0, 23)) >>> 0
  const xored = [expL >>> 24 & 255, expL >>> 16 & 255, expL >>> 8 & 255, expR >>> 24 & 255, expR >>> 16 & 255, expR >>> 8 & 255].map((v, i) => v ^ t[i])
  const s = (SBOX[0][sboxIdx(xored[0] >>> 2)] << 28 | SBOX[1][sboxIdx(((xored[0] & 3) << 4) | (xored[1] >>> 4))] << 24 | SBOX[2][sboxIdx(((xored[1] & 15) << 2) | (xored[2] >>> 6))] << 20 | SBOX[3][sboxIdx(xored[2] & 63)] << 16 | SBOX[4][sboxIdx(xored[3] >>> 2)] << 12 | SBOX[5][sboxIdx(((xored[3] & 3) << 4) | (xored[4] >>> 4))] << 8 | SBOX[6][sboxIdx(((xored[4] & 15) << 2) | (xored[5] >>> 6))] << 4 | SBOX[7][sboxIdx(xored[5] & 63)]) >>> 0
  return (shl32(s, 15, 0) | shl32(s, 6, 1) | shl32(s, 19, 2) | shl32(s, 20, 3) | shl32(s, 28, 4) | shl32(s, 11, 5) | shl32(s, 27, 6) | shl32(s, 16, 7) | shl32(s, 0, 8) | shl32(s, 14, 9) | shl32(s, 22, 10) | shl32(s, 25, 11) | shl32(s, 4, 12) | shl32(s, 17, 13) | shl32(s, 30, 14) | shl32(s, 9, 15) | shl32(s, 1, 16) | shl32(s, 7, 17) | shl32(s, 23, 18) | shl32(s, 13, 19) | shl32(s, 31, 20) | shl32(s, 26, 21) | shl32(s, 2, 22) | shl32(s, 8, 23) | shl32(s, 18, 24) | shl32(s, 12, 25) | shl32(s, 29, 26) | shl32(s, 5, 27) | shl32(s, 21, 28) | shl32(s, 10, 29) | shl32(s, 3, 30) | shl32(s, 24, 31)) >>> 0
}

/** 单块 DES(dir=1 加密轮序 / dir=0 解密轮序) */
function desBlock(e: Uint8Array, t: number[][]): Uint8Array {
  let [l, r] = ipSplit(e)
  for (let i = 0; i < 15; i++) {
    const prev = r
    r = (feistel(r, t[i]) ^ l) >>> 0
    l = prev
  }
  l = (feistel(r, t[15]) ^ l) >>> 0
  return ipInverse(l, r)
}

/** 8 字节密钥 → 16 轮子密钥(dir=0 时轮序反转) */
function keySchedule(e: Uint8Array, dir: number): number[][] {
  const subkeys = Array.from({ length: 16 }, () => new Array<number>(6).fill(0))
  const shifts = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
  const pc1L = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35]
  const pc1R = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3]
  const pc2 = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31]
  let c = 0
  for (let i = 0; i < 28; i++) c |= bitAt(e, pc1L[i], 31 - i)
  c >>>= 0
  let d = 0
  for (let i = 0; i < 28; i++) d |= bitAt(e, pc1R[i], 31 - i)
  d >>>= 0
  for (let round = 0; round < 16; round++) {
    c = (((c << shifts[round]) | (c >>> (28 - shifts[round]))) & 4294967280) >>> 0
    d = (((d << shifts[round]) | (d >>> (28 - shifts[round]))) & 4294967280) >>> 0
    const idx = dir === 0 ? 15 - round : round
    const sk = subkeys[idx]
    for (let i = 0; i < 24; i++) sk[Math.floor(i / 8)] |= bitFromWord(c, pc2[i], 7 - (i % 8))
    for (let i = 24; i < 48; i++) sk[Math.floor(i / 8)] |= bitFromWord(d, pc2[i] - 27, 7 - (i % 8))
  }
  return subkeys
}

/** 24 字节盐拆三段 8 字节密钥:dir=1 加密轮序 [K1e,K2d,K3e],dir=0 解密轮序 [K3d,K2e,K1d] */
function tripleKeys(e: Uint8Array, dir: number): number[][][] {
  const k1 = e.subarray(0, 8)
  const k2 = e.subarray(8, 16)
  const k3 = e.subarray(16, 24)
  return dir === 1
    ? [keySchedule(k1, 1), keySchedule(k2, 0), keySchedule(k3, 1)]
    : [keySchedule(k3, 0), keySchedule(k2, 1), keySchedule(k1, 0)]
}

/** 3DES 逐块:三段密钥依次各处理一块 */
function desTriple(e: Uint8Array, keys: number[][][]): Uint8Array {
  let block = e
  for (let i = 0; i < 3; i++) block = desBlock(block, keys[i])
  return block
}

/** QRC 固定解密盐(24 字节) */
const QRC_KEY_SALT = '!@#)(*$%123ZXC!@!@#)(NHL'

/** QRC 密文(hex)→ 解密 → raw deflate 解压 → 明文 */
export function decryptQrcPayload(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed) throw new Error('QRC 密文为空')
  const data = new Uint8Array(trimmed.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
  if (data.length === 0) throw new Error('QRC 密文为空')
  const keys = tripleKeys(new TextEncoder().encode(QRC_KEY_SALT), 0)
  const out = new Uint8Array(data.length)
  for (let off = 0; off < data.length; off += 8) {
    const seg = data.subarray(off, Math.min(off + 8, data.length))
    let block = seg
    if (seg.length < 8) {
      block = new Uint8Array(8)
      block.set(seg)
    }
    const dec = desTriple(block, keys)
    out.set(dec.subarray(0, seg.length), off)
  }
  // 实测密文解出后带 zlib 头(78 9c),等价于 Web 的 DecompressionStream('deflate')
  try {
    return inflateSync(out).toString('utf-8')
  } catch {
    return inflateRawSync(out).toString('utf-8')
  }
}

// ============ QRC 文本解析 ============

/** 从 QRC XML 里抽 LyricContent 属性正文(失败则原样返回,由逐行正则兜底) */
function extractLyricContent(text: string): string {
  const m = /LyricContent="([\s\S]*)"\s*\/?>/.exec(text)
  return m ? m[1] : text
}

/**
 * 解析 QRC 逐字行,输出与 parseYrc 同构的 LyricLine:
 * - 行头 [行起点ms,行时长ms]
 * - 逐字标 (起点ms,时长ms[,0]) 既可能跟在字后(QQ 常见),也可能用 <> 放在字前
 * - wordTimes/words 语义与网易 YRC 完全一致(起点 ms,words 拼接为行文本)
 */
export function parseQrc(content: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const head = raw.match(/^\[(\d+),(\d+)\](.*)/)
    if (!head) continue
    const startMs = parseInt(head[1], 10)
    const body = head[3]

    // 逐字标与字文本按标点切段,再按「标在字后/字前」两种布局配对
    const tags: { startMs: number; durMs: number; segStart: number; segEnd: number }[] = []
    const re = /\((\d+),(\d+)(?:,\d+)?\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      tags.push({
        startMs: parseInt(m[1], 10),
        durMs: parseInt(m[2], 10),
        segStart: m.index,
        segEnd: m.index + m[0].length
      })
    }
    if (tags.length === 0) continue
    const segs: string[] = []
    let cursor = 0
    for (const t of tags) {
      segs.push(body.slice(cursor, t.segStart))
      cursor = t.segEnd
    }
    segs.push(body.slice(cursor))

    // 布局判断:首段非空且末段为空 → 标在字后(文本取标前);反之取标后
    const tagAfterWord = segs[0].trim().length > 0 && segs[segs.length - 1].trim().length === 0
    const tagBeforeWord = segs[0].trim().length === 0 && segs[segs.length - 1].trim().length > 0

    const words: { text: string; timeMs: number }[] = []
    for (let i = 0; i < tags.length; i++) {
      const before = segs[i] ?? ''
      const after = segs[i + 1] ?? ''
      let text: string
      if (tagAfterWord) text = before
      else if (tagBeforeWord || (after.trim().length > 0 && before.trim().length === 0)) text = after
      else if (before.trim().length > 0 && after.trim().length === 0) text = before
      else text = after.length >= before.length ? after : before
      if (!text) continue
      words.push({ text, timeMs: tags[i].startMs })
    }
    const text = words.map((w) => w.text).join('').trim()
    if (!text) continue
    lines.push({
      timeMs: startMs,
      text,
      wordTimes: words.map((w) => w.timeMs),
      words
    })
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

// ============ 请求链路 ============

interface QqTrackInfo {
  id: number
  name: string
  interval: number
  singer?: { name: string }[]
  album?: { name: string }
}

/** mid → 数字 id + 元信息(数字 id 是 GetPlayLyricInfo 的必填参数) */
async function getTrackInfoByMid(songMid: string): Promise<QqTrackInfo | null> {
  const resp = await fetch(
    `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${encodeURIComponent(songMid)}&platform=yqq&format=json`,
    {
      headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' },
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!resp.ok) throw new Error(`QQ音乐歌曲信息 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  const track = Array.isArray(json?.data) ? json.data[0] : json?.data
  const id = Number(track?.id ?? 0)
  if (!id || !track?.name) return null
  return {
    id,
    name: String(track.name),
    interval: Number(track.interval ?? 0),
    singer: track.singer,
    album: track.album
  }
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

/** 取 QRC 歌词密文(hex);无歌词/无 QRC 时 lyric 为空串 */
async function fetchQrcHex(track: QqTrackInfo): Promise<string> {
  // 「听屿」实测可用的移动端 comm(QQ音乐极速版 App 指纹),匿名即可拿到 QRC
  const comm = {
    ct: 11,
    cv: '1003006',
    v: '1003006',
    os_ver: '15',
    phonetype: '24122RKC7C',
    rom: 'Redmi/miro/miro:15/AE3A.240806.005/OS2.0.102.0.VOMCNXM:user/release-keys',
    tmeAppID: 'qqmusiclight',
    nettype: 'NETWORK_WIFI',
    udid: '0',
    uid: '0'
  }
  const req = {
    module: 'music.musichallSong.PlayLyricInfo',
    method: 'GetPlayLyricInfo',
    param: {
      albumName: b64(String(track.album?.name ?? '')),
      crypt: 1,
      ct: 19,
      cv: 2111,
      interval: Math.floor(track.interval || 0),
      lrc_t: 0,
      qrc: 1,
      qrc_t: 0,
      roma: 1,
      roma_t: 0,
      singerName: b64((track.singer ?? []).map((s) => s?.name ?? '').join(', ')),
      songID: track.id,
      songName: b64(track.name),
      trans: 1,
      trans_t: 0,
      type: 0
    }
  }
  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'tmeLoginType=-1;',
      'User-Agent': UA
    },
    body: JSON.stringify({ comm, req }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!resp.ok) throw new Error(`QQ音乐歌词 HTTP ${resp.status}`)
  const json = (await resp.json()) as any
  if (json?.code !== 0 || json?.req?.code !== 0) {
    throw new Error(`QQ音乐歌词接口错误 code=${json?.code ?? '?'}/${json?.req?.code ?? '?'}`)
  }
  return String(json?.req?.data?.lyric ?? '')
}

/** QRC 密文 → 明文文本(解密 + 解压 + 抽正文) */
async function fetchQrcText(track: QqTrackInfo): Promise<string | null> {
  const hex = await fetchQrcHex(track)
  if (!hex) return null
  const plain = decryptQrcPayload(hex)
  return extractLyricContent(plain)
}

/**
 * 跨平台首选:按「标题 + 歌手」到 QQ 音乐搜索,挑最匹配的一首取 QRC 逐字歌词。
 *
 * QQ 是目前唯一能稳定给到逐字时间轴的平台(网易云 yrc 覆盖不全),所以任何来源的歌
 * 都先来这里试一次;匹配用「标题完全相同 → 歌手包含 → 时长接近」打分,分数不够就放弃,
 * 宁可回退原平台歌词,也不要拿错版本的逐字。
 */
export async function findQqRichLyrics(
  title: string,
  artist: string,
  durationSec?: number
): Promise<LyricLine[] | null> {
  const kw = `${title} ${artist}`.trim()
  if (!kw) return null
  try {
    /**
     * QQ 搜索接口偶发返回空列表(突发请求/风控),必须重试 —— 否则跨平台找词会平白失败。
     * 实测风控窗口可达 1~2s,退避要够长(400/900/1800ms),否则连试三次全是空。
     */
    let cands: Awaited<ReturnType<typeof searchQqSongs>> = []
    const backoff = [0, 400, 900, 1800]
    for (let attempt = 0; attempt < backoff.length && cands.length === 0; attempt++) {
      if (backoff[attempt] > 0) await new Promise((r) => setTimeout(r, backoff[attempt]))
      try {
        cands = await searchQqSongs(kw, 1, 10)
      } catch {
        /* 单次失败继续退避重试 */
      }
    }
    if (cands.length === 0) return null
    const norm = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[\s\-_·・,，.。()（）[\]【】'"!！?？/]/g, '')
        .trim()
    const wantTitle = norm(title)
    const firstArtist = norm(artist.split(/[/、,&]/)[0] ?? artist)
    /** 现场/翻唱/伴奏/Remix 版本:同名时降权(逐字时间轴与录音室版对不上) */
    const isAltVersion = (s: string): boolean =>
      /\b(live|remix|acoustic|instrumental|karaoke|cover|demo|ver\.|version)\b/i.test(s) ||
      /现场|演唱会|伴奏|翻唱|纯音乐|混音|新版|旧版|重制|女声|男声|片段|剪辑/.test(s)
    let best: { song: (typeof cands)[number]; score: number } | null = null
    for (const c of cands) {
      if (!c.qqMid) continue
      const ct = norm(c.title)
      const ca = norm(c.artist)
      let score = 0
      if (ct === wantTitle) score += 60
      else if (ct.includes(wantTitle) || wantTitle.includes(ct)) score += 34
      else continue
      if (firstArtist && ca.includes(firstArtist)) score += 26
      else if (ca && firstArtist && firstArtist.includes(ca)) score += 16
      // 同名但不是原版(原曲名里本身含这些词时不罚,避免误伤)
      if (isAltVersion(c.title) && !isAltVersion(title)) score -= 25
      // 时长接近加分(同一版本通常差不到 5 秒);差 >15s 直接否决 —— 现场版/加长版/
      // 翻唱的时长几乎必然超出这个范围,旧规则只扣 20 分,照样能靠标题分过关
      if (durationSec && durationSec > 0 && c.duration > 0) {
        const d = Math.abs(c.duration - durationSec)
        if (d > 15) continue
        if (d <= 3) score += 22
        else if (d <= 8) score += 12
        else score -= 6
      }
      if (!best || score > best.score) best = { song: c, score }
    }
    // 60 = 标题完全一致;低于 60 说明只是包含关系,不够可靠
    if (!best || best.score < 60) return null
    const rich = await getQqRichLyrics(best.song.qqMid as string, best.song.qqId)
    const lines = rich?.lines ?? []
    if (lines.length === 0) return null
    return lines
  } catch (e) {
    console.warn('[QqLyrics] cross-platform search failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * QQ 原生逐字歌词主入口。
 * 成功返回带 words/wordTimes 的逐字行(与 parseYrc 输出同构);
 * 无歌词、无 QRC、解密/解析失败均返回 null(调用方回退网易云)。
 *
 * @param songMid QQ 歌曲 mid
 * @param songId  可选数字 id(调用方已知时可省一次 mid→id 查询)
 */
export async function getQqRichLyrics(
  songMid: string,
  songId?: number
): Promise<{ lines: LyricLine[] } | null> {
  try {
    let track: QqTrackInfo | null = null
    if (songId && songId > 0) {
      // 数字 id 已知:仍要歌名/歌手/时长拼参数,但失败不致命(置空即可)
      track = { id: songId, name: '', interval: 0 }
    }
    const info = await getTrackInfoByMid(songMid)
    if (info) track = info
    if (!track) return null

    const qrc = await fetchQrcText(track)
    if (!qrc) return null
    const lines = parseQrc(qrc)
    if (lines.length === 0) return null
    return { lines }
  } catch (e) {
    console.warn('[QqLyrics] fetch rich lyrics failed:', e instanceof Error ? e.message : e)
    return null
  }
}
