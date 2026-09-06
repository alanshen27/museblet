import { useCallback, useEffect, useRef, useState } from 'react'
import InkSurface, { type DrawHandle, type DrawPoint } from './InkSurface'
import BodyLayer, { LEFT_HAND, RIGHT_HAND } from './BodyLayer'
import {
  anchorGrid,
  armAudio,
  audioNow,
  bow,
  breathPitch,
  brushEnd,
  brushOnset,
  brushTo,
  ensureAudio,
  erhuEnd,
  feedBand,
  feedRoll,
  flageolets,
  phraseEnd,
  pulseIndex,
  resolve,
  setCentre,
  setPad,
  snapPose,
  windup,
  gateComplete,
  isAwakened,
  playNote,
  sectionCue,
  setBody as setAudioBody,
  setGate as setAudioGate,
  setScaleName,
  setSection as setAudioSection,
  strike as audioStrike,
  untilNextPulse,
} from './audio'
import { PerformanceForm, SECTION_INFO, SECTIONS, type FormState } from './performance'
import { bindInlet, isMax, outletMessage, outletNote } from './max'
import { DEFAULT_SCALE, MODE_GLYPH, SCALES, scaleDegree, strokesToNotes, type NoteEvent, type Stroke } from './music'
import { chordAt, stepInScale } from './harmony'
import type { BodyState, Phase, Strike } from './sanda'
import { emitStrike, onStrike, type StrikeEvent } from './strikes'
import { getTheme, setTheme, type Theme } from './instruments'
import './App.css'

const PHASES: Record<Phase, { pinyin: string; word: string }> = {
  息: { pinyin: 'xī', word: 'breath' },
  势: { pinyin: 'shì', word: 'stance' },
  发: { pinyin: 'fā', word: 'release' },
  收: { pinyin: 'shōu', word: 'recovery' },
}

// how long the body must hold still (or the pointer be held) to open the gate
const GATE_HOLD_MS = 1800

// brush slot → register: the left hand is the low string, the right the
// high one, the pointer sits between
const slotOf = (id: number) => (id === LEFT_HAND ? 0 : id === RIGHT_HAND ? 1 : 2)
const LOW: Record<number, number> = { 0: 43, 1: 55, 2: 48 }

export default function App() {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [playing, setPlaying] = useState(false)
  const [tempo, setTempo] = useState(96)
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [playheadX, setPlayheadX] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('势')
  const [meters, setMeters] = useState({ stance: 0, root: 0, breath: 0, energy: 0 })
  const [gateState, setGateState] = useState<'silent' | 'breath' | 'open'>('silent')
  const [profileTip, setProfileTip] = useState(false)
  const profileSinceRef = useRef(0)
  const [gateOpen, setGateOpen] = useState(false)
  const [gateProgress, setGateProgress] = useState(0)
  const [bodySeen, setBodySeen] = useState(false)
  const [hits, setHits] = useState(0)
  const [form, setForm] = useState<FormState | null>(null)
  const [cue, setCue] = useState<{ section: string; n: number } | null>(null)
  const inMax = isMax()
  // `?form=brisk` runs the piece at a third of its length, for rehearsal
  const formRef = useRef(
    new PerformanceForm(new URLSearchParams(window.location.search).get('form') === 'brisk' ? 0.3 : 1),
  )
  const formStrikesRef = useRef(0)
  const lastBodyRef = useRef<BodyState | null>(null)
  const lastStrikeRef = useRef(-Infinity)
  // the phrase: a combination is one line in the mode. It starts on the
  // phrase tonic (the current centre), each blow steps up the scale with a
  // dip every fourth (up-up-up-down, a motif rather than a ladder); the rear
  // hand sits a fifth below the lead; a fist above the head lifts an octave.
  // A gap of a second, or a freeze, is the barline: the phrase resolves and
  // the next one starts on the tonic again
  const phraseRef = useRef({ idx: 0, tonic: 55, open: false, blows: 0 })
  const PHRASE_GAP_MS = 1000
  const [busy, setBusy] = useState<{ phrase: number; beat: number } | null>(null)
  const debugBusy = new URLSearchParams(window.location.search).has('busy')
  const rollOnRef = useRef(false)
  const rollArmRef = useRef(0)
  const erhuMaxRef = useRef(0)
  // the phrase pulse: a slow breath of 2.4 s, its eighths (300 ms) the only
  // places a brush onset may fall — 散板 in feel, but never a random spray
  const PULSE_MS = 300
  const nextPulseDelay = () => {
    const now = performance.now()
    const ph = (now - gateOpenAtRef.current) % PULSE_MS
    return (PULSE_MS - ph) / 1000
  }
  const gateOpenAtRef = useRef(0)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [help, setHelp] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H' || e.key === '?') setHelp((v) => !v)
      if (e.key === 'Escape') setHelp(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // the two grounds: the ink-stone (default) and xuan paper. `?theme=xuan`,
  // or T to turn the sheet over
  const applyTheme = useCallback((t: Theme) => {
    setTheme(t)
    setThemeState(t)
    surface.current?.setTheme(t === 'xuan')
  }, [])
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('theme')
    applyTheme(q === 'xuan' ? 'xuan' : 'ink')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') applyTheme(getTheme() === 'ink' ? 'xuan' : 'ink')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyTheme])

  const surface = useRef<DrawHandle | null>(null)
  const notesRef = useRef<NoteEvent[]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo
  const loopMsRef = useRef(0)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const lastLoopRef = useRef(-1)
  const firedRef = useRef<Set<NoteEvent>>(new Set())
  const gateOpenRef = useRef(false)
  const gateStartRef = useRef(0)
  const pointerHoldRef = useRef<number | null>(null)
  const lastCtlRef = useRef<Record<string, number>>({})
  const lastCtlSentRef = useRef(0)
  const pointerPunchesRef = useRef<number[]>([])
  const phaseRef = useRef<Phase>('势')

  const loopMs = (60000 / tempo) * 8
  const barMs = () => (60000 / tempoRef.current) * 2
  const centreIndex = (now: number) => Math.floor(now / (barMs() * 4))

  const emit = useCallback(
    (n: NoteEvent, x = 0.5) => {
      if (inMax) outletNote(n.pen, n.midi, n.velocity, n.durationMs)
      else playNote(n.pen, n.midi, n.velocity, n.durationMs, x)
    },
    [inMax],
  )

  // ------------------------------------------------------------- gate --
  const openGate = useCallback(() => {
    if (gateOpenRef.current) return
    gateOpenRef.current = true
    setGateOpen(true)
    setGateProgress(1)
    surface.current?.setGate(1, true)
    gateOpenAtRef.current = performance.now()
    if (!inMax) anchorGrid()
    formRef.current.start(performance.now())
    if (inMax) outletMessage('gate', 'open')
    else gateComplete()
  }, [inMax])

  // the piece: the form advances with time and bends with the body, and
  // every section turn is cued in sound, image and to Max
  useEffect(() => {
    const id = setInterval(() => {
      if (!gateOpenRef.current) return
      const b = lastBodyRef.current
      const st = formRef.current.update(performance.now(), {
        energy: b?.energy ?? 0,
        stillness: b?.stillness ?? 0,
        strikes: formStrikesRef.current,
        present: b?.present ?? false,
      })
      formStrikesRef.current = 0
      // the barline: a phrase that has gone quiet for a second resolves
      const ph = phraseRef.current
      const since = performance.now() - lastStrikeRef.current
      if (ph.open && since > PHRASE_GAP_MS) {
        ph.open = false
        if (ph.blows >= 2 && !inMax) phraseEnd(0.5 + (b?.lean ?? 0) * 0.3)
        if (inMax) outletMessage('phrase', 'end', ph.blows)
      }
      setForm(st)
      surface.current?.setMood({ density: st.density, section: st.index, breath: b?.breath ?? 0, lean: b?.lean ?? 0 })
      if (inMax) {
        if (st.changed) outletMessage('section', st.section, st.index, st.resting ? 1 : 0)
      } else {
        setAudioSection(st.index, st.density)
        if (st.changed && !st.resting) sectionCue(st.index)
      }
      if (st.changed && !st.resting) setCue((c) => ({ section: st.section, n: (c?.n ?? 0) + 1 }))
      if (st.changed) console.debug(`[form] ${st.section} (${st.index}) at ${(st.elapsed / 1000).toFixed(1)}s${st.resting ? ' · resting' : ''}`)
    }, 120)
    return () => clearInterval(id)
  }, [inMax])

  useEffect(() => {
    // hold the pointer anywhere, or press Enter, to open without a camera
    const down = () => {
      armAudio()
      void ensureAudio()
      if (gateOpenRef.current) return
      pointerHoldRef.current = performance.now()
    }
    const up = () => {
      pointerHoldRef.current = null
    }
    const key = (e: KeyboardEvent) => {
      armAudio()
      void ensureAudio()
      if (e.key === 'Enter') openGate()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    const id = setInterval(() => {
      if (gateOpenRef.current || pointerHoldRef.current === null) return
      const p = Math.min(1, (performance.now() - pointerHoldRef.current) / GATE_HOLD_MS)
      setGateProgress(p)
      surface.current?.setGate(p, false)
      if (!inMax) setAudioGate(p)
      if (p >= 1) openGate()
    }, 50)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
      clearInterval(id)
    }
  }, [inMax, openGate])

  // ------------------------------------------------------- the body --
  const glyphFor = (e: StrikeEvent) => {
    if (e.type === 'snap') return '亮相'
    if (e.type === 'kick') return '起势'
    if (e.rapid >= 3) return '连击'
    if (e.force > 0.8) return '发'
    return '打'
  }

  /** the sound of a landed strike: the phrase engine, the grid, the cell */
  const soundStrike = useCallback(
    (e: StrikeEvent, s: Strike, rapid: number, gap: number) => {
      // ---- the phrase engine: a stable pitch language ----------------------
      const ph = phraseRef.current
      if (gap > PHRASE_GAP_MS || !ph.open) {
        ph.idx = 0
        ph.blows = 0
        ph.tonic = chordAt(scaleRef.current, centreIndex(e.t), 55)[0]
        ph.open = true
      }
      const chain = ph.blows
      // the rear hand (right for an orthodox stance: screen-right) a fifth
      // below the lead; a fist above the head lifts an octave
      const shY = e.joints ? ((e.joints.lShoulder?.y ?? 0.4) + (e.joints.rShoulder?.y ?? 0.4)) / 2 : 0.4
      const swv = e.joints ? Math.abs((e.joints.lShoulder?.x ?? 0.4) - (e.joints.rShoulder?.x ?? 0.6)) || 0.2 : 0.2
      const register = (e.side === 'R' ? -3 : 0) + (e.y < shY - swv * 0.3 ? 5 : 0) // in scale steps
      const contour = ph.idx // up, up, up, down…
      const note =
        s.kind === 'punch'
          ? stepInScale(ph.tonic, contour + register, scaleRef.current)
          : s.kind === 'kick'
            ? stepInScale(ph.tonic, -5, scaleRef.current)
            : ph.tonic
      if (s.kind === 'punch') {
        ph.blows++
        ph.idx = ph.blows % 4 === 3 ? Math.max(0, ph.idx - 2) : ph.idx + 1
      }
      const midi = note
      const vel = Math.round(40 + s.force * 87)
      // ---- the grid: onsets land on the next eighth of the combat pulse ----
      const at = inMax ? 0 : untilNextPulse()
      const downbeat = inMax ? false : pulseIndex(audioNow() + at) === 0
      if (debugBusy) setBusy({ phrase: ph.blows, beat: pulseIndex(audioNow() + at) })
      if (inMax) {
        outletMessage('strike', s.kind, midi, vel, Number(s.x.toFixed(3)), Number(s.y.toFixed(3)), rapid, Number(e.confidence.toFixed(2)))
        // the luogu cell, spelled out as notes so simple patches still speak
        if (s.kind === 'punch') {
          outletNote('gu', 96, vel, 30) // 板 clapper
          outletNote('pipa', midi, vel, 400)
          setTimeout(() => outletNote('luo', midi, vel, 2000), 100)
          if (rapid >= 3) {
            for (let i = 1; i <= Math.min(9, 3 + rapid); i++) {
              setTimeout(() => outletNote('pipa', midi + (i % 2 ? 0 : 12), Math.round(vel * (0.8 - i * 0.05)), 200), 80 + i * 60)
            }
          }
        } else if (s.kind === 'kick') {
          outletNote('gu', 40, vel, 600)
          outletNote('luo', midi - 12, vel, 4000)
          outletNote('pipa', midi + 12, vel, 400)
          let t = 240
          for (const gap of [130, 100, 75, 55, 45]) {
            setTimeout(() => outletNote('gu', 96, Math.round(vel * 0.6), 30), t)
            t += gap
          }
          setTimeout(() => outletNote('luo', midi - 5, Math.round(vel * 0.7), 1500), t)
        } else {
          // 撕边一锣
          let t = 0
          for (const gap of [90, 75, 60, 50, 42, 36]) {
            setTimeout(() => outletNote('gu', 96, Math.round(35 + s.force * 40), 30), t)
            t += gap
          }
          setTimeout(() => outletNote('luo', 50, Math.round(50 + s.force * 70), 4000), t)
        }
      } else if (s.kind === 'snap') {
        snapPose(s.force, s.x)
        resolve()
        phraseRef.current.open = false
      } else audioStrike(s.kind, midi, s.force, s.x, rapid, { note, at, downbeat, chain })
    },
    [inMax],
  )

  // every strike — live pose, ghost, pointer or a test harness — lands here
  const landStrike = useCallback(
    (e: StrikeEvent) => {
      if (!gateOpenRef.current) return
      const s: Strike = { kind: e.type, side: e.side, x: e.x, y: e.y, dx: e.dx, dy: e.dy, force: e.force, t: e.t, drive: 0, confidence: e.confidence }
      const rapid = e.rapid
      const gap = e.t - lastStrikeRef.current
      lastStrikeRef.current = e.t
      // ---- the ink first: the seal, the burst, the afterimage, the tally --
      // A strike is seen before it is heard. Nothing below (the phrase
      // engine, the grid, the audio graph) may stop the visual landing, so
      // the visual goes first and the sound is guarded.
      surface.current?.strike(s, glyphFor(e))
      if (s.kind !== 'snap') {
        setHits((h) => h + 1)
        formStrikesRef.current++
      }
      if (e.source !== 'pose' && e.source !== 'ghost') {
        // sources without a body drive the phase glyph themselves
        setPhase('发')
        setTimeout(() => setPhase((p) => (p === '发' ? '收' : p)), 340)
        setTimeout(() => setPhase((p) => (p === '收' ? '势' : p)), 1200)
      }
      try {
        soundStrike(e, s, rapid, gap)
      } catch (err) {
        console.warn('strike sound failed (the ink still landed):', err)
      }
    },
    [soundStrike],
  )

  useEffect(() => onStrike(landStrike), [landStrike])

  const onBody = useCallback(
    (b: BodyState) => {
      const now = performance.now()
      lastBodyRef.current = b
      if (b.present && !bodySeen) setBodySeen(true)
      // the gate: stand in frame and hold still
      if (!gateOpenRef.current) {
        if (b.present && b.stillness > 0.05) {
          if (!gateStartRef.current) gateStartRef.current = now
          const p = Math.min(1, b.stillness / 0.82)
          setGateProgress(p)
          surface.current?.setGate(p, false)
          if (!inMax) {
            void ensureAudio()
            setAudioGate(p)
          }
          if (p >= 1) openGate()
        } else {
          gateStartRef.current = 0
        }
        return
      }
      if (b.phase !== phaseRef.current) {
        phaseRef.current = b.phase
        setPhase(b.phase)
      }
      // combat grammar: the footwork is the band, the guard is the bed
      if (!inMax) {
        // the beds are sound only: never let them take the body path down
        try {
          feedBand(b.footwork, 0.5 + b.lean * 0.3)
          const lw = b.joints.lWrist
          const rw = b.joints.rWrist
          const shY = ((b.joints.lShoulder?.y ?? 0.4) + (b.joints.rShoulder?.y ?? 0.4)) / 2
          const handsUp = [lw, rw].filter((w) => w && !w.held && w.vis > 0.4 && w.y < shY + b.sw * 0.4).length / 2
          setPad(Math.max(b.guard, handsUp * 0.7), 0.5 + b.lean * 0.3, now - lastStrikeRef.current)
          if (b.seize > 0.6) resolve()
        } catch (err) {
          console.warn('band/bed failed:', err)
        }
      }
      // 蓄: a hand drawn back is the breath before the blow
      if (b.windup && !b.gated && now - lastStrikeRef.current > 700) {
        const w = b.windup === 'L' ? b.joints.lWrist : b.joints.rWrist
        if (inMax) outletMessage('windup', b.windup)
        else windup(w?.x ?? 0.5)
      }
      // a turning torso rolls the drum: density from the speed of the turn,
      // only with the body clearly in motion
      // deliberate: the turn must be fast and held for half a second
      if (b.turnRate > 0.75 && b.energy > 0.35 && b.sinceStrike > 500) {
        if (!rollArmRef.current) rollArmRef.current = now
      } else rollArmRef.current = 0
      if (rollArmRef.current && now - rollArmRef.current > 500) {
        rollOnRef.current = true
        if (inMax) {
          if (now - erhuMaxRef.current > 220) {
            erhuMaxRef.current = now
            outletNote('gu', 45, Math.round(30 + b.turnRate * 70), 120)
          }
        } else feedRoll(Math.min(1, (b.turnRate - 0.75) * 4), 0.5 + b.lean * 0.3)
      } else rollOnRef.current = false
      // continuous control stream, ~20 Hz
      if (now - lastCtlSentRef.current > 50) {
        lastCtlSentRef.current = now
        const ctl = {
          width: b.stance,
          root: b.root,
          guard: b.guard,
          breath: b.stillness,
          energy: b.energy,
          lean: b.lean,
          breathSignal: b.breath,
          seize: b.seize,
          footwork: b.footwork,
        }
        setMeters({ stance: b.stance, root: b.root, breath: b.stillness, energy: b.energy })
        setGateState(b.gated ? (b.stillness >= 0.5 ? 'breath' : 'silent') : 'open')
        // side-on, the far arm is a guess: ask for a little more face
        if (b.profile > 0.6) {
          if (!profileSinceRef.current) profileSinceRef.current = now
          if (now - profileSinceRef.current > 1200) setProfileTip(true)
        } else {
          profileSinceRef.current = 0
          setProfileTip(false)
        }
        if (inMax) {
          for (const [k, v] of Object.entries(ctl)) {
            const q = Math.round(v * 100) / 100
            if (Math.abs((lastCtlRef.current[k] ?? -1) - q) >= 0.02) {
              lastCtlRef.current[k] = q
              outletMessage('ctl', k, q)
            }
          }
        } else setAudioBody(ctl)
      }
    },
    [bodySeen, inMax, openGate],
  )

  const onPointerStrike = useCallback((s: Strike) => {
    armAudio()
    void ensureAudio()
    // a flick is intent enough: it opens the gate and lands
    if (!gateOpenRef.current) openGate()
    const now = performance.now()
    pointerPunchesRef.current = pointerPunchesRef.current.filter((t) => now - t < 1200)
    if (s.kind === 'punch') pointerPunchesRef.current.push(now)
    emitStrike({
      type: s.kind,
      side: s.side,
      confidence: s.confidence,
      force: s.force,
      x: s.x,
      y: s.y,
      dx: s.dx,
      dy: s.dy,
      joints: null,
      rapid: pointerPunchesRef.current.length,
      source: 'pointer',
      t: now,
    })
  }, [openGate])

  // ------------------------------------------------------ brushwork --
  // one gesture, one event. The left hand (and the pointer) is the qin: a
  // single pluck when the gesture commits — placed on the next eighth of
  // the phrase pulse — then the string slides (走手音) until the hand stops
  // or reverses sharply, which is a new gesture and a new pluck. The right
  // hand is the erhu: a bow whose pressure is the hand's speed and whose
  // pitch is its height — sound only while it moves. Nothing plucks by
  // distance travelled; nothing sounds for 700 ms after a strike (收).
  const gest = useRef(new Map<number, { last: DrawPoint | null; vx: number; vy: number; lastPluck: number; started: boolean }>())
  const onDrawPoint = useCallback(
    (pointerId: number, _instr: string, p: DrawPoint) => {
      if (!gateOpenRef.current) return
      if (!inMax && !isAwakened()) return
      const now = performance.now()
      if (now - lastStrikeRef.current < 200) return // 收: a beat, at fight speed
      const slot = slotOf(pointerId)
      let g = gest.current.get(pointerId)
      if (!g) {
        g = { last: null, vx: 0, vy: 0, lastPluck: 0, started: false }
        gest.current.set(pointerId, g)
      }
      const midi = scaleDegree(1 - p.y, scaleRef.current, LOW[slot], 2)
      const level = Math.min(1, Math.max(0.05, 0.35 + p.pressure * 0.65))
      // the right hand bows
      if (slot === 1) {
        if (inMax) {
          if (now - g.lastPluck > 350) {
            g.lastPluck = now
            emit({ timeMs: 0, pen: 'erhu', midi, velocity: Math.round(30 + Math.min(1, p.speed / 2.5) * 80), durationMs: 500 }, p.x)
          }
        } else bow(midi, p.speed, p.x)
        g.last = p
        return
      }
      // the left hand / pointer plucks once per gesture
      let reversal = false
      if (g.last) {
        const dx = p.x - g.last.x
        const dy = p.y - g.last.y
        const d = Math.hypot(dx, dy)
        if (d > 1e-4) {
          const nx = dx / d
          const ny = dy / d
          reversal = g.started && nx * g.vx + ny * g.vy < -0.4 && p.speed > 0.9
          g.vx = g.vx * 0.5 + nx * 0.5
          g.vy = g.vy * 0.5 + ny * 0.5
        }
      }
      g.last = p
      const commit = !g.started || (reversal && now - g.lastPluck > 450)
      if (commit) {
        g.started = true
        g.lastPluck = now
        const force = Math.min(1, 0.35 + p.speed * 0.25 + p.pressure * 0.35)
        if (inMax) emit({ timeMs: 0, pen: 'qin', midi, velocity: Math.round(30 + force * 90), durationMs: 1600 }, p.x)
        else brushOnset(slot, 'qin', midi, force, p.x, nextPulseDelay())
        surface.current?.notePulse(pointerId, 0.4 + force * 0.5)
      } else if (!inMax) brushTo(slot, 'qin', midi, level, p.x, p.speed)
    },
    [emit, inMax],
  )

  const onDrawEnd = useCallback(
    (pointerId: number, path?: DrawPoint[]) => {
      const slot = slotOf(pointerId)
      if (slot === 1) erhuEnd()
      else brushEnd(slot)
      gest.current.delete(pointerId)
      if (!path || path.length < 12 || !gateOpenRef.current) return
      // a closed path is answered in 泛音: the harmonics of the pitches it
      // passed through
      let length = 0
      for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
      const closure = Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y)
      if (length < 0.25 || closure > 0.18 * length) return
      const picks = [0.15, 0.5, 0.85].map((f) => path[Math.floor(f * (path.length - 1))])
      const midis = picks.map((q) => scaleDegree(1 - q.y, scaleRef.current, LOW[slot] + 12, 2))
      const x = picks.reduce((a, q) => a + q.x, 0) / picks.length
      if (inMax) midis.forEach((m, i) => setTimeout(() => outletNote('qin', m, 50, 120), i * 160))
      else flageolets(midis, 0.6, x)
    },
    [inMax],
  )

  // the breath follows the slow drift of the tonal centre
  useEffect(() => {
    let last = -1
    const id = setInterval(() => {
      const i = centreIndex(performance.now())
      if (i === last) return
      last = i
      const chord = chordAt(scaleRef.current, i, 48)
      breathPitch(chord[0] + 12)
      setCentre(chord[0])
      if (inMax) outletMessage('centre', chord[0])
    }, 200)
    return () => clearInterval(id)
  }, [inMax])

  useEffect(() => {
    setScaleName(scale)
  }, [scale])

  // ----------------------------------------------------- transport --
  const stop = useCallback(() => {
    setPlaying(false)
    setPlayheadX(null)
    cancelAnimationFrame(rafRef.current)
    if (inMax) outletMessage('transport', 'stop')
  }, [inMax])

  const play = useCallback(() => {
    notesRef.current = strokesToNotes(strokesRef.current, loopMs, scaleRef.current)
    loopMsRef.current = loopMs
    firedRef.current = new Set()
    lastLoopRef.current = 0
    startRef.current = performance.now()
    setPlaying(true)
    if (inMax) outletMessage('transport', 'play')
  }, [loopMs, inMax])

  useEffect(() => {
    if (!playing) return
    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const loopIndex = Math.floor(elapsed / loopMsRef.current)
      const t = elapsed % loopMsRef.current
      if (loopIndex !== lastLoopRef.current) {
        lastLoopRef.current = loopIndex
        firedRef.current = new Set()
        notesRef.current = strokesToNotes(strokesRef.current, loopMsRef.current, scaleRef.current)
      }
      setPlayheadX(t / loopMsRef.current)
      for (const n of notesRef.current) {
        if (!firedRef.current.has(n) && t >= n.timeMs) {
          firedRef.current.add(n)
          emit(n, n.timeMs / loopMsRef.current)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, emit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') (playing ? stop : play)()
      if (e.key === 'r' || e.key === 'R') {
        setStrokes([])
        setHits(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, playing, stop])

  useEffect(() => {
    if (!inMax) return
    bindInlet('play', () => play())
    bindInlet('stop', () => stop())
    bindInlet('clear', () => setStrokes([]))
    bindInlet('tempo', (bpm) => setTempo(Number(bpm) || 96))
    bindInlet('scale', (name) => {
      if (SCALES[String(name)]) setScale(String(name))
    })
    bindInlet('open', () => openGate())
    outletMessage('ready')
  }, [inMax, play, stop, openGate])

  const ph = PHASES[phase]
  return (
    <div className={`app ${gateOpen ? 'open' : 'closed'} ${strokes.length > 0 || hits > 0 ? 'marked' : ''} theme-${theme}`}>
      <InkSurface
        strokes={strokes}
        onStrokesChange={setStrokes}
        playheadX={playheadX}
        penId="qin"
        onDrawPoint={onDrawPoint}
        onDrawEnd={onDrawEnd}
        onPointerStrike={onPointerStrike}
        handleRef={surface}
      />
      <BodyLayer
        surface={surface}
        onBody={onBody}
        open={gateOpen}
        section={form?.index ?? 0}
        pieceSeconds={(form?.elapsed ?? 0) / 1000}
        sectionSeconds={(form?.sectionElapsed ?? 0) / 1000}
      />

      <header className="masthead">
        <h1>nocturne</h1>
        <p className="sub">
          <span className="cjk">拓</span> a rubbing of the body in ink
        </p>
      </header>

      <nav className="form" aria-label="performance form">
        {SECTIONS.map((sec, i) => {
          const active = form?.index === i
          const done = (form?.index ?? -1) > i
          return (
            <div key={sec} className={`form-sec ${active ? 'active' : ''} ${done ? 'done' : ''} ${form?.resting ? 'resting' : ''}`}>
              <span className="form-glyph cjk">{sec}</span>
              <span className="form-word">{SECTION_INFO[sec].pinyin}</span>
              <span className="form-bar">
                <i style={{ transform: `scaleX(${active ? (form?.progress ?? 0).toFixed(3) : done ? 1 : 0})` }} />
              </span>
            </div>
          )
        })}
      </nav>

      {cue && (
        <div key={cue.n} className="cue" aria-hidden>
          <span className="cjk">{cue.section}</span>
        </div>
      )}

      {profileTip && (
        <div className="tip" role="status">
          face the camera a little more — side-on, the far arm is hidden and held
        </div>
      )}

      <aside className={`phase phase-${phase}`} aria-live="polite">
        <span className="phase-glyph">{phase}</span>
        <span className="phase-word">
          {ph.pinyin} · {ph.word}
        </span>
      </aside>

      <footer className="foot">
        <div className="mode">
          <span className="mode-glyph">{MODE_GLYPH[scale] ?? scale.slice(0, 1)}</span>
          <span className="mode-name">
            {scale} · {tempo}
          </span>
          <span className={`gate-ind ${gateState}`} title="expression gate">
            {gateState}
          </span>
          {debugBusy && busy && (
            <span className="gate-ind open" title="phrase · beat">
              phrase {busy.phrase} · beat {busy.beat}
            </span>
          )}
          <div className="meters" aria-hidden>
            {(['stance', 'root', 'breath', 'energy'] as const).map((k) => (
              <span key={k} className="meter" title={k}>
                <i style={{ transform: `scaleX(${Math.max(0.02, meters[k]).toFixed(3)})` }} />
              </span>
            ))}
          </div>
        </div>
        <div className="hints">
          <span>{hits} {hits === 1 ? 'strike' : 'strikes'}</span>
          <span>H {help ? 'close' : 'help'}</span>
          <span>D view</span>
          <span>T {theme === 'ink' ? 'paper' : 'stone'}</span>
          <span>P {playing ? 'stop' : 'loop'}</span>
          <span>R clear</span>
        </div>
      </footer>

      {help && (
        <section className="help" onClick={() => setHelp(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h3>
              <span className="cjk">拓</span> your round is the piece
            </h3>
            <p className="help-note">
              Fight, and it plays — in one key. <b>Punches are phrases</b>: each blow a note in the mode, a combination climbing from the tonic; <b>footwork</b> is a quiet pulse under them; a <b>kick</b> is the section hit; a <b>pause</b> is the barline — the phrase resolves and the next starts on the tonic.
              Two kinds of sound: <b>continuous</b> layers that live only while the movement that carries them is held, and <b>strikes</b> — one gesture, one blow. Small movements do nothing.
            </p>
            <dl>
              <dt className="help-group">continuous — the band</dt>
              <dd />
              <dt>footwork — bounce, shuffle, weight shift</dt>
              <dd>a quiet pulse: the drum and the low string on the downbeats, a sub under it; it moves when you move and coasts when you stop</dd>
              <dt>guard up (hands at the face or above the shoulders)</dt>
              <dd>the bed: a held two-voice drone at the centre of the mode; drops when the hands drop</dd>
              <dt>stand still between bursts</dt>
              <dd>breath — the dizi comes in fast on your out-breath, so a gap is never dead air</dd>
              <dt>spin the torso, fast, and keep it going</dt>
              <dd>the drum rolls, denser with the turn — sway does nothing</dd>
              <dt className="help-group">strikes — notes and hits</dt>
              <dd />
              <dt>a hand drawn back</dt>
              <dd>蓄 — a breath before the blow</dd>
              <dt>punch — the fist driven straight out along the arm, then stopped</dt>
              <dd>a note in the mode, on the beat; the lead hand carries the line, the rear hand sits a fifth below; a fist above the head lifts an octave; a heavy blow is doubled below and lands its full weight. Flaps and chops across the arm are not punches</dd>
              <dt>combination — blows less than a second apart</dt>
              <dd>one phrase: up, up, up, dip — a motif, not a ladder; at the climax three in a row spin the pipa wheel (轮指)</dd>
              <dt>a second of quiet</dt>
              <dd>the barline: a soft gong, the bed settles on the root, the next phrase starts from the tonic</dd>
              <dt>kick</dt>
              <dd>the chorus hit: the heavy blow, the great drum, the great gong, and a chord leaping a register above the band; the curtain tears</dd>
              <dt>freeze, clinch, 亮相</dt>
              <dd>撕边一锣, the bed settles on the root, the band ducks — the phrase ends</dd>
              <dt className="help-group">the room (quiet, continuous)</dt>
              <dd />
              <dt>stance width · crouch · lean</dt>
              <dd>stereo width · depth of the hall · pan</dd>
              <dt>side-on to the camera</dt>
              <dd>the far arm is hidden and held where it was — face the camera a little more</dd>
              <dt>a slow raised hand (left qin, right erhu)</dt>
              <dd>the old brushwork is still there for anyone who wants it — the round does not need it</dd>
            </dl>
            <p className="help-keys">
              <b>H</b> help · <b>D</b> tracking view · <b>T</b> paper / stone · <b>P</b> loop the marks · <b>R</b> clear · <b>Enter</b> open the gate
            </p>
            <p className="help-form">
              A session is a piece in four parts — 起 opening · 承 carrying · 转 turning · 合 closing — shown at the top. The opening holds strikes back; the turn lets everything through.
            </p>
          </div>
        </section>
      )}

      {!gateOpen && (
        <section className="gate" style={{ '--p': gateProgress } as React.CSSProperties}>
          <div className="gate-ring" />
          <div className="gate-line" />
          <h2>
            <span className="cjk">立</span>
          </h2>
          <p className="gate-instruction">
            {bodySeen
              ? 'stand. let the arms hang. hold still for a breath — then fight: your round is the piece.'
              : 'step back until the whole body is in frame — or hold the pointer.'}
          </p>
          <ul className="gate-legend">
            <li><b>footwork</b> the band</li>
            <li><b>guard up</b> the bed</li>
            <li><b>punch</b> a note and a blow</li>
            <li><b>kick</b> the hit</li>
            <li><b>freeze</b> the phrase ends</li>
            <li><b>H</b> for the whole legend</li>
          </ul>
        </section>
      )}
    </div>
  )
}
