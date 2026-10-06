/** 全局共享弹窗容器:全屏播放页与迷你播放条都能打开;含定时关闭计时器 */
import { useEffect, useState } from 'react'
import type { WheelEvent } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  PauseRegular,
  PlayRegular,
  DismissRegular
} from '@fluentui/react-icons'
import { useStore, fmtDur } from '../store'
import {
  CommentsDialog,
  PagesDialog,
  SongInfoDialog,
  LyricEditDialog,
  LyricReplaceDialog,
  LyricOffsetDialog,
  QueueDialog,
  EqDialog,
  SourceSwitchDialog
} from './PlayerDialogs'

const useStyles = makeStyles({
  wheelRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '4px'
  },
  wheel: {
    width: '72px',
    height: '220px',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    userSelect: 'none'
  },
  wheelItem: {
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase500,
    cursor: 'default'
  },
  wheelUnit: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: '8px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200
  },
  presetRow: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' },
  ringWrap: {
    position: 'relative',
    width: '220px',
    height: '220px',
    margin: '0 auto'
  },
  ringText: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px'
  },
  remaining: { fontSize: '34px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', gap: '10px', justifyContent: 'center' }
})

const PRESETS = [5, 15, 30, 45, 60, 90]

/** 循环滚轮数字选择器(同系统时钟:00 上下循环 59/01,滚轮滚动或点击选值) */
function Wheel({
  count,
  value,
  onChange,
  ariaLabel
}: {
  count: number
  value: number
  onChange: (v: number) => void
  ariaLabel: string
}) {
  const styles = useStyles()
  const mod = (n: number): number => ((n % count) + count) % count
  const rows = [value - 2, value - 1, value, value + 1, value + 2].map(mod)
  const opacity = [0.2, 0.45, 1, 0.45, 0.2]

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (e.deltaY > 0) onChange(mod(value + 1))
    else if (e.deltaY < 0) onChange(mod(value - 1))
  }

  const pad = (v: number): string => String(v).padStart(2, '0')
  return (
    <div className={styles.wheel} onWheel={onWheel} aria-label={ariaLabel}>
      {rows.map((v, i) => (
        <div
          key={i}
          className={styles.wheelItem}
          onClick={() => i !== 2 && onChange(v)}
          style={{
            opacity: opacity[i],
            color: i === 2 ? tokens.colorNeutralForeground1 : tokens.colorNeutralForeground2,
            fontWeight: i === 2 ? 700 : 400
          }}
        >
          {pad(v)}
        </div>
      ))}
    </div>
  )
}

/** 定时关闭:无定时 → 滚轮自选/预设;有定时 → 圆环倒计时 + 暂停/继续/取消 */
export function SleepTimerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const end = useStore((s) => s.sleepTimerEnd)
  const paused = useStore((s) => s.sleepPaused)
  const remainingMs = useStore((s) => s.sleepRemainingMs)
  const totalMs = useStore((s) => s.sleepTotalMs)
  const { startSleepTimerMs, pauseSleepTimer, resumeSleepTimer, cancelSleepTimer } =
    useStore.getState()
  const [h, setH] = useState(0)
  const [m, setM] = useState(5)
  const [sec, setSec] = useState(0)
  const [now, setNow] = useState(Date.now())

  // 激活时 500ms 跳一次驱动圆环
  useEffect(() => {
    if (!open || !end) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [open, end])

  // 打开时重置滚轮
  useEffect(() => {
    if (open) {
      setH(0)
      setM(5)
      setSec(0)
      setNow(Date.now())
    }
  }, [open])

  const active = !!end && !paused
  const waiting = paused
  const remaining = paused ? remainingMs : end ? Math.max(0, end - now) : 0
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0
  const R = 92
  const C = 2 * Math.PI * R

  const applyPreset = (min: number) => {
    setH(Math.floor(min / 60))
    setM(min % 60)
    setSec(0)
  }

  const start = () => {
    const ms = (h * 3600 + m * 60 + sec) * 1000
    if (ms <= 0) return
    startSleepTimerMs(ms)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ minWidth: 420 }}>
        <DialogBody>
          <DialogTitle>定时关闭</DialogTitle>
          <DialogContent>
            {(active || waiting) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 8 }}>
                <div className={styles.ringWrap}>
                  <svg width={220} height={220} viewBox="0 0 220 220">
                    <circle
                      cx={110}
                      cy={110}
                      r={R}
                      fill="none"
                      stroke={tokens.colorNeutralStroke2}
                      strokeWidth={8}
                    />
                    <circle
                      cx={110}
                      cy={110}
                      r={R}
                      fill="none"
                      stroke={tokens.colorBrandBackground}
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - progress)}
                      transform="rotate(-90 110 110)"
                      style={{ transition: 'stroke-dashoffset 0.4s linear' }}
                    />
                  </svg>
                  <div className={styles.ringText}>
                    <span className={styles.remaining}>{fmtDur(remaining)}</span>
                    <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                      {waiting ? '已暂停' : `共 ${fmtDur(totalMs)}`}
                    </Text>
                  </div>
                </div>
                <div className={styles.actions}>
                  {active ? (
                    <Button icon={<PauseRegular />} onClick={pauseSleepTimer}>
                      暂停
                    </Button>
                  ) : (
                    <Button appearance="primary" icon={<PlayRegular />} onClick={resumeSleepTimer}>
                      继续
                    </Button>
                  )}
                  <Button
                    icon={<DismissRegular />}
                    onClick={() => {
                      cancelSleepTimer()
                      onClose()
                    }}
                  >
                    取消定时
                  </Button>
                </div>
              </div>
            )}

            {!active && !waiting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
                <div className={styles.wheelRow}>
                  <Wheel count={24} value={h} onChange={setH} ariaLabel="小时" />
                  <div className={styles.wheelUnit}>
                    <span>时</span>
                  </div>
                  <Wheel count={60} value={m} onChange={setM} ariaLabel="分钟" />
                  <div className={styles.wheelUnit}>
                    <span>分</span>
                  </div>
                  <Wheel count={60} value={sec} onChange={setSec} ariaLabel="秒" />
                  <div className={styles.wheelUnit}>
                    <span>秒</span>
                  </div>
                </div>
                <div className={styles.presetRow}>
                  {PRESETS.map((p) => (
                    <Button
                      key={p}
                      size="small"
                      appearance="subtle"
                      onClick={() => applyPreset(p)}
                    >
                      {p} 分钟
                    </Button>
                  ))}
                </div>
                <div className={styles.actions}>
                  <Button appearance="primary" disabled={h * 3600 + m * 60 + sec <= 0} onClick={start}>
                    开始计时
                  </Button>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: 'center' }}>
                  计时结束自动暂停播放{useStore.getState().library?.settings.sleepFadeOut ? ',结束前 20 秒音量渐弱' : ''}。
                </Text>
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 挂载在 App 的共享弹窗集合 */
export function GlobalDialogs() {
  const current = useStore((s) => s.current)
  const dlg = useStore((s) => s.activeDialog)
  const setDlg = useStore((s) => s.setActiveDialog)
  return (
    <>
      <CommentsDialog song={current} open={dlg === 'comments'} onClose={() => setDlg(null)} />
      <PagesDialog open={dlg === 'pages'} onClose={() => setDlg(null)} />
      <SongInfoDialog song={current} open={dlg === 'info'} onClose={() => setDlg(null)} />
      <LyricEditDialog song={current} open={dlg === 'lyricEdit'} onClose={() => setDlg(null)} />
      <LyricReplaceDialog song={current} open={dlg === 'lyricReplace'} onClose={() => setDlg(null)} />
      <LyricOffsetDialog open={dlg === 'lyricOffset'} onClose={() => setDlg(null)} />
      <QueueDialog open={dlg === 'queue'} onClose={() => setDlg(null)} />
      <EqDialog open={dlg === 'eq'} onClose={() => setDlg(null)} />
      <SourceSwitchDialog song={current} open={dlg === 'source'} onClose={() => setDlg(null)} />
      <SleepTimerDialog open={dlg === 'sleep'} onClose={() => setDlg(null)} />
    </>
  )
}
