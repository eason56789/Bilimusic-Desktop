/** 排行榜页:左侧平台 + 榜单目录,右侧榜单曲目(单击播放,复用 SongList) */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Dropdown,
  Option,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { ArrowClockwiseRegular, TrophyRegular } from '@fluentui/react-icons'
import type { ChartCatalog, ChartDetail, ChartPlatform, Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'
import { Cover } from '../components/Cover'
import { toastError } from '../lib/toast'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    boxSizing: 'border-box'
  },
  catalog: {
    width: '216px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: 0,
    // Dropdown 的浮层按祖先宽度定位,这里必须允许收缩
    minWidth: 0
  },
  catalogHead: { padding: '12px 12px 8px' },
  /** Fluent Dropdown 默认 minWidth 250px,会撑破 216px 的左栏:强制 flex 子项收缩 */
  platformDropdown: {
    width: '100%',
    minWidth: 0,
    '> button': { minWidth: 0, width: '100%' }
  },
  catalogBody: { flex: 1, overflowY: 'auto', padding: '0 6px 12px', minHeight: 0 },
  groupName: {
    padding: '10px 8px 4px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: 600
  },
  chartItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '6px 8px',
    border: 'none',
    background: 'transparent',
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    textAlign: 'left',
    cursor: 'default',
    ':hover': { background: `var(--bm-surface-3, ${tokens.colorNeutralBackground3})` }
  },
  chartItemActive: {
    background: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontWeight: 600
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  detailHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 24px 10px',
    flexShrink: 0
  },
  detailMeta: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  listWrap: { flex: 1, overflowY: 'auto', padding: '0 24px 16px', minHeight: 0 },
  center: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '60px 0',
    color: tokens.colorNeutralForeground3
  },
  error: { color: tokens.colorPaletteRedForeground1, maxWidth: '420px', textAlign: 'center' }
})

/** 平台顺序:与搜索页的用户心智一致(网易云 → QQ → 酷狗 → B站) */
const PLATFORMS: { id: ChartPlatform; label: string }[] = [
  { id: 'netease', label: '网易云' },
  { id: 'qq', label: 'QQ音乐' },
  { id: 'kugou', label: '酷狗' },
  { id: 'bilibili', label: '哔哩哔哩' }
]

export function ChartsPage() {
  const styles = useStyles()
  const [platform, setPlatform] = useState<ChartPlatform>('netease')
  const [catalog, setCatalog] = useState<ChartCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [chartId, setChartId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChartDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // 拉取序号:快速切换平台/榜单时丢弃过期响应。
  // 目录与曲目各用一个计数器 —— 共用的话,目录完成后 setChartId 触发的曲目请求
  // 会把序号推高,导致目录的 finally 永远认不出自己而卡住 spinner。
  const catalogSeq = useRef(0)
  const detailSeq = useRef(0)

  // 平台切换 → 拉目录,并自动选第一个榜
  useEffect(() => {
    let alive = true
    const seq = ++catalogSeq.current
    setCatalogLoading(true)
    setCatalog(null)
    setDetail(null)
    setDetailError(null)
    setChartId(null)
    void api
      .chartCatalog(platform)
      .then((r) => {
        if (!alive || seq !== catalogSeq.current) return
        const data = r.ok && r.data ? r.data : null
        setCatalog(
          data ?? {
            platform,
            label: PLATFORMS.find((p) => p.id === platform)?.label ?? platform,
            groups: [],
            error: r.error ?? '榜单目录获取失败'
          }
        )
        const first = data?.groups.flatMap((g) => g.charts)[0]
        if (first) setChartId(first.id)
      })
      .finally(() => {
        if (alive && seq === catalogSeq.current) setCatalogLoading(false)
      })
    return () => {
      alive = false
    }
  }, [platform, reloadKey])

  // 选中榜单 → 拉曲目
  useEffect(() => {
    if (!chartId) return
    let alive = true
    const seq = ++detailSeq.current
    setDetailLoading(true)
    setDetail(null)
    setDetailError(null)
    void api
      .chartSongs(platform, chartId)
      .then((r) => {
        if (!alive || seq !== detailSeq.current) return
        if (r.ok && r.data) setDetail(r.data)
        else setDetailError(r.error ?? '榜单曲目获取失败')
      })
      .finally(() => {
        if (alive && seq === detailSeq.current) setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [platform, chartId, reloadKey])

  const playAll = useCallback(() => {
    const songs = detail?.songs ?? []
    if (songs.length === 0) {
      toastError('榜单为空', '该榜单当前没有可取曲目')
      return
    }
    useStore.getState().playQueue(songs, 0)
  }, [detail])

  const charts = catalog?.groups.flatMap((g) => g.charts) ?? []
  const grouped = catalog?.groups.filter((g) => g.charts.length > 0) ?? []
  // 只有一个无名分组时(网易云/酷狗/B站)不显示分组标题
  const showGroupNames = grouped.some((g) => g.name)

  return (
    <div className={styles.root}>
      {/* 左:平台 + 榜单目录 */}
      <div className={styles.catalog}>
        <div className={styles.catalogHead}>
          <Dropdown
            className={styles.platformDropdown}
            // Fluent 内部给下拉根节点写死了 min-width:250px,比 216px 左栏宽,
            // 会造成浮层溢出;Griffel 类同优先级靠插入顺序,只有内联样式能稳定覆盖
            style={{ minWidth: 0, width: '100%' }}
            value={PLATFORMS.find((p) => p.id === platform)?.label ?? ''}
            selectedOptions={[platform]}
            onOptionSelect={(_, d) => d.optionValue && setPlatform(d.optionValue as ChartPlatform)}
          >
            {PLATFORMS.map((p) => (
              <Option key={p.id} value={p.id} text={p.label}>
                {p.label}
              </Option>
            ))}
          </Dropdown>
        </div>
        <div className={styles.catalogBody}>
          {catalogLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spinner size="tiny" />
            </div>
          ) : catalog?.error ? (
            <Text size={200} style={{ padding: 10, display: 'block' }} className={styles.error}>
              {catalog.error}
            </Text>
          ) : charts.length === 0 ? (
            <Text size={200} style={{ padding: 10, display: 'block', color: tokens.colorNeutralForeground3 }}>
              该平台暂无榜单
            </Text>
          ) : (
            grouped.map((g, gi) => (
              <div key={`${g.name}-${gi}`}>
                {showGroupNames && g.name && <div className={styles.groupName}>{g.name}</div>}
                {g.charts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.chartItem} ${c.id === chartId ? styles.chartItemActive : ''}`}
                    onClick={() => setChartId(c.id)}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}
                    >
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右:榜单曲目 */}
      <div className={styles.main}>
        {detailLoading ? (
          <div className={styles.center}>
            <Spinner />
            <Text size={300}>正在获取榜单…</Text>
          </div>
        ) : detailError ? (
          <div className={styles.center}>
            <Text size={300} className={styles.error}>
              {detailError}
            </Text>
            <Button icon={<ArrowClockwiseRegular />} onClick={() => setReloadKey((k) => k + 1)}>
              重试
            </Button>
          </div>
        ) : !detail ? (
          catalog?.error ? (
            // 目录失败时右侧也给出原因,避免左侧一条错误文字 + 右侧空占位
            <div className={styles.center}>
              <Text size={300} className={styles.error}>
                {catalog.error}
              </Text>
              <Button icon={<ArrowClockwiseRegular />} onClick={() => setReloadKey((k) => k + 1)}>
                重试
              </Button>
            </div>
          ) : (
            <div className={styles.center}>
              <TrophyRegular style={{ fontSize: 40, opacity: 0.3 }} />
              <Text size={400}>
                {catalogLoading ? '正在获取榜单目录…' : '从左侧选择一个榜单'}
              </Text>
            </div>
          )
        ) : (
          <>
            <div className={styles.detailHead}>
              <Cover url={detail.coverUrl} size={72} radius={10} iconSize={28} />
              <div className={styles.detailMeta}>
                <Text size={600} weight="semibold">
                  <TrophyRegular
                    style={{ fontSize: 18, marginRight: 6, verticalAlign: '-2px' }}
                  />
                  {detail.name || '榜单'}
                </Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {PLATFORMS.find((p) => p.id === platform)?.label}
                  {detail.updateTip ? ` · ${detail.updateTip}` : ''}
                  {detail.songs.length > 0 ? ` · ${detail.songs.length} 首` : ''}
                </Text>
              </div>
              <div style={{ flex: 1 }} />
              <Tooltip content="从第一首开始播放整个榜单" relationship="label">
                <Button appearance="primary" disabled={detail.songs.length === 0} onClick={playAll}>
                  播放全部
                </Button>
              </Tooltip>
            </div>
            <div className={styles.listWrap}>
              {detail.songs.length === 0 ? (
                <div className={styles.center}>
                  <Text size={400}>该榜单暂无曲目</Text>
                </div>
              ) : (
                <SongList songs={detail.songs} showAlbum showRank />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
