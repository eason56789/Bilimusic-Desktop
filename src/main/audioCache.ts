/**
 * 音频缓存目录的容量治理(纯 fs,不依赖 electron)。
 *
 * 为什么单独拆一个模块:audio.ts 在顶层 import 了 electron(app / protocol),
 * 想用脚本直接验证淘汰逻辑就得把整个 electron 运行时拖进来。把这段纯文件系统逻辑
 * 挪出来之后,单测和临时脚本都能直接调用真实的实现,而不是照抄一份"差不多的"。
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/** 音频缓存总容量上限(默认 512MB,超出后按最久未使用淘汰) */
export const AUDIO_CACHE_MAX_BYTES = 512 * 1024 * 1024

type Entry = { path: string; size: number; mtime: number }

/**
 * 把 dir 压到上限以内:按 mtime 从旧到新删,直到总量 <= maxBytes。
 *
 * 为什么需要:每次播放 B 站歌都会把整段音频落进 cache/audio,而原先只有设置里的
 * 手动「清空缓存」,没有任何自动淘汰 —— 长期使用只增不减(实测已 710MB)。
 * 正在播放的文件在 Windows 上被占用,unlink 会失败:逐文件吞掉异常跳过,
 * 不能因为一个被占用的文件就中断整体清理,等下一轮再收。
 *
 * 返回删除的文件数,便于打日志和验证。
 */
export function pruneAudioCacheDir(dir: string, maxBytes = AUDIO_CACHE_MAX_BYTES): number {
  if (dir === '') return 0
  let entries: Entry[] = []
  try {
    entries = readdirSync(dir)
      .map((f): Entry | null => {
        const p = join(dir, f)
        try {
          const st = statSync(p)
          return st.isFile() ? { path: p, size: st.size, mtime: st.mtimeMs } : null
        } catch {
          return null
        }
      })
      .filter((e): e is Entry => e !== null)
  } catch (e) {
    console.error('[AudioCache] read cache dir error', e)
    return 0
  }
  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= maxBytes) return 0
  entries.sort((a, b) => a.mtime - b.mtime)
  let removed = 0
  for (const e of entries) {
    if (total <= maxBytes) break
    try {
      unlinkSync(e.path)
      total -= e.size
      removed++
    } catch {
      /* 被播放占用:跳过,下一轮再收 */
    }
  }
  return removed
}
