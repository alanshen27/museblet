// The ensemble. Five voices, each a small physical or spectral model in
// the browser and a matching abstraction in the Max patch. Marks on the
// surface are stone-rubbing ink (拓片): pale on the dark ground, with a
// single cinnabar accent reserved for impact.

export type InstrumentId = 'qin' | 'pipa' | 'dizi' | 'luo' | 'gu'

export interface Instrument {
  id: InstrumentId
  /** 汉字 */
  glyph: string
  /** pinyin name */
  name: string
  /** what the voice is in the ensemble */
  role: string
  /** ink colour of its marks */
  ink: string
  /** how the mark is brushed */
  brush: 'wet' | 'dry' | 'mist' | 'seal' | 'ring'
  /** relative stroke width */
  width: number
}

export const INSTRUMENTS: Instrument[] = [
  {
    id: 'qin',
    glyph: '琴',
    name: 'qin',
    role: 'plucked silk string, long decay, sliding tones (走手音)',
    ink: '#e6dfd0',
    brush: 'wet',
    width: 1,
  },
  {
    id: 'pipa',
    glyph: '琵',
    name: 'pipa',
    role: 'bright pluck, fast decay, tremolo under speed (轮指)',
    ink: '#f4efe4',
    brush: 'dry',
    width: 0.7,
  },
  {
    id: 'dizi',
    glyph: '笛',
    name: 'dizi',
    role: 'breath tone with membrane buzz — the sound of stillness',
    ink: '#9fa39a',
    brush: 'mist',
    width: 1.4,
  },
  {
    id: 'luo',
    glyph: '锣',
    name: 'luo',
    role: 'gong resonator bank, pitch bends after the strike',
    ink: '#b5372a',
    brush: 'seal',
    width: 1,
  },
  {
    id: 'gu',
    glyph: '鼓',
    name: 'gu',
    role: 'drum: pitched skin sweep and body',
    ink: '#5a544c',
    brush: 'ring',
    width: 1,
  },
]

export function getInstrument(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]
}

/** ink palette shared across the interface */
export const INK = {
  ground: '#0e0d0c',
  paper: '#e6dfd0',
  ash: '#8a8378',
  mist: '#4a4642',
  cinnabar: '#b5372a',
  cinnabarDeep: '#7d2419',
}
