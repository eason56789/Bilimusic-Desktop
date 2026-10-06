/**
 * 通过 GitHub Git Data API 推送提交(blobs -> tree -> commit -> ref)。
 * 用途:git 协议(github.com)被墙时,走确定可通的 api.github.com。
 * 用法:GH_TOKEN=xxx node push-via-api.mjs <repoPath> <owner> <repo> <branch> <commitMessage>
 * token 只从环境变量读取,不写入任何文件。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [repoPath, owner, repo, branch, ...msgParts] = process.argv.slice(2)
const token = process.env.GH_TOKEN
if (!token || !repoPath || !owner || !repo || !branch) {
  console.error('usage: GH_TOKEN=... node push-via-api.mjs <repoPath> <owner> <repo> <branch> <message>')
  process.exit(2)
}
const message = msgParts.join(' ') || 'update'
const git = join(repoPath, '..', 'mingit', 'cmd', 'git.exe')
const API = `https://api.github.com/repos/${owner}/${repo}`

const api = async (path, body, method = 'POST') => {
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'bilimusic-push'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(`${method} ${path} -> ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

// 1. 文件清单(git ls-files,已跟踪文件)
const paths = execFileSync(git, ['ls-files'], { cwd: repoPath, encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
console.log(`files: ${paths.length}`)

// 2. 逐个创建 blob(串行,避免触发限速)
const tree = []
let i = 0
for (const p of paths) {
  const content = readFileSync(join(repoPath, p))
  const { sha } = await api('/git/blobs', {
    content: content.toString('base64'),
    encoding: 'base64'
  })
  tree.push({ path: p, mode: '100644', type: 'blob', sha })
  i++
  if (i % 10 === 0) console.log(`  blobs ${i}/${paths.length}`)
}
console.log('blobs done')

// 3. tree
const { sha: treeSha } = await api('/git/trees', { tree })
console.log(`tree: ${treeSha}`)

// 4. commit(空仓库无父提交)
const { sha: commitSha } = await api('/git/commits', { message, tree: treeSha, parents: [] })
console.log(`commit: ${commitSha}`)

// 5. ref(本地上传为全量 tree,统一 force 对齐,避免远端初始提交造成非快进)
try {
  await api(`/git/refs/heads/${branch}`, { sha: commitSha, force: true }, 'PATCH')
  console.log(`ref updated: refs/heads/${branch}`)
} catch (e) {
  console.log('ref PATCH failed, trying POST (branch may not exist yet)')
  await api('/git/refs', { ref: `refs/heads/${branch}`, sha: commitSha })
  console.log(`ref created: refs/heads/${branch}`)
}
console.log('PUSH_OK')
