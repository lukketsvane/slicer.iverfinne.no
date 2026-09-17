import { keep } from "./core"
import {
  flip,
  makeSoup,
  openEdges,
  plassering,
  shade,
  signedVolume,
  weld,
  type Indexed,
  type Soup,
} from "./soup"
import { decimate } from "./mesh/simplify"
import { taubin } from "./mesh/smooth"
import { makeSolid, type Solid } from "./mesh/solid"
import { generasjon, source } from "./sources"
import { eiKjelde, lesScene, SCENE_TAK } from "./scene"
import { akser, avFlata, inn, type Ramme } from "./plan"
import { PLAN_TAK } from "./plan"
import type { Vec3 } from "./core"
import type { Params } from "./params"

export type BitBoks = { id: string; farge?: number; min: Vec3; max: Vec3 }

export type Kropp = {
  soup: Soup
  bitar: BitBoks[]
  skala: number
  nrm: Float32Array
  net: Indexed
  solid: Solid
  srcTris: number
  openEdges: number
}

type Net = { net: Indexed; srcTris: number; openEdges: number; bitar: BitBoks[] }

const NETT_NOKKEL = (p: Params) => [scenaAv(p), generasjon(), p.trekant, p.glatt].join("|")
const KROPP_NOKKEL = (p: Params) =>
  [scenaAv(p), generasjon(), p.trekant, p.glatt, p.storleik, p.rotX, p.rotY, p.rotZ].join("|")

export const scenaAv = (p: Params) => p.scene || eiKjelde(p.kjelde)

type Kjeldenett = { net: Indexed; tris: number; opne: number }
const KJELDE_HUGS = keep<Kjeldenett>(SCENE_TAK + 4)

let kjeldeTreff = 0
let kjeldeBom = 0
export const kjeldeTal = () => ({ treff: kjeldeTreff, bom: kjeldeBom })
export const kjeldeNull = () => {
  kjeldeTreff = 0
  kjeldeBom = 0
}

function kjeldenett(id: string, tak: number, glatt: number): Kjeldenett {
  let bom = false
  const ut = KJELDE_HUGS([id, generasjon(), tak, glatt].join("|"), () => {
    bom = true
    const src = source(id)
    let net = weld(src)
    if (signedVolume(net) < 0) net = flip(net)
    net = decimate(net, tak)
    net = taubin(net, glatt)
    return { net, tris: src.tris, opne: openEdges(net) }
  })
  if (bom) kjeldeBom++
  else kjeldeTreff++
  return ut
}

function budsjett(idar: readonly string[], tak: number): Map<string, number> {
  const eine = [...new Set(idar)]
  const inn = eine.map((id) => source(id).tris)
  const sum = inn.reduce((a, c) => a + c, 0) || 1
  return new Map(eine.map((id, i) => [id, Math.max(64, Math.round((tak * inn[i]) / sum))]))
}

function samlaNett(p: Params): Net {
  const lest = lesScene(scenaAv(p))
  const bitar = lest.length ? lest : lesScene(eiKjelde(p.kjelde))
  const tak = budsjett(bitar.map((b) => b.id), Math.max(64, Math.round(p.trekant * 1000)))
  const boksar: BitBoks[] = []
  const delar: { verts: Float32Array; idx: Uint32Array }[] = []
  let tris = 0
  let opne = 0
  let nv = 0
  let ni = 0
  for (const b of bitar) {
    const kj = kjeldenett(b.id, tak.get(b.id) ?? 64, p.glatt)
    const src = source(b.id)
    tris += kj.tris
    opne += kj.opne
    const span = Math.max(src.max[0] - src.min[0], src.max[1] - src.min[1], src.max[2] - src.min[2], 1e-6)
    const k: Vec3 = [(100 * b.s[0]) / span, (100 * b.s[1]) / span, (100 * b.s[2]) / span]
    const cx = (src.min[0] + src.max[0]) / 2
    const cy = (src.min[1] + src.max[1]) / 2
    const cz = src.min[2]
    const a = (b.rz * Math.PI) / 180
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const P = kj.net.verts
    const ut = new Float32Array(P.length)
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < P.length; i += 3) {
      const x = (P[i] - cx) * k[0]
      const y = (P[i + 1] - cy) * k[1]
      const z = (P[i + 2] - cz) * k[2]
      const qx = x * c - y * sn + b.t[0]
      const qy = x * sn + y * c + b.t[1]
      const qz = z + b.t[2]
      ut[i] = qx
      ut[i + 1] = qy
      ut[i + 2] = qz
      if (qx < lo[0]) lo[0] = qx
      if (qy < lo[1]) lo[1] = qy
      if (qz < lo[2]) lo[2] = qz
      if (qx > hi[0]) hi[0] = qx
      if (qy > hi[1]) hi[1] = qy
      if (qz > hi[2]) hi[2] = qz
    }
    delar.push({ verts: ut, idx: kj.net.idx })
    boksar.push({ id: b.id, farge: b.farge, min: lo, max: hi })
    nv += ut.length
    ni += kj.net.idx.length
  }
  if (delar.length === 1) return { net: { verts: delar[0].verts, idx: delar[0].idx }, srcTris: tris, openEdges: opne, bitar: boksar }
  const verts = new Float32Array(nv)
  const idx = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const d of delar) {
    verts.set(d.verts, vo)
    const off = vo / 3
    for (let i = 0; i < d.idx.length; i++) idx[io + i] = d.idx[i] + off
    vo += d.verts.length
    io += d.idx.length
  }
  return { net: { verts, idx }, srcTris: tris, openEdges: opne, bitar: boksar }
}

const NETT_HUGS = keep<Net>(2)
const KROPP_HUGS = keep<Kropp>(3)

function makeNet(p: Params): Net {
  return NETT_HUGS(NETT_NOKKEL(p), () => samlaNett(p))
}

export function makeKropp(p: Params): Kropp {
  return KROPP_HUGS(KROPP_NOKKEL(p), () => {
    const n = makeNet(p)
    const pl = plassering(n.net.verts, p)
    const net = { verts: pl.pos, idx: n.net.idx }
    const flat = shade(net)
    const soup = makeSoup(flat.pos)
    const bitar = n.bitar.map((b) => {
      const lo: Vec3 = [Infinity, Infinity, Infinity]
      const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < 8; i++) {
        const q = pl.vend([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]])
        for (let a = 0; a < 3; a++) {
          if (q[a] < lo[a]) lo[a] = q[a]
          if (q[a] > hi[a]) hi[a] = q[a]
        }
      }
      return { id: b.id, farge: b.farge, min: lo, max: hi }
    })
    return {
      soup,
      nrm: flat.nrm,
      net,
      solid: makeSolid(soup),
      srcTris: n.srcTris,
      openEdges: n.openEdges,
      bitar,
      skala: pl.k,
    }
  })
}

const VENDT = new WeakMap<Kropp, Map<string, { sol: Solid; b: number }>>()
const VENDT_BUDSJETT = 24 * 1024 * 1024
const VENDT_TAK = PLAN_TAK

let vendTreff = 0
let vendBom = 0
export const vendTal = () => ({ treff: vendTreff, bom: vendBom })
export const vendNull = () => {
  vendTreff = 0
  vendBom = 0
}

export function vend(k: Kropp, n: Vec3): Solid {
  const key = n.map((c) => c.toFixed(4)).join(",")
  let per = VENDT.get(k)
  if (!per) {
    per = new Map()
    VENDT.set(k, per)
  }
  const hit = per.get(key)
  if (hit) {
    vendTreff++
    per.delete(key)
    per.set(key, hit)
    return hit.sol
  }
  vendBom++
  const { u, v } = akser(n)
  const P = k.soup.pos
  const ut = new Float32Array(P.length)
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]
    const y = P[i + 1]
    const z = P[i + 2]
    ut[i] = x * u[0] + y * u[1] + z * u[2]
    ut[i + 1] = x * v[0] + y * v[1] + z * v[2]
    ut[i + 2] = x * n[0] + y * n[1] + z * n[2]
  }
  const sol = makeSolid(makeSoup(ut))
  per.set(key, { sol, b: ut.byteLength })
  let bruk = 0
  for (const q of per.values()) bruk += q.b
  while (per.size > 1 && (bruk > VENDT_BUDSJETT || per.size > VENDT_TAK)) {
    const eldst = per.keys().next().value as string
    bruk -= per.get(eldst)?.b ?? 0
    per.delete(eldst)
  }
  return sol
}

const RULLA = new WeakMap<Kropp, Map<string, Solid>>()
const RULLA_TAK = 8
const RULL_TOL = 0.05

export function rull(k: Kropp, r: Ramme): Solid {
  const key = [r.o, r.n, r.u].flat().map((c) => c.toFixed(4)).join(",") + "|" + r.k.toFixed(8)
  let per = RULLA.get(k)
  if (!per) {
    per = new Map()
    RULLA.set(k, per)
  }
  const hit = per.get(key)
  if (hit) return hit
  const P = k.soup.pos
  const lim = Math.sqrt(8 * Math.abs(1 / r.k) * RULL_TOL)
  const ut: number[] = []
  const flat = (p: Vec3): Vec3 => {
    const q = inn(r, p)
    return [q[0], q[1], avFlata(r, p)]
  }
  const del = (a: Vec3, b: Vec3, c: Vec3, djup: number) => {
    const lang =
      djup < 6 &&
      Math.max(
        Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
        Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]),
        Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]),
      ) > lim
    if (!lang) {
      ut.push(...flat(a), ...flat(b), ...flat(c))
      return
    }
    const m = (x: Vec3, y: Vec3): Vec3 => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2]
    const ab = m(a, b)
    const bc = m(b, c)
    const ca = m(c, a)
    del(a, ab, ca, djup + 1)
    del(ab, b, bc, djup + 1)
    del(ca, bc, c, djup + 1)
    del(ab, bc, ca, djup + 1)
  }
  for (let i = 0; i < P.length; i += 9) {
    del([P[i], P[i + 1], P[i + 2]], [P[i + 3], P[i + 4], P[i + 5]], [P[i + 6], P[i + 7], P[i + 8]], 0)
  }
  const sol = makeSolid(makeSoup(new Float32Array(ut)))
  per.set(key, sol)
  if (per.size > RULLA_TAK) per.delete(per.keys().next().value as string)
  return sol
}
