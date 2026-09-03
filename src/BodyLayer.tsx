import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { DrawHandle, DrawPoint } from './InkSurface'
import { PUNCH_SPEED, SandaTracker, type BodyState } from './sanda'
import { INK } from './instruments'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

// pointer ids for the two brushing hands
export const LEFT_HAND = 2000
export const RIGHT_HAND = 2001

// a hand brushes when it moves slower than this (fraction of a punch)
const BRUSH_MAX = PUNCH_SPEED * 0.72
const BRUSH_MIN = 0.22
// … and lets go after resting this long
const REST_MS = 420

interface Props {
  surface: React.RefObject<DrawHandle | null>
  onBody: (b: BodyState) => void
  /** whether the gate has opened: before it, hands only stand */
  open: boolean
}

/**
 * Camera body tracking. MediaPipe Pose finds the whole figure; the Sanda
 * tracker reads stance, breath and strikes from it. A slow hand held above
 * the hips brushes the surface; a fast one strikes. Press D for the
 * tracking view.
 */
export default function BodyLayer({ surface, onBody, open }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [dev, setDev] = useState(false)
  const devRef = useRef(dev)
  devRef.current = dev
  const openRef = useRef(open)
  openRef.current = open
  const onBodyRef = useRef(onBody)
  onBodyRef.current = onBody
  const [status, setStatus] = useState<'starting' | 'tracking' | 'unavailable'>('starting')

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
    let landmarker: PoseLandmarker | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const tracker = new SandaTracker(true)
    const hands: Record<number, { brushing: boolean; restSince: number }> = {
      [LEFT_HAND]: { brushing: false, restSince: 0 },
      [RIGHT_HAND]: { brushing: false, restSince: 0 },
    }

    const endBrush = (id: number) => {
      if (hands[id].brushing) {
        hands[id].brushing = false
        surface.current?.strokeEnd(id)
      }
    }

    const readout = (b: BodyState | null) => {
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
      if (!devRef.current) return
      if (!b) {
        g.font = '12px ui-monospace, monospace'
        g.fillStyle = INK.ash
        g.fillText(landmarker ? 'pose · waiting for camera frames' : 'pose · no camera — pointer only', 22, H - 40)
        return
      }
      const lines = [
        `pose ${b.present ? 'tracking' : 'lost'}   phase ${b.phase}`,
        `energy ${b.energy.toFixed(2)}  stillness ${b.stillness.toFixed(2)}`,
        `stance ${b.stance.toFixed(2)}  root ${b.root.toFixed(2)}  guard ${b.guard.toFixed(2)}  lean ${b.lean.toFixed(2)}`,
        `L wrist ${b.joints.lWrist?.speed.toFixed(1) ?? '-'}  R wrist ${b.joints.rWrist?.speed.toFixed(1) ?? '-'}  (punch > ${PUNCH_SPEED})`,
        `L knee ${b.joints.lKnee?.speed.toFixed(1) ?? '-'}  R knee ${b.joints.rKnee?.speed.toFixed(1) ?? '-'}  rapid ${b.rapid}`,
      ]
      g.font = '12px ui-monospace, monospace'
      g.textBaseline = 'top'
      g.fillStyle = 'rgba(0,0,0,0.5)'
      g.fillRect(16, H - 16 - lines.length * 16 - 8, 460, lines.length * 16 + 8)
      g.fillStyle = INK.paper
      lines.forEach((l, i) => g.fillText(l, 22, H - 16 - lines.length * 16 - 4 + i * 16))
      for (const j of Object.values(b.joints)) {
        g.fillStyle = j.vis > 0.5 ? INK.paper : INK.ash
        g.beginPath()
        g.arc(j.x * W, j.y * H, 3, 0, Math.PI * 2)
        g.fill()
      }
    }

    const brush = (b: BodyState) => {
      const hipY = ((b.joints.lHip?.y ?? 1) + (b.joints.rHip?.y ?? 1)) / 2
      const now = performance.now()
      for (const [id, name] of [
        [LEFT_HAND, 'lWrist'],
        [RIGHT_HAND, 'rWrist'],
      ] as const) {
        const j = b.joints[name]
        const h = hands[id]
        const struck = b.strikes.some((s) => s.kind === 'kick' || (s.side === (id === LEFT_HAND ? 'L' : 'R')))
        if (!j || j.vis < 0.45 || !openRef.current || struck || j.y > hipY) {
          endBrush(id)
          continue
        }
        const p: DrawPoint = {
          x: j.x,
          y: j.y,
          pressure: Math.min(1, Math.max(0.15, 1 - j.speed / 2.4)),
          speed: j.speed,
        }
        if (j.speed > BRUSH_MAX) {
          // too fast to be a brush, not fast enough to be a fist: lift
          endBrush(id)
          continue
        }
        if (j.speed >= BRUSH_MIN) {
          h.restSince = 0
          if (!h.brushing) {
            h.brushing = true
            surface.current?.strokeStart(id, 'qin', p)
          } else surface.current?.strokeMove(id, 'qin', p)
        } else if (h.brushing) {
          if (!h.restSince) h.restSince = now
          if (now - h.restSince > REST_MS) endBrush(id)
          else surface.current?.strokeMove(id, 'qin', p)
        }
      }
    }

    let lastVideoTime = -1
    const loop = () => {
      if (stopped) return
      if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        try {
          const res = landmarker.detectForVideo(video, performance.now())
          const lm = res.landmarks?.[0] ?? null
          const b = tracker.update(lm, performance.now())
          surface.current?.setBody(b)
          onBodyRef.current(b)
          brush(b)
          readout(b)
        } catch (err) {
          console.warn('pose detection failed:', err)
        }
      } else if (devRef.current && !landmarker) readout(null)
      raf = requestAnimationFrame(loop)
    }
    loop()
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
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        setStatus('tracking')
      } catch (err) {
        console.warn('body tracking unavailable:', err)
        setStatus('unavailable')
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      endBrush(LEFT_HAND)
      endBrush(RIGHT_HAND)
      surface.current?.setBody(null)
      landmarker?.close()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [surface])

  return (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        className={`body-video ${dev ? 'dev' : ''}`}
      />
      <canvas ref={overlayRef} className="body-overlay" />
      {status !== 'tracking' && (
        <div className={`body-status ${status}`} aria-live="polite">
          {status === 'starting' ? 'camera · waking' : 'camera · unavailable — the pointer will do'}
        </div>
      )}
    </>
  )
}
