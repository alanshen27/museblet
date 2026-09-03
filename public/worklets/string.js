// Plucked-string waveguide (Karplus-Strong / extended), the browser twin of
// max/nocturne.voice.maxpat. One node = one string.
//
//   excitation (shaped noise burst, pluck-position comb) → delay line
//   ← one-pole loop lowpass ← feedback loss  … fractional read for tuning
//
// `freq` is a k-rate AudioParam so slides (走手音) are plain automation on
// the delay length: the ringing string is retuned rather than re-plucked.
// A slide also rubs the finger along the silk: friction noise proportional
// to the glide speed enters the loop (yin/rou 吟猱), so a glide decays into
// friction and then into silence rather than into a clean sustain.
// `mute` is the guard hand damping the strings (按). A `pluck` with
// `harmonic` set plays 泛音: the excitation is combed at the touched node
// (x[n] + x[n − P/node]), removing the partials that have a node there.

const MIN_FREQ = 24

class StringProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 220, minValue: MIN_FREQ, maxValue: 6000, automationRate: 'k-rate' },
      // per-sample loop gain; the effective T60 scales with period
      { name: 'damp', defaultValue: 0.996, minValue: 0.5, maxValue: 0.99999, automationRate: 'k-rate' },
      // 0 = dull (heavy loop lowpass), 1 = bright
      { name: 'bright', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mute', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.size = Math.ceil(sampleRate / MIN_FREQ) + 4
    this.buf = new Float32Array(this.size)
    this.w = 0
    this.lp = 0
    this.dc = 0
    this.dcIn = 0
    this.excite = null
    this.exciteIdx = 0
    this.lastFreq = 0
    this.friction = 0
    this.port.onmessage = (e) => {
      const m = e.data
      if (m && m.type === 'pluck') this.pluck(m)
    }
  }

  pluck({ force = 0.7, pos = 0.28, color = 0.6, freq = 220, harmonic = false, node = 2 }) {
    // burst length = one period: the string is displaced then let go
    const period = Math.max(2, Math.round(sampleRate / Math.max(MIN_FREQ, freq)))
    const n = period
    const out = new Float32Array(n)
    // pluck position comb: displacing the string at fraction `pos`
    // notches the harmonics whose nodes sit there
    const combDelay = Math.max(1, Math.round(period * Math.min(0.48, Math.max(0.05, pos))))
    // 泛音: the light touch at the node keeps only the partials that are
    // multiples of `node` — a ripple FIR comb on the excitation
    const nodeDelay = harmonic ? Math.max(1, Math.round(period / Math.max(2, node))) : 0
    const raw = new Float32Array(n + combDelay + nodeDelay)
    let lp = 0
    const a = 0.15 + color * 0.8
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1
      lp += (white - lp) * a
      raw[i] = lp
    }
    // fade the burst so the attack is a nail, not a click
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 6) * (1 - i / n)
      let x = raw[i] - raw[i + combDelay] * 0.9
      if (nodeDelay) x = 0.5 * (x + (raw[i + nodeDelay] - raw[i + nodeDelay + combDelay] * 0.9))
      out[i] = x * env * force * (harmonic ? 1.1 : 1.6)
    }
    this.excite = out
    this.exciteIdx = 0
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0]
    if (!out) return true
    const freq = Math.max(MIN_FREQ, params.freq[0])
    const damp = params.damp[0]
    const bright = params.bright[0]
    const mute = params.mute[0]
    // fractional delay length; the one-pole in the loop adds ~half a
    // sample of group delay at low frequencies, compensate
    const D = sampleRate / freq - 0.5 - (1 - bright) * 0.5
    const lpCoef = 0.25 + bright * 0.7
    // guard hand on the strings: heavy extra loss and a duller loop
    const loss = damp * (1 - mute * 0.08)
    // friction: how fast the finger is sliding, in octaves per second,
    // smoothed; it feeds a hiss into the loop and costs the string energy
    if (this.lastFreq > 0) {
      const glide = Math.abs(Math.log2(freq / this.lastFreq)) * (sampleRate / out.length)
      this.friction += (Math.min(1, glide * 0.35) - this.friction) * 0.15
    }
    this.lastFreq = freq
    const fr = this.friction
    const buf = this.buf
    const size = this.size
    for (let i = 0; i < out.length; i++) {
      // read D samples behind the write head, linear interpolation
      let rp = this.w - D
      if (rp < 0) rp += size
      const i0 = rp | 0
      const frac = rp - i0
      const i1 = i0 + 1 >= size ? 0 : i0 + 1
      const y = buf[i0] + (buf[i1] - buf[i0]) * frac
      // loop lowpass (string stiffness / air loss)
      this.lp += (y - this.lp) * lpCoef
      let s = this.lp * loss * (1 - fr * 0.012)
      if (fr > 0.001) s += (Math.random() * 2 - 1) * fr * 0.02 * (0.3 + Math.abs(this.lp) * 6)
      if (this.excite) {
        s += this.excite[this.exciteIdx++]
        if (this.exciteIdx >= this.excite.length) this.excite = null
      }
      buf[this.w] = s
      this.w = this.w + 1 >= size ? 0 : this.w + 1
      // dc blocker
      const dcOut = s - this.dcIn + 0.995 * this.dc
      this.dcIn = s
      this.dc = dcOut
      out[i] = dcOut
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out)
    return true
  }
}

registerProcessor('nocturne-string', StringProcessor)
