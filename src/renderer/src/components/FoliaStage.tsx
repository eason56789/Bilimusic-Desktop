/**
 * folia 歌词样式注册表 + 宿主组件
 *
 * 每个样式都来自 folia(AGPL-3.0,https://github.com/chthollyphile/folia-major),
 * 各自一个 lazy 组件。宿主负责:
 *  - 把本项目的 LyricLine / 设置桥接成 folia 的 props(bridge.ts);
 *  - 用音频 currentTime 驱动 currentTime / audioPower / audioBands;
 *  - 在样式切换时保留容器尺寸与全屏铺满。
 */
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { motionValue as fmMotionValue, type MotionValue } from 'framer-motion'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { findLineIndex, toFoliaLines, toFoliaTheme, type FoliaLine, type FoliaTheme } from '../lib/folia/bridge'
import { applyCoverTheme, loadCoverColors, peekCoverColors } from '../lib/folia/coverTheme'
import { coverSrc } from './Cover'

/* ===================== 样式清单 ===================== */

export interface FoliaStyleDef {
  /** 样式 id(与 folia 的 mode 一致) */
  id: string
  /** 中文名 */
  label: string
  /** 是否已移植完成 */
  ready: boolean
  /** 缩略图(静态 png;没有就用渐变占位) */
  thumb?: string
}

/** 18 个样式(含本项目已自研的凝彩与逐字PV等,统一在这里列出) */
export const FOLIA_STYLES: FoliaStyleDef[] = [
  { id: 'still', label: '时计', ready: true },
  { id: 'classic', label: '经典', ready: true },
  { id: 'partita', label: '云阶', ready: true },
  { id: 'claddagh', label: '回环', ready: true },
  { id: 'cadenza', label: '商籁', ready: true },
  { id: 'fume', label: '雾里', ready: true },
  { id: 'cappella', label: '群唱', ready: true },
  { id: 'monet', label: '莫奈', ready: true },
  { id: 'pendolo', label: '钟摆', ready: true },
  { id: 'lumiere', label: '绘光', ready: true },
  { id: 'hanabi', label: '花火', ready: true },
  { id: 'nebbia', label: '雾笺', ready: true },
  { id: 'sonnet', label: '诗节', ready: true },
  { id: 'machi', label: '町景', ready: true }
]

/** 已移植完成的 folia 样式 id 集合(供 PvLyricsSafe 分派用) */
export const FOLIA_STYLE_IDS: ReadonlySet<string> = new Set(
  FOLIA_STYLES.filter((s) => s.ready).map((s) => s.id)
)

/** 已移植样式的懒加载表(新增样式时在这里登记:返回组件的 default 导出) */
const STYLE_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  still: lazy(() =>
    import('../lib/folia/styles/still/VisualizerStill').then((m) => ({ default: (m as any).VisualizerStill ?? (m as any).default }))
  ),
  classic: lazy(() =>
    import('../lib/folia/styles/classic/VisualizerClassic').then((m) => ({ default: (m as any).VisualizerClassic ?? (m as any).default }))
  ),
  partita: lazy(() =>
    import('../lib/folia/styles/partita/VisualizerPartita').then((m) => ({ default: (m as any).VisualizerPartita ?? (m as any).default }))
  ),
  claddagh: lazy(() =>
    import('../lib/folia/styles/claddagh/VisualizerCladdagh').then((m) => ({ default: (m as any).VisualizerCladdagh ?? (m as any).default }))
  ),
  cadenza: lazy(() =>
    import('../lib/folia/styles/cadenza/VisualizerCadenza').then((m) => ({ default: (m as any).VisualizerCadenza ?? (m as any).default }))
  ),
  fume: lazy(() =>
    import('../lib/folia/styles/fume/VisualizerFume').then((m) => ({ default: (m as any).VisualizerFume ?? (m as any).default }))
  ),
  cappella: lazy(() =>
    import('../lib/folia/styles/cappella/VisualizerCappella').then((m) => ({ default: (m as any).VisualizerCappella ?? (m as any).default }))
  ),
  monet: lazy(() =>
    import('../lib/folia/styles/monet/VisualizerMonet').then((m) => ({ default: (m as any).VisualizerMonet ?? (m as any).default }))
  ),
  pendolo: lazy(() =>
    import('../lib/folia/styles/pendolo/VisualizerPendolo').then((m) => ({ default: (m as any).VisualizerPendolo ?? (m as any).default }))
  ),
  lumiere: lazy(() =>
    import('../lib/folia/styles/lumiere/VisualizerLumiere').then((m) => ({ default: (m as any).VisualizerLumiere ?? (m as any).default }))
  ),
  hanabi: lazy(() =>
    import('../lib/folia/styles/hanabi/VisualizerHanabi').then((m) => ({ default: (m as any).VisualizerHanabi ?? (m as any).default }))
  ),
  nebbia: lazy(() =>
    import('../lib/folia/styles/nebbia/VisualizerNebbia').then((m) => ({ default: (m as any).VisualizerNebbia ?? (m as any).default }))
  ),
  sonnet: lazy(() =>
    import('../lib/folia/styles/sonnet/VisualizerSonnet').then((m) => ({ default: (m as any).VisualizerSonnet ?? (m as any).default }))
  ),
  machi: lazy(() =>
    import('../lib/folia/styles/machi/VisualizerMachi').then((m) => ({ default: (m as any).VisualizerMachi ?? (m as any).default }))
  )
}

/* ===================== 宿主 ===================== */

/** 音频包络(驱动 audioPower / audioBands;folia 样式靠它做呼吸与脉冲) */
interface AudioFrame {
  power: number
  bands: { bass: number; mid: number; treble: number }
}

export interface FoliaStageProps {
  /** 已桥接好的 folia 行(秒) */
  lines: FoliaLine[]
  theme: FoliaTheme
  /** 样式 id */
  styleId: string
}

/**
 * 用 rAF 采样音频电平。WebAudio 不可用(跨域/CORS)时退化成"按播放状态给一个常量",
 * 保证样式至少不会因为 power=0 而全黑。
 */
function useAudioFrame(playing: boolean): React.MutableRefObject<AudioFrame> {
  const ref = useRef<AudioFrame>({ power: 0.5, bands: { bass: 0.5, mid: 0.5, treble: 0.5 } })
  const analyserRef = useRef<AnalyserNode | null>(null)
  const initedRef = useRef(false)

  useEffect(() => {
    let raf = 0
    const audio = getAudioElement()

    // 尝试挂一个 analyser;失败就保持常量电平
    const tryInit = (): void => {
      if (initedRef.current) return
      try {
        const AC = (window as any).AudioContext
        if (!AC) return
        // 复用项目已有的音频上下文(store 里若已建过,video 元素已接进去)
        const ctx = (audio as any).__biliAudioCtx as AudioContext | undefined
        if (!ctx) return
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        ctx.createMediaElementSource(audio)
        analyser.connect(ctx.destination)
        analyserRef.current = analyser
        initedRef.current = true
      } catch {
        /* 已被别处接管或不支持:保持常量电平 */
      }
    }

    const buf = new Uint8Array(128)
    const tick = (): void => {
      tryInit()
      const an = analyserRef.current
      if (an) {
        an.getByteFrequencyData(buf)
        let bass = 0
        let mid = 0
        let treble = 0
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i] / 255
          if (i < 8) bass += v
          else if (i < 40) mid += v
          else treble += v
        }
        bass /= 8
        mid /= 32
        treble /= (buf.length - 40)
        ref.current = {
          power: Math.min(1, (bass * 0.5 + mid * 0.35 + treble * 0.15) * 1.6),
          bands: { bass, mid, treble }
        }
      } else {
        // 无 analyser:播放时给一个缓慢呼吸的常量,暂停时归零
        const base = playing ? 0.55 + Math.sin(performance.now() / 900) * 0.12 : 0.08
        ref.current = { power: base, bands: { bass: base, mid: base, treble: base } }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  return ref
}

export function FoliaStage({ lines, theme, styleId }: FoliaStageProps): JSX.Element {
  const playing = useStore((s) => s.playing)
  const current = useStore((s) => s.current)
  const latentBackground = useStore((s) => s.library?.settings.latentBackground ?? true)
  const customBgEnabled = useStore((s) => s.library?.settings.customBgEnabled ?? false)
  const customBgImage = useStore((s) => s.library?.settings.customBgImage ?? '')
  const customBgDim = useStore((s) => s.library?.settings.customBgDim ?? 45)
  const customBgBlur = useStore((s) => s.library?.settings.customBgBlur ?? 0)
  const offset = useStore((s) => s.library?.settings.lyricOffsetMs ?? 0)
  const audioRef = useAudioFrame(playing)
  const [, force] = useState(0)
  const idxRef = useRef(-1)
  const seekRef = useRef<HTMLDivElement>(null)

  // 逐帧:计算当前行,变化时才 setState(避免每帧重渲染整棵样式树)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const t = Math.max(0, getAudioElement().currentTime - offset / 1000)
      const idx = findLineIndex(lines, t)
      if (idx !== idxRef.current) {
        idxRef.current = idx
        force((n) => n + 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines, offset])

  // 已移除的样式(如 tilt/diorama)或未知 id 一律退回经典,避免落进"尚未移植"占位
  const Comp = STYLE_COMPONENTS[styleId] ?? STYLE_COMPONENTS.classic
  /**
   * currentTime / audioPower 必须是真正的 framer-motion MotionValue ——
   * 上游样式会对它们用 useSpring / useTransform,假对象会直接报错。
   * 这里用 motionValue() 建真对象,由下面的 rAF 逐帧 set()。
   */
  const clockMV = useMemo(() => fmMotionValue(0), [])
  const powerMV = useMemo(() => fmMotionValue(0), [])
  const bandsMV = useMemo(
    () => ({
      bass: fmMotionValue(0),
      lowMid: fmMotionValue(0),
      mid: fmMotionValue(0),
      vocal: fmMotionValue(0),
      treble: fmMotionValue(0)
    }),
    []
  )

  // 逐帧把音频状态推进 MotionValue(样式通过 useSpring 跟随时要用)
  useEffect(() => {
    let raf = 0
    const push = (): void => {
      const t = Math.max(0, getAudioElement().currentTime - offset / 1000)
      clockMV.set(t)
      const a = audioRef.current
      powerMV.set(a.power)
      bandsMV.bass.set(a.bands.bass)
      bandsMV.lowMid.set(a.bands.mid * 0.8)
      bandsMV.mid.set(a.bands.mid)
      bandsMV.vocal.set(a.bands.treble * 0.6 + a.bands.mid * 0.4)
      bandsMV.treble.set(a.bands.treble)
      raf = requestAnimationFrame(push)
    }
    raf = requestAnimationFrame(push)
    return () => cancelAnimationFrame(raf)
  }, [clockMV, powerMV, bandsMV, offset, audioRef])

  return (
    <div ref={seekRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {Comp ? (
        <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: theme.backgroundColor }} />}>
          <Comp
            currentLineIndex={idxRef.current}
            lines={lines}
            theme={theme}
            subtitleTheme={theme}
            currentTime={clockMV}
            audioPower={powerMV}
            audioBands={bandsMV}
            showText
            isDaylight={false}
            paused={!playing}
            latentBackground={latentBackground}
            customBgEnabled={customBgEnabled}
            customBgImage={customBgImage ? `bmedia://local/?path=${encodeURIComponent(customBgImage)}` : null}
            customBgDim={customBgDim}
            customBgBlur={customBgBlur}
            songTitle={current?.title ?? null}
            songArtist={current?.artist ?? null}
            songAlbum={current?.album ?? null}
            coverUrl={coverSrc(current?.coverUrl, 480)}
          />
        </Suspense>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 14
          }}
        >
          该样式尚未移植
        </div>
      )}
    </div>
  )
}

/** 从项目歌词 + 设置一次性生成样式所需数据(背景色随专辑封面取色) */
export function useFoliaData(lyrics: LyricLine[]): { lines: FoliaLine[]; theme: FoliaTheme } {
  const settings = useStore((s) => s.library?.settings)
  const coverUrl = useStore((s) => s.current?.coverUrl)
  const themeMode = settings?.theme ?? 'system'
  const isDark = useMemo(() => {
    if (themeMode === 'dark') return true
    if (themeMode === 'light') return false
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  }, [themeMode])
  const lines = useMemo(() => toFoliaLines(lyrics), [lyrics])
  const baseTheme = useMemo(() => toFoliaTheme(settings, isDark), [settings, isDark])

  // 封面主色 → 主题色(异步加载,取不到就保持基础主题;模块级缓存按 URL 去重)
  const coverSrcUrl = useMemo(() => coverSrc(coverUrl, 480), [coverUrl])
  const [coverColors, setCoverColors] = useState<string[] | null>(() =>
    coverSrcUrl ? (peekCoverColors(coverSrcUrl) ?? null) : null
  )
  useEffect(() => {
    let alive = true
    if (!coverSrcUrl) {
      setCoverColors(null)
      return undefined
    }
    const cached = peekCoverColors(coverSrcUrl)
    if (cached) {
      setCoverColors(cached)
      return undefined
    }
    setCoverColors(null)
    loadCoverColors(coverSrcUrl).then((colors) => {
      if (alive && colors) setCoverColors(colors)
    })
    return () => {
      alive = false
    }
  }, [coverSrcUrl])

  const theme = useMemo(
    () => applyCoverTheme(baseTheme, coverColors),
    [baseTheme, coverColors]
  )
  return { lines, theme }
}
