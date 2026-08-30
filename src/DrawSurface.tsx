import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getPen } from './pens'
import { playExplosion } from './audio'
import { getStrokeTexture } from './textures'
import {
  SIGIL_GLYPHS,
  SIGIL_GOLD,
  SIGIL_JADE,
  SIGIL_PALE,
  sigilFor,
} from './sigils'
import auroraWarmUrl from './assets/aurora_warm.webm'
import auroraCoolUrl from './assets/aurora_cool.webm'
import sealGoldAUrl from './assets/seal_gold_a.webm'
import sealGoldBUrl from './assets/seal_gold_b.webm'
import sealJadeAUrl from './assets/seal_jade_a.webm'
import sealJadeBUrl from './assets/seal_jade_b.webm'

function makeLoopVideo(src: string): HTMLVideoElement {
  const v = document.createElement('video')
  v.src = src
  v.muted = true
  v.loop = true
  v.playsInline = true
  v.play().catch(() => {
    const kick = () => {
      v.play().catch(() => {})
      window.removeEventListener('pointerdown', kick)
    }
    window.addEventListener('pointerdown', kick)
  })
  return v
}

// FAL video-generated conjuring rings: two gold and two jade variants,
// so simultaneous hands never wear the same seal
let sealVideos: HTMLVideoElement[][] | null = null
function sealVideoFor(jade: boolean, id: number): HTMLVideoElement | null {
  if (!sealVideos) {
    sealVideos = [
      [makeLoopVideo(sealGoldAUrl), makeLoopVideo(sealGoldBUrl)],
      [makeLoopVideo(sealJadeAUrl), makeLoopVideo(sealJadeBUrl)],
    ]
  }
  const v = sealVideos[jade ? 1 : 0][Math.floor(id / 2) % 2]
  return v.readyState >= 2 ? v : null
}

// FAL-generated aurora curtains, each already a forwards-backwards
// ping-pong loop: a warm amber/crimson curtain and a cool jade/teal one,
// layered several times at different scales, drifts and tints
let auroraVideos: [HTMLVideoElement, HTMLVideoElement] | null = null
function getAuroraVideos(): [HTMLVideoElement, HTMLVideoElement] {
  if (!auroraVideos) {
    auroraVideos = [makeLoopVideo(auroraWarmUrl), makeLoopVideo(auroraCoolUrl)]
  }
  return auroraVideos
}

export interface DrawPoint {
  x: number
  y: number
  pressure: number
  speed: number // normalized units per second
  /** depth: 0 = far from camera, 1 = near (tracked hand size) */
  z?: number
}

/** a floating cursor projected onto the surface (e.g. a tracked fingertip) */
export interface SurfaceCursor {
  x: number
  y: number
  color: string
  active: boolean
  /** 0..1 pinch closeness — how near this finger is to activating */
  strength?: number
  /** pointer id, so note pulses can find this cursor */
  id?: number
  /** thumbs render as the anchor/activation point */
  kind?: 'tip' | 'thumb'
  /** tracked hand size (palm span, 0..~0.3 of frame) — scales the rune ring */
  size?: number
}

/** imperative surface API so non-pointer sources (hand tracking) can draw */
export interface DrawHandle {
  strokeStart: (id: number, penId: string, p: DrawPoint) => void
  strokeMove: (id: number, penId: string, p: DrawPoint) => void
  strokeEnd: (id: number) => void
  /** drop an in-progress stroke without leaving ink (e.g. fist took over) */
  strokeCancel: (id: number) => void
  setCursors: (cursors: SurfaceCursor[]) => void
  /** throb the cursor orb of a pointer in time with a played note */
  notePulse: (id: number, strength?: number) => void
}

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null // 0..1 while playing
  penId: string
  onDrawPoint?: (pointerId: number, penId: string, p: DrawPoint) => void
  onDrawEnd?: (pointerId: number, path?: DrawPoint[], penId?: string) => void
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
  kind?: 'spark' | 'chalk' | 'drop' | 'ash' | 'fila'
}

// a boid of the background flock: drifting motes of the dark room that
// school together and scatter when a hand sweeps through them
interface Boid {
  x: number
  y: number
  vx: number
  vy: number
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
const GHOST_ALPHA = 0.45
const LINGER_MS = 14000
const DISSOLVE_MS = 6000

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

// rolling height map (roughly -1..1): drives the 3D topographic waves and
// gently warps drawn marks so they ride the same terrain
function terrainH(x: number, y: number, t: number): number {
  return (
    0.5 * Math.sin(x * 4.1 + t * 0.32 + 1.2 * Math.sin(y * 3.3 - t * 0.21)) +
    0.35 * Math.sin(y * 5.7 - t * 0.26 + Math.sin(x * 2.7 + t * 0.17)) +
    0.15 * Math.sin((x + y) * 2.3 + t * 0.14)
  )
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
const TRAIL_POINTS = 150

// aurora curtains: wide muted glows in the room's own gold/jade palette
const AURORA = [
  { y: 0.18, r: 0.5, color: '#3a2e18', alpha: 0.1, driftX: 0.05, driftY: 0.03, phase: 0.4 },
  { y: 0.1, r: 0.6, color: '#16281f', alpha: 0.08, driftX: 0.037, driftY: 0.021, phase: 2.1 },
  { y: 0.3, r: 0.45, color: '#54401c', alpha: 0.06, driftX: 0.028, driftY: 0.041, phase: 4.4 },
  { y: 0.22, r: 0.55, color: '#2e4a3c', alpha: 0.07, driftX: 0.045, driftY: 0.026, phase: 5.6 },
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
  const boids = useRef<Boid[]>([])
  // TouchDesigner-style grain field: a low-res feedback buffer where
  // colour clouds smear frame-over-frame and displaced grain rains
  // through them, blitted up soft-blurred behind everything
  const grainCv = useRef<HTMLCanvasElement | null>(null)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const frameCount = useRef(0)
  const shoots = useRef<
    { x: number; y: number; vx: number; vy: number; life: number }[]
  >([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const onStrokesChangeRef = useRef(onStrokesChange)
  onStrokesChangeRef.current = onStrokesChange
  const onDrawPointRef = useRef(onDrawPoint)
  onDrawPointRef.current = onDrawPoint
  const onDrawEndRef = useRef(onDrawEnd)
  onDrawEndRef.current = onDrawEnd
  // full (un-eaten) path of each in-flight stroke, for gesture reading
  const gesturePaths = useRef(new Map<number, { pen: string; pts: DrawPoint[] }>())
  // projected cursor dots (tracked fingertips hovering over the surface)
  const cursors = useRef<SurfaceCursor[]>([])
  // recent note hits per pointer id, so the fingertip beats with the music
  const notePulses = useRef(new Map<number, { t: number; s: number }>())
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

  // granular energy filaments: short glowing hairs bristling off the
  // stroke as it moves — the fuzzy charged look of an energy blade
  const spawnFilament = (x: number, y: number, color: string) => {
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.8 + Math.random() * 2.6
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 0.8 + Math.random() * 1.2,
        life: 0.5 + Math.random() * 0.4,
        decay: 0.035 + Math.random() * 0.03,
        color,
        kind: 'fila',
      })
    }
  }

  // snap dust: eaten stroke ends crumble into motes that drift up and
  // scatter on the wind like ash
  const spawnAsh = (x: number, y: number, color: string) => {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) {
      particles.current.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: 0.3 + Math.random() * 0.7,
        vy: -(0.2 + Math.random() * 0.6),
        size: 0.8 + Math.random() * 2.2,
        life: 1,
        decay: 0.012 + Math.random() * 0.012,
        color: Math.random() < 0.2 ? '#efe9dd' : color,
        kind: 'ash',
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

    {
      const gw = Math.max(2, w >> 1)
      const gh = Math.max(2, h >> 1)
      let cv = grainCv.current
      if (!cv || cv.width !== gw || cv.height !== gh) {
        cv = document.createElement('canvas')
        cv.width = gw
        cv.height = gh
        grainCv.current = cv
      }
      const gg = cv.getContext('2d')
      if (gg) {
        const t = now / 1000
        // feedback decay: yesterday's frame lingers as a smeared ghost
        gg.globalCompositeOperation = 'source-over'
        gg.globalAlpha = 1
        gg.fillStyle = 'rgba(6,7,10,0.075)'
        gg.fillRect(0, 0, gw, gh)
        gg.globalCompositeOperation = 'lighter'
        // slow colour clouds — the blurred masses the grain falls through
        const clouds = [
          { c: '#3a2e18', r: 0.5, sx: 0.21, sy: 0.13, ph: 0 },
          { c: '#16281f', r: 0.42, sx: 0.16, sy: 0.19, ph: 2.4 },
          { c: '#181e2c', r: 0.55, sx: 0.11, sy: 0.09, ph: 4.4 },
        ]
        for (const cl of clouds) {
          const cx = (0.5 + 0.36 * Math.sin(t * cl.sx + cl.ph)) * gw
          const cy = (0.5 + 0.32 * Math.cos(t * cl.sy + cl.ph * 1.7)) * gh
          const rr = cl.r * Math.min(gw, gh)
          const grad = gg.createRadialGradient(cx, cy, 0, cx, cy, rr)
          grad.addColorStop(0, cl.c)
          grad.addColorStop(1, `${cl.c}00`)
          gg.globalAlpha = 0.08
          gg.fillStyle = grad
          gg.fillRect(0, 0, gw, gh)
        }
        // distant galaxies: faint tilted elliptical smudges deep in the room
        const galaxies = [
          { x: 0.22, y: 0.3, r: 0.16, a: 0.05, tilt: 0.6, c: '#6b5a36' },
          { x: 0.74, y: 0.62, r: 0.2, a: 0.04, tilt: -0.9, c: '#3c5a4c' },
          { x: 0.55, y: 0.16, r: 0.11, a: 0.045, tilt: 1.8, c: '#4a4a62' },
        ]
        for (const ga of galaxies) {
          const cx = ga.x * gw
          const cy = ga.y * gh
          const rr = ga.r * Math.min(gw, gh)
          gg.save()
          gg.translate(cx, cy)
          gg.rotate(ga.tilt + t * 0.008)
          gg.scale(1, 0.36)
          const grad = gg.createRadialGradient(0, 0, 0, 0, 0, rr)
          grad.addColorStop(0, ga.c)
          grad.addColorStop(0.35, `${ga.c}66`)
          grad.addColorStop(1, `${ga.c}00`)
          gg.globalAlpha = ga.a * (0.8 + 0.2 * Math.sin(t * 0.11 + ga.tilt * 5))
          gg.fillStyle = grad
          gg.fillRect(-rr, -rr, rr * 2, rr * 2)
          gg.restore()
        }
        // the grain itself: embers drifting slowly upward through the dark,
        // with a field of pinprick stars twinkling far behind them
        for (let i = 0; i < 340; i++) {
          const r1 = Math.sin(i * 127.1 + 311.7) * 43758.5453
          const f1 = r1 - Math.floor(r1)
          const r2 = Math.sin(i * 269.5 + 183.3) * 28001.83
          const f2 = r2 - Math.floor(r2)
          const star = i % 3 === 0
          if (star) {
            // stars hold still and twinkle
            const gx = f1 * gw
            const gy = f2 * gh
            const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + f1 * 2.2) + i)
            gg.fillStyle = f2 > 0.85 ? '#e8dcc0' : '#b9c4bc'
            gg.globalAlpha = (0.04 + f1 * 0.14) * tw
            gg.fillRect(gx, gy, 1, 1)
          } else {
            // embers rise and sway like sparks off a distant fire
            const gx =
              (f1 + 0.05 * Math.sin(t * 0.5 + f2 * 12 + f1 * 5)) * gw
            const gy = ((f2 - t * (0.012 + f1 * 0.02)) % 1 + 1) % 1 * gh
            const flicker = 0.6 + 0.4 * Math.sin(t * (2 + f1 * 5) + i)
            const hot = (f1 * 7) % 1 < 0.08
            gg.fillStyle = hot ? '#ffd9a0' : f1 * 3 % 1 < 0.6 ? '#a2733a' : '#4d6b5c'
            gg.globalAlpha = (hot ? 0.22 + f2 * 0.25 : 0.05 + f2 * 0.14) * flicker
            const sz = hot ? 2 : 1
            gg.fillRect(gx, gy, sz, sz + f1 * (hot ? 2 : 1))
          }
        }
        // the field answers the hands: cursors and live stroke tips pour
        // energy into the feedback buffer, so light bleeds and smears
        // outward from wherever you are working
        const sources: { x: number; y: number; a: number; c: string }[] = []
        for (const c of cursors.current) {
          if (c.kind === 'thumb') continue
          sources.push({
            x: c.x,
            y: c.y,
            a: c.active ? 0.14 : 0.05 + (c.strength ?? 0) * 0.06,
            c: (c.id ?? 0) % 2 === 1 ? '#2e4a3c' : '#54401c',
          })
        }
        for (const s of activeStrokes.current.values()) {
          const p = s.points[s.points.length - 1]
          if (p) sources.push({ x: p.x, y: p.y, a: 0.1, c: '#4a3a1a' })
        }
        for (const src of sources) {
          const sx = src.x * gw
          const sy = src.y * gh
          const rr = gw * 0.07
          const grad = gg.createRadialGradient(sx, sy, 0, sx, sy, rr)
          grad.addColorStop(0, src.c)
          grad.addColorStop(1, `${src.c}00`)
          gg.globalAlpha = src.a
          gg.fillStyle = grad
          gg.fillRect(sx - rr, sy - rr, rr * 2, rr * 2)
        }
      }
      // blit up, soft-blurred, additively — grain becomes breathing haze
      g.save()
      g.globalCompositeOperation = 'lighter'
      g.globalAlpha = 0.55
      g.filter = 'blur(1px)'
      g.imageSmoothingEnabled = true
      g.drawImage(cv, 0, 0, w, h)
      // a second crisp pass keeps the sparkle the blur washes out
      g.globalAlpha = 0.18
      g.filter = 'none'
      g.drawImage(cv, 0, 0, w, h)
      g.restore()
    }

    // generative backdrop: aurora curtains drifting high in the dark,
    // ocean swells breathing along the bottom — barely-there light
    g.globalCompositeOperation = 'lighter'
    const t0 = now / 1000
    // strokes ride the terrain: the same height map that shapes the
    // topographic waves gently displaces every drawn mark
    const warpPt = (p: Pt): Pt => ({
      x: p.x + 0.0015 * terrainH(p.x, p.y, t0 * 0.5),
      y: p.y + 0.0035 * terrainH(p.y + 0.37, p.x + 0.61, t0 * 0.5),
      pressure: p.pressure,
    })
    {
      const [warm, cool] = getAuroraVideos()
      if (warm.readyState >= 2 || cool.readyState >= 2) {
        let driftX = 0
        let driftY = 0
        for (const c of cursors.current) {
          if (c.kind === 'thumb') continue
          driftX += (c.x - 0.5) * w * 0.045
          driftY += (c.y - 0.5) * h * 0.03
        }
        if (hover.current) {
          driftX += (hover.current.x - 0.5) * w * 0.03
          driftY += (hover.current.y - 0.5) * h * 0.02
        }
        // two full-screen curtains, cover-scaled well past the edges so no
        // frame border can ever show: the warm sky with the cool layer
        // breathing over it at its own drift/tint for the multicolour depth
        const layers: {
          v: HTMLVideoElement
          sway: number // horizontal sway speed
          alpha: number
          tint: string
          depth: number // how much the hands drag this layer
        }[] = [
          { v: warm, sway: 0.05, alpha: 0.26, tint: 'none', depth: 0.5 },
          { v: cool, sway: 0.08, alpha: 0.17, tint: 'none', depth: 0.9 },
        ]
        for (let i = 0; i < layers.length; i++) {
          const L = layers[i]
          if (L.v.readyState < 2) continue
          const breathe = 0.8 + 0.2 * Math.sin(t0 * 0.19 + i * 1.7)
          // cover: scale to fill the whole screen plus margin for the sway
          const scale =
            Math.max(w / L.v.videoWidth, h / L.v.videoHeight) * 1.12
          const dw = L.v.videoWidth * scale
          const dh = L.v.videoHeight * scale
          const cx =
            w / 2 + Math.sin(t0 * L.sway + i * 2.3) * w * 0.025 + driftX * L.depth
          const cy = h / 2 + driftY * L.depth
          g.save()
          g.globalAlpha = L.alpha * breathe
          g.filter = L.tint
          g.drawImage(L.v, cx - dw / 2, cy - dh / 2, dw, dh)
          g.filter = 'none'
          g.restore()
        }
      } else {
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
      }
    }
    // the universe behind everything: a twinkling starfield with a soft
    // milky-way band drifting diagonally through the dark
    {
      const band = g.createLinearGradient(0, h * 0.85, w, h * 0.15)
      band.addColorStop(0, '#2a251a00')
      band.addColorStop(0.42, '#332c1e10')
      band.addColorStop(0.5, '#40362218')
      band.addColorStop(0.58, '#332c1e10')
      band.addColorStop(1, '#2a251a00')
      g.globalAlpha = 1
      g.fillStyle = band
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 160; i++) {
        const r1 = Math.sin(i * 12.9898) * 43758.5453
        const f1 = r1 - Math.floor(r1)
        const r2 = Math.sin(i * 78.233) * 12543.123
        const f2 = r2 - Math.floor(r2)
        // most stars scatter everywhere; a third crowd the galactic band
        let sx = f1
        let sy = f2
        if (i % 3 === 0) {
          sy = 0.85 - sx * 0.7 + (f2 - 0.5) * 0.16
        }
        const tw = 0.5 + 0.5 * Math.sin(now / (420 + f1 * 700) + i * 1.9)
        g.globalAlpha = (0.04 + f2 * 0.14) * tw
        g.fillStyle = i % 7 === 0 ? '#e8dcc0' : i % 11 === 0 ? '#ffe9c9' : '#f3efe4'
        g.beginPath()
        g.arc(sx * w, sy * h, 0.5 + f1 * 1.3, 0, Math.PI * 2)
        g.fill()
      }
      // shooting stars: rare streaks crossing the room
      if (Math.random() < 0.004 && shoots.current.length < 2) {
        shoots.current.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.5,
          vx: (6 + Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1),
          vy: 2.5 + Math.random() * 2,
          life: 1,
        })
      }
      g.lineCap = 'round'
      for (let i = shoots.current.length - 1; i >= 0; i--) {
        const sh = shoots.current[i]
        sh.x += sh.vx
        sh.y += sh.vy
        sh.life -= 0.016
        if (sh.life <= 0) {
          shoots.current.splice(i, 1)
          continue
        }
        const trail = g.createLinearGradient(
          sh.x,
          sh.y,
          sh.x - sh.vx * 10,
          sh.y - sh.vy * 10,
        )
        trail.addColorStop(0, '#f3efe4')
        trail.addColorStop(1, '#f3efe400')
        g.strokeStyle = trail
        g.globalAlpha = 0.5 * sh.life
        g.lineWidth = 1.6
        g.beginPath()
        g.moveTo(sh.x, sh.y)
        g.lineTo(sh.x - sh.vx * 10, sh.y - sh.vy * 10)
        g.stroke()
      }
      g.globalAlpha = 1
    }
    // things that disturb the room: hover pointer, hand cursors,
    // and the live tip of every active stroke
    const pokes: { x: number; y: number }[] = []
    if (hover.current) pokes.push({ x: hover.current.x * w, y: hover.current.y * h })
    for (const c of cursors.current) pokes.push({ x: c.x * w, y: c.y * h })
    for (const s of activeStrokes.current.values()) {
      const p = s.points[s.points.length - 1]
      if (p) pokes.push({ x: p.x * w, y: p.y * h })
    }
    // boids: a school of pale motes swimming through the dark, holding a
    // loose formation until a hand sweeps through and scatters them
    if (boids.current.length === 0 && w > 0) {
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2
        boids.current.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(a) * 1.2,
          vy: Math.sin(a) * 1.2,
        })
      }
    }
    {
      const flock = boids.current
      const SEE = 90
      for (const b of flock) {
        let cx = 0
        let cy = 0
        let ax = 0
        let ay = 0
        let sx = 0
        let sy = 0
        let count = 0
        for (const o of flock) {
          if (o === b) continue
          const dx = o.x - b.x
          const dy = o.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist > SEE) continue
          count++
          cx += o.x
          cy += o.y
          ax += o.vx
          ay += o.vy
          if (dist < 26 && dist > 0.001) {
            sx -= dx / dist
            sy -= dy / dist
          }
        }
        if (count > 0) {
          b.vx += ((cx / count - b.x) * 0.0018 + (ax / count - b.vx) * 0.04 + sx * 0.08)
          b.vy += ((cy / count - b.y) * 0.0018 + (ay / count - b.vy) * 0.04 + sy * 0.08)
        }
        // the hand parts the flock: boids flee anything poking the field
        for (const p of pokes) {
          const dx = b.x - p.x
          const dy = b.y - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < 190 && dist > 0.001) {
            const f = ((1 - dist / 190) ** 2) * 1.1
            b.vx += (dx / dist) * f
            b.vy += (dy / dist) * f
          }
        }
        // idle drift current so the school keeps wandering
        b.vx += 0.015 * Math.sin(t0 * 0.2 + b.y * 0.004)
        b.vy += 0.015 * Math.cos(t0 * 0.17 + b.x * 0.004)
        const sp = Math.hypot(b.vx, b.vy) || 1
        const clamped = Math.max(0.7, Math.min(2.6, sp))
        b.vx = (b.vx / sp) * clamped
        b.vy = (b.vy / sp) * clamped
        b.x = (b.x + b.vx + w) % w
        b.y = (b.y + b.vy + h) % h
        // an elongated streak pointing along its heading
        g.globalAlpha = 0.34
        g.strokeStyle = '#c2b083'
        g.lineWidth = 1.3
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(b.x, b.y)
        g.lineTo(b.x - (b.vx / clamped) * 7, b.y - (b.vy / clamped) * 7)
        g.stroke()
        softMote(g, b.x, b.y, 2.2, '#d8c9a0', 0.22)
      }
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
    // so lifting the pen lets the comet finish its journey and vanish —
    // slowly, so the mark lingers instead of blinking out
    frameCount.current++
    const activeSet = new Set(activeStrokes.current.values())
    if (frameCount.current % 8 === 0) {
      for (const s of strokesRef.current) {
        if (!activeSet.has(s) && s.points.length > 0) {
          const eaten = s.points.shift()
          if (eaten) {
            const pen = getPen(s.pen)
            const c = s.hue ? shiftHue(pen.color, s.hue) : pen.color
            spawnAsh(eaten.x * w, eaten.y * h, c)
          }
        }
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
      g.globalAlpha = 0.16 * baseAlpha
      g.fillStyle = pool
      g.fillRect(cx - reach, cy - reach, reach * 2, reach * 2)
      g.globalAlpha = 1

      // chalk strokes are powdery stipple, not a ribbon
      if (pen.tool === 'chalk') {
        const pts = smoothPoints(s.points).map(warpPt)
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
      const pts = smoothPoints(s.points).map(warpPt)
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
        const half = ((6 + p.pressure * 16) * pen.lineWidth * taper * thin) / 2
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

      // the mark is living lightning: a jagged white-hot bolt crackling
      // along the centreline, with electric ripple arcs and forked
      // branches flickering off it
      {
        const flickFrame = Math.floor(now / 80)
        const step = Math.max(1, Math.floor(n / 30))
        // several independent bolts stacked on the same path, each with
        // its own jag seed, amplitude and flicker rate, so the stroke
        // reads as a braid of crackling arcs rather than one thin line
        const makeBolt = (seed: number, amp: number, rate: number) => {
          const arr: { x: number; y: number; nx: number; ny: number }[] = []
          const ff = Math.floor(now / rate)
          for (let i = 0; i < n; i += step) {
            const p = pts[i]
            const prev = pts[Math.max(0, i - step)]
            const nxt = pts[Math.min(n - 1, i + step)]
            let dx = (nxt.x - prev.x) * w
            let dy = (nxt.y - prev.y) * h
            const len = Math.hypot(dx, dy) || 1
            dx /= len
            dy /= len
            const r1 =
              Math.sin(i * 91.7 + seed + s.bornAt + ff * 37.3) * 43758.5453
            const f1 = r1 - Math.floor(r1)
            const edge = Math.sin((Math.min(i, n - 1) / (n - 1)) * Math.PI)
            const jag = (f1 - 0.5) * amp * edge
            arr.push({
              x: p.x * w - dy * jag,
              y: p.y * h + dx * jag,
              nx: -dy,
              ny: dx,
            })
          }
          arr.push({ x: pts[n - 1].x * w, y: pts[n - 1].y * h, nx: 0, ny: 0 })
          return arr
        }
        const bolt = makeBolt(0, 34, 80)
        const bolt2 = makeBolt(57.31, 52, 110)
        const bolt3 = makeBolt(113.7, 22, 60)
        const bolt4 = makeBolt(211.3, 78, 140)
        if (bolt.length > 2) {
          g.lineJoin = 'miter'
          g.lineCap = 'round'
          const drawPath = (b: typeof bolt) => {
            g.beginPath()
            g.moveTo(b[0].x, b[0].y)
            for (let i = 1; i < b.length; i++) g.lineTo(b[i].x, b[i].y)
            g.stroke()
          }
          const drawBolt = () => drawPath(bolt)
          // outer stray arcs: wider, dimmer siblings flickering around
          // the main channel
          g.strokeStyle = cA
          g.shadowColor = cA
          // farthest stray arc: a wide slow ghost that makes the braid
          // feel like it owns the air around it
          g.shadowBlur = 36
          g.lineWidth = 3
          g.globalAlpha = alpha * 0.16
          drawPath(bolt4)
          g.shadowBlur = 24
          g.lineWidth = 2.2
          g.globalAlpha = alpha * 0.28
          drawPath(bolt2)
          g.lineWidth = 1.4
          g.globalAlpha = alpha * 0.4
          drawPath(bolt3)
          // wide electric aura around the main bolt
          g.shadowBlur = 44
          g.lineWidth = 8
          g.globalAlpha = alpha * 0.4
          drawBolt()
          g.shadowBlur = 16
          g.lineWidth = 3.2
          g.globalAlpha = alpha * 0.6
          drawBolt()
          // hot cores: the tight inner sibling gets one too, so the braid
          // reads as multiple filaments of lightning
          g.strokeStyle = '#fffdf5'
          g.shadowBlur = 6
          g.lineWidth = 1
          g.globalAlpha = alpha * 0.55
          drawPath(bolt3)
          g.shadowBlur = 8
          g.lineWidth = 1.8
          g.globalAlpha = alpha
          drawBolt()
          // forked branches: short two-segment arcs splitting off
          g.lineWidth = 0.8
          for (let i = 2; i < bolt.length - 2; i++) {
            const r2 = Math.sin(i * 17.9 + s.bornAt + flickFrame * 11.7) * 28001.83
            const f2 = r2 - Math.floor(r2)
            if (f2 > 0.22) continue
            const b0 = bolt[i]
            const side = f2 > 0.11 ? 1 : -1
            const L = 16 + f2 * 220
            const mx = b0.x + b0.nx * side * L * 0.6 + (f2 - 0.07) * 90
            const my = b0.y + b0.ny * side * L * 0.6
            g.strokeStyle = cA
            g.shadowColor = cA
            g.shadowBlur = 8
            g.globalAlpha = alpha * 0.6
            g.beginPath()
            g.moveTo(b0.x, b0.y)
            g.lineTo(mx, my)
            g.lineTo(mx + b0.nx * side * L * 0.5, my + b0.ny * side * L * 0.5 + 4)
            g.stroke()
          }
          // techy ticks: tiny perpendicular hash marks riding the path,
          // like data pulses streaming along a circuit trace
          g.strokeStyle = cB
          g.shadowBlur = 0
          g.lineWidth = 1
          for (let i = 1; i < bolt.length - 1; i += 3) {
            const b0 = bolt[i]
            const ph = (now / 260 + i * 0.7) % 1
            g.globalAlpha = alpha * 0.5 * (0.3 + 0.7 * ph)
            g.beginPath()
            g.moveTo(b0.x - b0.nx * 5, b0.y - b0.ny * 5)
            g.lineTo(b0.x + b0.nx * 5, b0.y + b0.ny * 5)
            g.stroke()
          }
          g.lineJoin = 'round'
          g.shadowBlur = 0
        }
      }

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
        // every stroke is painted with galaxy dust: tiny star specks and a
        // nebula haze riding the ribbon, whatever its colour
        for (let i = 2; i < n - 2; i += 6) {
          const p = pts[i]
          const r1 = Math.sin(i * 41.17 + s.bornAt) * 26743.31
          const f1 = r1 - Math.floor(r1)
          const r2 = Math.sin(i * 9.311 + s.bornAt) * 8151.77
          const f2 = r2 - Math.floor(r2)
          const mx = p.x * w + (f1 - 0.5) * 30
          const my = p.y * h + (f2 - 0.5) * 30
          const tw = 0.5 + 0.5 * Math.sin(now / (240 + f2 * 400) + i * 2.3)
          if (f1 < 0.18) {
            // a brighter star with a soft halo
            g.globalAlpha = alpha * tw * 0.9
            g.fillStyle = '#fff8ea'
            g.beginPath()
            g.arc(mx, my, 0.8 + f2 * 1.4, 0, Math.PI * 2)
            g.fill()
            softMote(g, mx, my, 3 + f2 * 3, '#efe3c4', alpha * tw * 0.35)
          } else {
            softMote(g, mx, my, 1 + f2 * 1.5, '#f0e9d6', alpha * tw * 0.22)
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
            softMote(g, mx, my, sz * 1.6, '#efe3c4', alpha * tw * 0.6)
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
      } else if (p.kind === 'ash') {
        // ash rides an updraft, wavering sideways as it climbs
        p.vx += 0.008 + Math.sin(now / 240 + p.y * 0.05) * 0.02
        p.vy -= 0.006
        p.vx *= 0.985
        p.vy *= 0.985
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
      if (p.kind === 'fila') {
        // a glowing hair: a short line along its velocity, fading to nothing
        const fl = 6 + p.size * 4
        const streak = g.createLinearGradient(
          p.x,
          p.y,
          p.x - p.vx * fl,
          p.y - p.vy * fl,
        )
        streak.addColorStop(0, p.color)
        streak.addColorStop(1, `${p.color.slice(0, 7)}00`)
        g.globalAlpha = p.life * 0.8
        g.strokeStyle = streak
        g.lineCap = 'round'
        g.lineWidth = p.size
        g.beginPath()
        g.moveTo(p.x, p.y)
        g.lineTo(p.x - p.vx * fl, p.y - p.vy * fl)
        g.stroke()
        softMote(g, p.x, p.y, p.size * 1.4, p.color, p.life * 0.3)
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
      // beat envelope: the orb throbs on every note this finger plays
      const np = c.id !== undefined ? notePulses.current.get(c.id) : undefined
      const beat = np ? Math.max(0, 1 - (now - np.t) / 350) * np.s : 0
      const r = (c.active ? 26 : (14 + s * 8) * pulse) * (1 + beat * 0.7)
      if (np && beat > 0) {
        // a ripple ring expands away from the orb as the note decays
        g.globalAlpha = beat * 0.55
        g.strokeStyle = '#fffaf0'
        g.lineWidth = 1.4
        g.beginPath()
        g.arc(cx, cy, r + (1 - beat) * 46, 0, Math.PI * 2)
        g.stroke()
      }
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
        // lit: a multilayer conjuring seal — independent strata spinning
        // at their own speeds and depths, Strange-style, over a rip in
        // space where the pinch crushes the fabric of the room
        const R = Math.min(
          Math.min(w, h) * 0.15,
          Math.max(r + 14, (c.size ?? 0.12) * Math.min(w, h) * 0.55),
        )
        const breathe = 1 + 0.04 * Math.sin(now / 480 + (c.id ?? 0))
        const jade = (c.id ?? 1000) % 2 === 1
        // every stratum of a seal wears its hand's own colour: jade
        // hands hue-shift the shared pale-gold artwork into their family
        const tint = jade ? 'hue-rotate(95deg) saturate(0.65)' : 'none'
        const glyphs = sigilFor(SIGIL_GLYPHS)
        const disc = sigilFor(SIGIL_PALE)
        // depth 0: a tight bloom of light welling up beneath the seal
        softMote(g, cx, cy, R * 0.8, c.color, 0.08, 0.08)
        const layer = (
          img: HTMLImageElement | HTMLVideoElement | null,
          scale: number,
          rot: number,
          alpha: number,
          filt = 'none',
        ) => {
          if (!img) return
          const LR = R * scale * breathe
          g.save()
          g.translate(cx, cy)
          g.rotate(rot)
          g.globalAlpha = alpha
          // the ring videos live on solid black grounds: screen-blend them
          // so only the luminous linework lands on the room
          g.globalCompositeOperation = 'screen'
          g.filter = filt
          g.drawImage(img, -LR, -LR, LR * 2, LR * 2)
          g.filter = 'none'
          g.restore()
        }
        // depth 1: the outer energy ring — an AI-generated living video
        // of spinning light, falling back to the still artwork until it
        // has buffered
        const ringVideo = sealVideoFor(jade, c.id ?? 0)
        if (ringVideo) {
          layer(ringVideo, 1.15, (jade ? -1 : 1) * (now / 5200), 0.95)
        } else {
          const outer = sigilFor(jade ? SIGIL_JADE : SIGIL_GOLD)
          layer(outer, 1, (jade ? -1 : 1) * (now / 2600), 0.9)
        }
        // depth 2: counter-rotating ring of arcane script
        layer(glyphs, 0.64, (jade ? 1 : -1) * (now / 1500), 0.55, tint)
        // depth 3: a small pale disc whirling fast at the palm
        layer(disc, 0.32, now / 600, 0.65, tint)
        // the rip: a jagged luminous fissure torn through the seal's
        // heart, its teeth trembling as the pinch crushes space
        const seed = (c.id ?? 0) * 13.7
        const ripA = seed % Math.PI
        const ripL = R * 0.85
        const teeth = 7
        g.save()
        g.rotate(0)
        g.beginPath()
        for (let i = 0; i <= teeth; i++) {
          const f = i / teeth - 0.5
          const wob =
            Math.sin(i * 2.7 + seed) * 0.16 + Math.sin(now / 130 + i * 1.9) * 0.05
          const rx = cx + Math.cos(ripA) * f * ripL * 2 - Math.sin(ripA) * wob * R
          const ry = cy + Math.sin(ripA) * f * ripL * 2 + Math.cos(ripA) * wob * R
          if (i === 0) g.moveTo(rx, ry)
          else g.lineTo(rx, ry)
        }
        g.strokeStyle = '#fffaf0'
        g.shadowColor = c.color
        g.shadowBlur = 18
        g.lineWidth = 1.6 + 0.8 * Math.sin(now / 90)
        g.globalAlpha = 0.85
        g.stroke()
        g.shadowBlur = 0
        g.restore()
        // orbiting spark trails circling between the strata
        for (let i = 0; i < 3; i++) {
          const oa = now / (700 + i * 260) + (i * Math.PI * 2) / 3 + seed
          const orr = R * (0.45 + i * 0.24)
          softMote(
            g,
            cx + Math.cos(oa) * orr,
            cy + Math.sin(oa) * orr,
            3.5,
            i === 1 ? '#fffaf0' : c.color,
            0.7,
          )
        }
      }
    }

    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1

    // fully dissolved strokes leave the canvas (and the music)
    const living = strokesRef.current.filter(
      (s) =>
        activeSet.has(s) ||
        (s.points.length > 1 && now - s.bornAt < LINGER_MS + DISSOLVE_MS),
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
        // subtle per-ball variation within the pen's own colour family
        const tint = shiftHue(pen.color, (Math.random() - 0.5) * 30)
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
        hue: (Math.random() - 0.5) * 24,
      }
      gesturePaths.current.set(id, { pen: pid, pts: [p0] })
      activeStrokes.current.set(id, stroke)
      onStrokesChangeRef.current([...strokesRef.current, stroke])
    },
    [],
  )

  const strokeMove = useCallback((id: number, pid: string, p: DrawPoint) => {
    const stroke = activeStrokes.current.get(id)
    if (!stroke) return
    // the rendered trail is tail-eaten, so the full path for gesture
    // reading is kept separately
    const gp = gesturePaths.current.get(id)
    if (gp && gp.pts.length < 1200) gp.pts.push(p)
    stroke.points.push(p)
    while (stroke.points.length > TRAIL_POINTS) stroke.points.shift()
    stroke.bornAt = performance.now()
    // the stroke may have been culled from the list while it only had one
    // point, so put it back rather than just re-emitting the stale list
    if (!strokesRef.current.includes(stroke)) {
      onStrokesChangeRef.current([...strokesRef.current, stroke])
    }
    onDrawPointRef.current?.(id, pid, p)
    const canvas = canvasRef.current
    const pen = getPen(pid)
    if (canvas) {
      const tint = stroke.hue ? shiftHue(pen.color, stroke.hue) : pen.color
      if (pen.tool === 'chalk') {
        spawnChalk(p.x * canvas.width, p.y * canvas.height, tint, 4)
      } else if (pen.tool !== 'rain') {
        spawnTrail(p.x * canvas.width, p.y * canvas.height, tint)
        spawnFilament(p.x * canvas.width, p.y * canvas.height, tint)
      }
    }
    onStrokesChangeRef.current([...strokesRef.current])
  }, [])

  const strokeEnd = useCallback((id: number) => {
    const gp = gesturePaths.current.get(id)
    gesturePaths.current.delete(id)
    activeStrokes.current.delete(id)
    pointerState.current.delete(id)
    onDrawEndRef.current?.(id, gp?.pts, gp?.pen)
  }, [])

  const strokeCancel = useCallback((id: number) => {
    const stroke = activeStrokes.current.get(id)
    gesturePaths.current.delete(id)
    activeStrokes.current.delete(id)
    pointerState.current.delete(id)
    if (stroke) {
      onStrokesChangeRef.current(strokesRef.current.filter((s) => s !== stroke))
    }
    onDrawEndRef.current?.(id)
  }, [])

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      strokeStart,
      strokeMove,
      strokeEnd,
      strokeCancel,
      setCursors: (c) => {
        cursors.current = c
      },
      notePulse: (id, strength = 1) => {
        notePulses.current.set(id, { t: performance.now(), s: strength })
      },
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, strokeStart, strokeMove, strokeEnd, strokeCancel])

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
