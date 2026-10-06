# BiliMusic Desktop

基于 **哔哩哔哩 + 网易云音乐** 双平台音源的第三方桌面音乐播放器(Fluent UI / Electron)。
功能对齐安卓端 BiliMusic,并补充桌面端特性(材质窗口、键盘快捷键、播放队列等)。

> 仅供学习交流,音频资源来自各平台公开接口,请支持正版。

## 功能一览

### 搜索
- 双平台搜索:哔哩哔哩视频 / 网易云(歌曲、歌单、歌手 三个子类)
- B站排序(综合/播放量/收藏/弹幕/最新)、搜索联想、搜索历史(逐行,可单条删除/清空)
- 过滤:超长视频、标题含「循环」、自定义过滤词(`|` 分隔)
- 网易云歌单预览(全屏页):播放全部 / 一键导入为本地歌单;歌手热门歌曲
- 列表行:**双击播放、右键菜单**(立即播放 / 下一首播放 / 添加到歌单 / 下载)

### 播放器
- 全屏播放页:左侧封面+信息,右侧滚动歌词(点击歌词跳转);左上「收起」按钮 / `Esc`
- 歌词:B站 AI 字幕 + 网易云 lrc/yrc 逐字;**KTV 逐字走光**(双层羽化,前奏呼吸倒计时圆点,0.5s 平滑滚动);歌词编辑 / 更换歌词(网易云搜索替换)/ 歌词偏移(±10s,持久化)
- **更换音源**:搜索式选择(哔哩哔哩 / 网易云 / 本地),**仅替换音频流**,封面标题歌词保持不变
- **B站垫底**:网易云 VIP / 无版权歌曲自动切换 B 站搜索最接近时长的视频
- 音质徽章(320k / 无损 FLAC / Hi-Res…)
- 播放模式(列表循环 / 随机 / 单曲循环)、播放队列(查看/跳转/移除/清空)
- 音量记忆(下次启动恢复)、静音后取消静音自动恢复上次音量
- 定时关闭(15/30/45/60/90/120 分钟)、倍速(0.5–2.0x,持久化)、均衡器(10 段 + 8 预设)
- 评论(B站视频 / 网易云歌曲)、歌曲详情、分P 选择与**播放全部分P**(B站多P)、分享链接、下载
- 系统媒体键(SMTC):播放/暂停/上一首/下一首/进度

### 歌单
- 本地歌单:新建/重命名/删除(带确认)、网易云歌单导入、链接导入
- **B站在线视图**:登录后歌单页自动出现「播放记录」与全部收藏夹,点开才拉数据;播放记录 20 条起步、下翻无限加载;可一键「保存为本地」
- **同步**:本地保存的B站收藏夹 / 网易云歌单 / 播放记录歌单支持一键增量同步(手动加入的歌曲不会被同步移除)
- **链接导入歌单**:粘贴网易云 / QQ音乐 / 酷狗音乐分享链接(含 163cn.tv 短链);网易云的可继续同步
- QQ音乐 / 酷狗歌曲只存曲目信息:播放时自动经哔哩哔哩搜索取流,歌词经网易云搜索

### 下载
- 队列并发下载(与最近播放页统一布局)、打开文件/目录、失败重试、清除记录

### 外观
- **窗口材质**:亚克力(Acrylic)/ 云母(Mica)/ 不透明,界面不透明度 **0–100%** 可调
- 深色 / 浅色 / 跟随系统,7 种主题色
- 页面切换动画(淡入 / 滑动 / 缩放 / 关闭)、按钮按压反馈

### 快捷键
| 按键 | 功能 |
|---|---|
| `Space` | 播放 / 暂停 |
| `←` / `→` | 快退 / 快进 5s(`Ctrl+←/→` 上一首/下一首) |
| `↑` / `↓` | 音量 ±5% |
| `M` | 静音 |
| `L` / `F` | 打开/收起全屏播放页 |
| `Esc` | 收起全屏播放页 |
| `Tab` 聚焦进度/音量条后 `←` / `→` | 微调进度或音量(Home/End 到两端) |

### 设置
- **备份与恢复**:一键导出 zip(歌单+设置+已下载歌曲),恢复时自动回滚失败操作并重启生效
- **恢复出厂设置**:清空歌单/记录/登录态,已下载的歌曲文件保留
- 侧边栏「设置」入口固定显示,任何自定义开关都不会把它藏掉

### 关于
- 设置页可直接跳转 GitHub 项目与作者的 B 站主页

## 开发

```bash
npm install          # 如 electron/esbuild 安装脚本被 npm 11 拦截:
                     #   npm install-scripts approve electron esbuild && npm rebuild electron esbuild
npm run dev          # 开发模式(热重载)
npm run build        # 构建产物(out/)
npm run typecheck    # 类型检查
npm start            # 运行已构建产物
npm run dist         # 构建 + electron-builder 打包 Windows 安装包(release/)

# 测试(纯函数单测 + 真实接口集成测)
npx esbuild tests/unit.test.ts --bundle --platform=node --alias:@shared=./src/shared --outfile=tests/.out/unit.test.js && node tests/.out/unit.test.js
npx esbuild tests/integration.test.ts --bundle --platform=node --alias:@shared=./src/shared --outfile=tests/.out/integration.test.js && node tests/.out/integration.test.js [QQ歌单id] [酷狗歌单id]
```

- 技术栈:Electron 38 + electron-vite + React 18 + TypeScript + Fluent UI v9
- 网易云加密(weapi/eapi)、B站 WBI 签名均从安卓端 Kotlin 源码移植
- 数据(JSON 库、登录态、设置)存于 `%APPDATA%/BiliMusic/library.json`(登录态 cookie 经系统密钥环加密后落盘)
- 播放缓存为应用数据目录下 `bmedia://` 协议本地服务;下载默认保存到 `音乐/BiliMusic`

## 打包说明

`package.json` 已含 electron-builder 配置(NSIS 安装包,可自定义安装目录,创建桌面快捷方式)。
`npm run dist` 产物输出至 `release/BiliMusic-1.0.0-setup.exe`。
