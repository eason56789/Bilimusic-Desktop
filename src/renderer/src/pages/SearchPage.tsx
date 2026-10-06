/** 搜索页:B站视频 / 网易云歌曲·歌单·歌手 双源搜索 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
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
  CloudArrowDownRegular,
  HistoryRegular
} from '@fluentui/react-icons'
import type {
  NeteaseArtistBrief,
  NeteasePlaylistBrief,
  Playlist,
  Song
} from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'
import { Cover } from '../components/Cover'
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
    background: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
    maxHeight: '260px',
    overflowY: 'auto'
  },
  suggestionItem: {
    padding: '6px 12px',
    cursor: 'pointer',
    ':hover': { background: tokens.colorNeutralBackground3 }
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 10px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    ':hover': { background: tokens.colorNeutralBackground3 }
  },
  chip: {
    padding: '4px 12px',
    borderRadius: '999px',
    background: tokens.colorNeutralBackground3,
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase200,
    ':hover': { background: tokens.colorNeutralBackground3Hover }
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

function formatCount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n ?? 0)
}

const BILI_ORDERS: { value: string; label: string }[] = [
  { value: 'totalrank', label: '综合排序' },
  { value: 'click', label: '最多播放' },
  { value: 'stow', label: '最多收藏' },
  { value: 'dm', label: '最多弹幕' },
  { value: 'pubdate', label: '最新发布' }
]

export function SearchPage() {
  const styles = useStyles()
  const library = useStore((s) => s.library)
  const refresh = useStore((s) => s.refreshLibrary)
  const playQueue = useStore((s) => s.playQueue)
  const [source, setSource] = useState<'bili' | 'netease'>('bili')
  const [neType, setNeType] = useState<'songs' | 'playlists' | 'artists'>('songs')
  const [query, setQuery] = useState('')
  const [biliResults, setBiliResults] = useState<Song[]>([])
  const [neResults, setNeResults] = useState<Song[]>([])
  const [neHasMore, setNeHasMore] = useState(false)
  const [nePlaylists, setNePlaylists] = useState<NeteasePlaylistBrief[]>([])
  const [neArtists, setNeArtists] = useState<NeteaseArtistBrief[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [order, setOrder] = useState('totalrank')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [previewPl, setPreviewPl] = useState<NeteasePlaylistBrief | null>(null)
  const [previewSongs, setPreviewSongs] = useState<Song[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [artistDetail, setArtistDetail] = useState<NeteaseArtistBrief | null>(null)
  const [artistSongs, setArtistSongs] = useState<Song[] | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuery = useRef('')

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
  const doSearch = async (q: string, typeOverride?: typeof neType, srcOverride?: typeof source) => {
    const keyword = q.trim()
    if (!keyword) return
    lastQuery.current = keyword
    const neT = typeOverride ?? neType
    const src = srcOverride ?? source
    setLoading(true)
    setSearched(true)
    setShowSuggestions(false)
    try {
      if (src === 'bili') {
        const results = await api.biliSearch(keyword, 1, order)
        setBiliResults(filterLong(results))
      } else if (neT === 'songs') {
        const r = await api.neteaseSearch(keyword, 0)
        if (r.ok && r.data) {
          setNeResults(r.data.songs)
          setNeHasMore(r.data.hasMore)
        } else {
          toastError('网易云搜索失败', r.error)
        }
      } else if (neT === 'playlists') {
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

  const doSearchWith = (q: string, type: typeof neType): void => {
    void doSearch(q, type)
  }

  // 打开歌单预览
  const openPlaylistPreview = async (pl: NeteasePlaylistBrief) => {
    setPreviewPl(pl)
    setPreviewSongs(null)
    setPreviewLoading(true)
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

  // 打开歌手详情
  const openArtistDetail = async (a: NeteaseArtistBrief) => {
    setArtistDetail(a)
    setArtistSongs(null)
    setArtistLoading(true)
    try {
      const r = await api.neteaseArtistSongs(a.id)
      if (r.ok && r.data) setArtistSongs(r.data)
      else toastError('获取歌曲失败', r.error)
    } finally {
      setArtistLoading(false)
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

  // B站搜索建议(防抖)
  useEffect(() => {
    if (source !== 'bili' || !query.trim()) {
      setSuggestions([])
      return
    }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const list = await api.biliSuggest(query.trim())
      setSuggestions(list.slice(0, 8))
      setShowSuggestions(true)
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

  const switchSource = (src: 'bili' | 'netease') => {
    setSource(src)
    setShowSuggestions(false)
    // 显式传入目标音源,避免用 setState 前的旧 source 发起搜索
    if (lastQuery.current) void doSearch(lastQuery.current, undefined, src)
  }

  // 主页:网易云推荐歌单
  const [focusHist, setFocusHist] = useState(false)
  const [recList, setRecList] = useState<NeteasePlaylistBrief[]>([])
  // 加载完成标记:失败时也要结束转圈,否则 Spinner 永远转下去
  const [recLoaded, setRecLoaded] = useState(false)
  useEffect(() => {
    api
      .neteasePersonalized()
      .then((r) => {
        if (r.ok && r.data) setRecList(r.data)
      })
      .catch(() => {})
      .finally(() => setRecLoaded(true))
  }, [])

  const clearHistory = async () => {
    await api.libraryClearSearchHistory()
    await refresh()
  }

  const removeHistory = async (q: string) => {
    await api.libraryRemoveSearchHistory(q)
    await refresh()
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
          <Cover url={previewPl.coverUrl} size={72} radius={10} iconSize={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size={600} weight="semibold" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {previewPl.name}
            </Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {previewPl.count} 首{previewPl.creator ? ` · ${previewPl.creator}` : ''}
            </Text>
          </div>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={!previewSongs || previewSongs.length === 0}
            onClick={() => previewSongs && playQueue(previewSongs, 0)}
          >
            播放全部
          </Button>
          <Button icon={<CloudArrowDownRegular />} onClick={importPreviewPlaylist}>
            导入为歌单
          </Button>
        </div>
        <div className={styles.results}>
          {previewLoading && (
            <div className={styles.empty}>
              <Spinner />
            </div>
          )}
          {previewSongs && previewSongs.length > 0 && <SongList songs={previewSongs} showAlbum />}
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
          placeholder={source === 'bili' ? '搜索哔哩哔哩视频' : '搜索网易云音乐、歌手、专辑'}
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
        onTabSelect={(_, d) => switchSource(d.value as 'bili' | 'netease')}
        appearance="transparent"
      >
        <Tab value="bili">哔哩哔哩</Tab>
        <Tab value="netease">网易云音乐</Tab>
      </TabList>

      {source === 'netease' && (
        <TabList
          selectedValue={neType}
          onTabSelect={(_, d) => {
            const t = d.value as typeof neType
            setNeType(t)
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
                    style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, boxSizing: 'border-box' }}
                    onClick={() => openPlaylistPreview(p)}
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

        {searched && source === 'netease' && neType === 'songs' && (
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

        {searched && source === 'netease' && neType === 'playlists' && (
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

        {searched && source === 'netease' && neType === 'artists' && (
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

      {/* 歌手详情 */}
      <Dialog open={!!artistDetail} onOpenChange={(_, d) => !d.open && setArtistDetail(null)}>
        <DialogSurface style={{ maxWidth: 680, width: '92vw', maxHeight: '84vh' }}>
          <DialogBody>
            <DialogTitle>{artistDetail?.name ?? '歌手'}</DialogTitle>
            <DialogContent style={{ minHeight: 200 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <Cover url={artistDetail?.avatar} size={64} radius={32} iconSize={24} />
                <div>
                  <Text weight="semibold">{artistDetail?.name}</Text>
                  <div>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      歌手{artistDetail?.musicCount ? ` · ${artistDetail.musicCount} 首` : ''}
                    </Text>
                  </div>
                </div>
              </div>
              {artistLoading && (
                <div className={styles.empty}>
                  <Spinner />
                </div>
              )}
              {artistSongs && artistSongs.length > 0 && (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <SongList songs={artistSongs} showAlbum />
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setArtistDetail(null)}>关闭</Button>
              <Button
                appearance="primary"
                icon={<PlayRegular />}
                disabled={!artistSongs || artistSongs.length === 0}
                onClick={() => {
                  if (artistSongs && artistSongs.length > 0) {
                    useStore.getState().playQueue(artistSongs, 0)
                    setArtistDetail(null)
                  }
                }}
              >
                播放全部
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
