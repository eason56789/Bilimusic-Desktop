/** 悬浮歌词窗:独立置顶小窗,状态由主窗口渲染层推送,控制指令回传主窗口 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { getStore, saveStore } from './store'
import type { FloatLyricState } from '@shared/types'

let floatWin: BrowserWindow | null = null
/** 主窗口访问器(由 index.ts 注入,避免循环依赖) */
let getMainWindow: (() => BrowserWindow | null) | null = null
/** 主窗口最后推送的状态:悬浮窗晚开时补发一次,避免白屏等状态 */
let lastState: FloatLyricState | null = null
let boundsTimer: ReturnType<typeof setTimeout> | null = null

export function initFloat(getMain: () => BrowserWindow | null): void {
  getMainWindow = getMain
}

export function getFloatWindow(): BrowserWindow | null {
  return floatWin
}

/** 把存档坐标夹到当前显示器工作区内(显示器数量/分辨率变化后防跑到屏外) */
function clampBounds(b: {
  x: number
  y: number
  width: number
  height: number
}): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays()
  const area = displays.find((d) => {
    const a = d.workArea
    return b.x >= a.x - b.width / 2 && b.x <= a.x + a.width && b.y >= a.y - b.height / 2 && b.y <= a.y + a.height
  })?.workArea ?? displays[0].workArea
  const width = Math.max(320, Math.min(b.width, area.width))
  const height = Math.max(96, Math.min(b.height, area.height))
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

export function createFloatWindow(): BrowserWindow | null {
  if (floatWin && !floatWin.isDestroyed()) {
    floatWin.show()
    return floatWin
  }
  const saved = getStore().settings.floatLyricBounds
  const area = screen.getPrimaryDisplay().workArea
  const fallback = {
    x: area.x + area.width - 480,
    y: area.y + area.height - 220,
    width: 460,
    height: 132
  }
  const b = clampBounds(saved ?? fallback)
  const win = new BrowserWindow({
    ...b,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void import('electron').then(({ shell }) => shell.openExternal(url))
    return { action: 'deny' }
  })
  // 禁止导航到远程页面(与主窗口一致)
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) e.preventDefault()
  })

  // 位置/尺寸记忆(防抖落盘)
  const saveBounds = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return
      const bb = win.getBounds()
      getStore().settings.floatLyricBounds = bb
      saveStore()
    }, 800)
  }
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)

  win.on('closed', () => {
    floatWin = null
  })

  floatWin = win
  // 晚开时补发最近状态
  if (lastState) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('float:state', lastState)
    })
  }
  return win
}

export function destroyFloatWindow(): void {
  if (floatWin && !floatWin.isDestroyed()) floatWin.close()
  floatWin = null
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

/** 从悬浮窗唤起主窗口 */
export function openMainWindow(): void {
  const main = getMainWindow?.()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}
