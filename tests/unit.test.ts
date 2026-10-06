/**
 * 纯函数单元测试:同步增量 / 链接解析 / 分P构造
 * 运行:npx esbuild tests/unit.test.ts --bundle --platform=node --alias:@shared=./src/shared --outfile=tests/.out/unit.test.js && node tests/.out/unit.test.js
 */
import { computeSyncPlan } from '../src/main/syncDelta'
import { parsePlaylistLink } from '../src/main/api/linkImport'
import { pagesToSongs } from '../src/renderer/src/lib/pages'
import {
  calcRevealChars,
  buildCharTimes,
  resolveCharTimes,
  lineEndTime
} from '../src/renderer/src/lib/karaoke'
import type { BiliPage, Song } from '../src/shared/types'

let passed = 0
let failed = 0
function eq(actual: unknown, expected: unknown, name: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
  } else {
    failed++
    console.error(`FAIL ${name}\n  actual:   ${a}\n  expected: ${e}`)
  }
}

// ===== computeSyncPlan =====
{
  // 1) 基本:远端删除a、新增c → a移除、c追加,快照=远端
  const p = computeSyncPlan(['a', 'b'], ['a', 'b'], ['b', 'c'], true)
  eq(p.songIds, ['b', 'c'], 'sync: a消失移除+c追加')
  eq(p.syncedIds, ['b', 'c'], 'sync: 快照更新为远端')
  eq(p.added, 1, 'sync: added=1')
  eq(p.removed, 1, 'sync: removed=1(已消失的a)')
}
{
  // 2) 远端歌单清空(拉取完整)→ 只保留手动加入的
  const p = computeSyncPlan(['manual', 'a'], ['a'], [], true)
  eq(p.songIds, ['manual'], 'sync: 远端清空只留手动歌')
  eq(p.removed, 1, 'sync: removed=1')
}
{
  // 3) 拉取不完整 → 只增不删,快照不动
  const p = computeSyncPlan(['a', 'b'], ['a', 'b'], ['b'], false)
  eq(p.songIds, ['a', 'b'], 'sync: 不完整拉取不删')
  eq(p.syncedIds, ['a', 'b'], 'sync: 不完整拉取快照不变')
  eq(p.removed, 0, 'sync: 不完整 removed=0')
  eq(p.added, 0, 'sync: 不完整 added=0')
}
{
  // 4) 不完整拉取发现新歌 → 新增仍生效
  const p = computeSyncPlan(['a'], ['a'], ['a', 'z'], false)
  eq(p.songIds, ['a', 'z'], 'sync: 不完整拉取仍可新增')
  eq(p.added, 1, 'sync: 不完整 added=1')
}
{
  // 5) 首次同步(无快照):全部视为手动,只增不删
  const p = computeSyncPlan(['manual'], [], ['x'], true)
  eq(p.songIds, ['manual', 'x'], 'sync: 无快照保护已有歌')
  eq(p.removed, 0, 'sync: 无快照不删')
}

// ===== parsePlaylistLink =====
{
  eq(
    parsePlaylistLink('https://music.163.com/#/playlist?id=123456'),
    { platform: 'netease', id: '123456' },
    'parse: 网易云 hash 路由'
  )
  eq(
    parsePlaylistLink('https://music.163.com/playlist?id=654321'),
    { platform: 'netease', id: '654321' },
    'parse: 网易云 直接路径'
  )
  eq(
    parsePlaylistLink('https://y.music.163.com/m/playlist?id=777'),
    { platform: 'netease', id: '777' },
    'parse: 网易云 y.music 短域名'
  )
  eq(parsePlaylistLink('https://music.163.com/#/song?id=123'), null, 'parse: 网易云歌曲链接拒绝')
  eq(parsePlaylistLink('https://music.163.com/#/album?id=123'), null, 'parse: 网易云专辑链接拒绝')
  eq(
    parsePlaylistLink('https://music.163.com/#/my/musicrogram/playlists?id=99'),
    { platform: 'netease', id: '99' },
    'parse: 网易云我的歌单'
  )
  eq(
    parsePlaylistLink('https://163cn.tv/AbCdEfG'),
    { platform: 'netease', id: '' },
    'parse: 网易云短链标记需跟随'
  )
  eq(
    parsePlaylistLink('https://y.qq.com/n/ryqq/playlist/1234567890'),
    { platform: 'qq', id: '1234567890' },
    'parse: QQ音乐歌单路径'
  )
  eq(
    parsePlaylistLink('https://y.qq.com/n/ryqq/playlist_detail/98765'),
    { platform: 'qq', id: '98765' },
    'parse: QQ音乐 playlist_detail'
  )
  eq(
    parsePlaylistLink('http://y.qq.com/#type=cd&id=55555'),
    { platform: 'qq', id: '55555' },
    'parse: QQ音乐老式 cd 分享'
  )
  eq(
    parsePlaylistLink('https://i.y.qq.com/n2/m/share/details/taoge.html?id=7707261125&host=uin&appshare=android_qq'),
    { platform: 'qq', id: '7707261125' },
    'parse: QQ音乐手机端 taoge 分享'
  )
  eq(
    parsePlaylistLink('https://c6.y.qq.com/base/fcgi-bin/u?__=abc123'),
    { platform: 'qq', id: '' },
    'parse: QQ音乐短链标记需跟随'
  )
  eq(parsePlaylistLink('https://y.qq.com/n/ryqq/songDetail/003'), null, 'parse: QQ歌曲链接拒绝')
  eq(
    parsePlaylistLink('https://www.kugou.com/yy/#/playlist?id=1199981095'),
    { platform: 'kugou', id: '1199981095' },
    'parse: 酷狗 web 歌单'
  )
  eq(
    parsePlaylistLink('https://www.kugou.com/yy/special/single/9277467.html'),
    { platform: 'kugou', id: '9277467' },
    'parse: 酷狗 special 分享链接(实测形态)'
  )
  eq(
    parsePlaylistLink('https://m.kugou.com/plist/list/5iujfa2'),
    { platform: 'kugou', id: '' },
    'parse: 酷狗短链待页面提取'
  )
  eq(
    parsePlaylistLink('https://m.kugou.com/playlist/id_2089066'),
    { platform: 'kugou', id: '' },
    'parse: 酷狗旧 id_ 形态转页面提取'
  )
  eq(parsePlaylistLink('https://example.com/playlist?id=1'), null, 'parse: 非法域名拒绝')
  eq(parsePlaylistLink('这不是链接'), null, 'parse: 垃圾输入')
  eq(parsePlaylistLink(''), null, 'parse: 空输入')
}

// ===== pagesToSongs =====
{
  const base: Song = {
    id: 'BV1xx411c7mD',
    title: '测试视频',
    artist: 'UP主',
    coverUrl: null,
    duration: 300,
    source: 'BILIBILI',
    bvid: 'BV1xx411c7mD',
    page: 1,
    addedAt: 0
  }
  const pages: BiliPage[] = [
    { cid: 1, page: 1, part: 'P1名字', duration: 300 },
    { cid: 2, page: 2, part: 'P2名字', duration: 320 },
    { cid: 3, page: 3, part: '', duration: 0 }
  ]
  const list = pagesToSongs(base, pages)
  eq(list.length, 3, 'pages: 三P三首')
  eq(list[0].id, 'BV1xx411c7mD', 'pages: 第1P裸bvid')
  eq(list[1].id, 'BV1xx411c7mD_p2', 'pages: 第2P带后缀')
  eq(list[2].id, 'BV1xx411c7mD_p3', 'pages: 第3P带后缀')
  eq(list[0].title, '测试视频', 'pages: 第1P标题不加后缀')
  eq(list[1].title, '测试视频 · P2', 'pages: 第2P标题加后缀')
  eq(list[2].duration, 300, 'pages: 分P时长缺失回退基准')
  eq(list[1].duration, 320, 'pages: 分P时长采用分P值')
  eq(pagesToSongs(base, [pages[0]]), [], 'pages: 单P返回空(不铺队列)')
  // 基准标题已带后缀(播放记录来的)不叠加
  const hist: Song = { ...base, id: 'BV1xx411c7mD_p3', page: 3, title: '测试视频 · P3名字' }
  const list2 = pagesToSongs(hist, pages)
  eq(list2[1].title, '测试视频 · P2', 'pages: 防叠加清理原后缀')
}

// ===== KTV 逐字走光 =====
{
  const text = 'abcd'
  // 无逐字:整句直接全亮(不做模拟推进)
  eq(calcRevealChars(text, null, 1500, 1000, 2000), 4, 'ktv: 无逐字整句全亮(唱到中段)')
  eq(calcRevealChars(text, null, 500, 1000, 2000), 4, 'ktv: 无逐字整句全亮(未开始)')
  eq(calcRevealChars(text, null, 9999, 1000, 2000), 4, 'ktv: 无逐字整句全亮(已结束)')
  // 逐字分组+字内插值
  const ct = [1000, 1000, 2000, 3000]
  eq(calcRevealChars(text, ct, 500, 1000, 5000), 0, 'ktv: 逐字未开始')
  eq(calcRevealChars(text, ct, 1500, 1000, 5000), 1, 'ktv: 组内中点插值')
  eq(calcRevealChars(text, ct, 2500, 1000, 5000), 2.5, 'ktv: 第二组插值')
  eq(calcRevealChars(text, ct, 9000, 1000, 5000), 4, 'ktv: 全部点亮')
}
{
  // buildCharTimes:words 展开 + trim 偏移对齐
  eq(
    buildCharTimes('你好 世界', [
      { text: '你好', timeMs: 1000 },
      { text: ' ', timeMs: 2000 },
      { text: '世界', timeMs: 3000 }
    ]),
    [1000, 1000, 2000, 3000, 3000],
    'ktv: words 展开逐字时间'
  )
  eq(
    buildCharTimes('ab', [
      { text: ' ', timeMs: 0 },
      { text: 'ab', timeMs: 100 }
    ]),
    [100, 100],
    'ktv: 首部空白 trim 偏移'
  )
  eq(buildCharTimes('xyz', [{ text: 'ab', timeMs: 1 }]), null, 'ktv: 对不齐返回 null')
  // resolveCharTimes 优先级
  eq(resolveCharTimes('ab', [5, 6], undefined), [5, 6], 'ktv: wordTimes 等长直用')
  eq(
    resolveCharTimes('ab', [5], [{ text: 'ab', timeMs: 7 }]),
    [7, 7],
    'ktv: wordTimes 不等长回退 words'
  )
  eq(resolveCharTimes('ab', undefined, undefined), null, 'ktv: 无数据回退 null')
  eq(lineEndTime(1000), 6000, 'ktv: 行末兜底+5s')
  eq(lineEndTime(1000, 2000), 2000, 'ktv: 行末取下一行')
}

console.log(`\nunit tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
