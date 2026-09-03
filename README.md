# nocturne

拓 — *a rubbing of the body in ink.*

A full-body instrument. Stand in front of the camera: slow hands brush the
qin, a fast fist lands 八答仓, a kick tears a curtain of cinnabar through the
room. The visual language is the stone rubbing (拓片) — pale ink on a dark
ground, one red seal — and the musical language is Chinese: pentatonic
modes, guqin space and decay, pipa attack, dizi breath, luogu impact, and
留白, the silence that makes the strike land.

Runs standalone in the browser with a Web Audio engine, or inside Max/MSP
via `jweb`, where the DSP is done by the patches in `max/`.

## The interaction (散打 as conductor)

The body is read as a Sanda practitioner would read it — not as a fighting
game. Four phases, shown as one glyph at the right edge:

| phase | 汉字 | what the body does | what the room does |
| --- | --- | --- | --- |
| breath | 息 xī | holds still | dizi breath tone swells; echo tails lengthen; the canvas empties |
| stance | 势 shì | stands, shifts weight, moves slowly | slow hands brush ink and play the qin; stance width opens the stereo image; a deep stance deepens the hall; a raised guard closes the room down |
| release | 发 fā | a fist or knee explodes outward | the ink fluid takes the shock, a cinnabar seal is stamped, the limb leaves an afterimage; the luogu answers |
| recovery | 收 shōu | the limb returns | the residue of the strike hangs in the air; new strikes wait a beat |

Strikes are read from MediaPipe Pose (33 landmarks, one model, fast) by
`src/sanda.ts`: joint velocities are normalised by shoulder width, a wrist
past ~2.4 shoulder-widths/s travelling outward is a **punch**, a knee or
ankle whipping upward is a **kick**. Force comes from speed; three punches
inside 1.2 s is **rapid**.

| gesture | sound | image |
| --- | --- | --- |
| punch | 八答仓: 板 clapper → gu tap → small luo, then space; a pipa attack at the strike's height | ink burst along the fist, hairline cracks, ring pulse, seal 打 / 发, screen weight shifts |
| rapid punches | 轮指 tremolo on the pipa, denser with each hit | stacked afterimages, seal 连 |
| kick | gu + 大锣 together, a 冲头 clapper roll accelerating into a second gong; the pipa jumps register | a vertical curtain torn through the ink, splatter, tall seal 起势 |
| slow hand above the hips | qin string held and slid (走手音); left hand low, right hand high | a wet brush mark that dries, 飞白 where the hand moved faster |
| stillness | dizi breath at the tonal centre | the ghost stands alone; marks fade to 留白 |

**No camera?** Hold the pointer for a moment to open the gate. Dragging
slowly brushes; a quick flick is a punch (vertical flick: kick).
`Enter` also opens the gate. `D` shows the tracking view, `P` loops the
marks on the surface as a sequence (x = time, y = pitch), `R` clears.

## Sound

### Browser (`src/audio.ts` + `public/worklets/`)

The Web Audio engine mirrors professional Max practice:

- **Plucked strings** — a Karplus-Strong / waveguide string in an
  AudioWorklet (`worklets/string.js`): shaped noise excitation with a
  pluck-position comb, fractional delay, one-pole loop loss, per-period
  gain set from a target T60. `freq` is an AudioParam, so slides retune the
  ringing string instead of re-plucking. Qin (silk, long, dark) and pipa
  (bright, short) are the same model with different parameters; a body
  resonance pair sits after each string.
- **Dizi** — bandpassed noise + sine core + a 笛膜 membrane buzz a hair
  off the octave, vibrato depth from body energy. Swells with stillness.
- **Luogu** — the gong is a noise burst into a bank of high-Q resonators
  whose centre frequencies glide after the strike (大锣 sags, 小锣 rises),
  with a hiss riding the early decay. The drum is a skin sweep + body
  thump; the clapper a 10 ms click through a wooden resonance.
- **Delay-line family** — ping-pong echo (two unequal lines, cross-fed
  through damping; feedback rises with stillness and falls with energy);
  chorus width (two short delays modulated in opposite phase; depth from
  stance width).
- **Spectral** — a convolution hall whose impulse is built from the
  current mode's pitches ringing inside a decaying noise tail, so every
  sound is coloured by the scale: spectral cross-synthesis with the
  tuning. Retuned when the mode changes.
- **Granular residue** — `worklets/residue.js` records the mix into a ring
  buffer; a strike scatters windowed grains of the last moments, mostly
  pitched down, staggered and decaying — the debris after an impact.
- Guard → master lowpass and string damping; crouch (root) → hall depth
  and darker string body; lean → pan of the breath.

### Max/MSP (`max/`)

1. `npm run build`
2. Open `max/nocturne.maxpat`. `jweb` loads `dist/index.html`. Turn on audio.

The main patch routes `note` messages per instrument to five `poly~`
abstractions and runs an FX rack fed from the bus:

- `nocturne.voice` — Karplus-Strong string with `tapin~/tapout~`,
  `onepole~` loop loss, `line~`-driven delay time for slides, per-period
  gain computed from a T60 argument. Args: `T60 loopLowpassHz transpose`
  (qin `5.5 2200 0`, pipa `1.1 5200 0`).
- `nocturne.dizi` — `noise~ → reson~` at the pitch, `cycle~` core with
  vibrato, `tri~` membrane buzz at 2.003f, swell/hold/release envelope.
- `nocturne.luo` — four `reson~` partials at gong ratios, each gliding
  +4.5% → −3.5% over 1.3 s via `line~`; `svf~` hiss.
- `nocturne.gu` — drum below midi 84 (skin sweep `cycle~` + body), 板
  clapper at 84+ (`reson~` click).
- FX: `tapin~ 2000 / tapout~ 410. 630.` ping-pong echo with `onepole~`
  damping; Schroeder hall (`comb~` ×4 → `allpass~` ×2 → `onepole~`);
  `pfft~ nocturne.smear` spectral smear (`vectral~` slide on bin
  magnitudes, phases passed through); chorus width (`tapin~ 50 / tapout~
  11. 14.` with opposite-phase `cycle~` modulation); `onepole~` guard
  lowpass; `limi~`.

Body controls arrive as `ctl` messages and are smoothed with `line`, then
distributed with `s noct_*` / `r noct_*`: width → chorus depth, root →
hall wet, guard → master lowpass cutoff, breath/energy → echo feedback.
Strikes kick the spectral smear's release time.

### Messages

Out of jweb (to Max):

- `note <instr> <midi> <velocity> <durationMs>` — instr ∈ `qin pipa dizi luo gu`
  (gu at midi ≥ 84 is the 板 clapper)
- `strike <punch|kick> <midi> <velocity> <x> <y> <rapid>` — a landed strike
  (the luogu cell is also spelled out as `note` events)
- `ctl <width|root|guard|breath|energy|lean> <0..1>` — the body stream, ~20 Hz
- `centre <midi>` — the tonal centre drifting (宫 → 羽 → 商 → 徵)
- `gate open` — the stance gate opened
- `transport play|stop`, `ready`

Into jweb (from Max): `play`, `stop`, `clear`, `open`, `tempo <bpm>`,
`scale <name>` where name ∈ `gong shang jue zhi yu qingyue yayue yanyue`
(the legacy `major minor pentatonic blues chromatic` still work).

## Modes

五声 — the five pentatonic modes are rotations of one collection:
宫 gong `0 2 4 7 9`, 商 shang, 角 jue, 徵 zhi, 羽 yu (default; the guqin's
shadowed home). 七声 — 清乐 qingyue, 雅乐 yayue (变徵), 燕乐 yanyue (闰).
Harmony stacks 4ths and 5ths, no 3rds; the centre drifts slowly.

## Image

- `src/InkFluid.ts` — a WebGL2 stable-fluids solver (semi-Lagrangian
  advection, vorticity confinement, Jacobi pressure) whose dye is ink.
  Slow hands stir it, strikes shock it; rendered with an ink-wash tone
  curve, paper grain and a heavy vignette. A strike also kicks a
  spring-loaded screen displacement — weight, not shake.
- `src/InkSurface.tsx` — the 2D layer: brush marks as variable-width
  ribbons that bleed while wet and dry with 飞白 hairlines where the hand
  moved fast; the body as a few ash brush lines with speed-dependent
  afterimages (残影); limb-path ribbons on fast motion; cinnabar seals with
  hand-cut edges pressed on impact; hairline cracks, ring pulses,
  splatter.

Requires camera permission and network access (the pose model loads
from a CDN). Without WebGL2 float textures the fluid layer is skipped and
the 2D ink still runs.

## Run

```sh
npm install
npm run dev
```
