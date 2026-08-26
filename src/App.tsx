import { useCallback, useEffect, useRef, useState } from 'react'
import DrawSurface, { type DrawHandle } from './DrawSurface'
import HandLayer from './HandLayer'
import { glideStop, glideTo, playNote } from './audio'
import { bindInlet, isMax, outletMessage, outletNote } from './max'
import { SCALES, strokesToNotes, type NoteEvent, type Stroke } from './music'
import { chordAt, snapToChord } from './harmony'
import { classifyStroke, type Gesture } from './gestures'
import { type PenId } from './pens'
// PENS import is only needed by the commented-out dock
// import { PENS, type PenId } from './pens'
import './App.css'

export default function App() {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [playing, setPlaying] = useState(false)
  const [tempo, setTempo] = useState(120)
  const [scale, setScale] = useState('minor')
  // dock (bottom bar) commented out — Tab no longer summons it
  // const [dockOpen, setDockOpen] = useState(false)
  const [penId] = useState<PenId>('neon')
  // setPenId lives on the commented-out dock; fist wheel still switches pens per hand
  const [playheadX, setPlayheadX] = useState<number | null>(null)
  const inMax = isMax()

  const notesRef = useRef<NoteEvent[]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const loopMsRef = useRef(0)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const lastLoopRef = useRef(-1)
  const firedRef = useRef<Set<NoteEvent>>(new Set())

  const loopMs = (60000 / tempo) * 8 // 8 beats per loop

  const emit = useCallback(
    (n: NoteEvent) => {
      if (inMax) outletNote(n.pen, n.midi, n.velocity, n.durationMs)
      else playNote(n.pen, n.midi, n.velocity, n.durationMs)
    },
    [inMax],
  )

  // live performance: the surface sings under the pen while drawing.
  // Instead of playing raw y-positions (which reads as scale-running),
  // the pen plays a repeating melodic cell of chord tones: y picks the
  // register, the cell supplies the phrase, and triggers land on an
  // eighth-note grid so it feels composed rather than glissando.
  const liveRef = useRef({ t: 0, midi: -1, step: 0 })
  const lastDrawRef = useRef(0)
  // hold detection: a pen parked in one spot becomes a pulsing lead
  const holdRef = useRef(
    new Map<number, { x: number; y: number; since: number; step: number; lastT: number }>(),
  )
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo
  const barMs = () => (60000 / tempoRef.current) * 2
  // harmony breathes slowly: each chord holds for two bars so the room
  // never feels like it's chasing changes
  const chordIndex = (now: number) => Math.floor(now / (barMs() * 2))

  const onDrawPoint = useCallback(
    (
      pointerId: number,
      pen: string,
      p: { x: number; y: number; pressure: number; speed: number },
    ) => {
      const now = performance.now()
      lastDrawRef.current = now
      // pulsing lead: parking the pen turns wandering ambience into a
      // rhythmic throb on chord tones — dotted pattern, swelling as the
      // hold goes on, the fingertip orb beating with every hit
      const hold = holdRef.current.get(pointerId) ?? {
        x: p.x,
        y: p.y,
        since: now,
        step: 0,
        lastT: 0,
      }
      if (Math.hypot(p.x - hold.x, p.y - hold.y) > 0.03) {
        hold.x = p.x
        hold.y = p.y
        hold.since = now
        hold.step = 0
      }
      holdRef.current.set(pointerId, hold)
      if (now - hold.since > 450) {
        const gap16 = barMs() / 16
        if (now - hold.lastT >= gap16) {
          hold.lastT = now
          // dotted 16th pattern over chord degrees; -1 = rest.
          // reads as a lead line, not a metronome
          const PATTERN = [0, -1, 2, 0, -1, 3, 1, -1, 2, -1, 0, 3, 1, -1, 2, -1]
          const slot = hold.step++ % PATTERN.length
          const deg = PATTERN[slot]
          if (deg >= 0) {
            const chord = chordAt(scaleRef.current, chordIndex(now))
            const register = Math.round((1 - p.y) * 2)
            const midi =
              chord[deg % chord.length] + register * 12 + (deg >= chord.length ? 12 : 0)
            const swell = Math.min(1, (now - hold.since) / 4000)
            const velocity = Math.round(
              18 + p.pressure * 26 + swell * 36 + (slot === 0 ? 14 : 0),
            )
            emit({ timeMs: 0, pen, midi, velocity, durationMs: gap16 * 1.7 })
            surfaceHandle.current?.notePulse(
              pointerId,
              0.4 + swell * 0.4 + (slot === 0 ? 0.2 : 0),
            )
          }
        }
        return
      }
      const live = liveRef.current
      const energyNow = Math.min(1, p.speed * 1.1)
      // continuous gesture voice (browser mode): one sustained tone per
      // finger that glides between chord tones — the melody is a line,
      // not fragments. Max mode keeps the discrete note protocol below.
      if (!inMax) {
        const chordNow = chordAt(scaleRef.current, chordIndex(now))
        const glideMidi = snapToChord(
          Math.round(48 + (1 - p.y) * 30),
          chordNow,
        )
        glideTo(
          pointerId,
          pen,
          glideMidi,
          0.04 + p.pressure * 0.08 + energyNow * 0.05,
        )
      }
      // note density follows the hand's energy: fast sweeps play dense
      // sixteenth runs, slow drags leave long spacious notes
      const energy = energyNow
      const gap = (barMs() / 8) * (3.5 - energy * 2.8) // spacious .. sixteenth
      if (now - live.t < gap) return
      live.step++
      const chord = chordAt(scaleRef.current, chordIndex(now))
      // lyrical cell over chord tones: rises, breathes, resolves
      const cell = [0, 2, 1, 3, 2, 1]
      const tone = chord[cell[live.step % cell.length] % chord.length]
      // y picks the register (two octaves of range), never the raw pitch
      const register = Math.round((1 - p.y) * 2)
      let midi = tone + register * 12
      midi = snapToChord(midi, chord)
      if (live.midi >= 0) {
        while (midi - live.midi > 7) midi -= 12
        while (live.midi - midi > 7) midi += 12
      }
      if (midi === live.midi && now - live.t < gap * 2) return
      live.midi = midi
      live.t = now
      // in the browser the glide voice carries the melody; these discrete
      // notes are soft harp-like accents on top (and the whole line in Max)
      const velocity = Math.round(
        (inMax ? 24 : 12) + p.pressure * 24 + energy * 24,
      )
      const durationMs = gap * 1.8 + 200
      emit({ timeMs: 0, pen, midi, velocity, durationMs })
      surfaceHandle.current?.notePulse(pointerId, 0.3 + energy * 0.4)
      // memory echoes: each phrase softly re-sings itself a bar later and
      // again two bars on — a fading canon of what the hand just played,
      // re-snapped to whatever chord holds when the echo lands
      for (const [delay, fade] of [
        [barMs(), 0.45],
        [barMs() * 2, 0.2],
      ] as const) {
        window.setTimeout(() => {
          const c = chordAt(scaleRef.current, chordIndex(performance.now()))
          emit({
            timeMs: 0,
            pen,
            midi: snapToChord(midi, c),
            velocity: Math.max(6, Math.round(velocity * fade)),
            durationMs: durationMs * 1.4,
          })
        }, delay)
      }
    },
    [emit, inMax],
  )

  // the drawing language: a finished mark is read as a musical word and
  // answered with a phrase — shapes mean something, not just where the
  // hand happened to wander
  const playPhrase = useCallback(
    (gst: Gesture, pen: string, pointerId: number) => {
      const eighth = () => barMs() / 8
      const sixteenth = () => barMs() / 16
      // y places the register: higher on screen = higher notes
      const regMidi = (y: number) => 48 + Math.round((1 - y) * 24)
      const schedule = (
        delay: number,
        midi: number,
        velocity: number,
        durationMs: number,
        pulse = 0,
      ) => {
        window.setTimeout(() => {
          const c = chordAt(scaleRef.current, chordIndex(performance.now()))
          emit({
            timeMs: 0,
            pen,
            midi: snapToChord(midi, c),
            velocity,
            durationMs,
          })
          if (pulse > 0) surfaceHandle.current?.notePulse(pointerId, pulse)
        }, delay)
      }
      const vel = Math.round(40 + gst.avgPressure * 40)
      switch (gst.shape) {
        case 'dot': {
          // a tap is an accent: one bright hit with a sub-octave shadow
          schedule(0, regMidi(gst.midY), vel + 30, eighth() * 2, 1)
          schedule(0, regMidi(gst.midY) - 12, Math.round(vel * 0.5), eighth() * 2)
          break
        }
        case 'line': {
          // a level stroke is a drone: root + fifth + sub held two bars
          const root = regMidi(gst.midY)
          schedule(0, root, 26, barMs() * 2, 0.6)
          schedule(0, root + 7, 18, barMs() * 2)
          schedule(0, root - 12, 22, barMs() * 2)
          break
        }
        case 'rise':
        case 'fall': {
          // a climbing/descending stroke is a lead run between its own
          // endpoints — syncopated skips and an octave pop at the top,
          // not a straight scale ladder; drawing speed sets the rate
          const n = Math.max(5, Math.min(9, Math.round(gst.length * 12)))
          const from = regMidi(gst.y0)
          const to = regMidi(gst.y1)
          const SKIP = [0, 4, 2, 7, 5, 9, 7, 12, 11]
          const fast = gst.avgSpeed > 0.6
          let t = 0
          for (let i = 0; i < n; i++) {
            const frac = i / (n - 1)
            const base = from + (to - from) * frac
            const midi = Math.round(base) + (SKIP[i % SKIP.length] % 5) - 2
            const accent = i === 0 || i === n - 1
            schedule(
              t,
              i === n - 1 ? to + (gst.shape === 'rise' ? 12 : -12) : midi,
              accent ? vel + 24 : vel,
              eighth() * 1.6,
              accent ? 1 : 0.5,
            )
            // swung timing: long-short pairs
            t += (fast ? sixteenth() : eighth()) * (i % 2 === 0 ? 1.3 : 0.7)
          }
          break
        }
        case 'circle': {
          // a closed loop is an ostinato: a four-note motif cycling three
          // times, accented on the one, last note held
          const root = regMidi(gst.midY)
          const MOTIF = [0, 7, 3, 10]
          let t = 0
          for (let cycle = 0; cycle < 3; cycle++) {
            for (let i = 0; i < MOTIF.length; i++) {
              const last = cycle === 2 && i === MOTIF.length - 1
              schedule(
                t,
                root + MOTIF[i],
                i === 0 ? vel + 20 : vel - 6,
                last ? barMs() : eighth() * 1.4,
                i === 0 ? 0.9 : 0.4,
              )
              t += eighth()
            }
          }
          break
        }
        case 'zigzag': {
          // switchbacks are rhythm: eight driving sixteenths alternating
          // root and fifth with a 3-3-2 accent pattern
          const root = regMidi(gst.midY)
          const ACCENT = [1, 0, 0, 1, 0, 0, 1, 0]
          for (let i = 0; i < 8; i++) {
            schedule(
              i * sixteenth(),
              i % 2 === 0 ? root : root + 7,
              ACCENT[i] ? vel + 26 : vel - 10,
              sixteenth() * 1.5,
              ACCENT[i] ? 0.9 : 0.35,
            )
          }
          break
        }
      }
    },
    [emit],
  )

  const onDrawEnd = useCallback(
    (
      pointerId: number,
      path?: { x: number; y: number; pressure: number; speed: number }[],
      pen?: string,
    ) => {
      glideStop(pointerId)
      holdRef.current.delete(pointerId)
      if (!path || path.length < 2 || !pen) return
      playPhrase(classifyStroke(path), pen, pointerId)
    },
    [playPhrase],
  )

  // hand tracking: on by default. Camera-tracked fingertips as input
  // (touch/mouse stay as fallback). Dock ✋ toggle is with the bottom bar.
  const surfaceHandle = useRef<DrawHandle | null>(null)
  const [handsOn] = useState(true)

  // useEffect(() => {
  //   const onKey = (e: KeyboardEvent) => {
  //     if (e.key === 'Tab') {
  //       e.preventDefault()
  //       setDockOpen((v) => !v)
  //     }
  //   }
  //   window.addEventListener('keydown', onKey)
  //   return () => window.removeEventListener('keydown', onKey)
  // }, [])

  // harmonic bed: soft pad chords + bass root underneath, while playing
  // or while the pen is moving
  useEffect(() => {
    let lastBar = -1
    const id = setInterval(() => {
      const now = performance.now()
      const active = playing || now - lastDrawRef.current < 5000
      if (!active) return
      const bar = chordIndex(now)
      if (bar === lastBar) return
      lastBar = bar
      const chord = chordAt(scaleRef.current, bar)
      // pads overlap into the next change so the bed never gaps
      const dur = barMs() * 2 * 1.3
      // open voicing: root + fifth low, colour tone floated an octave up
      emit({ timeMs: 0, pen: 'velvet', midi: chord[0], velocity: 20, durationMs: dur })
      emit({ timeMs: 0, pen: 'velvet', midi: chord[2], velocity: 18, durationMs: dur })
      emit({
        timeMs: 0,
        pen: 'velvet',
        midi: chord[1] + 12,
        velocity: 14,
        durationMs: dur,
      })
      // the 7th floats highest and quietest: colour, not clutter
      emit({
        timeMs: 0,
        pen: 'velvet',
        midi: chord[3] + 12,
        velocity: 10,
        durationMs: dur,
      })
      emit({
        timeMs: 0,
        pen: 'velvet',
        midi: chord[0] - 24,
        velocity: 26,
        durationMs: dur,
      })
    }, 120)
    return () => clearInterval(id)
  }, [playing, emit])

  const stop = useCallback(() => {
    setPlaying(false)
    setPlayheadX(null)
    cancelAnimationFrame(rafRef.current)
    if (inMax) outletMessage('transport', 'stop')
  }, [inMax])

  const play = useCallback(() => {
    notesRef.current = strokesToNotes(strokesRef.current, loopMs, scale)
    loopMsRef.current = loopMs
    firedRef.current = new Set()
    lastLoopRef.current = 0
    startRef.current = performance.now()
    setPlaying(true)
    if (inMax) outletMessage('transport', 'play')
  }, [loopMs, scale, inMax])

  useEffect(() => {
    if (!playing) return
    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const loopIndex = Math.floor(elapsed / loopMsRef.current)
      const t = elapsed % loopMsRef.current
      if (loopIndex !== lastLoopRef.current) {
        lastLoopRef.current = loopIndex
        firedRef.current = new Set()
        notesRef.current = strokesToNotes(
          strokesRef.current,
          loopMsRef.current,
          scaleRef.current,
        )
      }
      setPlayheadX(t / loopMsRef.current)
      for (const n of notesRef.current) {
        if (!firedRef.current.has(n) && t >= n.timeMs) {
          firedRef.current.add(n)
          emit(n)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, emit])

  useEffect(() => {
    if (!inMax) return
    bindInlet('play', () => play())
    bindInlet('stop', () => stop())
    bindInlet('clear', () => setStrokes([]))
    bindInlet('tempo', (bpm) => setTempo(Number(bpm) || 120))
    bindInlet('scale', (name) => {
      if (SCALES[String(name)]) setScale(String(name))
    })
    outletMessage('ready')
  }, [inMax, play, stop])

  return (
    <div className="app">
      <main>
        <DrawSurface
          strokes={strokes}
          onStrokesChange={setStrokes}
          playheadX={playheadX}
          penId={penId}
          onDrawPoint={onDrawPoint}
          onDrawEnd={onDrawEnd}
          handleRef={surfaceHandle}
        />
        {handsOn && <HandLayer surface={surfaceHandle} />}
      </main>
      {/* bottom bar
      {dockOpen && (
      <nav className="dock">
        {PENS.map((p) => (
          <button
            key={p.id}
            className={`pen-dot-btn ${p.id === penId ? 'selected' : ''}`}
            style={{ '--pen-color': p.color } as React.CSSProperties}
            onClick={() => setPenId(p.id)}
            aria-label={p.name}
          />
        ))}
        <span className="dock-sep" />
        <button
          className={`hand-btn ${handsOn ? 'selected' : ''}`}
          onClick={() => setHandsOn((v) => !v)}
          aria-label="hand tracking"
          title="hand tracking"
        >
          ✋
        </button>
        <span className="dock-sep" />
        <input
          className="tempo"
          type="range"
          min={40}
          max={240}
          value={tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          aria-label="tempo"
        />
        <select
          className="scale"
          value={scale}
          onChange={(e) => setScale(e.target.value)}
          aria-label="scale"
        >
          {Object.keys(SCALES).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </nav>
      )}
      */}
    </div>
  )
}
