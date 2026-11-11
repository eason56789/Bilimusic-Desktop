/**
 * 凝彩(Tempera)完整复刻:帧级运镜 + 构图块 stagger + 深度视差 + 反相。
 *
 * 架构对齐 folia-major 的 createTemperaPixiRuntime:**每个 shot 是一个持久视图**。
 * React 侧的等价物是「按句 key 的场景子组件」:
 *   - 子组件只挂载一次,自持 rAF 循环,姿态是**纯时间驱动**(对齐 updateTemperaShot);
 *   - 换句时旧子组件**不卸载**(key 不变 → DOM 保留),新子组件挂在上层;
 *   - 旧场景的 exit 由它自己的 unloadMs 起算,退出完成后回报父层 prune。
 * 之前"硬切"的根源就是旧场景在换句 render 里被整个重挂载:爬移(creep)、漂移、
 * 字距、视差这些累积姿态全部归零,画面瞬间跳回排版原点。
 *
 * 混合上下文约束:场景根节点**不能**有 transform/opacity/willChange(否则成为
 * stacking context,内部 mix-blend-mode: difference 就混不到共享纸底上)。
 * 相机姿态因此直接写进每个图元自己的 transform(与 Pixi 里 camera 写在
 * container、子节点用局部坐标等价)。
 *
 * 图层顺序(从后到前):
 *   1. 纸底 + 纸面网点(共享,父层)
 *   2. 边角线框(共享,父层)
 *   3. 场景列表(旧 → 新,新场景盖在旧场景上面)
 *      每个场景内:构图色块 → 水印巨字 → 文字层(difference)→ 残影 → 碎片字
 *   4. 晕影 / 颗粒 / 后处理(父层)
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles } from '@fluentui/react-components'
import type { LyricLine } from '@shared/types'
import { useStore, getAudioElement } from '../store'
import { lyricPosMs } from '../lib/lyricClock'
import { lineEndTime, resolveCharTimes } from '../lib/karaoke'
import { resolveTrans } from '../lib/transDecide'
import {
  layoutTemperaWords,
  resolveEnterFrame,
  enterPoolOf,
  type TemperaWord,
  type EnterStyle,
  type EnterFrame
} from '../lib/tempera'
import {
  LIGHT_PALETTE,
  DARK_PALETTE,
  buildPalette,
  dotGrid,
  hash01,
  hashSeed,
  luminance,
  mixColor,
  type TemperaPalette
} from '../lib/temperaPrims'
import { buildComposition, pickKind, SHOT_PROFILES, type TemperaKind, type ShapeItem } from '../lib/temperaShots'

/** 一句编译后的完整场景 */
interface CompiledScene {
  /** 稳定 key(时间+文本),也是场景子组件的 React key */
  key: string
  kind: TemperaKind
  profile: (typeof SHOT_PROFILES)[TemperaKind]
  words: TemperaWord[]
  shapes: ShapeItem[]
  watermark: { text: string; x: number; y: number; rotation: number; size: number } | null
  fragments: Fragment[]
  flowAngle: number
  dur: number
  startMs: number
  unloadMs: number
  seed: number
  phase: number
}

/* ===================== 运动学常量(对齐 temperaBlocks / temperaMotion) ===================== */

/** 每个图元的 stagger 距离 = max(w,h) * 0.09 */
const CARRIER_RATE = 0.09
/** 入场缓动窗口(秒) */
const ENTER_SPAN = 1.1
/** drift:缩放 ±2%,旋转 ±0.69° */
const DRIFT_SCALE = 0.02
const DRIFT_ROTATION = 0.012
/** 字形入场:settle 最短 0.34s,窗口上限 1.35s */
const MIN_SETTLE = 0.34
const MAX_REVEAL = 1.35
/** 投影:字号倍数 + alpha */
const SHADOW_DX = 0.06
const SHADOW_DY = 0.08
const SHADOW_ALPHA = 0.34
/** 远景字更暗 */
const FAR_GLYPH_ALPHA = 0.5
const MIN_GLYPH_SHADE = 0.2
const GLYPH_LEAD_NEAR = 0.5
const GLYPH_LAG_FAR = 0.4
const GLYPH_PARALLAX_CAP = 0.07
/** 残影(echo) */
const ECHO_ALPHA = 0.5
/** 唱后字距展开量 */
const RELEASE_TRACKING = 0.055

const useStyles = makeStyles({
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    // 不能用 isolation:isolate —— 它会把 difference 的混合范围限制在本组件内
    isolation: 'auto'
  },
  camera: {
    position: 'absolute',
    inset: 0,
    willChange: 'transform',
    transformOrigin: 'center center'
  },
  layer: { position: 'absolute', inset: 0 },
  /**
   * 晕影:极轻。参考图是干净的浅纸,压太重会让整幅画面发灰、文字对比全失。
   */
  vignette: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'radial-gradient(ellipse 96% 96% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.05) 86%, rgba(0,0,0,0.13) 100%)'
  },
  /** 暗角滑杆控制的重晕影(叠加在基础晕影上) */
  vignetteStrong: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.45) 100%)'
  },
  /** 后处理容器:对比度 / 透镜扭曲的 CSS filter 挂在这里 */
  postWrap: { position: 'absolute', inset: 0 },
  /** 胶片颗粒:噪点贴图平铺,尺寸放大留出漂移余量 */
  grain: {
    position: 'absolute',
    left: '-20%',
    top: '-20%',
    width: '140%',
    height: '140%',
    pointerEvents: 'none',
    backgroundRepeat: 'repeat',
    willChange: 'transform'
  },
  /** 构图 SVG:铺满容器,坐标用 px(由组件按实测尺寸写 viewBox) */
  shape: { position: 'absolute', inset: 0, width: '100%', height: '100%', willChange: 'transform, opacity' },
  /** 场景根:普通绝对定位 div —— 绝不能加 transform/opacity,否则切断 difference 到纸底的混合 */
  sceneRoot: { position: 'absolute', inset: 0 },
  /** 水印巨字:压在滤镜之下,字会反相压过它 */
  watermark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    whiteSpace: 'pre',
    fontWeight: 900,
    lineHeight: 1,
    color: 'transparent',
    pointerEvents: 'none',
    willChange: 'transform'
  },
  /**
   * 文字层:**差分反相**(对齐 temperaDifferenceFilter)。
   * 本层自身**不带 transform**(见文件头注释);相机姿态写进每个字形自己的 transform。
   */
  textLayer: {
    position: 'absolute',
    inset: 0,
    mixBlendMode: 'difference' as unknown as 'normal'
  },
  glyph: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    willChange: 'transform, opacity',
    // 纯白 + difference = 对背景做明度反转,等价于源码的"纸色/墨色二选一"
    color: '#ffffff'
  },
  glyphShadow: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    // 与字形同色:差分滤镜按**背景**决定颜色,投影自然跟随字形一起反相
    color: '#ffffff',
    pointerEvents: 'none'
  },
  glyphEcho: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'pre',
    fontWeight: 800,
    lineHeight: 1,
    pointerEvents: 'none'
  },
  /** 边缘碎片字:不参与反相(源码放在 textLayer 外) */
  fragment: {
    position: 'absolute',
    whiteSpace: 'pre',
    fontWeight: 600,
    lineHeight: 1,
    pointerEvents: 'none'
  },
  sub: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '5%',
    textAlign: 'center',
    fontWeight: 500,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    zIndex: 6
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(160,160,158,0.9)',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    lineHeight: 1.7
  }
})

/** 缓动:长尾减速(对齐 easeTemperaEnter) */
function easeEnter(v: number): number {
  const t = Math.min(1, Math.max(0, v))
  let low = 0
  let high = 1
  let p = t
  for (let i = 0; i < 12; i++) {
    const inv = 1 - p
    const x = 3 * inv * inv * p * 0.22 + 3 * inv * p * p * 1 + p * p * p
    if (x < t) low = p
    else high = p
    p = (low + high) / 2
  }
  const inv = 1 - p
  return 3 * inv * inv * p * 1 + 3 * inv * p * p * 1 + p * p * p
}

/** 缓动:中段匀速(对齐 easeTemperaInOut) */
function easeInOut(v: number): number {
  const t = Math.min(1, Math.max(0, v))
  let low = 0
  let high = 1
  let p = t
  for (let i = 0; i < 12; i++) {
    const inv = 1 - p
    const x = 3 * inv * inv * p * 0.62 + 3 * inv * p * p * 0.32 + p * p * p
    if (x < t) low = p
    else high = p
    p = (low + high) / 2
  }
  const inv = 1 - p
  return 3 * inv * inv * p * 0 + 3 * inv * p * p * 1 + p * p * p
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const clampRange = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * 入场样式与 resolveEnterFrame 统一收敛到 lib/tempera.ts:
 * 原有 7 种方向变体 + JIZURA 移植系列(spring/pendulum/roll/rock/stopmotion/ripple/zoom/wind/crt),
 * 本文件只消费,保证设置页的 `pvTemperaEnter` 与逐字渲染用同一份样式表。
 */

/** 镜头:恒定速度与缓动混合,中段永不停顿(对齐 temperaCamera.resolveTemperaCameraFrame) */
function cameraAt(
  profile: { travel: number; zoomStart: number; zoomEnd: number; rotation: number },
  progress: number
): { x: number; y: number; scale: number; rotation: number } {
  const clamped = clamp01(progress)
  const eased = clamped * 0.5 + easeInOut(clamped) * 0.5
  const overshoot = Math.max(0, progress - 1) * 0.35
  const amount = eased + overshoot
  return {
    x: 0,
    y: -profile.travel * amount,
    scale: profile.zoomStart + (profile.zoomEnd - profile.zoomStart) * amount,
    rotation: profile.rotation * 0.3 * amount
  }
}

/** 呼吸:双频正弦,幅度 0.006/0.002/0.0015(共享镜头层用) */
function breathAt(time: number, phase: number): { x: number; y: number; scale: number; rotation: number } {
  const tau = time * Math.PI * 2
  return {
    x: (Math.sin(tau * 0.13 + phase) * 0.65 + Math.sin(tau * 0.31 + phase * 1.7) * 0.35) * 0.006,
    y: (Math.cos(tau * 0.11 + phase * 2.3) * 0.65 + Math.sin(tau * 0.29 + phase * 0.9) * 0.35) * 0.006,
    scale: Math.sin(tau * 0.09 + phase * 1.3) * 0.002,
    rotation: Math.sin(tau * 0.07 + phase * 2.9) * 0.0015
  }
}

/** 边缘碎片字(对齐 buildTemperaFragmentViews) */
interface Fragment {
  char: string
  x: number
  y: number
  rotation: number
  scale: number
}

function buildFragments(seed: number, text: string, palette: TemperaPalette): Fragment[] {
  const chars = Array.from(text).filter((c) => !/\s/.test(c))
  if (chars.length === 0) return []
  const count = 3 + Math.floor(hash01(seed, 4, 131) * 3)
  const out: Fragment[] = []
  for (let i = 0; i < count; i++) {
    const edge = 0.03 + hash01(seed, i, 137) * 0.13
    const fromLeft = hash01(seed, i, 141) > 0.5
    out.push({
      char: chars[Math.floor(hash01(seed, i, 149) * chars.length) % chars.length],
      x: fromLeft ? edge : 1 - edge,
      y: 0.08 + hash01(seed, i, 151) * 0.84,
      rotation: (hash01(seed, i, 157) - 0.5) * 0.5,
      scale: 0.26 + hash01(seed, i, 163) * 0.2
    })
  }
  void palette
  return out
}

/* ===================== 场景选项 ===================== */

interface SceneOpts {
  motion: number
  camAmp: number
  panAmp: number
  zoomAmp: number
  charMotion: number
  charTiming: number
  invertText: boolean
  rgbK: number
  /** 画面取景平移(比例,-0.25~0.25;正=右/下),补偿构图整体偏移 */
  offX: number
  offY: number
}

/* ===================== 场景子组件:纯时间驱动,挂载后 rAF 自驱 ===================== */

/**
 * 一个 shot 的持久视图。props 变化只更新 propsRef,**rAF 循环永不重启**;
 * 换句时父层只是把它留在列表里(旧 key 保留),它自己的 exit 从自己的
 * unloadMs 起算 —— 与 folia 的 `isHandingOff = shotIndex < activeShotIndex && exit < 1`
 * 完全同构。退场完成后回调 onExited 让父层 prune。
 */
const TemperaSceneView = memo(function TemperaSceneView({
  scene,
  sizeW,
  sizeH,
  palette,
  opts,
  onExited
}: {
  scene: CompiledScene
  sizeW: number
  sizeH: number
  palette: TemperaPalette
  opts: SceneOpts
  onExited: (key: string) => void
}): JSX.Element {
  const styles = useStyles()
  const propsRef = useRef({ scene, sizeW, sizeH, palette, opts, onExited })
  propsRef.current = { scene, sizeW, sizeH, palette, opts, onExited }

  /** svg 元素:吃相机 transform;g 元素:吃 stagger/grow */
  const svgRefs = useRef<(SVGSVGElement | null)[]>([])
  const shapeRefs = useRef<(SVGGElement | null)[]>([])
  const watermarkRef = useRef<HTMLSpanElement>(null)
  const shadowRefs = useRef<(HTMLSpanElement | null)[]>([])
  const glyphRefs = useRef<(HTMLSpanElement | null)[]>([])
  const echoRefs = useRef<(HTMLSpanElement | null)[]>([])
  const fragRefs = useRef<(HTMLSpanElement | null)[]>([])
  const exitedRef = useRef(false)

  useEffect(() => {
    let raf = 0
    const paint = (): void => {
      const { scene: c, sizeW: w, sizeH: h, opts: o, onExited: done } = propsRef.current
      const now = lyricPosMs(getAudioElement().currentTime)
      const span = Math.max(w, h)
      const shortSide = Math.min(w, h)
      const carry = span * CARRIER_RATE
      const visMs = Math.max(400, c.unloadMs - c.startMs)
      const handoffMs = Math.min(1100, Math.max(400, visMs * 0.3))
      const exitP = clamp01((now - c.unloadMs) / handoffMs)
      const exit = easeInOut(exitP)
      const alpha = 1 - exit
      if (exitP >= 1 && !exitedRef.current) {
        exitedRef.current = true
        done(c.key)
      }
      const elapsed = (now - c.startMs) / 1000
      const p = (now - c.startMs) / c.dur

      /**
       * shot 交接(数值严格对照 temperaShotFrame.updateTemperaShot):
       *   enter  = easeEnter(clamp01((t - start) / (handoff*0.8)))   进场 front-loaded
       *   exit   = easeInOut(clamp01((t - end) / handoff))          退场淡出
       *   travel = exit * span * 0.55 - (1 - enter) * span * 0.32   同一 flow 向量
       * 进场不透明(push 而非 dissolve),只有 exit 淡。
       */
      const camAmp = o.camAmp
      const cam = cameraAt(c.profile, p)
      const enter = easeEnter(clamp01((now - c.startMs) / (handoffMs * 0.8)))
      const travel = exit * span * 0.55 - (1 - enter) * span * 0.32
      const flowX = Math.cos(c.flowAngle)
      const flowY = Math.sin(c.flowAngle)
      const camX = cam.x * w * camAmp * o.panAmp + flowX * travel + o.offX * w
      const camY = cam.y * h * camAmp * o.panAmp + flowY * travel + o.offY * h
      const camScale = 1 + (cam.scale - 1) * camAmp * o.zoomAmp
      const camRotDeg = (cam.rotation * camAmp * 57.2958).toFixed(2)
      const camOpacity = alpha >= 0.999 ? '1' : alpha.toFixed(3)

      // ---- 构图块 stagger(对齐 temperaBlocks.updateTime) ----
      // 相机 transform 写在 svg 上(full-canvas,原点=画面中心,与 Pixi 容器 pivot 等价),
      // stagger/grow 写在 g 上。
      const creep = easeInOut(clamp01(p)) * carry * 0.35
      for (let i = 0; i < c.shapes.length; i++) {
        const svg = svgRefs.current[i]
        const node = shapeRefs.current[i]
        if (!svg || !node) continue
        const it = c.shapes[i]
        const e = easeEnter((elapsed - it.delay) / ENTER_SPAN)
        if (e <= 0.001 || alpha <= 0.001) {
          svg.style.visibility = 'hidden'
          continue
        }
        svg.style.visibility = 'visible'
        svg.style.opacity = camOpacity
        svg.style.transform = `translate3d(${camX.toFixed(1)}px, ${camY.toFixed(1)}px, 0) scale(${camScale.toFixed(
          4
        )}) rotate(${camRotDeg}deg)`
        // behind:入场时沿 flow 方向退后,落定后缓慢"creep"前移
        const behind = (1 - e) * carry - creep
        const drift = clamp01(elapsed / 6)
        const dx = it.enterDX * (1 - e) - flowX * behind + it.driftX * drift
        const dy = it.enterDY * (1 - e) - flowY * behind + it.driftY * drift
        const float = it.driftX !== 0 || it.driftY !== 0 ? 1 + Math.sin(elapsed * 0.5 + c.phase) * DRIFT_SCALE : 1
        const gx = it.grow > 0 ? Math.max(0.0001, e) : float
        node.style.opacity = (it.baseAlpha * e).toFixed(3)
        node.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${gx.toFixed(3)}, ${float.toFixed(3)})`
        if (it.driftX !== 0 || it.driftY !== 0) {
          node.style.transform += ` rotate(${(Math.sin(elapsed * 0.33 + c.phase) * DRIFT_ROTATION).toFixed(4)}rad)`
        }
      }

      // ---- 水印巨字:缓慢漂移,随场景相机 ----
      const wm = watermarkRef.current
      if (wm && c.watermark) {
        if (alpha > 0.001) {
          const drift = Math.sin(elapsed * 0.18 + c.phase) * shortSide * 0.006
          wm.style.visibility = 'visible'
          wm.style.opacity = (0.16 * alpha).toFixed(3)
          wm.style.transform = `translate3d(calc(-50% + ${(camX + drift).toFixed(1)}px), calc(-50% + ${(
            camY +
            drift * 0.6
          ).toFixed(1)}px), 0) scale(${camScale.toFixed(4)}) rotate(${(
            c.watermark.rotation + cam.rotation * camAmp
          ).toFixed(3)}rad)`
        } else {
          wm.style.visibility = 'hidden'
        }
      }

      // ---- 逐字:入场 + 深度视差 + 唱后 tracking + 相机位移 ----
      const biggest = c.words.reduce((m, wd) => Math.max(m, wd.fontSize), 1)
      const parallaxCap = shortSide * GLYPH_PARALLAX_CAP
      for (let i = 0; i < c.words.length; i++) {
        const wd = c.words[i]
        const node = glyphRefs.current[i]
        const sh = shadowRefs.current[i]
        const ec = echoRefs.current[i]
        if (!node) continue
        // settle 窗口:最短 0.34s,占本字时长的 stretch 倍;逐字入场时序整体缩放
        const settleAt = wd.startTime + Math.max(MIN_SETTLE * 1000, (wd.endTime - wd.startTime) * 0.5)
        const winMs = Math.max(120, (settleAt - wd.startTime) * o.charTiming)
        const linear = clamp01((now - wd.startTime) / winMs)
        const enterTravel = 1 - easeEnter(linear)
        const frame = resolveEnterFrame(
          wd.style as EnterStyle,
          {
            enterX: wd.enterX,
            enterY: wd.enterY,
            enterRotation: wd.enterRotation,
            enterScale: wd.enterScale,
            seed: wd.seed,
            fontSize: wd.fontSize
          },
          enterTravel,
          linear
        )
        const reveal = clamp01((now - wd.startTime) / Math.min(winMs, MAX_REVEAL * 1000))
        // 样式内透明度(JIZURA 系列的"等相位到再出现")乘进 charAlpha
        const charAlpha = easeInOut(clamp01(reveal * 2.4)) * alpha * (frame.alpha ?? 1)
        if (charAlpha <= 0.001) {
          node.style.visibility = 'hidden'
          if (sh) sh.style.visibility = 'hidden'
          if (ec) ec.style.visibility = 'hidden'
          continue
        }
        node.style.visibility = 'visible'
        // 唱后 tracking:整句落定后字距缓慢展开(让完成的句子"活着")
        const lineDur = Math.max(0.4, c.dur / 1000)
        const release = clamp01((now - wd.endTime) / Math.max(500, lineDur * 1000 * 0.4))
        const track = easeInOut(release) * (wd.trackingX - wd.x) * RELEASE_TRACKING * 10
        // 深度视差:大字号领跑、小字号滞后并更暗
        const depth = clamp01((wd.fontSize / biggest - 0.4) / 0.6)
        const lead = depth * GLYPH_LEAD_NEAR - (1 - depth) * GLYPH_LAG_FAR
        const depthX = Math.max(-parallaxCap, Math.min(parallaxCap, camX * lead))
        const depthY = Math.max(-parallaxCap, Math.min(parallaxCap, camY * lead))
        const x = wd.x + frame.x * o.charMotion + track + camX + depthX
        const y = wd.y + frame.y * o.charMotion + camY + depthY
        const rot = frame.rotation * o.charMotion
        node.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(
          2
        )}px), 0) rotate(${rot.toFixed(4)}rad) scale(${frame.scaleX.toFixed(3)}, ${frame.scaleY.toFixed(3)})`
        // 不乘 shade:差分反相靠**满不透明**才能得到纯纸色/纯墨色
        node.style.opacity = charAlpha.toFixed(3)

        if (sh) {
          sh.style.visibility = 'visible'
          sh.style.transform = `translate3d(calc(-50% + ${(x + wd.fontSize * SHADOW_DX).toFixed(2)}px), calc(-50% + ${(
            y +
            wd.fontSize * SHADOW_DY
          ).toFixed(2)}px), 0) rotate(${rot.toFixed(4)}rad) scale(${frame.scaleX.toFixed(3)}, ${frame.scaleY.toFixed(3)})`
          sh.style.opacity = (charAlpha * SHADOW_ALPHA).toFixed(3)
        }

        // 残影:越远越淡;唱到后半程基本归零
        if (ec) {
          const echoAlpha = charAlpha * ECHO_ALPHA * enterTravel
          if (echoAlpha <= 0.004) {
            ec.style.visibility = 'hidden'
          } else {
            ec.style.visibility = 'visible'
            const echoTravel = 1 - easeEnter(clamp01((now - wd.startTime - 90) / winMs))
            const ex = wd.x + frame.x * echoTravel * o.charMotion + track * 0.7 + camX + depthX * 0.8
            const ey = wd.y + frame.y * echoTravel * o.charMotion + camY + depthY * 0.8
            ec.style.transform = `translate3d(calc(-50% + ${ex.toFixed(2)}px), calc(-50% + ${ey.toFixed(
              2
            )}px), 0) rotate(${(frame.rotation * 0.8 * o.charMotion).toFixed(4)}rad) scale(${(frame.scaleX * 1.02).toFixed(3)})`
            ec.style.opacity = echoAlpha.toFixed(3)
          }
        }
      }

      // ---- 边缘碎片字:随场景相机,随 exit 淡出 ----
      for (let i = 0; i < c.fragments.length; i++) {
        const node = fragRefs.current[i]
        if (!node) continue
        const f = c.fragments[i]
        if (alpha <= 0.001) {
          node.style.visibility = 'hidden'
          continue
        }
        node.style.visibility = 'visible'
        node.style.opacity = (0.42 * alpha).toFixed(3)
        node.style.transform = `translate(-50%, -50%) translate3d(${camX.toFixed(1)}px, ${camY.toFixed(1)}px, 0) rotate(${f.rotation.toFixed(3)}rad)`
      }

      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [])

  const cx = scene.profile.cx - 0.5
  const cy = scene.profile.cy - 0.5
  const flowX = Math.cos(scene.flowAngle)
  const flowY = Math.sin(scene.flowAngle)
  const span = Math.max(sizeW, sizeH)
  // 挂载帧的初始姿态:整场还停在上游(与 rAF 首帧一致,不会闪)
  const preTravelX = flowX * span * 0.32
  const preTravelY = flowY * span * 0.32

  return (
    <div className={styles.sceneRoot}>
      {scene.shapes.map((it, i) => (
        <svg
          key={i}
          ref={(el) => {
            svgRefs.current[i] = el
          }}
          className={styles.shape}
          viewBox={`0 0 ${sizeW} ${sizeH}`}
          preserveAspectRatio="none"
          style={{ visibility: 'hidden' }}
        >
          <g
            ref={(el) => {
              shapeRefs.current[i] = el
            }}
            style={{
              transformOrigin: '50% 50%',
              opacity: 0,
              transform: `translate3d(${(it.enterDX - preTravelX).toFixed(1)}px, ${(it.enterDY - preTravelY).toFixed(1)}px, 0)`
            }}
          >
            {it.node}
          </g>
        </svg>
      ))}

      {scene.watermark ? (
        <span
          ref={watermarkRef}
          className={styles.watermark}
          style={{
            fontSize: `${Math.round(scene.watermark.size)}px`,
            color: 'transparent',
            WebkitTextStroke: `0.014em ${palette.tone4}`,
            opacity: 0.16,
            transform: `translate3d(calc(-50% + ${(-preTravelX).toFixed(1)}px), calc(-50% + ${(-preTravelY).toFixed(1)}px), 0) rotate(${scene.watermark.rotation.toFixed(3)}rad)`,
            left: `${scene.watermark.x * 100}%`,
            top: `${scene.watermark.y * 100}%`
          }}
        >
          {scene.watermark.text}
        </span>
      ) : null}

      {/* 文字层:整层差分反相;本层不带 transform(相机在各字形自己的 transform 里) */}
      <div
        className={styles.textLayer}
        style={opts.invertText ? undefined : { mixBlendMode: 'normal' as unknown as 'normal' }}
      >
        {scene.words.map((wd: TemperaWord, i) => (
          <span
            key={`sh-${i}`}
            ref={(el) => {
              shadowRefs.current[i] = el
            }}
            className={styles.glyphShadow}
            style={{
              fontSize: `${wd.fontSize}px`,
              left: `${50 + cx * 100}%`,
              top: `${50 + cy * 100}%`,
              color: opts.invertText ? undefined : palette.ink,
              textShadow:
                opts.rgbK > 0
                  ? `${opts.rgbK}px 0 rgba(255,32,64,0.5), ${-opts.rgbK}px 0 rgba(0,229,255,0.5)`
                  : undefined,
              opacity: 0,
              visibility: 'hidden'
            }}
          >
            {wd.text}
          </span>
        ))}
        {scene.words.map((wd: TemperaWord, i) => (
          <span
            key={`gl-${i}`}
            ref={(el) => {
              glyphRefs.current[i] = el
            }}
            className={styles.glyph}
            style={{
              fontSize: `${wd.fontSize}px`,
              left: `${50 + cx * 100}%`,
              top: `${50 + cy * 100}%`,
              color: opts.invertText ? undefined : palette.ink,
              textShadow:
                opts.rgbK > 0
                  ? `${opts.rgbK}px 0 rgba(255,32,64,0.5), ${-opts.rgbK}px 0 rgba(0,229,255,0.5)`
                  : undefined,
              opacity: 0,
              visibility: 'hidden'
            }}
          >
            {wd.text}
          </span>
        ))}
      </div>

      {/* 残影:压在文字层之上,不参与反相 */}
      {scene.words.map((wd: TemperaWord, i) => (
        <span
          key={`ec-${i}`}
          ref={(el) => {
            echoRefs.current[i] = el
          }}
          className={styles.glyphEcho}
          style={{
            fontSize: `${wd.fontSize}px`,
            left: `${50 + cx * 100}%`,
            top: `${50 + cy * 100}%`,
            color: palette.ink,
            opacity: 0,
            visibility: 'hidden'
          }}
        >
          {wd.text}
        </span>
      ))}

      {/* 边缘碎片字(alpha 0.42) */}
      {scene.fragments.map((f, i) => (
        <span
          key={`fr-${i}`}
          ref={(el) => {
            fragRefs.current[i] = el
          }}
          className={styles.fragment}
          style={{
            left: `${f.x * 100}%`,
            top: `${f.y * 100}%`,
            fontSize: `${Math.round(Math.max(12, (scene.words[0]?.fontSize ?? 40) * f.scale))}px`,
            color: palette.ink,
            opacity: 0,
            visibility: 'hidden',
            transform: `translate(-50%, -50%) rotate(${f.rotation.toFixed(3)}rad)`
          }}
        >
          {f.char}
        </span>
      ))}
    </div>
  )
})

/* ===================== 后处理资源生成 ===================== */

/** 胶片颗粒噪点贴图(运行时生成一次,dataURL) */
function makeGrainTile(): string {
  const size = 96
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = Math.random() * 46
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

/** 透镜扭曲的位移贴图:R/G 通道编码径向偏移,供 feDisplacementMap 采样 */
function makeLensMap(): string {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1
      const ny = (y / (size - 1)) * 2 - 1
      const r2 = nx * nx + ny * ny
      const i = (y * size + x) * 4
      img.data[i] = Math.round(clampRange((0.5 + nx * r2 * 0.5) * 255, 0, 255))
      img.data[i + 1] = Math.round(clampRange((0.5 + ny * r2 * 0.5) * 255, 0, 255))
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

/** 从封面图提取主色(饱和像素均值);跨域污染/失败返回 null */
function extractCoverColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const done = (hex: string | null): void => resolve(hex)
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 32
        c.height = 32
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return done(null)
        ctx.drawImage(img, 0, 0, 32, 32)
        const d = ctx.getImageData(0, 0, 32, 32).data
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2])
          const mn = Math.min(d[i], d[i + 1], d[i + 2])
          const sat = mx - mn
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
          if (sat < 28 || lum < 24 || lum > 236) continue
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
          n++
        }
        if (n <= 8) return done(null)
        const hex =
          '#' +
          [r / n, g / n, b / n]
            .map((v) => Math.round(v).toString(16).padStart(2, '0'))
            .join('')
        done(hex)
      } catch {
        done(null)
      }
    }
    img.onerror = () => done(null)
    img.src = url
  })
}

/* ===================== 父组件:编译 + 场景列表 + 共享层 ===================== */

export interface TemperaLyricsProps {
  lines: LyricLine[]
  activeIdx: number
}

/** 场景列表上限:当前句 + 交接中的旧句(足够;拖动进度条时旧的会被立即 prune) */
const MAX_SCENES = 3

export function TemperaLyrics({ lines, activeIdx }: TemperaLyricsProps): JSX.Element {
  const styles = useStyles()
  const settings = useStore((s) => s.library?.settings)
  const scale = settings?.pvScale ?? 1
  const motion = settings?.pvMotion ?? 1
  const showDecor = settings?.pvDecor !== false
  const accent = settings?.pvAccent ?? ''
  const transMode = settings?.lyricTransMode ?? 'both'
  const transAlpha = settings?.lyricTransAlpha ?? 0.8
  // ===== 凝彩细化选项(对齐听屿) =====
  const showBlocks = settings?.pvBlockScenes !== false
  const showFrame = settings?.pvFrame !== false
  const invertText = settings?.pvInvertText !== false
  const transitionOn = settings?.pvTransition !== false
  const texture = clampRange(settings?.pvTexture ?? 1, 0.5, 4)
  const camMotion = clampRange(settings?.pvCameraMotion ?? 1, 0, 2)
  const charMotion = clampRange(settings?.pvCharMotion ?? 1, 0, 2)
  const charTiming = clampRange(settings?.pvCharTiming ?? 1, 0.25, 2)
  const panAmp = clampRange(settings?.pvPan ?? 1, 0, 2)
  const zoomAmp = clampRange(settings?.pvZoom ?? 1, 0.25, 2)
  const colorMode = settings?.pvColorMode ?? 'mono'
  const postOn = settings?.pvPost !== false
  const grain = clampRange(settings?.pvGrain ?? 0.15, 0, 1)
  const contrast = clampRange(settings?.pvContrast ?? 0, 0, 1)
  const rgbShift = clampRange(settings?.pvRgbShift ?? 0, 0, 1)
  const vigStrength = clampRange(settings?.pvVignette ?? 0.4, 0, 1)
  const lens = clampRange(settings?.pvLens ?? 0.15, 0, 1)
  const wholeLine = settings?.pvWholeLine === true
  const tailEmphasis = clampRange(settings?.pvTailEmphasis ?? 0.38, 0, 1)
  /** 逐字入场样式:'auto' = 按种子在全部样式里轮换;指定样式名 = 全部字用该入场 */
  const temperaEnter = settings?.pvTemperaEnter ?? 'auto'
  const offX = clampRange(settings?.pvOffsetX ?? 0, -0.5, 0.5)
  const offY = clampRange(settings?.pvOffsetY ?? 0.11, -0.5, 0.5)
  const themeAccent = settings?.accent ?? ''

  // 封面渐变模式:从当前歌曲封面提取主色(失败自动回退主题双色)
  const coverUrl = useStore((s) => s.current?.coverUrl ?? null)
  const [coverColor, setCoverColor] = useState<string | null>(null)
  useEffect(() => {
    if (colorMode !== 'cover' || !coverUrl) {
      setCoverColor(null)
      return
    }
    let dead = false
    void extractCoverColor(coverUrl).then((hex) => {
      if (!dead) setCoverColor(hex)
    })
    return () => {
      dead = true
    }
  }, [colorMode, coverUrl])

  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1280, h: 720 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = (): void => setSize({ w: el.clientWidth || 1280, h: el.clientHeight || 720 })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const active = activeIdx >= 0 ? lines[activeIdx] : null
  const display = active ?? lines[0] ?? null
  const next = activeIdx >= 0 ? lines[activeIdx + 1] : lines[1]
  const endMs = display ? lineEndTime(display.timeMs, lines[activeIdx + 1]?.timeMs) : 0
  /**
   * 本句**实际会被卸载**的时刻:即下一句的开始时间。
   * 不能用 endMs(被 15s 封顶);交接窗口按 unload 起算。
   */
  const unloadMs = display ? (lines[activeIdx + 1]?.timeMs ?? endMs) : 0

  /**
   * 调色板:三种色彩模式(对齐听屿「色彩模式」)。
   * - 黑白灰(mono,默认):中性纸墨阶梯
   * - 主题双色:纸与墨带上主题强调色的色相,保持「纸亮墨暗」
   * - 封面渐变:从封面提取主色;失败回退主题双色
   * `pvAccent` 显式 hex 时优先级最高(仍只取明度)。
   */
  const palette = useMemo<TemperaPalette>(() => {
    const custom = accent.trim()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(custom)) {
      const l = luminance(custom)
      const paper = l > 140 ? '#cdcdcb' : '#242424'
      return buildPalette(paper, l > 140 ? '#141414' : '#ececeb')
    }
    if (colorMode === 'theme' || (colorMode === 'cover' && !coverColor)) {
      const base = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(themeAccent) ? themeAccent : '#7aa2ff'
      let paper = mixColor('#d6d6d4', base, 0.22)
      if (luminance(paper) < 150) paper = '#cfcfcd'
      let ink = mixColor('#181818', base, 0.3)
      if (luminance(ink) > 90) ink = '#1c1c1c'
      return buildPalette(paper, ink)
    }
    if (colorMode === 'cover' && coverColor) {
      let paper = mixColor('#d6d6d4', coverColor, 0.28)
      if (luminance(paper) < 150) paper = '#cfcfcd'
      let ink = mixColor('#181818', coverColor, 0.34)
      if (luminance(ink) > 90) ink = '#1c1c1c'
      return buildPalette(paper, ink)
    }
    void DARK_PALETTE
    return LIGHT_PALETTE
  }, [accent, colorMode, themeAccent, coverColor])

  // 编译:构图图元 + 逐字布局 + 水印 + 碎片(按句缓存)
  const compiled = useMemo<CompiledScene | null>(() => {
    if (!display) return null
    const graphemes = Array.from(display.text).filter((c) => !/\s/.test(c))
    const seedKey = `${display.timeMs}:${display.text}`
    const seed = hashSeed(seedKey)
    const isChorus = /副歌|chorus|サビ/i.test(display.text)
    const kind: TemperaKind = pickKind(seed, isChorus, graphemes.length, 0)
    const profile = SHOT_PROFILES[kind]
    const availW = size.w * profile.w
    const rawBase = Math.max(
      34,
      Math.min(150, (size.w / Math.max(5, Math.max(1, graphemes.length) * 1.05)) * 1.5)
    )
    const baseFont = rawBase * profile.fontScale * scale
    /**
     * 入场方案:
     *  - 'classic'(默认)= GitHub 原版 7 种,行为与推送版本完全一致
     *  - 'jizura' / 'mixed' = 额外的 JIZURA 移植方案(设置里显式选择才启用)
     *  - 其余值 = 固定用该单一入场样式
     */
    const pool = temperaEnter === 'jizura' || temperaEnter === 'mixed' ? temperaEnter : 'classic'
    /**
     * 真实逐字时间:与其它排布样式走同一个解析器(QRC/YRC 的 wordTimes/words),
     * 拿到逐字数据时凝彩就不再按字数平均分配,而是逐字跟唱。
     */
    const charTimes = resolveCharTimes(display.text, display.wordTimes, display.words)
    const words = layoutTemperaWords(
      display.text,
      availW,
      baseFont,
      display.timeMs,
      endMs,
      seedKey,
      tailEmphasis,
      pool,
      charTimes
    )
    const poolStyles = enterPoolOf(pool)
    words.forEach((wd, i) => {
      const h = hash01(seed, i, 193)
      const idx = Math.floor(h * poolStyles.length) % poolStyles.length
      wd.style = poolStyles[idx]
      const prev = words[i - 1]
      if (prev && prev.style === wd.style) {
        wd.style = poolStyles[(poolStyles.indexOf(wd.style) + 1) % poolStyles.length]
      }
    })
    // 设置里固定了某个具体入场样式:全部字统一用它(方案值不走这条分支)
    if (temperaEnter !== 'auto' && temperaEnter !== 'classic' && temperaEnter !== 'jizura' && temperaEnter !== 'mixed') {
      words.forEach((wd) => {
        wd.style = temperaEnter as EnterStyle
      })
    }
    // 整句显示:全部字在句首同时入场(仅留极小的级联),不跟随逐字卡拉OK时序
    if (wholeLine) {
      words.forEach((wd, i) => {
        wd.startTime = display.timeMs + i * 36
      })
    }
    // 每句的 flow 角(镜头推进方向),对齐 hash01(seed,3,197)*2π
    const flowAngle = hash01(seed, 3, 197) * Math.PI * 2
    const shapes = showBlocks
      ? buildComposition(kind, size.w, size.h, seed, palette, showDecor, flowAngle)
      : []

    const watermark =
      showDecor && profile.mood !== 'loud' && hash01(seed, 4, 107) <= 0.62
        ? (() => {
            const src = graphemes.slice(0, 12).join('')
            if (!src) return null
            return {
              text: src,
              x: 0.28 + hash01(seed, 5, 107) * 0.44,
              y: 0.26 + hash01(seed, 6, 107) * 0.48,
              rotation: (hash01(seed, 7, 107) - 0.5) * 0.5,
              size: Math.max(48, baseFont * (2.6 + hash01(seed, 8, 107) * 1.9))
            }
          })()
        : null

    const fragments =
      showDecor && (profile.mood === 'quiet' || graphemes.length <= 6)
        ? buildFragments(seed, display.text, palette)
        : []

    // 纸面网点由父层共享渲染(见 JSX);纹理分辨率越高网点越细密
    return {
      key: seedKey,
      kind,
      profile,
      words,
      shapes,
      watermark,
      fragments,
      flowAngle,
      dur: Math.max(400, endMs - display.timeMs),
      startMs: display.timeMs,
      unloadMs,
      seed,
      phase: hash01(seed, 9, 173) * Math.PI * 2
    }
  }, [display, endMs, unloadMs, size.w, size.h, scale, showDecor, showBlocks, texture, wholeLine, tailEmphasis, temperaEnter, palette])

  /**
   * 场景列表(对齐 Pixi runtime 的 shot 容器):
   * 换句时不删除旧场景 —— 旧场景子组件保持挂载(同 key),在交接窗口内继续
   * 由自己的 rAF 驱动退场,退完回报 prune。转场关闭时只保留当前句(硬切)。
   */
  const [scenesState, setScenesState] = useState<CompiledScene[]>([])
  const scenesRef = useRef<CompiledScene[]>([])
  if (compiled) {
    const list = scenesRef.current
    const cur = list[list.length - 1]
    if (!cur || cur.key !== compiled.key) {
      const kept = transitionOn ? list.slice(-(MAX_SCENES - 1)) : []
      scenesRef.current = [...kept, compiled]
      setScenesState(scenesRef.current)
    } else if (cur !== compiled) {
      // 同一句重编译(改设置/窗口尺寸):原位替换,子组件不重挂载
      scenesRef.current = [...list.slice(0, -1), compiled]
      setScenesState(scenesRef.current)
    }
  }
  const pruneScene = useCallback((key: string) => {
    const next = scenesRef.current.filter((s) => s.key !== key)
    if (next.length !== scenesRef.current.length) {
      scenesRef.current = next
      setScenesState(next)
    }
  }, [])

  // 共享镜头层:只做呼吸(全局微动),场景相机在各子组件里
  const cameraRef = useRef<HTMLDivElement>(null)
  const grainRef = useRef<HTMLDivElement>(null)
  const breathPhaseRef = useRef(0)
  breathPhaseRef.current = compiled?.phase ?? 0
  useEffect(() => {
    let raf = 0
    const paint = (): void => {
      const now = lyricPosMs(getAudioElement().currentTime)
      const camEl = cameraRef.current
      if (camEl) {
        const br = breathAt(now / 1000, breathPhaseRef.current)
        camEl.style.transform = `translate3d(${(br.x * size.w * motion).toFixed(2)}px, ${(
          br.y * size.h * motion
        ).toFixed(2)}px, 0) scale(${(1 + br.scale).toFixed(5)}) rotate(${(br.rotation * 57.2958).toFixed(3)}deg)`
      }
      // 胶片颗粒:每 90ms 跳一步,避免平滑漂移的"浮尘"感
      if (grainRef.current) {
        const step = Math.floor(now / 90) % 7
        const gx = ((step * 37) % 13) - 6
        const gy = ((step * 53) % 11) - 5
        grainRef.current.style.transform = `translate3d(${gx}%, ${gy}%, 0)`
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [motion, size.w, size.h])

  // ===== 后处理资源(对齐听屿:颗粒/对比度/RGB色差/暗角/透镜扭曲) =====
  const grainUrl = useMemo(() => (postOn && grain > 0.01 ? makeGrainTile() : ''), [postOn, grain])
  const lensMap = useMemo(() => (postOn && lens > 0.01 ? makeLensMap() : ''), [postOn, lens])
  const postFilter = useMemo(() => {
    if (!postOn) return undefined
    const parts: string[] = []
    if (contrast > 0.01) {
      parts.push(`contrast(${(1 + contrast * 0.5).toFixed(3)}) saturate(${(1 + contrast * 0.2).toFixed(3)})`)
    }
    if (lens > 0.01 && lensMap) parts.push('url(#pv-lens-filter)')
    return parts.length > 0 ? parts.join(' ') : undefined
  }, [postOn, contrast, lens, lensMap])
  /** RGB 色差:文字层的红/青错位阴影(px) */
  const rgbK = rgbShift > 0.01 ? Math.max(1, Math.round(rgbShift * 4)) : 0

  const sceneOpts = useMemo<SceneOpts>(
    () => ({
      motion,
      camAmp: motion * camMotion,
      panAmp,
      zoomAmp,
      charMotion,
      charTiming,
      invertText,
      rgbK,
      offX,
      offY
    }),
    [motion, camMotion, panAmp, zoomAmp, charMotion, charTiming, invertText, rgbK, offX, offY]
  )

  if (!display) {
    return (
      <div className={styles.root} ref={boxRef} style={{ background: palette.paper }}>
        <div className={styles.empty}>{'♪\n暂无歌词'}</div>
      </div>
    )
  }

  const trans = resolveTrans(display, {
    mode: transMode,
    scale: settings?.lyricTransScale ?? 0.78,
    alpha: transAlpha,
    layout: 'below',
    isActive: true
  })
  const subText = trans.text || (next ? next.text : '')

  const frameM = Math.min(size.w, size.h) * 0.04
  const frameL = Math.min(size.w, size.h) * 0.065

  return (
    <div className={styles.root} ref={boxRef} style={{ background: palette.paper }}>
      {/* 后处理层:对比度/透镜扭曲作为 CSS filter 挂在容器上(颗粒在其内、晕影在其外) */}
      <div className={styles.postWrap} style={postFilter ? { filter: postFilter } : undefined}>
        <div className={styles.camera} ref={cameraRef}>
          {/* 纸面网点:半调印刷质感,跟着镜头一起动 */}
          <svg className={styles.layer} viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
            {/* 兜底纸底:比画布大 40%,镜头推到 1.16 倍外加 pan 也不会露出发暗的边 */}
            <rect x={-size.w * 0.2} y={-size.h * 0.2} width={size.w * 1.4} height={size.h * 1.4} fill={palette.paper} />
            <g fill={palette.tone4} fillOpacity={0.05}>
              {compiled
                ? dotGrid(
                    size.w,
                    size.h,
                    Math.max(12, Math.max(26, Math.sqrt((size.w * size.h) / 6000)) / texture),
                    1.6
                  ).map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} />)
                : null}
            </g>
          </svg>

          {/* 边角线框:四角 L 形角标(随镜头微动) */}
          {showFrame ? (
            <svg className={styles.layer} viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
              <g fill="none" stroke={palette.line} strokeWidth={2} opacity={0.5}>
                <path d={`M ${frameM} ${frameM + frameL} L ${frameM} ${frameM} L ${frameM + frameL} ${frameM}`} />
                <path
                  d={`M ${size.w - frameM - frameL} ${frameM} L ${size.w - frameM} ${frameM} L ${size.w - frameM} ${frameM + frameL}`}
                />
                <path
                  d={`M ${size.w - frameM} ${size.h - frameM - frameL} L ${size.w - frameM} ${size.h - frameM} L ${size.w - frameM - frameL} ${size.h - frameM}`}
                />
                <path
                  d={`M ${frameM + frameL} ${size.h - frameM} L ${frameM} ${size.h - frameM} L ${frameM} ${size.h - frameM - frameL}`}
                />
              </g>
            </svg>
          ) : null}

          {/* 场景列表:旧 → 新,新场景盖在上面;旧场景退完由 onExited 移除 */}
          {scenesState.map((sc) => (
            <TemperaSceneView
              key={sc.key}
              scene={sc}
              sizeW={size.w}
              sizeH={size.h}
              palette={palette}
              opts={sceneOpts}
              onExited={pruneScene}
            />
          ))}
        </div>

        {/* 胶片颗粒:覆盖整个后处理层,在共享 rAF 里跳步 */}
        {grainUrl ? (
          <div
            ref={grainRef}
            className={styles.grain}
            style={{ backgroundImage: `url(${grainUrl})`, opacity: grain * 0.5 }}
          />
        ) : null}
      </div>

      {/* 晕影:画面外的暗角(不随镜头动) */}
      <div className={styles.vignette} />
      <div className={styles.vignetteStrong} style={{ opacity: vigStrength }} />

      {subText ? (
        <div className={styles.sub} style={{ fontSize: `${Math.round(17 * scale)}px`, color: palette.ink, opacity: 0.52 }}>
          {subText}
        </div>
      ) : null}

      {/* 透镜扭曲滤镜 defs:位移贴图由 makeLensMap 运行时生成 */}
      {lensMap ? (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <filter id="pv-lens-filter" x="-4%" y="-4%" width="108%" height="108%">
              <feImage href={lensMap} preserveAspectRatio="none" width="100%" height="100%" result="lensMapImg" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="lensMapImg"
                scale={lens * 80}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      ) : null}
    </div>
  )
}

export default TemperaLyrics
