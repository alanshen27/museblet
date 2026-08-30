export type PenId = 'neon' | 'pulse' | 'velvet' | 'ember' | 'crystal'

/** what the pen physically does on the surface */
export type PenTool = 'ink' | 'firework' | 'chalk' | 'rain'

export interface Pen {
  id: PenId
  name: string
  color: string
  colorB: string
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
  tool: PenTool
}

export const PENS: Pen[] = [
  {
    id: 'neon',
    name: 'Eldritch Seal',
    color: '#e8c47a',
    colorB: '#9a6a2f',
    glow: 'rgba(232,196,122,0.5)',
    wave: 'sawtooth',
    detune: 4,
    filterBase: 500,
    filterEnv: 1800,
    attack: 0.02,
    release: 0.7,
    octaveShift: 0,
    lineWidth: 1,
    style: 'glow',
    tool: 'ink',
  },
  {
    id: 'pulse',
    name: 'Detonation Sigil',
    color: '#f0dfae',
    colorB: '#a8863e',
    glow: 'rgba(240,223,174,0.45)',
    wave: 'square',
    detune: 0,
    filterBase: 900,
    filterEnv: 2500,
    attack: 0.003,
    release: 0.12,
    octaveShift: 0,
    lineWidth: 0.8,
    style: 'crisp',
    tool: 'firework',
  },
  {
    id: 'velvet',
    name: 'Deep Mantra',
    color: '#b08d57',
    colorB: '#5c4426',
    glow: 'rgba(176,141,87,0.4)',
    wave: 'sine',
    detune: 5,
    filterBase: 400,
    filterEnv: 1200,
    attack: 0.08,
    release: 0.9,
    octaveShift: -1,
    lineWidth: 1.6,
    style: 'soft',
    tool: 'ink',
  },
  {
    id: 'ember',
    name: 'Spark Ward',
    color: '#c97b4a',
    colorB: '#5e3220',
    glow: 'rgba(201,123,74,0.45)',
    wave: 'triangle',
    detune: 4,
    filterBase: 1600,
    filterEnv: 3000,
    attack: 0.002,
    release: 1.2,
    octaveShift: 1,
    lineWidth: 1.2,
    style: 'flicker',
    tool: 'chalk',
  },
  {
    id: 'crystal',
    name: 'Chime Veil',
    color: '#a9dcc0',
    colorB: '#5f8f7a',
    glow: 'rgba(169,220,192,0.5)',
    wave: 'sine',
    detune: 2,
    filterBase: 2000,
    filterEnv: 6000,
    attack: 0.002,
    release: 0.6,
    octaveShift: 1,
    lineWidth: 0.7,
    style: 'sparkle',
    tool: 'rain',
  },
]

export function getPen(id: string): Pen {
  return PENS.find((p) => p.id === id) ?? PENS[0]
}
