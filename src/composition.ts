// The piece: a composed time structure for the interactive instrument.
//
// The screen is read as a 3D space — X left/right = pitch (right hand side
// is high, left is low), Y up/down = volume (higher hand = louder), and
// Z near/far (tracked hand size) = timbre depth (filter/reverb).
//
// Sound exists as three materials:
//   point  — grains: short percussive hits
//   line   — a single sustained gliding voice
//   plane  — chords: several voices sounding together
//
// Time is composed as A B A' coda (~45s each, ~3 minutes total), after
// Jeffrey Stolet's "Kinetic Ritual of the Ropes" model: one hand a low
// line, the other high points. B alternates point-cells and line-cells,
// compressing (10s → 7s → 5s → 2s → 1s → 0.5s) until the line collapses
// into points; the coda holds the points, then both hands become long
// unison lines fading to silence.

export type Material = 'point' | 'line' | 'plane'

export interface PieceState {
  /** section label shown in the (minimal) HUD */
  label: 'A' | 'B' | "A'" | '·'
  /** 0..1 progress through the current section */
  progress: number
  /** which material each hand slot speaks right now */
  materials: [Material, Material]
  /** master fade multiplier (coda dies away to 0) */
  fade: number
}

const SECTION_MS = 45_000
const PIECE_MS = SECTION_MS * 4

// B section: alternating cells, each half line-cell then point-cell,
// shrinking until the line is compressed into a point. The literal
// 10/7/5/2/1/0.5 pairs total 51s, so they are scaled to fill exactly 45s
const B_STEPS = [10, 7, 5, 2, 1, 0.5]
const B_SCALE = SECTION_MS / (B_STEPS.reduce((a, s) => a + s, 0) * 2 * 1000)
const B_CELLS: { dur: number; mat: Material }[] = []
for (const s of B_STEPS) {
  B_CELLS.push({ dur: s * 1000 * B_SCALE, mat: 'line' })
  B_CELLS.push({ dur: s * 1000 * B_SCALE, mat: 'point' })
}

export function pieceState(elapsedMs: number): PieceState {
  const t = Math.max(0, elapsedMs)
  if (t < SECTION_MS) {
    // A: a line and points coexist — left/first hand the low line,
    // right/second hand the high points
    return {
      label: 'A',
      progress: t / SECTION_MS,
      materials: ['line', 'point'],
      fade: 1,
    }
  }
  if (t < SECTION_MS * 2) {
    // B: both hands speak the same material, alternating in
    // ever-shorter cells until the line is squeezed into points
    const bt = t - SECTION_MS
    let acc = 0
    let mat: Material = 'point'
    for (const c of B_CELLS) {
      acc += c.dur
      if (bt < acc) {
        mat = c.mat
        break
      }
    }

    return {
      label: 'B',
      progress: bt / SECTION_MS,
      materials: [mat, mat],
      fade: 1,
    }
  }
  if (t < SECTION_MS * 3) {
    // A': the return, developed — the line keeps its ground, the point
    // hand widens into planes (chords)
    return {
      label: "A'",
      progress: (t - SECTION_MS * 2) / SECTION_MS,
      materials: ['line', 'plane'],
      fade: 1,
    }
  }
  // coda: points hold for ~15s, then both hands are long unison lines
  // dying away — the piece ends in silence
  const ct = t - SECTION_MS * 3
  const points = ct < 15_000
  const fade =
    t >= PIECE_MS ? 0 : points ? 1 : 1 - (ct - 15_000) / (SECTION_MS - 15_000)
  return {
    label: '·',
    progress: Math.min(1, ct / SECTION_MS),
    materials: points ? ['point', 'point'] : ['line', 'line'],
    fade: Math.max(0, fade),
  }
}
