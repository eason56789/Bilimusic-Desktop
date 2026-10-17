import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// Material 3 字体与图标:Roboto(字阶)+ Material Symbols Rounded(图标连字)
// 本地打包而非 CDN —— 渲染进程 CSP 为 font-src 'self' data:,不允许外部字体源
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import 'material-symbols/rounded.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
