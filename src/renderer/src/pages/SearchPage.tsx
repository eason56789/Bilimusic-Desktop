/** 搜索页:B站视频 / 网易云/QQ/酷狗 歌曲·歌单·歌手 多源搜索 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dropdown,
  Input,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Option,
  Spinner,
  Switch,
  TabList,
  Tab,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  SearchRegular,
  DismissRegular,
  DeleteRegular,
  PersonRegular,
  MusicNote2Regular,
  PlayRegular,
  ArrowLeftRegular,
  ArrowRightRegular,
  ArrowDownloadRegular,
  ArrowSwapRegular,
  CloudArrowDownRegular,
  HistoryRegular,
  HeartRegular,
  HeartFilled,
  FolderAddRegular,
  InfoRegular,
  CopyRegular,
  OpenRegular
} from '@fluentui/react-icons'
import type {
  NeteaseArtistBrief,
  NeteasePlaylistBrief,
  NeteasePlaylistMeta,
  Playlist,
  Song,
  SourceArtistBrief,
  SourcePlaylistBrief,
  SourcePlaylistDetail
} from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'
import { Cover } from '../components/Cover'
import { formatCount } from '../lib/format'
import { toastError, toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px 0', gap: '12px' },
  headerRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  optionsRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  results: { flex: 1, overflowY: 'auto', paddingBottom: '16px', minHeight: 0 },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 10,
    background: `var(--bm-surface-1, ${tokens.colorNeutralBackground1})`,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
    maxHeight: '260px',
    overflowY: 'auto'
  },
  suggestionItem: {
    padding: '6px 12px',
    cursor: 'pointer',
    ':hover': { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` }
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 10px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    ':hover': { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` }
  },
  chip: {
    padding: '4px 12px',
    borderRadius: '999px',
    background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})`,
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase200,
    ':hover': { background: `var(--bm-surface-3h, ${tokens.colorNeutralBackground3Hover})` }
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    padding: '48px 0'
  }
})

const BILI_ORDERS: { value: string; label: string }[] = [
  { value: 'totalrank', label: '综合排序' },
  { value: 'click', label: '最多播放' },
  { value: 'stow', label: '最多收藏' },
  { value: 'dm', label: '最多弹幕' },
  { value: 'pubdate', label: '最新发布' }
]

/** 搜索类型:歌曲 / 歌单 / 歌手(网易云、QQ音乐、酷狗 三类平台通用) */
type SearchType = 'songs' | 'playlists' | 'artists'
/** 平台歌单/歌手预览(QQ音乐、酷狗 搜索结果点开 → 整页预览) */
type SourcePreview =
  | { kind: 'playlist'; platform: 'qq' | 'kugou'; brief: SourcePlaylistBrief }
  | { kind: 'artist'; platform: 'qq' | 'kugou'; brief: SourceArtistBrief }

export function SearchPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  // 默认音源来自设置(默认网易云);首帧 library 未加载完时先给 'netease'
  const [source, setSource] = useState<'bili' | 'netease' | 'qq' | 'kugou' | 'qishui'>(
    () => useStore.getState().library?.settings.defaultSearchSource ?? 'netease'
  )
  /** 搜索类型(歌曲/歌单/歌手):网易云、QQ音乐、酷狗 共用同一选择 */
  const [searchType, setSearchType] = useState<SearchType>('songs')
  const [query, setQuery] = useState('')
  const [biliResults, setBiliResults] = useState<Song[]>([])
  const [neResults, setNeResults] = useState<Song[]>([])
  const [neHasMore, setNeHasMore] = useState(false)
  const [qqResults, setQqResults] = useState<Song[]>([])
  const [kgResults, setKgResults] = useState<Song[]>([])
  const [qsResults, setQsResults] = useState<Song[]>([])
  const [qqPage, setQqPage] = useState(1)
  const [kgPage, setKgPage] = useState(1)
  const [nePlaylists, setNePlaylists] = useState<NeteasePlaylistBrief[]>([])
  const [neArtists, setNeArtists] = useState<NeteaseArtistBrief[]>([])
  const [qqPlaylists, setQqPlaylists] = useState<SourcePlaylistBrief[]>([])
  const [qqArtists, setQqArtists] = useState<SourceArtistBrief[]>([])
  const [kgPlaylists, setKgPlaylists] = useState<SourcePlaylistBrief[]>([])
  const [kgArtists, setKgArtists] = useState<SourceArtistBrief[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [order, setOrder] = useState('totalrank')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [previewPl, setPreviewPl] = useState<NeteasePlaylistBrief | null>(null)
  const [previewSongs, setPreviewSongs] = useState<Song[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMeta, setPreviewMeta] = useState<NeteasePlaylistMeta | null>(null)
  const [previewKw, setPreviewKw] = useState('')
  /** QQ音乐/酷狗 歌单·歌手 预览(整页视图) */
  const [srcPreview, setSrcPreview] = useState<SourcePreview | null>(null)
  const [srcPreviewSongs, setSrcPreviewSongs] = useState<Song[] | null>(null)
  /** 歌单详情(封面/播放量/收藏数/简介:搜索结果里常缺,详情接口更全) */
  const [srcPreviewMeta, setSrcPreviewMeta] = useState<SourcePlaylistDetail | null>(null)
  const [srcPreviewLoading, setSrcPreviewLoading] = useState(false)
  const [srcPreviewImporting, setSrcPreviewImporting] = useState(false)
  /** 音源加载中:预览页的播放键同样要屏蔽 */
  const playerLoading = useStore((s) => s.loading)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuery = useRef('')
  const userPickedSource = useRef(false)

  // library 加载完成后,若用户还没手动切过音源,跟随设置里的默认音源
  useEffect(() => {
    const def = library?.settings.defaultSearchSource
    if (!def || userPickedSource.current) return
    setSource(def)
  }, [library?.settings.defaultSearchSource])

  const settings = library?.settings
  const anim = useStore((s) => s.library?.settings.pageAnimation ?? 'scale')
  const animCls = anim !== 'none' ? `page-anim-${anim}` : undefined

  // 过滤:超长视频 / 标题含"循环" / 自定义过滤词
  const filterLong = (songs: Song[]): Song[] => {
    let list = songs
    if (settings?.filterLongVideo) {
      const maxSec = (settings.longVideoMinutes ?? 10) * 60
      list = list.filter((s) => s.duration <= maxSec)
    }
    if (settings?.filterLoopTitles) {
      list = list.filter((s) => !s.title.includes('循环'))
    }
    const kw = (settings?.filterKeywords ?? '')
      .split('|')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
    if (kw.length > 0) {
      list = list.filter((s) => {
        const t = s.title.toLowerCase()
        return !kw.some((k) => t.includes(k))
      })
    }
    return list
  }

  /**
   * 执行搜索。srcOverride 用于"切换音源"场景:
   * setSource 是异步的,若直接读 state 会拿到旧值,导致切到网易云后仍搜 B 站。
   */
  const doSearch = async (q: string, typeOverride?: SearchType, srcOverride?: typeof source) => {
    const keyword = q.trim()
    if (!keyword) return
    lastQuery.current = keyword
    const st = typeOverride ?? searchType
    const src = srcOverride ?? source
    setLoading(true)
    setSearched(true)
    setShowSuggestions(false)
    try {
      if (src === 'bili') {
        const results = await api.biliSearch(keyword, 1, order)
        setBiliResults(filterLong(results))
      } else if (src === 'qq') {
        if (st === 'playlists') {
          const r = await api.qqSearchPlaylists(keyword, 1)
          if (r.ok && r.data) setQqPlaylists(r.data)
          else toastError('QQ音乐歌单搜索失败', r.error)
        } else if (st === 'artists') {
          const r = await api.qqSearchArtists(keyword, 1)
          if (r.ok && r.data) setQqArtists(r.data)
          else toastError('QQ音乐歌手搜索失败', r.error)
        } else {
          const r = await api.qqSearch(keyword, 1)
          if (r.ok && r.data) {
            setQqResults(r.data)
            setQqPage(1)
          } else {
            toastError('QQ音乐搜索失败', r.error)
          }
        }
      } else if (src === 'kugou') {
        if (st === 'playlists') {
          const r = await api.kugouSearchPlaylists(keyword, 1)
          if (r.ok && r.data) setKgPlaylists(r.data)
          else toastError('酷狗歌单搜索失败', r.error)
        } else if (st === 'artists') {
          const r = await api.kugouSearchArtists(keyword, 1)
          if (r.ok && r.data) setKgArtists(r.data)
          else toastError('酷狗歌手搜索失败', r.error)
        } else {
          const r = await api.kugouSearch(keyword, 1)
          if (r.ok && r.data) {
            setKgResults(r.data)
            setKgPage(1)
          } else {
            toastError('酷狗搜索失败', r.error)
          }
        }
      } else if (src === 'qishui') {
        // 汽水音乐:仅支持歌曲搜索(字节平台无公开歌单/歌手搜索)
        const r = await api.qishuiSearch(keyword, 30)
        if (r.ok && r.data) setQsResults(r.data)
        else toastError('汽水搜索失败', r.error)
      } else if (st === 'songs') {
        const r = await api.neteaseSearch(keyword, 0)
        if (r.ok && r.data) {
          setNeResults(r.data.songs)
          setNeHasMore(r.data.hasMore)
        } else {
          toastError('网易云搜索失败', r.error)
        }
      } else if (st === 'playlists') {
        const r = await api.neteaseSearchPlaylists(keyword)
        if (r.ok && r.data) setNePlaylists(r.data)
        else toastError('搜索失败', r.error)
      } else {
        const r = await api.neteaseSearchArtists(keyword)
        if (r.ok && r.data) setNeArtists(r.data)
        else toastError('搜索失败', r.error)
      }
      await api.libraryAddSearchHistory(keyword)
      await refresh()
    } catch (e) {
      toastError('搜索失败', String(e))
    } finally {
      setLoading(false)
    }
  }

  const doSearchWith = (q: string, type: SearchType): void => {
    void doSearch(q, type)
  }

  /**
   * 消费来自识曲页/歌曲详情(专辑名)的关键词:跳到这里自动填入并搜索。
   * 订阅 pendingSearch:写入方(识曲页)总是跨页导航,挂载时消费即可;
   * 但歌曲详情弹窗的「专辑」点击可能发生在用户已停留在搜索页时,
   * 此时页面不会重挂载,必须响应式消费,否则搜索框不会填入。
   * takePendingSearch 取走即清空,不会重复触发。
   */
  const pendingSearch = useStore((s) => s.pendingSearch)
  useEffect(() => {
    if (pendingSearch === null) return
    const q = useStore.getState().takePendingSearch()
    if (!q) return
    setQuery(q)
    void doSearch(q, 'songs', 'netease')
    // doSearch 每次渲染都是新引用,放进依赖会重复触发;由 pendingSearch 变化驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearch])

  // 打开歌单预览(附带网易云元信息:播放量/创建时间/标签)
  const openPlaylistPreview = async (pl: NeteasePlaylistBrief) => {
    setPreviewPl(pl)
    setPreviewSongs(null)
    setPreviewLoading(true)
    setPreviewMeta(null)
    void api
      .neteasePlaylistMeta(pl.id)
      .then((r) => {
        if (r.ok && r.data) setPreviewMeta(r.data)
      })
      .catch(() => {})
    try {
      const r = await api.neteasePlaylistSongs(pl.id)
      if (r.ok && r.data) setPreviewSongs(r.data)
      else toastError('获取歌单失败', r.error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const importPreviewPlaylist = async () => {
    if (!previewPl) return
    try {
      const p: Playlist | null = await api.importNeteasePlaylist(previewPl.id, previewPl.name)
      if (p) {
        await refresh()
        toastSuccess('歌单已导入', `${previewPl.name} · ${p.songIds.length} 首`)
        setPreviewPl(null)
      } else toastError('导入失败', '内容为空或获取失败')
    } catch (e) {
      toastError('导入失败', String(e))
    }
  }

  // 打开歌手主页(独立页面,替换旧的弹窗)
  const openArtistDetail = (a: NeteaseArtistBrief) => {
    useStore.getState().openArtistPage('netease', a.id)
  }

  /** 打开 QQ音乐/酷狗 歌单·歌手预览(整页视图,同网易云歌单预览布局) */
  const openSourcePreview = async (p: SourcePreview) => {
    setSrcPreview(p)
    setSrcPreviewSongs(null)
    setSrcPreviewMeta(null)
    setSrcPreviewLoading(true)
    setPreviewKw('')
    try {
      if (p.kind === 'playlist') {
        const r = await api.sourcePlaylistSongs(p.platform, p.brief.id)
        if (r.ok && r.data) {
          setSrcPreviewSongs(r.data.songs)
          setSrcPreviewMeta(r.data)
        } else {
          toastError('获取歌单失败', r.error)
        }
      } else {
        const r =
          p.platform === 'qq'
            ? await api.qqArtistSongs(p.brief.id)
            : await api.kugouArtistSongs(p.brief.id)
        if (r.ok && r.data) setSrcPreviewSongs(r.data)
        else toastError('获取歌手歌曲失败', r.error)
      }
    } finally {
      setSrcPreviewLoading(false)
    }
  }

  /** 把 QQ/酷狗 歌单导入为本地歌单 */
  const importSourcePlaylist = async () => {
    if (!srcPreview || srcPreview.kind !== 'playlist') return
    setSrcPreviewImporting(true)
    try {
      const r = await api.libraryImportSourcePlaylist(
        srcPreview.platform,
        srcPreview.brief.id,
        srcPreview.brief.name
      )
      if (r.ok && r.data) {
        await refresh()
        toastSuccess('歌单已导入', `${r.data.name} · ${r.data.count} 首`)
        setSrcPreview(null)
      } else {
        toastError('导入失败', r.error)
      }
    } finally {
      setSrcPreviewImporting(false)
    }
  }

  /** QQ/酷狗结果"加载更多" */
  const loadMoreQq = async () => {
    setLoading(true)
    try {
      const next = qqPage + 1
      const r = await api.qqSearch(lastQuery.current, next)
      if (r.ok && r.data) {
        setQqResults((prev) => [...prev, ...r.data!])
        setQqPage(next)
      }
    } finally {
      setLoading(false)
    }
  }
  const loadMoreKg = async () => {
    setLoading(true)
    try {
      const next = kgPage + 1
      const r = await api.kugouSearch(lastQuery.current, next)
      if (r.ok && r.data) {
        setKgResults((prev) => [...prev, ...r.data!])
        setKgPage(next)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadMoreNetease = async () => {
    setLoading(true)
    try {
      const r = await api.neteaseSearch(lastQuery.current, neResults.length)
      if (r.ok && r.data) {
        setNeResults((prev) => [...prev, ...r.data!.songs])
        setNeHasMore(r.data.hasMore)
      }
    } finally {
      setLoading(false)
    }
  }

  // 搜索建议(防抖):B站站内建议词 / 网易云与QQ、汽水联想
  useEffect(() => {
    if (!query.trim() || (source !== 'bili' && source !== 'netease' && source !== 'qq' && source !== 'qishui')) {
      setSuggestions([])
      return
    }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const kw = query.trim()
    searchTimer.current = setTimeout(async () => {
      try {
        const list = await api.searchSuggest(source, kw)
        setSuggestions(list.slice(0, 8))
        setShowSuggestions(true)
      } catch {
        setSuggestions([])
      }
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query, source])

  // 切换排序后重新搜索
  useEffect(() => {
    if (searched && source === 'bili' && lastQuery.current) doSearch(lastQuery.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const switchSource = (src: 'bili' | 'netease' | 'qq' | 'kugou' | 'qishui') => {
    userPickedSource.current = true
    setSource(src)
    setShowSuggestions(false)
    // 显式传入目标音源,避免用 setState 前的旧 source 发起搜索
    if (lastQuery.current) void doSearch(lastQuery.current, undefined, src)
  }

  // 主页:网易云推荐歌单 + 推荐歌曲(与手机端首页一致,歌单与歌曲并存)
  const [focusHist, setFocusHist] = useState(false)
  const [recList, setRecList] = useState<NeteasePlaylistBrief[]>([])
  const [recSongs, setRecSongs] = useState<Song[]>([])
  // 加载完成标记:失败时也要结束转圈,否则 Spinner 永远转下去
  const [recLoaded, setRecLoaded] = useState(false)

  // 主页推荐卡片右键菜单(推荐歌曲 / 网易云推荐歌单)
  const playSongNext = useStore((s) => s.playSongNext)
  const current = useStore((s) => s.current)
  const favoriteIds = useStore((s) => s.library?.favoriteIds)
  const faved = (id: string): boolean => !!favoriteIds?.includes(id)
  const [recCtx, setRecCtx] = useState<{ song: Song } | null>(null)
  const [plCtx, setPlCtx] = useState<NeteasePlaylistBrief | null>(null)
  const [addTarget, setAddTarget] = useState<Song[] | null>(null)
  const recAnchorRef = useRef<HTMLSpanElement>(null)
  const plAnchorRef = useRef<HTMLSpanElement>(null)

  /** 收藏 / 取消收藏(与 SongList 同款;成功后刷新库让心形图标立刻反映) */
  const recToggleFav = async (song: Song): Promise<void> => {
    try {
      const r = await api.libraryToggleFavorite(song)
      await useStore.getState().refreshLibrary()
      toastSuccess(r.favorited ? '已收藏' : '已取消收藏', song.title)
    } catch (e) {
      toastError('收藏失败', String(e))
    }
  }
  /** 歌单右键「播放全部」:拉取歌单曲目直接开播(不经过预览页) */
  const plPlayAll = async (pl: NeteasePlaylistBrief): Promise<void> => {
    try {
      const r = await api.neteasePlaylistSongs(pl.id)
      if (r.ok && r.data && r.data.length > 0) {
        playQueue(r.data, 0)
        toastSuccess('播放全部', `${pl.name} · ${r.data.length} 首`)
      } else {
        toastError('播放失败', r.ok ? '歌单为空' : r.error)
      }
    } catch (e) {
      toastError('播放失败', String(e))
    }
  }

  useEffect(() => {
    api
      .neteasePersonalized()
      .then((r) => {
        if (r.ok && r.data) setRecList(r.data)
      })
      .catch(() => {})
      .finally(() => setRecLoaded(true))
    // 推荐歌曲:按"热歌"关键词搜索(匿名可用,与手机端一致)
    api
      .neteaseSearch('热歌', 0)
      .then((r) => {
        if (r.ok && r.data) setRecSongs((r.data.songs ?? []).slice(0, 12))
      })
      .catch(() => {})
  }, [])

  /** 推荐歌曲右键菜单项(与 SongList 的行内菜单一致,播放按整组推荐队列算) */
  const recMenuItems = (song: Song) => {
    const isFav = faved(song.id)
    return (
      <>
        <MenuItem
          icon={<PlayRegular />}
          onClick={() => {
            if (playerLoading && current?.id === song.id) {
              toastError('音源加载中', '当前歌曲正在加载,请稍候')
              return
            }
            playQueue([...recSongs], Math.max(0, recSongs.findIndex((x) => x.id === song.id)))
          }}
        >
          立即播放
        </MenuItem>
        <MenuItem icon={<ArrowRightRegular />} onClick={() => playSongNext(song)}>
          下一首播放
        </MenuItem>
        <MenuItem
          icon={isFav ? <HeartFilled /> : <HeartRegular />}
          onClick={() => void recToggleFav(song)}
        >
          {isFav ? '取消收藏' : '收藏'}
        </MenuItem>
        <MenuItem icon={<FolderAddRegular />} onClick={() => setAddTarget([song])}>
          添加到歌单
        </MenuItem>
        <MenuItem
          icon={<ArrowDownloadRegular />}
          onClick={() => {
            api.downloadAdd([song])
            toastSuccess('已加入下载队列', song.title)
          }}
        >
          下载
        </MenuItem>
        <MenuItem
          icon={<ArrowSwapRegular />}
          onClick={() => useStore.getState().openSongDialog('source', song)}
        >
          更换音源
        </MenuItem>
        <MenuItem
          icon={<InfoRegular />}
          onClick={() => useStore.getState().openSongDialog('info', song)}
        >
          歌曲详情
        </MenuItem>
        <MenuItem
          icon={<CopyRegular />}
          onClick={() => {
            void api.appCopy(`${song.title} - ${song.artist}`)
            toastSuccess('已复制', `${song.title} - ${song.artist}`)
          }}
        >
          复制歌名歌手
        </MenuItem>
      </>
    )
  }

  /** 推荐歌单右键菜单项 */
  const plMenuItems = (pl: NeteasePlaylistBrief) => (
    <>
      <MenuItem icon={<OpenRegular />} onClick={() => void openPlaylistPreview(pl)}>
        打开歌单
      </MenuItem>
      <MenuItem icon={<PlayRegular />} onClick={() => void plPlayAll(pl)}>
        播放全部
      </MenuItem>
      <MenuItem
        icon={<CopyRegular />}
        onClick={() => {
          void api.appCopy(pl.name)
          toastSuccess('已复制', pl.name)
        }}
      >
        复制歌单名
      </MenuItem>
    </>
  )

  const clearHistory = async () => {
    await api.libraryClearSearchHistory()
    await refresh()
  }

  const removeHistory = async (q: string) => {
    await api.libraryRemoveSearchHistory(q)
    await refresh()
  }

  // ===== QQ音乐 / 酷狗 歌单·歌手 预览(整页) =====
  if (srcPreview) {
    const brief = srcPreview.brief
    const isPlaylist = srcPreview.kind === 'playlist'
    const pl = isPlaylist ? (brief as SourcePlaylistBrief) : null
    const ar = !isPlaylist ? (brief as SourceArtistBrief) : null
    const platformName = srcPreview.platform === 'qq' ? 'QQ音乐' : '酷狗'
    const coverUrl = pl ? (pl.coverUrl ?? srcPreviewMeta?.coverUrl) : ar?.avatar
    const count = pl ? pl.count || srcPreviewMeta?.songs.length || 0 : undefined
    const creator = pl ? (pl.creator || srcPreviewMeta?.creator) : undefined
    const playCount = pl ? (pl.playCount ?? srcPreviewMeta?.playCount) : undefined
    const favCount = pl ? (pl.favCount ?? srcPreviewMeta?.favCount) : undefined
    const metaText = pl
      ? [
          `${count} 首`,
          creator,
          playCount ? `播放 ${formatCount(playCount)}` : '',
          favCount ? `收藏 ${formatCount(favCount)}` : ''
        ]
          .filter(Boolean)
          .join(' · ')
      : [`${platformName}歌手`, ar?.musicCount ? `${ar.musicCount} 首作品` : ''].filter(Boolean).join(' · ')
    const filtered = srcPreviewSongs
      ? previewKw.trim()
        ? srcPreviewSongs.filter((s) => {
            const q = previewKw.trim().toLowerCase()
            return (
              s.title.toLowerCase().includes(q) ||
              s.artist.toLowerCase().includes(q) ||
              (s.album ?? '').toLowerCase().includes(q)
            )
          })
        : srcPreviewSongs
      : null
    return (
      <div
        key={`src-preview-${brief.id}`}
        className={animCls}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <div className={styles.root}>
          <div className={styles.headerRow} style={{ gap: 16 }}>
            <Tooltip content="返回" relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowLeftRegular />}
                onClick={() => {
                  setSrcPreview(null)
                  setSrcPreviewSongs(null)
                }}
              />
            </Tooltip>
            <Cover
              url={coverUrl}
              size={72}
              radius={isPlaylist ? 10 : 36}
              iconSize={28}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size={600} weight="semibold" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {brief.name}
              </Text>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {metaText}
              </Text>
            </div>
            <Button
              appearance="primary"
              icon={<PlayRegular />}
              disabled={!filtered || filtered.length === 0 || playerLoading}
              onClick={() => filtered && playQueue(filtered, 0)}
            >
              播放全部
            </Button>
            {isPlaylist && (
              <Button
                icon={srcPreviewImporting ? <Spinner size="tiny" /> : <CloudArrowDownRegular />}
                disabled={srcPreviewImporting}
                onClick={importSourcePlaylist}
              >
                {srcPreviewImporting ? '导入中…' : '导入为歌单'}
              </Button>
            )}
          </div>
          {srcPreviewSongs && srcPreviewSongs.length > 0 && (
            <Input
              placeholder="在列表内搜索歌曲(标题 / 歌手 / 专辑)"
              value={previewKw}
              onChange={(_, d) => setPreviewKw(d.value)}
              contentBefore={<SearchRegular />}
              style={{ maxWidth: 420 }}
            />
          )}
          <div className={styles.results}>
            {srcPreviewLoading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {filtered && filtered.length > 0 && <SongList songs={filtered} showAlbum />}
            {filtered && filtered.length === 0 && (
              <div className={styles.empty}>
                <Text size={400}>{srcPreviewSongs?.length ? '没有匹配的歌曲' : '列表内容为空'}</Text>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== 歌单预览(全屏,同"我的歌单"详情布局,进出带过渡动画) =====
  if (previewPl) {
    return (
      <div
        key={`preview-${previewPl.id}`}
        className={animCls}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
      <div className={styles.root}>
        <div className={styles.headerRow} style={{ gap: 16 }}>
          <Tooltip content="返回" relationship="label">
            <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setPreviewPl(null)} />
          </Tooltip>
          <Cover url={previewPl.coverUrl ?? previewMeta?.coverUrl} size={72} radius={10} iconSize={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size={600} weight="semibold" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {previewPl.name}
            </Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {previewPl.count} 首{previewPl.creator ? ` · ${previewPl.creator}` : ''}
              {previewMeta?.playCount != null ? ` · 播放 ${formatCount(previewMeta.playCount)}` : ''}
              {previewMeta?.subscribedCount != null
                ? ` · 收藏 ${formatCount(previewMeta.subscribedCount)}`
                : ''}
              {previewMeta?.createTime
                ? ` · 创建于 ${new Date(previewMeta.createTime).getFullYear()}-${String(new Date(previewMeta.createTime).getMonth() + 1).padStart(2, '0')}-${String(new Date(previewMeta.createTime).getDate()).padStart(2, '0')}`
                : ''}
            </Text>
            {previewMeta?.tags && previewMeta.tags.length > 0 && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                标签:{previewMeta.tags.join(' / ')}
              </Text>
            )}
          </div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={!previewSongs || previewSongs.length === 0 || playerLoading}
            onClick={() => previewSongs && playQueue(previewSongs, 0)}
          >
            播放全部
          </Button>
          <Button icon={<CloudArrowDownRegular />} onClick={importPreviewPlaylist}>
            导入为歌单
          </Button>
        </div>
        {previewMeta?.description && (
          <Text
            size={200}
            style={{
              color: tokens.colorNeutralForeground3,
              whiteSpace: 'pre-line',
              lineHeight: 1.7,
              maxHeight: 72,
              overflowY: 'auto'
            }}
          >
            {previewMeta.description}
          </Text>
        )}
        {/* 页内搜索 */}
        {previewSongs && previewSongs.length > 0 && (
          <Input
            placeholder="在歌单内搜索歌曲(标题 / 歌手 / 专辑)"
            value={previewKw}
            onChange={(_, d) => setPreviewKw(d.value)}
            contentBefore={<SearchRegular />}
            style={{ maxWidth: 420 }}
          />
        )}
        <div className={styles.results}>
          {previewLoading && (
            <div className={styles.empty}>
              <Spinner />
            </div>
          )}
          {previewSongs && previewSongs.length > 0 && (
            <SongList
              songs={
                previewKw.trim()
                  ? previewSongs.filter((s) => {
                      const q = previewKw.trim().toLowerCase()
                      return (
                        s.title.toLowerCase().includes(q) ||
                        s.artist.toLowerCase().includes(q) ||
                        (s.album ?? '').toLowerCase().includes(q)
                      )
                    })
                  : previewSongs
              }
              showAlbum
            />
          )}
          {previewSongs && previewSongs.length === 0 && (
            <div className={styles.empty}>
              <Text size={400}>歌单内容为空</Text>
            </div>
          )}
        </div>
      </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.headerRow} style={{ position: 'relative' }}>
        <Input
          size="large"
          placeholder={
            source === 'bili'
              ? '搜索哔哩哔哩视频'
              : source === 'qq'
                ? '搜索QQ音乐(原生音源)'
                : source === 'kugou'
                  ? '搜索酷狗音乐(原生音源)'
                  : source === 'qishui'
                    ? '搜索汽水音乐'
                    : '搜索网易云音乐、歌手、专辑'
          }
          value={query}
          onChange={(_, d) => setQuery(d.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
          contentBefore={<SearchRegular />}
          contentAfter={
            query ? (
              <Button
                appearance="subtle"
                size="small"
                icon={<DismissRegular />}
                onClick={() => {
                  setQuery('')
                  setSearched(false)
                }}
              />
            ) : undefined
          }
          style={{ flex: 1 }}
          onFocus={() => {
            setFocusHist(true)
            if (suggestions.length > 0) setShowSuggestions(true)
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 150)
            setTimeout(() => setFocusHist(false), 200)
          }}
        />
        <Button
          size="large"
          appearance="primary"
          icon={loading ? <Spinner size="tiny" /> : <SearchRegular />}
          onClick={() => doSearch(query)}
        >
          搜索
        </Button>
        {showSuggestions && suggestions.length > 0 && (
          <div className={styles.suggestions}>
            {suggestions.map((s) => (
              <div
                key={s}
                className={styles.suggestionItem}
                onMouseDown={() => {
                  setQuery(s)
                  doSearch(s)
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      <TabList
        selectedValue={source}
        onTabSelect={(_, d) => switchSource(d.value as 'bili' | 'netease' | 'qq' | 'kugou' | 'qishui')}
        appearance="transparent"
      >
        <Tab value="netease">网易云音乐</Tab>
        <Tab value="bili">哔哩哔哩</Tab>
        <Tab value="qq">QQ音乐</Tab>
        <Tab value="kugou">酷狗</Tab>
        <Tab value="qishui">汽水</Tab>
      </TabList>

      {source !== 'bili' && source !== 'qishui' && (
        <TabList
          selectedValue={searchType}
          onTabSelect={(_, d) => {
            const t = d.value as SearchType
            setSearchType(t)
            if (lastQuery.current) {
              setQuery(lastQuery.current)
              doSearchWith(lastQuery.current, t)
            }
          }}
          appearance="subtle"
          size="small"
        >
          <Tab value="songs">歌曲</Tab>
          <Tab value="playlists">歌单</Tab>
          <Tab value="artists">歌手</Tab>
        </TabList>
      )}

      {source === 'bili' && (
        <div className={styles.optionsRow}>
          <Dropdown
            value={BILI_ORDERS.find((o) => o.value === order)?.label}
            selectedOptions={[order]}
            onOptionSelect={(_, d) => setOrder(d.optionValue ?? 'totalrank')}
            style={{ minWidth: '130px' }}
          >
            {BILI_ORDERS.map((o) => (
              <Option key={o.value} value={o.value} text={o.label}>
                {o.label}
              </Option>
            ))}
          </Dropdown>
          <Switch
            checked={!!settings?.filterLongVideo}
            label={`过滤超过 ${settings?.longVideoMinutes ?? 10} 分钟的视频`}
            onChange={(_, d) => useStore.getState().updateSetting('filterLongVideo', d.checked)}
          />
        </div>
      )}

      <div className={styles.results}>
        {!searched && !focusHist && library?.settings.uiModules.searchRecommend !== false && (
          <>
            {/* 主页:推荐歌曲(与手机端首页一致,歌单与歌曲并存) */}
            {recSongs.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text weight="semibold">推荐歌曲</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    单击播放
                  </Text>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
                  {recSongs.map((s) => (
                    <div
                      key={s.id}
                      className={styles.chip}
                      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 10, boxSizing: 'border-box', cursor: 'pointer' }}
                      onClick={() => playQueue([...recSongs], recSongs.indexOf(s))}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const anchor = recAnchorRef.current
                        if (anchor) {
                          anchor.style.left = `${e.clientX}px`
                          anchor.style.top = `${e.clientY}px`
                        }
                        setRecCtx({ song: s })
                      }}
                    >
                      <Cover url={s.coverUrl} size={44} radius={6} iconSize={18} />
                      <div style={{ minWidth: 0 }}>
                        <Text size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.title}
                        </Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.artist}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 主页:网易云推荐歌单 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text weight="semibold">网易云推荐</Text>
            </div>
            {recList.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {recList.map((p) => (
                  <div
                    key={p.id}
                    className={styles.chip}
                    style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, boxSizing: 'border-box', cursor: 'pointer' }}
                    onClick={() => openPlaylistPreview(p)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const anchor = plAnchorRef.current
                      if (anchor) {
                        anchor.style.left = `${e.clientX}px`
                        anchor.style.top = `${e.clientY}px`
                      }
                      setPlCtx(p)
                    }}
                  >
                    <Cover url={p.coverUrl} size={64} radius={8} iconSize={24} />
                    <div style={{ minWidth: 0 }}>
                      <Text weight="semibold" size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {formatCount(p.count)}次播放
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : recLoaded ? (
              <div className={styles.empty}>
                <Text size={300}>推荐歌单加载失败,可直接输入关键词搜索</Text>
              </div>
            ) : (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}

            {/* 主页推荐卡片右键菜单(受控,锚点跟随鼠标) */}
            <span
              ref={recAnchorRef}
              style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
              aria-hidden
            />
            <Menu
              open={!!recCtx}
              onOpenChange={(_, d) => {
                if (!d.open) setRecCtx(null)
              }}
              positioning={{ target: recCtx ? recAnchorRef.current : undefined }}
            >
              <MenuTrigger disableButtonEnhancement>
                <span style={{ display: 'none' }} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>{recCtx ? recMenuItems(recCtx.song) : null}</MenuList>
              </MenuPopover>
            </Menu>
            <span
              ref={plAnchorRef}
              style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
              aria-hidden
            />
            <Menu
              open={!!plCtx}
              onOpenChange={(_, d) => {
                if (!d.open) setPlCtx(null)
              }}
              positioning={{ target: plCtx ? plAnchorRef.current : undefined }}
            >
              <MenuTrigger disableButtonEnhancement>
                <span style={{ display: 'none' }} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>{plCtx ? plMenuItems(plCtx) : null}</MenuList>
              </MenuPopover>
            </Menu>
            <AddToPlaylistDialog
              songs={addTarget ?? []}
              open={addTarget != null}
              onClose={() => setAddTarget(null)}
            />
          </>
        )}

        {!searched && focusHist && (
          <>
            {library && library.searchHistory.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text weight="semibold">搜索历史</Text>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<DeleteRegular />}
                    onClick={clearHistory}
                  >
                    清空
                  </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: 16 }}>
                  {library.searchHistory.map((h) => (
                    <div
                      key={h}
                      className={styles.historyRow}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        doSearch(h)
                      }}
                    >
                      <HistoryRegular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: tokens.fontSizeBase300
                        }}
                      >
                        {h}
                      </span>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<DismissRegular />}
                        title="删除该记录"
                        onClick={(e) => {
                          e.stopPropagation()
                          void removeHistory(h)
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={styles.empty}>
              <Text size={500}>搜索全平台音乐</Text>
              <Text size={300}>输入关键词,支持哔哩哔哩视频与网易云音乐歌曲</Text>
            </div>
          </>
        )}

        {searched && source === 'bili' && (
          biliResults.length > 0 ? (
            <SongList songs={biliResults} />
          ) : (
            !loading && (
              <div className={styles.empty}>
                <Text size={400}>没有找到相关视频</Text>
              </div>
            )
          )
        )}

        {searched && source === 'netease' && searchType === 'songs' && (
          <>
            {neResults.length > 0 ? (
              <SongList songs={neResults} showAlbum />
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌曲</Text>
                </div>
              )
            )}
            {neHasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <Button onClick={loadMoreNetease} disabled={loading}>
                  {loading ? <Spinner size="tiny" /> : '加载更多'}
                </Button>
              </div>
            )}
          </>
        )}

        {searched && source === 'netease' && searchType === 'playlists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {nePlaylists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {nePlaylists.map((p) => (
                  <div
                    key={p.id}
                    className={styles.chip}
                    style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => openPlaylistPreview(p)}
                  >
                    <Cover url={p.coverUrl} size={56} radius={8} iconSize={22} />
                    <div style={{ minWidth: 0 }}>
                      <Text weight="semibold" size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {p.count} 首{p.creator ? ` · ${p.creator}` : ''}
                        {p.favCount ? ` · 收藏 ${formatCount(p.favCount)}` : ''}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌单</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'qq' && searchType === 'songs' && (
          <>
            {qqResults.length > 0 ? (
              <SongList songs={qqResults} showAlbum />
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌曲</Text>
                </div>
              )
            )}
            {qqResults.length > 0 && qqResults.length % 30 === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <Button onClick={loadMoreQq} disabled={loading}>
                  {loading ? <Spinner size="tiny" /> : '加载更多'}
                </Button>
              </div>
            )}
          </>
        )}

        {searched && source === 'qq' && searchType === 'playlists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {qqPlaylists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {qqPlaylists.map((p) => (
                  <div
                    key={p.id}
                    className={styles.chip}
                    style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => void openSourcePreview({ kind: 'playlist', platform: 'qq', brief: p })}
                  >
                    <Cover url={p.coverUrl} size={56} radius={8} iconSize={22} />
                    <div style={{ minWidth: 0 }}>
                      <Text weight="semibold" size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {p.count} 首{p.creator ? ` · ${p.creator}` : ''}
                        {p.playCount ? ` · 播放 ${formatCount(p.playCount)}` : ''}
                        {p.favCount ? ` · 收藏 ${formatCount(p.favCount)}` : ''}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌单</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'qq' && searchType === 'artists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {qqArtists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {qqArtists.map((a) => (
                  <div
                    key={a.id}
                    className={styles.chip}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 16, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => useStore.getState().openArtistPage('qq', a.id)}
                  >
                    <Cover url={a.avatar} size={80} radius={40} iconSize={28} />
                    <Text weight="semibold" size={300} style={{ textAlign: 'center' }}>
                      {a.name}
                    </Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      QQ音乐歌手{a.musicCount ? ` · ${a.musicCount} 首` : ''}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌手</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'qishui' && (
          <>
            {qsResults.length > 0 ? (
              <SongList songs={qsResults} showAlbum />
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌曲</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'kugou' && searchType === 'songs' && (
          <>
            {kgResults.length > 0 ? (
              <SongList songs={kgResults} showAlbum />
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌曲</Text>
                </div>
              )
            )}
            {kgResults.length > 0 && kgResults.length % 30 === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <Button onClick={loadMoreKg} disabled={loading}>
                  {loading ? <Spinner size="tiny" /> : '加载更多'}
                </Button>
              </div>
            )}
          </>
        )}

        {searched && source === 'kugou' && searchType === 'playlists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {kgPlaylists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {kgPlaylists.map((p) => (
                  <div
                    key={p.id}
                    className={styles.chip}
                    style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => void openSourcePreview({ kind: 'playlist', platform: 'kugou', brief: p })}
                  >
                    <Cover url={p.coverUrl} size={56} radius={8} iconSize={22} />
                    <div style={{ minWidth: 0 }}>
                      <Text weight="semibold" size={300} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {p.count} 首{p.creator ? ` · ${p.creator}` : ''}
                        {p.playCount ? ` · 播放 ${formatCount(p.playCount)}` : ''}
                        {p.favCount ? ` · 收藏 ${formatCount(p.favCount)}` : ''}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌单</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'kugou' && searchType === 'artists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {kgArtists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {kgArtists.map((a) => (
                  <div
                    key={a.id}
                    className={styles.chip}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 16, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => useStore.getState().openArtistPage('kugou', a.id)}
                  >
                    <Cover url={a.avatar} size={80} radius={40} iconSize={28} />
                    <Text weight="semibold" size={300} style={{ textAlign: 'center' }}>
                      {a.name}
                    </Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      酷狗歌手{a.musicCount ? ` · ${a.musicCount} 首` : ''}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌手</Text>
                </div>
              )
            )}
          </>
        )}

        {searched && source === 'netease' && searchType === 'artists' && (
          <>
            {loading && (
              <div className={styles.empty}>
                <Spinner />
              </div>
            )}
            {neArtists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {neArtists.map((a) => (
                  <div
                    key={a.id}
                    className={styles.chip}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 16, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => openArtistDetail(a)}
                  >
                    <Cover url={a.avatar} size={80} radius={40} iconSize={28} />
                    <Text weight="semibold" size={300} style={{ textAlign: 'center' }}>
                      {a.name}
                    </Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      歌手{a.musicCount ? ` · ${a.musicCount} 首` : ''}
                    </Text>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <Text size={400}>没有找到相关歌手</Text>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
