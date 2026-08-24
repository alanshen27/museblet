import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getPen, PENS } from './pens'
import { playExplosion } from './audio'
import { getStrokeTexture } from './textures'

export interface DrawPoint {
  x: number
  y: number
  pressure: number
  speed: number // normalized units per second
}

/** a floating cursor projected onto the surface (e.g. a tracked fingertip) */
export interface SurfaceCursor {
  x: number
  y: number
  color: string
  active: boolean
  /** 0..1 pinch closeness — how near this finger is to activating */
  strength?: number
  /** thumbs render as the anchor/activation point */
  kind?: 'tip' | 'thumb'
}

/** a radial pen wheel summoned around an open palm */
export interface SurfaceMenu {
  x: number
  y: number
  /** index into PENS currently highlighted */
  selected: number
}

/** imperative surface API so non-pointer sources (hand tracking) can draw */
export interface DrawHandle {
  strokeStart: (id: number, penId: string, p: DrawPoint) => void
  strokeMove: (id: number, penId: string, p: DrawPoint) => void
  strokeEnd: (id: number) => void
  setCursors: (cursors: SurfaceCursor[]) => void
  setMenus: (menus: SurfaceMenu[]) => void
}

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null // 0..1 while playing
  penId: string
  onDrawPoint?: (pointerId: number, penId: string, p: DrawPoint) => void
  onDrawEnd?: (pointerId: number) => void
  handleRef?: React.RefObject<DrawHandle | null>
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

// a dot of the interactive field: anchored to a home position, pushed
// away by nearby cursors/strokes and drifting on a noise map when idle
interface FieldDot {
  hx: number // home position (0..1 of canvas)
  hy: number
  ox: number // displacement from home, in px
  oy: number
  vx: number
  vy: number
  phase: number
}

const DOT_SPACING = 56 // px between field dots
const DOT_PUSH_R = 150 // px radius within which a cursor disturbs dots

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

// rotate a hex colour around the wheel keeping its muted saturation and
// lightness, so every ball/stroke can wear its own distinct colour
function shiftHue(hex: string, deg: number): string {
  const r0 = parseInt(hex.slice(1, 3), 16) / 255
  const g0 = parseInt(hex.slice(3, 5), 16) / 255
  const b0 = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r0, g0, b0)
  const min = Math.min(r0, g0, b0)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let hue = 0
  if (d !== 0) {
    if (max === r0) hue = 60 * (((g0 - b0) / d + 6) % 6)
    else if (max === g0) hue = 60 * ((b0 - r0) / d + 2)
    else hue = 60 * ((r0 - g0) / d + 4)
  }
  hue = (hue + deg + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const xx = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let rr = 0
  let gg = 0
  let bb = 0
  if (hue < 60) [rr, gg, bb] = [c, xx, 0]
  else if (hue < 120) [rr, gg, bb] = [xx, c, 0]
  else if (hue < 180) [rr, gg, bb] = [0, c, xx]
  else if (hue < 240) [rr, gg, bb] = [0, xx, c]
  else if (hue < 300) [rr, gg, bb] = [xx, 0, c]
  else [rr, gg, bb] = [c, 0, xx]
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rr)}${to(gg)}${to(bb)}`
}

// hue (degrees) of a hex colour — picks which scene lives inside a stroke
function hueOfHex(hex: string): number {
  const r0 = parseInt(hex.slice(1, 3), 16) / 255
  const g0 = parseInt(hex.slice(3, 5), 16) / 255
  const b0 = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r0, g0, b0)
  const d = max - Math.min(r0, g0, b0)
  if (d === 0) return 0
  let hue = 0
  if (max === r0) hue = 60 * (((g0 - b0) / d + 6) % 6)
  else if (max === g0) hue = 60 * ((b0 - r0) / d + 2)
  else hue = 60 * ((r0 - g0) / d + 4)
  return hue
}

function glowOf(hex: string, alpha = 0.45): string {
  const r0 = parseInt(hex.slice(1, 3), 16)
  const g0 = parseInt(hex.slice(3, 5), 16)
  const b0 = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r0},${g0},${b0},${alpha})`
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
const smoothCache = new WeakMap<
  Pt[],
  { count: number; head: Pt; pts: Pt[] }
>()

// comet trail: while drawing, the stroke's tail is eaten away so only a
// ribbon of this many points follows the hand
const TRAIL_POINTS = 70

// aurora curtains: wide muted-colour glows drifting slowly across the dark
const AURORA = [
  { y: 0.18, r: 0.5, color: '#3d5a52', alpha: 0.1, driftX: 0.05, driftY: 0.03, phase: 0.4 },
  { y: 0.1, r: 0.6, color: '#4a3d5e', alpha: 0.08, driftX: 0.037, driftY: 0.021, phase: 2.1 },
  { y: 0.3, r: 0.45, color: '#5e4a3d', alpha: 0.07, driftX: 0.028, driftY: 0.041, phase: 4.4 },
  { y: 0.22, r: 0.55, color: '#3d4a5e', alpha: 0.09, driftX: 0.045, driftY: 0.026, phase: 5.6 },
]

// Catmull-Rom resampling: turns raw pointer points into a flowing curve
function smoothPoints(raw: Pt[], subdiv = 8): Pt[] {
  const cached = smoothCache.get(raw)
  if (cached && cached.count === raw.length && cached.head === raw[0])
    return cached.pts
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
  smoothCache.set(raw, { count: raw.length, head: pts[0] ?? raw[0], pts: out })
  return out
}

export default function DrawSurface({
  strokes,
  onStrokesChange,
  playheadX,
  penId,
  onDrawPoint,
  onDrawEnd,
  handleRef,
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
  const fieldDots = useRef<FieldDot[]>([])
  const fieldSize = useRef({ w: 0, h: 0 })
  const hover = useRef<{ x: number; y: number } | null>(null)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const onStrokesChangeRef = useRef(onStrokesChange)
  onStrokesChangeRef.current = onStrokesChange
  const onDrawPointRef = useRef(onDrawPoint)
  onDrawPointRef.current = onDrawPoint
  const onDrawEndRef = useRef(onDrawEnd)
  onDrawEndRef.current = onDrawEnd
  // projected cursor dots (tracked fingertips hovering over the surface)
  const cursors = useRef<SurfaceCursor[]>([])
  // radial pen wheels summoned by a fist
  const menus = useRef<SurfaceMenu[]>([])
  const playheadRef = useRef(playheadX)
  const prevPlayheadRef = useRef<number | null>(null)
  playheadRef.current = playheadX

  const spawnBurst = (x: number, y: number, color: string, big: boolean) => {
    const n = big ? 90 : 8
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (big ? 6.5 : 1.2) * (0.25 + Math.random())
      // fireworks: mostly pen-coloured sparks with a few white-hot ones
      const spark = big && Math.random() < 0.3 ? '#f3efe4' : color
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.9,
        size: big ? 3 + Math.random() * 6.5 : 1.5 + Math.random() * 2.5,
        life: 1,
        decay: big ? 0.006 + Math.random() * 0.008 : 0.03,
        color: spark,
      })
    }
    if (big) {
      rings.current.push({ x, y, r: 4, life: 1, color })
      rings.current.push({ x, y, r: 1, life: 1.2, color: '#f3efe4' })
      rings.current.push({ x, y, r: 12, life: 0.8, color })
      // delayed crackle: a second smaller wave of sparks
      setTimeout(() => {
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2
          const s = 2.5 * (0.3 + Math.random())
          particles.current.push({
            x: x + (Math.random() - 0.5) * 60,
            y: y + (Math.random() - 0.5) * 60,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - 0.4,
            size: 1.5 + Math.random() * 3,
            life: 1,
            decay: 0.015,
            color: Math.random() < 0.5 ? '#f3efe4' : color,
          })
        }
      }, 180)
      playExplosion(1)
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

    // generative backdrop: aurora curtains drifting high in the dark,
    // ocean swells breathing along the bottom — barely-there light
    g.globalCompositeOperation = 'lighter'
    const t0 = now / 1000
    for (let i = 0; i < AURORA.length; i++) {
      const a = AURORA[i]
      const cx = (0.5 + 0.42 * Math.sin(t0 * a.driftX + a.phase)) * w
      const cy = (a.y + 0.08 * Math.sin(t0 * a.driftY + a.phase * 2)) * h
      const breathe = 0.75 + 0.25 * Math.sin(t0 * 0.23 + a.phase * 3)
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, a.r * Math.min(w, h))
      grad.addColorStop(0, a.color)
      grad.addColorStop(1, `${a.color.slice(0, 7)}00`)
      g.globalAlpha = a.alpha * breathe
      g.save()
      g.translate(cx, cy)
      g.scale(2.6, 0.8) // stretched wide: curtain, not spotlight
      g.translate(-cx, -cy)
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.restore()
    }
    // wavy currents: soft undulating lines of light flowing through the
    // room, layered beneath the dot field
    for (let i = 0; i < 6; i++) {
      const baseY = h * ((i + 0.5) / 6 + 0.04 * Math.sin(t0 * 0.06 + i * 2.1))
      const amp = h * (0.04 + 0.03 * Math.sin(i * 1.4 + t0 * 0.045))
      const speed = 0.07 + (i % 3) * 0.04
      const grad = g.createLinearGradient(0, 0, w, 0)
      const col = i % 2 === 0 ? '#5a6f8a' : '#4a5e78'
      grad.addColorStop(0, `${col}00`)
      grad.addColorStop(0.5, col)
      grad.addColorStop(1, `${col}00`)
      g.globalAlpha = 0.045 + 0.02 * Math.sin(t0 * 0.17 + i)
      g.strokeStyle = grad
      g.lineWidth = h * 0.025
      g.lineCap = 'round'
      g.beginPath()
      for (let x = 0; x <= w; x += 16) {
        const y =
          baseY +
          amp * Math.sin((x / w) * Math.PI * 2.2 + t0 * speed * Math.PI * 2 + i * 1.9) +
          amp * 0.5 * Math.sin((x / w) * Math.PI * 5.5 - t0 * speed * 2.6 + i)
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    // interactive dot field: a grid of faint dots that scatter away from
    // your cursor/fingertips as you move, and drift on a slowly wandering
    // noise map when left alone
    if (
      fieldSize.current.w !== w ||
      fieldSize.current.h !== h ||
      fieldDots.current.length === 0
    ) {
      fieldSize.current = { w, h }
      fieldDots.current = []
      for (let gy = DOT_SPACING / 2; gy < h; gy += DOT_SPACING) {
        for (let gx = DOT_SPACING / 2; gx < w; gx += DOT_SPACING) {
          fieldDots.current.push({
            hx: gx / w,
            hy: gy / h,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            phase: Math.random() * Math.PI * 2,
          })
        }
      }
    }
    // things that disturb the field: hover pointer, hand cursors,
    // and the live tip of every active stroke
    const pokes: { x: number; y: number }[] = []
    if (hover.current) pokes.push({ x: hover.current.x * w, y: hover.current.y * h })
    for (const c of cursors.current) pokes.push({ x: c.x * w, y: c.y * h })
    for (const s of activeStrokes.current.values()) {
      const p = s.points[s.points.length - 1]
      if (p) pokes.push({ x: p.x * w, y: p.y * h })
    }
    for (const d of fieldDots.current) {
      const hx = d.hx * w
      const hy = d.hy * h
      let disturbed = 0
      for (const p of pokes) {
        const dx = hx + d.ox - p.x
        const dy = hy + d.oy - p.y
        const dist = Math.hypot(dx, dy)
        if (dist < DOT_PUSH_R && dist > 0.001) {
          const f = (1 - dist / DOT_PUSH_R) ** 2 * 2.2
          d.vx += (dx / dist) * f
          d.vy += (dy / dist) * f
          disturbed = Math.max(disturbed, 1 - dist / DOT_PUSH_R)
        }
      }
      // idle: wander on a smooth noise map that itself drifts over time
      const nx =
        Math.sin(d.hx * 5.3 + t0 * 0.21 + d.phase) +
        0.6 * Math.sin(d.hy * 8.1 - t0 * 0.13)
      const ny =
        Math.cos(d.hy * 4.7 - t0 * 0.17 + d.phase) +
        0.6 * Math.cos(d.hx * 7.3 + t0 * 0.11)
      d.vx += (nx * 9 - d.ox) * 0.004
      d.vy += (ny * 9 - d.oy) * 0.004
      d.vx *= 0.9
      d.vy *= 0.9
      d.ox += d.vx
      d.oy += d.vy
      const excite = Math.min(1, Math.hypot(d.vx, d.vy) / 3 + disturbed)
      g.globalAlpha = 0.05 + excite * 0.3
      g.fillStyle = excite > 0.25 ? '#8fa8c8' : '#5a6f8a'
      g.beginPath()
      g.arc(hx + d.ox, hy + d.oy, 1.1 + excite * 1.6, 0, Math.PI * 2)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1

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

    // released strokes keep being eaten tail-first until nothing is left,
    // so lifting the pen lets the comet finish its journey and vanish
    const activeSet = new Set(activeStrokes.current.values())
    for (const s of strokesRef.current) {
      if (!activeSet.has(s) && s.points.length > 0) {
        s.points.shift()
        s.points.shift()
      }
    }

    // strokes: gradient ribbons of light that lift the dark room
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const px = playheadRef.current
    for (const s of strokesRef.current) {
      if (s.points.length < 2) continue
      const pen = getPen(s.pen)
      // each stroke wears its own hue spun off the pen's colour family
      const cA = s.hue ? shiftHue(pen.color, s.hue) : pen.color
      const cB = s.hue ? shiftHue(pen.colorB, s.hue) : pen.colorB
      const cGlow = s.hue ? glowOf(cA, 0.45) : pen.glow
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
      pool.addColorStop(0, cGlow)
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
            (r2 - Math.floor(r2)) < 0.25 ? '#efe9dd' : cA
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
        spawnDrop(p.x * w, p.y * h, cA)
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
      grad.addColorStop(0, cA)
      grad.addColorStop(1, cB)

      const nearBeam =
        px !== null
          ? Math.max(
              0,
              1 - Math.abs((pts[Math.floor(n / 2)]?.x ?? 0) - px) * 10,
            )
          : 0
      const alpha = Math.min(1, baseAlpha + nearBeam * 0.5) * flicker

      // soft glow beneath the body
      g.shadowColor = cGlow
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

      // a little scene lives inside each stroke, chosen by its colour:
      // stars in blue marks, embers in warm ones, fireflies in green,
      // drifting petals in pink/violet — clipped to the ribbon body
      {
        const hueDeg = hueOfHex(cA)
        g.save()
        trace()
        g.clip()
        g.globalCompositeOperation = 'lighter'
        g.shadowBlur = 0
        // fal.ai-generated abstract texture for this colour family, when
        // available — tiled across the ribbon; motifs still dance on top
        const tex = getStrokeTexture(hueDeg)
        if (tex) {
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (const p of pts) {
            minX = Math.min(minX, p.x * w)
            minY = Math.min(minY, p.y * h)
            maxX = Math.max(maxX, p.x * w)
            maxY = Math.max(maxY, p.y * h)
          }
          g.globalAlpha = alpha * 0.9
          const T = 512
          for (let tx = minX - 80; tx < maxX + 80; tx += T) {
            for (let ty = minY - 80; ty < maxY + 80; ty += T) {
              g.drawImage(tex, tx, ty, T, T)
            }
          }
        }
        for (let i = 3; i < n - 3; i += 9) {
          const p = pts[i]
          const r1 = Math.sin(i * 12.9898 + s.bornAt) * 43758.5453
          const f1 = r1 - Math.floor(r1)
          const r2 = Math.sin(i * 78.233 + s.bornAt) * 12543.123
          const f2 = r2 - Math.floor(r2)
          const mx = p.x * w + (f1 - 0.5) * 36
          const my = p.y * h + (f2 - 0.5) * 36
          const tw = 0.5 + 0.5 * Math.sin(now / 300 + i * 1.7 + f1 * 6)
          if (hueDeg >= 175 && hueDeg < 290) {
            // night sky: tiny four-point stars twinkle in blue strokes
            const sz = 1.5 + f1 * 3
            g.globalAlpha = alpha * tw * 0.9
            g.strokeStyle = '#f5f2ff'
            g.lineWidth = 1
            g.beginPath()
            g.moveTo(mx - sz, my)
            g.lineTo(mx + sz, my)
            g.moveTo(mx, my - sz)
            g.lineTo(mx, my + sz)
            g.stroke()
            softMote(g, mx, my, sz * 1.6, '#cfe0ff', alpha * tw * 0.6)
          } else if (hueDeg < 65 || hueDeg >= 330) {
            // warm: embers rising slowly through the mark
            const rise = (now / 28 + i * 13) % 60
            softMote(
              g,
              mx,
              my - rise * 0.5,
              1.5 + f2 * 2.5,
              '#ffb36b',
              alpha * tw * 0.8,
            )
          } else if (hueDeg < 175) {
            // green: fireflies wandering inside the stroke
            const wx = Math.sin(now / 500 + i) * 10
            const wy = Math.cos(now / 700 + i * 2) * 8
            softMote(
              g,
              mx + wx,
              my + wy,
              2 + f1 * 2,
              '#d8ffb0',
              alpha * (0.25 + tw * 0.65),
            )
          } else {
            // violet/pink: petals drifting gently downward
            const fall = (now / 40 + i * 17) % 50
            g.globalAlpha = alpha * 0.7 * tw
            g.fillStyle = '#ffd9ec'
            g.beginPath()
            g.ellipse(
              mx,
              my + fall * 0.35,
              3 + f1 * 2,
              1.4 + f2,
              now / 900 + i,
              0,
              Math.PI * 2,
            )
            g.fill()
          }
        }
        g.restore()
      }

      if (pen.style === 'sparkle') {
        g.shadowBlur = 0
        g.fillStyle = cA
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
        const burstColor = s.hue ? shiftHue(pen.color, s.hue) : pen.color
        for (const p of s.points) {
          const crossed =
            prev !== null && prev <= px
              ? p.x > prev && p.x <= px
              : Math.abs(p.x - px) < 0.004
          if (crossed && Math.random() < 0.35) {
            spawnBurst(p.x * w, p.y * h, burstColor, Math.random() < 0.3)
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
      const t = (now - b.born) / 850
      if (t >= 1) {
        spawnBurst(b.x, b.y, b.color, true)
        continue
      }
      aliveBlobs.push(b)
      // swell dramatically, quivering harder just before detonation
      const r = b.size * (0.5 + t * t * 2.6)
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

    // projected fingertip cursors: orbs of light hovering on the surface.
    // The thumb is the activation point; as a finger pinches toward it, a
    // ring contracts onto the orb and lights up at the moment of contact.
    g.globalCompositeOperation = 'lighter'
    for (const c of cursors.current) {
      const cx = c.x * w
      const cy = c.y * h
      const pulse = 0.75 + 0.25 * Math.sin(now / 220 + cx)
      if (c.kind === 'thumb') {
        // anchor: a small steady pearl with a faint halo
        softMote(g, cx, cy, 10, '#e8e3d8', 0.5, 0.25)
        g.globalAlpha = 0.35
        g.strokeStyle = '#e8e3d8'
        g.lineWidth = 1
        g.beginPath()
        g.arc(cx, cy, 16, 0, Math.PI * 2)
        g.stroke()
        continue
      }
      const s = c.strength ?? 0
      const r = c.active ? 26 : (14 + s * 8) * pulse
      // aura + hot core
      softMote(g, cx, cy, r * 2.2, c.color, (c.active ? 0.35 : 0.15) + s * 0.15, 0.15)
      softMote(g, cx, cy, r, c.color, c.active ? 1 : 0.55 + s * 0.3)
      // approach ring: contracts onto the orb as the pinch closes
      if (!c.active) {
        g.globalAlpha = 0.25 + s * 0.5
        g.strokeStyle = c.color
        g.lineWidth = 1.2 + s * 1.5
        g.beginPath()
        g.arc(cx, cy, r + 26 * (1 - s), 0, Math.PI * 2)
        g.stroke()
      } else {
        // lit: a crisp bright ring hugging the orb
        g.globalAlpha = 0.9
        g.strokeStyle = '#fffaf0'
        g.lineWidth = 1.6
        g.beginPath()
        g.arc(cx, cy, r + 4, 0, Math.PI * 2)
        g.stroke()
      }
    }

    // radial pen wheel: swatches orbiting an open palm, rotate to highlight
    for (const m of menus.current) {
      const mx = m.x * w
      const my = m.y * h
      const R = Math.min(w, h) * 0.12
      g.globalAlpha = 0.2
      g.strokeStyle = '#e8e3d8'
      g.lineWidth = 1
      g.beginPath()
      g.arc(mx, my, R, 0, Math.PI * 2)
      g.stroke()
      PENS.forEach((pen, i) => {
        const a = -Math.PI / 2 + (i / PENS.length) * Math.PI * 2
        const px = mx + Math.cos(a) * R
        const py = my + Math.sin(a) * R
        const sel = i === m.selected
        const pulse = 0.85 + 0.15 * Math.sin(now / 180 + i)
        softMote(g, px, py, sel ? 30 * pulse : 12, pen.color, sel ? 1 : 0.4)
        if (sel) {
          g.globalAlpha = 0.9
          g.strokeStyle = '#fffaf0'
          g.lineWidth = 1.6
          g.beginPath()
          g.arc(px, py, 20 * pulse, 0, Math.PI * 2)
          g.stroke()
        }
      })
      // centre: the currently highlighted colour glows in the palm
      softMote(g, mx, my, 16, PENS[m.selected].color, 0.8)
    }
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1

    // fully dissolved strokes leave the canvas (and the music)
    const living = strokesRef.current.filter(
      (s) =>
        s.points.length > 1 && now - s.bornAt < LINGER_MS + DISSOLVE_MS,
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

  // shared stroke lifecycle: pointer events and hand tracking both land here
  const strokeStart = useCallback(
    (id: number, pid: string, p0: DrawPoint) => {
      const pen = getPen(pid)
      const canvas = canvasRef.current
      onDrawPointRef.current?.(id, pid, p0)
      // firework pen dabs: drop a blob, no stroke
      if (pen.tool === 'firework' && canvas) {
        // every ball gets its own distinct colour
        const tint = shiftHue(pen.color, Math.random() * 360)
        blobs.current.push({
          x: p0.x * canvas.width,
          y: p0.y * canvas.height,
          color: tint,
          glow: glowOf(tint, 0.5),
          born: performance.now(),
          size: 14 + p0.pressure * 20,
        })
        return
      }
      const stroke: Stroke = {
        points: [p0],
        pen: pid,
        bornAt: performance.now(),
        hue: Math.random() * 360,
      }
      activeStrokes.current.set(id, stroke)
      onStrokesChangeRef.current([...strokesRef.current, stroke])
    },
    [],
  )

  const strokeMove = useCallback((id: number, pid: string, p: DrawPoint) => {
    const stroke = activeStrokes.current.get(id)
    if (!stroke) return
    stroke.points.push(p)
    while (stroke.points.length > TRAIL_POINTS) stroke.points.shift()
    stroke.bornAt = performance.now()
    onDrawPointRef.current?.(id, pid, p)
    const canvas = canvasRef.current
    const pen = getPen(pid)
    if (canvas) {
      const tint = stroke.hue ? shiftHue(pen.color, stroke.hue) : pen.color
      if (pen.tool === 'chalk') {
        spawnChalk(p.x * canvas.width, p.y * canvas.height, tint, 4)
      } else if (pen.tool !== 'rain') {
        spawnTrail(p.x * canvas.width, p.y * canvas.height, tint)
      }
    }
    onStrokesChangeRef.current([...strokesRef.current])
  }, [])

  const strokeEnd = useCallback((id: number) => {
    activeStrokes.current.delete(id)
    pointerState.current.delete(id)
    onDrawEndRef.current?.(id)
  }, [])

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      strokeStart,
      strokeMove,
      strokeEnd,
      setCursors: (c) => {
        cursors.current = c
      },
      setMenus: (m) => {
        menus.current = m
      },
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, strokeStart, strokeMove, strokeEnd])

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
        strokeStart(e.pointerId, penId, toPoint(e))
      }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        hover.current = {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        }
        if (!activeStrokes.current.has(e.pointerId)) return
        strokeMove(e.pointerId, penId, toPoint(e))
      }}
      onPointerLeave={() => {
        hover.current = null
      }}
      onPointerUp={(e) => strokeEnd(e.pointerId)}
      onPointerCancel={(e) => strokeEnd(e.pointerId)}
    />
  )
}
