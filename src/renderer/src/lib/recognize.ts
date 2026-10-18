/** 听歌识别(渲染层部分):抓系统回环音频 8 秒 → 16kHz 单声道 WAV
 *
 * Windows 下 desktopCapturer 屏幕源带 loopback 音频(整段系统声音),
 * 不需要麦克风;macOS/ Linux 无此能力,直接报"仅支持 Windows"。
 */
export interface RecognizeCaptureResult {
  ok: boolean
  error?: string
}

/** 16kHz 单声道 16bit PCM WAV 打包 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const w = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  w(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits
  w(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** 降采样到目标采样率(简单线性插值,足够识别用) */
function downmixResample(input: Float32Array, from: number, to: number): Float32Array {
  if (Math.abs(from - to) < 1) return input
  const ratio = from / to
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio
    const i0 = Math.floor(x)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const f = x - i0
    out[i] = input[i0] * (1 - f) + input[i1] * f
  }
  return out
}

const CAPTURE_MS = 8000

/**
 * 抓取系统声音 CAPTURE_MS 毫秒并编码 WAV。
 * onStage 用于 UI 状态反馈(recording/encoding/sending)。
 */
export async function captureSystemAudioWav(
  onStage?: (s: 'recording' | 'encoding' | 'sending') => void
): Promise<Blob> {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('当前环境不支持音频捕获')
  }
  // desktopCapturer 取屏幕源(Windows 上其音频即系统回环)
  const sources = await window.api.desktopSources()
  if (!sources.length) throw new Error('没有可用的音频回环源(仅 Windows 支持)')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sources[0].id
      }
    } as unknown as MediaTrackConstraints,
    video: {
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id }
    } as unknown as MediaTrackConstraints
  })
  try {
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) throw new Error('该屏幕源未携带系统音频')
    // 只留音频轨,避免视频轨占用编码器
    stream.getVideoTracks().forEach((t) => t.stop())
    const audioOnly = new MediaStream([audioTrack])
    const ctx = new AudioContext()
    const srcNode = ctx.createMediaStreamSource(audioOnly)
    // 采样缓冲:直接收集原始 PCM
    const procNode = ctx.createScriptProcessor(4096, 1, 1)
    const chunks: Float32Array[] = []
    let total = 0
    const targetRate = 16000
    procNode.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(d))
      total += d.length
    }
    srcNode.connect(procNode)
    procNode.connect(ctx.destination) // scriptProcessor 必须连到 destination 才会跑
    onStage?.('recording')
    await new Promise((r) => setTimeout(r, CAPTURE_MS))
    srcNode.disconnect()
    procNode.disconnect()
    await ctx.close()
    audioTrack.stop()

    onStage?.('encoding')
    const merged = new Float32Array(total)
    let o = 0
    for (const c of chunks) {
      merged.set(c, o)
      o += c.length
    }
    // 静音检测:全接近 0 视为没有声音,提前给出可读错误
    let peak = 0
    for (let i = 0; i < merged.length; i += 64) peak = Math.max(peak, Math.abs(merged[i]))
    if (peak < 0.005) throw new Error('没有检测到系统声音:请先播放音乐,再点识别')
    const resampled = downmixResample(merged, ctx.sampleRate, targetRate)
    return encodeWav(resampled, targetRate)
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}
