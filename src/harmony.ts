// Harmonic context. Chinese traditional practice is not triadic: voices
// stack in 4ths, 5ths and octaves, and the "progression" is a slow drift
// of the tonal centre between modal degrees rather than a chord cycle.

import { DEFAULT_SCALE, SCALES } from './music'

// 宫 → 羽 → 商 → 徵: the centre slides down a 3rd, up a 4th, up a 4th,
// and home — each centre held for a long while
const CENTRES = [0, 4, 1, 3]

/**
 * The open voicing for the current centre: root, 5th, octave and the 5th
 * above that — a 4ths/5ths stack (no 3rds), the sonority of a struck set
 * of tuned bells or open guqin strings.
 */
export function chordAt(
  scaleName: string,
  barIndex: number,
  lowMidi = 48,
): number[] {
  const scale = SCALES[scaleName] ?? SCALES[DEFAULT_SCALE]
  const n = scale.length
  const deg = CENTRES[barIndex % CENTRES.length] % n
  const tone = (i: number) => {
    const idx = deg + i
    return lowMidi + Math.floor(idx / n) * 12 + scale[idx % n]
  }
  // in a 5-note scale degree+3 is the 5th above; in 7-note scales +4 is
  const fifth = n === 5 ? 3 : 4
  return [tone(0), tone(fifth), tone(n), tone(n + fifth)]
}

/** Snap a midi note to the nearest voicing tone (any octave). */
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

/** Snap a midi note to the nearest scale tone. */
export function snapToScale(midi: number, scaleName: string): number {
  const scale = SCALES[scaleName] ?? SCALES[DEFAULT_SCALE]
  let best = midi
  let bestDist = Infinity
  const base = Math.floor(midi / 12) * 12
  for (const oct of [-12, 0, 12]) {
    for (const s of scale) {
      const cand = base + oct + s
      const d = Math.abs(cand - midi)
      if (d < bestDist) {
        bestDist = d
        best = cand
      }
    }
  }
  return best
}

/** Walk `steps` scale degrees from a midi note (which is snapped first). */
export function stepInScale(midi: number, steps: number, scaleName: string): number {
  const scale = SCALES[scaleName] ?? SCALES[DEFAULT_SCALE]
  const snapped = snapToScale(midi, scaleName)
  const pc = ((snapped % 12) + 12) % 12
  let idx = scale.indexOf(pc)
  if (idx < 0) idx = 0
  let octave = Math.floor(snapped / 12)
  idx += steps
  while (idx >= scale.length) {
    idx -= scale.length
    octave++
  }
  while (idx < 0) {
    idx += scale.length
    octave--
  }
  return octave * 12 + scale[idx]
}
