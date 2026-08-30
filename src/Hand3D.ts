// 3D hand overlay: the tracked joints drive an existing rigged hand model
// (the WebXR generic-hand GLB, the same rig three.js uses for XR hands)
// rendered as glowing translucent magic in a WebGL layer over the canvas.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import leftGlbUrl from '@webxr-input-profiles/assets/dist/profiles/generic-hand/left.glb?url'
import rightGlbUrl from '@webxr-input-profiles/assets/dist/profiles/generic-hand/right.glb?url'

export interface HandFrame {
  /** MediaPipe landmarks (21), normalized camera space */
  lm: { x: number; y: number; z: number }[]
  /** 'Left' | 'Right' as reported by MediaPipe (camera view) */
  handedness: string
  /** hand slot: 0 = gold, 1 = jade */
  slot: number
  /** screen-space anchor + scale (px) so the mesh lands on the 2D overlay */
  ax: number
  ay: number
  scale: number
  color: string
}

// WebXR joint name -> how to derive it from the 21 MediaPipe landmarks:
// either a direct landmark index, or [a, b, t] = lerp(lm[a], lm[b], t)
// (the finger metacarpals sit inside the palm between wrist and knuckle)
const JOINT_MAP: Record<string, number | [number, number, number]> = {
  wrist: 0,
  'thumb-metacarpal': 1,
  'thumb-phalanx-proximal': 2,
  'thumb-phalanx-distal': 3,
  'thumb-tip': 4,
  'index-finger-metacarpal': [0, 5, 0.3],
  'index-finger-phalanx-proximal': 5,
  'index-finger-phalanx-intermediate': 6,
  'index-finger-phalanx-distal': 7,
  'index-finger-tip': 8,
  'middle-finger-metacarpal': [0, 9, 0.3],
  'middle-finger-phalanx-proximal': 9,
  'middle-finger-phalanx-intermediate': 10,
  'middle-finger-phalanx-distal': 11,
  'middle-finger-tip': 12,
  'ring-finger-metacarpal': [0, 13, 0.3],
  'ring-finger-phalanx-proximal': 13,
  'ring-finger-phalanx-intermediate': 14,
  'ring-finger-phalanx-distal': 15,
  'ring-finger-tip': 16,
  'pinky-finger-metacarpal': [0, 17, 0.3],
  'pinky-finger-phalanx-proximal': 17,
  'pinky-finger-phalanx-intermediate': 18,
  'pinky-finger-phalanx-distal': 19,
  'pinky-finger-tip': 20,
}

// the joint each joint's bone points toward (to orient the bone)
const JOINT_NEXT: Record<string, string> = {
  wrist: 'middle-finger-metacarpal',
  'thumb-metacarpal': 'thumb-phalanx-proximal',
  'thumb-phalanx-proximal': 'thumb-phalanx-distal',
  'thumb-phalanx-distal': 'thumb-tip',
  'index-finger-metacarpal': 'index-finger-phalanx-proximal',
  'index-finger-phalanx-proximal': 'index-finger-phalanx-intermediate',
  'index-finger-phalanx-intermediate': 'index-finger-phalanx-distal',
  'index-finger-phalanx-distal': 'index-finger-tip',
  'middle-finger-metacarpal': 'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-proximal': 'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-intermediate': 'middle-finger-phalanx-distal',
  'middle-finger-phalanx-distal': 'middle-finger-tip',
  'ring-finger-metacarpal': 'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-proximal': 'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-intermediate': 'ring-finger-phalanx-distal',
  'ring-finger-phalanx-distal': 'ring-finger-tip',
  'pinky-finger-metacarpal': 'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-proximal': 'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-intermediate': 'pinky-finger-phalanx-distal',
  'pinky-finger-phalanx-distal': 'pinky-finger-tip',
}

interface HandRig {
  root: THREE.Object3D
  bones: Map<string, THREE.Object3D>
  material: THREE.MeshBasicMaterial
}

export class Hand3DLayer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.OrthographicCamera
  // one rig per hand slot, each loaded from the matching left/right GLB
  private rigs: (HandRig | null | 'loading')[] = [null, null]
  private loader = new GLTFLoader()

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    this.renderer.setClearColor(0x000000, 0)
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -5000, 5000)
  }

  private loadRig(slot: number, handedness: string) {
    this.rigs[slot] = 'loading'
    // the camera view is mirrored, so MediaPipe's label is the mirror of
    // the model we want to wear
    const url = handedness === 'Left' ? rightGlbUrl : leftGlbUrl
    this.loader.load(url, (gltf) => {
      const root = gltf.scene
      const bones = new Map<string, THREE.Object3D>()
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      root.traverse((o) => {
        const bone = o as THREE.Bone
        if (bone.isBone || JOINT_MAP[o.name] !== undefined) {
          bones.set(o.name, o)
        }
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) {
          mesh.material = material
          mesh.frustumCulled = false
        }
      })
      this.scene.add(root)
      this.rigs[slot] = { root, bones, material }
    })
  }

  update(frames: HandFrame[], w: number, h: number) {
    if (w === 0 || h === 0) return
    if (
      this.canvas.width !== Math.floor(w) ||
      this.canvas.height !== Math.floor(h)
    ) {
      this.renderer.setSize(w, h, false)
    }
    this.camera.right = w
    this.camera.bottom = h
    this.camera.updateProjectionMatrix()

    const used = new Set<number>()
    for (const f of frames) {
      used.add(f.slot)
      let rig = this.rigs[f.slot]
      if (rig === null) {
        this.loadRig(f.slot, f.handedness)
        continue
      }
      if (rig === 'loading') continue
      rig.root.visible = true
      rig.material.color.set(f.color)

      const pos = (name: string): THREE.Vector3 => {
        const m = JOINT_MAP[name]
        const at = (i: number) =>
          new THREE.Vector3(
            f.ax + (f.lm[9].x - f.lm[i].x) * f.scale,
            f.ay + (f.lm[i].y - f.lm[9].y) * f.scale,
            (f.lm[i].z - f.lm[9].z) * f.scale,
          )
        if (typeof m === 'number') return at(m)
        return at(m[0]).lerp(at(m[1]), m[2])
      }
      // palm normal gives every bone a stable "up", so fingers don't spin
      const wrist = pos('wrist')
      const idx = pos('index-finger-phalanx-proximal')
      const pky = pos('pinky-finger-phalanx-proximal')
      const up = new THREE.Vector3()
        .subVectors(idx, wrist)
        .cross(new THREE.Vector3().subVectors(pky, wrist))
        .normalize()
      if (f.handedness === 'Left') up.negate()

      const look = new THREE.Matrix4()
      for (const [name, next] of Object.entries(JOINT_NEXT)) {
        const bone = rig.bones.get(name)
        if (!bone) continue
        const p = pos(name)
        const q = pos(next)
        bone.position.copy(p)
        look.lookAt(q, p, up)
        bone.quaternion.setFromRotationMatrix(look)
      }
      // tips share their parent phalanx orientation
      for (const finger of ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']) {
        const tip = rig.bones.get(`${finger}-tip`)
        const parent = rig.bones.get(
          finger === 'thumb' ? 'thumb-phalanx-distal' : `${finger}-phalanx-distal`,
        )
        if (tip && parent) {
          tip.position.copy(pos(`${finger}-tip`))
          tip.quaternion.copy(parent.quaternion)
        }
      }
    }
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i]
      if (!used.has(i) && rig && rig !== 'loading') rig.root.visible = false
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.renderer.dispose()
  }
}
