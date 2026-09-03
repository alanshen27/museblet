export interface Point {
  x: number
  y: number
  pressure: number
}

export interface Stroke {
  points: Point[]
  /** instrument id (see instruments.ts) */
  pen: string
  bornAt: number
  /** per-point speed (normalized units/s), parallel to points — drives 飞白 */
  speeds?: number[]
}

export interface NoteEvent {
  timeMs: number
  pen: string
  midi: number
  velocity: number
  durationMs: number
}

// Chinese modes. The five 五声 modes are rotations of one pentatonic
// collection (宫 商 角 徵 羽 = gong shang jue zhi yu); the 七声 heptatonic
// systems add the two 变 "altered" degrees in the three historical ways.
// The older western names stay as aliases so the Max `scale` inlet keeps
// accepting what it always did.
export const SCALES: Record<string, number[]> = {
  gong: [0, 2, 4, 7, 9], // 宫 — do-mode, bright, open
  shang: [0, 2, 5, 7, 10], // 商 — re-mode, level, martial
  jue: [0, 3, 5, 8, 10], // 角 — mi-mode, dark, rare
  zhi: [0, 2, 5, 7, 9], // 徵 — sol-mode, warm
  yu: [0, 3, 5, 7, 10], // 羽 — la-mode, the guqin's shadowed home
  qingyue: [0, 2, 4, 5, 7, 9, 11], // 清乐
  yayue: [0, 2, 4, 6, 7, 9, 11], // 雅乐 — raised 4th (变徵)
  yanyue: [0, 2, 4, 5, 7, 9, 10], // 燕乐 — lowered 7th (闰)
  // aliases (legacy names still accepted from Max)
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

/** display glyph for a mode, for the HUD */
export const MODE_GLYPH: Record<string, string> = {
  gong: '宫',
  shang: '商',
  jue: '角',
  zhi: '徵',
  yu: '羽',
  qingyue: '清',
  yayue: '雅',
  yanyue: '燕',
}

export const DEFAULT_SCALE = 'yu'

const LOW_MIDI = 36 // C2
const OCTAVES = 4

/** Map a normalized y (0 = top, 1 = bottom) to a scale-quantized MIDI note. */
export function yToMidi(yNorm: number, scaleName: string): number {
  const scale = SCALES[scaleName] ?? SCALES[DEFAULT_SCALE]
  const steps = scale.length * OCTAVES
  const idx = Math.min(steps - 1, Math.max(0, Math.floor((1 - yNorm) * steps)))
  const octave = Math.floor(idx / scale.length)
  return LOW_MIDI + octave * 12 + scale[idx % scale.length]
}

/** Map a normalized 0..1 value onto `octaves` octaves of the scale above `low`. */
export function scaleDegree(
  v: number,
  scaleName: string,
  low: number,
  octaves = 3,
): number {
  const sc = SCALES[scaleName] ?? SCALES[DEFAULT_SCALE]
  const span = sc.length * octaves
  const idx = Math.min(span - 1, Math.max(0, Math.floor(v * span)))
  return low + Math.floor(idx / sc.length) * 12 + sc[idx % sc.length]
}

/**
 * Convert strokes into a note sequence for the loop transport: x maps to
 * time across one loop, y to pitch, pressure to velocity. Consecutive
 * points on the same quantized step merge into one sustained note.
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
