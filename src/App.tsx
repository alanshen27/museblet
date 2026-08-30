import { useCallback, useEffect, useRef, useState } from 'react'
import DrawSurface, { type DrawHandle } from './DrawSurface'
import HandLayer from './HandLayer'
import { glideStop, glideTo, playBellTree, playNote } from './audio'
import { bindInlet, isMax, outletMessage, outletNote } from './max'
import { SCALES, strokesToNotes, type NoteEvent, type Stroke } from './music'
import { chordAt, snapToChord } from './harmony'
import { pieceState, type Material } from './composition'
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

  const lastDrawRef = useRef(0)
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo
  const barMs = () => (60000 / tempoRef.current) * 2
  // harmony breathes slowly: each chord holds for two bars so the room
  // never feels like it's chasing changes
  const chordIndex = (now: number) => Math.floor(now / (barMs() * 2))

  // ---- the piece: screen as 3D space, sound as materials, time composed --
  // X = pitch (right high, left low), Y = volume (higher hand = louder),
  // Z = hand size / depth (near = bright + dry, far = dark + reverberant).
  // Each hand slot speaks one material — point, line, or plane — chosen by
  // the composed section timeline in composition.ts. The clock starts on
  // the first mark; press R to start the piece over.
  const pieceStartRef = useRef<number | null>(null)
  const [hud, setHud] = useState<{ label: string; progress: number } | null>(null)
  // each material has one voice/timbre so the sound image stays legible
  const MAT_PEN: Record<Material, string> = {
    line: 'velvet',
    point: 'ember',
    plane: 'crystal',
  }
  // per-pointer performance state: which hand slot it occupies, the
  // material it spoke last frame, and its last grain/strum time
  const perfRef = useRef(
    new Map<number, { slot: number; lastMat: Material | null; lastHit: number }>(),
  )
  const slotOf = (pointerId: number) => {
    let s = perfRef.current.get(pointerId)
    if (!s) {
      const used = new Set([...perfRef.current.values()].map((v) => v.slot))
      s = { slot: used.has(0) ? 1 : 0, lastMat: null, lastHit: 0 }
      perfRef.current.set(pointerId, s)
    }
    return s
  }
  // X axis → scale-quantized pitch above a per-slot floor (Stolet's
  // Kinetic layout: one hand the low voice, the other the high one)
  const xToMidi = (x: number, low: number) => {
    const sc = SCALES[scaleRef.current] ?? SCALES.pentatonic
    const span = sc.length * 3
    const idx = Math.min(span - 1, Math.max(0, Math.floor(x * span)))
    return low + Math.floor(idx / sc.length) * 12 + sc[idx % sc.length]
  }

  const onDrawPoint = useCallback(
    (
      pointerId: number,
      _pen: string,
      p: { x: number; y: number; pressure: number; speed: number; z?: number },
    ) => {
      const now = performance.now()
      lastDrawRef.current = now
      if (pieceStartRef.current === null) pieceStartRef.current = now
      const st = pieceState(now - pieceStartRef.current)
      if (st.fade <= 0) return // the piece has ended in silence
      const pf = slotOf(pointerId)
      const material = st.materials[Math.min(pf.slot, 1)]
      // a hand changing material lets go of its sustained line first
      if (pf.lastMat === 'line' && material !== 'line') glideStop(pointerId)
      pf.lastMat = material

      // the 3D reading of the gesture
      const vol = Math.min(1, Math.max(0, 1 - p.y)) // Y: higher = louder
      const z = p.z ?? 0.5 // Z: hand size = depth
      const midi = xToMidi(p.x, pf.slot === 0 ? 31 : 53) // X: pitch
      const cutoff = 250 + z * 4200 // near = bright
      const wet = 0.2 + (1 - z) * 0.9 // far = sunk in reverb
      const fade = st.fade

      if (material === 'line') {
        // line: one continuous voice per hand — the gesture IS the sound
        if (!inMax) {
          glideTo(
            pointerId,
            MAT_PEN.line,
            midi,
            (0.02 + vol * 0.12) * fade,
            cutoff,
            wet,
          )
        } else if (now - pf.lastHit > 300) {
          pf.lastHit = now
          emit({
            timeMs: 0,
            pen: MAT_PEN.line,
            midi,
            velocity: Math.round((12 + vol * 46) * fade),
            durationMs: 700,
          })
        }
        surfaceHandle.current?.notePulse(pointerId, 0.25 + vol * 0.3)
        return
      }

      if (material === 'point') {
        // point: grains — short hits whose density grows with loudness
        // and hand energy
        const gap = 320 - vol * 180 - Math.min(0.5, p.speed) * 120
        if (now - pf.lastHit < Math.max(70, gap)) return
        pf.lastHit = now
        emit({
          timeMs: 0,
          pen: MAT_PEN.point,
          midi,
          velocity: Math.round((18 + vol * 58) * fade),
          durationMs: 140,
        })
        surfaceHandle.current?.notePulse(pointerId, 0.5 + vol * 0.5)
        return
      }

      // plane: a bell tree — the chord rippled top-down as a cascade of
      // tiny chimes, like a hand sweeping through hanging bells
      if (now - pf.lastHit < 900) return
      pf.lastHit = now
      const chord = chordAt(scaleRef.current, chordIndex(now))
      const root = snapToChord(midi, chord)
      const tones: number[] = []
      for (const [i, off] of [16, 12, 7, 4, 0, -5].entries()) {
        tones[i] = snapToChord(root + off, chord)
      }
      const velocity = Math.round((14 + vol * 42) * fade)
      if (!inMax) {
        playBellTree(tones, velocity)
      } else {
        tones.forEach((t, i) => {
          setTimeout(
            () =>
              emit({
                timeMs: 0,
                pen: MAT_PEN.plane,
                midi: t,
                velocity,
                durationMs: 500,
              }),
            i * 85,
          )
        })
      }
      surfaceHandle.current?.notePulse(pointerId, 0.7 + vol * 0.3)
    },
    [emit, inMax],
  )

  const onDrawEnd = useCallback((pointerId: number) => {
    glideStop(pointerId)
    perfRef.current.delete(pointerId)
  }, [])

  // the piece clock: drive the section HUD, and R restarts the work
  useEffect(() => {
    const id = setInterval(() => {
      if (pieceStartRef.current === null) return
      const st = pieceState(performance.now() - pieceStartRef.current)
      setHud({ label: st.label, progress: st.progress })
    }, 250)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        pieceStartRef.current = null
        setHud(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

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

  // a whisper of a bed: a single low root, quiet, so the point/line/plane
  // materials stay the foreground image
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
      const dur = barMs() * 2 * 1.3
      emit({
        timeMs: 0,
        pen: 'velvet',
        midi: chord[0] - 12,
        velocity: 14,
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
        {hud && (
          <div className="piece-hud" aria-hidden>
            <span className="piece-hud-label">{hud.label}</span>
            <span className="piece-hud-bar">
              <span
                className="piece-hud-fill"
                style={{ width: `${Math.round(hud.progress * 100)}%` }}
              />
            </span>
          </div>
        )}
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
