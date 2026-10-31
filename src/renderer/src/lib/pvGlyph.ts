/**
 * 文字PV 字形布局:把排版结果展开成「每个字的绝对坐标 + 入场向量」。
 *
 * 严格对齐 folia sonnet 的做法(src/components/visualizer/sonnet/sonnetGlyphLayout.ts):
 *  - 字位置在布局阶段一次算好,运行时只做加法,不再嵌套 transform(这是"不鬼畜"的关键)
 *  - 入场向量极克制:横向 ±0.24em、纵向 ±0.24em、旋转 ±0.035rad(hero ±0.055rad)
 *  - 同一段内相邻字左右交替起跳(stagger),形成手写排版的呼吸感而非机械平移
 *  - 入场时长 = clamp(行时长 * 0.42, 0.65s, 1.8s),且不超过行时长 * 0.72
 */
import type { PvPlacement } from './pvLayout'

export interface PvGlyph {
  char: string
  /** 布局中心坐标(相对舞台中心,px) */
  baseX: number
  baseY: number
  /** 入场起点偏移(px):从 base + enter*(1-p) 收敛到 base */
  enterX: number
  enterY: number
  /** 入场微旋转(rad) */
  entryRotation: number
  startTime: number
  settleTime: number
  /** 字号(px),装饰字更小;用于绘制时定位 */
  fontSize: number
  isHero: boolean
  isDecoration: boolean
  /** 段索引(用于同段共享排版属性) */
  segmentIndex: number
  /** 竖排时的书写方向 */
  vertical: boolean
  /** 稳定微深度(视差用,-0.5~1.3) */
  zDepth: number
}

/** 稳定哈希 */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function isCjk(ch: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch)
}

/** 单字前进宽度(px):CJK ≈ 1em,其余 ≈ 0.56em(与 pvLayout 的 measure 保持一致) */
function advanceOf(ch: string, fontSize: number): number {
  return isCjk(ch) ? fontSize : Math.max(fontSize * 0.2, fontSize * 0.56)
}

/** 入场时长:对齐 folia resolveSonnetGlyphMotionDuration */
export function glyphMotionDuration(shotDurationMs: number): number {
  const dur = Math.max(1, shotDurationMs) / 1000
  const preferred = Math.min(1.8, Math.max(0.65, dur * 0.42))
  return Math.min(preferred, dur * 0.72) * 1000
}

/**
 * 展开一个 placement 的字形。这里算的是**绝对坐标**:
 * 以段落中心为原点,沿排版方向累加字宽,再按段旋转一次性旋转到位。
 */
export function buildGlyphs(
  placements: PvPlacement[],
  shotDurationMs: number
): PvGlyph[] {
  const motionMs = glyphMotionDuration(shotDurationMs)
  const out: PvGlyph[] = []
  placements.forEach((pl, segIndex) => {
    const chars = Array.from(pl.displayText)
    if (chars.length === 0) return
    // 竖排:字沿 y 排;横排:沿 x 排
    const vertical = pl.vertical
    const advances = chars.map((c) => (vertical ? pl.fontSize * 0.9 : advanceOf(c, pl.fontSize)))
    // 标点/空格占位略窄
    const total = advances.reduce((a, b) => a + b, 0)
    let cursor = -total / 2
    const cos = Math.cos(pl.rotation)
    const sin = Math.sin(pl.rotation)
    chars.forEach((ch, i) => {
      const adv = advances[i]
      const localX = vertical ? 0 : cursor + adv / 2
      const localY = vertical ? cursor + adv / 2 : 0
      cursor += adv
      // 布局坐标 + 段旋转(等价于 CSS rotate 后再平移,但这里是纯数值,不会累积误差)
      const baseX = pl.x + localX * cos - localY * sin
      const baseY = pl.y + localX * sin + localY * cos
      // 相邻字交替起跳方向(手写感),幅度对齐 folia:0.24em / 0.28em
      const stagger = i % 2 === 0 ? -1 : 1
      const enterX = pl.enterX + (vertical ? stagger * pl.fontSize * 0.28 : 0)
      const enterY = pl.enterY + (vertical ? 0 : stagger * pl.fontSize * 0.24)
      const amp = pl.isHero ? 0.055 : 0.035
      const startTime = pl.startTime + (pl.endTime - pl.startTime) * (i / Math.max(1, chars.length))
      out.push({
        char: ch,
        baseX,
        baseY,
        enterX,
        enterY,
        entryRotation: stagger * amp,
        startTime,
        settleTime: startTime + motionMs,
        fontSize: pl.fontSize,
        isHero: pl.isHero,
        isDecoration: pl.isDecoration === true,
        segmentIndex: segIndex,
        vertical,
        // 稳定微深度:装饰字靠后(负),hero 靠前(正),用于视差
        zDepth:
          pl.isDecoration
            ? -(0.5 + ((hashStr(pl.displayText) % 800) / 1000))
            : pl.isHero
              ? 0.1 + ((hashStr(pl.displayText) % 400) / 1000)
              : 0
      })
    })
  })
  return out
}
