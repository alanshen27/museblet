// Harmonic context: a slow chord progression that live notes snap to,
// plus pad/bass voicings for the backing bed.

import { SCALES } from './music'

// scale-degree progression (I - vi - IV - V feel, wraps for short scales)
const PROGRESSION = [0, 5, 3, 4]

export function chordAt(
  scaleName: string,
  barIndex: number,
  lowMidi = 48,
): number[] {
  const scale = SCALES[scaleName] ?? SCALES.pentatonic
  const n = scale.length
  const deg = PROGRESSION[barIndex % PROGRESSION.length] % n
  const tone = (i: number) => {
    const idx = deg + i
    return lowMidi + Math.floor(idx / n) * 12 + scale[idx % n]
  }
  // stacked thirds (every other scale step)
  return [tone(0), tone(2), tone(4)]
}

/** Snap a midi note to the nearest chord tone (any octave). */
export function snapToChord(midi: number, chord: number[]): number {
  let best = midi
  let bestDist = Infinity
  for (const c of chord) {
    const pc = ((c % 12) + 12) % 12
    const base = Math.floor(midi / 12) * 12 + pc
    for (const cand of [base - 12, base, base + 12]) {
      const d = Math.abs(cand - midi)
      if (d < bestDist) {
        bestDist = d
        best = cand
      }
    }
  }
  return best
}
