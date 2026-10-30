/**
 * 快捷方式伪装:在桌面生成一个图标/名称看起来像别的程序的快捷方式,双击后启动本应用。
 * 图标优先从本机已安装的同名程序里取(最像),没装则按品牌色绘制一个。
 */
import { app, nativeImage } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execFileAsync = promisify(execFile)

export interface DisguisePreset {
  id: string
  /** 快捷方式名称 / 显示名 */
  name: string
  /** 内置官方图标文件名(resources/disguise/*.png,随安装包分发) */
  bundledIcon: string
  /** 可能的安装路径:找到就用它 exe 里的真实图标(比内置的更新) */
  exeCandidates: string[]
  /** 描述(资源管理器悬停提示) */
  description: string
}

const PF = process.env['ProgramFiles'] ?? 'C:\\Program Files'
const PF86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
const LOCAL = process.env['LOCALAPPDATA'] ?? ''

export const PRESETS: DisguisePreset[] = [
  {
    id: 'wechat',
    name: '微信',
    bundledIcon: 'wechat.png',
    exeCandidates: [
      join(PF, 'Tencent', 'Weixin', 'Weixin.exe'),
      join(PF, 'Tencent', 'WeChat', 'WeChat.exe'),
      join(PF86, 'Tencent', 'WeChat', 'WeChat.exe')
    ],
    description: '微信'
  },
  {
    id: 'qq',
    name: 'QQ',
    bundledIcon: 'qq.png',
    exeCandidates: [
      join(PF, 'Tencent', 'QQNT', 'QQ.exe'),
      join(PF86, 'Tencent', 'QQNT', 'QQ.exe'),
      join(PF86, 'Tencent', 'QQ', 'Bin', 'QQ.exe')
    ],
    description: 'QQ'
  },
  {
    id: 'seewo',
    name: '希沃白板',
    bundledIcon: 'seewo.png',
    exeCandidates: [
      join(PF86, 'Seewo', 'EasiNote5', 'EasiNote.exe'),
      join(PF, 'Seewo', 'EasiNote5', 'EasiNote.exe'),
      join(LOCAL, 'Seewo', 'EasiNote5', 'EasiNote.exe')
    ],
    description: '希沃白板 5'
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    bundledIcon: 'dingtalk.png',
    exeCandidates: [
      join(LOCAL, 'DingTalk', 'main', 'current', 'DingTalk.exe'),
      join(PF86, 'DingDing', 'main', 'current', 'DingTalk.exe')
    ],
    description: '钉钉'
  },
  {
    id: 'chaoxing',
    name: '学习通',
    bundledIcon: 'chaoxing.png',
    exeCandidates: [
      join(PF86, 'Chaoxing', 'StudyX', 'StudyX.exe'),
      join(LOCAL, 'Chaoxing', 'StudyX', 'StudyX.exe')
    ],
    description: '超星学习通'
  },
  {
    id: 'netease',
    name: '网易云音乐',
    bundledIcon: 'netease.png',
    exeCandidates: [
      join(LOCAL, 'Programs', 'Netease', 'cloudmusic', 'cloudmusic.exe'),
      join(PF86, 'Netease', 'cloudmusic', 'cloudmusic.exe')
    ],
    description: '网易云音乐'
  },
  {
    id: 'kugou',
    name: '酷狗音乐',
    bundledIcon: 'kugou.png',
    exeCandidates: [
      join(PF86, 'Kugou', 'KGMusic', 'KuGou.exe'),
      join(LOCAL, 'Programs', 'Kugou', 'KGMusic', 'KuGou.exe')
    ],
    description: '酷狗音乐'
  }
]

export function getPreset(id: string | undefined | null): DisguisePreset | null {
  if (!id) return null
  return PRESETS.find((p) => p.id === id) ?? null
}

function iconDir(): string {
  const dir = join(app.getPath('userData'), 'disguise')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 生成并执行 .ps1。
 * 参数直接以字面量写进脚本正文,不经过命令行:中文/空格路径在 -File 参数里
 * 会因系统 ANSI 码页来回转码而偶发失败(实测"网易云音乐.lnk"就崩过)。
 * 脚本本身带 BOM,PowerShell 5.1 才会按 UTF-8 解析中文。
 */
async function runPs1(name: string, body: string, vars: Record<string, string>): Promise<void> {
  const dir = join(tmpdir(), 'bm-disguise')
  mkdirSync(dir, { recursive: true })
  // 文件名必须唯一:同时生成多个预设时,同名脚本会被另一路调用的 finally 删掉
  const file = join(
    dir,
    `${name}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`
  )
  const prelude = Object.entries(vars)
    .map(([k, v]) => `$${k} = '${v.replace(/'/g, "''")}'`)
    .join('\n')
  writeFileSync(file, '\uFEFF' + prelude + '\n' + body, 'utf8')
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, timeout: 30000 }
    )
  } finally {
    try {
      rmSync(file, { force: true })
    } catch {
      /* 临时脚本删不掉不影响结果 */
    }
  }
}

/** 从 exe 资源里取 256px 图标另存为 PNG(类型名必须全限定,否则 Add-Type 编译报"未找到 Icon") */
const EXTRACT_PS = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class BmIconFetch {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, uint[] ids, uint count, uint flags);
  [DllImport("user32.dll")]
  static extern bool DestroyIcon(IntPtr h);
  public static bool Save(string path, int size, string outPath) {
    IntPtr[] h = new IntPtr[1];
    uint[] ids = new uint[1];
    uint n = PrivateExtractIcons(path, 0, size, size, h, ids, 1, 0);
    if (n == 0 || h[0] == IntPtr.Zero) return false;
    using (System.Drawing.Icon ico = System.Drawing.Icon.FromHandle(h[0])) {
      using (System.Drawing.Bitmap bmp = ico.ToBitmap()) {
        bmp.Save(outPath, System.Drawing.Imaging.ImageFormat.Png);
      }
    }
    DestroyIcon(h[0]);
    return true;
  }
}
'@
if ([BmIconFetch]::Save($Exe, 256, $Out)) { exit 0 }
if ([BmIconFetch]::Save($Exe, 128, $Out)) { exit 0 }
$ico = [System.Drawing.Icon]::ExtractAssociatedIcon($Exe)
if ($ico -eq $null) { exit 2 }
$bmp = $ico.ToBitmap()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$ico.Dispose()
`

/** 没装对应程序时:品牌色圆角方块 + 一个字 */
const DRAW_PS = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Color))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 58
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
$path.AddArc(0, $size - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)
$font = New-Object System.Drawing.Font('Microsoft YaHei', 118, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString($Text, $font, $white, $rect, $fmt)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`

const SHORTCUT_PS = `$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Lnk)
$sc.TargetPath = $Target
if ($ExtraArgs -ne '') { $sc.Arguments = $ExtraArgs }
if ($Icon -ne '') { $sc.IconLocation = $Icon }
if ($WorkDir -ne '') { $sc.WorkingDirectory = $WorkDir }
if ($Desc -ne '') { $sc.Description = $Desc }
$sc.Save()
`

/** PNG → ICO(PNG 压缩单条目;宽高写 0 表示 256) */
function pngToIco(png: Buffer): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0)
  entry.writeUInt8(0, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

/**
 * 内置官方图标路径。
 * 打包后:resources/disguise(extraResources 落在 process.resourcesPath)
 * 开发态:app.getAppPath() 是 out/main,要往上两级才回到项目根
 */
function bundledIconPath(file: string): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    join(process.resourcesPath ?? '', 'disguise', file),
    join(appPath, 'resources', 'disguise', file),
    join(appPath, '..', 'resources', 'disguise', file),
    join(appPath, '..', '..', 'resources', 'disguise', file)
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

/** 生成(或复用)某个预设的图标文件,返回 ICO 路径 */
export async function ensureIcon(presetId: string): Promise<{
  preset: DisguisePreset
  icoPath: string
  source: 'exe' | 'bundled' | 'drawn'
}> {
  const preset = getPreset(presetId)
  if (!preset) throw new Error(`未知的伪装目标:${presetId}`)
  const dir = iconDir()
  const pngPath = join(dir, `${preset.id}.png`)
  const icoPath = join(dir, `${preset.id}.ico`)
  const markPath = join(dir, `${preset.id}.src`)

  // 已生成过就直接复用(标记文件记录来源,便于设置页显示"真实图标")
  if (existsSync(pngPath) && existsSync(icoPath) && existsSync(markPath)) {
    const src = (readFileSync(markPath, 'utf8').trim() || 'bundled') as 'exe' | 'bundled' | 'drawn'
    return { preset, icoPath, source: src }
  }

  let source: 'exe' | 'bundled' | 'drawn' = 'drawn'

  // 1) 本机装了该程序:用 exe 里的图标(版本最新,最像)
  const realExe = preset.exeCandidates.find((p) => p && existsSync(p))
  if (realExe) {
    try {
      await runPs1('extract-icon', EXTRACT_PS, { Exe: realExe, Out: pngPath })
      if (existsSync(pngPath)) source = 'exe'
    } catch (e) {
      console.warn('[Disguise] 提取 exe 图标失败:', preset.id, e)
    }
  }

  // 2) 没装:用随包分发的官方图标
  if (source !== 'exe') {
    const bundled = bundledIconPath(preset.bundledIcon)
    if (bundled) {
      copyFileSync(bundled, pngPath)
      source = 'bundled'
    }
  }

  // 3) 两者都没有(理论上不会发生):画一个占位
  if (source === 'drawn' || !existsSync(pngPath)) {
    await runPs1('draw-icon', DRAW_PS, {
      Out: pngPath,
      Color: '#5b6b7c',
      Text: preset.name.slice(0, 1)
    })
    source = 'drawn'
  }

  writeFileSync(icoPath, pngToIco(readFileSync(pngPath)))
  writeFileSync(markPath, source)
  return { preset, icoPath, source }
}

/** 预设图标的 data URL(设置页预览用) */
export async function iconDataUrl(presetId: string): Promise<string> {
  try {
    const { icoPath } = await ensureIcon(presetId)
    return nativeImage.createFromPath(icoPath).toDataURL()
  } catch {
    return ''
  }
}
/**
 * 在桌面创建快捷方式。
 * 目标始终是本应用 exe:双击后启动的还是 BiliMusic,只是外观像所选程序。
 */
export async function createShortcut(
  presetId: string,
  customName?: string
): Promise<{ path: string; name: string }> {
  const { preset, icoPath } = await ensureIcon(presetId)
  const name = (customName ?? '').trim() || preset.name
  const safe = name.replace(/[\\/:*?"<>|]/g, '').trim() || '快捷方式'
  const lnk = join(app.getPath('desktop'), `${safe}.lnk`)
  // 开发态 process.execPath 是 electron.exe,必须把应用目录作为首个参数,否则双击只起一个空 Electron
  const args = app.isPackaged ? '' : `"${app.getAppPath()}"`
  const workDir = app.isPackaged ? join(app.getAppPath(), '..') : app.getAppPath()
  await runPs1('make-lnk', SHORTCUT_PS, {
    Lnk: lnk,
    Target: process.execPath,
    ExtraArgs: args,
    Icon: icoPath,
    WorkDir: workDir,
    Desc: preset.description
  })
  if (!existsSync(lnk)) throw new Error('快捷方式创建失败(可能被杀毒软件拦截)')
  return { path: lnk, name: safe }
}
