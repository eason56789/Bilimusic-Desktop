/** 设置页:账号/外观/播放/搜索/下载/缓存/关于 */
import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  Input,
  Option,
  Persona,
  Radio,
  RadioGroup,
  Slider,
  Spinner,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular, ColorRegular, InfoRegular, SettingsRegular, ArrowClockwiseRegular, SaveRegular } from '@fluentui/react-icons'
import { api } from '../lib/api'
import { useStore, applyEqSettings, getAudioElement, EQ_FREQS } from '../store'
import { ACCENTS } from '../lib/theme'
import { BiliLoginDialog, NeteaseLoginDialog } from '../components/LoginDialogs'
import { PageLayout } from '../components/PageHeader'
import { GithubLogo, BiliLogo } from '../components/BrandLogos'
import { toastSuccess, toastError } from '../lib/toast'
import type { DisguisePresetInfo, Settings } from '@shared/types'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '16px 24px 32px',
    height: '100%',
    overflowY: 'auto'
  },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  swatch: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: `2px solid transparent`
  },
  swatchActive: { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  eqGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px 16px' },
  eqBand: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  presetIcon: { width: '22px', height: '22px', borderRadius: '5px', objectFit: 'contain' }
})

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text size={500} weight="semibold">
      {children}
    </Text>
  )
}

export function SettingsPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const update = useStore((s) => s.updateSetting)
  const [biliLoginOpen, setBiliLoginOpen] = useState(false)
  const [neLoginOpen, setNeLoginOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [cssDraft, setCssDraft] = useState('')
  const [checking, setChecking] = useState(false)
  /** 听歌识别 token 草稿(点保存才落盘,避免每次按键都写文件) */
  const [tokenInput, setTokenInput] = useState('')
  /** 伪装:可选目标 + 当前选中 + 生成中标记 */
  const [presets, setPresets] = useState<DisguisePresetInfo[]>([])
  const [presetIcons, setPresetIcons] = useState<Record<string, string>>({})
  const [disguiseId, setDisguiseId] = useState('wechat')
  const [disguiseBusy, setDisguiseBusy] = useState(false)

  useEffect(() => {
    api.appVersion().then((v) => setVersion(`${v.version} (Electron ${v.electron})`))
    void api.getRecognizeToken?.().then((t) => setTokenInput(t || ''))
  }, [])

  // 伪装预设:一次性拉列表,再逐个取图标 data URL(图标由主进程从真实 exe 提取或绘制)
  useEffect(() => {
    let alive = true
    void (async () => {
      let list: DisguisePresetInfo[] = []
      try {
        list = (await api.disguisePresets?.()) ?? []
      } catch {
        list = []
      }
      if (!alive) return
      setPresets(list)
      for (const p of list) {
        try {
          const url = await api.disguisePresetIcon?.(p.id)
          if (!alive) return
          if (url) setPresetIcons((prev) => ({ ...prev, [p.id]: url }))
        } catch {
          /* 单个图标失败不影响其他预设 */
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const saveToken = async (): Promise<void> => {
    await api.setRecognizeToken?.(tokenInput.trim())
    toastSuccess('已保存', tokenInput.trim() ? '听歌识别已启用' : '已清空识别服务密钥')
  }

  /** 在桌面生成一个外观像所选程序的快捷方式,双击后启动的仍是本应用 */
  const makeShortcut = async (): Promise<void> => {
    if (!disguiseId || disguiseBusy) return
    setDisguiseBusy(true)
    try {
      const r = await api.disguiseCreate(disguiseId)
      if (r.ok) toastSuccess('快捷方式已创建', '在桌面上,双击即可打开')
      else toastError('创建失败', r.error ?? '未知错误')
    } catch (e) {
      toastError('创建失败', String(e))
    } finally {
      setDisguiseBusy(false)
    }
  }

  // 外部加载完成后同步草稿
  useEffect(() => {
    setCssDraft(library?.settings.customCss ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!library])

  /** 模块显隐开关(设置页入口固定显示,不在可关闭列表中) */
  const toggleModule = (k: string): void => {
    if (!library) return
    const m = library.settings.uiModules
    update('uiModules', { ...m, [k]: !m[k as keyof typeof m] })
  }

  /** 备份:弹保存对话框,主进程打包(含已下载歌曲) */
  const [busyBackup, setBusyBackup] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const doBackup = async (): Promise<void> => {
    if (busyBackup) return
    setBusyBackup(true)
    try {
      const r = await api.appBackupCreate()
      if (r.ok && r.data) toastSuccess('备份完成', `${r.data.path}${r.data.audioCount > 0 ? ` · 含 ${r.data.audioCount} 首已下载歌曲` : ''}`)
      else if (r.error !== '已取消') toastError('备份失败', r.error)
    } catch (e) {
      toastError('备份失败', String(e))
    } finally {
      setBusyBackup(false)
    }
  }
  const doRestore = async (): Promise<void> => {
    try {
      const r = await api.appRestoreBackup()
      if (r.ok) toastSuccess('恢复完成', '应用即将重启…')
      else if (r.error !== '已取消') toastError('恢复失败', r.error)
    } catch (e) {
      toastError('恢复失败', String(e))
    }
  }
  const doFactoryReset = async (): Promise<void> => {
    setResetConfirm(false)
    try {
      await api.appFactoryReset()
      toastSuccess('已恢复出厂设置', '应用即将重启…')
      setTimeout(() => {
        void api.appRelaunch()
      }, 1200)
    } catch (e) {
      toastError('操作失败', String(e))
    }
  }

  if (!library) return null
  const s = library.settings

  return (
    <PageLayout icon={<SettingsRegular />} title="设置" subtitle="账号 · 外观 · 播放 · 下载">
      {/* 账号 */}
      <div className={styles.section}>
        <SectionTitle>账号</SectionTitle>
        <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              哔哩哔哩
            </Text>
            {library.biliProfile ? (
              <Persona
                name={library.biliProfile.nickname}
                avatar={{
                  image: { src: library.biliProfile.avatar || undefined },
                  initials: library.biliProfile.nickname.slice(0, 1)
                }}
              />
            ) : (
              <Text size={300}>未登录</Text>
            )}
            {library.biliProfile ? (
              <Button
                onClick={async () => {
                  await api.biliLogout()
                  await refresh()
                  toastSuccess('已退出B站登录')
                }}
              >
                退出登录
              </Button>
            ) : (
              <Button onClick={() => setBiliLoginOpen(true)}>
                登录
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              网易云音乐
            </Text>
            {library.neteaseProfile ? (
              <Persona
                name={library.neteaseProfile.nickname}
                avatar={{
                  image: { src: library.neteaseProfile.avatar || undefined },
                  initials: library.neteaseProfile.nickname.slice(0, 1)
                }}
              />
            ) : (
              <Text size={300}>未登录(登录后可获取高音质与完整歌曲)</Text>
            )}
            {library.neteaseProfile ? (
              <Button
                onClick={async () => {
                  await api.neteaseLogout()
                  await refresh()
                  toastSuccess('已退出网易云登录')
                }}
              >
                退出登录
              </Button>
            ) : (
              <Button onClick={() => setNeLoginOpen(true)}>
                登录
              </Button>
            )}
          </div>
        </div>
      </div>

      <Divider />

      {/* 外观 */}
      <div className={styles.section}>
        <SectionTitle>外观</SectionTitle>
        <RadioGroup
          layout="horizontal"
          value={s.theme}
          onChange={(_, d) => update('theme', d.value as 'system' | 'light' | 'dark')}
        >
          <Radio value="system" label="跟随系统" />
          <Radio value="light" label="浅色" />
          <Radio value="dark" label="深色" />
        </RadioGroup>

        {/* 进度条高潮点 */}
        <div className={styles.row}>
          <Text size={300}>进度条高潮点标记:</Text>
          <Switch
            checked={s.showChorusMarks !== false}
            label="显示副歌/高潮段"
            onChange={(_, d) => update('showChorusMarks', d.checked)}
          />
        </div>
        <div className={styles.row}>
          <ColorRegular />
          <Text size={300}>主题色:</Text>
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

        {/* 窗口特效 */}
        <div className={styles.row}>
          <Text size={300}>窗口特效(透明材质):</Text>
          <RadioGroup
            layout="horizontal"
            value={s.windowEffect}
            onChange={async (_, d) => {
              const v = d.value as typeof s.windowEffect
              await update('windowEffect', v)
              await window.api.windowSetEffect(v)
            }}
          >
            <Radio value="acrylic" label="亚克力" />
            <Radio value="mica" label="云母" />
            <Radio value="none" label="不透明" />
          </RadioGroup>
        </div>
        {s.windowEffect !== 'none' && (
          <div className={styles.row} style={{ maxWidth: 420 }}>
            <Text size={300} style={{ minWidth: 130 }}>
              界面不透明度 {Math.round(s.glassAlpha * 100)}%
            </Text>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={s.glassAlpha}
              style={{ flex: 1 }}
              onChange={(_, d) => update('glassAlpha', d.value)}
            />
          </div>
        )}
        <div className={styles.row}>
          <Text size={300}>页面切换动画:</Text>
          <RadioGroup
            layout="horizontal"
            value={s.pageAnimation}
            onChange={(_, d) => update('pageAnimation', d.value as typeof s.pageAnimation)}
          >
            <Radio value="none" label="关闭" />
            <Radio value="fade" label="淡入" />
            <Radio value="slide" label="滑动" />
            <Radio value="scale" label="缩放" />
          </RadioGroup>
        </div>

        {/* ===== 轻提示(toast):出现位置 / 视觉样式 / 停留时长 / 图标 ===== */}
        <Text size={300} weight="semibold" style={{ marginTop: 6 }}>
          消息提示
        </Text>
        <div className={styles.row}>
          <Text size={300} style={{ minWidth: 96 }}>
            出现位置:
          </Text>
          <RadioGroup
            layout="horizontal"
            value={s.toastPosition}
            onChange={(_, d) => update('toastPosition', d.value as Settings['toastPosition'])}
          >
            <Radio value="top-center" label="顶部居中(滑下)" />
            <Radio value="top-right" label="顶部右侧" />
            <Radio value="bottom-right" label="右下角" />
            <Radio value="off" label="关闭提示" />
          </RadioGroup>
        </div>
        <div className={styles.row}>
          <Text size={300} style={{ minWidth: 96 }}>
            视觉样式:
          </Text>
          <RadioGroup
            layout="horizontal"
            value={s.toastStyle}
            onChange={(_, d) => update('toastStyle', d.value as Settings['toastStyle'])}
          >
            <Radio value="hud" label="玻璃" />
            <Radio value="minimal" label="极简线条" />
            <Radio value="solid" label="实心高对比" />
          </RadioGroup>
        </div>
        <div className={styles.row} style={{ maxWidth: 420 }}>
          <Text size={300} style={{ minWidth: 96 }}>
            停留时长 {s.toastDuration.toFixed(1)}×
          </Text>
          <Slider
            min={0.5}
            max={2}
            step={0.1}
            value={s.toastDuration}
            style={{ flex: 1 }}
            onChange={(_, d) => update('toastDuration', d.value)}
          />
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.toastShowIcon}
            label="显示提示图标(成功/错误/警告/信息)"
            onChange={(_, d) => update('toastShowIcon', d.checked)}
          />
          <Button
            size="small"
            appearance="subtle"
            onClick={() => toastSuccess('提示已生效', '这就是当前样式与位置')}
          >
            预览
          </Button>
        </div>

        {/* 关闭窗口行为 */}
        <div className={styles.row}>
          <Text size={300}>关闭窗口时:</Text>
          <RadioGroup
            layout="horizontal"
            value={s.closeBehavior}
            onChange={(_, d) => update('closeBehavior', d.value as typeof s.closeBehavior)}
          >
            <Radio value="ask" label="每次询问" />
            <Radio value="tray" label="后台运行" />
            <Radio value="quit" label="直接退出" />
          </RadioGroup>
        </div>

        {/* 界面定制:模块显隐 */}
        <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <Text size={300} weight="semibold">界面定制(显示/隐藏模块)</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>侧边栏(设置入口固定显示)</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {(
                [
                  ['navSearch', '搜索'],
                  ['navPlaylists', '歌单'],
                  ['navDownloads', '下载'],
                  ['navRecent', '最近播放']
                ] as const
              ).map(([k, label]) => (
                <Switch
                  key={k}
                  checked={s.uiModules[k]}
                  label={label}
                  onChange={() => toggleModule(k)}
                />
              ))}
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>全屏播放页</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {(
                [
                  ['npMore', '更多选项菜单'],
                  ['npSpectrum', '频谱动画'],
                  ['npQualityBadge', '音质徽章']
                ] as const
              ).map(([k, label]) => (
                <Switch key={k} checked={s.uiModules[k]} label={label} onChange={() => toggleModule(k)} />
              ))}
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>底部播放条</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {(
                [
                  ['barMore', '更多选项菜单'],
                  ['barVolume', '音量滑条']
                ] as const
              ).map(([k, label]) => (
                <Switch key={k} checked={s.uiModules[k]} label={label} onChange={() => toggleModule(k)} />
              ))}
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>搜索页</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              <Switch
                checked={s.uiModules.searchRecommend}
                label="网易云推荐"
                onChange={() => toggleModule('searchRecommend')}
              />
            </div>
          </div>

          <Text size={300} weight="semibold">界面大小</Text>
          <RadioGroup
            layout="horizontal"
            value={s.uiScale}
            onChange={(_, d) => update('uiScale', d.value as typeof s.uiScale)}
          >
            <Radio value="small" label="小 (90%)" />
            <Radio value="standard" label="标准" />
            <Radio value="large" label="大 (110%)" />
            <Radio value="xlarge" label="特大 (125%)" />
          </RadioGroup>

          <Text size={300} weight="semibold">全屏歌词字号</Text>
          <RadioGroup
            layout="horizontal"
            value={s.lyricSize}
            onChange={(_, d) => update('lyricSize', d.value as typeof s.lyricSize)}
          >
            <Radio value="small" label="小" />
            <Radio value="standard" label="标准" />
            <Radio value="large" label="大" />
            <Radio value="xlarge" label="超大" />
          </RadioGroup>

          <Text size={300} weight="semibold">列表密度</Text>
          <RadioGroup
            layout="horizontal"
            value={s.density}
            onChange={(_, d) => update('density', d.value as typeof s.density)}
          >
            <Radio value="compact" label="紧凑" />
            <Radio value="standard" label="标准" />
            <Radio value="relaxed" label="宽松" />
          </RadioGroup>
        </div>

        {/* 自定义 CSS(折叠) */}
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }}>
            自定义 CSS
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              写入的样式会应用到整个界面,可微调任意元素。
            </Text>
            <textarea
              value={cssDraft}
              onChange={(e) => setCssDraft(e.target.value)}
              spellCheck={false}
              placeholder={'/* 例:侧边栏字号 .brand span { font-size: 15px; } */'}
              style={{
                width: '100%',
                minHeight: 100,
                resize: 'vertical',
                fontFamily: 'Consolas, monospace',
                fontSize: tokens.fontSizeBase200,
                padding: '8px 10px',
                borderRadius: tokens.borderRadiusMedium,
                border: `1px solid ${tokens.colorNeutralStroke1}`,
                background: tokens.colorNeutralBackground2,
                color: tokens.colorNeutralForeground1
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                appearance="primary"
                size="small"
                disabled={cssDraft === (s.customCss ?? '')}
                onClick={async () => {
                  await update('customCss', cssDraft)
                  toastSuccess('自定义样式已应用')
                }}
              >
                应用样式
              </Button>
              <Button
                size="small"
                disabled={(s.customCss ?? '') === ''}
                onClick={() => {
                  setCssDraft('')
                  update('customCss', '')
                }}
              >
                清空
              </Button>
            </div>
          </div>
        </details>
      </div>

      <Divider />

      {/* 播放 */}
      <div className={styles.section}>
        <SectionTitle>播放</SectionTitle>
        <div className={styles.row}>
          <Field label="网易云音质">
            <Dropdown
              value={
                {
                  standard: '标准',
                  higher: '较高',
                  exhigh: '极高 (320k)',
                  lossless: '无损 (FLAC)',
                  hires: 'Hi-Res'
                }[s.neteaseQuality] ?? '极高'
              }
              selectedOptions={[s.neteaseQuality]}
              onOptionSelect={(_, d) => update('neteaseQuality', d.optionValue as typeof s.neteaseQuality)}
              style={{ minWidth: 160 }}
            >
              <Option value="standard" text="标准">
                标准
              </Option>
              <Option value="higher" text="较高">
                较高
              </Option>
              <Option value="exhigh" text="极高 (320k)">
                极高 (320k)
              </Option>
              <Option value="lossless" text="无损 (FLAC)">
                无损 (FLAC)
              </Option>
              <Option value="hires" text="Hi-Res">
                Hi-Res
              </Option>
            </Dropdown>
          </Field>
          <Field label="默认倍速">
            <Dropdown
              value={`${s.playbackRate}x`}
              selectedOptions={[String(s.playbackRate)]}
              onOptionSelect={(_, d) => {
                const r = Number(d.optionValue)
                update('playbackRate', r)
                // audio 元素由状态层创建、未挂载到 DOM,不能用 querySelector 查找
                getAudioElement().playbackRate = r
              }}
              style={{ minWidth: 110 }}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <Option key={r} value={String(r)} text={`${r}x`}>
                  {r}x
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="歌词偏移">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Slider
                min={-10000}
                max={10000}
                step={250}
                value={s.lyricOffsetMs}
                style={{ width: 180 }}
                onChange={(_, d) => update('lyricOffsetMs', d.value)}
              />
              <Text size={300} style={{ minWidth: 70 }}>
                {s.lyricOffsetMs === 0 ? '无偏移' : `${s.lyricOffsetMs > 0 ? '+' : ''}${(s.lyricOffsetMs / 1000).toFixed(2)}s`}
              </Text>
            </div>
          </Field>
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.preservePitch}
            label="倍速播放时保持音调"
            onChange={(_, d) => {
              update('preservePitch', d.checked)
              const el = getAudioElement() as HTMLAudioElement & {
                webkitPreservesPitch?: boolean
              }
              el.preservesPitch = d.checked
              el.webkitPreservesPitch = d.checked
            }}
          />
          <Switch
            checked={s.sleepFadeOut}
            label="睡眠定时结束前 20 秒渐弱"
            onChange={(_, d) => update('sleepFadeOut', d.checked)}
          />
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.floatLyric ?? false}
            label="悬浮歌词小窗(置顶显示当前歌词,可拖动/缩放)"
            onChange={(_, d) => update('floatLyric', d.checked)}
          />
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.eqEnabled}
            label="均衡器"
            onChange={(_, d) => {
              update('eqEnabled', d.checked)
              applyEqSettings({ ...s, eqEnabled: d.checked })
            }}
          />
          <Button
            size="small"
            onClick={() => {
              const gains = new Array(10).fill(0) as number[]
              update('eqGains', gains)
              applyEqSettings({ ...s, eqGains: gains })
            }}
          >
            重置
          </Button>
        </div>
        {s.eqEnabled && (
          <div className={styles.eqGrid}>
            {EQ_FREQS.map((freq, i) => (
              <div key={freq} className={styles.eqBand}>
                <Slider
                  min={-12}
                  max={12}
                  step={1}
                  value={s.eqGains[i] ?? 0}
                  vertical={true}
                  style={{ height: 90 }}
                  onChange={(_, d) => {
                    const gains = [...s.eqGains]
                    gains[i] = d.value
                    update('eqGains', gains)
                    applyEqSettings({ ...s, eqGains: gains })
                  }}
                />
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* 歌词(分层模糊 + 对齐,对齐手机端) */}
      <div className={styles.section}>
        <SectionTitle>歌词</SectionTitle>
        <div className={styles.row}>
          <Text size={300}>歌词对齐:</Text>
          <RadioGroup
            layout="horizontal"
            value={s.lyricAlign}
            onChange={(_, d) => update('lyricAlign', d.value as typeof s.lyricAlign)}
          >
            <Radio value="center" label="居中" />
            <Radio value="left" label="靠左" />
          </RadioGroup>
        </div>
        {/* ===== 歌词翻译:显示模式 + 译文外观 ===== */}
        <div className={styles.row}>
          <Text size={300} style={{ minWidth: 96 }}>
            歌词显示:
          </Text>
          <RadioGroup
            layout="horizontal"
            value={s.lyricTransMode}
            onChange={(_, d) => update('lyricTransMode', d.value as typeof s.lyricTransMode)}
          >
            <Radio value="off" label="仅原文" />
            <Radio value="both" label="原文+翻译" />
            <Radio value="transOnly" label="仅翻译" />
          </RadioGroup>
        </div>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          选「仅翻译」时,没有译文的行(纯音乐等)会自动回退显示原文,不会留空。
        </Text>
        {s.lyricTransMode !== 'off' && (
          <>
            {/* 排版只对「原文+翻译」有意义:仅翻译模式下原文已隐藏,不存在左右排布 */}
            {s.lyricTransMode === 'both' && (
              <div className={styles.row}>
                <Text size={300}>译文排版:</Text>
                <RadioGroup
                  layout="horizontal"
                  value={s.lyricTransLayout}
                  onChange={(_, d) => update('lyricTransLayout', d.value as typeof s.lyricTransLayout)}
                >
                  <Radio value="below" label="原文下方" />
                  <Radio value="inline" label="原文右侧" />
                </RadioGroup>
              </div>
            )}
            <div className={styles.row} style={{ maxWidth: 460 }}>
              <Text size={300} style={{ minWidth: 210 }}>
                译文字号 {Math.round((s.lyricTransScale ?? 0.78) * 100)}%
              </Text>
              <Slider
                min={0.5}
                max={1}
                step={0.02}
                value={s.lyricTransScale ?? 0.78}
                style={{ flex: 1 }}
                onChange={(_, d) => update('lyricTransScale', d.value)}
              />
            </div>
            <div className={styles.row} style={{ maxWidth: 460 }}>
              <Text size={300} style={{ minWidth: 210 }}>
                译文不透明度 {Math.round((s.lyricTransAlpha ?? 0.8) * 100)}%
              </Text>
              <Slider
                min={0.3}
                max={1}
                step={0.05}
                value={s.lyricTransAlpha ?? 0.8}
                style={{ flex: 1 }}
                onChange={(_, d) => update('lyricTransAlpha', d.value)}
              />
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              译文字号按原文字号的百分比缩放,不随当前句放大,保持主次分明。
            </Text>
          </>
        )}
        <div className={styles.row}>
          <Switch
            checked={s.lyricBlurEnabled}
            label="分层模糊"
            onChange={(_, d) => update('lyricBlurEnabled', d.checked)}
          />
        </div>
        {/* 歌词不透明度(对齐手机端:当前句 / 非当前句 双值) */}
        <div className={styles.row} style={{ maxWidth: 460 }}>
          <Text size={300} style={{ minWidth: 210 }}>
            当前歌词不透明度 {Math.round((s.lyricAlphaCurrent ?? 1) * 100)}%
          </Text>
          <Slider
            min={0.3}
            max={1}
            step={0.05}
            value={s.lyricAlphaCurrent ?? 1}
            style={{ flex: 1 }}
            onChange={(_, d) => update('lyricAlphaCurrent', d.value)}
          />
        </div>
        <div className={styles.row} style={{ maxWidth: 460 }}>
          <Text size={300} style={{ minWidth: 210 }}>
            非当前歌词不透明度 {Math.round((s.lyricAlphaInactive ?? 0.75) * 100)}%
          </Text>
          <Slider
            min={0.05}
            max={1}
            step={0.05}
            value={s.lyricAlphaInactive ?? 0.75}
            style={{ flex: 1 }}
            onChange={(_, d) => update('lyricAlphaInactive', d.value)}
          />
        </div>
        {s.lyricBlurEnabled && (
          <>
            {(
              [
                { key: 'lyricBlurAmount', label: '模糊总体强度(0=全部关闭)' },
                { key: 'lyricBlurCurrent', label: '当前句模糊' },
                { key: 'lyricBlurNear', label: '隔1句模糊' },
                { key: 'lyricBlurMid', label: '隔2句模糊' },
                { key: 'lyricBlurFar', label: '其余歌词模糊' }
              ] as const
            ).map((it) => (
              <div key={it.key} className={styles.row} style={{ maxWidth: 460 }}>
                <Text size={300} style={{ minWidth: 210 }}>
                  {it.label}
                </Text>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={s[it.key] ?? 0}
                  style={{ flex: 1 }}
                  onChange={(_, d) => update(it.key, d.value)}
                />
                <Text size={300} style={{ minWidth: 30, textAlign: 'right' }}>
                  {s[it.key] ?? 0}
                </Text>
              </div>
            ))}
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              效果实时作用于全屏播放页歌词,与手机端一致:当前句保持清晰,隔1/2句轻微模糊,其余歌词明显模糊。
            </Text>
          </>
        )}
      </div>

      <Divider />

      {/* 搜索 */}
      <div className={styles.section}>
        <SectionTitle>搜索</SectionTitle>
        <div className={styles.row}>
          <Text size={300}>默认音源:</Text>
          <RadioGroup
            layout="horizontal"
            value={s.defaultSearchSource ?? 'netease'}
            onChange={(_, d) => update('defaultSearchSource', d.value as typeof s.defaultSearchSource)}
          >
            <Radio value="netease" label="网易云音乐" />
            <Radio value="bili" label="哔哩哔哩" />
            <Radio value="qq" label="QQ音乐" />
            <Radio value="kugou" label="酷狗" />
          </RadioGroup>
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.neteaseFallback !== false}
            label="网易云兜底:无音源时自动到 B站 / QQ音乐 / 酷狗搜索"
            onChange={(_, d) => update('neteaseFallback', d.checked)}
          />
        </div>
        <div className={styles.row}>
          <Switch
            checked={s.filterLongVideo}
            label={`过滤超过 ${s.longVideoMinutes} 分钟的视频`}
            onChange={(_, d) => update('filterLongVideo', d.checked)}
          />
          <Switch
            checked={s.filterLoopTitles}
            label="过滤标题含「循环」的视频"
            onChange={(_, d) => update('filterLoopTitles', d.checked)}
          />
        </div>
        <div className={styles.row}>
          <Field
            label="自定义过滤词(用 | 分隔,忽略大小写匹配标题)"
            style={{ maxWidth: 460, width: '100%' }}
          >
            <Input
              value={s.filterKeywords}
              placeholder="例如:翻唱|纯音乐|现场"
              onChange={(_, d) => update('filterKeywords', d.value)}
            />
          </Field>
        </div>
      </div>

      <Divider />

      {/* 快捷方式伪装 */}
      <div className={styles.section}>
        <SectionTitle>快捷方式伪装</SectionTitle>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, maxWidth: 720 }}>
          在桌面生成一个看起来像所选软件的快捷方式,双击后打开的仍是本应用。
        </Text>
        <div className={styles.row}>
          <Dropdown
            value={presets.find((p) => p.id === disguiseId)?.name ?? '微信'}
            selectedOptions={[disguiseId]}
            onOptionSelect={(_, d) => d.optionValue && setDisguiseId(d.optionValue)}
            style={{ minWidth: 200 }}
          >
            {presets.map((p) => (
              <Option key={p.id} value={p.id} text={p.name}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {presetIcons[p.id] && <img src={presetIcons[p.id]} alt="" className={styles.presetIcon} />}
                  {p.name}
                </span>
              </Option>
            ))}
          </Dropdown>
          <Button appearance="primary" disabled={disguiseBusy} onClick={() => void makeShortcut()}>
            {disguiseBusy ? '生成中…' : '创建桌面快捷方式'}
          </Button>
        </div>
      </div>

      <Divider />

      {/* 听歌识别 */}
      <div className={styles.section}>
        <SectionTitle>听歌识别</SectionTitle>
        <div className={styles.row}>
          <Switch
            checked={s.songRecognizeEnabled}
            label="启用听歌识别"
            onChange={(_, d) => update('songRecognizeEnabled', d.checked)}
          />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, maxWidth: 640 }}>
            开启后搜索页会显示「识曲」按钮,抓取 8 秒系统声音识别正在播放的歌。
            关闭只是隐藏入口,已填写的 Token 会保留。
          </Text>
        </div>
        <div className={styles.row}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, maxWidth: 640 }}>
            识别需要音频指纹服务。免费且无需账号的公开接口并不存在(在线识曲站都用服务端代理自己的密钥),
            这里接官方 AudD:到 audd.io 免费注册拿 API Token 填进来即可,免费额度足够日常使用。
          </Text>
        </div>
        <div className={styles.row}>
          <Field label="AudD API Token" style={{ maxWidth: 460, width: '100%' }}>
            <Input
              type="password"
              value={tokenInput}
              placeholder={s.songRecognizeEnabled ? '留空表示未配置识别服务' : '听歌识别已关闭'}
              disabled={!s.songRecognizeEnabled}
              onChange={(_, d) => setTokenInput(d.value)}
              contentAfter={
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={!s.songRecognizeEnabled}
                  onClick={() => void saveToken()}
                >
                  保存
                </Button>
              }
            />
          </Field>
        </div>
        {s.songRecognizeEnabled && !s.songRecognizeToken && (
          <Text size={200} style={{ color: tokens.colorPaletteDarkOrangeForeground1 }}>
            尚未填写 AudD API Token,「识曲」按钮点击后会提示未配置。
          </Text>
        )}
      </div>

      <Divider />

      {/* 下载 */}
      <div className={styles.section}>
        <SectionTitle>下载</SectionTitle>
        <div className={styles.row}>
          <Text size={300}>保存目录:{s.downloadDir}</Text>
          <Button
            size="small"
            onClick={async () => {
              await api.downloadChooseDir()
              await refresh()
            }}
          >
            更改
          </Button>
          <Button size="small" onClick={() => api.downloadOpenDir()}>
            打开
          </Button>
        </div>
      </div>

      <Divider />

      {/* 缓存 */}
      <div className={styles.section}>
        <SectionTitle>缓存</SectionTitle>
        <div className={styles.row}>
          <Text size={300}>播放缓存存放在应用数据目录,清理后不影响已下载歌曲。</Text>
          <Button
            size="small"
            icon={<DeleteRegular />}
            onClick={async () => {
              const n = await api.appClearCache()
              toastSuccess('缓存已清理', `共 ${n} 个文件`)
            }}
          >
            清理播放缓存
          </Button>
          <Button size="small" onClick={() => api.appOpenCacheDir()}>
            打开缓存目录
          </Button>
        </div>
      </div>

      <Divider />

      {/* 备份与恢复 */}
      <div className={styles.section}>
        <SectionTitle>备份与恢复</SectionTitle>
        <div className={styles.row}>
          <Button
            icon={busyBackup ? <Spinner size="tiny" /> : <SaveRegular />}
            disabled={busyBackup}
            onClick={() => void doBackup()}
          >
            备份数据
          </Button>
          <Button icon={<ArrowClockwiseRegular />} onClick={() => void doRestore()}>
            从备份恢复
          </Button>
          <Button icon={<DeleteRegular />} onClick={() => setResetConfirm(true)}>
            恢复出厂设置
          </Button>
        </div>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          备份包含歌单、设置与已下载歌曲;从备份恢复会替换全部数据并重启应用。
          恢复出厂会清空歌单、记录与登录态(已下载的歌曲文件保留在下载目录)。
        </Text>
      </div>

      <Divider />

      {/* 关于 */}
      <div className={styles.section}>
        <SectionTitle>关于</SectionTitle>
        <div className={styles.row}>
          <InfoRegular />
          <Text size={300}>
            BiliMusic Desktop {version} · 基于哔哩哔哩与网易云音乐的非官方客户端 · MIT License
          </Text>
        </div>
        <div className={styles.row}>
          <Button
            icon={<GithubLogo size={16} />}
            onClick={() => void api.appOpenExternal('https://github.com/eason56789/Bilimusic-Desktop')}
          >
            GitHub
          </Button>
          <Button
            icon={<BiliLogo size={16} color="#fb7299" />}
            onClick={() => void api.appOpenExternal('https://space.bilibili.com/88981336')}
          >
            Bilibili
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              try {
                const r = await api.checkUpdate()
                if (r.status === 'update') {
                  useStore.setState({ updateInfo: r.info })
                } else if (r.status === 'latest') {
                  toastSuccess('已是最新版本', `当前 v${r.version},未发现更高版本`)
                } else {
                  toastError('检查更新失败', r.message)
                }
              } catch (e) {
                toastError('检查更新失败', String(e))
              } finally {
                setChecking(false)
              }
            }}
          >
            {checking ? '检查中…' : '检查更新'}
          </Button>
        </div>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          本应用仅供学习交流,音频资源来自各平台公开接口,请支持正版。
        </Text>
      </div>

      {/* 恢复出厂确认 */}
      <Dialog open={resetConfirm} onOpenChange={(_, d) => !d.open && setResetConfirm(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>恢复出厂设置</DialogTitle>
            <DialogContent>
              <Text>
                将清空全部歌单、歌曲库、播放记录、搜索历史与登录状态,并恢复默认设置。
                已下载的歌曲文件会保留在下载目录。此操作不可撤销,建议先「备份数据」。
              </Text>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setResetConfirm(false)}>取消</Button>
              <Button
                appearance="primary"
                style={{ background: '#c4314b' }}
                onClick={() => void doFactoryReset()}
              >
                确认恢复出厂
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <BiliLoginDialog open={biliLoginOpen} onClose={() => setBiliLoginOpen(false)} />
      <NeteaseLoginDialog open={neLoginOpen} onClose={() => setNeLoginOpen(false)} />
    </PageLayout>
  )
}
