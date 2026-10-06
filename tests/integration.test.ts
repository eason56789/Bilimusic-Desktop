/**
 * 真实接口集成测试:网易云链接导入 / B站播放记录(未登录路径) / 收藏夹(未登录路径)
 * 运行:npx esbuild tests/integration.test.ts --bundle --platform=node --alias:@shared=./src/shared --outfile=tests\.out\integration.test.js && node tests\.out\integration.test.js [可选:QQ歌单id,酷狗歌单id]
 */
import { fetchPlaylistByLink, parsePlaylistLink } from '../src/main/api/linkImport'
import { searchPlaylists } from '../src/main/api/netease'
import { getWatchHistory, getFavoriteResources } from '../src/main/api/bilibili'

let passed = 0
let failed = 0
function check(cond: boolean, name: string, detail?: unknown): void {
  if (cond) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name} ${detail !== undefined ? JSON.stringify(detail) : ''}`)
  }
}

async function main(): Promise<void> {
  // ===== 1. 网易云:搜索真实公开歌单 → 链接导入 =====
  const list = await searchPlaylists('流行', 5)
  check(list.length > 0, 'netease: 歌单搜索返回结果', list.length)
  if (list.length > 0) {
    const id = String(list[0].id)
    const link = `https://music.163.com/#/playlist?id=${id}`
    check(parsePlaylistLink(link)?.id === id, 'netease: 链接解析')
    const pl = await fetchPlaylistByLink(link)
    check(pl.platform === 'netease', 'netease: 平台识别', pl.platform)
    check(pl.name.length > 0, 'netease: 歌单名非空', pl.name)
    check(pl.songs.length > 0, 'netease: 歌曲列表非空', pl.songs.length)
    check(pl.songs.every((s) => s.source === 'NETEASE' && s.neteaseId), 'netease: 歌曲结构')
    console.log(
      `     → ${pl.name} · ${pl.songs.length}首 · 首曲: ${pl.songs[0]?.title} - ${pl.songs[0]?.artist}`
    )
    // 短链域名也应被识别为需跟随(不取内容,只验证识别)
    check(
      parsePlaylistLink('https://163cn.tv/AbCdEfG')?.platform === 'netease',
      'netease: 163cn.tv 短链识别'
    )
  }

  // ===== 2. B站播放记录(本机无登录态 → 应返回 notLoggedIn,不抛错) =====
  const hist = await getWatchHistory(1)
  check(hist.notLoggedIn === true, 'bili-history: 未登录返回 notLoggedIn', hist)
  check(hist.songs.length === 0, 'bili-history: 未登录无数据', hist.songs.length)
  check(hist.complete === false, 'bili-history: 未登录 complete=false')

  // ===== 3. B站收藏夹(未登录 → 拉取不完整但不抛错) =====
  const fav = await getFavoriteResources(1)
  check(fav.complete === false, 'bili-fav: 未登录/失败 complete=false', fav)

  // ===== 4. 可选:QQ / 酷狗(通过命令行参数传入真实歌单id) =====
  const qqId = process.argv[2]
  const kgId = process.argv[3]
  if (qqId) {
    try {
      const pl = await fetchPlaylistByLink(`https://y.qq.com/n/ryqq/playlist/${qqId}`)
      check(pl.platform === 'qq', 'qq: 平台识别')
      check(pl.songs.length > 0, 'qq: 歌曲非空', pl.songs.length)
      check(
        pl.songs.every((s) => s.source === 'QQMUSIC' && s.title.length > 0 && s.artist.length > 0),
        'qq: 歌曲结构'
      )
      console.log(`     → ${pl.name} · ${pl.songs.length}首 · 首曲: ${pl.songs[0]?.title} - ${pl.songs[0]?.artist} · ${pl.songs[0]?.duration}s`)
    } catch (e) {
      check(false, 'qq: 拉取', String(e))
    }
  }
  if (kgId) {
    try {
      // 用实测有效的分享形态(与用户粘贴一致)
      const pl = await fetchPlaylistByLink(`https://www.kugou.com/yy/special/single/${kgId}.html`)
      check(pl.platform === 'kugou', 'kugou: 平台识别')
      check(pl.songs.length > 0, 'kugou: 歌曲非空', pl.songs.length)
      check(
        pl.songs.every((s) => s.source === 'KUGOU' && s.title.length > 0 && s.artist.length > 0),
        'kugou: 歌曲结构'
      )
      console.log(`     → ${pl.name} · ${pl.songs.length}首 · 首曲: ${pl.songs[0]?.title} - ${pl.songs[0]?.artist} · ${pl.songs[0]?.duration}s`)
    } catch (e) {
      check(false, 'kugou: 拉取', String(e))
    }
  }

  console.log(`\nintegration tests: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
