import type { Spor } from "./snitt"
import type { Pt } from "./core"
import { simplify } from "./contour"

export type Veggboks = { cx: number; cy: number; hw: number; hh: number; c: number; s: number }

export function forenklaSpor(poly: Pt[], tol: number, spor: readonly Spor[], boksar: readonly Veggboks[] = []): Pt[] {
  if (!spor.length && !boksar.length) return simplify(poly, tol)
  const rette = spor.filter(s => !s.k).map(s => ({
    px: s.p[0], py: s.p[1], dx: s.d[0], dy: s.d[1],
    lo: Math.min(s.botn, s.ut) - 1e-6, hi: Math.max(s.botn, s.ut) + 1e-6,
    halv: s.w / 2, botn: s.botn,
  }))
  const vegg = (a: Pt, p2: Pt) => {
    for (let i = 0; i < rette.length; i++) {
      const s = rette[i]
      const ax = a[0] - s.px, ay = a[1] - s.py
      const bx = p2[0] - s.px, by = p2[1] - s.py
      const u = ax * s.dx + ay * s.dy
      const v = bx * s.dx + by * s.dy
      if (u < s.lo || u > s.hi || v < s.lo || v > s.hi) continue
      const au = -ax * s.dy + ay * s.dx
      const bu = -bx * s.dy + by * s.dx
      if (Math.abs(au + s.halv) < 1e-6 && Math.abs(bu + s.halv) < 1e-6) return i * 3
      if (Math.abs(au - s.halv) < 1e-6 && Math.abs(bu - s.halv) < 1e-6) return i * 3 + 1
      if (Math.abs(u - s.botn) < 1e-6 && Math.abs(v - s.botn) < 1e-6 && Math.max(Math.abs(au), Math.abs(bu)) <= s.halv + 1e-6) return i * 3 + 2
    }
    for (let i = 0; i < boksar.length; i++) {
      const b = boksar[i]
      const ax = a[0] - b.cx, ay = a[1] - b.cy
      const bx = p2[0] - b.cx, by = p2[1] - b.cy
      const al = ax * b.c + ay * b.s, at = -ax * b.s + ay * b.c
      const bl = bx * b.c + by * b.s, bt = -bx * b.s + by * b.c
      for (const side of [-1, 1]) {
        if (Math.abs(at - side * b.hh) < 1e-6 && Math.abs(bt - side * b.hh) < 1e-6 && Math.max(Math.abs(al), Math.abs(bl)) <= b.hw + 1e-6) return rette.length * 3 + i * 4 + (side + 1) / 2
        if (Math.abs(al - side * b.hw) < 1e-6 && Math.abs(bl - side * b.hw) < 1e-6 && Math.max(Math.abs(at), Math.abs(bt)) <= b.hh + 1e-6) return rette.length * 3 + i * 4 + 2 + (side + 1) / 2
      }
    }
    return -1
  }
  const kant = poly.map((p, i) => vegg(p, poly[(i + 1) % poly.length]))
  const fast = kant.flatMap((v, i) => v !== kant[(i + kant.length - 1) % kant.length] && (v >= 0 || kant[(i + kant.length - 1) % kant.length] >= 0) ? [i] : [])
  if (!fast.length) return simplify(poly, tol)
  const ut: Pt[] = []
  for (let i = 0; i < fast.length; i++) {
    const a = fast[i]
    const b = fast[(i + 1) % fast.length]
    const bit = a < b ? poly.slice(a, b + 1) : [...poly.slice(a), ...poly.slice(0, b + 1)]
    ut.push(...simplify(bit, tol, false).slice(0, -1))
  }
  return ut
}

export function sporAksar(x0: number, dx: number, nx: number, y0: number, dy: number, ny: number, spor: readonly Spor[], liner?: { x: readonly number[]; y: readonly number[] }) {
  const xx: number[] = [...(liner?.x ?? [])]
  const yy: number[] = [...(liner?.y ?? [])]
  for (const s of spor) {
    if (s.k) continue
    const loddrett = Math.abs(s.d[0]) < 1e-8
    const vassrett = Math.abs(s.d[1]) < 1e-8
    if (!loddrett && !vassrett) continue
    if ((loddrett ? dx : dy) <= s.w / 2) continue
    const tvers = loddrett ? xx : yy
    const langs = loddrett ? yy : xx
    const midt = s.p[loddrett ? 0 : 1]
    const ende = s.p[loddrett ? 1 : 0] + s.d[loddrett ? 1 : 0] * s.botn
    for (const f of [-0.75, -0.25, 0.25, 0.75]) tvers.push(midt + f * s.w)
    const e = Math.min(loddrett ? dy : dx, s.w) / 4
    langs.push(ende - e, ende + e)
  }
  if (!xx.length && !yy.length) return null
  const akse = (start: number, steg: number, tal: number, ekstra: number[]) => {
    const a = Array.from({ length: tal + 1 }, (_, i) => start + i * steg)
    a.push(...ekstra.filter(v => v > start && v < start + tal * steg))
    a.sort((u, v) => u - v)
    return a.filter((v, i) => i === 0 || v - a[i - 1] > 1e-7)
  }
  return { x: akse(x0, dx, nx, xx), y: akse(y0, dy, ny, yy) }
}

export function sporRute(g: Float64Array, x0: number, dx: number, nx: number, y0: number, dy: number, ny: number, spor: readonly Spor[], liner?: { x: readonly number[]; y: readonly number[] }) {
  const aksar = sporAksar(x0, dx, nx, y0, dy, ny, spor, liner)
  if (!aksar) return null
  const { x, y } = aksar
  const felt = new Float64Array(x.length * y.length)
  for (let j = 0; j < y.length; j++) {
    const vy = Math.max(0, Math.min(ny, (y[j] - y0) / dy))
    const iy = Math.min(ny - 1, Math.floor(vy))
    const fy = vy - iy
    for (let i = 0; i < x.length; i++) {
      const vx = Math.max(0, Math.min(nx, (x[i] - x0) / dx))
      const ix = Math.min(nx - 1, Math.floor(vx))
      const fx = vx - ix
      const k = iy * (nx + 1) + ix
      const a = g[k] * (1 - fx) + g[k + 1] * fx
      const b = g[k + nx + 1] * (1 - fx) + g[k + nx + 2] * fx
      felt[j * x.length + i] = a * (1 - fy) + b * fy
    }
  }
  return { g: felt, x, y }
}
