# 从源图生成多尺寸 Windows 图标 build/icon.ico(PNG-in-ICO)与 256 版 build/icon.png
# 注意:本文件为 UTF-8 无 BOM,Windows PowerShell 按 GBK 解析,路径参数必须用 ASCII
param(
  [string]$Src = 'src\renderer\src\assets\brand.png',
  [string]$OutDir = 'build'
)
Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $Src)) { throw "SOURCE NOT FOUND: $Src" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$srcImg = [System.Drawing.Image]::FromFile($Src)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBlobs = @()

foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($srcImg, 0, 0, $s, $s)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBlobs += ,@($s, $ms.ToArray())
  $bmp.Dispose()

  # 256 版另存为 icon.png(electron-builder 备用)
  if ($s -eq 256) {
    $png256 = $ms.ToArray()
  }
}
$srcImg.Dispose()

[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.png'), $png256)

# 组 ICO 头:ICONDIR + ICONDIRENTRY[] + 数据
$entries = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $entries
$writer.Write([uint16]0)              # reserved
$writer.Write([uint16]1)              # type: icon
$writer.Write([uint16]$sizes.Count)   # count
$offset = 6 + (16 * $sizes.Count)
foreach ($entry in $pngBlobs) {
  $s = $entry[0]
  $data = $entry[1]
  $byteDim = if ($s -ge 256) { [byte]0 } else { [byte]$s }
  $writer.Write([byte]$byteDim)       # width (0 = 256)
  $writer.Write([byte]$byteDim)       # height
  $writer.Write([byte]0)              # palette
  $writer.Write([byte]0)              # reserved
  $writer.Write([uint16]1)            # planes
  $writer.Write([uint16]32)           # bpp
  $writer.Write([uint32]$data.Length) # size
  $writer.Write([uint32]$offset)      # offset
  $offset += $data.Length
}
$header = $entries.ToArray()
$writer.Close()

$all = New-Object System.IO.MemoryStream
$all.Write($header, 0, $header.Length)
foreach ($entry in $pngBlobs) { $all.Write($entry[1], 0, $entry[1].Length) }
[IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.ico'), $all.ToArray())

Write-Output ("ICON_OK " + (Join-Path $OutDir 'icon.ico') + " sizes=" + ($sizes -join ','))
