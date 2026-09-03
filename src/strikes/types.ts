/** Normalized pose landmark in image space (MediaPipe convention: y down). */
export interface PoseJoint {
  x: number
  y: number
  z: number
  visibility?: number
}

export type StrikeType = 'punch' | 'kick' | 'guard' | 'neutral' | 'unknown'

export interface StrikeScores {
  punch: number
  kick: number
  guard: number
  neutral: number
  unknown: number
}

export interface StrikeClassification {
  type: StrikeType
  confidence: number
  /** Dominant limb for punch/kick when applicable. */
  side?: 'left' | 'right'
  joints: Record<string, PoseJoint>
  scores: StrikeScores
  poseDetected: boolean
  notes?: string[]
}

/** Production-facing strike onset event (live video adds velocity later). */
export interface StrikeEvent {
  type: 'punch' | 'kick'
  confidence: number
  side: 'left' | 'right'
  joints: Record<string, PoseJoint>
  source?: 'image' | 'video'
}

export type StrikeListener = (event: StrikeEvent) => void
