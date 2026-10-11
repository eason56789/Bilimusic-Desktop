/**
 * B站 App gRPC 评论接口(参考 PiliPlus 的 GrpcReq/GrpcHeaders 实现):
 *   POST https://grpc.biliapi.net/bilibili.main.community.reply.v1.Reply/MainList
 *
 * 为什么用它:评论"时间排序"在 Web 侧(x/v2/reply/wbi/main)匿名只给 3 条,
 * 而 App gRPC 匿名可拿全量(时间/热度都行),分页用数值 cursor,无需登录。
 *
 * 关键点(全部对照 PiliPlus 源码,字段号来自其 proto 生成文件):
 * - 请求头需要 x-bili-device-bin / metadata-bin / locale-bin 等 protobuf 元数据
 * - buvid 需先经 /x/internal/gaia-gateway/ExClimbWuzhi 激活
 * - body 为 gRPC 帧(1B 压缩标志 + 4B 大端长度 + protobuf)
 * - MainListReq{oid=1, type=2, cursor=3{next=1, mode=4}},Mode: 2=时间 3=热度
 * - MainListReply{cursor=1{next=1,isEnd=4}, replies=2, subjectControl=3{count=16}, upTop=4}
 */
import http2 from 'node:http2'
import zlib from 'node:zlib'

export interface GrpcReplyItem {
  id: string
  user: string
  avatar: string
  /** 评论内容(纯文本) */
  content: string
  /** 发布时间(Unix 秒) */
  time: number
  likes: number
  isUpTop: boolean
}

export interface GrpcReplyPage {
  total: number
  next: number
  isEnd: boolean
  replies: GrpcReplyItem[]
}

/** PiliPlus 同款 App UA(android_hd 2.0.1) */
const UA_APP =
  'Mozilla/5.0 BiliDroid/2.0.1 (bbcallen@gmail.com) os/android model/android_hd mobi_app/android_hd build/2001100 channel/master innerVer/2001100 osVer/15 network/2'

/** buvid3 = UUIDv4(大写) + 5位数字 + 'infoc'(PiliPlus IdUtils.genBuvid3 同款格式) */
export function genBuvid3(): string {
  const h = '0123456789abcdef'
  let u = ''
  for (let i = 0; i < 32; i++) u += h[Math.floor(Math.random() * 16)]
  // 保证 v4 格式:第13位='4',第17位∈[89ab]
  u = u.slice(0, 12) + '4' + u.slice(13, 16) + '89ab'[Math.floor(Math.random() * 4)] + u.slice(17)
  const uuid = [u.slice(0, 8), u.slice(8, 12), u.slice(12, 16), u.slice(16, 20), u.slice(20)].join('-')
  return uuid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0') + 'infoc'
}

/**
 * 激活 buvid(匿名指纹首次使用前调一次,失败不阻塞——部分接口未激活也可用)
 * POST /x/internal/gaia-gateway/ExClimbWuzhi,payload 为 risk 指纹 JSON
 */
export async function activateBuvid(buvid: string): Promise<boolean> {
  const bytes: number[] = []
  for (let i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256))
  bytes.push(0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44) // IEND
  for (let i = 0; i < 4; i++) bytes.push(Math.floor(Math.random() * 256))
  const b64 = Buffer.from(bytes).toString('base64')
  const payload = JSON.stringify({
    3064: 1,
    '39c8': '333.1387.fp.risk',
    '3c43': { adca: 'Linux', bfe9: b64.slice(b64.length - 50) }
  })
  try {
    const resp = await fetch('https://api.bilibili.com/x/internal/gaia-gateway/ExClimbWuzhi', {
      method: 'POST',
      headers: {
        'user-agent': 'Dart/3.6 (dart:io)',
        'accept-encoding': 'gzip',
        env: 'prod',
        'app-key': 'android64',
        'x-bili-aurora-zone': 'sh001',
        referer: 'https://www.bilibili.com',
        'content-type': 'application/json; charset=utf-8',
        cookie: 'buvid3=' + buvid
      },
      body: JSON.stringify({ payload })
    })
    const json = (await resp.json().catch(() => ({}))) as { code?: number }
    return json.code === 0
  } catch {
    return false
  }
}

// ---------- protobuf 编码(最小实现) ----------
const varint = (n: bigint): Buffer => {
  const out: number[] = []
  do {
    let b = Number(n & 0x7fn)
    n >>= 7n
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return Buffer.from(out)
}
const tag = (f: number, w: number): Buffer => varint(BigInt((f << 3) | w))
const pstr = (f: number, s: string): Buffer => {
  if (!s) return Buffer.alloc(0)
  const b = Buffer.from(s)
  return Buffer.concat([tag(f, 2), varint(BigInt(b.length)), b])
}
const pInt = (f: number, v: number): Buffer =>
  v ? Buffer.concat([tag(f, 0), varint(BigInt(v))]) : Buffer.alloc(0)
const pMsg = (f: number, body: Buffer): Buffer =>
  body.length ? Buffer.concat([tag(f, 2), varint(BigInt(body.length)), body]) : Buffer.alloc(0)

// ---------- protobuf 解码(wire 泛用) ----------
function readVarint(buf: Buffer, off: number): [bigint, number] {
  let r = 0n
  let sh = 0n
  for (;;) {
    const b = buf[off++]
    r |= BigInt(b & 0x7f) << sh
    if (!(b & 0x80)) return [r, off]
    sh += 7n
  }
}
interface WireField {
  f: number
  v?: bigint
  b?: Buffer
}
function parseWire(buf: Buffer): WireField[] {
  const out: WireField[] = []
  let o = 0
  while (o < buf.length) {
    const [k, o1] = readVarint(buf, o)
    const f = Number(k >> 3n)
    const w = Number(k & 7n)
    o = o1
    if (w === 0) {
      const [v, o2] = readVarint(buf, o)
      out.push({ f, v })
      o = o2
    } else if (w === 2) {
      const [l, o2] = readVarint(buf, o)
      const n = Number(l)
      out.push({ f, b: buf.subarray(o2, o2 + n) })
      o = o2 + n
    } else if (w === 5) {
      out.push({ f })
      o += 4
    } else if (w === 1) {
      out.push({ f })
      o += 8
    } else {
      break
    }
  }
  return out
}
const fFields = (buf: Buffer, f: number): WireField[] => parseWire(buf).filter((x) => x.f === f)
const fStr = (buf: Buffer, f: number): string => fFields(buf, f)[0]?.b?.toString('utf8') ?? ''
const fInt = (buf: Buffer, f: number): number => Number(fFields(buf, f)[0]?.v ?? 0n)
const fBool = (buf: Buffer, f: number): boolean => fFields(buf, f).some((x) => (x.v ?? 0n) > 0n)
const fMsgs = (buf: Buffer, f: number): Buffer[] => fFields(buf, f).map((x) => x.b ?? Buffer.alloc(0))

/** 设备元数据(x-bili-device-bin 等,与 PiliPlus GrpcHeaders 一致) */
function buildGrpcHeaders(buvid: string): Record<string, string> {
  const device = Buffer.concat([
    pInt(1, 5), // appId
    pInt(2, 2001100), // build
    pstr(3, buvid),
    pstr(4, 'android_hd'), // mobiApp
    pstr(5, 'android'), // platform
    pstr(6, 'android'), // device
    pstr(7, 'master'), // channel
    pstr(8, 'android'), // brand
    pstr(9, 'android'), // model
    pstr(10, '15'), // osver
    pstr(13, '2.0.1') // versionName
  ])
  const metadata = Buffer.concat([
    pstr(2, 'android_hd'), // mobiApp
    pstr(3, 'android'), // device
    pInt(4, 2001100), // build
    pstr(5, 'master'), // channel
    pstr(6, buvid),
    pstr(7, 'android') // platform
  ])
  const localeIds = Buffer.concat([pstr(1, 'zh'), pstr(3, 'CN'), pstr(2, 'Hans')])
  const locale = Buffer.concat([
    pMsg(1, localeIds),
    pMsg(2, localeIds),
    pstr(4, 'Asia/Shanghai')
  ])
  const fawkes = Buffer.concat([
    pstr(1, 'android_hd'),
    pstr(2, 'prod'),
    pstr(3, Math.random().toString(36).slice(2, 10)) // sessionId
  ])
  return {
    'content-type': 'application/grpc',
    te: 'trailers',
    'grpc-encoding': 'identity',
    'grpc-accept-encoding': 'gzip,identity',
    'gzip-accept-encoding': 'gzip,identity',
    'accept-encoding': 'br,gzip',
    'user-agent': UA_APP,
    'x-bili-gaia-vtoken': '',
    'x-bili-aurora-zone': '',
    'x-bili-trace-id': '11111111111111111111111111111111:1111111111111111:0:0',
    buvid,
    'bili-http-engine': 'cronet',
    'x-bili-device-bin': device.toString('base64'),
    'x-bili-network-bin': pInt(1, 1).toString('base64'), // Network{type:WIFI}
    'x-bili-locale-bin': locale.toString('base64'),
    'x-bili-exps-bin': '',
    'x-bili-fawkes-req-bin': fawkes.toString('base64'),
    'x-bili-metadata-bin': metadata.toString('base64')
  }
}

/** 解析单条 ReplyInfo(gRPC) */
function decodeReply(b: Buffer): GrpcReplyItem {
  const member = fFields(b, 13)[0]?.b ?? Buffer.alloc(0)
  const content = fFields(b, 12)[0]?.b ?? Buffer.alloc(0)
  const control = fFields(b, 14)[0]?.b
  return {
    id: String(fInt(b, 2)),
    user: fStr(member, 2),
    avatar: fStr(member, 4),
    content: fStr(content, 1),
    time: fInt(b, 10),
    likes: fInt(b, 9),
    isUpTop: control ? fBool(control, 12) : false
  }
}

/** gRPC 单次调用(10s 超时),grpc-status != 0 时抛错(带服务端消息) */
function grpcCall(buvid: string, reqBody: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      try {
        client.close()
      } catch {
        /* ignore */
      }
      fn()
    }
    const client = http2.connect('https://grpc.biliapi.net')
    client.on('error', (e) => done(() => reject(e)))
    const req = client.request({
      ':method': 'POST',
      ':path': '/bilibili.main.community.reply.v1.Reply/MainList',
      ...buildGrpcHeaders(buvid)
    })
    const chunks: Buffer[] = []
    let trailers: http2.IncomingHttpHeaders | null = null
    let respHeaders: http2.IncomingHttpHeaders | null = null
    req.on('response', (h) => {
      respHeaders = h
    })
    req.on('data', (c) => chunks.push(c))
    req.on('trailers', (t) => {
      trailers = t
    })
    req.on('end', () =>
      done(() => {
        const gs = trailers?.['grpc-status'] ?? respHeaders?.['grpc-status']
        if (gs !== undefined && gs !== '0') {
          const gm = decodeURIComponent(
            String(trailers?.['grpc-message'] ?? respHeaders?.['grpc-message'] ?? '')
          )
          reject(new Error('grpc ' + gs + (gm ? ': ' + gm : '')))
          return
        }
        const buf = Buffer.concat(chunks)
        if (buf.length < 5) {
          reject(new Error('grpc short body'))
          return
        }
        const flag = buf[0]
        const len = buf.readInt32BE(1)
        let proto = buf.subarray(5, 5 + len)
        try {
          if (flag === 1) proto = zlib.gunzipSync(proto)
        } catch (e) {
          reject(e)
          return
        }
        resolve(proto)
      })
    )
    req.on('error', (e) => done(() => reject(e)))
    // gRPC 帧:1B 压缩标志(0=未压缩) + 4B 大端长度 + protobuf
    const frame = Buffer.alloc(5 + reqBody.length)
    frame[0] = 0
    frame.writeInt32BE(reqBody.length, 1)
    reqBody.copy(frame, 5)
    req.write(frame)
    req.end()
    setTimeout(() => done(() => reject(new Error('grpc timeout'))), 10_000).unref()
  })
}

/**
 * 评论主列表(匿名可全量)。mode: 2=时间 3=热度;next=数值游标,首页传 0。
 * 失败抛错由调用方兜底走 Web 接口。
 */
export async function fetchReplyMain(opts: {
  aid: number
  mode: 2 | 3
  next: number
  buvid: string
}): Promise<GrpcReplyPage> {
  const cursor = Buffer.concat([pInt(4, opts.mode), pInt(1, opts.next)])
  const reqBody = Buffer.concat([pInt(1, opts.aid), pInt(2, 1), pMsg(3, cursor)])
  const proto = await grpcCall(opts.buvid, reqBody)
  const cursorBuf = fFields(proto, 1)[0]?.b
  const countBuf = fFields(proto, 3)[0]?.b
  const replies: GrpcReplyItem[] = []
  // 置顶评论(upTop)排在最前(仅首页携带)
  for (const up of fFields(proto, 4)) {
    if (up.b) replies.push(decodeReply(up.b))
  }
  for (const r of fMsgs(proto, 2)) replies.push(decodeReply(r))
  return {
    total: countBuf ? fInt(countBuf, 16) : 0,
    next: cursorBuf ? fInt(cursorBuf, 1) : 0,
    isEnd: cursorBuf ? fBool(cursorBuf, 4) : true,
    replies
  }
}
