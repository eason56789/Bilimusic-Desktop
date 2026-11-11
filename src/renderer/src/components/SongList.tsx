/** 通用歌曲列表(搜索结果/歌单/最近播放共用):单击播放 + 右键/更多菜单 + 多选模式 */
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  Button,
  Checkbox,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  makeStyles,
  tokens,
  Tooltip
} from '@fluentui/react-components'
import {
  MoreHorizontalRegular,
  PlayRegular,
  ArrowRightRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  DismissRegular,
  SelectAllOnRegular,
  FolderAddRegular,
  ListRegular,
  HeartRegular,
  HeartFilled,
  CopyRegular,
  InfoRegular,
  ArrowSwapRegular
} from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { useStore } from '../store'
import { Cover } from './Cover'
import { AddToPlaylistDialog } from './AddToPlaylistDialog'
import { useRevealGroup } from '../lib/RevealList'
import { api } from '../lib/api'
import { pagesToSongs } from '../lib/pages'
import { badgeOf } from '../lib/sourceBadge'
import { formatCount } from '../lib/format'
import { toast, toastSuccess, toastError } from '../lib/toast'

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '2px' },
  /** 列表尾部的「还有更多」提示兼哨兵位;对用户是提示,对代码是触发点 */
  more: {
    padding: '12px 0 16px',
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'default',
    transition: 'background 0.15s ease',
    ':hover': { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` }
  },
  rowActive: {
    background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})`
  },
  meta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  title: {
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold
  },
  artist: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: tokens.fontSizeBase200
  },
  duration: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    flexShrink: 0
  },
  favCount: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  sourceBadge: {
    fontSize: tokens.fontSizeBase100,
    padding: '1px 6px',
    borderRadius: '4px',
    flexShrink: 0
  },
  eqWrap: { display: 'inline-flex', gap: '2px', alignItems: 'flex-end', height: '12px' },
  rank: {
    width: '26px',
    flexShrink: 0,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300
  },
  /** 前三名高亮:金/银/铜 */
  rankTop: {
    fontWeight: 700,
    color: tokens.colorBrandForeground1
  },
  selBar: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorBrandBackground2,
    marginBottom: '6px'
  }
})

/**
 * 超过这个行数就不再播入场动画。
 * 上千行同时挂 blur(6px) 初始态 + will-change,浏览器要为每一行准备一个带模糊的
 * 合成层,打开歌单会直接卡好几秒;而「第一个音符已经在播了、列表还在逐行浮现」
 * 本身也没有意义。列表短的时候动画照旧。
 */
const REVEAL_MAX_ROWS = 80

/**
 * 长列表分批渲染:首屏只挂 SHOW_PAGE 行,用户往下滑到接近底部时再追加一批。
 * 594 行的歌单意味着 594 个行组件 ×(封面 + 收藏 + 多按钮 + 菜单)≈ 数千个节点
 * 一次性提交,React 与布局都得一次吃下去 —— 那正是「打开歌单卡几秒」里
 * 与动画无关的那一半。分批之后首屏只付一屏的钱,滚多少付多少。
 */
const SHOW_PAGE = 60
/** 每次追加的行数 */
const SHOW_STEP = 60
/** 哨兵提前多远触发:留出一屏多的余量,正常滑动时看不到空白 */
const SHOW_ROOT_MARGIN = '0px 0px 240px 0px'

function EqBars() {
  const styles = useStyles()
  return (
    <span className={styles.eqWrap}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar"
          style={{ height: 12 - i * 2, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

interface CtxMenuState {
  x: number
  y: number
  song: Song
  index: number
}

export function SongList({
  songs,
  onRemove,
  showAlbum,
  showRank
}: {
  songs: Song[]
  onRemove?: (song: Song) => void
  showAlbum?: boolean
  /** 显示排名序号(排行榜页用;按数组顺序即榜单名次) */
  showRank?: boolean
}) {
  const styles = useStyles()
  const playQueue = useStore((s) => s.playQueue)
  const playSongNext = useStore((s) => s.playSongNext)
  const current = useStore((s) => s.current)
  // 注意:不能在 selector 里写 `?? []`——每次渲染都返回新数组会让 React 无限重渲(React #185)。
  // 先把 library 取出来,再在渲染里判断,引用保持稳定。
  const favoriteIds = useStore((s) => s.library?.favoriteIds)
  const faved = (id: string): boolean => !!favoriteIds?.includes(id)
  /** 音源加载中:屏蔽本列表的播放操作(此时 el 里还没有可播内容) */
  const loading = useStore((s) => s.loading)
  /**
   * 这一行是不是「正在加载的那首歌」。
   * 只有它需要禁用:重复点它没意义(已经在取了)。其它行点击立即生效,
   * 由 store 的请求序号负责抢占并作废旧请求。
   */
  const isThisLoading = (song: Song): boolean => loading && current?.id === song.id
  const [addTarget, setAddTarget] = useState<Song[] | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const ctxAnchorRef = useRef<HTMLSpanElement>(null)
  const [selMode, setSelMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /**
   * 逐项入场。这里不传滚动容器:页面各处的滚动区不在本组件内,
   * 而 root=null 时浏览器会把中间滚动容器的裁剪一并算进去,判定依然准确。
   * 行数过多时直接关掉(见 REVEAL_MAX_ROWS):既省掉上千个模糊合成层,
   * 也不再做上千次注册/观察 —— 这是打开大歌单不再卡顿的关键。
   */
  const revealOn = songs.length <= REVEAL_MAX_ROWS
  const reveal = useRevealGroup(revealOn)

  /**
   * 分批渲染游标。用「列表首曲 id」当内容指纹:切歌单 / 换搜索词 / 换榜单时首曲必变,
   * 这时回到第一批;而在同一个歌单里删掉某首歌时指纹不变,不该把已经滑出来的
   * 那一屏又收回去(那会让滚动位置凭空跳掉)。
   * 不用数组引用:父组件每次渲染都会给新数组,拿引用当 key 就永远只看得到第一批。
   */
  const listKey = songs[0]?.id ?? ''
  const [shownCount, setShownCount] = useState(SHOW_PAGE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setShownCount(SHOW_PAGE)
  }, [listKey])
  const shown = Math.min(shownCount, songs.length)
  const hasMore = shown < songs.length

  /**
   * 底部「加载更多」那一行同时是哨兵:它进入视口就追加一批。
   * 依赖里必须带 shownCount —— 追加完它通常还在视口内(列表变长了),
   * 不重建 observer 就收不到下一次回调,链条会停在第一批。
   */
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShownCount((c) => Math.min(songs.length, c + SHOW_STEP))
        }
      },
      { root: null, rootMargin: SHOW_ROOT_MARGIN, threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, shownCount, songs.length])

  useEffect(() => {
    if (!selMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSelMode(false)
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selMode])

  const enterSelMode = (): void => {
    setSelMode(true)
    setSelected(new Set())
  }
  const exitSelMode = (): void => {
    setSelMode(false)
    setSelected(new Set())
  }
  const toggleSel = (id: string): void => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const selSongs = songs.filter((s) => selected.has(s.id))
  const allSelected = songs.length > 0 && selSongs.length === songs.length

  /**
   * 立即播放。
   * 只拦「正在加载的那首歌本身」——重复点它没有意义(它已经在取了);
   * 点其它歌一律立即生效:store 会给新请求递增序号并 abort 旧的取流,
   * 旧请求回来时发现自己已过期就静默退出,所以不需要整列表锁定。
   */
  const playNow = (index: number) => {
    const target = songs[index]
    if (loading && target && current?.id === target.id) {
      toast('音源加载中', '当前歌曲正在加载,请稍候')
      return
    }
    playQueue(songs, index)
  }
  /** 下一首播放 */
  const playNext = (song: Song) => playSongNext(song)
  /** 播放全部分P:拉取分P列表铺满队列,从当前P开始 */
  const playAllPages = async (song: Song) => {
    if (!song.bvid) return
    try {
      const pages = await api.pagesGet(song.bvid)
      const list = pagesToSongs(song, pages)
      if (list.length === 0) {
        toast('播放分P', '该视频只有一个分P')
        return
      }
      const idx = list.findIndex((s) => s.id === song.id)
      playQueue(list, Math.max(0, idx))
    } catch (e) {
      toastError('获取分P失败', String(e))
    }
  }
  /** 下载 */
  const download = (song: Song) => {
    api.downloadAdd([song])
    toastSuccess('已加入下载队列', song.title)
  }
  /** 收藏 / 取消收藏 */
  const toggleFav = async (song: Song) => {
    const r = await api.libraryToggleFavorite(song)
    // 刷新库快照,让 favoriteIds 立刻反映到界面(心形图标/收藏页)
    await useStore.getState().refreshLibrary()
    toastSuccess(r.favorited ? '已收藏' : '已取消收藏', song.title)
  }
  /** 复制歌曲信息 */
  const copyInfo = (song: Song) => {
    void api.appCopy(`${song.title} - ${song.artist}`)
    toastSuccess('已复制', `${song.title} - ${song.artist}`)
  }
  /** 查看歌曲详情:必须针对被右键的那首歌,而不是当前播放 */
  const openDetail = (song: Song): void => {
    useStore.getState().openSongDialog('info', song)
  }
  /** 更换音源:同上 */
  const openSwitch = (song: Song): void => {
    useStore.getState().openSongDialog('source', song)
  }

  /** 右键/更多菜单共用的菜单项 */
  const menuItems = (song: Song, index: number) => {
    const isFav = faved(song.id)
    return (
      <>
        <MenuItem icon={<PlayRegular />} onClick={() => playNow(index)}>
          立即播放
        </MenuItem>
        <MenuItem icon={<ArrowRightRegular />} onClick={() => playNext(song)}>
          下一首播放
        </MenuItem>
        <MenuItem
          icon={isFav ? <HeartFilled /> : <HeartRegular />}
          onClick={() => void toggleFav(song)}
        >
          {isFav ? '取消收藏' : '收藏'}
        </MenuItem>
        {song.source === 'BILIBILI' && song.bvid && (
          <MenuItem icon={<ListRegular />} onClick={() => void playAllPages(song)}>
            播放全部分P
          </MenuItem>
        )}
        <MenuItem icon={<FolderAddRegular />} onClick={() => setAddTarget([song])}>
          添加到歌单
        </MenuItem>
        <MenuItem icon={<ArrowDownloadRegular />} onClick={() => download(song)}>
          下载
        </MenuItem>
        <MenuItem icon={<ArrowSwapRegular />} onClick={() => openSwitch(song)}>
          更换音源
        </MenuItem>
        <MenuItem icon={<InfoRegular />} onClick={() => openDetail(song)}>
          歌曲详情
        </MenuItem>
        <MenuItem icon={<CopyRegular />} onClick={() => copyInfo(song)}>
          复制歌名歌手
        </MenuItem>
        <MenuItem icon={<SelectAllOnRegular />} onClick={enterSelMode}>
          多选模式
        </MenuItem>
        {onRemove && (
          <MenuItem icon={<DeleteRegular />} onClick={() => onRemove(song)}>
            移除
          </MenuItem>
        )}
      </>
    )
  }

  const onRowContextMenu = (e: MouseEvent<HTMLDivElement>, song: Song, index: number) => {
    e.preventDefault()
    // 把隐藏锚点移到鼠标处,作为右键菜单定位目标
    const anchor = ctxAnchorRef.current
    if (anchor) {
      anchor.style.left = `${e.clientX}px`
      anchor.style.top = `${e.clientY}px`
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, song, index })
  }

  return (
    <>
      {/* 多选工具条 */}
      {selMode && (
        <div className={styles.selBar}>
          <Checkbox
            checked={allSelected ? true : selSongs.length > 0 ? 'mixed' : false}
            onChange={() => {
              if (allSelected) setSelected(new Set())
              else setSelected(new Set(songs.map((s) => s.id)))
            }}
            label={<span>已选 {selSongs.length} / {songs.length}</span>}
          />
          <div style={{ flex: 1 }} />
          <Button
            size="small"
            icon={<FolderAddRegular />}
            disabled={selSongs.length === 0}
            onClick={() => setAddTarget(selSongs)}
          >
            添加到歌单
          </Button>
          <Button
            size="small"
            icon={<ArrowDownloadRegular />}
            disabled={selSongs.length === 0}
            onClick={() => {
              api.downloadAdd(selSongs)
              toastSuccess('已加入下载队列', `共 ${selSongs.length} 首`)
            }}
          >
            下载
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={exitSelMode}
          >
            退出多选
          </Button>
        </div>
      )}

      {/* data-bm-longlist 让离屏行走 content-visibility(见 styles.css),长列表滚动只算看得见的那几行 */}
      <div className={styles.list} data-bm-longlist={revealOn ? undefined : ''}>
        {songs.slice(0, shown).map((song, i) => {
          const active = current?.id === song.id
          const checked = selected.has(song.id)
          return (
            <div
              key={`${song.id}-${i}`}
              ref={revealOn ? (n) => reveal.register(n, i, `${song.id}-${i}`) : undefined}
              data-bm-reveal={revealOn ? '' : undefined}
              className={`song-row ${styles.row} ${active ? `${styles.rowActive} bm-row-playing` : ''}`}
              style={selMode && checked ? { background: tokens.colorBrandBackground2 } : undefined}
              onClick={selMode ? () => toggleSel(song.id) : () => playNow(i)}
              onContextMenu={selMode ? undefined : (e) => onRowContextMenu(e, song, i)}
            >
              {selMode && (
                <Checkbox
                  checked={checked}
                  onChange={() => toggleSel(song.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {showRank && (
                <span className={`${styles.rank} ${i < 3 ? styles.rankTop : ''}`}>{i + 1}</span>
              )}
              <Cover url={song.coverUrl} size={40} iconSize={16} />
              <div className={styles.meta}>
                <span className={styles.title}>
                  {active ? <EqBars /> : null} {song.title}
                </span>
                <span className={styles.artist}>
                  {song.artist}
                  {showAlbum && song.album ? ` · ${song.album}` : ''}
                </span>
              </div>
              {/* 来源徽章:五种来源各有配色 */}
              <span
                className={styles.sourceBadge}
                style={{
                  background: badgeOf(song.source).bg,
                  color: badgeOf(song.source).color
                }}
              >
                {badgeOf(song.source).label}
              </span>
              {/* 收藏数(酷狗搜索结果等平台提供的歌曲收藏量) */}
              {song.favCount ? (
                <Tooltip content={`收藏数 ${song.favCount.toLocaleString()}`} relationship="label">
                  <span className={styles.favCount}>♡ {formatCount(song.favCount)}</span>
                </Tooltip>
              ) : null}
              <span className={styles.duration}>{formatTime(song.duration)}</span>
              {!selMode && (
                // 行内操作按钮/菜单:阻止冒泡,避免连带触发整行的"单击播放"
                <>
                  {/* 只有「正在加载的那首」禁用,其余行随时可点、立即生效 */}
                  <Tooltip content={isThisLoading(song) ? '当前歌曲加载中…' : '立即播放'} relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<PlayRegular />}
                      disabled={isThisLoading(song)}
                      onClick={(e) => {
                        e.stopPropagation()
                        playNow(i)
                      }}
                    />
                  </Tooltip>
                  <Tooltip content="下一首播放" relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowRightRegular />}
                      onClick={(e) => {
                        e.stopPropagation()
                        playNext(song)
                      }}
                    />
                  </Tooltip>
                  <Tooltip content={faved(song.id) ? '取消收藏' : '收藏'} relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={faved(song.id) ? <HeartFilled /> : <HeartRegular />}
                      style={faved(song.id) ? { color: tokens.colorPaletteRedForeground1 } : undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleFav(song)
                      }}
                    />
                  </Tooltip>
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<MoreHorizontalRegular />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </MenuTrigger>
                    <MenuPopover>{menuItems(song, i)}</MenuPopover>
                  </Menu>
                </>
              )}
            </div>
          )
        })}
        {/* 哨兵兼提示:滑到这里就追加下一批(SHOW_STEP 行) */}
        {hasMore && (
          <div className={styles.more} ref={sentinelRef}>
            下滑加载更多 · 已显示 {shown} / {songs.length}
          </div>
        )}
      </div>

      {/* 右键菜单(受控,锚点跟随鼠标) */}
      <span
        ref={ctxAnchorRef}
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <Menu
        open={!!ctxMenu}
        onOpenChange={(_, d) => {
          if (!d.open) setCtxMenu(null)
        }}
        positioning={{ target: ctxMenu ? ctxAnchorRef.current : undefined }}
      >
        <MenuTrigger disableButtonEnhancement>
          <span style={{ display: 'none' }} />
        </MenuTrigger>
        <MenuPopover>
          {ctxMenu ? menuItems(ctxMenu.song, ctxMenu.index) : null}
        </MenuPopover>
      </Menu>

      <AddToPlaylistDialog
        songs={addTarget ?? []}
        open={addTarget != null}
        onClose={() => setAddTarget(null)}
      />
    </>
  )
}
