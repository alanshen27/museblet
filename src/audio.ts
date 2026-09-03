// Standalone Web Audio engine, used when the app runs outside Max. It
// mirrors the Max patch: plucked-string waveguides (qin / pipa) in an
// AudioWorklet, a dizi breath tone, a luogu percussion set (ban clapper,
// gu drum, small and large gong resonator banks with the gong's post-strike
// pitch bend), and a delay-line FX family — ping-pong echo, chorus width,
// a convolution hall whose impulse is tuned to the current mode (the room
// itself is in key: spectral imprint by convolution), and a granular
// "impact residue" that scrubs the last moments of the mix after a strike.

import { getInstrument, type InstrumentId } from './instruments'
import { DEFAULT_SCALE, SCALES } from './music'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let guardLP: BiquadFilterNode | null = null
let hall: ConvolverNode | null = null
let hallSend: GainNode | null = null
let hallWet: GainNode | null = null
let echoSend: GainNode | null = null
let echoFeedL: GainNode | null = null
let echoFeedR: GainNode | null = null
let echoPanL: StereoPannerNode | null = null
let echoPanR: StereoPannerNode | null = null
let air: GainNode | null = null
let airDry: GainNode | null = null
let widthDepth: GainNode | null = null
let residue: AudioWorkletNode | null = null
let residueGain: GainNode | null = null
let workletsReady = false
let workletLoad: Promise<void> | null = null
let scaleName = DEFAULT_SCALE

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

// ---------------------------------------------------------------- graph --

function noiseBuffer(ac: AudioContext, seconds: number, shape = 1): AudioBuffer {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds))
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, shape)
  return buf
}

// the hall's impulse: a decaying noise tail with the mode's own pitches
// ringing inside it, so every sound that enters the room is coloured by
// the scale — convolution as spectral cross-synthesis with the tuning
function tunedImpulse(ac: AudioContext, scale: number[]): AudioBuffer {
  const seconds = 3.2
  const rate = ac.sampleRate
  const len = Math.floor(rate * seconds)
  const ir = ac.createBuffer(2, len, rate)
  const pitches: number[] = []
  for (let o = 0; o < 2; o++) for (const s of scale) pitches.push(midiToFreq(48 + o * 12 + s))
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    // early reflections: a handful of sparse taps in the first 40 ms
    for (let k = 0; k < 7; k++) {
      const at = Math.floor(rate * (0.004 + Math.random() * 0.036))
      d[at] += (Math.random() * 0.5 + 0.3) * (Math.random() < 0.5 ? -1 : 1)
    }
    for (let i = 0; i < len; i++) {
      const t = i / rate
      d[i] += (Math.random() * 2 - 1) * Math.exp(-t * 2.6) * 0.42
    }
    for (const f of pitches) {
      const ph = Math.random() * Math.PI * 2
      const decay = 2.2 + Math.random() * 1.2
      const amp = 0.05 + Math.random() * 0.03
      const w = 2 * Math.PI * f
      for (let i = 0; i < len; i++) {
        const t = i / rate
        d[i] += Math.sin(w * t + ph) * Math.exp(-t * decay) * amp
      }
    }
    let peak = 0
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]))
    const norm = peak > 0 ? 0.55 / peak : 1
    for (let i = 0; i < len; i++) d[i] *= norm
  }
  return ir
}

function getContext(): AudioContext {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }
  const ac = new AudioContext()
  ctx = ac

  master = ac.createGain()
  master.gain.value = 0.7
  // the guard hand closes the room down: a master lowpass that only bites
  // when both hands come up
  guardLP = ac.createBiquadFilter()
  guardLP.type = 'lowpass'
  guardLP.frequency.value = 18000
  guardLP.Q.value = 0.5
  const shelf = ac.createBiquadFilter()
  shelf.type = 'highshelf'
  shelf.frequency.value = 6500
  shelf.gain.value = -4
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 18
  comp.ratio.value = 3.5
  comp.attack.value = 0.004
  comp.release.value = 0.25
  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.08
  master.connect(guardLP)
  guardLP.connect(shelf)
  shelf.connect(comp)
  comp.connect(limiter)
  limiter.connect(ac.destination)

  // air bus: everything spacious (hall, echo, breath) passes through a
  // chorus-width stage — two short delays modulated in opposite phase,
  // the stance width setting the modulation depth (a wide stance opens the
  // stereo image; feet together and the room narrows to a point)
  air = ac.createGain()
  airDry = ac.createGain()
  airDry.gain.value = 0.7
  air.connect(airDry)
  airDry.connect(master)
  const dL = ac.createDelay(0.05)
  const dR = ac.createDelay(0.05)
  dL.delayTime.value = 0.011
  dR.delayTime.value = 0.014
  const lfo = ac.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.23
  widthDepth = ac.createGain()
  widthDepth.gain.value = 0.0005
  const inv = ac.createGain()
  inv.gain.value = -1
  lfo.connect(widthDepth)
  widthDepth.connect(dL.delayTime)
  widthDepth.connect(inv)
  inv.connect(dR.delayTime)
  lfo.start()
  const merge = ac.createChannelMerger(2)
  air.connect(dL)
  air.connect(dR)
  dL.connect(merge, 0, 0)
  dR.connect(merge, 0, 1)
  const wideGain = ac.createGain()
  wideGain.gain.value = 0.55
  merge.connect(wideGain)
  wideGain.connect(master)

  // tuned convolution hall
  hall = ac.createConvolver()
  hall.buffer = tunedImpulse(ac, SCALES[scaleName] ?? SCALES[DEFAULT_SCALE])
  hallSend = ac.createGain()
  hallSend.gain.value = 1
  hallWet = ac.createGain()
  hallWet.gain.value = 0.42
  hallSend.connect(hall)
  hall.connect(hallWet)
  hallWet.connect(air)

  // ping-pong echo: two unequal delay lines cross-feeding through a
  // damping lowpass, returns spread left/right
  echoSend = ac.createGain()
  const eL = ac.createDelay(2)
  const eR = ac.createDelay(2)
  eL.delayTime.value = 0.41
  eR.delayTime.value = 0.63
  const dampL = ac.createBiquadFilter()
  const dampR = ac.createBiquadFilter()
  dampL.type = dampR.type = 'lowpass'
  dampL.frequency.value = dampR.frequency.value = 2600
  echoFeedL = ac.createGain()
  echoFeedR = ac.createGain()
  echoFeedL.gain.value = echoFeedR.gain.value = 0.38
  echoSend.connect(eL)
  eL.connect(dampL)
  dampL.connect(echoFeedL)
  echoFeedL.connect(eR)
  eR.connect(dampR)
  dampR.connect(echoFeedR)
  echoFeedR.connect(eL)
  echoPanL = ac.createStereoPanner()
  echoPanR = ac.createStereoPanner()
  echoPanL.pan.value = -0.5
  echoPanR.pan.value = 0.5
  const echoWet = ac.createGain()
  echoWet.gain.value = 0.3
  dampL.connect(echoPanL)
  dampR.connect(echoPanR)
  echoPanL.connect(echoWet)
  echoPanR.connect(echoWet)
  echoWet.connect(air)

  residueGain = ac.createGain()
  residueGain.gain.value = 0.8
  residueGain.connect(master)
  residueGain.connect(hallSend)

  workletLoad = (async () => {
    try {
      const base = document.baseURI
      await Promise.all([
        ac.audioWorklet.addModule(new URL('worklets/string.js', base).href),
        ac.audioWorklet.addModule(new URL('worklets/residue.js', base).href),
      ])
      residue = new AudioWorkletNode(ac, 'nocturne-residue', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      master!.connect(residue)
      residue.connect(residueGain!)
      workletsReady = true
    } catch (err) {
      console.warn('audio worklets unavailable, using oscillator strings:', err)
    }
  })()
  return ac
}

/** create the context early (on the first user gesture) so the worklets are warm */
export function ensureAudio(): Promise<void> {
  getContext()
  return workletLoad ?? Promise.resolve()
}

export function setScaleName(name: string) {
  if (!SCALES[name]) return
  scaleName = name
  if (ctx && hall) hall.buffer = tunedImpulse(ctx, SCALES[name])
}

// ---------------------------------------------------- continuous control --

export interface BodyControls {
  /** stance width 0..1 → stereo width */
  width?: number
  /** rootedness / crouch 0..1 → hall depth, darker body */
  root?: number
  /** guard 0..1 → lowpass + string damping */
  guard?: number
  /** stillness 0..1 → dizi breath swell, longer echo tails */
  breath?: number
  /** motion energy 0..1 → vibrato, tremolo density, shorter echo */
  energy?: number
  /** weight shift -1..1 → pan of the breath */
  lean?: number
}

const body: Required<BodyControls> = {
  width: 0.4,
  root: 0.3,
  guard: 0,
  breath: 0,
  energy: 0,
  lean: 0,
}

export function setBody(c: BodyControls) {
  Object.assign(body, c)
  if (!ctx) return
  const now = ctx.currentTime
  widthDepth?.gain.setTargetAtTime(0.0003 + body.width * 0.0032, now, 0.3)
  hallWet?.gain.setTargetAtTime(0.28 + body.root * 0.5, now, 0.4)
  guardLP?.frequency.setTargetAtTime(
    18000 * Math.pow(0.04, body.guard),
    now,
    0.08,
  )
  // 留白: a still body leaves long tails; a busy one dries the room
  const fb = 0.22 + body.breath * 0.42 - body.energy * 0.14
  echoFeedL?.gain.setTargetAtTime(clamp(fb, 0.1, 0.7), now, 0.4)
  echoFeedR?.gain.setTargetAtTime(clamp(fb, 0.1, 0.7), now, 0.4)
  echoPanL?.pan.setTargetAtTime(-0.2 - body.width * 0.8, now, 0.4)
  echoPanR?.pan.setTargetAtTime(0.2 + body.width * 0.8, now, 0.4)
  for (const v of voices) if (v.node) setStringMute(v, body.guard)
  updateBreath()
}

// ------------------------------------------------------------- strings --

interface StringVoice {
  node: AudioWorkletNode | null
  // oscillator fallback when worklets are unavailable
  osc: OscillatorNode | null
  oscGain: GainNode | null
  body: BiquadFilterNode
  body2: BiquadFilterNode
  out: GainNode
  pan: StereoPannerNode
  instr: InstrumentId
  lastUse: number
  midi: number
  slot: number | null
}

const voices: StringVoice[] = []
const MAX_STRINGS = 10

function setStringMute(v: StringVoice, m: number) {
  if (!ctx) return
  v.node?.parameters.get('mute')?.setTargetAtTime(m, ctx.currentTime, 0.05)
}

function stringParams(instr: InstrumentId, harmonic: boolean) {
  if (instr === 'pipa') return { damp: harmonic ? 0.9975 : 0.9982, bright: 0.85, pos: 0.13, color: 0.9 }
  // qin: silk strings, slow decay, dull and dark
  return { damp: harmonic ? 0.9985 : 0.99935, bright: 0.42, pos: 0.3, color: 0.5 }
}

function allocString(instr: InstrumentId, slot: number | null): StringVoice {
  const ac = getContext()
  // reuse a held slot voice, else the oldest idle one
  if (slot !== null) {
    const held = voices.find((v) => v.slot === slot)
    if (held) {
      if (held.instr !== instr) {
        held.instr = instr
        retuneBody(held)
      }
      return held
    }
  }
  let v: StringVoice | undefined
  if (voices.length < MAX_STRINGS) {
    const body1 = ac.createBiquadFilter()
    body1.type = 'peaking'
    const body2 = ac.createBiquadFilter()
    body2.type = 'peaking'
    const out = ac.createGain()
    out.gain.value = 0.55
    const pan = ac.createStereoPanner()
    body1.connect(body2)
    body2.connect(out)
    out.connect(pan)
    pan.connect(master!)
    pan.connect(hallSend!)
    const es = ac.createGain()
    es.gain.value = 0.35
    pan.connect(es)
    es.connect(echoSend!)
    v = {
      node: null,
      osc: null,
      oscGain: null,
      body: body1,
      body2,
      out,
      pan,
      instr,
      lastUse: 0,
      midi: 60,
      slot: null,
    }
    if (workletsReady) {
      v.node = new AudioWorkletNode(ac, 'nocturne-string', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      v.node.connect(body1)
    } else {
      v.osc = ac.createOscillator()
      v.osc.type = 'triangle'
      v.oscGain = ac.createGain()
      v.oscGain.gain.value = 0
      v.osc.connect(v.oscGain)
      v.oscGain.connect(body1)
      v.osc.start()
    }
    voices.push(v)
  } else {
    v = voices
      .filter((x) => x.slot === null)
      .sort((a, b) => a.lastUse - b.lastUse)[0] ?? voices[0]
  }
  v.instr = instr
  v.slot = slot
  retuneBody(v)
  return v
}

function retuneBody(v: StringVoice) {
  const now = ctx!.currentTime
  if (v.instr === 'pipa') {
    v.body.frequency.setTargetAtTime(420, now, 0.05)
    v.body.gain.setTargetAtTime(4, now, 0.05)
    v.body.Q.value = 1.2
    v.body2.frequency.setTargetAtTime(2900, now, 0.05)
    v.body2.gain.setTargetAtTime(3, now, 0.05)
    v.body2.Q.value = 1.5
  } else {
    // the qin's long wooden box: a low wolf tone and a mid hollow
    v.body.frequency.setTargetAtTime(165 - body.root * 40, now, 0.05)
    v.body.gain.setTargetAtTime(7, now, 0.05)
    v.body.Q.value = 2.2
    v.body2.frequency.setTargetAtTime(1100, now, 0.05)
    v.body2.gain.setTargetAtTime(2.5, now, 0.05)
    v.body2.Q.value = 1
  }
}

function pluckVoice(
  v: StringVoice,
  midi: number,
  force: number,
  x: number,
  when: number,
  harmonic: boolean,
) {
  const ac = ctx!
  const f = midiToFreq(midi)
  const p = stringParams(v.instr, harmonic)
  v.midi = midi
  v.lastUse = when
  v.pan.pan.setTargetAtTime((x - 0.5) * 1.2, when, 0.02)
  if (v.node) {
    const P = v.node.parameters
    P.get('freq')!.setValueAtTime(f, when)
    P.get('damp')!.setValueAtTime(p.damp, when)
    P.get('bright')!.setValueAtTime(clamp(p.bright * (0.7 + force * 0.5), 0, 1), when)
    const send = () =>
      v.node!.port.postMessage({
        type: 'pluck',
        force: 0.25 + force * 0.75,
        pos: p.pos + (1 - force) * 0.1,
        color: p.color,
        freq: f,
        harmonic,
      })
    const delayMs = (when - ac.currentTime) * 1000
    if (delayMs > 2) setTimeout(send, delayMs)
    else send()
  } else if (v.osc && v.oscGain) {
    v.osc.frequency.setValueAtTime(f, when)
    const g = v.oscGain.gain
    g.cancelScheduledValues(when)
    g.setValueAtTime(0.0001, when)
    g.exponentialRampToValueAtTime(0.25 + force * 0.5, when + 0.006)
    g.exponentialRampToValueAtTime(0.0005, when + (v.instr === 'pipa' ? 0.9 : 3.5))
  }
}

/** a single pluck (qin / pipa) — used by the loop transport and strikes */
export function pluck(
  instr: 'qin' | 'pipa',
  midi: number,
  force: number,
  x = 0.5,
  at = 0,
  harmonic = false,
) {
  const ac = getContext()
  const v = allocString(instr, null)
  pluckVoice(v, midi, clamp(force, 0, 1), x, ac.currentTime + at, harmonic)
}

/**
 * Brushwork: a slow-moving hand holds one string per slot and slides it
 * (走手音). Small pitch changes retune the ringing string; a jump of a 4th
 * or more re-plucks (绰/注 ornaments land as new attacks).
 */
export function brushTo(
  slot: number,
  instr: 'qin' | 'pipa',
  midi: number,
  level: number,
  x: number,
  speed: number,
) {
  const ac = getContext()
  const now = ac.currentTime
  const v = allocString(instr, slot)
  const fresh = v.lastUse === 0 || now - v.lastUse > 4
  const jump = Math.abs(midi - v.midi)
  if (fresh || jump >= 5 || (jump >= 1 && now - v.lastUse > 0.7)) {
    pluckVoice(v, midi, clamp(0.3 + level * 0.7, 0, 1), x, now, false)
    return
  }
  if (jump > 0) {
    // slide: portamento on the delay length, slower for slow hands
    const f = midiToFreq(midi)
    const tc = clamp(0.18 - speed * 0.08, 0.05, 0.2)
    v.node?.parameters.get('freq')?.setTargetAtTime(f, now, tc)
    v.osc?.frequency.setTargetAtTime(f, now, tc)
    v.midi = midi
    v.lastUse = now
    v.pan.pan.setTargetAtTime((x - 0.5) * 1.2, now, 0.1)
  }
}

export function brushEnd(slot: number) {
  const v = voices.find((x) => x.slot === slot)
  if (v) v.slot = null
}

// --------------------------------------------------------------- dizi ---

let breath: {
  noise: AudioBufferSourceNode
  bp: BiquadFilterNode
  tone: OscillatorNode
  buzz: OscillatorNode
  vib: OscillatorNode
  vibGain: GainNode
  gain: GainNode
  pan: StereoPannerNode
  midi: number
} | null = null

function updateBreath() {
  if (!ctx) return
  const now = ctx.currentTime
  const target = body.breath > 0.15 ? Math.pow(body.breath, 1.6) * 0.16 : 0
  if (target > 0 && !breath) {
    const ac = ctx
    const noise = ac.createBufferSource()
    noise.buffer = noiseBuffer(ac, 2, 0)
    noise.loop = true
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 14
    const tone = ac.createOscillator()
    tone.type = 'sine'
    // 笛膜: the membrane's buzz sits a hair off the octave
    const buzz = ac.createOscillator()
    buzz.type = 'triangle'
    const buzzGain = ac.createGain()
    buzzGain.gain.value = 0.12
    const vib = ac.createOscillator()
    vib.frequency.value = 4.8
    const vibGain = ac.createGain()
    vibGain.gain.value = 6
    vib.connect(vibGain)
    vibGain.connect(tone.detune)
    vibGain.connect(buzz.detune)
    const gain = ac.createGain()
    gain.gain.value = 0
    const pan = ac.createStereoPanner()
    const toneGain = ac.createGain()
    toneGain.gain.value = 0.55
    noise.connect(bp)
    bp.connect(gain)
    tone.connect(toneGain)
    toneGain.connect(gain)
    buzz.connect(buzzGain)
    buzzGain.connect(gain)
    gain.connect(pan)
    pan.connect(air!)
    pan.connect(hallSend!)
    pan.connect(echoSend!)
    noise.start()
    tone.start()
    buzz.start()
    vib.start()
    breath = { noise, bp, tone, buzz, vib, vibGain, gain, pan, midi: 0 }
    breathPitch(breathMidi)
  }
  if (!breath) return
  breath.gain.gain.setTargetAtTime(target, now, 0.6)
  breath.vibGain.gain.setTargetAtTime(4 + body.energy * 30, now, 0.3)
  breath.pan.pan.setTargetAtTime(body.lean * 0.7, now, 0.5)
  if (target === 0) {
    const b = breath
    breath = null
    b.noise.stop(now + 3)
    b.tone.stop(now + 3)
    b.buzz.stop(now + 3)
    b.vib.stop(now + 3)
  }
}

let breathMidi = 69
/** the breath tone follows the harmonic centre */
export function breathPitch(midi: number) {
  breathMidi = midi
  if (!breath || !ctx) return
  const f = midiToFreq(midi)
  const now = ctx.currentTime
  breath.midi = midi
  breath.bp.frequency.setTargetAtTime(f, now, 0.4)
  breath.tone.frequency.setTargetAtTime(f, now, 0.4)
  breath.buzz.frequency.setTargetAtTime(f * 2.003, now, 0.4)
}

/** a one-shot dizi note for the loop transport */
function diziNote(midi: number, vel: number, dur: number, when: number) {
  const ac = ctx!
  const f = midiToFreq(midi)
  const noise = ac.createBufferSource()
  noise.buffer = noiseBuffer(ac, dur + 1, 0)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 16
  bp.frequency.value = f
  const tone = ac.createOscillator()
  tone.frequency.value = f
  const g = ac.createGain()
  const peak = 0.03 + vel * 0.12
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(peak, when + 0.09)
  g.gain.setTargetAtTime(0, when + dur, 0.25)
  noise.connect(bp)
  bp.connect(g)
  const tg = ac.createGain()
  tg.gain.value = 0.5
  tone.connect(tg)
  tg.connect(g)
  g.connect(air!)
  g.connect(hallSend!)
  noise.start(when)
  tone.start(when)
  noise.stop(when + dur + 1)
  tone.stop(when + dur + 1)
}

// -------------------------------------------------------------- luogu ---

// 板: the wooden clapper — a dry, precise click
function ban(force: number, when: number, x = 0.5) {
  const ac = ctx!
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 0.012, 2)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2300 + force * 600
  bp.Q.value = 6
  const g = ac.createGain()
  g.gain.setValueAtTime(0.5 * force, when)
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.06)
  const knock = ac.createOscillator()
  knock.type = 'sine'
  knock.frequency.setValueAtTime(3900, when)
  knock.frequency.exponentialRampToValueAtTime(2600, when + 0.02)
  const kg = ac.createGain()
  kg.gain.setValueAtTime(0.25 * force, when)
  kg.gain.exponentialRampToValueAtTime(0.001, when + 0.03)
  const pan = ac.createStereoPanner()
  pan.pan.value = (x - 0.5) * 1.4
  src.connect(bp)
  bp.connect(g)
  g.connect(pan)
  knock.connect(kg)
  kg.connect(pan)
  pan.connect(master!)
  pan.connect(hallSend!)
  src.start(when)
  knock.start(when)
  knock.stop(when + 0.05)
}

// 鼓: a drum with a pitched skin sweep, a body thump and a stick click
function gu(force: number, when: number, x = 0.5, big = false) {
  const ac = ctx!
  const skin = ac.createOscillator()
  skin.type = 'sine'
  const f0 = big ? 150 : 210
  const f1 = big ? 48 : 90
  skin.frequency.setValueAtTime(f0, when)
  skin.frequency.exponentialRampToValueAtTime(f1, when + (big ? 0.14 : 0.07))
  const sg = ac.createGain()
  sg.gain.setValueAtTime(0.0001, when)
  sg.gain.exponentialRampToValueAtTime(0.7 * force, when + 0.004)
  sg.gain.exponentialRampToValueAtTime(0.001, when + (big ? 0.7 : 0.3))
  const bodyN = ac.createBufferSource()
  bodyN.buffer = noiseBuffer(ac, 0.08, 3)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = big ? 420 : 900
  const bg = ac.createGain()
  bg.gain.value = 0.35 * force
  const pan = ac.createStereoPanner()
  pan.pan.value = (x - 0.5) * 0.8
  skin.connect(sg)
  sg.connect(pan)
  bodyN.connect(lp)
  lp.connect(bg)
  bg.connect(pan)
  pan.connect(master!)
  pan.connect(hallSend!)
  const es = ac.createGain()
  es.gain.value = big ? 0.5 : 0.15
  pan.connect(es)
  es.connect(echoSend!)
  skin.start(when)
  skin.stop(when + 1)
  bodyN.start(when)
}

// 锣: a resonator bank pinged by a noise burst. Chinese gongs bend after
// the strike — the large 大锣 sags downward, the small 小锣 rises — so the
// whole bank glides in pitch over the first second of its decay
const GONG_RATIOS = [1, 1.52, 2.02, 2.51, 3.29, 4.13]
function luo(midi: number, force: number, when: number, x = 0.5, big = false) {
  const ac = ctx!
  const f = midiToFreq(midi)
  const burst = ac.createBufferSource()
  burst.buffer = noiseBuffer(ac, big ? 0.05 : 0.025, 1.5)
  const pre = ac.createGain()
  pre.gain.value = 1
  burst.connect(pre)
  const out = ac.createGain()
  const decay = big ? 3.8 + force : 1.3 + force * 0.5
  out.gain.setValueAtTime(0.9 * (0.3 + force * 0.7), when)
  out.gain.exponentialRampToValueAtTime(0.001, when + decay)
  const pan = ac.createStereoPanner()
  pan.pan.value = (x - 0.5) * 1.1
  out.connect(pan)
  pan.connect(master!)
  pan.connect(hallSend!)
  const es = ac.createGain()
  es.gain.value = big ? 0.55 : 0.3
  pan.connect(es)
  es.connect(echoSend!)
  GONG_RATIOS.forEach((r, i) => {
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = (big ? 38 : 26) + i * 6
    const fr = f * r * (big ? 1 : 1.8)
    if (big) {
      bp.frequency.setValueAtTime(fr * 1.045, when)
      bp.frequency.exponentialRampToValueAtTime(fr * 0.965, when + 1.3)
    } else {
      bp.frequency.setValueAtTime(fr * 0.95, when)
      bp.frequency.exponentialRampToValueAtTime(fr * 1.07, when + 0.6)
    }
    const g = ac.createGain()
    g.gain.value = (big ? 1.4 : 1.1) / (1 + i * 0.7)
    pre.connect(bp)
    bp.connect(g)
    g.connect(out)
  })
  // the sheet's shimmer: a hiss that rides the first part of the decay
  const hiss = ac.createBufferSource()
  hiss.buffer = noiseBuffer(ac, 1.2, 4)
  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 3800
  const hg = ac.createGain()
  hg.gain.value = 0.06 * force
  hiss.connect(hp)
  hp.connect(hg)
  hg.connect(out)
  burst.start(when)
  hiss.start(when)
}

/** scrub the recent past into falling debris */
function residueBurst(force: number, at: number) {
  if (!residue) return
  setTimeout(
    () =>
      residue?.port.postMessage({
        type: 'burst',
        count: Math.round(6 + force * 14),
        force: 0.5 + force * 0.6,
        spread: 0.25 + force * 0.3,
        down: 0.75,
      }),
    at * 1000,
  )
}

export type StrikeKind = 'punch' | 'kick'

/**
 * A strike lands. The luogu answers as a cell, not a hit:
 *   punch → 八答仓 (ban · gu · small luo) tight, then space; pipa attack
 *            at the strike's pitch. Rapid punches stack 轮指 tremolo.
 *   kick  → gu + 大锣 together, a 冲头 clapper roll accelerating into a
 *            second gong, and the pipa jumps register.
 */
export function strike(
  kind: StrikeKind,
  midi: number,
  force: number,
  x: number,
  rapid: number,
) {
  const ac = getContext()
  const t0 = ac.currentTime + 0.005
  force = clamp(force, 0.15, 1)
  if (kind === 'punch') {
    ban(0.5 + force * 0.5, t0, x)
    if (force > 0.35) gu(force * 0.7, t0 + 0.052, x)
    luo(midi, force, t0 + 0.1, x, force > 0.82)
    pluck('pipa', midi, 0.6 + force * 0.4, x, 0)
    if (rapid >= 3) {
      // 轮指: a roll of re-plucks, denser with every fast punch
      const n = Math.min(9, 3 + rapid)
      const rate = 0.062 - Math.min(0.03, rapid * 0.004)
      for (let i = 1; i <= n; i++) {
        pluck('pipa', midi + (i % 2 ? 0 : 12), (0.7 - i * 0.06) * force, x, 0.08 + i * rate)
      }
    }
    residueBurst(force * 0.7, 0.09)
  } else {
    gu(force, t0, x, true)
    luo(midi - 12, force, t0 + 0.012, x, true)
    pluck('pipa', midi + 12, 0.7 + force * 0.3, x, 0)
    pluck('pipa', midi + 19, 0.5 + force * 0.3, x, 0.045)
    // 冲头: the clapper rushes, closing the gap into the second gong
    let t = 0.24
    for (const gap of [0.13, 0.1, 0.075, 0.055, 0.045]) {
      ban(0.55 * force, t0 + t, x)
      t += gap
    }
    luo(midi - 5, force * 0.7, t0 + t, x, false)
    residueBurst(force, 0.12)
  }
}

// ------------------------------------------------------- generic notes --

/** the Max-mirrored note API, used by the loop transport */
export function playNote(
  instrId: string,
  midi: number,
  velocity: number,
  durationMs: number,
  x = 0.5,
) {
  const ac = getContext()
  const now = ac.currentTime
  const vel = clamp(velocity / 127, 0, 1)
  const dur = Math.max(0.05, durationMs / 1000)
  const instr = getInstrument(instrId).id
  switch (instr) {
    case 'qin':
      pluck('qin', midi, vel, x, 0, dur < 0.15)
      break
    case 'pipa':
      pluck('pipa', midi, vel, x)
      break
    case 'dizi':
      diziNote(midi, vel, dur, now)
      break
    case 'luo':
      luo(midi, vel, now, x, midi < 55)
      break
    case 'gu':
      // the top of the drum's range is the 板 clapper
      if (midi >= 84) ban(vel, now, x)
      else gu(vel, now, x, midi < 50)
      break
  }
}

// ----------------------------------------------------------------- gate --

let gateBreath: { g: GainNode; src: AudioBufferSourceNode; bp: BiquadFilterNode } | null = null
let awakenedFlag = false
export const isAwakened = () => awakenedFlag

/** the stance gate charging: a breath drawn in, rising with the hold */
export function setGate(progress: number) {
  const ac = getContext()
  const p = clamp(progress, 0, 1)
  const now = ac.currentTime
  if (p <= 0.01) {
    stopGate()
    return
  }
  if (!gateBreath) {
    const src = ac.createBufferSource()
    src.buffer = noiseBuffer(ac, 2, 0)
    src.loop = true
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    const g = ac.createGain()
    g.gain.value = 0
    src.connect(bp)
    bp.connect(g)
    g.connect(air!)
    g.connect(hallSend!)
    src.start()
    gateBreath = { g, src, bp }
  }
  gateBreath.bp.frequency.setTargetAtTime(180 + p * 900, now, 0.2)
  gateBreath.g.gain.setTargetAtTime(0.02 + p * 0.12, now, 0.2)
}

export function stopGate() {
  if (!gateBreath || !ctx) return
  const gb = gateBreath
  gateBreath = null
  gb.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
  gb.src.stop(ctx.currentTime + 2.5)
}

/** the gate opens: one large gong and an open qin string */
export function gateComplete() {
  awakenedFlag = true
  stopGate()
  const ac = getContext()
  luo(45, 0.8, ac.currentTime + 0.02, 0.5, true)
  pluck('qin', 43, 0.7, 0.5, 0.3)
  pluck('qin', 50, 0.5, 0.5, 0.9)
}
