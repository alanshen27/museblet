// Standalone Web Audio synth used when the app runs outside Max.
// Each pen has its own timbre (waveform, detune, filter, envelope).

import { getPen } from './pens'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverb: ConvolverNode | null = null
let delaySend: GainNode | null = null

function impulseResponse(ac: AudioContext, seconds: number, decay: number) {
  const rate = ac.sampleRate
  const length = rate * seconds
  const impulse = ac.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return impulse
}

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.36
    // gentle bus compression + top-end shelf: lets simultaneous notes
    // stack without clipping, and takes the piercing edge off
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 4
    comp.attack.value = 0.01
    comp.release.value = 0.3
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 2800
    shelf.gain.value = -13
    master.connect(shelf)
    shelf.connect(comp)
    comp.connect(ctx.destination)

    reverb = ctx.createConvolver()
    reverb.buffer = impulseResponse(ctx, 3.5, 4)
    const wet = ctx.createGain()
    wet.gain.value = 0.4
    reverb.connect(wet)
    wet.connect(master)

    // dotted-feel echo for space and movement
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.31
    const feedback = ctx.createGain()
    feedback.gain.value = 0.32
    const dampen = ctx.createBiquadFilter()
    dampen.type = 'lowpass'
    dampen.frequency.value = 2200
    const delayWet = ctx.createGain()
    delayWet.gain.value = 0.22
    delaySend = ctx.createGain()
    delaySend.gain.value = 1
    delaySend.connect(delay)
    delay.connect(dampen)
    dampen.connect(feedback)
    feedback.connect(delay)
    dampen.connect(delayWet)
    delayWet.connect(master)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// continuous gesture voice (theremin/Bloom model): while the hand moves,
// one sustained voice glides between pitches instead of retriggering notes,
// so the line never fragments. One voice per pointer id.
interface GlideVoice {
  osc: OscillatorNode
  osc2: OscillatorNode
  lfo: OscillatorNode
  gain: GainNode
  filter: BiquadFilterNode
  wet: GainNode
  penId: string
}
const glides = new Map<number, GlideVoice>()

export function glideTo(
  pointerId: number,
  penId: string,
  midi: number,
  level: number,
  // depth controls: hand distance from the camera shapes the timbre
  cutoff?: number,
  reverbMix?: number,
) {
  const ac = getContext()
  const pen = getPen(penId)
  let v = glides.get(pointerId)
  if (v && v.penId !== penId) {
    glideStop(pointerId)
    v = undefined
  }
  const now = ac.currentTime
  if (!v) {
    const gain = ac.createGain()
    gain.gain.value = 0
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.8
    filter.frequency.value = Math.min(3200, pen.filterBase + pen.filterEnv * 0.5)
    filter.connect(gain)
    gain.connect(master!)
    const wet = ac.createGain()
    wet.gain.value = 1
    gain.connect(wet)
    wet.connect(reverb!)
    gain.connect(delaySend!)
    const mk = (cents: number) => {
      const osc = ac.createOscillator()
      osc.type = pen.wave
      osc.frequency.value = midiToFreq(midi + pen.octaveShift * 12)
      osc.detune.value = cents
      osc.connect(filter)
      osc.start(now)
      return osc
    }
    const osc = mk(pen.detune)
    const osc2 = mk(-pen.detune)
    // gentle vibrato: a voice that breathes reads as sung, not synthetic
    const lfo = ac.createOscillator()
    lfo.frequency.value = 4.6
    const lfoGain = ac.createGain()
    lfoGain.gain.value = 5.5 // cents
    lfo.connect(lfoGain)
    lfoGain.connect(osc.detune)
    lfoGain.connect(osc2.detune)
    lfo.start(now)
    v = { osc, osc2, lfo, gain, filter, wet, penId }
    glides.set(pointerId, v)
  }
  const freq = midiToFreq(midi + pen.octaveShift * 12)
  // portamento: ease toward the new pitch rather than stepping
  v.osc.frequency.setTargetAtTime(freq, ac.currentTime, 0.08)
  v.osc2.frequency.setTargetAtTime(freq, ac.currentTime, 0.08)
  v.gain.gain.setTargetAtTime(level, ac.currentTime, 0.09)
  if (cutoff !== undefined) {
    v.filter.frequency.setTargetAtTime(
      Math.max(120, Math.min(6000, cutoff)),
      ac.currentTime,
      0.12,
    )
  }
  if (reverbMix !== undefined) {
    v.wet.gain.setTargetAtTime(
      Math.max(0, Math.min(1.5, reverbMix)),
      ac.currentTime,
      0.15,
    )
  }
}

export function glideStop(pointerId: number) {
  const v = glides.get(pointerId)
  if (!v || !ctx) return
  glides.delete(pointerId)
  const now = ctx.currentTime
  v.gain.gain.setTargetAtTime(0, now, 0.5)
  v.osc.stop(now + 3)
  v.osc2.stop(now + 3)
  v.lfo.stop(now + 3)
}

// bell tree / mark tree: a cascade of tiny bells rippling through the
// given pitches top-down, each a soft sine ping with inharmonic partials
// ringing out into the reverb — the plane material's shimmer
export function playBellTree(midis: number[], velocity: number) {
  const ac = getContext()
  const vel = Math.min(1, velocity / 127)
  midis.forEach((midi, i) => {
    const t = ac.currentTime + i * 0.085 + Math.random() * 0.02
    const freq = midiToFreq(midi)
    for (const [ratio, amt] of [
      [1, 1],
      [2.76, 0.2],
      [5.4, 0.07],
    ] as const) {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * ratio
      const gain = ac.createGain()
      const peak = (0.02 + vel * 0.06) * amt * (1 - i * 0.06)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(peak, t + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 1.6)
      osc.connect(gain)
      gain.connect(master!)
      gain.connect(reverb!)
      osc.start(t)
      osc.stop(t + 1.8)
    }
  })
}

// the summoning ritual: a rising swell that grows as the hand holds the
// activation circle, blooming into a bell cascade when it completes
let summon: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null =
  null

export function setSummon(progress: number) {
  const ac = getContext()
  const p = Math.max(0, Math.min(1, progress))
  if (p <= 0.01) {
    stopSummon()
    return
  }
  if (!summon) {
    const gain = ac.createGain()
    gain.gain.value = 0
    gain.connect(master!)
    gain.connect(reverb!)
    const mk = () => {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 82
      osc.connect(gain)
      osc.start()
      return osc
    }
    const osc = mk()
    const osc2 = mk()
    summon = { osc, osc2, gain }
  }
  const now = ac.currentTime
  // pitch and level climb together: a gathering of energy
  summon.osc.frequency.setTargetAtTime(82 * Math.pow(2, p * 1.5), now, 0.1)
  summon.osc2.frequency.setTargetAtTime(
    82 * 1.5 * Math.pow(2, p * 1.5),
    now,
    0.1,
  )
  summon.gain.gain.setTargetAtTime(0.02 + p * 0.09, now, 0.12)
}

export function stopSummon() {
  if (!summon || !ctx) return
  const s = summon
  summon = null
  const now = ctx.currentTime
  s.gain.gain.setTargetAtTime(0, now, 0.3)
  s.osc.stop(now + 2)
  s.osc2.stop(now + 2)
}

export function summonComplete() {
  stopSummon()
  // the awakening: a bell cascade sweeping down
  playBellTree([83, 79, 76, 71, 67, 64, 59], 70)
}

// firework detonation: a sub thump + filtered noise whoosh + bell shimmer
export function playExplosion(intensity = 1) {
  const ac = getContext()
  const now = ac.currentTime

  // sub boom
  const boom = ac.createOscillator()
  boom.type = 'sine'
  boom.frequency.setValueAtTime(120, now)
  boom.frequency.exponentialRampToValueAtTime(38, now + 0.5)
  const boomGain = ac.createGain()
  boomGain.gain.setValueAtTime(0.5 * intensity, now)
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  boom.connect(boomGain)
  boomGain.connect(master!)
  boom.start(now)
  boom.stop(now + 1)

  // noise whoosh through a falling lowpass
  const len = Math.floor(ac.sampleRate * 1.2)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  }
  const noise = ac.createBufferSource()
  noise.buffer = buf
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(4000, now)
  lp.frequency.exponentialRampToValueAtTime(200, now + 1)
  const noiseGain = ac.createGain()
  noiseGain.gain.setValueAtTime(0.35 * intensity, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1)
  noise.connect(lp)
  lp.connect(noiseGain)
  noiseGain.connect(master!)
  noiseGain.connect(reverb!)
  noise.start(now)

  // glittering shimmer: a scatter of tiny high pings raining after the burst
  for (let i = 0; i < 6; i++) {
    const t = now + 0.05 + Math.random() * 0.5
    const ping = ac.createOscillator()
    ping.type = 'sine'
    ping.frequency.value = 1400 + Math.random() * 2400
    const pGain = ac.createGain()
    pGain.gain.setValueAtTime(0.06 * intensity, t)
    pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    ping.connect(pGain)
    pGain.connect(reverb!)
    ping.start(t)
    ping.stop(t + 0.7)
  }
}

export function playNote(
  penId: string,
  midi: number,
  velocity: number,
  durationMs: number,
) {
  const pen = getPen(penId)
  const ac = getContext()
  const now = ac.currentTime
  const dur = Math.max(0.05, durationMs / 1000)
  // slight humanization keeps repeated notes from sounding mechanical
  const freq =
    midiToFreq(midi + pen.octaveShift * 12) * (1 + (Math.random() - 0.5) * 0.004)
  const vel = velocity / 127

  // long notes are pad material: bloom in slowly instead of striking,
  // which keeps the harmonic bed from sounding like piano hits
  const isPad = dur > 1.2
  const attack = isPad ? Math.max(pen.attack, dur * 0.45) : Math.max(pen.attack, 0.03)
  // melodic notes get a long tail too, so consecutive notes blend
  // into a continuous line instead of separated hits
  const release = isPad ? Math.max(pen.release, 2.2) : Math.max(pen.release, 1.4)

  const gain = ac.createGain()
  const peak = (isPad ? 0.04 : 0.06) + vel * (isPad ? 0.14 : 0.17)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + attack)
  gain.gain.setValueAtTime(peak, now + Math.max(attack, dur))
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    now + Math.max(attack, dur) + release,
  )

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.9
  // cap the brightness — unbounded filter sweeps read as piercing
  filter.frequency.setValueAtTime(
    Math.min(2800, pen.filterBase + vel * pen.filterEnv),
    now,
  )
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(100, pen.filterBase),
    now + dur + release,
  )

  filter.connect(gain)
  gain.connect(master!)
  gain.connect(reverb!)
  gain.connect(delaySend!)

  const stopAt = now + dur + release + 0.1
  for (const cents of [pen.detune, -pen.detune]) {
    const osc = ac.createOscillator()
    osc.type = pen.wave
    osc.frequency.value = freq
    osc.detune.value = cents
    osc.connect(filter)
    osc.start(now)
    osc.stop(stopAt)
  }

  // tinkly bell shimmer: inharmonic upper partials that ring past the body
  if (pen.id === 'ember') {
    for (const [ratio, amt] of [
      [2.76, 0.25],
      [5.4, 0.12],
    ] as const) {
      const partial = ac.createOscillator()
      partial.type = 'sine'
      partial.frequency.value = freq * ratio
      const pGain = ac.createGain()
      pGain.gain.setValueAtTime(peak * amt, now)
      pGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.4)
      partial.connect(pGain)
      pGain.connect(master!)
      pGain.connect(reverb!)
      partial.start(now)
      partial.stop(stopAt + 0.5)
    }
  }

  if (pen.id === 'crystal') {
    const partial = ac.createOscillator()
    partial.type = 'sine'
    partial.frequency.value = freq * 3.01
    const pGain = ac.createGain()
    pGain.gain.setValueAtTime(peak * 0.2, now)
    pGain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    partial.connect(pGain)
    pGain.connect(master!)
    pGain.connect(reverb!)
    partial.start(now)
    partial.stop(stopAt)
  }
}
