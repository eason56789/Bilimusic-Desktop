/** Electron 主进程入口 */
import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { initStore, getStore, saveStore } from './store'
import { initAudio, registerAudioProtocol } from './audio'
import { registerIpc } from './ipc'
import { finalizeStaleDownloads } from './downloads'
import { setBiliCookie } from './api/bilibili'
import { setNeteaseCookies, onNeteaseCookieChange } from './api/netease'
import { setNeteaseCookieStore } from './store'

let mainWindow: BrowserWindow | null = null

// 单实例:重复启动时聚焦已有窗口,避免双实例读写同一份 library.json
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function applyTheme(): void {
  const theme = getStore().settings.theme
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
}

function createWindow(): void {
  const { width: sw, height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize
  const effect = getStore().settings.windowEffect ?? 'acrylic'
  const material =
    process.platform === 'win32'
      ? effect === 'none'
        ? 'none'
        : effect === 'mica'
          ? 'mica'
          : 'acrylic'
      : 'none'
  mainWindow = new BrowserWindow({
    width: Math.min(1280, Math.round(sw * 0.92)),
    height: Math.min(860, Math.round(sh * 0.92)),
    minWidth: 960,
    minHeight: 640,
    show: false,
    // 应用图标(dev 下 electron.exe 是默认图标,靠此指定;打包后以 exe 图标为准)
    icon: join(__dirname, '../../build/icon.ico'),
    // 材质开启时背景透明,让 Mica/Acrylic 透出
    backgroundColor: effect === 'none' ? '#202020' : '#00000000',
    ...(process.platform === 'win32' && effect !== 'none'
      ? { backgroundMaterial: material as 'mica' | 'acrylic' | 'none' }
      : {}),
    ...(process.platform === 'darwin' && effect !== 'none'
      ? { vibrancy: 'fullscreen-ui' as const, visualEffectState: 'active' as const }
      : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1b1b1b',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 外部链接用系统浏览器打开(仅允许 http/https,防 file:// 等危险协议)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 禁止主窗口导航到远程页面(仅允许本地文件与开发服务器)
  const devUrl = process.env.ELECTRON_RENDERER_URL
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  initStore()
  applyTheme()
  initAudio()
  registerAudioProtocol()

  // 注入登录态
  const store = getStore()
  setBiliCookie(store.biliCookie)
  setNeteaseCookies(store.neteaseCookies)
  onNeteaseCookieChange((c) => {
    setNeteaseCookieStore(c)
  })

  finalizeStaleDownloads()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  saveStore()
})

nativeTheme.on('updated', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.setTitleBarOverlay({
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1b1b1b'
    })
  }
})
