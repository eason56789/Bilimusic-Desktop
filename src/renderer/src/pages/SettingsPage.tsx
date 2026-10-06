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
  eqBand: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }
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

  useEffect(() => {
    api.appVersion().then((v) => setVersion(`${v.version} (Electron ${v.electron})`))
  }, [])

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
        <div className={styles.row}>
          <Switch
            checked={s.lyricBlurEnabled}
            label="分层模糊"
            onChange={(_, d) => update('lyricBlurEnabled', d.checked)}
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
