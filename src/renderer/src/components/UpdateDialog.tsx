/** 更新提示弹窗:启动自动检查 / 设置页手动检查命中后显示 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Text,
  tokens
} from '../ui/controls'
import { ArrowDownloadRegular } from '../ui/icons'
import { useStore } from '../store'
import { api } from '../lib/api'
import { toastSuccess } from '../lib/toast'

export function UpdateDialog() {
  const info = useStore((s) => s.updateInfo)
  const close = (): void => useStore.setState({ updateInfo: null })

  if (!info) return null
  // release notes 只留前 12 行,避免超长
  const notes = String(info.notes ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 12)
    .join('\n')

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 520 }}>
        <DialogBody>
          <DialogTitle>发现新版本 v{info.version}</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Text size={300}>
                当前版本较旧,建议更新以获得最新功能与问题修复。
                {info.publishedAt ? `(发布于 ${info.publishedAt.slice(0, 10)})` : ''}
              </Text>
              {notes && (
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: tokens.colorNeutralBackground3,
                    color: tokens.colorNeutralForeground2,
                    fontSize: tokens.fontSizeBase200,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6
                  }}
                >
                  {notes}
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="subtle"
              onClick={async () => {
                await useStore.getState().updateSetting('skippedUpdateVersion', info.version)
                close()
                toastSuccess('已忽略该版本', '下次启动不再提示,可在设置中手动检查')
              }}
            >
              忽略此版本
            </Button>
            <Button appearance="secondary" onClick={close}>
              稍后
            </Button>
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              onClick={() => {
                void api.appOpenExternal(info.url)
                close()
              }}
            >
              前往下载
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
