// The performer as a shadow: a premade athletic human mesh, posed by the
// tracked joints, drawn flat black. The body's proportions are the asset's
// bind pose; pose only moves bones — rotations only, no bone is scaled.
//
// Default asset: Mixamo's X Bot mannequin (`public/models/performer_xbot.glb`,
// from the three.js examples) — one continuous athletic surface, no hair, no
// clothes. That matters: a dressed avatar's silhouette IS its clothes (the
// Ready Player Me body mesh is only the exposed skin), and a shirt hem or a
// trouser leg skinned through a kick tears into chunks. `?body=rpm` and
// `?body=michelle` are kept for comparison. Any GLB with Mixamo-family bone
// names, with or without the `mixamorig:` prefix, drops in.
//
// The mesh is rendered as a coverage mask and composited as one black
// shape with a soft edge; the only processing is a tiny morphological
// close (½ % of the frame) that heals seams between the asset's separate
// meshes. The one reshaping is a bind-pose morph that fills the mannequin's
// pinched waist to an athlete's trunk. The edge glow is derived from the
// same mask: a whisper at rest, cinnabar for the beat of a strike.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { BodyState } from './sanda'
import { LM } from './sanda'

const MODELS: Record<string, string> = {
  xbot: 'models/performer_xbot.glb',
  rpm: 'models/performer_rpm.glb',
  michelle: 'models/performer_michelle.glb',
}
const MODEL_URL = MODELS[new URLSearchParams(window.location.search).get('body') ?? ''] ?? MODELS.xbot
// accessories that clutter a silhouette (the RPM avatar's hat/hair prop, beard, glasses)
const ACCESSORY = /^Mesh$|Beard|Glasses|Hat|Headwear|Hair/i

// screen-left is the mirrored subject's LEFT and the camera-facing
// character's RIGHT, so subject-left landmarks drive Right* bones
const AIMS: { bone: string; from: number; to: number; child: string }[] = [
  { bone: 'RightArm', from: LM.L_SHOULDER, to: LM.L_ELBOW, child: 'RightForeArm' },
  { bone: 'RightForeArm', from: LM.L_ELBOW, to: LM.L_WRIST, child: 'RightHand' },
  // the fist continues the forearm: the finger landmarks are the noisiest
  // MediaPipe gives and a fist that flails reads as a broken wrist
  { bone: 'RightHand', from: LM.L_ELBOW, to: LM.L_WRIST, child: 'RightHandMiddle1' },
  { bone: 'LeftArm', from: LM.R_SHOULDER, to: LM.R_ELBOW, child: 'LeftForeArm' },
  { bone: 'LeftForeArm', from: LM.R_ELBOW, to: LM.R_WRIST, child: 'LeftHand' },
  { bone: 'LeftHand', from: LM.R_ELBOW, to: LM.R_WRIST, child: 'LeftHandMiddle1' },
  { bone: 'RightUpLeg', from: LM.L_HIP, to: LM.L_KNEE, child: 'RightLeg' },
  { bone: 'RightLeg', from: LM.L_KNEE, to: LM.L_ANKLE, child: 'RightFoot' },
  { bone: 'RightFoot', from: LM.L_ANKLE, to: LM.L_FOOT, child: 'RightToeBase' },
  { bone: 'LeftUpLeg', from: LM.R_HIP, to: LM.R_KNEE, child: 'LeftLeg' },
  { bone: 'LeftLeg', from: LM.R_KNEE, to: LM.R_ANKLE, child: 'LeftFoot' },
  { bone: 'LeftFoot', from: LM.R_ANKLE, to: LM.R_FOOT, child: 'LeftToeBase' },
]

// distance of the lens from the picture plane, in uv units (the body is ~0.8 tall)
const CAM_DIST = 1.6
// render-side depth bias for the limbs: the aim stays metric, but a limb
// along the lens keeps some of its length on screen instead of vanishing
// into a blob — the readable martial silhouette over the literal one
const LIMB_DEPTH = 0.62
// how fast a bone follows its target (per second): tracking jitter in depth
// otherwise flickers limbs in and out of the picture plane frame to frame
const BONE_FOLLOW = 22
// the surface is pushed out along its normals by this much (model metres):
// a whisper of weight that fills the mannequin's joint gaps and seams
const PUSH = 0.012
// `?aim=world` aims from the world landmarks' x/y as well (for comparison)
const AIM_SPACE = new URLSearchParams(window.location.search).get('aim') ?? 'image'

const SKIN_VERT = `
#include <common>
#include <skinning_pars_vertex>
uniform float push;
// the mannequin's segmented waist, filled to an athlete's trunk: within a
// band above the hips (bind-pose metres) the shell is held to a minimum
// half-width sideways and front-to-back — a morph on the bind pose, so it
// rides the skinning like the rest of the surface
uniform float waistY0, waistY1, waistHalfX, waistHalfZ;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  vec3 n0 = normalize(objectNormal);
  transformed += n0 * push;
  if (waistHalfX > 0.0 && abs(position.x) < 0.24) {
    float band = smoothstep(waistY0, waistY0 + 0.04, position.y) * (1.0 - smoothstep(waistY1 - 0.04, waistY1, position.y));
    float hx = waistHalfX * band;
    float hz = waistHalfZ * band;
    if (abs(transformed.x) < hx) transformed.x = sign(transformed.x) * hx;
    if (abs(transformed.z) < hz && abs(transformed.x) < hx + 0.02) transformed.z = sign(transformed.z) * hz;
  }
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(normalMatrix * objectNormal);
  vV = -mvPosition.xyz;
  vP = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`

// the body is drawn only as coverage
const MASK_FRAG = `
void main() { gl_FragColor = vec4(1.0); }`

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

// disk sampling shared by the morphology passes: 16 directions × 2 rings
const DISK = `
uniform sampler2D tex;
uniform vec2 texel;
uniform float radius;
varying vec2 vUv;
float tapMax(float acc, vec2 o) { return max(acc, texture2D(tex, vUv + o).r); }
float tapMin(float acc, vec2 o) { return min(acc, texture2D(tex, vUv + o).r); }
#define RING(FN, ACC, R) for (int i = 0; i < 16; i++) { float a = float(i) * 0.39269908; ACC = FN(ACC, vec2(cos(a), sin(a)) * texel * (R)); }`

const DILATE_FRAG = `${DISK}
void main() {
  float m = texture2D(tex, vUv).r;
  RING(tapMax, m, radius)
  RING(tapMax, m, radius * 0.5)
  gl_FragColor = vec4(m);
}`

const ERODE_FRAG = `${DISK}
void main() {
  float m = texture2D(tex, vUv).r;
  RING(tapMin, m, radius)
  RING(tapMin, m, radius * 0.5)
  gl_FragColor = vec4(m);
}`

// soft threshold and colour: the shadow, and its edge
const COMPOSITE_FRAG = `
uniform sampler2D tex;
uniform vec2 texel;
uniform float radius, energy, strike, paper;
uniform vec3 rimA, rimB;
varying vec2 vUv;
void main() {
  // a small blur of the closed mask gives a smooth, antialiased edge
  float m = texture2D(tex, vUv).r * 0.25;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    m += texture2D(tex, vUv + vec2(cos(a), sin(a)) * texel * radius).r * 0.0625;
  }
  // a wider blur for the glow outside the edge
  float g = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.39269908;
    g += texture2D(tex, vUv + vec2(cos(a), sin(a)) * texel * radius * 5.0).r;
  }
  g /= 16.0;
  float fill = smoothstep(0.42, 0.58, m);
  vec3 ink = mix(vec3(0.0), vec3(0.08), paper);
  vec3 rim = mix(rimA, rimB, strike);
  float glow = clamp(g - fill, 0.0, 1.0) * (0.07 + energy * 0.12 + strike * 0.85) * (1.0 - paper * 0.6);
  vec3 col = ink * fill + rim * glow;
  float alpha = clamp(fill + glow, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`

export class Character {
  ready = false
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  // a mild perspective: the figure lives in a 0..aspect × 0..1 "uv" plane at
  // z = 0, seen from CAM_DIST in front. Anything thrown at the lens grows
  // (a fist at arm's length by ~20 %), which is what makes a punch at the
  // camera read as a punch rather than a stump — an orthographic shadow
  // collapses every limb that leaves the picture plane
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  private rig = new THREE.Group()
  private bones = new Map<string, THREE.Bone>()
  private restDir = new Map<string, THREE.Vector3>()
  // every bone's rest (bind-pose) local rotation, and the hips' rest world rotation:
  // Mixamo rigs carry non-identity rest rotations, so all posing is relative
  private restQ = new Map<string, THREE.Quaternion>()
  private hipsRestWorldQ = new THREE.Quaternion()
  // the rig's hip-joint midpoint at rest (anchored to the tracked hips) and
  // its hip→ankle leg length (the fit measure: joint to joint on both sides)
  private hipsRest = new THREE.Vector3()
  private modelLeg = 0.8
  private scaleS = 0
  private posS = new THREE.Vector3(0.5, 0.5, 0)
  // which way the trunk basis faces the lens (+1) — flipped with hysteresis
  private facing = 1
  // the first frame after the body appears snaps every bone into place
  private snapPose = true
  private fade = 0
  private energyS = 0
  private strikeS = 0
  private uniforms = {
    time: { value: 0 },
    energy: { value: 0 },
    strike: { value: 0 },
    paper: { value: 0 },
    push: { value: PUSH },
    waistY0: { value: 0 },
    waistY1: { value: 0 },
    waistHalfX: { value: 0 },
    waistHalfZ: { value: 0 },
    rimA: { value: new THREE.Color(0.36, 0.8, 0.86) },
    rimB: { value: new THREE.Color(0.95, 0.36, 0.24) },
  }
  // screen-space smoothing of the coverage mask
  private rtMask: THREE.WebGLRenderTarget | null = null
  private rtA: THREE.WebGLRenderTarget | null = null
  private rtB: THREE.WebGLRenderTarget | null = null
  private postScene = new THREE.Scene()
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private postQuad: THREE.Mesh
  private dilate: THREE.ShaderMaterial
  private erode: THREE.ShaderMaterial
  private composite: THREE.ShaderMaterial
  private canvas: HTMLCanvasElement
  private tA = new THREE.Vector3()
  private tB = new THREE.Vector3()
  private tC = new THREE.Vector3()
  private tQ = new THREE.Quaternion()
  private tQ2 = new THREE.Quaternion()
  private tQ3 = new THREE.Quaternion()
  private tM = new THREE.Matrix4()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const post = (frag: string) =>
      new THREE.ShaderMaterial({
        vertexShader: POST_VERT,
        fragmentShader: frag,
        uniforms: {
          tex: { value: null },
          texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
          radius: { value: 8 },
          energy: this.uniforms.energy,
          strike: this.uniforms.strike,
          paper: this.uniforms.paper,
          rimA: this.uniforms.rimA,
          rimB: this.uniforms.rimB,
        },
        depthTest: false,
        depthWrite: false,
        transparent: true,
      })
    this.dilate = post(DILATE_FRAG)
    this.erode = post(ERODE_FRAG)
    this.composite = post(COMPOSITE_FRAG)
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dilate)
    this.postQuad.frustumCulled = false
    this.postScene.add(this.postQuad)
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    } catch (err) {
      console.warn('character renderer unavailable:', err)
      return
    }
    this.scene.add(this.rig)
    this.camera.position.set(0.5, 0.5, CAM_DIST)
    this.camera.lookAt(0.5, 0.5, 0)
    void this.load()
  }

  private async load() {
    const loader = new GLTFLoader()
    const url = new URL(MODEL_URL, document.baseURI).href
    let model: THREE.Group
    try {
      model = (await loader.loadAsync(url)).scene
    } catch (err) {
      console.warn('character model failed to load:', err)
      return
    }
    const mask = new THREE.ShaderMaterial({ vertexShader: SKIN_VERT, fragmentShader: MASK_FRAG, uniforms: this.uniforms })
    const meshNames: string[] = []
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (mesh.isMesh) {
        meshNames.push(`${mesh.name}${ACCESSORY.test(mesh.name) ? ' (hidden)' : ''}`)
        if (ACCESSORY.test(mesh.name)) {
          mesh.visible = false
          return
        }
        // every body mesh (skin, clothes, head) goes into one coverage mask
        mesh.material = mask
        mesh.frustumCulled = false
      }
      if ((o as THREE.Bone).isBone) {
        const b = o as THREE.Bone
        const name = b.name.replace(/^mixamorig:?/, '')
        this.bones.set(name, b)
        this.restQ.set(name, b.quaternion.clone())
      }
    })
    this.rig.add(model)
    // fists: a martial silhouette has closed hands. Curl every phalanx toward
    // the palm once; fingers are not retargeted. In this rig's T-pose the
    // left hand's fingers run +X with the palm down, so the curl is a
    // negative turn about Z (positive for the right hand)
    for (const side of ['Left', 'Right'] as const) {
      const sign = side === 'Left' ? -1 : 1
      for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
        const curl = [1.15, 1.45, 0.9]
        for (let i = 1; i <= 3; i++) this.poseRel(`${side}Hand${finger}${i}`, new THREE.Euler(0, 0, sign * curl[i - 1]))
      }
      // the thumb folds across the fingers
      this.poseRel(`${side}HandThumb1`, new THREE.Euler(sign * 0.4, 0, sign * 0.35))
      this.poseRel(`${side}HandThumb2`, new THREE.Euler(0, 0, sign * 0.6))
      this.poseRel(`${side}HandThumb3`, new THREE.Euler(0, 0, sign * 0.5))
    }
    // rest directions: where each bone points at its child, in its local frame
    for (const a of AIMS) {
      const c = this.bones.get(a.child)
      if (c) this.restDir.set(a.bone, c.position.clone().normalize())
    }
    const hips = this.bones.get('Hips')
    const lu = this.bones.get('LeftUpLeg')
    const ru = this.bones.get('RightUpLeg')
    const lf = this.bones.get('LeftFoot')
    const rf = this.bones.get('RightFoot')
    this.rig.updateMatrixWorld(true)
    if (hips) hips.getWorldQuaternion(this.hipsRestWorldQ)
    if (lu && ru && lf && rf) {
      // anchor at the hip joints' midpoint; fit by hip → ankle leg length —
      // the same joints MediaPipe reports, unlike the pelvis bone
      const wp = (b: THREE.Bone) => b.getWorldPosition(new THREE.Vector3())
      this.hipsRest.copy(wp(lu)).add(wp(ru)).multiplyScalar(0.5)
      this.modelLeg = (wp(lu).distanceTo(wp(lf)) + wp(ru).distanceTo(wp(rf))) / 2
    } else if (hips) hips.getWorldPosition(this.hipsRest)
    if (MODEL_URL === MODELS.xbot) {
      // the X Bot's waist is a mannequin's pinch — an hourglass in
      // silhouette. Hold the trunk to an athlete's width from the hip
      // joints up to the ribs (bind-pose metres)
      const hy = this.hipsRest.y
      this.uniforms.waistY0.value = hy
      this.uniforms.waistY1.value = hy + 0.3
      this.uniforms.waistHalfX.value = 0.13
      this.uniforms.waistHalfZ.value = 0.09
    }
    console.debug(`[character] ${MODEL_URL}: hip joints ${this.hipsRest.toArray().map((v) => v.toFixed(3)).join(',')} leg ${this.modelLeg.toFixed(3)} bones ${this.bones.size} meshes ${meshNames.join(', ')}`)
    this.ready = true
  }

  setTheme(paper: boolean) {
    this.uniforms.paper.value = paper ? 1 : 0
  }

  /** world positions of named bones after the last update — for harnesses */
  probe(names: string[]): Record<string, [number, number, number]> {
    const out: Record<string, [number, number, number]> = {}
    this.rig.updateMatrixWorld(true)
    for (const n of names) {
      const b = this.bones.get(n)
      if (b) out[n] = b.getWorldPosition(new THREE.Vector3()).toArray() as [number, number, number]
    }
    return out
  }

  /** move a bone toward its target rotation, fast but never instantly */
  private follow(bone: THREE.Bone, target: THREE.Quaternion, dt: number) {
    if (this.snapPose) bone.quaternion.copy(target)
    else bone.quaternion.slerp(target, 1 - Math.exp(-dt * BONE_FOLLOW))
  }

  /** set a bone's local rotation relative to its rest rotation */
  private poseRel(name: string, e: THREE.Euler) {
    const b = this.bones.get(name)
    const r0 = this.restQ.get(name)
    if (!b || !r0) return
    b.quaternion.copy(r0).multiply(new THREE.Quaternion().setFromEuler(e))
  }

  resize(w: number, h: number) {
    if (!this.renderer) return
    this.renderer.setSize(w, h, false)
    const mk = () =>
      new THREE.WebGLRenderTarget(w, h, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
      })
    this.rtMask?.dispose()
    this.rtA?.dispose()
    this.rtB?.dispose()
    this.rtMask = mk()
    this.rtA = mk()
    this.rtB = mk()
    for (const m of [this.dilate, this.erode, this.composite]) m.uniforms.texel.value.set(1 / w, 1 / h)
    const aspect = w / h
    this.camera.aspect = aspect
    this.camera.fov = (2 * Math.atan(0.5 / CAM_DIST) * 180) / Math.PI
    this.camera.position.set(aspect / 2, 0.5, CAM_DIST)
    this.camera.lookAt(aspect / 2, 0.5, 0)
    this.camera.updateProjectionMatrix()
  }

  /**
   * Pose the character from the tracked body. Joints are in screen
   * fractions (y down) with depth in shoulder widths; the character lives
   * in an orthographic "uv" space (x in aspect units, y up).
   */
  update(body: BodyState | null, aspect: number, dt: number) {
    const on = !!(this.ready && body && body.present && body.all.length === 33)
    this.fade += ((on ? 1 : 0) - this.fade) * Math.min(1, dt * 4)
    this.uniforms.time.value += dt
    if (!on || !body) {
      this.snapPose = true
      return
    }
    // the aura breathes with motion and flares on a strike
    this.energyS += (body.energy - this.energyS) * Math.min(1, dt * 5)
    const strikeNow = body.sinceStrike < 420 ? 1 - body.sinceStrike / 420 : 0
    this.strikeS = Math.max(strikeNow, this.strikeS * Math.pow(0.02, dt))
    this.uniforms.energy.value = this.energyS
    this.uniforms.strike.value = this.strikeS

    const all = body.all
    const sw = body.sw
    // Two spaces, kept apart. The SCREEN point (image landmark, orthographic
    // "uv" space: x in aspect units, y up) places and fits the rig on the
    // canvas. The METRIC point (world landmark, shoulder-widths, y up, z
    // toward the camera) aims the bones: a punch at the lens is a limb
    // along +z, a side-on stance a shoulder line along z. Mixing the two —
    // projective x/y with metric z — made every aim wrong in depth.
    const S = (i: number, out: THREE.Vector3) => out.set(all[i].x * aspect, 1 - all[i].y, 0)
    const hasWorld = all.some((j) => j.wx !== 0 || j.wy !== 0)
    // The metric point: the image position in shoulder-widths (x/sw, y over
    // the frame's aspect) with the world landmark's depth. The image x/y
    // are the steadiest numbers MediaPipe gives and are exactly where the
    // ink lands, so the fist sits under its seal; the world x/y are lifted
    // by a depth model and shake. Only the depth needs the world estimate.
    const swA = Math.max(0.02, sw)
    const M = AIM_SPACE === 'world' && hasWorld
      ? (i: number, out: THREE.Vector3) => out.set(all[i].wx, -all[i].wy, all[i].z)
      : (i: number, out: THREE.Vector3) => out.set(all[i].x / swA, -all[i].y / (swA * aspect), all[i].z)
    const hipMid = new THREE.Vector3().addVectors(S(LM.L_HIP, this.tA), S(LM.R_HIP, this.tB)).multiplyScalar(0.5)
    const hipMidM = new THREE.Vector3().addVectors(M(LM.L_HIP, this.tA), M(LM.R_HIP, this.tB)).multiplyScalar(0.5)
    const shMidM = new THREE.Vector3().addVectors(M(LM.L_SHOULDER, this.tA), M(LM.R_SHOULDER, this.tB)).multiplyScalar(0.5)

    // fit: one uniform scale from the tracked leg length (hip → ankle, the
    // same joints on both sides) against the model's, smoothed slowly so the
    // figure never pulses; the hips follow the tracked hips with damping.
    // The fit is a screen measure — the asset's proportions carry the rest
    const legL = S(LM.L_HIP, this.tA).distanceTo(S(LM.L_ANKLE, this.tB))
    const legR = S(LM.R_HIP, this.tA).distanceTo(S(LM.R_ANKLE, this.tB))
    const s = Math.max(0.05, ((legL + legR) / 2) / this.modelLeg)
    this.scaleS = this.scaleS === 0 ? s : this.scaleS + (s - this.scaleS) * Math.min(1, dt * 0.8)
    this.posS.lerp(hipMid, Math.min(1, dt * 14))
    this.rig.scale.setScalar(this.scaleS)
    this.rig.position.set(
      this.posS.x - this.hipsRest.x * this.scaleS,
      this.posS.y - this.hipsRest.y * this.scaleS,
      -this.hipsRest.z * this.scaleS,
    )

    // torso: a full basis — up along the spine, the character's +X (its
    // left) along the shoulder line toward the subject's right
    const hips = this.bones.get('Hips')
    const torso = new THREE.Matrix4()
    if (hips) {
      const up = this.tC.subVectors(shMidM, hipMidM).normalize()
      // the shoulder line and the hip line, averaged: the pelvis follows the
      // trunk's turn, and one noisy shoulder does not swing the whole body
      const left = new THREE.Vector3().subVectors(M(LM.R_SHOULDER, this.tA), M(LM.L_SHOULDER, this.tB))
      left.add(this.tA.subVectors(M(LM.R_HIP, this.tA), M(LM.L_HIP, this.tB)))
      left.addScaledVector(up, -left.dot(up))
      if (left.lengthSq() < 1e-6) left.set(1, 0, 0)
      left.normalize()
      const fwd = new THREE.Vector3().crossVectors(left, up).normalize()
      // the shadow has no front or back: keep the mesh facing the lens, but
      // only flip once the body has clearly turned past profile, so a
      // side-on stance does not flicker between the two
      if (fwd.z * this.facing < -0.18) this.facing = -this.facing
      if (this.facing < 0) {
        left.negate()
        fwd.negate()
      }
      // new hips world = basis · rest world; expressed in the parent's frame
      torso.makeBasis(left, up, fwd)
      const B = this.tQ2.setFromRotationMatrix(torso)
      const Pq = hips.parent ? hips.parent.getWorldQuaternion(this.tQ) : this.tQ.identity()
      const target = this.tQ3.copy(Pq).invert().multiply(B).multiply(this.hipsRestWorldQ)
      this.follow(hips, target, dt)
      hips.updateMatrixWorld(true)
    }
    for (const name of ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder']) {
      const b = this.bones.get(name)
      const r0 = this.restQ.get(name)
      if (b && r0) b.quaternion.copy(r0)
    }
    // limbs: aim each bone at the joint its child sits on
    for (const aim of AIMS) {
      const bone = this.bones.get(aim.bone)
      const d0 = this.restDir.get(aim.bone)
      if (!bone || !d0 || !bone.parent) continue
      const from = M(aim.from, this.tA)
      const to = M(aim.to, this.tB)
      const dir = this.tC.subVectors(to, from)
      if (dir.lengthSq() < 1e-6) continue
      // the render-side depth bias (the aim itself is metric)
      dir.z *= LIMB_DEPTH
      dir.normalize()
      const r0 = this.restQ.get(aim.bone)
      if (!r0) continue
      const parentQ = bone.parent.getWorldQuaternion(this.tQ)
      // where the child sits in world if this bone kept its rest rotation
      const restWorld = d0.clone().applyQuaternion(r0).applyQuaternion(parentQ)
      const q = this.tQ2.setFromUnitVectors(restWorld, dir)
      // bone.world = q · parent · rest  ⇒  bone.local = parent⁻¹ · q · parent · rest
      const inv = this.tQ3.copy(parentQ).invert()
      const target = inv.multiply(q).multiply(parentQ).multiply(r0)
      this.follow(bone, target, dt)
      bone.updateMatrixWorld(true)
    }
    // head: yaw and pitch with the nose against the ears
    const head = this.bones.get('Head')
    const neck = this.bones.get('Neck')
    if (head) {
      // the nose against the ears, taken into the trunk's frame so a turned
      // body does not also turn the head; in metric space this is a true
      // yaw (the nose leads the ears toward the lens when facing it)
      const nose = M(LM.NOSE, this.tA)
      const earMid = this.tB.addVectors(M(LM.L_EAR, this.tC), M(LM.R_EAR, new THREE.Vector3())).multiplyScalar(0.5)
      const d = this.tC.subVectors(nose, earMid)
      if (hips) d.applyMatrix4(this.tM.copy(torso).invert())
      const scale = hasWorld ? 1 : sw
      const yaw = THREE.MathUtils.clamp(hasWorld ? Math.atan2(d.x, Math.max(0.02, Math.abs(d.z))) : (d.x / (scale * aspect)) * 1.6, -0.9, 0.9)
      const pitch = THREE.MathUtils.clamp((d.y / scale) * 1.2, -0.5, 0.5)
      const nr = neck ? this.restQ.get('Neck') : undefined
      if (neck && nr) neck.quaternion.copy(nr)
      this.poseRel('Head', new THREE.Euler(-pitch * 0.6, yaw, 0, 'YXZ'))
    }
    this.snapPose = false
  }

  render() {
    const r = this.renderer
    if (!r) return
    if (this.fade < 0.01 || !this.ready || !this.rtMask || !this.rtA || !this.rtB) {
      r.setRenderTarget(null)
      r.clear()
      return
    }
    const h = this.rtMask.height
    // 1. the rig as coverage
    r.setRenderTarget(this.rtMask)
    r.setClearColor(0x000000, 1)
    r.clear()
    r.render(this.scene, this.camera)
    // 2. a small close (½ % of the height) heals seams between the asset's
    // separate meshes (body / clothes / head) without reshaping anything
    const close = h * 0.005
    const pass = (mat: THREE.ShaderMaterial, src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget | null, radius: number) => {
      mat.uniforms.tex.value = src.texture
      mat.uniforms.radius.value = radius
      this.postQuad.material = mat
      r.setRenderTarget(dst)
      r.clear()
      r.render(this.postScene, this.postCamera)
    }
    pass(this.dilate, this.rtMask, this.rtA, close)
    pass(this.erode, this.rtA, this.rtB, close)
    // 3. soft threshold + glow, onto the transparent canvas
    r.setClearColor(0x000000, 0)
    pass(this.composite, this.rtB, null, h * 0.0022)
    r.setRenderTarget(null)
    this.canvas.style.opacity = this.fade.toFixed(3)
  }
}
