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
  life: number
  color: string
}

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
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const playheadRef = useRef(playheadX)
  playheadRef.current = playheadX

  const spawnParticles = (x: number, y: number, color: string, n = 3) => {
    for (let i = 0; i < n; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5 - 0.4,
        life: 1,
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

    // grid
    g.strokeStyle = 'rgba(255,255,255,0.05)'
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

    // strokes, styled per pen
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const s of strokesRef.current) {
      if (s.points.length < 2) continue
      const pen = getPen(s.pen)
      const flicker =
        pen.style === 'flicker' ? 0.75 + 0.25 * Math.sin(now / 90) : 1

      g.shadowColor = pen.glow
      g.shadowBlur = pen.style === 'soft' ? 26 : pen.style === 'crisp' ? 6 : 16
      g.globalAlpha = flicker
      g.strokeStyle = pen.color

      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1]
        const b = s.points[i]
        g.lineWidth = (2 + b.pressure * 8) * pen.lineWidth
        g.beginPath()
        g.moveTo(a.x * w, a.y * h)
        g.lineTo(b.x * w, b.y * h)
        g.stroke()
      }

      if (pen.style === 'sparkle') {
        g.shadowBlur = 0
        g.fillStyle = pen.color
        for (let i = 0; i < s.points.length; i += 6) {
          const p = s.points[i]
          const tw = 0.5 + 0.5 * Math.sin(now / 120 + i)
          g.globalAlpha = tw
          g.beginPath()
          g.arc(p.x * w, p.y * h, 1.5 + tw * 2, 0, Math.PI * 2)
          g.fill()
        }
      }
      g.globalAlpha = 1
      g.shadowBlur = 0
    }

    // particles
    const alive: Particle[] = []
    for (const p of particles.current) {
      p.x += p.vx
      p.y += p.vy
      p.life -= 0.025
      if (p.life <= 0) continue
      alive.push(p)
      g.globalAlpha = p.life
      g.fillStyle = p.color
      g.beginPath()
      g.arc(p.x, p.y, 2.2 * p.life, 0, Math.PI * 2)
      g.fill()
    }
    particles.current = alive
    g.globalAlpha = 1

    // playhead beam
    const px = playheadRef.current
    if (px !== null) {
      const x = px * w
      const beam = g.createLinearGradient(x - 30, 0, x + 2, 0)
      beam.addColorStop(0, 'rgba(255,209,102,0)')
      beam.addColorStop(1, 'rgba(255,209,102,0.18)')
      g.fillStyle = beam
      g.fillRect(x - 30, 0, 32, h)
      g.strokeStyle = '#ffd166'
      g.shadowColor = 'rgba(255,209,102,0.9)'
      g.shadowBlur = 12
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.stroke()
      g.shadowBlur = 0

      // spark where the beam crosses strokes
      for (const s of strokesRef.current) {
        const pen = getPen(s.pen)
        for (const p of s.points) {
          if (Math.abs(p.x - px) < 0.004) {
            spawnParticles(p.x * w, p.y * h, pen.color, 1)
          }
        }
      }
    }
  }, [])

  // continuous render loop for glow animation and particles
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
        currentStroke.current = { points: [toPoint(e)], pen: penId }
        onStrokesChange([...strokes, currentStroke.current])
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !currentStroke.current) return
        const p = toPoint(e)
        currentStroke.current.points.push(p)
        const canvas = canvasRef.current
        if (canvas) {
          spawnParticles(
            p.x * canvas.width,
            p.y * canvas.height,
            getPen(penId).color,
            2,
          )
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
