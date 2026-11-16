import { inRing, type Material, type Pt } from "./core"

export const BOG_FAKTOR: Record<string, number> = { bjork: 150, finer: 100, mdf: 200, akryl: 230, papp: 10, graa: 100, grey: 100 }

export const bogMin = (material: string, tjukn: number) => (BOG_FAKTOR[material] ?? 100) * tjukn

const STEG: Record<string, number> = { bjork: 0.9, finer: 1, mdf: 0.8, akryl: 0.8, papp: 2, graa: 1, grey: 1 }

export type Rillemal = {
  steg: number
  lengd: number
  bru: number
}

export function rilleMal(R: number, tjukn: number, material: string): Rillemal {
  const fasett = Math.sqrt(2 * tjukn * Math.max(R, 1))
  const steg = Math.min(fasett, (STEG[material] ?? 1) * tjukn)
  const bru = tjukn
  return { steg, lengd: 12 * bru, bru }
}

function kryssar(ring: readonly Pt[], c: number, ut: number[]) {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % n]
    if (x0 === x1) continue
    if (c < Math.min(x0, x1) || c >= Math.max(x0, x1)) continue
    ut.push(y0 + ((y1 - y0) * (c - x0)) / (x1 - x0))
  }
}

function gods(ringar: readonly (readonly Pt[])[], c: number): [number, number][] {
  const v: number[] = []
  for (const r of ringar) kryssar(r, c, v)
  v.sort((a, b) => a - b)
  const ut: [number, number][] = []
  for (let i = 0; i + 1 < v.length; i += 2) ut.push([v[i], v[i + 1]])
  return ut
}

type SperrBoks = { ring: Pt[]; x0: number; x1: number; y0: number; y1: number }

function pakkSperr(soner: readonly (readonly Pt[])[]): SperrBoks[] {
  return soner
    .filter((s) => s.length >= 3)
    .map((s) => {
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (const p of s) {
        if (p[0] < x0) x0 = p[0]
        if (p[0] > x1) x1 = p[0]
        if (p[1] < y0) y0 = p[1]
        if (p[1] > y1) y1 = p[1]
      }
      return { ring: s as Pt[], x0, x1, y0, y1 }
    })
}

function sperra(u: number, v0: number, v1: number, soner: readonly SperrBoks[]): boolean {
  const vm = (v0 + v1) / 2
  const a: Pt = [u, v0]
  const b: Pt = [u, v1]
  const m: Pt = [u, vm]
  for (const s of soner) {
    if (u < s.x0 || u > s.x1 || v1 < s.y0 || v0 > s.y1) continue
    const ring = s.ring
    if (inRing(ring, a) || inRing(ring, b) || inRing(ring, m)) return true
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p0 = ring[j]
      const p1 = ring[i]
      if ((p0[0] <= u) === (p1[0] <= u)) continue
      const y = p0[1] + ((p1[1] - p0[1]) * (u - p0[0])) / (p1[0] - p0[0])
      if (y >= v0 && y <= v1) return true
    }
  }
  return false
}

export type Rille = {
  omriss: readonly Pt[]
  hol: readonly (readonly Pt[])[]
  sperr: readonly (readonly Pt[])[]
  k: number
  tjukn: number
  material: Material | string
  mal?: Rillemal
}

export function rilla(q: Rille): Pt[][] {
  const mal = q.mal ?? (q.k ? rilleMal(Math.abs(1 / q.k), q.tjukn, String(q.material)) : null)
  if (!mal) return []
  const ringar = [q.omriss, ...q.hol]
  let u0 = Infinity
  let u1 = -Infinity
  for (const p of q.omriss) {
    if (p[0] < u0) u0 = p[0]
    if (p[0] > u1) u1 = p[0]
  }
  const monn = mal.bru
  const periode = mal.lengd + mal.bru
  const ut: Pt[][] = []
  const rader = Math.floor((u1 - u0 - 2 * monn) / mal.steg)
  if (rader < 1) return []
  const sperr = pakkSperr(q.sperr)
  for (let i = 0; i <= rader; i++) {
    const u = u0 + monn + i * mal.steg
    const skift = i % 2 ? periode / 2 : 0
    for (const [a, b] of gods(ringar, u)) {
      const lo = a + monn
      const hi = b - monn
      if (hi - lo < mal.bru) continue
      const start = Math.ceil((lo - skift) / periode) * periode + skift
      for (let v = start; v < hi; v += periode) {
        const v0 = Math.max(v, lo)
        const v1 = Math.min(v + mal.lengd, hi)
        if (v1 - v0 < mal.bru) continue
        if (sperra(u, v0, v1, sperr)) continue
        ut.push([
          [u, v0],
          [u, v1],
        ])
      }
    }
  }
  return ut
}
