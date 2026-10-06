/** 歌单页:本地歌单管理 + B站收藏夹/网易云歌单导入 + 最近播放 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Text,
  makeStyles,
  tokens,
  Spinner,
  Tooltip
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  CloudArrowDownRegular,
  DeleteRegular,
  EditRegular,
  HeartRegular,
  HistoryRegular,
  MusicNote2Regular,
  OpenRegular,
  PlayRegular,
  QrCodeRegular,
  SaveRegular
} from '@fluentui/react-icons'
import type { Playlist, Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'
import { Cover } from '../components/Cover'
import { PageLayout, PageHeader } from '../components/PageHeader'
import { BiliLoginDialog, NeteaseLoginDialog } from '../components/LoginDialogs'
import { toastError, toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px', gap: '16px' },
  scroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  card: { padding: '12px', cursor: 'pointer', ':hover': { transform: 'translateY(-2px)' } },
  actionsRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  header: { display: 'flex', alignItems: 'center', gap: '16px' },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    padding: '48px 0'
  }
})

/** B站在线视图入口:播放记录 / 某个收藏夹(登录即出现,打开才拉数据) */
export type RemoteView =
  | { kind: 'history' }
  | { kind: 'fav'; id: number; title: string; coverUrl?: string; count: number }

/**
 * B站在线歌单详情:打开时拉第一页(20条),滚动接近底部自动加载下一页。
 * 「保存为本地歌单」把当前已加载内容快照成本地歌单(替代旧的导入)。
 */
function RemotePlaylistDetail({ view, onBack }: { view: RemoteView; onBack: () => void }) {
  const styles = useStyles()
  const playQueue = useStore((s) => s.playQueue)
  const refresh = useStore((s) => s.refreshLibrary)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const animCls = anim !== 'none' ? `page-anim-${anim}` : undefined
  const [songs, setSongs] = useState<Song[]>([])
  const [total, setTotal] = useState(view.kind === 'fav' ? view.count : 0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [saving, setSaving] = useState(false)
  const loadingRef = useRef(false)
  const cursor = useRef({ max: '0', viewAt: '0' })
  const pageRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      if (view.kind === 'history') {
        const r = await api.biliHistoryPage(cursor.current.max, cursor.current.viewAt)
        if (r.notLoggedIn) {
          toastError('需要登录', '请先在「设置 → 账号」中登录哔哩哔哩')
          setHasMore(false)
        } else {
          setSongs((prev) => [...prev, ...r.songs])
          cursor.current = { max: r.nextMax, viewAt: r.nextViewAt }
          setHasMore(r.hasMore)
        }
      } else {
        const r = await api.biliFavPage(view.id, pageRef.current)
        setSongs((prev) => [...prev, ...r.songs])
        // 接口 total 可能为 0:优先保留入口卡带来的真实计数
        setTotal((prev) => (r.total > 0 ? r.total : prev))
        pageRef.current += 1
        setHasMore(r.hasMore)
      }
    } catch (e) {
      toastError('加载失败', String(e))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // 打开时拉第一页
  useEffect(() => {
    setSongs([])
    setTotal(view.kind === 'fav' ? view.count : 0)
    pageRef.current = 1
    cursor.current = { max: '0', viewAt: '0' }
    setHasMore(true)
    void loadMore()
  }, [view, loadMore])

  // 无限下翻:接近底部加载下一页
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el || !hasMore || loadingRef.current) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) void loadMore()
  }

  /** 快照为本地歌单(此后可离线管理/手动同步) */
  const saveLocal = async (): Promise<void> => {
    if (saving || songs.length === 0) return
    setSaving(true)
    try {
      const name = view.kind === 'history' ? 'B站播放记录' : view.title
      const pl = await api.libraryCreatePlaylist(name)
      await api.libraryAddToPlaylist(pl.id, songs)
      await refresh()
      toastSuccess('已保存为本地歌单', `${name} · ${songs.length} 首`)
    } catch (e) {
      toastError('保存失败', String(e))
    } finally {
      setSaving(false)
    }
  }

  const title = view.kind === 'history' ? 'B站播放记录' : view.title
  return (
    <div
      key={`remote-${view.kind}-${view.kind === 'fav' ? view.id : ''}`}
      className={animCls}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div className={styles.root}>
        <div className={styles.header}>
          <Tooltip content="返回" relationship="label">
            <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} />
          </Tooltip>
          {view.kind === 'fav' && view.coverUrl ? (
            <Cover url={view.coverUrl} size={64} radius={8} iconSize={28} />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                background: 'rgba(251,114,153,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fb7299',
                flexShrink: 0
              }}
            >
              <HistoryRegular fontSize={28} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size={600} weight="semibold">
              {title}
            </Text>
            <div>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {view.kind === 'fav' ? `${total} 个收藏` : '最近观看 · 下翻加载更多'}
              </Text>
            </div>
          </div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={songs.length === 0}
            onClick={() => playQueue(songs, 0)}
          >
            播放已加载
          </Button>
          <Tooltip content="把已加载内容快照为本地歌单" relationship="label">
            <Button icon={<SaveRegular />} disabled={saving || songs.length === 0} onClick={() => void saveLocal()}>
              保存为本地
            </Button>
          </Tooltip>
        </div>
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          {songs.length > 0 ? (
            <SongList songs={songs} showAlbum />
          ) : loading ? null : (
            <div className={styles.empty}>
              <HistoryRegular fontSize={40} />
              <Text size={400}>{view.kind === 'fav' ? '收藏夹是空的' : '暂无播放记录'}</Text>
            </div>
          )}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Spinner />
            </div>
          )}
          {!loading && !hasMore && songs.length > 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                没有更多了
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function PlaylistsPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const animCls = anim !== 'none' ? `page-anim-${anim}` : undefined
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [importOpen, setImportOpen] = useState<'netease' | null>(null)
  const [biliLoginOpen, setBiliLoginOpen] = useState(false)
  const [neLoginOpen, setNeLoginOpen] = useState(false)
  const [nePlaylists, setNePlaylists] = useState<{ id: number; name: string; count: number }[]>([])
  const [importing, setImporting] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Playlist | null>(null)
  const [renameValue, setRenameValue] = useState('')
  /** 待删除确认的歌单(删除不可撤销,先确认) */
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null)
  /** 同步中歌单 id / 链接导入对话框 */
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  /** B站在线视图:登录后出现,打开时才拉数据 */
  const [biliFolders, setBiliFolders] = useState<
    { id: number; title: string; coverUrl?: string; songCount: number }[] | null
  >(null)
  const [remoteView, setRemoteView] = useState<RemoteView | null>(null)

  /** 登录B站后进入歌单页即拉收藏夹列表(仅元数据;内容点开才取) */
  useEffect(() => {
    if (!library?.biliProfile || biliFolders) return
    api
      .biliFavFolders()
      .then(setBiliFolders)
      .catch(() => setBiliFolders([]))
  }, [library?.biliProfile, biliFolders])

  if (!library) return null

  /** 是否可同步(B站收藏夹 / 网易云歌单 / 播放记录) */
  const isSyncable = (pl: Playlist | null | undefined): boolean =>
    !!(pl && (pl.favoriteFolderId || pl.neteasePlaylistId || pl.biliHistory))

  /** 同步一个歌单(远端增量拉取,保留手动加入的歌曲) */
  const syncOne = async (pl: Playlist): Promise<void> => {
    if (syncingId) return
    setSyncingId(pl.id)
    try {
      const r = await api.librarySyncPlaylist(pl.id)
      if (r.ok && r.data) {
        await refresh()
        toastSuccess(
          '同步完成',
          `新增 ${r.data.added} 首 · 移除 ${r.data.removed} 首 · 共 ${r.data.total} 首`
        )
      } else {
        toastError('同步失败', r.error)
      }
    } catch (e) {
      toastError('同步失败', String(e))
    } finally {
      setSyncingId(null)
    }
  }

  /** 通过分享链接导入歌单(网易云/QQ音乐/酷狗) */
  const importByLink = async (): Promise<void> => {
    const v = linkValue.trim()
    if (!v || linkBusy) return
    setLinkBusy(true)
    try {
      const r = await api.playlistImportByLink(v)
      if (r.ok && r.data) {
        await refresh()
        toastSuccess('歌单已导入', `${r.data.name} · ${r.data.count} 首`)
        setLinkOpen(false)
        setLinkValue('')
      } else {
        toastError('导入失败', r.error)
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setLinkBusy(false)
    }
  }

  const openNeteaseImport = async () => {
    if (!library.neteaseProfile) {
      setNeLoginOpen(true)
      return
    }
    setImportOpen('netease')
    setNePlaylists([])
    const list = await api.neteaseUserPlaylists()
    if (list.ok && list.data) setNePlaylists(list.data)
    else toastError('获取歌单失败', list.error)
  }

  const doImport = async (id: number, name: string) => {
    setImporting(true)
    try {
      const pl = await api.importNeteasePlaylist(id, name)
      if (pl) {
        await refresh()
        toastSuccess('导入成功', `${name} · ${pl.songIds.length} 首`)
        setImportOpen(null)
      } else {
        toastError('导入失败', '内容为空或获取失败')
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setImporting(false)
    }
  }

  const createPlaylist = async () => {
    const name = newName.trim()
    if (!name) return
    await api.libraryCreatePlaylist(name)
    setNewName('')
    setCreateOpen(false)
    await refresh()
    toastSuccess('歌单已创建', name)
  }

  const deletePlaylist = async (pl: Playlist) => {
    await api.libraryDeletePlaylist(pl.id)
    setDeleteTarget(null)
    setSelected(null)
    await refresh()
    toastSuccess('歌单已删除', pl.name)
  }

  const renamePlaylist = async () => {
    if (!renameTarget) return
    await api.libraryUpdatePlaylist({ id: renameTarget.id, name: renameValue.trim() || renameTarget.name })
    setRenameTarget(null)
    await refresh()
  }

  // ===== B站在线视图(登录即出现,打开才拉数据) =====
  if (remoteView) {
    return <RemotePlaylistDetail view={remoteView} onBack={() => setRemoteView(null)} />
  }

  // ===== 歌单详情(进出有过渡动画:key 变化触发重挂载) =====
  if (selected) {
    const current = library.playlists.find((p) => p.id === selected.id)
    const songs: Song[] = (current?.songIds ?? [])
      .map((id) => library.songs[id])
      .filter(Boolean)
    return (
      <div
        key={`detail-${selected.id}`}
        className={animCls}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
      <div className={styles.root}>
        <div className={styles.header}>
          <Tooltip content="返回" relationship="label">
            <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setSelected(null)} />
          </Tooltip>
          <Cover url={current?.coverUrl} size={64} radius={8} iconSize={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size={600} weight="semibold">
              {current?.name}
            </Text>
            <div>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {/* 描述为空时不显示多余的分隔符;老数据描述里带"N首",避免与右侧计数重复 */}
                {[current?.description?.replace(/ · \d+\s*首$/, ''), `${songs.length} 首`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </div>
          </div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={songs.length === 0}
            onClick={() => playQueue(songs, 0)}
          >
            播放全部
          </Button>
          {current && isSyncable(current) && (
            <Button
              icon={
                syncingId === current.id ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />
              }
              disabled={syncingId !== null}
              onClick={() => void syncOne(current)}
            >
              {syncingId === current.id ? '同步中…' : '同步'}
            </Button>
          )}
          <Tooltip content="重命名" relationship="label">
            <Button
              appearance="subtle"
              icon={<EditRegular />}
              disabled={!current}
              onClick={() => {
                if (!current) return
                setRenameValue(current.name)
                setRenameTarget(current)
              }}
            />
          </Tooltip>
          <Tooltip content="删除歌单" relationship="label">
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={!current}
              onClick={() => setDeleteTarget(current ?? null)}
            />
          </Tooltip>
        </div>
        <div className={styles.scroll}>
          {songs.length > 0 ? (
            <SongList
              songs={songs}
              onRemove={async (song) => {
                await api.libraryRemoveFromPlaylist(current!.id, song.id)
                await refresh()
              }}
            />
          ) : (
            <div className={styles.empty}>
              <MusicNote2Regular fontSize={40} />
              <Text size={400}>歌单还是空的</Text>
              <Text size={300}>去搜索页添加歌曲,或导入B站收藏夹/网易云歌单</Text>
            </div>
          )}
        </div>
        {/* 删除确认:歌单删除不可撤销 */}
        <Dialog open={!!deleteTarget} onOpenChange={(_, d) => !d.open && setDeleteTarget(null)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>删除歌单</DialogTitle>
              <DialogContent>
                <Text>
                  确定删除歌单「{deleteTarget?.name}」吗?该操作不可撤销(歌曲本身不会从曲库移除)。
                </Text>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDeleteTarget(null)}>取消</Button>
                <Button
                  appearance="primary"
                  onClick={() => deleteTarget && void deletePlaylist(deleteTarget)}
                >
                  删除
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={!!renameTarget} onOpenChange={(_, d) => !d.open && setRenameTarget(null)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>重命名歌单</DialogTitle>
              <DialogContent>
                <Input value={renameValue} onChange={(_, d) => setRenameValue(d.value)} style={{ width: '100%' }} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRenameTarget(null)}>取消</Button>
                <Button appearance="primary" onClick={renamePlaylist}>
                  确定
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
        <BiliLoginDialog open={biliLoginOpen} onClose={() => setBiliLoginOpen(false)} />
        <NeteaseLoginDialog open={neLoginOpen} onClose={() => setNeLoginOpen(false)} />
      </div>
      </div>
    )
  }

  // ===== 歌单列表 =====
  return (
    <div
      key="list"
      className={animCls}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
    <PageLayout
      icon={<MusicNote2Regular />}
      title="我的歌单"
      subtitle={`${library.playlists.length} 个歌单`}
      actions={
        <>
          <Button icon={<CloudArrowDownRegular />} onClick={openNeteaseImport}>
            导入网易云歌单
          </Button>
          <Button icon={<OpenRegular />} onClick={() => setLinkOpen(true)}>
            链接导入
          </Button>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setCreateOpen(true)}>
            新建歌单
          </Button>
        </>
      }
    >
      {/* 歌单网格:本地歌单与B站在线条目同层级混排 */}
      <div className={styles.grid}>
        {library.playlists.map((pl) => (
          <Card key={pl.id} className={styles.card} onClick={() => setSelected(pl)}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Cover url={pl.coverUrl} size={56} radius={8} iconSize={24} />
              <div style={{ minWidth: 0 }}>
                <Text
                  weight="semibold"
                  style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {pl.name}
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {pl.songIds.length} 首
                </Text>
              </div>
            </div>
          </Card>
        ))}

        {/* B站在线条目:登录即出现,打开才拉数据 */}
        {library.biliProfile ? (
          <>
            <Card key="bili-history" className={styles.card} onClick={() => setRemoteView({ kind: 'history' })}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: 'rgba(251,114,153,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fb7299',
                    flexShrink: 0
                  }}
                >
                  <HistoryRegular fontSize={24} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text
                    weight="semibold"
                    style={{
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    播放记录
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    最近观看 · 下翻加载
                  </Text>
                </div>
              </div>
            </Card>
            {(biliFolders ?? []).map((f) => (
              <Card
                key={`bili-fav-${f.id}`}
                className={styles.card}
                onClick={() =>
                  setRemoteView({ kind: 'fav', id: f.id, title: f.title, coverUrl: f.coverUrl, count: f.songCount })
                }
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Cover url={f.coverUrl} size={56} radius={8} iconSize={24} />
                  <div style={{ minWidth: 0 }}>
                    <Text
                      weight="semibold"
                      style={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {f.title}
                    </Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      收藏夹 · {f.songCount} 个
                    </Text>
                  </div>
                </div>
              </Card>
            ))}
            {biliFolders === null && (
              <div style={{ padding: 12 }}>
                <Spinner />
              </div>
            )}
          </>
        ) : (
          <Card className={styles.card} onClick={() => setBiliLoginOpen(true)}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(251,114,153,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fb7299',
                  flexShrink: 0
                }}
              >
                <QrCodeRegular fontSize={24} />
              </div>
              <div>
                <Text weight="semibold">登录哔哩哔哩</Text>
                <div>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    登录后这里会显示你的收藏夹与播放记录
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
      {library.playlists.length === 0 && !library.biliProfile && (
        <div className={styles.empty}>
          <MusicNote2Regular fontSize={40} />
          <Text size={400}>还没有歌单</Text>
          <Text size={300}>新建一个,或导入你的网易云歌单</Text>
        </div>
      )}

      {/* 新建歌单 */}
      <Dialog open={createOpen} onOpenChange={(_, d) => !d.open && setCreateOpen(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>新建歌单</DialogTitle>
            <DialogContent>
              <Input
                placeholder="歌单名称"
                value={newName}
                onChange={(_, d) => setNewName(d.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                style={{ width: '100%' }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={createPlaylist} disabled={!newName.trim()}>
                创建
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 导入网易云歌单 */}
      <Dialog open={importOpen === 'netease'} onOpenChange={(_, d) => !d.open && setImportOpen(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>导入网易云歌单</DialogTitle>
            <DialogContent>
              {nePlaylists.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <Spinner />
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nePlaylists.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: tokens.borderRadiusMedium,
                        cursor: 'pointer'
                      }}
                      onClick={() => !importing && doImport(p.id, p.name)}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: tokens.colorNeutralForeground3 }}>{p.count} 首</span>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setImportOpen(null)}>取消</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 通过分享链接导入歌单(网易云 / QQ音乐 / 酷狗) */}
      <Dialog open={linkOpen} onOpenChange={(_, d) => !d.open && setLinkOpen(false)}>
        <DialogSurface style={{ maxWidth: 560 }}>
          <DialogBody>
            <DialogTitle>通过链接导入歌单</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                <Input
                  value={linkValue}
                  placeholder="粘贴歌单分享链接(网易云 / QQ音乐 / 酷狗)"
                  onChange={(_, d) => setLinkValue(d.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void importByLink()}
                />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, lineHeight: 1.7 }}>
                  网易云: music.163.com/#/playlist?id=xxx、163cn.tv 短链(可同步)；
                  QQ音乐: y.qq.com/n/ryqq/playlist/xxx；
                  酷狗: kugou.com 歌单链接。
                  <br />
                  QQ音乐/酷狗歌曲仅存曲目信息:播放时自动经哔哩哔哩搜索音源,歌词取自网易云。
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setLinkOpen(false)}>取消</Button>
              <Button
                appearance="primary"
                disabled={linkBusy || !linkValue.trim()}
                onClick={() => void importByLink()}
              >
                {linkBusy ? <Spinner size="tiny" /> : '导入'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <BiliLoginDialog open={biliLoginOpen} onClose={() => setBiliLoginOpen(false)} />
      <NeteaseLoginDialog open={neLoginOpen} onClose={() => setNeLoginOpen(false)} />
    </PageLayout>
    </div>
  )
}

/** 最近播放页(与下载页统一布局) */
export function RecentPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  if (!library) return null
  const songs = library.recentPlays.map((r) => r.song)
  return (
    <PageLayout
      icon={<HeartRegular />}
      title="最近播放"
      subtitle={songs.length > 0 ? `${songs.length} 首` : '播放过的歌曲会出现在这里'}
      actions={
        <>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={songs.length === 0}
            onClick={() => playQueue(songs, 0)}
          >
            播放全部
          </Button>
          <Button
            icon={<DeleteRegular />}
            disabled={songs.length === 0}
            onClick={async () => {
              await api.libraryClearRecent()
              await refresh()
            }}
          >
            清空
          </Button>
        </>
      }
    >
      {songs.length > 0 ? (
        <SongList songs={songs} showAlbum />
      ) : (
        <div className={styles.empty}>
          <HeartRegular fontSize={40} />
          <Text size={400}>暂无播放记录</Text>
          <Text size={300}>双击搜索结果或歌单中的歌曲开始播放</Text>
        </div>
      )}
    </PageLayout>
  )
}
