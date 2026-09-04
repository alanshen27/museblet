// The strike event surface. Everything that can land a strike — the live
// MediaPipe Pose path, the ghost performer, the pointer fallback, or an
// offline test harness feeding fixture frames — goes through `emitStrike`;
// everything that reacts (sound, ink, Max) subscribes with `onStrike`.
// Keep this thin: it is the contract other tools build against.

import type { Joint, Side, StrikeKind } from './sanda'

export type StrikeSource = 'pose' | 'ghost' | 'pointer' | 'harness'

export interface StrikeEvent {
  type: StrikeKind
  side: Side
  /** 0..1 — how sure the classifier is this was a strike */
  confidence: number
  /** 0..1 — how hard */
  force: number
  /** screen position of the striking limb (0..1, mirrored/selfie space) */
  x: number
  y: number
  /** unit direction of travel (0,-1 when unknown) */
  dx: number
  dy: number
  /** the tracked joints at the moment of the strike, if a body was tracked */
  joints: Record<string, Joint> | null
  /** punches in the last 1.2 s, including this one */
  rapid: number
  source: StrikeSource
  /** performance.now() ms */
  t: number
}

type Handler = (e: StrikeEvent) => void
const handlers = new Set<Handler>()

/** subscribe; returns an unsubscribe */
export function onStrike(handler: Handler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** land a strike: every subscriber hears it */
export function emitStrike(e: StrikeEvent) {
  for (const h of handlers) {
    try {
      h(e)
    } catch (err) {
      console.warn('strike handler failed:', err)
    }
  }
}

/** a convenience for partial events (defaults for the optional geometry) */
export function strikeEvent(
  partial: Pick<StrikeEvent, 'type' | 'side' | 'confidence' | 'force' | 'source'> & Partial<StrikeEvent>,
): StrikeEvent {
  return {
    x: 0.5,
    y: 0.5,
    dx: 0,
    dy: -1,
    joints: null,
    rapid: 0,
    t: performance.now(),
    ...partial,
  }
}
