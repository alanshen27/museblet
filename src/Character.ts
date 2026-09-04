// The performer as an energy silhouette. A premade athletic humanoid rig
// (the three.js examples' Mixamo "X Bot": standard `mixamorig` skeleton,
// T-pose rest, neutral proportions) is driven by the tracked joints and
// rendered unlit: a near-black fill, a luminous chi rim that brightens
// with motion and turns cinnabar for a beat when a strike lands, slow inner
// energy filaments, and an additive aura hull. Only the body surface mesh
// is drawn — the rig's panel-line "joints" mesh is never rendered.
//
// Retargeting is rotations only: each limb bone is aimed at the joint its
// child bone sits on; the torso takes a full orientation from the hip and
// shoulder lines; the head yaws with the nose. Limb lengths and proportions
// come from the asset's bind pose. The hips take a damped position, and the
// whole figure is fitted to the frame with one slowly smoothed uniform
// scale — no bone is ever scaled.
//
// Swapping the asset: any GLB with `mixamorig*` bones (Mixamo, Ready Player
// Me, most FBX→GLB exports) drops in at MODEL_URL; the material is applied
// to every mesh regardless of what the source looked like.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { BodyState } from './sanda'
import { LM } from './sanda'

const MODEL_URL = 'models/xbot.glb'

// screen-left is the mirrored subject's LEFT and the camera-facing
// character's RIGHT, so subject-left landmarks drive Right* bones
const AIMS: { bone: string; from: number; to: number; child: string }[] = [
  { bone: 'RightArm', from: LM.L_SHOULDER, to: LM.L_ELBOW, child: 'RightForeArm' },
  { bone: 'RightForeArm', from: LM.L_ELBOW, to: LM.L_WRIST, child: 'RightHand' },
  { bone: 'RightHand', from: LM.L_WRIST, to: LM.L_INDEX, child: 'RightHandMiddle1' },
  { bone: 'LeftArm', from: LM.R_SHOULDER, to: LM.R_ELBOW, child: 'LeftForeArm' },
  { bone: 'LeftForeArm', from: LM.R_ELBOW, to: LM.R_WRIST, child: 'LeftHand' },
  { bone: 'LeftHand', from: LM.R_WRIST, to: LM.R_INDEX, child: 'LeftHandMiddle1' },
  { bone: 'RightUpLeg', from: LM.L_HIP, to: LM.L_KNEE, child: 'RightLeg' },
  { bone: 'RightLeg', from: LM.L_KNEE, to: LM.L_ANKLE, child: 'RightFoot' },
  { bone: 'RightFoot', from: LM.L_ANKLE, to: LM.L_FOOT, child: 'RightToeBase' },
  { bone: 'LeftUpLeg', from: LM.R_HIP, to: LM.R_KNEE, child: 'LeftLeg' },
  { bone: 'LeftLeg', from: LM.R_KNEE, to: LM.R_ANKLE, child: 'LeftFoot' },
  { bone: 'LeftFoot', from: LM.R_ANKLE, to: LM.R_FOOT, child: 'LeftToeBase' },
]

const SKIN_VERT = `
#include <common>
#include <skinning_pars_vertex>
uniform float push;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * push;
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
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10)
  private rig = new THREE.Group()
  private bones = new Map<string, THREE.Bone>()
  private restDir = new Map<string, THREE.Vector3>()
  private hipsRest = new THREE.Vector3()
  private modelTorso = 0.4
  private scaleS = 0
  private posS = new THREE.Vector3(0.5, 0.5, 0)
  private fade = 0
  private energyS = 0
  private strikeS = 0
  private uniforms = {
    time: { value: 0 },
    energy: { value: 0 },
    strike: { value: 0 },
    paper: { value: 0 },
    push: { value: 0 },
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
    this.camera.position.set(0, 0, 5)
    this.camera.lookAt(0, 0, 0)
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
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (mesh.isMesh) {
        // both of the rig's meshes (surface and the abdomen/joint shells)
        // go into the coverage mask, so the torso is one continuous shape
        mesh.material = mask
        mesh.frustumCulled = false
      }
      if ((o as THREE.Bone).isBone) {
        const b = o as THREE.Bone
        this.bones.set(b.name.replace(/^mixamorig:?/, ''), b)
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
        for (let i = 1; i <= 3; i++) {
          this.bones.get(`${side}Hand${finger}${i}`)?.quaternion.setFromEuler(new THREE.Euler(0, 0, sign * curl[i - 1]))
        }
      }
      // the thumb folds across the fingers
      this.bones.get(`${side}HandThumb1`)?.quaternion.setFromEuler(new THREE.Euler(sign * 0.4, 0, sign * 0.35))
      this.bones.get(`${side}HandThumb2`)?.quaternion.setFromEuler(new THREE.Euler(0, 0, sign * 0.6))
      this.bones.get(`${side}HandThumb3`)?.quaternion.setFromEuler(new THREE.Euler(0, 0, sign * 0.5))
    }
    // rest directions: where each bone points at its child, in its local frame
    for (const a of AIMS) {
      const c = this.bones.get(a.child)
      if (c) this.restDir.set(a.bone, c.position.clone().normalize())
    }
    const hips = this.bones.get('Hips')
    const la = this.bones.get('LeftArm')
    const ra = this.bones.get('RightArm')
    this.rig.updateMatrixWorld(true)
    if (hips) hips.getWorldPosition(this.hipsRest)
    if (hips && la && ra) {
      // the model's hip-to-shoulder length: the tracked torso scales it
      const sh = la.getWorldPosition(new THREE.Vector3()).add(ra.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5)
      this.modelTorso = this.hipsRest.distanceTo(sh)
    }
    this.ready = true
  }

  setTheme(paper: boolean) {
    this.uniforms.paper.value = paper ? 1 : 0
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
    this.camera.left = 0
    this.camera.right = w / h
    this.camera.top = 1
    this.camera.bottom = 0
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
    if (!on || !body) return
    // the aura breathes with motion and flares on a strike
    this.energyS += (body.energy - this.energyS) * Math.min(1, dt * 5)
    const strikeNow = body.sinceStrike < 420 ? 1 - body.sinceStrike / 420 : 0
    this.strikeS = Math.max(strikeNow, this.strikeS * Math.pow(0.02, dt))
    this.uniforms.energy.value = this.energyS
    this.uniforms.strike.value = this.strikeS

    const all = body.all
    const sw = body.sw
    const P = (i: number, out: THREE.Vector3) => out.set(all[i].x * aspect, 1 - all[i].y, all[i].z * sw * 0.9)
    const hipMid = new THREE.Vector3().addVectors(P(LM.L_HIP, this.tA), P(LM.R_HIP, this.tB)).multiplyScalar(0.5)
    const shMid = new THREE.Vector3().addVectors(P(LM.L_SHOULDER, this.tA), P(LM.R_SHOULDER, this.tB)).multiplyScalar(0.5)

    // fit: one uniform scale from the tracked torso length against the
    // model's, smoothed slowly so the figure never pulses; the hips follow
    // the tracked hips with damping
    const s = Math.max(0.05, hipMid.distanceTo(shMid) / this.modelTorso)
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
    if (hips) {
      const up = this.tC.subVectors(shMid, hipMid).normalize()
      const left = new THREE.Vector3().subVectors(P(LM.R_SHOULDER, this.tA), P(LM.L_SHOULDER, this.tB))
      left.addScaledVector(up, -left.dot(up)).normalize()
      const fwd = new THREE.Vector3().crossVectors(left, up).normalize()
      if (fwd.z < 0) {
        left.negate()
        fwd.negate()
      }
      this.tM.makeBasis(left, up, fwd)
      hips.quaternion.setFromRotationMatrix(this.tM)
      hips.updateMatrixWorld(true)
    }
    for (const name of ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder']) {
      this.bones.get(name)?.quaternion.identity()
    }
    // limbs: aim each bone at the joint its child sits on
    for (const aim of AIMS) {
      const bone = this.bones.get(aim.bone)
      const d0 = this.restDir.get(aim.bone)
      if (!bone || !d0 || !bone.parent) continue
      const from = P(aim.from, this.tA)
      const to = P(aim.to, this.tB)
      const dir = this.tC.subVectors(to, from)
      if (dir.lengthSq() < 1e-8) continue
      dir.normalize()
      const parentQ = bone.parent.getWorldQuaternion(this.tQ)
      const restWorld = d0.clone().applyQuaternion(parentQ)
      const q = this.tQ2.setFromUnitVectors(restWorld, dir)
      // bone.world = q · parent.world  ⇒  bone.local = parent⁻¹ · q · parent
      const inv = this.tQ3.copy(parentQ).invert()
      bone.quaternion.copy(inv).multiply(q).multiply(parentQ)
      bone.updateMatrixWorld(true)
    }
    // head: yaw and pitch with the nose against the ears
    const head = this.bones.get('Head')
    const neck = this.bones.get('Neck')
    if (head) {
      const nose = P(LM.NOSE, this.tA)
      const earMid = this.tB.addVectors(P(LM.L_EAR, this.tC), P(LM.R_EAR, new THREE.Vector3())).multiplyScalar(0.5)
      const yaw = THREE.MathUtils.clamp(((nose.x - earMid.x) / (sw * aspect)) * 1.6, -0.9, 0.9)
      const pitch = THREE.MathUtils.clamp(((nose.y - earMid.y) / sw) * 1.2, -0.5, 0.5)
      neck?.quaternion.identity()
      head.quaternion.setFromEuler(new THREE.Euler(-pitch * 0.6, yaw, 0, 'YXZ'))
    }
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
    // 2. close: dilate then erode with a radius of ~2.2% of the height —
    //    fills concavities narrower than that (waist pinch, neck, joint gaps)
    const close = h * 0.022
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
    // 3. open: erode then dilate with a smaller radius — removes convex
    //    bumps smaller than that (the ball joints' shoulders)
    const open = h * 0.011
    pass(this.erode, this.rtB, this.rtA, open)
    pass(this.dilate, this.rtA, this.rtB, open)
    // 4. soft threshold + glow, onto the transparent canvas
    r.setClearColor(0x000000, 0)
    pass(this.composite, this.rtB, null, h * 0.0025)
    r.setRenderTarget(null)
    this.canvas.style.opacity = this.fade.toFixed(3)
  }
}
