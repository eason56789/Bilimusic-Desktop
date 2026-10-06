/** 首次启动引导(ClassIsland 风格):欢迎 → 账号 → 个性化 → 完成 */
import { useState } from 'react'
import {
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  Text,
  Title1,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  PersonVoiceRegular,
  CheckmarkCircleRegular,
  SparkleRegular,
  MusicNote2Regular,
  SettingsRegular,
  ArrowRightRegular,
  ArrowLeftRegular,
  WeatherSunnyRegular,
  WeatherMoonRegular,
  DarkThemeRegular
} from '@fluentui/react-icons'
import { useStore } from '../store'
import { ACCENTS } from '../lib/theme'
import brandIconUrl from '../assets/brand.png'
import { BiliLogo, NeteaseLogo } from './BrandLogos'
import { BiliLoginDialog, NeteaseLoginDialog } from './LoginDialogs'

const useStyles = makeStyles({
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff'
  },
  card: {
    position: 'relative',
    zIndex: 1,
    width: 'min(880px, 92vw)',
    maxHeight: '88vh',
    overflowY: 'auto',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(40px)',
    borderRadius: '24px',
    padding: '44px 56px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 32px 96px rgba(0,0,0,0.5)',
    animation: 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
  },
  steps: { display: 'flex', gap: '8px', justifyContent: 'center' },
  stepDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.25)',
    transition: 'all 0.3s ease'
  },
  stepDotActive: { width: '26px', background: tokens.colorPaletteGreenForeground1 },
  body: { minHeight: '320px', display: 'flex', flexDirection: 'column', gap: '16px' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  logoRow: { display: 'flex', alignItems: 'center', gap: '16px' },
  logo: {
    width: '72px',
    height: '72px',
    borderRadius: '20px',
    objectFit: 'cover',
    boxShadow: '0 12px 40px rgba(15,108,189,0.45)'
  },
  accountCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '18px 20px',
    borderRadius: '16px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    ':hover': { background: 'rgba(255,255,255,0.12)', transform: 'translateY(-2px)' }
  },
  accountIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    flexShrink: 0
  },
  swatchRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  swatch: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'transform 0.15s ease',
    ':hover': { transform: 'scale(1.15)' }
  },
  swatchActive: { outline: '2px solid #fff', outlineOffset: '3px' },
  themeRow: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  themeChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    ':hover': { background: 'rgba(255,255,255,0.14)' }
  },
  themeChipActive: {
    background: 'rgba(123,92,214,0.35)',
    border: '1px solid rgba(123,92,214,0.9)'
  },
  featureGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  feature: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    padding: '14px 16px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)'
  },
  agreeRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '4px 0' }
})

const STEPS = ['欢迎', '账号', '个性化', '完成']

export function Onboarding({ onDone }: { onDone: () => void }) {
  const styles = useStyles()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [closing, setClosing] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [biliOpen, setBiliOpen] = useState(false)
  const [neOpen, setNeOpen] = useState(false)
  const library = useStore((s) => s.library)
  const update = useStore((s) => s.updateSetting)
  const refresh = useStore((s) => s.refreshLibrary)
  const s = library?.settings

  if (!s) return null
  /** 步骤切换(带方向:前进右滑入,后退左滑入) */
  const go = (n: number) => {
    setDir(n > step ? 'fwd' : 'back')
    setStep(n)
  }
  const next = () => (step < STEPS.length - 1 ? go(step + 1) : finish())
  const finish = async () => {
    setClosing(true)
    await update('onboarded', true)
    // 等退场动画播完再卸载
    setTimeout(onDone, 300)
  }

  return (
    <div className={styles.root}>
      <div className={`ob-bg ${closing ? 'ob-bg-out' : ''}`}>
        <div
          className="ob-blob"
          style={{ width: 420, height: 420, left: '-8%', top: '-12%', background: '#2563eb' }}
        />
        <div
          className="ob-blob"
          style={{ width: 380, height: 380, right: '-6%', bottom: '-10%', background: '#7c3aed', animationDelay: '-6s' }}
        />
        <div
          className="ob-blob"
          style={{ width: 280, height: 280, right: '22%', top: '8%', background: '#db2777', opacity: 0.32, animationDelay: '-3s' }}
        />
      </div>

      <div
        className={styles.card}
        style={
          closing
            ? {
                animation: 'ob-card-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards',
                pointerEvents: 'none'
              }
            : undefined
        }
      >
        <div className={styles.steps}>
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`${styles.stepDot} ${i === step ? styles.stepDotActive : ''}`}
              title={label}
            />
          ))}
        </div>

        {/* 步骤内容:key 变化触发重挂载,按方向播放过渡动画 */}
        <div key={step} className={`${styles.body} ${dir === 'fwd' ? 'ob-step-fwd' : 'ob-step-back'}`}>
          {step === 0 && (
            <>
              <div className={styles.logoRow}>
                <img src={brandIconUrl} alt="BiliMusic" className={styles.logo} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Title1 style={{ color: '#fff' }}>BiliMusic</Title1>
                  <Text size={400} style={{ color: 'rgba(255,255,255,0.7)' }}>
                    新一代音乐播放器 · 桌面版
                  </Text>
                </div>
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.7 }}>
                BiliMusic 是第三方音乐客户端,支持哔哩哔哩与网易云音乐双平台音源搜索与播放,
                提供 AI 字幕歌词、歌单导入、下载与均衡器等功能。
              </Text>
              <div className={styles.featureGrid}>
                <div className={styles.feature}>
                  <PersonVoiceRegular style={{ color: '#60a5fa', fontSize: 22, flexShrink: 0 }} />
                  <div>
                    <Text weight="semibold" style={{ color: '#fff' }}>双平台音源</Text>
                    <div><Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>网易云 VIP 自动切换 B 站垫底</Text></div>
                  </div>
                </div>
                <div className={styles.feature}>
                  <MusicNote2Regular style={{ color: '#34d399', fontSize: 22, flexShrink: 0 }} />
                  <div>
                    <Text weight="semibold" style={{ color: '#fff' }}>AI 歌词字幕</Text>
                    <div><Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>逐字歌词 · 可编辑/偏移/导入</Text></div>
                  </div>
                </div>
                <div className={styles.feature}>
                  <SparkleRegular style={{ color: '#f472b6', fontSize: 22, flexShrink: 0 }} />
                  <div>
                    <Text weight="semibold" style={{ color: '#fff' }}>Fluent UI</Text>
                    <div><Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>透明材质窗口 · 页面动画</Text></div>
                  </div>
                </div>
                <div className={styles.feature}>
                  <SettingsRegular style={{ color: '#fbbf24', fontSize: 22, flexShrink: 0 }} />
                  <div>
                    <Text weight="semibold" style={{ color: '#fff' }}>完整播放器</Text>
                    <div><Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>均衡器 · 倍速 · 定时 · 评论</Text></div>
                  </div>
                </div>
              </div>
              <div className={styles.agreeRow}>
                <Checkbox
                  checked={agreed}
                  onChange={(_, d) => setAgreed(!!d.checked)}
                  label={
                    <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                      我已阅读并同意:本项目仅供学习交流,音频来自各平台公开接口,请支持正版
                    </Text>
                  }
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Title2 style={{ color: '#fff' }}>绑定账号</Title2>
              <Text style={{ color: 'rgba(255,255,255,0.7)' }}>
                绑定后可以获得更完整的音乐体验(收藏夹导入、登录音质等),也可以跳过稍后在设置中绑定。
              </Text>
              <div
                className={styles.accountCard}
                onClick={() => !library?.biliProfile && setBiliOpen(true)}
              >
                <div className={styles.accountIcon} style={{ background: '#fb7299' }}>
                  <BiliLogo size={26} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <Text weight="semibold" style={{ color: '#fff', display: 'block' }}>哔哩哔哩</Text>
                  <Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {library?.biliProfile ? `已登录:${library.biliProfile.nickname}` : '扫码 / 网页登录 · 导入收藏夹'}
                  </Text>
                </div>
                {library?.biliProfile ? (
                  <CheckmarkCircleRegular style={{ color: '#34d399', fontSize: 24 }} />
                ) : (
                  <Text size={300} style={{ color: 'rgba(255,255,255,0.5)' }}>去登录 ›</Text>
                )}
              </div>
              <div
                className={styles.accountCard}
                onClick={() => !library?.neteaseProfile && setNeOpen(true)}
              >
                <div className={styles.accountIcon} style={{ background: '#d43c33' }}>
                  <NeteaseLogo size={26} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <Text weight="semibold" style={{ color: '#fff', display: 'block' }}>网易云音乐</Text>
                  <Text size={200} style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {library?.neteaseProfile
                      ? `已登录:${library.neteaseProfile.nickname}`
                      : '验证码 / 密码 / 扫码登录'}
                  </Text>
                </div>
                {library?.neteaseProfile ? (
                  <CheckmarkCircleRegular style={{ color: '#34d399', fontSize: 24 }} />
                ) : (
                  <Text size={300} style={{ color: 'rgba(255,255,255,0.5)' }}>去登录 ›</Text>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Title2 style={{ color: '#fff' }}>个性化设置</Title2>
              <Text style={{ color: 'rgba(255,255,255,0.7)' }}>定制你的音乐体验,随时可在设置页修改。</Text>

              <Text weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>显示模式</Text>
              <div className={styles.themeRow}>
                {(
                  [
                    { v: 'system', label: '跟随系统', icon: <DarkThemeRegular /> },
                    { v: 'light', label: '浅色', icon: <WeatherSunnyRegular /> },
                    { v: 'dark', label: '深色', icon: <WeatherMoonRegular /> }
                  ] as const
                ).map((o) => (
                  <div
                    key={o.v}
                    className={`${styles.themeChip} ${s.theme === o.v ? styles.themeChipActive : ''}`}
                    onClick={() => update('theme', o.v)}
                  >
                    {o.icon}
                    <Text style={{ color: '#fff' }}>{o.label}</Text>
                  </div>
                ))}
              </div>

              <Text weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>主题色</Text>
              <div className={styles.swatchRow}>
                {ACCENTS.map((a) => (
                  <div
                    key={a.color}
                    title={a.name}
                    className={`${styles.swatch} ${s.accent === a.color ? styles.swatchActive : ''}`}
                    style={{ background: a.color }}
                    onClick={() => update('accent', a.color)}
                  />
                ))}
              </div>

              <Text weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>窗口特效</Text>
              <div className={styles.themeRow}>
                {(
                  [
                    { v: 'acrylic', label: '亚克力(推荐)' },
                    { v: 'mica', label: '云母' },
                    { v: 'none', label: '不透明' }
                  ] as const
                ).map((o) => (
                  <div
                    key={o.v}
                    className={`${styles.themeChip} ${s.windowEffect === o.v ? styles.themeChipActive : ''}`}
                    onClick={async () => {
                      await update('windowEffect', o.v)
                      await apiSafeSetEffect(o.v)
                    }}
                  >
                    <Text style={{ color: '#fff' }}>{o.label}</Text>
                  </div>
                ))}
              </div>

              <Text weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>页面动画</Text>
              <RadioGroup
                layout="horizontal"
                value={s.pageAnimation}
                onChange={(_, d) => update('pageAnimation', d.value as typeof s.pageAnimation)}
              >
                <Radio value="none" label="关闭" style={{ color: 'rgba(255,255,255,0.85)' }} />
                <Radio value="fade" label="淡入" style={{ color: 'rgba(255,255,255,0.85)' }} />
                <Radio value="slide" label="滑动" style={{ color: 'rgba(255,255,255,0.85)' }} />
                <Radio value="scale" label="缩放" style={{ color: 'rgba(255,255,255,0.85)' }} />
              </RadioGroup>
            </>
          )}

          {step === 3 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                minHeight: 320,
                textAlign: 'center'
              }}
            >
              <CheckmarkCircleRegular style={{ fontSize: 72, color: '#34d399' }} />
              <Title1 style={{ color: '#fff' }}>准备就绪!</Title1>
              <Text style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, maxWidth: 480 }}>
                双击搜索结果即可开始播放。空格暂停、方向键快进/调音量、M 静音、L 打开全屏歌词。
                祝你听歌愉快!
              </Text>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            disabled={step === 0}
            onClick={() => go(Math.max(0, step - 1))}
            style={{ color: 'rgba(255,255,255,0.8)' }}
          >
            上一步
          </Button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {step === 1 && (
              <Button
                appearance="subtle"
                onClick={next}
                style={{ color: 'rgba(255,255,255,0.75)' }}
              >
                跳过,稍后设置
              </Button>
            )}
            <Button
              appearance="primary"
              icon={step === 3 ? undefined : <ArrowRightRegular />}
              disabled={step === 0 && !agreed}
              onClick={next}
              size="large"
            >
              {step === 0 ? '同意并继续' : step === 3 ? '开始使用 BiliMusic' : '下一步'}
            </Button>
          </div>
        </div>
      </div>

      <BiliLoginDialog
        open={biliOpen}
        onClose={async () => {
          setBiliOpen(false)
          await refresh()
        }}
      />
      <NeteaseLoginDialog
        open={neOpen}
        onClose={async () => {
          setNeOpen(false)
          await refresh()
        }}
      />
    </div>
  )
}

async function apiSafeSetEffect(effect: 'none' | 'mica' | 'acrylic'): Promise<void> {
  try {
    await window.api?.windowSetEffect(effect)
  } catch {
    /* ignore */
  }
}
