import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
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
    ':hover': { background: tokens.colorNeutralBackground3Hover }
  }
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

  if (!library) return null

  const add = async (playlistId: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.libraryAddToPlaylist(playlistId, songs)
      await refresh()
      toastSuccess('已添加到歌单', `${songs.length} 首`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const pl = await api.libraryCreatePlaylist(name)
      await api.libraryAddToPlaylist(pl.id, songs)
      await refresh()
      toastSuccess('已创建并添加', name)
      setNewName('')
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
            <div className={styles.list}>
              {library.playlists.map((p) => (
                <div key={p.id} className={styles.item} onClick={() => add(p.id)}>
                  <span>{p.name}</span>
                  <span style={{ color: tokens.colorNeutralForeground3 }}>{p.songIds.length} 首</span>
                </div>
              ))}
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
                style={{ flex: 1 }}
              />
              <Button icon={<AddRegular />} appearance="primary" onClick={createAndAdd}>
                创建并添加
              </Button>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
