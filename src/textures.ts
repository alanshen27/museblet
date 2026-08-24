// fal.ai-generated abstract textures that live inside strokes.
//
// One texture is generated per colour family (night sky, embers, garden,
// petals) and cached for the whole session — four generations total.
// Without a key (or while generating / offline) the surface falls back
// to the procedural scene motifs.
//
// The key is never committed: it is read from a `?falKey=...` URL param
// (persisted to localStorage) or a previously stored `falKey` entry.

const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell'

type Family = 'sky' | 'ember' | 'garden' | 'petal'

const PROMPTS: Record<Family, string> = {
  sky: 'abstract night sky texture, deep indigo nebula with scattered tiny white stars, dark painterly, seamless, no text',
  ember:
    'abstract glowing embers texture, warm amber sparks drifting over near-black, dark painterly, seamless, no text',
  garden:
    'abstract bioluminescent garden texture, soft green fireflies and leaf shadows over near-black, dark painterly, seamless, no text',
  petal:
    'abstract falling petals texture, soft pink and violet petals drifting over near-black, dark painterly, seamless, no text',
}

function falKey(): string | null {
  const param = new URLSearchParams(window.location.search).get('falKey')
  if (param) {
    try {
      window.localStorage.setItem('falKey', param)
    } catch {
      /* storage unavailable */
    }
    return param
  }
  try {
    return window.localStorage.getItem('falKey')
  } catch {
    return null
  }
}

function familyOf(hueDeg: number): Family {
  if (hueDeg >= 175 && hueDeg < 290) return 'sky'
  if (hueDeg < 65 || hueDeg >= 330) return 'ember'
  if (hueDeg < 175) return 'garden'
  return 'petal'
}

const cache = new Map<Family, HTMLImageElement>()
const started = new Set<Family>()

async function generateOne(family: Family, key: string) {
  try {
    const res = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: PROMPTS[family],
        image_size: { width: 512, height: 512 },
        num_images: 1,
      }),
    })
    if (!res.ok) throw new Error(`fal.ai ${res.status}`)
    const data = (await res.json()) as { images?: { url: string }[] }
    const url = data.images?.[0]?.url
    if (!url) throw new Error('fal.ai: no image in response')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => cache.set(family, img)
    img.src = url
  } catch (err) {
    console.warn('stroke texture generation failed:', err)
  }
}

/**
 * The texture for a stroke of the given hue, or null while unavailable
 * (no key, still generating, or generation failed).
 */
export function getStrokeTexture(hueDeg: number): HTMLImageElement | null {
  const family = familyOf(hueDeg)
  if (!started.has(family)) {
    started.add(family)
    const key = falKey()
    if (key) void generateOne(family, key)
  }
  return cache.get(family) ?? null
}
