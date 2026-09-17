export type Pt2 = [number, number]

export type Loop = {
  pts: Pt2[]
  area: number
}

export function contour(
  g: Float64Array,
  x0: number,
  dx: number,
  nx: number,
  y0: number,
  dy: number,
  ny: number,
  aksar?: { x: readonly number[]; y: readonly number[] },
): Loop[] {
  const W = nx + 1
  const at = (i: number, j: number) => g[j * W + i]

  const N = 2 * W * (ny + 1)
  const px = new Float64Array(N)
  const py = new Float64Array(N)
  const har = new Uint8Array(N)
  const next = new Int32Array(N).fill(-1)

  const hPt = (i: number, j: number) => {
    const k = 2 * (j * W + i)
    if (!har[k]) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const t = a / (a - b)
      px[k] = aksar ? aksar.x[i] + t * (aksar.x[i + 1] - aksar.x[i]) : x0 + i * dx + t * dx
      py[k] = aksar ? aksar.y[j] : y0 + j * dy
      har[k] = 1
    }
    return k
  }
  const vPt = (i: number, j: number) => {
    const k = 2 * (j * W + i) + 1
    if (!har[k]) {
      const a = at(i, j)
      const b = at(i, j + 1)
      const t = a / (a - b)
      px[k] = aksar ? aksar.x[i] : x0 + i * dx
      py[k] = aksar ? aksar.y[j] + t * (aksar.y[j + 1] - aksar.y[j]) : y0 + j * dy + t * dy
      har[k] = 1
    }
    return k
  }

  const segs: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c00 = at(i, j) > 0
      const c10 = at(i + 1, j) > 0
      const c11 = at(i + 1, j + 1) > 0
      const c01 = at(i, j + 1) > 0
      const m = (c00 ? 1 : 0) | (c10 ? 2 : 0) | (c11 ? 4 : 0) | (c01 ? 8 : 0)
      if (m === 0 || m === 15) continue
      const B = () => hPt(i, j)
      const T = () => hPt(i, j + 1)
      const L = () => vPt(i, j)
      const R = () => vPt(i + 1, j)
      switch (m) {
        case 1: segs.push(B(), L()); break
        case 2: segs.push(R(), B()); break
        case 4: segs.push(T(), R()); break
        case 8: segs.push(L(), T()); break
        case 14: segs.push(L(), B()); break
        case 13: segs.push(B(), R()); break
        case 11: segs.push(R(), T()); break
        case 7: segs.push(T(), L()); break
        case 3: segs.push(R(), L()); break
        case 6: segs.push(T(), B()); break
        case 12: segs.push(L(), R()); break
        case 9: segs.push(B(), T()); break
        case 5: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push(B(), R()); segs.push(T(), L()) }
          else { segs.push(B(), L()); segs.push(T(), R()) }
          break
        }
        case 10: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push(L(), B()); segs.push(R(), T()) }
          else { segs.push(R(), B()); segs.push(L(), T()) }
          break
        }
      }
    }
  }
  for (let s = 0; s < segs.length; s += 2) next[segs[s]] = segs[s + 1]

  const seen = new Uint8Array(N)
  const loops: Loop[] = []
  for (let s = 0; s < segs.length; s += 2) {
    const start = segs[s]
    if (seen[start]) continue
    const poly: Pt2[] = []
    let k = start
    while (k >= 0 && !seen[k]) {
      seen[k] = 1
      poly.push([px[k], py[k]])
      k = next[k]
    }
    if (poly.length < 3) continue
    let a2 = 0
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      a2 += p[0] * q[1] - q[0] * p[1]
    }
    loops.push({ pts: poly, area: a2 / 2 })
  }
  return loops
}

function fråLina(p: Pt2, a: Pt2, c: Pt2): number {
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

export function simplify(poly: Pt2[], tol: number, lukka = true): Pt2[] {
  const n = poly.length
  if (n < 4) return poly
  const out: Pt2[] = [poly[0]]
  let start = 0

  const EPS = 1e-9
  let senter = 0
  let lo = -Infinity
  let hi = Infinity
  let fyrst = true
  let usikker = false
  const inn = (a: number) => {
    while (a - senter >= Math.PI / 2) a -= Math.PI
    while (a - senter < -Math.PI / 2) a += Math.PI
    return a
  }
  const legg = (j: number) => {
    if (usikker) return
    const s = poly[start]
    const dx = poly[j][0] - s[0]
    const dy = poly[j][1] - s[1]
    const r = Math.hypot(dx, dy)
    if (r <= tol * Math.SQRT2 + EPS) {
      usikker = true
      return
    }
    const th = Math.atan2(dy, dx)
    const al = Math.asin(tol / r)
    if (fyrst) {
      senter = th
      fyrst = false
      lo = th - al
      hi = th + al
      return
    }
    const t = inn(th)
    if (t - al > lo) lo = t - al
    if (t + al < hi) hi = t + al
  }

  for (let i = 2; i < n; i++) {
    legg(i - 1)
    let held = true
    let avgjort = false
    if (!usikker && !fyrst) {
      const s = poly[start]
      const dx = poly[i][0] - s[0]
      const dy = poly[i][1] - s[1]
      if (Math.hypot(dx, dy) > tol) {
        const f = inn(Math.atan2(dy, dx))
        if (lo > hi + EPS || f <= lo - EPS || f >= hi + EPS) {
          held = false
          avgjort = true
        } else if (f >= lo + EPS && f <= hi - EPS) {
          avgjort = true
        }
      }
    }
    if (!avgjort) {
      for (let j = start + 1; j < i; j++) {
        if (fråLina(poly[j], poly[start], poly[i]) >= tol) {
          held = false
          break
        }
      }
    }
    if (!held) {
      out.push(poly[i - 1])
      start = i - 1
      lo = -Infinity
      hi = Infinity
      fyrst = true
      usikker = false
    }
  }
  if (start !== n - 1) out.push(poly[n - 1])
  return out.length >= (lukka ? 3 : 2) ? out : poly
}
