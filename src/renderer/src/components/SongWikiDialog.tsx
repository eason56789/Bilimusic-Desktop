/** 歌曲百科(参考开源项目 NeriPlayer,数据来自网易云音乐):曲风/BPM/语种、艺人、相似歌曲、相关歌单、创作团队、评论预览 */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogSurface,
  DialogTitle,
  DialogContent,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  DismissRegular,
  ChevronDownRegular,
  ChevronUpRegular,
  MusicNote2Regular,
  PlayRegular,
  HeartRegular
} from '@fluentui/react-icons'
import type { NeteaseSongWiki, Song, CommentsResult } from '@shared/types'
import { api } from '../lib/api'
import { useStore, fmtDur } from '../store'
import { Cover } from './Cover'
import { toastError, toastSuccess } from '../lib/toast'

const useStyles = makeStyles({
  surface: {
    width: '720px',
    maxWidth: '94vw',
    height: '88vh',
    display: 'flex',
    flexDirection: 'column'
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0
  },
  headTitles: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 },
  headTitle: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px' },
  card: {
    background: 'var(--bm-surface-1, ' + tokens.colorNeutralBackground2 + ')',
    borderRadius: '12px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400
  },
  cardIcon: { color: tokens.colorBrandForeground1, fontSize: '18px', display: 'flex' },
  kvGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 18px', alignItems: 'baseline' },
  kvKey: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300, whiteSpace: 'nowrap' },
  kvVal: { fontSize: tokens.fontSizeBase300, lineHeight: 1.5 },
  tagsRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  tag: {
    padding: '2px 10px',
    borderRadius: '999px',
    background: 'var(--bm-surface-3, ' + tokens.colorNeutralBackground3 + ')',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2
  },
  artistRow: { display: 'flex', gap: '12px', alignItems: 'center' },
  artistAvatar: { borderRadius: '50%', flexShrink: 0 },
  artistStats: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: 'flex', gap: '10px' },
  brief: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    overflow: 'hidden'
  },
  songRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    ':hover': { background: 'var(--bm-surface-3, ' + tokens.colorNeutralBackground3 + ')' }
  },
  songIdx: { width: '20px', textAlign: 'right', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300, flexShrink: 0 },
  songMeta: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' },
  songName: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  songArtist: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  plCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    minWidth: 0
  },
  plCoverWrap: { width: '100%', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden' },
  plName: {
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: tokens.fontWeightSemibold
  },
  plCount: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  commentRow: { display: 'flex', gap: '10px', padding: '8px 0', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  commentHead: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  commentUser: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200 },
  commentTime: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  commentLikes: { marginLeft: 'auto', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: 'inline-flex', alignItems: 'center', gap: '3px' },
  commentContent: { fontSize: tokens.fontSizeBase300, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  footer: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textAlign: 'center',
    padding: '10px 0 2px',
    flexShrink: 0
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '60px 0', flex: 1 },
  linkBtn: { alignSelf: 'flex-start' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }
})

/** 相似歌曲 → 可直接播放的网易云 Song */
function simToSong(s: { songId: number; name: string; artist: string; coverUrl?: string }): Song {
  return {
    id: `netease-${s.songId}`,
    title: s.name,
    artist: s.artist,
    coverUrl: s.coverUrl ?? null,
    duration: 0,
    source: 'NETEASE',
    neteaseId: s.songId,
    page: 1,
    addedAt: Date.now()
  }
}

function fmtPlayCount(n: number | undefined): string {
  if (!n || n <= 0) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

function fmtCommentTime(ms: number | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtPublish(ms: number | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SongWikiDialog({
  song,
  open,
  onClose
}: {
  song: Song | null
  open: boolean
  onClose: () => void
}) {
  const styles = useStyles()
  const [wiki, setWiki] = useState<NeteaseSongWiki | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [simExpanded, setSimExpanded] = useState(false)
  const [comments, setComments] = useState<CommentsResult | null>(null)
  const playQueue = useStore((s) => s.playQueue)
  const openSongDialog = useStore((s) => s.openSongDialog)
  const reqSeq = useRef(0)

  useEffect(() => {
    if (!open || !song) return
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    setWiki(null)
    setComments(null)
    setBriefOpen(false)
    setSimExpanded(false)
    api
      .songWiki(song)
      .then((r) => {
        if (seq !== reqSeq.current) return
        if (r.ok && r.data) setWiki(r.data)
        else setError(r.error ?? '暂无百科数据')
      })
      .catch(() => {
        if (seq !== reqSeq.current) return
        setError('加载失败,请稍后重试')
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false)
      })
    // 评论预览(失败不影响百科主体)
    api
      .commentsGet(song, 0, 'hot')
      .then((r) => {
        if (seq !== reqSeq.current) return
        if (r.ok && r.data) setComments(r.data)
      })
      .catch(() => {})
  }, [open, song])

  const playSims = (list: { songId: number; name: string; artist: string; coverUrl?: string }[], idx: number) => {
    const songs = list.map(simToSong).filter((s) => s.neteaseId && s.neteaseId > 0)
    if (songs.length === 0) return
    playQueue(songs, Math.min(Math.max(0, idx), songs.length - 1))
    toastSuccess('开始播放', songs[Math.min(idx, songs.length - 1)].title)
  }

  const openRelatedPlaylist = async (playlistId: number, name: string) => {
    try {
      const r = await api.neteasePlaylistSongs(playlistId)
      if (!r.ok || !r.data || r.data.length === 0) {
        toastError('打开歌单失败', '未能获取歌单内容')
        return
      }
      playQueue(r.data.slice(0, 50), 0)
      toastSuccess('正在播放歌单', name)
    } catch {
      toastError('打开歌单失败', '请稍后重试')
    }
  }

  if (!song) return null

  const credits = wiki?.credits
  const creditRows: { role: string; names: string[] }[] = credits
    ? [
        { role: '作词', names: credits.lyricists },
        { role: '作曲', names: credits.composers },
        { role: '编曲', names: credits.arrangers },
        { role: '制作人', names: credits.producers },
        ...credits.other
      ].filter((r) => r.names.length > 0)
    : []

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
          <div style={{ padding: '18px 24px 0' }}>
            <div className={styles.head}>
              <Cover url={song.coverUrl} size={64} radius={10} iconSize={26} />
              <div className={styles.headTitles}>
                <Text className={styles.headTitle}>{song.title}</Text>
                <Text size={300} style={{ color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {song.artist}
                </Text>
              </div>
              <Button
                appearance="subtle"
                icon={<HeartRegular />}
                onClick={() => {
                  void api.libraryToggleFavorite(song).then(() => useStore.getState().refreshLibrary())
                  toastSuccess('已收藏', song.title)
                }}
              />
              <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} />
            </div>
          </div>

          {loading ? (
            <div className={styles.center}>
              <Spinner />
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                正在获取歌曲百科…
              </Text>
            </div>
          ) : error ? (
            <div className={styles.center}>
              <MusicNote2Regular fontSize={40} style={{ color: tokens.colorNeutralForeground3 }} />
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {error}
              </Text>
            </div>
          ) : wiki ? (
            <div className={styles.scroll}>
              {/* 歌曲详情 */}
              {(wiki.genres.length > 0 || wiki.language || wiki.bpm || wiki.albumName || wiki.albumCompany) && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <span className={styles.cardIcon}>
                      <MusicNote2Regular />
                    </span>
                    歌曲详情
                  </div>
                  <div className={styles.kvGrid}>
                    {wiki.genres.length > 0 && (
                      <>
                        <span className={styles.kvKey}>曲风</span>
                        <span className={styles.kvVal}>
                          <span className={styles.tagsRow}>
                            {wiki.genres.map((g) => (
                              <span key={g} className={styles.tag}>
                                {g}
                              </span>
                            ))}
                          </span>
                        </span>
                      </>
                    )}
                    {wiki.language && (
                      <>
                        <span className={styles.kvKey}>语种</span>
                        <span className={styles.kvVal}>{wiki.language}</span>
                      </>
                    )}
                    {wiki.bpm ? (
                      <>
                        <span className={styles.kvKey}>BPM</span>
                        <span className={styles.kvVal}>{wiki.bpm}</span>
                      </>
                    ) : null}
                    {wiki.albumName && (
                      <>
                        <span className={styles.kvKey}>专辑</span>
                        <span className={styles.kvVal}>{wiki.albumName}</span>
                      </>
                    )}
                    {wiki.publishTime ? (
                      <>
                        <span className={styles.kvKey}>发行日期</span>
                        <span className={styles.kvVal}>{fmtPublish(wiki.publishTime)}</span>
                      </>
                    ) : null}
                    {wiki.albumCompany && (
                      <>
                        <span className={styles.kvKey}>发行公司</span>
                        <span className={styles.kvVal}>{wiki.albumCompany}</span>
                      </>
                    )}
                  </div>
                  {wiki.awards.length > 0 && (
                    <div className={styles.kvGrid}>
                      <span className={styles.kvKey}>所获奖项</span>
                      <span className={styles.kvVal}>
                        {wiki.awards.map((a, i) => (
                          <div key={i}>
                            {a.title}
                            {a.detail ? ` · ${a.detail}` : ''}
                          </div>
                        ))}
                      </span>
                    </div>
                  )}
                  {wiki.appearances.length > 0 && (
                    <div className={styles.kvGrid}>
                      <span className={styles.kvKey}>出现于</span>
                      <span className={styles.kvVal}>{wiki.appearances.join(' / ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 关于艺人 */}
              {wiki.artist && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <span className={styles.cardIcon}>
                      <MusicNote2Regular />
                    </span>
                    关于艺人
                  </div>
                  <div className={styles.artistRow}>
                    <Cover url={wiki.artist.avatar} size={48} radius={24} iconSize={20} className={styles.artistAvatar} />
                    <div className={styles.headTitles}>
                      <Text weight="semibold">{wiki.artist.name}</Text>
                      <div className={styles.artistStats}>
                        {wiki.artist.musicSize != null && <span>{wiki.artist.musicSize} 首歌曲</span>}
                        {wiki.artist.albumSize != null && <span>{wiki.artist.albumSize} 张专辑</span>}
                        {wiki.artist.fansCount != null && <span>{fmtPlayCount(wiki.artist.fansCount)} 粉丝</span>}
                      </div>
                    </div>
                  </div>
                  {wiki.artist.briefDesc && (
                    <>
                      <div
                        className={styles.brief}
                        style={briefOpen ? undefined : { maxHeight: '72px' }}
                      >
                        {wiki.artist.briefDesc}
                      </div>
                      {wiki.artist.briefDesc.length > 90 && (
                        <Button
                          size="small"
                          appearance="subtle"
                          className={styles.linkBtn}
                          icon={briefOpen ? <ChevronUpRegular /> : <ChevronDownRegular />}
                          onClick={() => setBriefOpen((v) => !v)}
                        >
                          {briefOpen ? '收起' : '展开'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 相似歌曲 */}
              {wiki.similarSongs.length > 0 && (
                <div className={styles.card}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={styles.cardTitle}>
                      <span className={styles.cardIcon}>
                        <MusicNote2Regular />
                      </span>
                      相似歌曲
                    </div>
                    <div style={{ flex: 1 }} />
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<PlayRegular />}
                      onClick={() => playSims(wiki.similarSongs, 0)}
                    >
                      播放全部
                    </Button>
                  </div>
                  {(simExpanded ? wiki.similarSongs : wiki.similarSongs.slice(0, 5)).map((s, i) => (
                    <div key={s.songId} className={styles.songRow} onClick={() => playSims(wiki.similarSongs, i)}>
                      <span className={styles.songIdx}>{i + 1}</span>
                      <Cover url={s.coverUrl} size={40} radius={6} iconSize={16} />
                      <div className={styles.songMeta}>
                        <span className={styles.songName}>{s.name}</span>
                        <span className={styles.songArtist}>{s.artist}</span>
                      </div>
                    </div>
                  ))}
                  {wiki.similarSongs.length > 5 && (
                    <Button
                      size="small"
                      appearance="subtle"
                      className={styles.linkBtn}
                      icon={simExpanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
                      onClick={() => setSimExpanded((v) => !v)}
                    >
                      {simExpanded ? '收起' : `展开(${wiki.similarSongs.length})`}
                    </Button>
                  )}
                </div>
              )}

              {/* 相关歌单 */}
              {wiki.relatedPlaylists.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <span className={styles.cardIcon}>
                      <MusicNote2Regular />
                    </span>
                    相关歌单
                  </div>
                  <div className={styles.grid2}>
                    {wiki.relatedPlaylists.slice(0, 6).map((p) => (
                      <div
                        key={p.playlistId}
                        className={styles.plCard}
                        onClick={() => void openRelatedPlaylist(p.playlistId, p.name)}
                      >
                        <div className={styles.plCoverWrap}>
                          <Cover url={p.coverUrl} size={200} radius={10} iconSize={26} />
                        </div>
                        <span className={styles.plName}>{p.name}</span>
                        <span className={styles.plCount}>{fmtPlayCount(p.playCount)} 次播放</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 基本信息 */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <span className={styles.cardIcon}>
                    <MusicNote2Regular />
                  </span>
                  基本信息
                </div>
                <div className={styles.kvGrid}>
                  <span className={styles.kvKey}>歌曲</span>
                  <span className={styles.kvVal}>{song.title}</span>
                  <span className={styles.kvKey}>歌手</span>
                  <span className={styles.kvVal}>{song.artist}</span>
                  {song.duration > 0 && (
                    <>
                      <span className={styles.kvKey}>时长</span>
                      <span className={styles.kvVal}>{fmtDur(song.duration * 1000)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 创作团队 */}
              {creditRows.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <span className={styles.cardIcon}>
                      <MusicNote2Regular />
                    </span>
                    创作团队
                  </div>
                  <div className={styles.kvGrid}>
                    {creditRows.map((r) => (
                      <div key={r.role} style={{ display: 'contents' }}>
                        <span className={styles.kvKey}>{r.role}</span>
                        <span className={styles.kvVal}>{r.names.join(' / ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 歌曲评论预览 */}
              {comments && comments.comments.length > 0 && (
                <div className={styles.card}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={styles.cardTitle}>
                      <span className={styles.cardIcon}>
                        <MusicNote2Regular />
                      </span>
                      歌曲评论
                      {comments.total > 0 && (
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          共 {fmtPlayCount(comments.total)} 条
                        </Text>
                      )}
                    </div>
                  </div>
                  {comments.comments.slice(0, 3).map((c) => (
                    <div key={c.id} className={styles.commentRow}>
                      <Cover url={c.avatar} size={36} radius={18} iconSize={14} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className={styles.commentHead}>
                          <span className={styles.commentUser}>{c.user}</span>
                          <span className={styles.commentTime}>{fmtCommentTime(c.time)}</span>
                          <span className={styles.commentLikes}>♡ {fmtPlayCount(c.likes)}</span>
                        </div>
                        <div className={styles.commentContent}>{c.content}</div>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="small"
                    appearance="subtle"
                    className={styles.linkBtn}
                    onClick={() => openSongDialog('comments', song)}
                  >
                    查看全部评论
                  </Button>
                </div>
              )}

              <div className={styles.footer}>数据来自网易云音乐,仅供参考</div>
            </div>
          ) : null}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
