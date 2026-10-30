/**
 * 听歌识别(识曲)独立页面。
 *
 * 流程:抓 8 秒系统回环声音 → AudD 识别 → 拿到歌名歌手 → 一键搜索。
 *
 * 关键在于**开始录音之前**就把能检查的都检查掉:
 * 录音是固定 8 秒的阻塞操作,若把「未配置 Token」「功能已关闭」这类校验
 * 放到录音之后(早期实现就是这样),用户要白等 8 秒才看到错误提示。
 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  MicRegular,
  DismissRegular,
  SearchRegular,
  SettingsRegular,
  InfoRegular
} from '@fluentui/react-icons'
import { api } from '../lib/api'
import { useStore } from '../store'
import { captureSystemAudioWav } from '../lib/recognize'
import { toastError, toastSuccess } from '../lib/toast'
import { PageLayout } from '../components/PageHeader'
import { Cover } from '../components/Cover'

/** 录音时长(与 lib/recognize 的 CAPTURE_MS 保持一致,仅用于展示倒计时) */
const CAPTURE_MS = 8000

const useStyles = makeStyles({
  stage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '18px',
    padding: '48px 24px',
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  },
  micRing: {
    width: '112px',
    height: '112px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    transition: 'transform 0.2s ease, box-shadow 0.3s ease'
  },
  /** 录音中:外圈脉冲 */
  micActive: {
    boxShadow: '0 0 0 0 rgba(0,120,212,0.5)',
    animation: 'recognize-pulse 1.4s ease-out infinite'
  },
  micIdle: {
    ':hover': { transform: 'scale(1.04)' }
  },
  /** 主标题按钮:外观像标题,行为像按钮 */
  mainAction: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'inherit',
    lineHeight: 1.4,
    padding: '4px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.15s ease, opacity 0.15s ease',
    ':hover': {
      background: tokens.colorNeutralBackground4,
      opacity: 0.88
    },
    ':active': { opacity: 0.72 }
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    maxWidth: '460px',
    lineHeight: 1.6
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    maxWidth: '520px'
  },
  warnBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground1,
    color: tokens.colorPaletteDarkOrangeForeground1,
    maxWidth: '520px'
  },
  resultCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 20px',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    width: '100%',
    maxWidth: '520px',
    boxSizing: 'border-box'
  },
  resultMeta: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 },
  progressTrack: {
    width: '260px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colorBrandBackground,
    transition: 'width 0.1s linear'
  }
})

type Phase = 'idle' | 'recording' | 'identifying' | 'done'

interface Recognized {
  title: string
  artist: string
  album?: string
}

export function RecognizePage() {
  const styles = useStyles()
  const settings = useStore((s) => s.library?.settings)
  const token = settings?.songRecognizeToken ?? ''
  const enabled = settings?.songRecognizeEnabled !== false
  const setPage = useStore((s) => s.setPage)
  const searchWithQuery = useStore((s) => s.searchWithQuery)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Recognized | null>(null)
  /** 录音倒计时(0~1 的进度) */
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<number | null>(null)

  // 离开页面时清掉倒计时,避免回到这里还在跑
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [])

  const busy = phase === 'recording' || phase === 'identifying'

  /** 开始识别 */
  const start = async (): Promise<void> => {
    if (busy) return
    setError('')
    setResult(null)

    // ===== 前置校验:全部在录音之前完成,不浪费用户的 8 秒 =====
    if (!enabled) {
      setError('听歌识别已在设置中关闭,请先到「设置 → 听歌识别」开启。')
      return
    }
    // token 以设置为准;设置快照可能尚未加载完,再向主进程确认一次
    let effectiveToken = token.trim()
    if (!effectiveToken) {
      try {
        effectiveToken = (await api.getRecognizeToken()).trim()
      } catch {
        /* 读取失败按未配置处理 */
      }
    }
    if (!effectiveToken) {
      setError('尚未填写 AudD API Token:识别需要音频指纹服务,请到「设置 → 听歌识别」填写后再试。')
      return
    }

    // ===== 开始录音 =====
    setPhase('recording')
    setProgress(0)
    const startedAt = Date.now()
    timerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / CAPTURE_MS)
      setProgress(p)
    }, 80)

    try {
      const wav = await captureSystemAudioWav((s) => {
        if (s === 'sending') setPhase('identifying')
      })
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      setProgress(1)
      setPhase('identifying')
      const r = await api.recognizeAudio(await wav.arrayBuffer())
      setResult({ title: r.title, artist: r.artist, album: r.album })
      setPhase('done')
      toastSuccess('识别成功', `${r.title} - ${r.artist}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('idle')
      toastError('听歌识别失败', msg)
    } finally {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  /** 取消录音 */
  const cancel = (): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setPhase('idle')
    setProgress(0)
  }

  /** 用识别结果去搜索页找歌 */
  const searchIt = (): void => {
    if (!result) return
    const q = [result.title, result.artist].filter(Boolean).join(' ')
    searchWithQuery(q)
  }

  /**
   * 主标题文案。空闲与完成态都直接写成可点的动作提示 —— 这行文字本身就是入口,
   * 与上方麦克风按钮等价,用户不用去找"下面的按钮"。
   */
  const phaseText =
    phase === 'recording'
      ? '点击取消识别'
      : phase === 'identifying'
        ? '正在识别…'
        : phase === 'done'
          ? '再识别一次'
          : '点击开始听歌识别'

  return (
    <PageLayout
      icon={<MicRegular />}
      title="听歌识别"
      subtitle="抓取 8 秒系统声音,识别正在播放的歌"
    >
      <div className={styles.stage}>
        {/* 麦克风按钮 / 状态图标 */}
        {phase === 'identifying' ? (
          <div className={styles.micRing}>
            <Spinner size="large" />
          </div>
        ) : (
          <Tooltip
            content={phase === 'recording' ? '点击取消' : '开始识别'}
            relationship="label"
          >
            <button
              type="button"
              aria-label={phase === 'recording' ? '取消识别' : '开始识别'}
              onClick={() => (phase === 'recording' ? cancel() : void start())}
              className={`${styles.micRing} ${phase === 'recording' ? styles.micActive : styles.micIdle}`}
              style={{
                border: 'none',
                cursor: 'pointer',
                backgroundColor: phase === 'recording' ? tokens.colorPaletteRedBackground3 : undefined
              }}
            >
              {phase === 'recording' ? (
                <DismissRegular style={{ fontSize: 36 }} />
              ) : (
                <MicRegular style={{ fontSize: 40 }} />
              )}
            </button>
          </Tooltip>
        )}

        {/* 主标题即入口:文字本身可点,与上方的麦克风按钮行为一致 */}
        {phase === 'identifying' ? (
          <Text size={400} weight="semibold">
            {phaseText}
          </Text>
        ) : (
          <button
            type="button"
            onClick={() => (phase === 'recording' ? cancel() : void start())}
            className={styles.mainAction}
            style={{
              color: phase === 'recording' ? tokens.colorPaletteRedForeground1 : tokens.colorBrandForeground1
            }}
          >
            {phaseText}
          </button>
        )}

        {/* 录音进度条 */}
        {phase === 'recording' && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        <Text size={200} className={styles.hint}>
          {phase === 'recording'
            ? '请让音乐继续播放,8 秒后自动识别。点击红色按钮可取消。'
            : phase === 'identifying'
              ? '已采集完成,正在向识别服务查询…'
              : '录制时请保持歌曲外放,静音或没有声音时无法识别。'}
        </Text>

        {/* 前置校验错误 */}
        {error && (
          <div className={styles.errorBox}>
            <InfoRegular style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <Text size={300}>{error}</Text>
              {/Token|关闭/.test(error) && (
                <Button
                  size="small"
                  appearance="secondary"
                  icon={<SettingsRegular />}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setPage('settings')}
                >
                  前往设置
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 识别结果。"再识别一次"由上方主标题承担,这里不再重复放按钮 */}
        {result && phase === 'done' && (
          <div className={styles.resultCard}>
            <Cover url={undefined} size={56} radius={10} iconSize={22} />
            <div className={styles.resultMeta}>
              <Text size={400} weight="semibold" truncate>
                {result.title}
              </Text>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }} truncate>
                {result.artist}
                {result.album ? ` · ${result.album}` : ''}
              </Text>
            </div>
            <Button
              appearance="primary"
              icon={<SearchRegular />}
              onClick={searchIt}
              style={{ flexShrink: 0 }}
            >
              搜索这首歌
            </Button>
          </div>
        )}

        {/* 未配置 Token 的常驻提示(不用等点击才发现) */}
        {!error && enabled && !token.trim() && phase === 'idle' && (
          <div className={styles.warnBox}>
            <InfoRegular style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <Text size={300}>
                尚未填写 AudD API Token,识别无法进行。可到 audd.io 免费注册获取。
              </Text>
              <Button
                size="small"
                appearance="secondary"
                icon={<SettingsRegular />}
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setPage('settings')}
              >
                前往设置
              </Button>
            </div>
          </div>
        )}

        {/* 功能被关闭时的说明 */}
        {!enabled && (
          <div className={styles.warnBox}>
            <InfoRegular style={{ flexShrink: 0, marginTop: 2 }} />
            <Text size={300}>听歌识别已在设置中关闭。</Text>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
