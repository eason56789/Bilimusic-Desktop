/** 通用歌曲列表(搜索结果/歌单/最近播放共用):双击播放 + 右键/更多菜单 + 多选模式 */
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  Button,
  Checkbox,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  makeStyles,
  tokens,
  Tooltip
} from '@fluentui/react-components'
import {
  MoreHorizontalRegular,
  PlayRegular,
  ArrowRightRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  DismissRegular,
  SelectAllOnRegular,
  FolderAddRegular,
  ListRegular
} from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { useStore } from '../store'
import { Cover } from './Cover'
import { AddToPlaylistDialog } from './AddToPlaylistDialog'
import { api } from '../lib/api'
import { pagesToSongs } from '../lib/pages'
import { badgeOf } from '../lib/sourceBadge'
import { toast, toastSuccess, toastError } from '../lib/toast'

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '2px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'default',
    transition: 'background 0.15s ease',
    ':hover': { background: tokens.colorNeutralBackground3 }
  },
  rowActive: {
    background: tokens.colorNeutralBackground3
  },
  meta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  title: {
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold
  },
  artist: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase200
  },
  duration: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    flexShrink: 0
  },
  sourceBadge: {
    fontSize: tokens.fontSizeBase100,
    padding: '1px 6px',
    borderRadius: '4px',
    flexShrink: 0
  },
  eqWrap: { display: 'inline-flex', gap: '2px', alignItems: 'flex-end', height: '12px' },
  selBar: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorBrandBackground2,
    marginBottom: '6px'
  }
})

function EqBars() {
  const styles = useStyles()
  return (
    <span className={styles.eqWrap}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar"
          style={{ height: 12 - i * 2, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

interface CtxMenuState {
  x: number
  y: number
  song: Song
  index: number
}

export function SongList({
  songs,
  onRemove,
  showAlbum
}: {
  songs: Song[]
  onRemove?: (song: Song) => void
  showAlbum?: boolean
}) {
  const styles = useStyles()
  const playQueue = useStore((s) => s.playQueue)
  const playSongNext = useStore((s) => s.playSongNext)
  const current = useStore((s) => s.current)
  const [addTarget, setAddTarget] = useState<Song[] | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const ctxAnchorRef = useRef<HTMLSpanElement>(null)
  const [selMode, setSelMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!selMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSelMode(false)
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selMode])

  const enterSelMode = (): void => {
    setSelMode(true)
    setSelected(new Set())
  }
  const exitSelMode = (): void => {
    setSelMode(false)
    setSelected(new Set())
  }
  const toggleSel = (id: string): void => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const selSongs = songs.filter((s) => selected.has(s.id))
  const allSelected = songs.length > 0 && selSongs.length === songs.length

  /** 立即播放 */
  const playNow = (index: number) => playQueue(songs, index)
  /** 下一首播放 */
  const playNext = (song: Song) => playSongNext(song)
  /** 播放全部分P:拉取分P列表铺满队列,从当前P开始 */
  const playAllPages = async (song: Song) => {
    if (!song.bvid) return
    try {
      const pages = await api.pagesGet(song.bvid)
      const list = pagesToSongs(song, pages)
      if (list.length === 0) {
        toast('播放分P', '该视频只有一个分P')
        return
      }
      const idx = list.findIndex((s) => s.id === song.id)
      playQueue(list, Math.max(0, idx))
    } catch (e) {
      toastError('获取分P失败', String(e))
    }
  }
  /** 下载 */
  const download = (song: Song) => {
    api.downloadAdd([song])
    toastSuccess('已加入下载队列', song.title)
  }

  /** 右键/更多菜单共用的菜单项 */
  const menuItems = (song: Song, index: number) => (
    <>
      <MenuItem icon={<PlayRegular />} onClick={() => playNow(index)}>
        立即播放
      </MenuItem>
      <MenuItem icon={<ArrowRightRegular />} onClick={() => playNext(song)}>
        下一首播放
      </MenuItem>
      {song.source === 'BILIBILI' && song.bvid && (
        <MenuItem icon={<ListRegular />} onClick={() => void playAllPages(song)}>
          播放全部分P
        </MenuItem>
      )}
      <MenuItem icon={<FolderAddRegular />} onClick={() => setAddTarget([song])}>
        添加到歌单
      </MenuItem>
      <MenuItem icon={<ArrowDownloadRegular />} onClick={() => download(song)}>
        下载
      </MenuItem>
      <MenuItem icon={<SelectAllOnRegular />} onClick={enterSelMode}>
        多选模式
      </MenuItem>
      {onRemove && (
        <MenuItem icon={<DeleteRegular />} onClick={() => onRemove(song)}>
          移除
        </MenuItem>
      )}
    </>
  )

  const onRowContextMenu = (e: MouseEvent<HTMLDivElement>, song: Song, index: number) => {
    e.preventDefault()
    // 把隐藏锚点移到鼠标处,作为右键菜单定位目标
    const anchor = ctxAnchorRef.current
    if (anchor) {
      anchor.style.left = `${e.clientX}px`
      anchor.style.top = `${e.clientY}px`
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, song, index })
  }

  return (
    <>
      {/* 多选工具条 */}
      {selMode && (
        <div className={styles.selBar}>
          <Checkbox
            checked={allSelected ? true : selSongs.length > 0 ? 'mixed' : false}
            onChange={() => {
              if (allSelected) setSelected(new Set())
              else setSelected(new Set(songs.map((s) => s.id)))
            }}
            label={<span>已选 {selSongs.length} / {songs.length}</span>}
          />
          <div style={{ flex: 1 }} />
          <Button
            size="small"
            icon={<FolderAddRegular />}
            disabled={selSongs.length === 0}
            onClick={() => setAddTarget(selSongs)}
          >
            添加到歌单
          </Button>
          <Button
            size="small"
            icon={<ArrowDownloadRegular />}
            disabled={selSongs.length === 0}
            onClick={() => {
              api.downloadAdd(selSongs)
              toastSuccess('已加入下载队列', `共 ${selSongs.length} 首`)
            }}
          >
            下载
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={exitSelMode}
          >
            退出多选
          </Button>
        </div>
      )}

      <div className={styles.list}>
        {songs.map((song, i) => {
          const active = current?.id === song.id
          const checked = selected.has(song.id)
          return (
            <div
              key={`${song.id}-${i}`}
              className={`song-row ${styles.row} ${active ? styles.rowActive : ''}`}
              style={selMode && checked ? { background: tokens.colorBrandBackground2 } : undefined}
              onClick={selMode ? () => toggleSel(song.id) : undefined}
              onDoubleClick={selMode ? undefined : () => playNow(i)}
              onContextMenu={selMode ? undefined : (e) => onRowContextMenu(e, song, i)}
            >
              {selMode && (
                <Checkbox
                  checked={checked}
                  onChange={() => toggleSel(song.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <Cover url={song.coverUrl} size={40} iconSize={16} />
              <div className={styles.meta} onDoubleClick={selMode ? undefined : () => playNow(i)}>
                <span className={styles.title}>
                  {active ? <EqBars /> : null} {song.title}
                </span>
                <span className={styles.artist}>
                  {song.artist}
                  {showAlbum && song.album ? ` · ${song.album}` : ''}
                </span>
              </div>
              {/* 来源徽章:五种来源各有配色 */}
              <span
                className={styles.sourceBadge}
                style={{
                  background: badgeOf(song.source).bg,
                  color: badgeOf(song.source).color
                }}
              >
                {badgeOf(song.source).label}
              </span>
              <span className={styles.duration}>{formatTime(song.duration)}</span>
              {!selMode && (
                <>
                  <Tooltip content="立即播放" relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<PlayRegular />}
                      onClick={() => playNow(i)}
                    />
                  </Tooltip>
                  <Tooltip content="下一首播放" relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowRightRegular />}
                      onClick={() => playNext(song)}
                    />
                  </Tooltip>
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button appearance="subtle" size="small" icon={<MoreHorizontalRegular />} />
                    </MenuTrigger>
                    <MenuPopover>{menuItems(song, i)}</MenuPopover>
                  </Menu>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* 右键菜单(受控,锚点跟随鼠标) */}
      <span
        ref={ctxAnchorRef}
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <Menu
        open={!!ctxMenu}
        onOpenChange={(_, d) => {
          if (!d.open) setCtxMenu(null)
        }}
        positioning={{ target: ctxMenu ? ctxAnchorRef.current : undefined }}
      >
        <MenuTrigger disableButtonEnhancement>
          <span style={{ display: 'none' }} />
        </MenuTrigger>
        <MenuPopover>
          {ctxMenu ? menuItems(ctxMenu.song, ctxMenu.index) : null}
        </MenuPopover>
      </Menu>

      <AddToPlaylistDialog
        songs={addTarget ?? []}
        open={addTarget != null}
        onClose={() => setAddTarget(null)}
      />
    </>
  )
}
