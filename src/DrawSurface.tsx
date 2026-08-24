import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getPen } from './pens'

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null // 0..1 while playing
  penId: string
  onDrawPoint?: (
    pointerId: number,
    p: {
      x: number
      y: number
      pressure: number
      speed: number // normalized units per second
    },
  ) => void
  onDrawEnd?: (pointerId: number) => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  decay: number
  color: string
  kind?: 'spark' | 'chalk' | 'drop'
}

// a firework dab: a blob that swells, then bursts into sparks
interface Blob_ {
  x: number
  y: number
  color: string
  glow: string
  born: number
  size: number
}

interface Ring {
  x: number
  y: number
  r: number
  life: number
  color: string
}

interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  size: number
}

// strokes settle, linger as ghosts, then dissolve to make way for new marks
const SETTLE_MS = 3000
const GHOST_ALPHA = 0.35
const LINGER_MS = 5000
const DISSOLVE_MS = 3000

interface Pt {
  x: number
  y: number
  pressure: number
}

// a luminous mote: soft-edged radial glow instead of a hard-edged dot,
// so particles read as embers/powder/light rather than metal flakes
function softMote(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
  core = 0.35,
) {
  if (r <= 0 || alpha <= 0) return
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, 'rgba(255,250,240,0.9)')
  grad.addColorStop(core, color)
  grad.addColorStop(1, `${color}00`)
  g.globalAlpha = alpha
  g.fillStyle = grad
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

// moving-average pass: irons out hand jitter before curve fitting
function relaxPoints(pts: Pt[], passes = 4): Pt[] {
  let cur = pts
  for (let p = 0; p < passes; p++) {
    if (cur.length < 5) break
    const next: Pt[] = [cur[0]]
    for (let i = 1; i < cur.length - 1; i++) {
      next.push({
        x: (cur[i - 1].x + cur[i].x * 2 + cur[i + 1].x) / 4,
        y: (cur[i - 1].y + cur[i].y * 2 + cur[i + 1].y) / 4,
        pressure:
          (cur[i - 1].pressure + cur[i].pressure * 2 + cur[i + 1].pressure) / 4,
      })
    }
    next.push(cur[cur.length - 1])
    cur = next
  }
  return cur
}

// smoothed-path cache so long strokes aren't recomputed every frame
const smoothCache = new WeakMap<Pt[], { count: number; pts: Pt[] }>()

// Catmull-Rom resampling: turns raw pointer points into a flowing curve
function smoothPoints(raw: Pt[], subdiv = 8): Pt[] {
  const cached = smoothCache.get(raw)
  if (cached && cached.count === raw.length) return cached.pts
  const pts = relaxPoints(raw)
  if (pts.length < 3) return pts
  const out: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let j = 0; j < subdiv; j++) {
      const t = j / subdiv
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
      })
    }
  }
  out.push(pts[pts.length - 1])
  smoothCache.set(raw, { count: raw.length, pts: out })
  return out
}

export default function DrawSurface({
  strokes,
  onStrokesChange,
  playheadX,
  penId,
  onDrawPoint,
  onDrawEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // multi-touch: each active pointer draws (and sings) its own stroke
  const activeStrokes = useRef(new Map<number, Stroke>())
  const pointerState = useRef(
    new Map<
      number,
      {
        last: { x: number; y: number; t: number } | null
        weight: number
        speed: number
      }
    >(),
  )
  const particles = useRef<Particle[]>([])
  const rings = useRef<Ring[]>([])
  const blobs = useRef<Blob_[]>([])
  const dust = useRef<Dust[]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const onStrokesChangeRef = useRef(onStrokesChange)
  onStrokesChangeRef.current = onStrokesChange
  const playheadRef = useRef(playheadX)
  const prevPlayheadRef = useRef<number | null>(null)
  playheadRef.current = playheadX

  const spawnBurst = (x: number, y: number, color: string, big: boolean) => {
    const n = big ? 36 : 8
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (big ? 3.6 : 1.2) * (0.3 + Math.random())
      // fireworks: mostly pen-coloured sparks with a few white-hot ones
      const spark = big && Math.random() < 0.3 ? '#f3efe4' : color
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        size: big ? 2.5 + Math.random() * 4.5 : 1.5 + Math.random() * 2.5,
        life: 1,
        decay: big ? 0.008 + Math.random() * 0.01 : 0.03,
        color: spark,
      })
    }
    if (big) {
      rings.current.push({ x, y, r: 4, life: 1, color })
      rings.current.push({ x, y, r: 1, life: 1.2, color: '#f3efe4' })
    }
  }

  const spawnTrail = (x: number, y: number, color: string) => {
    for (let i = 0; i < 2; i++) {
      particles.current.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.35,
        size: 0.8 + Math.random() * 1.6,
        life: 1,
        decay: 0.018,
        color,
      })
    }
  }

  // chalk: a handful of powder thrown at the surface — scatters, then settles
  const spawnChalk = (x: number, y: number, color: string, amount: number) => {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.4 + Math.random() * 2.4
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 4,
        life: 1,
        decay: 0.003 + Math.random() * 0.004,
        color,
        kind: 'chalk',
      })
    }
  }

  // rain: drops falling from the stroke, splashing as they die
  const spawnDrop = (x: number, y: number, color: string) => {
    particles.current.push({
      x: x + (Math.random() - 0.5) * 14,
      y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 1.2 + Math.random() * 1.6,
      size: 1 + Math.random() * 1.6,
      life: 1,
      decay: 0.006 + Math.random() * 0.006,
      color,
      kind: 'drop',
    })
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    const { width: w, height: h } = canvas
    const now = performance.now()

    g.clearRect(0, 0, w, h)

    // heavy room: vignette pressing in from the edges
    const vignette = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.25,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
    g.fillStyle = vignette
    g.fillRect(0, 0, w, h)

    // ambient glittering dust
    if (dust.current.length === 0 && w > 0) {
      for (let i = 0; i < 90; i++) {
        dust.current.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          phase: Math.random() * Math.PI * 2,
          size: 0.5 + Math.random() * 1.4,
        })
      }
    }
    for (const d of dust.current) {
      d.x = (d.x + d.vx + w) % w
      d.y = (d.y + d.vy + h) % h
      const tw = 0.5 + 0.5 * Math.sin(now / 700 + d.phase)
      g.globalAlpha = 0.02 + tw * 0.1
      g.fillStyle = '#e8e3d8'
      g.beginPath()
      g.arc(d.x, d.y, d.size * (0.6 + tw * 0.6), 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1

    // strokes: gradient ribbons of light that lift the dark room
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const px = playheadRef.current
    for (const s of strokesRef.current) {
      if (s.points.length < 2) continue
      const pen = getPen(s.pen)
      const age = now - s.bornAt
      const settle = Math.min(1, age / SETTLE_MS)
      let baseAlpha = 1 - settle * (1 - GHOST_ALPHA)
      // after lingering, the mark slowly dissolves back into the dark
      if (age > LINGER_MS) {
        baseAlpha *= Math.max(0, 1 - (age - LINGER_MS) / DISSOLVE_MS)
      }
      if (baseAlpha <= 0) continue
      const flicker =
        pen.style === 'flicker' ? 0.85 + 0.15 * Math.sin(now / 130) : 1

      // pool of light the stroke casts into the room
      const first = s.points[0]
      const last = s.points[s.points.length - 1]
      const cx = ((first.x + last.x) / 2) * w
      const cy = ((first.y + last.y) / 2) * h
      const reach = Math.max(
        60,
        Math.hypot((last.x - first.x) * w, (last.y - first.y) * h),
      )
      const pool = g.createRadialGradient(cx, cy, 0, cx, cy, reach)
      pool.addColorStop(0, pen.glow)
      pool.addColorStop(1, 'rgba(0,0,0,0)')
      g.globalAlpha = 0.1 * baseAlpha
      g.fillStyle = pool
      g.fillRect(cx - reach, cy - reach, reach * 2, reach * 2)
      g.globalAlpha = 1

      // chalk strokes are powdery stipple, not a ribbon
      if (pen.tool === 'chalk') {
        const pts = smoothPoints(s.points)
        g.shadowBlur = 0
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]
          // deterministic scatter so the powder doesn't shimmer per frame
          const r1 = Math.sin(i * 12.9898 + s.bornAt) * 43758.5453
          const r2 = Math.sin(i * 78.233 + s.bornAt) * 12543.123
          const ox = (r1 - Math.floor(r1) - 0.5) * 26 * p.pressure
          const oy = (r2 - Math.floor(r2) - 0.5) * 26 * p.pressure
          const r3 = Math.sin(i * 3.7 + s.bornAt) * 9631.77
          const size = 1.5 + (r3 - Math.floor(r3)) * 4.5
          const dotColor =
            (r2 - Math.floor(r2)) < 0.25 ? '#efe9dd' : pen.color
          softMote(
            g,
            p.x * w + ox,
            p.y * h + oy,
            size,
            dotColor,
            baseAlpha * (0.08 + (r1 - Math.floor(r1)) * 0.3),
            0.2,
          )
        }
        g.globalAlpha = 1
        continue
      }

      // rain strokes: a thin silver seam in the sky that keeps raining
      if (pen.tool === 'rain' && age < LINGER_MS && Math.random() < 0.5) {
        const p = s.points[Math.floor(Math.random() * s.points.length)]
        spawnDrop(p.x * w, p.y * h, pen.color)
      }

      // variable-width ribbon polygon (perfect-freehand style): offset the
      // centreline by a per-point half-width and fill the closed outline,
      // so the mark reads as one calligraphic brush stroke
      const pts = smoothPoints(s.points)
      if (pts.length < 2) continue
      const n = pts.length
      const left: number[] = []
      const right: number[] = []
      for (let i = 0; i < n; i++) {
        const p = pts[i]
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(n - 1, i + 1)]
        let dx = (next.x - prev.x) * w
        let dy = (next.y - prev.y) * h
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        const t = i / (n - 1)
        // tapered tips, wide confident body — a guiding gesture, not a scribble
        const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.4)
        const thin = pen.tool === 'rain' ? 0.35 : 1
        const half = ((18 + p.pressure * 52) * pen.lineWidth * taper * thin) / 2
        left.push(p.x * w - dy * half, p.y * h + dx * half)
        right.push(p.x * w + dy * half, p.y * h - dx * half)
      }

      const trace = () => {
        g.beginPath()
        g.moveTo(left[0], left[1])
        for (let i = 1; i < n; i++) g.lineTo(left[i * 2], left[i * 2 + 1])
        for (let i = n - 1; i >= 0; i--) g.lineTo(right[i * 2], right[i * 2 + 1])
        g.closePath()
      }

      const x0 = pts[0].x * w
      const y0 = pts[0].y * h
      const x1 = pts[n - 1].x * w
      const y1 = pts[n - 1].y * h
      const grad = g.createLinearGradient(x0, y0, x1, y1)
      grad.addColorStop(0, pen.color)
      grad.addColorStop(1, pen.colorB)

      const nearBeam =
        px !== null
          ? Math.max(
              0,
              1 - Math.abs((pts[Math.floor(n / 2)]?.x ?? 0) - px) * 10,
            )
          : 0
      const alpha = Math.min(1, baseAlpha + nearBeam * 0.5) * flicker

      // soft glow beneath the body
      g.shadowColor = pen.glow
      g.shadowBlur = pen.style === 'soft' ? 30 : 18
      g.globalAlpha = alpha * 0.45
      g.fillStyle = grad
      trace()
      g.fill()

      // solid body
      g.shadowBlur = pen.style === 'crisp' ? 2 : 8
      g.globalAlpha = alpha * 0.9
      trace()
      g.fill()

      if (pen.style === 'sparkle') {
        g.shadowBlur = 0
        g.fillStyle = pen.color
        for (let i = 0; i < s.points.length; i += 5) {
          const p = s.points[i]
          const tw = 0.5 + 0.5 * Math.sin(now / 110 + i)
          g.globalAlpha = tw * baseAlpha
          g.beginPath()
          g.arc(p.x * w, p.y * h, 1 + tw * 2.2, 0, Math.PI * 2)
          g.fill()
        }
      }
      g.globalAlpha = 1
      g.shadowBlur = 0
    }

    // explosions where the beam sweeps across strokes
    if (px !== null) {
      const prev = prevPlayheadRef.current
      for (const s of strokesRef.current) {
        const pen = getPen(s.pen)
        for (const p of s.points) {
          const crossed =
            prev !== null && prev <= px
              ? p.x > prev && p.x <= px
              : Math.abs(p.x - px) < 0.004
          if (crossed && Math.random() < 0.35) {
            spawnBurst(p.x * w, p.y * h, pen.color, Math.random() < 0.3)
          }
        }
      }
      prevPlayheadRef.current = px

      // beam
      const x = px * w
      const beam = g.createLinearGradient(x - 36, 0, x + 2, 0)
      beam.addColorStop(0, 'rgba(232,227,216,0)')
      beam.addColorStop(1, 'rgba(232,227,216,0.08)')
      g.fillStyle = beam
      g.fillRect(x - 36, 0, 38, h)
      g.strokeStyle = 'rgba(232,227,216,0.55)'
      g.shadowColor = 'rgba(232,227,216,0.5)'
      g.shadowBlur = 10
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.stroke()
      g.shadowBlur = 0
    } else {
      prevPlayheadRef.current = null
    }

    // firework dabs: blobs swell with light, then burst
    const aliveBlobs: Blob_[] = []
    for (const b of blobs.current) {
      const t = (now - b.born) / 650
      if (t >= 1) {
        spawnBurst(b.x, b.y, b.color, true)
        continue
      }
      aliveBlobs.push(b)
      const r = b.size * (0.5 + t * 1.3)
      const glow = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 3)
      glow.addColorStop(0, b.glow)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      g.globalAlpha = 0.5 + t * 0.5
      g.fillStyle = glow
      g.fillRect(b.x - r * 3, b.y - r * 3, r * 6, r * 6)
      g.fillStyle = b.color
      g.shadowColor = b.glow
      g.shadowBlur = 18
      g.beginPath()
      g.arc(b.x, b.y, r * (1 + 0.08 * Math.sin(now / 40)), 0, Math.PI * 2)
      g.fill()
      g.shadowBlur = 0
    }
    blobs.current = aliveBlobs
    g.globalAlpha = 1

    // expanding rings
    const aliveRings: Ring[] = []
    for (const r of rings.current) {
      r.r += 3.2
      r.life -= 0.03
      if (r.life <= 0) continue
      aliveRings.push(r)
      g.globalAlpha = r.life * 0.25
      g.strokeStyle = r.color
      g.shadowColor = r.color
      g.shadowBlur = 12
      g.lineWidth = 1 + r.life * 1.5
      g.beginPath()
      g.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      g.stroke()
    }
    rings.current = aliveRings
    g.shadowBlur = 0

    // particles / glitter — drawn additively so they read as light
    g.globalCompositeOperation = 'lighter'
    const alive: Particle[] = []
    for (const p of particles.current) {
      if (p.kind === 'chalk') {
        // powder decelerates and settles instead of flying off
        p.vx *= 0.92
        p.vy = p.vy * 0.92 + 0.015
      } else if (p.kind === 'drop') {
        p.vy += 0.06
      } else {
        p.vy += 0.008
      }
      p.x += p.vx
      p.y += p.vy
      p.life -= p.decay
      if (p.kind === 'drop' && (p.life <= 0 || p.y > h)) {
        // splash: two tiny short-lived flecks
        for (const dir of [-1, 1]) {
          alive.push({
            x: p.x,
            y: Math.min(p.y, h - 2),
            vx: dir * (0.3 + Math.random() * 0.6),
            vy: -(0.4 + Math.random() * 0.6),
            size: 0.7 + Math.random(),
            life: 0.5,
            decay: 0.04,
            color: p.color,
          })
        }
        continue
      }
      if (p.life <= 0) continue
      alive.push(p)
      if (p.kind === 'drop') {
        // a misty falling streak: gradient tail fading in from above
        const tail = p.vy * 7
        const streak = g.createLinearGradient(p.x, p.y - tail, p.x, p.y)
        streak.addColorStop(0, `${p.color}00`)
        streak.addColorStop(1, p.color)
        g.globalAlpha = p.life * 0.45
        g.strokeStyle = streak
        g.lineCap = 'round'
        g.lineWidth = p.size
        g.beginPath()
        g.moveTo(p.x, p.y - tail)
        g.lineTo(p.x, p.y)
        g.stroke()
        softMote(g, p.x, p.y, p.size * 1.6, p.color, p.life * 0.35)
        continue
      }
      const tw = 0.6 + 0.4 * Math.sin(now / 80 + p.x)
      softMote(
        g,
        p.x,
        p.y,
        p.size * (p.kind === 'chalk' ? 1 : 1.6) * (0.4 + p.life * 0.6),
        p.color,
        p.life * tw * (p.kind === 'chalk' ? 0.5 : 0.85),
        p.kind === 'chalk' ? 0.15 : 0.35,
      )
    }
    particles.current = alive
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.shadowBlur = 0

    // fully dissolved strokes leave the canvas (and the music)
    const living = strokesRef.current.filter(
      (s) => now - s.bornAt < LINGER_MS + DISSOLVE_MS,
    )
    if (living.length !== strokesRef.current.length) {
      onStrokesChangeRef.current(living)
    }
  }, [])

  // continuous render loop for fades, dust, and particles
  useEffect(() => {
    let raf = 0
    const loop = () => {
      redraw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * devicePixelRatio
      canvas.height = rect.height * devicePixelRatio
      dust.current = []
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    // real-pen feel: without true pressure, derive weight from speed —
    // slow deliberate movement lays down ink, fast flicks thin out
    const state = pointerState.current.get(e.pointerId) ?? {
      last: null,
      weight: 0.5,
      speed: 0,
    }
    const now = performance.now()
    if (state.last) {
      const dist = Math.hypot(x - state.last.x, y - state.last.y)
      const dt = Math.max(1, now - state.last.t)
      const speed = (dist * 1000) / dt // normalized units per second
      state.speed += (speed - state.speed) * 0.3
      const target = Math.min(1, Math.max(0.12, 1 - speed * 1.6))
      state.weight += (target - state.weight) * 0.25
    }
    state.last = { x, y, t: now }
    pointerState.current.set(e.pointerId, state)
    const pressure =
      e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : state.weight
    return { x, y, pressure, speed: state.speed }
  }

  const endPointer = (pointerId: number) => {
    activeStrokes.current.delete(pointerId)
    pointerState.current.delete(pointerId)
    onDrawEnd?.(pointerId)
  }

  return (
    <canvas
      ref={canvasRef}
      className="draw-surface"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pointerState.current.set(e.pointerId, {
          last: null,
          weight: 0.5,
          speed: 0,
        })
        const p0 = toPoint(e)
        const pen = getPen(penId)
        const canvas = canvasRef.current
        onDrawPoint?.(e.pointerId, p0)
        // firework pen dabs: drop a blob, no stroke
        if (pen.tool === 'firework' && canvas) {
          blobs.current.push({
            x: p0.x * canvas.width,
            y: p0.y * canvas.height,
            color: pen.color,
            glow: pen.glow,
            born: performance.now(),
            size: 6 + p0.pressure * 10,
          })
          return
        }
        const stroke: Stroke = {
          points: [p0],
          pen: penId,
          bornAt: performance.now(),
        }
        activeStrokes.current.set(e.pointerId, stroke)
        onStrokesChange([...strokes, stroke])
      }}
      onPointerMove={(e) => {
        const stroke = activeStrokes.current.get(e.pointerId)
        if (!stroke) return
        const p = toPoint(e)
        stroke.points.push(p)
        stroke.bornAt = performance.now()
        onDrawPoint?.(e.pointerId, p)
        const canvas = canvasRef.current
        const pen = getPen(penId)
        if (canvas) {
          if (pen.tool === 'chalk') {
            spawnChalk(p.x * canvas.width, p.y * canvas.height, pen.color, 4)
          } else if (pen.tool !== 'rain') {
            spawnTrail(p.x * canvas.width, p.y * canvas.height, pen.color)
          }
        }
        onStrokesChange([...strokes])
      }}
      onPointerUp={(e) => endPointer(e.pointerId)}
      onPointerCancel={(e) => endPointer(e.pointerId)}
    />
  )
}
