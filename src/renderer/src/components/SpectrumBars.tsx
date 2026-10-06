/** 频谱可视化条(全屏播放页):从 Web Audio AnalyserNode 读取实时频域数据绘制 */
import { useEffect, useRef } from 'react'
import { getSpectrum } from '../store'

export function SpectrumBars({
  height = 64,
  bars = 56,
  color = 'rgba(255,255,255,0.75)',
  accent = '#4cc2ff'
}: {
  height?: number
  bars?: number
  color?: string
  accent?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1

    const draw = (): void => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const data = getSpectrum()
      const gap = 3
      const barW = Math.max(2, (w - gap * (bars - 1)) / bars)
      for (let i = 0; i < bars; i++) {
        const x = i * (barW + gap)
        if (!data) {
          // 无数据:静止细线
          ctx.fillStyle = color
          ctx.globalAlpha = 0.35
          ctx.fillRect(x, h - 3, barW, 3)
          continue
        }
        // 对数分布取样(低频细节多、高频粗)
        const t = i / bars
        const idx = Math.min(data.length - 1, Math.floor(Math.pow(t, 1.6) * data.length))
        const v = data[idx] / 255
        const barH = Math.max(3, Math.pow(v, 1.15) * h)
        ctx.globalAlpha = 0.35 + v * 0.65
        ctx.fillStyle = v > 0.75 ? accent : color
        ctx.fillRect(x, h - barH, barW, barH)
      }
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [bars, color, accent])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block', pointerEvents: 'none' }}
    />
  )
}
