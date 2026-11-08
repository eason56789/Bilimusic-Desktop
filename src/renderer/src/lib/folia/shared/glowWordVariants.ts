import type { Variants } from 'framer-motion';
import type { Theme } from '../bridge';

// src/components/visualizer/glowWordVariants.ts
// classic / partita 的 GlowWord 用的 framer-motion variants：外层容器（位置 / 缩放 / 旋转）与正文层（颜色 / 模糊）。

// Container motion is the "body" of each word.
// waiting/active/passed all reuse the same layout config but interpret it differently.
export const buildGlowWordLayoutVariants = (
    animationIntensity: Theme['animationIntensity'],
    enableWordRotation = true,
): Variants => ({
    waiting: ({ config }: any) => ({
        opacity: 0,
        scale: 0.5,
        x: config.x + (Math.sin(config.y) * 100),
        y: config.y + (Math.cos(config.x) * 50),
        rotate: enableWordRotation ? config.rotate + 20 : 0,
        transition: { duration: 0.4 }
    }),
    active: ({ config }: any) => ({
        opacity: 1,
        scale: isNaN(config.scale) ? 1.5 : config.scale * 1.4,
        x: config.x,
        y: config.y,
        rotate: config.rotate,
        transition: {
            type: "spring" as const,
            stiffness: 200,
            damping: 20,
            opacity: { duration: 0.1 }
        }
    }),
    passed: ({ config, baseColor }: any) => ({
        opacity: animationIntensity === 'chaotic' ? 0.9 : 0.82,
        scale: config.scale || 1,
        x: config.x,
        y: config.y,
        rotate: config.rotate + config.passedRotate,
        transition: {
            duration: 0.5,
            rotate: {
                duration: 5,
                ease: "linear"
            }
        }
    })
});

// Body layer is where color transition and blur cleanup happen.
// Glow is separated so we can overdrive highlight without making the actual glyph unreadable.
export const glowWordBodyVariants: Variants = {
    waiting: ({ baseColor }: any) => ({
        color: baseColor,
        filter: "blur(10px)",
        transition: { duration: 0.4 }
    }),
    active: ({ activeColor, duration, wordRevealMode }: any) => ({
        color: activeColor,
        filter: "none",
        transition: {
            color: { duration: duration || 0.2, ease: "linear" },
            filter: { type: "tween", duration: wordRevealMode === 'instant' ? 0.08 : wordRevealMode === 'fast' ? 0.12 : 0.2 }
        },
        transitionEnd: {
            filter: "none"
        }
    }),
    passed: ({ baseColor, wordRevealMode }: any) => ({
        color: baseColor,
        filter: "blur(0px)",
        transition: {
            color: { duration: wordRevealMode === 'instant' ? 0.12 : wordRevealMode === 'fast' ? 0.24 : 0.8, ease: "easeInOut" },
            filter: { duration: wordRevealMode === 'instant' ? 0.12 : wordRevealMode === 'fast' ? 0.2 : 0.5 }
        },
        transitionEnd: {
            filter: "none"
        }
    })
};

// ===== 莫奈式「走字」变体(经典样式选用) =====
// 借鉴 monet:不做整词弹跳/散开,外层静止;正文按字的进度从"未唱淡色"扫到"已唱实色",
// 边界字在两色之间线性插值(羽化)。glow 层仍由 wordGlowVariants 提供光晕。

/** 颜色插值:#rrggbb / rgb() / rgba() → rgba 数值混合;解析失败退回目标色 */
const lerpColor = (a: string, b: string, t: number): string => {
    const pa = a.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    const pb = b.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    if (pa.length < 3 || pb.length < 3) return t < 1 ? a : b;
    const mix = (i: number) => Math.round((pa[i] ?? 255) + ((pb[i] ?? 255) - (pa[i] ?? 255)) * t);
    return `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${(t).toFixed(3)} * ${(pb[3] ?? 1).toFixed(2)} + ${(1 - t).toFixed(3)} * ${(pa[3] ?? 1).toFixed(2)})`
        .replace('rgba', 'rgba');
};

/** 走字进度:0..1,基于 currentTime MotionValue 的逐字插值 */
export const buildSweepWordBodyVariants = (): Variants => ({
    waiting: ({ baseColor }: any) => ({
        color: baseColor,
        filter: 'blur(0px)',
        transition: { duration: 0.2 }
    }),
    active: ({ baseColor, activeColor, duration, index, total, charStartTime, charEndTime, wordStartTime }: any) => {
        // 逐字:每个字在自己时间段内从 baseColor 扫到 activeColor
        const hasCharTiming = typeof charStartTime === 'number' && typeof charEndTime === 'number' && typeof wordStartTime === 'number';
        const single = (duration ?? 0.2) / Math.max(total ?? 1, 1);
        const charDelay = hasCharTiming ? Math.max(0, charStartTime - wordStartTime) : single * (index ?? 0);
        const charDur = hasCharTiming ? Math.max(charEndTime - charStartTime, 0.05) : single;
        return {
            color: [baseColor, activeColor],
            filter: 'blur(0px)',
            transition: {
                color: { duration: charDur, delay: charDelay, ease: 'linear' },
                default: { duration: 0 }
            }
        };
    },
    passed: ({ activeColor }: any) => ({
        color: activeColor,
        filter: 'blur(0px)',
        transition: { duration: 0.15 }
    })
});
