import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { STLLoader } from "three/addons/loaders/STLLoader.js"
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js"

const STOFF = {
  bjork: { flate: "#efdcb9", kant: "#3a2616", ru: 0.66, aarer: 0.8 },
  poppel: { flate: "#f4ead4", kant: "#4b3321", ru: 0.74, aarer: 0.4 },
  papp: { flate: "#b9966b", kant: "#75563a", ru: 0.95, aarer: 0 },
  mdf: { flate: "#b89472", kant: "#33251a", ru: 0.85, aarer: 0 },
  "akryl-opal": { flate: "#f6f4ef", kant: "#fdfcf9", ru: 0.36, gjennom: 0.9 },
  pp: { flate: "#eff2f3", kant: "#f7f9f9", ru: 0.5, gjennom: 0.72 },
  spegl: { flate: "#8a8d8f", kant: "#c3d5cb", ru: 0.6, spegl: true },
}

const BAK = { studio: ["#dedad4", "#b7b2ab"], lys: ["#100e0c", "#040404"] }
const SPEGLING = 0.87

const SYN = {
  helt: { az: 35, el: 20, elHeng: 9 },
  front: { az: 0, el: 0, linse: 6 },
  side: { az: 90, el: 0, linse: 6 },
  topp: { el: 90, linse: 6 },
  under: { el: -90 },
  lys: { az: 30, el: 13, elHeng: 5, vid: 1.65 },
  sprengt: { az: 35, el: 22, elHeng: 14 },
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2])
const halton = (i, b) => {
  let f = 1
  let r = 0
  while (i > 0) {
    f /= b
    r += f * (i % b)
    i = Math.floor(i / b)
  }
  return r
}
const brok = (x) => x - Math.floor(x)
const slump = (fro) => () => {
  fro = (fro + 0x6d2b79f5) | 0
  let t = Math.imul(fro ^ (fro >>> 15), 1 | fro)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const S = {}
const R = {}

{
  const fra = "max( pow( lightDistance, decayExponent ), 0.01 )"
  if (!THREE.ShaderChunk.lights_pars_begin.includes(fra)) throw new Error("lights_pars_begin har endra seg")
  const kast = "light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );"
  if (!THREE.ShaderChunk.lights_pars_begin.includes(kast)) throw new Error("lights_pars_begin har endra seg")
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin
    .replace(fra, "max( pow( lightDistance, decayExponent ), 400.0 )")
    .replace(kast, "light.color *= 1.0 / max( lightDistance * lightDistance, spotLight.decay * spotLight.decay );")
}

const aarerLager = new Map()
function aarer(styrke, fro) {
  const nokkel = styrke + ":" + fro
  if (aarerLager.has(nokkel)) return aarerLager.get(nokkel)
  const n = 512
  const c = document.createElement("canvas")
  c.width = c.height = n
  const g = c.getContext("2d")
  const r = slump(fro * 977 + 5)
  g.fillStyle = "#ffffff"
  g.fillRect(0, 0, n, n)
  for (let i = 0; i < 12; i++) {
    const y = r() * n
    const h = 18 + r() * 80
    g.fillStyle = `rgba(150,105,55,${(0.02 + r() * 0.04) * styrke})`
    for (const d of [-n, 0, n]) g.fillRect(0, y + d, n, h)
  }
  for (let i = 0; i < 320; i++) {
    const y = r() * n
    const a = (0.03 + r() * 0.09) * styrke
    const amp = 1 + r() * 6
    const fase = r() * 6.283
    const per = 1 + Math.floor(r() * 2)
    g.strokeStyle = `rgba(120,78,38,${a})`
    g.lineWidth = 0.5 + r() * 1.8
    for (const d of [-n, 0, n]) {
      g.beginPath()
      for (let x = 0; x <= n; x += 16) {
        const yy = y + d + amp * Math.sin((x / n) * 6.283 * per + fase)
        if (x) g.lineTo(x, yy)
        else g.moveTo(x, yy)
      }
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / 230, 1 / 230)
  t.anisotropy = 4
  aarerLager.set(nokkel, t)
  return t
}

function mjuk(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
        "float dotNL = saturate( abs( dot( geometryNormal, directLight.direction ) ) * 0.8 + 0.2 );",
      ),
    )
  }
  m.customProgramCacheKey = () => "mjuk"
}

let omgjevnadKart = null
function omgjevnad() {
  if (omgjevnadKart) return omgjevnadKart
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 256
  const g = c.getContext("2d")
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, "#f4f1ec")
  gr.addColorStop(0.45, "#d9d5ce")
  gr.addColorStop(0.55, "#bdb8b0")
  gr.addColorStop(1, "#a9a39b")
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = "#ffffff"
  g.fillRect(60, 36, 120, 56)
  omgjevnadKart = new THREE.CanvasTexture(c)
  omgjevnadKart.colorSpace = THREE.SRGBColorSpace
  omgjevnadKart.mapping = THREE.EquirectangularReflectionMapping
  return omgjevnadKart
}

function speglReserve() {
  const m = new THREE.MeshStandardMaterial({ color: "#f1f4f3", metalness: 1, roughness: 0.07, envMap: omgjevnad() })
  m.envMapRotation.set(-Math.PI / 2, 0, 0)
  m.userData.spegl = true
  return m
}

function speglPlanStoff() {
  const m = new THREE.ShaderMaterial({
    uniforms: { kart: { value: null }, tm: { value: new THREE.Matrix4() }, bak0: { value: new THREE.Color() }, bak1: { value: new THREE.Color() }, nrm: { value: new THREE.Vector3(0, 0, 1) }, ton: { value: 0.9 } },
    vertexShader: "uniform mat4 tm; varying vec4 vK; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vK = tm * w; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader:
      "uniform sampler2D kart; uniform vec3 bak0; uniform vec3 bak1; uniform vec3 nrm; uniform float ton; varying vec4 vK; varying vec3 vW; void main(){ vec4 s = texture2DProj(kart, vK); vec3 r = reflect(normalize(vW - cameraPosition), nrm); vec3 bak = mix(bak1, bak0, smoothstep(-0.5, 0.7, r.z)); gl_FragColor = vec4((s.rgb + (1. - clamp(s.a, 0., 1.)) * bak) * ton, 1.); }",
  })
  m.userData.spegl = true
  return m
}

function stoffFor(namn, farge, i) {
  const s = STOFF[namn] || STOFF.bjork
  const r = slump(i * 7919 + 13)
  const flate = new THREE.MeshStandardMaterial({ color: farge || s.flate, roughness: s.ru, metalness: 0 })
  if (!farge) flate.color.offsetHSL(0, 0, (r() - 0.5) * 0.04)
  if (s.aarer && !farge) flate.map = aarer(s.aarer, i % 4)
  const kant = new THREE.MeshStandardMaterial({ color: s.kant, roughness: s.gjennom ? s.ru : 0.92, metalness: 0 })
  if (s.spegl) {
    kant.roughness = 0.2
    kant.envMap = omgjevnad()
    kant.envMapRotation.set(-Math.PI / 2, 0, 0)
    return { flate, kant, gjennom: false, spegl: true }
  }
  if (s.gjennom) {
    for (const m of [flate, kant]) {
      m.transparent = true
      m.opacity = s.gjennom
      mjuk(m)
    }
  }
  return { flate, kant, gjennom: !!s.gjennom }
}

const reinsk = (r) => {
  const p = r.map((q) => [q[0], q[1]])
  const a = p[0]
  const b = p[p.length - 1]
  if (p.length > 1 && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) p.pop()
  return p
}
const areal = (p) => {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

function plateGeo(om, hol, t) {
  const f = new THREE.Shape(om.map((q) => new THREE.Vector2(q[0], q[1])))
  for (const h of hol) f.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q[0], q[1]))))
  return new THREE.ExtrudeGeometry(f, { depth: t, bevelEnabled: false, curveSegments: 1, steps: 1 })
}

function klypp(poly, lo, hi) {
  const eitt = (inn, grense, over) => {
    const ut = []
    for (let i = 0; i < inn.length; i++) {
      const a = inn[i]
      const b = inn[(i + 1) % inn.length]
      const ai = over ? a[0] >= grense : a[0] <= grense
      const bi = over ? b[0] >= grense : b[0] <= grense
      if (ai) ut.push(a)
      if (ai !== bi) {
        const s = (grense - a[0]) / (b[0] - a[0])
        ut.push([grense, a[1] + s * (b[1] - a[1])])
      }
    }
    return ut
  }
  return eitt(eitt(poly, lo, true), hi, false)
}

function boygGeo(om0, hol0, t, k) {
  const h = t / 2
  const steg = (4 * Math.PI) / 180 / Math.abs(k)
  const bog = (u, v, w) => {
    const a = k * u
    const off = w - h
    return [Math.sin(a) / k - off * Math.sin(a), v, h + (1 - Math.cos(a)) / k + off * Math.cos(a)]
  }
  const om = areal(om0) < 0 ? om0.slice().reverse() : om0
  const hol = hol0.map((q) => (areal(q) > 0 ? q.slice().reverse() : q))
  const alle = [om, ...hol].flat()
  const tre = THREE.ShapeUtils.triangulateShape(
    om.map((q) => new THREE.Vector2(q[0], q[1])),
    hol.map((r) => r.map((q) => new THREE.Vector2(q[0], q[1]))),
  )
  const pos = []
  const nrm = []
  const uv = []
  const legg = (q, w, sn) => {
    const p = bog(q[0], q[1], w)
    const a = k * q[0]
    pos.push(p[0], p[1], p[2])
    nrm.push(-Math.sin(a) * sn, 0, Math.cos(a) * sn)
    uv.push(q[0], q[1])
  }
  for (const f of tre) {
    let tri = [alle[f[0]], alle[f[1]], alle[f[2]]]
    if (areal(tri) < 0) tri = [tri[0], tri[2], tri[1]]
    const u0 = Math.min(tri[0][0], tri[1][0], tri[2][0])
    const u1 = Math.max(tri[0][0], tri[1][0], tri[2][0])
    for (let j = Math.floor(u0 / steg); j * steg < u1; j++) {
      const bit = klypp(tri, j * steg, (j + 1) * steg)
      for (let i = 1; i + 1 < bit.length; i++) {
        legg(bit[0], t, 1)
        legg(bit[i], t, 1)
        legg(bit[i + 1], t, 1)
        legg(bit[0], 0, -1)
        legg(bit[i + 1], 0, -1)
        legg(bit[i], 0, -1)
      }
    }
  }
  const nFlate = pos.length / 3
  const kant = (a, b) => {
    const p = [a]
    const u0 = Math.min(a[0], b[0])
    const u1 = Math.max(a[0], b[0])
    const mellom = []
    for (let j = Math.floor(u0 / steg) + 1; j * steg < u1; j++) {
      const s = (j * steg - a[0]) / (b[0] - a[0])
      mellom.push([j * steg, a[1] + s * (b[1] - a[1])])
    }
    if (a[0] > b[0]) mellom.reverse()
    p.push(...mellom, b)
    for (let i = 0; i + 1 < p.length; i++) {
      const q0 = bog(p[i][0], p[i][1], 0)
      const q1 = bog(p[i + 1][0], p[i + 1][1], 0)
      const q2 = bog(p[i + 1][0], p[i + 1][1], t)
      const q3 = bog(p[i][0], p[i][1], t)
      const e1 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]
      const e2 = [q3[0] - q0[0], q3[1] - q0[1], q3[2] - q0[2]]
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const l = Math.hypot(n[0], n[1], n[2]) || 1
      for (const q of [q0, q1, q2, q0, q2, q3]) {
        pos.push(q[0], q[1], q[2])
        nrm.push(n[0] / l, n[1] / l, n[2] / l)
        uv.push(0, 0)
      }
    }
  }
  for (const ring of [om, ...hol]) for (let i = 0; i < ring.length; i++) kant(ring[i], ring[(i + 1) % ring.length])
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  g.addGroup(0, nFlate, 0)
  g.addGroup(nFlate, pos.length / 3 - nFlate, 1)
  return g
}

function eigen3(m) {
  const A = m.map((r) => r.slice())
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let it = 0; it < 30; it++) {
    let p = 0
    let q = 1
    let mx = Math.abs(A[0][1])
    if (Math.abs(A[0][2]) > mx) {
      q = 2
      mx = Math.abs(A[0][2])
    }
    if (Math.abs(A[1][2]) > mx) {
      p = 1
      q = 2
      mx = Math.abs(A[1][2])
    }
    if (mx < 1e-12) break
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q])
    const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1))
    const c = 1 / Math.sqrt(t * t + 1)
    const sn = t * c
    for (let k = 0; k < 3; k++) {
      const a = A[k][p]
      const b = A[k][q]
      A[k][p] = c * a - sn * b
      A[k][q] = sn * a + c * b
    }
    for (let k = 0; k < 3; k++) {
      const a = A[p][k]
      const b = A[q][k]
      A[p][k] = c * a - sn * b
      A[q][k] = sn * a + c * b
    }
    for (let k = 0; k < 3; k++) {
      const a = V[k][p]
      const b = V[k][q]
      V[k][p] = c * a - sn * b
      V[k][q] = sn * a + c * b
    }
  }
  return [0, 1, 2].map((j) => ({ verdi: A[j][j], vek: new THREE.Vector3(V[0][j], V[1][j], V[2][j]) })).sort((a, b) => a.verdi - b.verdi)
}

function sylinderAv(pos, nrm, ar, n, sumAr) {
  const rekkje = Array.from({ length: n }, (_, i) => i).sort((a, b) => ar[b] - ar[a])
  const store = []
  let sum = 0
  for (const i of rekkje) {
    store.push(i)
    sum += ar[i]
    if (sum > 0.5 * sumAr) break
  }
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const i of store) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += ar[i] * nrm[i * 3 + a] * nrm[i * 3 + b]
  const e = eigen3(M)
  if (e[0].verdi > 0.02 * e[1].verdi || e[1].verdi < 1e-4 * e[2].verdi) return null
  const akse = e[0].vek.normalize()
  const ex = e[2].vek.normalize()
  const ey = new THREE.Vector3().crossVectors(akse, ex).normalize()
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0, tal = 0
  const q = new THREE.Vector3()
  for (const i of store) {
    for (let k = 0; k < 3; k++) {
      q.set(pos[i * 9 + k * 3], pos[i * 9 + k * 3 + 1], pos[i * 9 + k * 3 + 2])
      const x = q.dot(ex)
      const y = q.dot(ey)
      const z = x * x + y * y
      sx += x
      sy += y
      sxx += x * x
      syy += y * y
      sxy += x * y
      sxz += x * z
      syz += y * z
      sz += z
      tal++
    }
  }
  const det3 = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const Am = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, tal],
  ]
  const bm = [-sxz, -syz, -sz]
  const d = det3(Am)
  if (Math.abs(d) < 1e-9) return null
  const los = [0, 1, 2].map((j) => det3(Am.map((r, i) => r.map((v, k) => (k === j ? bm[i] : v)))) / d)
  const cx = -los[0] / 2
  const cy = -los[1] / 2
  const r2 = cx * cx + cy * cy - los[2]
  if (!(r2 > 0)) return null
  return { akse, ex, ey, cx, cy, rad: Math.sqrt(r2) }
}

function soupGeo(pos, tjukn) {
  const n = Math.floor(pos.length / 9)
  const kart = new Map()
  const idx = new Int32Array(n * 3)
  const forste = []
  for (let i = 0; i < n * 3; i++) {
    const nk = Math.round(pos[i * 3] * 100) + "," + Math.round(pos[i * 3 + 1] * 100) + "," + Math.round(pos[i * 3 + 2] * 100)
    let j = kart.get(nk)
    if (j === undefined) {
      j = kart.size
      kart.set(nk, j)
      forste.push(i)
    }
    idx[i] = j
  }
  const nrm = new Float32Array(n * 3)
  const ar = new Float32Array(n)
  let sumAr = 0
  let storst = 0
  for (let i = 0; i < n; i++) {
    const o = i * 9
    const ax = pos[o + 3] - pos[o]
    const ay = pos[o + 4] - pos[o + 1]
    const az = pos[o + 5] - pos[o + 2]
    const bx = pos[o + 6] - pos[o]
    const by = pos[o + 7] - pos[o + 1]
    const bz = pos[o + 8] - pos[o + 2]
    const x = ay * bz - az * by
    const y = az * bx - ax * bz
    const z = ax * by - ay * bx
    const l = Math.hypot(x, y, z)
    ar[i] = l / 2
    sumAr += ar[i]
    if (l > 0) {
      nrm[i * 3] = x / l
      nrm[i * 3 + 1] = y / l
      nrm[i * 3 + 2] = z / l
    }
    if (ar[i] > ar[storst]) storst = i
  }
  const flate = new Uint8Array(n)
  const n0 = [nrm[storst * 3], nrm[storst * 3 + 1], nrm[storst * 3 + 2]]
  let del = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(nrm[i * 3] * n0[0] + nrm[i * 3 + 1] * n0[1] + nrm[i * 3 + 2] * n0[2])
    if (d > 0.999) del += ar[i]
  }
  const flat = del > 0.4 * sumAr
  const syl = flat ? null : sylinderAv(pos, nrm, ar, n, sumAr)
  const radial = (x, y, z) => {
    const px = x * syl.ex.x + y * syl.ex.y + z * syl.ex.z - syl.cx
    const py = x * syl.ey.x + y * syl.ey.y + z * syl.ey.z - syl.cy
    const l = Math.hypot(px, py) || 1
    return [(px * syl.ex.x + py * syl.ey.x) / l, (px * syl.ex.y + py * syl.ey.y) / l, (px * syl.ex.z + py * syl.ey.z) / l, Math.atan2(py, px)]
  }
  if (syl) {
    for (let i = 0; i < n; i++) {
      const o = i * 9
      const r = radial((pos[o] + pos[o + 3] + pos[o + 6]) / 3, (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3)
      flate[i] = Math.abs(nrm[i * 3] * r[0] + nrm[i * 3 + 1] * r[1] + nrm[i * 3 + 2] * r[2]) > 0.8 ? 1 : 0
    }
  } else if (flat) {
    for (let i = 0; i < n; i++) {
      const d = Math.abs(nrm[i * 3] * n0[0] + nrm[i * 3 + 1] * n0[1] + nrm[i * 3 + 2] * n0[2])
      flate[i] = d > 0.99 ? 1 : 0
    }
  } else {
    const far = new Int32Array(n)
    for (let i = 0; i < n; i++) far[i] = i
    const finn = (i) => {
      while (far[i] !== i) {
        far[i] = far[far[i]]
        i = far[i]
      }
      return i
    }
    const kantar = new Map()
    for (let i = 0; i < n; i++) {
      for (let e = 0; e < 3; e++) {
        const a = idx[i * 3 + e]
        const b = idx[i * 3 + ((e + 1) % 3)]
        const nk = a < b ? a * 4194304 + b : b * 4194304 + a
        const l = kantar.get(nk)
        if (l) l.push(i)
        else kantar.set(nk, [i])
      }
    }
    const lik = (i, j) => nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2] > 0.77
    for (const l of kantar.values()) {
      for (let a = 0; a + 1 < l.length; a++) if (lik(l[a], l[a + 1])) far[finn(l[a])] = finn(l[a + 1])
    }
    const grA = new Map()
    const grP = new Map()
    for (let i = 0; i < n; i++) {
      const g = finn(i)
      grA.set(g, (grA.get(g) || 0) + ar[i])
    }
    for (const [nk, l] of kantar) {
      const a = Math.floor(nk / 4194304)
      const b = nk % 4194304
      const gr = new Set(l.map(finn))
      const sams = l.length === 2 && gr.size === 1
      if (sams) continue
      const pa = forste[a]
      const pb = forste[b]
      const len = Math.hypot(pos[pa * 3] - pos[pb * 3], pos[pa * 3 + 1] - pos[pb * 3 + 1], pos[pa * 3 + 2] - pos[pb * 3 + 2])
      for (const g of gr) grP.set(g, (grP.get(g) || 0) + len)
    }
    const breidd = new Map()
    for (const [g, a] of grA) breidd.set(g, (2 * a) / Math.max(grP.get(g) || 1e-9, 1e-9))
    let t = tjukn
    if (!t) {
      t = Infinity
      for (const [g, a] of grA) if (a > 0.02 * sumAr) t = Math.min(t, breidd.get(g))
      if (!Number.isFinite(t)) t = 3
    }
    for (let i = 0; i < n; i++) flate[i] = breidd.get(finn(i)) > 1.6 * t ? 1 : 0
  }
  const ut = new Float32Array(n * 9)
  const un = new Float32Array(n * 9)
  const uu = new Float32Array(n * 6)
  const glatt = !flat && !syl ? new Float32Array(kart.size * 3) : null
  if (glatt) {
    for (let i = 0; i < n; i++) {
      if (!flate[i]) continue
      for (let e = 0; e < 3; e++) {
        const j = idx[i * 3 + e] * 3
        glatt[j] += nrm[i * 3] * ar[i]
        glatt[j + 1] += nrm[i * 3 + 1] * ar[i]
        glatt[j + 2] += nrm[i * 3 + 2] * ar[i]
      }
    }
  }
  const ref = Math.abs(n0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const ua = new THREE.Vector3().crossVectors(v3(ref), v3(n0)).normalize()
  const ub = new THREE.Vector3().crossVectors(v3(n0), ua).normalize()
  let w = 0
  let nFlate = 0
  for (const kl of [1, 0]) {
    for (let i = 0; i < n; i++) {
      if (flate[i] !== kl) continue
      for (let e = 0; e < 3; e++) {
        const o = i * 9 + e * 3
        ut[w * 3] = pos[o]
        ut[w * 3 + 1] = pos[o + 1]
        ut[w * 3 + 2] = pos[o + 2]
        let nx = nrm[i * 3]
        let ny = nrm[i * 3 + 1]
        let nz = nrm[i * 3 + 2]
        if (glatt && kl) {
          const j = idx[i * 3 + e] * 3
          const l = Math.hypot(glatt[j], glatt[j + 1], glatt[j + 2])
          if (l > 0 && (glatt[j] * nx + glatt[j + 1] * ny + glatt[j + 2] * nz) / l > 0.5) {
            nx = glatt[j] / l
            ny = glatt[j + 1] / l
            nz = glatt[j + 2] / l
          }
        }
        let tu = pos[o] * ua.x + pos[o + 1] * ua.y + pos[o + 2] * ua.z
        let tv = pos[o] * ub.x + pos[o + 1] * ub.y + pos[o + 2] * ub.z
        if (syl) {
          const r = radial(pos[o], pos[o + 1], pos[o + 2])
          if (kl) {
            const sn = nx * r[0] + ny * r[1] + nz * r[2] > 0 ? 1 : -1
            nx = r[0] * sn
            ny = r[1] * sn
            nz = r[2] * sn
          }
          tu = r[3] * syl.rad
          tv = pos[o] * syl.akse.x + pos[o + 1] * syl.akse.y + pos[o + 2] * syl.akse.z
        }
        un[w * 3] = nx
        un[w * 3 + 1] = ny
        un[w * 3 + 2] = nz
        uu[w * 2] = tu
        uu[w * 2 + 1] = tv
        w++
      }
      if (kl) nFlate += 3
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(ut, 3))
  g.setAttribute("normal", new THREE.BufferAttribute(un, 3))
  g.setAttribute("uv", new THREE.BufferAttribute(uu, 2))
  g.addGroup(0, nFlate, 0)
  g.addGroup(nFlate, n * 3 - nFlate, 1)
  return g
}

async function lastGlb(url, eining, opp) {
  const gltf = await new GLTFLoader().loadAsync(url)
  gltf.scene.updateMatrixWorld(true)
  const rader = []
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return
    let g = o.geometry
    if (g.index) g = g.toNonIndexed()
    const p = g.getAttribute("position")
    const a = new Float32Array(p.count * 3)
    const q = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
      a[i * 3] = q.x
      a[i * 3 + 1] = opp === "z" ? q.y : -q.z
      a[i * 3 + 2] = opp === "z" ? q.z : q.y
    }
    rader.push({ namn: o.name || o.parent?.name || "del" + rader.length, a })
  })
  let storst = 0
  for (const r of rader) for (let i = 0; i < r.a.length; i++) storst = Math.max(storst, Math.abs(r.a[i]))
  const skala = eining === "mm" ? 1 : eining === "m" ? 1000 : storst > 20 ? 1 : 1000
  for (const r of rader) for (let i = 0; i < r.a.length; i++) r.a[i] *= skala
  return rader
}

async function lastKropp(url) {
  const lagNormal = (g) => {
    const m = mergeVertices(g.index ? g : g, 1e-3)
    m.computeVertexNormals()
    return m
  }
  if (/\.(glb|gltf)(\?|$)/i.test(decodeURIComponent(url))) {
    const rader = await lastGlb(url)
    return rader.map((r) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.BufferAttribute(r.a, 3))
      return lagNormal(g)
    })
  }
  const g = await new STLLoader().loadAsync(url)
  g.deleteAttribute("normal")
  return [lagNormal(g)]
}

function retta(mesh, retning) {
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(retning || [0, 0, 1]).normalize())
  return mesh
}

function lagUtstyr(u) {
  const g = new THREE.Group()
  const farge = (std) => new THREE.Color(u.farge || std)
  const vanleg = (std, ru) => new THREE.MeshStandardMaterial({ color: farge(std), roughness: u.ru ?? ru, metalness: u.metall ? 0.6 : 0 })
  let lys = null
  if (u.slag === "paere") {
    const d = u.diameter || 60
    const r = d / 2
    const L = u.lengd || 105
    const bR = Math.min(13.5, r * 0.5)
    const bL = Math.min(26, L * 0.25)
    const hals = L - r - bL
    const pkt = []
    const a1 = (118 * Math.PI) / 180
    for (let i = 0; i <= 26; i++) {
      const a = (a1 * i) / 26
      pkt.push(new THREE.Vector2(Math.max(r * Math.sin(a), 0.001), -r * Math.cos(a)))
    }
    const p0 = pkt[pkt.length - 1]
    const stig = -Math.tan(a1) * 1
    const dy = hals - p0.y
    for (let i = 1; i <= 14; i++) {
      const s = i / 14
      const h00 = 2 * s * s * s - 3 * s * s + 1
      const h10 = s * s * s - 2 * s * s + s
      const h01 = -2 * s * s * s + 3 * s * s
      const h11 = s * s * s - s * s
      const x = h00 * p0.x + h10 * (dy / stig) * -1 * 0.9 + h01 * bR + h11 * 0
      pkt.push(new THREE.Vector2(Math.max(x, bR), p0.y + dy * s))
    }
    const glas = new THREE.Mesh(
      new THREE.LatheGeometry(pkt, 48),
      new THREE.MeshStandardMaterial({ color: "#fdfbf6", roughness: 0.5, emissive: new THREE.Color(u.farge || "#ffd9a8"), emissiveIntensity: 0.1 }),
    )
    glas.userData.glas = true
    const sokkel = new THREE.Mesh(new THREE.CylinderGeometry(bR, bR, bL, 32), new THREE.MeshStandardMaterial({ color: "#b9b4aa", roughness: 0.35, metalness: 0.3 }))
    sokkel.position.y = hals + bL / 2
    const inni = new THREE.Group()
    inni.add(glas, sokkel)
    retta(inni, u.retning)
    inni.position.copy(v3(u.senter))
    g.add(inni)
    lys = { punkt: v3(u.senter), radius: u.lysradius ?? r * 0.3, farge: u.farge || "#ffcf9a", styrke: u.styrke || 1 }
  } else if (u.slag === "sokkel" || u.slag === "sylinder") {
    const d = u.diameter || 40
    const L = u.lengd || 55
    const m = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, L, 40), vanleg(u.slag === "sokkel" ? "#1e1e20" : "#8d8a85", 0.45))
    retta(m, u.retning)
    m.position.copy(v3(u.senter))
    g.add(m)
  } else if (u.slag === "leidning") {
    const p = u.punkt.map(v3)
    const kurve = p.length === 2 ? new THREE.LineCurve3(p[0], p[1]) : new THREE.CatmullRomCurve3(p, false, "centripetal")
    const lengd = kurve.getLength()
    const m = new THREE.Mesh(new THREE.TubeGeometry(kurve, Math.max(4, Math.min(400, Math.round(lengd / 6))), (u.diameter || 6) / 2, 12, false), vanleg("#1b1b1c", 0.7))
    m.userData.leidning = kurve
    g.add(m)
  } else if (u.slag === "boks") {
    const s = u.storleik || [20, 20, 20]
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), vanleg("#8d8a85", 0.5))
    if (u.matrise) {
      m.matrixAutoUpdate = false
      m.matrix.fromArray(u.matrise)
    } else m.position.copy(v3(u.senter))
    g.add(m)
  } else if (u.slag === "kule") {
    const m = new THREE.Mesh(new THREE.SphereGeometry((u.diameter || 20) / 2, 40, 24), vanleg("#8d8a85", 0.4))
    m.position.copy(v3(u.senter))
    g.add(m)
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.userData.glas
      o.receiveShadow = !o.userData.glas
    }
  })
  return { g, lys }
}

function boksAv(objekt, utanLeidning) {
  const b = new THREE.Box3()
  const pkt = []
  for (const o of objekt) {
    o.updateWorldMatrix(true, true)
    o.traverse((m) => {
      if (!m.isMesh) return
      if (utanLeidning && m.userData.leidning) return
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
      const bb = m.geometry.boundingBox
      for (let i = 0; i < 8; i++) {
        const q = new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld)
        pkt.push(q)
        b.expandByPoint(q)
      }
    })
  }
  return { b, pkt }
}

function hjornePunkt(m, ut) {
  const p = m.geometry.getAttribute("position")
  const steg = Math.max(1, Math.floor(p.count / 3000))
  for (let i = 0; i < p.count; i += steg) ut.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld))
}

async function bygg(sc) {
  if (!R.renderer) {
    R.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" })
    R.renderer.setPixelRatio(1)
    R.renderer.autoClear = false
    R.renderer.shadowMap.enabled = true
    R.renderer.shadowMap.type = THREE.PCFShadowMap
    R.renderer.toneMapping = THREE.NoToneMapping
    R.renderer.setClearColor(0x000000, 0)
    document.body.appendChild(R.renderer.domElement)
    R.kvadKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const kvad = new THREE.PlaneGeometry(2, 2)
    R.legg = new THREE.ShaderMaterial({
      uniforms: { kart: { value: null }, vekt: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: "uniform sampler2D kart; uniform float vekt; varying vec2 vUv; void main(){ gl_FragColor = texture2D(kart, vUv) * vekt; }",
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
    R.leggScene = new THREE.Scene()
    R.leggScene.add(new THREE.Mesh(kvad, R.legg))
    R.slutt = new THREE.ShaderMaterial({
      uniforms: { kart: { value: null }, b0: { value: new THREE.Vector3() }, b1: { value: new THREE.Vector3() }, eksp: { value: 1 }, film: { value: 0 }, sentrum: { value: new THREE.Vector2(0.5, 0.45) } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `
        uniform sampler2D kart; uniform vec3 b0; uniform vec3 b1; uniform float eksp; uniform float film; uniform vec2 sentrum; varying vec2 vUv;
        vec3 noytral(vec3 c){
          float x = min(c.r, min(c.g, c.b));
          float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
          c -= off;
          float topp = max(c.r, max(c.g, c.b));
          if (topp < 0.76) return c;
          float d = 0.24;
          float ny = 1. - d * d / (topp + d - 0.76);
          c *= ny / topp;
          float g = 1. - 1. / (0.15 * (topp - ny) + 1.);
          return mix(c, vec3(ny), g);
        }
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
        vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.)), vec3(1. / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
        float stoy(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec4 s = texture2D(kart, vUv);
          float a = clamp(s.a, 0., 1.);
          vec3 c = a > 1e-4 ? s.rgb / a : vec3(0.);
          c *= eksp;
          c = film > 0.5 ? aces(c) : noytral(c);
          c = srgb(clamp(c, 0., 1.));
          float r = length((vUv - sentrum) * vec2(1., 1.15));
          vec3 bak = mix(b0, b1, smoothstep(0.05, 0.85, r));
          vec3 ut = mix(bak, c, a);
          gl_FragColor = vec4(ut, 1.);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    R.sluttScene = new THREE.Scene()
    R.sluttScene.add(new THREE.Mesh(kvad, R.slutt))
  }
  for (const k of Object.keys(S)) delete S[k]
  S.sc = sc
  S.scene = new THREE.Scene()
  S.rot = new THREE.Group()
  if (sc.opp === "y") S.rot.rotation.x = Math.PI / 2
  S.scene.add(S.rot)
  S.delar = []
  let rader = (sc.deler || sc.delar || []).slice()
  if (sc.glb) {
    const fraGlb = await lastGlb(sc.glb, sc.eining, sc.glbOpp)
    rader = rader.concat(fraGlb.map((r) => ({ namn: r.namn, tjukn: sc.tjukn, material: sc.material, boygd: { nett: r.a } })))
  }
  rader.forEach((d, i) => {
    const namn = d.namn ?? d.adr ?? "del" + (i + 1)
    const t = d.tjukn || sc.tjukn || 3
    const st = stoffFor(d.material || sc.material || "bjork", d.farge, i)
    const k = d.boygd?.krumming ?? d.krumming ?? 0
    let geo
    let flat = false
    let riss = null
    if (d.boygd?.nett) geo = soupGeo(d.boygd.nett, d.tjukn || sc.tjukn)
    else {
      const om = reinsk(d.omriss || [])
      if (om.length < 3) return
      const hol = (d.hol || []).map(reinsk).filter((h) => h.length >= 3)
      if (k) geo = boygGeo(om, hol, t, k)
      else {
        geo = plateGeo(om, hol, t)
        flat = true
        riss = { om, hol }
      }
    }
    const fro = slump(i * 31 + 7)
    const uv = geo.getAttribute("uv")
    if (uv) {
      const du = fro() * 400
      const dv = fro() * 400
      for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) + du, uv.getY(j) + dv)
    }
    const m = new THREE.Mesh(geo, [st.flate, st.kant])
    let spegl = null
    if (st.spegl) {
      spegl = []
      if (flat) {
        const side = d.speglSide === 1 || d.speglSide === -1 ? d.speglSide : 0
        const lok = geo.groups.find((q) => q.materialIndex === 0)
        const pz = geo.getAttribute("position")
        let nBak = 0
        while (nBak < lok.count && pz.getZ(lok.start + nBak) < t / 2) nBak++
        for (let j = nBak; j < lok.count; j++) if (pz.getZ(lok.start + j) < t / 2) throw new Error("lokket i ExtrudeGeometry har endra seg")
        const kantar = geo.groups.filter((q) => q.materialIndex !== 0)
        geo.clearGroups()
        const legg = (start, tal, sn, w) => {
          if (side !== 0 && side !== sn) return geo.addGroup(start, tal, 0)
          const q = { idx: m.material.length, sn, w, plan: speglPlanStoff(), reserve: speglReserve() }
          m.material.push(q.reserve)
          spegl.push(q)
          geo.addGroup(start, tal, q.idx)
        }
        legg(lok.start, nBak, -1, 0)
        legg(lok.start + nBak, lok.count - nBak, 1, t)
        for (const q of kantar) geo.addGroup(q.start, q.count, q.materialIndex)
      } else {
        const q = { idx: 0, reserve: speglReserve() }
        m.material[0] = q.reserve
        spegl.push(q)
      }
    }
    if (!d.boygd?.nett && d.matrise) {
      m.matrixAutoUpdate = false
      m.matrix.fromArray(d.matrise)
    }
    m.castShadow = true
    m.receiveShadow = true
    if (d.rille?.length && !d.boygd?.nett) {
      const h = t / 2
      const bog = (u, v, w) => {
        if (!k) return [u, v, w]
        const a = k * u
        const off = w - h
        return [Math.sin(a) / k - off * Math.sin(a), v, h + (1 - Math.cos(a)) / k + off * Math.cos(a)]
      }
      const pkt = []
      for (const linje of d.rille) {
        for (let j = 0; j + 1 < linje.length; j++) {
          for (const w of [-0.06, t + 0.06]) pkt.push(...bog(linje[j][0], linje[j][1], w), ...bog(linje[j + 1][0], linje[j + 1][1], w))
        }
      }
      const lg = new THREE.BufferGeometry()
      lg.setAttribute("position", new THREE.Float32BufferAttribute(pkt, 3))
      m.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: st.kant.color, transparent: true, opacity: 0.75 })))
    }
    const g = new THREE.Group()
    g.add(m)
    S.rot.add(g)
    S.delar.push({ namn, g, m, gjennom: st.gjennom, flat, t, ekstra: !!d.ekstra, spegl, riss })
  })
  S.utstyr = []
  S.lyskjelder = []
  for (const u of sc.utstyr || []) {
    const { g, lys } = lagUtstyr(u)
    S.rot.add(g)
    S.utstyr.push(g)
    if (lys) S.lyskjelder.push(lys)
  }
  const ekstra = sc.lys ? (Array.isArray(sc.lys) ? sc.lys : [sc.lys]) : []
  for (const l of ekstra) S.lyskjelder.push({ punkt: v3(l.punkt), radius: l.radius ?? 8, farge: l.farge || "#ffcf9a", styrke: l.styrke || 1 })
  const delBoks = boksAv(S.delar.map((d) => d.g))
  const utBoks = boksAv(S.utstyr, true)
  S.boks = delBoks.b.clone()
  if (S.boks.isEmpty()) S.boks.union(utBoks.b)
  S.alt = delBoks.b.clone().union(utBoks.b)
  if (S.alt.isEmpty()) S.alt.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 100))
  if (S.boks.isEmpty()) S.boks.copy(S.alt)
  const mal = S.boks.getSize(new THREE.Vector3())
  S.mal = mal
  S.storleik = Math.max(mal.x, mal.y, mal.z, 1)
  S.sentrum = S.boks.getCenter(new THREE.Vector3())
  if (!S.lyskjelder.length) S.lyskjelder.push({ punkt: S.sentrum.clone(), radius: 10, farge: "#ffcf9a", styrke: 1 })
  S.opp = new THREE.Vector3(0, 0, 1)
  const vegg = sc.vegg ? (sc.vegg === true ? {} : sc.vegg) : null
  const verd = (a) => v3(a).applyQuaternion(S.rot.quaternion)
  S.verd = verd
  S.fram = vegg?.normal ? verd(vegg.normal).normalize() : sc.fram ? verd(sc.fram).normalize() : new THREE.Vector3(0, -1, 0)
  S.fram.z = 0
  S.fram.normalize()
  S.hogre = new THREE.Vector3().crossVectors(S.opp, S.fram).normalize()
  const heng = sc.heng !== undefined && sc.heng !== null && sc.heng !== false ? (typeof sc.heng === "number" ? { tak: sc.heng } : sc.heng) : null
  S.heng = heng
  S.vegg = vegg
  S.golvZ = typeof sc.golv === "number" ? sc.golv : heng || vegg ? null : S.alt.min.z
  await byggKontekst()
  byggLjos()
  if (sc.kropp) {
    try {
      const geoar = await lastKropp(sc.kropp)
      S.kropp = new THREE.Group()
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { farge: { value: new THREE.Color("#5d7aa6") } },
        vertexShader: "varying vec3 n; varying vec3 p; void main(){ n = normalize(normalMatrix * normal); vec4 q = modelViewMatrix * vec4(position, 1.); p = q.xyz; gl_Position = projectionMatrix * q; }",
        fragmentShader: "uniform vec3 farge; varying vec3 n; varying vec3 p; void main(){ float f = 1. - abs(dot(normalize(n), normalize(-p))); gl_FragColor = vec4(farge, 0.035 + 0.36 * f * f); }",
      })
      for (const g of geoar) S.kropp.add(new THREE.Mesh(g, mat))
      S.kropp.renderOrder = 5
      S.rot.add(S.kropp)
    } catch (e) {
      console.warn("kropp: " + e.message)
    }
  }
  spreng()
  return {
    delar: S.delar.length,
    boks: { min: S.boks.min.toArray(), max: S.boks.max.toArray() },
    mal: mal.toArray().map((x) => Math.round(x)),
    lyskjelder: S.lyskjelder.length,
    speglflater: S.delar.reduce((n, d) => n + (d.spegl?.length ?? 0), 0),
    ukjende: S.ukjende,
    trekantar: S.delar.reduce((s, d) => s + d.m.geometry.getAttribute("position").count / 3, 0),
  }
}

async function byggKontekst() {
  const sc = S.sc
  const stor = 60000
  S.kontekst = new THREE.Group()
  S.scene.add(S.kontekst)
  const romStoff = new THREE.MeshLambertMaterial({ color: "#d8d2c8" })
  const flakStoff = new THREE.MeshStandardMaterial({ color: "#efebe5", roughness: 0.97, metalness: 0 })
  const plan = (punkt, normal, stoff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(stor, stor), stoff)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    m.position.copy(punkt)
    m.receiveShadow = true
    m.userData.normal = normal.clone()
    m.userData.punkt = punkt.clone()
    S.kontekst.add(m)
    return m
  }
  const c = S.sentrum
  const golvZ = S.golvZ
  const fang = new THREE.ShadowMaterial({ opacity: 0.88, depthWrite: false })
  S.fangVekt = { value: [0.5, 0.5] }
  fang.onBeforeCompile = (sh) => {
    sh.uniforms.vekt = S.fangVekt
    const fra = "shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;"
    const til = "shadow -= vekt[ i ] * ( 1.0 - getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) );"
    const chunk = THREE.ShaderChunk.shadowmask_pars_fragment
    if (!chunk.includes(fra)) throw new Error("shadowmask-chunken har endra seg")
    sh.fragmentShader = "uniform float vekt[ 2 ];\n" + sh.fragmentShader.replace("#include <shadowmask_pars_fragment>", chunk.replace(fra, til))
  }
  fang.customProgramCacheKey = () => "fang"
  S.golvFang = plan(new THREE.Vector3(c.x, c.y, golvZ ?? 0), S.opp, fang)
  S.golvFang.renderOrder = -10
  const romGolvZ = golvZ ?? S.alt.min.z - (sc.golvAvstand ?? 1.1 * S.storleik)
  S.golvRom = plan(new THREE.Vector3(c.x, c.y, romGolvZ), S.opp, romStoff)
  S.romGolvZ = romGolvZ
  const f = S.fram
  let veggPunkt
  if (S.vegg?.punkt) veggPunkt = S.verd(S.vegg.punkt)
  else {
    let bak = Infinity
    const b = S.alt
    for (let i = 0; i < 8; i++) bak = Math.min(bak, new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).dot(f))
    const luft = S.vegg ? 0 : (sc.veggAvstand ?? 0.75 * S.storleik)
    veggPunkt = c.clone().addScaledVector(f, bak - luft - c.dot(f))
  }
  S.veggPunkt = veggPunkt
  S.veggRom = plan(veggPunkt, f, romStoff)
  if (S.vegg) {
    const a = S.hogre
    const b = S.opp
    let u0 = Infinity
    let u1 = -Infinity
    let w0 = Infinity
    let w1 = -Infinity
    const bx = S.alt
    for (let i = 0; i < 8; i++) {
      const q = new THREE.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).sub(veggPunkt)
      u0 = Math.min(u0, q.dot(a))
      u1 = Math.max(u1, q.dot(a))
      w0 = Math.min(w0, q.dot(b))
      w1 = Math.max(w1, q.dot(b))
    }
    const marg = 0.55 * S.storleik
    const rr = 0.06 * S.storleik
    u0 -= marg
    u1 += marg
    w0 -= marg
    w1 += marg
    const sh = new THREE.Shape()
    sh.moveTo(u0 + rr, w0)
    sh.lineTo(u1 - rr, w0)
    sh.quadraticCurveTo(u1, w0, u1, w0 + rr)
    sh.lineTo(u1, w1 - rr)
    sh.quadraticCurveTo(u1, w1, u1 - rr, w1)
    sh.lineTo(u0 + rr, w1)
    sh.quadraticCurveTo(u0, w1, u0, w1 - rr)
    sh.lineTo(u0, w0 + rr)
    sh.quadraticCurveTo(u0, w0, u0 + rr, w0)
    const tj = Math.max(10, 0.04 * S.storleik)
    const geo = new THREE.ExtrudeGeometry(sh, { depth: tj, bevelEnabled: false, curveSegments: 10 })
    geo.translate(0, 0, -tj)
    const m = new THREE.Mesh(geo, flakStoff)
    m.matrixAutoUpdate = false
    m.matrix.makeBasis(a, b, f).setPosition(veggPunkt)
    m.receiveShadow = true
    m.userData.normal = f.clone()
    m.userData.punkt = veggPunkt.clone()
    S.kontekst.add(m)
    S.veggFlak = m
  }
  if (S.heng) {
    const tak = S.heng.tak ?? S.alt.max.z + 1.2 * S.storleik
    const feste = S.heng.feste ? S.verd(S.heng.feste) : new THREE.Vector3(c.x, c.y, S.alt.max.z)
    S.takZ = tak
    S.feste = feste
    const ned = new THREE.Vector3(0, 0, -1)
    S.takRom = plan(new THREE.Vector3(feste.x, feste.y, tak), ned, romStoff)
    const horis = Math.max(S.mal.x, S.mal.y)
    const rad = 0.5 * horis + 0.45 * S.storleik
    const tj = Math.max(10, 0.04 * S.storleik)
    const flak = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, tj, 96), new THREE.MeshBasicMaterial({ color: "#e9e5df" }))
    flak.rotation.x = Math.PI / 2
    flak.position.set(feste.x, feste.y, tak + tj / 2)
    flak.userData.normal = ned
    flak.userData.punkt = new THREE.Vector3(feste.x, feste.y, tak)
    S.kontekst.add(flak)
    S.takFlak = flak
    const kvit = new THREE.MeshStandardMaterial({ color: S.heng.farge || "#1c1c1d", roughness: 0.6 })
    const ros = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 24, 48), kvit)
    ros.rotation.x = Math.PI / 2
    ros.position.set(feste.x, feste.y, tak - 12)
    ros.castShadow = true
    ros.userData.kontekst = true
    S.scene.add(ros)
    S.rosett = ros
    if (S.heng.leidning !== false) {
      const dia = typeof S.heng.leidning === "number" ? S.heng.leidning : 6
      const kurve = new THREE.LineCurve3(feste.clone(), new THREE.Vector3(feste.x, feste.y, tak - 20))
      const snor = new THREE.Mesh(new THREE.TubeGeometry(kurve, 4, dia / 2, 12, false), kvit)
      snor.castShadow = true
      snor.userData.leidning = kurve
      S.scene.add(snor)
      S.snor = snor
    }
  }
}

function glodKart() {
  if (R.glod) return R.glod
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const g = c.getContext("2d")
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, "rgba(255,255,255,0.55)")
  gr.addColorStop(0.18, "rgba(255,255,255,0.22)")
  gr.addColorStop(0.45, "rgba(255,255,255,0.07)")
  gr.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  R.glod = new THREE.CanvasTexture(c)
  R.glod.colorSpace = THREE.SRGBColorSpace
  return R.glod
}

function byggLjos() {
  const retn = (farge, styrke) => {
    const l = new THREE.DirectionalLight(farge, styrke)
    l.castShadow = true
    l.shadow.bias = -0.00006
    l.shadow.normalBias = 0.35
    l.shadow.radius = 2
    S.scene.add(l, l.target)
    return l
  }
  S.nokkel = retn("#fff4e6", 2.7)
  S.kuppel = retn("#f3f5ff", 2.3)
  S.fyll = new THREE.HemisphereLight("#ffffff", "#b3ada3", 0.85)
  S.fyll.position.set(0, 0, 1)
  S.scene.add(S.fyll)
  S.natt = new THREE.HemisphereLight("#a9b9d8", "#6a5a48", 0.16)
  S.natt.position.set(0, 0, 1)
  S.scene.add(S.natt)
  S.atterkast = []
  for (let i = 0; i < (S.sc.atterkastTal ?? 3); i++) {
    const l = new THREE.SpotLight("#ffffff", 0, 0, (72 * Math.PI) / 180, 1, 2)
    l.castShadow = true
    l.shadow.mapSize.set(512, 512)
    l.shadow.camera.near = 3
    l.shadow.camera.far = 6000
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.5
    l.shadow.radius = 2
    S.scene.add(l, l.target)
    S.atterkast.push(l)
  }
  S.straale = new THREE.Raycaster()
  S.paerer = S.lyskjelder.slice(0, 3).map((k) => {
    const l = new THREE.PointLight(k.farge, 1, 0, 2)
    l.castShadow = true
    l.shadow.bias = -0.0002
    l.shadow.normalBias = 0.3
    l.shadow.radius = 2.5
    l.position.copy(k.punkt)
    const atter = new THREE.PointLight(k.farge, 1, 0, 2)
    atter.position.copy(k.punkt)
    const glod = new THREE.Sprite(new THREE.SpriteMaterial({ map: glodKart(), color: new THREE.Color(k.farge).multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    glod.position.copy(k.punkt)
    glod.scale.setScalar(Math.max(k.radius * 16, 0.5 * S.storleik))
    glod.renderOrder = 20
    S.rot.add(l, atter, glod)
    return { l, k, atter, glod }
  })
}

function spreng() {
  const sc = S.sc
  const fak = sc.sprengAvstand ?? 1
  S.ukjende = []
  const C = S.sentrum
  const etter = new Map(S.delar.map((d) => [String(d.namn), d]))
  const utstrekning = (namn, r) => {
    let lengst = 0
    for (const n of namn) {
      const d = etter.get(String(n))
      if (!d) continue
      d.m.updateWorldMatrix(true, false)
      if (!d.m.geometry.boundingBox) d.m.geometry.computeBoundingBox()
      const bb = d.m.geometry.boundingBox
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < 8; i++) {
        const q = new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(d.m.matrix).dot(r)
        lo = Math.min(lo, q)
        hi = Math.max(hi, q)
      }
      lengst = Math.max(lengst, hi - lo)
    }
    return lengst
  }
  const steg = sc.steg || sc.orden
  const off = new Map()
  if (steg && steg.length) {
    const sett = []
    steg.forEach((s, i) => {
      const r = s.retning ? v3(s.retning).normalize() : null
      const nk = s.steg ?? "i" + i
      let rang = 0
      if (r) {
        const sedd = new Set()
        for (const q of sett) if (q.r.dot(r) > 0.95 && q.nk !== nk) sedd.add(q.nk)
        rang = sedd.size
        sett.push({ r, nk })
      }
      const D = r ? fak * (0.55 * utstrekning(s.delar || [], r) + 0.28 * S.storleik) : 0
      for (const namn of s.delar || []) {
        off.set(String(namn), r ? r.clone().multiplyScalar(-D * (1 + 0.55 * rang)) : new THREE.Vector3())
        if (!etter.has(String(namn))) S.ukjende.push(String(namn))
      }
    })
  }
  for (const d of S.delar) {
    let o = off.get(String(d.namn))
    if (!o) {
      if (steg && steg.length) o = new THREE.Vector3()
      else {
        d.m.updateWorldMatrix(true, false)
        if (!d.m.geometry.boundingBox) d.m.geometry.computeBoundingBox()
        const c = d.m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(d.m.matrixWorld)
        o = c.sub(C).multiplyScalar(0.95 * fak)
        if (S.vegg) {
          const inn = o.dot(S.fram)
          o.addScaledVector(S.fram, Math.max(0, -inn) + (c.clone().add(C).sub(S.veggPunkt).dot(S.fram) > 0.02 * S.storleik ? 0.25 * S.storleik * fak : 0))
        }
        o.applyQuaternion(S.rot.quaternion.clone().invert())
      }
    }
    d.sprengt = o
  }
}

function stillSprengt(paa) {
  if (S.strekar) {
    S.scene.remove(S.strekar)
    S.strekar.geometry.dispose()
    S.strekar = null
  }
  const pkt = []
  for (const d of S.delar) {
    d.g.position.copy(paa ? d.sprengt : new THREE.Vector3())
    if (paa && d.sprengt.lengthSq() > 1) {
      d.g.updateWorldMatrix(true, true)
      if (!d.m.geometry.boundingBox) d.m.geometry.computeBoundingBox()
      const c = d.m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(d.m.matrixWorld)
      const heim = c.clone().sub(d.sprengt.clone().applyQuaternion(S.rot.quaternion))
      pkt.push(c, heim)
    }
  }
  if (paa && pkt.length) {
    const g = new THREE.BufferGeometry().setFromPoints(pkt)
    S.strekar = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: "#3d3530", dashSize: 0.02 * S.storleik, gapSize: 0.014 * S.storleik, transparent: true, opacity: 0.55 }))
    S.strekar.computeLineDistances()
    S.scene.add(S.strekar)
  }
}

function passPunkt(medSnor, utanLeidning) {
  const pkt = []
  for (const d of S.delar) {
    d.g.updateWorldMatrix(true, true)
    hjornePunkt(d.m, pkt)
  }
  const b = new THREE.Box3().setFromPoints(pkt.length ? pkt : [S.alt.min, S.alt.max])
  const lim = b.clone().expandByScalar(0.28 * S.storleik)
  for (const u of S.utstyr) {
    u.updateWorldMatrix(true, true)
    u.traverse((m) => {
      if (!m.isMesh) return
      if (m.userData.leidning) {
        if (utanLeidning) return
        for (const q of m.userData.leidning.getPoints(60)) {
          const w = q.clone().applyMatrix4(m.matrixWorld)
          if (lim.containsPoint(w)) pkt.push(w)
        }
      } else hjornePunkt(m, pkt)
    })
  }
  if (medSnor && S.snor) {
    for (const q of S.snor.userData.leidning.getPoints(40)) if (lim.containsPoint(q)) pkt.push(q.clone())
  }
  if (!pkt.length) pkt.push(S.alt.min.clone(), S.alt.max.clone())
  return pkt
}

function stillKamera(namn, b, h, pkt) {
  const v = { ...SYN[namn], ...(S.sc.kamera?.[namn] || {}) }
  if (S.sc.kamera?.[namn]?.el !== undefined) v.elHeng = v.el
  const el = ((S.heng && v.elHeng !== undefined ? v.elHeng : v.el) * Math.PI) / 180
  const az = ((v.az || 0) * Math.PI) / 180
  const dir = new THREE.Vector3()
  const oppK = S.opp.clone()
  if (Math.abs(v.el) === 90) {
    dir.copy(S.opp).multiplyScalar(Math.sign(v.el))
    oppK.copy(S.fram).multiplyScalar(v.el > 0 ? -1 : 1)
  } else {
    dir.copy(S.fram).multiplyScalar(Math.cos(az) * Math.cos(el)).addScaledVector(S.hogre, Math.sin(az) * Math.cos(el)).addScaledVector(S.opp, Math.sin(el))
  }
  const hog = new THREE.Vector3().crossVectors(oppK, dir).normalize()
  const op = new THREE.Vector3().crossVectors(dir, hog).normalize()
  const liten = ((v.linse || 37.8) * Math.PI) / 180
  const asp = b / h
  const tY = asp >= 1 ? Math.tan(liten / 2) : Math.tan(liten / 2) / asp
  const tX = tY * asp
  const marg = namn === "sprengt" ? 0.07 : 0.1
  const TX = tX * (1 - 2 * marg)
  const TY = tY * (1 - 2 * marg)
  let ax = -Infinity
  let bx = -Infinity
  let ay = -Infinity
  let by = -Infinity
  for (const p of pkt) {
    const x = p.dot(hog)
    const y = p.dot(op)
    const s = p.dot(dir)
    ax = Math.max(ax, s + x / TX)
    bx = Math.max(bx, s - x / TX)
    ay = Math.max(ay, s + y / TY)
    by = Math.max(by, s - y / TY)
  }
  const cx = ((ax - bx) * TX) / 2
  const cy = ((ay - by) * TY) / 2
  let d = Math.max((ax + bx) / 2, (ay + by) / 2)
  const vid = v.vid || 1
  const mal = new THREE.Vector3().addScaledVector(hog, cx).addScaledVector(op, cy)
  let sMid = 0
  for (const p of pkt) sMid += p.dot(dir)
  sMid /= pkt.length
  mal.addScaledVector(dir, sMid)
  const avstand = (d - sMid) * vid
  const kam = new THREE.PerspectiveCamera((2 * Math.atan(tY) * 180) / Math.PI, asp, Math.max(2, avstand * 0.04), avstand * 60 + 20000)
  kam.up.copy(op)
  kam.position.copy(mal).addScaledVector(dir, avstand)
  kam.lookAt(mal)
  kam.updateMatrixWorld(true)
  S.kam = kam
  S.kamMal = mal.clone()
  S.kamHog = hog.clone()
  S.kamDir = dir
  S.kamAz = az
  const ramme = [Infinity, -Infinity, Infinity, -Infinity]
  const q = new THREE.Vector3()
  for (const p of pkt) {
    q.copy(p).project(kam)
    ramme[0] = Math.min(ramme[0], q.x)
    ramme[1] = Math.max(ramme[1], q.x)
    ramme[2] = Math.min(ramme[2], q.y)
    ramme[3] = Math.max(ramme[3], q.y)
  }
  return ramme.map((x) => Math.round(x * 100) / 100)
}

function synleg(namn) {
  const lys = namn === "lys"
  const kamPos = S.kam.position
  const framfor = (m) => m.userData.normal.dot(kamPos.clone().sub(m.userData.punkt)) > 0
  S.golvFang.visible = !lys && S.golvZ !== null && namn !== "under"
  if (namn === "sprengt" && S.golvFang.visible) {
    let z = S.golvZ
    for (const d of S.delar) {
      d.g.updateWorldMatrix(true, true)
      const bb = new THREE.Box3().setFromObject(d.g)
      z = Math.min(z, bb.min.z)
    }
    S.golvFang.position.z = z
  } else if (S.golvZ !== null) S.golvFang.position.z = S.golvZ
  S.golvRom.visible = lys && framfor(S.golvRom)
  S.veggRom.visible = lys && framfor(S.veggRom)
  if (S.veggFlak) S.veggFlak.visible = !lys && framfor(S.veggFlak)
  if (S.takRom) S.takRom.visible = lys && framfor(S.takRom)
  if (S.takFlak) S.takFlak.visible = !lys && namn !== "under" && framfor(S.takFlak)
  if (S.rosett) S.rosett.visible = S.takFlak.visible || (lys && S.takRom.visible)
  if (S.kropp) S.kropp.visible = !lys && namn !== "sprengt" && S.sc.kroppSyn !== false
  S.nokkel.visible = !lys
  S.kuppel.visible = !lys
  S.fyll.visible = !lys
  S.natt.visible = lys
  for (const p of S.paerer) p.l.visible = p.atter.visible = p.glod.visible = lys
  for (const l of S.atterkast) l.visible = lys
  if (lys) {
    S.treff = []
    S.scene.updateMatrixWorld(true)
    for (const d of S.delar) S.treff.push(d.m)
    for (const u of S.utstyr) u.traverse((m) => m.isMesh && !m.userData.glas && S.treff.push(m))
    for (const m of [S.golvRom, S.veggRom, S.takRom, S.snor, S.rosett]) if (m && m.visible) S.treff.push(m)
  }
  for (const d of S.delar) d.m.castShadow = !(lys && d.gjennom)
  for (const u of S.utstyr)
    u.traverse((m) => {
      if (m.userData.glas) m.material.emissiveIntensity = lys ? 9 : 0.1
    })
}

function stillRigg(namn, pkt, kart) {
  const kule = new THREE.Sphere().setFromPoints(pkt)
  const c = kule.center
  const Rr = Math.max(kule.radius, 10)
  S.rigg = { c, Rr, namn, kart }
  if (namn !== "lys") {
    for (const l of [S.nokkel, S.kuppel]) {
      const k = l.shadow.camera
      k.left = k.bottom = -Rr * 1.04
      k.right = k.top = Rr * 1.04
      k.near = Rr * 0.5
      k.far = Rr * 16
      k.updateProjectionMatrix()
      l.shadow.mapSize.set(kart, kart)
      l.shadow.normalBias = Math.max(0.12, (1.1 * 2.08 * Rr) / kart)
      if (l.shadow.map) {
        l.shadow.map.dispose()
        l.shadow.map = null
      }
      l.target.position.copy(c)
      l.target.updateMatrixWorld()
    }
    const under = namn === "under"
    const topp = namn === "topp"
    const azK = topp || under ? (-40 * Math.PI) / 180 : S.kamAz - (48 * Math.PI) / 180
    const elK = ((topp ? 58 : under ? -38 : 46) * Math.PI) / 180
    S.rigg.nokkelDir = new THREE.Vector3()
      .addScaledVector(S.fram, Math.cos(azK) * Math.cos(elK))
      .addScaledVector(S.hogre, Math.sin(azK) * Math.cos(elK))
      .addScaledVector(S.opp, Math.sin(elK))
      .normalize()
    S.rigg.under = under
    S.fyll.position.set(0, 0, under ? -1 : 1)
  } else {
    let langt = 0
    for (const p of S.paerer) {
      const pos = p.l.getWorldPosition(new THREE.Vector3())
      const dv = Math.abs(pos.clone().sub(S.veggPunkt).dot(S.fram))
      const dg = Math.abs(pos.z - S.romGolvZ)
      const dt = S.takZ !== undefined ? Math.abs(S.takZ - pos.z) : Infinity
      const naer = Math.max(Math.min(dv, dg, dt), 0.4 * S.storleik)
      const ref = Math.sqrt(naer * Math.max(dv, naer))
      p.l.intensity = ((S.sc.lysstyrke ?? 1) * p.k.styrke * 2.1 * ref * ref) / S.paerer.length
      p.atter.intensity = p.l.intensity * (S.sc.atterskin ?? 0.015)
      p.l.shadow.mapSize.set(Math.min(kart, 1024), Math.min(kart, 1024))
      if (p.l.shadow.map) {
        p.l.shadow.map.dispose()
        p.l.shadow.map = null
      }
      p.l.shadow.camera.near = 1
      p.l.shadow.camera.far = Math.max(2500, 8 * S.storleik)
      p.l.shadow.camera.updateProjectionMatrix()
      p.heim = p.k.punkt.clone()
      langt = Math.max(langt, dv)
    }
  }
}

function prove(i, n) {
  const g = S.rigg
  const a1 = 0.7548776662466927
  const a2 = 0.5698402909980532
  if (g.namn !== "lys") {
    const u = brok(0.5 + (i + 1) * a1)
    const w = brok(0.5 + (i + 1) * a2)
    const rad = Math.tan((6 * Math.PI) / 180) * Math.sqrt(u)
    const fi = 2 * Math.PI * w
    const t1 = new THREE.Vector3().crossVectors(g.nokkelDir, S.opp).normalize()
    const t2 = new THREE.Vector3().crossVectors(g.nokkelDir, t1).normalize()
    const dk = g.nokkelDir.clone().addScaledVector(t1, rad * Math.cos(fi)).addScaledVector(t2, rad * Math.sin(fi)).normalize()
    S.nokkel.position.copy(g.c).addScaledVector(dk, g.Rr * 3)
    const u2 = brok(0.13 + (i + 1) * a2)
    const w2 = brok(0.71 + (i + 1) * a1)
    const z = 0.22 + 0.78 * u2
    const s = Math.sqrt(1 - z * z)
    const fi2 = 2 * Math.PI * w2
    const dd = new THREE.Vector3(s * Math.cos(fi2), s * Math.sin(fi2), g.under ? -z : z)
    S.kuppel.position.copy(g.c).addScaledVector(dd, g.Rr * 3)
    const sum = S.nokkel.intensity * Math.max(g.nokkelDir.z, 0) + S.kuppel.intensity * 0.61 + S.fyll.intensity
    S.fangVekt.value[0] = (S.nokkel.intensity * Math.max(dk.z, 0)) / sum
    S.fangVekt.value[1] = (S.kuppel.intensity * Math.max(dd.z, 0)) / sum
  } else {
    for (const p of S.paerer) {
      const x = halton(i + 1, 2) * 2 - 1
      const y = halton(i + 1, 3) * 2 - 1
      const z = halton(i + 1, 5) * 2 - 1
      const q = new THREE.Vector3(x, y, z)
      if (q.length() > 1) q.multiplyScalar(0.6)
      p.l.position.copy(p.heim).addScaledVector(q, n > 1 ? p.k.radius : 0)
    }
    const K = S.atterkast.length
    let sumI = 0
    for (const p of S.paerer) sumI += p.l.intensity
    const kast = S.sc.atterkast ?? 1
    S.atterkast.forEach((l, j) => {
      const nr = i * K + j + 1
      const p = S.paerer[nr % S.paerer.length]
      const z = 1 - 2 * brok(0.5 + nr * a1)
      const fi = 2 * Math.PI * brok(0.5 + nr * a2)
      const sn = Math.sqrt(Math.max(0, 1 - z * z))
      const dir = new THREE.Vector3(sn * Math.cos(fi), sn * Math.sin(fi), z)
      S.straale.set(p.l.getWorldPosition(new THREE.Vector3()), dir)
      let t = kast > 0 ? S.straale.intersectObjects(S.treff, false)[0] : null
      const normalAv = (q, d) => {
        const v = q.face.normal.clone().transformDirection(q.object.matrixWorld)
        return v.dot(d) > 0 ? v.negate() : v
      }
      const erSpegl = (q) => !!(Array.isArray(q.object.material) ? q.object.material[q.face.materialIndex] : q.object.material)?.userData.spegl
      let demp = 1
      for (let hopp = 0; t && t.face && erSpegl(t); hopp++) {
        if (hopp === 6) {
          t = null
          break
        }
        const ns = normalAv(t, dir)
        dir.reflect(ns)
        demp *= SPEGLING
        S.straale.set(t.point.clone().addScaledVector(ns, 0.05), dir)
        t = S.straale.intersectObjects(S.treff, false)[0]
      }
      if (!t || !t.face) {
        l.intensity = 0
        return
      }
      const fargeAv = (q) => (Array.isArray(q.object.material) ? q.object.material[0] : q.object.material).color
      let nv = normalAv(t, dir)
      l.color.set(p.k.farge).multiply(fargeAv(t)).multiplyScalar(demp)
      const djup = nr % 5 < 3 ? 1 : 2
      if (djup === 2) {
        const u1 = brok(0.37 + nr * a2)
        const f2 = 2 * Math.PI * brok(0.11 + nr * a1)
        const e1 = new THREE.Vector3().crossVectors(nv, Math.abs(nv.z) < 0.9 ? S.opp : S.hogre).normalize()
        const e2 = new THREE.Vector3().crossVectors(nv, e1)
        const rr = Math.sqrt(u1)
        const d2 = e1.multiplyScalar(rr * Math.cos(f2)).addScaledVector(e2, rr * Math.sin(f2)).addScaledVector(nv, Math.sqrt(1 - u1)).normalize()
        S.straale.set(t.point.clone().addScaledVector(nv, 0.5), d2)
        const t2 = S.straale.intersectObjects(S.treff, false)[0]
        if (!t2 || !t2.face) {
          l.intensity = 0
          return
        }
        nv = normalAv(t2, d2)
        l.color.multiply(fargeAv(t2))
        t = t2
      }
      l.intensity = (4 * sumI * kast) / K / (djup === 1 ? 0.6 : 0.4)
      l.decay = 0.4 * S.storleik
      S.straale.set(t.point.clone().addScaledVector(nv, 0.5), nv)
      const neste = S.straale.intersectObjects(S.treff, false)[0]
      l.position.copy(t.point).addScaledVector(nv, neste ? Math.min(12, 0.45 * neste.distance) : 12)
      l.target.position.copy(l.position).add(nv)
      l.target.updateMatrixWorld()
    })
  }
}

function speglPass(namn, b, h) {
  const r = R.renderer
  const lys = namn === "lys"
  const kam = S.kam
  S.scene.updateMatrixWorld(true)
  const grupper = new Map()
  for (const d of S.delar) {
    if (!d.spegl) continue
    d.m.material[1].envMapIntensity = lys ? 0.03 : 1
    for (const q of d.spegl) {
      q.reserve.envMapIntensity = lys ? 0.03 : 1
      d.m.material[q.idx] = q.reserve
      if (!q.plan) continue
      const n = new THREE.Vector3(0, 0, q.sn).transformDirection(d.m.matrixWorld)
      const p = new THREE.Vector3(0, 0, q.w).applyMatrix4(d.m.matrixWorld)
      const nokkel = [n.x, n.y, n.z, n.dot(p) / 100].map((x) => Math.round(x * 500)).join(",")
      let g = grupper.get(nokkel)
      if (!g) grupper.set(nokkel, (g = { n, p, ledd: [] }))
      g.ledd.push([d, q])
    }
  }
  const bak = (S.sc.bakgrunn && !lys ? S.sc.bakgrunn : BAK[lys ? "lys" : "studio"]).map((x) => {
    const c = new THREE.Color(x)
    return lys ? c : c.addScalar(0.04).multiplyScalar(1 / 0.92)
  })
  const sk = Math.min(1, 900 / Math.max(b, h))
  const bw = Math.round(b * sk)
  const bh = Math.round(h * sk)
  R.speglMaal ??= []
  let nr = 0
  const pos = kam.getWorldPosition(new THREE.Vector3())
  const framK = new THREE.Vector3(0, 0, -1).transformDirection(kam.matrixWorld)
  const oppK = new THREE.Vector3(0, 1, 0).transformDirection(kam.matrixWorld)
  const virt = new THREE.PerspectiveCamera()
  r.shadowMap.autoUpdate = false
  r.shadowMap.needsUpdate = true
  for (const g of grupper.values()) {
    if (g.n.dot(pos.clone().sub(g.p)) <= 0) continue
    let flate = R.speglMaal[nr]
    if (!flate || flate.width !== bw || flate.height !== bh) {
      flate?.dispose()
      flate = R.speglMaal[nr] = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: 4 })
    }
    nr++
    const sp = (v) => v.clone().sub(g.p).reflect(g.n).add(g.p)
    virt.position.copy(sp(pos))
    virt.up.copy(oppK).reflect(g.n)
    virt.lookAt(sp(pos.clone().add(framK)))
    virt.far = kam.far
    virt.updateMatrixWorld(true)
    virt.projectionMatrix.copy(kam.projectionMatrix)
    const tm = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse)
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(g.n, g.p).applyMatrix4(virt.matrixWorldInverse)
    const cp = new THREE.Vector4(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant)
    const e = virt.projectionMatrix.elements
    const qv = new THREE.Vector4((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    cp.multiplyScalar(2 / cp.dot(qv))
    e[2] = cp.x
    e[6] = cp.y
    e[10] = cp.z + 1 - 0.003
    e[14] = cp.w
    virt.projectionMatrixInverse.copy(virt.projectionMatrix).invert()
    r.setRenderTarget(flate)
    r.setClearColor(0x000000, 0)
    r.clear()
    r.render(S.scene, virt)
    g.klar = true
    for (const [, q] of g.ledd) {
      const u = q.plan.uniforms
      u.kart.value = flate.texture
      u.tm.value.copy(tm)
      u.nrm.value.copy(g.n)
      u.bak0.value.copy(bak[0])
      u.bak1.value.copy(bak[1])
    }
  }
  r.shadowMap.autoUpdate = true
  r.setRenderTarget(null)
  for (const g of grupper.values()) if (g.klar) for (const [d, q] of g.ledd) d.m.material[q.idx] = q.plan
  S.speglPass = nr
}

function speglLys() {
  if (S.kaust) return
  S.kaust = []
  const t0 = performance.now()
  S.scene.updateMatrixWorld(true)
  const flatt = (p) => {
    const a = new Float64Array(p.length * 2)
    p.forEach((q, i) => {
      a[2 * i] = q[0]
      a[2 * i + 1] = q[1]
    })
    return a
  }
  const plater = []
  const nett = []
  for (const d of S.delar) {
    if (d.gjennom) continue
    if (!d.riss) {
      nett.push(d.m)
      continue
    }
    const om = flatt(d.riss.om)
    const bb = [Infinity, Infinity, -Infinity, -Infinity]
    for (let i = 0; i < om.length; i += 2) {
      bb[0] = Math.min(bb[0], om[i])
      bb[1] = Math.min(bb[1], om[i + 1])
      bb[2] = Math.max(bb[2], om[i])
      bb[3] = Math.max(bb[3], om[i + 1])
    }
    const har = (sn) => !!d.spegl?.some((q) => q.sn === sn)
    plater.push({ e: d.m.matrixWorld.clone().invert().elements, om, hol: d.riss.hol.map(flatt), bb, t: d.t, sp: [har(-1), har(1)], n: new THREE.Vector3(0, 0, 1).transformDirection(d.m.matrixWorld) })
  }
  for (const u of S.utstyr) u.traverse((m) => m.isMesh && !m.userData.glas && nett.push(m))
  for (const m of [S.snor, S.rosett]) if (m) nett.push(m)
  const klumpar = []
  const v = new THREE.Vector3()
  for (const m of nett) {
    const pos = m.geometry.getAttribute("position")
    const ix = m.geometry.index
    const tal = ix ? ix.count : pos.count
    const alle = new Float64Array(tal * 3)
    for (let i = 0; i < tal; i++) {
      v.fromBufferAttribute(pos, ix ? ix.getX(i) : i).applyMatrix4(m.matrixWorld)
      alle[3 * i] = v.x
      alle[3 * i + 1] = v.y
      alle[3 * i + 2] = v.z
    }
    for (let s = 0; s < tal; s += 72) {
      const p = alle.subarray(s * 3, Math.min(tal, s + 72) * 3)
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
      for (let i = 0; i < p.length; i += 3)
        for (let a = 0; a < 3; a++) {
          b[a] = Math.min(b[a], p[i + a])
          b[3 + a] = Math.max(b[3 + a], p[i + a])
        }
      klumpar.push({ b, p })
    }
  }
  const iPoly = (a, x, y) => {
    let inne = false
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      const yi = a[i + 1]
      const yj = a[j + 1]
      if (yi > y !== yj > y && x < ((a[j] - a[i]) * (y - yi)) / (yj - yi) + a[i]) inne = !inne
    }
    return inne
  }
  const iPlate = (p, x, y) => {
    if (x < p.bb[0] || y < p.bb[1] || x > p.bb[2] || y > p.bb[3] || !iPoly(p.om, x, y)) return false
    for (const h of p.hol) if (iPoly(h, x, y)) return false
    return true
  }
  const K = 256
  const L = 8 * S.storleik
  const golvFarge = new THREE.Color("#d8d2c8")
  const rom = [S.golvRom, S.veggRom, S.takRom].filter(Boolean).map((m) => {
    const n = m.userData.normal.clone()
    const p = m.userData.punkt.clone()
    const e1 = Math.abs(n.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(S.opp, n).normalize()
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize()
    const c = S.sentrum.clone().addScaledVector(n, -S.sentrum.clone().sub(p).dot(n))
    return { m, n, p, e1, e2, c, kart: new Float32Array(K * K * 3), sum: 0 }
  })
  const N = 240000
  const a1 = 0.7548776662466927
  const a2 = 0.5698402909980532
  const tal = { ut0: 0, ut1: 0, fyrst: 0, rom1: 0 }
  const per = Math.floor(N / S.paerer.length)
  S.paerer.forEach((pa, nrP) => {
    const o0 = S.rot.localToWorld(pa.heim.clone())
    const fc = new THREE.Color(pa.k.farge).multiply(golvFarge)
    const skala = (4 * pa.l.intensity) / (per * (L / K) * (L / K))
    for (let i = 0; i < per; i++) {
      const nr = i * S.paerer.length + nrP + 1
      let jx = halton(i + 1, 2) * 2 - 1
      let jy = halton(i + 1, 3) * 2 - 1
      let jz = halton(i + 1, 5) * 2 - 1
      if (jx * jx + jy * jy + jz * jz > 1) {
        jx *= 0.6
        jy *= 0.6
        jz *= 0.6
      }
      let ox = o0.x + jx * pa.k.radius
      let oy = o0.y + jy * pa.k.radius
      let oz = o0.z + jz * pa.k.radius
      let dz = 1 - 2 * brok(0.5 + nr * a1)
      const fi = 2 * Math.PI * brok(0.5 + nr * a2)
      const sn = Math.sqrt(Math.max(0, 1 - dz * dz))
      let dx = sn * Math.cos(fi)
      let dy = sn * Math.sin(fi)
      let w = 1
      for (let hopp = 0; hopp < 9; hopp++) {
        let best = Infinity
        let slag = 0
        let tn = null
        let ts = 1
        let tr = null
        for (const p of plater) {
          const e = p.e
          const dzL = e[2] * dx + e[6] * dy + e[10] * dz
          if (dzL > -1e-9 && dzL < 1e-9) continue
          const ozL = e[2] * ox + e[6] * oy + e[10] * oz + e[14]
          const ta = -ozL / dzL
          const tb = (p.t - ozL) / dzL
          const inn = ta < tb ? ta : tb
          const utt = ta < tb ? tb : ta
          if (utt <= 1e-4 || inn >= best) continue
          const oxL = e[0] * ox + e[4] * oy + e[8] * oz + e[12]
          const oyL = e[1] * ox + e[5] * oy + e[9] * oz + e[13]
          const dxL = e[0] * dx + e[4] * dy + e[8] * dz
          const dyL = e[1] * dx + e[5] * dy + e[9] * dz
          if (inn > 1e-4 && iPlate(p, oxL + inn * dxL, oyL + inn * dyL)) {
            best = inn
            slag = p.sp[dzL > 0 ? 0 : 1] ? 2 : 1
            tn = p.n
            ts = dzL > 0 ? -1 : 1
          } else if (utt < best && iPlate(p, oxL + utt * dxL, oyL + utt * dyL)) {
            best = utt
            slag = 1
          }
        }
        const ix = 1 / dx
        const iy = 1 / dy
        const iz = 1 / dz
        for (const k of klumpar) {
          const b = k.b
          let q1 = (b[0] - ox) * ix
          let q2 = (b[3] - ox) * ix
          let lo = q1 < q2 ? q1 : q2
          let hi = q1 < q2 ? q2 : q1
          q1 = (b[1] - oy) * iy
          q2 = (b[4] - oy) * iy
          lo = Math.max(lo, q1 < q2 ? q1 : q2)
          hi = Math.min(hi, q1 < q2 ? q2 : q1)
          q1 = (b[2] - oz) * iz
          q2 = (b[5] - oz) * iz
          lo = Math.max(lo, q1 < q2 ? q1 : q2)
          hi = Math.min(hi, q1 < q2 ? q2 : q1)
          if (hi < lo || hi < 1e-4 || lo > best) continue
          const p = k.p
          for (let j = 0; j < p.length; j += 9) {
            const ax = p[j + 3] - p[j]
            const ay = p[j + 4] - p[j + 1]
            const az = p[j + 5] - p[j + 2]
            const bx = p[j + 6] - p[j]
            const by = p[j + 7] - p[j + 1]
            const bz = p[j + 8] - p[j + 2]
            const px = dy * bz - dz * by
            const py = dz * bx - dx * bz
            const pz = dx * by - dy * bx
            const det = ax * px + ay * py + az * pz
            if (det > -1e-12 && det < 1e-12) continue
            const inv = 1 / det
            const sx = ox - p[j]
            const sy = oy - p[j + 1]
            const sz = oz - p[j + 2]
            const u = (sx * px + sy * py + sz * pz) * inv
            if (u < 0 || u > 1) continue
            const qx = sy * az - sz * ay
            const qy = sz * ax - sx * az
            const qz = sx * ay - sy * ax
            const vv = (dx * qx + dy * qy + dz * qz) * inv
            if (vv < 0 || u + vv > 1) continue
            const tt = (bx * qx + by * qy + bz * qz) * inv
            if (tt > 1e-4 && tt < best) {
              best = tt
              slag = 1
            }
          }
        }
        for (const q of rom) {
          const nd = dx * q.n.x + dy * q.n.y + dz * q.n.z
          if (nd > -1e-9) continue
          const tt = ((q.p.x - ox) * q.n.x + (q.p.y - oy) * q.n.y + (q.p.z - oz) * q.n.z) / nd
          if (tt > 1e-4 && tt < best) {
            best = tt
            slag = 3
            tr = q
          }
        }
        if (hopp === 0 && slag === 2) tal.fyrst++
        if (slag === 1) break
        if (slag === 0 || slag === 3) {
          if (hopp) tal.ut1 += w
          else tal.ut0++
          if (slag === 3 && hopp) {
            tal.rom1 += w
            const rx = ox + dx * best - tr.c.x
            const ry = oy + dy * best - tr.c.y
            const rz = oz + dz * best - tr.c.z
            const fu = ((rx * tr.e1.x + ry * tr.e1.y + rz * tr.e1.z) / L + 0.5) * K - 0.5
            const fv = ((rx * tr.e2.x + ry * tr.e2.y + rz * tr.e2.z) / L + 0.5) * K - 0.5
            const iu = Math.floor(fu)
            const iv = Math.floor(fv)
            if (iu >= 0 && iv >= 0 && iu < K - 1 && iv < K - 1) {
              const du = fu - iu
              const dv = fv - iv
              tr.sum += w
              for (const [qu, qv, vekt] of [[iu, iv, (1 - du) * (1 - dv)], [iu + 1, iv, du * (1 - dv)], [iu, iv + 1, (1 - du) * dv], [iu + 1, iv + 1, du * dv]]) {
                const at = (qv * K + qu) * 3
                tr.kart[at] += fc.r * skala * w * vekt
                tr.kart[at + 1] += fc.g * skala * w * vekt
                tr.kart[at + 2] += fc.b * skala * w * vekt
              }
            }
          }
          break
        }
        ox += dx * best + tn.x * ts * 0.02
        oy += dy * best + tn.y * ts * 0.02
        oz += dz * best + tn.z * ts * 0.02
        const dn = 2 * (dx * tn.x + dy * tn.y + dz * tn.z)
        dx -= dn * tn.x
        dy -= dn * tn.y
        dz -= dn * tn.z
        w *= SPEGLING
      }
    }
  })
  for (const q of rom) {
    if (!q.sum) continue
    const a = q.kart
    const b = new Float32Array(a.length)
    for (let runde = 0; runde < 3; runde++) {
      for (let y = 0; y < K; y++)
        for (let x = 0; x < K; x++)
          for (let c = 0; c < 3; c++) b[(y * K + x) * 3 + c] = (a[(y * K + Math.max(x - 1, 0)) * 3 + c] + 2 * a[(y * K + x) * 3 + c] + a[(y * K + Math.min(x + 1, K - 1)) * 3 + c]) / 4
      for (let y = 0; y < K; y++)
        for (let x = 0; x < K; x++)
          for (let c = 0; c < 3; c++) a[(y * K + x) * 3 + c] = (b[(Math.max(y - 1, 0) * K + x) * 3 + c] + 2 * b[(y * K + x) * 3 + c] + b[(Math.min(y + 1, K - 1) * K + x) * 3 + c]) / 4
    }
    const data = new Uint16Array(K * K * 4)
    for (let i = 0; i < K * K; i++) {
      for (let c = 0; c < 3; c++) data[4 * i + c] = THREE.DataUtils.toHalfFloat(Math.min(a[3 * i + c], 60000))
      data[4 * i + 3] = THREE.DataUtils.toHalfFloat(1)
    }
    const kart = new THREE.DataTexture(data, K, K, THREE.RGBAFormat, THREE.HalfFloatType)
    kart.minFilter = kart.magFilter = THREE.LinearFilter
    kart.needsUpdate = true
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, L), new THREE.MeshBasicMaterial({ map: kart, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))
    mesh.matrixAutoUpdate = false
    mesh.matrix.makeBasis(q.e1, q.e2, q.n).setPosition(q.c.clone().addScaledVector(q.n, 0.4))
    mesh.renderOrder = 8
    S.scene.add(mesh)
    S.kaust.push({ mesh, rom: q.m })
  }
  const tot = per * S.paerer.length
  const pst = (x) => Math.round((1000 * x) / tot) / 10
  S.speglTal = { straalar: tot, utDirekte: pst(tal.ut0), utViaSpegl: pst(tal.ut1), paaRomViaSpegl: pst(tal.rom1), fyrstPaaSpegl: pst(tal.fyrst), ms: Math.round(performance.now() - t0) }
}

function maal(b, h) {
  if (R.b === b && R.h === h) return
  R.b = b
  R.h = h
  R.renderer.setSize(b, h, false)
  R.renderer.domElement.style.width = b + "px"
  R.renderer.domElement.style.height = h + "px"
  for (const k of ["prove", "sum"]) if (R[k]) R[k].dispose()
  R.prove = new THREE.WebGLRenderTarget(b, h, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  R.sum = new THREE.WebGLRenderTarget(b, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
}

function teikn(namn, b, h, val = {}) {
  const t0 = performance.now()
  if (!SYN[namn]) throw new Error("ukjent syn: " + namn)
  maal(b, h)
  stillSprengt(namn === "sprengt")
  const pkt = passPunkt(true, ["front", "side", "topp", "under"].includes(namn))
  const ramme = stillKamera(namn, b, h, pkt)
  synleg(namn)
  const n = Math.round((val.prover || 24) * (namn === "lys" ? 1.6 : 1))
  stillRigg(namn, pkt, val.kart || 1024)
  const r = R.renderer
  r.shadowMap.type = namn === "lys" ? THREE.BasicShadowMap : THREE.PCFShadowMap
  if (S.delar.some((d) => d.spegl)) {
    if (namn === "lys") speglLys()
    for (const k of S.kaust || []) k.mesh.visible = namn === "lys" && k.rom.visible
    prove(0, n)
    speglPass(namn, b, h)
  }
  r.setRenderTarget(R.sum)
  r.setClearColor(0x000000, 0)
  r.clear()
  for (let i = 0; i < n; i++) {
    prove(i, n)
    S.kam.setViewOffset(b, h, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, b, h)
    r.setRenderTarget(R.prove)
    r.clear()
    r.render(S.scene, S.kam)
    r.setRenderTarget(R.sum)
    R.legg.uniforms.kart.value = R.prove.texture
    R.legg.uniforms.vekt.value = 1 / n
    r.render(R.leggScene, R.kvadKam)
  }
  S.kam.clearViewOffset()
  r.setRenderTarget(null)
  r.clear()
  const lys = namn === "lys"
  const bak = (S.sc.bakgrunn && !lys ? S.sc.bakgrunn : BAK[lys ? "lys" : "studio"]).map((x) => new THREE.Color(x))
  const tilSrgb = (c) => new THREE.Vector3().fromArray(c.clone().convertLinearToSRGB().toArray())
  R.slutt.uniforms.kart.value = R.sum.texture
  R.slutt.uniforms.b0.value = tilSrgb(bak[0])
  R.slutt.uniforms.b1.value = tilSrgb(bak[1])
  R.slutt.uniforms.eksp.value = (lys ? 1.0 : 0.92) * (val.eksponering || 1)
  R.slutt.uniforms.film.value = lys ? 1 : 0
  r.render(R.sluttScene, R.kvadKam)
  const gl = r.getContext()
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  return { ms: Math.round(performance.now() - t0), prover: n, ramme }
}

function bilete() {
  return R.renderer.domElement.toDataURL("image/png")
}

function ark(val = {}) {
  const sk = val.skala || 1
  const B = 1800 * sk
  const H = 1200 * sk
  const fot = 38 * sk
  const radH = Math.floor((H - fot) / 2)
  const c = document.createElement("canvas")
  c.width = B
  c.height = H
  const g = c.getContext("2d")
  g.fillStyle = "#cfcbc5"
  g.fillRect(0, 0, B, H)
  const ruter = [
    ["helt", 0, 0, 600, radH / sk],
    ["lys", 600, 0, 600, radH / sk],
    ["sprengt", 1200, 0, 600, radH / sk],
    ["front", 0, radH / sk, 450, radH / sk],
    ["side", 450, radH / sk, 450, radH / sk],
    ["topp", 900, radH / sk, 450, radH / sk],
    ["under", 1350, radH / sk, 450, radH / sk],
  ]
  const tider = {}
  const rammer = {}
  const m = S.mal
  const tekst = { front: `${Math.round(m.x)} × ${Math.round(m.z)} mm`, side: `${Math.round(m.y)} × ${Math.round(m.z)} mm`, topp: `${Math.round(m.x)} × ${Math.round(m.y)} mm` }
  for (const [namn, x, y, b, h] of ruter) {
    const bb = Math.round(b * sk) - 2
    const hh = Math.round(h * sk) - 2
    const t = teikn(namn, bb, hh, { prover: val.prover || 16, kart: val.kart || 1024 })
    tider[namn] = t.ms
    rammer[namn] = t.ramme
    g.drawImage(R.renderer.domElement, Math.round(x * sk) + 1, Math.round(y * sk) + 1)
    const lys = namn === "lys"
    g.font = `600 ${13 * sk}px Inter, Helvetica, Arial, sans-serif`
    g.textBaseline = "top"
    g.fillStyle = lys ? "rgba(255,255,255,0.85)" : "rgba(40,36,32,0.9)"
    g.fillText(namn.toUpperCase(), Math.round(x * sk) + 14 * sk, Math.round(y * sk) + 12 * sk)
    if (tekst[namn]) {
      g.font = `400 ${12 * sk}px Inter, Helvetica, Arial, sans-serif`
      g.fillStyle = "rgba(40,36,32,0.65)"
      g.fillText(tekst[namn], Math.round(x * sk) + 14 * sk, Math.round(y * sk) + 30 * sk)
      const p0 = S.kamMal.clone().project(S.kam)
      const p1 = S.kamMal.clone().addScaledVector(S.kamHog, 100).project(S.kam)
      const px = (Math.abs(p1.x - p0.x) * bb) / 2
      const x0 = Math.round(x * sk) + 14 * sk
      const y0 = Math.round((y + h) * sk) - 16 * sk
      g.fillStyle = "rgba(40,36,32,0.8)"
      g.fillRect(x0, y0, px, 2 * sk)
      g.fillRect(x0, y0 - 4 * sk, sk, 10 * sk)
      g.fillRect(x0 + px - sk, y0 - 4 * sk, sk, 10 * sk)
      g.textBaseline = "bottom"
      g.fillText("100 mm", x0, y0 - 6 * sk)
      g.textBaseline = "top"
    }
  }
  g.fillStyle = "#2a2622"
  g.fillRect(0, H - fot, B, fot)
  g.fillStyle = "#f2efea"
  g.font = `600 ${15 * sk}px Inter, Helvetica, Arial, sans-serif`
  g.textBaseline = "middle"
  g.fillText(val.namn || S.sc.namn || "", 16 * sk, H - fot / 2)
  g.font = `400 ${13 * sk}px Inter, Helvetica, Arial, sans-serif`
  g.textAlign = "right"
  g.fillStyle = "#cfc9c0"
  const ekstra = S.delar.filter((d) => d.ekstra).length
  g.fillText(val.fotnote || `${Math.round(m.x)} × ${Math.round(m.y)} × ${Math.round(m.z)} mm · ${S.delar.length - ekstra} delar${ekstra ? ` + ${ekstra} ekstra` : ""}`, B - 16 * sk, H - fot / 2)
  g.textAlign = "left"
  return { url: c.toDataURL("image/png"), tider, rammer }
}

window.syn = { bygg, teikn, bilete, ark, speglTal: () => S.speglTal ?? null, SYN: Object.keys(SYN), STOFF: Object.keys(STOFF) }
window.klar = true
