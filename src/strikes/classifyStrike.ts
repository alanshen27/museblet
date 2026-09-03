import { JOINT_NAMES, POSE } from './poseIndices'
import type { PoseJoint, StrikeClassification, StrikeScores, StrikeType } from './types'

type Landmark = { x: number; y: number; z?: number; visibility?: number }

function toJoint(lm: Landmark): PoseJoint {
  return { x: lm.x, y: lm.y, z: lm.z ?? 0, visibility: lm.visibility }
}

function dist(a: PoseJoint, b: PoseJoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angle(a: PoseJoint, b: PoseJoint, c: PoseJoint): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const denom = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y)
  if (denom < 1e-6) return 0
  const cos = Math.max(-1, Math.min(1, (ba.x * bc.x + ba.y * bc.y) / denom))
  return (Math.acos(cos) * 180) / Math.PI
}

function torsoLength(
  ls: PoseJoint,
  rs: PoseJoint,
  lh: PoseJoint,
  rh: PoseJoint,
): number {
  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: 0 }
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: 0 }
  return Math.max(0.12, dist(shoulderMid, hipMid))
}

function vis(lm: Landmark): number {
  return lm.visibility ?? 1
}

function punchScore(
  shoulder: PoseJoint,
  elbow: PoseJoint,
  wrist: PoseJoint,
  torso: number,
): number {
  const reach = dist(shoulder, wrist) / torso
  const elbowAng = angle(shoulder, elbow, wrist)
  const extension = Math.min(1, Math.max(0, (reach - 0.55) / 0.75))
  const straight = Math.min(1, Math.max(0, (elbowAng - 125) / 55))
  const forward = wrist.y < shoulder.y + torso * 0.15 ? 0.15 : 0
  return Math.min(1, extension * 0.55 + straight * 0.4 + forward)
}

function kickScore(
  hip: PoseJoint,
  knee: PoseJoint,
  ankle: PoseJoint,
  otherAnkle: PoseJoint,
  otherKnee: PoseJoint,
  torso: number,
): number {
  const ankleLift = (otherAnkle.y - ankle.y) / torso
  const kneeLift = (otherKnee.y - knee.y) / torso
  const kneeAng = angle(hip, knee, ankle)
  const height = Math.min(1, Math.max(0, (Math.max(ankleLift, kneeLift * 0.85) - 0.02) / 0.45))
  const extension = Math.min(1, Math.max(0, (kneeAng - 95) / 85))
  const reach = dist(hip, ankle) / (torso * 1.25)
  const reachScore = Math.min(1, Math.max(0, (reach - 0.55) / 0.65))
  const kneeHigh = knee.y < hip.y + torso * 0.05 ? 0.2 : 0
  return Math.min(1, height * 0.55 + extension * 0.2 + reachScore * 0.2 + kneeHigh)
}

function legLiftAsymmetry(
  lk: PoseJoint,
  rk: PoseJoint,
  la: PoseJoint,
  ra: PoseJoint,
  torso: number,
): number {
  const ankleDelta = Math.abs(la.y - ra.y) / torso
  const kneeDelta = Math.abs(lk.y - rk.y) / torso
  return Math.min(1, Math.max(ankleDelta, kneeDelta * 0.9))
}

function guardScore(
  ls: PoseJoint,
  rs: PoseJoint,
  le: PoseJoint,
  re: PoseJoint,
  lw: PoseJoint,
  rw: PoseJoint,
  nose: PoseJoint,
  torso: number,
): number {
  const leftBent = 180 - angle(ls, le, lw)
  const rightBent = 180 - angle(rs, re, rw)
  const bent = Math.min(
    Math.min(1, Math.max(0, (leftBent - 35) / 75)),
    Math.min(1, Math.max(0, (rightBent - 35) / 75)),
  )
  const leftHigh = lw.y < ls.y + torso * 0.35 ? 1 : 0.3
  const rightHigh = rw.y < rs.y + torso * 0.35 ? 1 : 0.3
  const nearFace =
    (dist(lw, nose) < torso * 0.75 ? 1 : 0) * 0.5 +
    (dist(rw, nose) < torso * 0.75 ? 1 : 0) * 0.5
  return Math.min(1, bent * 0.45 + ((leftHigh + rightHigh) / 2) * 0.35 + nearFace * 0.2)
}

function neutralScore(
  ls: PoseJoint,
  rs: PoseJoint,
  le: PoseJoint,
  re: PoseJoint,
  lw: PoseJoint,
  rw: PoseJoint,
  la: PoseJoint,
  ra: PoseJoint,
  torso: number,
  liftAsymmetry: number,
): number {
  const symmetry =
    1 -
    Math.min(
      1,
      (Math.abs(dist(ls, lw) - dist(rs, rw)) +
        Math.abs(la.y - ra.y) +
        Math.abs(lw.y - rw.y)) /
        (torso * 2),
    )
  const lowMotion = (angle(ls, le, lw) + angle(rs, re, rw)) / 2
  const relaxed = Math.min(1, Math.max(0, 1 - Math.abs(lowMotion - 145) / 80))
  const feetApart = Math.min(1, dist(la, ra) / (torso * 0.9))
  const base = symmetry * 0.4 + relaxed * 0.35 + feetApart * 0.25
  // A raised kicking leg should not read as a calm neutral stance.
  return Math.min(1, base * (1 - liftAsymmetry * 0.85))
}

function pickType(scores: StrikeScores): { type: StrikeType; confidence: number } {
  const entries = Object.entries(scores).filter(([k]) => k !== 'unknown') as [
    StrikeType,
    number,
  ][]
  entries.sort((a, b) => b[1] - a[1])
  const [best, second] = entries
  const margin = best[1] - (second?.[1] ?? 0)
  if (best[1] < 0.28) return { type: 'unknown', confidence: best[1] }
  return { type: best[0], confidence: Math.min(1, best[1] * 0.65 + margin * 0.35) }
}

/**
 * Classify a single pose frame using geometric heuristics.
 * Still images lack velocity — live webcam will layer onset detection on top.
 */
export function classifyStrikeFromLandmarks(
  landmarks: Landmark[] | undefined | null,
): StrikeClassification {
  const notes: string[] = [
    'Still-image mode: limb extension + joint angles (no velocity onset).',
  ]
  const emptyScores: StrikeScores = {
    punch: 0,
    kick: 0,
    guard: 0,
    neutral: 0,
    unknown: 1,
  }
  if (!landmarks?.length) {
    return {
      type: 'unknown',
      confidence: 0,
      joints: {},
      scores: emptyScores,
      poseDetected: false,
      notes: ['No pose landmarks returned.'],
    }
  }

  const need = [
    POSE.LEFT_SHOULDER,
    POSE.RIGHT_SHOULDER,
    POSE.LEFT_ELBOW,
    POSE.RIGHT_ELBOW,
    POSE.LEFT_WRIST,
    POSE.RIGHT_WRIST,
    POSE.LEFT_HIP,
    POSE.RIGHT_HIP,
    POSE.LEFT_KNEE,
    POSE.RIGHT_KNEE,
    POSE.LEFT_ANKLE,
    POSE.RIGHT_ANKLE,
    POSE.NOSE,
  ]
  const minVis = 0.35
  for (const i of need) {
    if (vis(landmarks[i]) < minVis) {
      notes.push(`Low visibility on ${JOINT_NAMES[i] ?? i}.`)
    }
  }

  const ls = toJoint(landmarks[POSE.LEFT_SHOULDER])
  const rs = toJoint(landmarks[POSE.RIGHT_SHOULDER])
  const le = toJoint(landmarks[POSE.LEFT_ELBOW])
  const re = toJoint(landmarks[POSE.RIGHT_ELBOW])
  const lw = toJoint(landmarks[POSE.LEFT_WRIST])
  const rw = toJoint(landmarks[POSE.RIGHT_WRIST])
  const lh = toJoint(landmarks[POSE.LEFT_HIP])
  const rh = toJoint(landmarks[POSE.RIGHT_HIP])
  const lk = toJoint(landmarks[POSE.LEFT_KNEE])
  const rk = toJoint(landmarks[POSE.RIGHT_KNEE])
  const la = toJoint(landmarks[POSE.LEFT_ANKLE])
  const ra = toJoint(landmarks[POSE.RIGHT_ANKLE])
  const nose = toJoint(landmarks[POSE.NOSE])

  const torso = torsoLength(ls, rs, lh, rh)

  const leftPunch = punchScore(ls, le, lw, torso)
  const rightPunch = punchScore(rs, re, rw, torso)
  const liftAsymmetry = legLiftAsymmetry(lk, rk, la, ra, torso)
  const leftKick = kickScore(lh, lk, la, ra, rk, torso)
  const rightKick = kickScore(rh, rk, ra, la, lk, torso)

  const punch = Math.max(leftPunch, rightPunch)
  let kick = Math.max(leftKick, rightKick)
  if (liftAsymmetry > 0.18) kick = Math.min(1, kick + liftAsymmetry * 0.25)
  const guard = guardScore(ls, rs, le, re, lw, rw, nose, torso)
  const neutral = neutralScore(ls, rs, le, re, lw, rw, la, ra, torso, liftAsymmetry)

  const scores: StrikeScores = {
    punch,
    kick,
    guard,
    neutral,
    unknown: Math.max(0, 0.35 - Math.max(punch, kick, guard, neutral)),
  }

  const { type, confidence } = pickType(scores)
  let side: 'left' | 'right' | undefined
  if (type === 'punch') side = leftPunch >= rightPunch ? 'left' : 'right'
  if (type === 'kick') side = leftKick >= rightKick ? 'left' : 'right'

  const joints: Record<string, PoseJoint> = {}
  for (const idx of need) {
    const name = JOINT_NAMES[idx]
    if (name) joints[name] = toJoint(landmarks[idx])
  }

  return {
    type,
    confidence,
    side,
    joints,
    scores,
    poseDetected: true,
    notes,
  }
}
