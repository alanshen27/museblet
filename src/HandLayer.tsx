import { useEffect, useRef } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type {
  DrawHandle,
  DrawPoint,
  SurfaceCursor,
  SurfaceMenu,
} from './DrawSurface'
import { PENS } from './pens'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

// landmark indices
const THUMB_TIP = 4
const INDEX_TIP = 8
const FINGER_TIPS = [8, 12, 16, 20]
const WRIST = 0
const MIDDLE_MCP = 9

// pinch hysteresis, as a fraction of palm size (wrist -> middle knuckle):
// a tighter threshold so hovering fingers don't draw by accident
const PINCH_ON = 0.32
const PINCH_OFF = 0.44

// fist hysteresis: avg fingertip-to-wrist distance vs palm size — when the
// hand bunches into a fist the fingertips fold in close to the wrist
const FIST_ON = 1.15
const FIST_OFF = 1.45

// rotating the fist by this much moves the wheel highlight by one pen
const STEP_RAD = Math.PI / 5

// camera footage is shaky: exponentially smooth each fingertip before it
// ever reaches the stroke, on top of the surface's own relax/curve passes
const SMOOTH = 0.35

interface HandState {
  pinched: boolean
  last: { x: number; y: number; t: number } | null
  speed: number
  sx: number // smoothed index-tip position
  sy: number
  pen: number // index into PENS
  fist: boolean
  menuAngle: number // hand roll angle when the fist closed
  menuSel: number
}

interface Props {
  surface: React.RefObject<DrawHandle | null>
}

/**
 * Camera hand tracking: MediaPipe finds up to two hands. Pinching index to
 * thumb draws (and plays) with the hand's current pen; bunching a fist
 * summons a radial pen wheel — rotate the fist to spin the highlight and
 * open the hand to select.
 */
export default function HandLayer({ surface }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let landmarker: HandLandmarker | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const hands = new Map<number, HandState>()

    const endAll = () => {
      for (const [id, s] of hands) {
        if (s.pinched) surface.current?.strokeEnd(1000 + id)
      }
      hands.clear()
      surface.current?.setCursors([])
      surface.current?.setMenus([])
    }

    const onFrame = (res: HandLandmarkerResult) => {
      const cursors: SurfaceCursor[] = []
      const menus: SurfaceMenu[] = []
      const seen = new Set<number>()
      res.landmarks.forEach((lm, hand) => {
        seen.add(hand)
        const thumb = lm[THUMB_TIP]
        const tip = lm[INDEX_TIP]
        const wrist = lm[WRIST]
        const mcp = lm[MIDDLE_MCP]
        const palm = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y)

        // selfie view: mirror x so moving right moves the dot right
        const rawX = Math.min(1, Math.max(0, 1 - tip.x))
        const rawY = Math.min(1, Math.max(0, tip.y))
        const pinchDist =
          Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / (palm || 1)

        const state = hands.get(hand) ?? {
          pinched: false,
          last: null,
          speed: 0,
          sx: rawX,
          sy: rawY,
          pen: hand % PENS.length,
          fist: false,
          menuAngle: 0,
          menuSel: 0,
        }
        state.sx += (rawX - state.sx) * SMOOTH
        state.sy += (rawY - state.sy) * SMOOTH
        const x = state.sx
        const y = state.sy
        const now = performance.now()
        if (state.last) {
          const dist = Math.hypot(x - state.last.x, y - state.last.y)
          const dt = Math.max(1, now - state.last.t)
          state.speed += ((dist * 1000) / dt - state.speed) * 0.3
        }
        state.last = { x, y, t: now }

        // fist detection: fingertips folded in close to the wrist
        const fold =
          FINGER_TIPS.reduce(
            (sum, i) => sum + Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y),
            0,
          ) /
          (4 * (palm || 1))
        // hand roll: angle of the wrist -> middle-knuckle axis (mirrored x)
        const roll = Math.atan2(mcp.y - wrist.y, -(mcp.x - wrist.x))

        const id = 1000 + hand
        if (!state.fist && fold < FIST_ON) {
          // fist closes: summon the wheel, drop any active stroke
          state.fist = true
          state.menuAngle = roll
          state.menuSel = state.pen
          if (state.pinched) {
            state.pinched = false
            surface.current?.strokeEnd(id)
          }
        } else if (state.fist && fold > FIST_OFF) {
          // hand opens: commit the highlighted pen
          state.fist = false
          state.pen = state.menuSel
        }

        if (state.fist) {
          // spin the highlight as the fist rotates
          let d = roll - state.menuAngle
          while (d > Math.PI) d -= Math.PI * 2
          while (d < -Math.PI) d += Math.PI * 2
          const steps = Math.round(d / STEP_RAD)
          state.menuSel =
            (((state.pen + steps) % PENS.length) + PENS.length) % PENS.length
          menus.push({
            x: Math.min(1, Math.max(0, 1 - mcp.x)),
            y: Math.min(1, Math.max(0, mcp.y)),
            selected: state.menuSel,
          })
          hands.set(hand, state)
          return
        }

        // pinch strength doubles as pressure: tighter pinch = heavier ink
        const pressure = Math.min(
          1,
          Math.max(0.15, (PINCH_OFF - pinchDist) / (PINCH_OFF - 0.15)),
        )
        const p: DrawPoint = { x, y, pressure, speed: state.speed }
        const pen = PENS[state.pen].id

        if (!state.pinched && pinchDist < PINCH_ON) {
          state.pinched = true
          surface.current?.strokeStart(id, pen, p)
        } else if (state.pinched && pinchDist > PINCH_OFF) {
          state.pinched = false
          surface.current?.strokeEnd(id)
        } else if (state.pinched) {
          surface.current?.strokeMove(id, pen, p)
        }
        hands.set(hand, state)

        cursors.push({
          x,
          y,
          color: PENS[state.pen].color,
          active: state.pinched,
          // how close this finger is to activating (ring contracts)
          strength: Math.min(
            1,
            Math.max(0, (1.2 - pinchDist) / (1.2 - PINCH_ON)),
          ),
          kind: 'tip',
        })
        // the thumb is the activation point: show it as an anchor
        cursors.push({
          x: Math.min(1, Math.max(0, 1 - thumb.x)),
          y: Math.min(1, Math.max(0, thumb.y)),
          color: '#e8e3d8',
          active: false,
          kind: 'thumb',
        })
      })
      // hands that left the frame release their strokes
      for (const [hand, s] of hands) {
        if (!seen.has(hand)) {
          if (s.pinched) surface.current?.strokeEnd(1000 + hand)
          hands.delete(hand)
        }
      }
      surface.current?.setCursors(cursors)
      surface.current?.setMenus(menus)
    }

    const loop = () => {
      if (stopped) return
      if (landmarker && video.readyState >= 2) {
        onFrame(landmarker.detectForVideo(video, performance.now()))
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

  // hidden camera feed: only the projected dots are visible on the surface
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      style={{
        position: 'fixed',
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
