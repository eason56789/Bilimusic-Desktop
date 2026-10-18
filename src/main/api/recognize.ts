/** 听歌识别:抓取系统回环音频 → AudD 识别 → 返回歌名/歌手
 *
 * 流程:
 *  1. 渲染层(desktopCapturer 只能在渲染层用)取屏幕源,申请回环音频流
 *  2. WebAudio 采样 8 秒 → 16kHz 单声道 WAV → arrayBuffer
 *  3. 传主进程 → POST api.audd.io(需用户在设置里填 api token)
 *  4. 结果映射为 { title, artist, album } 回渲染层,自动填搜索框
 *
 * 说明:AudD 免费试用需注册 audd.io 拿 token;未配置 token 时返回明确错误提示。
 */
import { net } from 'electron'
import { getStore, saveStore } from '../store'

export interface RecognizedSong {
  title: string
  artist: string
  album?: string
  /** 识别平台(用于结果展示) */
  provider: 'audd'
}

/** 保存/读取 AudD token(设置页可改) */
export function getAuddToken(): string {
  return getStore().settings.songRecognizeToken ?? ''
}

export function setAuddToken(token: string): void {
  getStore().settings.songRecognizeToken = token
  saveStore()
}

/** AudD 识别:wav 字节 → 歌曲(失败抛错,信息可直接展示) */
export async function recognizeAudio(wav: Buffer): Promise<RecognizedSong> {
  const token = getAuddToken()
  if (!token) {
    throw new Error('未配置识别服务:请到「设置 → 听歌识别」填入 AudD API Token(audd.io 免费注册)')
  }
  const fd = new FormData()
  fd.append('api_token', token)
  fd.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'clip.wav')
  fd.append('return', 'timecode')

  const resp = await net.fetch('https://api.audd.io/', { method: 'POST', body: fd })
  if (!resp.ok) throw new Error(`识别服务 HTTP ${resp.status}`)
  const j = (await resp.json()) as {
    status?: string
    error?: { error_message?: string; error_code?: number }
    result?: {
      title?: string
      artist?: string
      album?: string
    } | null
  }
  if (j.error) {
    throw new Error(`识别失败(${j.error.error_code}): ${j.error.error_message ?? '未知错误'}`)
  }
  const r = j.result
  if (!r || !r.title) throw new Error('没有识别出歌曲:确保正在播放音乐且音量足够,再试一次')
  return {
    title: r.title,
    artist: r.artist ?? '',
    album: r.album,
    provider: 'audd'
  }
}
