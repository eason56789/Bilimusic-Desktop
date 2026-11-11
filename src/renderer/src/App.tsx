/** 应用外壳:标题栏 + 侧边导航 + 页面 + 播放条 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FluentProvider,
  Text,
  TabList,
  Tab,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  SearchRegular,
  MusicNote2Regular,
  ArrowDownloadRegular,
  HeartRegular,
  HeartFilled,
  MicRegular,
  SettingsRegular,
  TrophyRegular
} from '@fluentui/react-icons'
import { useStore } from './store'
import type { PageKey } from './store'
import { buildTheme } from './lib/theme'
import { ToastHost } from './lib/toast'
import { applyMotionVars, useMotionFine, useMotionLevel } from './lib/motion'
import brandIconUrl from './assets/brand.png'
import type { Settings } from '@shared/types'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { Onboarding } from './components/Onboarding'
import { GlobalDialogs } from './components/GlobalDialogs'
import { CloseAskDialog } from './components/CloseAskDialog'
import { UpdateDialog } from './components/UpdateDialog'
import { FloatBridge } from './components/FloatBridge'
import { FloatLyricApp } from './components/FloatLyricApp'
import { FloatMenuApp } from './components/FloatMenuApp'
import { SearchPage } from './pages/SearchPage'
import { PlaylistsPage, RecentPage } from './pages/PlaylistsPage'
import { RecognizePage } from './pages/RecognizePage'
import { FavoritesPage } from './pages/FavoritesPage'
import { ChartsPage } from './pages/ChartsPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ArtistPage } from './components/ArtistPage'

const useStyles = makeStyles({
  frame: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    color: tokens.colorNeutralForeground1
  },
  titlebar: {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '14px',
    flexShrink: 0,
    backgroundColor: 'var(--app-titlebar-bg)',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`
  },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  sidebar: {
    width: '216px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 10px',
    gap: '8px',
    backgroundColor: 'var(--app-sidebar-bg)',
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    backdropFilter: 'blur(60px) saturate(1.4)'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px 12px'
  },
  brandIcon: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    objectFit: 'cover',
    flexShrink: 0
  },
  navTabs: { display: 'flex', flexDirection: 'column', gap: '2px' },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--app-content-bg)',
    position: 'relative'
  },
  /** 歌手主页覆盖层:盖在原页面上方,返回后原页面状态(搜索词/结果/滚动位置)不丢 */
  artistOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--app-content-bg)'
  }
})

function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return dark
}

/** 按设置把 rgba 玻璃色写入 CSS 变量(材质关闭时用不透明色兜底) */
function useGlassVars(dark: boolean, effect: string, alpha: number, uiBg: boolean): void {
  useEffect(() => {
    const root = document.documentElement
    // 供 CSS 区分深浅主题(顶部轻提示等自绘浮层用;Fluent 的 token 管不到 portal 出去的节点)
    root.setAttribute('data-bm-theme', dark ? 'dark' : 'light')
    // 界面底图启用:body 挂 class,全局 CSS 把卡片/浮层玻璃化(见 styles.css)
    document.body.classList.toggle('bm-uibg', uiBg)
    const on = effect !== 'none'
    // 界面底图启用时:所有玻璃层用统一的低不透明度,整窗一致透出底图
    const a = uiBg ? 0.3 : on ? Math.min(1, Math.max(0.35, alpha)) : 1
    /** 底图启用 → 统一半透明;材质开启 → 半透明;关闭 → 同色实底 */
    const glass = (r: number, g: number, b: number, mul = 1): string =>
      uiBg || on ? `rgba(${r}, ${g}, ${b}, ${a * mul})` : `rgb(${r}, ${g}, ${b})`
    if (dark) {
      root.style.setProperty('--app-titlebar-bg', glass(32, 32, 32))
      root.style.setProperty('--app-sidebar-bg', glass(28, 28, 28))
      root.style.setProperty('--app-content-bg', glass(20, 20, 20))
      root.style.setProperty('--app-frame-bg', glass(20, 20, 20))
      root.style.setProperty('--app-player-bg', glass(28, 28, 28))
    } else {
      root.style.setProperty('--app-titlebar-bg', glass(243, 243, 243))
      root.style.setProperty('--app-sidebar-bg', glass(238, 238, 238))
      root.style.setProperty('--app-content-bg', glass(249, 249, 249))
      root.style.setProperty('--app-frame-bg', glass(249, 249, 249))
      root.style.setProperty('--app-player-bg', glass(243, 243, 243))
    }
  }, [dark, effect, alpha, uiBg])
}

/** 全局播放快捷键 */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const st = useStore.getState()
      const inNowPlaying = st.nowPlayingOpen
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          st.togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.ctrlKey || e.metaKey) st.next(true)
          else st.seek(Math.min(st.duration, st.position + 5))
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.ctrlKey || e.metaKey) st.prev()
          else st.seek(Math.max(0, st.position - 5))
          break
        case 'ArrowUp':
          e.preventDefault()
          st.setVolume(Math.min(1, st.volume + 0.05), true)
          break
        case 'ArrowDown':
          e.preventDefault()
          st.setVolume(Math.max(0, st.volume - 0.05), true)
          break
        case 'KeyM':
          st.setMuted(!st.muted)
          break
        case 'KeyL':
          if (st.current) st.setNowPlayingOpen(!inNowPlaying)
          break
        case 'KeyF':
          if (st.current) st.setNowPlayingOpen(!inNowPlaying)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 页面渲染表:集中一处,供页面栈按 key 复用 */
function renderPage(p: PageKey): JSX.Element {
  switch (p) {
    case 'search':
      return <SearchPage />
    case 'playlists':
      return <PlaylistsPage />
    case 'charts':
      return <ChartsPage />
    case 'recognize':
      return <RecognizePage />
    case 'downloads':
      return <DownloadsPage />
    case 'recent':
      return <RecentPage />
    case 'favorites':
      return <FavoritesPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <SearchPage />
  }
}

interface PageEntry {
  /** 每次切页唯一;同一页面重复进入也会得到新 key,保证入场动画重播 */
  key: string
  page: PageKey
  leaving: boolean
}

/**
 * 页面栈:保留旧页面到退场结束,实现交叉淡入淡出。
 *
 * 关键点:旧页的 React 树在退场期间不被卸载,所以它内部的 useState/滚动位置
 * 原样保留。退场时长过后才真正移除,避免内存里长期挂两棵树。
 */
function usePageStack(page: PageKey, level: 'full' | 'calm' | 'off'): PageEntry[] {
  const [stack, setStack] = useState<PageEntry[]>(() => [
    { key: `${page}-0`, page, leaving: false }
  ])
  const seqRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setStack((prev) => {
      const top = prev[prev.length - 1]
      if (top && top.page === page && !top.leaving) return prev
      seqRef.current += 1
      const incoming: PageEntry = { key: `${page}-${seqRef.current}`, page, leaving: false }
      // 动效关闭:不留旧页,直接切换(避免为了 0ms 动画多留一帧 DOM)
      if (level === 'off') return [incoming]
      // 快速连点时要防止旧页面积压:只保留紧邻的那一页做退场,更早的直接丢弃。
      // 丢弃时它已经播完入场,视觉上不会看到突变。
      const previous = prev.length > 0 ? [{ ...prev[prev.length - 1], leaving: true }] : []
      return [...previous, incoming]
    })
  }, [page, level])

  // 退场结束后清理:只保留栈顶
  useEffect(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    if (level === 'off') {
      setStack((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev))
      return
    }
    // 退场时长从 CSS 变量取,与视觉严格一致
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--bm-mo-dur-page-out')
    const dur = Number.parseFloat(raw)
    const wait = (Number.isFinite(dur) ? dur : 180) + 40
    timerRef.current = window.setTimeout(() => {
      setStack((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev))
    }, wait)
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [stack, level])

  return stack
}

function Shell({ className }: { className?: string }) {
  const styles = useStyles()
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const artistPageId = useStore((s) => s.artistPageId)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const motionLevel = useMotionLevel()
  const pageStack = usePageStack(page, motionLevel)
  const ui = useStore((s) => s.library?.settings.uiModules)
  /** 识曲入口跟随总开关:关闭后侧边栏与页面都不再提供入口 */
  const recognizeEnabled = useStore((s) => s.library?.settings.songRecognizeEnabled !== false)
  /** 界面底图:铺在主窗口最底层,玻璃面板透出图片 */
  const uiBgEnabled = useStore((s) => s.library?.settings.uiBgEnabled ?? false)
  const uiBgImage = useStore((s) => s.library?.settings.uiBgImage ?? '')
  const uiBgDim = Math.min(80, Math.max(0, useStore((s) => s.library?.settings.uiBgDim ?? 45))) / 100
  const uiBgBlur = Math.min(40, Math.max(0, useStore((s) => s.library?.settings.uiBgBlur ?? 0)))
  /** 播放条外观:悬浮岛 / 经典通栏 */
  const playerBarStyle = useStore((s) => s.library?.settings.playerBarStyle ?? 'island')

  return (
    <div
      className={`${styles.frame} ${className ?? ''}`}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {uiBgEnabled && uiBgImage && (
        <>
          <img
            src={`bmedia://local/?path=${encodeURIComponent(uiBgImage)}`}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: uiBgBlur > 0 ? 'scale(1.05)' : undefined,
              filter: uiBgBlur > 0 ? `blur(${uiBgBlur}px)` : undefined,
              pointerEvents: 'none'
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(0,0,0,${uiBgDim})`,
              pointerEvents: 'none'
            }}
          />
        </>
      )}
      {/* 标题栏(拖动区,右侧留出原生窗口按钮) */}
      <div className={`${styles.titlebar} titlebar-drag`}>
        <Text size={300} weight="semibold" style={{ color: tokens.colorNeutralForeground2 }}>
          BiliMusic
        </Text>
        <div style={{ flex: 1 }} />
        <div style={{ width: '140px' }} />
      </div>

      <div className={styles.body}>
        <nav className={styles.sidebar}>
          <div className={`${styles.brand} bm-brand-in`}>
            <img src={brandIconUrl} alt="BiliMusic" className={styles.brandIcon} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text weight="semibold">BiliMusic</Text>
              <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                Desktop
              </Text>
            </div>
          </div>
          <TabList
            vertical
            appearance="transparent"
            selectedValue={page}
            onTabSelect={(_, d) => setPage(d.value as typeof page)}
            className={styles.navTabs}
          >
            {ui?.navSearch !== false && (
              <Tab value="search" icon={<SearchRegular />} className="bm-nav-tab">
                搜索
              </Tab>
            )}
            {ui?.navPlaylists !== false && (
              <Tab value="playlists" icon={<MusicNote2Regular />} className="bm-nav-tab">
                歌单
              </Tab>
            )}
            <Tab value="charts" icon={<TrophyRegular />} className="bm-nav-tab">
              排行榜
            </Tab>
            {/* 识曲入口跟随「设置 → 听歌识别」总开关,关闭时整个 Tab 隐藏 */}
            {recognizeEnabled && (
              <Tab value="recognize" icon={<MicRegular />} className="bm-nav-tab">
                听歌识别
              </Tab>
            )}
            {ui?.navDownloads !== false && (
              <Tab value="downloads" icon={<ArrowDownloadRegular />} className="bm-nav-tab">
                下载
              </Tab>
            )}
            {ui?.navRecent !== false && (
              <Tab value="recent" icon={<HeartRegular />} className="bm-nav-tab">
                最近播放
              </Tab>
            )}
            <Tab value="favorites" icon={<HeartFilled />} className="bm-nav-tab">
              我的收藏
            </Tab>
            {/* 设置入口固定显示:它是所有自定义开关的唯一恢复路径,不可隐藏 */}
            <Tab value="settings" icon={<SettingsRegular />} className="bm-nav-tab">
              设置
            </Tab>
          </TabList>
        </nav>

        <main className={styles.content}>
          {/* 页面栈:切页时旧页面继续挂载到退场结束,实现真正的交叉淡入淡出。
              旧页面组件不卸载 → 它的搜索词/结果/滚动位置在退场期间原样保留,
              退场结束才真正移除(180ms,内存峰值多一个页面树)。 */}
          {pageStack.map((entry) => (
            <div
              key={entry.key}
              className={[
                entry.leaving ? `page-leaving page-exit-${anim}` : '',
                !entry.leaving && anim !== 'none' ? `page-anim-${anim}` : ''
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
              aria-hidden={entry.leaving || undefined}
            >
              {renderPage(entry.page)}
            </div>
          ))}
          {artistPageId ? (
            <div
              className={`${styles.artistOverlay} ${anim !== 'none' ? `page-anim-${anim}` : undefined}`}
            >
              <ArtistPage />
            </div>
          ) : null}
        </main>
      </div>

      {/* 播放条外观由设置决定:island=两侧留白+圆角阴影;classic=贴满窗口的通栏 */}
      <div className={`bm-player-dock bm-player-dock--${playerBarStyle}`}>
        <PlayerBar style={playerBarStyle} />
      </div>
      <NowPlaying />
    </div>
  )
}

/** 由友好设置生成界面 CSS(界面大小/歌词字号/列表密度/圆角) */
function buildPresetCss(s: Settings | undefined): string {
  if (!s) return ''
  const parts: string[] = []
  const zoomMap: Record<string, number> = { small: 0.9, standard: 1, large: 1.1, xlarge: 1.25 }
  if (s.uiScale !== 'standard') parts.push(`#root { zoom: ${zoomMap[s.uiScale] ?? 1} }`)
  const lyricMap: Record<string, string> = {
    small: '16px',
    standard: '20px',
    large: '24px',
    xlarge: '28px'
  }
  parts.push(`:root { --lyric-size: ${lyricMap[s.lyricSize] ?? '20px'} }`)
  if (s.density === 'compact') {
    parts.push(
      '.song-row { padding-top: 2px !important; padding-bottom: 2px !important; }',
      '.dl-row { padding-top: 4px !important; padding-bottom: 4px !important; }'
    )
  } else if (s.density === 'relaxed') {
    parts.push(
      '.song-row { padding-top: 11px !important; padding-bottom: 11px !important; }',
      '.dl-row { padding-top: 12px !important; padding-bottom: 12px !important; }'
    )
  }
  return parts.join('\n')
}

export function App() {
  // 悬浮歌词窗与主界面共用同一份渲染包,按 hash 分流(悬浮窗不初始化库/引导)
  if (window.location.hash === '#float') return <FloatLyricApp />
  if (window.location.hash === '#floatmenu') return <FloatMenuApp />
  return <MainApp />
}

function MainApp() {
  const library = useStore((s) => s.library)
  const init = useStore((s) => s.init)
  const systemDark = useSystemDark()
  const [obDone, setObDone] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  const dark = library ? (library.settings.theme === 'system' ? systemDark : library.settings.theme === 'dark') : true
  const theme = useMemo(
    () => buildTheme(dark, library?.settings.accent ?? '#0f6cbd'),
    [dark, library?.settings.accent]
  )

  const effect = library?.settings.windowEffect ?? 'acrylic'
  const glassAlpha = library?.settings.glassAlpha ?? 0.82
  const customCss = library?.settings.customCss ?? ''
  const presetCss = useMemo(() => buildPresetCss(library?.settings), [library?.settings])
  const uiBgOn = useStore((s) => s.library?.settings.uiBgEnabled ?? false)
  useGlassVars(dark, effect, glassAlpha, uiBgOn)
  useGlobalShortcuts()
  // 动效档位 + 速率 → CSS 变量:一处写入,全应用(含列表/卡片/封面)统一生效
  const motionLevel = useMotionLevel()
  const motionSpeed = useStore((s) => s.library?.settings.motionSpeed ?? 1)
  const motionFine = useMotionFine()
  useEffect(() => {
    applyMotionVars(motionLevel, motionSpeed, motionFine)
    // motionFine 是每次渲染新建的对象,用各通道值做依赖才能正确触发
  }, [motionLevel, motionSpeed, motionFine.list, motionFine.stagger, motionFine.page, motionFine.hover, motionFine.cover])

  // 界面样式注入:预设(大小/歌词字号/密度) + 用户自定义 CSS
  useEffect(() => {
    let el = document.getElementById('user-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'user-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = presetCss + (customCss ? '\n' + customCss : '')
  }, [presetCss, customCss])

  // 仅当材质设置本身变化时通知主进程
  // (此前依赖 library,而 library 会随下载进度/播放记录整对象刷新,导致 IPC 风暴)
  useEffect(() => {
    window.api?.windowSetEffect?.(effect).catch(() => {})
  }, [effect])

  const showOnboarding = !!library && !library.settings.onboarded && !obDone

  return (
    <FluentProvider
      theme={theme}
      style={{
        height: '100%',
        // 界面底图启用时这里必须全透:底图与暗化层在 Shell 内,玻璃色由 titlebar/sidebar/content 各出一份
        background: 'transparent'
      }}
    >
      {/* 轻提示:位置/样式/时长/图标由设置控制(默认顶部居中滑下) */}
      <ToastHost
        prefs={{
          position: library?.settings.toastPosition ?? 'top-center',
          duration: library?.settings.toastDuration ?? 1,
          style: library?.settings.toastStyle ?? 'hud',
          showIcon: library?.settings.toastShowIcon ?? true
        }}
      />
      {/* obDone:刚完成引导时主界面播放入场动画(放大淡入) */}
      <Shell className={obDone ? 'shell-enter' : undefined} />
      <GlobalDialogs />
      <CloseAskDialog />
      <UpdateDialog />
      <FloatBridge />
      {showOnboarding && <Onboarding onDone={() => setObDone(true)} />}
    </FluentProvider>
  )
}
