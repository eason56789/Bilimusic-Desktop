/**
 * 轻提示(toast):默认顶部居中滑下 → 停留 → 滑回;位置/样式/时长/图标可在设置里改。
 * 自绘实现(不依赖 Fluent Toaster),因为需要"从屏幕外滑入再滑出"的进出场动画。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
  InfoRegular,
  WarningRegular
} from '@fluentui/react-icons'

export type ToastIntent = 'info' | 'success' | 'error' | 'warning'

/** 外观设置(由设置页写入 store,这里只读) */
export interface ToastPrefs {
  position: 'top-center' | 'bottom-right' | 'top-right' | 'off'
  /** 停留时长倍数 0.5~2 */
  duration: number
  style: 'hud' | 'minimal' | 'solid'
  showIcon: boolean
}

let prefs: ToastPrefs = {
  position: 'top-center',
  duration: 1,
  style: 'hud',
  showIcon: true
}

/** 由 ToastHost 在每次设置变化时调用 */
export function setToastPrefs(p: ToastPrefs): void {
  prefs = { ...prefs, ...p }
}

interface ToastItem {
  id: number
  title: string
  message?: string
  intent: ToastIntent
  /** 停留时长(ms);滑入/滑出动画另计 */
  holdMs: number
  /** 正在滑出(渲染层据此加 class) */
  leaving: boolean
}

/** 滑入/滑出动画时长,与 styles.css 的 .bm-toast 过渡保持一致 */
const ANIM_MS = 240
/** 同时最多显示的条数,超出时挤掉最旧的 */
const MAX_VISIBLE = 3

let seq = 0
let items: ToastItem[] = []
const listeners = new Set<(v: ToastItem[]) => void>()
/** Host 是否已挂载;未挂载时不启动停留计时,避免"刚显示就消失" */
let hostMounted = false
/** 已排队但还没开始计时的 toast id */
const pendingTimers = new Set<number>

function emit(): void {
  const snapshot = items
  listeners.forEach((fn) => fn(snapshot))
}

function remove(id: number): void {
  pendingTimers.delete(id)
  items = items.filter((t) => t.id !== id)
  emit()
}

function dismiss(id: number): void {
  const t = items.find((x) => x.id === id)
  if (!t || t.leaving) return
  items = items.map((x) => (x.id === id ? { ...x, leaving: true } : x))
  emit()
  // 等滑出动画跑完再真正移除,避免元素瞬间消失
  window.setTimeout(() => remove(id), ANIM_MS)
}

function push(
  title: string,
  message: string | undefined,
  intent: ToastIntent,
  baseHoldMs: number
): void {
  // 设置里关掉提示后彻底静默(错误也一起关,由用户显式选择)
  if (prefs.position === 'off') return
  const id = ++seq
  // 时长倍数在推入时结算,之后改设置不影响已显示的这条
  const holdMs = Math.round(baseHoldMs * Math.min(2, Math.max(0.5, prefs.duration)))
  items = [...items, { id, title, message, intent, holdMs, leaving: false }]
  // 超出上限:把最旧的立刻标记滑出(不打断当前这条)
  const visible = items.filter((t) => !t.leaving)
  if (visible.length > MAX_VISIBLE) {
    visible.slice(0, visible.length - MAX_VISIBLE).forEach((t) => dismiss(t.id))
  }
  emit()
  startHold(id, holdMs)
}

/** 开始停留计时;Host 未挂载时先记账,等挂载后统一启动 */
function startHold(id: number, holdMs: number): void {
  if (!hostMounted) {
    pendingTimers.add(id)
    return
  }
  window.setTimeout(() => dismiss(id), holdMs)
}

/** 点击任意提示立即滑出 */
export function dismissAll(): void {
  items.forEach((t) => dismiss(t.id))
}

export function toast(title: string, message?: string): void {
  push(title, message, 'info', 2600)
}

export function toastSuccess(title: string, message?: string): void {
  push(title, message, 'success', 2200)
}

export function toastError(title: string, message?: string): void {
  push(title, message, 'error', 4200)
}

/**
 * 黑白描边图标:不用品牌色区分语义,只靠图形本身(对勾/叉/感叹/信息)。
 * 颜色继承 .bm-toast 的 color,深浅主题都适配。
 */
const ICON_STYLE = { fontSize: 18, flexShrink: 0, opacity: 0.9 } as const

function IntentIcon({ intent }: { intent: ToastIntent }) {
  const style = ICON_STYLE
  if (intent === 'success') return <CheckmarkCircleRegular style={style} />
  if (intent === 'error') return <DismissCircleRegular style={style} />
  if (intent === 'warning') return <WarningRegular style={style} />
  return <InfoRegular style={style} />
}

/** 位置 → 容器 class(动画方向随位置不同,见 styles.css) */
const POS_CLASS: Record<ToastPrefs['position'], string> = {
  'top-center': 'bm-toast-stack--top-center',
  'top-right': 'bm-toast-stack--top-right',
  'bottom-right': 'bm-toast-stack--bottom-right',
  off: 'bm-toast-stack--top-center'
}

/** 挂在 App 根部;自身不占布局(portal 到 body) */
export function ToastHost({ prefs: live }: { prefs?: ToastPrefs }) {
  const [list, setList] = useState<ToastItem[]>(items)

  // 设置变化即时生效(位置/样式/图标);时长只影响之后新推入的提示
  useEffect(() => {
    if (live) setToastPrefs(live)
  }, [live])

  useEffect(() => {
    // 订阅:首次挂载时补齐已存在的提示(早于 Host 挂载的 toast 不会丢)
    const fn = (v: ToastItem[]): void => setList([...v])
    listeners.add(fn)
    hostMounted = true
    setList([...items])
    // 挂载前积压的提示,现在开始计时(已在滑出中的跳过)
    pendingTimers.forEach((id) => {
      const t = items.find((x) => x.id === id)
      if (t && !t.leaving) window.setTimeout(() => dismiss(id), t.holdMs)
    })
    pendingTimers.clear()
    return () => {
      listeners.delete(fn)
      hostMounted = false
    }
  }, [])

  if (list.length === 0) return null

  const effective = live ?? prefs
  if (effective.position === 'off') return null

  return createPortal(
    <div
      className={`bm-toast-stack ${POS_CLASS[effective.position]}`}
      role="status"
      aria-live="polite"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={`bm-toast bm-toast--${effective.style}${t.leaving ? ' bm-toast--leave' : ''}`}
          onClick={() => dismiss(t.id)}
          title="点击关闭"
        >
          {effective.showIcon && <IntentIcon intent={t.intent} />}
          <div className="bm-toast__body">
            <div className="bm-toast__title">{t.title}</div>
            {t.message ? <div className="bm-toast__msg">{t.message}</div> : null}
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}
