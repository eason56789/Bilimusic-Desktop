/** 悬浮歌词窗(#float 路由):独立置顶小窗,显示当前/下一句歌词与精简控制 */
import { useEffect, useMemo, useState } from 'react'
import { FluentProvider, Button, makeStyles } from '@fluentui/react-components'
import {
  PauseRegular,
  PlayRegular,
  PreviousRegular,
  NextRegular,
  ChevronDownRegular
} from '@fluentui/react-icons'
import { api } from '../lib/api'
import { buildTheme } from '../lib/theme'
import type { FloatLyricState } from '@shared/types'

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(24,24,24,0.82)',
    backdropFilter: 'blur(28px) saturate(1.5)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
    userSelect: 'none'
  },
  rootLight: {
    background: 'rgba(250,250,250,0.86)',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    height: 28,
    paddingLeft: 12,
    paddingRight: 4,
    flexShrink: 0,
    WebkitAppRegion: 'drag' as unknown as 'drag'
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: 0.72
  },
  noDrag: { WebkitAppRegion: 'no-drag' as unknown as 'no-drag', display: 'flex' },
  lyrics: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    padding: '0 14px',
    minHeight: 0
  },
  current: {
    fontSize: 17,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.35
  },
  next: {
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: 0.5
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    flexShrink: 0,
    WebkitAppRegion: 'drag' as unknown as 'drag'
  }
})

/** 悬浮窗内容:状态来自主窗口推送,控制指令发回主窗口 */
function FloatContent() {
  const styles = useStyles()
  const [st, setSt] = useState<FloatLyricState | null>(null)

  useEffect(() => api.onFloatState?.((s) => setSt(s)) ?? (() => {}), [])

  const dark = st?.dark ?? true
  const accent = st?.accent ?? '#0f6cbd'
  const theme = useMemo(() => buildTheme(dark, accent), [dark, accent])

  const lyric = st?.lineText || (st?.hasCurrent ? '…' : '尚未播放')
  const noDragCls = styles.noDrag

  return (
    <FluentProvider theme={theme} style={{ height: '100%', background: 'transparent' }}>
      <div
        className={`${styles.root} ${dark ? '' : styles.rootLight}`}
        onDoubleClick={() => api.floatOpenMain?.().catch(() => {})}
      >
        <div className={styles.top}>
          <span className={styles.title} style={{ color: dark ? '#fff' : '#1a1a1a' }}>
            {st?.hasCurrent ? `${st.title}${st.artist ? ` · ${st.artist}` : ''}` : 'BiliMusic 悬浮歌词'}
          </span>
          <div className={noDragCls}>
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronDownRegular />}
              onClick={() => api.floatSendControl?.('hide')}
              style={{ width: 26, minWidth: 26, height: 22, padding: 0 }}
              title="关闭悬浮窗"
            />
          </div>
        </div>

        <div className={styles.lyrics} style={{ color: dark ? '#fff' : '#1a1a1a' }}>
          <div className={styles.current} style={{ color: st?.lineText ? accent : undefined }}>
            {lyric}
          </div>
          {st?.nextText ? <div className={styles.next}>{st.nextText}</div> : null}
        </div>

        <div className={styles.controls}>
          <div className={noDragCls} style={{ gap: 4 }}>
            <Button
              appearance="subtle"
              size="small"
              icon={<PreviousRegular />}
              disabled={!st?.hasCurrent}
              onClick={() => api.floatSendControl?.('prev')}
              style={{ width: 30, minWidth: 30, height: 26, padding: 0 }}
            />
            <Button
              appearance="primary"
              shape="circular"
              size="small"
              icon={st?.playing ? <PauseRegular /> : <PlayRegular />}
              disabled={!st?.hasCurrent}
              onClick={() => api.floatSendControl?.('toggle')}
              style={{ width: 28, minWidth: 28, height: 28, padding: 0 }}
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<NextRegular />}
              disabled={!st?.hasCurrent}
              onClick={() => api.floatSendControl?.('next')}
              style={{ width: 30, minWidth: 30, height: 26, padding: 0 }}
            />
          </div>
        </div>
      </div>
    </FluentProvider>
  )
}

export function FloatLyricApp() {
  return <FloatContent />
}
