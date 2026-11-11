/** 歌单页:本地歌单管理 + B站收藏夹/网易云歌单导入 + 最近播放 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Menu,
  MenuItem,
  MenuPopover,
  MenuTrigger,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Switch,
  Text,
  makeStyles,
  tokens,
  Spinner,
  ToggleButton,
  Tooltip
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  ArrowSyncRegular,
  CloudArrowDownRegular,
  DeleteRegular,
  EditRegular,
  EyeOffRegular,
  EyeRegular,
  FolderAddRegular,
  HeartFilled,
  HeartRegular,
  HistoryRegular,
  MusicNote2Regular,
  OpenRegular,
  PlayRegular,
  QrCodeRegular,
  SubtractRegular,
  SaveRegular,
  SearchRegular
} from '@fluentui/react-icons'
import type { KugouPlatform, NeteasePlaylistMeta, Playlist, Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'
import { Cover } from '../components/Cover'
import { PageLayout, PageHeader } from '../components/PageHeader'
import { BiliLoginDialog, NeteaseLoginDialog } from '../components/LoginDialogs'
import { RevealItem, useRevealGroup } from '../lib/RevealList'
import {
  EASE_IN_OUT,
  EASE_IN_OUT_BEZIER,
  computeDurations,
  useMotionFine,
  useMotionLevel
} from '../lib/motion'
import { toastError, toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px', gap: '16px' },
  scroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  card: { padding: '12px', cursor: 'pointer', ':hover': { transform: 'translateY(-2px)' } },
  actionsRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  header: { display: 'flex', alignItems: 'center', gap: '16px' },
  /** 搜索框 + 歌曲列表这一整块:简介到位时要整块一起位移,所以包成一层 */
  body: { display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    padding: '48px 0'
  }
})

/** B站在线视图入口:播放记录 / 在线歌单预览(点击卡片先打开预览,导入按钮显式化) */
export type RemoteView =
  | { kind: 'history' }
  | { kind: 'netease-record' }
  | { kind: 'qq-record' }
  | { kind: 'qishui'; id: string; title: string; coverUrl?: string; count: number; ownerId?: string }
  | { kind: 'netease-pl'; id: number; title: string; coverUrl?: string; count: number }
  | { kind: 'qq-pl'; id: string; title: string; coverUrl?: string; count: number }
  | { kind: 'fav'; id: number; title: string; coverUrl?: string; count: number }

/** 是否可同步(B站收藏夹 / 网易云歌单 / QQ歌单 / 酷狗歌单 / 播放记录) */
const isSyncable = (pl: Playlist | null | undefined): boolean =>
  !!(pl && (pl.favoriteFolderId || pl.neteasePlaylistId || pl.qqPlaylistId || pl.kugouPlaylistId || pl.qishuiPlaylistId || pl.biliHistory))

/** 歌单来源分类(依据来源 id 标记,无标记为本地) */
export type PlaylistCategory = 'local' | 'netease' | 'bili' | 'qq' | 'kugou' | 'qishui'

export function sourceOf(pl: Playlist): PlaylistCategory {
  if (pl.neteasePlaylistId) return 'netease'
  if (pl.favoriteFolderId || pl.biliHistory) return 'bili'
  if (pl.qqPlaylistId) return 'qq'
  if (pl.kugouPlaylistId) return 'kugou'
  if (pl.qishuiPlaylistId) return 'qishui'
  return 'local'
}

/** 登录平台的在线歌单条目(自动列出,点卡片导入;已导入则点开本地详情) */
type OnlineBrief = {
  id: number | string
  name: string
  coverUrl?: string
  count: number
  platform: 'netease' | 'qq' | 'qishui' | KugouPlatform
}

/**
 * 歌单详情主体:头部(封面/名称/描述)+ 网易云元信息(播放量/创建时间/创作者/标签)
 * + 页内搜索 + 歌曲列表。
 *
 * 关于"打开歌单时下面的内容突然瞬移":网易云的简介/元信息是打开后才异步拉的
 * (neteasePlaylistMeta),它们一到就顶出十几到上百像素,下面的搜索框和列表瞬间被推下去。
 * 这里把这段迟到的布局变化做成一条动画:
 *  - 简介/信息块自己做"放大 + 模糊 + 淡入";
 *  - 它们的外框从 0 高度长到真实高度,下面的搜索框和列表就被这个高度变化推下去;
 *  - 两边共用同一个时长与同一条曲线(都取自动效系统),
 *    并且下面的位移是真实布局变化,不是 transform 平移 ——
 *    平移那种"整块刚性滑动"的观感很硬,曲线再软也救不回来。
 * 时长不在这里写死:走 lib/motion 的「歌单信息」通道,
 * 于是设置里的动画速率、详细速率、动效强度档位都能直接调到这段动画。
 */
function PlaylistDetailBody({
  playlist,
  songs,
  onBack,
  syncingId,
  onSync,
  onRename,
  onDelete,
  onRemoveSong
}: {
  playlist: Playlist | null
  songs: Song[]
  onBack: () => void
  syncingId: string | null
  onSync: (p: Playlist) => void
  onRename: (p: Playlist) => void
  onDelete: (p: Playlist) => void
  onRemoveSong: (song: Song) => Promise<void>
}) {
  const styles = useStyles()
  const playQueue = useStore((s) => s.playQueue)
  /** 音源加载中禁用播放键(与播放条/全屏页一致的屏蔽策略) */
  const playerLoading = useStore((s) => s.loading)
  const [kw, setKw] = useState('')
  const [meta, setMeta] = useState<NeteasePlaylistMeta | null>(null)
  const neteaseId = playlist?.neteasePlaylistId ?? null
  // 网易云歌单:打开时拉元信息(描述/播放量/创建时间/创作者/标签)
  useEffect(() => {
    if (!neteaseId) {
      setMeta(null)
      return
    }
    let cancelled = false
    api
      .neteasePlaylistMeta(neteaseId)
      .then((r) => {
        if (!cancelled && r.ok && r.data) setMeta(r.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [neteaseId])

  /**
   * 迟到信息块入场的时长/曲线,全部来自动效系统,组件里不写死数字:
   * 设置里的「动画速率」×「详细速率 → 歌单信息」× 动效强度档位,最终都落到 metaInMs 上。
   * 信息块的淡入与下方内容的位移必须用同一个值,否则会出现"一个追另一个"的错位。
   */
  const motionLevel = useMotionLevel()
  const motionSpeed = useStore((s) => s.library?.settings.motionSpeed ?? 1)
  const motionFine = useMotionFine()
  const metaDurations = computeDurations(motionLevel, motionSpeed, motionFine)
  /** 淡入与"撑开"共用的时长(ms);「关闭」档为 0,即直接到位 */
  const metaInMs = metaDurations.meta
  /**
   * 曲线用进/退场那条对称缓动 cubic-bezier(.4, 0, .2, 1),不用页面切换那种强 ease-out:
   * 这段位移是"从静止到静止",起手和收尾都要有加速度过渡,否则看着就是"跳下去"。
   */
  const metaInTransition = { duration: metaInMs / 1000, ease: EASE_IN_OUT_BEZIER }
  /**
   * 模糊幅度跟随档位(舒缓档为 0px);但 12px 的小字上 6px 太糊,这里封顶 4px ——
   * 否则"由糊突然变清晰"本身就很硬
   */
  const metaInBlur = `blur(${Math.min(metaDurations.blur, 4)}px)`

  /**
   * 简介/信息块的"外框":它们从 0 高度长到内容真实高度,下面的搜索框和列表就是被
   * 这个真实的高度变化推下去的 —— 不是整块做 transform 平移。这样做的好处:
   *  - 位移和淡入天然是同一条曲线、同一段时长,不存在两套动画互相追;
   *  - 没有"整块滑动"的刚性感,也不会出现文字和歌曲行重叠的中间帧;
   *  - 底部不会因为平移而露出空白。
   */
  const infoGrowRef = useRef<HTMLDivElement | null>(null)
  const descGrowRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    // 「关闭」档时长 0:不铺任何过渡,直接以自然高度呈现
    if (metaInMs < 1) return
    for (const el of [infoGrowRef.current, descGrowRef.current]) {
      if (!el) continue
      // 已经撑开过就不再重播(改设置会让这个 effect 重跑)
      if (el.style.height) continue
      // 先量内容真实高度(此刻外框还没有限高),再把高度压回 0 起跑
      const target = el.scrollHeight
      if (target < 1) continue
      // 这块是插进父容器的"新子元素",会额外多出一条 flex gap(gap 是按子元素条数算的)。
      // 用等量负 margin 抵掉,让它从"净占位 0"开始长,否则第一帧内容就会被那条 gap 顶下去。
      const gapPx = parseFloat(getComputedStyle(el.parentElement ?? el).rowGap || '0') || 0
      el.style.transition = 'none'
      el.style.height = '0px'
      el.style.marginBottom = `${-gapPx}px`
      void el.offsetHeight // 提交 0 高度这一帧,否则下面这条过渡拿不到起点
      el.style.transition = `height ${metaInMs}ms ${EASE_IN_OUT}, margin-bottom ${metaInMs}ms ${EASE_IN_OUT}`
      el.style.height = `${target}px`
      el.style.marginBottom = '0px'
      // 收尾交还 auto:留着固定 px 的话,窗口缩放或字体变化后内容会被截断
      el.addEventListener(
        'transitionend',
        () => {
          if (el.style.height === `${target}px`) {
            el.style.height = 'auto'
            el.style.marginBottom = ''
          }
        },
        { once: true }
      )
    }
  }, [meta, metaInMs])

  const filtered = kw.trim()
    ? songs.filter((s) => {
        const q = kw.trim().toLowerCase()
        return (
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          (s.album ?? '').toLowerCase().includes(q)
        )
      })
    : songs

  const fmtCount = (n?: number): string => {
    if (n == null) return ''
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    return String(n)
  }
  const fmtDate = (t?: number): string => {
    if (!t) return ''
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Tooltip content="返回" relationship="label">
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} />
        </Tooltip>
        <Cover url={playlist?.coverUrl ?? meta?.coverUrl} size={64} radius={8} iconSize={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size={600} weight="semibold">
            {playlist?.name}
          </Text>
          <div>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {/* 描述为空时不显示多余的分隔符;老数据描述里带"N首",避免与右侧计数重复 */}
              {[playlist?.description?.replace(/ · \d+\s*首$/, ''), `${songs.length} 首`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </div>
          {/* 网易云歌单附加信息:创作者 / 播放量 / 创建时间 / 标签(异步到达:外框撑开 + 放大模糊淡入) */}
          {meta && (
            <div ref={infoGrowRef} style={{ overflow: 'hidden', flexShrink: 0 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.97, filter: metaInBlur }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={metaInTransition}
                // 间距用 padding 而不是 margin:margin 不算进 scrollHeight,量出来的高度会差 4px
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}
              >
              {meta.creator && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  创建者:{meta.creator}
                </Text>
              )}
              {meta.playCount != null && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  播放:{fmtCount(meta.playCount)}
                </Text>
              )}
              {meta.subscribedCount != null && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  收藏:{fmtCount(meta.subscribedCount)}
                </Text>
              )}
              {meta.createTime != null && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  创建:{fmtDate(meta.createTime)}
                </Text>
              )}
              {meta.tags && meta.tags.length > 0 && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  标签:{meta.tags.join(' / ')}
                </Text>
              )}
              </motion.div>
            </div>
          )}
        </div>
        <Button
          appearance="primary"
          icon={<PlayRegular />}
          disabled={songs.length === 0 || playerLoading}
          onClick={() => playQueue(songs, 0)}
        >
          播放全部
        </Button>
        {playlist && isSyncable(playlist) && (
          <Button
            icon={syncingId === playlist.id ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
            disabled={syncingId !== null}
            onClick={() => onSync(playlist)}
          >
            {syncingId === playlist.id ? '同步中…' : '同步'}
          </Button>
        )}
        <Tooltip content="重命名" relationship="label">
          <Button
            appearance="subtle"
            icon={<EditRegular />}
            disabled={!playlist}
            onClick={() => playlist && onRename(playlist)}
          />
        </Tooltip>
        <Tooltip content="删除歌单" relationship="label">
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            disabled={!playlist}
            onClick={() => playlist && onDelete(playlist)}
          />
        </Tooltip>
      </div>

      {/* 网易云歌单描述(整块宽行):外框撑开 + 放大模糊淡入,同样异步到达 */}
      {meta?.description && (
        <div ref={descGrowRef} style={{ overflow: 'hidden', flexShrink: 0 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, filter: metaInBlur }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={metaInTransition}
            // Text 渲染出来是 span,套一层后要用 flex 收口,它才会按块级参与布局
            // (maxHeight / overflowY 在纯 inline 上是无效的)
            style={{ display: 'flex', flexDirection: 'column' }}
          >
          <Text
            size={200}
            style={{
              color: tokens.colorNeutralForeground3,
              whiteSpace: 'pre-line',
              lineHeight: 1.7,
              maxWidth: 900,
              maxHeight: 96,
              overflowY: 'auto'
            }}
          >
            {meta.description}
          </Text>
          </motion.div>
        </div>
      )}

      {/* 搜索框 + 歌曲列表:自己不铺位移,上面的信息块长高就把它们推下去(曲线/时长完全同步) */}
      <div className={styles.body}>
        {/* 页内搜索 */}
        <Input
          placeholder="在歌单内搜索歌曲(标题 / 歌手 / 专辑)"
          value={kw}
          onChange={(_, d) => setKw(d.value)}
          contentBefore={<SearchRegular />}
          style={{ maxWidth: 420 }}
        />

        <div className={styles.scroll}>
          {filtered.length > 0 ? (
            <SongList songs={filtered} onRemove={onRemoveSong} />
          ) : songs.length > 0 ? (
            <div className={styles.empty}>
              <SearchRegular fontSize={36} />
              <Text size={400}>没有匹配的歌曲</Text>
            </div>
          ) : (
            <div className={styles.empty}>
              <MusicNote2Regular fontSize={40} />
              <Text size={400}>歌单还是空的</Text>
              <Text size={300}>去搜索页添加歌曲,或导入B站收藏夹/网易云歌单</Text>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * B站在线歌单详情:打开时拉第一页(20条),滚动接近底部自动加载下一页。
 * 「保存为本地歌单」把当前已加载内容快照成本地歌单(替代旧的导入)。
 */
function RemotePlaylistDetail({ view, onBack }: { view: RemoteView; onBack: () => void }) {
  const styles = useStyles()
  const playQueue = useStore((s) => s.playQueue)
  /** 音源加载中禁用播放键 */
  const playerLoading = useStore((s) => s.loading)
  const refresh = useStore((s) => s.refreshLibrary)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const animCls = anim !== 'none' ? `page-anim-${anim}` : undefined
  const [songs, setSongs] = useState<Song[]>([])
  const [total, setTotal] = useState(view.kind === 'fav' ? view.count : 0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importingRemote, setImportingRemote] = useState(false)
  const loadingRef = useRef(false)
  const cursor = useRef({ max: '0', viewAt: '0' })
  const pageRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      if (view.kind === 'qishui') {
        const r = await api.qishuiPlaylistTracks(view.id, 50, pageRef.current * 50 - 50, view.ownerId)
        if (r.ok && r.data) {
          const got = r.data
          setSongs((prev) => [...prev, ...got.songs])
          setTotal((prev) => (got.songs.length > 0 ? Math.max(prev, view.count) : prev))
          setHasMore(got.hasMore)
          pageRef.current += 1
        } else {
          toastError('加载失败', r.error ?? '汽水请求失败')
          setHasMore(false)
        }
      } else if (view.kind === 'netease-pl') {
        const r = await api.neteasePlaylistSongs(view.id)
        if (r.ok && r.data) {
          setSongs(r.data)
          setTotal(view.count > 0 ? view.count : r.data.length)
        } else {
          toastError('加载失败', r.error ?? '网易云未登录或接口异常')
        }
        setHasMore(false)
      } else if (view.kind === 'qq-pl') {
        const r = await api.sourcePlaylistSongs('qq', view.id)
        if (r.ok && r.data) {
          setSongs(r.data.songs)
          setTotal(view.count > 0 ? view.count : r.data.songs.length)
        } else {
          toastError('加载失败', r.error ?? 'QQ音乐未登录或接口异常')
        }
        setHasMore(false)
      } else if (view.kind === 'qq-record') {
        const r = await api.qqRecentPlay()
        if (r.ok && r.data) {
          if (r.data.notLoggedIn) {
            toastError('需要登录', '请先在「设置 → 账号」中登录QQ音乐')
          } else {
            setSongs(r.data.songs)
            setTotal(r.data.songs.length)
          }
        } else {
          toastError('加载失败', r.error ?? 'QQ音乐未登录或接口异常')
        }
        setHasMore(false)
      } else if (view.kind === 'netease-record') {
        const r = await api.neteasePlayRecord()
        if (r.ok && r.data) {
          if (r.data.notLoggedIn) {
            toastError('需要登录', '请先在「设置 → 账号」中登录网易云')
          } else {
            setSongs(r.data.songs)
            setTotal(r.data.songs.length)
          }
        } else {
          toastError('加载失败', r.error ?? '网易云未登录或接口异常')
        }
        setHasMore(false)
      } else if (view.kind === 'history') {
        const r = await api.biliHistoryPage(cursor.current.max, cursor.current.viewAt)
        if (r.notLoggedIn) {
          toastError('需要登录', '请先在「设置 → 账号」中登录哔哩哔哩')
          setHasMore(false)
        } else {
          setSongs((prev) => [...prev, ...r.songs])
          cursor.current = { max: r.nextMax, viewAt: r.nextViewAt }
          setHasMore(r.hasMore)
        }
      } else {
        const r = await api.biliFavPage(view.id, pageRef.current)
        setSongs((prev) => [...prev, ...r.songs])
        // 接口 total 可能为 0:优先保留入口卡带来的真实计数
        setTotal((prev) => (r.total > 0 ? r.total : prev))
        pageRef.current += 1
        setHasMore(r.hasMore)
      }
    } catch (e) {
      toastError('加载失败', String(e))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // 打开时拉第一页
  useEffect(() => {
    setSongs([])
    setTotal(view.kind === 'fav' ? view.count : 0)
    pageRef.current = 1
    cursor.current = { max: '0', viewAt: '0' }
    setHasMore(true)
    void loadMore()
  }, [view, loadMore])

  // 无限下翻:接近底部加载下一页
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el || !hasMore || loadingRef.current) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) void loadMore()
  }

  /** 快照为本地歌单(此后可离线管理/手动同步) */
  const saveLocal = async (): Promise<void> => {
    if (saving || songs.length === 0) return
    setSaving(true)
    try {
      const name = view.kind === 'history' ? 'B站播放记录' : view.kind === 'netease-record' ? '网易云播放记录' : view.kind === 'qq-record' ? 'QQ音乐播放记录' : view.kind === 'qishui' ? view.title : view.title
      const pl = await api.libraryCreatePlaylist(name)
      await api.libraryAddToPlaylist(pl.id, songs)
      await refresh()
      toastSuccess('已保存为本地歌单', `${name} · ${songs.length} 首`)
    } catch (e) {
      toastError('保存失败', String(e))
    } finally {
      setSaving(false)
    }
  }

  const title = view.kind === 'history' ? 'B站播放记录' : view.kind === 'netease-record' ? '网易云播放记录' : view.kind === 'qq-record' ? 'QQ音乐播放记录' : view.title
  /** 有平台级导入接口的歌单类型:导入走查重兜底,比快照更干净 */
  const platformImportable =
    view.kind === 'qishui' || view.kind === 'netease-pl' || view.kind === 'qq-pl'
  const importRemote = async (): Promise<void> => {
    if (importingRemote) return
    setImportingRemote(true)
    try {
      const pl =
        view.kind === 'qishui'
          ? await api.qishuiImportPlaylist(view.id, view.title).then((r) => (r.ok ? r.data : null))
          : view.kind === 'netease-pl'
            ? await api.importNeteasePlaylist(view.id, view.title)
            : view.kind === 'qq-pl'
              ? await api.qqImportPlaylist(Number(view.id), view.title)
              : null
      if (pl) {
        await refresh()
        toastSuccess('已导入', `${title} · ${pl.songIds.length} 首`)
        onBack()
      } else {
        toastError('导入失败', '内容为空或获取失败')
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setImportingRemote(false)
    }
  }
  return (
    <div
      key={`remote-${view.kind}-${view.kind === 'fav' || view.kind === 'netease-pl' ? view.id : ''}`}
      className={animCls}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div className={styles.root}>
        <div className={styles.header}>
          <Tooltip content="返回" relationship="label">
            <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} />
          </Tooltip>
          {view.kind !== 'history' && view.kind !== 'netease-record' && view.kind !== 'qq-record' && view.coverUrl ? (
            <Cover url={view.coverUrl} size={64} radius={8} iconSize={28} />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                background: 'rgba(251,114,153,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fb7299',
                flexShrink: 0
              }}
            >
              <HistoryRegular fontSize={28} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size={600} weight="semibold">
              {title}
            </Text>
            <div>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {view.kind === 'fav'
                  ? `${total} 个收藏`
                  : view.kind === 'history' || view.kind === 'netease-record' || view.kind === 'qq-record'
                    ? '最近观看 · 下翻加载更多'
                    : `共 ${total || view.count} 首`}
              </Text>
            </div>
          </div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={songs.length === 0 || playerLoading}
            onClick={() => playQueue(songs, 0)}
          >
            播放已加载
          </Button>
          {platformImportable ? (
            <Tooltip content="导入完整歌单(已导入过会直接复用)" relationship="label">
              <Button
                appearance="primary"
                icon={<SaveRegular />}
                disabled={importingRemote}
                onClick={() => void importRemote()}
              >
                {importingRemote ? '导入中…' : '导入为本地歌单'}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="把已加载内容快照为本地歌单" relationship="label">
              <Button icon={<SaveRegular />} disabled={saving || songs.length === 0} onClick={() => void saveLocal()}>
                保存为本地
              </Button>
            </Tooltip>
          )}
        </div>
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          {songs.length > 0 ? (
            <SongList songs={songs} showAlbum />
          ) : loading ? null : (
            <div className={styles.empty}>
              <HistoryRegular fontSize={40} />
              <Text size={400}>{platformImportable ? '歌单是空的或加载失败' : view.kind === 'fav' ? '收藏夹是空的' : '暂无播放记录'}</Text>
            </div>
          )}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Spinner />
            </div>
          )}
          {!loading && !hasMore && songs.length > 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                没有更多了
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function PlaylistsPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const animCls = anim !== 'none' ? `page-anim-${anim}` : undefined
  /** 歌单网格逐项入场 */
  const reveal = useRevealGroup()
  /** 在线卡片分散在同一网格里渲染;每次渲染前归零,保证错开顺序从 0 起 */
  const onlineSeqRef = useRef(0)
  onlineSeqRef.current = 0
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [importOpen, setImportOpen] = useState<'netease' | 'qq' | null>(null)
  const [biliLoginOpen, setBiliLoginOpen] = useState(false)
  const [neLoginOpen, setNeLoginOpen] = useState(false)
  const [nePlaylists, setNePlaylists] = useState<{ id: number; name: string; count: number }[]>([])
  const [qqPlaylists, setQqPlaylists] = useState<
    { id: number; name: string; coverUrl?: string; count: number }[]
  >([])
  const [importing, setImporting] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Playlist | null>(null)
  const [renameValue, setRenameValue] = useState('')
  /** 待删除确认的歌单(删除不可撤销,先确认) */
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null)
  /** 同步中歌单 id / 链接导入对话框 */
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  /** B站在线视图:登录后出现,打开时才拉数据 */
  const [biliFolders, setBiliFolders] = useState<
    { id: number; title: string; coverUrl?: string; songCount: number }[] | null
  >(null)
  const [remoteView, setRemoteView] = useState<RemoteView | null>(null)
  /** 收藏歌曲视图(收藏不是普通歌单,单独一屏) */
  const [favView, setFavView] = useState(false)
  const [favDeduping, setFavDeduping] = useState(false)
  /** 歌单分类筛选(all=全部) */
  const [category, setCategory] = useState<'all' | PlaylistCategory>('all')
  /** 歌单卡片右键菜单:目标歌单 + 跟随鼠标的定位锚点 */
  const [menuTarget, setMenuTarget] = useState<Playlist | null>(null)
  const ctxAnchorRef = useRef<HTMLSpanElement | null>(null)
  /** 重命名对话框的描述输入(与名称一起经 libraryUpdatePlaylist 保存) */
  const [descValue, setDescValue] = useState('')
  /** 歌单间移动歌曲对话框(add=把本歌单歌曲加到其他歌单 / remove=从其他歌单移除这些歌) */
  const [moveTarget, setMoveTarget] = useState<{ pl: Playlist; mode: 'add' | 'remove' } | null>(null)
  const [moveBusy, setMoveBusy] = useState(false)

  /** 登录B站后进入歌单页即拉收藏夹列表(仅元数据;内容点开才取) */
  useEffect(() => {
    if (!library?.biliProfile || biliFolders) return
    api
      .biliFavFolders()
      .then(setBiliFolders)
      .catch(() => setBiliFolders([]))
  }, [library?.biliProfile, biliFolders])

  /** 其它平台在线歌单:登录即自动列出(与B站收藏夹一致),点卡片导入 */
  const [onlinePls, setOnlinePls] = useState<OnlineBrief[]>([])
  const [onlineImporting, setOnlineImporting] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const collected: OnlineBrief[] = []
    const jobs: Promise<void>[] = []
    if (library?.neteaseProfile) {
      jobs.push(
        api
          .neteaseUserPlaylists()
          .then((r) => {
            if (r.ok && r.data)
              for (const d of r.data) collected.push({ ...d, platform: 'netease' as const })
          })
          .catch(() => {})
      )
    }
    if (library?.qqProfile) {
      jobs.push(
        api
          .qqUserPlaylists()
          .then((r) => {
            if (r.ok && r.data) for (const d of r.data) collected.push({ ...d, platform: 'qq' as const })
          })
          .catch(() => {})
      )
    }
    for (const kg of ['normal', 'concept'] as const) {
      const logged = kg === 'normal' ? library?.kugouProfile : library?.kugouConceptProfile
      if (!logged) continue
      const tag = kg === 'concept' ? '酷狗概念版歌单获取失败' : '酷狗歌单获取失败'
      jobs.push(
        api
          .kugouUserPlaylists(kg)
          .then((r) => {
            if (r.ok && r.data) collected.push(...r.data)
            else if (!r.ok) toastError(tag, r.error)
          })
          .catch((e) => toastError(tag, String(e)))
      )
    }
    if (library?.qishuiProfile) {
      jobs.push(
        api
          .qishuiUserPlaylists()
          .then((r) => {
            if (r.ok && r.data) for (const d of r.data) collected.push({ ...d, platform: 'qishui' as const })
            else if (!r.ok) toastError('汽水歌单获取失败', r.error)
          })
          .catch((e) => toastError('汽水歌单获取失败', String(e)))
      )
    }
    Promise.all(jobs).then(() => {
      if (!cancelled) setOnlinePls(collected)
    })
    return () => {
      cancelled = true
    }
  }, [library?.neteaseProfile, library?.qqProfile, library?.kugouProfile, library?.kugouConceptProfile, library?.qishuiProfile])

  /**
   * 在线卡片 platform → 查重键前缀。
   * 酷狗双身份(normal/concept)统一归入 kugou 家族:此前卡片用 `concept:<id>` 查重,
   * 而集合里存的是 `kugou:<id>`,永远查不中,导致每点一次来源卡片就重复导入一个歌单。
   */
  const sourceKeyPrefix = (platform: OnlineBrief['platform']): string =>
    platform === 'netease' ? 'netease' : platform === 'qq' ? 'qq' : platform === 'qishui' ? 'qishui' : 'kugou'

  /** 已导入的来源 id(避免在线卡片重复导入;key = 前缀:来源id) */
  const importedSourceIds = useMemo(() => {
    const s = new Set<string>()
    for (const pl of library?.playlists ?? []) {
      if (pl.neteasePlaylistId) s.add(`netease:${pl.neteasePlaylistId}`)
      if (pl.qqPlaylistId) s.add(`qq:${pl.qqPlaylistId}`)
      if (pl.kugouPlaylistId) s.add(`kugou:${pl.kugouPlaylistId}`)
      if (pl.qishuiPlaylistId) s.add(`qishui:${pl.qishuiPlaylistId}`)
    }
    return s
  }, [library?.playlists])

  const importOnline = async (b: OnlineBrief): Promise<void> => {
    const key = `${sourceKeyPrefix(b.platform)}:${b.id}`
    if (onlineImporting) return
    setOnlineImporting(key)
    try {
      let pl: Playlist | null = null
      if (b.platform === 'netease') pl = await api.importNeteasePlaylist(Number(b.id), b.name)
      else if (b.platform === 'qq') pl = await api.qqImportPlaylist(Number(b.id), b.name)
      else if (b.platform === 'qishui') {
        const r = await api.qishuiImportPlaylist(String(b.id), b.name)
        pl = r.ok ? (r.data ?? null) : null
        if (!r.ok) toastError('导入失败', r.error)
      }
      else pl = await api.kugouImportPlaylist(b.platform as KugouPlatform, String(b.id), b.name)
      if (pl) {
        await refresh()
        toastSuccess('导入成功', `${b.name} · ${pl.songIds.length} 首`)
      } else {
        toastError('导入失败', '内容为空或获取失败')
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setOnlineImporting(null)
    }
  }

  if (!library) return null

  /** 平台显隐设置:勾选隐藏的平台,其导入歌单与在线入口一并从列表消失 */
  const hiddenPlatforms = new Set(library.settings.hiddenPlaylistPlatforms ?? [])
  const platformVisible = (p: PlaylistCategory): boolean =>
    p === 'local' || !hiddenPlatforms.has(p as 'netease' | 'bili' | 'qq' | 'kugou' | 'qishui')
  const showVisibilityBtn =
    library.settings.hiddenPlaylistPlatforms?.length || library.playlists.some((pl) => pl.hidden)

  /** 分类过滤:本地歌单按来源标记;隐藏的歌单与被隐藏平台的歌单不进列表 */
  const visiblePlaylists = library.playlists.filter((pl) => {
    if (pl.hidden) return false
    const src = sourceOf(pl)
    if (!platformVisible(src)) return false
    return category === 'all' || src === category
  })
  const showLocalSection = category === 'all' || category === 'local'
  const showBiliSection = (category === 'all' || category === 'bili') && platformVisible('bili')
  const showNeteaseSection = (category === 'all' || category === 'netease') && platformVisible('netease')
  const showQishuiSection = (category === 'all' || category === 'qishui') && platformVisible('qishui')
  const showQqSection = (category === 'all' || category === 'qq') && platformVisible('qq')
  const showKugouSection = (category === 'all' || category === 'kugou') && platformVisible('kugou')

  /** 在线歌单卡片:已导入点开本地详情,未导入一键导入 */
  const onlineMeta: Record<OnlineBrief['platform'], { label: string; color: string; bg: string }> = {
    netease: { label: '网易云', color: '#ec4141', bg: 'rgba(236,65,65,0.15)' },
    qq: { label: 'QQ音乐', color: '#31c27c', bg: 'rgba(49,194,124,0.15)' },
    qishui: { label: '汽水', color: '#22c8b5', bg: 'rgba(34,200,181,0.15)' },
    normal: { label: '酷狗', color: '#00a9ff', bg: 'rgba(0,169,255,0.15)' },
    concept: { label: '酷狗概念版', color: '#7c6cff', bg: 'rgba(124,108,255,0.15)' }
  }
  const renderOnlineCard = (b: OnlineBrief) => {
    const key = `${sourceKeyPrefix(b.platform)}:${b.id}`
    const m = onlineMeta[b.platform]
    const localPl = importedSourceIds.has(key)
      ? library.playlists.find(
          (pl) =>
            (b.platform === 'netease' && pl.neteasePlaylistId === Number(b.id)) ||
            (b.platform === 'qq' && pl.qqPlaylistId === Number(b.id)) ||
            (b.platform === 'qishui' && pl.qishuiPlaylistId === String(b.id)) ||
            (b.platform !== 'netease' && b.platform !== 'qq' && b.platform !== 'qishui' && pl.kugouPlaylistId === String(b.id))
        )
      : undefined
    const busy = onlineImporting === key
    return (
      <RevealItem
        key={`online-${key}`}
        api={reveal}
        index={onlineSeqRef.current++}
        itemKey={key}
        className="bm-card"
      >
      <Card
        className={styles.card}
        onClick={() => {
          if (localPl) {
            setSelected(localPl)
            return
          }
          // 未导入:先打开预览(导入按钮在预览页,显式化,避免"点一下就生成歌单")
          if (b.platform === 'netease')
            setRemoteView({ kind: 'netease-pl', id: Number(b.id), title: b.name, coverUrl: b.coverUrl, count: b.count })
          else if (b.platform === 'qishui')
            setRemoteView({ kind: 'qishui', id: String(b.id), title: b.name, coverUrl: b.coverUrl, count: b.count })
          else if (b.platform === 'qq')
            setRemoteView({ kind: 'qq-pl', id: String(b.id), title: b.name, coverUrl: b.coverUrl, count: b.count })
          else void importOnline(b)
        }}
        onContextMenu={
          localPl
            ? (e) => {
                // 已导入的在线歌单:右键直接对本地副本提供 编辑/同步/删除 等操作
                onCardContextMenu(e, localPl)
              }
            : undefined
        }
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Cover url={b.coverUrl} size={56} radius={8} iconSize={24} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text
              weight="semibold"
              style={{
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {b.name}
            </Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {m.label} · {b.count} 首{localPl ? ' · 已导入' : ''}
            </Text>
          </div>
          {busy ? <Spinner size="tiny" /> : null}
        </div>
      </Card>
      </RevealItem>
    )
  }

  /** 同步一个歌单(远端增量拉取,保留手动加入的歌曲) */
  const syncOne = async (pl: Playlist): Promise<void> => {
    if (syncingId) return
    setSyncingId(pl.id)
    try {
      const r = await api.librarySyncPlaylist(pl.id)
      if (r.ok && r.data) {
        await refresh()
        toastSuccess(
          '同步完成',
          `新增 ${r.data.added} 首 · 移除 ${r.data.removed} 首 · 共 ${r.data.total} 首`
        )
      } else {
        toastError('同步失败', r.error)
      }
    } catch (e) {
      toastError('同步失败', String(e))
    } finally {
      setSyncingId(null)
    }
  }

  /** 通过分享链接导入歌单(网易云/QQ音乐/酷狗) */
  const importByLink = async (): Promise<void> => {
    const v = linkValue.trim()
    if (!v || linkBusy) return
    setLinkBusy(true)
    try {
      const r = await api.playlistImportByLink(v)
      if (r.ok && r.data) {
        await refresh()
        toastSuccess('歌单已导入', `${r.data.name} · ${r.data.count} 首`)
        setLinkOpen(false)
        setLinkValue('')
      } else {
        toastError('导入失败', r.error)
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setLinkBusy(false)
    }
  }

  const openNeteaseImport = async () => {
    if (!library.neteaseProfile) {
      setNeLoginOpen(true)
      return
    }
    setImportOpen('netease')
    setNePlaylists([])
    const list = await api.neteaseUserPlaylists()
    if (list.ok && list.data) setNePlaylists(list.data)
    else toastError('获取歌单失败', list.error)
  }

  /** 打开 QQ 歌单导入(未登录时提示去设置页登录) */
  const openQqImport = async () => {
    if (!library.qqProfile) {
      toastError('未登录 QQ 音乐', '请到「设置 → 账号」登录 QQ 音乐后重试')
      return
    }
    setImportOpen('qq')
    setQqPlaylists([])
    const list = await api.qqUserPlaylists()
    if (list.ok && list.data) setQqPlaylists(list.data)
    else toastError('获取歌单失败', list.error ?? '未知错误')
  }

  const doImportQq = async (id: number, name: string) => {
    setImporting(true)
    try {
      const pl = await api.qqImportPlaylist(id, name)
      if (pl) {
        await refresh()
        toastSuccess('导入成功', `${name} · ${pl.songIds.length} 首`)
        setImportOpen(null)
      } else {
        toastError('导入失败', '内容为空或获取失败')
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setImporting(false)
    }
  }

  const doImport = async (id: number, name: string) => {
    setImporting(true)
    try {
      const pl = await api.importNeteasePlaylist(id, name)
      if (pl) {
        await refresh()
        toastSuccess('导入成功', `${name} · ${pl.songIds.length} 首`)
        setImportOpen(null)
      } else {
        toastError('导入失败', '内容为空或获取失败')
      }
    } catch (e) {
      toastError('导入失败', String(e))
    } finally {
      setImporting(false)
    }
  }

  const createPlaylist = async () => {
    const name = newName.trim()
    if (!name) return
    await api.libraryCreatePlaylist(name)
    setNewName('')
    setCreateOpen(false)
    await refresh()
    toastSuccess('歌单已创建', name)
  }

  const deletePlaylist = async (pl: Playlist) => {
    await api.libraryDeletePlaylist(pl.id)
    setDeleteTarget(null)
    setSelected(null)
    await refresh()
    toastSuccess('歌单已删除', pl.name)
  }

  const renamePlaylist = async () => {
    if (!renameTarget) return
    await api.libraryUpdatePlaylist({
      id: renameTarget.id,
      name: renameValue.trim() || renameTarget.name,
      description: descValue
    })
    setRenameTarget(null)
    await refresh()
  }

  /** 去掉收藏里的重复曲目(旧版换源把 id 换成新平台 id 造成的同曲多条) */
  const dedupeFavorites = async () => {
    if (favDeduping) return
    setFavDeduping(true)
    try {
      const r = await api.libraryDedupeFavorites()
      await refresh()
      if (r.removed > 0) toastSuccess('已去除重复', `移除 ${r.removed} 首,剩余 ${r.total} 首`)
      else toastSuccess('没有重复', `共 ${r.total} 首`)
    } finally {
      setFavDeduping(false)
    }
  }

  // ===== 歌单卡片右键菜单 =====
  /** 右键歌单卡片:记录目标并把隐藏锚点移到鼠标处(菜单定位用,与歌曲列表右键同款交互) */
  const onCardContextMenu = (e: ReactMouseEvent<HTMLDivElement>, pl: Playlist): void => {
    e.preventDefault()
    const anchor = ctxAnchorRef.current
    if (anchor) {
      anchor.style.left = `${e.clientX}px`
      anchor.style.top = `${e.clientY}px`
    }
    setMenuTarget(pl)
  }

  /** 打开重命名/描述对话框(详情页按钮与右键菜单共用) */
  const openRenameDialog = (p: Playlist): void => {
    setRenameValue(p.name)
    setDescValue(p.description ?? '')
    setRenameTarget(p)
  }

  /** 歌单显隐:不删除,只是从列表里收起;「显示设置」浮层可恢复 */
  const togglePlaylistHidden = async (pl: Playlist): Promise<void> => {
    try {
      await api.libraryUpdatePlaylist({
        id: pl.id,
        name: pl.name,
        description: pl.description ?? '',
        hidden: !pl.hidden
      })
      await refresh()
    } catch (e) {
      toastError('操作失败', String(e))
    }
  }

  /** 把某歌单的歌曲批量 添加到 / 从 其他歌单移动 */
  const moveSongs = async (target: Playlist): Promise<void> => {
    if (!moveTarget || moveBusy || !library) return
    const songs = moveTarget.pl.songIds.map((id) => library.songs[id]).filter((s): s is Song => !!s)
    if (songs.length === 0) return
    setMoveBusy(true)
    try {
      if (moveTarget.mode === 'add') {
        await api.libraryAddToPlaylist(target.id, songs)
        toastSuccess('已添加到歌单', `「${target.name}」新增 ${songs.length} 首`)
      } else {
        const inTarget = new Set(target.songIds)
        const hit = songs.filter((s) => inTarget.has(s.id))
        for (const s of hit) await api.libraryRemoveFromPlaylist(target.id, s.id)
        toastSuccess(
          '已从歌单移除',
          hit.length > 0 ? `「${target.name}」移除 ${hit.length} 首` : `「${target.name}」中没有这些歌曲`
        )
      }
      await refresh()
      setMoveTarget(null)
    } catch (e) {
      toastError('操作失败', String(e))
    } finally {
      setMoveBusy(false)
    }
  }

  /** 重命名/描述 + 删除确认 + 歌单间移动歌曲:详情页与列表页(右键菜单)共用 */
  const editDialogs = (
    <>
      <Dialog open={!!deleteTarget} onOpenChange={(_, d) => !d.open && setDeleteTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>删除歌单</DialogTitle>
            <DialogContent>
              <Text>
                确定删除歌单「{deleteTarget?.name}」吗?
                {deleteTarget && deleteTarget.songIds.length > 0
                  ? `歌单内 ${deleteTarget.songIds.length} 首歌曲将一并移除引用,`
                  : ''}
                该操作不可撤销(歌曲本身不会从曲库移除)。
              </Text>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button
                appearance="primary"
                onClick={() => deleteTarget && void deletePlaylist(deleteTarget)}
              >
                删除
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(_, d) => !d.open && setRenameTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>重命名 / 编辑描述</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input
                  placeholder="歌单名称"
                  value={renameValue}
                  onChange={(_, d) => setRenameValue(d.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void renamePlaylist()}
                  style={{ width: '100%' }}
                />
                <Input
                  placeholder="描述(可选)"
                  value={descValue}
                  onChange={(_, d) => setDescValue(d.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRenameTarget(null)}>取消</Button>
              <Button appearance="primary" onClick={() => void renamePlaylist()}>
                确定
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={(_, d) => !d.open && setMoveTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {moveTarget?.mode === 'add' ? '添加歌曲到其他歌单' : '从其他歌单移除歌曲'}
            </DialogTitle>
            <DialogContent>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                对「{moveTarget?.pl.name}」的 {moveTarget?.pl.songIds.length ?? 0} 首歌曲执行
                {moveTarget?.mode === 'add' ? '添加' : '移除'},点击目标歌单即执行:
              </Text>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 320,
                  overflowY: 'auto',
                  marginTop: 8
                }}
              >
                {(library?.playlists ?? [])
                  .filter((p) => p.id !== moveTarget?.pl.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: tokens.borderRadiusMedium,
                        cursor: 'pointer'
                      }}
                      onClick={() => !moveBusy && void moveSongs(p)}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: tokens.colorNeutralForeground3 }}>{p.songIds.length} 首</span>
                    </div>
                  ))}
                {moveTarget &&
                  (library?.playlists ?? []).filter((p) => p.id !== moveTarget.pl.id).length === 0 && (
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3, padding: '8px 12px' }}>
                      没有其他歌单
                    </Text>
                  )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMoveTarget(null)}>关闭</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )

  /** 歌单卡片右键菜单(受控,锚点跟随鼠标;菜单项见 onCardContextMenu / menuTarget) */
  const playlistContextMenu = (
    <>
      <span
        ref={ctxAnchorRef}
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <Menu
        open={!!menuTarget}
        onOpenChange={(_, d) => {
          if (!d.open) setMenuTarget(null)
        }}
        positioning={{ target: menuTarget ? ctxAnchorRef.current : undefined }}
      >
        <MenuTrigger disableButtonEnhancement>
          <span style={{ display: 'none' }} />
        </MenuTrigger>
        <MenuPopover>
          {menuTarget && (
            <>
              <MenuItem
                icon={<OpenRegular />}
                onClick={() => {
                  setMenuTarget(null)
                  setSelected(menuTarget)
                }}
              >
                打开歌单
              </MenuItem>
              <MenuItem
                icon={<EditRegular />}
                onClick={() => {
                  setMenuTarget(null)
                  openRenameDialog(menuTarget)
                }}
              >
                重命名 / 编辑描述
              </MenuItem>
              {isSyncable(menuTarget) && (
                <MenuItem
                  icon={
                    syncingId === menuTarget.id ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />
                  }
                  disabled={syncingId !== null}
                  onClick={() => {
                    setMenuTarget(null)
                    void syncOne(menuTarget)
                  }}
                >
                  同步来源歌单
                </MenuItem>
              )}
              {menuTarget.songIds.length > 0 && (
                <MenuItem
                  icon={<FolderAddRegular />}
                  onClick={() => {
                    setMenuTarget(null)
                    setMoveTarget({ pl: menuTarget, mode: 'add' })
                  }}
                >
                  添加歌曲到其他歌单
                </MenuItem>
              )}
              {menuTarget.songIds.length > 0 && (
                <MenuItem
                  icon={<SubtractRegular />}
                  onClick={() => {
                    setMenuTarget(null)
                    setMoveTarget({ pl: menuTarget, mode: 'remove' })
                  }}
                >
                  从其他歌单移除
                </MenuItem>
              )}
              <MenuItem
                icon={menuTarget.hidden ? <EyeRegular /> : <EyeOffRegular />}
                onClick={() => {
                  const t = menuTarget
                  setMenuTarget(null)
                  void togglePlaylistHidden(t)
                }}
              >
                {menuTarget.hidden ? '恢复显示' : '在列表中隐藏'}
              </MenuItem>
              <MenuItem
                icon={<DeleteRegular />}
                onClick={() => {
                  setMenuTarget(null)
                  setDeleteTarget(menuTarget)
                }}
              >
                删除歌单
              </MenuItem>
            </>
          )}
        </MenuPopover>
      </Menu>
    </>
  )

  // ===== B站在线视图(登录即出现,打开才拉数据) =====
  if (remoteView) {
    return <RemotePlaylistDetail view={remoteView} onBack={() => setRemoteView(null)} />
  }

  // ===== 收藏歌曲 =====
  if (favView) {
    const favSongs: Song[] = (library.favoriteIds ?? [])
      .map((id) => library.songs[id])
      .filter((s): s is Song => !!s)
    return (
      <div
        key="favorites-view"
        className={animCls}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <PageLayout
          icon={<HeartFilled />}
          title="收藏歌曲"
          subtitle={`共 ${favSongs.length} 首`}
          actions={
            <>
              <Button icon={<ArrowLeftRegular />} onClick={() => setFavView(false)}>
                返回
              </Button>
              <Button
                icon={<ArrowSyncRegular />}
                disabled={favDeduping}
                onClick={() => void dedupeFavorites()}
              >
                {favDeduping ? '整理中…' : '去除重复'}
              </Button>
              <Button
                appearance="primary"
                icon={<PlayRegular />}
                disabled={favSongs.length === 0}
                onClick={() => void playQueue(favSongs, 0)}
              >
                播放全部
              </Button>
            </>
          }
        >
          {favSongs.length === 0 ? (
            <div className={styles.empty}>
              <HeartFilled fontSize={40} style={{ opacity: 0.3 }} />
              <Text size={400}>还没有收藏的歌曲</Text>
              <Text size={200}>在歌曲列表、播放条或全屏播放页点 ♡ 即可收藏</Text>
            </div>
          ) : (
            <SongList songs={favSongs} showAlbum />
          )}
        </PageLayout>
      </div>
    )
  }

  // ===== 歌单详情(进出有过渡动画:key 变化触发重挂载) =====
  if (selected) {
    const current = library.playlists.find((p) => p.id === selected.id)
    const songs: Song[] = (current?.songIds ?? [])
      .map((id) => library.songs[id])
      .filter(Boolean)
    return (
      <div
        key={`detail-${selected.id}`}
        className={animCls}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
      <PlaylistDetailBody
        playlist={current ?? null}
        songs={songs}
        onBack={() => setSelected(null)}
        syncingId={syncingId}
        onSync={(p) => void syncOne(p)}
        onRename={(p) => openRenameDialog(p)}
        onDelete={(p) => setDeleteTarget(p)}
        onRemoveSong={async (song) => {
          await api.libraryRemoveFromPlaylist(current!.id, song.id)
          await refresh()
        }}
      />
      {editDialogs}
      <BiliLoginDialog open={biliLoginOpen} onClose={() => setBiliLoginOpen(false)} />
      <NeteaseLoginDialog open={neLoginOpen} onClose={() => setNeLoginOpen(false)} />
      </div>
    )
  }

  // ===== 歌单列表 =====
  return (
    <div
      key="list"
      className={animCls}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
    <PageLayout
      icon={<MusicNote2Regular />}
      title="我的歌单"
      subtitle={`${library.playlists.length} 个歌单 · 收藏 ${library.favoriteIds?.length ?? 0} 首`}
      actions={
        <>
          <Button icon={<CloudArrowDownRegular />} onClick={openNeteaseImport}>
            导入网易云歌单
          </Button>
          <Button icon={<CloudArrowDownRegular />} onClick={openQqImport}>
            导入QQ歌单
          </Button>
          <Button icon={<OpenRegular />} onClick={() => setLinkOpen(true)}>
            链接导入
          </Button>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setCreateOpen(true)}>
            新建歌单
          </Button>
        </>
      }
    >
      {/* 分类筛选:全部 / 本地 / 网易云 / B站 / QQ / 酷狗 / 汽水 + 显示设置 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {(
          [
            ['all', '全部'],
            ['local', '本地'],
            ['netease', '网易云'],
            ['bili', 'B站'],
            ['qq', 'QQ音乐'],
            ['kugou', '酷狗'],
            ['qishui', '汽水']
          ] as const
        ).map(([key, label]) => (
          <ToggleButton
            key={key}
            size="small"
            appearance={category === key ? 'primary' : 'subtle'}
            onClick={() => setCategory(key)}
          >
            {label}
          </ToggleButton>
        ))}
        <Popover>
          <PopoverTrigger disableButtonEnhancement>
            <Button
              size="small"
              appearance={showVisibilityBtn ? 'primary' : 'subtle'}
              icon={<EyeOffRegular />}
              title="按平台/按歌单隐藏"
            >
              显示设置
            </Button>
          </PopoverTrigger>
          <PopoverSurface style={{ maxWidth: 320 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4, minWidth: 260 }}>
              <Text weight="semibold" size={300}>
                按平台显示
              </Text>
              {(
                [
                  ['netease', '网易云'],
                  ['bili', 'B站'],
                  ['qq', 'QQ音乐'],
                  ['kugou', '酷狗'],
                  ['qishui', '汽水']
                ] as const
              ).map(([key, label]) => (
                <Switch
                  key={key}
                  label={label}
                  checked={platformVisible(key)}
                  onChange={(_, d) => {
                    const next = new Set(hiddenPlatforms)
                    if (d.checked) next.delete(key)
                    else next.add(key)
                    useStore.getState().updateSetting('hiddenPlaylistPlatforms', [...next])
                  }}
                />
              ))}
              {library.playlists.some((pl) => pl.hidden) && (
                <>
                  <Text weight="semibold" size={300} style={{ marginTop: 6 }}>
                    已隐藏的歌单
                  </Text>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {library.playlists
                      .filter((pl) => pl.hidden)
                      .map((pl) => (
                        <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text size={300} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pl.name}
                          </Text>
                          <Button
                            size="small"
                            appearance="subtle"
                            onClick={() => void togglePlaylistHidden(pl)}
                          >
                            恢复
                          </Button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </PopoverSurface>
        </Popover>
      </div>

      {/* 歌单网格:本地歌单与B站在线条目同层级混排 */}
      <div className={styles.grid}>
        {/* 收藏歌曲:不是普通歌单(只存 id 列表),单列一张卡片入口 */}
        {showLocalSection && (
        <Card
          key="favorites"
          className={styles.card}
          onClick={() => setFavView(true)}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                background: 'rgba(232,67,90,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: tokens.colorPaletteRedForeground1,
                flexShrink: 0
              }}
            >
              <HeartFilled fontSize={24} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Text
                weight="semibold"
                style={{
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                收藏歌曲
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {library.favoriteIds?.length ?? 0} 首
              </Text>
            </div>
          </div>
        </Card>
        )}
        {visiblePlaylists.map((pl, i) => (
          // Fluent Card 不透传 className/data-*,入场与视觉都放在外层 wrapper 上
          <RevealItem key={pl.id} api={reveal} index={i} itemKey={pl.id} className="bm-card">
          <Card
            className={styles.card}
            onClick={() => setSelected(pl)}
            onContextMenu={(e) => onCardContextMenu(e, pl)}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Cover url={pl.coverUrl} size={56} radius={8} iconSize={24} />
              <div style={{ minWidth: 0 }}>
                <Text
                  weight="semibold"
                  style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {pl.name}
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {pl.songIds.length} 首
                </Text>
              </div>
            </div>
          </Card>
          </RevealItem>
        ))}

        {/* B站在线条目:登录即出现,打开才拉数据 */}
        {showBiliSection && (library.biliProfile ? (
          <>
            <Card key="bili-history" className={styles.card} onClick={() => setRemoteView({ kind: 'history' })}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: 'rgba(251,114,153,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fb7299',
                    flexShrink: 0
                  }}
                >
                  <HistoryRegular fontSize={24} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text
                    weight="semibold"
                    style={{
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    播放记录
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    最近观看 · 下翻加载
                  </Text>
                </div>
              </div>
            </Card>
            {(biliFolders ?? []).map((f, i) => (
              <RevealItem key={`bili-fav-${f.id}`} api={reveal} index={100 + i} itemKey={`bili-${f.id}`} className="bm-card">
              <Card
                className={styles.card}
                onClick={() =>
                  setRemoteView({ kind: 'fav', id: f.id, title: f.title, coverUrl: f.coverUrl, count: f.songCount })
                }
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Cover url={f.coverUrl} size={56} radius={8} iconSize={24} />
                  <div style={{ minWidth: 0 }}>
                    <Text
                      weight="semibold"
                      style={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {f.title}
                    </Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      收藏夹 · {f.songCount} 个
                    </Text>
                  </div>
                </div>
              </Card>
              </RevealItem>
            ))}
            {biliFolders === null && (
              <div style={{ padding: 12 }}>
                <Spinner />
              </div>
            )}
          </>
        ) : (
          <Card className={styles.card} onClick={() => setBiliLoginOpen(true)}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(251,114,153,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fb7299',
                  flexShrink: 0
                }}
              >
                <QrCodeRegular fontSize={24} />
              </div>
              <div>
                <Text weight="semibold">登录哔哩哔哩</Text>
                <div>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    登录后这里会显示你的收藏夹与播放记录
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {/* 网易云云端播放记录(听歌排行):登录即出现,打开才拉数据 */}
        {showNeteaseSection && library.neteaseProfile && (
          <Card key="netease-record" className={styles.card} onClick={() => setRemoteView({ kind: 'netease-record' })}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(230,33,41,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e62129',
                  flexShrink: 0
                }}
              >
                <HistoryRegular fontSize={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <Text
                  weight="semibold"
                  style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  播放记录
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  网易云听歌排行 · 最近一周优先
                </Text>
              </div>
            </div>
          </Card>
        )}

        {/* QQ音乐最近播放:登录即出现,打开才拉数据 */}
        {showQqSection && library.qqProfile && (
          <Card key="qq-record" className={styles.card} onClick={() => setRemoteView({ kind: 'qq-record' })}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(12,193,242,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0cc1f2',
                  flexShrink: 0
                }}
              >
                <HistoryRegular fontSize={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <Text
                  weight="semibold"
                  style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  播放记录
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  QQ音乐最近播放 · 网页端接口
                </Text>
              </div>
            </div>
          </Card>
        )}

        {/* 其他平台在线歌单:登录即自动列出(与B站收藏夹一致),点卡片一键导入,已导入点开详情 */}
        {showNeteaseSection && onlinePls.filter((b) => b.platform === 'netease').map(renderOnlineCard)}
        {showQishuiSection && onlinePls.filter((b) => b.platform === 'qishui').map(renderOnlineCard)}
        {showQqSection && onlinePls.filter((b) => b.platform === 'qq').map(renderOnlineCard)}
        {showKugouSection &&
          onlinePls.filter((b) => b.platform === 'normal' || b.platform === 'concept').map(renderOnlineCard)}
      </div>
      {library.playlists.length === 0 && !library.biliProfile && (
        <div className={styles.empty}>
          <MusicNote2Regular fontSize={40} />
          <Text size={400}>还没有歌单</Text>
          <Text size={300}>新建一个,或导入你的网易云歌单</Text>
        </div>
      )}

      {/* 新建歌单 */}
      <Dialog open={createOpen} onOpenChange={(_, d) => !d.open && setCreateOpen(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>新建歌单</DialogTitle>
            <DialogContent>
              <Input
                placeholder="歌单名称"
                value={newName}
                onChange={(_, d) => setNewName(d.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                style={{ width: '100%' }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={createPlaylist} disabled={!newName.trim()}>
                创建
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 导入网易云歌单 */}
      <Dialog open={importOpen === 'netease'} onOpenChange={(_, d) => !d.open && setImportOpen(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>导入网易云歌单</DialogTitle>
            <DialogContent>
              {nePlaylists.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <Spinner />
                </div>
              ) : (
                <div className="bm-stagger-in" style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nePlaylists.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: tokens.borderRadiusMedium,
                        cursor: 'pointer'
                      }}
                      onClick={() => !importing && doImport(p.id, p.name)}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: tokens.colorNeutralForeground3 }}>{p.count} 首</span>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setImportOpen(null)}>取消</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 导入QQ歌单(登录用户的自建+收藏歌单) */}
      <Dialog open={importOpen === 'qq'} onOpenChange={(_, d) => !d.open && setImportOpen(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>导入QQ歌单</DialogTitle>
            <DialogContent>
              {qqPlaylists.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <Spinner />
                </div>
              ) : (
                <div className="bm-stagger-in" style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {qqPlaylists.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: tokens.borderRadiusMedium,
                        cursor: 'pointer'
                      }}
                      onClick={() => !importing && doImportQq(p.id, p.name)}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: tokens.colorNeutralForeground3 }}>{p.count} 首</span>
                    </div>
                  ))}
                </div>
              )}
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: 8 }}>
                导入后支持同步:歌单卡片上的同步按钮会拉取远端最新曲目。
              </Text>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setImportOpen(null)}>取消</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 通过分享链接导入歌单(网易云 / QQ音乐 / 酷狗) */}
      <Dialog open={linkOpen} onOpenChange={(_, d) => !d.open && setLinkOpen(false)}>
        <DialogSurface style={{ maxWidth: 560 }}>
          <DialogBody>
            <DialogTitle>通过链接导入歌单</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                <Input
                  value={linkValue}
                  placeholder="粘贴歌单分享链接(网易云 / QQ音乐 / 酷狗)"
                  onChange={(_, d) => setLinkValue(d.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void importByLink()}
                />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, lineHeight: 1.7 }}>
                  网易云: music.163.com/#/playlist?id=xxx、163cn.tv 短链(可同步)；
                  QQ音乐: y.qq.com/n/ryqq/playlist/xxx；
                  酷狗: kugou.com 歌单链接。
                  <br />
                  QQ音乐/酷狗歌曲仅存曲目信息:播放时自动经哔哩哔哩搜索音源,歌词取自网易云。
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setLinkOpen(false)}>取消</Button>
              <Button
                appearance="primary"
                disabled={linkBusy || !linkValue.trim()}
                onClick={() => void importByLink()}
              >
                {linkBusy ? <Spinner size="tiny" /> : '导入'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <BiliLoginDialog open={biliLoginOpen} onClose={() => setBiliLoginOpen(false)} />
      <NeteaseLoginDialog open={neLoginOpen} onClose={() => setNeLoginOpen(false)} />
      {/* 歌单卡片右键菜单 + 重命名/删除/移动歌曲对话框 */}
      {playlistContextMenu}
      {editDialogs}
    </PageLayout>
    </div>
  )
}

/** 听歌时长人性化文案:3600000→"1 小时 5 分"、120000→"2 分" */
function fmtListenMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分`
  return `${Math.floor(ms / 1000)} 秒`
}

/** 最近播放页(与下载页统一布局) */
export function RecentPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  /** 音源加载中禁用播放键 */
  const playerLoading = useStore((s) => s.loading)
  if (!library) return null
  const songs = library.recentPlays.map((r) => r.song)
  const ls = library.listenStats
  const listenPart =
    ls && ls.totalMs > 0 ? ` · 今日听歌 ${fmtListenMs(ls.todayMs)} · 累计 ${fmtListenMs(ls.totalMs)}` : ''
  const subtitle =
    songs.length > 0
      ? `${songs.length} 首${listenPart}`
      : ls && ls.totalMs > 0
        ? `今日听歌 ${fmtListenMs(ls.todayMs)} · 累计 ${fmtListenMs(ls.totalMs)}`
        : '播放过的歌曲会出现在这里'
  return (
    <PageLayout
      icon={<HeartRegular />}
      title="最近播放"
      subtitle={subtitle}
      actions={
        <>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={songs.length === 0 || playerLoading}
            onClick={() => playQueue(songs, 0)}
          >
            播放全部
          </Button>
          <Button
            icon={<DeleteRegular />}
            disabled={songs.length === 0}
            onClick={async () => {
              await api.libraryClearRecent()
              await refresh()
            }}
          >
            清空
          </Button>
        </>
      }
    >
      {songs.length > 0 ? (
        <SongList songs={songs} showAlbum />
      ) : (
        <div className={styles.empty}>
          <HeartRegular fontSize={40} />
          <Text size={400}>暂无播放记录</Text>
          <Text size={300}>单击搜索结果或歌单中的歌曲开始播放</Text>
        </div>
      )}
    </PageLayout>
  )
}
