/** GitHub Release 发布:创建 v1.0.0 tag + 上传安装包 asset
 *  用法:GH_TOKEN=... node tests/publish-release.mjs
 *  token 仅从环境变量读取,绝不落盘
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const OWNER = 'eason56789'
const REPO = 'Bilimusic-Desktop'
const TAG = 'v1.0.0'
const ASSET = resolve('release/BiliMusic-1.0.0-setup.exe')

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN missing')
  process.exit(1)
}
if (!existsSync(ASSET)) {
  console.error('installer not found: ' + ASSET)
  process.exit(1)
}

const api = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bili-music-release',
      ...(init.headers ?? {})
    }
  })

const body = [
  'BiliMusic Desktop 1.0.0 — 双平台音乐播放器(哔哩哔哩 / 网易云音乐 / QQ音乐 / 酷狗)', '',
  '## 功能亮点', '- 搜索、播放、下载、歌词(KTV 逐字 / 居中 / 靠左)、频谱、均衡器',
  '- 网易云歌单同步;B站收藏夹与播放记录在线视图(登录即显示,打开时拉取,播放记录下翻分页)',
  '- 链接导入歌单:网易云 / QQ音乐(含手机端 taoge 分享与 App 短链) / 酷狗',
  '- B站分P播放、登录扫码、备份与恢复、恢复出厂设置', '',
  '## 修复', '- B站收藏夹 / 播放记录接口 -400(up_mid 真实 uid、history type=archive、设备 cookie)',
  '- B站评论时间显示为 1970(秒/毫秒单位错误)',
  '- KTV 歌词:有逐词数据逐字点亮,无逐词整句全亮;歌词行错位与轮换过快',
  '- 歌单详情副标题重复计数;左侧菜单栏设置项不可再被隐藏', '',
  '## 校验', '- SHA256 见 release 页下方 (后续如需补 checksum 可再补)'
].join('\n')

// 1. 已存在该 tag 的 release 则复用,否则创建
let rel = await (await api(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`)).json()
if (!rel.id) {
  const r = await api(`/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: TAG,
      name: 'BiliMusic Desktop v1.0.0',
      body,
      draft: false,
      prerelease: false
    })
  })
  rel = await r.json()
  if (!rel.id) {
    console.error('create release failed:', JSON.stringify(rel).slice(0, 500))
    process.exit(1)
  }
  console.log('RELEASE_CREATED id=' + rel.id)
} else {
  console.log('RELEASE_EXISTS id=' + rel.id)
}

// 2. 上传 asset(已存在同名则先删再传,保证内容最新)
const size = statSync(ASSET).size
console.log(`asset: ${basename(ASSET)} ${size} bytes`)
const listing = await (await api(`/repos/${OWNER}/${REPO}/releases/${rel.id}/assets`)).json()
for (const a of listing ?? []) {
  if (a.name === basename(ASSET)) {
    await api(`/repos/${OWNER}/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
    console.log('deleted old asset id=' + a.id)
  }
}

const data = readFileSync(ASSET)
// upload_url 是完整绝对地址(uploads.github.com),不能再套 api() 的前缀
const up = await fetch(
  `${rel.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(basename(ASSET))}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bili-music-release',
      'Content-Type': 'application/octet-stream'
    },
    body: data
  }
)
const asset = await up.json()
if (!asset.id) {
  console.error('upload failed:', up.status, JSON.stringify(asset).slice(0, 500))
  process.exit(1)
}
console.log('ASSET_OK id=' + asset.id + ' size=' + asset.size)
console.log('RELEASE_URL ' + rel.html_url)
