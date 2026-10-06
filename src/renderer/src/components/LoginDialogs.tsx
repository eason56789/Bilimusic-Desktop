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
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
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

/** B站登录(扫码 / 官方网页登录,对齐手机端) */
export function BiliLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [tab, setTab] = useState<'qr' | 'web'>('qr')
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [message, setMessage] = useState('')
  const keyRef = useRef<string | null>(null)
  const [webBusy, setWebBusy] = useState(false)

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
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 网易云登录(扫码/验证码/密码) */
export function NeteaseLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const refreshLibrary = useStore((s) => s.refreshLibrary)
  const [tab, setTab] = useState<'qr' | 'captcha' | 'password'>('qr')
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [message, setMessage] = useState('')
  const [phone, setPhone] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [password, setPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [busy, setBusy] = useState(false)
  const keyRef = useRef<string | null>(null)

  const startQR = async () => {
    setStatus('loading')
    const qr = await api.neteaseQRStart()
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
    if (!open || tab !== 'qr') return
    startQR()
    let stopped = false
    const timer = setInterval(async () => {
      if (!keyRef.current || stopped) return
      const r = await api.neteaseQRPoll(keyRef.current)
      if (stopped) return
      setMessage(r.message)
      if (r.status === 'scanned') setStatus('scanned')
      if (r.status === 'ok') {
        setStatus('ok')
        await refreshLibrary()
        toastSuccess('网易云登录成功')
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

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const phoneOk = PHONE_RE.test(phone.trim())

  const sendCaptcha = async () => {
    if (!phoneOk) return
    const r = await api.neteaseSendCaptcha(phone.trim())
    if (r.ok) {
      setCountdown(60)
      toastSuccess('验证码已发送')
    } else toastError('发送失败', r.message)
  }

  const doLoginCaptcha = async () => {
    if (!phoneOk || !captcha.trim()) return
    setBusy(true)
    try {
      const r = await api.neteaseLoginCaptcha(phone.trim(), captcha.trim())
      if (r.ok) {
        await refreshLibrary()
        toastSuccess('网易云登录成功')
        onClose()
      } else toastError('登录失败', r.message)
    } finally {
      setBusy(false)
    }
  }

  const doLoginPassword = async () => {
    if (!phoneOk || !password) return
    setBusy(true)
    try {
      const r = await api.neteaseLoginPassword(phone.trim(), password)
      if (r.ok) {
        await refreshLibrary()
        toastSuccess('网易云登录成功')
        onClose()
      } else toastError('登录失败', r.message)
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
            <TabList
              selectedValue={tab}
              onTabSelect={(_, d) => setTab(d.value as typeof tab)}
              appearance="transparent"
              style={{ marginBottom: 12 }}
            >
              <Tab value="qr">扫码登录</Tab>
              <Tab value="captcha">验证码登录</Tab>
              <Tab value="password">密码登录</Tab>
            </TabList>

            {tab === 'qr' && (
              <div className={styles.qrBox}>
                <QRPanel imageDataUrl={image} status={status} message={message} onRefresh={startQR} />
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  {status === 'scanned' ? message : '使用网易云音乐 App 扫码登录'}
                </Text>
              </div>
            )}

            {tab === 'captcha' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field
                  label="手机号"
                  validationMessage={
                    phone.trim() && !phoneOk ? '请输入 11 位有效手机号' : undefined
                  }
                  validationState={phone.trim() && !phoneOk ? 'error' : 'none'}
                >
                  <Input value={phone} onChange={(_, d) => setPhone(d.value)} placeholder="11位手机号" />
                </Field>
                <Field label="验证码">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      value={captcha}
                      onChange={(_, d) => setCaptcha(d.value)}
                      style={{ flex: 1 }}
                    />
                    <Button onClick={sendCaptcha} disabled={countdown > 0 || !phoneOk || busy}>
                      {countdown > 0 ? `${countdown}s` : '发送'}
                    </Button>
                  </div>
                </Field>
                <Button
                  appearance="primary"
                  onClick={doLoginCaptcha}
                  disabled={busy || !captcha.trim() || !phoneOk}
                >
                  {busy ? <Spinner size="tiny" /> : '登录'}
                </Button>
              </div>
            )}

            {tab === 'password' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field
                  label="手机号"
                  validationMessage={
                    phone.trim() && !phoneOk ? '请输入 11 位有效手机号' : undefined
                  }
                  validationState={phone.trim() && !phoneOk ? 'error' : 'none'}
                >
                  <Input value={phone} onChange={(_, d) => setPhone(d.value)} placeholder="11位手机号" />
                </Field>
                <Field label="密码">
                  <Input
                    type="password"
                    value={password}
                    onChange={(_, d) => setPassword(d.value)}
                    onKeyDown={(e) => e.key === 'Enter' && phoneOk && password && doLoginPassword()}
                  />
                </Field>
                <Button
                  appearance="primary"
                  onClick={doLoginPassword}
                  disabled={busy || !password || !phoneOk}
                >
                  {busy ? <Spinner size="tiny" /> : '登录'}
                </Button>
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
