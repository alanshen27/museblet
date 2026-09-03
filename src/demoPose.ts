// The ghost performer: a scripted body for rooms without a camera. It
// produces the same 33 image + world landmarks MediaPipe would, so the
// whole pipeline (tracker, instruments, 3D body, clouds) runs unchanged.
// It follows the piece: breath in 起, brushwork in 承, fists and feet in
// 转, a long settling in 合.

import { LM, N_LM, type PoseLM } from './sanda'

interface V3 {
  x: number
  y: number
  z: number
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// a sharp attack and a slower return: 0 → 1 in `up`, back to 0 by `up + down`
function pulse(t: number, up: number, down: number) {
  if (t < 0) return 0
  if (t < up) return ease(t / up)
  if (t < up + down) return 1 - ease((t - up) / down)
  return 0
}

/** body dimensions in metres, hips at the origin, y down, z toward camera negative */
const SW = 0.38
const HIP_W = 0.24
const TORSO = 0.5
const UPPER_ARM = 0.3
const FOREARM = 0.27
const THIGH = 0.45
const SHIN = 0.43

interface Arms {
  L: V3
  R: V3
  bendL: number
  bendR: number
}

// the performer remembers where its hands were, for the section blends
const memo = {
  section: -1,
  from: null as Arms | null,
  last: null as Arms | null,
  since: 9,
  lastT: 0,
  stanceW: 0.26,
  crouch: 0.02,
}

export interface DemoFrame {
  landmarks: PoseLM[]
  world: PoseLM[]
}

/**
 * @param tSec seconds since the piece opened
 * @param section 0..3 (起承转合)
 */
/**
 * @param tSec seconds since the piece opened
 * @param section 0..3 (起承转合)
 * @param sectionSec seconds since this section began — poses blend across
 *   the change so the hands never teleport (a teleport reads as a punch)
 */
export function demoPose(tSec: number, section: number, sectionSec = tSec): DemoFrame {
  const t = tSec
  const breath = Math.sin(t * 0.55) // ~11 s cycle
  const sway = Math.sin(t * 0.31) * 0.02
  const W: V3[] = Array.from({ length: N_LM }, () => v(0, 0, 0))

  // stance: feet widen in the later sections, the body sits a little lower;
  // the feet shift there over a couple of seconds rather than jumping
  const stanceTarget = section >= 2 ? 0.42 : section === 1 ? 0.34 : 0.26
  const crouchTarget = section >= 2 ? 0.08 : 0.02
  const dtm = Math.max(0, Math.min(0.1, tSec - memo.lastT))
  memo.stanceW += (stanceTarget - memo.stanceW) * Math.min(1, dtm * 0.9)
  memo.crouch += (crouchTarget - memo.crouch) * Math.min(1, dtm * 0.9)
  const stanceW = memo.stanceW
  const crouch = memo.crouch
  const hipY = 0 + crouch
  W[LM.L_HIP] = v(HIP_W / 2 + sway, hipY, 0)
  W[LM.R_HIP] = v(-HIP_W / 2 + sway, hipY, 0)
  // shoulders rise with the breath, torso turns with the sway
  const turn = Math.sin(t * 0.2) * 0.06
  const shY = hipY - TORSO + breath * 0.012
  W[LM.L_SHOULDER] = v(SW / 2 + sway * 0.6, shY, -turn)
  W[LM.R_SHOULDER] = v(-SW / 2 + sway * 0.6, shY, turn)
  const neck = v(sway * 0.6, shY - 0.08, 0)
  W[LM.NOSE] = v(neck.x, neck.y - 0.14, -0.06)
  W[LM.L_EYE] = v(neck.x + 0.035, neck.y - 0.17, -0.05)
  W[LM.R_EYE] = v(neck.x - 0.035, neck.y - 0.17, -0.05)
  W[LM.L_EAR] = v(neck.x + 0.08, neck.y - 0.15, 0.02)
  W[LM.R_EAR] = v(neck.x - 0.08, neck.y - 0.15, 0.02)
  for (const i of [1, 3, 4, 6, 9, 10]) W[i] = v(neck.x + (i < 5 ? 0.02 : -0.02), neck.y - 0.14, -0.05)

  // legs: standing, with a kick in 转 every ~9 s
  const kickPhase = section === 2 ? (sectionSec % 9.3) - 6.1 : -1
  const kick = pulse(kickPhase, 0.22, 0.5)
  const legs = (side: 1 | -1, hip: V3, kicking: number, hipI: number, kneeI: number, ankleI: number, heelI: number, footI: number) => {
    void hipI
    const kneeStand = v(hip.x + side * (stanceW - HIP_W) * 0.5, hip.y + THIGH - crouch * 0.5, -crouch * 0.6)
    const ankleStand = v(hip.x + side * (stanceW - HIP_W), hip.y + THIGH + SHIN - crouch, 0)
    // the kick: knee drives up and forward, foot whips toward the lens
    const kneeKick = v(hip.x + side * 0.05, hip.y + 0.05, -0.42)
    const ankleKick = v(hip.x - side * 0.05, hip.y + 0.1, -0.86)
    const knee = v(lerp(kneeStand.x, kneeKick.x, kicking), lerp(kneeStand.y, kneeKick.y, kicking), lerp(kneeStand.z, kneeKick.z, kicking))
    const ankle = v(lerp(ankleStand.x, ankleKick.x, kicking), lerp(ankleStand.y, ankleKick.y, kicking), lerp(ankleStand.z, ankleKick.z, kicking))
    W[kneeI] = knee
    W[ankleI] = ankle
    W[heelI] = v(ankle.x, ankle.y + 0.03, ankle.z + 0.06)
    W[footI] = v(ankle.x + side * 0.02, ankle.y + 0.04 * (1 - kicking), ankle.z - 0.16)
  }
  legs(1, W[LM.L_HIP], 0, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.L_HEEL, LM.L_FOOT)
  legs(-1, W[LM.R_HIP], kick, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE, LM.R_HEEL, LM.R_FOOT)

  // arms
  const arm = (
    side: 1 | -1,
    shoulder: V3,
    wristTarget: V3,
    elbowBend: number,
    wristI: number,
    elbowI: number,
    pinkyI: number,
    indexI: number,
    thumbI: number,
  ) => {
    // place the elbow on the way to the wrist, bent outward by elbowBend
    const dx = wristTarget.x - shoulder.x
    const dy = wristTarget.y - shoulder.y
    const dz = wristTarget.z - shoulder.z
    const len = Math.hypot(dx, dy, dz) || 1
    const reach = Math.min(len, UPPER_ARM + FOREARM - 0.01)
    const ux = dx / len
    const uy = dy / len
    const uz = dz / len
    const wrist = v(shoulder.x + ux * reach, shoulder.y + uy * reach, shoulder.z + uz * reach)
    // elbow offset perpendicular (outward and down) so the arm bends
    const mid = 0.5 * reach
    const bend = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - mid * mid)) * (0.6 + elbowBend * 0.4)
    const elbow = v(shoulder.x + ux * mid + side * bend * 0.7, shoulder.y + uy * mid + bend * 0.5, shoulder.z + uz * mid + bend * 0.3)
    W[elbowI] = elbow
    W[wristI] = wrist
    W[pinkyI] = v(wrist.x + ux * 0.08 - side * 0.02, wrist.y + uy * 0.08, wrist.z + uz * 0.08)
    W[indexI] = v(wrist.x + ux * 0.09 + side * 0.02, wrist.y + uy * 0.09, wrist.z + uz * 0.09)
    W[thumbI] = v(wrist.x + ux * 0.05 + side * 0.03, wrist.y + uy * 0.05 - 0.02, wrist.z + uz * 0.05 - 0.02)
  }

  // resting hands: hanging by the hips, a little forward
  const restL = v(W[LM.L_HIP].x + 0.1, hipY + 0.12, -0.1)
  const restR = v(W[LM.R_HIP].x - 0.1, hipY + 0.12, -0.1)
  // guard: fists up by the face
  const guardL = v(0.12, shY - 0.05, -0.28)
  const guardR = v(-0.12, shY - 0.02, -0.26)

  const armsFor = (sec: number, st: number): Arms => {
    if (sec <= 0) {
      // 起: the hands hang; late in the opening the left rises slowly
      const rise = Math.max(0, Math.min(1, (st - 12) / 8))
      return {
        L: v(lerp(restL.x, 0.3, rise), lerp(restL.y, shY + 0.1, rise), lerp(restL.z, -0.35, rise)),
        R: restR,
        bendL: 0.5,
        bendR: 0.5,
      }
    }
    if (sec === 1) {
      // 承: brushwork — slow arcs of the left hand (qin), the right joining
      const ph = t * 0.45
      const ph2 = t * 0.33 + 1.7
      return {
        L: v(0.32 * Math.cos(ph) + 0.05, shY + 0.05 + 0.18 * Math.sin(ph * 0.7), -0.38),
        R: v(-0.3 - 0.12 * Math.cos(ph2), shY + 0.12 + 0.15 * Math.sin(ph2), -0.34),
        bendL: 0.3,
        bendR: 0.4,
      }
    }
    if (sec === 2) {
      // 转: guard, and punches — a cross every ~1.9 s alternating hands,
      // with a double from the right on every third
      let L = guardL
      let R = guardR
      let bendL = 0.9
      let bendR = 0.9
      const period = 1.9
      const k = Math.floor(st / period)
      const pt = st - k * period
      const right = k % 2 === 0
      const p = pulse(pt - 0.6, 0.12, 0.28)
      const pd = k % 3 === 2 ? pulse(pt - 1.25, 0.11, 0.25) : 0
      const crossL = v(-0.08, shY - 0.02, -0.72)
      const crossR = v(0.1, shY - 0.03, -0.74)
      if (right) {
        R = v(lerp(guardR.x, crossR.x, p), lerp(guardR.y, crossR.y, p), lerp(guardR.z, crossR.z, p))
        bendR = 0.9 - p * 0.9
      } else {
        L = v(lerp(guardL.x, crossL.x, p), lerp(guardL.y, crossL.y, p), lerp(guardL.z, crossL.z, p))
        bendL = 0.9 - p * 0.9
      }
      if (pd > 0) {
        R = v(lerp(guardR.x, crossR.x, pd), lerp(guardR.y, crossR.y, pd), lerp(guardR.z, crossR.z, pd))
        bendR = 0.9 - pd * 0.9
      }
      if (kick > 0.05) {
        // arms open for balance during the kick
        L = v(0.3, shY, -0.1)
        R = v(-0.34, shY + 0.05, 0.05)
      }
      return { L, R, bendL, bendR }
    }
    // 合: the hands come down slowly, palms opening, then rest
    const settle = Math.min(1, st / 14)
    return {
      L: v(lerp(0.25, restL.x, settle), lerp(shY + 0.05, restL.y, settle), lerp(-0.3, restL.z, settle)),
      R: v(lerp(-0.25, restR.x, settle), lerp(shY + 0.08, restR.y, settle), lerp(-0.3, restR.z, settle)),
      bendL: 0.5,
      bendR: 0.5,
    }
  }
  const cur = armsFor(section, sectionSec)
  // a section change eases out of wherever the hands actually were, so the
  // performer never teleports (the tracker would read that as a punch)
  if (section !== memo.section) {
    memo.section = section
    memo.from = memo.last
    memo.since = 0
  }
  let targetL = cur.L
  let targetR = cur.R
  let bendL = cur.bendL
  let bendR = cur.bendR
  if (memo.from && memo.since < 2.6) {
    const prev = memo.from
    const k = ease(memo.since / 2.6)
    targetL = v(lerp(prev.L.x, cur.L.x, k), lerp(prev.L.y, cur.L.y, k), lerp(prev.L.z, cur.L.z, k))
    targetR = v(lerp(prev.R.x, cur.R.x, k), lerp(prev.R.y, cur.R.y, k), lerp(prev.R.z, cur.R.z, k))
    bendL = lerp(prev.bendL, cur.bendL, k)
    bendR = lerp(prev.bendR, cur.bendR, k)
  }
  memo.since += Math.max(0, Math.min(0.1, tSec - memo.lastT))
  memo.lastT = tSec
  memo.last = { L: targetL, R: targetR, bendL, bendR }

  arm(1, W[LM.L_SHOULDER], targetL, bendL, LM.L_WRIST, LM.L_ELBOW, LM.L_PINKY, LM.L_INDEX, LM.L_THUMB)
  arm(-1, W[LM.R_SHOULDER], targetR, bendR, LM.R_WRIST, LM.R_ELBOW, LM.R_PINKY, LM.R_INDEX, LM.R_THUMB)

  // project to the image: a camera ~2.6 m back, the figure framed head to
  // toe. A webcam frame is a photograph — the subject's left (+x here) lands
  // on the image's right — and the tracker mirrors it into the selfie view
  const camZ = 2.6
  const f = 1.15
  const landmarks: PoseLM[] = W.map((p) => {
    const depth = camZ + p.z
    const px = (p.x * f) / depth
    const py = ((p.y + 0.15) * f) / depth
    return { x: 0.5 + px, y: 0.5 + py, z: p.z, visibility: 1 }
  })
  const world: PoseLM[] = W.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: 1 }))
  return { landmarks, world }
}
