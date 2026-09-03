import type { StrikeType } from '../../strikes/types'

export interface SandaFixture {
  id: string
  file: string
  label: StrikeType
  /** Human-readable pose description for the test report. */
  description: string
  license: string
  commonsUrl: string
  /** Illustrations may not yield a body pose — expect unknown. */
  expectPose?: boolean
}

/** Curated still-image fixtures (Wikimedia / public domain). Paths are under /test/sanda/. */
export const SANDA_FIXTURES: SandaFixture[] = [
  {
    id: 'sanda-kick',
    file: 'fixtures/sanshou--san-da----kick--practice-fight--katwijk--dec-4--2006-jp.jpg',
    label: 'kick',
    description: 'Sanshou (Sanda) practice kick',
    license: 'CC BY-SA 3.0 — Richardkw',
    commonsUrl:
      'https://commons.wikimedia.org/wiki/File:Sanshou_(San_da)_-_kick_(practice_fight)_Katwijk,_dec_4,_2006.JPG',
    expectPose: true,
  },
  {
    id: 'flying-kick',
    file: 'fixtures/flying-side-kick-jpg.jpg',
    label: 'kick',
    description: 'Flying side kick (two athletes)',
    license: 'CC0 — UWO Seikido',
    commonsUrl: 'https://commons.wikimedia.org/wiki/File:Flying_side_kick.JPG',
    expectPose: true,
  },
  {
    id: 'kick-light',
    file: 'fixtures/kick-light-kickboxing-jpg.jpg',
    label: 'kick',
    description: 'Kick-light kickboxing bout',
    license: 'CC BY-SA 4.0 — Bovvladua',
    commonsUrl: 'https://commons.wikimedia.org/wiki/File:Kick-Light_kickboxing.jpg',
    expectPose: true,
  },
  {
    id: 'army-jab',
    file: 'fixtures/flickr-the-u-s-army-all-army-boxing-jab-jpg.jpg',
    label: 'punch',
    description: 'Boxing jab training photo',
    license: 'Public domain — U.S. Army',
    commonsUrl:
      'https://commons.wikimedia.org/wiki/File:Flickr_-_The_U.S._Army_-_All-Army_Boxing_jab.jpg',
    expectPose: true,
  },
  {
    id: 'jab-illustration',
    file: 'fixtures/jab3-jpg.jpg',
    label: 'punch',
    description: 'Jab technique diagram (line art)',
    license: 'CC BY-SA 3.0 — Alain Delmas',
    commonsUrl: 'https://commons.wikimedia.org/wiki/File:Jab3.jpg',
    expectPose: false,
  },
  {
    id: 'jab-photo',
    file: 'fixtures/jab4-jpg.jpg',
    label: 'punch',
    description: 'Jab boxing technique photo',
    license: 'CC BY-SA 3.0 — Alain Delmas',
    commonsUrl: 'https://commons.wikimedia.org/wiki/File:Jab4.jpg',
    expectPose: true,
  },
  {
    id: 'straight-punch',
    file: 'fixtures/direct7-jpg.jpg',
    label: 'punch',
    description: 'Straight punch technique photo',
    license: 'CC BY-SA 3.0 — Alain Delmas',
    commonsUrl: 'https://commons.wikimedia.org/wiki/File:Direct7.jpg',
    expectPose: true,
  },
  {
    id: 'zhan-zhuang',
    file: 'fixtures/nitzan-oren-practicing-zhan-zhuang-jpg.jpg',
    label: 'guard',
    description: 'Zhan Zhuang standing meditation / guard-like posture',
    license: 'CC BY 3.0 — Jonathan.bluestein',
    commonsUrl:
      'https://commons.wikimedia.org/wiki/File:Nitzan_Oren_practicing_Zhan_Zhuang.jpg',
    expectPose: true,
  },
]

export const FIXTURE_BASE = `${import.meta.env.BASE_URL}test/sanda/`

export function fixtureUrl(fixture: SandaFixture): string {
  return `${FIXTURE_BASE}${fixture.file}`
}
