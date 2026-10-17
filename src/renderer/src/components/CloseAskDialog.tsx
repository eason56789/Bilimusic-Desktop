/** 关闭窗口询问弹窗:后台运行(隐藏到托盘,音乐继续) / 直接退出;可记住选择 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Switch,
  Text,
  makeStyles,
  tokens
} from '../ui/controls'
import { ArrowMinimizeRegular, PowerRegular } from '../ui/icons'
import { useStore } from '../store'

const useStyles = makeStyles({
  hint: { color: tokens.colorNeutralForeground3 },
  choices: {
    display: 'flex',
    gap: '10px',
    marginTop: '12px'
  },
  choice: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    padding: '14px 14px 12px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    ':hover': {
      boxShadow: `0 0 0 1px ${tokens.colorBrandStroke1}`,
      background: tokens.colorNeutralBackground1Hover
    }
  },
  choiceIcon: {
    fontSize: '22px',
    color: tokens.colorBrandForeground1,
    marginBottom: '2px'
  },
  choiceTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1
  },
  choiceDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'
  }
})

type CloseAction = 'tray' | 'quit' | 'cancel'

export function CloseAskDialog() {
  const styles = useStyles()
  const update = useStore((s) => s.updateSetting)
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const decidedRef = useRef(false)

  useEffect(
    () =>
      window.api?.onWindowCloseAsk?.(() => {
        decidedRef.current = false
        setRemember(false)
        setOpen(true)
      }),
    []
  )

  const decide = (action: CloseAction): void => {
    if (decidedRef.current) return
    decidedRef.current = true
    setOpen(false)
    // 记住选择走通用设置通道(渲染层 store 与主进程同步),再让主进程执行动作
    if (remember && action !== 'cancel') {
      void update('closeBehavior', action)
        .catch(() => {})
        .then(() => window.api.windowCloseDecide(action))
    } else {
      void window.api.windowCloseDecide(action)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) decide('cancel')
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>关闭 BiliMusic</DialogTitle>
          <DialogContent>
            <Text size={300} className={styles.hint}>
              关闭窗口时，音乐要继续播放还是直接退出？
            </Text>
            <div className={styles.choices}>
              <button className={styles.choice} onClick={() => decide('tray')}>
                <ArrowMinimizeRegular className={styles.choiceIcon} />
                <span className={styles.choiceTitle}>后台运行</span>
                <span className={styles.choiceDesc}>隐藏窗口，音乐继续播放，可从托盘图标唤回</span>
              </button>
              <button className={styles.choice} onClick={() => decide('quit')}>
                <PowerRegular className={styles.choiceIcon} />
                <span className={styles.choiceTitle}>直接退出</span>
                <span className={styles.choiceDesc}>停止播放并退出程序</span>
              </button>
            </div>
          </DialogContent>
        </DialogBody>
        <DialogActions>
          <div className={styles.actions}>
            <Switch
              checked={remember}
              onChange={(_, d) => setRemember(!!d.checked)}
              label="记住我的选择"
            />
            <Button appearance="secondary" onClick={() => decide('cancel')}>
              取消
            </Button>
          </div>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  )
}
