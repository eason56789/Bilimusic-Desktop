$dirs = @(
  "$env:USERPROFILE\Desktop",
  "$env:OneDrive\Desktop",
  "$env:PUBLIC\Desktop",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
) | Select-Object -Unique

foreach ($d in $dirs) {
  if (Test-Path $d) {
    Write-Output "== $d"
    Get-ChildItem $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match 'bili' } |
      ForEach-Object {
        $sh = New-Object -ComObject WScript.Shell
        $s = $sh.CreateShortcut($_.FullName)
        Write-Output ("  LNK   = " + $_.FullName)
        Write-Output ("  Target= " + $s.TargetPath)
        Write-Output ("  Icon  = " + $s.IconLocation)
        Write-Output ("  Mtime = " + $_.LastWriteTime)
      }
  } else {
    Write-Output "== $d  (不存在)"
  }
}
