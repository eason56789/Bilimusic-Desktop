// stub: 上游 renderQuality/LyricRenderQualityRows.tsx 依赖播放器的 useVisualizerSettingsStore
// (读全局「动画与性能」挡位来写说明文案)。此处降级:同样的两行控件(分辨率 / 抗锯齿),
// 说明文案不再报全局挡位的具体值。
import React from 'react';
import { Row, Segmented, Select } from './settingsKit';
import { useTranslation } from '../i18n';
import {
    formatLyricRenderScale,
    LYRIC_ANTIALIAS_OVERRIDES,
    LYRIC_RENDER_SCALES,
    type LyricAntialias,
    type LyricRenderOverride,
    type LyricRenderScale,
} from '../utils/lyricRenderQuality';

export const LYRIC_ANTIALIAS_LABEL_KEYS: Record<LyricAntialias, string> = {
    auto: 'options.lyricAntialiasAuto',
    on: 'options.lyricAntialiasOn',
    off: 'options.lyricAntialiasOff',
};

/** 分辨率倍数的选项(全局挡位用;样式面板在最前面多一个「跟随全局」)。 */
export const lyricRenderScaleChoices = () => LYRIC_RENDER_SCALES.map(scale => ({ value: String(scale), label: formatLyricRenderScale(scale) }));

type LyricRenderQualityRowsProps = {
    value: LyricRenderOverride;
    onChange: (patch: Partial<LyricRenderOverride>) => void;
    /** 抗锯齿那一行(全屏着色器、2D canvas 的样式没有,只给分辨率)。 */
    antialias?: boolean;
};

const LyricRenderQualityRows: React.FC<LyricRenderQualityRowsProps> = ({ value, onChange, antialias = true }) => {
    const { t } = useTranslation();
    const follow = t('options.lyricRenderFollowGlobal');
    return (
        <>
            <Row label={t('options.lyricRenderScale')} note={follow}>
                <Select<string>
                    value={String(value.scale)}
                    options={[{ value: 'global', label: follow }, ...lyricRenderScaleChoices()]}
                    onChange={next =>
                        onChange({
                            scale: next === 'global'
                                ? 'global'
                                : (LYRIC_RENDER_SCALES.find(scale => String(scale) === next) ?? 'global') as LyricRenderScale | 'global',
                        })
                    }
                />
            </Row>
            {antialias && (
                <Row label={t('options.lyricAntialias')} note={follow}>
                    <Segmented<LyricRenderOverride['antialias']>
                        value={value.antialias}
                        options={LYRIC_ANTIALIAS_OVERRIDES.map(mode => ({
                            value: mode,
                            label: mode === 'global' ? follow : t(LYRIC_ANTIALIAS_LABEL_KEYS[mode]),
                        }))}
                        onChange={next => onChange({ antialias: next })}
                    />
                </Row>
            )}
        </>
    );
};

export default LyricRenderQualityRows;
