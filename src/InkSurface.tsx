import { useCallback, useEffect, useRef } from 'react'
import type { Stroke } from './music'
import { getInstrument, getTheme, INK, type Instrument } from './instruments'
import { Scene, type Mood } from './Scene'
import { FIGURE, type BodyState, type Joint, type Strike } from './sanda'

export interface DrawPoint {
  x: number
  y: number
  pressure: number
  /** normalized units per second */
  speed: number
}

/** a cursor projected onto the surface (pointer hover or a tracked hand) */
export interface SurfaceCursor {
  x: number
  y: number
  color: string
  active: boolean
  id?: number
}

/** imperative surface API: pointer, body tracking and the app all draw here */
export interface DrawHandle {
  strokeStart: (id: number, instr: string, p: DrawPoint) => void
  strokeMove: (id: number, instr: string, p: DrawPoint) => void
  strokeEnd: (id: number) => void
  strokeCancel: (id: number) => void
  setCursors: (cursors: SurfaceCursor[]) => void
  notePulse: (id: number, strength?: number) => void
  /** the latest body reading, for the ink ghost and the fluid */
  setBody: (b: BodyState | null) => void
  /** a strike has landed */
  strike: (s: Strike, glyph: string) => void
  /** gate progress 0..1 and whether it has opened */
  setGate: (progress: number, open: boolean) => void
  /** the piece's mood for the landscape: density, breath, lean, section */
  setMood: (m: Partial<Mood>) => void
  /** ink-stone or xuan paper */
  setTheme: (paper: boolean) => void
}

interface Props {
  strokes: Stroke[]
  onStrokesChange: (strokes: Stroke[]) => void
  playheadX: number | null
  penId: string
  onDrawPoint?: (pointerId: number, instr: string, p: DrawPoint) => void
  onDrawEnd?: (pointerId: number, path?: DrawPoint[], instr?: string) => void
  /** a quick pointer flick is a strike, for the no-camera fallback */
  onPointerStrike?: (s: Strike) => void
  handleRef?: React.RefObject<DrawHandle | null>
}

interface Pt {
  x: number
  y: number
  pressure: number
}

interface Seal {
  x: number
  y: number
  size: number
  born: number
  glyph: string
  kind: 'punch' | 'kick'
  rot: number
  seed: number
}

interface Ring {
  x: number
  y: number
  born: number
  life: number
  r0: number
  r1: number
  width: number
  color: string
}

interface Crack {
  x: number
  y: number
  dx: number
  dy: number
  born: number
  force: number
  color: string
}

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  color: string
}

interface GhostFrame {
  t: number
  joints: Record<string, Joint>
  sw: number
}

// marks dry, hold, then return to 留白
const HOLD_MS = 24000
const FADE_MS = 6000
const MAX_STROKES = 36
const WET_MS = 1800

// the fluid carries ink *amount*; these are its two pigments, independent
// of which theme displays them
const FLUID_INK: [number, number, number] = [0.9, 0.87, 0.8]
const FLUID_RED: [number, number, number] = [0.71, 0.22, 0.16]
const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16) / 255,
  parseInt(c.slice(3, 5), 16) / 255,
  parseInt(c.slice(5, 7), 16) / 255,
]
const rgba = (c: string, a: number) => {
  const [r, g, b] = hex(c)
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
}
// an instrument's ink in the current theme: on xuan paper every brush is
// ink, mist is grey, the seal is vermillion
const inkOf = (instr: Instrument) =>
  getTheme() === 'xuan'
    ? instr.brush === 'mist'
      ? INK.ash
      : instr.brush === 'seal'
        ? INK.cinnabar
        : INK.paper
    : instr.ink
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function relax(pts: Pt[], passes = 3): Pt[] {
  let cur = pts
  for (let p = 0; p < passes; p++) {
    if (cur.length < 5) break
    const next: Pt[] = [cur[0]]
    for (let i = 1; i < cur.length - 1; i++) {
      next.push({
        x: (cur[i - 1].x + cur[i].x * 2 + cur[i + 1].x) / 4,
        y: (cur[i - 1].y + cur[i].y * 2 + cur[i + 1].y) / 4,
        pressure: (cur[i - 1].pressure + cur[i].pressure * 2 + cur[i + 1].pressure) / 4,
      })
    }
    next.push(cur[cur.length - 1])
    cur = next
  }
  return cur
}

const smoothCache = new WeakMap<Pt[], { count: number; pts: Pt[] }>()
function smooth(raw: Pt[], subdiv = 6): Pt[] {
  const cached = smoothCache.get(raw)
  if (cached && cached.count === raw.length) return cached.pts
  const pts = relax(raw)
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

/**
 * The surface: a WebGL ink-fluid below, a 2D ink layer above. Slow motion
 * lays down brush marks that dry; a strike shocks the fluid, stamps a
 * cinnabar seal, and leaves afterimages of the limb's path.
 */
export default function InkSurface({
  strokes,
  onStrokesChange,
  playheadX,
  penId,
  onDrawPoint,
  onDrawEnd,
  onPointerStrike,
  handleRef,
}: Props) {
  const glRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fluid = useRef<Scene | null>(null)
  const activeStrokes = useRef(new Map<number, Stroke>())
  const pointerState = useRef(
    new Map<number, { last: { x: number; y: number; t: number } | null; weight: number; speed: number; born: number; path: DrawPoint[]; times: number[] }>(),
  )
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const onStrokesChangeRef = useRef(onStrokesChange)
  onStrokesChangeRef.current = onStrokesChange
  const onDrawPointRef = useRef(onDrawPoint)
  onDrawPointRef.current = onDrawPoint
  const onDrawEndRef = useRef(onDrawEnd)
  onDrawEndRef.current = onDrawEnd
  const onPointerStrikeRef = useRef(onPointerStrike)
  onPointerStrikeRef.current = onPointerStrike
  const paths = useRef(new Map<number, { instr: string; pts: DrawPoint[] }>())
  const cursors = useRef<SurfaceCursor[]>([])
  const notePulses = useRef(new Map<number, { t: number; s: number }>())
  const playheadRef = useRef(playheadX)
  playheadRef.current = playheadX
  const body = useRef<BodyState | null>(null)
  const ghosts = useRef<GhostFrame[]>([])
  const trails = useRef(new Map<string, { x: number; y: number; t: number; speed: number }[]>())
  const seals = useRef<Seal[]>([])
  const rings = useRef<Ring[]>([])
  const cracks = useRef<Crack[]>([])
  const drops = useRef<Drop[]>([])
  const gate = useRef({ progress: 0, open: false, openedAt: 0 })
  const lastFrame = useRef(0)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const lastStir = useRef(new Map<string, { x: number; y: number }>())

  // ---------------------------------------------------------- strikes --
  const landStrike = useCallback((s: Strike, glyph: string) => {
    const now = performance.now()
    if (s.kind === 'snap') {
      // 亮相: the body stops dead — one clean ring and a small seal, no burst
      rings.current.push({ x: s.x, y: s.y, born: now, life: 900, r0: 0.02, r1: 0.16 + s.force * 0.12, width: 1.4, color: INK.paper })
      rings.current.push({ x: s.x, y: s.y, born: now + 120, life: 700, r0: 0.01, r1: 0.08, width: 0.8, color: INK.cinnabar })
      seals.current.push({ x: s.x, y: s.y, size: 0.035 + s.force * 0.02, born: now, glyph, kind: 'punch', rot: (Math.random() - 0.5) * 0.12, seed: Math.random() * 1000 })
      return
    }
    const instr = getInstrument(s.kind === 'punch' ? 'luo' : 'gu')
    const inkColor = FLUID_INK
    const red = FLUID_RED
    // the fluid takes the shock: punches throw pale ink along the fist,
    // kicks tear a cinnabar-and-ink curtain
    const col: [number, number, number] =
      s.kind === 'punch'
        ? [inkColor[0] * 0.9 + red[0] * 0.1, inkColor[1] * 0.9 + red[1] * 0.1, inkColor[2] * 0.9 + red[2] * 0.1]
        : [red[0] * 0.75 + inkColor[0] * 0.25, red[1] * 0.75 + inkColor[1] * 0.25, red[2] * 0.75 + inkColor[2] * 0.25]
    fluid.current?.shock({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, force: s.force, kind: s.kind === 'kick' ? 'kick' : 'punch', color: col })
    seals.current.push({
      x: s.x,
      y: s.y,
      size: s.kind === 'punch' ? 0.045 + s.force * 0.05 : 0.06 + s.force * 0.06,
      born: now,
      glyph,
      kind: s.kind,
      rot: (Math.random() - 0.5) * 0.18,
      seed: Math.random() * 1000,
    })
    if (seals.current.length > 14) seals.current.shift()
    rings.current.push({
      x: s.x,
      y: s.y,
      born: now,
      life: s.kind === 'punch' ? 520 : 800,
      r0: 0.01,
      r1: s.kind === 'punch' ? 0.12 + s.force * 0.18 : 0.25 + s.force * 0.3,
      width: 1.2 + s.force * 1.6,
      color: INK.paper,
    })
    if (s.force > 0.5 || s.kind === 'kick') {
      rings.current.push({
        x: s.x,
        y: s.y,
        born: now + 60,
        life: 900,
        r0: 0.02,
        r1: 0.2 + s.force * 0.25,
        width: 0.7,
        color: inkOf(instr),
      })
    }
    cracks.current.push({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, born: now, force: s.force, color: INK.paper })
    const n = Math.round(10 + s.force * 26)
    for (let i = 0; i < n; i++) {
      const spread = s.kind === 'punch' ? 0.9 : 1.6
      const a = Math.atan2(s.dy, s.dx) + (Math.random() - 0.5) * spread
      const sp = (0.15 + Math.random() * 0.6) * (0.5 + s.force)
      drops.current.push({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 0.6 + Math.random() * 2.6 * (0.5 + s.force),
        life: 0.6 + Math.random() * 0.6,
        color: Math.random() < (s.kind === 'kick' ? 0.55 : 0.2) ? INK.cinnabar : INK.paper,
      })
    }
  }, [])

  // ------------------------------------------------------------ redraw --
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    const { width: w, height: h } = canvas
    const now = performance.now()
    const dt = lastFrame.current ? Math.min(0.05, (now - lastFrame.current) / 1000) : 1 / 60
    lastFrame.current = now
    const dpr = devicePixelRatio
    const S = Math.min(w, h)

    // ---- the fluid: stir it with everything that moves, then step -----
    const F = fluid.current
    if (F?.ok) {
      const b = body.current
      F.setBody(b?.present && b.all.length === 33 ? b.all : null, b?.sw ?? 0.2)
      if (b?.present) {
        const stir = (name: string, j: Joint, amount: number, radius: number) => {
          if (j.vis < 0.4) return
          const prev = lastStir.current.get(name)
          lastStir.current.set(name, { x: j.x, y: j.y })
          if (!prev) return
          const dx = j.x - prev.x
          const dy = j.y - prev.y
          const d = Math.hypot(dx, dy)
          if (d < 0.0015) return
          // slow motion trails a faint wash; fast motion only pushes water
          const ink = Math.max(0, 1 - j.speed / 2.2) * amount
          const c = FLUID_INK
          F.splat(j.x, j.y, (dx / dt) * 0.35, (dy / dt) * 0.35, [c[0] * ink, c[1] * ink, c[2] * ink], radius, 1)
        }
        // the obstacle pass moves the mist; the hands add a little ink
        stir('lWrist', b.joints.lWrist, 0.04, 0.016)
        stir('rWrist', b.joints.rWrist, 0.04, 0.016)
      }
      if (hover.current) {
        const prev = lastStir.current.get('hover')
        const { x, y } = hover.current
        lastStir.current.set('hover', { x, y })
        if (prev) {
          const dx = x - prev.x
          const dy = y - prev.y
          if (Math.hypot(dx, dy) > 0.001) F.splat(x, y, (dx / dt) * 0.3, (dy / dt) * 0.3, [0.02, 0.019, 0.017], 0.015)
        }
      }
      for (const s of activeStrokes.current.values()) {
        const p = s.points[s.points.length - 1]
        const q = s.points[s.points.length - 2]
        if (p && q) {
          const c = FLUID_INK
          F.splat(p.x, p.y, (p.x - q.x) / dt * 0.2, (p.y - q.y) / dt * 0.2, [c[0] * 0.08, c[1] * 0.08, c[2] * 0.08], 0.012)
        }
      }
      F.setFigure(b?.present ? b.energy : 0, b?.present ? b.sinceStrike : Infinity)
      F.step(dt)
      F.render()
    }

    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, w, h)
    if (!F?.ok) {
      g.fillStyle = INK.ground
      g.fillRect(0, 0, w, h)
    }
    const [shX, shY] = F?.shake ?? [0, 0]
    g.translate(shX * w, shY * h)
    g.lineCap = 'round'
    g.lineJoin = 'round'

    const gt = gate.current
    const opened = gt.open ? Math.min(1, (now - gt.openedAt) / 1400) : 0

    // the waterline lives in the WebGL room; without it, one brushed horizon
    if (opened > 0 && !F?.ok) {
      const y = h * 0.82
      const ease = 1 - Math.pow(1 - opened, 3)
      g.strokeStyle = rgba(INK.ash, 0.28)
      g.lineWidth = 1.2 * dpr
      g.beginPath()
      g.moveTo(w * (0.5 - 0.42 * ease), y)
      g.lineTo(w * (0.5 + 0.42 * ease), y)
      g.stroke()
    }

    // ---- the ink ghost: the body as a few brush lines -----------------
    const b = body.current
    if (b?.present) {
      const frames = ghosts.current
      frames.push({ t: now, joints: { ...b.joints }, sw: b.sw })
      while (frames.length > 16) frames.shift()
      const energy = b.energy
      // afterimages: only a moving body leaves them; a still one is a
      // single clean figure
      const drawFigure = (fr: GhostFrame, alpha: number, width: number, color: string, flash: number) => {
        g.strokeStyle = color
        g.globalAlpha = alpha
        for (const [a, c] of FIGURE) {
          const ja = fr.joints[a]
          const jc = fr.joints[c]
          if (!ja || !jc || ja.vis < 0.35 || jc.vis < 0.35) continue
          // faster limbs are brushed drier and thinner
          const sp = Math.max(ja.speed, jc.speed)
          g.lineWidth = Math.max(0.6, width * (1.3 - Math.min(1, sp / 4) * 0.9)) * dpr
          g.beginPath()
          g.moveTo(ja.x * w, ja.y * h)
          g.lineTo(jc.x * w, jc.y * h)
          g.stroke()
        }
        const nose = fr.joints.nose
        if (nose && nose.vis > 0.4) {
          g.lineWidth = width * 0.9 * dpr
          g.beginPath()
          g.arc(nose.x * w, nose.y * h - fr.sw * h * 0.05, fr.sw * S * 0.36, 0, Math.PI * 2)
          g.stroke()
        }
        if (flash > 0) {
          g.globalAlpha = flash
          g.strokeStyle = INK.paper
          for (const [a, c] of FIGURE) {
            const ja = fr.joints[a]
            const jc = fr.joints[c]
            if (!ja || !jc || ja.vis < 0.35 || jc.vis < 0.35) continue
            g.lineWidth = 2.2 * dpr
            g.beginPath()
            g.moveTo(ja.x * w, ja.y * h)
            g.lineTo(jc.x * w, jc.y * h)
            g.stroke()
          }
        }
      }
      const trailAmt = Math.min(1, energy * 1.6)
      const flash = b.sinceStrike < 140 ? (1 - b.sinceStrike / 140) * 0.7 : 0
      // the character carries the figure; the ink lines only stand in for
      // it when the WebGL room is unavailable
      if (!F?.ok) {
        for (let i = 0; i < frames.length - 1; i += 2) {
          const age = (now - frames[i].t) / 480
          if (age > 1) continue
          drawFigure(frames[i], (1 - age) * 0.22 * trailAmt, 1.3, INK.ash, 0)
        }
        drawFigure(frames[frames.length - 1], gt.open ? 0.55 : 0.38, 2.2, INK.ash, flash)
      }
      g.globalAlpha = 1

      // 残影: the striking limbs leave a ribbon of their path
      for (const name of ['lWrist', 'rWrist', 'lAnkle', 'rAnkle']) {
        const j = b.joints[name]
        let tr = trails.current.get(name)
        if (!tr) {
          tr = []
          trails.current.set(name, tr)
        }
        if (j && j.vis > 0.4) tr.push({ x: j.x, y: j.y, t: now, speed: j.speed })
        while (tr.length && now - tr[0].t > 380) tr.shift()
        if (tr.length < 3) continue
        const fast = tr.some((p) => p.speed > 1.4)
        if (!fast) continue
        for (let i = 1; i < tr.length; i++) {
          const p = tr[i]
          const q = tr[i - 1]
          const age = (now - p.t) / 380
          const sp = Math.min(1, p.speed / 5)
          g.globalAlpha = (1 - age) * (0.15 + sp * 0.6)
          g.strokeStyle = sp > 0.7 ? INK.paper : INK.ash
          g.lineWidth = (1 + sp * 9) * (1 - age) * dpr
          g.beginPath()
          g.moveTo(q.x * w, q.y * h)
          g.lineTo(p.x * w, p.y * h)
          g.stroke()
        }
      }
      g.globalAlpha = 1
    } else {
      ghosts.current.length = 0
    }

    // ---- brush marks ------------------------------------------------
    const living: Stroke[] = []
    const activeSet = new Set(activeStrokes.current.values())
    const px = playheadRef.current
    for (const s of strokesRef.current) {
      const age = now - s.bornAt
      const isActive = activeSet.has(s)
      if (!isActive && age > HOLD_MS + FADE_MS) continue
      if (s.points.length < 2) {
        if (isActive) living.push(s)
        continue
      }
      living.push(s)
      const instr = getInstrument(s.pen)
      let alpha = 1
      if (!isActive && age > HOLD_MS) alpha = Math.max(0, 1 - (age - HOLD_MS) / FADE_MS)
      const wet = isActive ? 1 : Math.max(0, 1 - age / WET_MS)
      const pts = smooth(s.points)
      const n = pts.length
      const left: number[] = []
      const right: number[] = []
      const speeds = s.speeds ?? []
      const base = (6 + 12 * instr.width) * dpr
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
        const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.35)
        const half = (base * (0.3 + p.pressure * 0.9) * taper) / 2
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
      const nearBeam = px !== null ? Math.max(0, 1 - Math.abs((pts[n >> 1]?.x ?? 0) - px) * 12) : 0
      // wet ink bleeds into the paper; as it dries the halo tightens
      const inkC = inkOf(instr)
      if (wet > 0.02) {
        g.shadowColor = rgba(inkC, 0.5 * wet)
        g.shadowBlur = (6 + 18 * wet) * dpr
      } else g.shadowBlur = 0
      g.fillStyle = inkC
      g.globalAlpha = alpha * (instr.brush === 'mist' ? 0.35 : 0.82) + nearBeam * 0.2
      trace()
      g.fill()
      g.shadowBlur = 0
      // 飞白: where the brush moved fast the hairs separate — hairlines
      // of ground showing through the body of the mark
      if (instr.brush !== 'mist') {
        g.globalCompositeOperation = 'destination-out'
        g.strokeStyle = '#000'
        g.lineWidth = 0.9 * dpr
        for (let k = 0; k < 4; k++) {
          const off = (k - 1.5) * 0.36
          g.beginPath()
          let drawing = false
          for (let i = 0; i < n; i++) {
            const sp = speeds[Math.min(speeds.length - 1, Math.floor((i / n) * speeds.length))] ?? 0
            const dry = Math.max(0, Math.min(1, (sp - 0.45) / 1.2))
            const gap = hash(i * 3.1 + k * 17 + s.bornAt) < dry * 0.9
            if (!gap) {
              drawing = false
              continue
            }
            const lx = left[i * 2]
            const ly = left[i * 2 + 1]
            const rx = right[i * 2]
            const ry = right[i * 2 + 1]
            const x = (lx + rx) / 2 + (rx - lx) * off
            const y = (ly + ry) / 2 + (ry - ly) * off
            if (!drawing) {
              g.moveTo(x, y)
              drawing = true
            } else g.lineTo(x, y)
          }
          g.globalAlpha = 0.9
          g.stroke()
        }
        g.globalCompositeOperation = 'source-over'
      }
      // the head of a live stroke is the loaded brush: a darker pooled tip
      if (isActive) {
        const tip = pts[n - 1]
        g.globalAlpha = 0.9
        g.fillStyle = INK.paper
        g.beginPath()
        g.arc(tip.x * w, tip.y * h, (2 + tip.pressure * 3) * dpr, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }
    if (living.length !== strokesRef.current.length) onStrokesChangeRef.current(living)

    // ---- impact: rings, cracks, splatter ------------------------------
    for (let i = rings.current.length - 1; i >= 0; i--) {
      const r = rings.current[i]
      const t = (now - r.born) / r.life
      if (t >= 1) {
        rings.current.splice(i, 1)
        continue
      }
      if (t < 0) continue
      const e = 1 - Math.pow(1 - t, 3)
      const rad = (r.r0 + (r.r1 - r.r0) * e) * S
      g.globalAlpha = (1 - t) * 0.7
      g.strokeStyle = r.color
      g.lineWidth = r.width * (1 - t * 0.6) * dpr
      g.beginPath()
      g.arc(r.x * w, r.y * h, rad, 0, Math.PI * 2)
      g.stroke()
    }
    for (let i = cracks.current.length - 1; i >= 0; i--) {
      const c = cracks.current[i]
      const t = (now - c.born) / 260
      if (t >= 1) {
        cracks.current.splice(i, 1)
        continue
      }
      // hairline rays thrown forward along the strike, snapping out and
      // then gone — the sound of the impact made visible
      const base = Math.atan2(c.dy, c.dx)
      const count = 7 + Math.round(c.force * 8)
      g.strokeStyle = c.color
      g.lineWidth = 1 * dpr
      for (let k = 0; k < count; k++) {
        const f1 = hash(k * 7.3 + c.born)
        const f2 = hash(k * 11.9 + c.born + 3)
        const a = base + (f1 - 0.5) * 1.4
        const L = (0.05 + f2 * 0.16 * (0.5 + c.force)) * S
        const start = L * Math.min(1, t * 2.4)
        const end = L * Math.min(1, t * 1.4 + 0.1)
        g.globalAlpha = (1 - t) * 0.8
        g.beginPath()
        g.moveTo(c.x * w + Math.cos(a) * start, c.y * h + Math.sin(a) * start)
        g.lineTo(c.x * w + Math.cos(a) * end, c.y * h + Math.sin(a) * end)
        g.stroke()
      }
    }
    for (let i = drops.current.length - 1; i >= 0; i--) {
      const d = drops.current[i]
      d.vy += 0.9 * dt
      d.vx *= Math.pow(0.15, dt)
      d.vy *= Math.pow(0.3, dt)
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.life -= dt
      if (d.life <= 0) {
        drops.current.splice(i, 1)
        continue
      }
      g.globalAlpha = Math.min(1, d.life * 1.6)
      g.fillStyle = d.color
      g.beginPath()
      g.arc(d.x * w, d.y * h, d.r * dpr, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1

    // ---- seals: the cinnabar stamp of a landed strike -----------------
    for (let i = seals.current.length - 1; i >= 0; i--) {
      const sl = seals.current[i]
      const age = now - sl.born
      if (age > 7000) {
        seals.current.splice(i, 1)
        continue
      }
      // pressed: lands large and settles in 140 ms, then holds, then fades
      const press = age < 140 ? 1.35 - 0.35 * (age / 140) : 1
      const fade = age > 4500 ? 1 - (age - 4500) / 2500 : 1
      const size = sl.size * S * press
      const tall = sl.kind === 'kick'
      const sw = tall ? size * 0.62 : size
      const sh = tall ? size * 1.5 : size
      g.save()
      g.translate(sl.x * w, sl.y * h)
      g.rotate(sl.rot)
      g.globalAlpha = 0.92 * fade
      g.fillStyle = INK.cinnabar
      // a hand-cut edge: the square wobbles a little
      g.beginPath()
      const segs = 6
      const edge = (x0: number, y0: number, x1: number, y1: number, k: number) => {
        for (let s2 = 1; s2 <= segs; s2++) {
          const t = s2 / segs
          const jit = (hash(sl.seed + k * 31 + s2 * 7) - 0.5) * size * 0.05
          g.lineTo(x0 + (x1 - x0) * t + jit, y0 + (y1 - y0) * t + jit)
        }
      }
      g.moveTo(-sw / 2, -sh / 2)
      edge(-sw / 2, -sh / 2, sw / 2, -sh / 2, 0)
      edge(sw / 2, -sh / 2, sw / 2, sh / 2, 1)
      edge(sw / 2, sh / 2, -sw / 2, sh / 2, 2)
      edge(-sw / 2, sh / 2, -sw / 2, -sh / 2, 3)
      g.closePath()
      g.fill()
      // worn: a little ground shows through the pigment
      g.globalCompositeOperation = 'destination-out'
      for (let k = 0; k < 9; k++) {
        const fx = (hash(sl.seed + k * 3.7) - 0.5) * sw * 0.9
        const fy = (hash(sl.seed + k * 5.3 + 1) - 0.5) * sh * 0.9
        g.globalAlpha = 0.35 * hash(sl.seed + k)
        g.beginPath()
        g.arc(fx, fy, size * (0.02 + hash(sl.seed + k * 9) * 0.05), 0, Math.PI * 2)
        g.fill()
      }
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 0.95 * fade
      g.fillStyle = INK.paper
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      if (tall) {
        const fs = sw * 0.72
        g.font = `${fs}px "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", "SimSun", serif`
        const chars = sl.glyph.split('')
        chars.forEach((ch, k) => {
          g.fillText(ch, 0, (k - (chars.length - 1) / 2) * fs * 1.05)
        })
      } else {
        const fs = size * 0.68
        g.font = `${fs}px "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", "SimSun", serif`
        g.fillText(sl.glyph, 0, size * 0.03)
      }
      g.restore()
    }

    // ---- the transport hairline ---------------------------------------
    if (px !== null) {
      const x = px * w
      g.strokeStyle = rgba(INK.paper, 0.45)
      g.lineWidth = 1 * dpr
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.stroke()
    }

    // ---- cursors: the brush tip -----------------------------------------
    for (const c of cursors.current) {
      const cx = c.x * w
      const cy = c.y * h
      const np = c.id !== undefined ? notePulses.current.get(c.id) : undefined
      const beat = np ? Math.max(0, 1 - (now - np.t) / 300) * np.s : 0
      g.globalAlpha = c.active ? 0.9 : 0.5
      g.fillStyle = c.color
      g.beginPath()
      g.arc(cx, cy, (c.active ? 3.5 : 2) * dpr * (1 + beat * 0.8), 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 0.3
      g.strokeStyle = c.color
      g.lineWidth = 0.8 * dpr
      g.beginPath()
      g.arc(cx, cy, (c.active ? 9 : 14) * dpr, 0, Math.PI * 2)
      g.stroke()
    }
    g.globalAlpha = 1
  }, [])

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
    const glc = glRef.current
    if (!canvas || !glc) return
    if (!fluid.current) fluid.current = new Scene(glc)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      // the fluid renders at a lower density; the 2D ink stays crisp
      glc.width = Math.round(rect.width * Math.min(dpr, 1.5))
      glc.height = Math.round(rect.height * Math.min(dpr, 1.5))
      fluid.current?.resize()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // ------------------------------------------------ stroke lifecycle --
  const strokeStart = useCallback((id: number, instr: string, p0: DrawPoint) => {
    const stroke: Stroke = { points: [p0], pen: instr, bornAt: performance.now(), speeds: [p0.speed] }
    paths.current.set(id, { instr, pts: [p0] })
    activeStrokes.current.set(id, stroke)
    let next = [...strokesRef.current, stroke]
    if (next.length > MAX_STROKES) {
      const active = new Set(activeStrokes.current.values())
      const idle = next.filter((s) => !active.has(s))
      const drop = new Set(idle.slice(0, next.length - MAX_STROKES))
      next = next.filter((s) => !drop.has(s))
    }
    onStrokesChangeRef.current(next)
    onDrawPointRef.current?.(id, instr, p0)
  }, [])

  const strokeMove = useCallback((id: number, instr: string, p: DrawPoint) => {
    const stroke = activeStrokes.current.get(id)
    if (!stroke) return
    const gp = paths.current.get(id)
    if (gp && gp.pts.length < 2000) gp.pts.push(p)
    if (stroke.points.length < 2000) {
      stroke.points.push(p)
      stroke.speeds?.push(p.speed)
    }
    stroke.bornAt = performance.now()
    if (!strokesRef.current.includes(stroke)) {
      onStrokesChangeRef.current([...strokesRef.current, stroke])
    }
    onDrawPointRef.current?.(id, instr, p)
  }, [])

  const strokeEnd = useCallback((id: number) => {
    const gp = paths.current.get(id)
    paths.current.delete(id)
    activeStrokes.current.delete(id)
    pointerState.current.delete(id)
    onDrawEndRef.current?.(id, gp?.pts, gp?.instr)
  }, [])

  const strokeCancel = useCallback((id: number) => {
    const stroke = activeStrokes.current.get(id)
    paths.current.delete(id)
    activeStrokes.current.delete(id)
    pointerState.current.delete(id)
    if (stroke) onStrokesChangeRef.current(strokesRef.current.filter((s) => s !== stroke))
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
      setBody: (b) => {
        body.current = b
      },
      strike: landStrike,
      setGate: (progress, open) => {
        const gt = gate.current
        if (open && !gt.open) gt.openedAt = performance.now()
        gt.progress = progress
        gt.open = open
        fluid.current?.setMood({ gate: open ? 1 : 0 })
      },
      setMood: (m) => fluid.current?.setMood(m),
      setTheme: (paper) => fluid.current?.setTheme(paper),
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, strokeStart, strokeMove, strokeEnd, strokeCancel, landStrike])

  // ------------------------------------------------- pointer fallback --
  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const state = pointerState.current.get(e.pointerId) ?? {
      last: null,
      weight: 0.5,
      speed: 0,
      born: performance.now(),
      path: [],
      times: [],
    }
    const now = performance.now()
    if (state.last) {
      const dist = Math.hypot(x - state.last.x, y - state.last.y)
      const dtm = Math.max(1, now - state.last.t)
      const speed = (dist * 1000) / dtm
      state.speed += (speed - state.speed) * 0.3
      // slow, deliberate movement loads the brush; a flick thins it
      const target = Math.min(1, Math.max(0.12, 1 - speed * 1.4))
      state.weight += (target - state.weight) * 0.25
    }
    state.last = { x, y, t: now }
    pointerState.current.set(e.pointerId, state)
    const pressure = e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : state.weight
    const p = { x, y, pressure, speed: state.speed }
    state.path.push(p)
    state.times.push(now)
    return p
  }

  return (
    <div className="ink-surface">
      <canvas ref={glRef} className="ink-fluid" />
      <canvas
        ref={canvasRef}
        className="ink-marks"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pointerState.current.set(e.pointerId, { last: null, weight: 0.5, speed: 0, born: performance.now(), path: [], times: [] })
          strokeStart(e.pointerId, penId, toPoint(e))
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          hover.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
          if (!activeStrokes.current.has(e.pointerId)) return
          strokeMove(e.pointerId, penId, toPoint(e))
        }}
        onPointerLeave={() => {
          hover.current = null
        }}
        onPointerUp={(e) => {
          // a short fast flick with the pointer is a strike. Judged by
          // velocity like the body's fists: the peak speed over any short
          // stretch of the gesture (a flick is fast in the middle), or a
          // brisk average over the whole of it
          const st = pointerState.current.get(e.pointerId)
          const dur = st ? Math.max(16, performance.now() - st.born) : Infinity
          if (st && dur < 700 && st.path.length >= 2) {
            const a = st.path[0]
            const z = st.path[st.path.length - 1]
            const d = Math.hypot(z.x - a.x, z.y - a.y)
            const avg = d / (dur / 1000)
            let peak = 0
            for (let i = 2; i < st.path.length; i++) {
              const p0 = st.path[i - 2]
              const p1 = st.path[i]
              const dt = Math.max(8, st.times[i] - st.times[i - 2]) / 1000
              peak = Math.max(peak, Math.hypot(p1.x - p0.x, p1.y - p0.y) / dt)
            }
            // …or simply a large displacement inside a short press
            if ((d > 0.04 && (avg > 0.45 || peak > 1.1)) || (d > 0.16 && dur < 700)) {
              strokeCancel(e.pointerId)
              const speed = Math.max(avg, peak * 0.6)
              onPointerStrikeRef.current?.({
                kind: Math.abs(z.y - a.y) > Math.abs(z.x - a.x) * 1.8 ? 'kick' : 'punch',
                side: z.x < 0.5 ? 'L' : 'R',
                x: z.x,
                y: z.y,
                dx: (z.x - a.x) / d,
                dy: (z.y - a.y) / d,
                force: Math.min(1, Math.max(0.25, speed / 3)),
                t: performance.now(),
                drive: 0.3,
                confidence: Math.min(1, 0.5 + speed / 4),
              })
              return
            }
          }
          strokeEnd(e.pointerId)
        }}
        onPointerCancel={(e) => strokeEnd(e.pointerId)}
      />
    </div>
  )
}
