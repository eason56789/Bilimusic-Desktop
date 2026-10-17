/* 查 BiliMusic.exe 进程的镜像路径,判断跑的是已安装版本还是本地 out/ 构建 */
import { execSync } from 'node:child_process'

const ps = `
Get-CimInstance Win32_Process -Filter "name='BiliMusic.exe' or name='electron.exe'" |
  Select-Object ProcessId, ExecutablePath, CommandLine |
  Format-List
`
try {
  const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024
  })
  console.log(out)
} catch (e) {
  console.log('ERR', String(e).slice(0, 2000))
}
