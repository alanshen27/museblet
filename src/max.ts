// Bridge to Max/MSP's [jweb] object.
// When this page is loaded inside jweb, window.max exists and lets us
// send messages out of the jweb outlet and receive messages sent to it.

export interface MaxJWeb {
  outlet: (...args: (string | number)[]) => void
  bindInlet: (name: string, fn: (...args: (string | number)[]) => void) => void
}

declare global {
  interface Window {
    max?: MaxJWeb
  }
}

export function isMax(): boolean {
  return typeof window !== 'undefined' && !!window.max
}

/** Send a note event to Max: note <pen> <midi> <velocity 0-127> <duration ms> */
export function outletNote(
  pen: string,
  midi: number,
  velocity: number,
  durationMs: number,
) {
  window.max?.outlet('note', pen, midi, velocity, durationMs)
}

/** Send transport / state messages to Max */
export function outletMessage(...args: (string | number)[]) {
  window.max?.outlet(...args)
}

/** Bind a handler for a message sent into jweb (e.g. "play", "stop", "clear", "tempo 140") */
export function bindInlet(
  name: string,
  fn: (...args: (string | number)[]) => void,
) {
  window.max?.bindInlet(name, fn)
}
