// The room: one WebGL2 renderer.
//
//   fluid    a GPU stable-fluids solver whose dye is mist / ink. Slow hands
//            stir it, strikes shock it, and the body is an obstacle inside
//            it: mist cannot occupy the figure, so clouds part around the
//            torso and swirl off a moving limb.
//   body     an invisible 2D distance field of the figure (capsules over
//            the tracked joints) that the fluid and the procedural clouds
//            read. The visible character is a premade rig in Character.ts.
//   shanshui a living ink landscape: layered ridgelines of ridged noise,
//            mist bands, a water plane reflecting the mountains, all
//            drifting slowly and breathing with the piece.

import type { Joint } from './sanda'

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 fragColor;
`

// the figure's footprint in the mist: capsules between joints (a, b,
// radius a, radius b) in units of shoulder width. Indices 33/34/35 are the
// synthesised shoulder-mid, hip-mid and head centre.
const CAPSULES: [number, number, number, number][] = [
  [33, 34, 0.27, 0.19], // torso: broad chest to a narrow waist (tunic)
  [11, 12, 0.13, 0.13], // shoulders (tunic)
  [23, 24, 0.15, 0.15], // hips (sash)
  [33, 35, 0.08, 0.07], // neck (skin)
  [11, 13, 0.08, 0.062], // upper arms (tunic sleeves)
  [13, 15, 0.062, 0.052], // forearms (skin)
  [15, 19, 0.055, 0.04], // hands (skin)
  [12, 14, 0.08, 0.062],
  [14, 16, 0.062, 0.052],
  [16, 20, 0.055, 0.04],
  [23, 25, 0.115, 0.085], // thighs (trousers)
  [25, 27, 0.085, 0.062], // shins (trousers)
  [27, 31, 0.062, 0.05], // feet (boots)
  [24, 26, 0.115, 0.085],
  [26, 28, 0.085, 0.062],
  [28, 32, 0.062, 0.05],
]
const N_CAP = CAPSULES.length


// ---- the figure as a 2D signed distance field ---------------------------
// Built from the tracked joints alone: a rounded trunk spanning shoulders
// and hips, deltoids, a neck, an elliptical head, tapered limb capsules and
// closed fists — all joined by a smooth union so nothing reads as a ball
// joint, a pinched waist or a sausage. Positions in aspect-corrected uv
// (y up); radii in shoulder widths.
const FIGURE_GLSL = `
uniform vec2 uP[36];   // 33 joints + 33 shoulder-mid, 34 hip-mid, 35 head centre
uniform float uSw;     // shoulder width, uv units
uniform int uFigOn;
float fsmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float sdCap(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float sdEllipse(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  float k = length(q);
  return (k - 1.0) * min(r.x, r.y);
}
// convex quad a,b,c,d in order
float sdQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  vec2 v[4]; v[0] = a; v[1] = b; v[2] = c; v[3] = d;
  float dd = dot(p - v[0], p - v[0]);
  float sg = 1.0;
  for (int i = 0; i < 4; i++) {
    int j = (i + 3) % 4;
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 bb = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    dd = min(dd, dot(bb, bb));
    bvec3 cnd = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(cnd) || all(not(cnd))) sg *= -1.0;
  }
  return sg * sqrt(dd);
}
float sdFigure(vec2 p) {
  float s = uSw;
  float k = s * 0.045;
  vec2 LS = uP[11], RS = uP[12], LH = uP[23], RH = uP[24];
  vec2 hipMid = uP[34], shMid = uP[33];
  // an athletic trunk: full at the shoulders, drawn in at the waist. The
  // quad's lower corners sit inside the hip joints, so the torso narrows
  // toward the hips instead of barrelling
  vec2 LHw = hipMid + (LH - hipMid) * 0.62;
  vec2 RHw = hipMid + (RH - hipMid) * 0.62;
  vec2 LSw = shMid + (LS - shMid) * 0.92;
  vec2 RSw = shMid + (RS - shMid) * 0.92;
  float d = sdQuad(p, LSw, RSw, RHw, LHw) - s * 0.07;
  d = fsmin(d, length(p - LS) - s * 0.11, k);            // deltoids
  d = fsmin(d, length(p - RS) - s * 0.11, k);
  d = fsmin(d, length(p - LH) - s * 0.1, k);             // hips
  d = fsmin(d, length(p - RH) - s * 0.1, k);
  d = fsmin(d, sdCap(p, shMid, uP[35], s * 0.075, s * 0.07), k);  // neck
  d = fsmin(d, sdEllipse(p, uP[35], vec2(s * 0.22, s * 0.27)), k); // head
  // arms: upper, fore, fist — long and lean
  d = fsmin(d, sdCap(p, LS, uP[13], s * 0.085, s * 0.065), k);
  d = fsmin(d, sdCap(p, uP[13], uP[15], s * 0.065, s * 0.05), k);
  d = fsmin(d, sdCap(p, uP[15], uP[19], s * 0.06, s * 0.06), k);
  d = fsmin(d, sdCap(p, RS, uP[14], s * 0.085, s * 0.065), k);
  d = fsmin(d, sdCap(p, uP[14], uP[16], s * 0.065, s * 0.05), k);
  d = fsmin(d, sdCap(p, uP[16], uP[20], s * 0.06, s * 0.06), k);
  // legs: thigh, shin, foot
  d = fsmin(d, sdCap(p, LH, uP[25], s * 0.125, s * 0.085), k);
  d = fsmin(d, sdCap(p, uP[25], uP[27], s * 0.085, s * 0.06), k);
  d = fsmin(d, sdCap(p, uP[27], uP[31], s * 0.055, s * 0.05), k);
  d = fsmin(d, sdCap(p, RH, uP[26], s * 0.125, s * 0.085), k);
  d = fsmin(d, sdCap(p, uP[26], uP[28], s * 0.085, s * 0.06), k);
  d = fsmin(d, sdCap(p, uP[28], uP[32], s * 0.055, s * 0.05), k);
  return d;
}
`

const FRAG = {
  copy: `${HEAD}
uniform sampler2D uTexture;
void main() { fragColor = texture(uTexture, vUv); }`,

  clear: `${HEAD}
uniform sampler2D uTexture;
uniform float value;
void main() { fragColor = value * texture(uTexture, vUv); }`,

  splat: `${HEAD}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`,

  line: `${HEAD}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 a, b;
uniform float radius;
void main() {
  vec2 pa = vUv - a, ba = b - a;
  pa.x *= aspectRatio; ba.x *= aspectRatio;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  vec2 d = pa - ba * h;
  vec3 splat = exp(-dot(d, d) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`,

  // the body as a 2D field: R = signed distance (uv units, aspect-
  // corrected), GB = velocity of the nearest limb (uv/s)
  bodyField: `${HEAD}
uniform float aspectRatio;
uniform vec4 uSeg[${N_CAP}];   // ax ay bx by (uv, y up)
uniform vec4 uSegV[${N_CAP}];  // vax vay vbx vby
uniform vec2 uSegR[${N_CAP}];  // ra rb (uv units)
uniform vec3 uHead;            // x y r
uniform vec2 uHeadV;
uniform int uOn;
${FIGURE_GLSL}
void main() {
  if (uOn == 0) { fragColor = vec4(1.0, 0.0, 0.0, 0.0); return; }
  vec2 p = vUv; p.x *= aspectRatio;
  float best = 1e3; vec2 vel = vec2(0.0);
  for (int i = 0; i < ${N_CAP}; i++) {
    vec2 a = uSeg[i].xy, b = uSeg[i].zw; a.x *= aspectRatio; b.x *= aspectRatio;
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    float d = length(pa - ba * h) - mix(uSegR[i].x, uSegR[i].y, h);
    if (d < best) { best = d; vel = mix(uSegV[i].xy, uSegV[i].zw, h); }
  }
  vec2 hp = uHead.xy; hp.x *= aspectRatio;
  float dh = length(p - hp) - uHead.z;
  if (dh < best) { vel = uHeadV; }
  // the distance itself comes from the figure the viewer sees
  fragColor = vec4(sdFigure(p), vel, 1.0);
}`,

  advection: `${HEAD}
uniform sampler2D uVelocity, uSource, uBody;
uniform vec2 texelSize;
uniform float dt, dissipation, bodyDisplace;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  result /= decay;
  if (bodyDisplace > 0.0) {
    // mist cannot occupy the figure: it is thinned inside the body
    float d = texture(uBody, vUv).x;
    float inside = 1.0 - smoothstep(-0.01, 0.012, d);
    result *= 1.0 - inside * bodyDisplace;
  }
  fragColor = result;
}`,

  // the body as an obstacle: velocity inside the figure follows the limb
  // and pushes outward through its surface, so the mist parts and swirls
  obstacle: `${HEAD}
uniform sampler2D uVelocity, uBody;
uniform vec2 texelSize;
uniform float aspectRatio, dt;
void main() {
  vec4 b = texture(uBody, vUv);
  vec2 vel = texture(uVelocity, vUv).xy;
  float d = b.x;
  float inside = 1.0 - smoothstep(-0.005, 0.02, d);
  if (inside <= 0.0) { fragColor = vec4(vel, 0.0, 1.0); return; }
  // outward normal from the field gradient
  float dl = texture(uBody, vL).x, dr = texture(uBody, vR).x;
  float dtp = texture(uBody, vT).x, db = texture(uBody, vB).x;
  vec2 n = normalize(vec2(dr - dl, dtp - db) + 1e-5);
  // limb velocity (uv/s) into sim texels/s, plus a steady outward breath
  vec2 limb = b.yz / texelSize;
  float speed = length(b.yz);
  vec2 push = n * (0.03 + speed * 0.5) / texelSize.x;
  vec2 target = limb * 0.85 + push;
  fragColor = vec4(mix(vel, target, inside * 0.7), 0.0, 1.0);
}`,

  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

  curl: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,

  vorticity: `${HEAD}
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * dt;
  fragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`,

  pressure: `${HEAD}
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,

  gradient: `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(v, 0.0, 1.0);
}`,

  // ------------------------------------------------------------ display --
  display: `${HEAD}
uniform sampler2D uDye, uBody;
uniform vec3 ground;
uniform vec2 shake;
uniform float time, flash, aspect, density, breath, lean, gate, section, paper;
uniform float uEnergy, uStrikeGlow;
uniform vec3 uRimA, uRimB;
uniform int uBodyOn;
${FIGURE_GLSL}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
// a mountain ridge: ridged fbm, sharpened, so peaks are needles and
// slopes long — the vertical mountains of a Song landscape
float ridge(float x, float seed) {
  float v = 0.0, a = 0.55, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = noise(vec2(x * f + seed, seed * 3.1));
    v += a * (1.0 - abs(n * 2.0 - 1.0));
    f *= 2.1; a *= 0.48;
  }
  return pow(v, 1.7);
}

const float HOR = 0.19; // the waterline (y up) — the 2D layer's ground at 0.82 from the top

// the landscape, the mist and the ink cloud at a screen position
vec3 room(vec2 uv, vec2 fogUv, float near, float grain) {
  float t = time;
  // the ground: a warm dark stone, or xuan paper; a breath of sky above the peaks
  vec3 col = ground + grain * (1.0 - paper * 0.5);
  col += vec3(0.04, 0.037, 0.033) * exp(-abs(uv.y - 0.66) * 4.5) * (1.0 - paper * 1.6);
  // the landscape is not wallpaper: it is nearly absent before the gate
  // and in the opening, and arrives with the piece's density
  float reveal = gate * (0.22 + 0.78 * min(1.0, density * 1.7));
  float mistBand = 0.0;
  // five layers, far to near: far peaks stand high and pale, dissolving
  // at their feet; near banks sit low and dark. Parallax with the lean.
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float depth = 1.0 - fi / 5.0;             // 1 far … 0.2 near
    float par = lean * 0.04 * depth + t * 0.0022 * (0.3 + depth);
    float x = uv.x * aspect * (0.7 + fi * 0.3) + par + fi * 7.3;
    float h = ridge(x, 3.7 + fi * 1.9);
    float base = HOR + 0.06 + depth * 0.3 + breath * 0.008 * depth;
    float amp = 0.1 + depth * 0.26;
    float y = base + (h - 0.35) * amp;
    // ink wash: dark 皴 texture at the ridge, dissolving toward the foot
    float wash = fbm(vec2(x * 3.0, uv.y * 14.0 + fi * 3.0));
    float inside = smoothstep(y + 0.003, y - 0.003, uv.y);
    float foot = smoothstep(y - 0.22 - depth * 0.12, y - 0.015, uv.y);
    float ink = inside * (0.3 + 0.7 * foot) * (0.55 + 0.45 * wash);
    vec3 toneInk = mix(vec3(0.24, 0.235, 0.22), vec3(0.04, 0.038, 0.036), pow(1.0 - depth, 0.8));
    vec3 tonePaper = mix(vec3(0.62, 0.6, 0.56), vec3(0.16, 0.155, 0.15), pow(1.0 - depth, 0.8));
    vec3 tone = mix(toneInk, tonePaper, paper);
    float veil = mix(0.45, 1.0, 1.0 - depth) * reveal;
    col = mix(col, tone, clamp(ink * veil, 0.0, 1.0));
    // the ridge line itself, a darker stroke; a pale rim of air above it
    col = mix(col, tone * 0.7, smoothstep(0.02, 0.0, y - uv.y) * inside * 0.5 * reveal);
    col += vec3(0.035) * smoothstep(0.01, 0.0, abs(uv.y - y)) * depth * reveal * (1.0 - paper);
    // the negative space at the foot of each layer is mist
    mistBand += inside * (1.0 - foot) * (0.25 + depth * 0.45);
  }
  // water below the line: the mountains again, mirrored, troubled by wind
  if (uv.y < HOR) {
    float dw = HOR - uv.y;
    float ry = HOR + dw * 1.15;
    float wob = (fbm(vec2(uv.x * 9.0 + t * 0.15, uv.y * 40.0)) - 0.5) * 0.02 * min(1.0, dw * 12.0);
    float rx = uv.x + wob;
    vec3 ref = ground + vec3(0.025, 0.024, 0.022);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float depth = 1.0 - fi / 5.0;
      float par = lean * 0.04 * depth + t * 0.0022 * (0.3 + depth);
      float x = rx * aspect * (0.7 + fi * 0.3) + par + fi * 7.3;
      float h = ridge(x, 3.7 + fi * 1.9);
      float base = HOR + 0.06 + depth * 0.3;
      float y = base + (h - 0.35) * (0.1 + depth * 0.26);
      float inside = smoothstep(y + 0.008, y - 0.008, ry);
      float foot = smoothstep(y - 0.22 - depth * 0.12, y - 0.015, ry);
      vec3 tone = mix(mix(vec3(0.24, 0.235, 0.22), vec3(0.04, 0.038, 0.036), pow(1.0 - depth, 0.8)),
                      mix(vec3(0.62, 0.6, 0.56), vec3(0.16, 0.155, 0.15), pow(1.0 - depth, 0.8)), paper);
      ref = mix(ref, tone, inside * (0.3 + 0.7 * foot) * mix(0.45, 1.0, 1.0 - depth) * 0.6 * reveal);
    }
    float fade = smoothstep(0.0, 0.19, dw);
    col = mix(mix(ref * 0.8, ref, paper), mix(ground * 0.85, ground * 0.97, paper) + grain, fade * 0.8);
    // the surface catches the sky in long broken strokes
    col += vec3(0.03, 0.029, 0.026) * smoothstep(0.55, 1.0, noise(vec2(uv.x * 30.0 + t * 0.2, uv.y * 260.0))) * (1.0 - fade) * 0.8;
    mistBand *= 0.2;
  }
  // the waterline: a hairline of light, drawn in as the gate opens
  col += mix(vec3(0.07, 0.066, 0.06), vec3(-0.25), paper) * smoothstep(0.002, 0.0, abs(uv.y - HOR)) * gate;

  // mist: a slow procedural fog, thick at the mountains' feet and along
  // the water; the body parts it; the climax thins it
  float fog = fbm(fogUv * vec2(aspect, 1.0) * 1.6 + vec2(t * 0.012, -t * 0.004));
  fog = smoothstep(0.3, 0.8, fog);
  float band = exp(-abs(uv.y - HOR - 0.05) * 8.0) + 0.5 * exp(-abs(uv.y - HOR - 0.24) * 7.0);
  float fogAmt = (mistBand * 0.7 + fog * band * (0.8 + breath * 0.15)) * (0.95 - density * 0.4);
  fogAmt *= 1.0 - near * 0.85;
  fogAmt *= 0.5 + 0.5 * reveal;
  col = mix(col, mix(vec3(0.36, 0.35, 0.33), vec3(0.9, 0.88, 0.84), paper), clamp(fogAmt, 0.0, 1.0) * 0.34);

  // the ink cloud (fluid dye): light on the stone, ink on the paper
  vec3 d = texture(uDye, uv).rgb;
  vec3 dye = (1.0 - exp(-d * 1.35)) * 0.8;
  float dens = dot(d, vec3(0.333));
  float rim = smoothstep(0.02, 0.12, dens) * (1.0 - smoothstep(0.12, 0.5, dens));
  dye *= 1.0 + rim * 0.18;
  // on paper the same cloud is ink: its amount darkens the sheet toward
  // black, or toward vermillion where the dye was tinted cinnabar
  float amount = max(dye.r, max(dye.g, dye.b));
  vec3 tint = dye / max(amount, 1e-4);
  float redness = clamp((tint.r - tint.g) * 2.0, 0.0, 1.0);
  vec3 inkCol = mix(vec3(0.1, 0.1, 0.1), vec3(0.7, 0.23, 0.17), redness);
  vec3 onPaper = mix(col, inkCol, min(1.0, amount * 1.1));
  return mix(col + dye, onPaper, paper);
}

void main() {
  vec2 uv = vUv + shake;
  vec2 q = uv - 0.5;
  float grain = (hash(floor(uv * vec2(aspect, 1.0) * 900.0)) - 0.5) * 0.028;

  // body field (screen space): parts the clouds and gates the raymarch
  vec4 bf = texture(uBody, uv);
  float dBody = bf.x;
  vec2 grad = vec2(texture(uBody, uv + vec2(0.004 / aspect, 0.0)).x - texture(uBody, uv - vec2(0.004 / aspect, 0.0)).x,
                   texture(uBody, uv + vec2(0.0, 0.004)).x - texture(uBody, uv - vec2(0.0, 0.004)).x);
  vec2 away = normalize(grad + 1e-5);
  // clouds bend around the figure: the fog lookup is pushed outward
  float near = exp(-max(dBody, 0.0) * 14.0) * float(uBodyOn);
  vec2 fogUv = uv + away * near * 0.05;

  vec3 col = room(uv, fogUv, near, grain);

  float vig = 1.0 - smoothstep(0.3, 0.95, length(q * vec2(1.0, 1.25))) * mix(0.6, 0.12, paper);
  col *= vig;
  col += flash * mix(vec3(0.92, 0.88, 0.8), vec3(-0.5, -0.5, -0.5), paper);
  fragColor = vec4(col, 1.0);
}`,
}

interface FBO {
  fb: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
  texel: [number, number]
}
interface DoubleFBO {
  read: FBO
  write: FBO
  w: number
  h: number
  texel: [number, number]
  swap: () => void
}

class Program {
  prog: WebGLProgram
  uniforms = new Map<string, WebGLUniformLocation>()
  private gl: WebGL2RenderingContext
  constructor(gl: WebGL2RenderingContext, vs: WebGLShader, fsSrc: string, name: string) {
    this.gl = gl
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, name)
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`${name}: ${gl.getProgramInfoLog(p) ?? 'link failed'}`)
    }
    this.prog = p
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)
      if (!info) continue
      // array uniforms are reported as name[0]
      const base = info.name.replace(/\[0\]$/, '')
      this.uniforms.set(base, gl.getUniformLocation(p, info.name)!)
    }
  }
  use() {
    this.gl.useProgram(this.prog)
  }
  u(name: string) {
    return this.uniforms.get(name) ?? null
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, name: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`${name}: ${gl.getShaderInfoLog(s) ?? 'compile failed'}`)
  }
  return s
}

export interface Shock {
  x: number
  y: number
  dx: number
  dy: number
  force: number
  kind: 'punch' | 'kick'
  color: [number, number, number]
}

export interface Mood {
  /** musical density of the current section, 0..1 */
  density: number
  /** breath signal -1..1 */
  breath: number
  /** weight shift -1..1 */
  lean: number
  /** 0 before the gate opens, 1 after */
  gate: number
  /** section index 0..3 */
  section: number
}

export class Scene {
  readonly ok: boolean
  private gl!: WebGL2RenderingContext
  private programs!: Record<keyof typeof FRAG, Program>
  private dye!: DoubleFBO
  private vel!: DoubleFBO
  private div!: FBO
  private curl!: FBO
  private pressure!: DoubleFBO
  private body!: FBO
  private quad!: WebGLVertexArrayObject
  private ground: [number, number, number] = [0.055, 0.051, 0.047]
  private flash = 0
  private shakeX = 0
  private shakeY = 0
  private shakeVX = 0
  private shakeVY = 0
  private time = 0
  private simRes = 144
  private dyeRes = 640
  private canvas: HTMLCanvasElement
  private bodyOn = false
  private segs = new Float32Array(N_CAP * 4)
  private segV = new Float32Array(N_CAP * 4)
  private segR = new Float32Array(N_CAP * 2)
  private head = [0.5, 0.5, 0.05]
  private headV = [0, 0]
  private pts = new Float32Array(36 * 2)
  private swUv = 0.2
  private energyS = 0
  private strikeGlow = 0
  private lastStrikeAt = -Infinity
  private mood: Mood = { density: 0.15, breath: 0, lean: 0, gate: 0, section: 0 }
  private paper = 0
  private moodS = { density: 0.15, breath: 0, lean: 0, gate: 0 }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
      this.ok = false
      return
    }
    this.gl = gl
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT, 'vert')
      const programs = {} as Record<keyof typeof FRAG, Program>
      for (const k of Object.keys(FRAG) as (keyof typeof FRAG)[]) {
        programs[k] = new Program(gl, vs, FRAG[k], k)
      }
      this.programs = programs
      const vao = gl.createVertexArray()!
      gl.bindVertexArray(vao)
      const vb = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vb)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      this.quad = vao
      this.resize()
      this.ok = true
    } catch (err) {
      console.warn('scene unavailable:', err)
      this.ok = false
    }
  }

  private fbo(w: number, h: number, internal: number, format: number): FBO {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null)
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { fb, tex, w, h, texel: [1 / w, 1 / h] }
  }

  private double(w: number, h: number, internal: number, format: number): DoubleFBO {
    const a = this.fbo(w, h, internal, format)
    const b = this.fbo(w, h, internal, format)
    const d: DoubleFBO = {
      read: a,
      write: b,
      w,
      h,
      texel: [1 / w, 1 / h],
      swap() {
        const t = d.read
        d.read = d.write
        d.write = t
      },
    }
    return d
  }

  private resolution(base: number): [number, number] {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height)
    return aspect > 1 ? [Math.round(base * aspect), base] : [base, Math.round(base / aspect)]
  }

  resize() {
    if (!this.gl) return
    const gl = this.gl
    const [sw, sh] = this.resolution(this.simRes)
    const [dw, dh] = this.resolution(this.dyeRes)
    if (this.dye && this.dye.w === dw && this.dye.h === dh) return
    this.dye = this.double(dw, dh, gl.RGBA16F, gl.RGBA)
    this.vel = this.double(sw, sh, gl.RG16F, gl.RG)
    this.div = this.fbo(sw, sh, gl.R16F, gl.RED)
    this.curl = this.fbo(sw, sh, gl.R16F, gl.RED)
    this.pressure = this.double(sw, sh, gl.R16F, gl.RED)
    const [bw, bh] = this.resolution(256)
    this.body = this.fbo(bw, bh, gl.RGBA16F, gl.RGBA)
  }

  private blit(target: FBO | null) {
    const gl = this.gl
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb)
      gl.viewport(0, 0, target.w, target.h)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private bindTex(tex: WebGLTexture, unit: number) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    return unit
  }

  // ------------------------------------------------------------- body --
  /**
   * The tracked figure: 33 joints in screen fractions (y down) with depth
   * in shoulder widths, and the shoulder width itself.
   */
  setBody(all: Joint[] | null, sw: number) {
    if (!all || all.length < 33) {
      this.bodyOn = false
      return
    }
    this.bodyOn = true
    const ls = all[11]
    const rs = all[12]
    const lh = all[23]
    const rh = all[24]
    const nose = all[0]
    const hx = nose.x
    const hy = nose.y - sw * 0.1
    // joint positions for the figure field (aspect-corrected, y up)
    const aspect = this.canvas.width / this.canvas.height
    const P = this.pts
    for (let i = 0; i < 33; i++) {
      P[i * 2] = all[i].x * aspect
      P[i * 2 + 1] = 1 - all[i].y
    }
    P[66] = ((ls.x + rs.x) / 2) * aspect
    P[67] = 1 - (ls.y + rs.y) / 2
    P[68] = ((lh.x + rh.x) / 2) * aspect
    P[69] = 1 - (lh.y + rh.y) / 2
    P[70] = hx * aspect
    P[71] = 1 - hy
    this.swUv = Math.max(0.02, Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y))
    this.head = [hx, 1 - hy, sw * 0.34]
    this.headV = [nose.vx * sw, -nose.vy * sw]
    // the 2D field segments (uv, y up) with velocities in uv/s
    const S = this.segs
    const V = this.segV
    const R = this.segR
    const at = (idx: number): [number, number, number, number] => {
      if (idx === 33) return [(ls.x + rs.x) / 2, (ls.y + rs.y) / 2, (ls.vx + rs.vx) / 2, (ls.vy + rs.vy) / 2]
      if (idx === 34) return [(lh.x + rh.x) / 2, (lh.y + rh.y) / 2, (lh.vx + rh.vx) / 2, (lh.vy + rh.vy) / 2]
      if (idx === 35) return [hx, hy, nose.vx, nose.vy]
      const j = all[idx]
      return [j.x, j.y, j.vx, j.vy]
    }
    CAPSULES.forEach((c, i) => {
      const a = at(c[0])
      const b = at(c[1])
      S[i * 4] = a[0]
      S[i * 4 + 1] = 1 - a[1]
      S[i * 4 + 2] = b[0]
      S[i * 4 + 3] = 1 - b[1]
      V[i * 4] = a[2] * sw
      V[i * 4 + 1] = -a[3] * sw
      V[i * 4 + 2] = b[2] * sw
      V[i * 4 + 3] = -b[3] * sw
      R[i * 2] = c[2] * sw
      R[i * 2 + 1] = c[3] * sw
    })
  }

  setMood(m: Partial<Mood>) {
    Object.assign(this.mood, m)
  }

  /** the figure's energy (0..1) and the moment of a strike, for its edge */
  setFigure(energy: number, sinceStrikeMs: number) {
    this.energyS += (energy - this.energyS) * 0.15
    this.lastStrikeAt = sinceStrikeMs
  }

  /** the ink-stone (dark) or xuan paper (light) */
  setTheme(paper: boolean) {
    this.paper = paper ? 1 : 0
    this.ground = paper ? [0.92, 0.9, 0.85] : [0.055, 0.051, 0.047]
  }

  private renderBodyField() {
    const gl = this.gl
    const p = this.programs.bodyField
    p.use()
    gl.uniform1f(p.u('aspectRatio'), this.canvas.width / this.canvas.height)
    gl.uniform1i(p.u('uOn'), this.bodyOn ? 1 : 0)
    gl.uniform1i(p.u('uFigOn'), this.bodyOn ? 1 : 0)
    if (this.bodyOn) {
      gl.uniform2fv(p.u('uP'), this.pts)
      gl.uniform1f(p.u('uSw'), this.swUv)
      gl.uniform4fv(p.u('uSeg'), this.segs)
      gl.uniform4fv(p.u('uSegV'), this.segV)
      gl.uniform2fv(p.u('uSegR'), this.segR)
      gl.uniform3f(p.u('uHead'), this.head[0], this.head[1], this.head[2])
      gl.uniform2f(p.u('uHeadV'), this.headV[0], this.headV[1])
    }
    this.blit(this.body)
  }

  // ------------------------------------------------------------ fluid --
  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number], radius: number, velScale = 1) {
    if (!this.ok) return
    const gl = this.gl
    const p = this.programs.splat
    p.use()
    gl.uniform1f(p.u('aspectRatio'), this.canvas.width / this.canvas.height)
    gl.uniform2f(p.u('point'), x, 1 - y)
    gl.uniform1f(p.u('radius'), radius * radius)
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform3f(p.u('color'), dx * this.vel.w * velScale, -dy * this.vel.h * velScale, 0)
    this.blit(this.vel.write)
    this.vel.swap()
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.dye.read.tex, 0))
    gl.uniform3f(p.u('color'), color[0], color[1], color[2])
    this.blit(this.dye.write)
    this.dye.swap()
  }

  slash(ax: number, ay: number, bx: number, by: number, dx: number, dy: number, color: [number, number, number], radius: number, velScale = 1) {
    if (!this.ok) return
    const gl = this.gl
    const p = this.programs.line
    p.use()
    gl.uniform1f(p.u('aspectRatio'), this.canvas.width / this.canvas.height)
    gl.uniform2f(p.u('a'), ax, 1 - ay)
    gl.uniform2f(p.u('b'), bx, 1 - by)
    gl.uniform1f(p.u('radius'), radius * radius)
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform3f(p.u('color'), dx * this.vel.w * velScale, -dy * this.vel.h * velScale, 0)
    this.blit(this.vel.write)
    this.vel.swap()
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.dye.read.tex, 0))
    gl.uniform3f(p.u('color'), color[0], color[1], color[2])
    this.blit(this.dye.write)
    this.dye.swap()
  }

  shock(s: Shock) {
    if (!this.ok) return
    const f = s.force
    if (s.kind === 'punch') {
      this.splat(s.x, s.y, s.dx * 3 * f, s.dy * 3 * f, s.color.map((c) => c * (0.45 + f * 0.75)) as [number, number, number], 0.028 + f * 0.05, 1)
      const n = 10
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
        const r = 0.02 + f * 0.05
        this.splat(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, Math.cos(a) * (0.8 + f * 2.4), Math.sin(a) * (0.8 + f * 2.4), [0, 0, 0], 0.012, 1)
      }
      this.flash = Math.min(0.6, this.flash + 0.06 + f * 0.11)
      this.shakeVX += s.dx * (0.004 + f * 0.012)
      this.shakeVY += -s.dy * (0.004 + f * 0.012)
    } else {
      const x = s.x
      const top = Math.max(0.02, s.y - 0.55 - f * 0.3)
      const bottom = Math.min(0.98, s.y + 0.25)
      this.slash(x, top, x, bottom, s.dx * 2.5 * f, -1.2 * f, s.color.map((c) => c * (0.5 + f * 0.9)) as [number, number, number], 0.014 + f * 0.012, 1)
      for (let i = 0; i < 12; i++) {
        const y = top + ((bottom - top) * i) / 11
        const side = i % 2 ? 1 : -1
        this.splat(x + side * 0.02, y, side * (2 + f * 3), 0, [0, 0, 0], 0.02, 1)
      }
      this.flash = Math.min(0.7, this.flash + 0.1 + f * 0.16)
      this.shakeVX += s.dx * (0.01 + f * 0.016)
      this.shakeVY += 0.006 + f * 0.012
    }
  }

  step(dt: number) {
    if (!this.ok) return
    const gl = this.gl
    dt = Math.min(dt, 1 / 30)
    this.time += dt
    gl.disable(gl.BLEND)
    gl.bindVertexArray(this.quad)
    const P = this.programs
    const simTexel = this.vel.texel

    this.renderBodyField()

    P.curl.use()
    gl.uniform2f(P.curl.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1i(P.curl.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    this.blit(this.curl)

    P.vorticity.use()
    gl.uniform2f(P.vorticity.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1i(P.vorticity.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform1i(P.vorticity.u('uCurl'), this.bindTex(this.curl.tex, 1))
    gl.uniform1f(P.vorticity.u('curl'), 22)
    gl.uniform1f(P.vorticity.u('dt'), dt)
    this.blit(this.vel.write)
    this.vel.swap()

    if (this.bodyOn) {
      P.obstacle.use()
      gl.uniform2f(P.obstacle.u('texelSize'), simTexel[0], simTexel[1])
      gl.uniform1f(P.obstacle.u('aspectRatio'), this.canvas.width / this.canvas.height)
      gl.uniform1f(P.obstacle.u('dt'), dt)
      gl.uniform1i(P.obstacle.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
      gl.uniform1i(P.obstacle.u('uBody'), this.bindTex(this.body.tex, 1))
      this.blit(this.vel.write)
      this.vel.swap()
    }

    P.divergence.use()
    gl.uniform2f(P.divergence.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1i(P.divergence.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    this.blit(this.div)

    P.clear.use()
    gl.uniform1i(P.clear.u('uTexture'), this.bindTex(this.pressure.read.tex, 0))
    gl.uniform1f(P.clear.u('value'), 0.8)
    this.blit(this.pressure.write)
    this.pressure.swap()

    P.pressure.use()
    gl.uniform2f(P.pressure.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1i(P.pressure.u('uDivergence'), this.bindTex(this.div.tex, 0))
    for (let i = 0; i < 20; i++) {
      gl.uniform1i(P.pressure.u('uPressure'), this.bindTex(this.pressure.read.tex, 1))
      this.blit(this.pressure.write)
      this.pressure.swap()
    }

    P.gradient.use()
    gl.uniform2f(P.gradient.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1i(P.gradient.u('uPressure'), this.bindTex(this.pressure.read.tex, 0))
    gl.uniform1i(P.gradient.u('uVelocity'), this.bindTex(this.vel.read.tex, 1))
    this.blit(this.vel.write)
    this.vel.swap()

    P.advection.use()
    gl.uniform2f(P.advection.u('texelSize'), simTexel[0], simTexel[1])
    gl.uniform1f(P.advection.u('dt'), dt)
    gl.uniform1i(P.advection.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform1i(P.advection.u('uSource'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform1i(P.advection.u('uBody'), this.bindTex(this.body.tex, 2))
    gl.uniform1f(P.advection.u('dissipation'), 0.35)
    gl.uniform1f(P.advection.u('bodyDisplace'), 0)
    this.blit(this.vel.write)
    this.vel.swap()

    gl.uniform1i(P.advection.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform1i(P.advection.u('uSource'), this.bindTex(this.dye.read.tex, 1))
    gl.uniform1f(P.advection.u('dissipation'), 0.55)
    gl.uniform1f(P.advection.u('bodyDisplace'), this.bodyOn ? 0.12 : 0)
    this.blit(this.dye.write)
    this.dye.swap()

    // screen weight: a spring the strike kicks, settling back to rest
    this.shakeVX += -this.shakeX * 90 * dt
    this.shakeVY += -this.shakeY * 90 * dt
    this.shakeVX *= Math.pow(0.02, dt)
    this.shakeVY *= Math.pow(0.02, dt)
    this.shakeX += this.shakeVX * dt * 10
    this.shakeY += this.shakeVY * dt * 10
    this.flash *= Math.pow(0.0005, dt)
    // the mood eases
    const k = Math.min(1, dt * 1.5)
    this.moodS.density += (this.mood.density - this.moodS.density) * k
    this.moodS.breath += (this.mood.breath - this.moodS.breath) * Math.min(1, dt * 3)
    this.moodS.lean += (this.mood.lean - this.moodS.lean) * Math.min(1, dt * 2)
    this.moodS.gate += (this.mood.gate - this.moodS.gate) * Math.min(1, dt * 0.8)
  }

  get shake(): [number, number] {
    return [this.shakeX, this.shakeY]
  }

  render() {
    if (!this.ok) return
    const gl = this.gl
    const p = this.programs.display
    p.use()
    gl.uniform1i(p.u('uDye'), this.bindTex(this.dye.read.tex, 0))
    gl.uniform1i(p.u('uBody'), this.bindTex(this.body.tex, 1))
    gl.uniform3f(p.u('ground'), this.ground[0], this.ground[1], this.ground[2])
    gl.uniform2f(p.u('shake'), this.shakeX, -this.shakeY)
    gl.uniform1f(p.u('time'), this.time)
    gl.uniform1f(p.u('flash'), this.flash)
    gl.uniform1f(p.u('aspect'), this.canvas.width / this.canvas.height)
    gl.uniform1f(p.u('density'), this.moodS.density)
    gl.uniform1f(p.u('breath'), this.moodS.breath)
    gl.uniform1f(p.u('lean'), this.moodS.lean)
    gl.uniform1f(p.u('gate'), this.moodS.gate)
    gl.uniform1f(p.u('section'), this.mood.section)
    gl.uniform1f(p.u('paper'), this.paper)
    gl.uniform1i(p.u('uBodyOn'), this.bodyOn ? 1 : 0)
    gl.uniform1i(p.u('uFigOn'), this.bodyOn ? 1 : 0)
    if (this.bodyOn) {
      gl.uniform2fv(p.u('uP'), this.pts)
      gl.uniform1f(p.u('uSw'), this.swUv)
    }
    // the strike flare decays over ~450 ms
    const since = this.lastStrikeAt
    this.strikeGlow = since < 450 ? 1 - since / 450 : 0
    gl.uniform1f(p.u('uEnergy'), this.energyS)
    gl.uniform1f(p.u('uStrikeGlow'), this.strikeGlow)
    gl.uniform3f(p.u('uRimA'), 0.36, 0.8, 0.86)
    gl.uniform3f(p.u('uRimB'), 0.95, 0.36, 0.24)
    this.blit(null)
  }
}
