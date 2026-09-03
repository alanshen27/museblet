// The piece. A session is a performance in the classical four-part form
// 起承转合 — the same shape a regulated poem or a qin piece takes:
//
//   起 qǐ    opening    留白, breath, the first marks; strikes are held back
//   承 chéng carrying   the material develops: brushwork, small percussion
//   转 zhuǎn turning    the climax — the full luogu, fists, feet
//   合 hé    closing    return; the centre resolves to 宫, breath again
//
// Time carries the form forward, but the body bends it: strikes early in
// the piece pull the climax closer, stillness late in the piece hastens
// the close. When 合 completes the room rests in 留白, then a new piece
// may begin.

export type Section = '起' | '承' | '转' | '合'
export const SECTIONS: Section[] = ['起', '承', '转', '合']
export const SECTION_INFO: Record<Section, { pinyin: string; word: string }> = {
  起: { pinyin: 'qǐ', word: 'opening' },
  承: { pinyin: 'chéng', word: 'carrying' },
  转: { pinyin: 'zhuǎn', word: 'turning' },
  合: { pinyin: 'hé', word: 'closing' },
}

// nominal section lengths (ms) — about three minutes in all
const LENGTHS = [26_000, 48_000, 46_000, 34_000]
// each section's musical density target
const DENSITY = [0.15, 0.45, 1, 0.3]
// how long the room rests after 合 before a new piece can open
const REST_MS = 9_000

export interface FormState {
  section: Section
  index: number
  /** 0..1 through the current section */
  progress: number
  /** 0..1 through the whole piece */
  total: number
  /** the smoothed musical density, 0..1 */
  density: number
  /** true on the update where the section changed */
  changed: boolean
  /** the piece has closed and the room is resting */
  resting: boolean
  /** ms since the piece began */
  elapsed: number
  /** real ms since the current section began */
  sectionElapsed: number
}

export class PerformanceForm {
  /** time scale: 1 = the full piece, 0.3 = a brisk run-through */
  private speed: number
  private startT = 0
  private index = 0
  private acc = 0 // ms of progress inside the current section
  private density = DENSITY[0]
  private lastT = 0
  private resting = false
  private restSince = 0
  private started = false
  private sectionStartT = 0

  constructor(speed = 1) {
    this.speed = speed
  }

  start(t: number) {
    this.startT = t
    this.sectionStartT = t
    this.lastT = t
    this.index = 0
    this.acc = 0
    this.resting = false
    this.started = true
    this.density = DENSITY[0]
  }

  get running() {
    return this.started
  }

  update(
    t: number,
    body: { energy: number; stillness: number; strikes: number; present: boolean },
  ): FormState {
    if (!this.started) this.start(t)
    const dt = Math.min(200, Math.max(0, t - this.lastT)) / this.speed
    this.lastT = t
    let changed = false

    if (this.resting) {
      // the room rests; a strike or a new stillness opens the next piece
      if (t - this.restSince > REST_MS && (body.strikes > 0 || body.stillness > 0.9)) {
        this.start(t)
        changed = true
      }
    } else {
      // time moves the section; the body bends its pace
      let rate = 1
      if (this.index === 1) rate = 1 + body.energy * 0.6
      if (this.index === 2) rate = 0.85 + body.energy * 0.5
      if (this.index === 3) rate = 1 + body.stillness * 1.2 - Math.min(0.6, body.energy * 0.8)
      this.acc += dt * rate
      // early fists pull the turn closer; in the close they hold it open
      if (body.strikes > 0) {
        if (this.index < 2) this.acc += 2500 * body.strikes
        else if (this.index === 3) this.acc = Math.max(0, this.acc - 1200 * body.strikes)
      }
      if (this.acc >= LENGTHS[this.index]) {
        this.acc -= LENGTHS[this.index]
        this.index++
        this.sectionStartT = t
        changed = true
        if (this.index >= 4) {
          this.index = 3
          this.acc = LENGTHS[3]
          this.resting = true
          this.restSince = t
        }
      }
    }
    const target = this.resting ? 0.05 : DENSITY[this.index]
    this.density += (target - this.density) * Math.min(1, dt / 2500)

    const before = LENGTHS.slice(0, this.index).reduce((a, b) => a + b, 0)
    const totalLen = LENGTHS.reduce((a, b) => a + b, 0)
    return {
      section: SECTIONS[this.index],
      index: this.index,
      progress: Math.min(1, this.acc / LENGTHS[this.index]),
      total: Math.min(1, (before + this.acc) / totalLen),
      density: this.density,
      changed,
      resting: this.resting,
      elapsed: t - this.startT,
      sectionElapsed: t - this.sectionStartT,
    }
  }
}
