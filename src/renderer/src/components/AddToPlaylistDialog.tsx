import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { AddRegular } from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '320px',
    overflowY: 'auto'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    // 勾选态给一条轻背景,一眼看出来哪几行被选中
    ':hover': { background: `var(--bm-surface-3h, ${tokens.colorNeutralBackground3Hover})` }
  },
  itemOn: {
    background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})`
  },
  /** 复选框自己处理点击,外层整行也在切换选中,这里挡住冒泡避免"点一下切两次" */
  checkWrap: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }
})

export function AddToPlaylistDialog({
  songs,
  open,
  onClose
}: {
  songs: Song[]
  open: boolean
  onClose: () => void
}) {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  /**
   * 勾选的目标歌单集合。原来点一行就直接加进那一个歌单并关窗,
   * 想把同一批歌放进几个歌单只能重复操作多次;现在改成多选,一次提交。
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!library) return null

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = library.playlists.length > 0 && selected.size === library.playlists.length

  /** 依次写入每个目标歌单;主进程侧会按歌单做批内去重,重复的曲目不会堆两遍 */
  const applyTo = async (ids: string[]): Promise<void> => {
    for (const id of ids) await api.libraryAddToPlaylist(id, songs)
  }

  const addSelected = async (): Promise<void> => {
    if (busy || selected.size === 0) return
    setBusy(true)
    try {
      const ids = [...selected]
      await applyTo(ids)
      await refresh()
      const names = library.playlists.filter((p) => selected.has(p.id)).map((p) => p.name)
      toastSuccess(`已添加到 ${ids.length} 个歌单`, `${songs.length} 首 · ${names.join('、')}`)
      setSelected(new Set())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async (): Promise<void> => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const pl = await api.libraryCreatePlaylist(name)
      // 新建的这份和勾选到的歌单一起写,免得用户勾了别的歌单又填了名字后只进了一半
      await applyTo([pl.id, ...selected])
      await refresh()
      toastSuccess('已创建并添加', `${name}${selected.size > 0 ? `,另加 ${selected.size} 个歌单` : ''}`)
      setNewName('')
      setSelected(new Set())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>添加 {songs.length} 首歌曲到歌单</DialogTitle>
          <DialogContent>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6
              }}
            >
              <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
                可多选,勾选后一次加入
              </span>
              {library.playlists.length > 0 && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() =>
                    setSelected(allSelected ? new Set() : new Set(library.playlists.map((p) => p.id)))
                  }
                >
                  {allSelected ? '取消全选' : '全选'}
                </Button>
              )}
            </div>
            <div className={`${styles.list} bm-stagger-in`}>
              {library.playlists.map((p) => {
                // 已经包含其中几首时给个提示,方便判断这次加进去会不会掺进重复项
                const contained = songs.filter((s) => p.songIds.includes(s.id)).length
                const on = selected.has(p.id)
                return (
                  <div
                    key={p.id}
                    className={`${styles.item}${on ? ` ${styles.itemOn}` : ''}`}
                    onClick={() => toggle(p.id)}
                  >
                    <span className={styles.checkWrap}>
                      <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
                        <Checkbox
                          checked={on}
                          onChange={() => toggle(p.id)}
                          aria-label={p.name}
                        />
                      </span>
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {p.name}
                      </span>
                    </span>
                    <span
                      style={{
                        color: tokens.colorNeutralForeground3,
                        fontSize: 12,
                        flexShrink: 0,
                        marginLeft: 8
                      }}
                    >
                      {contained > 0
                        ? contained >= songs.length
                          ? '已全部包含'
                          : `已含 ${contained}/${songs.length}`
                        : `${p.songIds.length} 首`}
                    </span>
                  </div>
                )
              })}
              {library.playlists.length === 0 && (
                <div style={{ color: tokens.colorNeutralForeground3, padding: '8px 12px' }}>
                  还没有歌单,创建一个吧
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Input
                placeholder="新建歌单名称"
                value={newName}
                onChange={(_, d) => setNewName(d.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createAndAdd()}
                style={{ flex: 1 }}
              />
              <Button icon={<AddRegular />} appearance="primary" onClick={() => void createAndAdd()}>
                创建并添加
              </Button>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>关闭</Button>
            <Button appearance="primary" disabled={busy || selected.size === 0} onClick={() => void addSelected()}>
              {busy ? <Spinner size="tiny" /> : `添加${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
