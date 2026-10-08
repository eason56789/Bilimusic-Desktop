/** 悬浮歌词窗桥(仅主窗口挂载):
 *  把播放/歌词状态推送给悬浮窗,接收悬浮窗的播放控制指令,
 *  并让 settings.floatLyric 成为悬浮窗显隐的唯一事实来源。 */
import { useEffect, useRef } from 'react'
import { useStore, getAudioElement } from '../store'
import { api } from '../lib/api'
import type { FloatControlCmd, FloatLyricState } from '@shared/types'

/** 与 NowPlaying 相同的当前行判定:位置+200ms 提前量-歌词偏移 */
function activeLineIndex(lyrics: { lines: { timeMs: number }[] } | null, posMs: number): number {
  if (!lyrics || lyrics.lines.length === 0) return -1
  let idx = -1
  for (let i = 0; i < lyrics.lines.length; i++) {
    if (lyrics.lines[i].timeMs <= posMs) idx = i
    else break
  }
  return idx
}

export function FloatBridge() {
  const floatLyric = useStore((s) => s.library?.settings.floatLyric ?? false)
  const lastKeyRef = useRef('')

  // 显隐开关:settings.floatLyric → 主进程窗口
  useEffect(() => {
    api.floatShow?.(floatLyric).catch(() => {})
  }, [floatLyric])

  // 状态推送:轮询 + 变化键比较(仅在行/播放态/曲目等变化时发,位置按秒粒度)
  useEffect(() => {
    if (!floatLyric) return
    const tick = (): void => {
      const s = useStore.getState()
      const settings = s.library?.settings
      const dark =
        settings?.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : settings?.theme === 'dark'
      const offset = settings?.lyricOffsetMs ?? 0
      const posMs = getAudioElement().currentTime * 1000 + 200 - offset
      const idx = activeLineIndex(s.lyrics, posMs)
      const lines = s.lyrics?.lines ?? []
      const state: FloatLyricState = {
        hasCurrent: !!s.current,
        title: s.current?.title ?? '',
        artist: s.current?.artist ?? '',
        playing: s.playing,
        lineText: idx >= 0 ? (lines[idx]?.text ?? '') : '',
        nextText: idx + 1 < lines.length ? (lines[idx + 1]?.text ?? '') : '',
        lineIndex: idx,
        lineCount: lines.length,
        dark: !!dark,
        accent: settings?.accent ?? '#0f6cbd'
      }
      const key = `${state.hasCurrent}|${state.title}|${state.playing}|${state.lineIndex}|${state.dark}|${state.accent}`
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key
        api.floatPostState?.(state)
      }
    }
    tick()
    const t = setInterval(tick, 400)
    return () => clearInterval(t)
  }, [floatLyric])

  // 悬浮窗控制指令 → 播放器
  useEffect(() => {
    const off = api.onFloatControl?.((cmd: FloatControlCmd) => {
      const st = useStore.getState()
      switch (cmd) {
        case 'toggle':
          if (st.current) st.togglePlay()
          break
        case 'prev':
          if (st.current) st.prev()
          break
        case 'next':
          if (st.current) st.next(true)
          break
        case 'hide':
          void st.updateSetting('floatLyric', false)
          break
      }
    })
    return () => off?.()
  }, [])

  return null
}
