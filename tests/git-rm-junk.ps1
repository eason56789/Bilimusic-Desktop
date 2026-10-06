$git = Join-Path (Split-Path (Split-Path $PSScriptRoot)) 'mingit\cmd\git.exe'
$junk = & $git ls-files | Where-Object { $_ -match '^\{' }
foreach ($j in $junk) {
  Write-Output ("REMOVING: [" + $j + "]")
  # 工作区+index 一起删:rm(不带 --cached)删 index 与磁盘文件
  & $git rm -f -- $j
}
& $git -c user.name='eason56789' -c user.email='eason56789@users.noreply.github.com' commit --amend --no-edit | Select-Object -First 2
$left = & $git ls-files | Where-Object { $_ -match '^\{' }
Write-Output ('JUNK_IN_INDEX=' + @($left).Count)
Write-Output ('FILE_ON_DISK=' + (Test-Path -LiteralPath ($junk | Select-Object -First 1)))
& $git ls-files | Measure-Object -Line | ForEach-Object { Write-Output ('FILES=' + $_.Lines) }
