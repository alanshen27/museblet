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

// fist hysteresis: avg fingertip-to-wrist distance vs palm size — a
// bunched fist curls the fingertips back in towards the wrist
const FIST_ON = 1.1
const FIST_OFF = 1.35

// rotating the fist by this much moves the wheel highlight by one pen:
// very sensitive, so a small twist spins the selection
const STEP_RAD = Math.PI / 14

// gestures must hold steady for this many consecutive frames before they
// trigger — overlapping fingers momentarily look like pinches/fists and
// would otherwise fire strokes or switch tools at random
const PINCH_FRAMES = 3
const FIST_FRAMES = 6

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

interface HandState {
  pinched: boolean
  last: { x: number; y: number; t: number } | null
  speed: number
  sx: number // smoothed index-tip position
  sy: number
  glitch: number // consecutive frames rejected as tracking glitches
  pen: number // index into PENS
  fist: boolean
  menuAngle: number // hand roll angle when the fist closed
  menuSel: number
  pinchHold: number // consecutive frames the pinch condition has held
  fistHold: number // consecutive frames the fist condition has held
  clickArmed: boolean // index has lifted off the thumb since the wheel opened
  clickHold: number // consecutive frames the confirm tap has held
  cooldown: number // frames after a confirm tap during which gestures are ignored
  miss: number // consecutive frames the hand has been lost by tracking
}

interface Props {
  surface: React.RefObject<DrawHandle | null>
}

/**
 * Camera hand tracking: MediaPipe finds up to two hands. Pinching index to
 * thumb draws (and plays) with the hand's current pen; bunching a fist
 * summons a radial pen wheel — rotate the fist to spin the highlight,
 * then tap index to thumb (or open the hand) to confirm the colour.
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

        // selfie view: mirror x so moving right moves the dot right.
        // wide-angle mapping: the central region of the camera frame maps
        // to the full canvas, so the whole surface is reachable without
        // stretching your hand to the frame edges
        const zoom = (v: number) =>
          Math.min(1, Math.max(0, (v - CAM_MARGIN) / (1 - 2 * CAM_MARGIN)))
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
          glitch: 0,
          pen: hand % PENS.length,
          fist: false,
          menuAngle: 0,
          menuSel: 0,
          pinchHold: 0,
          fistHold: 0,
          clickArmed: false,
          clickHold: 0,
          cooldown: 0,
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

        // fist detection: fingertips curled back in towards the wrist
        const spread =
          FINGER_TIPS.reduce(
            (sum, i) => sum + Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y),
            0,
          ) /
          (4 * (palm || 1))
        // hand roll: angle of the wrist -> middle-knuckle axis (mirrored x)
        const roll = Math.atan2(mcp.y - wrist.y, -(mcp.x - wrist.x))

        const id = 1000 + hand
        // debounced fist: bunched fingers mid-pinch can look fist-like for
        // a frame or two — only a held fist summons or dismisses the wheel
        if (state.cooldown > 0) state.cooldown--
        const fistCond = state.fist ? spread > FIST_OFF : spread < FIST_ON
        state.fistHold = fistCond ? state.fistHold + 1 : 0
        if (
          !state.fist &&
          !state.pinched &&
          state.cooldown === 0 &&
          state.fistHold >= FIST_FRAMES
        ) {
          state.fist = true
          state.fistHold = 0
          state.menuAngle = roll
          state.menuSel = state.pen
          // a bunched fist starts with the index near the thumb, so the
          // confirm tap only arms once the finger has lifted away
          state.clickArmed = false
          state.clickHold = 0
        } else if (state.fist && state.fistHold >= FIST_FRAMES) {
          // hand opens: commit the highlighted pen
          state.fist = false
          state.fistHold = 0
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
          // tap index to thumb to confirm the highlighted colour
          if (!state.clickArmed) {
            if (pinchDist > PINCH_OFF) state.clickArmed = true
          } else if (pinchDist < PINCH_ON) {
            state.clickHold++
            if (state.clickHold >= PINCH_FRAMES) {
              state.pen = state.menuSel
              state.fist = false
              state.fistHold = 0
              state.clickArmed = false
              state.clickHold = 0
              state.cooldown = 12
              hands.set(hand, state)
              return
            }
          } else {
            state.clickHold = 0
          }
          menus.push({
            x: zoom(1 - mcp.x),
            y: zoom(mcp.y),
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

        // debounced pinch: must hold for a few frames so a finger briefly
        // crossing the thumb doesn't start (or cut) a stroke
        const pinchCond = state.pinched
          ? pinchDist > PINCH_OFF
          : pinchDist < PINCH_ON
        state.pinchHold = pinchCond ? state.pinchHold + 1 : 0
        if (
          !state.pinched &&
          state.cooldown === 0 &&
          state.pinchHold >= PINCH_FRAMES
        ) {
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
          x: zoom(1 - thumb.x),
          y: zoom(thumb.y),
          color: '#e8e3d8',
          active: false,
          kind: 'thumb',
        })
      })
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
      surface.current?.setMenus(menus)
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
