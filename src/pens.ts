export type PenId = 'neon' | 'pulse' | 'velvet' | 'ember' | 'crystal'

export interface Pen {
  id: PenId
  name: string
  color: string
  glow: string
  /** oscillator recipe for the standalone Web Audio synth */
  wave: OscillatorType
  detune: number
  filterBase: number
  filterEnv: number
  attack: number
  release: number
  octaveShift: number
  lineWidth: number
  style: 'glow' | 'sparkle' | 'soft' | 'flicker' | 'crisp'
}

export const PENS: Pen[] = [
  {
    id: 'neon',
    name: 'Neon',
    color: '#4cc9f0',
    glow: 'rgba(76,201,240,0.85)',
    wave: 'sawtooth',
    detune: 8,
    filterBase: 600,
    filterEnv: 4500,
    attack: 0.008,
    release: 0.25,
    octaveShift: 0,
    lineWidth: 1,
    style: 'glow',
  },
  {
    id: 'pulse',
    name: 'Pulse',
    color: '#f72585',
    glow: 'rgba(247,37,133,0.85)',
    wave: 'square',
    detune: 0,
    filterBase: 900,
    filterEnv: 2500,
    attack: 0.003,
    release: 0.12,
    octaveShift: 0,
    lineWidth: 0.8,
    style: 'crisp',
  },
  {
    id: 'velvet',
    name: 'Velvet',
    color: '#c77dff',
    glow: 'rgba(199,125,255,0.7)',
    wave: 'sine',
    detune: 5,
    filterBase: 400,
    filterEnv: 1200,
    attack: 0.08,
    release: 0.9,
    octaveShift: -1,
    lineWidth: 1.6,
    style: 'soft',
  },
  {
    id: 'ember',
    name: 'Ember',
    color: '#ff7b00',
    glow: 'rgba(255,123,0,0.8)',
    wave: 'triangle',
    detune: 15,
    filterBase: 300,
    filterEnv: 3000,
    attack: 0.02,
    release: 0.4,
    octaveShift: -1,
    lineWidth: 1.2,
    style: 'flicker',
  },
  {
    id: 'crystal',
    name: 'Crystal',
    color: '#e0fbfc',
    glow: 'rgba(224,251,252,0.9)',
    wave: 'sine',
    detune: 2,
    filterBase: 2000,
    filterEnv: 6000,
    attack: 0.002,
    release: 0.6,
    octaveShift: 1,
    lineWidth: 0.7,
    style: 'sparkle',
  },
]

export function getPen(id: string): Pen {
  return PENS.find((p) => p.id === id) ?? PENS[0]
}
