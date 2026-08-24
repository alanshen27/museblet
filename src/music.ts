export interface Point {
  x: number
  y: number
  pressure: number
}

export interface Stroke {
  points: Point[]
  pen: string
  bornAt: number
}

export interface NoteEvent {
  timeMs: number
  pen: string
  midi: number
  velocity: number
  durationMs: number
}

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

const LOW_MIDI = 36 // C2
const OCTAVES = 4

/** Map a normalized y (0 = top, 1 = bottom) to a scale-quantized MIDI note. */
export function yToMidi(yNorm: number, scaleName: string): number {
  const scale = SCALES[scaleName] ?? SCALES.pentatonic
  const steps = scale.length * OCTAVES
  const idx = Math.min(steps - 1, Math.max(0, Math.floor((1 - yNorm) * steps)))
  const octave = Math.floor(idx / scale.length)
  return LOW_MIDI + octave * 12 + scale[idx % scale.length]
}

/**
 * Convert strokes into a note sequence. x maps to time across one loop,
 * y maps to pitch, pressure/speed maps to velocity. Consecutive points on
 * the same quantized step merge into one sustained note.
 */
export function strokesToNotes(
  strokes: Stroke[],
  loopMs: number,
  scaleName: string,
  stepsPerLoop = 32,
): NoteEvent[] {
  const stepMs = loopMs / stepsPerLoop
  const notes: NoteEvent[] = []

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    let current: NoteEvent | null = null
    let lastStep = -1

    for (const p of stroke.points) {
      const step = Math.min(
        stepsPerLoop - 1,
        Math.max(0, Math.floor(p.x * stepsPerLoop)),
      )
      const midi = yToMidi(p.y, scaleName)
      const velocity = Math.round(50 + p.pressure * 77)

      if (current && step === lastStep && current.midi === midi) {
        continue
      }
      if (current && current.midi === midi && step === lastStep + 1) {
        current.durationMs += stepMs
        lastStep = step
        continue
      }
      current = {
        timeMs: step * stepMs,
        pen: stroke.pen,
        midi,
        velocity,
        durationMs: stepMs,
      }
      notes.push(current)
      lastStep = step
    }
  }

  return notes.sort((a, b) => a.timeMs - b.timeMs)
}
