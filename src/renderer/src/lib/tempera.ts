/**
 * 凝彩(Tempera)歌词样式:高还原 folia-major 的 block-PV。
 *
 * 截图里那种"中央灰色矩形 + 双层描边框 + 交叉细线 + 右上菱形"就是它的 frame-window 构图。
 *
 * 三层结构(照抄源码分层):
 *  1. **构图层**:按 shot kind 画几何色块/描边框/斜线填充 —— 纯 DOM + CSS 渐变/边框也能高还原
 *  2. **文字层**:整块居中对齐,逐词独立入场(7 种方向样式),字随镜头做视差
 *  3. **滤镜层**:对比反相(invert)让字压在哪层色块上都保持可读 —— 这是凝彩最标志性的效果
 *
 * 运动学严格对齐 temperaMotion / temperaCamera:
 *  - 入场 easeTemperaEnter = cubic-bezier(0.22,1,0.36,1)(长尾减速)
 *  - 缩放 easeTemperaSoftBack(c=1.42)轻微过冲落定
 *  - 镜头恒定速度 + inout 混合(中段不停顿),呼吸幅度 0.006
 */
import { useMemo } from 'react'

/** 构图种类:这里实现截图同款与几个常用族(其余可在后续扩充) */
export type TemperaKind =
  | 'frame-window'
  | 'double-frame'
  | 'circle-window'
  | 'quad-split'
  | 'duo-split'
  | 'tri-column'
  | 'diagonal-halves'
  | 'band-strip'
  | 'corner-brackets'
  | 'quiet-line'

/** 构图配置(对齐 TemperaShotProfile) */
export interface TemperaProfile {
  /** 文字区中心与尺寸(视口比例) */
  cx: number
  cy: number
  w: number
  h: number
  /** 文字区旋转(rad) */
  rotation: number
  /** 字号倍数 */
  fontScale: number
  /** 入场向量(字号倍数) */
  enterX: number
  enterY: number
  /** 镜头:沿 flow 角的位移 + 缩放区间 */
  travel: number
  zoomStart: number
  zoomEnd: number
  mood: 'quiet' | 'neutral' | 'loud'
}

/** 构图配置表(数值取自 folia temperaShotProfiles) */
export const TEMPERA_PROFILES: Record<TemperaKind, TemperaProfile> = {
  'frame-window': { cx: 0.5, cy: 0.5, w: 0.7, h: 0.34, rotation: 0, fontScale: 1, enterX: 0, enterY: 0.9, travel: 0.1, zoomStart: 1.04, zoomEnd: 1.12, mood: 'quiet' },
  'double-frame': { cx: 0.5, cy: 0.5, w: 0.72, h: 0.4, rotation: 0, fontScale: 1, enterX: 0.6, enterY: 0.8, travel: 0.11, zoomStart: 1.05, zoomEnd: 1.13, mood: 'neutral' },
  'circle-window': { cx: 0.5, cy: 0.5, w: 0.62, h: 0.34, rotation: 0, fontScale: 0.96, enterX: 0, enterY: 1, travel: 0.09, zoomStart: 1.06, zoomEnd: 1.1, mood: 'quiet' },
  'quad-split': { cx: 0.5, cy: 0.5, w: 0.82, h: 0.4, rotation: 0, fontScale: 1, enterX: 0.9, enterY: 0.9, travel: 0.09, zoomStart: 1.08, zoomEnd: 1.16, mood: 'loud' },
  'duo-split': { cx: 0.5, cy: 0.52, w: 0.86, h: 0.46, rotation: 0, fontScale: 1, enterX: 0, enterY: 1.3, travel: 0.11, zoomStart: 1.06, zoomEnd: 1.13, mood: 'neutral' },
  'tri-column': { cx: 0.5, cy: 0.5, w: 0.7, h: 0.5, rotation: 0, fontScale: 0.95, enterX: -1.2, enterY: 0, travel: 0.12, zoomStart: 1.04, zoomEnd: 1.12, mood: 'neutral' },
  'diagonal-halves': { cx: 0.5, cy: 0.5, w: 0.78, h: 0.4, rotation: -0.075, fontScale: 1, enterX: 1.1, enterY: 1.1, travel: 0.12, zoomStart: 1.06, zoomEnd: 1.14, mood: 'neutral' },
  'band-strip': { cx: 0.5, cy: 0.5, w: 0.9, h: 0.22, rotation: 0, fontScale: 0.9, enterX: -1, enterY: 0, travel: 0.13, zoomStart: 1.03, zoomEnd: 1.1, mood: 'quiet' },
  'corner-brackets': { cx: 0.5, cy: 0.5, w: 0.74, h: 0.36, rotation: 0, fontScale: 1, enterX: 0, enterY: 0.9, travel: 0.1, zoomStart: 1.04, zoomEnd: 1.12, mood: 'quiet' },
  'quiet-line': { cx: 0.5, cy: 0.5, w: 0.68, h: 0.24, rotation: 0, fontScale: 0.92, enterX: 0, enterY: 0.7, travel: 0.07, zoomStart: 1.02, zoomEnd: 1.07, mood: 'quiet' }
}

/* ===================== 缓动(对齐 temperaMotionEasing) ===================== */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function cubicCoord(p1: number, p2: number, t: number): number {
  const inv = 1 - t
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t
}

export function resolveCubicBezier(x1: number, y1: number, x2: number, y2: number, value: number): number {
  const target = clamp01(value)
  if (target === 0 || target === 1) return target
  let low = 0
  let high = 1
  let param = target
  for (let i = 0; i < 12; i++) {
    const x = cubicCoord(x1, x2, param)
    if (x < target) low = param
    else high = param
    param = (low + high) / 2
  }
  return cubicCoord(y1, y2, param)
}

/** 长尾减速:起势果断,尾部慢慢爬(凝彩的手感核心) */
export const easeEnter = (v: number): number => resolveCubicBezier(0.22, 1, 0.36, 1, v)
export const easeInOut = (v: number): number => resolveCubicBezier(0.62, 0, 0.32, 1, v)

/** 轻微过冲落定(用于缩放) */
export function easeSoftBack(v: number): number {
  const t = clamp01(v)
  const c = 1.42
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/* ===================== 入场样式(每种词随机分配) ===================== */

export const ENTER_STYLES = [
  'slide',
  'from-left',
  'from-right',
  'from-above',
  'from-below',
  'swing',
  'stamp'
] as const
export type EnterStyle = (typeof ENTER_STYLES)[number]

export interface EnterFrame {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  echo: number
}

/** 解析某个入场样式在 travel(1→0)、linear(0→1) 时的偏移/旋转/缩放 */
export function resolveEnterFrame(
  style: EnterStyle,
  inp: { enterX: number; enterY: number; enterRotation: number; enterScale: number },
  travel: number,
  linear: number
): EnterFrame {
  const settle = easeSoftBack(linear)
  const uniform = inp.enterScale + (1 - inp.enterScale) * settle
  const magnitude = Math.hypot(inp.enterX, inp.enterY)
  const directional = (dirX: number, dirY: number): EnterFrame => {
    const len = Math.hypot(dirX, dirY) || 1
    return {
      x: (dirX / len) * magnitude * travel,
      y: (dirY / len) * magnitude * travel,
      rotation: inp.enterRotation * 0.4 * travel,
      scaleX: uniform,
      scaleY: uniform,
      echo: travel
    }
  }
  switch (style) {
    case 'from-left':
      return directional(-1, 0.12)
    case 'from-right':
      return directional(1, -0.12)
    case 'from-above':
      return directional(0.12, -1)
    case 'from-below':
      return directional(-0.12, 1)
    case 'swing':
      return {
        x: inp.enterX * 0.6 * travel,
        y: inp.enterY * 0.6 * travel,
        rotation: (inp.enterRotation + Math.sign(inp.enterRotation || 1) * 0.95) * travel,
        scaleX: uniform,
        scaleY: uniform,
        echo: travel * 0.8
      }
    case 'stamp':
      return {
        x: 0,
        y: 0,
        rotation: inp.enterRotation * 0.6 * travel,
        scaleX: 1 + travel * 0.7,
        scaleY: 1 + travel * 0.7,
        echo: 0
      }
    case 'slide':
    default:
      return {
        x: inp.enterX * travel,
        y: inp.enterY * travel,
        rotation: inp.enterRotation * travel,
        scaleX: uniform,
        scaleY: uniform,
        echo: travel
      }
  }
}

/* ===================== 镜头(对齐 temperaCamera) ===================== */

export interface CamFrame {
  x: number
  y: number
  scale: number
  rotation: number
}

export function cameraAt(profile: TemperaProfile, progress: number): CamFrame {
  const clamped = clamp01(progress)
  // 恒定速度与缓动混合:中段永不停顿
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

export const BREATH_MAX_OFFSET = 0.006
export const BREATH_MAX_SCALE = 0.002
export const BREATH_MAX_ROTATION = 0.0015

export function breathAt(time: number, phase = 0): CamFrame {
  const tau = time * Math.PI * 2
  return {
    x: (Math.sin(tau * 0.13 + phase) * 0.65 + Math.sin(tau * 0.31 + phase * 1.7) * 0.35) * BREATH_MAX_OFFSET,
    y: (Math.cos(tau * 0.11 + phase * 2.3) * 0.65 + Math.sin(tau * 0.29 + phase * 0.9) * 0.35) * BREATH_MAX_OFFSET,
    scale: Math.sin(tau * 0.09 + phase * 1.3) * BREATH_MAX_SCALE,
    rotation: Math.sin(tau * 0.07 + phase * 2.9) * BREATH_MAX_ROTATION
  }
}

/* ===================== 逐词入场规划 ===================== */

export interface TemperaWord {
  text: string
  /** 相对文字区中心的偏移(px,排版后) */
  x: number
  y: number
  /** 该词的入场样式(同段内相邻词不同,制造拼贴感) */
  style: EnterStyle
  /** 入场向量(px) */
  enterX: number
  enterY: number
  /** 入场微旋转 */
  enterRotation: number
  /** 起始缩放 */
  enterScale: number
  startTime: number
  settleTime: number
  /** 这个词唱完的时间(驱动唱后 tracking 展开) */
  endTime: number
  fontSize: number
  /** 唱后展开量:字距轻微变宽,让完成的句子"活着" */
  trackingX: number
}

/** 稳定哈希 */
function hash01(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 10000) / 10000
}

function isCjk(ch: string): boolean {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(ch)
}

/**
 * 单字前进宽度(em 倍数)。
 *
 * 之前所有非中日韩字符一律按 0.6em 估算,英文长句会**严重低估**总宽 ——
 * 布局以为还放得下,实际字已经压在一起、最后还要靠容器裁切。
 * 这里按字符类别分级:窄字母(i/l/j/t/f/r/空格/标点)、宽字母(m/w/M/W)、大写、数字。
 * 注:这是估算值,排版时还会按实测行宽再做一次矫正(见组件里的 measure 校正)。
 */
function advanceOf(ch: string, fontPx: number): number {
  if (/^\s+$/.test(ch)) return fontPx * 0.3
  if (isCjk(ch)) return fontPx
  // 窄字形
  if (/[iljtfrI.,:;'!|`]/.test(ch)) return fontPx * 0.32
  // 宽字形
  if (/[mwMW]/.test(ch)) return fontPx * 0.86
  // 大写
  if (/[A-Z]/.test(ch)) return fontPx * 0.68
  // 数字
  if (/[0-9]/.test(ch)) return fontPx * 0.58
  // 其余小写与标点
  return fontPx * 0.56
}

/** 按词切分(标点粘前一词) */
export function splitWords(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      const out: string[] = []
      let buf = ''
      for (const s of new Seg(undefined, { granularity: 'word' }).segment(text)) {
        if (s.isWordLike) buf += s.segment
        else if (buf) {
          out.push(buf + s.segment)
          buf = ''
        } else if (out.length > 0) out[out.length - 1] += s.segment
      }
      if (buf) out.push(buf)
      return out.length > 0 ? out : [text]
    } catch {
      /* 回退 */
    }
  }
  return [text]
}

/**
 * 凝彩逐字布局(强制逐字 + 空格必换行):
 *  - 排版单位是**字**
 *  - **句中出现空格 → 该处一定换行**(用户明确要求:英文一句一组词,不要挤成一条)
 *  - 单个 token 超过可用宽度时再逐字硬断,避免溢出
 *  - 每行按自身宽度水平居中,整体垂直居中
 *  - 时间轴按"非空白字数"平均分,空格只占时间、不出字形
 */
export function layoutTemperaWords(
  text: string,
  availW: number,
  fontSize: number,
  lineStartMs: number,
  lineEndMs: number,
  seedKey: string
): TemperaWord[] {
  /** 多行之间的行高倍数 */
  const LINE_HEIGHT = 1.18

  /** 空格切分出的 token(连续空格折叠);token 内部不再含空格 */
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return []

  /** 单字前进宽度 */
  const measureText = (s: string, fsz: number): number => {
    let w = 0
    for (const c of s) w += advanceOf(c, fsz)
    return w
  }

  // ---- 1) 定行:每个 token 自成一行(空格必换行);token 本身超宽则按字硬断 ----
  let fs = fontSize
  let lines: string[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    lines = []
    for (const tok of tokens) {
      const tw = measureText(tok, fs)
      if (tw <= availW) {
        lines.push(tok)
        continue
      }
      // 超宽 token(很长的英文单词):按字累积断开
      let cur = ''
      let curW = 0
      for (const c of tok) {
        const cw = advanceOf(c, fs)
        if (cur && curW + cw > availW) {
          lines.push(cur)
          cur = c
          curW = cw
        } else {
          cur += c
          curW += cw
        }
      }
      if (cur) lines.push(cur)
    }
    const widest = lines.reduce((m, l) => Math.max(m, measureText(l, fs)), 0)
    // 只有单个 token 也会被硬断成多行时,才需要缩字号;多行本身是设计,不缩
    const overflows = widest > availW * 1.0001
    if (!overflows) break
    const fit = widest > 0 ? availW / widest : 1
    fs *= Math.min(1, Math.max(0.5, fit))
  }

  // ---- 2) 逐行排版:每行各自水平居中,整体垂直居中 ----
  const lineDur = Math.max(300, lineEndMs - lineStartMs)
  // 把所有字的演唱时长先按「非空白字数」平均分
  const visibleCount = lines.reduce((n, l) => n + Array.from(l.replace(/\s/g, '')).length, 0)
  const perChar = lineDur / Math.max(1, visibleCount)
  const lineHeightPx = fs * LINE_HEIGHT
  const blockH = lineHeightPx * lines.length
  const topY = -blockH / 2 + lineHeightPx / 2

  const out: TemperaWord[] = []
  let charIndex = 0
  lines.forEach((lineText, li) => {
    const chars = Array.from(lineText)
    const widths = chars.map((c) => advanceOf(c, fs))
    const totalW = widths.reduce((a, b) => a + b, 0)
    let cursor = -totalW / 2
    const rowY = topY + li * lineHeightPx

    chars.forEach((c, ci) => {
      const cw = widths[ci]
      const cx = cursor + cw / 2
      cursor += cw
      // 空格不产出字形,但占一个时间片(演唱上有停顿感)
      if (/^\s$/.test(c)) {
        charIndex += 1
        return
      }
      const idx = charIndex
      const h = hash01(`${seedKey}:${idx}`)
      let style = ENTER_STYLES[Math.floor(h * ENTER_STYLES.length) % ENTER_STYLES.length]
      const prev = out[out.length - 1]
      if (prev && prev.style === style) {
        style = ENTER_STYLES[(ENTER_STYLES.indexOf(style) + 1) % ENTER_STYLES.length]
      }
      const startTime = lineStartMs + idx * perChar
      const motionWin = Math.min(1100, Math.max(420, perChar * 0.9))
      const settleTime = Math.min(lineEndMs + motionWin * 0.2, startTime + motionWin)
      const dirX = h > 0.5 ? 1 : -1
      const mag = fs * (0.28 + h * 0.22)
      out.push({
        text: c,
        x: cx,
        y: rowY,
        style,
        enterX: dirX * mag,
        enterY: (h > 0.3 ? 1 : -1) * mag * 0.7,
        enterRotation: (hash01(`${seedKey}:rot:${idx}`) - 0.5) * 0.09,
        enterScale: 0.9 + hash01(`${seedKey}:sc:${idx}`) * 0.08,
        startTime,
        settleTime,
        endTime: lineStartMs + (idx + 1) * perChar,
        fontSize: fs,
        trackingX: cx * 1.06
      })
      charIndex += 1
    })
  })
  return out
}

/** 选择构图(按句子种子稳定;副歌偏 loud,静场偏 quiet) */
export function pickTemperaKind(seedKey: string, isChorus: boolean, wordCount: number): TemperaKind {
  if (wordCount <= 2) return 'quiet-line'
  if (isChorus) {
    const loud: TemperaKind[] = ['quad-split', 'duo-split', 'diagonal-halves', 'band-strip']
    return loud[Math.floor(hash01(seedKey) * loud.length) % loud.length]
  }
  const all: TemperaKind[] = [
    'frame-window',
    'double-frame',
    'circle-window',
    'tri-column',
    'corner-brackets',
    'band-strip',
    'diagonal-halves'
  ]
  return all[Math.floor(hash01(seedKey) * all.length) % all.length]
}
