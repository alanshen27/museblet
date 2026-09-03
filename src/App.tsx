import { useCallback, useEffect, useRef, useState } from 'react'
import InkSurface, { type DrawHandle, type DrawPoint } from './InkSurface'
import BodyLayer, { LEFT_HAND, RIGHT_HAND } from './BodyLayer'
import {
  armAudio,
  breathPitch,
  brushEnd,
  brushTo,
  ensureAudio,
  gateComplete,
  isAwakened,
  playNote,
  sectionCue,
  setBody as setAudioBody,
  setGate as setAudioGate,
  setScaleName,
  setSection as setAudioSection,
  strike as audioStrike,
} from './audio'
import { PerformanceForm, SECTION_INFO, SECTIONS, type FormState } from './performance'
import { bindInlet, isMax, outletMessage, outletNote } from './max'
import { DEFAULT_SCALE, MODE_GLYPH, SCALES, scaleDegree, strokesToNotes, type NoteEvent, type Stroke } from './music'
import { chordAt } from './harmony'
import type { BodyState, Phase, Strike } from './sanda'
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
      setForm(st)
      surface.current?.setMood({ density: st.density, section: st.index, breath: b?.breath ?? 0, lean: b?.lean ?? 0 })
      if (inMax) {
        if (st.changed) outletMessage('section', st.section, st.index, st.resting ? 1 : 0)
      } else {
        setAudioSection(st.index, st.density)
        if (st.changed && !st.resting) sectionCue(st.index)
      }
      if (st.changed && !st.resting) setCue((c) => ({ section: st.section, n: (c?.n ?? 0) + 1 }))
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
  const glyphFor = (s: Strike, rapid: number) => {
    if (s.kind === 'kick') return '起势'
    if (rapid >= 3) return '连'
    if (s.force > 0.8) return '发'
    return '打'
  }

  const landStrike = useCallback(
    (s: Strike, rapid: number) => {
      if (!gateOpenRef.current) return
      // pitch from height: high strikes ring high
      const midi = scaleDegree(1 - s.y, scaleRef.current, s.kind === 'kick' ? 43 : 55, 2)
      const vel = Math.round(40 + s.force * 87)
      surface.current?.strike(s, glyphFor(s, rapid))
      setHits((h) => h + 1)
      formStrikesRef.current++
      if (inMax) {
        outletMessage('strike', s.kind, midi, vel, Number(s.x.toFixed(3)), Number(s.y.toFixed(3)), rapid)
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
        } else {
          outletNote('gu', 40, vel, 600)
          outletNote('luo', midi - 12, vel, 4000)
          outletNote('pipa', midi + 12, vel, 400)
          let t = 240
          for (const gap of [130, 100, 75, 55, 45]) {
            setTimeout(() => outletNote('gu', 96, Math.round(vel * 0.6), 30), t)
            t += gap
          }
          setTimeout(() => outletNote('luo', midi - 5, Math.round(vel * 0.7), 1500), t)
        }
      } else {
        audioStrike(s.kind, midi, s.force, s.x, rapid)
      }
    },
    [inMax],
  )

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
      for (const s of b.strikes) landStrike(s, b.rapid)

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
        }
        setMeters({ stance: b.stance, root: b.root, breath: b.stillness, energy: b.energy })
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
    [bodySeen, inMax, landStrike, openGate],
  )

  const onPointerStrike = useCallback(
    (s: Strike) => {
      void ensureAudio()
      if (!gateOpenRef.current) return
      const now = performance.now()
      pointerPunchesRef.current = pointerPunchesRef.current.filter((t) => now - t < 1200)
      if (s.kind === 'punch') pointerPunchesRef.current.push(now)
      landStrike(s, pointerPunchesRef.current.length)
      setPhase('发')
      setTimeout(() => setPhase((p) => (p === '发' ? '收' : p)), 340)
      setTimeout(() => setPhase((p) => (p === '收' ? '势' : p)), 1200)
    },
    [landStrike],
  )

  // ------------------------------------------------------ brushwork --
  const lastMaxNote = useRef<Record<number, { t: number; midi: number }>>({})

  const onDrawPoint = useCallback(
    (pointerId: number, instr: string, p: DrawPoint) => {
      if (!gateOpenRef.current) return
      if (!inMax && !isAwakened()) return
      const slot = slotOf(pointerId)
      const midi = scaleDegree(p.x, scaleRef.current, LOW[slot], 2)
      const level = Math.min(1, Math.max(0.05, (1 - p.y) * 0.8 + p.pressure * 0.3))
      if (inMax) {
        const last = lastMaxNote.current[slot]
        const now = performance.now()
        if (!last || last.midi !== midi || now - last.t > 900) {
          lastMaxNote.current[slot] = { t: now, midi }
          emit({ timeMs: 0, pen: instr, midi, velocity: Math.round(30 + level * 70), durationMs: 1200 }, p.x)
        }
      } else {
        brushTo(slot, instr === 'pipa' ? 'pipa' : 'qin', midi, level, p.x, p.speed)
      }
      surface.current?.notePulse(pointerId, 0.3 + level * 0.4)
    },
    [emit, inMax],
  )

  const onDrawEnd = useCallback((pointerId: number) => {
    brushEnd(slotOf(pointerId))
  }, [])

  // the breath follows the slow drift of the tonal centre
  useEffect(() => {
    let last = -1
    const id = setInterval(() => {
      const i = centreIndex(performance.now())
      if (i === last) return
      last = i
      const chord = chordAt(scaleRef.current, i, 48)
      breathPitch(chord[0] + 12)
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
    <div className={`app ${gateOpen ? 'open' : 'closed'}`}>
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
          <span>D view</span>
          <span>P {playing ? 'stop' : 'loop'}</span>
          <span>R clear</span>
        </div>
      </footer>

      {!gateOpen && (
        <section className="gate" style={{ '--p': gateProgress } as React.CSSProperties}>
          <div className="gate-ring" />
          <div className="gate-line" />
          <h2>
            <span className="cjk">立</span>
          </h2>
          <p className="gate-instruction">
            {bodySeen
              ? 'stand. let the arms hang. hold still for a breath.'
              : 'step back until the whole body is in frame — or hold the pointer.'}
          </p>
          <p className="gate-legend">
            slow hands brush the qin · a fast fist lands 八答仓 · a kick tears the curtain
          </p>
        </section>
      )}
    </div>
  )
}
