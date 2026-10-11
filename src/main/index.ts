/** Electron 主进程入口 */
import { app, BrowserWindow, shell, nativeTheme, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { initStore, getStore, saveStore, setSetting } from './store'
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

// 关闭窗口行为状态:isQuitting=退出流程中(跳过询问)
let isQuitting = false
let tray: Tray | null = null

// 单实例:重复启动时聚焦已有窗口,避免双实例读写同一份 library.json
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

function applyTheme(): void {
  const theme = getStore().settings.theme
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
}

/** 后台运行:隐藏窗口(首次时创建托盘图标),音乐随隐藏的渲染层继续播放 */
function hideToBackground(): void {
  ensureTray()
  mainWindow?.hide()
}

function ensureTray(): void {
  if (tray) return
  let img = nativeImage.createEmpty()
  try {
    // fs 对 asar 透明,readFileSync+createFromBuffer 保证打包后(资源在 asar 内)也能读到图标
    img = nativeImage.createFromBuffer(readFileSync(join(app.getAppPath(), 'build/icon.png')))
  } catch {
    /* 图标读取失败用空图标兜底,托盘仍需创建以便唤回窗口 */
  }
  try {
    tray = new Tray(img)
  } catch (e) {
    console.error('[Tray] create failed; 后台窗口只能靠重新启动唤回', e)
    tray = null
    return
  }
  tray.setToolTip('BiliMusic 正在后台运行')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', showMainWindow)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  // 隐藏到后台时 focus 拉不回来,必须显式 show
  mainWindow.show()
  mainWindow.focus()
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

  // 关闭拦截:按设置直接退出/隐藏到托盘/弹窗询问(默认)。
  // close 事件覆盖标题栏 X、Alt+F4、任务栏关闭等所有关闭路径。
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    const behavior = getStore().settings.closeBehavior ?? 'ask'
    if (behavior === 'quit') return
    e.preventDefault()
    if (behavior === 'tray') {
      hideToBackground()
      return
    }
    // ask:交给渲染层弹窗。每次触发都重发(渲染层弹窗已开时重复 setOpen 无副作用),
    // 保证渲染层某次未收到时,下一次点击仍能弹出,不会永久吞掉关闭。
    mainWindow?.webContents.send('window:closeAsk')
  })

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
  // 关闭询问的用户决定(与询问/托盘逻辑同在 index.ts,避免与 ipc.ts 循环引用)
  ipcMain.handle('window:closeDecide', (_e, action: unknown) => {
    if (action === 'tray') hideToBackground()
    else if (action === 'quit') app.quit()
    // cancel:窗口保持打开
    return true
  })
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
  isQuitting = true
  saveStore()
})

nativeTheme.on('updated', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.setTitleBarOverlay({
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1b1b1b'
    })
  }
})
