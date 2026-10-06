import { makeStyles, tokens } from '@fluentui/react-components'
import { MusicNote2Regular } from '@fluentui/react-icons'
import { useState } from 'react'

const useStyles = makeStyles({
  fallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${tokens.colorNeutralBackground4}, ${tokens.colorNeutralBackground6})`,
    color: tokens.colorNeutralForeground3
  },
  img: {
    objectFit: 'cover',
    width: '100%',
    height: '100%',
    display: 'block'
  }
})

export function coverSrc(cover: string | null | undefined): string | null {
  if (!cover) return null
  if (cover.startsWith('bmedia://') || cover.startsWith('data:')) return cover
  return `bmedia://img/?url=${encodeURIComponent(cover)}`
}

export function Cover({
  url,
  size,
  radius = 6,
  iconSize = 18
}: {
  url?: string | null
  size: number
  radius?: number
  iconSize?: number
}) {
  const styles = useStyles()
  const [failed, setFailed] = useState(false)
  const src = coverSrc(url)
  if (!src || failed) {
    return (
      <div
        className={styles.fallback}
        style={{ width: size, height: size, borderRadius: radius, flexShrink: 0 }}
      >
        <MusicNote2Regular fontSize={iconSize} />
      </div>
    )
  }
  return (
    <img
      className={styles.img}
      src={src}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radius, flexShrink: 0 }}
      alt=""
      crossOrigin="anonymous"
    />
  )
}
