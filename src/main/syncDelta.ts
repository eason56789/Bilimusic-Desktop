/**
 * 歌单同步增量计算(纯函数,便于单测)
 *
 * 语义:
 * - syncedIds 是上次同步拉到的远端歌曲快照;
 * - 同步时:快照里的、远端已消失的 → 移除;不在快照里的(手动加入的)→ 永远保留;
 * - 完整拉取时顺序以远端为准(同步来的歌单就该跟源歌单同序),
 *   自己额外加的那些(不在旧快照里、远端也没有)整体留在末尾;
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
  const current = new Set(currentIds)
  // 顺序以远端为准:以前是把远端新增的整套追加到 kept 后面,
  // 于是"同步"后顺序变成 [本地留下的旧序, 远端新增],和源歌单对不上。
  // 现在直接按 remoteIds 排,只把"自己额外加的歌"(不在旧快照里、远端也没有)
  // 整体接在末尾 —— 既不丢手动加的歌,也不再打乱源歌单顺序。
  const manualOnly = currentIds.filter((id) => !prev.has(id) && !remote.has(id))
  const nextIds = [...remoteIds, ...manualOnly]
  const nextSet = new Set(nextIds)
  const additions = remoteIds.filter((id) => !current.has(id))
  const removed = currentIds.filter((id) => !nextSet.has(id)).length
  return {
    songIds: nextIds,
    syncedIds: [...remoteIds],
    added: additions.length,
    removed
  }
}
