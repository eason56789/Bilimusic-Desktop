/** 应用外壳:标题栏 + 侧边导航 + 页面 + 播放条 */
import { useEffect, useMemo, useState } from 'react'
import {
  FluentProvider,
  Text,
  Toaster,
  TabList,
  Tab,
  useToastController,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  SearchRegular,
  MusicNote2Regular,
  ArrowDownloadRegular,
  HeartRegular,
  SettingsRegular
} from '@fluentui/react-icons'
import { useStore } from './store'
import { buildTheme } from './lib/theme'
import { setToastController } from './lib/toast'
import brandIconUrl from './assets/brand.png'
import type { Settings } from '@shared/types'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { Onboarding } from './components/Onboarding'
import { GlobalDialogs } from './components/GlobalDialogs'
import { SearchPage } from './pages/SearchPage'
import { PlaylistsPage, RecentPage } from './pages/PlaylistsPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { SettingsPage } from './pages/SettingsPage'

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
    width: '196px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 8px',
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
function useGlassVars(dark: boolean, effect: string, alpha: number): void {
  useEffect(() => {
    const root = document.documentElement
    const on = effect !== 'none'
    const a = on ? Math.min(1, Math.max(0.35, alpha)) : 1
    /** 材质开启 → 半透明;关闭 → 同色实底 */
    const glass = (r: number, g: number, b: number, mul = 1): string =>
      on ? `rgba(${r}, ${g}, ${b}, ${a * mul})` : `rgb(${r}, ${g}, ${b})`
    if (dark) {
      root.style.setProperty('--app-titlebar-bg', glass(32, 32, 32))
      root.style.setProperty('--app-sidebar-bg', glass(28, 28, 28))
      root.style.setProperty('--app-content-bg', glass(20, 20, 20, 0.88))
      root.style.setProperty('--app-frame-bg', glass(20, 20, 20, 0.82))
      root.style.setProperty('--app-player-bg', glass(28, 28, 28))
    } else {
      root.style.setProperty('--app-titlebar-bg', glass(243, 243, 243))
      root.style.setProperty('--app-sidebar-bg', glass(238, 238, 238))
      root.style.setProperty('--app-content-bg', glass(249, 249, 249, 0.88))
      root.style.setProperty('--app-frame-bg', glass(249, 249, 249, 0.82))
      root.style.setProperty('--app-player-bg', glass(243, 243, 243))
    }
  }, [dark, effect, alpha])
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

function Shell({ className }: { className?: string }) {
  const styles = useStyles()
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const ui = useStore((s) => s.library?.settings.uiModules)

  return (
    <div className={`${styles.frame} ${className ?? ''}`}>
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
          <div className={styles.brand}>
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
              <Tab value="search" icon={<SearchRegular />}>
                搜索
              </Tab>
            )}
            {ui?.navPlaylists !== false && (
              <Tab value="playlists" icon={<MusicNote2Regular />}>
                歌单
              </Tab>
            )}
            {ui?.navDownloads !== false && (
              <Tab value="downloads" icon={<ArrowDownloadRegular />}>
                下载
              </Tab>
            )}
            {ui?.navRecent !== false && (
              <Tab value="recent" icon={<HeartRegular />}>
                最近播放
              </Tab>
            )}
            {/* 设置入口固定显示:它是所有自定义开关的唯一恢复路径,不可隐藏 */}
            <Tab value="settings" icon={<SettingsRegular />}>
              设置
            </Tab>
          </TabList>
        </nav>

        <main className={styles.content}>
          <div
            key={page}
            className={anim !== 'none' ? `page-anim-${anim}` : undefined}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            {page === 'search' && <SearchPage />}
            {page === 'playlists' && <PlaylistsPage />}
            {page === 'downloads' && <DownloadsPage />}
            {page === 'recent' && <RecentPage />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>

      <PlayerBar />
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
  const library = useStore((s) => s.library)
  const init = useStore((s) => s.init)
  const systemDark = useSystemDark()
  const [obDone, setObDone] = useState(false)
  const toasterId = 'app-toaster'
  const { dispatchToast, dismissToast } = useToastController(toasterId)

  useEffect(() => {
    init()
    setToastController(
      (content, options) => dispatchToast(content as never, options as never),
      (toastId) => dismissToast(toastId)
    )
    return () => setToastController(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchToast, dismissToast])

  const dark = library ? (library.settings.theme === 'system' ? systemDark : library.settings.theme === 'dark') : true
  const theme = useMemo(
    () => buildTheme(dark, library?.settings.accent ?? '#0f6cbd'),
    [dark, library?.settings.accent]
  )

  const effect = library?.settings.windowEffect ?? 'acrylic'
  const glassAlpha = library?.settings.glassAlpha ?? 0.82
  const customCss = library?.settings.customCss ?? ''
  const presetCss = useMemo(() => buildPresetCss(library?.settings), [library?.settings])
  useGlassVars(dark, effect, glassAlpha)
  useGlobalShortcuts()

  // 界面样式注入:预设(大小/歌词字号/密度/圆角) + 用户自定义 CSS
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
        background: 'var(--app-frame-bg, transparent)'
      }}
    >
      <Toaster toasterId={toasterId} position="bottom-end" />
      {/* obDone:刚完成引导时主界面播放入场动画(放大淡入) */}
      <Shell className={obDone ? 'shell-enter' : undefined} />
      <GlobalDialogs />
      {showOnboarding && <Onboarding onDone={() => setObDone(true)} />}
    </FluentProvider>
  )
}
