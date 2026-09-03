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
 * Convert strokes into a note sequence for the loop transport, 散板: no
 * grid. x maps to time across one loop continuously, y to pitch, pressure
 * to velocity; a note lasts as long as the mark stays on its pitch, so the
 * length of a stroke is its duration.
 */
export function strokesToNotes(
  strokes: Stroke[],
  loopMs: number,
  scaleName: string,
): NoteEvent[] {
  const notes: NoteEvent[] = []
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    let current: NoteEvent | null = null
    for (const p of stroke.points) {
      const time = Math.max(0, Math.min(loopMs - 1, p.x * loopMs))
      const midi = yToMidi(p.y, scaleName)
      if (current && current.midi === midi && time >= current.timeMs) {
        current.durationMs = Math.max(current.durationMs, time - current.timeMs + 60)
        continue
      }
      current = {
        timeMs: time,
        pen: stroke.pen,
        midi,
        velocity: Math.round(40 + p.pressure * 80),
        durationMs: 60,
      }
      notes.push(current)
    }
  }
  return notes.sort((a, b) => a.timeMs - b.timeMs)
}
