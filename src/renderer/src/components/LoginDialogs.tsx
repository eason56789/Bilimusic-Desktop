/** 登录对话框:B站扫码 / 网易云扫码+验证码+密码 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Field,
  Spinner,
  TabList,
  Tab,
  Textarea,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Eye24Regular, EyeOff24Regular } from '@fluentui/react-icons'
import type { KugouPlatform } from '@shared/types'
import { useStore } from '../store'
import { api } from '../lib/api'
import { toastSuccess, toastError } from '../lib/toast'

const useStyles = makeStyles({
  qrBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0 16px'
  },
  qrMask: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.92)',
    borderRadius: tokens.borderRadiusMedium
  }
})

type QRStatus = 'loading' | 'waiting' | 'scanned' | 'ok' | 'expired' | 'error' | null

/** 中国大陆手机号:11 位,1 开头,次位 3-9 */
const PHONE_RE = /^1[3-9]\d{9}$/

function QRPanel({
  imageDataUrl,
  status,
  message,
  onRefresh
}: {
  imageDataUrl: string | null
  status: QRStatus
  message: string
  onRefresh: () => void
}) {
  const styles = useStyles()
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {imageDataUrl ? (
        <img
          src={imageDataUrl}
          width={200}
          height={200}
          style={{ borderRadius: tokens.borderRadiusMedium }}
          alt="二维码"
        />
      ) : (
        <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      )}
      {(status === 'expired' || status === 'ok') && (
        <div className={styles.qrMask}>
          <Text weight="semibold">{status === 'ok' ? '登录成功' : '二维码已过期'}</Text>
          {status === 'expired' && <Button appearance="primary" onClick={onRefresh}>刷新二维码</Button>}
        </div>
      )}
    </div>
  )
}

/** B站登录(扫码 / 官方网页登录 / Cookie 登录,对齐手机端) */
export function BiliLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [tab, setTab] = useState<'qr' | 'web' | 'cookie'>('qr')
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef<string | null>(null)
  const [webBusy, setWebBusy] = useState(false)
  const [cookieText, setCookieText] = useState('')
  const [cookieBusy, setCookieBusy] = useState(false)

  const start = async () => {
    setStatus('loading')
    setMessage('正在获取二维码...')
    const qr = await api.biliQRStart()
    if (!qr) {
      setStatus('error')
      setMessage('获取二维码失败,请检查网络')
      return
    }
    setImage(qr.imageDataUrl)
    keyRef.current = qr.key
    setStatus('waiting')
    setMessage('等待扫码...')
  }

  useEffect(() => {
    if (!open || tab !== 'qr') return
    start()
    let stopped = false
    const timer = setInterval(async () => {
      if (!keyRef.current || stopped) return
      const r = await api.biliQRPoll(keyRef.current)
      if (stopped) return
      setMessage(r.message)
      if (r.status === 'scanned') setStatus('scanned')
      if (r.status === 'ok') {
        setStatus('ok')
        await refreshLibrary()
        toastSuccess('B站登录成功')
        setTimeout(onClose, 800)
      }
      if (r.status === 'expired') setStatus('expired')
    }, 1600)
    return () => {
      stopped = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  /** 打开官方登录页窗口(密码/短信/滑块验证全由B站页面处理) */
  const openWebLogin = async () => {
    setWebBusy(true)
    try {
      const r = await api.biliWebLogin()
      if (r.ok) {
        await refreshLibrary()
        toastSuccess('B站登录成功')
        onClose()
      } else if (r.message !== '已取消登录') {
        toastError('登录未完成', r.message)
      }
    } finally {
      setWebBusy(false)
    }
  }

  /** Cookie 登录:粘贴浏览器里的 B站 Cookie(SESSDATA 必需) */
  const doCookieLogin = async () => {
    if (!cookieText.trim() || cookieBusy) return
    setCookieBusy(true)
    try {
      const r = await api.biliCookieLogin(cookieText.trim())
      if (r.ok) {
        await refreshLibrary()
        toastSuccess('B站登录成功', r.message)
        setCookieText('')
        onClose()
      } else {
        toastError('Cookie 登录失败', r.message)
      }
    } finally {
      setCookieBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ minWidth: 400 }}>
        <DialogBody>
          <DialogTitle>哔哩哔哩登录</DialogTitle>
          <DialogContent>
            <TabList
              selectedValue={tab}
              onTabSelect={(_, d) => setTab(d.value as typeof tab)}
              appearance="transparent"
              style={{ marginBottom: 12 }}
            >
              <Tab value="qr">扫码登录</Tab>
              <Tab value="web">网页登录</Tab>
              <Tab value="cookie">Cookie 登录</Tab>
            </TabList>

            {tab === 'qr' && (
              <div className={styles.qrBox}>
                <QRPanel imageDataUrl={image} status={status} message={message} onRefresh={start} />
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  {status === 'scanned' ? message : '使用哔哩哔哩 App 扫码登录'}
                </Text>
              </div>
            )}

            {tab === 'web' && (
              <div className={styles.qrBox}>
                <Button appearance="primary" disabled={webBusy} onClick={openWebLogin}>
                  {webBusy ? '等待登录窗口...' : '打开B站官方登录页'}
                </Button>
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  在官方登录页中可用密码、短信验证码、扫码等任意方式登录,
                  需要滑块验证时也能正常完成,登录成功后自动回到 BiliMusic。
                </Text>
              </div>
            )}

            {tab === 'cookie' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Textarea
                  value={cookieText}
                  onChange={(_, d) => setCookieText(d.value)}
                  placeholder="SESSDATA=xxxxxx; bili_jct=xxxxxx; DedeUserID=xxxxxx"
                  resize="vertical"
                  rows={4}
                />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, lineHeight: 1.7 }}>
                  获取方式:浏览器登录 bilibili.com → F12 开发者工具 → Application →
                  Cookies → https://www.bilibili.com → 复制整行 Cookie
                  (至少需要包含 SESSDATA;可整段粘贴,格式不限)。
                </Text>
                <Button
                  appearance="primary"
                  disabled={cookieBusy || !cookieText.trim()}
                  onClick={doCookieLogin}
                >
                  {cookieBusy ? <Spinner size="tiny" /> : '登录'}
                </Button>
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 网易云登录:内嵌官方网页登录窗口(扫码/验证码/密码/滑块全由官方页面处理) */
export function NeteaseLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [busy, setBusy] = useState(false)

  const openWebLogin = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await api.neteaseWebLogin()
      if (r.ok) {
        await refreshLibrary()
        toastSuccess('网易云登录成功', r.message)
        onClose()
      } else if (r.message !== '已取消登录') {
        toastError('登录未完成', r.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ minWidth: 400 }}>
        <DialogBody>
          <DialogTitle>网易云音乐登录</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0 16px' }}>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                将打开网易云音乐官方登录窗口,支持扫码、验证码、密码与安全验证,登录完成后自动回到应用。
              </Text>
              <Button appearance="primary" onClick={openWebLogin} disabled={busy}>
                {busy ? <Spinner size="tiny" /> : '打开登录窗口'}
              </Button>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 酷狗扫码登录(platform 区分普通酷狗 / 酷狗概念版,两版 token 不通用) */
export function KugouLoginDialog({
  open,
  onClose,
  platform
}: {
  open: boolean
  onClose: () => void
  platform: KugouPlatform
}) {
  const styles = useStyles()
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef<string | null>(null)
  const title = platform === 'concept' ? '酷狗概念版登录' : '酷狗音乐登录'

  const startQR = async () => {
    setStatus('loading')
    const qr = await api.kugouQRStart(platform)
    if (!qr) {
      setStatus('error')
      setMessage('获取二维码失败')
      return
    }
    setImage(qr.imageDataUrl)
    keyRef.current = qr.key
    setStatus('waiting')
    setMessage('等待扫码...')
  }

  useEffect(() => {
    if (!open) return
    startQR()
    let stopped = false
    const timer = setInterval(async () => {
      if (!keyRef.current || stopped) return
      const r = await api.kugouQRPoll(platform, keyRef.current)
      if (stopped) return
      setMessage(r.message)
      if (r.status === 'scanned') setStatus('scanned')
      if (r.status === 'ok') {
        setStatus('ok')
        await refreshLibrary()
        toastSuccess(`${title}成功`)
        setTimeout(onClose, 800)
      }
      if (r.status === 'expired') setStatus('expired')
    }, 1600)
    return () => {
      stopped = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform])

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ minWidth: 400 }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={styles.qrBox}>
              <QRPanel imageDataUrl={image} status={status} message={message} onRefresh={startQR} />
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {status === 'scanned' ? message : '使用酷狗音乐 App 扫码登录'}
              </Text>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 汽水音乐登录:抖音授权二维码(login_qr_key → create → check 轮询) */
export function QishuiLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef<string | null>(null)

  const startQR = async () => {
    setStatus('loading')
    const r = await api.qishuiRequest<{ key: string }>('login_qr_key')
    if (!r.ok || !r.data?.key) {
      setStatus('error')
      setMessage('获取二维码失败')
      return
    }
    const key = r.data.key
    keyRef.current = key
    const img = await api.qishuiRequest<{ imageUrl: string }>('login_qr_create', { key })
    if (!img.ok || !img.data?.imageUrl) {
      setStatus('error')
      setMessage('生成二维码失败')
      return
    }
    setImage(img.data.imageUrl)
    setStatus('waiting')
    setMessage('等待扫码...')
  }

  useEffect(() => {
    if (!open) {
      setImage(null)
      keyRef.current = null
      setStatus('loading')
      return
    }
    startQR()
    let stopped = false
    const timer = setInterval(async () => {
      if (!keyRef.current || stopped) return
      const r = await api.qishuiRequest<{ state: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error' }>(
        'login_qr_check',
        { key: keyRef.current }
      )
      if (stopped) return
      if (!r.ok) {
        setMessage(r.error?.message ?? '网络错误')
        return
      }
      const st = r.data?.state
      if (st === 'scanned') setStatus('scanned')
      else if (st === 'waiting') setStatus('waiting')
      else if (st === 'expired') setStatus('expired')
      else if (st === 'error') setStatus('error')
      if (st === 'confirmed') {
        setStatus('ok')
        // 确认后主进程已存会话;取账号写入资料并刷新
        await api.qishuiAccount().catch(() => {})
        await refreshLibrary()
        toastSuccess('汽水音乐登录成功')
        setTimeout(onClose, 800)
      }
    }, 1800)
    return () => {
      stopped = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ minWidth: 400 }}>
        <DialogBody>
          <DialogTitle>汽水音乐登录</DialogTitle>
          <DialogContent>
            <div className={styles.qrBox}>
              <QRPanel
                imageDataUrl={image}
                status={status}
                message={message}
                onRefresh={startQR}
              />
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {status === 'scanned' ? message : '使用抖音/汽水音乐 App 扫码登录'}
              </Text>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
