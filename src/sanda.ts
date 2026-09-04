// Reading the body as a Sanda (散打) practitioner: stance, breath, the
// explosive release (爆发力) and the recovery. Pure functions over pose
// landmarks so the analysis can run anywhere — MediaPipe Pose in the
// browser, the demo performer, or replayed data in a test.
//
// Model: MediaPipe Pose Landmarker (BlazePose GHUM), all 33 keypoints —
// face, shoulders, elbows, wrists, hand tips (pinky/index/thumb), hips,
// knees, ankles, heels, foot tips — plus the metric "world" landmarks
// that give every joint a depth. Distances are normalised by shoulder
// width, so a punch thrown far from the camera reads with the same force
// as one thrown close to it.

export interface PoseLM {
  x: number
  y: number
  z: number
  visibility?: number
}

export const N_LM = 33

// MediaPipe Pose landmark indices
export const LM = {
  NOSE: 0,
  L_EYE: 2,
  R_EYE: 5,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_PINKY: 17,
  R_PINKY: 18,
  L_INDEX: 19,
  R_INDEX: 20,
  L_THUMB: 21,
  R_THUMB: 22,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT: 31,
  R_FOOT: 32,
} as const

export type Side = 'L' | 'R'
export type StrikeKind = 'punch' | 'kick' | 'snap'
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
  /** how much the strike came from the body (hip turn / extension), 0..1 */
  drive: number
  /** 0..1 — margin over the thresholds, weighted by joint visibility */
  confidence: number
}

export interface Joint {
  x: number
  y: number
  /** depth in shoulder-widths, from the world landmarks (+ = toward camera) */
  z: number
  vx: number
  vy: number
  /** depth velocity, shoulder-widths per second */
  vz: number
  /** speed in shoulder-widths per second, depth included */
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
  /** torso turn about the vertical axis, -1..1 (shoulders vs hips) */
  turn: number
  /** a slow breath signal from the shoulders' rise and fall, -1..1 */
  breath: number
  /** how fast the torso is turning, 0..1 (throws, spins) */
  turnRate: number
  /** clinch / seize: both hands drawn together at the torso, 0..1 */
  seize: number
  /** 亮相: the body stopped dead after fast motion, this frame */
  snap: boolean
  /** 蓄: a hand drawing in toward the body fast enough to be a wind-up, this frame */
  windup: Side | null
  /** true while the whole body is under the expression floor: the room is silent */
  gated: boolean
  /** energy at the moment of the snap, 0..1 */
  snapForce: number
  /** shoulder width in screen fractions */
  sw: number
  /** named joints for the mappings */
  joints: Record<string, Joint>
  /** all 33 joints, for the body renderers */
  all: Joint[]
  strikes: Strike[]
  /** punches thrown in the last 1.2 s */
  rapid: number
  phase: Phase
  /** ms since the last strike, or Infinity */
  sinceStrike: number
}

const NAMES: Record<string, number> = {
  nose: LM.NOSE,
  lShoulder: LM.L_SHOULDER,
  rShoulder: LM.R_SHOULDER,
  lElbow: LM.L_ELBOW,
  rElbow: LM.R_ELBOW,
  lWrist: LM.L_WRIST,
  rWrist: LM.R_WRIST,
  lIndex: LM.L_INDEX,
  rIndex: LM.R_INDEX,
  lHip: LM.L_HIP,
  rHip: LM.R_HIP,
  lKnee: LM.L_KNEE,
  rKnee: LM.R_KNEE,
  lAnkle: LM.L_ANKLE,
  rAnkle: LM.R_ANKLE,
  lHeel: LM.L_HEEL,
  rHeel: LM.R_HEEL,
  lFoot: LM.L_FOOT,
  rFoot: LM.R_FOOT,
}

// speed, in shoulder widths per second, past which a hand is a fist
export const PUNCH_SPEED = 3.8
// … and past which a rising knee / ankle / foot is a kick
export const KICK_SPEED = 3.4
// a strike must come out of rest: the limb has to have been slower than
// this since its last strike before it can fire again (a peak, not a wobble)
const REARM_SPEED = 0.9
const PUNCH_REFRACTORY = 450
const KICK_REFRACTORY = 800
// a strike is a peak *and a release*: the limb accelerates past the
// threshold, peaks, and falls back below this fraction of its peak — only
// then does it fire, with the peak as its force. Jitter never releases
// after a real peak, and a hand waved about never falls back
const RELEASE = 0.55
// … and it must have travelled, in shoulder widths, since it left rest
const PUNCH_TRAVEL = 0.55
const KICK_TRAVEL = 0.5
// a rising phase that lasts longer than this is a wave, not a strike
const RISE_MAX_MS = 600
// a punch travels along the arm: the speed-weighted cosine between the
// hand's velocity and the elbow→wrist axis over the rise must exceed this
export const PUNCH_ALIGN = 0.6
// below this whole-body energy the room is silent: the expression floor
export const EXPRESSION_FLOOR = 0.2

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function angle(a: Joint, b: Joint, c: Joint): number {
  // angle at b between ba and bc
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y
  const d = (abx * cbx + aby * cby) / ((Math.hypot(abx, aby) * Math.hypot(cbx, cby)) || 1)
  return Math.acos(clamp(d, -1, 1))
}

export class SandaTracker {
  private all: Joint[] = []
  private elbowAngle = [Math.PI, Math.PI] // L, R
  private elbowRate = [0, 0]
  private sw = 0.2
  private energy = 0
  private stillness = 0
  private stance = 0.4
  private root = 0.3
  private guard = 0
  private lean = 0
  private turn = 0
  private turnRate = 0
  private seize = 0
  private breath = 0
  private energyPeak = 0
  private peakT = 0
  private lastSnap = -Infinity
  private snapNow = false
  private windupNow: Side | null = null
  private lastWindup: Record<string, number> = {}
  private snapForce = 0
  private shoulderY = 0
  private shoulderYSlow = 0
  private lastStrike: Record<string, number> = {}
  private armed: Record<string, boolean> = { pL: true, pR: true, kL: true, kR: true }
  private rise: Record<string, { peak: number; t0: number; ext: number; align: number; alignW: number } | null> = {
    pL: null,
    pR: null,
    kL: null,
    kR: null,
  }
  // where each striking limb last rested: travel is measured from here
  private restPos: Record<string, { x: number; y: number; z: number }> = {}
  // each forearm's axis last frame, so alignment is judged against the
  // midpoint axis (a swing's velocity is perpendicular to it exactly)
  private prevAxis: Record<string, { x: number; y: number; z: number }> = {}
  private punchTimes: number[] = []
  private lastAnyStrike = -Infinity
  private lastT = 0
  private missing = 0
  private mirror: boolean

  constructor(mirror = true) {
    this.mirror = mirror
  }

  reset() {
    this.all = []
    this.punchTimes = []
    this.lastAnyStrike = -Infinity
    this.stillness = 0
    this.energy = 0
  }

  /**
   * @param lm normalised image landmarks (33)
   * @param world metric world landmarks (33), optional — gives depth
   */
  update(lm: PoseLM[] | null, t: number, world: PoseLM[] | null = null): BodyState {
    const rawDt = this.lastT ? (t - this.lastT) / 1000 : 1 / 30
    const dt = clamp(rawDt, 1 / 120, 0.1)
    this.lastT = t
    const strikes: Strike[] = []
    this.snapNow = false
    this.windupNow = null
    // a gap longer than a fifth of a second (a stalled tab, a starved
    // machine) tells us nothing about speed: take the positions, carry no
    // velocity, fire nothing
    const stalled = rawDt > 0.2

    if (!lm || lm.length < N_LM) {
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
    // world shoulder width, to normalise depth
    let wsw = 0.35
    if (world && world.length >= N_LM) {
      wsw =
        Math.hypot(
          world[LM.L_SHOULDER].x - world[LM.R_SHOULDER].x,
          world[LM.L_SHOULDER].y - world[LM.R_SHOULDER].y,
          world[LM.L_SHOULDER].z - world[LM.R_SHOULDER].z,
        ) || 0.35
    }

    // smooth every joint and estimate its velocity. Smoothing adapts to
    // speed (One Euro style): still joints are steadied, fast ones followed
    // nearly raw so an onset is not blurred away
    if (this.all.length !== N_LM) {
      this.all = lm.map((p, i) => ({
        x: sx(p),
        y: p.y,
        z: world ? -world[i].z / wsw : 0,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        vis: p.visibility ?? 1,
      }))
    } else {
      for (let i = 0; i < N_LM; i++) {
        const p = lm[i]
        const j = this.all[i]
        const rx = sx(p)
        const ry = p.y
        const vis = p.visibility ?? 1
        const rz = world ? -world[i].z / wsw : 0
        const jump = Math.hypot(rx - j.x, ry - j.y)
        if (stalled || jump > sw * 1.2 || j.vis < 0.2) {
          // no limb covers more than a shoulder-width in one frame: this
          // is tracking snapping to a new guess, not motion — follow it,
          // but carry no velocity out of it
          j.x = rx
          j.y = ry
          j.z = rz
          j.vx = j.vy = j.vz = j.speed = 0
          j.vis += (vis - j.vis) * 0.3
          continue
        }
        // small jumps are mostly tracking noise: smooth them hard; a real
        // move is followed nearly raw so an onset is not blurred away
        const a = clamp(0.2 + (jump / sw) * 1.6, 0.2, 0.95)
        const nx = j.x + (rx - j.x) * a
        const ny = j.y + (ry - j.y) * a
        const vx = (nx - j.x) / dt / sw
        const vy = (ny - j.y) / dt / sw
        j.vx += (vx - j.vx) * 0.45
        j.vy += (vy - j.vy) * 0.45
        j.x = nx
        j.y = ny
        const nz = j.z + (rz - j.z) * 0.5
        const vz = (nz - j.z) / dt
        j.vz += (vz - j.vz) * 0.5
        j.z = nz
        // a punch thrown straight at the lens is mostly depth motion:
        // count it, at a discount for the world estimate's jitter
        j.speed = Math.hypot(j.vx, j.vy, j.vz * 0.7)
        j.vis += (vis - j.vis) * 0.3
      }
    }
    const J = (i: number) => this.all[i]

    // ---- energy / stillness -------------------------------------------
    const movers = [LM.L_WRIST, LM.R_WRIST, LM.L_ELBOW, LM.R_ELBOW, LM.NOSE, LM.L_KNEE, LM.R_KNEE]
    let e = 0
    let n = 0
    for (const m of movers) {
      const j = J(m)
      if (j.vis < 0.4) continue
      e += Math.min(6, j.speed)
      n++
    }
    const eRaw = n ? clamp(e / n / 3.5, 0, 1) : 0
    const prevEnergy = this.energy
    this.energy += (eRaw - this.energy) * 0.2
    // 亮相: fast motion that stops dead. Remember the recent peak; if the
    // energy collapses below a fifth of it within 350 ms, the body snapped
    // into a pose
    if (this.energy > this.energyPeak || t - this.peakT > 350) {
      this.energyPeak = this.energy
      this.peakT = t
    }
    this.snapNow = false
    if (
      this.energyPeak > 0.58 &&
      this.energy < this.energyPeak * 0.2 &&
      prevEnergy >= this.energyPeak * 0.2 &&
      t - this.lastAnyStrike > 300 &&
      t - this.lastSnap > 900
    ) {
      this.snapNow = true
      this.snapForce = clamp(this.energyPeak, 0, 1)
      this.lastSnap = t
      this.energyPeak = 0
    }
    if (this.energy < 0.09) this.stillness = Math.min(1, this.stillness + dt / 2.2)
    else this.stillness = Math.max(0, this.stillness - dt * (0.8 + this.energy * 4))

    // ---- stance / root / lean / turn / guard / breath -------------------
    const la = J(LM.L_ANKLE)
    const ra = J(LM.R_ANKLE)
    const lh2 = J(LM.L_HEEL)
    const rh2 = J(LM.R_HEEL)
    const lk = J(LM.L_KNEE)
    const rk = J(LM.R_KNEE)
    const lh = J(LM.L_HIP)
    const rh = J(LM.R_HIP)
    const ls = J(LM.L_SHOULDER)
    const rs = J(LM.R_SHOULDER)
    const feet = (la.vis > 0.5 && ra.vis > 0.5) || (lh2.vis > 0.5 && rh2.vis > 0.5)
    const knees = lk.vis > 0.5 && rk.vis > 0.5
    if (feet || knees) {
      const spread = feet
        ? Math.abs((la.vis > 0.5 ? la.x : lh2.x) - (ra.vis > 0.5 ? ra.x : rh2.x))
        : Math.abs(lk.x - rk.x) * 1.25
      const stRaw = clamp((spread / sw - 0.7) / 1.5, 0, 1)
      this.stance += (stRaw - this.stance) * 0.08
    }
    if (knees && lh.vis > 0.5 && rh.vis > 0.5) {
      // a deep stance foreshortens the thigh: hip-to-knee drop shrinks
      const thigh = (lk.y - lh.y + (rk.y - rh.y)) / 2 / sw
      const rootRaw = clamp((1.05 - thigh) / 0.55, 0, 1)
      this.root += (rootRaw - this.root) * 0.08
    }
    const shoulderMid = (ls.x + rs.x) / 2
    const hipMid = (lh.x + rh.x) / 2
    if (lh.vis > 0.4 && rh.vis > 0.4) {
      const leanRaw = clamp(((shoulderMid - hipMid) / sw) * 2.2, -1, 1)
      this.lean += (leanRaw - this.lean) * 0.12
      // torso turn: the shoulder line rotates against the hip line in depth
      const turnRaw = clamp(((ls.z - rs.z) - (lh.z - rh.z)) * 0.8, -1, 1)
      const prevTurn = this.turn
      this.turn += (turnRaw - this.turn) * 0.12
      // a spinning torso: the shoulder line sweeping in depth, or the
      // shoulders travelling fast across the hips
      // depth is the noisiest coordinate: smooth the turn hard, so only a
      // deliberate spin — not sway or jitter — reads as turning
      const swing = Math.abs(this.turn - prevTurn) / dt * 0.4 + Math.abs(ls.vx + rs.vx) * 0.1
      this.turnRate += (clamp(swing, 0, 1) - this.turnRate) * 0.1
    }
    // seize: the two hands drawn together in front of the torso and held
    {
      const lw2 = J(LM.L_WRIST)
      const rw2 = J(LM.R_WRIST)
      const together = Math.hypot(lw2.x - rw2.x, lw2.y - rw2.y) / sw
      const midY = (lw2.y + rw2.y) / 2
      const atTorso = midY > (ls.y + rs.y) / 2 - sw * 0.2 && midY < (lh.y + rh.y) / 2 + sw * 0.3
      const seizeRaw = lw2.vis > 0.4 && rw2.vis > 0.4 && together < 0.55 && atTorso && lw2.speed < 1.2 ? 1 : 0
      this.seize += (seizeRaw - this.seize) * 0.15
    }
    // breath: the shoulders rise and fall slowly against their own trend
    const shY = (ls.y + rs.y) / 2 / sw
    this.shoulderY += (shY - this.shoulderY) * 0.25
    this.shoulderYSlow += (shY - this.shoulderYSlow) * 0.02
    const br = clamp((this.shoulderYSlow - this.shoulderY) * 18, -1, 1)
    this.breath += (br - this.breath) * 0.15

    const nose = J(LM.NOSE)
    const lw = J(LM.L_WRIST)
    const rw = J(LM.R_WRIST)
    const shoulderYAbs = (ls.y + rs.y) / 2
    const up = (w: Joint) =>
      w.vis > 0.4 &&
      w.y < shoulderYAbs + sw * 0.25 &&
      Math.abs(w.x - nose.x) < sw * 1.3 &&
      w.speed < 1.4
    const guardRaw = up(lw) && up(rw) ? 1 : 0
    this.guard += (guardRaw - this.guard) * 0.15

    // ---- elbow extension (a punch is an arm opening fast) --------------
    for (const [i, s, el, w] of [
      [0, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],
      [1, LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST],
    ] as const) {
      const a = angle(J(s), J(el), J(w))
      const rate = (a - this.elbowAngle[i]) / dt
      this.elbowRate[i] += (rate - this.elbowRate[i]) * 0.5
      this.elbowAngle[i] = a
    }

    // ---- 蓄: the wind-up — a hand pulled back toward its shoulder --------
    for (const [side, wi, si] of [
      ['L', LM.L_WRIST, LM.L_SHOULDER],
      ['R', LM.R_WRIST, LM.R_SHOULDER],
    ] as const) {
      const w = J(wi)
      const sh = J(si)
      if (w.vis < 0.4 || w.speed < 1.6 || w.speed > PUNCH_SPEED * 0.8) continue
      const ox = sh.x - w.x
      const oy = sh.y - w.y
      const ol = Math.hypot(ox, oy) || 1
      const inward = (w.vx * ox + w.vy * oy) / ol / w.speed
      if (inward > 0.6 && this.energy > EXPRESSION_FLOOR * 0.7 && t - (this.lastWindup[side] ?? -Infinity) > 1500) {
        this.lastWindup[side] = t
        this.windupNow = side
      }
    }

    // ---- strikes ------------------------------------------------------
    const punch = (side: Side, wi: number, si: number, ei: number, key: string) => {
      const wrist = J(wi)
      const shoulder = J(si)
      // the hand tip reads a little ahead of the wrist; use the faster of the two
      const tip = J(wi === LM.L_WRIST ? LM.L_INDEX : LM.R_INDEX)
      const hand = tip.vis > 0.4 && tip.speed > wrist.speed ? tip : wrist
      if (wrist.vis < 0.35) {
        this.rise[key] = null
        return
      }
      // re-arm only once the hand has come to rest, and remember where
      if (hand.speed < REARM_SPEED) {
        this.armed[key] = true
        this.restPos[key] = { x: hand.x, y: hand.y, z: hand.z }
      }
      const ext = this.elbowRate[ei] // rad/s, positive = opening
      // the arm axis: elbow → wrist. A punch is the hand travelling *along*
      // the forearm, outward; a sideways flap or a chop travels across it
      const elbow = J(wi === LM.L_WRIST ? LM.L_ELBOW : LM.R_ELBOW)
      const axNow = { x: wrist.x - elbow.x, y: wrist.y - elbow.y, z: (wrist.z - elbow.z) * sw }
      const axPrev = this.prevAxis[key] ?? axNow
      this.prevAxis[key] = axNow
      const ax = axNow.x + axPrev.x
      const ay = axNow.y + axPrev.y
      const az = axNow.z + axPrev.z
      const al = Math.hypot(ax, ay, az) || 1
      const vmag = Math.hypot(hand.vx, hand.vy, hand.vz * 0.7) || 1
      const along = (hand.vx * ax + hand.vy * ay + hand.vz * 0.7 * az) / al / vmag
      const r = this.rise[key]
      if (!r) {
        // at rest: does the hand leave it fast enough, and along the arm?
        const fast = hand.speed >= PUNCH_SPEED
        const snapping = hand.speed >= PUNCH_SPEED * 0.8 && ext > 8
        if (this.armed[key] && (fast || snapping) && along > 0.45 && t - (this.lastStrike[key] ?? -Infinity) >= PUNCH_REFRACTORY) {
          this.rise[key] = { peak: hand.speed, t0: t, ext: Math.max(0, ext), align: along * hand.speed, alignW: hand.speed }
        }
        return
      }
      r.peak = Math.max(r.peak, hand.speed)
      r.ext = Math.max(r.ext, ext)
      r.align += along * hand.speed
      r.alignW += hand.speed
      if (t - r.t0 > RISE_MAX_MS) {
        // held speed is a wave, not a strike
        this.rise[key] = null
        this.armed[key] = false
        return
      }
      if (hand.speed > r.peak * RELEASE) return
      // released: judge the whole gesture. The speed-weighted alignment of
      // the hand's travel with the forearm must be clearly outward
      this.rise[key] = null
      this.armed[key] = false
      const alignment = r.alignW > 0 ? r.align / r.alignW : 0
      if (alignment < PUNCH_ALIGN) return
      const rest = this.restPos[key] ?? { x: hand.x, y: hand.y, z: hand.z }
      const tx = hand.x - rest.x
      const ty = hand.y - rest.y
      // travel from rest, depth included (a jab at the lens barely moves on screen)
      const travel = Math.hypot(tx / sw, ty / sw, hand.z - rest.z)
      if (travel < PUNCH_TRAVEL) return
      // outward: away from the shoulder (or straight across)
      const ox = hand.x - shoulder.x
      const oy = hand.y - shoulder.y
      const ol = Math.hypot(ox, oy) || 1
      const outward = (tx * ox + ty * oy) / ol / (Math.hypot(tx, ty) || 1)
      if (outward < -0.2) return
      // a strike carries its own evidence in the limb; it needs half the floor
      if (this.energy < EXPRESSION_FLOOR * 0.5) return
      this.lastStrike[key] = t
      // drive: how much the body is behind the fist — hip/shoulder turn
      // and the arm's extension rate
      const drive = clamp(Math.abs(this.turn) * 0.6 + clamp(r.ext / 12, 0, 1) * 0.6, 0, 1)
      const force = clamp((r.peak - 1.6) / 5.5 + drive * 0.15, 0.15, 1)
      const confidence = clamp(
        (0.4 + clamp((r.peak - PUNCH_SPEED) / PUNCH_SPEED, -0.3, 0.35) + clamp((alignment - PUNCH_ALIGN) * 0.5, 0, 0.2) + clamp((travel - PUNCH_TRAVEL) * 0.3, 0, 0.15)) *
          clamp(wrist.vis, 0.35, 1),
        0.05,
        1,
      )
      const m2 = Math.hypot(tx, ty)
      strikes.push({
        kind: 'punch',
        side,
        x: hand.x,
        y: hand.y,
        dx: m2 > 1e-4 ? tx / m2 : 0,
        dy: m2 > 1e-4 ? ty / m2 : -1,
        force,
        t,
        drive,
        confidence,
      })
      this.punchTimes.push(t)
    }
    if (!stalled) {
      punch('L', LM.L_WRIST, LM.L_SHOULDER, 0, 'pL')
      punch('R', LM.R_WRIST, LM.R_SHOULDER, 1, 'pR')
    }

    const kick = (side: Side, ai: number, ki: number, hi: number, fi: number, key: string) => {
      const ankle = J(ai)
      const knee = J(ki)
      const hip = J(hi)
      const foot = J(fi)
      // a kick is read from whichever the tracking sees: the foot or ankle
      // whipping, or the knee driving up past the hip line
      const tipJ = foot.vis > 0.45 && foot.speed > ankle.speed ? foot : ankle
      const leg = Math.max(ankle.speed, knee.speed, foot.speed)
      if (leg < REARM_SPEED) {
        this.armed[key] = true
        this.restPos[key] = { x: knee.x, y: knee.y, z: knee.z }
        this.restPos[key + 'f'] = { x: tipJ.x, y: tipJ.y, z: tipJ.z }
      }
      const r = this.rise[key]
      if (!r) {
        const footKick = tipJ.vis > 0.45 && tipJ.speed > KICK_SPEED * 1.3
        const kneeKick = knee.vis > 0.45 && knee.speed > KICK_SPEED && knee.vy < -KICK_SPEED * 0.5 && knee.y < hip.y + sw * 0.9
        if (this.armed[key] && (footKick || kneeKick) && t - (this.lastStrike[key] ?? -Infinity) >= KICK_REFRACTORY) {
          const j = footKick ? tipJ : knee
          this.rise[key] = { peak: j.speed, t0: t, ext: footKick ? 1 : 0, align: 0, alignW: 0 }
        }
        return
      }
      const j = r.ext > 0.5 ? tipJ : knee
      r.peak = Math.max(r.peak, j.speed)
      if (t - r.t0 > RISE_MAX_MS) {
        this.rise[key] = null
        this.armed[key] = false
        return
      }
      if (j.speed > r.peak * RELEASE) return
      this.rise[key] = null
      this.armed[key] = false
      const rest = this.restPos[r.ext > 0.5 ? key + 'f' : key] ?? { x: j.x, y: j.y, z: j.z }
      const tx = j.x - rest.x
      const ty = j.y - rest.y
      const travel = Math.hypot(tx / sw, ty / sw, j.z - rest.z)
      if (travel < KICK_TRAVEL) return
      // a strike carries its own evidence in the limb; it needs half the floor
      if (this.energy < EXPRESSION_FLOOR * 0.5) return
      this.lastStrike[key] = t
      // a kick also silences the hands for a beat
      this.lastStrike.pL = this.lastStrike.pR = t
      this.rise.pL = this.rise.pR = null
      const drive = clamp(this.root * 0.5 + Math.abs(this.lean) * 0.5, 0, 1)
      const force = clamp((r.peak - 1.4) / 5 + drive * 0.1, 0.3, 1)
      const confidence = clamp(
        (0.45 + clamp((r.peak - KICK_SPEED) / KICK_SPEED, -0.3, 0.4) + clamp((travel - KICK_TRAVEL) * 0.3, 0, 0.15)) * clamp(j.vis, 0.35, 1),
        0.05,
        1,
      )
      const m2 = Math.hypot(tx, ty)
      strikes.push({
        kind: 'kick',
        side,
        x: j.x,
        y: j.y,
        dx: m2 > 1e-4 ? tx / m2 : 0,
        dy: m2 > 1e-4 ? ty / m2 : -1,
        force,
        t,
        drive,
        confidence,
      })
    }
    if (!stalled) {
      kick('L', LM.L_ANKLE, LM.L_KNEE, LM.L_HIP, LM.L_FOOT, 'kL')
      kick('R', LM.R_ANKLE, LM.R_KNEE, LM.R_HIP, LM.R_FOOT, 'kR')
    }

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
    if (since < 340) phase = '发'
    else if (since < 1200) phase = '收'
    else if (this.stillness > 0.55) phase = '息'
    const joints: Record<string, Joint> = {}
    if (this.all.length === N_LM) for (const [k, i] of Object.entries(NAMES)) joints[k] = this.all[i]
    return {
      present,
      t,
      energy: this.energy,
      stillness: this.stillness,
      stance: this.stance,
      root: this.root,
      guard: this.guard,
      lean: this.lean,
      turn: this.turn,
      turnRate: this.turnRate,
      seize: this.seize,
      snap: this.snapNow,
      snapForce: this.snapForce,
      windup: this.windupNow,
      gated: this.energy < EXPRESSION_FLOOR,
      breath: this.breath,
      sw: this.sw,
      joints,
      all: this.all,
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
export const FIGURE: [string, string][] = [
  ['lShoulder', 'rShoulder'],
  ['lShoulder', 'lElbow'],
  ['lElbow', 'lWrist'],
  ['lWrist', 'lIndex'],
  ['rShoulder', 'rElbow'],
  ['rElbow', 'rWrist'],
  ['rWrist', 'rIndex'],
  ['lShoulder', 'lHip'],
  ['rShoulder', 'rHip'],
  ['lHip', 'rHip'],
  ['lHip', 'lKnee'],
  ['lKnee', 'lAnkle'],
  ['lAnkle', 'lFoot'],
  ['rHip', 'rKnee'],
  ['rKnee', 'rAnkle'],
  ['rAnkle', 'rFoot'],
]


// ---------------------------------------------------------- stills ------
// A single frame carries no velocity, so a photo cannot be a strike in the
// tracker's sense. For fixtures and test harnesses this reads the *shape*
// of a pose instead: an arm driven straight out is a punch pose, a leg
// raised and extended a kick pose, both hands up and in a guard. Output
// shares the strike vocabulary so the same assertions apply.

export type PoseClass = 'punch' | 'kick' | 'guard' | 'stance' | 'none'

export interface PoseReading {
  type: PoseClass
  side: Side | null
  /** 0..1 */
  confidence: number
  /** screen-space joints (mirrored), for inspection */
  joints: Record<string, Joint>
  /** shoulder width in image fractions */
  sw: number
  /** elbow angles (radians) and leg extension, for debugging fixtures */
  detail: { elbowL: number; elbowR: number; kneeL: number; kneeR: number; footLiftL: number; footLiftR: number }
}

export function classifyPose(lm: PoseLM[] | null, mirror = true): PoseReading {
  const empty: PoseReading = {
    type: 'none',
    side: null,
    confidence: 0,
    joints: {},
    sw: 0,
    detail: { elbowL: 0, elbowR: 0, kneeL: 0, kneeR: 0, footLiftL: 0, footLiftR: 0 },
  }
  if (!lm || lm.length < N_LM) return empty
  const sw = Math.hypot(lm[LM.L_SHOULDER].x - lm[LM.R_SHOULDER].x, lm[LM.L_SHOULDER].y - lm[LM.R_SHOULDER].y) || 0.2
  const J = (i: number): Joint => ({
    x: mirror ? 1 - lm[i].x : lm[i].x,
    y: lm[i].y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    vis: lm[i].visibility ?? 1,
  })
  const joints: Record<string, Joint> = {}
  for (const [k, i] of Object.entries(NAMES)) joints[k] = J(i)
  const vis = (...names: string[]) => Math.min(...names.map((n) => joints[n].vis))

  const elbow = (s: string, e: string, w: string) => angle(joints[s], joints[e], joints[w])
  const elbowL = elbow('lShoulder', 'lElbow', 'lWrist')
  const elbowR = elbow('rShoulder', 'rElbow', 'rWrist')
  const knee = (h: string, k: string, a: string) => angle(joints[h], joints[k], joints[a])
  const kneeL = knee('lHip', 'lKnee', 'lAnkle')
  const kneeR = knee('rHip', 'rKnee', 'rAnkle')
  // a lifted foot: the ankle sits well above the other ankle, in shoulder widths
  const footLiftL = (joints.rAnkle.y - joints.lAnkle.y) / sw
  const footLiftR = (joints.lAnkle.y - joints.rAnkle.y) / sw
  const detail = { elbowL, elbowR, kneeL, kneeR, footLiftL, footLiftR }

  const shoulderY = (joints.lShoulder.y + joints.rShoulder.y) / 2
  const nose = joints.nose
  const up = (w: Joint) => w.y < shoulderY + sw * 0.25 && Math.abs(w.x - nose.x) < sw * 1.3
  // guard: both hands up by the head, elbows bent
  if (up(joints.lWrist) && up(joints.rWrist) && elbowL < 2.3 && elbowR < 2.3 && vis('lWrist', 'rWrist') > 0.4) {
    const c = clamp(0.5 + (2.3 - Math.max(elbowL, elbowR)) * 0.3, 0.4, 1) * vis('lWrist', 'rWrist')
    return { type: 'guard', side: null, confidence: c, joints, sw, detail }
  }
  // kick: a leg lifted and extended
  const kickScore = (lift: number, kn: number, v: number) => (lift > 0.6 ? clamp((lift - 0.6) / 1.2, 0, 0.5) + clamp((kn - 2.0) / 1.1, 0, 0.5) : 0) * v
  const kL = kickScore(footLiftL, kneeL, vis('lAnkle', 'lKnee'))
  const kR = kickScore(footLiftR, kneeR, vis('rAnkle', 'rKnee'))
  // punch: an arm straight (elbow > ~145°) and driven out — the wrist far
  // from the shoulder and not simply hanging at the hip
  const hipY = (joints.lHip.y + joints.rHip.y) / 2
  const reach = (s: string, w: string) => Math.hypot(joints[w].x - joints[s].x, joints[w].y - joints[s].y) / sw
  const hanging = (w: string) => joints[w].y > hipY - sw * 0.35
  const punchScore = (el: number, r: number, v: number, hang: boolean) =>
    (el > 2.5 && !hang ? clamp((el - 2.5) / 0.6, 0, 0.55) + clamp((r - 1.0) / 1.2, 0, 0.45) : 0) * v
  const pL = punchScore(elbowL, reach('lShoulder', 'lWrist'), vis('lWrist', 'lElbow'), hanging('lWrist'))
  const pR = punchScore(elbowR, reach('rShoulder', 'rWrist'), vis('rWrist', 'rElbow'), hanging('rWrist'))
  const best = Math.max(kL, kR, pL, pR)
  if (best >= 0.35) {
    if (best === kL) return { type: 'kick', side: 'L', confidence: best, joints, sw, detail }
    if (best === kR) return { type: 'kick', side: 'R', confidence: best, joints, sw, detail }
    if (best === pL) return { type: 'punch', side: 'L', confidence: best, joints, sw, detail }
    return { type: 'punch', side: 'R', confidence: best, joints, sw, detail }
  }
  const present = vis('lShoulder', 'rShoulder', 'lHip', 'rHip') > 0.5
  return { type: present ? 'stance' : 'none', side: null, confidence: present ? 0.5 : 0, joints, sw, detail }
}
