import { useEffect, useRef, useState } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type {
  DrawHandle,
  DrawPoint,
  SurfaceCursor,
} from './DrawSurface'
import { getPen } from './pens'
import { setSummon, stopSummon, summonComplete } from './audio'
import { HAND_GUIDE, SIGIL_PALE, sigilFor } from './sigils'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

// landmark indices
const THUMB_TIP = 4
const INDEX_TIP = 8
const WRIST = 0
const MIDDLE_MCP = 9

// bone chains for the hand-skeleton overlay
const BONES = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [0, 17],
]

// each hand slot conjures with its own magic material — no pen picking:
// the first hand seals in gold, the second in jade
const HAND_PENS = ['neon', 'crystal']

// pinch hysteresis, as a fraction of palm size (wrist -> middle knuckle):
// a tighter threshold so hovering fingers don't draw by accident
const PINCH_ON = 0.32
const PINCH_OFF = 0.44

// gestures must hold steady for this many consecutive frames before they
// trigger — overlapping fingers momentarily look like pinches and would
// otherwise fire strokes at random
const PINCH_FRAMES = 3

// fraction of the camera frame cropped off each edge — the remaining
// centre maps to the whole canvas (an effectively wider reach)
const CAM_MARGIN = 0.18

// camera footage is shaky: exponentially smooth each fingertip before it
// ever reaches the stroke, on top of the surface's own relax/curve passes.
// The factor adapts to speed (One Euro style): slow hovers get heavy
// smoothing, fast sweeps track nearly raw so the dot never lags the hand
const SMOOTH_MIN = 0.3
const SMOOTH_MAX = 0.85

// tracking drops out for a few frames at a time: keep a lost hand's stroke
// alive this many frames before releasing it, so lines don't shatter
const MISS_FRAMES = 10

// the summoning ritual: where the right hand is placed to awaken the
// instrument (screen fraction), and how many frames of holding it takes
const RITUAL_X = 0.72
const RITUAL_Y = 0.5
const RITUAL_FRAMES = 55

interface HandState {
  pinched: boolean
  last: { x: number; y: number; t: number } | null
  speed: number
  sx: number // smoothed index-tip position
  sy: number
  sz: number // smoothed depth (palm size in frame: near = big = 1)
  glitch: number // consecutive frames rejected as tracking glitches
  pinchHold: number // consecutive frames the pinch condition has held
  miss: number // consecutive frames the hand has been lost by tracking
}

interface Props {
  surface: React.RefObject<DrawHandle | null>
}

/**
 * Camera hand tracking: MediaPipe finds up to two hands, each drawn as a
 * glowing magic-skeleton overlay. The instrument first has to be awakened
 * by holding the right hand in the summoning circle; after that, pinching
 * index to thumb conjures (draws and plays) with that hand's material.
 */
export default function HandLayer({ surface }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // dev mode (press D): ghost the camera feed over the canvas with the
  // gesture numbers, to see what tracking sees
  const [dev, setDev] = useState(false)
  const devRef = useRef(dev)
  devRef.current = dev

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDev((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let landmarker: HandLandmarker | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const hands = new Map<number, HandState>()
    // the awakening ritual: progress fills while a hand holds the circle
    const ritual = { done: false, hold: 0, glow: 0 }

    const endAll = () => {
      for (const [id, s] of hands) {
        if (s.pinched) surface.current?.strokeEnd(1000 + id)
      }
      hands.clear()
      surface.current?.setCursors([])
      stopSummon()
    }

    // selfie view: mirror x; the central region of the camera frame maps
    // to the full canvas so the whole surface is reachable
    const zoom = (v: number) =>
      Math.min(1, Math.max(0, (v - CAM_MARGIN) / (1 - 2 * CAM_MARGIN)))

    // a procedural open-hand silhouette: palm disc + five finger capsules,
    // used as the "place your hand here" guide (hand-shaped, hand-sized)
    const traceHandGuide = (
      g: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      s: number,
    ) => {
      g.beginPath()
      // palm
      g.ellipse(cx, cy + s * 0.35, s * 0.52, s * 0.6, 0, 0, Math.PI * 2)
      // four fingers fanning up
      const fingers = [
        { a: -0.42, l: 1.05, r: 0.13 },
        { a: -0.14, l: 1.3, r: 0.14 },
        { a: 0.12, l: 1.22, r: 0.135 },
        { a: 0.38, l: 0.95, r: 0.12 },
      ]
      for (const f of fingers) {
        const bx = cx + Math.sin(f.a) * s * 0.42
        const by = cy - s * 0.05
        const tx = cx + Math.sin(f.a) * s * (0.42 + f.l * 0.55)
        const ty = by - Math.cos(f.a) * s * f.l
        g.moveTo(bx + f.r * s, by)
        g.arc(bx, by, f.r * s, 0, Math.PI, false)
        g.moveTo(tx + f.r * s, ty)
        g.ellipse(tx, ty, f.r * s, f.r * s, 0, 0, Math.PI * 2)
        g.moveTo(bx - f.r * s, by)
        g.lineTo(tx - f.r * s, ty)
        g.moveTo(bx + f.r * s, by)
        g.lineTo(tx + f.r * s, ty)
      }
      // thumb off to the side
      g.moveTo(cx - s * 0.5, cy + s * 0.25)
      g.lineTo(cx - s * 0.95, cy - s * 0.25)
      g.ellipse(cx - s * 0.98, cy - s * 0.3, s * 0.13, s * 0.13, 0, 0, Math.PI * 2)
    }

    // the always-on magic overlay: hand skeletons as glowing filaments,
    // the summoning guide before awakening, and dev-mode readouts
    const drawOverlay = (res: HandLandmarkerResult | null) => {
      const cv = overlayRef.current
      if (!cv) return
      const W = window.innerWidth
      const H = window.innerHeight
      if (cv.width !== W || cv.height !== H) {
        cv.width = W
        cv.height = H
      }
      const g = cv.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, W, H)
      const now = performance.now()

      if (!ritual.done) {
        // summoning circle: an actual-hand-shaped guide, right of centre,
        // with a progress ring filling around it while the hand holds
        const cx = RITUAL_X * W
        const cy = RITUAL_Y * H
        const s = Math.min(W, H) * 0.13
        const p = Math.min(1, ritual.hold / RITUAL_FRAMES)
        const breathe = 0.8 + 0.2 * Math.sin(now / 600)
        g.save()
        g.globalCompositeOperation = 'lighter'
        // a pale-gold summoning circle turns slowly beneath the guide
        const seal = sigilFor(SIGIL_PALE)
        if (seal) {
          const SR = s * 2.5
          g.save()
          g.translate(cx, cy)
          g.rotate(now / 14000)
          g.globalAlpha = (0.22 + p * 0.5) * breathe
          g.drawImage(seal, -SR, -SR, SR * 2, SR * 2)
          g.restore()
        }
        // the guide itself: a real hand rimmed in candlelight (generated
        // artwork, additive so its black ground melts into the room)
        const handImg = sigilFor(HAND_GUIDE)
        if (handImg) {
          const HR = s * 2.3
          g.globalAlpha = (0.5 + p * 0.5) * breathe
          g.drawImage(handImg, cx - HR, cy - HR * 1.08, HR * 2, HR * 2)
        } else {
          g.strokeStyle = '#e8c47a'
          g.shadowColor = '#e8c47a'
          g.shadowBlur = 16
          g.lineWidth = 2
          g.globalAlpha = (0.35 + p * 0.55) * breathe
          traceHandGuide(g, cx, cy, s)
          g.stroke()
        }
        // outer ring + filling progress arc
        const R = s * 2.1
        g.globalAlpha = 0.3 * breathe
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(cx, cy, R, 0, Math.PI * 2)
        g.stroke()
        g.globalAlpha = 0.9
        g.lineWidth = 3.5
        g.strokeStyle = '#f5dfa8'
        g.beginPath()
        g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2)
        g.stroke()
        // rotating outer ticks — the seal charging up
        g.globalAlpha = 0.25 + p * 0.5
        g.lineWidth = 1.2
        g.strokeStyle = '#e8c47a'
        for (let i = 0; i < 16; i++) {
          const a = now / 3000 + (i / 16) * Math.PI * 2
          g.beginPath()
          g.moveTo(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06)
          g.lineTo(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12)
          g.stroke()
        }
        g.shadowBlur = 0
        g.globalAlpha = 0.75
        g.fillStyle = '#e8e3d8'
        g.font = '13px system-ui, sans-serif'
        g.textAlign = 'center'
        g.fillText('place your right hand in the circle', cx, cy + R + 28)
        g.restore()
      }

      if (!res) return
      res.landmarks.forEach((lm, hand) => {
        // anchor at the palm's canvas position, but keep the skeleton's
        // own geometry at true camera scale — mapping every joint through
        // the wide-reach crop stretched the hand to giant proportions
        const ax = zoom(1 - lm[MIDDLE_MCP].x) * W
        const ay = zoom(lm[MIDDLE_MCP].y) * H
        const px = (i: number) => ax + (lm[MIDDLE_MCP].x - lm[i].x) * W * 0.72
        const py = (i: number) => ay + (lm[i].y - lm[MIDDLE_MCP].y) * H * 0.72
        const pen = getPen(HAND_PENS[hand % HAND_PENS.length])
        const s = hands.get(hand)
        g.save()
        g.globalCompositeOperation = 'lighter'
        const dim = ritual.done ? 0.55 : 0.9
        // a pool of light cradling the palm, so the hand feels lit from
        // within rather than wireframed
        const palmR = Math.hypot(px(WRIST) - ax, py(WRIST) - ay) * 1.5 || 60
        const pg = g.createRadialGradient(ax, ay, 0, ax, ay, palmR)
        pg.addColorStop(0, `${pen.color}55`)
        pg.addColorStop(1, `${pen.color}00`)
        g.globalAlpha = dim
        g.fillStyle = pg
        g.beginPath()
        g.arc(ax, ay, palmR, 0, Math.PI * 2)
        g.fill()
        // filament skeleton drawn as tapering candle-lit strokes: thick
        // and warm at the palm, thinning to bright hairlines at the tips
        g.lineCap = 'round'
        g.shadowColor = pen.color
        for (const chain of BONES) {
          for (let i = 1; i < chain.length; i++) {
            const f = i / (chain.length - 1)
            g.strokeStyle = pen.color
            g.shadowBlur = 10 - f * 5
            g.lineWidth = 4.2 - f * 3
            g.globalAlpha = (0.35 + 0.4 * (1 - f)) * dim
            g.beginPath()
            g.moveTo(px(chain[i - 1]), py(chain[i - 1]))
            g.lineTo(px(chain[i]), py(chain[i]))
            g.stroke()
            // a bright hairline core over the soft stroke
            g.strokeStyle = '#fff6e0'
            g.shadowBlur = 0
            g.lineWidth = 0.8
            g.globalAlpha = 0.5 * dim
            g.beginPath()
            g.moveTo(px(chain[i - 1]), py(chain[i - 1]))
            g.lineTo(px(chain[i]), py(chain[i]))
            g.stroke()
          }
        }
        // fingertips carry candle flames; other joints only faint motes
        for (let i = 0; i < lm.length; i++) {
          const tipish = i === THUMB_TIP || i === INDEX_TIP
          if (tipish) {
            const flick = 0.85 + 0.15 * Math.sin(now / 90 + i * 3.1)
            const fr = 7 * flick
            const fg = g.createRadialGradient(px(i), py(i), 0, px(i), py(i), fr * 2.4)
            fg.addColorStop(0, '#fff6e0')
            fg.addColorStop(0.35, pen.color)
            fg.addColorStop(1, `${pen.color}00`)
            g.globalAlpha = 0.9 * dim
            g.fillStyle = fg
            g.beginPath()
            g.arc(px(i), py(i), fr * 2.4, 0, Math.PI * 2)
            g.fill()
          } else {
            g.globalAlpha = 0.3 * dim
            g.fillStyle = pen.color
            g.beginPath()
            g.arc(px(i), py(i), 2, 0, Math.PI * 2)
            g.fill()
          }
        }
        g.restore()

        if (devRef.current && s) {
          const wrist = lm[WRIST]
          const mcp = lm[MIDDLE_MCP]
          const palm = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y) || 1
          const pinch =
            Math.hypot(
              lm[INDEX_TIP].x - lm[THUMB_TIP].x,
              lm[INDEX_TIP].y - lm[THUMB_TIP].y,
            ) / palm
          const lines = [
            `hand ${hand}  ${s.pinched ? 'CONJURING' : 'idle'}`,
            `pinch ${pinch.toFixed(2)} (on<${PINCH_ON} off>${PINCH_OFF})`,
            `depth ${s.sz.toFixed(2)}  ritual ${ritual.done ? 'done' : ritual.hold}`,
          ]
          g.font = '12px monospace'
          g.textBaseline = 'top'
          g.textAlign = 'left'
          const tx = px(WRIST) + 16
          const ty = py(WRIST) + 8
          g.fillStyle = 'rgba(0,0,0,0.55)'
          g.fillRect(tx - 4, ty - 4, 250, lines.length * 15 + 8)
          g.fillStyle = '#d9f2e2'
          lines.forEach((l, i) => g.fillText(l, tx, ty + i * 15))
        }
      })
    }

    const onFrame = (res: HandLandmarkerResult) => {
      drawOverlay(res)
      const cursors: SurfaceCursor[] = []
      const seen = new Set<number>()
      // the ritual: any hand hovering inside the summoning circle charges
      // it; when the ring completes, the instrument awakens with a bloom
      let inCircle = false
      res.landmarks.forEach((lm, hand) => {
        seen.add(hand)
        const thumb = lm[THUMB_TIP]
        const tip = lm[INDEX_TIP]
        const wrist = lm[WRIST]
        const mcp = lm[MIDDLE_MCP]
        const palm = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y)

        const rawX = zoom(1 - tip.x)
        const rawY = zoom(tip.y)
        const pinchDist =
          Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / (palm || 1)

        const state = hands.get(hand) ?? {
          pinched: false,
          last: null,
          speed: 0,
          sx: rawX,
          sy: rawY,
          sz: 0.5,
          glitch: 0,
          pinchHold: 0,
          miss: 0,
        }
        state.miss = 0
        // webcam glitch guard: when tracking clips out the landmark can
        // teleport across the frame for a frame or two — ignore impossible
        // jumps instead of letting the stroke leap with them
        const jump = Math.hypot(rawX - state.sx, rawY - state.sy)
        if (jump < 0.25 || state.glitch > 5) {
          // a sustained "jump" is a real move: snap back onto the hand.
          // adaptive smoothing: the faster the move, the tighter we follow
          const a = Math.min(SMOOTH_MAX, SMOOTH_MIN + jump * 6)
          state.sx += (rawX - state.sx) * a
          state.sy += (rawY - state.sy) * a
          state.glitch = 0
        } else {
          state.glitch++
        }
        const x = state.sx
        const y = state.sy
        const now = performance.now()
        if (state.last) {
          const dist = Math.hypot(x - state.last.x, y - state.last.y)
          const dt = Math.max(1, now - state.last.t)
          state.speed += ((dist * 1000) / dt - state.speed) * 0.3
        }
        state.last = { x, y, t: now }

        // depth (Z axis of the 3D space): the tracked hand's size in the
        // frame — palm span grows as the hand nears the camera
        const zRaw = Math.min(1, Math.max(0, (palm - 0.06) / 0.22))
        state.sz += (zRaw - state.sz) * 0.15

        const id = 1000 + hand
        const pen = HAND_PENS[hand % HAND_PENS.length]
        const penColor = getPen(pen).color

        if (!ritual.done) {
          // before the awakening: only the ritual listens to the hand
          const guideR = Math.min(1, window.innerWidth / window.innerHeight)
          const dx = (x - RITUAL_X) * (window.innerWidth / window.innerHeight)
          const dy = y - RITUAL_Y
          if (Math.hypot(dx, dy) < 0.16 * guideR + 0.1) inCircle = true
          hands.set(hand, state)
          return
        }

        // pinch strength doubles as pressure: tighter pinch = heavier ink
        const pressure = Math.min(
          1,
          Math.max(0.15, (PINCH_OFF - pinchDist) / (PINCH_OFF - 0.15)),
        )
        const p: DrawPoint = { x, y, pressure, speed: state.speed, z: state.sz }

        // debounced pinch: must hold for a few frames so a finger briefly
        // crossing the thumb doesn't start (or cut) a stroke
        const pinchCond = state.pinched
          ? pinchDist > PINCH_OFF
          : pinchDist < PINCH_ON
        state.pinchHold = pinchCond ? state.pinchHold + 1 : 0
        if (!state.pinched && state.pinchHold >= PINCH_FRAMES) {
          state.pinched = true
          state.pinchHold = 0
          surface.current?.strokeStart(id, pen, p)
        } else if (state.pinched && state.pinchHold >= PINCH_FRAMES) {
          state.pinched = false
          state.pinchHold = 0
          surface.current?.strokeEnd(id)
        } else if (state.pinched) {
          surface.current?.strokeMove(id, pen, p)
        }
        hands.set(hand, state)

        cursors.push({
          x,
          y,
          id,
          color: penColor,
          active: state.pinched,
          // how close this finger is to activating (ring contracts)
          strength: Math.min(
            1,
            Math.max(0, (1.2 - pinchDist) / (1.2 - PINCH_ON)),
          ),
          kind: 'tip',
          // palm span scales the conjuring seal to the actual hand
          size: palm * 2.2,
        })
        // the thumb is the activation point: show it as an anchor
        cursors.push({
          x: zoom(1 - thumb.x),
          y: zoom(thumb.y),
          color: '#e8e3d8',
          active: false,
          kind: 'thumb',
        })
      })
      if (!ritual.done) {
        if (inCircle) {
          ritual.hold++
          setSummon(ritual.hold / RITUAL_FRAMES)
          if (ritual.hold >= RITUAL_FRAMES) {
            ritual.done = true
            summonComplete()
          }
        } else {
          ritual.hold = Math.max(0, ritual.hold - 2)
          if (ritual.hold === 0) stopSummon()
          else setSummon(ritual.hold / RITUAL_FRAMES)
        }
      }
      // hands that left the frame: give tracking a grace period to find
      // them again before their strokes are released
      for (const [hand, s] of hands) {
        if (!seen.has(hand)) {
          s.miss++
          if (s.miss >= MISS_FRAMES) {
            if (s.pinched) surface.current?.strokeEnd(1000 + hand)
            hands.delete(hand)
          }
        }
      }
      surface.current?.setCursors(cursors)
    }

    let lastVideoTime = -1
    const loop = () => {
      if (stopped) return
      // only run detection on fresh camera frames — re-detecting the same
      // frame wastes GPU and adds jitter
      if (
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime
        onFrame(landmarker.detectForVideo(video, performance.now()))
      } else if (!ritual.done) {
        // keep the summoning guide breathing even between camera frames
        drawOverlay(null)
      }
      raf = requestAnimationFrame(loop)
    }

    ;(async () => {
      try {
        const [fileset, media] = await Promise.all([
          FilesetResolver.forVisionTasks(WASM_BASE),
          navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
          }),
        ])
        if (stopped) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        video.srcObject = media
        await video.play()
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          // hold onto a found hand more stubbornly than the defaults do
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        })
        loop()
      } catch (err) {
        console.warn('hand tracking unavailable:', err)
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      endAll()
      landmarker?.close()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [surface])

  // camera feed is hidden in normal use; dev mode (D) ghosts it over the
  // room, mirrored to match the canvas. The overlay canvas always shows
  // the glowing hand skeleton and the summoning guide.
  return (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        style={
          dev
            ? {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                objectFit: 'fill',
                transform: 'scaleX(-1)',
                opacity: 0.3,
                pointerEvents: 'none',
                zIndex: 40,
              }
            : {
                position: 'fixed',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }
        }
      />
      <canvas
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 41,
        }}
      />
    </>
  )
}
