/** 悬浮歌词窗桥(仅主窗口挂载):
 *  把播放/歌词状态推送给悬浮窗,接收悬浮窗的播放控制指令,
 *  并让 settings.floatLyric 成为悬浮窗显隐的唯一事实来源。 */
import { useEffect, useRef } from 'react'
import { useStore, getAudioElement } from '../store'
import { api } from '../lib/api'
import { lyricPosMs, lyricSeekSec } from '../lib/lyricClock'
import { resolveCharTimes, lineEndTime } from '../lib/karaoke'
import type { FloatControlCmd, FloatLyricState, LyricsResult, Settings } from '@shared/types'

/** 与 NowPlaying 相同的当前行判定:lyricPosMs(提前量+偏移-变调延迟) */
function activeLineIndex(lyrics: { lines: { timeMs: number }[] } | null, posMs: number): number {
  if (!lyrics || lyrics.lines.length === 0) return -1
  let idx = -1
  for (let i = 0; i < lyrics.lines.length; i++) {
    if (lyrics.lines[i].timeMs <= posMs) idx = i
    else break
  }
  return idx
}

/** 悬浮窗展示所需的一行数据(文本 + 逐字时间 + 翻译) */
interface BuiltLine {
  text: string
  charTimes: number[] | null
  startMs: number
  endMs: number
  trans: string
}

export function FloatBridge() {
  const floatLyric = useStore((s) => s.library?.settings.floatLyric ?? false)
  const lastKeyRef = useRef('')
  /** 逐字时间按行缓存:数组引用稳定,悬浮窗的逐字上色 rAF 不会因重复推送被打断重排 */
  const charMemoRef = useRef<{ key: string; charTimes: number[] | null }>({ key: '', charTimes: null })

  const buildLine = (lyrics: LyricsResult | null, idx: number): BuiltLine => {
    const lines = lyrics?.lines ?? []
    const line = idx >= 0 ? lines[idx] : null
    if (!line) return { text: '', charTimes: null, startMs: 0, endMs: 0, trans: '' }
    const key = `${idx}|${line.timeMs}|${line.text.length}`
    if (charMemoRef.current.key !== key) {
      charMemoRef.current = {
        key,
        // 逐字时间:wordTimes 等长直接用;否则由 words 展开(对齐 trim 偏移)
        charTimes: resolveCharTimes(line.text, line.wordTimes, line.words)
      }
    }
    return {
      text: line.text,
      charTimes: charMemoRef.current.charTimes,
      startMs: line.timeMs,
      endMs: lineEndTime(line.timeMs, lines[idx + 1]?.timeMs),
      trans: line.trans ?? ''
    }
  }

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
      const el = getAudioElement()
      const posMs = lyricPosMs(el.currentTime)
      const idx = activeLineIndex(s.lyrics, posMs)
      const lines = s.lyrics?.lines ?? []
      const cur = buildLine(s.lyrics, idx)
      const nextText = idx + 1 < lines.length ? (lines[idx + 1]?.text ?? '') : ''
      const state: FloatLyricState = {
        hasCurrent: !!s.current,
        title: s.current?.title ?? '',
        artist: s.current?.artist ?? '',
        playing: s.playing,
        loading: s.loading,
        lineText: cur.text,
        charTimes: cur.charTimes,
        lineStartMs: cur.startMs,
        lineEndMs: cur.endMs,
        transText: cur.trans,
        nextText,
        lineIndex: idx,
        lineCount: lines.length,
        posMs,
        pushedAt: Date.now(),
        rate: el.playbackRate || 1,
        muted: s.muted,
        locked: settings?.floatLyricLocked ?? false,
        fontScale: settings?.floatFontScale ?? 1,
        showTrans: settings?.floatShowTrans !== false,
        showNextLine: settings?.floatShowNextLine !== false,
        dark: !!dark,
        accent: settings?.accent ?? '#0f6cbd'
      }
      // 位置必须持续推送(逐字上色依赖插值基准),其余字段变化也一并跟上;
      // 键只用于"暂停时避免重复推送"这类节流判断。
      const key = [
        state.hasCurrent,
        state.title,
        state.playing,
        state.loading,
        state.lineIndex,
        state.dark,
        state.accent,
        state.muted,
        state.locked,
        state.fontScale,
        state.showTrans,
        state.showNextLine
      ].join('|')
      const moving = state.playing && !el.paused
      if (key !== lastKeyRef.current || moving) {
        lastKeyRef.current = key
        api.floatPostState?.(state)
      }
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [floatLyric])

  // 悬浮窗设置菜单改设置 → 统一走 store 落盘(落盘后主进程立即生效)
  useEffect(() => {
    const off = api.onFloatMenuSet?.(({ key, value }) => {
      const st = useStore.getState()
      const k = key as keyof Settings
      void st.updateSetting(k, value as Settings[typeof k])
    })
    return () => off?.()
  }, [])

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
        case 'mute':
          st.setMuted(!st.muted)
          break
        case 'prevLine':
        case 'nextLine': {
          // 上一句/下一句:定位到该句起点;本句已唱过 3 秒则先回本句开头
          const lines = st.lyrics?.lines ?? []
          if (lines.length === 0 || !st.current) break
          const el = getAudioElement()
          const posMs = lyricPosMs(el.currentTime)
          let idx = activeLineIndex(st.lyrics, posMs)
          if (cmd === 'prevLine') {
            const intoLine = idx >= 0 ? posMs - lines[idx].timeMs : 0
            if (idx >= 0 && intoLine > 3000) {
              /* 本句唱过 3 秒:回到本句开头 */
            } else {
              idx = Math.max(0, idx - 1)
            }
          } else {
            idx = Math.min(lines.length - 1, idx + 1)
          }
          if (idx >= 0 && lines[idx]) st.seek(lyricSeekSec(lines[idx].timeMs))
          break
        }
        case 'lock':
          void st.updateSetting('floatLyricLocked', !(st.library?.settings.floatLyricLocked ?? false))
          break
        case 'openMain':
          void api.floatOpenMain?.()
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
