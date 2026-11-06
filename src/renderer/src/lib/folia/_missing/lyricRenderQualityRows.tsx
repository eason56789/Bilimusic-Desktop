// stub: 上游 visualizer/renderQuality/LyricRenderQualityRows.tsx 依赖播放器设置 store 与 settings kit;
// 此处降级:全局挡位读 _missing/useVisualizerSettingsStore 的常量,控件用 _missing/settingsKit。
import React from 'react'
import { useTranslation } from '../i18n'
import { useVisualizerSettingsStore } from './useVisualizerSettingsStore'
import type { LyricRenderOverride, LyricRenderScale } from '../utils/lyricRenderQuality'
import { formatLyricRenderScale, LYRIC_ANTIALIAS_OVERRIDES, LYRIC_RENDER_SCALES } from '../utils/lyricRenderQuality'
import { Row, Segmented, Select } from './settingsKit'

/** 抗锯齿的文案 key(降级:'global' 不在样式覆盖的取值里,落到 auto 的文案)。 */
const ANTIALIAS_LABEL_KEYS: Record<string, string> = {
    auto: 'options.lyricAntialiasAuto',
    on: 'options.lyricAntialiasOn',
    off: 'options.lyricAntialiasOff',
    global: 'options.lyricAntialiasAuto',
}

export const LYRIC_ANTIALIAS_LABEL_KEYS = ANTIALIAS_LABEL_KEYS as Record<'auto' | 'on' | 'off' | 'global', string>

type Translate = (key: string, opts?: Record<string, unknown>) => string

/** 分辨率倍数的选项(全局挡位用;样式面板在最前面多一个「跟随全局」)。 */
export const lyricRenderScaleChoices = () =>
    LYRIC_RENDER_SCALES.map((scale) => ({ value: String(scale), label: formatLyricRenderScale(scale) }))

/** 全局挡位抗锯齿的选项。 */
export const lyricAntialiasChoices = (t: Translate) =>
    (['auto', 'on', 'off'] as const).map((mode) => ({ value: mode, label: t(LYRIC_ANTIALIAS_LABEL_KEYS[mode]) }))

type LyricRenderQualityRowsProps = {
    value: LyricRenderOverride
    onChange: (patch: Partial<LyricRenderOverride>) => void
    /** 抗锯齿那一行(全屏着色器、2D canvas 的样式没有,只给分辨率)。 */
    antialias?: boolean
}

const LyricRenderQualityRows: React.FC<LyricRenderQualityRowsProps> = ({ value, onChange, antialias = true }) => {
    const { t } = useTranslation()
    const global = useVisualizerSettingsStore((state) => state.lyricRenderQuality)
    const follow = t('options.lyricRenderFollowGlobal')
    const globalScale: LyricRenderScale = typeof global.scale === 'number' ? global.scale : 1
    return (
        <>
            <Row label={t('options.lyricRenderScale')} note={t('options.lyricRenderScaleStyleHint', { value: formatLyricRenderScale(globalScale) })}>
                <Select<string>
                    value={String(value.scale)}
                    options={[{ value: 'global', label: follow }, ...lyricRenderScaleChoices()]}
                    onChange={(next) =>
                        onChange({
                            scale: next === 'global'
                                ? 'global'
                                : (LYRIC_RENDER_SCALES.find((scale) => String(scale) === next) ?? 'global') as LyricRenderScale | 'global',
                        })
                    }
                />
            </Row>
            {antialias && (
                <Row
                    label={t('options.lyricAntialias')}
                    note={t('options.lyricAntialiasStyleHint', { value: t(ANTIALIAS_LABEL_KEYS[global.antialias] ?? 'options.lyricAntialiasAuto') })}
                >
                    <Segmented<LyricRenderOverride['antialias']>
                        value={value.antialias}
                        options={LYRIC_ANTIALIAS_OVERRIDES.map((mode) => ({
                            value: mode,
                            label: mode === 'global' ? follow : t(ANTIALIAS_LABEL_KEYS[mode]),
                        }))}
                        onChange={(next) => onChange({ antialias: next })}
                    />
                </Row>
            )}
        </>
    )
}

export default LyricRenderQualityRows
