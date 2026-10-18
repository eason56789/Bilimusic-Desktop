/** 悬浮歌词窗:独立置顶小窗,状态由主窗口渲染层推送,控制指令回传主窗口
 *
 * 交互约定(对齐 QQ 音乐):
 *  - 未悬停:只有歌词本身(无背景框/边框/阴影)
 *  - 悬停:淡入深色玻璃底 + 顶部操作条
 *  - 边缘/四角可拖拽缩放(无边框窗口的 drag 区会吃掉系统缩放,故自绘手柄)
 *  - 歌词过长时自动加宽窗口,短句时回到用户设定的基准宽度
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { getStore, saveStore } from './store'
import type { FloatLyricState } from '@shared/types'

export interface FloatBounds {
  x: number
  y: number
  width: number
  height: number
}

let floatWin: BrowserWindow | null = null
let menuWin: BrowserWindow | null = null
/** 主窗口访问器(由 index.ts 注入,避免循环依赖) */
let getMainWindow: (() => BrowserWindow | null) | null = null
/** 主窗口最后推送的状态:悬浮窗晚开时补发一次,避免白屏等状态 */
let lastState: FloatLyricState | null = null
let boundsTimer: ReturnType<typeof setTimeout> | null = null
/** 用户设定的基准位置/尺寸(自动加宽只在此之上的临时态,不落盘) */
let baseBounds: FloatBounds | null = null

const MIN_W = 320
const MIN_H = 96

export function initFloat(getMain: () => BrowserWindow | null): void {
  getMainWindow = getMain
}

export function getFloatWindow(): BrowserWindow | null {
  return floatWin
}

/** QQ 音乐式默认布局:屏幕下方居中、宽条 */
export function defaultFloatBounds(): FloatBounds {
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(920, Math.max(MIN_W, Math.round(area.width * 0.52)))
  const height = 150
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round(area.height * 0.76),
    width,
    height
  }
}

/** 把坐标夹到当前显示器工作区内(显示器数量/分辨率变化后防跑到屏外) */
function clampBounds(b: FloatBounds): FloatBounds {
  const displays = screen.getAllDisplays()
  const area =
    displays.find((d) => {
      const a = d.workArea
      return b.x >= a.x - b.width / 2 && b.x <= a.x + a.width && b.y >= a.y - b.height / 2 && b.y <= a.y + a.height
    })?.workArea ?? displays[0].workArea
  const width = Math.max(MIN_W, Math.min(b.width, area.width))
  const height = Math.max(MIN_H, Math.min(b.height, area.height))
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

/** 光标所在显示器的工作区 */
function workAreaAt(x: number, y: number): { x: number; y: number; width: number; height: number } {
  return screen.getDisplayNearestPoint({ x, y }).workArea
}

export function createFloatWindow(): BrowserWindow | null {
  if (floatWin && !floatWin.isDestroyed()) {
    floatWin.show()
    return floatWin
  }
  const saved = getStore().settings.floatLyricBounds
  baseBounds = clampBounds(saved ? { ...saved } : defaultFloatBounds())
  const win = new BrowserWindow({
    ...baseBounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'BiliMusic 悬浮歌词',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  // 独立小窗不出现在系统任务栏
  win.setMenuBarVisibility?.(false)

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(`${devUrl}#float`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '#float' })
  }

  win.once('ready-to-show', () => win.show())
  // 悬停轮询:悬停区是拖动区,渲染层收不到 mousemove,只能由主进程判断光标是否在窗口内
  startHoverWatch(win)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void import('electron').then(({ shell }) => shell.openExternal(url))
    return { action: 'deny' }
  })
  // 禁止导航到远程页面(与主窗口一致)
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) e.preventDefault()
  })

  // 位置记忆:用户拖动只改基准坐标(宽度/高度由缩放手柄显式写回)
  win.on('moved', () => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || !baseBounds) return
      const bb = win.getBounds()
      baseBounds = { ...baseBounds, x: bb.x, y: bb.y }
      persistBounds()
    }, 500)
  })

  win.on('closed', () => {
    stopHoverWatch()
    closeFloatMenu()
    floatWin = null
  })

  floatWin = win
  // 上次处于锁定态:创建时立即恢复鼠标穿透(否则要等下一次切换才生效)
  if (getStore().settings.floatLyricLocked) setFloatLocked(true)
  // 晚开时补发最近状态
  if (lastState) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('float:state', lastState)
    })
  }
  return win
}

function persistBounds(): void {
  if (!baseBounds) return
  getStore().settings.floatLyricBounds = { ...baseBounds }
  saveStore()
}

export function destroyFloatWindow(): void {
  closeFloatMenu()
  if (floatWin && !floatWin.isDestroyed()) floatWin.close()
  floatWin = null
  baseBounds = null
}

export function showFloat(show: boolean): boolean {
  try {
    if (show) createFloatWindow()
    else destroyFloatWindow()
    return true
  } catch (e) {
    console.error('[Float] show failed', e)
    return false
  }
}

/** 主窗口渲染层 → 悬浮窗:转发播放状态 */
export function forwardFloatState(state: FloatLyricState): void {
  lastState = state
  if (floatWin && !floatWin.isDestroyed()) {
    floatWin.webContents.send('float:state', state)
  }
}

/** 悬浮窗 → 主窗口渲染层:转发控制指令 */
export function forwardFloatControl(cmd: string): void {
  const main = getMainWindow?.()
  if (main && !main.isDestroyed()) {
    main.webContents.send('float:control', cmd)
  }
}

export function getFloatBounds(): FloatBounds | null {
  if (!floatWin || floatWin.isDestroyed()) return null
  return floatWin.getBounds()
}

/** 用户拖动缩放后的基准尺寸(落盘,并立即应用) */
export function applyUserBounds(b: FloatBounds): void {
  if (!floatWin || floatWin.isDestroyed()) return
  const next = clampBounds(b)
  baseBounds = next
  floatWin.setBounds(next)
  persistBounds()
}

/**
 * 歌词过长时临时加宽窗口:needed=null 表示当前句已放得下,回到基准宽度。
 * 临时宽度不写盘,基准尺寸始终以用户设定为准。
 */
export function fitFloatWidth(needed: number | null): void {
  if (!floatWin || floatWin.isDestroyed() || !baseBounds) return
  const area = workAreaAt(baseBounds.x, baseBounds.y)
  const target =
    needed == null
      ? baseBounds.width
      : Math.max(baseBounds.width, Math.min(Math.round(needed), area.width))
  const cur = floatWin.getBounds()
  if (target === cur.width) return
  // 左边缘锚定向右扩展:歌词变长时不左右跳动;右边放不下再整体左移
  let x = cur.x
  if (x + target > area.x + area.width) x = Math.max(area.x, area.x + area.width - target)
  floatWin.setBounds({ x: Math.round(x), y: cur.y, width: target, height: cur.height })
}

/** 恢复默认位置与尺寸(QQ 音乐式底部居中) */
export function resetFloatBounds(): void {
  if (!floatWin || floatWin.isDestroyed()) return
  const b = clampBounds(defaultFloatBounds())
  baseBounds = b
  floatWin.setBounds(b)
  persistBounds()
}

/**
 * 悬停检测:
 * 悬浮窗整体是拖动区(-webkit-app-region: drag),Windows 下这种区域收不到 mousemove,
 * 渲染层无法自己判断"鼠标移入"。改由主进程轮询光标是否落在窗口矩形内,
 * 只在状态翻转时推送,渲染层据此显示/隐藏控制条。
 */
let hoverTimer: ReturnType<typeof setInterval> | null = null
let lastHover = false

function startHoverWatch(win: BrowserWindow): void {
  stopHoverWatch()
  hoverTimer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopHoverWatch()
      return
    }
    if (!win.isVisible()) return
    const b = win.getBounds()
    const p = screen.getCursorScreenPoint()
    const inside =
      (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) ||
      // 设置菜单打开时保持底框可见,否则鼠标移到菜单上底框会闪掉
      (!!menuWin && !menuWin.isDestroyed() && menuWin.isVisible())
    if (inside !== lastHover) {
      lastHover = inside
      if (!win.isDestroyed()) win.webContents.send('float:hover', inside)
    }
  }, 120)
}

function stopHoverWatch(): void {
  if (hoverTimer) clearInterval(hoverTimer)
  hoverTimer = null
  lastHover = false
}

/**
 * 锁定/解锁悬浮窗:
 * 锁定后窗口鼠标穿透(forward=true 仍转发移动事件,便于悬停显示解锁提示),
 * 避免置顶小窗挡住桌面其它操作;解除入口在主窗口「更多 → 悬浮歌词窗」。
 */
export function setFloatLocked(locked: boolean): boolean {
  if (!floatWin || floatWin.isDestroyed()) return false
  try {
    floatWin.setIgnoreMouseEvents(locked, { forward: true })
    return true
  } catch (e) {
    console.warn('[Float] set locked failed', e)
    return false
  }
}

/** 从悬浮窗唤起主窗口 */
export function openMainWindow(): void {
  const main = getMainWindow?.()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

/** ===== 悬浮窗设置菜单(独立小窗,样式对齐音乐播放器歌词设置面板) ===== */

const MENU_W = 300
const MENU_H = 352

export function openFloatMenu(): void {
  // 再次点击设置按钮 = 收起(避免 blur 自动关闭在部分环境下失效/误触)
  if (menuWin && !menuWin.isDestroyed()) {
    closeFloatMenu()
    return
  }
  if (!floatWin || floatWin.isDestroyed()) return
  const fb = floatWin.getBounds()
  const area = workAreaAt(fb.x, fb.y)
  // 优先放在悬浮窗左侧,空间不足则放右侧
  let x = fb.x - MENU_W - 8
  if (x < area.x + 8) x = Math.min(fb.x + fb.width + 8, area.x + area.width - MENU_W - 8)
  let y = fb.y + fb.height - MENU_H
  y = Math.min(Math.max(y, area.y + 8), area.y + area.height - MENU_H - 8)

  const devUrl = process.env.ELECTRON_RENDERER_URL
  const win = new BrowserWindow({
    x: Math.round(x),
    y: Math.round(y),
    width: MENU_W,
    height: MENU_H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '悬浮歌词设置',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  if (devUrl) void win.loadURL(`${devUrl}#floatmenu`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '#floatmenu' })
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  // 不靠 blur 收起:透明置顶窗在部分环境下 show 后立刻失焦,会把菜单瞬间关掉。
  // 改为光标离开「悬浮窗 ∪ 菜单」一段时间后自动收起;刚打开的 1.5s 内不判离开,
  // 避免从设置按钮移到菜单途中经过窗口缝隙被误关。
  const openedAt = Date.now()
  let awaySince = 0
  const watch = setInterval(() => {
    if (!menuWin || menuWin.isDestroyed()) {
      clearInterval(watch)
      return
    }
    if (Date.now() - openedAt < 1500) return
    const p = screen.getCursorScreenPoint()
    const inRect = (r: Electron.Rectangle): boolean =>
      p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
    const over =
      inRect(win.getBounds()) ||
      (floatWin && !floatWin.isDestroyed() && inRect(floatWin.getBounds()))
    if (over) {
      awaySince = 0
      return
    }
    if (!awaySince) awaySince = Date.now()
    else if (Date.now() - awaySince > 1200) closeFloatMenu()
  }, 250)
  win.on('closed', () => {
    clearInterval(watch)
    if (menuWin === win) menuWin = null
  })
  menuWin = win
}

export function closeFloatMenu(): void {
  if (menuWin && !menuWin.isDestroyed()) menuWin.close()
  menuWin = null
}

/** 菜单窗口 → 主窗口:转发设置变更(主窗口统一落盘并回推状态) */
export function forwardMenuSetting(key: string, value: unknown): void {
  const main = getMainWindow?.()
  if (main && !main.isDestroyed()) main.webContents.send('float:menuSet', { key, value })
}

/** 设置落盘后把最新值推回菜单窗(菜单不重新打开也能立刻反映) */
export function notifyFloatMenuState(): void {
  if (!menuWin || menuWin.isDestroyed()) return
  menuWin.webContents.send('float:menuState', getFloatMenuState())
}

/** 菜单读取当前设置(直接取存档 + 最近一次推送的曲目名) */
export function getFloatMenuState(): {
  fontScale: number
  showTrans: boolean
  showNextLine: boolean
  locked: boolean
  title: string
} {
  const s = getStore().settings
  return {
    fontScale: s.floatFontScale ?? 1,
    showTrans: s.floatShowTrans !== false,
    showNextLine: s.floatShowNextLine !== false,
    locked: !!s.floatLyricLocked,
    title: lastState?.title ?? ''
  }
}
