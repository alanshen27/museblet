// Reading the body as a Sanda (散打) practitioner: stance, breath, the
// explosive release (爆发力) and the recovery. Pure functions over pose
// landmarks so the analysis can run anywhere — MediaPipe Pose in the
// browser, or replayed data in a test.
//
// All distances are normalised by shoulder width, so a punch thrown far
// from the camera reads with the same force as one thrown close to it.

export interface PoseLM {
  x: number
  y: number
  z: number
  visibility?: number
}

// MediaPipe Pose landmark indices
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_INDEX: 19,
  R_INDEX: 20,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const

export type Side = 'L' | 'R'
export type StrikeKind = 'punch' | 'kick'
export type Phase = '息' | '势' | '发' | '收'

export interface Strike {
  kind: StrikeKind
  side: Side
  /** screen position of the striking limb (0..1, mirrored) */
  x: number
  y: number
  /** unit direction of travel */
  dx: number
  dy: number
  /** 0..1 */
  force: number
  t: number
}

export interface Joint {
  x: number
  y: number
  vx: number
  vy: number
  /** speed in shoulder-widths per second */
  speed: number
  vis: number
}

export interface BodyState {
  present: boolean
  t: number
  /** motion energy 0..1 */
  energy: number
  /** grows while the body holds still, 0..1 */
  stillness: number
  /** foot spread relative to shoulders, 0 narrow .. 1 wide */
  stance: number
  /** how deep the stance sits (crouch), 0..1 */
  root: number
  /** both hands up and in, 0..1 */
  guard: number
  /** weight shift left/right, -1..1 */
  lean: number
  /** shoulder width in screen fractions */
  sw: number
  joints: Record<string, Joint>
  strikes: Strike[]
  /** punches thrown in the last 1.2 s */
  rapid: number
  phase: Phase
  /** ms since the last strike, or Infinity */
  sinceStrike: number
}

const TRACKED = [
  'nose',
  'lShoulder',
  'rShoulder',
  'lElbow',
  'rElbow',
  'lWrist',
  'rWrist',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lAnkle',
  'rAnkle',
] as const
type JointName = (typeof TRACKED)[number]
const INDEX: Record<JointName, number> = {
  nose: LM.NOSE,
  lShoulder: LM.L_SHOULDER,
  rShoulder: LM.R_SHOULDER,
  lElbow: LM.L_ELBOW,
  rElbow: LM.R_ELBOW,
  lWrist: LM.L_WRIST,
  rWrist: LM.R_WRIST,
  lHip: LM.L_HIP,
  rHip: LM.R_HIP,
  lKnee: LM.L_KNEE,
  rKnee: LM.R_KNEE,
  lAnkle: LM.L_ANKLE,
  rAnkle: LM.R_ANKLE,
}

// speed, in shoulder widths per second, past which a hand is a fist
export const PUNCH_SPEED = 2.4
// … and past which a rising knee / ankle is a kick
export const KICK_SPEED = 2.0
const PUNCH_REFRACTORY = 240
const KICK_REFRACTORY = 480

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export class SandaTracker {
  private joints = new Map<JointName, Joint & { t: number }>()
  private sw = 0.2
  private energy = 0
  private stillness = 0
  private stance = 0.4
  private root = 0.3
  private guard = 0
  private lean = 0
  private lastStrike: Record<string, number> = {}
  private punchTimes: number[] = []
  private lastAnyStrike = -Infinity
  private lastT = 0
  private missing = 0
  private mirror: boolean

  constructor(mirror = true) {
    this.mirror = mirror
  }

  reset() {
    this.joints.clear()
    this.punchTimes = []
    this.lastAnyStrike = -Infinity
    this.stillness = 0
    this.energy = 0
  }

  update(lm: PoseLM[] | null, t: number): BodyState {
    const dt = this.lastT ? clamp((t - this.lastT) / 1000, 1 / 120, 0.1) : 1 / 30
    this.lastT = t
    const strikes: Strike[] = []

    if (!lm || lm.length < 29) {
      this.missing++
      if (this.missing > 15) {
        this.stillness = Math.max(0, this.stillness - dt * 0.5)
        this.energy *= 0.9
      }
      return this.state(t, this.missing <= 15, strikes)
    }
    this.missing = 0

    const sx = (p: PoseLM) => (this.mirror ? 1 - p.x : p.x)
    const swRaw = Math.hypot(
      lm[LM.L_SHOULDER].x - lm[LM.R_SHOULDER].x,
      lm[LM.L_SHOULDER].y - lm[LM.R_SHOULDER].y,
    )
    if (swRaw > 0.02) this.sw += (swRaw - this.sw) * 0.2
    const sw = this.sw

    // smooth every tracked joint and estimate its velocity. Smoothing
    // adapts to speed (One Euro style): still joints are steadied, fast
    // ones followed nearly raw so an onset is not blurred away
    for (const name of TRACKED) {
      const p = lm[INDEX[name]]
      const rx = sx(p)
      const ry = p.y
      const vis = p.visibility ?? 1
      let j = this.joints.get(name)
      if (!j) {
        j = { x: rx, y: ry, vx: 0, vy: 0, speed: 0, vis, t }
        this.joints.set(name, j)
        continue
      }
      const jump = Math.hypot(rx - j.x, ry - j.y)
      if (jump > sw * 1.2 || j.vis < 0.2) {
        // no limb covers more than a shoulder-width in one frame: this is
        // tracking snapping to a new guess, not motion — follow it, but
        // carry no velocity out of it
        j.x = rx
        j.y = ry
        j.vx = j.vy = j.speed = 0
        j.vis += (vis - j.vis) * 0.3
        j.t = t
        continue
      }
      const a = clamp(0.35 + (jump / sw) * 1.2, 0.35, 0.95)
      const nx = j.x + (rx - j.x) * a
      const ny = j.y + (ry - j.y) * a
      const vx = (nx - j.x) / dt / sw
      const vy = (ny - j.y) / dt / sw
      j.vx += (vx - j.vx) * 0.55
      j.vy += (vy - j.vy) * 0.55
      j.x = nx
      j.y = ny
      j.speed = Math.hypot(j.vx, j.vy)
      j.vis += (vis - j.vis) * 0.3
      j.t = t
    }

    const J = (n: JointName) => this.joints.get(n)!

    // ---- energy / stillness -------------------------------------------
    const movers: JointName[] = ['lWrist', 'rWrist', 'lElbow', 'rElbow', 'nose', 'lKnee', 'rKnee']
    let e = 0
    let n = 0
    for (const m of movers) {
      const j = J(m)
      if (j.vis < 0.4) continue
      e += Math.min(6, j.speed)
      n++
    }
    const eRaw = n ? clamp(e / n / 3.5, 0, 1) : 0
    this.energy += (eRaw - this.energy) * 0.2
    if (this.energy < 0.09) this.stillness = Math.min(1, this.stillness + dt / 2.2)
    else this.stillness = Math.max(0, this.stillness - dt * (0.8 + this.energy * 4))

    // ---- stance / root / lean / guard ---------------------------------
    const la = J('lAnkle')
    const ra = J('rAnkle')
    const lk = J('lKnee')
    const rk = J('rKnee')
    const lh = J('lHip')
    const rh = J('rHip')
    const ls = J('lShoulder')
    const rs = J('rShoulder')
    const feetVisible = la.vis > 0.5 && ra.vis > 0.5
    const kneesVisible = lk.vis > 0.5 && rk.vis > 0.5
    if (feetVisible || kneesVisible) {
      const spread = feetVisible ? Math.abs(la.x - ra.x) : Math.abs(lk.x - rk.x) * 1.25
      const stRaw = clamp((spread / sw - 0.7) / 1.5, 0, 1)
      this.stance += (stRaw - this.stance) * 0.08
    }
    if (kneesVisible && lh.vis > 0.5 && rh.vis > 0.5) {
      // a deep stance foreshortens the thigh: hip-to-knee drop shrinks
      const thigh = ((lk.y - lh.y) + (rk.y - rh.y)) / 2 / sw
      const rootRaw = clamp((1.05 - thigh) / 0.55, 0, 1)
      this.root += (rootRaw - this.root) * 0.08
    }
    const shoulderMid = (ls.x + rs.x) / 2
    const hipMid = (lh.x + rh.x) / 2
    if (lh.vis > 0.4 && rh.vis > 0.4) {
      const leanRaw = clamp(((shoulderMid - hipMid) / sw) * 2.2, -1, 1)
      this.lean += (leanRaw - this.lean) * 0.12
    }
    const nose = J('nose')
    const lw = J('lWrist')
    const rw = J('rWrist')
    const shoulderY = (ls.y + rs.y) / 2
    const up = (w: Joint) =>
      w.vis > 0.4 &&
      w.y < shoulderY + sw * 0.25 &&
      Math.abs(w.x - nose.x) < sw * 1.3 &&
      w.speed < 1.4
    const guardRaw = up(lw) && up(rw) ? 1 : 0
    this.guard += (guardRaw - this.guard) * 0.15

    // ---- strikes ------------------------------------------------------
    const punch = (side: Side, wrist: Joint, shoulder: Joint, key: string) => {
      if (wrist.vis < 0.35) return
      if (t - (this.lastStrike[key] ?? -Infinity) < PUNCH_REFRACTORY) return
      if (wrist.speed < PUNCH_SPEED) return
      // outward: travelling away from the shoulder (or straight across)
      const ox = wrist.x - shoulder.x
      const oy = wrist.y - shoulder.y
      const ol = Math.hypot(ox, oy) || 1
      const outward = (wrist.vx * ox + wrist.vy * oy) / ol / wrist.speed
      if (outward < -0.2) return
      this.lastStrike[key] = t
      const force = clamp((wrist.speed - 1.6) / 5.5, 0.15, 1)
      strikes.push({
        kind: 'punch',
        side,
        x: wrist.x,
        y: wrist.y,
        dx: wrist.vx / wrist.speed,
        dy: wrist.vy / wrist.speed,
        force,
        t,
      })
      this.punchTimes.push(t)
    }
    punch('L', lw, ls, 'pL')
    punch('R', rw, rs, 'pR')

    const kick = (side: Side, ankle: Joint, knee: Joint, hip: Joint, key: string) => {
      if (t - (this.lastStrike[key] ?? -Infinity) < KICK_REFRACTORY) return
      // a kick is read from whichever of ankle / knee tracking sees: the
      // ankle whipping, or the knee driving up past the hip line
      const ankleKick = ankle.vis > 0.45 && ankle.speed > KICK_SPEED * 1.3
      const kneeKick =
        knee.vis > 0.45 &&
        knee.speed > KICK_SPEED &&
        knee.vy < -KICK_SPEED * 0.45 &&
        knee.y < hip.y + sw * 0.9
      if (!ankleKick && !kneeKick) return
      const j = ankleKick ? ankle : knee
      this.lastStrike[key] = t
      // a kick also silences the hands for a beat
      this.lastStrike.pL = this.lastStrike.pR = t
      const force = clamp((j.speed - 1.4) / 5, 0.3, 1)
      strikes.push({
        kind: 'kick',
        side,
        x: j.x,
        y: j.y,
        dx: j.vx / (j.speed || 1),
        dy: j.vy / (j.speed || 1),
        force,
        t,
      })
    }
    kick('L', la, lk, lh, 'kL')
    kick('R', ra, rk, rh, 'kR')

    if (strikes.length) {
      this.lastAnyStrike = t
      this.stillness = 0
    }
    this.punchTimes = this.punchTimes.filter((pt) => t - pt < 1200)

    return this.state(t, true, strikes)
  }

  private state(t: number, present: boolean, strikes: Strike[]): BodyState {
    const since = t - this.lastAnyStrike
    let phase: Phase = '势'
    if (since < 260) phase = '发'
    else if (since < 1200) phase = '收'
    else if (this.stillness > 0.55) phase = '息'
    const joints: Record<string, Joint> = {}
    for (const [k, v] of this.joints) joints[k] = v
    return {
      present,
      t,
      energy: this.energy,
      stillness: this.stillness,
      stance: this.stance,
      root: this.root,
      guard: this.guard,
      lean: this.lean,
      sw: this.sw,
      joints,
      strikes,
      rapid: this.punchTimes.length,
      phase,
      sinceStrike: since,
    }
  }
}

/**
 * The martial figure as a few brush lines: which joints connect. Used by
 * the ink ghost and its afterimages.
 */
export const FIGURE: [JointName, JointName][] = [
  ['lShoulder', 'rShoulder'],
  ['lShoulder', 'lElbow'],
  ['lElbow', 'lWrist'],
  ['rShoulder', 'rElbow'],
  ['rElbow', 'rWrist'],
  ['lShoulder', 'lHip'],
  ['rShoulder', 'rHip'],
  ['lHip', 'rHip'],
  ['lHip', 'lKnee'],
  ['lKnee', 'lAnkle'],
  ['rHip', 'rKnee'],
  ['rKnee', 'rAnkle'],
]
