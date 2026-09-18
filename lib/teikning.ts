import { inRing, shoelace, type Pt, type Vec3 } from "./core"
import { add3, bogeVed, broek, dot, kryss, mul3, omrissLine, OMRISS_TAK, ramme, STREK_TAK, sub3, ut, type Plan, type Ramme, type Strek } from "./plan"
import { speglPlan } from "./spegl"
import { spegelakse } from "./gruppe"

export const teiknaFirkant = (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b, [a[0], b[1]]]

export const teiknaRund = (a: Pt, b: Pt): Pt[] => {
  const cx = (a[0] + b[0]) / 2
  const cy = (a[1] + b[1]) / 2
  const rx = (b[0] - a[0]) / 2
  const ry = (b[1] - a[1]) / 2
  return Array.from({ length: 8 }, (_, i): Pt => {
    const v = (i * Math.PI) / 4
    return [+(cx + rx * Math.cos(v)).toFixed(6), +(cy + ry * Math.sin(v)).toFixed(6)]
  })
}

export function teiknaHalv(punkt: readonly Pt[], tol: number): Pt[] | null {
  if (!Number.isFinite(tol) || tol <= 0 || punkt.some((p) => !p.every(Number.isFinite))) return null
  const raa = punkt.filter((p, i) => !i || avstand(p, punkt[i - 1]) > 1e-7)
  if (raa.length < 3) return null
  const side = Math.sign(raa.reduce((a, p) => a + p[0], 0)) || 1
  const halv = raa.map((p): Pt => [side * Math.max(0, side * p[0]), p[1]])
  const tett: Pt[] = []
  for (const p of halv) if (!tett.length || avstand(p, tett[tett.length - 1]) > tol) tett.push(p)
  if (tett.length < 2) return null
  const hald = [0, tett.length - 1]
  for (;;) {
    let feil = -1
    let neste = -1
    for (let k = 0; k + 1 < hald.length; k++) {
      for (let i = hald[k] + 1; i < hald[k + 1]; i++) {
        const d = fraaKant(tett[i], tett[hald[k]], tett[hald[k + 1]])
        if (d > feil) { feil = d; neste = i }
      }
    }
    if (neste < 0 || feil <= tol || hald.length >= OMRISS_TAK / 2) break
    hald.push(neste)
    hald.sort((a, b) => a - b)
  }
  const glatt = hald.map((i) => tett[i])
  const spegla = glatt.map((p): Pt => [-p[0], p[1]]).reverse()
  const ring = [...glatt, ...spegla.filter((p, i) => (i === 0 ? Math.abs(p[0]) > tol : i === spegla.length - 1 ? Math.abs(p[0]) > tol : true))]
  if (ring.length < 3 || Math.abs(shoelace(ring)) < tol * tol * 32) return null
  return ring.slice(0, OMRISS_TAK)
}

export function teikneNormal(n: Vec3): Vec3 {
  const akse = n.findIndex((v) => Math.abs(v) > Math.cos(Math.PI / 60))
  return akse < 0 ? n : n.map((v, i) => i === akse ? Math.sign(v) : 0) as Vec3
}

const avstand = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const fraaKant = (p: Pt, a: Pt, b: Pt) => {
  const x = b[0] - a[0], y = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y || 1)))
  return avstand(p, [a[0] + t * x, a[1] + t * y])
}

export function teiknaKontur(punkt: readonly Pt[], tol: number): Pt[] | null {
  if (!Number.isFinite(tol) || tol <= 0 || punkt.some((p) => !p.every(Number.isFinite))) return null
  const raa = punkt.filter((p, i) => !i || avstand(p, punkt[i - 1]) > 1e-7)
  if (raa.length > 1 && avstand(raa[0], raa[raa.length - 1]) <= tol * 2) raa.pop()
  const ring = storsteLokke(raa)
  if (ring.length < 3) return null
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  if (Math.max(w, h) < tol * 16 || Math.min(w, h) < tol * 3 || Math.abs(shoelace(ring)) < tol * tol * 32) return null

  let fjern = 1
  for (let i = 2; i < ring.length; i++) if (avstand(ring[0], ring[i]) > avstand(ring[0], ring[fjern])) fjern = i
  const hald = [0, fjern]
  for (;;) {
    let feil = -1, neste = -1
    for (let k = 0; k < hald.length; k++) {
      const a = hald[k], b = k + 1 < hald.length ? hald[k + 1] : ring.length
      for (let i = a + 1; i < b; i++) {
        const d = fraaKant(ring[i], ring[a], ring[b % ring.length])
        if (d > feil) { feil = d; neste = i }
      }
    }
    if (neste < 0 || (feil <= tol && hald.length >= 3) || hald.length >= OMRISS_TAK) break
    hald.push(neste)
    hald.sort((a, b) => a - b)
  }
  const omriss = storsteLokke(hald.map((i) => ring[i]))
  if (omriss.length < 3 || Math.abs(shoelace(omriss)) < tol * tol * 32) return null
  return omriss
}

function kryssPkt(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]], q: Pt = [d[0] - c[0], d[1] - c[1]]
  const nemn = r[0] * q[1] - r[1] * q[0]
  if (Math.abs(nemn) < 1e-15) return null
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / nemn
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / nemn
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + t * r[0], a[1] + t * r[1]] : null
}

export function storsteLokke(ring: readonly Pt[], djup = 0): Pt[] {
  const n = ring.length
  if (n < 4 || djup > 64) return ring.slice()
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const x = kryssPkt(a, b, ring[j], ring[(j + 1) % n])
      if (!x) continue
      const inni = storsteLokke([x, ...ring.slice(i + 1, j + 1)], djup + 1)
      const utanfor = storsteLokke([...ring.slice(0, i + 1), x, ...ring.slice(j + 1)], djup + 1)
      return Math.abs(shoelace(inni)) >= Math.abs(shoelace(utanfor)) ? inni : utanfor
    }
  }
  return ring.slice()
}

type Boks2 = { x0: number; x1: number; y0: number; y1: number }

function klippXY(a: Vec3, b: Vec3, k: Boks2): [Vec3, Vec3] | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - k.x0], [dx, k.x1 - a[0]], [-dy, a[1] - k.y0], [dy, k.y1 - a[1]]] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return null
  }
  const pa = (t: number): Vec3 => [a[0] + dx * t, a[1] + dy * t, a[2] + (b[2] - a[2]) * t]
  return [pa(t0), pa(t1)]
}

export function landing(plan: readonly Plan[], min: Vec3, max: Vec3, S: number, fot: readonly Vec3[], t = 0): number | null {
  if (fot.length < 3) return null
  const eps = Math.max(0.5, 0.002 * S)
  const k: Boks2 = {
    x0: Math.min(...fot.map((p) => p[0])) + eps,
    x1: Math.max(...fot.map((p) => p[0])) - eps,
    y0: Math.min(...fot.map((p) => p[1])) + eps,
    y1: Math.max(...fot.map((p) => p[1])) - eps,
  }
  if (k.x0 >= k.x1 || k.y0 >= k.y1) return null
  let topp = -Infinity
  for (const q of plan) {
    if (!q.omriss || q.bog || Math.abs(q.n[2]) > 0.5) continue
    const r = ramme(q, min, max)
    const pk = omrissLine(q.omriss, q.runde).map((p) => ut(r, [p[0] * S, p[1] * S]))
    for (let i = 0; i < pk.length; i++) {
      const s = klippXY(pk[i], pk[(i + 1) % pk.length], k)
      if (s && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) + 2 * eps >= t) topp = Math.max(topp, s[0][2], s[1][2])
    }
  }
  return Number.isFinite(topp) ? topp : null
}

export function mellom(plan: readonly Plan[], min: Vec3, max: Vec3, S: number, t: number, fot: readonly Vec3[]): { z: number; fot: Vec3[] } | null {
  if (fot.length < 3) return null
  const eps = Math.max(0.5, 0.002 * S)
  const cx = fot.reduce((a, p) => a + p[0], 0) / fot.length, cy = fot.reduce((a, p) => a + p[1], 0) / fot.length
  const k: Boks2 = { x0: Math.min(...fot.map((p) => p[0])) - eps, x1: Math.max(...fot.map((p) => p[0])) + eps, y0: Math.min(...fot.map((p) => p[1])) - eps, y1: Math.max(...fot.map((p) => p[1])) + eps }
  const ny = fot.map((p): Vec3 => [...p])
  let topp = Infinity, tal = 0
  for (const q of plan) {
    if (!q.omriss || q.bog || Math.abs(q.n[2]) > 1e-3) continue
    const r = ramme(q, min, max)
    const L = Math.hypot(r.n[0], r.n[1])
    const nx = r.n[0] / L, ny2 = r.n[1] / L
    const av = (p: Vec3) => (p[0] - r.o[0]) * nx + (p[1] - r.o[1]) * ny2
    const side = Math.sign(av([cx, cy, 0]))
    const d = fot.map(av)
    if (!side || d.some((v) => v * side < -eps)) { if (d.some((v) => Math.abs(v) <= eps)) return null; continue }
    const paa = d.map((v) => Math.abs(v) <= eps)
    if (!paa.some((b, i) => b && paa[(i + 1) % paa.length])) continue
    let hoeg = -Infinity
    const pk = omrissLine(q.omriss, q.runde).map((p) => ut(r, [p[0] * S, p[1] * S]))
    for (let i = 0; i < pk.length; i++) {
      const sg = klippXY(pk[i], pk[(i + 1) % pk.length], k)
      if (sg && Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) >= t) hoeg = Math.max(hoeg, sg[0][2], sg[1][2])
    }
    if (!Number.isFinite(hoeg)) continue
    topp = Math.min(topp, hoeg)
    tal++
    paa.forEach((b, i) => {
      if (!b) return
      const flytt = -side * t / 2 - d[i]
      ny[i] = [ny[i][0] + nx * flytt, ny[i][1] + ny2 * flytt, ny[i][2]]
    })
  }
  return tal >= 2 ? { z: topp - 2.5 * t, fot: ny } : null
}

export function haldt(plan: readonly Plan[], min: Vec3, max: Vec3, S: number, t: number, po: Vec3, pn: Vec3, fot: readonly Vec3[]): Vec3 | null {
  if (fot.length < 3 || Math.abs(pn[2]) > 1e-3) return null
  const eps = Math.max(0.5, 0.002 * S)
  const z0 = Math.min(...fot.map((p) => p[2])), z1 = Math.max(...fot.map((p) => p[2]))
  const sider: { r: Ramme; ring: Pt[] }[] = []
  for (const q of plan) {
    if (!q.omriss || q.bog || Math.abs(q.n[2]) > 1e-3) continue
    const r = ramme(q, min, max)
    if (Math.abs(dot(r.n, pn)) > 0.999) continue
    const L = Math.hypot(r.n[0], r.n[1])
    const av = (p: Vec3) => ((p[0] - r.o[0]) * r.n[0] + (p[1] - r.o[1]) * r.n[1]) / L
    const d = fot.map(av)
    if (Math.min(...d) > eps || Math.max(...d) < -eps) continue
    sider.push({ r, ring: omrissLine(q.omriss, q.runde).map((p): Pt => [p[0] * S, p[1] * S]) })
  }
  if (!sider.length) return null
  const held = (p: Vec3) => sider.every(({ r, ring }) => [z0 + t / 2, (z0 + z1) / 2, z1 - t / 2].every((z) => {
    const q: Vec3 = [p[0], p[1], z]
    return inRing(ring, [dot(sub3(q, r.o), r.u), dot(sub3(q, r.o), r.v)])
  }))
  if (held(po)) return null
  const steg = t / 2
  const inne = (p: Vec3) => p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1]
  const gode: number[] = []
  for (let k = -Math.ceil(S / steg); k <= Math.ceil(S / steg); k++) {
    const p = add3(po, mul3(pn, k * steg))
    if (inne(p) && held(p)) gode.push(k)
  }
  if (!gode.length) return null
  const strekk: [number, number][] = []
  for (const k of gode) {
    const sist = strekk[strekk.length - 1]
    if (sist && k === sist[1] + 1) sist[1] = k
    else strekk.push([k, k])
  }
  const naer = strekk.reduce((a, b) => (Math.min(Math.abs(b[0]), Math.abs(b[1])) < Math.min(Math.abs(a[0]), Math.abs(a[1])) ? b : a))
  return add3(po, mul3(pn, ((naer[0] + naer[1]) / 2) * steg))
}

export type Snappline = { p: Pt; d: Pt }

export function snappliner(plan: readonly Plan[], min: Vec3, max: Vec3, S: number, flate: Ramme): Snappline[] {
  const til = (p: Vec3): Pt => [dot(sub3(p, flate.o), flate.u) / S, dot(sub3(p, flate.o), flate.v) / S]
  const retn = (d: Vec3): Pt => {
    const q: Pt = [dot(d, flate.u), dot(d, flate.v)]
    const L = Math.hypot(q[0], q[1]) || 1
    return [q[0] / L, q[1] / L]
  }
  const ut2: Snappline[] = []
  const golv: Ramme = { o: [0, 0, min[2]], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], k: 0 }
  for (const r of [golv, ...plan.filter((q) => !q.bog).map((q) => ramme(q, min, max))]) {
    const x = kryss(flate, r)
    if (x) ut2.push({ p: til(x.p), d: retn(x.d) })
  }
  for (const q of plan) {
    if (q.bog || !q.omriss) continue
    const r = ramme(q, min, max)
    if (Math.abs(Math.abs(dot(r.n, flate.n)) - 1) > 1e-6) continue
    const pk = omrissLine(q.omriss, q.runde).map((p) => til(ut(r, [p[0] * S, p[1] * S])))
    for (let i = 0; i < pk.length; i++) {
      const a = pk[i], b = pk[(i + 1) % pk.length]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L > 0.02) ut2.push({ p: a, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] })
    }
  }
  for (const q of plan) {
    if (q.bog || !q.omriss) continue
    const r = ramme(q, min, max)
    const x = kryss(flate, r)
    if (!x) continue
    const tvers: Pt = [-retn(x.d)[1], retn(x.d)[0]]
    const pk = omrissLine(q.omriss, q.runde).map((p) => ut(r, [p[0] * S, p[1] * S]))
    for (let i = 0; i < pk.length; i++) {
      const a = pk[i], b = pk[(i + 1) % pk.length]
      const e = sub3(b, a)
      const L = Math.hypot(e[0], e[1], e[2])
      if (L < 0.02 * S || Math.abs(dot(e, flate.n)) / L < 0.9986) continue
      ut2.push({ p: til(a), d: tvers })
    }
  }
  return ut2
}

export function snapp(q: Pt, liner: readonly Snappline[], tol: number): Pt {
  const naer = liner
    .map((l) => {
      const rx = q[0] - l.p[0]
      const ry = q[1] - l.p[1]
      return { l, a: -rx * l.d[1] + ry * l.d[0] }
    })
    .filter((x) => Math.abs(x.a) <= tol)
    .sort((x, y) => Math.abs(x.a) - Math.abs(y.a))
  if (!naer.length) return q
  const [f] = naer
  const paa: Pt = [q[0] + f.a * f.l.d[1], q[1] - f.a * f.l.d[0]]
  for (const s of naer.slice(1)) {
    const c = f.l.d[0] * s.l.d[1] - f.l.d[1] * s.l.d[0]
    if (Math.abs(c) < 0.2) continue
    const t = ((s.l.p[0] - f.l.p[0]) * s.l.d[1] - (s.l.p[1] - f.l.p[1]) * s.l.d[0]) / c
    const x: Pt = [f.l.p[0] + f.l.d[0] * t, f.l.p[1] + f.l.d[1] * t]
    if (Math.hypot(x[0] - q[0], x[1] - q[1]) <= tol * 1.5) return x
  }
  return paa
}

export function snappaKontur(raa: readonly Pt[], snappa: readonly Pt[], tol: number): Pt[] {
  const n = Math.min(raa.length, snappa.length)
  if (n < 3) return snappa.slice(0, n)
  const flytta = raa.map((p, i) => i < n && avstand(p, snappa[i]) > 1e-9)
  const vindauge = 6 * tol
  const retn = (i: number, fram: boolean): Pt | null => {
    let k = i
    for (;;) {
      const neste = fram ? k + 1 : k - 1
      if (neste < 0 || neste >= n) break
      k = neste
      if (avstand(raa[k], raa[i]) >= vindauge) break
    }
    const L = avstand(raa[k], raa[i])
    return L > 1e-9 ? [(raa[k][0] - raa[i][0]) / L, (raa[k][1] - raa[i][1]) / L] : null
  }
  const anker = raa.map((_, i) => {
    if (i === 0 || i === n - 1) return true
    const inn = retn(i, false), ut = retn(i, true)
    if (!inn || !ut) return false
    const c = -(inn[0] * ut[0] + inn[1] * ut[1])
    return Math.acos(Math.max(-1, Math.min(1, c))) > (45 * Math.PI) / 180
  })
  const ut = raa.slice(0, n)
  for (let i = 0; i < n; i++) if (anker[i] && flytta[i]) ut[i] = snappa[i]
  const iBand = flytta.map((f, i) => f || (i > 0 && i < n - 1 && flytta[i - 1] && flytta[i + 1]))
  let i = 0
  while (i < n) {
    if (!iBand[i] || anker[i]) { i++; continue }
    let j = i
    while (j + 1 < n && iBand[j + 1] && !anker[j + 1]) j++
    let naer = Infinity, fjern = 0
    for (let k = i; k <= j; k++) { const d = avstand(raa[k], snappa[k]); naer = Math.min(naer, d); fjern = Math.max(fjern, d) }
    if (fjern - naer <= 2 * tol) for (let k = i; k <= j; k++) ut[k] = snappa[k]
    i = j + 1
  }
  return ut
}

export function holAv(punkt: readonly Pt[], flate: Ramme, q: Plan, min: Vec3, max: Vec3, S: number): Strek | null {
  if (!q.omriss || q.bog || punkt.length < 3) return null
  const r = ramme(q, min, max)
  if (Math.abs(Math.abs(dot(r.n, flate.n)) - 1) > 1e-6) return null
  const lok = tettMjukt(punkt).map((p): Pt => {
    const d = sub3(ut(flate, [p[0] * S, p[1] * S]), r.o)
    return [dot(d, r.u) / S, dot(d, r.v) / S]
  })
  const ring = omrissLine(q.omriss, q.runde)
  if (!lok.every((p) => inRing(ring, p))) return null
  const x0 = Math.min(...lok.map((p) => p[0]))
  const x1 = Math.max(...lok.map((p) => p[0]))
  const y0 = Math.min(...lok.map((p) => p[1]))
  const y1 = Math.max(...lok.map((p) => p[1]))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 1e-3 || h < 1e-3) return null
  const x = (x0 + x1) / 2
  const y = (y0 + y1) / 2
  return {
    slag: "hol",
    form: "kontur",
    punkt: lok.map((p): Pt => [+((p[0] - x) / w).toFixed(4), +((p[1] - y) / h).toFixed(4)]),
    x: +x.toFixed(4),
    y: +y.toFixed(4),
    w: +w.toFixed(4),
    h: +h.toFixed(4),
    a: 0,
  }
}

export function mjukePunkt(o: readonly Pt[]): number[] {
  const n = o.length
  if (n < 5) return []
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1])
  const kort = 0.3 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const ut: number[] = []
  for (let i = 0; i < n; i++) {
    const a = o[(i - 1 + n) % n], b = o[i], c = o[(i + 1) % n]
    const u: Pt = [b[0] - a[0], b[1] - a[1]], v: Pt = [c[0] - b[0], c[1] - b[1]]
    const lu = Math.hypot(...u), lv = Math.hypot(...v)
    if (!lu || !lv || lu > kort || lv > kort) continue
    const snu = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv))))
    if (snu < (50 * Math.PI) / 180) ut.push(i)
  }
  return ut
}

export function tettMjukt(o: readonly Pt[], tak = OMRISS_TAK): Pt[] {
  const rund = new Set(mjukePunkt(o))
  const n = o.length
  const boge = [...Array(n).keys()].filter((i) => rund.has(i) || rund.has((i + 1) % n))
  if (!boge.length || n >= tak) return o.slice()
  const ekstra = Math.floor((tak - n) / boge.length)
  if (!ekstra) return o.slice()
  const ut: Pt[] = []
  for (let i = 0; i < n; i++) {
    ut.push(o[i])
    if (boge.includes(i)) for (let k = 1; k <= ekstra; k++) ut.push(bogeVed(o, rund, i, k / (ekstra + 1)))
  }
  return ut
}

const tilKant = (p: Pt, a: Pt, b: Pt) => fraaKant(p, a, b)

function tilRing(p: Pt, ring: readonly Pt[]): number {
  let m = Infinity
  for (let i = 0; i < ring.length; i++) m = Math.min(m, tilKant(p, ring[i], ring[(i + 1) % ring.length]))
  return m
}

export function symmetrisk(punkt: readonly Pt[]): Pt[] | null {
  if (punkt.length < 3) return null
  const xs = punkt.map((p) => p[0])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const w = x1 - x0
  if (w <= 0) return null
  const c = (x0 + x1) / 2
  const spegl = punkt.map((p): Pt => [2 * c - p[0], p[1]])
  const avvik = punkt.map((p) => tilRing(p, spegl))
  const snitt = avvik.reduce((s, d) => s + d, 0) / avvik.length
  if (snitt > 0.05 * w || Math.max(...avvik) > 0.12 * w) return null
  const halv: { p: Pt; paa: boolean }[] = []
  for (let i = 0; i < punkt.length; i++) {
    const a = punkt[i]
    const b = punkt[(i + 1) % punkt.length]
    const ai = a[0] >= c
    const bi = b[0] >= c
    if (ai) halv.push({ p: a, paa: Math.abs(a[0] - c) < 1e-9 })
    if (ai !== bi) {
      const t = (c - a[0]) / (b[0] - a[0])
      if (t > 1e-12 && t < 1 - 1e-12) halv.push({ p: [c, a[1] + (b[1] - a[1]) * t], paa: true })
    }
  }
  const paa = halv.map((h, i) => (h.paa ? i : -1)).filter((i) => i >= 0)
  if (paa.length !== 2) return null
  const n = halv.length
  const kjede = (fraa: number, til: number) => {
    const k: Pt[] = []
    for (let i = fraa; ; i = (i + 1) % n) {
      k.push(halv[i].p)
      if (i === til) break
    }
    return k
  }
  const a = kjede(paa[0], paa[1])
  const b = kjede(paa[1], paa[0])
  const ute = (k: Pt[]) => k.slice(1, -1).reduce((s, p) => s + p[0] - c, 0)
  const hogre = ute(a) >= ute(b) ? a : b
  if (hogre.length < 3) return null
  const venstre = hogre.slice(1, -1).reverse().map((p): Pt => [2 * c - p[0], p[1]])
  const ut: Pt[] = [...hogre, ...venstre]
  return ut.filter((p, i) => {
    if (Math.abs(p[0] - c) > 1e-9) return true
    const f = ut[(i + ut.length - 1) % ut.length]
    const e = ut[(i + 1) % ut.length]
    return fraaKant(p, f, e) > 0.01 * w
  })
}

export function midtPaa(punkt: readonly Pt[], tol: number, vassrett: boolean, snappa: readonly [boolean, boolean] = [false, false]): Pt[] {
  const xs = punkt.map((p) => p[0])
  const ys = punkt.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const eiSide = Math.min(...xs) > 0 || Math.max(...xs) < 0
  const dx = !snappa[0] && Math.abs(cx) <= tol && !(eiSide && tol === Infinity) ? -cx : 0
  const dy = !snappa[1] && vassrett && Math.abs(cy) <= tol ? -cy : 0
  return dx || dy ? punkt.map((p): Pt => [+(p[0] + dx).toFixed(6), +(p[1] + dy).toFixed(6)]) : [...punkt]
}

export function rettOpp(punkt: readonly Pt[], slag: "firkant" | "kontur" | "rund" | "halv", tol: number, vassrett: boolean, snappa: readonly [boolean, boolean] = [false, false]): Pt[] {
  const s = slag === "kontur" ? symmetrisk(punkt) ?? punkt : punkt
  return midtPaa(s, tol, vassrett, snappa)
}

export type Lukka =
  | { slag: "hol"; plan: Plan[]; strek: number }
  | { slag: "plate"; o: Vec3; omriss?: Pt[] }
  | { slag: "nei"; kvifor: string }

const sameOmriss = (a: readonly Pt[] | undefined, b: readonly Pt[] | undefined): boolean =>
  !!a && !!b && a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1])

export function ogSysken(fyrr: readonly Plan[], l: readonly Plan[], id: number): Plan[] {
  const f = fyrr.find((q) => q.id === id)
  const m = l.find((q) => q.id === id)
  if (!f?.omriss || !m?.gruppe) return [...l]
  const sysken = (q: Plan) => q.id !== id && q.gruppe === m.gruppe && sameOmriss(q.omriss, f.omriss)
  if (!m.omriss) return l.map((q) => (sysken(q) ? (({ omriss: _o, runde: _r, ...rest }) => rest as Plan)(q) : q))
  return l.map((q) =>
    sysken(q) ? { ...q, omriss: m.omriss, ...(m.runde ? { runde: m.runde } : { runde: undefined }) } : q,
  )
}

export function medStrek(l: readonly Plan[], id: number, strek: readonly Strek[], min: Vec3, max: Vec3): Plan[] {
  const maal = l.find((q) => q.id === id)
  if (!maal) return [...l]
  const med: Plan = { ...maal, strek: [...strek] }
  const par = maal.gruppe ? l.filter((q) => q.gruppe === maal.gruppe && q.id !== maal.id) : []
  const akse = par.length === 1 ? spegelakse(maal, par[0]) : null
  const spegla = akse !== null ? speglPlan(med, akse, min, max).strek : null
  const like = akse !== null || !maal.omriss ? new Set<number>() : new Set(par.filter((q) => sameOmriss(q.omriss, maal.omriss)).map((q) => q.id))
  return l.map((q) =>
    q.id === maal.id
      ? med
      : spegla && q.id === par[0].id
        ? { ...q, strek: spegla }
        : like.has(q.id)
          ? { ...q, strek: [...strek] }
          : q,
  )
}

export function lukkTeikning(l: readonly Plan[], vald: number | null, po: Vec3, pn: Vec3, punkt: readonly Pt[], omriss: readonly Pt[], min: Vec3, max: Vec3, S: number, t: number): Lukka {
  const flate = ramme({ o: broek(po, min, max), n: pn }, min, max)
  const maal = l.find((q) => q.id === vald)
  const hol = maal && holAv(punkt, flate, maal, min, max, S)
  if (maal && hol) {
    if (maal.strek.length >= STREK_TAK) return { slag: "nei", kvifor: `taket er ${STREK_TAK} strek` }
    const med: Plan = { ...maal, strek: [...maal.strek, hol] }
    return { slag: "hol", plan: medStrek(l, maal.id, med.strek, min, max), strek: med.strek.length - 1 }
  }
  let p = po
  if (pn[2] > 0.999) {
    const fot = omriss.map((q) => ut(flate, [q[0] * S, q[1] * S]))
    const m = mellom(l, min, max, S, t, fot)
    if (m) {
      const tilbake = m.fot.map((q): Pt => { const d = sub3(q, flate.o); return [+(dot(d, flate.u) / S).toFixed(4), +(dot(d, flate.v) / S).toFixed(4)] })
      return { slag: "plate", o: broek([po[0], po[1], m.z], min, max), omriss: tilbake }
    }
    const z = landing(l, min, max, S, fot, t)
    if (z !== null) p = [po[0], po[1], z + t / 2]
  } else if (Math.abs(pn[2]) < 1e-3) {
    const fot = omriss.map((q) => ut(flate, [q[0] * S, q[1] * S]))
    p = haldt(l, min, max, S, t, po, pn, fot) ?? po
  }
  return { slag: "plate", o: broek(p, min, max) }
}
