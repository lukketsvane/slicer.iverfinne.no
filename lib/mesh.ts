import { Earcut } from "three/src/extras/Earcut.js"
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

function reinRing(ring: Pt[]): Pt[] {
  const ulik = ring.filter((p, i) => { const a = ring[(i + ring.length - 1) % ring.length]; return p[0] !== a[0] || p[1] !== a[1] })
  return ulik.filter((p, i) => {
    const a = ulik[(i + ulik.length - 1) % ulik.length], b = ulik[(i + 1) % ulik.length]
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
  })
}

function paaU(a: Pt, b: Pt, u: number): Pt {
  if (a[0] > b[0]) return paaU(b, a, u)
  return [u, a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]
}

function trianguler(omriss: Pt[], hol: Pt[][], steg: number): [Pt, Pt, Pt][] {
  const punkt = omriss.slice()
  const start: number[] = []
  for (const h of hol) { start.push(punkt.length); punkt.push(...h) }
  const indeks = Earcut.triangulate(punkt.flat(), start)
  const ut: [Pt, Pt, Pt][] = []
  const klipp = (ring: Pt[], lo: number, hi: number) => {
    const ny: Pt[] = []
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      if (a[0] >= lo && a[0] <= hi) ny.push(a)
      for (const u of a[0] < b[0] ? [lo, hi] : [hi, lo]) {
        if ((a[0] < u && b[0] > u) || (a[0] > u && b[0] < u)) ny.push(paaU(a, b, u))
      }
    }
    return ny
  }
  for (let i = 0; i < indeks.length; i += 3) {
    const a = punkt[indeks[i]], b = punkt[indeks[i + 1]], c = punkt[indeks[i + 2]]
    if (!Number.isFinite(steg)) { ut.push([a, b, c]); continue }
    const lo = Math.floor(Math.min(a[0], b[0], c[0]) / steg)
    const hi = Math.ceil(Math.max(a[0], b[0], c[0]) / steg)
    for (let j = lo; j < hi; j++) {
      const ring = klipp([a, b, c], j * steg, (j + 1) * steg)
      for (let k = 1; k + 1 < ring.length; k++) ut.push([ring[0], ring[k], ring[k + 1]])
    }
  }
  return ut
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
  const radius = boygd ? Math.abs(1 / r.r.k) + h : Infinity
  const steg = boygd ? 4 * Math.asin(Math.sqrt(Math.min(1, 0.05 / (2 * radius)))) / Math.abs(r.r.k) : Infinity
  const kant = (a: Pt, b: Pt, lo: number, hi: number) => {
    const punkt = [a]
    if (boygd) {
      const u0 = Math.min(a[0], b[0]), u1 = Math.max(a[0], b[0])
      for (let j = Math.floor(u0 / steg) + 1; j * steg < u1; j++) punkt.push(paaU(a, b, j * steg))
      if (a[0] > b[0]) punkt.splice(1, punkt.length - 1, ...punkt.slice(1).reverse())
    }
    punkt.push(b)
    for (let i = 0; i + 1 < punkt.length; i++) {
      const q0 = punkt[i], q1 = punkt[i + 1]
      tri(s, put(q0, lo), put(q1, lo), put(q1, hi))
      tri(s, put(q0, lo), put(q1, hi), put(q0, hi))
    }
  }
  const flate = (a: Pt, b: Pt, c: Pt, off: number, n?: Vec3) => tri(s, put(a, off), put(b, off), put(c, off), n)
  const hol = r.holes.map(reinRing)
  for (let oi = 0; oi < r.outlines.length; oi++) {
    const o = reinRing(r.outlines[oi])
    s.d = del0 < 0 ? -1 : del0 + oi
    const mine = hol.filter((hole) => hole.length >= 3 && inRing(o, hole[0]))
    const bak = trianguler(o, mine, steg)
    s.k = 0
    for (const [a, b, c] of bak) flate(c, b, a, -h, boygd ? undefined : nBack)
    const lommer = merke ? merke.flater.filter((f) => inRing(o, f.ytre[0])).map((f) => ({ ytre: reinRing(f.ytre), indre: f.indre.map(reinRing) })) : []
    const framme = lommer.length ? trianguler(o, [...mine, ...lommer.map((f) => f.ytre)], steg) : bak
    for (const [a, b, c] of framme) flate(a, b, c, h, boygd ? undefined : r.r.n)
    if (merke && lommer.length) {
      const botn = h - merke.djup
      const vegg = (ring: Pt[], lag: number, hogg: number, utover: boolean) => {
        s.k = 1
        for (let i = 0; i < ring.length; i++) {
          const a = utover ? ring[i] : ring[(i + 1) % ring.length]
          const b = utover ? ring[(i + 1) % ring.length] : ring[i]
          kant(a, b, lag, hogg)
        }
      }
      for (const f of lommer) {
        s.k = 0
        for (const [a, b, c] of trianguler(f.ytre, f.indre, steg)) flate(a, b, c, botn, boygd ? undefined : r.r.n)
        vegg(f.ytre, botn, h, false)
        for (const q of f.indre) {
          vegg(q, botn, h, true)
          s.k = 0
          for (const [a, b, c] of trianguler(q, [], steg)) flate(a, b, c, h, boygd ? undefined : r.r.n)
        }
      }
    }
    s.k = 1
    for (const ring of [o, ...mine]) {
      for (let i = 0; i < ring.length; i++) kant(ring[i], ring[(i + 1) % ring.length], -h, h)
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
