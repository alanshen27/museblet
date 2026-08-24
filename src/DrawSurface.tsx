import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getPen } from './pens'

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null // 0..1 while playing
  penId: string
  onDrawPoint?: (p: { x: number; y: number; pressure: number }) => void
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
const SETTLE_MS = 6000
const GHOST_ALPHA = 0.4
const LINGER_MS = 30000
const DISSOLVE_MS = 12000

interface Pt {
  x: number
  y: number
  pressure: number
}

// moving-average pass: irons out hand jitter before curve fitting
function relaxPoints(pts: Pt[], passes = 2): Pt[] {
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

// Catmull-Rom resampling: turns raw pointer points into a flowing curve
function smoothPoints(raw: Pt[], subdiv = 8): Pt[] {
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
  return out
}

export default function DrawSurface({
  strokes,
  onStrokesChange,
  playheadX,
  penId,
  onDrawPoint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const currentStroke = useRef<Stroke | null>(null)
  const particles = useRef<Particle[]>([])
  const rings = useRef<Ring[]>([])
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
        size: big ? 1.2 + Math.random() * 2.8 : 1 + Math.random() * 1.5,
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

      const pts = smoothPoints(s.points)
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        // taper toward the ends for a brush feel
        const t = i / pts.length
        const taper = Math.sin(Math.PI * Math.min(1, t * 1.05))
        // organic swell: width breathes along the curve like a brush lifting
        const swell = 0.75 + 0.25 * Math.sin(t * Math.PI * 3 + s.bornAt)
        const width =
          (6 + b.pressure * 26) * pen.lineWidth * (0.25 + taper * 0.75) * swell
        // near the playhead, the stroke gently brightens
        const nearBeam =
          px !== null ? Math.max(0, 1 - Math.abs(b.x - px) * 18) : 0
        const alpha = Math.min(1, baseAlpha + nearBeam * 0.7) * flicker

        // gradient along the stroke: head colour easing into tail colour
        const grad = g.createLinearGradient(a.x * w, a.y * h, b.x * w, b.y * h)
        const mixT = t
        grad.addColorStop(0, mixT < 0.5 ? pen.color : pen.colorB)
        grad.addColorStop(1, mixT < 0.5 ? pen.colorB : pen.color)

        // soft halo
        g.globalAlpha = alpha * 0.14
        g.strokeStyle = pen.color
        g.shadowColor = pen.glow
        g.shadowBlur = pen.style === 'soft' ? 26 : 14
        g.lineWidth = width * 1.9
        g.beginPath()
        g.moveTo(a.x * w, a.y * h)
        g.lineTo(b.x * w, b.y * h)
        g.stroke()

        // painterly body: layered bristle ribbons offset across the path
        const dx = b.x * w - a.x * w
        const dy = b.y * h - a.y * h
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        g.shadowBlur = pen.style === 'crisp' ? 2 : 6
        for (let bi = 0; bi < 4; bi++) {
          const off = (bi / 3 - 0.5) * width * 0.7
          const wob = Math.sin(t * Math.PI * 5 + bi * 2.1 + s.bornAt) * width * 0.12
          const o = off + wob
          g.globalAlpha = alpha * (bi === 1 || bi === 2 ? 0.55 : 0.3)
          g.strokeStyle = grad
          g.lineWidth = width * (0.55 - Math.abs(bi / 3 - 0.5) * 0.35)
          g.beginPath()
          g.moveTo(a.x * w + nx * o, a.y * h + ny * o)
          g.lineTo(b.x * w + nx * o, b.y * h + ny * o)
          g.stroke()
        }

        // bright wet centre
        g.globalAlpha = alpha * 0.85
        g.strokeStyle = grad
        g.lineWidth = width * 0.45
        g.beginPath()
        g.moveTo(a.x * w, a.y * h)
        g.lineTo(b.x * w, b.y * h)
        g.stroke()
      }

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

    // expanding rings
    const aliveRings: Ring[] = []
    for (const r of rings.current) {
      r.r += 3.2
      r.life -= 0.03
      if (r.life <= 0) continue
      aliveRings.push(r)
      g.globalAlpha = r.life * 0.6
      g.strokeStyle = r.color
      g.lineWidth = 1.5 + r.life * 2
      g.beginPath()
      g.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      g.stroke()
    }
    rings.current = aliveRings

    // particles / glitter
    const alive: Particle[] = []
    for (const p of particles.current) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.008
      p.life -= p.decay
      if (p.life <= 0) continue
      alive.push(p)
      const tw = 0.6 + 0.4 * Math.sin(now / 80 + p.x)
      g.globalAlpha = p.life * tw
      g.fillStyle = p.color
      g.shadowColor = p.color
      g.shadowBlur = 6
      g.beginPath()
      g.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      g.fill()
    }
    particles.current = alive
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

  const lastMove = useRef<{ x: number; y: number; t: number } | null>(null)
  const penWeight = useRef(0.5)

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    // real-pen feel: without true pressure, derive weight from speed —
    // slow deliberate movement lays down ink, fast flicks thin out
    let pressure: number
    if (e.pressure > 0 && e.pressure !== 0.5) {
      pressure = e.pressure
    } else {
      const now = performance.now()
      const prev = lastMove.current
      if (prev) {
        const dist = Math.hypot(x - prev.x, y - prev.y)
        const dt = Math.max(1, now - prev.t)
        const speed = (dist * 1000) / dt // normalized units per second
        const target = Math.min(1, Math.max(0.12, 1 - speed * 1.6))
        penWeight.current += (target - penWeight.current) * 0.25
      }
      lastMove.current = { x, y, t: now }
      pressure = penWeight.current
    }
    return { x, y, pressure }
  }

  return (
    <canvas
      ref={canvasRef}
      className="draw-surface"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        lastMove.current = null
        penWeight.current = 0.5
        const p0 = toPoint(e)
        currentStroke.current = {
          points: [p0],
          pen: penId,
          bornAt: performance.now(),
        }
        onDrawPoint?.(p0)
        onStrokesChange([...strokes, currentStroke.current])
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !currentStroke.current) return
        const p = toPoint(e)
        currentStroke.current.points.push(p)
        currentStroke.current.bornAt = performance.now()
        onDrawPoint?.(p)
        const canvas = canvasRef.current
        if (canvas) {
          spawnTrail(p.x * canvas.width, p.y * canvas.height, getPen(penId).color)
        }
        onStrokesChange([...strokes])
      }}
      onPointerUp={() => {
        drawing.current = false
        currentStroke.current = null
      }}
    />
  )
}
