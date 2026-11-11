import { makeStyles, tokens } from '@fluentui/react-components'
import { MusicNote2Regular } from '@fluentui/react-icons'
import { useState } from 'react'

const useStyles = makeStyles({
  fallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${`var(--bm-surface-4, ${tokens.colorNeutralBackground4})`}, ${`var(--bm-surface-6, ${tokens.colorNeutralBackground6})`})`,
    color: tokens.colorNeutralForeground3
  },
  img: {
    objectFit: 'cover',
    width: '100%',
    height: '100%',
    display: 'block'
  }
})

/**
 * 生成某平台封面 URL 的指定尺寸变体(CDN 侧缩放,列表页省流量):
 * - 网易云: p1.music.126.net/xxx.jpg?param=WxH
 * - B站:    i0.hdslb.com/bfs/xxx.jpg@Ww_Hh_1c.webp
 * - QQ音乐: y.qq.com/music/photo_new/T002R500x500M000{mid}.jpg → R{W}x{H}
 * - 酷狗:   imge.kugou.com/stdmusic/{size}/xxx 或占位 {size} → 目标尺寸
 * 无法识别时原样返回。
 */
export function resizeCoverUrl(url: string, size: number): string {
  // 缩略图按 2x 取(高分屏清晰度),上限 1080
  const px = Math.min(1080, Math.max(48, Math.round(size * 2)))
  /** 对齐 CDN 支持的尺寸档位(QQ/酷狗只认预设值,任意值会 404 回退原图) */
  const snap = (levels: number[]): number => levels.find((l) => px <= l) ?? levels[levels.length - 1]
  if (url.includes('music.126.net')) {
    // 网易云图片 CDN 支持 param 查询参数缩放(覆盖已有 param)
    const base = url.split('?')[0]
    // 处理形如 .../xxx.jpg?param=32y32 的历史 URL
    return `${base}?param=${px}y${px}`
  }
  if (url.includes('hdslb.com') && !url.startsWith('bmedia://')) {
    // B站图片: @Ww_Hh_1c.webp 后缀(先剥掉已有 @ 规则)
    const base = url.split('@')[0]
    return `${base}@${px}w_${px}h_1c.webp`
  }
  if (url.includes('y.qq.com/music/photo_new')) {
    const q = snap([35, 50, 90, 150, 300, 500, 800])
    return url.replace(/R\d+x\d+M000/, `R${q}x${q}M000`)
  }
  if (url.includes('kugou.com')) {
    const q = snap([240, 480, 900])
    // 酷狗封面路径形如 /{类别}/{尺寸?}/{日期目录}/{文件}(尺寸段在日期段之前)。
    // 之前把"日期段"当成尺寸段替换,得到 stdmusic/480/240/xxx.jpg 这类非法路径,
    // CDN 会回退成默认占位封面 → 列表里看着"没有封面"
    if (/\{size\}/i.test(url)) return url.replace(/\{size\}/gi, String(q))
    // 已有尺寸段:替换它(尺寸段紧跟类别名,后面一定是 8 位日期目录)
    if (/\/\d{2,4}\/\d{8}\//.test(url)) return url.replace(/\/(\d{2,4})\/(\d{8})\//, `/${q}/$2/`)
    // 无尺寸段:在日期目录前插入
    if (/\/\d{8}\//.test(url)) return url.replace(/\/(\d{8})\//, `/${q}/$1/`)
    // 结构无法识别:保持原图,宁可用大图也不要被 CDN 换成占位图
    return url
  }
  return url
}

export function coverSrc(cover: string | null | undefined, thumbSize?: number): string | null {
  if (!cover) return null
  if (cover.startsWith('data:')) return cover
  if (cover.startsWith('bmedia://')) return cover
  let target = thumbSize ? resizeCoverUrl(cover, thumbSize) : cover
  // 历史数据里可能残留 {size} 占位符(酷狗):原样请求会被 CDN 换成默认占位封面
  if (/\{size\}/i.test(target)) {
    target = target.replace(/\{size\}/gi, thumbSize ? '480' : '900')
  }
  return `bmedia://img/?url=${encodeURIComponent(target)}`
}

export function Cover({
  url,
  size,
  radius = 6,
  iconSize = 18,
  /** 'thumb'(默认,列表/小图):CDN 缩放;'full'(全屏播放页):原始大图 */
  quality = 'thumb'
}: {
  url?: string | null
  size: number
  radius?: number
  iconSize?: number
  quality?: 'thumb' | 'full'
}) {
  const styles = useStyles()
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState(() => coverSrc(url, quality === 'thumb' ? size : undefined))
  /** 图片是否已解码:未解码时用模糊低饱和占位,解码后过渡到清晰(封面渐显) */
  const [loaded, setLoaded] = useState(false)
  // URL/quality 变化时重置(列表复用组件节点的场景)
  const [lastKey, setLastKey] = useState(`${url}|${quality}`)
  if (`${url}|${quality}` !== lastKey) {
    setLastKey(`${url}|${quality}`)
    setSrc(coverSrc(url, quality === 'thumb' ? size : undefined))
    setFailed(false)
    setLoaded(false)
  }
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
      className={`${styles.img} bm-cover-img ${loaded ? 'bm-cover-loaded' : 'bm-cover-loading'}`}
      src={src}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => {
        // 缩略图 CDN 规则失败 → 回退原图一次
        const raw = coverSrc(url, undefined)
        if (quality === 'thumb' && raw && raw !== src) setSrc(raw)
        else setFailed(true)
      }}
      style={{ width: size, height: size, borderRadius: radius, flexShrink: 0 }}
      alt=""
      crossOrigin="anonymous"
    />
  )
}
