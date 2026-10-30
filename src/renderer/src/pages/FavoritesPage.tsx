/** 我的收藏页:收藏过的歌曲列表(按收藏时间倒序) */
import { useEffect, useState } from 'react'
import { Spinner, Text, makeStyles, tokens } from '@fluentui/react-components'
import { HeartFilled } from '@fluentui/react-icons'
import type { Song } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { SongList } from '../components/SongList'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 24px 0',
    gap: '12px',
    boxSizing: 'border-box'
  },
  header: { display: 'flex', alignItems: 'center', gap: '10px' },
  results: { flex: 1, overflowY: 'auto', paddingBottom: '16px', minHeight: 0 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '60px 0',
    color: tokens.colorNeutralForeground3
  }
})

export function FavoritesPage() {
  const styles = useStyles()
  const [songs, setSongs] = useState<Song[] | null>(null)
  // 用长度做依赖而不是数组本身:store 里 favoriteIds 可能是新数组引用,
  // 直接依赖数组会每次渲染都触发 effect,造成无限更新循环(React #185)
  const favCount = useStore((s) => s.library?.favoriteIds?.length ?? 0)

  useEffect(() => {
    let alive = true
    void api.libraryGetFavorites().then((list) => {
      if (alive) setSongs(list)
    })
    return () => {
      alive = false
    }
  }, [favCount])

  const onRemove = async (song: Song): Promise<void> => {
    await api.libraryToggleFavorite(song)
    await useStore.getState().refreshLibrary()
    void api.libraryGetFavorites().then(setSongs)
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <HeartFilled style={{ color: tokens.colorPaletteRedForeground1 }} />
        <Text size={600} weight="semibold">
          我的收藏
        </Text>
        {songs && songs.length > 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            共 {songs.length} 首
          </Text>
        )}
      </div>
      <div className={styles.results}>
        {songs === null ? (
          <div className={styles.empty}>
            <Spinner />
          </div>
        ) : songs.length === 0 ? (
          <div className={styles.empty}>
            <HeartFilled style={{ fontSize: 40, opacity: 0.3 }} />
            <Text size={400}>还没有收藏的歌曲</Text>
            <Text size={200}>在歌曲列表里点 ♡ 即可收藏</Text>
          </div>
        ) : (
          <SongList songs={songs} showAlbum onRemove={(s) => void onRemove(s)} />
        )}
      </div>
    </div>
  )
}
