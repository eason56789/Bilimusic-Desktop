/**
 * 更新检查:GitHub release 版本与当前版本比较
 * 用 Electron net.fetch(Chromium 网络栈:走系统代理与系统证书库),
 * 本机 Node fetch 对 api.github.com 会因代理重签证书报 unable to verify
 */
import { app, net } from 'electron'
import type { UpdateInfo } from '@shared/types'

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
 * 检查是否有新版本。返回 null = 已是最新 / 检查失败 / 用户已忽略该版本。
 * 骨架:失败静默(离线/被墙时不影响启动)。
 */
export async function checkUpdateAvailable(): Promise<UpdateInfo | null> {
  try {
    const current = app.getVersion()
    const resp = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as any
    const tag: string = String(json?.tag_name ?? '')
    if (!tag) return null
    if (compareVersions(tag, current) <= 0) return null
    return {
      version: tag.replace(/^v/i, ''),
      url: String(json?.html_url ?? `https://github.com/${OWNER}/${REPO}/releases`),
      notes: String(json?.body ?? ''),
      publishedAt: json?.published_at ? String(json.published_at) : undefined
    }
  } catch (e) {
    console.log('[update] check failed:', e)
    return null
  }
}
