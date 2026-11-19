import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { makeSoup } from "../../lib/soup"
import { put } from "../../lib/sources"
import { parseMesh } from "../../lib/io"
import { newSoup, ribSolid } from "../../lib/mesh"
import { meshToGlb } from "../../lib/export-glb"
import type { Plan } from "../../lib/plan"

export type Pt = [number, number]
export type Vec3 = [number, number, number]
export type RZ = [number, number]
export type Nett = Float32Array

const areal2 = (r: readonly Pt[]) => {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i]
    const q = r[(i + 1) % r.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

export function volum(pos: Nett): number {
  let v = 0
  for (let i = 0; i + 8 < pos.length; i += 9) {
    v +=
      (pos[i] * (pos[i + 4] * pos[i + 8] - pos[i + 5] * pos[i + 7]) -
        pos[i + 1] * (pos[i + 3] * pos[i + 8] - pos[i + 5] * pos[i + 6]) +
        pos[i + 2] * (pos[i + 3] * pos[i + 7] - pos[i + 4] * pos[i + 6])) /
      6
  }
  return v
}

export function snu(pos: Nett): Nett {
  const ut = new Float32Array(pos.length)
  for (let i = 0; i + 8 < pos.length; i += 9) {
    ut.set(pos.subarray(i, i + 3), i)
    ut.set(pos.subarray(i + 6, i + 9), i + 3)
    ut.set(pos.subarray(i + 3, i + 6), i + 6)
  }
  return ut
}

export const utover = (pos: Nett): Nett => (volum(pos) < 0 ? snu(pos) : pos)

export function saman(...nett: Nett[]): Nett {
  const ut = new Float32Array(nett.reduce((n, q) => n + q.length, 0))
  let o = 0
  for (const q of nett) {
    ut.set(q, o)
    o += q.length
  }
  return ut
}

export function flytt(pos: Nett, t: Vec3, vriZ = 0): Nett {
  const c = Math.cos((vriZ * Math.PI) / 180)
  const s = Math.sin((vriZ * Math.PI) / 180)
  const ut = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    ut[i] = pos[i] * c - pos[i + 1] * s + t[0]
    ut[i + 1] = pos[i] * s + pos[i + 1] * c + t[1]
    ut[i + 2] = pos[i + 2] + t[2]
  }
  return ut
}

function kryssar(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const e = 1e-9
  return o(a, b, c) * o(a, b, d) < -e && o(c, d, a) * o(c, d, b) < -e
}

export function ringKryssar(ring: readonly Pt[]): boolean {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (kryssar(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true
    }
  }
  return false
}

export function dreiRing(ring: readonly RZ[], seg = 96): Nett {
  if (ring.length < 3) throw new Error("dreiRing: ringen treng minst tre punkt")
  if (ring.some((p) => p[0] < -1e-9)) throw new Error("dreiRing: negativ radius")
  if (ringKryssar(ring as Pt[])) throw new Error("dreiRing: tverrsnittet kryssar seg sjølv — veggen er tjukkare enn ein hol radius i profilen")
  const ut: number[] = []
  const n = ring.length
  const cs = Array.from({ length: seg + 1 }, (_, i) => [Math.cos((2 * Math.PI * (i % seg)) / seg), Math.sin((2 * Math.PI * (i % seg)) / seg)])
  for (let j = 0; j < n; j++) {
    const [r0, z0] = ring[j]
    const [r1, z1] = ring[(j + 1) % n]
    const null0 = r0 < 1e-9
    const null1 = r1 < 1e-9
    if (null0 && null1) continue
    for (let i = 0; i < seg; i++) {
      const [c0, s0] = cs[i]
      const [c1, s1] = cs[i + 1]
      const A = [r0 * c0, r0 * s0, z0]
      const B = [r1 * c0, r1 * s0, z1]
      const C = [r1 * c1, r1 * s1, z1]
      const D = [r0 * c1, r0 * s1, z0]
      if (!null0) ut.push(...A, ...D, ...C)
      if (!null1) ut.push(...A, ...C, ...B)
    }
  }
  return utover(new Float32Array(ut))
}

function innover(profil: readonly RZ[], vegg: number): RZ[] {
  const n = profil.length
  const nrm = (a: RZ, b: RZ): Pt => {
    const dr = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dr, dz) || 1
    return [-dz / l, dr / l]
  }
  const ende = (p: RZ, a: RZ, b: RZ): RZ => {
    const m = nrm(a, b)
    const dr = b[0] - a[0]
    const dz = b[1] - a[1]
    if (Math.abs(dz) < Math.abs(dr)) return [p[0] + vegg * m[0], p[1] + vegg * m[1]]
    const t = (-vegg * m[1]) / dz
    return [p[0] + vegg * m[0] + t * dr, p[1]]
  }
  const ut: RZ[] = []
  for (let i = 0; i < n; i++) {
    const p = profil[i]
    if (i === 0) {
      ut.push(ende(p, profil[0], profil[1]))
      continue
    }
    if (i === n - 1) {
      ut.push(ende(p, profil[n - 2], profil[n - 1]))
      continue
    }
    const a = nrm(profil[i - 1], p)
    const b = nrm(p, profil[i + 1])
    const k = Math.max(0.25, 1 + a[0] * b[0] + a[1] * b[1])
    ut.push([p[0] + (vegg * (a[0] + b[0])) / k, p[1] + (vegg * (a[1] + b[1])) / k])
  }
  return ut
}

export type SkalVal = {
  vegg: number
  seg?: number
  nav?: { hogd: number; hol?: number }
}

export function skalRing(ytre: readonly RZ[], val: SkalVal): RZ[] {
  if (ytre.length < 2) throw new Error("skal: profilen treng minst to punkt, botn fyrst")
  const rHol = (val.nav?.hol ?? 0) / 2
  const ute: RZ[] = []
  let moett = false
  for (let i = 0; i < ytre.length; i++) {
    const p = ytre[i]
    if (i > 0 && p[0] <= rHol + 1e-9) {
      const q = ytre[i - 1]
      const t = Math.abs(q[0] - p[0]) < 1e-12 ? 1 : (q[0] - rHol) / (q[0] - p[0])
      ute.push([rHol, q[1] + (p[1] - q[1]) * t])
      moett = true
      break
    }
    ute.push([p[0], p[1]])
  }
  const zTopp = ute[ute.length - 1][1]
  const zNav = val.nav ? zTopp - val.nav.hogd : Infinity
  const inne0 = innover(ytre, val.vegg)
  const inne: RZ[] = []
  let ute2 = false
  for (let i = 0; i < inne0.length; i++) {
    const p = inne0[i]
    const utanfor = p[1] > zNav + 1e-9 || p[0] < rHol - 1e-9
    if (!utanfor) {
      inne.push([p[0], p[1]])
      continue
    }
    if (i === 0) throw new Error("skal: veggen er tjukkare enn botnradien")
    const q = inne0[i - 1]
    let t = 1
    if (p[1] > zNav) t = Math.min(t, (zNav - q[1]) / (p[1] - q[1]))
    if (p[0] < rHol) t = Math.min(t, (q[0] - rHol) / (q[0] - p[0]))
    const x: RZ = [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]
    inne.push(x)
    if (x[0] > rHol + 1e-6) inne.push([rHol, x[1]])
    ute2 = true
    break
  }
  const ring: RZ[] = [...ute]
  if ((ute2 || val.nav) && !moett && ute[ute.length - 1][0] > rHol + 1e-9) ring.push([rHol, zTopp])
  if (val.nav && !ute2) {
    const siste = inne[inne.length - 1]
    if (siste[0] > rHol + 1e-6) inne.push([rHol, siste[1]])
  }
  for (let i = inne.length - 1; i >= 0; i--) ring.push(inne[i])
  const rein: RZ[] = []
  for (const p of ring) {
    const f = rein[rein.length - 1]
    if (f && Math.hypot(f[0] - p[0], f[1] - p[1]) < 1e-6) continue
    rein.push(p)
  }
  return rein
}

export function skal(ytre: readonly RZ[], val: SkalVal): Nett {
  return dreiRing(skalRing(ytre, val), val.seg ?? 96)
}

export function innRing(ring: readonly Pt[], d: number): Pt[] {
  const n = ring.length
  const ccw = areal2(ring) > 0 ? 1 : -1
  const nrm = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    return [(-dy / l) * ccw, (dx / l) * ccw]
  }
  return ring.map((p, i) => {
    const a = nrm(ring[(i + n - 1) % n], p)
    const b = nrm(p, ring[(i + 1) % n])
    const k = Math.max(0.25, 1 + a[0] * b[0] + a[1] * b[1])
    return [p[0] + (d * (a[0] + b[0])) / k, p[1] + (d * (a[1] + b[1])) / k] as Pt
  })
}

function inni(ring: readonly Pt[], p: Pt): boolean {
  let inne = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inne = !inne
  }
  return inne
}

function kantAvstand(ring: readonly Pt[], p: Pt): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
  }
  return best
}

export type Snittring = { z: number; ring: Pt[] }
export type LoftVal = {
  vegg: number
  lok?: number
  hol?: number
  senter?: Pt
}

export function loft(snitt: readonly Snittring[], val: LoftVal): Nett {
  if (snitt.length < 2) throw new Error("loft: minst to snitt")
  const N = snitt[0].ring.length
  if (N < 3 || snitt.some((s) => s.ring.length !== N)) throw new Error("loft: alle snitt må ha like mange punkt")
  for (let i = 1; i < snitt.length; i++) if (!(snitt[i].z > snitt[i - 1].z)) throw new Error("loft: snitta må stige i z")
  const ytre = snitt.map((s) => ({ z: s.z, ring: areal2(s.ring) > 0 ? s.ring : [...s.ring].reverse() }))
  const indre0 = ytre.map((s) => ({ z: s.z, ring: innRing(s.ring, val.vegg) }))
  indre0.forEach((s, k) => {
    const nok = s.ring.every((p) => inni(ytre[k].ring, p) && kantAvstand(ytre[k].ring, p) > 0.9 * val.vegg)
    if (!nok || ringKryssar(s.ring)) throw new Error(`loft: veggen ${val.vegg} mm er for tjukk for snittet i z=${s.z}`)
  })
  const zTopp = ytre[ytre.length - 1].z
  const lok = val.lok ?? 0
  const zLok = zTopp - lok
  const indre: Snittring[] = []
  for (let i = 0; i < indre0.length; i++) {
    const s = indre0[i]
    if (!lok || s.z < zLok - 1e-9) {
      indre.push(s)
      continue
    }
    const f = indre0[i - 1]
    if (!f) throw new Error("loft: loket er høgare enn heile forma")
    const t = (zLok - f.z) / (s.z - f.z)
    indre.push({ z: zLok, ring: f.ring.map((p, j) => [p[0] + (s.ring[j][0] - p[0]) * t, p[1] + (s.ring[j][1] - p[1]) * t] as Pt) })
    break
  }
  const ut: number[] = []
  const kvad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => ut.push(...a, ...b, ...c, ...a, ...c, ...d)
  const tri = (a: Vec3, b: Vec3, c: Vec3) => ut.push(...a, ...b, ...c)
  const v = (s: Snittring, i: number): Vec3 => [s.ring[i % N][0], s.ring[i % N][1], s.z]
  const band = (a: Snittring, b: Snittring, ut0: boolean) => {
    for (let i = 0; i < N; i++) {
      if (ut0) kvad(v(a, i), v(a, i + 1), v(b, i + 1), v(b, i))
      else kvad(v(a, i), v(b, i), v(b, i + 1), v(a, i + 1))
    }
  }
  for (let k = 0; k + 1 < ytre.length; k++) band(ytre[k], ytre[k + 1], true)
  for (let k = 0; k + 1 < indre.length; k++) band(indre[k], indre[k + 1], false)
  band(ytre[0], { z: indre[0].z, ring: indre[0].ring }, false)
  const yT = ytre[ytre.length - 1]
  const iT = indre[indre.length - 1]
  if (!lok) {
    band(yT, iT, true)
  } else {
    const c = val.senter ?? [yT.ring.reduce((s, p) => s + p[0], 0) / N, yT.ring.reduce((s, p) => s + p[1], 0) / N]
    const rHol = (val.hol ?? 0) / 2
    if (rHol > 0) {
      const a0 = Math.atan2(yT.ring[0][1] - c[1], yT.ring[0][0] - c[0])
      const sirkel = (z: number): Snittring => ({
        z,
        ring: Array.from({ length: N }, (_, i) => [c[0] + rHol * Math.cos(a0 + (2 * Math.PI * i) / N), c[1] + rHol * Math.sin(a0 + (2 * Math.PI * i) / N)] as Pt),
      })
      band(yT, sirkel(zTopp), true)
      band(sirkel(zLok), sirkel(zTopp), false)
      band(iT, sirkel(zLok), false)
    } else {
      for (let i = 0; i < N; i++) {
        tri(v(yT, i), v(yT, i + 1), [c[0], c[1], zTopp])
        tri(v(iT, i + 1), v(iT, i), [c[0], c[1], zLok])
      }
    }
  }
  return utover(new Float32Array(ut))
}

export type NettSjekk = {
  tris: number
  hjorne: number
  flate: number
  opne: number
  mangfaldige: number
  vrengde: number
  utarta: number
  skal: number[]
  volum: number
  min: Vec3
  max: Vec3
  lukka: boolean
  samstemt: boolean
  utover: boolean
  ok: boolean
}

export function sjekkNett(pos: Nett, eps = 1e-3): NettSjekk {
  const tris = Math.floor(pos.length / 9)
  const id = new Map<string, number>()
  const idx = new Int32Array(tris * 3)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tris * 3; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const k = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`
    let h = id.get(k)
    if (h === undefined) {
      h = id.size
      id.set(k, h)
    }
    idx[i] = h
    const p = [x, y, z]
    for (let a = 0; a < 3; a++) {
      if (p[a] < min[a]) min[a] = p[a]
      if (p[a] > max[a]) max[a] = p[a]
    }
  }
  const nv = id.size
  const far = Array.from({ length: nv }, (_, i) => i)
  const rot = (i: number): number => {
    while (far[i] !== i) {
      far[i] = far[far[i]]
      i = far[i]
    }
    return i
  }
  const kant = new Map<number, [number, number]>()
  let utarta = 0
  let flate = 0
  for (let t = 0; t < tris; t++) {
    const a = idx[t * 3]
    const b = idx[t * 3 + 1]
    const c = idx[t * 3 + 2]
    const o = t * 9
    const ux = pos[o + 3] - pos[o]
    const uy = pos[o + 4] - pos[o + 1]
    const uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o]
    const vy = pos[o + 7] - pos[o + 1]
    const vz = pos[o + 8] - pos[o + 2]
    const ar = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    flate += ar
    if (a === b || b === c || c === a) {
      utarta++
      continue
    }
    far[rot(a)] = rot(b)
    far[rot(b)] = rot(c)
    for (const [u, w] of [[a, b], [b, c], [c, a]] as const) {
      const key = u < w ? u * nv + w : w * nv + u
      const e = kant.get(key) ?? [0, 0]
      e[u < w ? 0 : 1]++
      kant.set(key, e)
    }
  }
  let opne = 0
  let mangfaldige = 0
  let vrengde = 0
  for (const [f, b] of kant.values()) {
    if (f + b === 1) opne++
    else if (f + b > 2) mangfaldige++
    else if (f !== 1 || b !== 1) vrengde++
  }
  const vol = new Map<number, number>()
  for (let t = 0; t < tris; t++) {
    const i = t * 9
    const r = rot(idx[t * 3])
    vol.set(
      r,
      (vol.get(r) ?? 0) +
        (pos[i] * (pos[i + 4] * pos[i + 8] - pos[i + 5] * pos[i + 7]) -
          pos[i + 1] * (pos[i + 3] * pos[i + 8] - pos[i + 5] * pos[i + 6]) +
          pos[i + 2] * (pos[i + 3] * pos[i + 7] - pos[i + 4] * pos[i + 6])) /
          6,
    )
  }
  const skalV = [...vol.values()].sort((a, b) => Math.abs(b) - Math.abs(a))
  const sum = skalV.reduce((s, q) => s + q, 0)
  const lukka = opne === 0 && mangfaldige === 0
  const samstemt = vrengde === 0
  const ut0 = sum > 0
  return {
    tris,
    hjorne: nv,
    flate,
    opne,
    mangfaldige,
    vrengde,
    utarta,
    skal: skalV,
    volum: sum,
    min,
    max,
    lukka,
    samstemt,
    utover: ut0,
    ok: lukka && samstemt && ut0 && utarta === 0 && skalV.length === 1,
  }
}

export function stlBytes(pos: Nett, namn = "form"): Uint8Array {
  const n = Math.floor(pos.length / 9)
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const hovud = `${namn} - mm - Z opp`.replace(/[^\x20-\x7e]/g, "?").slice(0, 80)
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < hovud.length ? hovud.charCodeAt(i) : 32)
  dv.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ux = pos[o + 3] - pos[o]
    const uy = pos[o + 4] - pos[o + 1]
    const uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o]
    const vy = pos[o + 7] - pos[o + 1]
    const vz = pos[o + 8] - pos[o + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    const at = 84 + t * 50
    dv.setFloat32(at, nx / l, true)
    dv.setFloat32(at + 4, ny / l, true)
    dv.setFloat32(at + 8, nz / l, true)
    for (let i = 0; i < 9; i++) dv.setFloat32(at + 12 + i * 4, pos[o + i], true)
  }
  return new Uint8Array(buf)
}

export function glbBytes(pos: Nett, namn = "form"): Uint8Array {
  return meshToGlb([{ namn, delar: [{ namn, positions: pos, tris: Math.floor(pos.length / 9) }] }], namn)
}

const skriv = (sti: string, b: Uint8Array) => {
  mkdirSync(dirname(sti), { recursive: true })
  writeFileSync(sti, b)
  return b
}

export const skrivStl = (sti: string, pos: Nett, namn?: string) => skriv(sti, stlBytes(pos, namn))
export const skrivGlb = (sti: string, pos: Nett, namn?: string) => skriv(sti, glbBytes(pos, namn))

export type Registrert = { kjelde: string; scene: ""; storleik: number; min: Vec3; max: Vec3; side: Vec3 }

export function registrer(id: string, pos: Nett, etikett = `${id}.stl`): Registrert {
  if (!/^[a-z0-9]{1,40}$/i.test(id)) throw new Error(`registrer: id «${id}» må vere berre a-z og 0-9, elles heiter kroppen «${id}__…» i appen`)
  const soup = makeSoup(pos)
  put(id, etikett, soup, stlBytes(pos, id))
  const side: Vec3 = [soup.max[0] - soup.min[0], soup.max[1] - soup.min[1], soup.max[2] - soup.min[2]]
  return { kjelde: id, scene: "", storleik: Math.max(...side), min: soup.min, max: soup.max, side }
}

const t4 = (v: number) => +v.toFixed(4)

export function planVed(r: Registrert, id: number, punkt: Vec3, n: Vec3, meir: Partial<Plan> = {}): Plan {
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return {
    id,
    o: [t4((punkt[0] - r.min[0]) / r.side[0]), t4((punkt[1] - r.min[1]) / r.side[1]), t4((punkt[2] - r.min[2]) / r.side[2])],
    n: [t4(n[0] / l), t4(n[1] / l), t4(n[2] / l)],
    bog: 0,
    strek: [],
    ...meir,
  }
}

export const profil = (r: (z: number) => number, z0: number, z1: number, n = 64): RZ[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const z = z0 + ((z1 - z0) * i) / n
    return [r(z), z] as RZ
  })

export const sirkelRing = (r: number, n = 96, fase = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (fase * Math.PI) / 180 + (2 * Math.PI * i) / n
    return [r * Math.cos(a), r * Math.sin(a)] as Pt
  })

export const superRing = (a: number, b: number, e = 2, n = 96, fase = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (fase * Math.PI) / 180 + (2 * Math.PI * i) / n
    const c = Math.cos(t)
    const s = Math.sin(t)
    const r = Math.pow(Math.pow(Math.abs(c) / a, e) + Math.pow(Math.abs(s) / b, e), -1 / e)
    return [r * c, r * s] as Pt
  })

export const bylgjeRing = (r: number, amp: number, lappar: number, n = 96, fase = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n
    const rr = r + amp * Math.cos(lappar * t + (fase * Math.PI) / 180)
    return [rr * Math.cos(t), rr * Math.sin(t)] as Pt
  })

export const vriRing = (ring: readonly Pt[], grad: number, flytt: Pt = [0, 0]): Pt[] => {
  const c = Math.cos((grad * Math.PI) / 180)
  const s = Math.sin((grad * Math.PI) / 180)
  return ring.map(([x, y]) => [x * c - y * s + flytt[0], x * s + y * c + flytt[1]] as Pt)
}

export const blandRing = (a: readonly Pt[], b: readonly Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t] as Pt)

export function vri(pos: Nett, gradVedZ: (z: number) => number): Nett {
  const ut = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    const a = (gradVedZ(pos[i + 2]) * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    ut[i] = pos[i] * c - pos[i + 1] * s
    ut[i + 1] = pos[i] * s + pos[i + 1] * c
    ut[i + 2] = pos[i + 2]
  }
  return ut
}

export function spegl(pos: Nett, akse: 0 | 1 | 2): Nett {
  const ut = new Float32Array(pos)
  for (let i = akse; i < ut.length; i += 3) ut[i] = -ut[i]
  return snu(ut)
}

export function skaler(pos: Nett, k: Vec3 | number): Nett {
  const f: Vec3 = typeof k === "number" ? [k, k, k] : k
  const ut = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) ut[i + a] = pos[i + a] * f[a]
  return f[0] * f[1] * f[2] < 0 ? snu(ut) : ut
}

export function prisme(ring: readonly Pt[], z0: number, z1: number, hol: readonly (readonly Pt[])[] = []): Nett {
  const s = newSoup()
  const veg = (r: readonly Pt[], mot: boolean): Pt[] => {
    const k = r.map((p) => [p[0], p[1]] as Pt)
    return areal2(k) > 0 === mot ? k : k.reverse()
  }
  ribSolid(s, { r: { o: [0, 0, (z0 + z1) / 2], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], k: 0 }, outlines: [veg(ring, true)], holes: hol.map((h) => veg(h, false)) }, Math.abs(z1 - z0))
  return utover(new Float32Array(s.pos))
}

export const boks = (b: number, d: number, h: number, z0 = 0): Nett => prisme([[-b / 2, -d / 2], [b / 2, -d / 2], [b / 2, d / 2], [-b / 2, d / 2]], z0, z0 + h)

export const sylinder = (r: number, z0: number, z1: number, seg = 96): Nett => dreiRing([[0, z0], [r, z0], [r, z1], [0, z1]], seg)

export const skive = (rYtre: number, hol: number, z0: number, z1: number, seg = 96): Nett =>
  hol > 0 ? dreiRing([[hol / 2, z0], [rYtre, z0], [rYtre, z1], [hol / 2, z1]], seg) : sylinder(rYtre, z0, z1, seg)

export function lesNett(sti: string): Nett {
  const b = readFileSync(sti)
  return parseMesh(sti, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).pos
}

export const FORGECAD = process.env.FORGECAD ?? ""

export function forgeStl(forgeJs: string, utStl?: string, param: Record<string, number | string> = {}): string {
  const inn = resolve(forgeJs)
  const ut = resolve(utStl ?? inn.replace(/(\.forge)?\.js$/, "") + ".stl")
  if (!FORGECAD || !existsSync(FORGECAD)) throw new Error("forgeStl: set FORGECAD til ForgeCAD-cli-en")
  mkdirSync(dirname(ut), { recursive: true })
  const p = Object.entries(param).flatMap(([k, v]) => ["-p", `${k}=${v}`])
  try {
    execFileSync(FORGECAD, ["export", "stl", inn, "--output", ut, ...p], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 })
  } catch (e) {
    const f = e as { stdout?: string; stderr?: string; message: string }
    throw new Error(`forgeStl: ${`${f.stdout ?? ""}${f.stderr ?? ""}`.trim().split("\n").slice(-4).join(" | ") || f.message}`)
  }
  if (!existsSync(ut)) throw new Error("forgeStl: ForgeCAD skreiv inga STL")
  return ut
}

export function sentrer(pos: Nett): Nett {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (pos[i + a] < min[a]) min[a] = pos[i + a]
      if (pos[i + a] > max[a]) max[a] = pos[i + a]
    }
  }
  return flytt(pos, [-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]])
}
