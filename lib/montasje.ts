import type { Vec3 } from "./core"
import { newSoup, ribSolid } from "./mesh"
import { placedRings, type Nesting } from "./nest"
import type { Del, Snitt } from "./snitt"
import type { Ramme } from "./plan"

export type Veg = "ned" | "opp" | "side" | "ligg" | "boygd"

export function vegen(m: Vec3 | null, boygd = false): Veg {
  if (boygd) return "boygd"
  if (!m) return "ligg"
  if (m[2] < -0.7) return "ned"
  if (m[2] > 0.7) return "opp"
  return "side"
}

export type MontDel = {
  adr: string
  steg: number
  ark: number
  veg: Veg
  positions: Float32Array
  boygd?: Float32Array
  ferdig: Float32Array
  flat: Float32Array
}

export type Montasje = {
  steg: number
  delar: MontDel[]
  boks: { min: Vec3; max: Vec3 }
}

const eiga = (t: number): Ramme => ({ o: [0, 0, t / 2], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], k: 0 })

const ferdigMat = (r: Ramme, t: number): Float32Array =>
  new Float32Array([
    r.u[0], r.u[1], r.u[2], 0,
    r.v[0], r.v[1], r.v[2], 0,
    r.n[0], r.n[1], r.n[2], 0,
    r.o[0] - (t / 2) * r.n[0], r.o[1] - (t / 2) * r.n[1], r.o[2] - (t / 2) * r.n[2], 1,
  ])

const flatMat = (m: readonly number[], off: Vec3): Float32Array =>
  new Float32Array([
    m[0], m[3], 0, 0,
    m[1], m[4], 0, 0,
    0, 0, 1, 0,
    m[2] + off[0], m[5] + off[1], off[2], 1,
  ])

const RETN_NULL = 1e-4
function retning(n: Vec3): string {
  let s: Vec3 = [n[0], n[1], n[2]]
  for (const c of s) {
    if (Math.abs(c) >= RETN_NULL) {
      if (c < 0) s = [-s[0], -s[1], -s[2]]
      break
    }
  }
  return s.map((c) => (Math.abs(c) < RETN_NULL ? 0 : c).toFixed(3)).join(",")
}

function stega(sn: Snitt, delar: readonly Del[]): Map<number, number> {
  const normal = new Map(sn.ribber.map((r) => [r.plan.id, r.r.n]))
  const ut = new Map<number, number>()
  let steg = -1
  let sist = ""
  for (const id of sn.montering.orden) {
    const n = normal.get(id)
    if (!n) continue
    const k = retning(n)
    if (k !== sist) {
      steg++
      sist = k
    }
    ut.set(id, steg)
  }
  const laus = delar.filter((d) => !ut.has(d.plan))
  if (laus.length) {
    steg++
    for (const d of laus) ut.set(d.plan, steg)
  }
  return ut
}

export const STABEL_LUFT = 3

export function montasjen(sn: Snitt, delar: readonly Del[], ns: Nesting, t: number, min: Vec3, max: Vec3): Montasje {
  const rammer = new Map(sn.ribber.map((r) => [r.plan.id, r.r]))
  const brukt = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const sh of ns.sheets) {
    for (const q of sh.placed) {
      for (const pt of placedRings(q).outline) {
        brukt.x0 = Math.min(brukt.x0, pt[0])
        brukt.y0 = Math.min(brukt.y0, pt[1])
        brukt.x1 = Math.max(brukt.x1, pt[0])
        brukt.y1 = Math.max(brukt.y1, pt[1])
      }
    }
  }
  const skuv = (i: number): Vec3 => [
    (min[0] + max[0]) / 2 - (brukt.x0 + brukt.x1) / 2,
    (min[1] + max[1]) / 2 - (brukt.y0 + brukt.y1) / 2,
    min[2] + i * t * STABEL_LUFT,
  ]
  const lagd = new Map<string, { ark: number; m: readonly number[]; off: Vec3 }>()
  ns.sheets.forEach((sh, i) =>
    sh.placed.forEach((q) => lagd.set(q.part.adr, { ark: i + 1, m: q.slot.m, off: skuv(i) })),
  )
  const steg = stega(sn, delar)
  const lokal = eiga(t)
  const ut: MontDel[] = []
  for (const d of delar) {
    const r = rammer.get(d.plan)
    const p = lagd.get(d.adr)
    if (!r || !p) continue
    const s = newSoup()
    ribSolid(s, { r: lokal, outlines: [d.outline], holes: d.holes }, t)
    const m: MontDel = {
      adr: d.adr,
      steg: steg.get(d.plan) ?? 0,
      ark: p.ark,
      veg: vegen(sn.montering.retning[d.plan] ?? null, sn.montering.boygde.includes(d.plan)),
      positions: new Float32Array(s.pos),
      ferdig: ferdigMat(r, t),
      flat: flatMat(p.m, p.off),
    }
    if (r.k) {
      const b = newSoup()
      ribSolid(b, { r, outlines: [d.outline], holes: d.holes }, t)
      m.boygd = new Float32Array(b.pos)
    }
    ut.push(m)
  }
  return { steg: Math.max(1, ...ut.map((d) => d.steg + 1)), delar: ut, boks: boksen(ut) }
}

function boksen(delar: readonly MontDel[]): { min: Vec3; max: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const d of delar) {
    const a: Vec3 = [Infinity, Infinity, Infinity]
    const b: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < d.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        a[k] = Math.min(a[k], d.positions[i + k])
        b[k] = Math.max(b[k], d.positions[i + k])
      }
    }
    for (const M of [d.ferdig, d.flat]) {
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? b[0] : a[0]
        const y = c & 2 ? b[1] : a[1]
        const z = c & 4 ? b[2] : a[2]
        for (let k = 0; k < 3; k++) {
          const q = M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k]
          lo[k] = Math.min(lo[k], q)
          hi[k] = Math.max(hi[k], q)
        }
      }
    }
  }
  if (!Number.isFinite(lo[0])) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min: lo, max: hi }
}
