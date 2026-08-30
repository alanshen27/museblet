// FAL-generated magic artwork (flux/schnell), shipped as assets.
// Sigils and the hand guide are background-removed (transparent), so
// they never show a box; auroras stay on black and rely on additive
// ('lighter') compositing where the black vanishes.
import goldUrl from './assets/sigil_gold.webp'
import jadeUrl from './assets/sigil_jade.webp'
import paleUrl from './assets/sigil_pale.webp'
import glyphsUrl from './assets/sigil_glyphs.webp'
import handUrl from './assets/hand_guide.webp'
import auroraGoldUrl from './assets/aurora_gold.webp'
import auroraJadeUrl from './assets/aurora_jade.webp'

export const SIGIL_GOLD = 0
export const SIGIL_JADE = 1
export const SIGIL_PALE = 2
export const SIGIL_GLYPHS = 3
export const HAND_GUIDE = 4
export const AURORA_GOLD = 5
export const AURORA_JADE = 6

const images = [
  goldUrl,
  jadeUrl,
  paleUrl,
  glyphsUrl,
  handUrl,
  auroraGoldUrl,
  auroraJadeUrl,
].map((url) => {
  const img = new Image()
  img.src = url
  return img
})

/** the sigil image, or null until the asset has finished decoding */
export function sigilFor(index: number): HTMLImageElement | null {
  const img = images[index % images.length]
  return img.complete && img.naturalWidth > 0 ? img : null
}
