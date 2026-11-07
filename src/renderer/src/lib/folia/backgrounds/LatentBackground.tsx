/**
 * 隐现(Latent)歌词舞台背景 —— 移植自 folia(AGPL-3.0)
 * src/components/visualizer/backgrounds/latent/LatentBackground.tsx
 *
 * 两层封面取色的 paper-design shader:
 *   - MeshGradient(下层):封面六色的流体网格渐变,即“流光”本体;
 *   - Dithering(上层,warp/4x4):像素点阵,soft-light 叠在流体上。
 * 音频经 rAF 驱动 uniform 与速度(不经过 React 渲染);暂停时约 1s 内缓出。
 *
 * 与上游的差异:
 *   - 取色用本项目的 coverTheme.loadCoverColors(5 色),主题回退用 FoliaTheme;
 *   - 不接 beatFx(智能动感)信号,只用频段 onset 脉冲;
 *   - 颜色混合 useBlendedColors 简化为本文件内的十六进制/rgba 插值。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PaperShaderElement } from '@paper-design/shaders'
import { Dithering, MeshGradient } from '@paper-design/shaders-react'
import type { MotionValue } from 'framer-motion'
import { loadCoverColors, peekCoverColors } from '../coverTheme'
import type { FoliaTheme } from '../bridge'

type PaperShaderMount = NonNullable<PaperShaderElement['paperShaderMount']>
type PaperShaderUniforms = Parameters<PaperShaderMount['setUniforms']>[0]

/** shader 自己在跑帧循环时只写值不当场重画,避免每帧画两遍全屏(上游 paperShaderUniforms.ts) */
const updatePaperShaderUniforms = (mount: PaperShaderMount, uniforms: PaperShaderUniforms, animating: boolean): void => {
  const writer = (mount as unknown as { setUniformValues?: (values: PaperShaderUniforms) => void }).setUniformValues
  if (animating && typeof writer === 'function') {
    writer(uniforms)
    return
  }
  mount.setUniforms(uniforms)
}

/** 关掉 MSAA/深度(全屏单 quad 用不上,省 ~72MB 显存);卸载后主动丢 WebGL 上下文(上游 paperShaderContext.ts) */
const PAPER_SHADER_CONTEXT_ATTRIBUTES: WebGLContextAttributes = Object.freeze({ antialias: false, depth: false })

const createPaperShaderReleaseRef = (target: { current: PaperShaderElement | null }) => (element: PaperShaderElement | null) => {
  target.current = element
  if (!element) return undefined
  return () => {
    target.current = null
    const canvas = element.paperShaderMount?.canvasElement
    if (!canvas) return
    const gl = canvas.getContext('webgl2')
    queueMicrotask(() => {
      if (!gl || canvas.isConnected || gl.isContextLost()) return
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    })
  }
}

export interface LatentAudioBands {
  bass: MotionValue<number>
  lowMid: MotionValue<number>
  mid: MotionValue<number>
  vocal: MotionValue<number>
  treble: MotionValue<number>
}

interface LatentBackgroundProps {
  theme: FoliaTheme
  coverUrl?: string | null
  audioPower: MotionValue<number>
  audioBands: LatentAudioBands
  paused: boolean
}

const MAX_SHADER_PIXELS = 1280 * 720
const PAUSED_SPEED_SCALE = 0.12
const PAUSE_EASE_MS = 300
const normalizeAudio = (value: number): number => Math.min(1, Math.max(0, value / 255))
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const easeTowards = (current: number, target: number, amount: number): number => current + (target - current) * amount

/** 上游 resolveLatentBroadbandEnergy:频段加权 → 宽带能量 */
const resolveBroadbandEnergy = (bass: number, lowMid: number, mid: number, vocal: number, treble: number): number =>
  Math.pow(
    normalizeAudio(bass) * 0.22 +
      normalizeAudio(lowMid) * 0.18 +
      normalizeAudio(mid) * 0.22 +
      normalizeAudio(vocal) * 0.28 +
      normalizeAudio(treble) * 0.1,
    0.55,
  )

/** 上升沿脉冲:跟踪能量的一阶差分,指数衰减 */
const resolveOnsetPulse = (currentEnergy: number, previousEnergy: number, previousPulse: number): number =>
  Math.max(previousPulse * 0.84, clamp01((currentEnergy - previousEnergy) * 7))

/** 上游默认 tuning(types.ts DEFAULT_LATENT_BACKGROUND_TUNING,enhancedBeatResponse 默认开) */
const TUNING = {
  ditheringSpeed: 0.1,
  ditheringAudioSpeed: 1.2,
  ditheringSize: 2.5,
  ditheringOpacity: 0.55,
  meshSpeed: 0.3,
  meshAudioSpeed: 2,
  meshDistortion: 0.8,
  meshSwirl: 0.1,
  overlayOpacity: 0.35,
} as const

/* ===================== 颜色插值(song 切换时渐变) ===================== */

const parseColor = (color: string): { r: number; g: number; b: number; a: number } | null => {
  const hex = color.trim()
  if (hex.startsWith('#')) {
    const body = hex.slice(1)
    const full =
      body.length === 3
        ? body
            .split('')
            .map((c) => c + c)
            .join('')
        : body
    const n = parseInt(full.slice(0, 6), 16)
    if (Number.isNaN(n)) return null
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    }
  }
  const m = hex.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  return null
}

const mixColors = (from: string, to: string, t: number): string => {
  if (from === to) return from
  const a = parseColor(from)
  const b = parseColor(to)
  if (!a || !b) return t >= 1 ? to : from
  const ch = (x: number, y: number): number => Math.round(x + (y - x) * t)
  return `rgba(${ch(a.r, b.r)},${ch(a.g, b.g)},${ch(a.b, b.b)},${(a.a + (b.a - a.a) * t).toFixed(3)})`
}

/** 颜色变化时在 ~900ms 内渐变到目标(上游 useBlendedColors 的简化版) */
const useBlendedColors = (colors: readonly string[]): string[] => {
  const key = colors.join('|')
  const target = useMemo(() => key.split('|'), [key])
  const [drawn, setDrawn] = useState<string[]>(target)
  const drawnRef = useRef<string[]>(target)

  useEffect(() => {
    const from = drawnRef.current
    if (from.length !== target.length || from.every((c, i) => c === target[i])) return undefined
    const startedAt = performance.now()
    let frame = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / 900)
      const ease = 1 - (1 - t) ** 3
      const next = target.map((to, i) => mixColors(from[i], to, ease))
      drawnRef.current = next
      setDrawn(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return drawn
}

/* ===================== 组件 ===================== */

const LatentBackground: React.FC<LatentBackgroundProps> = ({ theme, coverUrl, audioPower, audioBands, paused }) => {
  const ditheringRef = useRef<PaperShaderElement | null>(null)
  const meshRef = useRef<PaperShaderElement | null>(null)
  const ditheringShaderRef = useMemo(() => createPaperShaderReleaseRef(ditheringRef), [])
  const meshShaderRef = useMemo(() => createPaperShaderReleaseRef(meshRef), [])
  const ditheringLayerRef = useRef<HTMLDivElement | null>(null)
  const meshLayerRef = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  // 封面六色(模块级缓存在 coverTheme;null 时回退主题色)
  const [coverColors, setCoverColors] = useState<string[]>(() =>
    coverUrl ? (peekCoverColors(coverUrl) ?? []) : [],
  )
  useEffect(() => {
    let active = true
    if (!coverUrl) {
      setCoverColors([])
      return () => {
        active = false
      }
    }
    const cached = peekCoverColors(coverUrl)
    if (cached) {
      setCoverColors(cached)
      return () => {
        active = false
      }
    }
    void loadCoverColors(coverUrl).then((colors) => {
      if (active && colors) setCoverColors(colors)
    })
    return () => {
      active = false
    }
  }, [coverUrl])

  const resolved = useMemo(() => {
    const primary = coverColors[0] ?? theme.primaryColor
    const secondary = coverColors[1] ?? theme.accentColor
    const tertiary = coverColors[2] ?? primary
    const quaternary = coverColors[3] ?? secondary
    return {
      ditheringBack: theme.backgroundColor,
      ditheringFront: primary,
      mesh: [primary, secondary, tertiary, quaternary, theme.backgroundColor, theme.accentColor],
    }
  }, [coverColors, theme])

  const blended = useBlendedColors([
    theme.backgroundColor,
    resolved.ditheringBack,
    resolved.ditheringFront,
    ...resolved.mesh,
  ])
  const [backgroundColor, ditheringBack, ditheringFront] = blended
  const meshColors = useMemo(() => blended.slice(3), [blended])

  // rAF:平滑音频 → 速度/uniform/DOM 样式(React 只在调色板变化时重渲染)
  useEffect(() => {
    const ditheringMount = ditheringRef.current?.paperShaderMount
    const meshMount = meshRef.current?.paperShaderMount

    let animationFrame = 0
    const writtenStyles = new WeakMap<HTMLElement, Partial<Record<'opacity' | 'transform' | 'filter', string>>>()
    const writeLayerStyle = (
      element: HTMLElement,
      property: 'opacity' | 'transform' | 'filter',
      value: string,
    ): void => {
      let written = writtenStyles.get(element)
      if (!written) {
        written = {}
        writtenStyles.set(element, written)
      }
      if (written[property] === value) return
      written[property] = value
      element.style[property] = value
    }

    let smoothedPower = 0
    let smoothedBass = 0
    let smoothedMid = 0
    let smoothedBeatSpeed = 0
    let previousBeatEnergy = 0
    let onsetPulse = 0
    let playingEase = pausedRef.current ? 0 : 1
    let lastFrameAt: number | null = null

    const updateAudioResponse = (frameAt: number): void => {
      animationFrame = requestAnimationFrame(updateAudioResponse)

      const isPaused = pausedRef.current
      const pauseStep = lastFrameAt === null ? 0 : 1 - Math.exp((lastFrameAt - frameAt) / PAUSE_EASE_MS)
      lastFrameAt = frameAt
      playingEase = easeTowards(playingEase, isPaused ? 0 : 1, pauseStep)

      const targetPower = isPaused ? 0 : normalizeAudio(audioPower.get())
      const targetBass = isPaused ? 0 : normalizeAudio(audioBands.bass.get())
      const targetBeatEnergy = isPaused
        ? 0
        : resolveBroadbandEnergy(
            audioBands.bass.get(),
            audioBands.lowMid.get(),
            audioBands.mid.get(),
            audioBands.vocal.get(),
            audioBands.treble.get(),
          )
      const targetMid = isPaused ? 0 : normalizeAudio(Math.max(audioBands.mid.get(), audioBands.vocal.get()))
      smoothedPower = easeTowards(smoothedPower, targetPower, 0.12)
      smoothedBass = easeTowards(smoothedBass, targetBass, 0.16)
      smoothedMid = easeTowards(smoothedMid, targetMid, 0.13)
      onsetPulse = resolveOnsetPulse(targetBeatEnergy, previousBeatEnergy, onsetPulse)
      previousBeatEnergy = targetBeatEnergy
      const beatSpeedTarget = isPaused ? 0 : clamp01(targetBeatEnergy * 0.42 + onsetPulse * 0.85)
      smoothedBeatSpeed = easeTowards(smoothedBeatSpeed, beatSpeedTarget, beatSpeedTarget > smoothedBeatSpeed ? 0.42 : 0.14)

      const currentDitheringMount = ditheringRef.current?.paperShaderMount
      const currentMeshMount = meshRef.current?.paperShaderMount

      // 速度 = 基速 与 基速+音频增速 之间按 playingEase 缓动(暂停时落到 0.12 倍)
      const easedSpeed = (baseSpeed: number, audioSpeed: number): number => {
        const active = baseSpeed + audioSpeed * smoothedBeatSpeed
        return Math.min(2, Math.max(0, baseSpeed + (active - baseSpeed) * playingEase))
      }

      if (currentDitheringMount) {
        const ditheringSpeed = pausedRef.current
          ? TUNING.ditheringSpeed * PAUSED_SPEED_SCALE
          : easedSpeed(TUNING.ditheringSpeed, TUNING.ditheringAudioSpeed)
        currentDitheringMount.setSpeed(ditheringSpeed)
        updatePaperShaderUniforms(
          currentDitheringMount,
          { u_pxSize: Math.max(0.5, TUNING.ditheringSize - smoothedBass * TUNING.ditheringSize * 0.34) },
          ditheringSpeed !== 0,
        )
      }
      if (currentMeshMount) {
        const meshSpeed = pausedRef.current
          ? TUNING.meshSpeed * PAUSED_SPEED_SCALE
          : easedSpeed(TUNING.meshSpeed, TUNING.meshAudioSpeed)
        currentMeshMount.setSpeed(meshSpeed)
        updatePaperShaderUniforms(
          currentMeshMount,
          {
            u_distortion: TUNING.meshDistortion + smoothedPower * 0.62,
            u_swirl: TUNING.meshSwirl + smoothedMid * 0.38,
          },
          meshSpeed !== 0,
        )
      }

      if (ditheringLayerRef.current) {
        writeLayerStyle(ditheringLayerRef.current, 'opacity', `${Math.min(1, TUNING.ditheringOpacity + smoothedBass * 0.25)}`)
        writeLayerStyle(ditheringLayerRef.current, 'transform', `scale(${1.015 + smoothedBass * 0.025})`)
      }
      if (meshLayerRef.current) {
        writeLayerStyle(
          meshLayerRef.current,
          'filter',
          `saturate(${1.04 + smoothedMid * 0.34}) brightness(${0.94 + smoothedPower * 0.16})`,
        )
        writeLayerStyle(meshLayerRef.current, 'transform', `scale(${1.025 + smoothedPower * 0.018})`)
      }
    }

    animationFrame = requestAnimationFrame(updateAudioResponse)
    return () => cancelAnimationFrame(animationFrame)
  }, [audioBands, audioPower])

  return (
    <div className="latent-background" style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor, pointerEvents: 'none' }}>
      <div ref={meshLayerRef} style={{ position: 'absolute', inset: 0, transform: 'scale(1.025)', transformOrigin: 'center' }}>
        <MeshGradient
          ref={meshShaderRef}
          width="100%"
          height="100%"
          colors={meshColors}
          distortion={TUNING.meshDistortion}
          swirl={TUNING.meshSwirl}
          grainMixer={0}
          grainOverlay={0.01}
          speed={TUNING.meshSpeed}
          minPixelRatio={1}
          maxPixelCount={MAX_SHADER_PIXELS}
          webGlContextAttributes={PAPER_SHADER_CONTEXT_ATTRIBUTES}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div
        ref={ditheringLayerRef}
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'soft-light',
          opacity: TUNING.ditheringOpacity,
          transform: 'scale(1.015)',
          transformOrigin: 'center',
        }}
      >
        <Dithering
          ref={ditheringShaderRef}
          width="100%"
          height="100%"
          colorBack={ditheringBack}
          colorFront={ditheringFront}
          shape="warp"
          type="4x4"
          size={TUNING.ditheringSize}
          speed={TUNING.ditheringSpeed}
          minPixelRatio={1}
          maxPixelCount={MAX_SHADER_PIXELS}
          webGlContextAttributes={PAPER_SHADER_CONTEXT_ATTRIBUTES}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      {/* 暗化叠层:让歌词主体更突出(上游 overlayEnabled/overlayOpacity 默认) */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor, opacity: TUNING.overlayOpacity }} />
    </div>
  )
}

export default React.memo(LatentBackground)
