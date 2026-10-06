# 用 .NET DPAPI 解密 library.json 的 B站 cookie(仅内存),实测 history/cursor 与收藏夹接口
# 不打印 cookie 本身,只打印 API 响应摘要
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$lib = Get-Content (Join-Path $PSScriptRoot 'release\win-unpacked\resources\app.biliignore') -ErrorAction SilentlyContinue
$libPath = Join-Path $env:APPDATA 'BiliMusic\library.json'
$raw = (Get-Content $libPath -Raw -Encoding UTF8 | ConvertFrom-Json).biliCookieEnc
if (-not $raw -or -not $raw.StartsWith('enc:')) { Write-Output 'NO_ENC_COOKIE'; exit }
$bytes = [Convert]::FromBase64String($raw.Substring(4))
# Electron safeStorage blob: "v10" ASCII 前缀 + DPAPI
if ($bytes.Length -gt 3 -and [Text.Encoding]::ASCII.GetString($bytes[0..2]) -eq 'v10') {
  $bytes = $bytes[3..($bytes.Length - 1)]
}
$plain = [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))
Write-Output ('COOKIE_LEN=' + $plain.Length)
Write-Output ('COOKIE_NAMES=' + (($plain -split '; ' | ForEach-Object { ($_ -split '=')[0] }) -join ','))

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
$headers = @{ 'User-Agent' = $UA; 'Referer' = 'https://www.bilibili.com/'; 'Cookie' = $plain }

# 1) history/cursor
$r1 = Invoke-RestMethod -Uri 'https://api.bilibili.com/x/web-interface/history/cursor?type=0&max=0&view_at=0' -Headers $headers -TimeoutSec 15
Write-Output ('HIST code=' + $r1.code + ' msg=' + $r1.message)
if ($r1.code -eq 0 -and $r1.data.list) {
  $first = $r1.data.list[0] | ConvertTo-Json -Depth 4 -Compress
  Write-Output ('HIST_FIRST=' + $first.Substring(0, [Math]::Min(500, $first.Length)))
}

# 2) 收藏夹列表
$r2 = Invoke-RestMethod -Uri 'https://api.bilibili.com/x/v3/fav/folder/created/list?pn=1&ps=30&up_mid=0' -Headers $headers -TimeoutSec 15
Write-Output ('FAV code=' + $r2.code + ' msg=' + $r2.message + ' count=' + @($r2.data.list).Count)
