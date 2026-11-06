// stub: 上游 hooks/useFontsEpoch 是自包含模块,原样拷贝(无播放器依赖)。
import { useEffect, useState } from 'react'

/**
 * Returns a counter that increments every time the document finishes loading web fonts.
 *
 * Canvas text measurement (`measureText`, and pretext on top of it) silently falls back to another
 * face while a web font is still in flight, and the metrics can be ~16% off — enough to change where
 * a lyric line wraps. Measurement caches are keyed by the font *string*, which is identical before
 * and after the load, so a stale measurement would otherwise survive for the whole session.
 */
export const useFontsEpoch = (): number => {
    const [epoch, setEpoch] = useState(0)

    useEffect(() => {
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined
        if (!fonts) {
            return
        }

        let mounted = true
        let loadingDoneSeen = false
        const bump = () => {
            if (mounted) {
                setEpoch((value) => value + 1)
            }
        }
        const handleLoadingDone = () => {
            loadingDoneSeen = true
            bump()
        }

        fonts.addEventListener?.('loadingdone', handleLoadingDone)
        if (fonts.status !== 'loaded') {
            fonts.ready
                ?.then(() => {
                    if (!loadingDoneSeen) {
                        bump()
                    }
                })
                .catch(() => undefined)
        }

        return () => {
            mounted = false
            fonts.removeEventListener?.('loadingdone', handleLoadingDone)
        }
    }, [])

    return epoch
}

export default useFontsEpoch
