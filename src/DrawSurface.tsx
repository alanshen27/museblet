import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getPen } from './pens'

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null // 0..1 while playing
  penId: string
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

// strokes settle from a bright flash into a subtle ghost over this long
const SETTLE_MS = 6000
const GHOST_ALPHA = 0.35

export default function DrawSurface({
  strokes,
  onStrokesChange,
  playheadX,
  penId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const currentStroke = useRef<Stroke | null>(null)
  const particles = useRef<Particle[]>([])
  const rings = useRef<Ring[]>([])
  const dust = useRef<Dust[]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const playheadRef = useRef(playheadX)
  const prevPlayheadRef = useRef<number | null>(null)
  playheadRef.current = playheadX

  const spawnBurst = (x: number, y: number, color: string, big: boolean) => {
    const n = big ? 18 : 6
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (big ? 2.5 : 1.2) * (0.4 + Math.random())
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        size: big ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 1.5,
        life: 1,
        decay: big ? 0.016 : 0.03,
        color,
      })
    }
    if (big) rings.current.push({ x, y, r: 4, life: 1, color })
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

    // barely-there grid
    g.strokeStyle = 'rgba(255,255,255,0.018)'
    g.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      g.beginPath()
      g.moveTo(0, (i / 8) * h)
      g.lineTo(w, (i / 8) * h)
      g.stroke()
    }
    for (let i = 1; i < 16; i++) {
      g.beginPath()
      g.moveTo((i / 16) * w, 0)
      g.lineTo((i / 16) * w, h)
      g.stroke()
    }

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
      const baseAlpha = 1 - settle * (1 - GHOST_ALPHA)
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

      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1]
        const b = s.points[i]
        // taper toward the ends for a brush feel
        const t = i / s.points.length
        const taper = Math.sin(Math.PI * Math.min(1, t * 1.05))
        const width = (1.5 + b.pressure * 9) * pen.lineWidth * (0.35 + taper * 0.65)
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
        g.globalAlpha = alpha * 0.18
        g.strokeStyle = pen.color
        g.shadowColor = pen.glow
        g.shadowBlur = pen.style === 'soft' ? 26 : 14
        g.lineWidth = width * 2.6
        g.beginPath()
        g.moveTo(a.x * w, a.y * h)
        g.lineTo(b.x * w, b.y * h)
        g.stroke()

        // gradient core
        g.globalAlpha = alpha * 0.9
        g.strokeStyle = grad
        g.shadowBlur = pen.style === 'crisp' ? 2 : 7
        g.lineWidth = width
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
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="draw-surface"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        currentStroke.current = {
          points: [toPoint(e)],
          pen: penId,
          bornAt: performance.now(),
        }
        onStrokesChange([...strokes, currentStroke.current])
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !currentStroke.current) return
        const p = toPoint(e)
        currentStroke.current.points.push(p)
        currentStroke.current.bornAt = performance.now()
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
