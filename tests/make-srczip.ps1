$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot   # BiliMusic-Desktop
$dest = Join-Path (Split-Path -Parent $root) 'BiliMusic-Desktop-src-20261006-fixed.zip'

$excludeDirs = '\\(node_modules|out|release|\.git|\.out)\\'
$excludeExts = '\.log$'

$files = Get-ChildItem -Path $root -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch $excludeDirs } |
  Where-Object { $_.FullName -notmatch $excludeExts } |
  Where-Object { $_.Name -ne 'builder-debug.yml' }

Write-Host "file count: $($files.Count)"
if ($files.Count -lt 50) { throw "unexpectedly few files - exclusion regex is broken" }

$tmp = Join-Path $env:TEMP 'bm-src-stage'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

$stage = Join-Path $tmp 'BiliMusic-Desktop'
New-Item -ItemType Directory -Path $stage | Out-Null
$rootLen = $root.Length + 1
foreach ($f in $files) {
  $rel = $f.FullName.Substring($rootLen)
  $dst = Join-Path $stage $rel
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item -LiteralPath $f.FullName -Destination $dst
}

if (Test-Path $dest) { Remove-Item $dest -Force }
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $dest -Force
Remove-Item $tmp -Recurse -Force

$z = Get-Item $dest
Write-Host "zip OK: $($z.Length) bytes, $($z.LastWriteTime)"
