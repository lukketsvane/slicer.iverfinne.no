import type { Spor } from "./snitt"
import type { Pt } from "./core"
import { simplify } from "./contour"
import { sporInn, sporPunkt } from "./stykke"

export type SporBoks = {
  px: number
  py: number
  dx: number
  dy: number
  k: number
  lo: number
  hi: number
  half: number
  bx0: number
  bx1: number
  by0: number
  by1: number
}

export function boksAv(q: Spor): SporBoks {
  const lo = Math.min(q.botn, q.ut)
  const hi = Math.max(q.botn, q.ut)
  const half = q.w / 2
  const n = q.k ? 8 : 1
  let bx0 = Infinity
  let bx1 = -Infinity
  let by0 = Infinity
  let by1 = -Infinity
  for (let i = 0; i <= n; i++) {
    const t = lo + ((hi - lo) * i) / n
    for (const s of [-half, half]) {
      const p = sporPunkt(q, t, s)
      if (p[0] < bx0) bx0 = p[0]
      if (p[0] > bx1) bx1 = p[0]
      if (p[1] < by0) by0 = p[1]
      if (p[1] > by1) by1 = p[1]
    }
  }
  const pad = q.k ? Math.abs(q.k) * (((hi - lo) / (2 * n)) ** 2) + 0.05 : 0
  return { px: q.p[0], py: q.p[1], dx: q.d[0], dy: q.d[1], k: q.k, lo, hi, half, bx0: bx0 - pad, bx1: bx1 + pad, by0: by0 - pad, by1: by1 + pad }
}

export function klemTreff(p: Pt, d: Pt, b: { x0: number; x1: number; y0: number; y1: number }): [number, number] | null {
  let lo = -Infinity
  let hi = Infinity
  if (Math.abs(d[0]) < 1e-12) {
    if (p[0] < b.x0 - 1 || p[0] > b.x1 + 1) return null
  } else {
    const t0 = (b.x0 - 1 - p[0]) / d[0]
    const t1 = (b.x1 + 1 - p[0]) / d[0]
    lo = Math.max(lo, Math.min(t0, t1))
    hi = Math.min(hi, Math.max(t0, t1))
  }
  if (Math.abs(d[1]) < 1e-12) {
    if (p[1] < b.y0 - 1 || p[1] > b.y1 + 1) return null
  } else {
    const t0 = (b.y0 - 1 - p[1]) / d[1]
    const t1 = (b.y1 + 1 - p[1]) / d[1]
    lo = Math.max(lo, Math.min(t0, t1))
    hi = Math.min(hi, Math.max(t0, t1))
  }
  return hi > lo ? [lo, hi] : null
}

export function rutenettSpor(g: Float64Array, nt: number, nz: number, t0: number, dt: number, z0: number, dz: number, tett: { x: number[]; y: number[] } | null, boksar: readonly SporBoks[]) {
  const rowBoks: SporBoks[] = []
  const nx = nt + 1
  for (let j = 0; j <= nz; j++) {
    const z = tett ? tett.y[j] : z0 + j * dz
    const base = j * nx
    let vmax = 0
    for (let i = 0; i <= nt; i++) {
      const v = g[base + i]
      if (v > vmax) vmax = v
    }
    if (vmax <= 0) continue
    const rowLim = vmax * Math.SQRT2
    rowBoks.length = 0
    for (const b of boksar) {
      if (z >= b.by0 - rowLim && z <= b.by1 + rowLim) rowBoks.push(b)
    }
    if (!rowBoks.length) continue
    for (let i = 0; i <= nt; i++) {
      const k = base + i
      let v = g[k]
      if (v <= 0) continue
      const t = tett ? tett.x[i] : t0 + i * dt
      for (const b of rowBoks) {
        const lim = v * Math.SQRT2
        if (t < b.bx0 - lim || t > b.bx1 + lim) continue
        let a: number
        let c: number
        if (b.k) {
          const q = sporInn(b.px, b.py, b.dx, b.dy, b.k, t, z)
          a = q[0]
          c = q[1]
        } else {
          const rx = t - b.px
          const ry = z - b.py
          a = rx * b.dx + ry * b.dy
          c = -rx * b.dy + ry * b.dx
        }
        const d = Math.max(Math.abs(c) - b.half, b.lo - a, a - b.hi)
        if (d < v) v = d
        if (v <= 0) break
      }
      g[k] = v
    }
  }
}

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
  const hjorne = spor.flatMap(s => [-1, 1].map(side => sporPunkt(s, s.botn, (side * s.w) / 2)))
  const ved = (p: Pt) => hjorne.find(c => Math.abs(p[0] - c[0]) < 1e-2 && Math.abs(p[1] - c[1]) < 1e-2)
  const kant = poly.map((p, i) => vegg(p, poly[(i + 1) % poly.length]))
  const fast = kant.flatMap((v, i) => ved(poly[i]) || (v !== kant[(i + kant.length - 1) % kant.length] && (v >= 0 || kant[(i + kant.length - 1) % kant.length] >= 0)) ? [i] : [])
  if (!fast.length) return simplify(poly, tol)
  const ut: Pt[] = []
  for (let i = 0; i < fast.length; i++) {
    const a = fast[i]
    const b = fast[(i + 1) % fast.length]
    const bit = a < b ? poly.slice(a, b + 1) : [...poly.slice(a), ...poly.slice(0, b + 1)]
    const [a0, a1, a2] = bit
    const ex = bit.length === 3 ? a2[0] - a0[0] : 0
    const ey = bit.length === 3 ? a2[1] - a0[1] : 0
    const t = Math.max(0, Math.min(1, ((a1[0] - a0[0]) * ex + (a1[1] - a0[1]) * ey) / (ex * ex + ey * ey || 1)))
    const rett = bit.length === 3 && Math.hypot(a1[0] - a0[0] - ex * t, a1[1] - a0[1] - ey * t) <= tol
    for (const p of (rett ? [a0, a2] : simplify(bit, tol, false)).slice(0, -1)) {
      const q = ved(p) ?? p
      const f = ut[ut.length - 1]
      if (!f || f[0] !== q[0] || f[1] !== q[1]) ut.push([q[0], q[1]])
    }
  }
  if (ut.length > 1 && ut[0][0] === ut[ut.length - 1][0] && ut[0][1] === ut[ut.length - 1][1]) ut.pop()
  return ut
}

export function sporAksar(x0: number, dx: number, nx: number, y0: number, dy: number, ny: number, spor: readonly Spor[], liner?: { x: readonly number[]; y: readonly number[] }) {
  const xx: number[] = [...(liner?.x ?? [])]
  const yy: number[] = [...(liner?.y ?? [])]
  let skra = 0
  for (const s of spor) {
    const fri = Math.min(dx, dy, s.w) / 4
    for (const side of [-1, 1]) {
      for (const v of [-1e-3, fri]) {
        const c = sporPunkt(s, s.botn + Math.sign(s.ut - s.botn) * 1e-3, side * (s.w / 2 + v))
        xx.push(c[0])
        yy.push(c[1])
      }
    }
    const loddrett = !s.k && Math.abs(s.d[0]) < 1e-8
    const vassrett = !s.k && Math.abs(s.d[1]) < 1e-8
    if (!loddrett && !vassrett) {
      skra++
      continue
    }
    if ((loddrett ? dx : dy) <= s.w / 2) continue
    const tvers = loddrett ? xx : yy
    const langs = loddrett ? yy : xx
    const midt = s.p[loddrett ? 0 : 1]
    const ende = s.p[loddrett ? 1 : 0] + s.d[loddrett ? 1 : 0] * s.botn
    for (const f of [-0.75, -0.25, 0.25, 0.75]) tvers.push(midt + f * s.w)
    const e = Math.min(loddrett ? dy : dx, s.w) / 4
    langs.push(ende - e, ende + e)
  }
  if (skra > 0 && skra <= 8) {
    for (const s of spor) {
      const loddrett = !s.k && Math.abs(s.d[0]) < 1e-8
      const vassrett = !s.k && Math.abs(s.d[1]) < 1e-8
      if (loddrett || vassrett) continue
      const b = boksAv(s)
      const steg = Math.max(0.4, Math.min(s.w / 2.5, Math.min(dx, dy) / 2))
      const nxS = Math.min(10, Math.max(2, Math.ceil((b.bx1 - b.bx0) / steg)))
      const nyS = Math.min(10, Math.max(2, Math.ceil((b.by1 - b.by0) / steg)))
      for (let i = 0; i <= nxS; i++) xx.push(b.bx0 + ((b.bx1 - b.bx0) * i) / nxS)
      for (let j = 0; j <= nyS; j++) yy.push(b.by0 + ((b.by1 - b.by0) * j) / nyS)
    }
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
