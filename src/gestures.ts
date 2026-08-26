export interface GesturePoint {
  x: number
  y: number
  pressure: number
  speed: number
}

export type Shape = 'dot' | 'line' | 'rise' | 'fall' | 'circle' | 'zigzag'

export interface Gesture {
  shape: Shape
  /** normalized y at the start / end / centre of the mark */
  y0: number
  y1: number
  midY: number
  /** total path length in canvas fractions */
  length: number
  avgPressure: number
  avgSpeed: number
}

/**
 * Read a finished stroke as a musical word. The geometry of the mark —
 * not just where the hand happened to wander — decides what it says:
 *
 *   dot     a tap or tiny mark        → a single accent
 *   line    a level horizontal stroke → a held drone
 *   rise    a stroke that climbs      → an ascending lead run
 *   fall    a stroke that descends    → a descending lead run
 *   circle  a closed loop             → a repeating ostinato motif
 *   zigzag  rapid up-down switchbacks → a rhythmic pattern
 */
export function classifyStroke(pts: GesturePoint[]): Gesture {
  const first = pts[0]
  const last = pts[pts.length - 1]
  let length = 0
  let minX = first.x
  let maxX = first.x
  let minY = first.y
  let maxY = first.y
  let pressure = 0
  let speed = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (i > 0) length += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
    pressure += p.pressure
    speed += p.speed
  }
  const midY = (minY + maxY) / 2
  const base: Omit<Gesture, 'shape'> = {
    y0: first.y,
    y1: last.y,
    midY,
    length,
    avgPressure: pressure / pts.length,
    avgSpeed: speed / pts.length,
  }

  if (pts.length < 6 || length < 0.04) return { shape: 'dot', ...base }

  // vertical switchbacks: count sign flips of dy sampled coarsely so
  // camera jitter doesn't read as rhythm
  let flips = 0
  let lastSign = 0
  for (let i = 4; i < pts.length; i += 4) {
    const dy = pts[i].y - pts[i - 4].y
    if (Math.abs(dy) < 0.015) continue
    const sign = dy > 0 ? 1 : -1
    if (lastSign !== 0 && sign !== lastSign) flips++
    lastSign = sign
  }

  const closure = Math.hypot(last.x - first.x, last.y - first.y)
  const netDy = last.y - first.y
  const boxW = maxX - minX
  const boxH = maxY - minY

  if (closure < 0.22 * length && length > 0.3 && boxW > 0.06 && boxH > 0.06)
    return { shape: 'circle', ...base }
  if (flips >= 4) return { shape: 'zigzag', ...base }
  if (netDy < -0.12) return { shape: 'rise', ...base }
  if (netDy > 0.12) return { shape: 'fall', ...base }
  return { shape: 'line', ...base }
}
