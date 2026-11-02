/**
 * Still(时计) —— 静态三行歌词,零动画、零 GPU 占用。
 *
 * 移植自 folia(AGPL-3.0)src/components/visualizer/still/VisualizerStill.tsx。
 * 相对上游只改了 import 路径与类型来源,渲染结构完全保留。
 */
import React, { useEffect, useState } from 'react'
import {
  resolveThemeFontStack,
  resolveThemeFontWeight,
  resolveThemeTranslationFontStack
} from '../../fontStacks'
import { VisualizerShell } from '../../VisualizerShell'
import type { FoliaLine, FoliaTheme } from '../../bridge'

export interface StillProps {
  currentLineIndex: number
  lines: FoliaLine[]
  theme: FoliaTheme
  subtitleTheme?: FoliaTheme
  lyricsFontScale?: number
  subtitleFontScale?: number
  hideTranslationSubtitle?: boolean
  isDaylight?: boolean
  showText?: boolean
}

export function VisualizerStill({
  currentLineIndex,
  lines,
  theme,
  subtitleTheme,
  lyricsFontScale = 1,
  subtitleFontScale = 1,
  hideTranslationSubtitle = false,
  isDaylight = false,
  showText = true
}: StillProps): JSX.Element {
  const [effectiveIndex, setEffectiveIndex] = useState(() => Math.max(0, currentLineIndex))

  useEffect(() => {
    if (currentLineIndex !== -1) {
      setEffectiveIndex(currentLineIndex)
    } else if (effectiveIndex >= lines.length) {
      setEffectiveIndex(0)
    }
  }, [currentLineIndex, effectiveIndex, lines.length])

  const resolvedSubtitleTheme = subtitleTheme ?? theme

  return (
    <VisualizerShell theme={theme} className="visualizer-still">
      <div
        className={`absolute inset-0 z-0 pointer-events-none ${isDaylight ? 'opacity-30 mix-blend-multiply' : 'opacity-[0.65]'} bg-[radial-gradient(ellipse_at_center,transparent_0%,#000_100%)]`}
      />

      {showText && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none px-12 pb-16 gap-8">
          {[-1, 0, 1].map((offset) => {
            const lineIndex = effectiveIndex + offset
            const line = lines[lineIndex]
            if (!line) {
              return <div key={`empty-${offset}`} className="h-20" />
            }

            const isCurrent = offset === 0
            return (
              <div key={lineIndex} className="flex flex-col items-center w-full max-w-4xl">
                {line.fullText && (
                  <div
                    className={`drop-shadow-md text-center tracking-[0.02em] ${isCurrent ? 'text-[2.5rem] opacity-100 leading-tight' : 'text-3xl opacity-30'}`}
                    style={{
                      color: theme.primaryColor,
                      fontFamily: resolveThemeFontStack(theme),
                      scale: String(lyricsFontScale),
                      fontWeight: resolveThemeFontWeight(theme, isCurrent ? 700 : 600)
                    }}
                  >
                    {line.fullText}
                  </div>
                )}
                {line.translation && !hideTranslationSubtitle && (
                  <div
                    className={`drop-shadow-sm text-center tracking-wide ${isCurrent ? 'text-2xl opacity-80 mt-3' : 'text-xl opacity-30 mt-2'}`}
                    style={{
                      color: resolvedSubtitleTheme.secondaryColor,
                      fontFamily: resolveThemeTranslationFontStack(resolvedSubtitleTheme),
                      scale: String(lyricsFontScale * subtitleFontScale),
                      fontWeight: resolveThemeFontWeight(resolvedSubtitleTheme, isCurrent ? 500 : 400)
                    }}
                  >
                    {line.translation}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </VisualizerShell>
  )
}

export default VisualizerStill
