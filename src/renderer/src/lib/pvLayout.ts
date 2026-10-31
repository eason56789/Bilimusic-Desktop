/**
 * 文字PV 排版引擎:把一段歌词的词段摆到画布上。
 *
 * 对应「7 种排版 kind」中的实现(此处实现常用的 6 套):
 *  - type-impact      巨字炸裂(副歌专用,hero 5.5 倍)
 *  - editorial-column 竖排专栏(hero 独占一列,其余在侧)
 *  - fragment-collage 极坐标散落(碎片拼贴,带 AABB 避碰)
 *  - tracking-ribbon  单行带状(左右顺排,上下抖动)
 *  - mask-reveal      中轴紧凑单列
 *  - quiet-tableau    静场中轴堆叠(只有位移,无缩放)
 *
 * 输出只依赖输入(纯函数),因此可缓存、可在换句时复用。
 */
import type { PvSegment } from './pvSegment'

export type PvLayoutKind =
  | 'type-impact'
  | 'editorial-column'
  | 'fragment-collage'
  | 'tracking-ribbon'
  | 'mask-reveal'
  | 'quiet-tableau'

export interface PvPlacement {
  segment: PvSegment
  /** 显示文本(竖排时会插换行) */
  displayText: string
  /** 是否主角(放大倍数最高) */
  isHero: boolean
  /** 是否主角副本(装饰空心巨字) */
  isDecoration?: boolean
  /** 字号倍数(相对 baseFontSize) */
  fontScale: number
  /** 最终像素字号 */
  fontSize: number
  /** 相对画布中心的偏移(px) */
  x: number
  y: number
  rotation: number
  /** 入场起点偏移(px):从 enterX/enterY 滑到 x/y */
  enterX: number
  enterY: number
  vertical: boolean
  /** 该段的演唱开始/结束时间(ms) */
  startTime: number
  endTime: number
}

export interface PvLayoutInput {
  segments: PvSegment[]
  kind: PvLayoutKind
  width: number
  height: number
  /** 用户字号缩放 + 设置字号 */
  fontScale?: number
}

/** 稳定哈希(同一句每次排版一致,不同句不同) */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 由句文本 + 索引挑一个排版 kind(种子稳定:同一句永远同一套版式) */
export function pickLayoutKind(seed: string, isChorus: boolean, wordCount: number): PvLayoutKind {
  const KINDS: PvLayoutKind[] = [
    'editorial-column',
    'type-impact',
    'fragment-collage',
    'tracking-ribbon',
    'mask-reveal',
    'poster-blocks' as PvLayoutKind,
    'quiet-tableau'
  ].filter((k) => k !== 'poster-blocks') as PvLayoutKind[]
  // 静场:词少时用 quiet-tableau;副歌强制 type-impact(副歌必须炸)
  if (isChorus) return 'type-impact'
  if (wordCount <= 2) return 'quiet-tableau'
  return KINDS[hash(seed) % KINDS.length]
}

/** CJK 判定(用于竖排/整句断行) */
function isCjk(s: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s)
}

/** 文本竖向断行(竖排时每字一行) */
function verticalDisplay(text: string): string {
  return Array.from(text).join('\n')
}

/** 估算文本宽度(px):CJK 1em,其余约 0.55em */
function measure(text: string, fontSize: number): number {
  let w = 0
  for (const ch of Array.from(text)) {
    if (ch === '\n') continue
    w += isCjk(ch) ? fontSize : fontSize * 0.56
  }
  return w
}

/** 找 hero:最长的实词段(同长取靠后的,视觉上更像标题) */
function heroIndexOf(segments: PvSegment[]): number {
  let best = -1
  let bestLen = -1
  segments.forEach((s, i) => {
    if (!s.isWordLike) return
    const len = Array.from(s.text).length
    if (len >= bestLen) {
      bestLen = len
      best = i
    }
  })
  return best >= 0 ? best : 0
}

/** 每种 kind 的字号倍数:hero / 普通 */
const SCALES: Record<PvLayoutKind, { hero: number; normal: number }> = {
  'type-impact': { hero: 5.5, normal: 1.5 },
  'editorial-column': { hero: 3.7, normal: 1.25 },
  'fragment-collage': { hero: 3.2, normal: 1.35 },
  'tracking-ribbon': { hero: 3.5, normal: 1.5 },
  'mask-reveal': { hero: 4.5, normal: 1.6 },
  'quiet-tableau': { hero: 3.0, normal: 1.15 }
}

/** 版式名规范化:旧版本/脏数据(如 'center'/'stagger')一律回退到静场堆叠,避免查表崩溃 */
export function normalizeKind(kind: string): PvLayoutKind {
  return (Object.prototype.hasOwnProperty.call(SCALES, kind) ? kind : 'quiet-tableau') as PvLayoutKind
}

/**
 * 基础字号:按词数反比(词多字小),再乘 kind 权重。
 * 对齐参考实现:clamp(24, 112, width / max(7, wordCount*2.15) * wKind * scale)
 */
function baseFontSize(kind: PvLayoutKind, width: number, wordCount: number, scale: number): number {
  const wKind = kind === 'type-impact' ? 1.55 : kind === 'quiet-tableau' ? 0.82 : 1
  const raw = (width / Math.max(7, wordCount * 2.15)) * wKind * scale
  return Math.max(24, Math.min(112, raw))
}

/**
 * 溢出收缩:整体等比缩到画布内。
 * 只缩位置不缩字号没有意义(一个超长单词仍会溢出),因此按含字号的总包围盒
 * 统一缩放;最后再把每个词块夹回可视区,兜住超长单词缩放后仍压边的极端情况。
 */
function fitToCanvas(placements: PvPlacement[], width: number, height: number): void {
  let maxX = 0
  let maxY = 0
  for (const p of placements) {
    const w = measure(p.displayText, p.fontSize)
    const h = p.fontSize * (p.vertical ? Array.from(p.displayText).length : 1.6)
    maxX = Math.max(maxX, Math.abs(p.x) + w / 2)
    maxY = Math.max(maxY, Math.abs(p.y) + h / 2)
  }
  const limitX = width * 0.46
  const limitY = height * 0.45
  const sx = maxX > limitX ? limitX / maxX : 1
  const sy = maxY > limitY ? limitY / maxY : 1
  const s = Math.min(sx, sy)
  if (s < 0.999) {
    for (const p of placements) {
      p.x *= s
      p.y *= s
      p.fontSize *= s
    }
  }
  for (const p of placements) {
    const w = measure(p.displayText, p.fontSize)
    const h = p.fontSize * (p.vertical ? Array.from(p.displayText).length : 1.6)
    const halfW = Math.min(w / 2, width * 0.48)
    const halfH = Math.min(h / 2, height * 0.47)
    p.x = Math.max(-width * 0.5 + halfW, Math.min(width * 0.5 - halfW, p.x))
    p.y = Math.max(-height * 0.5 + halfH, Math.min(height * 0.5 - halfH, p.y))
  }
}

/** 矩形(用于散落避碰) */
interface Rect {
  l: number
  r: number
  t: number
  b: number
}
function rectOf(p: PvPlacement): Rect {
  const w = measure(p.displayText, p.fontSize)
  const h = p.fontSize * (p.vertical ? Array.from(p.displayText).length : 1.4)
  return { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h / 2, b: p.y + h / 2 }
}
/** AABB 间距(<=0 表示重叠) */
function gapOf(a: Rect, b: Rect): number {
  return Math.max(Math.max(a.l - b.r, b.l - a.r), Math.max(a.t - b.b, b.t - a.b))
}

/**
 * 排版主函数:返回每个词段的位置。
 * 所有 kind 都遵守同一套产物,渲染层只负责按时间把它们画出来。
 */
export function layoutLyrics(input: PvLayoutInput): PvPlacement[] {
  const { segments, width, height } = input
  if (segments.length === 0) return []
  // 版式名先规范化:存档里可能是旧值('center' 等)或脏数据,查表前必须兜底
  const kind: PvLayoutKind = normalizeKind(input.kind)
  const scale = input.fontScale ?? 1
  const wordCount = Math.max(1, segments.filter((s) => s.isWordLike).length)
  const base = baseFontSize(kind, width, wordCount, scale)
  const hero = heroIndexOf(segments)
  const sc = SCALES[kind]
  const gap = Math.max(16, Math.min(40, width * 0.035))
  const out: PvPlacement[] = []
  const seed = hash(segments.map((s) => s.text).join('|'))

  /** 生成一个 placement 的公共字段 */
  const make = (
    seg: PvSegment,
    i: number,
    fontScale: number,
    x: number,
    y: number,
    rotation: number,
    enterX: number,
    enterY: number,
    vertical: boolean,
    displayText = seg.text,
    isDecoration = false
  ): PvPlacement => ({
    segment: seg,
    displayText,
    isHero: i === hero && !isDecoration,
    isDecoration,
    fontScale,
    fontSize: base * fontScale,
    x,
    y,
    rotation,
    enterX,
    enterY,
    vertical,
    startTime: seg.startTime,
    endTime: seg.endTime
  })

  switch (kind) {
    /* ===== 巨字炸裂:hero 独占,其余小字环绕 ===== */
    case 'type-impact': {
      segments.forEach((s, i) => {
        if (i === hero) {
          out.push(make(s, i, sc.hero, 0, -height * 0.02, -0.02, 0, height * 0.12, false))
        } else {
          const side = i % 2 === 0 ? -1 : 1
          const n = Math.floor(i / 2) + 1
          out.push(
            make(
              s,
              i,
              sc.normal,
              side * (width * 0.16 + n * gap * 1.4),
              height * 0.2 - n * gap * 1.1 * (side > 0 ? 1 : 0.4),
              side * 0.03,
              side * 40,
              height * 0.1,
              false
            )
          )
        }
      })
      break
    }

    /* ===== 竖排专栏:hero 左侧竖排,其余右侧一列 ===== */
    case 'editorial-column': {
      const heroSeg = segments[hero]
      const heroVertical = isCjk(heroSeg.text)
      const heroDisplay = heroVertical ? verticalDisplay(heroSeg.text) : heroSeg.text
      const heroFont = base * sc.hero
      const heroW = heroVertical ? heroFont * 1.25 : measure(heroDisplay, heroFont)
      out.push(
        make(
          heroSeg,
          hero,
          sc.hero,
          -width * 0.19,
          0,
          0,
          -30,
          0,
          heroVertical,
          heroDisplay
        )
      )
      let colY = -height * 0.28
      let colIdx = 0
      segments.forEach((s, i) => {
        if (i === hero) return
        const fs = base * sc.normal
        const h = fs * 1.5
        if (colY + h > height * 0.34) {
          colIdx++
          colY = -height * 0.28
        }
        const x = -width * 0.19 + heroW / 2 + gap * 1.6 + colIdx * (width * 0.14)
        out.push(make(s, i, sc.normal, x, colY + h / 2, 0, 30, 0, false))
        colY += h + gap * 0.5
      })
      break
    }

    /* ===== 碎片拼贴:极坐标散落 + 避碰 ===== */
    case 'fragment-collage': {
      const heroSeg = segments[hero]
      const heroFont = base * sc.hero
      out.push(make(heroSeg, hero, sc.hero, 0, 0, 0.02, 0, 30, false))
      const heroRect = rectOf(out[0])
      const placed: Rect[] = [heroRect]
      let radius = Math.hypot(heroRect.r - heroRect.l, heroRect.b - heroRect.t) / 2 + gap
      let angle = Math.PI / 4
      segments.forEach((s, i) => {
        if (i === hero) return
        const fs = base * sc.normal
        const segW = measure(s.text, fs)
        const segH = fs * 1.4
        let tries = 0
        let p: PvPlacement
        for (;;) {
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          const rot = (hash(`${seed}-${i}`) % 100) / 100 * 0.12 - 0.06
          p = make(s, i, sc.normal, x, y, rot, 0, 0, false)
          const r: Rect = { l: x - segW / 2, r: x + segW / 2, t: y - segH / 2, b: y + segH / 2 }
          const collide = placed.some((q) => gapOf(r, q) < gap * 0.45)
          const outside = Math.abs(x) > width * 0.46 || Math.abs(y) > height * 0.44
          if ((!collide && !outside) || tries > 40) {
            placed.push(r)
            break
          }
          angle += 0.65
          if (tries % 12 === 11) radius += gap * 0.6
          tries++
        }
        out.push(p)
      })
      break
    }

    /* ===== 单行带状:hero 居中,左右顺排,上下抖动 ===== */
    case 'tracking-ribbon': {
      const heroSeg = segments[hero]
      const heroFont = base * sc.hero
      const heroW = measure(heroSeg.text, heroFont)
      out.push(make(heroSeg, hero, sc.hero, 0, 0, 0, 0, 24, false))
      let leftX = -heroW / 2 - gap
      let rightX = heroW / 2 + gap
      segments.forEach((s, i) => {
        if (i === hero) return
        const fs = base * sc.normal
        const w = measure(s.text, fs)
        const jitter = (hash(`${seed}-${i}`) % 2 === 0 ? -1 : 1) * (gap * 0.28)
        if (i < hero) {
          leftX -= w
          out.push(make(s, i, sc.normal, leftX, jitter, 0, -30, 0, false))
          leftX -= gap
        } else {
          rightX += w
          out.push(make(s, i, sc.normal, rightX, -jitter, 0, 30, 0, false))
          rightX += gap
        }
      })
      break
    }

    /* ===== 中轴紧凑单列:从上方落入 ===== */
    case 'mask-reveal': {
      const total = segments.reduce((sum, s, i) => {
        const fs = base * (i === hero ? sc.hero : sc.normal)
        return sum + fs * 1.42
      }, 0)
      let y = -total / 2
      segments.forEach((s, i) => {
        const fs = i === hero ? sc.hero : sc.normal
        const h = base * fs * 1.42
        out.push(make(s, i, fs, 0, y + h / 2, 0, 0, height * 0.1, false))
        y += h + gap * 0.3
      })
      break
    }

    /* ===== 静场中轴堆叠:只有位移 ===== */
    case 'quiet-tableau':
    default: {
      const total = segments.reduce((sum, s, i) => {
        const fs = base * (i === hero ? sc.hero : sc.normal)
        return sum + fs * 1.5
      }, 0)
      let y = -total / 2
      segments.forEach((s, i) => {
        const fs = i === hero ? sc.hero : sc.normal
        const h = base * fs * 1.5
        const variant = hash(`${seed}-${i}`) % 3
        const x = variant === 1 ? (i % 2 === 0 ? -gap * 1.6 : gap * 1.6) : 0
        out.push(make(s, i, fs, x, y + h / 2, 0, 0, i % 2 === 0 ? 20 : -20, false))
        y += h + gap * 0.35
      })
      break
    }
  }

  // 装饰层:挑一个 hero 复制成 3.5 倍空心巨字(静场/拼贴不加,避免画面过乱)
  if (kind !== 'quiet-tableau' && kind !== 'fragment-collage') {
    const heroPl = out.find((p) => p.isHero)
    if (heroPl) {
      out.unshift({
        ...heroPl,
        isHero: false,
        isDecoration: true,
        fontScale: Math.min(5.5, Math.max(2.8, heroPl.fontScale * 3.2)),
        fontSize: heroPl.fontSize * 3.2,
        x: heroPl.x - width * 0.1,
        y: heroPl.y - height * 0.05,
        rotation: -0.15,
        enterX: 0,
        enterY: 0
      })
    }
  }

  fitToCanvas(out, width, height)
  return out
}
