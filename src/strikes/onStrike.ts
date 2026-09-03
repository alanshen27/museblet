import type { StrikeClassification, StrikeEvent, StrikeListener } from './types'

const listeners = new Set<StrikeListener>()

/** Subscribe to strike onset events (shared by harness + future live path). */
export function onStrike(listener: StrikeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Emit a strike event to all subscribers. */
export function emitStrike(event: StrikeEvent): void {
  for (const fn of listeners) fn(event)
}

const STRIKE_THRESHOLD = 0.42

/**
 * If classification is a confident punch/kick, fire `onStrike` and log.
 * Returns the event when emitted.
 */
export function maybeEmitStrike(
  result: StrikeClassification,
  source: StrikeEvent['source'] = 'image',
): StrikeEvent | null {
  if (
    (result.type !== 'punch' && result.type !== 'kick') ||
    result.confidence < STRIKE_THRESHOLD ||
    !result.side
  ) {
    return null
  }
  const event: StrikeEvent = {
    type: result.type,
    confidence: result.confidence,
    side: result.side,
    joints: result.joints,
    source,
  }
  console.info('[onStrike]', event)
  emitStrike(event)
  return event
}
