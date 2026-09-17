import { inRing, type Pt } from "./core"
import type { Span } from "./mesh/solid"
import { bogPar } from "./plan"

export function sporPunkt(q: { p: Pt; d: Pt; k: number }, t: number, s = 0): Pt {
  const nx = -q.d[1]
  const ny = q.d[0]
  if (!q.k) return [q.p[0] + q.d[0] * t + nx * s, q.p[1] + q.d[1] * t + ny * s]
  const a = q.k * t
  const [su, sn] = bogPar(q.k, t)
  const du = su - s * Math.sin(a)
  const dn = sn + s * Math.cos(a)
  return [q.p[0] + q.d[0] * du + nx * dn, q.p[1] + q.d[1] * du + ny * dn]
}

export type Line = { p: Pt; d: Pt; k: number }

export function sporInn(px: number, py: number, dx: number, dy: number, k: number, x: number, y: number): [number, number] {
  const rx = x - px
  const ry = y - py
  const a = rx * dx + ry * dy
  const b = -rx * dy + ry * dx
  if (!k) return [a, b]
  const R = 1 / k
  const sg = Math.sign(R)
  return [Math.atan2(sg * a, sg * (R - b)) * R, R - Math.hypot(a, R - b) * sg]
}

export function stykkeLangs(ringar: readonly Pt[][], p: Pt, d: Pt, k = 0): Span[] {
  if (k) return stykkeBoge(ringar, p, d, k)
  const nx = -d[1]
  const ny = d[0]
  const ts: number[] = []
  for (const ring of ringar) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]
      const b = ring[i]
      const sa = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny
      const sb = (b[0] - p[0]) * nx + (b[1] - p[1]) * ny
      if (sa > 0 === sb > 0) continue
      const ta = (a[0] - p[0]) * d[0] + (a[1] - p[1]) * d[1]
      const tb = (b[0] - p[0]) * d[0] + (b[1] - p[1]) * d[1]
      ts.push(ta + ((tb - ta) * sa) / (sa - sb))
    }
  }
  ts.sort((u, v) => u - v)
  const ut: Span[] = []
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-6) ut.push([ts[i], ts[i + 1]])
  return ut
}

function stykkeBoge(ringar: readonly Pt[][], p: Pt, d: Pt, k: number): Span[] {
  const q = { p, d, k }
  const R = 1 / k
  const omkrins = 2 * Math.PI * Math.abs(R)
  const cx = p[0] - d[1] * R
  const cy = p[1] + d[0] * R
  const rad = Math.abs(R)
  const ts: number[] = []
  for (const ring of ringar) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]
      const b = ring[i]
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const fx = a[0] - cx
      const fy = a[1] - cy
      const A = ex * ex + ey * ey
      if (A < 1e-18) continue
      const B = 2 * (fx * ex + fy * ey)
      const C = fx * fx + fy * fy - rad * rad
      const disk = B * B - 4 * A * C
      if (disk <= 0) continue
      const rot = Math.sqrt(disk)
      for (const t of [(-B - rot) / (2 * A), (-B + rot) / (2 * A)]) {
        if (t < 0 || t >= 1) continue
        ts.push(sporInn(p[0], p[1], d[0], d[1], k, a[0] + ex * t, a[1] + ey * t)[0])
      }
    }
  }
  ts.sort((u, v) => u - v)
  if (!ts.length) {
    let n = 0
    for (const ring of ringar) if (inRing(ring, p)) n++
    return n % 2 === 1 ? [[-omkrins / 2, omkrins / 2]] : []
  }
  const ut: Span[] = []
  for (let i = 0; i < ts.length; i++) {
    const lo = ts[i]
    const hi = i + 1 < ts.length ? ts[i + 1] : ts[0] + omkrins
    if (hi - lo <= 1e-6) continue
    const m = sporPunkt(q, (lo + hi) / 2)
    let n = 0
    for (const ring of ringar) if (inRing(ring, m)) n++
    if (n % 2 === 1) ut.push([lo, hi])
  }
  return ut
}

export function felles(a: Span[], b: Span[]): Span[] {
  const ut: Span[] = []
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0)
      const hi = Math.min(a1, b1)
      if (hi > lo) ut.push([lo, hi])
    }
  }
  return ut
}

export function utan(a: readonly Span[], b: readonly Span[]): Span[] {
  let ut: Span[] = a.map(([lo, hi]) => [lo, hi])
  for (const [b0, b1] of b) {
    const neste: Span[] = []
    for (const [a0, a1] of ut) {
      if (b1 <= a0 || b0 >= a1) {
        neste.push([a0, a1])
        continue
      }
      if (b0 > a0) neste.push([a0, b0])
      if (b1 < a1) neste.push([b1, a1])
    }
    ut = neste
  }
  return ut
}

export function iGods(ringar: readonly Pt[][], q: Pt): boolean {
  let n = 0
  for (const r of ringar) if (inRing(r, q)) n++
  return n % 2 === 1
}
