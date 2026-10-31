/**
 * 更新检查:GitHub release 版本与当前版本比较
 * 用 Electron net.fetch(Chromium 网络栈:走系统代理与系统证书库),
 * 本机 Node fetch 对 api.github.com 会因代理重签证书报 unable to verify
 */
import { app, net } from 'electron'
import type { UpdateCheckResult, UpdateInfo } from '@shared/types'

const OWNER = 'eason56789'
const REPO = 'Bilimusic-Desktop'

/** 语义化版本比较:a > b 返回 1,a < b 返回 -1,相等 0(忽略 v 前缀与非数字后缀) */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.\-+]/)
      .map((x) => parseInt(x, 10))
      .map((n) => (isFinite(n) ? n : 0))
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/**
 * 检查 GitHub release 相对当前版本的状态。
 * 三态返回:update(有更高版本)/ latest(已是最新)/ error(检查失败)。
 * 区分"没有新版本"与"没查到",渲染层才能如实提示,不会把网络故障说成最新。
 */
export async function checkUpdateDetailed(): Promise<UpdateCheckResult> {
  const current = app.getVersion()
  try {
    const resp = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    })
    // 404 = 仓库还没有任何 release:当作"暂无新版本",而不是失败
    if (resp.status === 404) return { status: 'latest', version: current }
    if (!resp.ok) return { status: 'error', message: `GitHub 返回 HTTP ${resp.status}` }
    const json = (await resp.json()) as {
      tag_name?: string
      body?: string
      html_url?: string
      published_at?: string
      assets?: { name?: string; browser_download_url?: string; size?: number }[]
    }
    const tag: string = String(json?.tag_name ?? '')
    if (!tag) return { status: 'latest', version: current }
    if (compareVersions(tag, current) <= 0) return { status: 'latest', version: current }
    // 下载直连安装包资产(不让用户再去 release 页面里找);
    // 只认 .exe 安装包,没有(或只有 zip/源码包)就退回 release 页面,避免打开错误资产
    const assets = Array.isArray(json?.assets) ? json.assets : []
    const exe = assets.find((a) => /\.exe$/i.test(a?.name ?? ''))
    const downloadUrl =
      exe?.browser_download_url ??
      String(json?.html_url ?? `https://github.com/${OWNER}/${REPO}/releases`)
    return {
      status: 'update',
      info: {
        version: tag.replace(/^v/i, ''),
        url: downloadUrl,
        notes: String(json?.body ?? ''),
        publishedAt: json?.published_at ? String(json.published_at) : undefined
      }
    }
  } catch (e) {
    console.log('[update] check failed:', e)
    return { status: 'error', message: '网络请求失败(可能无网络或无法访问 GitHub)' }
  }
}

/** 兼容入口:仅返回"有更新"的信息(无更新 / 检查失败均为 null) */
export async function checkUpdateAvailable(): Promise<UpdateInfo | null> {
  const r = await checkUpdateDetailed()
  return r.status === 'update' ? r.info : null
}
