/**
 * 列表逐个入场原语:元素首次进入视口时,按同批顺序错开播「模糊淡入 + 上浮」。
 *
 * 为什么要共享一个 observer:
 * 歌单/收藏可能有上千行,每项各建一个 IntersectionObserver 会直接卡死主线程。
 * 这里用一个 observer 观察所有已注册节点,回调里按「同批」分组排延迟。
 *
 * 为什么只播一次:
 * 滚动回看时不重播。元素一进入视口就写 data-revealed,后续 observer 直接忽略;
 * CSS 侧 [data-revealed='true'] 覆盖到终态。
 *
 * 为什么注册有上限:
 * 上千行同时进入视口会让错开延迟累加到几秒。超过批次上限(40)的项不排队、立即播,
 * 视觉上仍是「滚到才有」,但不会出现「滚到底还要等 5 秒才淡完」。
 *
 * 关闭档:
 * level === 'off' 时 observer 根本不创建,元素立刻置终态,零动画开销。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useMotionLevel } from './motion'

/** 同一批最多错开多少项;超出部分立即播 */
const BATCH_LIMIT = 40
/** 兜底:注册后若这么久还没被揭示(容器无 ref / 布局异常),强制放出,绝不把内容藏死 */
const SAFETY_MS = 2500

export interface RevealApi {
  /** 挂到滚动容器上;作为 observer 的 root。不挂则以视口为 root */
  rootRef: (node: HTMLElement | null) => void
  /**
   * 列表项注册。index 决定同批内错开顺序。
   * `key` 用于识别「同一个 DOM 节点换了内容」:React 复用节点时 key 会变,
   * 此时应当重新播放入场;key 不变(如播放状态刷新导致的整体重渲)则不重播。
   */
  register: (node: HTMLElement | null, index: number, key?: string) => void
}

export function useRevealGroup(enabled = true): RevealApi {
  const level = useMotionLevel()
  const active = enabled && level !== 'off'
  const observerRef = useRef<IntersectionObserver | null>(null)
  const rootNodeRef = useRef<HTMLElement | null>(null)
  /** 已注册但尚未揭示的节点 → 同批顺序 */
  const pendingRef = useRef<Map<Element, number>>(new Map())
  /** 已注册过的节点 → 该节点上次承载的内容 key(用于识别节点复用) */
  const seenRef = useRef<Map<Element, string>>(new Map())
  const safetyRef = useRef<number | null>(null)

  /** 建/重建 observer。root 变化必须重建,否则视口判定仍按旧容器算 */
  const ensureObserver = useCallback((): IntersectionObserver | null => {
    if (!active) return null
    observerRef.current?.disconnect()
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({ el: e.target as HTMLElement, idx: pendingRef.current.get(e.target) ?? 0 }))
        if (hit.length === 0) return
        hit.sort((a, b) => a.idx - b.idx)
        const step = staggerMs()
        hit.forEach((item, order) => {
          revealNow(item.el, order < BATCH_LIMIT ? order * step : 0)
          pendingRef.current.delete(item.el)
          obs.unobserve(item.el)
        })
      },
      {
        root: rootNodeRef.current,
        // 提前 120px 起播:滚动时不至于先露白再淡入
        rootMargin: '0px 0px 120px 0px',
        threshold: 0.01
      }
    )
    observerRef.current = obs
    // 重新观察所有仍在等待的节点
    pendingRef.current.forEach((_, el) => obs.observe(el))
    return obs
  }, [active])

  const rootRef = useCallback(
    (node: HTMLElement | null): void => {
      rootNodeRef.current = node
      if (active) ensureObserver()
    },
    [active, ensureObserver]
  )

  const register = useCallback(
    (node: HTMLElement | null, index: number, key?: string): void => {
      if (!node) return
      // 由 JS 自己打标记,不依赖 className/data-*(Fluent Card 等组件会过滤未知 prop)
      node.dataset.bmReveal = ''
      if (!active) {
        node.dataset.revealed = 'true'
        return
      }
      const marker = key ?? ''
      const prevKey = seenRef.current.get(node)
      if (prevKey !== undefined && prevKey === marker) {
        // 同一节点、同一内容:通常直接返回。
        // 但 React.StrictMode 开发模式会"挂载→卸载→再挂载"同一节点:
        // 此时 ref 先收到 null、再收到同一个 node,若在这里直接 return,
        // 该节点就永远不会被 observe(内容永久停在 opacity:0)。
        // 所以只在"确实已在观察或已揭示"时才跳过。
        if (node.dataset.revealed === 'true') return
        if (observerRef.current && pendingRef.current.has(node)) return
      }
      if (prevKey !== undefined) {
        // 节点被复用到别的内容上:重置回初始态,让它重新入场
        delete node.dataset.revealed
        node.style.removeProperty('--bm-mo-delay')
        observerRef.current?.unobserve(node)
        pendingRef.current.delete(node)
      }
      seenRef.current.set(node, marker)
      pendingRef.current.set(node, index)
      // 容器 ref 可能还没赋值(React 先调子 ref、后调父 ref):
      // 此时 ensureObserver 会以当前 root(可能为 null=视口)建 observer 并观察该节点。
      const obs = observerRef.current ?? ensureObserver()
      obs?.observe(node)
    },
    [active, ensureObserver]
  )

  /** 切换档位到非激活:遗留的隐藏项立即放出 */
  useEffect(() => {
    if (active) return
    document.querySelectorAll<HTMLElement>('[data-bm-reveal]').forEach((el) => {
      el.dataset.revealed = 'true'
    })
    pendingRef.current.clear()
    observerRef.current?.disconnect()
  }, [active])

  /** 兜底放出:防止因容器异常/未挂 ref 导致内容永久不可见。
   *  除了定时扫描,还在挂载后立刻扫一次 —— 覆盖 StrictMode 双挂载导致
   *  "注册未生效"的情况,保证任何情况下内容都不会被永久藏住。 */
  const sweepUnrevealed = useCallback((): void => {
    if (!active) return
    document.querySelectorAll<HTMLElement>('[data-bm-reveal]').forEach((el) => {
      if (el.dataset.revealed === 'true') return
      const rect = el.getBoundingClientRect()
      // 已在视口内却没被揭示:直接放出
      if (rect.bottom > 0 && rect.top < window.innerHeight + 200 && rect.height > 0) {
        revealNow(el, 0)
      }
    })
  }, [active])

  useEffect(() => {
    if (!active) return
    // 首帧后扫一次(等布局稳定),之后每 1.2s 补扫,直到页面稳定
    const t0 = window.setTimeout(sweepUnrevealed, 900)
    const t1 = window.setTimeout(sweepUnrevealed, 2000)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
    }
  }, [active, sweepUnrevealed])

  useEffect(() => {
    if (!active) return
    safetyRef.current = window.setInterval(() => {
      pendingRef.current.forEach((_, el) => {
        const node = el as HTMLElement
        // 已经进入过视口但没被回调命中的(如零尺寸节点),直接放出
        const rect = node.getBoundingClientRect()
        const inView = rect.top < window.innerHeight + 400 && rect.bottom > -400
        if (inView && node.dataset.revealed !== 'true') {
          revealNow(node, 0)
          pendingRef.current.delete(node)
          observerRef.current?.unobserve(node)
        }
      })
    }, SAFETY_MS)
    return () => {
      if (safetyRef.current != null) window.clearInterval(safetyRef.current)
      safetyRef.current = null
    }
  }, [active])

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      pendingRef.current.clear()
    }
  }, [])

  return useMemo(() => ({ rootRef, register }), [rootRef, register])
}

/** 从 CSS 变量读错开间隔,保证与设置档位一致 */
function staggerMs(): number {  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bm-mo-stagger')
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 36
}

/** 排延迟后揭示。双 rAF 保证初始态先提交一帧,否则 transition 会与首帧合并丢掉 */
function revealNow(el: HTMLElement, delay: number): void {
  if (el.dataset.revealed === 'true') return
  el.style.setProperty('--bm-mo-delay', `${delay}ms`)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.dataset.revealed = 'true'
      window.setTimeout(() => el.style.removeProperty('--bm-mo-delay'), delay + 500)
    })
  })
}

/** 列表项薄包装:用于不便传 ref 的卡片(如 Fluent Card) */
export function RevealItem({
  children,
  index,
  api,
  itemKey,
  style,
  className
}: {
  children: ReactNode
  index: number
  api: RevealApi
  /** 内容标识;变化时会重播入场 */
  itemKey?: string
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      data-bm-reveal=""
      ref={(n) => api.register(n, index, itemKey)}
      className={`bm-reveal ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
