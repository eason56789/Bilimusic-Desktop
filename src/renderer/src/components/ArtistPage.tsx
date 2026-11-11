/** 歌手主页(跨平台统一):头像/简介/粉丝数/热门歌曲/页内搜索 + 数据来源平台标识 */
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Divider,
  Input,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  ArrowLeftRegular,
  PlayRegular,
  SearchRegular,
  DismissRegular
} from '@fluentui/react-icons'
import type { ArtistPlatform, Song, UnifiedArtistDetail } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from './SongList'
import { Cover } from './Cover'
import { toastError } from '../lib/toast'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 24px 0',
    gap: '12px',
    overflowY: 'auto'
  },
  header: { display: 'flex', gap: '20px', alignItems: 'flex-start' },
  meta: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
  chips: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  chip: {
    fontSize: tokens.fontSizeBase200,
    padding: '3px 12px',
    borderRadius: '999px',
    background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})`,
    color: tokens.colorNeutralForeground2
  },
  /** 数据来源平台标识:与其它平台标签同形,用品牌色区分 */
  platformChip: {
    fontSize: tokens.fontSizeBase200,
    padding: '3px 12px',
    borderRadius: '999px',
    background: 'var(--bm-surface-3, rgba(255,255,255,0.14))',
    color: tokens.colorBrandForeground1,
    fontWeight: 600
  },
  desc: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1.7,
    whiteSpace: 'pre-line',
    maxWidth: '760px'
  },
  /** 歌曲区:占满剩余高度并独立滚动(列表长时页面本身不动) */
  songs: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' },
  /** 分隔线:Fluent Divider 默认 flex:1 会在列容器里被拉伸成大空白,必须锁死 */
  divider: { flex: '0 0 auto', alignSelf: 'stretch' }
})

/** 平台中文名(顶部标识) */
const PLATFORM_LABEL: Record<ArtistPlatform, string> = {
  netease: '网易云音乐',
  qq: 'QQ音乐',
  kugou: '酷狗音乐',
  qishui: '汽水音乐',
  bilibili: '哔哩哔哩'
}

export function ArtistPage() {
  const styles = useStyles()
  const target = useStore((s) => s.artistPageId)
  const close = useStore((s) => s.closeArtistPage)
  const playQueue = useStore((s) => s.playQueue)
  /** 音源加载中禁用播放键 */
  const playerLoading = useStore((s) => s.loading)
  const [detail, setDetail] = useState<UnifiedArtistDetail | null>(null)
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [kw, setKw] = useState('')
  const [descOpen, setDescOpen] = useState(false)

  const platform = target?.platform
  const artistId = target?.id

  useEffect(() => {
    if (!platform || !artistId) return
    let cancelled = false
    setLoading(true)
    setDetail(null)
    setSongs(null)
    setKw('')
    setDescOpen(false)
    Promise.all([api.artistDetail(platform, artistId), api.artistSongs(platform, artistId)])
      .then(([d, s]) => {
        if (cancelled) return
        if (d.ok && d.data) setDetail(d.data)
        else toastError('歌手信息获取失败', d.error)
        if (s.ok && s.data) setSongs(s.data)
      })
      .catch((e) => {
        if (!cancelled) toastError('歌手信息获取失败', String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [platform, artistId])

  // 页内搜索:标题/专辑过滤(本地,立即响应)
  const filtered = useMemo(() => {
    if (!songs) return null
    const q = kw.trim().toLowerCase()
    if (!q) return songs
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.album ?? '').toLowerCase().includes(q)
    )
  }, [songs, kw])

  if (!platform || !artistId) return null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Tooltip content="返回" relationship="label">
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={close} />
        </Tooltip>
        <Cover
          url={detail?.avatar}
          size={120}
          radius={999}
          iconSize={44}
          quality="full"
        />
        <div className={styles.meta}>
          <Text size={700} weight="semibold" style={{ display: 'block' }}>
            {detail?.name ?? '歌手'}
          </Text>
          {detail?.alias && detail.alias.length > 0 && (
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {detail.alias.join(' / ')}
            </Text>
          )}
          <div className={styles.chips}>
            {/* 数据来源平台:明确标示这条歌手信息是从哪个平台取的 */}
            <span className={styles.platformChip}>{PLATFORM_LABEL[platform]}</span>
            {typeof detail?.fansCount === 'number' && (
              <span className={styles.chip}>粉丝 {formatCount(detail.fansCount)}</span>
            )}
            {detail?.musicCount != null && <span className={styles.chip}>歌曲 {detail.musicCount}</span>}
            {detail?.albumSize != null && <span className={styles.chip}>专辑 {detail.albumSize}</span>}
            {detail?.mvSize != null && detail.mvSize > 0 && <span className={styles.chip}>MV {detail.mvSize}</span>}
          </div>
          {detail?.briefDesc && (
            <div
              className={styles.desc}
              style={
                descOpen
                  ? undefined
                  : {
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }
              }
            >
              {detail.briefDesc}
            </div>
          )}
          {detail?.briefDesc && detail.briefDesc.length > 120 && (
            <Button
              size="small"
              appearance="transparent"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setDescOpen((v) => !v)}
            >
              {descOpen ? '收起简介' : '展开简介'}
            </Button>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button
              appearance="primary"
              icon={<PlayRegular />}
              disabled={!songs || songs.length === 0 || playerLoading}
              onClick={() => songs && playQueue(songs, 0)}
            >
              播放全部
            </Button>
            <Button
              icon={<PlayRegular />}
              disabled={!songs || songs.length === 0 || playerLoading}
              onClick={() => {
                if (!songs || songs.length === 0) return
                const shuffled = [...songs].sort(() => Math.random() - 0.5)
                playQueue(shuffled, 0)
              }}
            >
              随机播放
            </Button>
          </div>
        </div>
      </div>

      {/* Divider 必须锁死高度:默认 flex:1 会在列布局里撑成大片空白(旧 bug) */}
      <Divider className={styles.divider} />

      {/* 页内搜索 */}
      <Input
        placeholder="在本页搜索歌曲(标题 / 专辑)"
        value={kw}
        onChange={(_, d) => setKw(d.value)}
        contentBefore={<SearchRegular />}
        contentAfter={
          kw ? (
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              onClick={() => setKw('')}
            />
          ) : undefined
        }
        style={{ maxWidth: 420, flex: '0 0 auto' }}
      />

      <div className={styles.songs}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        )}
        {!loading && filtered && filtered.length > 0 && (
          <SongList songs={filtered} showAlbum />
        )}
        {!loading && filtered && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Text size={400} style={{ color: tokens.colorNeutralForeground3 }}>
              {kw ? '本页没有匹配的歌曲' : '暂无热门歌曲'}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

/** 1.9万 / 1908万 */
function formatCount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n ?? 0)
}
