import { JOINT_NAMES, POSE_BONES } from './poseIndices'
import type { PoseJoint } from './types'

const KEYPOINT_COLOR = '#7ee8c7'
const BONE_COLOR = '#e8c47a'
const LABEL_COLOR = '#d9f2e2'

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  joints: Record<string, PoseJoint>,
  width: number,
  height: number,
): void {
  const byIndex = new Map<number, { x: number; y: number }>()
  for (const [name, j] of Object.entries(joints)) {
    const idx = Object.entries(JOINT_NAMES).find(([, n]) => n === name)?.[0]
    if (idx) byIndex.set(Number(idx), { x: j.x * width, y: j.y * height })
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = BONE_COLOR
  ctx.lineWidth = 3
  ctx.shadowColor = BONE_COLOR
  ctx.shadowBlur = 8
  for (const [a, b] of POSE_BONES) {
    const pa = byIndex.get(a)
    const pb = byIndex.get(b)
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  ctx.shadowBlur = 12
  for (const [idx, p] of byIndex) {
    const r = idx === 0 ? 5 : 4
    ctx.fillStyle = KEYPOINT_COLOR
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
    if (import.meta.env.DEV && idx in JOINT_NAMES) {
      ctx.shadowBlur = 0
      ctx.font = '10px monospace'
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText(JOINT_NAMES[idx], p.x + 6, p.y - 4)
    }
  }
  ctx.restore()
}
