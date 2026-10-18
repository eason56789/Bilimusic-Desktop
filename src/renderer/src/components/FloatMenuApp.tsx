/** 悬浮歌词窗设置菜单(#floatmenu 路由):独立小窗
 *
 * 版式参考音乐播放器的歌词设置面板:
 *  字体大小 [− +] / 歌词操作 / 分隔线 / ✓翻译歌词 / 音译歌词(禁用) / 显示繁体歌词(禁用)
 *  / 分隔线 / 双行显示(下一句占位) / 重置位置大小
 *
 * 不换肤:歌词配色固定(已唱金/未唱蓝),菜单只调字号与行显隐。
 */
import { useEffect, useState } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import { CheckmarkRegular, SubtractRegular, AddRegular, TextFontRegular, ArrowRightRegular, ArrowClockwiseRegular } from '@fluentui/react-icons'
import { api } from '../lib/api'
import { buildTheme } from '../lib/theme'
import type { FloatMenuState } from '@shared/types'

const FG = 'rgba(255,255,255,0.92)'
const FG_DIM = 'rgba(255,255,255,0.42)'
const FG_MID = 'rgba(255,255,255,0.72)'
const GREEN = '#3ecf8e'

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: '6px 0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    background: 'rgba(26,28,34,0.96)',
    backdropFilter: 'blur(28px) saturate(1.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
    color: FG,
    fontSize: '14px',
    userSelect: 'none',
    overflow: 'hidden'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    height: '42px',
    padding: '0 16px',
    flexShrink: 0,
    cursor: 'pointer',
    ':hover': { background: 'rgba(255,255,255,0.07)' }
  },
  rowStatic: { cursor: 'default', ':hover': { background: 'transparent' } },
  rowDisabled: { color: FG_DIM, cursor: 'default', ':hover': { background: 'transparent' } },
  label: { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  icon: { display: 'flex', alignItems: 'center', width: '20px', justifyContent: 'center', color: FG_MID },
  check: { display: 'flex', alignItems: 'center', width: '20px', justifyContent: 'center', color: GREEN },
  divider: { height: '1px', margin: '6px 0', background: 'rgba(255,255,255,0.09)', flexShrink: 0 },
  /** 字号步进器:− 数值 + */
  stepper: { display: 'flex', alignItems: 'center', gap: '2px' },
  stepBtn: {
    width: '28px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'transparent',
    color: FG,
    cursor: 'pointer',
    ':hover': { background: 'rgba(255,255,255,0.12)' }
  },
  stepBtnOff: { color: FG_DIM, cursor: 'default', ':hover': { background: 'transparent' } },
  stepVal: { minWidth: '44px', textAlign: 'center', fontSize: '13px', color: FG_MID, fontVariantNumeric: 'tabular-nums' }
})

export function FloatMenuApp() {
  const styles = useStyles()
  const [st, setSt] = useState<FloatMenuState | null>(null)
  const theme = buildTheme(true, '#0f6cbd')

  useEffect(() => {
    void api.floatMenuGet?.().then((v) => setSt(v))
    // 主进程落盘后回推最新值:字号/开关改完立即刷新,不必关掉菜单重开
    return api.onFloatMenuState?.((v) => setSt(v)) ?? (() => {})
  }, [])

  /**
   * 改设置:先本地乐观更新(菜单里的数值/勾选立刻反映),再发给主窗口落盘。
   * 注意设置键名与菜单状态字段名不同(floatFontScale ↔ fontScale),必须显式映射。
   */
  const set = (key: 'floatFontScale' | 'floatShowTrans' | 'floatShowNextLine', value: number | boolean): void => {
    api.floatMenuSet?.(key, value)
    setSt((prev) => {
      if (!prev) return prev
      if (key === 'floatFontScale') return { ...prev, fontScale: value as number }
      if (key === 'floatShowTrans') return { ...prev, showTrans: value as boolean }
      return { ...prev, showNextLine: value as boolean }
    })
  }

  const scale = st?.fontScale ?? 1
  const canMinus = scale > 0.7001
  const canPlus = scale < 1.5999
  const step = 0.1
  const pct = Math.round(scale * 100)

  return (
    <FluentProvider theme={theme} style={{ height: '100%', background: 'transparent' }}>
      <div className={styles.root}>
        {/* 字体大小 */}
        <div className={`${styles.row} ${styles.rowStatic}`}>
          <span className={styles.icon}>
            <TextFontRegular />
          </span>
          <span className={styles.label}>字体大小</span>
          <div className={styles.stepper}>
            <button
              className={`${styles.stepBtn} ${canMinus ? '' : styles.stepBtnOff}`}
              onClick={() => canMinus && set('floatFontScale', Math.max(0.7, +(scale - step).toFixed(2)))}
              title="缩小"
            >
              <SubtractRegular />
            </button>
            <span className={styles.stepVal}>{pct}%</span>
            <button
              className={`${styles.stepBtn} ${canPlus ? '' : styles.stepBtnOff}`}
              onClick={() => canPlus && set('floatFontScale', Math.min(1.6, +(scale + step).toFixed(2)))}
              title="放大"
            >
              <AddRegular />
            </button>
          </div>
        </div>

        {/* 重置位置/大小(相当于图二的"歌词操作") */}
        <div className={styles.row} onClick={() => void api.floatResetBounds?.()}>
          <span className={styles.icon}>
            <ArrowClockwiseRegular />
          </span>
          <span className={styles.label}>重置位置和大小</span>
          <span className={styles.icon}>
            <ArrowRightRegular />
          </span>
        </div>

        <div className={styles.divider} />

        {/* 翻译歌词 */}
        <div className={styles.row} onClick={() => set('floatShowTrans', !(st?.showTrans ?? true))}>
          <span className={styles.check}>{st?.showTrans !== false ? <CheckmarkRegular /> : null}</span>
          <span className={styles.label}>翻译歌词</span>
        </div>
        <div className={`${styles.row} ${styles.rowDisabled}`}>
          <span className={styles.check} />
          <span className={styles.label}>音译歌词</span>
        </div>
        <div className={`${styles.row} ${styles.rowDisabled}`}>
          <span className={styles.check} />
          <span className={styles.label}>日语假名机器标注</span>
        </div>
        <div className={`${styles.row} ${styles.rowDisabled}`}>
          <span className={styles.check} />
          <span className={styles.label}>显示繁体歌词</span>
        </div>

        <div className={styles.divider} />

        {/* 双行显示 */}
        <div className={styles.row} onClick={() => set('floatShowNextLine', !(st?.showNextLine ?? true))}>
          <span className={styles.check}>{st?.showNextLine !== false ? <CheckmarkRegular /> : null}</span>
          <span className={styles.label}>双行显示(无翻译时显示下一句)</span>
        </div>
      </div>
    </FluentProvider>
  )
}
