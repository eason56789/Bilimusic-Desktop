/**
 * 歌单同步增量计算(纯函数,便于单测)
 *
 * 语义:
 * - syncedIds 是上次同步拉到的远端歌曲快照;
 * - 同步时:快照里的、远端已消失的 → 移除;不在快照里的(手动加入的)→ 永远保留;
 * - 远端新增的 → 追加;
 * - fetchComplete=false(拉取出错/未登录)→ 只增不删,快照也不动,
 *   避免一次半途失败把上次的同步结果误判为"远端已删除"。
 */
export interface SyncPlan {
  /** 同步后的歌单 songIds */
  songIds: string[]
  /** 同步后的新快照(远端 ids);不完整拉取时保持旧快照 */
  syncedIds: string[]
  /** 新增进入歌单的数量 */
  added: number
  /** 移除的数量(已消失的远端歌曲) */
  removed: number
}

export function computeSyncPlan(
  currentIds: string[],
  prevSyncedIds: string[],
  remoteIds: string[],
  fetchComplete: boolean
): SyncPlan {
  const remote = new Set(remoteIds)

  if (!fetchComplete) {
    const current = new Set(currentIds)
    const additions = remoteIds.filter((id) => !current.has(id))
    return {
      songIds: [...currentIds, ...additions],
      syncedIds: [...prevSyncedIds],
      added: additions.length,
      removed: 0
    }
  }

  const prev = new Set(prevSyncedIds)
  // 保留:手动加入的(不在旧快照里)+ 仍在远端的
  const kept = currentIds.filter((id) => !prev.has(id) || remote.has(id))
  const keptSet = new Set(kept)
  const additions = remoteIds.filter((id) => !keptSet.has(id))
  const nextIds = [...kept, ...additions]
  const nextSet = new Set(nextIds)
  const removed = currentIds.filter((id) => !nextSet.has(id)).length
  return {
    songIds: nextIds,
    syncedIds: [...remoteIds],
    added: additions.length,
    removed
  }
}
