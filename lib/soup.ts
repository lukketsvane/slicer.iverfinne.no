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
  const n = s.tris * 3
  if (!n) return { verts: new Float32Array(0), idx: new Uint32Array(0) }
  const d = diag(s)
  const e = eps > 0 ? eps : d * 1e-4
  const M = 131072
  const inv = Math.min(1 / e, (M - 2) / Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2], 1e-12))
  const bx = s.min[0]
  const by = s.min[1]
  const bz = s.min[2]
  let cap = 32
  const startCap = Math.max(32, Math.ceil(n * 0.75))
  while (cap < startCap) cap <<= 1
  let mask = cap - 1
  let htKeys = new Float64Array(cap)
  let htVals = new Int32Array(cap).fill(-1)
  const hash = (key: number, msk: number) => {
    const hi = (key / 4294967296) | 0
    const lo = key >>> 0
    return (Math.imul(lo ^ hi, 0x9e3779b1) ^ (lo >>> 16)) & msk
  }
  const verts: number[] = []
  const idx = new Uint32Array(n)
  const P = s.pos
  let used = 0
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const x = P[o]
    const y = P[o + 1]
    const z = P[o + 2]
    let kx = Math.round((x - bx) * inv)
    let ky = Math.round((y - by) * inv)
    let kz = Math.round((z - bz) * inv)
    if (kx < 0) kx = 0
    else if (kx >= M) kx = M - 1
    if (ky < 0) ky = 0
    else if (ky >= M) ky = M - 1
    if (kz < 0) kz = 0
    else if (kz >= M) kz = M - 1
    const key = (kx * M + ky) * M + kz
    let slot = hash(key, mask)
    let v = htVals[slot]
    while (v !== -1 && htKeys[slot] !== key) {
      slot = (slot + 1) & mask
      v = htVals[slot]
    }
    if (v === -1) {
      v = used++
      if (used * 10 > cap * 6) {
        const nCap = cap << 1
        const nMask = nCap - 1
        const nKeys = new Float64Array(nCap)
        const nVals = new Int32Array(nCap).fill(-1)
        for (let k = 0; k < cap; k++) {
          const val = htVals[k]
          if (val === -1) continue
          const ek = htKeys[k]
          let s2 = hash(ek, nMask)
          while (nVals[s2] !== -1) s2 = (s2 + 1) & nMask
          nKeys[s2] = ek
          nVals[s2] = val
        }
        cap = nCap
        mask = nMask
        htKeys = nKeys
        htVals = nVals
        slot = hash(key, mask)
        while (htVals[slot] !== -1) slot = (slot + 1) & mask
      }
      htKeys[slot] = key
      htVals[slot] = v
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

export function orienter(m: Indexed): Indexed {
  const nf = m.idx.length / 3
  const nv = m.verts.length / 3
  if (!nf || !nv) return m
  const I = m.idx
  const V = m.verts
  let cap = 32
  const est = Math.max(32, nf * 3)
  while (cap < est * 2) cap <<= 1
  const mask = cap - 1
  const eKey = new Float64Array(cap)
  const eCnt = new Uint8Array(cap)
  const eT0 = new Uint32Array(cap)
  const eK0 = new Uint8Array(cap)
  const eD0 = new Int8Array(cap)
  const eT1 = new Uint32Array(cap)
  const eK1 = new Uint8Array(cap)
  const nbTri = new Int32Array(nf * 3).fill(-1)
  const nbSame = new Uint8Array(nf * 3)
  for (let t = 0; t < nf; t++) {
    const a = I[t * 3]
    const b = I[t * 3 + 1]
    const c = I[t * 3 + 2]
    if (a === b || b === c || c === a) continue
    for (let k = 0; k < 3; k++) {
      const u = k === 0 ? a : k === 1 ? b : c
      const v = k === 0 ? b : k === 1 ? c : a
      const dir = u < v ? 1 : -1
      const key = u < v ? u * nv + v : v * nv + u
      const hi = (key / 4294967296) | 0
      const lo = key >>> 0
      let slot = (Math.imul(lo ^ hi, 0x9e3779b1) ^ (lo >>> 16)) & mask
      while (eCnt[slot] && eKey[slot] !== key) slot = (slot + 1) & mask
      const cnt = eCnt[slot]
      if (cnt === 0) {
        eKey[slot] = key
        eCnt[slot] = 1
        eT0[slot] = t
        eK0[slot] = k
        eD0[slot] = dir
      } else if (cnt === 1) {
        eCnt[slot] = 2
        const t0 = eT0[slot]
        const k0 = eK0[slot]
        eT1[slot] = t
        eK1[slot] = k
        const same = eD0[slot] === dir ? 1 : 0
        nbTri[t * 3 + k] = t0
        nbSame[t * 3 + k] = same
        nbTri[t0 * 3 + k0] = t
        nbSame[t0 * 3 + k0] = same
      } else if (cnt === 2) {
        eCnt[slot] = 3
        nbTri[eT0[slot] * 3 + eK0[slot]] = -1
        nbTri[eT1[slot] * 3 + eK1[slot]] = -1
      }
    }
  }
  const sett = new Uint8Array(nf)
  const flipF = new Uint8Array(nf)
  const queue = new Int32Array(nf)
  for (let root = 0; root < nf; root++) {
    if (sett[root]) continue
    const ra = I[root * 3]
    const rb = I[root * 3 + 1]
    const rc = I[root * 3 + 2]
    if (ra === rb || rb === rc || rc === ra) {
      sett[root] = 1
      continue
    }
    let head = 0
    let tail = 0
    queue[tail++] = root
    sett[root] = 1
    while (head < tail) {
      const t = queue[head++]
      const f = flipF[t]
      for (let k = 0; k < 3; k++) {
        const nb = nbTri[t * 3 + k]
        if (nb < 0 || sett[nb]) continue
        sett[nb] = 1
        flipF[nb] = f ^ nbSame[t * 3 + k]
        queue[tail++] = nb
      }
    }
    const o = ra * 3
    const ox = V[o]
    const oy = V[o + 1]
    const oz = V[o + 2]
    let vol = 0
    for (let i = 0; i < tail; i++) {
      const t = queue[i]
      const ia = I[t * 3] * 3
      const ib = I[t * 3 + (flipF[t] ? 2 : 1)] * 3
      const ic = I[t * 3 + (flipF[t] ? 1 : 2)] * 3
      const ax = V[ia] - ox
      const ay = V[ia + 1] - oy
      const az = V[ia + 2] - oz
      const bx = V[ib] - ox
      const by = V[ib + 1] - oy
      const bz = V[ib + 2] - oz
      const cx2 = V[ic] - ox
      const cy2 = V[ic + 1] - oy
      const cz2 = V[ic + 2] - oz
      vol += (ax * (by * cz2 - bz * cy2) - ay * (bx * cz2 - bz * cx2) + az * (bx * cy2 - by * cx2)) / 6
    }
    if (vol < -1e-12) {
      for (let i = 0; i < tail; i++) flipF[queue[i]] ^= 1
    }
  }
  let any = false
  for (let t = 0; t < nf; t++) {
    if (flipF[t]) {
      any = true
      break
    }
  }
  if (!any) return m
  const idx = Uint32Array.from(I)
  for (let t = 0; t < nf; t++) {
    if (!flipF[t]) continue
    const q = idx[t * 3 + 1]
    idx[t * 3 + 1] = idx[t * 3 + 2]
    idx[t * 3 + 2] = q
  }
  return { verts: m.verts, idx }
}

export function openEdges(m: Indexed): number {
  const n = m.verts.length / 3
  const nf = m.idx.length / 3
  if (!nf || !n) return 0
  let cap = 32
  const est = Math.max(32, nf * 3)
  while (cap < est * 2) cap <<= 1
  const mask = cap - 1
  const eKey = new Float64Array(cap)
  const eCnt = new Uint16Array(cap)
  const I = m.idx
  for (let t = 0; t < nf; t++) {
    const a = I[t * 3]
    const b = I[t * 3 + 1]
    const c = I[t * 3 + 2]
    if (a === b || b === c || c === a) continue
    for (let k = 0; k < 3; k++) {
      const u = k === 0 ? a : k === 1 ? b : c
      const v = k === 0 ? b : k === 1 ? c : a
      const key = u < v ? u * n + v : v * n + u
      const hi = (key / 4294967296) | 0
      const lo = key >>> 0
      let slot = (Math.imul(lo ^ hi, 0x9e3779b1) ^ (lo >>> 16)) & mask
      while (eCnt[slot] && eKey[slot] !== key) slot = (slot + 1) & mask
      eKey[slot] = key
      eCnt[slot]++
    }
  }
  let open = 0
  for (let i = 0; i < cap; i++) if (eCnt[i] && eCnt[i] !== 2) open++
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
