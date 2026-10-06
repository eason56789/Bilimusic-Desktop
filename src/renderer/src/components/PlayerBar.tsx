/** 底部迷你播放条 */
import { useEffect, useState } from 'react'
import {
  Button,
  Menu,
  MenuList,
  MenuItem,
  MenuPopover,
  MenuTrigger,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  PauseRegular,
  PlayRegular,
  PreviousRegular,
  NextRegular,
  ArrowRepeatAllRegular,
  ArrowShuffleRegular,
  ArrowRepeat1Regular,
  Speaker1Regular,
  SpeakerMuteRegular,
  ChevronUpRegular,
  MoreHorizontalRegular,
  ChatMultipleRegular,
  ListRegular,
  InfoRegular,
  NoteEditRegular,
  MusicNote2Regular,
  ArrowSyncRegular,
  ArrowDownloadRegular,
  OpenRegular,
  ArrowSwapRegular,
  ClockRegular,
  GaugeRegular,
  CheckmarkRegular,
  SettingsRegular
} from '@fluentui/react-icons'
import { useStore, fmtDur } from '../store'
import { Cover } from './Cover'
import { NiceSlider } from './NiceSlider'
import { formatTime } from './SongList'
import { api } from '../lib/api'
import { toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  bar: {
    height: '76px',
    display: 'flex',
    flexDirection: 'column',
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    background: 'var(--app-player-bg)',
    backdropFilter: 'blur(60px) saturate(1.4)',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    height: '28px'
  },
  mainRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px 8px'
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: 0,
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    ':hover': { background: tokens.colorNeutralBackground3Hover }
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    justifyContent: 'flex-end'
  },
  title: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '280px'
  },
  artist: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase200
  },
  time: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    minWidth: '40px',
    textAlign: 'center'
  }
})

export function PlayerBar() {
  const styles = useStyles()
  const current = useStore((s) => s.current)
  const playing = useStore((s) => s.playing)
  const loading = useStore((s) => s.loading)
  const position = useStore((s) => s.position)
  const duration = useStore((s) => s.duration)
  const volume = useStore((s) => s.volume)
  const muted = useStore((s) => s.muted)
  const mode = useStore((s) => s.mode)
  const queue = useStore((s) => s.queue)
  const sleepEnd = useStore((s) => s.sleepTimerEnd)
  const sleepPaused = useStore((s) => s.sleepPaused)
  const sleepRemainingMs = useStore((s) => s.sleepRemainingMs)
  const rate = useStore((s) => s.library?.settings.playbackRate ?? 1)
  const ui = useStore((s) => s.library?.settings.uiModules)
  const setDlg = useStore((s) => s.setActiveDialog)
  const { togglePlay, next, prev, seek, setVolume, setMuted, cycleMode, setNowPlayingOpen } =
    useStore.getState()

  const ModeIcon =
    mode === 'loop' ? ArrowRepeatAllRegular : mode === 'shuffle' ? ArrowShuffleRegular : ArrowRepeat1Regular
  const modeText =
    mode === 'loop' ? '列表循环' : mode === 'shuffle' ? '随机播放' : '单曲循环'

  // 定时关闭倒计时:暂停播放时 timeupdate 不再触发,用 1s 心跳保证倒计时实时刷新
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!sleepEnd || sleepPaused) return
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [sleepEnd, sleepPaused])

  const sleepText = (() => {
    if (sleepPaused) return fmtDur(sleepRemainingMs)
    if (!sleepEnd) return null
    return fmtDur(Math.max(0, sleepEnd - Date.now()))
  })()

  const downloadCurrent = () => {
    if (!current) return
    api.downloadAdd([current])
    toastSuccess('已加入下载队列', current.title)
  }

  const shareCurrent = async () => {
    if (!current) return
    const url =
      current.neteaseId
        ? `https://music.163.com/song?id=${current.neteaseId}`
        : current.bvid
          ? `https://www.bilibili.com/video/${current.bvid}`
          : ''
    if (!url) return
    await api.appCopy(url)
    toastSuccess('链接已复制到剪贴板')
  }

  const hasPages = current?.source === 'BILIBILI' && !!current.bvid

  return (
    <div className={styles.bar}>
      <div className={styles.progressRow}>
        <span className={styles.time}>{formatTime(position)}</span>
        <NiceSlider
          value={Math.min(position, duration || 1)}
          max={Math.max(duration, 1)}
          onChange={(v) => seek(v)}
          disabled={!current}
          ariaLabel="播放进度"
        />
        <span className={styles.time}>{formatTime(duration)}</span>
      </div>
      <div className={styles.mainRow}>
        <div className={styles.left} onClick={() => current && setNowPlayingOpen(true)}>
          <Cover url={current?.coverUrl} size={44} radius={6} />
          {current ? (
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span className={styles.title}>{current.title}</span>
              <span className={styles.artist}>{current.artist}</span>
            </div>
          ) : (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>尚未播放 · 双击列表中的歌曲开始</Text>
          )}
        </div>

        <div className={styles.center}>
          <Tooltip content="上一首" relationship="label">
            <Button appearance="subtle" icon={<PreviousRegular />} onClick={() => prev()} disabled={!current} />
          </Tooltip>
          <Tooltip content={playing ? '暂停' : '播放'} relationship="label">
            <Button
              appearance="primary"
              shape="circular"
              size="large"
              icon={playing ? <PauseRegular /> : <PlayRegular />}
              onClick={() => togglePlay()}
              disabled={!current || loading}
              style={{ width: '48px', height: '48px', minWidth: '48px', padding: 0 }}
            />
          </Tooltip>
          <Tooltip content="下一首" relationship="label">
            <Button appearance="subtle" icon={<NextRegular />} onClick={() => next(true)} disabled={!current} />
          </Tooltip>
        </div>

        <div className={styles.right}>
          <Tooltip content={modeText} relationship="label">
            <Button appearance="subtle" icon={<ModeIcon />} onClick={() => cycleMode()} />
          </Tooltip>
          {/* 更多操作(与全屏播放页共享同一组弹窗) */}
          {ui?.barMore !== false && (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="更多操作" relationship="label">
                <Button appearance="subtle" icon={<MoreHorizontalRegular />} disabled={!current} />
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<ChatMultipleRegular />} onClick={() => setDlg('comments')}>
                  评论
                </MenuItem>
                {hasPages && (
                  <MenuItem icon={<ListRegular />} onClick={() => setDlg('pages')}>
                    选择分P
                  </MenuItem>
                )}
                <MenuItem icon={<ListRegular />} onClick={() => setDlg('queue')}>
                  播放队列{queue.length > 0 ? ` (${queue.length})` : ''}
                </MenuItem>
                <MenuItem icon={<InfoRegular />} onClick={() => setDlg('info')}>
                  歌曲详情
                </MenuItem>
                <MenuItem icon={<NoteEditRegular />} onClick={() => setDlg('lyricEdit')}>
                  歌词编辑
                </MenuItem>
                <MenuItem icon={<MusicNote2Regular />} onClick={() => setDlg('lyricReplace')}>
                  更换歌词
                </MenuItem>
                <MenuItem icon={<ArrowSyncRegular />} onClick={() => setDlg('lyricOffset')}>
                  歌词偏移
                </MenuItem>
                <MenuItem icon={<ArrowDownloadRegular />} disabled={!current} onClick={downloadCurrent}>
                  下载
                </MenuItem>
                <MenuItem icon={<OpenRegular />} disabled={!current} onClick={shareCurrent}>
                  分享链接
                </MenuItem>
                <MenuItem icon={<ArrowSwapRegular />} disabled={!current} onClick={() => setDlg('source')}>
                  更换音源
                </MenuItem>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <MenuItem icon={<ClockRegular />}>
                      定时关闭{sleepText ? ` (${sleepText}${sleepPaused ? ',已暂停' : ''})` : ''}
                    </MenuItem>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {[15, 30, 45, 60, 90, 120].map((m) => (
                        <MenuItem key={m} onClick={() => useStore.getState().startSleepTimer(m)}>
                          {m} 分钟
                        </MenuItem>
                      ))}
                      <MenuItem onClick={() => setDlg('sleep')}>自定义时长 / 管理...</MenuItem>
                      <MenuItem onClick={() => useStore.getState().cancelSleepTimer()}>
                        关闭定时
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <MenuItem icon={<GaugeRegular />}>倍速播放 ({rate}x)</MenuItem>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                        <MenuItem
                          key={r}
                          icon={r === rate ? <CheckmarkRegular /> : undefined}
                          onClick={() => useStore.getState().setPlaybackRate(r)}
                        >
                          {r}x {r === 1 ? '(正常)' : ''}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
                <MenuItem icon={<SettingsRegular />} onClick={() => setDlg('eq')}>
                  均衡器
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          )}
          <Tooltip content="歌词与详情" relationship="label">
            <Button
              appearance="subtle"
              icon={<ChevronUpRegular />}
              onClick={() => current && setNowPlayingOpen(true)}
              disabled={!current}
            />
          </Tooltip>
          {ui?.barVolume !== false && (
            <>
              <Tooltip content={muted ? '取消静音' : '静音'} relationship="label">
                <Button
                  appearance="subtle"
                  icon={muted ? <SpeakerMuteRegular /> : <Speaker1Regular />}
                  onClick={() => setMuted(!muted)}
                />
              </Tooltip>
              <NiceSlider
                value={muted ? 0 : volume}
                max={1}
                onChange={(v) => setVolume(v)}
                onCommit={(v) => setVolume(v, true)}
                live
                width="90px"
                trackHeight={3}
                hoverHeight={6}
                ariaLabel="音量"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
