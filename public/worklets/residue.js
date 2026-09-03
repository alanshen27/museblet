// Impact residue: a granular scrub of the last moments of the mix.
// The processor records its input into a ring buffer; a `burst` message
// scatters short windowed grains read from the recent past — mostly
// pitched down, staggered in time, decaying — so a strike leaves debris
// hanging in the air rather than a clean cut. (buffer~ / groove~ scrubbing
// in Max terms; here the buffer is always the live signal.)

const SECONDS = 3

class ResidueProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.size = Math.ceil(sampleRate * SECONDS)
    this.ring = new Float32Array(this.size)
    this.w = 0
    this.grains = []
    this.port.onmessage = (e) => {
      const m = e.data
      if (m && m.type === 'burst') this.burst(m)
    }
  }

  burst({ count = 12, force = 1, spread = 0.35, down = 0.7 }) {
    const now = 0
    for (let i = 0; i < count; i++) {
      // read head starts somewhere in the last `spread` seconds
      const back = Math.random() * spread * sampleRate + 256
      const len = Math.floor((0.03 + Math.random() * 0.11) * sampleRate)
      // playback rate: mostly below unity (falling debris), a few above
      const rate =
        Math.random() < down
          ? 0.45 + Math.random() * 0.5
          : 1 + Math.random() * 0.6
      this.grains.push({
        start: now + Math.floor(Math.random() * 0.45 * sampleRate),
        pos: this.w - back,
        rate,
        len,
        i: 0,
        amp: (0.35 + Math.random() * 0.5) * force * (1 - i / (count * 1.5)),
        pan: Math.random() * 2 - 1,
      })
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0]
    const outL = outputs[0][0]
    const outR = outputs[0][1] || outL
    const n = outL.length
    const size = this.size
    const ring = this.ring
    // record (mono sum)
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let c = 0; c < inp.length; c++) s += inp[c][i]
      ring[this.w] = inp.length ? s / inp.length : 0
      this.w = this.w + 1 >= size ? 0 : this.w + 1
    }
    outL.fill(0)
    if (outR !== outL) outR.fill(0)
    if (this.grains.length === 0) return true
    const alive = []
    for (const gr of this.grains) {
      if (gr.start >= n) {
        gr.start -= n
        alive.push(gr)
        continue
      }
      const gl = 0.5 * (1 - gr.pan)
      const grr = 0.5 * (1 + gr.pan)
      for (let i = gr.start; i < n && gr.i < gr.len; i++) {
        // Hann window
        const ph = gr.i / gr.len
        const win = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2)
        let rp = gr.pos + gr.i * gr.rate
        rp = ((rp % size) + size) % size
        const i0 = rp | 0
        const frac = rp - i0
        const i1 = i0 + 1 >= size ? 0 : i0 + 1
        const s = (ring[i0] + (ring[i1] - ring[i0]) * frac) * win * gr.amp
        outL[i] += s * gl
        if (outR !== outL) outR[i] += s * grr
        gr.i++
      }
      gr.start = 0
      if (gr.i < gr.len) alive.push(gr)
    }
    this.grains = alive
    return true
  }
}

registerProcessor('nocturne-residue', ResidueProcessor)
