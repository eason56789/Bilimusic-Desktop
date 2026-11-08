/** 播放器功能弹窗组:评论/分P/详情/歌词编辑/更换歌词/歌词偏移/播放队列/均衡器 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Radio,
  RadioGroup,
  Slider,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  ArrowClockwiseRegular,
  ChatMultipleRegular,
  DeleteRegular,
  DismissRegular,
  InfoRegular,
  PlayRegular,
  SearchRegular
} from '@fluentui/react-icons'
import type { BiliPage, CommentOrder, CommentPlatform, CommentsResult, Song, SongHotResult } from '@shared/types'
import { api } from '../lib/api'
import { pagesToSongs } from '../lib/pages'
import { formatCount } from '../lib/format'
import { useStore, EQ_FREQS, applyEqSettings } from '../store'
import { toastError, toastSuccess } from '../lib/toast'
import { Cover } from './Cover'
import { formatTime } from './SongList'

/** ===== 评论区专用配色 =====
 * 评论固定用深色玻璃底 + 白字:不随浅色/深色主题变化(与全屏播放页观感一致),
 * 因此这里不用 Fluent token,直接写死颜色。 */
const C_TEXT = '#ffffff'
const C_TEXT_DIM = 'rgba(255,255,255,0.62)'
const C_TEXT_FAINT = 'rgba(255,255,255,0.42)'
const C_ROW_HOVER = 'rgba(255,255,255,0.08)'

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '420px', overflowY: 'auto' },
  /** 面板模式:列表撑满剩余高度(不设420上限) */
  listFill: { maxHeight: 'none', flex: 1, minHeight: 0 },
  sortRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
    flexShrink: 0
  },
  dialogColumn: { display: 'flex', flexDirection: 'column', minHeight: '240px' },
  row: {
    display: 'flex',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    alignItems: 'flex-start',
    transition: 'background 0.15s ease',
    ':hover': { background: C_ROW_HOVER }
  },
  meta: { flex: 1, minWidth: 0 },
  muted: { color: C_TEXT_DIM, fontSize: tokens.fontSizeBase200 },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '24px 0'
  },
  kv: { display: 'flex', gap: '12px', padding: '4px 0' },
  k: { width: '96px', color: tokens.colorNeutralForeground3, flexShrink: 0 },
  v: { flex: 1, minWidth: 0, wordBreak: 'break-all' },
  eqGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px 16px', padding: '8px 0' },
  eqBand: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  offsetRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' },
  /** 评论内容容器:固定白字(深浅主题一致);弹窗版自带深色底,面板版由全屏页玻璃底承担 */
  commentShell: {
    color: C_TEXT,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  /** 弹窗版的深色玻璃底 */
  commentShellBoxed: {
    background: 'rgba(24,24,26,0.94)',
    borderRadius: '12px',
    padding: '12px 14px'
  }
})

function timeAgo(t: number): string {
  if (!t) return ''
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(t).toLocaleDateString()
}

/** QQ 评论里的表情码([em]e400824[/em])渲染成官方表情图;其余文本原样输出 */
const QQ_EM_RE = /[em](ed+)[/em]/g
function CommentContent({ text, color }: { text: string; color: string }) {
  const raw = text ?? ''
  if (!raw.includes('[em]')) {
    return (
      <Text size={300} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {raw}
      </Text>
    )
  }
  const parts: JSX.Element[] = []
  let last = 0
  let m: RegExpExecArray | null
  QQ_EM_RE.lastIndex = 0
  while ((m = QQ_EM_RE.exec(raw))) {
    if (m.index > last) {
      parts.push(<span key={`t${last}`}>{raw.slice(last, m.index)}</span>)
    }
    parts.push(
      <img
        key={`e${m.index}`}
        src={`https://qzonestyle.gtimg.cn/qzone/em/${m[1]}.png`}
        alt=""
        style={{ width: 18, height: 18, verticalAlign: '-3px', display: 'inline-block' }}
      />
    )
    last = m.index + m[0].length
  }
  if (last < raw.length) parts.push(<span key={`t${last}`}>{raw.slice(last)}</span>)
  return (
    <Text size={300} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts}
    </Text>
  )
}

/** 评论内容(状态自持):排序切换 + 列表 + 加载更多。弹窗与右侧停靠面板共用。
 *  字体固定白色:不跟随深色/浅色主题(弹窗版带深色底,面板版依托全屏页玻璃底)。 */
export function CommentsBody({
  song,
  active,
  fill = false,
  boxed = false,
  onClose
}: {
  song: Song | null
  /** 是否正在展示(挂载但隐藏时不发请求) */
  active: boolean
  /** 面板模式:列表撑满容器高度 */
  fill?: boolean
  /** 弹窗模式:自带深色玻璃底(全屏页面板不传,由页面玻璃底承担) */
  boxed?: boolean
  /** 面板右上角关闭按钮(弹窗版不传) */
  onClose?: () => void
}) {
  const styles = useStyles()
  const [data, setData] = useState<CommentsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  // 默认排序:网易云原曲默认"时间"(公开接口的热门池太浅),B站默认"热度"
  const [order, setOrder] = useState<CommentOrder>(() => (song?.neteaseId ? 'time' : 'hot'))
  // 兜底场景双/多平台可切:B站兜底视频评论 / 网易云原曲评论 / QQ音乐原生评论
  const [platform, setPlatform] = useState<CommentPlatform>(() =>
    song?.source === 'QQMUSIC' ? 'qq' : song?.neteaseId ? 'netease' : song?.bvid ? 'bilibili' : 'netease'
  )
  // 三个来源始终列出:主进程会按同名曲跨平台解析(B站无 bvid / QQ 无 id 时自动搜索)
  const canBili = true
  const canNe = true
  const canQq = true
  const dual = true
  /** 滑到底自动加载的防重入(滚动事件密集,不能只靠 loading state) */
  const loadingRef = useRef(false)
  // 首次拿到歌曲/换歌时校准默认排序:挂载时 song 常为 null,一次性初始化算不准;
  // 同一首歌内保留用户手动选择,换下一首时重置为该来源的默认
  const lastSongIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!song) return
    if (lastSongIdRef.current === song.id) return
    lastSongIdRef.current = song.id
    const def: CommentOrder = song.neteaseId && song.source !== 'QQMUSIC' ? 'time' : 'hot'
    setOrder((o) => (o === def ? o : def))
    const defPlat: CommentPlatform =
      song.source === 'QQMUSIC' ? 'qq' : song.neteaseId ? 'netease' : song.bvid ? 'bilibili' : 'netease'
    setPlatform((p) => (p === defPlat ? p : defPlat))
  }, [song])

  useEffect(() => {
    if (!active || !song) return
    setData(null)
    setOffset(0)
    setError('')
    setLoading(true)
    api
      .commentsGet(song, 0, order, platform)
      .then((r) => {
        if (r.ok && r.data) setData(r.data)
        else setError(r.error || '加载失败')
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [active, song, order, dual, platform])

  const loadMore = async () => {
    if (!song || !data || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const r = await api.commentsGet(song, offset + 20, order, platform)
      if (r.ok && r.data) {
        setData({ ...r.data, comments: [...data.comments, ...r.data.comments] })
        setOffset(offset + 20)
      }
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  if (!song) return null
  const emptyText = order === 'hot' ? '还没有热门评论,可切换到「时间」查看最新' : '还没有评论'
  /** 单选标签(平台/排序):固定白字,不随主题 */
  const wLabel = (t: string): JSX.Element => <span style={{ color: C_TEXT }}>{t}</span>
  return (
    <div className={`${styles.commentShell} ${boxed ? styles.commentShellBoxed : ''}`}>
      {dual && (
        <div className={styles.sortRow} style={{ marginBottom: '4px' }}>
          <RadioGroup
            layout="horizontal"
            value={platform}
            onChange={(_, d) => setPlatform(d.value as CommentPlatform)}
          >
            <Radio value="bilibili" label={wLabel('哔哩哔哩')} />
            <Radio value="netease" label={wLabel('网易云')} />
            <Radio value="qq" label={wLabel('QQ音乐')} />
          </RadioGroup>
          <div style={{ flex: 1 }} />
        </div>
      )}
      <div className={styles.sortRow}>
        <RadioGroup
          layout="horizontal"
          value={order}
          onChange={(_, d) => setOrder(d.value as CommentOrder)}
        >
          <Radio value="hot" label={wLabel('热度')} />
          <Radio value="time" label={wLabel('时间')} />
        </RadioGroup>
        <div style={{ flex: 1 }} />
        {data && data.comments.length > 0 && (
          <span className={styles.muted}>
            {/* 网易云热度榜无分页,total 是热门池条数而非全曲评论数,标注避免误读 */}
            {song.neteaseId && order === 'hot' ? `热门 ${data.total} 条` : `${data.total} 条`}
          </span>
        )}
        {onClose && (
          <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onClose} title="关闭评论" style={{ color: C_TEXT }} />
        )}
      </div>
      {loading && !data && (
        <div className={styles.center}>
          <Spinner />
        </div>
      )}
      {error && <div className={styles.center}><Text style={{ color: C_TEXT }}>{error}</Text></div>}
      {data && data.comments.length === 0 && !loading && (
        <div className={styles.center}><Text style={{ color: C_TEXT }}>{emptyText}</Text></div>
      )}
      {data && data.comments.length > 0 && (
        <div
          className={fill ? `${styles.list} ${styles.listFill}` : styles.list}
          // 下滑到底自动加载下一页(替代"加载更多"按钮)
          onScroll={(e) => {
            const el = e.currentTarget
            if (
              data.hasMore &&
              !loadingRef.current &&
              el.scrollTop + el.clientHeight >= el.scrollHeight - 80
            ) {
              void loadMore()
            }
          }}
        >
          {data.comments.map((c) => (
            <div key={c.id} className={styles.row}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Cover url={c.avatar} size={36} radius={18} iconSize={14} />
                {c.platform && (
                  <span
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -3,
                      fontSize: 9,
                      lineHeight: '12px',
                      padding: '0 4px',
                      borderRadius: 6,
                      color: '#fff',
                      background:
                        c.platform === 'bilibili'
                          ? '#fb7299'
                          : c.platform === 'netease'
                            ? '#ec4141'
                            : '#31c27c'
                    }}
                  >
                    {c.platform === 'bilibili' ? '站' : c.platform === 'netease' ? '云' : 'Q'}
                  </span>
                )}
              </div>
              <div className={styles.meta}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <Text weight="semibold" size={300} style={{ color: C_TEXT }}>{c.user}</Text>
                  <span className={styles.muted}>{timeAgo(c.time)}</span>
                </div>
                <CommentContent text={c.content} color={C_TEXT} />
                <span className={styles.muted}>♡ {c.likes}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {data &&
        order === 'hot' &&
        (dual ? platform === 'netease' : !!song.neteaseId) &&
        !data.hasMore &&
        data.comments.length > 0 && (
          <div style={{ flexShrink: 0, padding: '6px 2px 0' }}>
            <span className={styles.muted}>热度榜仅展示前排评论,切换「时间」可分页查看全部</span>
          </div>
        )}
      {data &&
        order === 'time' &&
        (dual ? platform === 'bilibili' : !song.neteaseId) &&
        !data.hasMore &&
        data.total > data.comments.length &&
        data.comments.length > 0 && (
          <div style={{ flexShrink: 0, padding: '6px 2px 0' }}>
            <span className={styles.muted}>
              评论服务本次走了降级通道(仅部分评论),稍后重试可恢复完整列表;登录B站账号可提高成功率
            </span>
          </div>
        )}
      {/* 加载更多改为滑到底自动加载,不再显示按钮;底部留一条细进度指示 */}
      {loading && data && data.comments.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '6px 0 2px',
            flexShrink: 0
          }}
        >
          <Spinner size="tiny" />
        </div>
      )}
    </div>
  )
}

/** 评论弹窗(B站视频 / 网易云歌曲):未开全屏播放页时的兜底形态 */
export function CommentsDialog({ song, open, onClose }: { song: Song | null; open: boolean; onClose: () => void }) {
  const styles = useStyles()
  if (!song) return null
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 640, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>评论</DialogTitle>
          <DialogContent className={styles.dialogColumn}>
            {/* boxed:弹窗自带深色底,保证白字在任何主题下都可读 */}
            <CommentsBody song={song} active={open} boxed />
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 分P选择(仅B站多P视频) */
export function PagesDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const styles = useStyles()
  const current = useStore((s) => s.current)
  const playAt = useStore((s) => s.playAt)
  const playQueue = useStore((s) => s.playQueue)
  const queue = useStore((s) => s.queue)
  const [pages, setPages] = useState<BiliPage[]>([])
  const [loading, setLoading] = useState(false)

  /** 把全部分P铺进队列,从当前正在听的P开始 */
  const playAllPages = () => {
    if (!current) return
    const songs = pagesToSongs(current, pages)
    if (songs.length === 0) return
    const curIdx = songs.findIndex((s) => s.id === current.id)
    playQueue(songs, Math.max(0, curIdx))
    onClose()
  }

  useEffect(() => {
    if (!open || !current?.bvid) return
    setLoading(true)
    setPages([])
    api
      .pagesGet(current.bvid)
      .then(setPages)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, current?.bvid])

  if (!current) return null
  const idx = queue.findIndex((s) => s.id === current.id)
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 560, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>选择分P(共 {pages.length} 个)</DialogTitle>
          <DialogContent>
            {loading && <div className={styles.center}><Spinner /></div>}
            <div className={styles.list}>
              {pages.map((p) => {
                const active = p.page === current.page
                return (
                  <div
                    key={p.cid}
                    className={styles.row}
                    style={active ? { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` } : undefined}
                    onClick={() => {
                      if (active) return
                      // 构造同分P歌曲
                      const np = {
                        ...current,
                        id: `${current.bvid}_p${p.page}`,
                        page: p.page,
                        duration: p.duration || current.duration
                      }
                      if (idx >= 0) {
                        // 当前曲在队列中:替换该项并播放,保持队列连贯
                        useStore.getState().playQueue(
                          queue.map((s, i) => (i === idx ? np : s)),
                          idx
                        )
                      } else {
                        // 不在队列(如"更换音源"后的独立播放):直接替换当前播放
                        void useStore.getState().replaceCurrentAndPlay(np)
                      }
                      onClose()
                    }}
                  >
                    <div className={styles.meta}>
                      <Text weight={active ? 'semibold' : 'regular'} size={300}>
                        {p.part || `P${p.page}`}
                      </Text>
                      <div className={styles.muted}>P{p.page} · {formatTime(p.duration)}</div>
                    </div>
                    {active && <PlayRegular style={{ color: tokens.colorBrandForeground1 }} />}
                  </div>
                )
              })}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              icon={<PlayRegular />}
              disabled={loading || pages.length <= 1}
              onClick={playAllPages}
            >
              播放全部分P
            </Button>
            <Button onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 歌曲详情 */
export function SongInfoDialog({ song, open, onClose }: { song: Song | null; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [hot, setHot] = useState<SongHotResult | null>(null)
  const [hotLoading, setHotLoading] = useState(false)

  useEffect(() => {
    if (!open || !song) return
    setLoading(true)
    setRows(null)
    setHot(null)
    setHotLoading(true)
    api
      .songDetail(song)
      .then((r) => setRows(r.ok && r.data ? r.data : null))
      .catch(() => {})
      .finally(() => setLoading(false))
    // 全网热度:三平台并发查询,慢一点不影响基本信息展示
    api
      .songHot?.(song)
      .then((r) => setHot(r.ok && r.data ? r.data : null))
      .catch(() => {})
      .finally(() => setHotLoading(false))
  }, [open, song])

  if (!song) return null
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 560, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>歌曲详情</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <Cover url={song.coverUrl} size={96} radius={8} iconSize={32} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                <Text weight="semibold" size={500}>{song.title}</Text>
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>{song.artist}</Text>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    onClick={async () => {
                      const url =
                        song.neteaseId
                          ? `https://music.163.com/song?id=${song.neteaseId}`
                          : song.bvid
                            ? `https://www.bilibili.com/video/${song.bvid}`
                            : ''
                      if (url) {
                        await api.appCopy(url)
                        toastSuccess('已复制链接')
                      }
                    }}
                  >
                    复制链接
                  </Button>
                  <Button
                    size="small"
                    onClick={async () => {
                      const url =
                        song.neteaseId
                          ? `https://music.163.com/song?id=${song.neteaseId}`
                          : song.bvid
                            ? `https://www.bilibili.com/video/${song.bvid}`
                            : ''
                      if (url) await api.appOpenExternal(url)
                    }}
                  >
                    打开网页
                  </Button>
                </div>
              </div>
            </div>
            {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>}
            {/* 全网热度:酷狗为真实收藏数,QQ/网易云为平台热度指数(标出指标口径) */}
            {(hotLoading || (hot && hot.items.length > 0)) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  marginBottom: 8,
                  borderRadius: 8,
                  background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})`
                }}
              >
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  全网热度
                </Text>
                {hotLoading && <Spinner size="tiny" />}
                {hot?.items.map((it) => (
                  <Tooltip
                    key={it.platform}
                    content={
                      it.metric === 'favorite'
                        ? `${it.title} · 酷狗真实收藏数`
                        : `${it.title} · 平台热度指数(非收藏数)`
                    }
                    relationship="label"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {it.platform === 'kugou' ? '酷狗' : it.platform === 'qq' ? 'QQ' : '网易云'}
                      </Text>
                      <Text size={300} weight="semibold">
                        {it.metric === 'favorite' ? (
                          <>♡ {formatCount(it.value)}</>
                        ) : (
                          <>{it.value}</>
                        )}
                      </Text>
                      {it.metric === 'heat' && (
                        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                          热度
                        </Text>
                      )}
                    </span>
                  </Tooltip>
                ))}
              </div>
            )}
            {rows &&
              Object.entries(rows).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                  <span style={{ width: 96, color: tokens.colorNeutralForeground3, flexShrink: 0 }}>{k}</span>
                  <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{v}</span>
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={async () => {
                      await api.appCopy(v)
                      toastSuccess(`已复制${k}`)
                    }}
                  >
                    复制
                  </Button>
                </div>
              ))}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 歌词编辑(仅内存生效,与手机端一致) */
export function LyricEditDialog({
  song,
  open,
  onClose
}: {
  song: Song | null
  open: boolean
  onClose: () => void
}) {
  const lyrics = useStore((s) => s.lyrics)
  const setLyrics = useStore((s) => s.setLyrics)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setText(
      lyrics && lyrics.lines.length > 0
        ? lyrics.lines.map((l) => `${l.timeMs}:${l.text}`).join('\n')
        : ''
    )
  }, [open, lyrics])

  if (!song) return null
  const save = () => {
    const lines = text
      .split('\n')
      .map((line) => {
        const i = line.indexOf(':')
        if (i <= 0) return null
        const t = Number(line.slice(0, i))
        if (!isFinite(t)) return null
        return { timeMs: Math.max(0, t), text: line.slice(i + 1) }
      })
      .filter(Boolean) as { timeMs: number; text: string }[]
    if (lines.length === 0) {
      toastError('格式错误', '每行应为「timeMs:文本」')
      return
    }
    lines.sort((a, b) => a.timeMs - b.timeMs)
    setLyrics({ lines, provider: lyrics?.provider ?? 'none', title: lyrics?.title })
    toastSuccess('歌词已更新')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 620, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>歌词编辑</DialogTitle>
          <DialogContent>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 8 }}>
              格式:时间戳(毫秒):文本,每行一句。仅当前播放生效。
            </Text>
            <Textarea
              value={text}
              onChange={(_, d) => setText(d.value)}
              resize="vertical"
              style={{ width: '100%', height: 300, fontFamily: 'Consolas, monospace' }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>取消</Button>
            <Button appearance="primary" onClick={save}>保存</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 更换歌词(多来源搜索并替换:网易云/QQ/酷狗/汽水) */
export function LyricReplaceDialog({
  song,
  open,
  onClose
}: {
  song: Song | null
  open: boolean
  onClose: () => void
}) {
  const styles = useStyles()
  const setLyrics = useStore((s) => s.setLyrics)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [src, setSrc] = useState<'netease' | 'qq' | 'kugou' | 'qishui'>('netease')

  useEffect(() => {
    if (open && song) {
      const def = `${song.title} ${song.artist}`.trim()
      setQ(def)
      setResults([])
      search(def)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, song?.id])

  const search = async (keyword: string, srcOverride?: typeof src) => {
    const source = srcOverride ?? src
    if (!keyword.trim()) return
    setLoading(true)
    try {
      if (source === 'netease') {
        const r = await api.neteaseSearch(keyword, 0)
        setResults(r.ok && r.data ? r.data.songs.slice(0, 20) : [])
      } else if (source === 'qq') {
        const r = await api.qqSearch(keyword, 1)
        setResults(r.ok && r.data ? r.data.slice(0, 20) : [])
      } else if (source === 'kugou') {
        const r = await api.kugouSearch(keyword, 1)
        setResults(r.ok && r.data ? r.data.slice(0, 20) : [])
      } else {
        const r = await api.qishuiSearch(keyword, 20)
        setResults(r.ok && r.data ? r.data.slice(0, 20) : [])
      }
    } finally {
      setLoading(false)
    }
  }

  const switchSource = (v: typeof src) => {
    setSrc(v)
    setResults([])
    void search(q, v)
  }

  if (!song) return null
  const pick = async (s: Song) => {
    setPickedId(s.id)
    try {
      const ly = await api.lyricsGet(s)
      if (ly.lines.length === 0) {
        toastError('无歌词', '该歌曲没有可用歌词')
        return
      }
      setLyrics(ly)
      toastSuccess('歌词已更换', s.title)
      onClose()
    } catch (e) {
      toastError('更换失败', String(e))
    } finally {
      setPickedId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 620, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>更换歌词(多来源搜索)</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(
                [
                  ['netease', '网易云'],
                  ['qq', 'QQ音乐'],
                  ['kugou', '酷狗'],
                  ['qishui', '汽水']
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  size="small"
                  appearance={src === k ? 'primary' : 'subtle'}
                  onClick={() => switchSource(k)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <Input
                value={q}
                placeholder={`搜索${src === 'netease' ? '网易云' : src === 'qq' ? 'QQ音乐' : src === 'kugou' ? '酷狗' : '汽水'}歌曲`}
                onChange={(_, d) => setQ(d.value)}
                onKeyDown={(e) => e.key === 'Enter' && search(q)}
                style={{ flex: 1 }}
              />
              <Button icon={<SearchRegular />} onClick={() => search(q)} disabled={loading}>
                搜索
              </Button>
            </div>
            {loading && <div className={styles.center}><Spinner /></div>}
            <div className={styles.list}>
              {results.map((s) => (
                <div
                  key={s.id}
                  className={styles.row}
                  onClick={() => !pickedId && pick(s)}
                  style={{ cursor: 'pointer' }}
                >
                  <Cover url={s.coverUrl} size={40} iconSize={16} />
                  <div className={styles.meta}>
                    <Text size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title}
                    </Text>
                    <span className={styles.muted}>{s.artist}</span>
                  </div>
                  {pickedId === s.id && <Spinner size="tiny" />}
                </div>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}


/** 倍速与音调:两者都无极调节;可切换音调是否随倍速变化 */
export function RatePitchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rate = useStore((s) => s.library?.settings.playbackRate ?? 1)
  const semis = useStore((s) => s.library?.settings.pitchSemitones ?? 0)
  const preservePitch = useStore((s) => s.library?.settings.preservePitch ?? true)
  const setRate = useStore((s) => s.setPlaybackRate)
  const setPitch = useStore((s) => s.setPitch)
  const setPreserve = useStore((s) => s.setPreservePitch)

  const rateText = rate === 1 ? '正常' : `${rate.toFixed(2).replace(/0+$/, '').replace(/.$/, '')}x`
  const pitchText = semis === 0 ? '原调' : `${semis > 0 ? '+' : ''}${semis.toFixed(1)} 半音`

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 520, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>倍速与音调</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text weight="semibold">播放倍速</Text>
              <Text size={400} weight="semibold">{rateText}</Text>
            </div>
            <Slider
              min={0.25}
              max={2.5}
              step={0.05}
              value={rate}
              onChange={(_, d) => setRate(d.value)}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 18px' }}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <Button key={r} size="small" appearance={Math.abs(rate - r) < 0.001 ? 'primary' : 'subtle'} onClick={() => setRate(r)}>
                  {r}x
                </Button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text weight="semibold">音调</Text>
              <Text size={400} weight="semibold">{pitchText}</Text>
            </div>
            <Slider
              min={-12}
              max={12}
              step={0.1}
              value={semis}
              onChange={(_, d) => setPitch(d.value)}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
              {[-12, -6, -1, -0.5, 0, 0.5, 1, 6, 12].map((v) => (
                <Button key={v} size="small" appearance={Math.abs(semis - v) < 0.001 ? 'primary' : 'subtle'} onClick={() => setPitch(v)}>
                  {v === 0 ? '原调' : `${v > 0 ? '+' : ''}${v}`}
                </Button>
              ))}
            </div>

            <Switch
              checked={!preservePitch}
              label="音调随倍速变化"
              onChange={(_, d) => setPreserve(!d.checked)}
            />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginTop: 4 }}>
              关闭时变速保持音调(默认);手动调过音调后按音调偏移生效。
            </Text>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
/** 歌词偏移 */
export function LyricOffsetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offset = useStore((s) => s.library?.settings.lyricOffsetMs ?? 0)
  const update = useStore((s) => s.updateSetting)
  const [local, setLocal] = useState(offset)

  useEffect(() => {
    if (open) setLocal(offset)
  }, [open, offset])

  const apply = (v: number) => {
    setLocal(v)
    update('lyricOffsetMs', v)
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 520, width: '90vw' }}>
        <DialogBody>
          <DialogTitle>歌词偏移</DialogTitle>
          <DialogContent>
            <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 600, margin: '8px 0' }}>
              {local === 0 ? '无偏移' : `${local > 0 ? '+' : ''}${(local / 1000).toFixed(2)}s`}
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', textAlign: 'center', marginBottom: 12 }}>
              正值=歌词提前,负值=歌词延迟
            </Text>
            <Slider
              min={-10000}
              max={10000}
              step={250}
              value={local}
              onChange={(_, d) => apply(d.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {[-500, -250, 0, 250, 500].map((v) => (
                <Button key={v} size="small" onClick={() => apply(local + v)}>
                  {v > 0 ? `+${v}` : v}ms
                </Button>
              ))}
              <Button size="small" onClick={() => apply(0)}>归零</Button>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>完成</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 播放队列抽屉 */
export function QueueDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const queue = useStore((s) => s.queue)
  const queueIndex = useStore((s) => s.queueIndex)
  const { playAt, removeFromQueue, clearQueue } = useStore.getState()

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ width: 420, maxWidth: '92vw', height: '100%', maxHeight: '100%', borderRadius: 0 }}>
        <DialogBody style={{ height: '100%' }}>
          <DialogTitle>
            当前播放 ({queue.length})
          </DialogTitle>
          <DialogContent style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className={styles.list} style={{ flex: 1, maxHeight: 'none' }}>
              {queue.length === 0 && (
                <div className={styles.center}>
                  <Text style={{ color: tokens.colorNeutralForeground3 }}>队列为空</Text>
                </div>
              )}
              {queue.map((s, i) => {
                const active = i === queueIndex
                return (
                  <div
                    key={`${s.id}-${i}`}
                    className={styles.row}
                    style={{ cursor: 'pointer', ...(active ? { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` } : {}) }}
                    onClick={() => playAt(i)}
                  >
                    <span style={{ width: 24, color: active ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground3, textAlign: 'center', flexShrink: 0 }}>
                      {active ? '▶' : i + 1}
                    </span>
                    <div className={styles.meta}>
                      <Text
                        size={300}
                        weight={active ? 'semibold' : 'regular'}
                        style={{
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: active ? tokens.colorBrandForeground1 : undefined
                        }}
                      >
                        {s.title}
                      </Text>
                      <span className={styles.muted}>{s.artist}</span>
                    </div>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DismissRegular />}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromQueue(i)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              icon={<DeleteRegular />}
              disabled={queue.length === 0}
              onClick={() => {
                clearQueue()
                onClose()
              }}
            >
              清空队列
            </Button>
            <Button appearance="primary" onClick={onClose}>关闭</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 均衡器弹窗 */
export function EqDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles()
  const s = useStore((st) => st.library?.settings)
  const update = useStore((st) => st.updateSetting)
  if (!s) return null

  /** 调整增益:尊重均衡器开关状态(此前拖动会强制开启,开关显示关闭却已生效) */
  const setGains = (gains: number[]) => {
    update('eqGains', gains)
    applyEqSettings({ ...s, eqGains: gains })
  }

  const presets: Record<string, number[]> = {
    平坦: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    流行: [-1, 0, 2, 4, 3, 0, -1, -1, 1, 2],
    摇滚: [5, 4, 2, 0, -1, -1, 1, 3, 4, 4],
    爵士: [4, 3, 1, 2, -1, -1, 0, 1, 3, 4],
    古典: [4, 3, 2, 0, 0, 0, 0, 2, 3, 4],
    重低音: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
    人声: [-2, -2, -1, 2, 4, 4, 3, 1, 0, -1],
    电子: [5, 4, 1, 0, -2, 2, 1, 1, 4, 5]
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 620, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>均衡器</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <Switch
                checked={s.eqEnabled}
                onChange={(_, d) => {
                  update('eqEnabled', d.checked)
                  applyEqSettings({ ...s, eqEnabled: d.checked })
                }}
                label="启用均衡器"
              />
              <Button
                size="small"
                onClick={() => {
                  const zeros = new Array(10).fill(0) as number[]
                  update('eqGains', zeros)
                  applyEqSettings({ ...s, eqGains: zeros })
                }}
              >
                重置
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {Object.entries(presets).map(([name, gains]) => (
                <Button key={name} size="small" onClick={() => setGains(gains)}>
                  {name}
                </Button>
              ))}
            </div>
            <div className={styles.eqGrid}>
              {EQ_FREQS.map((freq, i) => (
                <div key={freq} className={styles.eqBand}>
                  <Slider
                    min={-12}
                    max={12}
                    step={1}
                    value={s.eqGains[i] ?? 0}
                    vertical
                    style={{ height: 96 }}
                    onChange={(_, d) => {
                      const gains = [...s.eqGains]
                      gains[i] = d.value
                      setGains(gains)
                    }}
                  />
                  <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                    {freq >= 1000 ? `${freq / 1000}k` : freq}
                  </Text>
                  <Text size={100}>{s.eqGains[i] ?? 0}</Text>
                </div>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>完成</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

/** 更换音源:搜索选择新音源,仅替换音频流(保留封面/歌词/标题) */
export function SourceSwitchDialog({
  song,
  open,
  onClose
}: {
  song: Song | null
  open: boolean
  onClose: () => void
}) {
  const styles = useStyles()
  const [tab, setTab] = useState<'bili' | 'netease' | 'local'>('bili')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [pickingId, setPickingId] = useState<string | null>(null)

  useEffect(() => {
    if (open && song) {
      const def = `${song.title} ${song.artist}`.trim()
      setQ(def)
      setResults([])
      search(def, 'bili')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, song?.id])

  const search = async (keyword: string, t: 'bili' | 'netease') => {
    if (!keyword.trim()) return
    setLoading(true)
    try {
      if (t === 'bili') {
        const list = await api.biliSearch(keyword, 1, 'totalrank')
        setResults(list.slice(0, 20))
      } else {
        const r = await api.neteaseSearch(keyword, 0)
        if (r.ok && r.data) {
          const cands = r.data.songs.filter((s) => !s.vipOnly)
          setResults((cands.length > 0 ? cands : r.data.songs).slice(0, 20))
        } else if (r.error) toastError('搜索失败', r.error)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!song) return null
  /** 点选结果:仅替换音频流,保留原曲元数据与歌词 */
  const pick = async (p: Song) => {
    setPickingId(p.id)
    try {
      // id 保持原曲不变:取流只按 source + 平台字段分发,改 id 会让同一首歌变成两条记录
      const src: Song = {
        ...song,
        source: p.source,
        bvid: p.bvid,
        page: p.page ?? 1,
        // B站结果没有 neteaseId:保留原曲 id,重播时歌词仍取网易云原曲
        neteaseId: p.neteaseId ?? song.neteaseId,
        qqMid: p.qqMid,
        qqId: p.qqId,
        kugouHash: p.kugouHash,
        kugouMixId: p.kugouMixId,
        kugouAlbumId: p.kugouAlbumId,
        vipOnly: undefined,
        keepMeta: true
      }
      useStore.getState().replaceCurrentAndPlay(src)
      toastSuccess('音源已更换', '封面与歌词保持不变')
      onClose()
    } finally {
      setPickingId(null)
    }
  }

  const pickLocal = async () => {
    const paths = await api.appPickLocalAudio()
    if (!paths || paths.length === 0) return
    // 同上:id 保留原曲,只换成本地路径
    const src: Song = {
      ...song,
      source: 'LOCAL',
      localPath: paths[0],
      vipOnly: undefined,
      keepMeta: true
    }
    useStore.getState().replaceCurrentAndPlay(src)
    toastSuccess('音源已更换', '本地文件 · 封面与歌词保持不变')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 640, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>更换音源(仅替换音频流)</DialogTitle>
          <DialogContent>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 8 }}>
              更换后仍显示本曲的封面、标题与歌词;仅音频流来自所选平台。
            </Text>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(
                [
                  { v: 'bili', label: '哔哩哔哩' },
                  { v: 'netease', label: '网易云' },
                  { v: 'local', label: '本地' }
                ] as const
              ).map((t) => (
                <Button
                  key={t.v}
                  size="small"
                  appearance={tab === t.v ? 'primary' : 'subtle'}
                  onClick={() => {
                    setTab(t.v)
                    setResults([])
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            {tab !== 'local' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Input
                  value={q}
                  placeholder="搜索关键词"
                  onChange={(_, d) => setQ(d.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search(q, tab)}
                  style={{ flex: 1 }}
                />
                <Button icon={<SearchRegular />} onClick={() => search(q, tab)} disabled={loading}>
                  搜索
                </Button>
              </div>
            )}

            {tab === 'local' && (
              <div className={styles.center}>
                <Button appearance="primary" onClick={pickLocal}>
                  选择本地音频文件…
                </Button>
              </div>
            )}

            {tab !== 'local' && loading && <div className={styles.center}><Spinner /></div>}
            {tab !== 'local' && !loading && (
              <div className={styles.list} style={{ maxHeight: '320px' }}>
                {results.length === 0 && (
                  <div className={styles.center}>
                    <Text style={{ color: tokens.colorNeutralForeground3 }}>输入关键词搜索音源</Text>
                  </div>
                )}
                {results.map((p) => (
                  <div
                    key={p.id}
                    className={styles.row}
                    style={{ cursor: 'pointer', alignItems: 'center' }}
                    onClick={() => !pickingId && pick(p)}
                  >
                    <Cover url={p.coverUrl} size={40} iconSize={16} />
                    <div className={styles.meta}>
                      <Text size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.title}
                      </Text>
                      <span className={styles.muted}>
                        {p.artist} · {formatTime(p.duration)}
                      </span>
                    </div>
                    {pickingId === p.id ? (
                      <Spinner size="tiny" />
                    ) : (
                      <PlayRegular style={{ color: tokens.colorBrandForeground1 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>取消</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
