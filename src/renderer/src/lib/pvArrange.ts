/**
 * 更多歌词样式(对齐 folia-major 的 partita / claddagh / still 三种)
 *
 * 这三种都是**纯 DOM** 可实现的排版变形,不需要 WebGL:
 *  - 云阶 partita    :整行切成词块,按字数分 1~5 栏竖直排列,词块错落旋转
 *  - 回环 claddagh   :整行沿一段圆弧排布,字随切线旋转(自动归一化到可读角度)
 *  - 时计 still      :静态三行(上一句/当前句/下一句),只有透明度与字号差异
 *
 * 与 PV 的 6 套「镜头版式」并存:这里管的是**整行如何摆**,PV 版式管的是**镜头怎么动**。
 */
import type { LyricLine } from '@shared/types'

/** 更多歌词样式标识 */
export type LyricArrangeStyle = 'pv' | 'partita' | 'claddagh' | 'still'

/** 稳定哈希(同一句每次排布一致) */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function isCjk(ch: string): boolean {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(ch)
}

/** 单字前进宽度(px) */
function advanceOf(ch: string, fontPx: number): number {
  if (/^\s+$/.test(ch)) return fontPx * 0.36
  return isCjk(ch) ? fontPx : fontPx * 0.62
}

/** 按字素切分 */
function graphemesOf(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    } catch {
      /* 老运行时 */
    }
  }
  return Array.from(text)
}

/** 按词切分(云阶用) */
export function splitWords(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    try {
      const out: string[] = []
      let buf = ''
      for (const s of new Seg(undefined, { granularity: 'word' }).segment(text)) {
        if (s.isWordLike) {
          buf += s.segment
        } else {
          // 标点/空白粘到前一个词尾,避免单独成块
          if (buf) {
            out.push(buf + s.segment)
            buf = ''
          } else if (out.length > 0) {
            out[out.length - 1] += s.segment
          }
        }
      }
      if (buf) out.push(buf)
      return out.length > 0 ? out : [text]
    } catch {
      /* 回退 */
    }
  }
  return [text]
}

/* ===================== 云阶 partita ===================== */

export interface PartitaWordBox {
  text: string
  /** 相对舞台中心的偏移(px) */
  x: number
  y: number
  rotation: number
  /** 字号倍数 */
  fontScale: number
  columnIndex: number
}

/**
 * 云阶:把词按字数分栏,每栏竖直堆叠,词块带轻微旋转与错落。
 * 对齐 folia getTargetColumnCount:<=5 字 1 栏、<=10 字 2 栏、<=16 字 3 栏、<=24 字 4 栏、否则 5 栏。
 */
export function layoutPartita(
  text: string,
  width: number,
  height: number,
  baseFont: number,
  seedKey: string
): PartitaWordBox[] {
  const words = splitWords(text)
  if (words.length === 0) return []
  const totalGraphemes = Math.max(graphemesOf(text.replace(/\s+/g, '')).length, words.length, 1)
  const columns =
    words.length <= 2 || totalGraphemes <= 5
      ? 1
      : totalGraphemes <= 10
        ? 2
        : totalGraphemes <= 16
          ? 3
          : totalGraphemes <= 24
            ? 4
            : 5

  // 词数少于栏数时,栏数按词数收缩(否则空栏)
  const colCount = Math.max(1, Math.min(columns, words.length))
  // 每栏分到的词:尽量平均(前几栏多一个)
  const perCol = Math.ceil(words.length / colCount)
  const colGap = Math.min(width * 0.16, 190)
  const totalW = (colCount - 1) * colGap
  const seed = hashStr(seedKey)

  const out: PartitaWordBox[] = []
  for (let c = 0; c < colCount; c++) {
    const chunk = words.slice(c * perCol, (c + 1) * perCol)
    if (chunk.length === 0) continue
    const colX = -totalW / 2 + c * colGap
    // 竖向堆叠:行高随字号,总高居中
    const rowGap = baseFont * 1.32
    const totalH = (chunk.length - 1) * rowGap
    chunk.forEach((w, r) => {
      const h = hashStr(`${seedKey}:${c}:${r}`)
      // 错落:每栏整体上下偏移一点,词块再各自 ±6%
      const colOffset = ((h % 100) / 100 - 0.5) * baseFont * 0.5
      const jitterY = colOffset + r * 0
      // 长词略小,避免超出栏宽
      const wLen = graphemesOf(w).length
      const fontScale = wLen > 6 ? Math.max(0.62, 1 - (wLen - 6) * 0.06) : 1
      // 轻微旋转:±2.4°(对齐 folia 的手写感,不夸张)
      const rotation = ((h % 1000) / 1000 - 0.5) * 0.084
      out.push({
        text: w,
        x: colX,
        y: -totalH / 2 + r * rowGap + jitterY,
        rotation,
        fontScale,
        columnIndex: c
      })
    })
  }
  // 竖向溢出收缩
  const halfH = height * 0.44
  const maxAbsY = out.reduce((m, b) => Math.max(m, Math.abs(b.y)), 0)
  if (maxAbsY > halfH) {
    const s = halfH / maxAbsY
    for (const b of out) {
      b.y *= s
      b.fontScale *= Math.max(0.6, s)
    }
  }
  return out
}

/* ===================== 回环 claddagh ===================== */

export interface ArcGlyph {
  char: string
  x: number
  y: number
  /** 随切线的旋转(弧度,已归一化到可读角度) */
  rotation: number
}

/** 把角度归一化到 [-90°, 90°],避免字倒立(对齐 folia normalizeReadableAngle) */
export function normalizeReadableAngle(deg: number): number {
  let a = deg
  while (a > 90) a -= 180
  while (a < -90) a += 180
  return a
}

/**
 * 回环:整行沿一段圆弧排布,字随切线旋转。
 * 对齐 folia buildMeasuredSpacingInfo:按字宽累加弧长,总跨度超过上限就整体压缩。
 */
export function layoutCladdagh(
  text: string,
  width: number,
  height: number,
  fontPx: number
): ArcGlyph[] {
  const chars = graphemesOf(text)
  if (chars.length === 0) return []
  // 半径:取舞台短边的一部分,长句自动放大半径减小弯曲
  const radius = Math.max(fontPx * 2, Math.min(width * 0.42, height * 0.62))
  const advances = chars.map((c) => advanceOf(c, fontPx))
  const letterSpacing = fontPx * 0.04
  // 每个字中心在展开直线上的位置
  let acc = 0
  const centers: number[] = []
  for (let i = 0; i < advances.length; i++) {
    centers.push(acc + advances[i] / 2 + i * letterSpacing)
    acc += advances[i]
  }
  const totalWidth = acc + Math.max(0, chars.length - 1) * letterSpacing
  // 总跨度(弧度)过大就压缩,保证不会绕成整圈(folia CLADDAGH_MAX_ARC_SPAN = 4.25 rad)
  const MAX_SPAN = 4.25
  const rawSpan = totalWidth / radius
  const scaleFactor = rawSpan > MAX_SPAN ? MAX_SPAN / rawSpan : 1
  const span = rawSpan * scaleFactor
  // 弧形开口朝下(像一段拱形),字沿拱顶排布
  const baseAngle = -Math.PI / 2
  return chars.map((ch, i) => {
    const t = (centers[i] * scaleFactor) / radius // 0..span
    const angle = baseAngle + t - span / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius + radius * 0.35
    // 切线方向 + 90° 让字正立
    const tangentDeg = (angle * 180) / Math.PI + 90
    return {
      char: ch,
      x,
      y,
      rotation: (normalizeReadableAngle(tangentDeg - 90 + 90) * Math.PI) / 180
    }
  })
}

/* ===================== 时计 still ===================== */

export interface StillLineView {
  text: string
  /** -1 上一句 / 0 当前句 / 1 下一句 */
  offset: -1 | 0 | 1
}

/** 时计:静态三行(只做字号与透明度区分,无动画) */
export function layoutStill(lines: LyricLine[], activeIdx: number): StillLineView[] {
  const out: StillLineView[] = []
  for (const offset of [-1, 0, 1] as const) {
    const idx = activeIdx + offset
    const line = lines[idx]
    if (!line) continue
    out.push({ text: line.text, offset })
  }
  return out
}
