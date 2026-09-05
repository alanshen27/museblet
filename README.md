# nocturne

拓 — *a rubbing of the body in ink.*

A full-body instrument. Stand in front of the camera: slow hands brush the
qin, a fast fist lands 八答仓, a kick tears a curtain of cinnabar through the
room. The visual language is the stone rubbing (拓片) — pale ink on a dark
ground, one red seal — and the musical language is Chinese: pentatonic
modes, guqin space and decay, pipa attack, dizi breath, luogu impact, and
留白, the silence that makes the strike land.

You appear as an energy silhouette — a premade humanoid rig driven by your
joints — inside a living 山水: mountains of ridged ink, mist that parts
around your body and swirls off a moving limb, water reflecting the peaks.
A session is a piece in four parts, 起承转合.

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

### Pose model

MediaPipe **Pose Landmarker, BlazePose GHUM "full"** (`?pose=lite|heavy`
to override). Why: 33 keypoints — face, shoulders, elbows, wrists, hand
tips, hips, knees, ankles, heels, foot tips — plus metric *world*
landmarks that give every joint a depth, one network, GPU delegate,
30 fps in a browser. The lite model loses fast limbs (exactly what a strike
is); heavy is ~3× slower for a small gain. `src/sanda.ts` normalises every
joint velocity by shoulder width (so distance from the camera does not
change force) and includes depth velocity, so a jab straight at the lens
still reads. A wrist past ~2.4 shoulder-widths/s travelling outward — or a
slightly slower one while the elbow snaps straight — is a **punch**; a
foot or ankle whipping, or a knee driving up past the hip line, is a
**kick**. Force comes from speed plus *drive* (torso turn, extension rate);
three punches inside 1.2 s is **rapid**. A teleport guard keeps tracking
snaps from reading as strikes.

### The piece: 起承转合

A session is a performance in the classical four-part form
(`src/performance.ts`), shown as a glyph row with a progress hairline at
the top and cued by a gong and a qin phrase at every turn:

| 起 qǐ opening | 承 chéng carrying | 转 zhuǎn turning | 合 hé closing |
| --- | --- | --- | --- |
| 留白: breath, the qin in harmonics (泛音), strikes held to a clapper and a small gong | brushwork develops; the full qin and pipa; small percussion | the climax: the full luogu, 轮指, 冲头, residue; the mist thins | the centre resolves; fists speak through the qin; long tails; breath returns |

Time carries the form (~2½ minutes), but the body bends it: early strikes
pull the turn closer, stillness in the close hastens the end. After 合 the
room rests; a strike or a long stillness opens a new piece. `?form=brisk`
runs a rehearsal at a third of the length. Max receives
`section <glyph> <index> <resting>`.

### The figure

The performer is a **shadow of a premade human**: Mixamo's Michelle from
the three.js examples (`public/models/performer_michelle.glb`; `?body=rpm`
for the examples' Ready Player Me avatar). `src/Character.ts` retargets
**rotations only** — each limb bone is aimed at the joint its child bone
sits on, the torso takes a full orientation from the hip and shoulder
lines, the head yaws and pitches with the nose, the fingers are curled
into fists; the hips take a damped position and the whole figure is fitted
with one slowly smoothed uniform scale. **No bone is ever scaled**: the
body's proportions are the asset's bind pose. The mesh is drawn flat black
as a coverage mask with a soft edge (a ½ % close heals seams between the
asset's separate meshes; nothing reshapes the body); the edge carries a
whisper of light at rest and flares cinnabar for the beat of a strike. A
separate low-resolution joint field, never drawn, is what the mist parts
around.

### The room

`src/Scene.ts` is one WebGL2 renderer: a stable-fluids ink/mist solver
with the body as an **obstacle** (mist cannot occupy the figure, so clouds
part around the torso and swirl off a moving limb; a 2D distance field of
the body also bends the procedural fog lookup around it), and a procedural
**shanshui** — five layers of ridged-noise mountains, far peaks high and
pale dissolving into mist, near banks low and dark, parallax with the
lean, a water plane reflecting the ridges — breathing with the piece.

### Without a camera

A **ghost performer** (`src/demoPose.ts`) plays the piece: it stands and
breathes to open the gate, brushes in 承, throws crosses and a kick in 转,
settles in 合. `?demo` forces it; it also takes over when the camera is
unavailable. Pointer strikes still work on top of it.

**Performance grammar.** The body is read as martial dance: 蓄 → 发 → 收.
A hand drawn back is the wind-up — a breath drawn in (蓄). A strike is one
peak and its release (发): one heavy Foley blow, never a cloud of notes.
For 700 ms after a blow nothing else may sound (收). Brush onsets fall only
on the eighths of a slow phrase pulse (2.4 s / 8 = 300 ms), and only one
per gesture: the pluck comes when the gesture commits, the string then
slides; a sharp reversal is a new stroke. Continuous layers (bow, breath,
roll) exist only while their motion is clearly held.

| gesture | sound | image |
| --- | --- | --- |
| **punch** — fast fist out of rest, then stopped | one blow on the saturated impact bus: crack transient, flesh thud (闷响) with a pitched drop, sub weight, dark room tail; a 板 on top; a heavy blow rings the small gong. **Force is weight** — lower thud, more sub, more drive, longer decay | ink burst along the fist, hairline cracks, ring pulse, seal 打 / 发 |
| **three fast fists** at the climax | the pipa wheel (轮指): the only pipa in the piece | stacked afterimages, seal 连击 |
| **kick** | the heavy blow, the 大鼓, and the 大锣 for a real one; 冲头 only at the climax | a vertical cinnabar curtain torn through the mist, tall seal 起势 |
| **hand drawn back** | 蓄: a low breath before the blow | — |
| **停 — stopped dead after fast motion** | 撕边一锣 | one clean ring, seal 亮相 |
| **left hand, raised, moving** | the qin: one pluck per gesture on the pulse, sliding between (走手音, friction on the glide) | a wet brush mark that dries |
| **right hand, raised, moving** | the erhu: a bow — height is pitch, speed is pressure; sound only while it moves | the same, drier |
| **turning torso** | the drum rolls, denser with the turn | — |
| **hands together at the torso** | strings damped at the node, pitch held | — |
| **breath** (shoulders) | 气口: the dizi opens on the out-breath | — |
| **stillness** | dizi breath at the tonal centre | marks fade to 留白 |

**Occlusion.** MediaPipe invents a hanging arm for a limb it cannot see
(the guard hand behind a side-on cross). The tracker never follows a
low-confidence joint: below visibility 0.25 (0.5 for the far wrist when
the body stands in profile) a joint **holds its last good position** and
its velocity dies; a large jump is followed only when the limb is clearly
seen again. A wrist that reads far below the hips, or farther from its
shoulder than an arm can reach, while the body is busy, is restored and
held. Held joints never brush or strike, and the silhouette inherits the
held pose. The body scale falls back on torso height so a turned body does
not inflate speeds; side-on, a quiet tip asks for a little more face.

**Gating.** Small movements do nothing. A strike is a **peak and a
release**: out of rest (slower than 0.9 shoulder-widths/s since its last
strike) the limb must exceed **3.8 sw/s** for a fist (3.0 with the elbow
snapping straight) or **3.4 sw/s** for a foot/knee, then fall back below
55 % of its peak within 600 ms, having travelled ≥ **0.55 / 0.5 sw** from
where it rested (depth included); refractories **450 / 800 ms**. A punch
must also travel **along the arm**: the speed-weighted cosine between the
hand's velocity and the forearm axis (elbow → wrist, taken as the midpoint
of the previous and current frame so a swing reads as perpendicular) must
exceed **0.6** over the rise, and 0.45 at its start — a sideways flap or a
chop across the arm is not a punch, however fast. The whole
body must be above the expression floor (**0.2**; strikes need half of
that, their limb being the evidence). Brushing needs a hand above the hips
moving at an easy pace — faster than **0.55 sw/s for 180 ms** and going
somewhere (≥ 0.1 sw) — so the qin and the erhu are reachable without a
fidget setting them off; the erhu bows only while the hand moves; the drum
rolls only for a **deliberate spin** (turn rate above 0.75, held half a
second, with the body clearly moving) — sway does nothing; the dizi opens only past 50 % stillness;
the pipa wheel needs three fast fists in 转. Small displacements are
smoothed hard so camera jitter never reads as speed. Tests: camera jitter,
jitter plus a hand wiggle, heavy jitter, and **ten seconds of idle sway
with swinging arms** all produce **0 strikes and stay gated**; one clear
punch is one blow, one clear kick is one blow. The footer shows
**silent / breath / open**; `D` shows it in the readout. Press **H** for
the legend.

### Pose model

MediaPipe **Pose Landmarker, BlazePose GHUM "full"** (`?pose=lite|heavy`
to override). Why: 33 keypoints — face, shoulders, elbows, wrists, hand
tips, hips, knees, ankles, heels, foot tips — plus metric *world*
landmarks that give every joint a depth, one network, GPU delegate,
30 fps in a browser. The lite model loses fast limbs (exactly what a strike
is); heavy is ~3× slower for a small gain. `src/sanda.ts` normalises every
joint velocity by shoulder width (so distance from the camera does not
change force) and includes depth velocity, so a jab straight at the lens
still reads. A wrist past ~2.4 shoulder-widths/s travelling outward — or a
slightly slower one while the elbow snaps straight — is a **punch**; a
foot or ankle whipping, or a knee driving up past the hip line, is a
**kick**. Force comes from speed plus *drive* (torso turn, extension rate);
three punches inside 1.2 s is **rapid**. A teleport guard keeps tracking
snaps from reading as strikes.

### The piece: 起承转合

A session is a performance in the classical four-part form
(`src/performance.ts`), shown as a glyph row with a progress hairline at
the top and cued by a gong and a qin phrase at every turn:

| 起 qǐ opening | 承 chéng carrying | 转 zhuǎn turning | 合 hé closing |
| --- | --- | --- | --- |
| 留白: breath, the qin in harmonics (泛音), strikes held to a clapper and a small gong | brushwork develops; the full qin and pipa; small percussion | the climax: the full luogu, 轮指, 冲头, residue; the mist thins | the centre resolves; fists speak through the qin; long tails; breath returns |

Time carries the form (~2½ minutes), but the body bends it: early strikes
pull the turn closer, stillness in the close hastens the end. After 合 the
room rests; a strike or a long stillness opens a new piece. `?form=brisk`
runs a rehearsal at a third of the length. Max receives
`section <glyph> <index> <resting>`.

### The figure

The performer is a **shadow of a premade human**: Mixamo's Michelle from
the three.js examples (`public/models/performer_michelle.glb`; `?body=rpm`
for the examples' Ready Player Me avatar). `src/Character.ts` retargets
**rotations only** — each limb bone is aimed at the joint its child bone
sits on, the torso takes a full orientation from the hip and shoulder
lines, the head yaws and pitches with the nose, the fingers are curled
into fists; the hips take a damped position and the whole figure is fitted
with one slowly smoothed uniform scale. **No bone is ever scaled**: the
body's proportions are the asset's bind pose. The mesh is drawn flat black
as a coverage mask with a soft edge (a ½ % close heals seams between the
asset's separate meshes; nothing reshapes the body); the edge carries a
whisper of light at rest and flares cinnabar for the beat of a strike. A
separate low-resolution joint field, never drawn, is what the mist parts
around.

### The room

`src/Scene.ts` is one WebGL2 renderer: a stable-fluids ink/mist solver
with the body as an **obstacle** (mist cannot occupy the figure, so clouds
part around the torso and swirl off a moving limb; a 2D distance field of
the body also bends the procedural fog lookup around it), and a procedural
**shanshui** — five layers of ridged-noise mountains, far peaks high and
pale dissolving into mist, near banks low and dark, parallax with the
lean, a water plane reflecting the ridges — breathing with the piece.

### Without a camera

A **ghost performer** (`src/demoPose.ts`) plays the piece: it stands and
breathes to open the gate, brushes in 承, throws crosses and a kick in 转,
settles in 合. `?demo` forces it; it also takes over when the camera is
unavailable. Pointer strikes still work on top of it.

| gesture | sound | image |
| --- | --- | --- |
| punch | 八答仓: 板 clapper → gu tap → small luo, then space; a pipa attack at the strike's height | ink burst along the fist, hairline cracks, ring pulse, seal 打 / 发, screen weight shifts |
| rapid punches | 轮指: a wheel of outward plucks whose density is a rate fed by the punching and winding down on its own — not a roll on a grid | stacked afterimages, seal 连 |
| kick | gu + 大锣 together, a 冲头 clapper roll accelerating into a second gong; the pipa jumps register | a vertical curtain torn through the ink, splatter, tall seal 起势 |
| slow, wet hand above the hips | qin: an onset each time the integral of speed crosses a threshold, slides between (走手音, friction on the glide); left hand low register, right hand high | a wet brush mark that dries |
| fast, dry hand | pipa attacks as it goes | 飞白 hairlines where the hand moved fast |
| hand too slow | silence — the string rings on | the mark stands |
| closed path | 泛音: the harmonics of the pitches it passed through | — |
| turning torso (throw, spin) | erhu: one continuous 滑音 around the centre, the bow's weight arriving over ~500 ms | — |
| 亮相 — fast motion that stops dead | 撕边一锣: a rim roll rushing into one gong, then nothing | one clean ring, seal 定 |
| seize — hands drawn together at the torso | strings muted at the node, pitch held | — |
| breath (shoulders) | 气口: the dizi phrase opens on the out-breath, closes on the in-breath; air pressure sets how much of the tone is noise | — |
| stillness | dizi breath at the tonal centre | the ghost stands alone; marks fade to 留白 |

**Pointer:** hold it for a moment to open the gate. Dragging slowly
brushes; a quick flick is a punch (vertical flick: kick). `Enter` also
opens the gate. `D` shows the tracking view, `T` turns the sheet over
(ink-stone ↔ xuan paper; `?theme=xuan`), `P` loops the marks on the
surface 散板 — unquantised, x = time, y = pitch, length = duration — `R`
clears. Sound starts on the first click or key (browser autoplay rules).

**Occlusion.** MediaPipe invents a hanging arm for a limb it cannot see
(the guard hand behind a side-on cross). The tracker never follows a
low-confidence joint: below visibility 0.25 (0.5 for the far wrist when
the body stands in profile) a joint **holds its last good position** and
its velocity dies; a large jump is followed only when the limb is clearly
seen again. A wrist that reads far below the hips, or farther from its
shoulder than an arm can reach, while the body is busy, is restored and
held. Held joints never brush or strike, and the silhouette inherits the
held pose. The body scale falls back on torso height so a turned body does
not inflate speeds; side-on, a quiet tip asks for a little more face.

**Gating.** Small movements do nothing. A strike is a **peak and a
release**: out of rest (slower than 1.1 shoulder-widths/s since the last
strike) the limb must exceed 3.2 sw/s for a fist (2.6 with the elbow
snapping straight) or 2.8 sw/s for a foot/knee, then fall back below 55 %
of its peak within 600 ms, having travelled at least 0.45 / 0.4 sw from
where it rested (depth included), with the whole body above the
**expression floor** (energy 0.12); refractories 320 / 600 ms. Brushing
needs a hand above the hips faster than 0.7 sw/s for 220 ms *and* going
somewhere (≥ 0.12 sw), and plucks only every 0.34 (qin) / 0.11 (pipa) of
the screen travelled; the dizi opens only past 50 % stillness; the erhu
wants a turn above 0.6 sustained 400 ms with the body over the floor; the
pipa wheel needs three fast fists; 亮相 needs a real peak. Small
displacements are smoothed hard so camera jitter never reads as speed. The
footer shows **silent / open** for the expression gate; `D` shows it in the
readout. Continuous `ctl` streams stay subtle. Press **H** for the legend.

**Anti-defaults, by design:** no drop, no sidechain, no kick/snare groove,
no pentatonic arpeggiator; the luogu punctuates action (冲头 / 撕边一锣 /
八答仓) and the loop is free meter.

## Sound

### Browser (`src/audio.ts` + `public/worklets/`)

The Web Audio engine mirrors professional Max practice:

- **Plucked strings** — a Karplus-Strong / waveguide string in an
  AudioWorklet (`worklets/string.js`; native `DelayNode` feedback is
  128-sample coarse): shaped noise excitation with a pluck-position comb,
  fractional delay, one-pole loop loss, per-period gain set from a target
  T60. `freq` is an AudioParam, so slides retune the ringing string; a
  slide also rubs the finger along the string — **friction** noise
  proportional to glide speed enters the loop and costs energy, so a glide
  decays into friction and then silence (吟猱). **泛音** plucks comb the
  excitation at the touched node (x[n] + x[n − P/node]). Qin (散音/按音/泛音;
  silk, long, dark) and pipa (bright, short) are the same model with
  different parameters; a body resonance pair sits after each string.
- **Pipa 轮指** — a wheel (`feedWheel`): a scheduler plucks at a rate fed
  by punch rapidity or brush speed, each finger a little different, and
  winds down by itself when the feeding stops.
- **Dizi** — the breath *is* the tone: air through a narrow resonator at
  the pitch, a sine core only as a fundamental, a 笛膜 membrane buzz a hair
  off the octave. Air pressure sets the noise/core mix and the resonator's
  Q; the phrase is gated by the body's own breath (气口).
- **Erhu** — a bowed string (sawtooth → bow lowpass → two body formants),
  one continuous portamento, gain and brightness arriving over ~500 ms.
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
- `nocturne.erhu` — `saw~` → `onepole~` bow → two `reson~` body formants,
  `line~` 250 ms glide on the pitch, bow weight over 500 ms.
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

- `note <instr> <midi> <velocity> <durationMs>` — instr ∈ `qin pipa dizi erhu luo gu`
  (gu at midi ≥ 84 is the 板 clapper)
- `strike <punch|kick|snap> <midi> <velocity> <x> <y> <rapid>` — a landed
  strike or a 亮相 (the luogu cell is also spelled out as `note` events)
- `section <起|承|转|合> <index> <resting>` — the form turns
- `ctl <width|root|guard|breath|energy|lean|breathSignal|seize> <value>` — the body stream, ~20 Hz
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

## Strike event surface (for test harnesses)

Every strike — live pose, ghost performer, pointer, or a harness feeding
fixture frames — goes through one bus, `src/strikes.ts`:

```ts
import { onStrike, emitStrike, strikeEvent } from './strikes'
onStrike((e) => { /* e.type punch|kick|snap, e.side, e.confidence, e.force, e.x, e.y, e.joints, e.rapid, e.source */ })
emitStrike(strikeEvent({ type: 'punch', side: 'L', confidence: 0.9, force: 0.7, source: 'harness' }))
```

The app subscribes once and does sound, ink and Max from there. In the
built page the same surface is on `window.nocturne`: `onStrike`,
`emitStrike`, `strikeEvent`, the temporal `SandaTracker` (feed it
MediaPipe landmark sequences: `tracker.update(landmarks, tMs, world)` →
`state.strikes[]` with `confidence`), and `classifyPose(landmarks)` — a
single-frame *pose-shape* classifier for still photos (`punch | kick |
guard | stance | none` with `side`, `confidence`, `joints`, elbow/knee
detail), since a still carries no velocity. Both return the same
vocabulary so one set of assertions covers fixtures and live runs.
`strike … <confidence>` is appended to the Max message as a trailing
argument.

## Two grounds

The ink-stone (default): pale marks on a near-black warm ground, a stone
rubbing. Xuan paper (`T`, `?theme=xuan`): near-black ink on warm off-white,
one muted vermillion 印. The same fluid carries ink *amount*; the stone
shows it as light, the paper as ink. Interface type is a crisp grotesque;
calligraphy and the serif appear only at brand moments — the mark, the
gate 立, the section turn. The landscape is nearly absent before the gate
and in 起 and arrives with the piece's density; the empty canvas is the
product.

## Image

- `src/Scene.ts` — the room (see above): fluid, body field, shanshui,
  ink-wash tone curve, paper grain, a spring-loaded screen displacement on
  strikes (weight, not shake).
- `src/InkSurface.tsx` — the 2D ink layer: brush marks as variable-width
  ribbons that bleed while wet and dry with 飞白 hairlines where the hand
  moved fast; limb-path ribbons (残影) on fast motion; cinnabar seals with
  hand-cut edges pressed on impact; hairline cracks, ring pulses, splatter.

Requires camera permission and network access (the pose model loads
from a CDN). Without WebGL2 float textures the room and the shadow are
skipped and the 2D ink still runs.

## Run

```sh
npm install
npm run dev
```
