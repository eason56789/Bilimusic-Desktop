/** 设置页:账号/外观/播放/搜索/下载/缓存/关于 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
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
import { DeleteRegular, ColorRegular, InfoRegular, SettingsRegular, ArrowClockwiseRegular, SaveRegular, SearchRegular } from '@fluentui/react-icons'
import { api } from '../lib/api'
import { useStore, applyEqSettings, getAudioElement, EQ_FREQS } from '../store'
import { ACCENTS } from '../lib/theme'
import { BiliLoginDialog, NeteaseLoginDialog, KugouLoginDialog } from '../components/LoginDialogs'
import { PageLayout } from '../components/PageHeader'
import { GithubLogo, BiliLogo } from '../components/BrandLogos'
import { toastSuccess, toastError } from '../lib/toast'
import { TEMPERA_ENTER_OPTIONS } from '../lib/tempera'
import type { DisguisePresetInfo, KugouPlatform, Settings } from '@shared/types'

/** 文字PV 入场动效显示名(设置页与全屏页菜单共用文案) */
const PV_ANIM_LABEL: Record<'pop' | 'rise' | 'slam' | 'wave' | 'typewriter', string> = {
  pop: '弹出 Pop',
  rise: '上浮 Rise',
  slam: '砸落 Slam',
  wave: '波浪 Wave',
  typewriter: '打字机 Typewriter'
}

/** 文字PV 版式显示名(auto=按句语义与种子自动轮转) */
const PV_LAYOUT_LABEL: Record<string, string> = {
  auto: '自动(按句轮转)',
  'type-impact': '巨字炸裂 TypeImpact',
  'editorial-column': '竖排专栏 Editorial',
  'fragment-collage': '碎片拼贴 Collage',
  'tracking-ribbon': '单行带状 Ribbon',
  'mask-reveal': '中轴落入 MaskReveal',
  'quiet-tableau': '静场堆叠 Tableau'
}

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
  searchBox: { display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '600px' },
  searchRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  /** 左侧分类侧栏(样式与排行榜页目录栏完全一致:216px + 右分隔线 + 独立滚动) */
  bodyRow: { display: 'flex', minHeight: 0, height: '100%' },
  catNav: {
    width: '216px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: 0,
    minWidth: 0
  },
  catHead: { padding: '12px 12px 8px' },
  catBody: { flex: 1, overflowY: 'auto', padding: '0 6px 12px', minHeight: 0 },
  catFooter: { padding: '8px 12px 10px' },
  catItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '6px 8px',
    border: 'none',
    background: 'transparent',
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    textAlign: 'left',
    cursor: 'default',
    ':hover': { background: tokens.colorNeutralBackground3 }
  },
  catItemActive: {
    background: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontWeight: 600
  },
  bodyMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    padding: '0 4px 20px 20px'
  },
  noHit: { color: tokens.colorNeutralForeground3, paddingLeft: '2px' },
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

/** 设置分区索引(供设置页顶部搜索过滤用) */
const SETTING_SECTIONS: { name: string; keywords: string }[] = [
  { name: '账号', keywords: '账号 登录 退出 b站 哔哩哔哩 bilibili 网易云 qq音乐 qq 酷狗 概念版 扫码 cookie 授权' },
  { name: '外观', keywords: '主题 深色 浅色 强调色 窗口材质 云母 亚克力 玻璃 不透明度 界面大小 密度 css 自定义样式 模块显隐 页面切换 动画 toast 轻提示' },
  { name: '播放', keywords: 'eq 均衡器 音质 倍速 音调 变调 变速 音量 渐弱 保留音调 睡眠定时 定时 停止 播放记忆 续播' },
  {
    name: '歌词',
    keywords:
      '歌词 样式 文字pv 排布 凝彩 云阶 回环 时计 入场 动效 版式 字号 大小 运动强度 镜头 逐字 时序 尾字 强调 色块 装饰 线框 反色 转场 整句 色彩模式 主题双色 黑白 封面渐变 后处理 颗粒 对比度 色差 暗角 透镜 模糊 对齐 翻译 译文 偏移 offset'
  },
  { name: '搜索', keywords: '默认音源 垫底 搜索 历史 过滤 长视频 循环 关键词' },
  { name: '快捷方式伪装', keywords: '伪装 快捷方式 图标 桌面 伪装成' },
  { name: '听歌识别', keywords: '识别 听歌 audD token 密钥 识曲' },
  { name: '下载', keywords: '下载 目录 路径 音质 保存' },
  { name: '缓存', keywords: '缓存 清理 空间' },
  { name: '备份与恢复', keywords: '备份 恢复 出厂 重置 导入 导出' },
  { name: '关于', keywords: '关于 版本 更新 检查更新 github 源码' }
]

/** 含可重置设置键的分区(与主进程 SECTION_SETTING_KEYS 的键一致;其余分区无可重置项) */
const RESETTABLE_SECTIONS = ['外观', '播放', '歌词', '搜索', '听歌识别', '下载']

/** JIZURA 舞台的情绪(对应引擎 J.MOODS) */
const JIZURA_MOODS: { value: string; label: string }[] = [
  { value: 'auto', label: '自动(按种子)' },
  { value: 'glitch', label: '故障 Glitch' },
  { value: 'calm', label: '静谧 Calm' },
  { value: 'pop', label: '流行 Pop' },
  { value: 'graphic', label: '图形 Graphic' },
  { value: 'editorial', label: '编辑 Editorial' },
  { value: 'emotional', label: '情绪 Emotional' },
  { value: 'chaos', label: '全混 Chaos' }
]

/** JIZURA 舞台的风格(对应引擎 J.STYLES) */
const JIZURA_STYLES: { value: string; label: string }[] = [
  { value: 'auto', label: '自动(按种子)' },
  { value: 'noir', label: 'Noir 黑白' },
  { value: 'crimson', label: 'Crimson 绯红' },
  { value: 'caution', label: 'Caution 警示黄' },
  { value: 'magenta', label: 'Magenta 洋红' },
  { value: 'paper', label: 'Paper 纸感' },
  { value: 'hud', label: 'HUD 仪表' },
  { value: 'mint', label: 'Mint 薄荷' },
  { value: 'specimen', label: 'Specimen 标本' },
  { value: 'transit', label: 'Transit 交通' },
  { value: 'blueprint', label: 'Blueprint 蓝图' },
  { value: 'rouge', label: 'Rouge 胭脂' },
  { value: 'mono', label: 'Mono 单色' }
]

export function SettingsPage() {  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const update = useStore((s) => s.updateSetting)
  const [biliLoginOpen, setBiliLoginOpen] = useState(false)
  const [neLoginOpen, setNeLoginOpen] = useState(false)
  const [kgLoginPlatform, setKgLoginPlatform] = useState<KugouPlatform | null>(null)
  const [qqBusy, setQqBusy] = useState(false)
  /** QQ 登录(官方授权页):kind=wx 走微信 OAuth,其余 QQ 快速登录/扫码 */
  const doQqLogin = async (kind: 'qq' | 'wx'): Promise<void> => {
    setQqBusy(true)
    try {
      const r = await api.qqWebLogin(kind)
      if (r.ok) {
        await refresh()
        toastSuccess('QQ音乐登录成功')
      } else if (r.message !== '已取消登录') {
        toastError('登录未完成', r.message)
      }
    } finally {
      setQqBusy(false)
    }
  }
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
  /** 设置搜索关键词(过滤分区用) */
  const [query, setQuery] = useState('')
  /** 侧栏当前选中的分类 */
  const [activeSec, setActiveSec] = useState('账号')
  /** 恢复默认设置确认框 */
  const [resetOpen, setResetOpen] = useState(false)
  /** 恢复默认:勾选的分区(打开确认框时全部勾上) */
  const [resetSel, setResetSel] = useState<Record<string, boolean>>({})

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

  // ===== 设置搜索:按关键词过滤分区 =====
  const q = query.trim().toLowerCase()
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const secVisible = (name: string): boolean => {
    if (!q) return true
    const meta = SETTING_SECTIONS.find((x) => x.name === name)
    return !!meta && (meta.name.toLowerCase().includes(q) || meta.keywords.includes(q))
  }
  const sec = (name: string): React.HTMLAttributes<HTMLDivElement> & {
    ref: (el: HTMLDivElement | null) => void
  } => ({
    ref: (el: HTMLDivElement | null) => {
      sectionRefs.current[name] = el
    },
    className: styles.section,
    style: secVisible(name) ? undefined : { display: 'none' }
  })
  const visibleSections = q ? SETTING_SECTIONS.filter((x) => secVisible(x.name)).length : SETTING_SECTIONS.length
  /** 侧栏点击:滚动到对应分区 */
  const jumpTo = (name: string): void => {
    setActiveSec(name)
    sectionRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 恢复默认设置:主进程重置所选分区的设置键,再即时回位 EQ 节点与窗口材质 */
  const doResetSettings = async (): Promise<void> => {
    const selNames = RESETTABLE_SECTIONS.filter((n) => resetSel[n] !== false)
    const next = await useStore.getState().resetSettings(selNames)
    try {
      applyEqSettings(next)
      void api.windowSetEffect(next.windowEffect)
    } catch {
      /* 个别即时应用失败不影响重置结果 */
    }
    const names = selNames.join('、')
    toastSuccess('已恢复默认设置', `分区:${names} · 登录状态与曲库不受影响`)
  }

  return (
    <PageLayout icon={<SettingsRegular />} title="设置" subtitle="账号 · 外观 · 播放 · 下载">
      {/* 左:分类侧栏(对齐排行榜页的目录栏)+ 右:设置分区 */}
      <div className={styles.bodyRow}>
        <div className={styles.catNav}>
          <div className={styles.catHead}>
            <Input
              size="small"
              contentBefore={<SearchRegular style={{ fontSize: 14, color: tokens.colorNeutralForeground3 }} />}
              placeholder="搜索设置…"
              value={query}
              onChange={(_, d) => setQuery(d.value)}
              style={{ width: '100%', minWidth: 0 }}
            />
          </div>
          <div className={styles.catBody}>
            {SETTING_SECTIONS.filter((x) => secVisible(x.name)).map((x) => (
              <button
                key={x.name}
                className={`${styles.catItem} ${activeSec === x.name ? styles.catItemActive : ''}`}
                onClick={() => jumpTo(x.name)}
              >
                {x.name}
              </button>
            ))}
            {q && visibleSections === 0 ? (
              <Text size={200} className={styles.noHit} style={{ padding: 10, display: 'block' }}>
                没有匹配「{query.trim()}」的设置
              </Text>
            ) : null}
          </div>
          <div className={styles.catFooter}>
            <Button size="small" icon={<ArrowClockwiseRegular />} style={{ width: '100%' }} onClick={() => setResetOpen(true)}>
              恢复默认设置
            </Button>
          </div>
        </div>
        <div className={styles.bodyMain}>
          {/* 账号 */}
          <div {...sec('账号')}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              QQ音乐
            </Text>
            {library.qqProfile ? (
              <Persona
                name={library.qqProfile.nickname}
                avatar={{
                  image: { src: library.qqProfile.avatar || undefined },
                  initials: library.qqProfile.nickname.slice(0, 1)
                }}
              />
            ) : (
              <Text size={300}>未登录(登录后 VIP 曲目可按会员权限播放)</Text>
            )}
            {library.qqProfile ? (
              <Button
                onClick={async () => {
                  await api.qqLogout()
                  await refresh()
                  toastSuccess('已退出QQ音乐登录')
                }}
              >
                退出登录
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  disabled={qqBusy}
                  onClick={() => void doQqLogin('qq')}
                >
                  {qqBusy ? '等待登录…' : '登录'}
                </Button>
                <Button
                  disabled={qqBusy}
                  onClick={() => void doQqLogin('wx')}
                >
                  微信登录
                </Button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              酷狗音乐
            </Text>
            {[false, true].map((concept) => {
              const profile = concept ? library.kugouConceptProfile : library.kugouProfile
              const platform: KugouPlatform = concept ? 'concept' : 'normal'
              return (
                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text size={300} style={{ minWidth: 64 }}>
                    {concept ? '概念版' : '普通版'}
                  </Text>
                  {profile ? (
                    <>
                      <Persona
                        name={profile.nickname}
                        avatar={{
                          image: { src: profile.avatar || undefined },
                          initials: profile.nickname.slice(0, 1)
                        }}
                      />
                      <Button
                        size="small"
                        onClick={async () => {
                          await api.kugouLogout(platform)
                          await refresh()
                          toastSuccess(`已退出${concept ? '酷狗概念版' : '酷狗'}登录`)
                        }}
                      >
                        退出
                      </Button>
                    </>
                  ) : (
                    <Button size="small" onClick={() => setKgLoginPlatform(platform)}>
                      扫码登录
                    </Button>
                  )}
                </div>
              )
            })}
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              普通版与概念版账号不通用,需分别扫码
            </Text>
          </div>
        </div>
      </div>

      <Divider />

      {/* 外观 */}
      <div {...sec("外观")}>
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
      <div {...sec("播放")}>
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
      <div {...sec("歌词")}>
        <SectionTitle>歌词</SectionTitle>
        {/* ===== 歌词视觉样式:经典滚动 / 文字PV ===== */}
        <div className={styles.row}>
          <Text size={300} style={{ minWidth: 96 }}>
            歌词样式:
          </Text>
          <RadioGroup
            layout="horizontal"
            value={s.lyricStyle ?? 'classic'}
            onChange={(_, d) => update('lyricStyle', d.value as typeof s.lyricStyle)}
          >
            <Radio value="classic" label="经典(滚动列表)" />
            <Radio value="pv" label="文字PV(整屏大字+动效)" />
          </RadioGroup>
        </div>
        {s.lyricStyle === 'pv' && (
          <>
            {/* 排布样式:同一套 PV 舞台,换整行的摆法(参考 folia 的多种歌词样式) */}
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                排布样式:
              </Text>
              <RadioGroup
                layout="horizontal"
                value={s.pvArrange ?? 'pv'}
                onChange={(_, d) => update('pvArrange', d.value as typeof s.pvArrange)}
              >
                <Radio value="pv" label="逐字PV" />
                <Radio value="partita" label="云阶" />
                <Radio value="claddagh" label="回环" />
                <Radio value="still" label="时计" />
                <Radio value="tempera" label="凝彩" />
                <Radio value="jizura" label="印刷分镜" />
              </RadioGroup>
            </div>
            {/* ===== JIZURA 舞台参数(引擎自带风格系统) ===== */}
            {(s.pvArrange ?? 'pv') === 'jizura' && (
              <>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 96 }}>
                    情绪:
                  </Text>
                  <Dropdown
                    value={JIZURA_MOODS.find((o) => o.value === (s.pvJizuraMood ?? 'auto'))?.label ?? '自动'}
                    selectedOptions={[s.pvJizuraMood ?? 'auto']}
                    onOptionSelect={(_, d) => update('pvJizuraMood', String(d.optionValue))}
                  >
                    {JIZURA_MOODS.map((o) => (
                      <Option key={o.value} value={o.value}>
                        {o.label}
                      </Option>
                    ))}
                  </Dropdown>
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 96 }}>
                    风格:
                  </Text>
                  <Dropdown
                    value={JIZURA_STYLES.find((o) => o.value === (s.pvJizuraStyle ?? 'auto'))?.label ?? '自动'}
                    selectedOptions={[s.pvJizuraStyle ?? 'auto']}
                    onOptionSelect={(_, d) => update('pvJizuraStyle', String(d.optionValue))}
                  >
                    {JIZURA_STYLES.map((o) => (
                      <Option key={o.value} value={o.value}>
                        {o.label}
                      </Option>
                    ))}
                  </Dropdown>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  自带 REC 取景框、时间码、分栏色块、票券/对话框版式与 RGB 错位字等印刷分镜效果。
                  切到本样式后由它接管整块歌词区域。
                </Text>
              </>
            )}
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                入场动效:
              </Text>
              <Dropdown
                value={PV_ANIM_LABEL[s.pvAnim ?? 'pop']}
                selectedOptions={[s.pvAnim ?? 'pop']}
                onOptionSelect={(_, d) => update('pvAnim', d.optionValue as typeof s.pvAnim)}
              >
                {Object.entries(PV_ANIM_LABEL).map(([k, label]) => (
                  <Option key={k} value={k}>
                    {label}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                版式:
              </Text>
              <Dropdown
                value={
                  PV_LAYOUT_LABEL[s.pvLayout ?? 'auto'] ??
                  PV_LAYOUT_LABEL['auto']
                }
                selectedOptions={[s.pvLayout ?? 'auto']}
                onOptionSelect={(_, d) => update('pvLayout', d.optionValue as typeof s.pvLayout)}
              >
                {Object.entries(PV_LAYOUT_LABEL).map(([k, label]) => (
                  <Option key={k} value={k}>
                    {label}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                文字大小 {Math.round((s.pvScale ?? 1) * 100)}%
              </Text>
              <Slider
                min={0.7}
                max={1.6}
                step={0.05}
                value={s.pvScale ?? 1}
                onChange={(_, d) => update('pvScale', d.value)}
              />
            </div>
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                运动强度 {Math.round((s.pvMotion ?? 1) * 100)}%
              </Text>
              <Slider
                min={0}
                max={2}
                step={0.05}
                value={s.pvMotion ?? 1}
                onChange={(_, d) => update('pvMotion', d.value)}
              />
            </div>
            <div className={styles.row}>
              <Text size={300} style={{ minWidth: 96 }}>
                PV 主色:
              </Text>
              <Input
                value={s.pvAccent ?? ''}
                placeholder="留空=跟随主题强调色(如 #7aa2ff)"
                onChange={(_, d) => update('pvAccent', d.value)}
                style={{ maxWidth: 280 }}
              />
            </div>
            <Switch
              label="装饰层(网格 / 光圈 / 角框 / 飘散色块)"
              checked={s.pvDecor !== false}
              onChange={(_, d) => update('pvDecor', d.checked)}
            />
            {/* ===== 凝彩舞台细化选项(对齐听屿设置面板;仅凝彩排布显示) ===== */}
            {(s.pvArrange ?? 'pv') === 'tempera' && (
              <>
                <Divider />
                <Text size={300} weight="semibold">
                  凝彩舞台 · 显示内容
                </Text>
                <Switch
                  label="色块场景"
                  checked={s.pvBlockScenes !== false}
                  onChange={(_, d) => update('pvBlockScenes', d.checked)}
                />
                <Switch
                  label="边角线框"
                  checked={s.pvFrame !== false}
                  onChange={(_, d) => update('pvFrame', d.checked)}
                />
                <Switch
                  label="文字动态反色"
                  checked={s.pvInvertText !== false}
                  onChange={(_, d) => update('pvInvertText', d.checked)}
                />
                <Switch
                  label="场景转场"
                  checked={s.pvTransition !== false}
                  onChange={(_, d) => update('pvTransition', d.checked)}
                />
                <Switch
                  label="整句显示歌词"
                  checked={s.pvWholeLine === true}
                  onChange={(_, d) => update('pvWholeLine', d.checked)}
                />
                <Text size={300} weight="semibold">
                  凝彩舞台 · 动效与色调
                </Text>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    纹理分辨率 {(s.pvTexture ?? 1).toFixed(1)}x
                  </Text>
                  <Slider
                    min={0.5}
                    max={4}
                    step={0.1}
                    value={s.pvTexture ?? 1}
                    onChange={(_, d) => update('pvTexture', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    镜头运动强度 {(s.pvCameraMotion ?? 1).toFixed(2)}x
                  </Text>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={s.pvCameraMotion ?? 1}
                    onChange={(_, d) => update('pvCameraMotion', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    逐字动势 {(s.pvCharMotion ?? 1).toFixed(2)}x
                  </Text>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={s.pvCharMotion ?? 1}
                    onChange={(_, d) => update('pvCharMotion', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    逐字入场时序 {(s.pvCharTiming ?? 1).toFixed(2)}x
                  </Text>
                  <Slider
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={s.pvCharTiming ?? 1}
                    onChange={(_, d) => update('pvCharTiming', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    逐字入场:
                  </Text>
                  <Dropdown
                    value={
                      TEMPERA_ENTER_OPTIONS.find((o) => o.value === (s.pvTemperaEnter ?? 'auto'))?.label ??
                      TEMPERA_ENTER_OPTIONS[0].label
                    }
                    selectedOptions={[s.pvTemperaEnter ?? 'auto']}
                    onOptionSelect={(_, d) => update('pvTemperaEnter', String(d.optionValue))}
                  >
                    {TEMPERA_ENTER_OPTIONS.map((o) => (
                      <Option key={o.value} value={o.value}>
                        {o.label}
                      </Option>
                    ))}
                  </Dropdown>
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    尾字强调概率 {Math.round((s.pvTailEmphasis ?? 0.38) * 100)}%
                  </Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={s.pvTailEmphasis ?? 0.38}
                    onChange={(_, d) => update('pvTailEmphasis', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    镜头平移 {(s.pvPan ?? 1).toFixed(2)}x
                  </Text>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={s.pvPan ?? 1}
                    onChange={(_, d) => update('pvPan', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    歌词远近 {(s.pvZoom ?? 1).toFixed(2)}x
                  </Text>
                  <Slider
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={s.pvZoom ?? 1}
                    onChange={(_, d) => update('pvZoom', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    画面横移 {((s.pvOffsetX ?? 0) >= 0 ? '+' : '') + Math.round((s.pvOffsetX ?? 0) * 100)}%
                  </Text>
                  <Slider
                    min={-0.5}
                    max={0.5}
                    step={0.01}
                    value={s.pvOffsetX ?? 0}
                    onChange={(_, d) => update('pvOffsetX', d.value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300} style={{ minWidth: 140 }}>
                    画面纵移{' '}
                    {((s.pvOffsetY ?? 0.11) - 0.11 >= 0 ? '+' : '') + Math.round(((s.pvOffsetY ?? 0.11) - 0.11) * 100)}%
                  </Text>
                  {/* 显示值 = 实际值 - 0.11(0.11 是构图正常位);拖动结果换算回实际值再落盘 */}
                  <Slider
                    min={-0.5}
                    max={0.25}
                    step={0.01}
                    value={(s.pvOffsetY ?? 0.11) - 0.11}
                    onChange={(_, d) => update('pvOffsetY', d.value + 0.11)}
                  />
                </div>
                <div className={styles.row}>
                  <Text size={300}>色彩模式:</Text>
                  <RadioGroup
                    layout="horizontal"
                    value={s.pvColorMode ?? 'mono'}
                    onChange={(_, d) => update('pvColorMode', d.value as typeof s.pvColorMode)}
                  >
                    <Radio value="theme" label="主题双色" />
                    <Radio value="mono" label="黑白灰" />
                    <Radio value="cover" label="封面渐变" />
                  </RadioGroup>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  「封面渐变」从当前歌曲封面提取主色,提取失败自动回退主题双色。
                </Text>
                <Text size={300} weight="semibold">
                  后处理
                </Text>
                <Switch
                  label="整体后处理滤镜"
                  checked={s.pvPost !== false}
                  onChange={(_, d) => update('pvPost', d.checked)}
                />
                {s.pvPost !== false && (
                  <>
                    <div className={styles.row}>
                      <Text size={300} style={{ minWidth: 140 }}>
                        胶片颗粒 {(s.pvGrain ?? 0.15).toFixed(2)}x
                      </Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.pvGrain ?? 0.15}
                        onChange={(_, d) => update('pvGrain', d.value)}
                      />
                    </div>
                    <div className={styles.row}>
                      <Text size={300} style={{ minWidth: 140 }}>
                        对比度增强 {(s.pvContrast ?? 0).toFixed(2)}x
                      </Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.pvContrast ?? 0}
                        onChange={(_, d) => update('pvContrast', d.value)}
                      />
                    </div>
                    <div className={styles.row}>
                      <Text size={300} style={{ minWidth: 140 }}>
                        RGB 色差 {(s.pvRgbShift ?? 0).toFixed(2)}x
                      </Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.pvRgbShift ?? 0}
                        onChange={(_, d) => update('pvRgbShift', d.value)}
                      />
                    </div>
                    <div className={styles.row}>
                      <Text size={300} style={{ minWidth: 140 }}>
                        暗角 {(s.pvVignette ?? 0.4).toFixed(2)}x
                      </Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.pvVignette ?? 0.4}
                        onChange={(_, d) => update('pvVignette', d.value)}
                      />
                    </div>
                    <div className={styles.row}>
                      <Text size={300} style={{ minWidth: 140 }}>
                        透镜扭曲 {(s.pvLens ?? 0.15).toFixed(2)}x
                      </Text>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={s.pvLens ?? 0.15}
                        onChange={(_, d) => update('pvLens', d.value)}
                      />
                    </div>
                  </>
                )}
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  提高纹理分辨率会增加 GPU 显存占用和渲染负载,可能影响性能。
                </Text>
              </>
            )}
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              文字PV 使用逐字卡拉OK上色(与经典样式同一套时间轴);全屏页控制条上的「PV」按钮可随时切换样式与动效。
            </Text>
          </>
        )}
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
      <div {...sec("搜索")}>
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
      <div {...sec("快捷方式伪装")}>
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
      <div {...sec("听歌识别")}>
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
      <div {...sec("下载")}>
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
      <div {...sec("缓存")}>
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
      <div {...sec("备份与恢复")}>
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
      <div {...sec("关于")}>
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
        </div>
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
      {kgLoginPlatform && (
        <KugouLoginDialog
          open
          platform={kgLoginPlatform}
          onClose={() => setKgLoginPlatform(null)}
        />
      )}

      {/* 恢复默认设置确认:勾选要重置的分区 */}
      <Dialog
        open={resetOpen}
        onOpenChange={(_, d) => {
          setResetOpen(d.open)
          if (d.open) setResetSel({})
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>恢复默认设置</DialogTitle>
            <DialogContent>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 12 }}>
                勾选要恢复默认的分区(登录状态、歌单与已下载歌曲不受影响):
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {RESETTABLE_SECTIONS.map((name) => (
                  <Checkbox
                    key={name}
                    label={name}
                    checked={resetSel[name] !== false}
                    onChange={(_, d) => setResetSel((p) => ({ ...p, [name]: d.checked === true }))}
                  />
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setResetOpen(false)}>
                取消
              </Button>
              <Button
                appearance="primary"
                disabled={RESETTABLE_SECTIONS.every((n) => resetSel[n] === false)}
                onClick={() => {
                  setResetOpen(false)
                  void doResetSettings()
                }}
              >
                恢复所选
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </PageLayout>
  )
}
