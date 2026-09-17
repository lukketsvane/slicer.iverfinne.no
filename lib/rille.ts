import { inRing, type Material, type Pt } from "./core"

export const BOG_FAKTOR: Record<string, number> = { bjork: 150, finer: 100, mdf: 200, akryl: 230, papp: 10 }

export const bogMin = (material: string, tjukn: number) => (BOG_FAKTOR[material] ?? 100) * tjukn

const STEG: Record<string, number> = { bjork: 0.9, finer: 1, mdf: 0.8, akryl: 0.8, papp: 2 }

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

function strekKryss(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const s = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = s(c, d, a)
  const d2 = s(c, d, b)
  const d3 = s(a, b, c)
  const d4 = s(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

function sperra(a: Pt, b: Pt, soner: readonly (readonly Pt[])[]): boolean {
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  for (const s of soner) {
    const ring = s as Pt[]
    if (inRing(ring, a) || inRing(ring, b) || inRing(ring, m)) return true
    for (let i = 0; i < ring.length; i++) {
      if (strekKryss(a, b, ring[i], ring[(i + 1) % ring.length])) return true
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
        if (sperra([u, v0], [u, v1], q.sperr)) continue
        ut.push([
          [u, v0],
          [u, v1],
        ])
      }
    }
  }
  return ut
}
