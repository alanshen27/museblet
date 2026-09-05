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
// the impact bus: everything that hits passes through a soft saturator so
// weight reads as grit, not as level
let impact: GainNode | null = null
let impactDrive: WaveShaperNode | null = null
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

// browsers only let audio start after a gesture; the app arms the engine
// from its pointer/key listeners and everything before that stays silent
let armed = false
export function armAudio() {
  armed = true
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function getContext(): AudioContext {
  if (ctx) {
    if (armed && ctx.state === 'suspended') void ctx.resume()
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

  impact = ac.createGain()
  impact.gain.value = 1
  impactDrive = ac.createWaveShaper()
  impactDrive.oversample = '2x'
  const curve = new Float32Array(1024)
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2)
  }
  impactDrive.curve = curve
  const impactLP = ac.createBiquadFilter()
  impactLP.type = 'lowpass'
  impactLP.frequency.value = 9000
  impact.connect(impactDrive)
  impactDrive.connect(impactLP)
  impactLP.connect(master)
  const impactHall = ac.createGain()
  impactHall.gain.value = 0.5
  impactLP.connect(impactHall)
  impactHall.connect(hallSend)

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
  /** the breath itself, -1 in .. +1 out → 气口 phrase gate */
  breathSignal?: number
  /** clinch / seize 0..1 → strings muted at the node, pitch held */
  seize?: number
  /** footwork 0..1 */
  footwork?: number
}

// the piece's section (起承转合) shapes every macro below
let sectionIdx = 0
let sectionDensity = 0.15
// how much of the luogu each section allows
const SECTION_FORCE = [0.45, 0.8, 1, 0.6]

/**
 * The form: section index 0..3 and its smoothed density. Long tails and a
 * held-back luogu in 起, the full battery in 转, a settling in 合.
 */
export function setSection(index: number, density: number) {
  sectionIdx = index
  sectionDensity = density
  if (!ctx) return
  applyMacros()
}

function applyMacros() {
  if (!ctx) return
  const now = ctx.currentTime
  const open = sectionIdx === 0 || sectionIdx === 3 ? 1 : 0
  hallWet?.gain.setTargetAtTime(0.28 + body.root * 0.4 + open * 0.2 - sectionDensity * 0.1, now, 0.8)
  const fb = 0.22 + body.breath * 0.42 - body.energy * 0.14 + open * 0.12 - sectionDensity * 0.1
  echoFeedL?.gain.setTargetAtTime(clamp(fb, 0.1, 0.72), now, 0.6)
  echoFeedR?.gain.setTargetAtTime(clamp(fb, 0.1, 0.72), now, 0.6)
}

/** a cue at the turn of each section: the gong marks the form */
export function sectionCue(index: number) {
  const ac = getContext()
  const t = ac.currentTime + 0.02
  const root = 45
  switch (index) {
    case 0:
      luo(root + 12, 0.5, t, 0.5, false)
      pluck('qin', root + 24, 0.5, 0.5, 0.4, true)
      break
    case 1:
      gu(0.5, t, 0.5, true)
      pluck('qin', root + 12, 0.55, 0.5, 0.3)
      break
    case 2:
      ban(0.9, t, 0.5)
      gu(0.95, t + 0.06, 0.5, true)
      luo(root, 1, t + 0.1, 0.5, true)
      break
    case 3:
      luo(root - 5, 0.8, t, 0.5, true)
      pluck('qin', root, 0.55, 0.5, 1.4, true)
      break
  }
}

const body: Required<BodyControls> = {
  width: 0.4,
  root: 0.3,
  guard: 0,
  breath: 0,
  energy: 0,
  lean: 0,
  breathSignal: 0,
  seize: 0,
  footwork: 0,
}

export function setBody(c: BodyControls) {
  Object.assign(body, c)
  if (!ctx) return
  const now = ctx.currentTime
  widthDepth?.gain.setTargetAtTime(0.0003 + body.width * 0.0032, now, 0.3)
  guardLP?.frequency.setTargetAtTime(
    18000 * Math.pow(0.04, body.guard),
    now,
    0.08,
  )
  // 留白: a still body leaves long tails; a busy one dries the room
  applyMacros()
  echoPanL?.pan.setTargetAtTime(-0.2 - body.width * 0.8, now, 0.4)
  echoPanR?.pan.setTargetAtTime(0.2 + body.width * 0.8, now, 0.4)
  for (const v of voices) if (v.node) setStringMute(v, Math.max(body.guard, body.seize))
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
  node = 2,
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
        node,
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
  node = 2,
) {
  const ac = getContext()
  const v = allocString(instr, null)
  pluckVoice(v, midi, clamp(force, 0, 1), x, ac.currentTime + at, harmonic, node)
}

/**
 * 泛音: a closed brush path is answered by the flageolets of its pitches —
 * light touches at the octave, fifth and double-octave nodes
 */
export function flageolets(midis: number[], level: number, x: number) {
  const nodes = [2, 3, 4]
  midis.slice(0, 4).forEach((m, i) => {
    pluck('qin', m, 0.35 + level * 0.4, x, i * 0.16 + Math.random() * 0.03, true, nodes[i % nodes.length])
  })
}

// ------------------------------------------------------------- pipa wheel --
// 轮指: a wheel of outward plucks whose density is a rate, not a tempo.
// The wheel is fed continuously (from punch rapidity or brush speed) and
// winds down by itself when the feeding stops.
const wheel = { rate: 0, level: 0, midi: 60, x: 0.5, next: 0, timer: 0 as ReturnType<typeof setInterval> | 0, lastFeed: 0, finger: 0 }

export function feedWheel(midi: number, rate: number, level: number, x: number) {
  const ac = getContext()
  wheel.midi = midi
  wheel.rate = clamp(rate, 0, 18)
  wheel.level = clamp(level, 0, 1)
  wheel.x = x
  wheel.lastFeed = ac.currentTime
  if (!wheel.timer) {
    wheel.next = ac.currentTime + 0.01
    wheel.timer = setInterval(wheelTick, 40)
  }
}

function wheelTick() {
  const ac = ctx
  if (!ac) return
  const now = ac.currentTime
  // the wheel slows once it is no longer fed, and stops
  const idle = now - wheel.lastFeed
  const rate = wheel.rate * Math.max(0, 1 - idle / 1.4)
  if (rate < 2.5) {
    clearInterval(wheel.timer)
    wheel.timer = 0
    return
  }
  // schedule plucks up to 120 ms ahead; each finger of the wheel a little
  // different in force and position
  while (wheel.next < now + 0.12) {
    const finger = wheel.finger++ % 4
    const f = wheel.level * (0.55 + 0.45 * (finger === 0 ? 1 : 0.7)) * Math.max(0.3, 1 - idle / 1.4)
    const v = allocString('pipa', null)
    pluckVoice(v, wheel.midi + (finger === 3 ? 12 : 0), f, wheel.x + (finger - 1.5) * 0.02, wheel.next, false)
    wheel.next += 1 / rate
  }
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
  // seized: the pitch is held where it is; the string can only be damped
  if (body.seize > 0.5 && !fresh) return
  const jump = Math.abs(midi - v.midi)
  if (fresh) {
    // 起 is played in 泛音, the string's harmonics: thin, pure, brief
    pluckVoice(v, midi, clamp(0.3 + level * 0.7, 0, 1), x, now, sectionIdx === 0)
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

/** an onset on a held brush voice: the speed integral crossed a threshold */
export function brushOnset(slot: number, instr: 'qin' | 'pipa', midi: number, force: number, x: number, at = 0) {
  const ac = getContext()
  const v = allocString(instr, slot)
  pluckVoice(v, midi, clamp(force, 0, 1), x, ac.currentTime + at, sectionIdx === 0)
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
  air: GainNode
  core: GainNode
} | null = null

function updateBreath() {
  if (!ctx) return
  const now = ctx.currentTime
  const openSection = sectionIdx === 0 || sectionIdx === 3 ? 1.6 : 1
  // the breath only opens in real stillness, and grows slowly from there
  // the breath belongs to true stillness — about 0.7 s of it — not to the
  // micro-pause between two punches; then it comes in quickly
  const target = body.breath > 0.32 ? Math.pow((body.breath - 0.32) / 0.68, 1.2) * 0.16 * openSection : 0
  if (target > 0 && !breath) {
    const ac = ctx
    // the breath is the tone: air through a narrow resonator at the
    // pitch, with a sine core only as a fundamental underneath
    const noise = ac.createBufferSource()
    noise.buffer = noiseBuffer(ac, 2, 0)
    noise.loop = true
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 22
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
    toneGain.gain.value = 0.3
    const airGain = ac.createGain()
    airGain.gain.value = 2.2
    noise.connect(bp)
    bp.connect(airGain)
    airGain.connect(gain)
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
    breath = { noise, bp, tone, buzz, vib, vibGain, gain, pan, midi: 0, air: airGain, core: toneGain }
    breathPitch(breathMidi)
  }
  if (!breath) return
  // 气口: the phrase rides the body's own breath — the tone opens on the
  // out-breath and closes on the in-breath; air pressure sets how much of
  // the tone is noise (more air, more breath, less core)
  const phrase = clamp(0.5 + body.breathSignal * 0.9, 0.05, 1)
  breath.gain.gain.setTargetAtTime(target * phrase, now, 0.28)
  breath.air.gain.setTargetAtTime(1.4 + Math.max(0, body.breathSignal) * 1.6, now, 0.4)
  breath.core.gain.setTargetAtTime(0.38 - Math.max(0, body.breathSignal) * 0.2, now, 0.4)
  breath.bp.Q.setTargetAtTime(14 + (1 - Math.abs(body.breathSignal)) * 14, now, 0.4)
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

// --------------------------------------------------------------- erhu ---
// a bowed string for the turning body: the bow's weight arrives over half
// a second and the pitch is one continuous 滑音. One voice.
let erhu: {
  osc: OscillatorNode
  body1: BiquadFilterNode
  body2: BiquadFilterNode
  bow: BiquadFilterNode
  gain: GainNode
  pan: StereoPannerNode
  midi: number
  lastT: number
} | null = null

export function erhuTo(midi: number, level: number, x: number, glideMs = 250) {
  const ac = getContext()
  const now = ac.currentTime
  if (!erhu) {
    const osc = ac.createOscillator()
    osc.type = 'sawtooth'
    // bow noise brightens the tone under pressure
    const bow = ac.createBiquadFilter()
    bow.type = 'lowpass'
    bow.frequency.value = 1800
    bow.Q.value = 0.7
    const body1 = ac.createBiquadFilter()
    body1.type = 'peaking'
    body1.frequency.value = 620
    body1.Q.value = 2.5
    body1.gain.value = 9
    const body2 = ac.createBiquadFilter()
    body2.type = 'peaking'
    body2.frequency.value = 1400
    body2.Q.value = 3
    body2.gain.value = 6
    const gain = ac.createGain()
    gain.gain.value = 0
    const pan = ac.createStereoPanner()
    osc.connect(bow)
    bow.connect(body1)
    body1.connect(body2)
    body2.connect(gain)
    gain.connect(pan)
    pan.connect(master!)
    pan.connect(hallSend!)
    const es = ac.createGain()
    es.gain.value = 0.3
    pan.connect(es)
    es.connect(echoSend!)
    osc.frequency.value = midiToFreq(midi)
    osc.start()
    erhu = { osc, body1, body2, bow, gain, pan, midi, lastT: now }
  }
  const f = midiToFreq(midi)
  const tc = clamp(glideMs / 1000 / 3, 0.02, 0.17)
  erhu.osc.frequency.setTargetAtTime(f, now, tc)
  // bow displacement → volume, over ~500 ms
  erhu.gain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.11, now, 0.17)
  erhu.bow.frequency.setTargetAtTime(900 + level * 2600, now, 0.2)
  erhu.pan.pan.setTargetAtTime((x - 0.5) * 1.2, now, 0.2)
  erhu.midi = midi
  erhu.lastT = now
}

/** the right hand bows the erhu: pitch from height, pressure from motion */
export function bow(midi: number, speed: number, x: number) {
  const level = clamp((speed - 0.5) / 2.2, 0, 1)
  erhuTo(midi, 0.25 + level * 0.75, x, 220)
}

export function erhuEnd() {
  if (!erhu || !ctx) return
  const e = erhu
  erhu = null
  const now = ctx.currentTime
  e.gain.gain.setTargetAtTime(0, now, 0.25)
  e.osc.stop(now + 2)
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

// ---------------------------------------------------------------- band ---
// Combat grammar. The round is the piece: footwork is the band that never
// stops while the body moves — a low ostinato on the phrase pulse (a soft
// drum on the eighths, the low qin string on the downbeats, a sub drone
// under it), its level and density fed by the bounce of the hips and feet.
const band = { level: 0, x: 0.5, next: 0, k: 0, timer: 0 as ReturnType<typeof setInterval> | 0, lastFeed: 0, duck: 0 }
let bandDrone: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; lp: BiquadFilterNode } | null = null
let centreMidi = 45
// the combat grid: a 130 BPM feel, eighths of 230 ms, two beats to a bar.
// Everything rhythmic — the band, strike onsets, phrase resolutions — sits
// on this one grid, anchored when the gate opens
export const PULSE = 0.23
let gridAnchor = 0
export function anchorGrid() {
  const ac = getContext()
  gridAnchor = ac.currentTime
}
/** seconds until the next grid eighth (light swing: a little late, never early) */
export function untilNextPulse(from?: number): number {
  const ac = getContext()
  const now = from ?? ac.currentTime
  const ph = ((now - gridAnchor) % PULSE + PULSE) % PULSE
  const wait = PULSE - ph
  // an onset that has just missed the grid plays now rather than a whole
  // eighth late; a touch of swing keeps it human
  return (wait > PULSE * 0.78 ? 0 : wait) + Math.random() * 0.012
}
/** index of the eighth the time falls on (0 = downbeat of the bar) */
export function pulseIndex(t: number): number {
  return Math.round((t - gridAnchor) / PULSE) % 4
}

export function feedBand(level: number, x: number) {
  const ac = getContext()
  band.level = clamp(level, 0, 1)
  band.x = x
  band.lastFeed = ac.currentTime
  if (!band.timer) {
    // start on the grid
    const now = ac.currentTime
    const n = Math.ceil((now + 0.02 - gridAnchor) / PULSE)
    band.next = gridAnchor + n * PULSE
    band.k = ((n % 4) + 4) % 4
    band.timer = setInterval(bandTick, 60)
  }
  ensureDrone()
}

function ensureDrone() {
  const ac = ctx!
  if (bandDrone) return
  const osc = ac.createOscillator()
  osc.type = 'sine'
  const osc2 = ac.createOscillator()
  osc2.type = 'triangle'
  osc2.detune.value = 4
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 220
  const gain = ac.createGain()
  gain.gain.value = 0
  osc.connect(lp)
  osc2.connect(lp)
  lp.connect(gain)
  gain.connect(master!)
  gain.connect(hallSend!)
  osc.frequency.value = midiToFreq(centreMidi - 12)
  osc2.frequency.value = midiToFreq(centreMidi - 12)
  osc.start()
  osc2.start()
  bandDrone = { osc, osc2, gain, lp }
}

function bandTick() {
  const ac = ctx
  if (!ac) return
  const now = ac.currentTime
  const idle = now - band.lastFeed
  // the band coasts a moment after the feet stop, then falls silent
  const level = band.level * Math.max(0, 1 - idle / 1.6) * (1 - band.duck)
  band.duck = Math.max(0, band.duck - 0.06)
  if (bandDrone) bandDrone.gain.gain.setTargetAtTime(level * 0.06, now, 0.25)
  if (level < 0.04) {
    clearInterval(band.timer)
    band.timer = 0
    return
  }
  while (band.next < now + 0.14) {
    const k = band.k++
    const down = k % 4 === 0
    const beat = k % 2 === 0
    // a quiet pulse under the melody: the drum on the downbeat, on the
    // second beat only when the feet are really moving; the low string on
    // the downbeat only — nothing that competes with the punches
    if (down) gu(level * 0.3, band.next, band.x, true)
    else if (beat && level > 0.6) gu(level * 0.14, band.next, band.x, false)
    if (down) pluck('qin', centreMidi - 12, 0.2 + level * 0.3, band.x, Math.max(0, band.next - now))
    band.next += PULSE
  }
}

// the guard: a held bed — two slow detuned voices and a breathy core at the
// centre, rising while the hands stay up and dying when they drop
let pad: { a: OscillatorNode; b: OscillatorNode; lp: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode } | null = null
let padDuck = 0
export function setPad(level: number, x = 0.5, sinceStrikeMs = Infinity) {
  const ac = getContext()
  const now = ac.currentTime
  // under a flurry the bed sits back; it swells only in the gaps
  padDuck = sinceStrikeMs < 600 ? 0.45 : 1
  const target = clamp(level, 0, 1)
  if (target > 0.05 && !pad) {
    const a = ac.createOscillator()
    a.type = 'sawtooth'
    const b = ac.createOscillator()
    b.type = 'sawtooth'
    b.detune.value = 7
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    lp.Q.value = 0.8
    const lfo = ac.createOscillator()
    lfo.frequency.value = 0.17
    const lfoG = ac.createGain()
    lfoG.gain.value = 140
    lfo.connect(lfoG)
    lfoG.connect(lp.frequency)
    const gain = ac.createGain()
    gain.gain.value = 0
    const p = ac.createStereoPanner()
    p.pan.value = (x - 0.5) * 0.6
    a.connect(lp)
    b.connect(lp)
    lp.connect(gain)
    gain.connect(p)
    p.connect(air!)
    p.connect(hallSend!)
    a.frequency.value = midiToFreq(centreMidi)
    b.frequency.value = midiToFreq(centreMidi + 7)
    a.start()
    b.start()
    lfo.start()
    pad = { a, b, lp, gain, lfo }
  }
  if (!pad) return
  // the bed arrives over half a second and leaves faster
  pad.gain.gain.setTargetAtTime(target * 0.07 * padDuck, now, target > 0.05 ? 0.5 : 0.25)
  if (target <= 0.02) {
    const pd = pad
    pad = null
    pd.a.stop(now + 2)
    pd.b.stop(now + 2)
    pd.lfo.stop(now + 2)
  }
}

/** the tonal centre moves: band drone and pad follow */
export function setCentre(midi: number) {
  centreMidi = midi
  if (!ctx) return
  const now = ctx.currentTime
  bandDrone?.osc.frequency.setTargetAtTime(midiToFreq(midi - 12), now, 0.4)
  bandDrone?.osc2.frequency.setTargetAtTime(midiToFreq(midi - 12), now, 0.4)
  pad?.a.frequency.setTargetAtTime(midiToFreq(midi), now, 0.6)
  pad?.b.frequency.setTargetAtTime(midiToFreq(midi + 7), now, 0.6)
}

// a freeze (亮相, a clinch): the phrase resolves — the pad settles on the
// root, the band ducks for a beat
export function resolve() {
  if (!ctx) return
  const now = ctx.currentTime
  band.duck = 1
  pad?.b.frequency.setTargetAtTime(midiToFreq(centreMidi), now, 0.3)
  setTimeout(() => pad?.b.frequency.setTargetAtTime(midiToFreq(centreMidi + 7), ctx!.currentTime, 0.8), 1400)
}

// ------------------------------------------------------------- impact ---
// Film-Foley impact: a crack transient, a flesh thud (闷响), a sub weight and
// the room. Force is weight — lower thud, more sub, more drive, longer
// decay — never more notes.
function impactCell(kind: 'punch' | 'kick', force: number, when: number, x = 0.5) {
  const ac = ctx!
  const heavy = kind === 'kick'
  const pan = ac.createStereoPanner()
  pan.pan.value = (x - 0.5) * 0.9
  const out = ac.createGain()
  out.gain.value = (heavy ? 1.35 : 1.0) * (0.55 + force * 0.75)
  out.connect(pan)
  pan.connect(impact!)
  // 1. crack: a very short bright noise transient — the snap of contact
  const crack = ac.createBufferSource()
  crack.buffer = noiseBuffer(ac, heavy ? 0.012 : 0.008, 1.2)
  const cbp = ac.createBiquadFilter()
  cbp.type = 'bandpass'
  cbp.frequency.value = heavy ? 1400 : 2400
  cbp.Q.value = 1.2
  const cg = ac.createGain()
  cg.gain.value = 0.55 * (0.6 + force * 0.6)
  crack.connect(cbp)
  cbp.connect(cg)
  cg.connect(out)
  crack.start(when)
  // 2. thud: lowpassed noise body, darker with weight, plus a pitched drop
  const thud = ac.createBufferSource()
  thud.buffer = noiseBuffer(ac, heavy ? 0.16 : 0.09, 2.2)
  const tlp = ac.createBiquadFilter()
  tlp.type = 'lowpass'
  tlp.frequency.setValueAtTime((heavy ? 520 : 760) - force * 220, when)
  tlp.frequency.exponentialRampToValueAtTime(heavy ? 110 : 160, when + (heavy ? 0.16 : 0.09))
  tlp.Q.value = 0.9
  const tg = ac.createGain()
  tg.gain.value = 0.9
  thud.connect(tlp)
  tlp.connect(tg)
  tg.connect(out)
  thud.start(when)
  const drop = ac.createOscillator()
  drop.type = 'sine'
  drop.frequency.setValueAtTime(heavy ? 150 : 190, when)
  drop.frequency.exponentialRampToValueAtTime(heavy ? 48 : 62, when + 0.045)
  const dg = ac.createGain()
  dg.gain.setValueAtTime(0.0001, when)
  dg.gain.exponentialRampToValueAtTime(0.8, when + 0.003)
  dg.gain.exponentialRampToValueAtTime(0.001, when + (heavy ? 0.28 : 0.16))
  drop.connect(dg)
  dg.connect(out)
  drop.start(when)
  drop.stop(when + 0.4)
  // 3. sub: the weight of the body behind the blow
  const sub = ac.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(heavy ? 42 : 52, when)
  sub.frequency.exponentialRampToValueAtTime(heavy ? 34 : 44, when + 0.3)
  const sg = ac.createGain()
  sg.gain.setValueAtTime(0.0001, when)
  sg.gain.exponentialRampToValueAtTime((0.25 + force * 0.75) * (heavy ? 1.1 : 0.8), when + 0.008)
  sg.gain.exponentialRampToValueAtTime(0.001, when + (heavy ? 0.7 : 0.4) + force * 0.3)
  sub.connect(sg)
  sg.connect(out)
  sub.start(when)
  sub.stop(when + 1.2)
  // 4. the room: a short dark tail, more of it with weight
  const tail = ac.createBufferSource()
  tail.buffer = noiseBuffer(ac, 0.5, 3.5)
  const tlp2 = ac.createBiquadFilter()
  tlp2.type = 'lowpass'
  tlp2.frequency.value = 900
  const tg2 = ac.createGain()
  tg2.gain.value = 0.12 + force * 0.2
  tail.connect(tlp2)
  tlp2.connect(tg2)
  tg2.connect(hallSend!)
  tail.start(when + 0.02)
}

// 蓄: the wind-up before a blow — a short breath drawn in, low and soft
export function windup(x = 0.5) {
  const ac = getContext()
  const t = ac.currentTime
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 0.5, 0)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.setValueAtTime(180, t)
  bp.frequency.exponentialRampToValueAtTime(520, t + 0.3)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.22)
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.42)
  const pan = ac.createStereoPanner()
  pan.pan.value = (x - 0.5) * 0.8
  src.connect(bp)
  bp.connect(g)
  g.connect(pan)
  pan.connect(master!)
  pan.connect(hallSend!)
  src.start(t)
}

// the drum roll under a turning torso: density is a rate fed continuously
const roll = { level: 0, next: 0, timer: 0 as ReturnType<typeof setInterval> | 0, lastFeed: 0 }
export function feedRoll(level: number, x: number) {
  const ac = getContext()
  roll.level = clamp(level, 0, 1)
  roll.lastFeed = ac.currentTime
  ;(roll as { x?: number }).x = x
  if (!roll.timer) {
    roll.next = ac.currentTime + 0.01
    roll.timer = setInterval(rollTick, 40)
  }
}
function rollTick() {
  const ac = ctx
  if (!ac) return
  const now = ac.currentTime
  const idle = now - roll.lastFeed
  const level = roll.level * Math.max(0, 1 - idle / 0.8)
  if (level < 0.05) {
    clearInterval(roll.timer)
    roll.timer = 0
    return
  }
  const rate = 5 + level * 9
  while (roll.next < now + 0.12) {
    gu(0.12 + level * 0.35, roll.next, (roll as { x?: number }).x ?? 0.5, level > 0.6)
    roll.next += 1 / rate + (Math.random() - 0.5) * 0.02
  }
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

/**
 * 亮相 — the body stops dead after fast motion. 撕边一锣: a roll on the
 * drum's rim rushing into one gong, then nothing.
 */
export function snapPose(force: number, x: number) {
  const ac = getContext()
  const t0 = ac.currentTime + 0.005
  force = clamp(force, 0.2, 1) * SECTION_FORCE[sectionIdx]
  let t = 0
  for (const gap of [0.09, 0.075, 0.06, 0.05, 0.042, 0.036]) {
    ban(0.35 * force, t0 + t, x)
    gu(0.25 * force, t0 + t + 0.004, x)
    t += gap
  }
  luo(50, force, t0 + t, x, true)
  residueBurst(force * 0.5, t + 0.05)
}

export type StrikeKind = 'punch' | 'kick'

/**
 * A strike lands. The luogu answers as a cell, not a hit:
 *   punch → 八答仓 (ban · gu · small luo) tight, then space; pipa attack
 *            at the strike's pitch. Rapid punches stack 轮指 tremolo.
 *   kick  → gu + 大锣 together, a 冲头 clapper roll accelerating into a
 *            second gong, and the pipa jumps register.
 */
export interface StrikeOpts {
  /** the note the phrase engine chose (already in the mode) */
  note: number
  /** seconds to wait so the onset lands on the grid */
  at: number
  /** true when the onset falls on a bar's downbeat */
  downbeat: boolean
  /** index within the current combination, 0 = first blow */
  chain: number
}

/**
 * A strike, phrased. The melody leads: every punch is a note in the mode,
 * placed on the grid; the Foley under it is light and velocity-gated (a
 * full cell only for a heavy blow, the 板 only on downbeats), so a
 * combination reads as a line, not a drum fill. Kicks keep the chorus hit.
 */
export function strike(
  kind: StrikeKind,
  midi: number,
  force: number,
  x: number,
  rapid: number,
  opts?: Partial<StrikeOpts>,
) {
  const ac = getContext()
  const at = opts?.at ?? 0
  const t0 = ac.currentTime + 0.005 + at
  const note = opts?.note ?? midi
  const chain = opts?.chain ?? 0
  const downbeat = opts?.downbeat ?? false
  force = clamp(force, 0.15, 1) * SECTION_FORCE[sectionIdx]
  const climax = sectionIdx === 2
  if (kind === 'punch') {
    const heavy = force > 0.72
    // the note: the lead voice. The first blow of a phrase and heavy blows
    // are doubled an octave below on the qin
    pluck('pipa', note, 0.5 + force * 0.5, x, at + 0.004)
    if (chain === 0 || heavy) pluck('qin', note - 12, 0.35 + force * 0.3, x, at + 0.012)
    // the Foley, thinned: light contact for a jab, the full cell for a
    // heavy blow; the 板 only on the downbeat or under weight
    impactCell('punch', heavy ? force : force * 0.4, t0, x)
    if (downbeat || heavy) ban(0.3 + force * 0.35, t0 + 0.004, x)
    if (rapid >= 3 && climax) feedWheel(note, 6 + rapid * 2, 0.25 + force * 0.35, x)
    if (heavy) residueBurst(force * 0.4, at + 0.1)
  } else {
    // the chorus hit: the heavy cell, the 大鼓, the 大锣, and a chord
    // leaping a register above the band
    impactCell('kick', force, t0, x)
    gu(force, t0 + 0.006, x, true)
    if (force > 0.45) luo(note - 12, force, t0 + 0.03, x, true)
    pluck('qin', note + 12, 0.7 + force * 0.3, x, at + 0.02)
    pluck('qin', note + 19, 0.55 + force * 0.3, x, at + 0.06)
    pluck('pipa', note + 24, 0.6 + force * 0.3, x, at + 0.1)
    if (pad) pad.gain.gain.setTargetAtTime(0.14, t0, 0.05)
    if (climax && force > 0.7) {
      let t = 0.26
      for (const gap of [0.13, 0.1, 0.075, 0.055, 0.045]) {
        ban(0.5 * force, t0 + t, x)
        t += gap
      }
      luo(note - 5, force * 0.6, t0 + t, x, false)
    }
    residueBurst(force * 0.8, at + 0.12)
  }
}

/** the barline: a phrase has ended — a soft gong tap on the grid and the bed on the root */
export function phraseEnd(x = 0.5) {
  const ac = getContext()
  const at = untilNextPulse()
  luo(centreMidi + 12, 0.28, ac.currentTime + at, x, false)
  resolve()
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
    case 'erhu':
      erhuTo(midi, vel, x, 200)
      setTimeout(erhuEnd, durationMs + 300)
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
