import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { DrawHandle, DrawPoint } from './InkSurface'
import { PUNCH_SPEED, SandaTracker, type BodyState } from './sanda'
import { INK } from './instruments'
import { demoPose } from './demoPose'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
// BlazePose GHUM "full": 33 keypoints with metric world coordinates. The
// lite model drops accuracy on fast limbs (exactly what a strike is); the
// heavy model is ~3x slower for a small gain. `?pose=heavy` / `?pose=lite`
// override.
const MODEL_URLS: Record<string, string> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
}

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
  /** current section 0..3, for the ghost performer */
  section: number
  /** seconds since the piece opened, for the ghost performer */
  pieceSeconds: number
  /** seconds since the section began */
  sectionSeconds: number
}

/**
 * Camera body tracking. MediaPipe Pose finds the whole figure; the Sanda
 * tracker reads stance, breath and strikes from it. A slow left hand above
 * the hips brushes the qin, a slow right hand the pipa; a fast one strikes.
 * Without a camera (or with `?demo`), a scripted ghost performer plays
 * the piece. Press D for the tracking view.
 */
export default function BodyLayer({ surface, onBody, open, section, pieceSeconds, sectionSeconds }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [dev, setDev] = useState(false)
  const devRef = useRef(dev)
  devRef.current = dev
  const openRef = useRef(open)
  openRef.current = open
  const onBodyRef = useRef(onBody)
  onBodyRef.current = onBody
  const sectionRef = useRef(section)
  sectionRef.current = section
  const secondsRef = useRef(pieceSeconds)
  secondsRef.current = pieceSeconds
  const sectionSecRef = useRef(sectionSeconds)
  sectionSecRef.current = sectionSeconds
  const [status, setStatus] = useState<'starting' | 'tracking' | 'ghost'>('starting')
  const [model, setModel] = useState('full')

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
    let ghost = false
    let ghostSince = 0
    const params = new URLSearchParams(window.location.search)
    const wantDemo = params.has('demo')
    const modelName = MODEL_URLS[params.get('pose') ?? ''] ? (params.get('pose') as string) : 'full'
    setModel(modelName)
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
      g.font = '12px ui-monospace, monospace'
      g.textBaseline = 'top'
      if (!b) {
        g.fillStyle = INK.ash
        g.fillText('pose · waiting for camera frames', 22, H - 40)
        return
      }
      const lines = [
        `${ghost ? 'ghost performer' : `pose ${modelName}`} ${b.present ? 'tracking' : 'lost'}   phase ${b.phase}   section ${sectionRef.current} @ ${sectionSecRef.current.toFixed(1)}s   piece ${secondsRef.current.toFixed(1)}s`,
        `energy ${b.energy.toFixed(2)}  stillness ${b.stillness.toFixed(2)}  breath ${b.breath.toFixed(2)}`,
        `stance ${b.stance.toFixed(2)}  root ${b.root.toFixed(2)}  guard ${b.guard.toFixed(2)}  lean ${b.lean.toFixed(2)}  turn ${b.turn.toFixed(2)}`,
        `L wrist ${b.joints.lWrist?.speed.toFixed(1) ?? '-'}  R wrist ${b.joints.rWrist?.speed.toFixed(1) ?? '-'}  (punch > ${PUNCH_SPEED})`,
        `L foot ${b.joints.lFoot?.speed.toFixed(1) ?? '-'}  R foot ${b.joints.rFoot?.speed.toFixed(1) ?? '-'}  rapid ${b.rapid}`,
      ]
      g.fillStyle = 'rgba(0,0,0,0.5)'
      g.fillRect(16, H - 16 - lines.length * 16 - 8, 520, lines.length * 16 + 8)
      g.fillStyle = INK.paper
      lines.forEach((l, i) => g.fillText(l, 22, H - 16 - lines.length * 16 - 4 + i * 16))
      for (const j of b.all) {
        g.fillStyle = j.vis > 0.5 ? INK.paper : INK.ash
        g.beginPath()
        g.arc(j.x * W, j.y * H, 2.5, 0, Math.PI * 2)
        g.fill()
      }
    }

    const brush = (b: BodyState) => {
      const hipY = ((b.joints.lHip?.y ?? 1) + (b.joints.rHip?.y ?? 1)) / 2
      const now = performance.now()
      // both hands brush; the app chooses qin or pipa from how the hand
      // moves (slow and wet, or fast and dry), in each hand's register
      for (const [id, name, instr] of [
        [LEFT_HAND, 'lWrist', 'qin'],
        [RIGHT_HAND, 'rWrist', 'qin'],
      ] as const) {
        const j = b.joints[name]
        const h = hands[id]
        const struck = b.strikes.some((s) => s.kind === 'kick' || s.side === (id === LEFT_HAND ? 'L' : 'R'))
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
          endBrush(id)
          continue
        }
        if (j.speed >= BRUSH_MIN) {
          h.restSince = 0
          if (!h.brushing) {
            h.brushing = true
            surface.current?.strokeStart(id, instr, p)
          } else surface.current?.strokeMove(id, instr, p)
        } else if (h.brushing) {
          if (!h.restSince) h.restSince = now
          if (now - h.restSince > REST_MS) endBrush(id)
          else surface.current?.strokeMove(id, instr, p)
        }
      }
    }

    const feed = (b: BodyState) => {
      surface.current?.setBody(b)
      onBodyRef.current(b)
      brush(b)
      readout(b)
    }

    let lastVideoTime = -1
    const loop = () => {
      if (stopped) return
      const now = performance.now()
      if (ghost) {
        // the ghost performer: before the gate opens it stands and
        // breathes, so the gate opens itself; then it plays the piece
        // one continuous clock for the performer's motion; the section and
        // its own time come from the form once the gate is open
        const t = (now - ghostSince) / 1000
        const frame = demoPose(t, openRef.current ? sectionRef.current : 0, openRef.current ? sectionSecRef.current : t)
        feed(tracker.update(frame.landmarks, now, frame.world))
      } else if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        try {
          const res = landmarker.detectForVideo(video, now)
          const lm = res.landmarks?.[0] ?? null
          const world = res.worldLandmarks?.[0] ?? null
          feed(tracker.update(lm, now, world))
        } catch (err) {
          console.warn('pose detection failed:', err)
        }
      } else if (devRef.current && !landmarker) readout(null)
      raf = requestAnimationFrame(loop)
    }
    loop()

    const startGhost = () => {
      ghost = true
      ghostSince = performance.now()
      tracker.reset()
      setStatus('ghost')
    }

    ;(async () => {
      if (wantDemo) {
        startGhost()
        return
      }
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
          baseOptions: { modelAssetPath: MODEL_URLS[modelName], delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        setStatus('tracking')
      } catch (err) {
        console.warn('body tracking unavailable, the ghost performs:', err)
        if (!stopped) startGhost()
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
      <video ref={videoRef} muted playsInline className={`body-video ${dev ? 'dev' : ''}`} />
      <canvas ref={overlayRef} className="body-overlay" />
      <div className={`body-status ${status}`} aria-live="polite">
        {status === 'starting' && 'camera · waking'}
        {status === 'tracking' && `pose · ${model}`}
        {status === 'ghost' && 'no camera · a ghost performs — click for sound; the pointer strikes'}
      </div>
    </>
  )
}
