// BiliMusic 独立变调处理器:采样级循环缓冲重采样移调,只改音高不动速度。
// 必须是独立 js 文件:Electron 渲染进程的 CSP 禁止 Blob/data URL 方式装载 worklet。
// 放在 src/renderer/public/(vite publicDir),dev 直接按 /pitch-worklet.js 服务,
// 打包时拷进 out/renderer 同名路径,两种模式装载方式一致。
class BmPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = 1
    this.size = 8192
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)]
    this.w = 0 // 写入位置
    this.r = [0, 0] // 读取位置(双声道各自独立,保持等延迟)
    this.port.onmessage = (e) => {
      this.ratio = e.data
    }
  }
  process(inputs, outputs) {
    const inp = inputs[0]
    const out = outputs[0]
    if (!inp || inp.length === 0) return true
    const n = out[0].length
    const fade = Math.min(n, 64)
    for (let i = 0; i < n; i++) {
      for (let ch = 0; ch < 2; ch++) {
        const b = this.buf[ch]
        const src = inp[Math.min(ch, inp.length - 1)]
        b[this.w] = src ? src[i] : 0
        // 读取位置按比率追赶写入位置:比率>1 追得快(音高升),<1 追得慢(音高降)
        const pos = this.r[ch] + (this.w - this.r[ch]) * this.ratio
        const i0 = Math.floor(pos)
        const frac = pos - i0
        const s0 = b[((i0 % this.size) + this.size) % this.size]
        const s1 = b[(((i0 + 1) % this.size) + this.size) % this.size]
        let v = s0 + (s1 - s0) * frac
        if (this.ratio !== 1) {
          // 块缘淡入淡出:掩盖环形缓冲回卷接缝,防止咔哒声
          const edge = Math.min(i, n - 1 - i)
          if (edge < fade) v *= Math.max(0.2, edge / fade)
        }
        out[ch][i] = v
      }
      this.w = (this.w + 1) % this.size
    }
    // 写/读指针整体回退一块:同一段输入重播,缓冲永不耗尽
    this.w = ((this.w - n) % this.size + this.size) % this.size
    for (let ch = 0; ch < 2; ch++) {
      this.r[ch] = ((this.r[ch] - n) % this.size + this.size) % this.size
    }
    return true
  }
}
registerProcessor('bm-pitch', BmPitchProcessor)
