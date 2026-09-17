import type { Vec3 } from "../core"
import type { Soup } from "../soup"

export type Span = [number, number]

const AX = [
  { u: 1, v: 2, w: 0 },
  { u: 2, v: 0, w: 1 },
  { u: 0, v: 1, w: 2 },
] as const

type Bucket = {
  nu: number
  nv: number
  u0: number
  v0: number
  inv: number
  start: Uint32Array
  items: Uint32Array
}

function bucketFor(s: Soup, axis: 0 | 1 | 2): Bucket {
  const { u, v } = AX[axis]
  const P = s.pos
  const n = s.tris
  const u0 = s.min[u]
  const v0 = s.min[v]
  const du = Math.max(1e-6, s.max[u] - u0)
  const dv = Math.max(1e-6, s.max[v] - v0)
  const g = Math.min(192, Math.max(6, Math.round(Math.sqrt(n))))
  const cell = Math.max(du, dv) / g
  const inv = 1 / cell
  const nu = Math.max(1, Math.min(256, Math.ceil(du * inv)))
  const nv = Math.max(1, Math.min(256, Math.ceil(dv * inv)))

  const cnt = new Uint32Array(nu * nv + 1)
  const lo = new Int32Array(n * 4)
  for (let t = 0; t < n; t++) {
    const o = t * 9
    let au = Infinity
    let bu = -Infinity
    let av = Infinity
    let bv = -Infinity
    for (let k = 0; k < 3; k++) {
      const q = o + k * 3
      const x = P[q + u]
      const y = P[q + v]
      if (x < au) au = x
      if (x > bu) bu = x
      if (y < av) av = y
      if (y > bv) bv = y
    }
    const i0 = Math.max(0, Math.min(nu - 1, Math.floor((au - u0) * inv)))
    const i1 = Math.max(0, Math.min(nu - 1, Math.floor((bu - u0) * inv)))
    const j0 = Math.max(0, Math.min(nv - 1, Math.floor((av - v0) * inv)))
    const j1 = Math.max(0, Math.min(nv - 1, Math.floor((bv - v0) * inv)))
    lo[t * 4] = i0
    lo[t * 4 + 1] = i1
    lo[t * 4 + 2] = j0
    lo[t * 4 + 3] = j1
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) cnt[j * nu + i + 1]++
    }
  }
  for (let i = 0; i < nu * nv; i++) cnt[i + 1] += cnt[i]
  const items = new Uint32Array(cnt[nu * nv])
  const fill = cnt.slice(0, nu * nv)
  for (let t = 0; t < n; t++) {
    const i0 = lo[t * 4]
    const i1 = lo[t * 4 + 1]
    const j0 = lo[t * 4 + 2]
    const j1 = lo[t * 4 + 3]
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) items[fill[j * nu + i]++] = t
    }
  }
  return { nu, nv, u0, v0, inv, start: cnt, items }
}

export type Solid = {
  soup: Soup
  min: Vec3
  max: Vec3
  runs(axis: 0 | 1 | 2, u: number, v: number): Span[]
  runsZ(x: number, y: number): Span[]
  inside(x: number, y: number, z: number): boolean
  volume(): number
}

const E1 = 1.7e-4
const E2 = 1.0513e-4

let sHit = new Float64Array(64)
let sDir = new Int8Array(64)
let sOrd = new Int32Array(64)
const skrapePlass = (n: number) => {
  if (n <= sHit.length) return
  const m = 1 << (32 - Math.clz32(n - 1))
  sHit = new Float64Array(m)
  sDir = new Int8Array(m)
  sOrd = new Int32Array(m)
}

export function makeSolid(soup: Soup): Solid {
  const buckets: (Bucket | null)[] = [null, null, null]
  const P = soup.pos

  const runs = (axis: 0 | 1 | 2, uq: number, vq: number): Span[] => {
    let bk = buckets[axis]
    if (!bk) {
      bk = bucketFor(soup, axis)
      buckets[axis] = bk
    }
    const { u, v, w } = AX[axis]
    const uu = uq + E1
    const vv = vq + E2
    const i = Math.floor((uu - bk.u0) * bk.inv)
    const j = Math.floor((vv - bk.v0) * bk.inv)
    if (i < 0 || j < 0 || i >= bk.nu || j >= bk.nv) return []
    const s0 = bk.start[j * bk.nu + i]
    const s1 = bk.start[j * bk.nu + i + 1]
    if (s1 <= s0) return []

    skrapePlass(s1 - s0)
    const hit = sHit
    const dir = sDir
    let nh = 0
    for (let s = s0; s < s1; s++) {
      const o = bk.items[s] * 9
      const au = P[o + u]
      const av = P[o + v]
      const aw = P[o + w]
      const bu = P[o + 3 + u]
      const bv = P[o + 3 + v]
      const bw = P[o + 3 + w]
      const cu = P[o + 6 + u]
      const cv = P[o + 6 + v]
      const cw = P[o + 6 + w]
      const d = (bu - au) * (cv - av) - (bv - av) * (cu - au)
      if (d > -1e-12 && d < 1e-12) continue
      const w0 = (bu - uu) * (cv - vv) - (bv - vv) * (cu - uu)
      const w1 = (cu - uu) * (av - vv) - (cv - vv) * (au - uu)
      const w2 = (au - uu) * (bv - vv) - (av - vv) * (bu - uu)
      if (d > 0) {
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
      } else if (w0 > 0 || w1 > 0 || w2 > 0) continue
      hit[nh] = aw === bw && bw === cw ? aw : (w0 * aw + w1 * bw + w2 * cw) / d
      dir[nh] = d < 0 ? 1 : -1
      nh++
    }
    if (!nh) return []

    const ord = sOrd
    for (let k = 0; k < nh; k++) {
      const kk = k
      const hk = hit[kk]
      const dk = dir[kk]
      let q = k - 1
      for (; q >= 0 && (hit[ord[q]] > hk || (hit[ord[q]] === hk && dir[ord[q]] < dk)); q--) ord[q + 1] = ord[q]
      ord[q + 1] = kk
    }
    const out: Span[] = []
    let depth = 0
    let open = 0
    for (let q = 0; q < nh; q++) {
      const k = ord[q]
      const was = depth
      depth += dir[k]
      if (was <= 0 && depth > 0) open = hit[k]
      else if (was > 0 && depth <= 0 && hit[k] - open > 1e-6) out.push([open, hit[k]])
    }
    return out
  }

  const runsZ = (x: number, y: number) => runs(2, x, y)

  return {
    soup,
    min: soup.min,
    max: soup.max,
    runs,
    runsZ,
    inside(x, y, z) {
      for (const [lo, hi] of runsZ(x, y)) if (z >= lo && z <= hi) return true
      return false
    },
    volume() {
      let v = 0
      for (let t = 0; t < soup.tris; t++) {
        const i = t * 9
        v +=
          (P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) -
            P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) +
            P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6])) /
          6
      }
      return Math.abs(v)
    },
  }
}
