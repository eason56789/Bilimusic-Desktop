/** Electron 主进程入口 */
import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { initStore, getStore, saveStore } from './store'
import { initAudio, registerAudioProtocol } from './audio'
import { registerIpc } from './ipc'
import { finalizeStaleDownloads } from './downloads'
import { initFloat, showFloat, destroyFloatWindow } from './float'
import { setBiliCookie } from './api/bilibili'
import { setNeteaseCookies, onNeteaseCookieChange } from './api/netease'
import { setNeteaseCookieStore } from './store'

// 防御:从 ZCode 等 Electron 宿主内启动时会继承宿主的 CHROME_CRASHPAD_PIPE_NAME,
// 渲染进程会去连宿主的崩溃服务管道并卡死(表现为导航永不完成/窗口永不显示)。
// 启动即清除,让本应用的 crashpad 自建管道。
delete process.env.CHROME_CRASHPAD_PIPE_NAME

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
    // 主窗口关闭即退出(悬浮窗随之销毁),避免后台留一个无主小窗
    destroyFloatWindow()
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
  initFloat(() => mainWindow)
  registerIpc()
  createWindow()

  // 记住上次的悬浮歌词窗状态
  if (getStore().settings.floatLyric) showFloat(true)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((e) => {
  // 启动链失败不允许静默(此前无 catch,出错表现为无窗口无日志)
  console.error('[boot] whenReady FAILED:', e)
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
