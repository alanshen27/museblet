import { useCallback, useEffect, useRef, useState } from 'react'
import DrawSurface from './DrawSurface'
import { playNote } from './audio'
import { bindInlet, isMax, outletMessage, outletNote } from './max'
import { SCALES, strokesToNotes, type NoteEvent, type Stroke } from './music'
import { chordAt, snapToChord } from './harmony'
import { PENS, type PenId } from './pens'
import './App.css'

export default function App() {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [playing, setPlaying] = useState(false)
  const [tempo, setTempo] = useState(120)
  const [scale, setScale] = useState('pentatonic')
  const [penId, setPenId] = useState<PenId>('neon')
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
  const tempoRef = useRef(tempo)
  tempoRef.current = tempo
  const barMs = () => (60000 / tempoRef.current) * 2

  const onDrawPoint = useCallback(
    (p: { x: number; y: number; pressure: number }) => {
      const now = performance.now()
      lastDrawRef.current = now
      const live = liveRef.current
      // quantize triggers to an eighth-note grid (min a full eighth apart)
      const eighth = barMs() / 4
      if (now - live.t < eighth) return
      // rest roughly every third slot: phrases need air
      live.step++
      if (live.step % 3 === 2) {
        live.t = now
        return
      }
      const chord = chordAt(scaleRef.current, Math.floor(now / barMs()))
      // melodic cell over chord tones: root -> third -> fifth -> third
      const cell = [0, 1, 2, 1]
      const tone = chord[cell[live.step % cell.length] % chord.length]
      // y picks the register (two octaves of range), never the raw pitch
      const register = Math.round((1 - p.y) * 2)
      let midi = tone + register * 12
      midi = snapToChord(midi, chord)
      if (live.midi >= 0) {
        while (midi - live.midi > 7) midi -= 12
        while (live.midi - midi > 7) midi += 12
      }
      if (midi === live.midi && now - live.t < eighth * 2) return
      live.midi = midi
      live.t = now
      const velocity = Math.round(24 + p.pressure * 46)
      emit({ timeMs: 0, pen: penId, midi, velocity, durationMs: 520 })
    },
    [penId, emit],
  )

  // harmonic bed: soft pad chords + bass root underneath, while playing
  // or while the pen is moving
  useEffect(() => {
    let lastBar = -1
    const id = setInterval(() => {
      const now = performance.now()
      const active = playing || now - lastDrawRef.current < 5000
      if (!active) return
      const bar = Math.floor(now / barMs())
      if (bar === lastBar) return
      lastBar = bar
      const chord = chordAt(scaleRef.current, bar)
      const dur = barMs() * 1.4
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
      emit({
        timeMs: 0,
        pen: 'ember',
        midi: chord[0] - 24,
        velocity: 30,
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
        />
      </main>
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
          className={`glyph ${playing ? 'active' : ''}`}
          onClick={playing ? stop : play}
          aria-label={playing ? 'stop' : 'play'}
        >
          {playing ? '■' : '▶'}
        </button>
        <button
          className="glyph"
          onClick={() => setStrokes([])}
          aria-label="clear"
        >
          ✕
        </button>
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
    </div>
  )
}
