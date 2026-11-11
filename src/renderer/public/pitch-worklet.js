// BiliMusic 独立变调处理器:双读头颗粒移调(granular pitch shifter),只改音高不动速度。
// 原理:输入写入环形缓冲;两条读头各以 (1-ratio) 的速率扫描"延迟量"(相位相差半窗),
// 读头速度 = ratio(>1 读得快=升调,<1 读得慢=降调),sin 窗在扫描回卷点归零,
// 两窗平方和恒为 1(等功率交叠),回卷处的采样跳变被静音掩盖,听感平滑。
// 必须是独立 js 文件:Electron 渲染进程的 CSP 禁止 Blob/data URL 方式装载 worklet。
// 放在 src/renderer/public/(vite publicDir),dev 直接按 /pitch-worklet.js 服务,
// 打包时拷进 out/renderer 同名路径,两种模式装载方式一致。
class BmPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = 1
    this.bypass = true // ratio≈1 时完全旁路,零染色直通
    // 扫描窗长度(样本):2048 @48kHz ≈ 43ms,平均延迟 ~57ms,听歌无感。
    // 越大颗粒越平滑(低频移调更稳),越小瞬态越好,取中庸值。
    this.sweep = 2048
    // 最小延迟:留出一个渲染量子的安全余量,保证读头永不越过写头
    this.dMin = 256
    // 环形缓冲:需容纳 dMin+sweep+插值余量,8192 有 3 倍裕量
    this.size = 8192
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)]
    this.w = 0 // 写入位置
    // 两条读头的归一化延迟相位 u ∈ [0,1),延迟 = dMin + u*sweep,相差 0.5
    this.u = [0, 0.5]
    this.port.onmessage = (e) => {
      const r = Number(e.data)
      if (!isFinite(r)) return
      // 范围:±12 半音 + 「音调随倍速变化」再乘倍速(0.25~2)→ 最坏 0.125~4
      this.ratio = Math.max(0.0625, Math.min(4, r))
      this.bypass = Math.abs(this.ratio - 1) < 0.0005
    }
  }

  /** 环形缓冲任意实数位置取样:4 点 Catmull-Rom(比线性插值的高频保真好得多) */
  sampleAt(ch, pos) {
    const size = this.size
    const b = this.buf[ch]
    const i0 = Math.floor(pos)
    const f = pos - i0
    const at = (x) => b[((x % size) + size) % size]
    const sm = at(i0 - 1)
    const s0 = at(i0)
    const s1 = at(i0 + 1)
    const s2 = at(i0 + 2)
    const c1 = 0.5 * (s1 - sm)
    const c2 = sm - 2.5 * s0 + 2 * s1 - 0.5 * s2
    const c3 = 0.5 * (s2 - sm) + 1.5 * (s0 - s1)
    return ((c3 * f + c2) * f + c1) * f + s0
  }

  process(inputs, outputs) {
    const inp = inputs[0]
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const n = out[0].length
    const hasIn = inp && inp.length > 0
    const L = this.sweep
    // 延迟每样本应变化 (1-ratio) 个样本;u 是归一化相位(0..1),除以窗长换算。
    // 升调(r>1)延迟变短 → u 递减;回卷点由窗口归零掩盖。
    const du = (1 - this.ratio) / L
    for (let i = 0; i < n; i++) {
      // 每样本都写入缓冲(旁路时也写),保证切回移调时读到的是最近的历史
      for (let ch = 0; ch < 2; ch++) {
        const src = hasIn ? inp[Math.min(ch, inp.length - 1)] : null
        this.buf[ch][this.w] = src ? src[i] : 0
      }
      if (this.bypass) {
        // 直通:单声道输入复制到双声道,与移调路径的声道行为一致
        const mono = hasIn ? inp[0][i] : 0
        out[0][i] = mono
        out[1][i] = hasIn && inp.length > 1 ? inp[1][i] : mono
      } else {
        let acc0 = 0
        let acc1 = 0
        for (let k = 0; k < 2; k++) {
          // 相位累加推进(ratio 变化时位置连续,只变速度,不产生爆音)
          this.u[k] += du
          if (this.u[k] >= 1) this.u[k] -= 1
          else if (this.u[k] < 0) this.u[k] += 1
          const g = Math.sin(Math.PI * this.u[k]) // 窗:回卷点(u≈0/1)处为 0
          const readPos = this.w - (this.dMin + this.u[k] * L)
          acc0 += g * this.sampleAt(0, readPos)
          acc1 += g * this.sampleAt(1, readPos)
        }
        out[0][i] = acc0
        out[1][i] = acc1
      }
      this.w = (this.w + 1) % this.size
    }
    return true
  }
}
registerProcessor('bm-pitch', BmPitchProcessor)
