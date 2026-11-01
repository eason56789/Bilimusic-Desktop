/**
 * JIZURA(印刷分镜)歌词舞台 —— 独立于凝彩的 Canvas2D 逐帧渲染舞台。
 *
 * 引擎来自 https://github.com/852wa/JIZURA(MIT,Copyright (c) 2026 hakoniwa),
 * 见 THIRD_PARTY_NOTICES.md。
 *
 * 关键设计:
 *  - JIZURA 是「歌词文本 → 规划(plan)→ 按绝对时间逐帧绘制」的离线式引擎,
 *    与凝彩的 DOM/rAF 场景完全不同;这里直接把它的 Renderer 跑在 canvas 上。
 *  - 播放时间取音频 currentTime,与项目其它歌词舞台同一套 offset 约定
 *    (`+200 - lyricOffsetMs`,与 TemperaLyrics 一致)。
 *  - plan 只在「歌词 / 画幅 / 风格设置」变化时重算,逐帧只做 frame() 绘制。
 *  - 字体加载失败不影响画面(降级到系统字体),引擎异常也只降级本区域。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles } from '@fluentui/react-components'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { getJizura, hasJizura, type JizuraPlan, type JizuraProject } from '../lib/jizura'

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: '#0a0a0c'
  },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  fallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '14px',
    textAlign: 'center',
    lineHeight: 1.7,
    whiteSpace: 'pre-line'
  }
})

/** 把整首歌词序列化成 JIZURA 能解析的带时间标记文本 */
function toLrcText(lines: LyricLine[]): string {
  const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0')
  const out: string[] = []
  for (const l of lines) {
    if (!l.text || !l.text.trim()) continue
    const ms = Math.max(0, Math.round(l.timeMs))
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const cs = Math.floor((ms % 1000) / 10)
    out.push(`[${pad(m)}:${pad(s)}.${pad(cs)}]${l.text}`)
  }
  return out.join('\n')
}

/**
 * 从容器宽高比挑一个 JIZURA 支持的画幅(它只接受固定几种比例字符串)。
 * 全屏歌词舞台通常是宽屏,兜底 16:9。
 */
function pickAspect(w: number, h: number): string {
  if (h <= 0 || w <= 0) return '16:9'
  const r = w / h
  const options: { key: string; r: number }[] = [
    { key: '21:9', r: 21 / 9 },
    { key: '16:9', r: 16 / 9 },
    { key: '4:3', r: 4 / 3 },
    { key: '1:1', r: 1 },
    { key: '4:5', r: 4 / 5 },
    { key: '3:4', r: 3 / 4 },
    { key: '9:16', r: 9 / 16 }
  ]
  let best = options[1]
  for (const o of options) {
    if (Math.abs(o.r - r) < Math.abs(best.r - r)) best = o
  }
  return best.key
}

export interface JizuraLyricsProps {
  lines: LyricLine[]
  activeIdx: number
}

/** 引擎是否可用(模块加载是同步副作用,首帧即可用) */
const engineReady = ((): boolean => {
  try {
    return hasJizura()
  } catch {
    return false
  }
})()

export function JizuraLyrics({ lines }: JizuraLyricsProps): JSX.Element {
  const styles = useStyles()
  const settings = useStore((s) => s.library?.settings)
  const offset = settings?.lyricOffsetMs ?? 0
  const mood = settings?.pvJizuraMood ?? 'auto'
  const styleKey = settings?.pvJizuraStyle ?? 'auto'
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 1280, h: 720 })
  const [failed, setFailed] = useState(!engineReady)

  // 容器尺寸(ResizeObserver)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth || 1280, h: el.clientHeight || 720 })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  /** 歌词文本(整首,plan 需要全曲内容才能排布) */
  const lrcText = useMemo(() => toLrcText(lines), [lines])

  /** project 只依赖歌词与风格设置 */
  const project = useMemo<JizuraProject | null>(() => {
    if (!engineReady || !lrcText) return null
    try {
      const J = getJizura()
      const base = J.defaultProject()
      const p: JizuraProject = {
        ...base,
        lyrics: lrcText,
        // 画幅从容器比例里挑最接近的预设;res 用 720 保证性能(fps 24 与原版时间基一致)
        aspect: pickAspect(size.w, size.h),
        res: 720,
        fps: 24,
        seed: 20260922
      }
      // style / mood:'auto' 交给引擎自己按种子选
      if (styleKey && styleKey !== 'auto') p.style = styleKey
      if (mood && mood !== 'auto') p.mood = mood
      return p
    } catch (e) {
      console.warn('[Jizura] project build failed', e)
      return null
    }
  }, [lrcText, mood, styleKey, size.w, size.h])

  /** plan:歌词/设置/画幅变化时才重算 */
  const plan = useMemo<JizuraPlan | null>(() => {
    if (!project) return null
    try {
      const J = getJizura()
      return J.plan(project, null)
    } catch (e) {
      console.error('[Jizura] plan failed', e)
      setFailed(true)
      return null
    }
  }, [project])

  /** renderer 实例(整个生命周期复用) */
  const rendererRef = useRef<{ frame: (...args: any[]) => void } | null>(null)
  useEffect(() => {
    if (!engineReady) return
    try {
      const J = getJizura()
      rendererRef.current = new J.Renderer()
    } catch (e) {
      console.error('[Jizura] renderer init failed', e)
      setFailed(true)
    }
  }, [])

  // 逐帧渲染
  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer || !plan) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 画布按 devicePixelRatio 适配,但不超过 plan 的设计宽度(vec 太大很吃 GPU)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const targetW = Math.round(Math.min(plan.W, size.w * dpr))
    const targetH = Math.round(targetW / (plan.W / plan.H))
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = Math.max(1, targetW)
      canvas.height = Math.max(1, targetH)
    }

    let raf = 0
    let dead = false
    const paint = (): void => {
      if (dead) return
      try {
        const t = getAudioElement().currentTime - offset / 1000
        renderer.frame(ctx, plan, Math.max(0, t), { scale: canvas.width / plan.W })
      } catch (e) {
        // 单帧失败不要让 rAF 断掉;连续失败由上层兜底
        console.warn('[Jizura] frame error', e)
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => {
      dead = true
      cancelAnimationFrame(raf)
    }
  }, [plan, offset, size.w, size.h])

  if (failed || !engineReady) {
    return (
      <div className={styles.root} ref={boxRef}>
        <div className={styles.fallback}>{'印刷分镜舞台暂不可用\n请在设置里切换为其它排布样式'}</div>
      </div>
    )
  }

  return (
    <div className={styles.root} ref={boxRef}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}

export default JizuraLyrics
