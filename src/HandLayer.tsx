import { useEffect, useRef } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { DrawHandle, DrawPoint, SurfaceCursor } from './DrawSurface'
import { PENS } from './pens'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

// landmark indices: thumb tip + the four fingertips
const THUMB_TIP = 4
const FINGER_TIPS = [8, 12, 16, 20] // index, middle, ring, pinky
const WRIST = 0
const MIDDLE_MCP = 9

// each finger-to-thumb pinch is its own instrument:
// index=pen1, middle=pen2, ring=pen3, pinky=pen4
const FINGER_PENS = [PENS[0].id, PENS[1].id, PENS[2].id, PENS[3].id]

// pinch hysteresis, as a fraction of palm size (wrist -> middle knuckle)
const PINCH_ON = 0.42
const PINCH_OFF = 0.55

interface FingerState {
  pinched: boolean
  last: { x: number; y: number; t: number } | null
  speed: number
}

interface Props {
  surface: React.RefObject<DrawHandle | null>
}

/**
 * Camera hand tracking: MediaPipe finds up to two hands; each fingertip
 * projects a small cursor dot onto the surface, and pinching a finger to
 * the thumb draws (and plays) with that finger's own pen.
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
    const fingers = new Map<number, FingerState>()

    const idFor = (hand: number, finger: number) => 1000 + hand * 10 + finger

    const endAll = () => {
      for (const [id, f] of fingers) {
        if (f.pinched) surface.current?.strokeEnd(id)
      }
      fingers.clear()
      surface.current?.setCursors([])
    }

    const onFrame = (res: HandLandmarkerResult) => {
      const cursors: SurfaceCursor[] = []
      const seen = new Set<number>()
      res.landmarks.forEach((lm, hand) => {
        const thumb = lm[THUMB_TIP]
        const palm = Math.hypot(
          lm[WRIST].x - lm[MIDDLE_MCP].x,
          lm[WRIST].y - lm[MIDDLE_MCP].y,
        )
        FINGER_TIPS.forEach((tipIdx, finger) => {
          const tip = lm[tipIdx]
          const id = idFor(hand, finger)
          seen.add(id)
          // selfie view: mirror x so moving right moves the dot right
          const x = Math.min(1, Math.max(0, 1 - tip.x))
          const y = Math.min(1, Math.max(0, tip.y))
          const pinchDist =
            Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / (palm || 1)

          const state = fingers.get(id) ?? {
            pinched: false,
            last: null,
            speed: 0,
          }
          const now = performance.now()
          if (state.last) {
            const dist = Math.hypot(x - state.last.x, y - state.last.y)
            const dt = Math.max(1, now - state.last.t)
            state.speed += ((dist * 1000) / dt - state.speed) * 0.3
          }
          state.last = { x, y, t: now }

          // pinch strength doubles as pressure: tighter pinch = heavier ink
          const pressure = Math.min(
            1,
            Math.max(0.15, (PINCH_OFF - pinchDist) / (PINCH_OFF - 0.15)),
          )
          const p: DrawPoint = { x, y, pressure, speed: state.speed }
          const pen = FINGER_PENS[finger]

          if (!state.pinched && pinchDist < PINCH_ON) {
            state.pinched = true
            surface.current?.strokeStart(id, pen, p)
          } else if (state.pinched && pinchDist > PINCH_OFF) {
            state.pinched = false
            surface.current?.strokeEnd(id)
          } else if (state.pinched) {
            surface.current?.strokeMove(id, pen, p)
          }
          fingers.set(id, state)

          cursors.push({
            x,
            y,
            color: PENS[finger].color,
            active: state.pinched,
          })
        })
      })
      // hands that left the frame release their strokes
      for (const [id, f] of fingers) {
        if (!seen.has(id)) {
          if (f.pinched) surface.current?.strokeEnd(id)
          fingers.delete(id)
        }
      }
      surface.current?.setCursors(cursors)
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
