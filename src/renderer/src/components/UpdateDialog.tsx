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
} from '@fluentui/react-components'
import { ArrowDownloadRegular, InfoRegular } from '@fluentui/react-icons'
import { useStore } from '../store'
import { api } from '../lib/api'
import { toastSuccess } from '../lib/toast'
import { MarkdownBlock } from './MarkdownBlock'

export function UpdateDialog() {
  const info = useStore((s) => s.updateInfo)
  const close = (): void => useStore.setState({ updateInfo: null })

  if (!info) return null
  const notes = String(info.notes ?? '').trim()

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>发现新版本 v{info.version}</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* 两行提示同级:都是纯文字,无背景块 */}
              <Text size={300}>
                当前版本较旧,建议更新以获得最新功能与问题修复。
                {info.publishedAt ? `(发布于 ${info.publishedAt.slice(0, 10)})` : ''}
              </Text>
              <Text size={300} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <InfoRegular style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  若无法打开下载页面,请尝试使用加速器(如 Watt Toolkit / Steam++ 等
                  GitHub 加速工具)后重试。
                </span>
              </Text>
              {notes && (
                <div
                  style={{
                    maxHeight: 320,
                    overflowY: 'auto',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: tokens.colorNeutralBackground3,
                    color: tokens.colorNeutralForeground1,
                    fontSize: tokens.fontSizeBase200
                  }}
                >
                  <MarkdownBlock source={notes} />
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
                toastSuccess('已忽略该版本', '下次启动不再弹窗提示')
              }}
            >
              忽略此版本
            </Button>
            <Button appearance="secondary" onClick={close}>
              稍后
            </Button>
            <Button
              appearance="primary"
              size="large"
              icon={<ArrowDownloadRegular />}
              style={{ minWidth: 148, whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => {
                void api.appOpenExternal(info.url)
                close()
              }}
            >
              下载安装包
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
