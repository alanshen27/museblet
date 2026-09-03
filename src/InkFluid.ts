// Ink physics: a GPU stable-fluids solver (semi-Lagrangian advection,
// vorticity confinement, Jacobi pressure projection) whose dye is ink
// suspended in water. Slow hands stir it; a strike drives a shock through
// it. Rendered as a stone rubbing — luminous ink on a dark ground — with a
// soft tone curve so heavy ink saturates toward paper rather than clipping.

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

  // a directional shock: ink and velocity pushed along a line segment,
  // so a kick reads as a slash rather than a blot
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

  advection: `${HEAD}
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize;
uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
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

  display: `${HEAD}
uniform sampler2D uDye;
uniform vec3 ground;
uniform vec2 shake;
uniform float time, flash, aspect;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = vUv + shake;
  vec3 d = texture(uDye, uv).rgb;
  // ink wash tone curve: soft saturation, a hint of edge darkening where
  // the wash is thin (the pigment gathers at the rim as it dries)
  vec3 ink = 1.0 - exp(-d * 1.35);
  float dens = dot(d, vec3(0.333));
  float rim = smoothstep(0.02, 0.12, dens) * (1.0 - smoothstep(0.12, 0.5, dens));
  ink *= 1.0 + rim * 0.18;
  // paper grain, static, very faint
  float grain = (hash(floor(vUv * vec2(aspect, 1.0) * 900.0)) - 0.5) * 0.028;
  // vignette pressing in from the edges: the room is heavy
  vec2 q = vUv - 0.5;
  float vig = 1.0 - smoothstep(0.35, 0.95, length(q * vec2(1.0, 1.25))) * 0.55;
  vec3 c = (ground + grain) * vig + ink;
  c += flash * vec3(0.92, 0.88, 0.8);
  fragColor = vec4(c, 1.0);
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
  constructor(gl: WebGL2RenderingContext, vs: WebGLShader, fsSrc: string) {
    this.gl = gl
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) ?? 'link failed')
    }
    this.prog = p
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)
      if (info) this.uniforms.set(info.name, gl.getUniformLocation(p, info.name)!)
    }
  }
  use() {
    this.gl.useProgram(this.prog)
  }
  u(name: string) {
    return this.uniforms.get(name) ?? null
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? 'compile failed')
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

export class InkFluid {
  readonly ok: boolean
  private gl!: WebGL2RenderingContext
  private programs!: Record<keyof typeof FRAG, Program>
  private dye!: DoubleFBO
  private vel!: DoubleFBO
  private div!: FBO
  private curl!: FBO
  private pressure!: DoubleFBO
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
      const vs = compile(gl, gl.VERTEX_SHADER, VERT)
      const programs = {} as Record<keyof typeof FRAG, Program>
      for (const k of Object.keys(FRAG) as (keyof typeof FRAG)[]) {
        programs[k] = new Program(gl, vs, FRAG[k])
      }
      this.programs = programs
      const vao = gl.createVertexArray()!
      gl.bindVertexArray(vao)
      const vb = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vb)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      )
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      this.quad = vao
      this.resize()
      this.ok = true
    } catch (err) {
      console.warn('ink fluid unavailable:', err)
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
    return aspect > 1
      ? [Math.round(base * aspect), base]
      : [base, Math.round(base / aspect)]
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

  /**
   * Stir the ink at (x, y) (screen fractions, y down) with a velocity in
   * screen-fractions per second and a colour. Radius in screen fractions.
   */
  splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: [number, number, number],
    radius: number,
    velScale = 1,
  ) {
    if (!this.ok) return
    const gl = this.gl
    const p = this.programs.splat
    p.use()
    const aspect = this.canvas.width / this.canvas.height
    gl.uniform1f(p.u('aspectRatio'), aspect)
    gl.uniform2f(p.u('point'), x, 1 - y)
    gl.uniform1f(p.u('radius'), radius * radius)
    // velocity is stored in sim texels/s: screen fraction → texels
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform3f(
      p.u('color'),
      dx * this.vel.w * velScale,
      -dy * this.vel.h * velScale,
      0,
    )
    this.blit(this.vel.write)
    this.vel.swap()
    gl.uniform1i(p.u('uTarget'), this.bindTex(this.dye.read.tex, 0))
    gl.uniform3f(p.u('color'), color[0], color[1], color[2])
    this.blit(this.dye.write)
    this.dye.swap()
  }

  /** a line of ink and force from (ax, ay) to (bx, by) */
  slash(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    dx: number,
    dy: number,
    color: [number, number, number],
    radius: number,
    velScale = 1,
  ) {
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

  /** a strike lands: a shock through the ink, a flash and a weight shift */
  shock(s: Shock) {
    if (!this.ok) return
    const f = s.force
    if (s.kind === 'punch') {
      // a burst of ink thrown along the fist's travel, with force
      // radiating outward from the point of impact
      this.splat(s.x, s.y, s.dx * 3 * f, s.dy * 3 * f, s.color.map((c) => c * (0.6 + f)) as [number, number, number], 0.028 + f * 0.05, 1)
      const n = 10
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
        const r = 0.02 + f * 0.05
        this.splat(
          s.x + Math.cos(a) * r,
          s.y + Math.sin(a) * r,
          Math.cos(a) * (0.8 + f * 2.4),
          Math.sin(a) * (0.8 + f * 2.4),
          [0, 0, 0],
          0.012,
          1,
        )
      }
      this.flash = Math.min(0.6, this.flash + 0.06 + f * 0.11)
      this.shakeVX += s.dx * (0.004 + f * 0.012)
      this.shakeVY += -s.dy * (0.004 + f * 0.012)
    } else {
      // a kick tears a vertical curtain through the room
      const x = s.x
      const top = Math.max(0.02, s.y - 0.55 - f * 0.3)
      const bottom = Math.min(0.98, s.y + 0.25)
      this.slash(x, top, x, bottom, s.dx * 2.5 * f, -1.2 * f, s.color.map((c) => c * (0.5 + f * 0.9)) as [number, number, number], 0.014 + f * 0.012, 1)
      // and shoves the ink away from the line on both sides
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
    gl.uniform1f(P.advection.u('dissipation'), 0.35)
    this.blit(this.vel.write)
    this.vel.swap()

    gl.uniform1i(P.advection.u('uVelocity'), this.bindTex(this.vel.read.tex, 0))
    gl.uniform1i(P.advection.u('uSource'), this.bindTex(this.dye.read.tex, 1))
    // ink fades slowly back to 留白
    gl.uniform1f(P.advection.u('dissipation'), 0.55)
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
  }

  /** the current screen displacement, for layers above to follow */
  get shake(): [number, number] {
    return [this.shakeX, this.shakeY]
  }

  render() {
    if (!this.ok) return
    const gl = this.gl
    const p = this.programs.display
    p.use()
    gl.uniform1i(p.u('uDye'), this.bindTex(this.dye.read.tex, 0))
    gl.uniform3f(p.u('ground'), this.ground[0], this.ground[1], this.ground[2])
    gl.uniform2f(p.u('shake'), this.shakeX, -this.shakeY)
    gl.uniform1f(p.u('time'), this.time)
    gl.uniform1f(p.u('flash'), this.flash)
    gl.uniform1f(p.u('aspect'), this.canvas.width / this.canvas.height)
    this.blit(null)
  }
}
