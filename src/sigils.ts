// FAL-generated magic circle artwork (flux/schnell), shipped as assets.
// Painted on black so they can be composited additively ('lighter') —
// the black vanishes and only the glowing linework remains.
import goldUrl from './assets/sigil_gold.webp'
import jadeUrl from './assets/sigil_jade.webp'
import moonUrl from './assets/sigil_moon.webp'

export const SIGIL_GOLD = 0
export const SIGIL_JADE = 1
export const SIGIL_MOON = 2

const images = [goldUrl, jadeUrl, moonUrl].map((url) => {
  const img = new Image()
  img.src = url
  return img
})

/** the sigil image, or null until the asset has finished decoding */
export function sigilFor(index: number): HTMLImageElement | null {
  const img = images[index % images.length]
  return img.complete && img.naturalWidth > 0 ? img : null
}
