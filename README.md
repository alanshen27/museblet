# nocturne

Draw on a surface, hear it as music. A React app (built to static HTML) that runs standalone in the browser with Web Audio, or inside Max/MSP via `jweb` where the DSP is done by a `poly~` synth.

## How it works

- **x axis** = time across one 8-beat loop
- **y axis** = pitch, quantized to the selected scale
- **pressure** (pen/tablet) = velocity
- **Pens**: each pen has its own sound and visual style
  - **Neon** — detuned saw lead, cyan glow
  - **Pulse** — square pluck, crisp magenta
  - **Velvet** — sine pad an octave down, soft purple bloom
  - **Ember** — triangle bass, flickering orange
  - **Crystal** — bell-like sine an octave up, sparkling white

## Hand tracking

Press **Tab** to summon the control dock (hidden by default), then toggle the ✋ to conduct with your hands via the camera (MediaPipe, up to two hands). Your index fingertip projects a glowing cursor orb (the thumb shows as a small anchor — the activation point); pinch index to thumb to draw and play, with pinch tightness acting as pressure. Bunch a fist to summon a radial pen wheel around your hand: a small twist of the fist spins the highlight, open your hand to select that colour/sound. Each hand keeps its own pen. Fingertip positions are exponentially smoothed and glitch-guarded to cancel camera shake and tracking dropouts. Touch/mouse drawing still works as a fallback. Requires camera permission and network access (the model loads from a CDN).

## Run in the browser

```sh
npm install
npm run dev
```

Uses a built-in Web Audio synth (per-pen timbres + reverb).

## Run in Max/MSP

1. Build the web app to static HTML:
   ```sh
   npm run build
   ```
2. Open `max/nocturne.maxpat` in Max. The `jweb` object loads `dist/index.html`.
3. Turn on audio (`ezdac~`). Draw and press Play — the app detects it is inside Max and sends note events out of the jweb outlet instead of using Web Audio.

### Messages

Out of jweb (to Max):

- `note <pen> <midi> <velocity> <durationMs>` — routed per pen to a `poly~ nocturne.voice` synth (waveform / octave / release per pen)
- `transport play|stop`
- `ready` — sent when the page has loaded

Into jweb (from Max): `play`, `stop`, `clear`, `tempo <bpm>`, `scale <name>` (major, minor, pentatonic, blues, chromatic).
