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
    master.gain.value = 0.45
    master.connect(ctx.destination)

    reverb = ctx.createConvolver()
    reverb.buffer = impulseResponse(ctx, 2.5, 3)
    const wet = ctx.createGain()
    wet.gain.value = 0.35
    reverb.connect(wet)
    wet.connect(ctx.destination)

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
    delayWet.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
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

  const gain = ac.createGain()
  const peak = 0.1 + vel * 0.3
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + pen.attack)
  gain.gain.setValueAtTime(peak, now + Math.max(pen.attack, dur))
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    now + Math.max(pen.attack, dur) + pen.release,
  )

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 3
  filter.frequency.setValueAtTime(pen.filterBase + vel * pen.filterEnv, now)
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(100, pen.filterBase),
    now + dur + pen.release,
  )

  filter.connect(gain)
  gain.connect(master!)
  gain.connect(reverb!)
  gain.connect(delaySend!)

  const stopAt = now + dur + pen.release + 0.1
  for (const cents of [pen.detune, -pen.detune]) {
    const osc = ac.createOscillator()
    osc.type = pen.wave
    osc.frequency.value = freq
    osc.detune.value = cents
    osc.connect(filter)
    osc.start(now)
    osc.stop(stopAt)
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
