import { bbox, inRing, type Pt, type Vec3 } from "./core"
import { merkeFlater, type Flate } from "./merke"
import { anchor } from "./pack"
import { fitSize } from "./stroke"
import type { Kropp } from "./kropp"
import { placedRings, type Nesting } from "./nest"
import { ut, type Ramme } from "./plan"
import type { Del, Ribbe, Snitt } from "./snitt"

export type Soup = { pos: number[]; nrm: number[]; kan: number[]; k: number; del: number[]; d: number }
export const newSoup = (): Soup => ({ pos: [], nrm: [], kan: [], k: 1, del: [], d: -1 })

export function tri(s: Soup, a: Vec3, b: Vec3, c: Vec3, n?: Vec3) {
  let nx: number
  let ny: number
  let nz: number
  if (n) [nx, ny, nz] = n
  else {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz) || 1
    nx /= L
    ny /= L
    nz /= L
  }
  s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  for (let i = 0; i < 3; i++) s.nrm.push(nx, ny, nz)
  s.kan.push(s.k, s.k, s.k)
  s.del.push(s.d, s.d, s.d)
}

export function soupToMesh(s: Soup) {
  const positions = new Float32Array(s.pos)
  const normals = new Float32Array(s.nrm)
  return { positions, normals, kant: new Float32Array(s.kan), del: new Float32Array(s.del), ...boxOf(positions) }
}

export function boxOf(positions: Float32Array) {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 1
  }
  return { tris: positions.length / 9, min, max }
}

function earClip(poly: Pt[]): [Pt, Pt, Pt][] {
  const n = poly.length
  if (n < 3) return []
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const idx = Array.from({ length: n }, (_, i) => i)
  if (area < 0) idx.reverse()
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const same = (u: Pt, v: Pt) => u[0] === v[0] && u[1] === v[1]
  const inside = (a: Pt, b: Pt, c: Pt, p: Pt) =>
    !same(p, a) && !same(p, b) && !same(p, c) && cross(a, b, p) > 0 && cross(b, c, p) > 0 && cross(c, a, p) > 0
  const out: [Pt, Pt, Pt][] = []
  let guard = idx.length * idx.length + 16
  while (idx.length > 3 && guard-- > 0) {
    let cut = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]
      const ib = idx[i]
      const ic = idx[(i + 1) % idx.length]
      const a = poly[ia]
      const b = poly[ib]
      const c = poly[ic]
      const cc = cross(a, b, c)
      if (cc === 0) {
        if (!same(a, b) && !same(b, c)) out.push([a, b, c])
        idx.splice(i, 1)
        cut = true
        break
      }
      if (cc < 0) continue
      let bad = false
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue
        if (inside(a, b, c, poly[j])) {
          bad = true
          break
        }
      }
      if (bad) continue
      out.push([a, b, c])
      idx.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  if (idx.length === 3) out.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]])
  return out
}

export function bridge(outline: Pt[], holes: Pt[][]): Pt[] {
  let poly = outline.slice()
  for (const h of holes) {
    let bi = 0
    let hi = 0
    let best = Infinity
    for (let i = 0; i < poly.length; i++) {
      for (let j = 0; j < h.length; j++) {
        const d = Math.hypot(poly[i][0] - h[j][0], poly[i][1] - h[j][1])
        if (d < best) {
          best = d
          bi = i
          hi = j
        }
      }
    }
    const ring = h.slice(hi).concat(h.slice(0, hi))
    let a2 = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      a2 += a[0] * b[1] - b[0] * a[1]
    }
    const r = a2 > 0 ? ring.slice().reverse() : ring
    poly = poly.slice(0, bi + 1).concat(r, [r[0]], poly.slice(bi))
  }
  return poly
}

export function flateMesh(k: Kropp) {
  const positions = k.soup.pos.slice()
  const normals = k.nrm.slice()
  return { positions, normals, kant: new Float32Array(0), ...boxOf(positions) }
}

export function ribSolid(s: Soup, r: Pick<Ribbe, "r" | "outlines" | "holes">, t: number, del0 = -1, merke?: Merke) {
  const h = t / 2
  const put = (q: Pt, off: number): Vec3 => ut(r.r, q, off)
  const boygd = !!r.r.k
  const nBack: Vec3 = [-r.r.n[0], -r.r.n[1], -r.r.n[2]]
  const lim = boygd ? Math.sqrt(8 * Math.abs(1 / r.r.k) * 0.05) : Infinity
  const flate = (a: Pt, b: Pt, c: Pt, off: number, n: Vec3 | undefined, djup: number) => {
    const lang =
      djup < 5 &&
      Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1])) > lim
    if (!lang) {
      tri(s, put(a, off), put(b, off), put(c, off), n)
      return
    }
    const m = (x: Pt, y: Pt): Pt => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2]
    const ab = m(a, b)
    const bc = m(b, c)
    const ca = m(c, a)
    flate(a, ab, ca, off, n, djup + 1)
    flate(ab, b, bc, off, n, djup + 1)
    flate(ca, bc, c, off, n, djup + 1)
    flate(ab, bc, ca, off, n, djup + 1)
  }
  for (let oi = 0; oi < r.outlines.length; oi++) {
    const o = r.outlines[oi]
    s.d = del0 < 0 ? -1 : del0 + oi
    const mine = r.holes.filter((hole) => inRing(o, hole[0]))
    const merged = mine.length ? bridge(o, mine) : o
    s.k = 0
    for (const [a, b, c] of earClip(merged)) flate(c, b, a, -h, boygd ? undefined : nBack, 0)
    const lommer = merke ? merke.flater.filter((f) => inRing(o, f.ytre[0])) : []
    const framme = lommer.length ? bridge(o, [...mine, ...lommer.map((f) => f.ytre)]) : merged
    for (const [a, b, c] of earClip(framme)) flate(a, b, c, h, boygd ? undefined : r.r.n, 0)
    if (merke && lommer.length) {
      const botn = h - merke.djup
      const vegg = (ring: Pt[], lag: number, hogg: number, utover: boolean) => {
        s.k = 1
        for (let i = 0; i < ring.length; i++) {
          const a = utover ? ring[i] : ring[(i + 1) % ring.length]
          const b = utover ? ring[(i + 1) % ring.length] : ring[i]
          tri(s, put(a, lag), put(b, lag), put(b, hogg))
          tri(s, put(a, lag), put(b, hogg), put(a, hogg))
        }
      }
      for (const f of lommer) {
        s.k = 0
        const golv = f.indre.length ? bridge(f.ytre, f.indre.map((q) => q.slice().reverse())) : f.ytre
        for (const [a, b, c] of earClip(golv)) flate(a, b, c, botn, boygd ? undefined : r.r.n, 0)
        vegg(f.ytre, botn, h, false)
        for (const q of f.indre) {
          vegg(q, botn, h, true)
          s.k = 0
          for (const [a, b, c] of earClip(q)) flate(a, b, c, h, boygd ? undefined : r.r.n, 0)
        }
      }
    }
    s.k = 1
    for (const ring of [o, ...mine]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        tri(s, put(a, -h), put(b, -h), put(b, h))
        tri(s, put(a, -h), put(b, h), put(a, h))
      }
    }
  }
}

export function lagMesh(sn: Snitt, t: number) {
  const s = newSoup()
  let del = 0
  for (const r of sn.ribber) {
    ribSolid(s, r, t, del)
    del += r.outlines.length
  }
  return soupToMesh(s)
}

export type DelMesh = { adr: string; positions: Float32Array; tris: number }

const delMesh = (adr: string, s: Soup): DelMesh => ({
  adr,
  positions: new Float32Array(s.pos),
  tris: s.pos.length / 9,
})

export type Merke = { flater: Flate[]; djup: number }

export function merkeFor(q: Del, t: number): Merke | undefined {
  const a = anchor([q.outline, ...q.holes])
  const bb = bbox(q.outline)
  const size = fitSize(q.adr, a.room, a.wide)
  if (!size) return undefined
  const brei = Math.max(0.3, Math.min(0.8, size / 8))
  const flater = merkeFlater(q.adr, a.p[0] + bb.x0, a.p[1] + bb.y0, size, brei)
  if (!flater.length) return undefined
  return { flater, djup: Math.min(1, t / 3) }
}

export function lagDelar(sn: Snitt, delar: readonly Del[], t: number, merk = false): DelMesh[] {
  const rammer = new Map(sn.ribber.map((r) => [r.plan.id, r.r]))
  const ut: DelMesh[] = []
  for (const q of delar) {
    const r = rammer.get(q.plan)
    if (!r) continue
    const s = newSoup()
    ribSolid(s, { r, outlines: [q.outline], holes: q.holes }, t, -1, merk ? merkeFor(q, t) : undefined)
    ut.push(delMesh(q.adr, s))
  }
  return ut
}

const flatRamme = (dx: number, t: number): Ramme => ({
  o: [dx, 0, t / 2],
  n: [0, 0, 1],
  u: [1, 0, 0],
  v: [0, 1, 0],
  k: 0,
})

export function flatDelar(ns: Nesting, t: number, merk = false): { ark: number; delar: DelMesh[] }[] {
  return ns.sheets.map((sh, i) => {
    const r = flatRamme(i * ns.sheetW * 1.1, t)
    return {
      ark: i + 1,
      delar: sh.placed.map((q) => {
        const rg = placedRings(q)
        const s = newSoup()
        ribSolid(s, { r, outlines: [rg.outline], holes: rg.holes }, t, -1, merk ? merkeFor({ ...q.part, outline: rg.outline, holes: rg.holes }, t) : undefined)
        return delMesh(q.part.adr, s)
      }),
    }
  })
}
