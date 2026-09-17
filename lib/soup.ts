import type { Vec3 } from "./core"

export type Soup = {
  pos: Float32Array
  tris: number
  min: Vec3
  max: Vec3
}

export type Indexed = {
  verts: Float32Array
  idx: Uint32Array
}

export function bounds(pos: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 1
  }
  return { min, max }
}

export function makeSoup(pos: Float32Array): Soup {
  const b = bounds(pos)
  return { pos, tris: Math.floor(pos.length / 9), min: b.min, max: b.max }
}

export const diag = (s: { min: Vec3; max: Vec3 }) =>
  Math.hypot(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]) || 1

export function weld(s: Soup, eps = 0): Indexed {
  const e = eps > 0 ? eps : diag(s) * 1e-4
  const inv = 1 / e
  const M = 131072
  const bx = s.min[0]
  const by = s.min[1]
  const bz = s.min[2]
  const q = (v: number, o: number) => {
    const k = Math.round((v - o) * inv)
    return k < 0 ? 0 : k >= M ? M - 1 : k
  }
  const map = new Map<number, number>()
  const verts: number[] = []
  const idx = new Uint32Array(s.tris * 3)
  const P = s.pos
  for (let i = 0; i < s.tris * 3; i++) {
    const o = i * 3
    const x = P[o]
    const y = P[o + 1]
    const z = P[o + 2]
    const key = (q(x, bx) * M + q(y, by)) * M + q(z, bz)
    let v = map.get(key)
    if (v === undefined) {
      v = verts.length / 3
      map.set(key, v)
      verts.push(x, y, z)
    }
    idx[i] = v
  }
  return { verts: new Float32Array(verts), idx }
}

export function shade(m: Indexed, creaseDeg = 40): { pos: Float32Array; nrm: Float32Array } {
  const V = m.verts
  const nf = m.idx.length / 3
  const nv = V.length / 3
  const cosMin = Math.cos((creaseDeg * Math.PI) / 180)

  const fn = new Float32Array(nf * 3)
  const fl = new Float32Array(nf)
  for (let t = 0; t < nf; t++) {
    const ia = m.idx[t * 3] * 3
    const ib = m.idx[t * 3 + 1] * 3
    const ic = m.idx[t * 3 + 2] * 3
    const ux = V[ib] - V[ia]
    const uy = V[ib + 1] - V[ia + 1]
    const uz = V[ib + 2] - V[ia + 2]
    const vx = V[ic] - V[ia]
    const vy = V[ic + 1] - V[ia + 1]
    const vz = V[ic + 2] - V[ia + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    fn[t * 3] = nx
    fn[t * 3 + 1] = ny
    fn[t * 3 + 2] = nz
    fl[t] = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
  }

  const start = new Uint32Array(nv + 1)
  for (let i = 0; i < m.idx.length; i++) start[m.idx[i] + 1]++
  for (let i = 0; i < nv; i++) start[i + 1] += start[i]
  const fill = start.slice(0, nv)
  const faces = new Uint32Array(m.idx.length)
  for (let t = 0; t < nf; t++) {
    for (let c = 0; c < 3; c++) faces[fill[m.idx[t * 3 + c]]++] = t
  }

  const pos = new Float32Array(nf * 9)
  const nrm = new Float32Array(nf * 9)
  for (let t = 0; t < nf; t++) {
    const ax = fn[t * 3]
    const ay = fn[t * 3 + 1]
    const az = fn[t * 3 + 2]
    const aL = fl[t]
    const grense = cosMin * aL
    for (let c = 0; c < 3; c++) {
      const v = m.idx[t * 3 + c]
      const src = v * 3
      const dst = t * 9 + c * 3
      pos[dst] = V[src]
      pos[dst + 1] = V[src + 1]
      pos[dst + 2] = V[src + 2]
      let sx = 0
      let sy = 0
      let sz = 0
      for (let i = start[v]; i < start[v + 1]; i++) {
        const nb = faces[i]
        const g = nb * 3
        const bx = fn[g]
        const by = fn[g + 1]
        const bz = fn[g + 2]
        if (ax * bx + ay * by + az * bz < grense * fl[nb]) continue
        sx += bx
        sy += by
        sz += bz
      }
      const L = Math.sqrt(sx * sx + sy * sy + sz * sz)
      if (L > 1e-12) {
        nrm[dst] = sx / L
        nrm[dst + 1] = sy / L
        nrm[dst + 2] = sz / L
      } else {
        nrm[dst] = ax / aL
        nrm[dst + 1] = ay / aL
        nrm[dst + 2] = az / aL
      }
    }
  }
  return { pos, nrm }
}

export function signedVolume(m: Indexed): number {
  const V = m.verts
  let x0 = Infinity
  let y0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let z1 = -Infinity
  for (let i = 0; i < V.length; i += 3) {
    if (V[i] < x0) x0 = V[i]
    if (V[i] > x1) x1 = V[i]
    if (V[i + 1] < y0) y0 = V[i + 1]
    if (V[i + 1] > y1) y1 = V[i + 1]
    if (V[i + 2] < z0) z0 = V[i + 2]
    if (V[i + 2] > z1) z1 = V[i + 2]
  }
  if (!Number.isFinite(x0)) return 0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const cz = (z0 + z1) / 2
  let v = 0
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3
    const b = m.idx[t + 1] * 3
    const c = m.idx[t + 2] * 3
    const ax = V[a] - cx
    const ay = V[a + 1] - cy
    const az = V[a + 2] - cz
    const bx = V[b] - cx
    const by = V[b + 1] - cy
    const bz = V[b + 2] - cz
    const cx2 = V[c] - cx
    const cy2 = V[c + 1] - cy
    const cz2 = V[c + 2] - cz
    v += (ax * (by * cz2 - bz * cy2) - ay * (bx * cz2 - bz * cx2) + az * (bx * cy2 - by * cx2)) / 6
  }
  return v
}

export function flip(m: Indexed): Indexed {
  const idx = Uint32Array.from(m.idx)
  for (let t = 0; t < idx.length; t += 3) {
    const q = idx[t + 1]
    idx[t + 1] = idx[t + 2]
    idx[t + 2] = q
  }
  return { verts: m.verts, idx }
}

export function openEdges(m: Indexed): number {
  const seen = new Map<number, number>()
  const n = m.verts.length / 3
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a)
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]
    const b = m.idx[t + 1]
    const c = m.idx[t + 2]
    if (a === b || b === c || c === a) continue
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = key(u, v)
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
  }
  let open = 0
  for (const v of seen.values()) if (v !== 2) open++
  return open
}

export function place(
  pos: Float32Array,
  o: { rotX: number; rotY: number; rotZ: number; storleik: number },
): Float32Array {
  return plassering(pos, o).pos
}

export function plassering(
  pos: Float32Array,
  o: { rotX: number; rotY: number; rotZ: number; storleik: number },
): { pos: Float32Array; k: number; vend: (p: Vec3) => Vec3 } {
  const rx = (o.rotX * Math.PI) / 180
  const ry = (o.rotY * Math.PI) / 180
  const rz = (o.rotZ * Math.PI) / 180
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  const out = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i]
    let y = pos[i + 1]
    let z = pos[i + 2]
    let t = y * cx - z * sx
    z = y * sx + z * cx
    y = t
    t = x * cy + z * sy
    z = -x * sy + z * cy
    x = t
    t = x * cz - y * sz
    y = x * sz + y * cz
    x = t
    out[i] = x
    out[i + 1] = y
    out[i + 2] = z
  }
  const b = bounds(out)
  const dx = b.max[0] - b.min[0]
  const dy = b.max[1] - b.min[1]
  const dz = b.max[2] - b.min[2]
  const k = o.storleik / Math.max(dx, dy, dz, 1e-6)
  const mx = ((b.min[0] + b.max[0]) / 2) * k
  const my = ((b.min[1] + b.max[1]) / 2) * k
  const mz = b.min[2] * k
  for (let i = 0; i < out.length; i += 3) {
    out[i] = out[i] * k - mx
    out[i + 1] = out[i + 1] * k - my
    out[i + 2] = out[i + 2] * k - mz
  }
  const vend = (p: Vec3): Vec3 => {
    let x = p[0]
    let y = p[1]
    let z = p[2]
    let t2 = y * cx - z * sx
    z = y * sx + z * cx
    y = t2
    t2 = x * cy + z * sy
    z = -x * sy + z * cy
    x = t2
    t2 = x * cz - y * sz
    y = x * sz + y * cz
    x = t2
    return [x * k - mx, y * k - my, z * k - mz]
  }
  return { pos: out, k, vend }
}
