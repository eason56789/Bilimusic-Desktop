/** 下载页:任务进度 + 历史(右键/更多菜单 + 双击播放本地文件) */
import { useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuItem,
  ProgressBar,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowClockwiseRegular,
  ArrowRightRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  DismissRegular,
  ErrorCircleRegular,
  FolderAddRegular,
  FolderOpenRegular,
  MoreHorizontalRegular,
  PlayRegular
} from '@fluentui/react-icons'
import type { DownloadRecord, Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Cover } from '../components/Cover'
import { PageLayout } from '../components/PageHeader'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
import { toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    transition: 'background 0.15s ease',
    ':hover': { background: tokens.colorNeutralBackground3 }
  },
  meta: { flex: 1, minWidth: 0 },
  progressBox: { display: 'flex', flexDirection: 'column', gap: '4px', width: '220px' },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    padding: '48px 0'
  }
})

function fmtSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface CtxState {
  x: number
  y: number
  record: DownloadRecord
}

export function DownloadsPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  const playSongNext = useStore((s) => s.playSongNext)
  const [addTarget, setAddTarget] = useState<Song[] | null>(null)
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const ctxAnchorRef = useRef<HTMLSpanElement>(null)
  if (!library) return null

  const records = library.downloads
  const activeCount = records.filter((r) => r.status === 'downloading' || r.status === 'pending').length

  const retry = (record: DownloadRecord) => {
    api.downloadAdd([record.song])
    toastSuccess('已重新加入队列', record.song.title)
  }

  const removeRecord = async (record: DownloadRecord) => {
    await api.downloadRemoveRecord(record.id)
    await refresh()
  }

  /** 播放已下载的本地文件 */
  const playLocal = (record: DownloadRecord) => {
    if (!record.filePath) return
    const localSong: Song = {
      ...record.song,
      id: `local-${Date.now().toString(36)}`,
      source: 'LOCAL',
      localPath: record.filePath,
      vipOnly: undefined,
      keepMeta: undefined
    }
    playQueue([localSong], 0)
  }

  /** 下一首播放(已完成 → 本地文件) */
  const playNextLocal = (record: DownloadRecord) => {
    if (!record.filePath) return
    const localSong: Song = {
      ...record.song,
      id: `local-${Date.now().toString(36)}`,
      source: 'LOCAL',
      localPath: record.filePath,
      vipOnly: undefined,
      keepMeta: undefined
    }
    playSongNext(localSong)
  }

  const onRowContextMenu = (e: MouseEvent<HTMLDivElement>, record: DownloadRecord) => {
    e.preventDefault()
    const anchor = ctxAnchorRef.current
    if (anchor) {
      anchor.style.left = `${e.clientX}px`
      anchor.style.top = `${e.clientY}px`
    }
    setCtx({ x: e.clientX, y: e.clientY, record })
  }

  /** 按状态生成菜单项(右键与"更多"按钮共用) */
  const menuItems = (record: DownloadRecord) => {
    if (record.status === 'downloading' || record.status === 'pending') {
      return (
        <MenuItem icon={<DismissRegular />} onClick={() => api.downloadCancel(record.id)}>
          取消下载
        </MenuItem>
      )
    }
    if (record.status === 'completed') {
      return (
        <>
          <MenuItem icon={<PlayRegular />} onClick={() => playLocal(record)}>
            播放本地文件
          </MenuItem>
          <MenuItem icon={<ArrowRightRegular />} onClick={() => playNextLocal(record)}>
            下一首播放
          </MenuItem>
          <MenuItem icon={<FolderAddRegular />} onClick={() => setAddTarget([record.song])}>
            添加到歌单
          </MenuItem>
          <MenuItem icon={<FolderOpenRegular />} onClick={() => api.downloadOpenFile(record.id)}>
            打开文件位置
          </MenuItem>
          <MenuItem icon={<ArrowClockwiseRegular />} onClick={() => retry(record)}>
            重新下载
          </MenuItem>
          <MenuItem icon={<DeleteRegular />} onClick={() => removeRecord(record)}>
            删除记录
          </MenuItem>
        </>
      )
    }
    return (
      <>
        <MenuItem icon={<ArrowClockwiseRegular />} onClick={() => retry(record)}>
          重新下载
        </MenuItem>
        <MenuItem icon={<DeleteRegular />} onClick={() => removeRecord(record)}>
          删除记录
        </MenuItem>
      </>
    )
  }

  return (
    <PageLayout
      icon={<ArrowDownloadRegular />}
      title="下载管理"
      subtitle={
        activeCount > 0
          ? `${activeCount} 个任务进行中 · ${library.settings.downloadDir}`
          : library.settings.downloadDir
      }
      actions={
        <>
          <Button
            icon={<FolderOpenRegular />}
            onClick={async () => {
              await api.downloadOpenDir()
            }}
          >
            打开目录
          </Button>
          <Button
            icon={<DeleteRegular />}
            disabled={activeCount > 0}
            onClick={async () => {
              await api.downloadClear(false)
              await refresh()
            }}
          >
            清除记录
          </Button>
        </>
      }
    >
      {records.length === 0 ? (
        <div className={styles.empty}>
          <CheckmarkCircleRegular fontSize={40} />
          <Text size={400}>暂无下载任务</Text>
          <Text size={300}>在搜索结果中点击下载按钮添加</Text>
        </div>
      ) : (
        records.map((r) => (
          <div
            key={r.id}
            className={`dl-row ${styles.row}`}
            onContextMenu={(e) => onRowContextMenu(e, r)}
            onDoubleClick={() => r.status === 'completed' && playLocal(r)}
          >
            <Cover url={r.song.coverUrl} size={44} iconSize={18} />
            <div className={styles.meta}>
              <Text
                weight="semibold"
                style={{
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {r.song.title}
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {r.song.artist}
              </Text>
            </div>

            {(r.status === 'downloading' || r.status === 'pending') && (
              <div className={styles.progressBox}>
                <ProgressBar
                  value={r.total > 0 ? r.received / r.total : undefined}
                  shape="rounded"
                  thickness="medium"
                />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {r.status === 'pending'
                    ? '排队中...'
                    : `${fmtSize(r.received)}${r.total ? ` / ${fmtSize(r.total)}` : ''}`}
                </Text>
              </div>
            )}

            {r.status === 'completed' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: tokens.colorPaletteGreenForeground1
                }}
              >
                <CheckmarkCircleRegular />
                <span style={{ fontSize: tokens.fontSizeBase200 }}>{fmtSize(r.received)}</span>
              </div>
            )}

            {r.status === 'error' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: tokens.colorPaletteRedForeground1
                }}
              >
                <ErrorCircleRegular />
                <span style={{ fontSize: tokens.fontSizeBase200 }}>{r.error ?? '下载失败'}</span>
              </div>
            )}

            <Tooltip
              content={
                r.status === 'downloading' || r.status === 'pending'
                  ? '取消下载'
                  : r.status === 'completed'
                    ? '打开文件位置'
                    : '重新下载'
              }
              relationship="label"
            >
              <Button
                appearance="subtle"
                icon={
                  r.status === 'downloading' || r.status === 'pending' ? (
                    <DismissRegular />
                  ) : r.status === 'completed' ? (
                    <FolderOpenRegular />
                  ) : (
                    <ArrowClockwiseRegular />
                  )
                }
                onClick={() => {
                  if (r.status === 'downloading' || r.status === 'pending') api.downloadCancel(r.id)
                  else if (r.status === 'completed') api.downloadOpenFile(r.id)
                  else retry(r)
                }}
              />
            </Tooltip>
            <Tooltip content="更多操作" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<MoreHorizontalRegular />}
                onClick={(e) => {
                  // 把锚点移到按钮处,菜单从按钮弹出
                  const anchor = ctxAnchorRef.current
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  if (anchor) {
                    anchor.style.left = `${rect.left}px`
                    anchor.style.top = `${rect.bottom}px`
                  }
                  setCtx({ x: rect.left, y: rect.bottom, record: r })
                }}
              />
            </Tooltip>
          </div>
        ))
      )}

      {/* 右键/更多菜单(受控,锚点定位) */}
      <span
        ref={ctxAnchorRef}
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <Menu
        open={!!ctx}
        onOpenChange={(_, d) => {
          if (!d.open) setCtx(null)
        }}
        positioning={{ target: ctx ? ctxAnchorRef.current : undefined }}
      >
        <MenuTrigger disableButtonEnhancement>
          <span style={{ display: 'none' }} />
        </MenuTrigger>
        <MenuPopover>{ctx ? menuItems(ctx.record) : null}</MenuPopover>
      </Menu>

      <AddToPlaylistDialog
        songs={addTarget ?? []}
        open={addTarget != null}
        onClose={() => setAddTarget(null)}
      />
    </PageLayout>
  )
}
