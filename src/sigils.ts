// FAL-generated magic artwork (flux/schnell), shipped as assets.
// Painted on black so they can be composited additively ('lighter') —
// the black vanishes and only the glowing energy remains.
import goldUrl from './assets/sigil_gold.webp'
import jadeUrl from './assets/sigil_jade.webp'
import paleUrl from './assets/sigil_pale.webp'
import glyphsUrl from './assets/sigil_glyphs.webp'
import handUrl from './assets/hand_guide.webp'

export const SIGIL_GOLD = 0
export const SIGIL_JADE = 1
export const SIGIL_PALE = 2
export const SIGIL_GLYPHS = 3
export const HAND_GUIDE = 4

const images = [goldUrl, jadeUrl, paleUrl, glyphsUrl, handUrl].map((url) => {
  const img = new Image()
  img.src = url
  return img
})

/** the sigil image, or null until the asset has finished decoding */
export function sigilFor(index: number): HTMLImageElement | null {
  const img = images[index % images.length]
  return img.complete && img.naturalWidth > 0 ? img : null
}
