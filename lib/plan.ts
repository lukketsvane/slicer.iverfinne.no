import { lagFarge, shoelace, type Pt, type Vec3 } from "./core"

export const PLAN_TAK = 64
export const STREK_TAK = 24
export const OMRISS_TAK = 48

export type Strek = {
  slag: "gods" | "hol"
  form: "rekt" | "rund" | "kontur"
  punkt?: Pt[]
  x: number
  y: number
  w: number
  h: number
  a: number
}

export type Plan = {
  id: number
  o: Vec3
  n: Vec3
  bog: number
  firkant?: true
  omriss?: Pt[]
  runde?: number[]
  nett?: true
  mjuk?: number
  strek: Strek[]
  gruppe?: number
  farge?: number
}

export const BOG_TAK = 4
export const MJUK_TAK = 0.02
export const bogRadius = (bog: number, storleik: number) => storleik / Math.abs(bog)

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const norm3 = (a: Vec3): Vec3 => {
  const L = len3(a) || 1
  return [a[0] / L, a[1] / L, a[2] / L]
}
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export function vriOm(v: Vec3, akse: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const k = cross(akse, v)
  const d = dot(akse, v) * (1 - c)
  return [v[0] * c + k[0] * s + akse[0] * d, v[1] * c + k[1] * s + akse[1] * d, v[2] * c + k[2] * s + akse[2] * d]
}
export function dreiing(fraa: Vec3, til: Vec3): { akse: Vec3; ang: number } {
  const a = norm3(fraa)
  const b = norm3(til)
  const k = cross(a, b)
  const s = len3(k)
  const c = Math.max(-1, Math.min(1, dot(a, b)))
  if (s < 1e-9) {
    if (c > 0) return { akse: [0, 0, 1], ang: 0 }
    const tvers: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    return { akse: norm3(cross(a, tvers)), ang: Math.PI }
  }
  return { akse: mul3(k, 1 / s), ang: Math.atan2(s, c) }
}

export type Ramme = {
  o: Vec3
  n: Vec3
  u: Vec3
  v: Vec3
  k: number
}

export function akser(n: Vec3): { u: Vec3; v: Vec3 } {
  const ref: Vec3 = Math.abs(n[2]) < 0.9999 ? [0, 0, 1] : [0, 1, 0]
  const k = dot(ref, n)
  const v = norm3(sub3(ref, mul3(n, k)))
  return { u: cross(v, n), v }
}

export const lengste = (min: Vec3, max: Vec3) => Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)

export function ramme(pl: { o: Vec3; n: Vec3; bog?: number }, min: Vec3, max: Vec3): Ramme {
  const n = norm3(pl.n)
  const o: Vec3 = [
    min[0] + pl.o[0] * (max[0] - min[0]),
    min[1] + pl.o[1] * (max[1] - min[1]),
    min[2] + pl.o[2] * (max[2] - min[2]),
  ]
  return { o, n, ...akser(n), k: (pl.bog ?? 0) / lengste(min, max) }
}

export const bogPar = (k: number, u: number): [number, number] => {
  const a = k * u
  if (Math.abs(a) < 1e-6) return [u * (1 - (a * a) / 6), (u * a) / 2]
  return [Math.sin(a) / k, (1 - Math.cos(a)) / k]
}

export const ut = (r: Ramme, q: Pt, off = 0): Vec3 => {
  if (!r.k) {
    return [
      r.o[0] + q[0] * r.u[0] + q[1] * r.v[0] + off * r.n[0],
      r.o[1] + q[0] * r.u[1] + q[1] * r.v[1] + off * r.n[1],
      r.o[2] + q[0] * r.u[2] + q[1] * r.v[2] + off * r.n[2],
    ]
  }
  const a = r.k * q[0]
  const [su, sn] = bogPar(r.k, q[0])
  const c = Math.cos(a)
  const si = Math.sin(a)
  const du = su - off * si
  const dn = sn + off * c
  return [
    r.o[0] + du * r.u[0] + q[1] * r.v[0] + dn * r.n[0],
    r.o[1] + du * r.u[1] + q[1] * r.v[1] + dn * r.n[1],
    r.o[2] + du * r.u[2] + q[1] * r.v[2] + dn * r.n[2],
  ]
}

export const inn = (r: Ramme, p: Vec3): Pt => {
  const d = sub3(p, r.o)
  const a = dot(d, r.u)
  const c = dot(d, r.v)
  if (!r.k) return [a, c]
  const R = 1 / r.k
  const b = dot(d, r.n)
  const sg = Math.sign(R)
  return [Math.atan2(sg * a, sg * (R - b)) * R, c]
}

export const avFlata = (r: Ramme, p: Vec3): number => {
  const d = sub3(p, r.o)
  if (!r.k) return dot(d, r.n)
  const R = 1 / r.k
  return R - Math.hypot(dot(d, r.u), R - dot(d, r.n)) * Math.sign(R)
}

export const broek = (p: Vec3, min: Vec3, max: Vec3): Vec3 => [
  (p[0] - min[0]) / Math.max(1e-9, max[0] - min[0]),
  (p[1] - min[1]) / Math.max(1e-9, max[1] - min[1]),
  (p[2] - min[2]) / Math.max(1e-9, max[2] - min[2]),
]

export const KRYSS_MIN = Math.sin((5 * Math.PI) / 180)

export type Mote = { p: Vec3; d: Vec3; sin: number; boge?: [Vec3, Vec3] }

export function kryss(a: Ramme, b: Ramme): Mote | null {
  const d = cross(a.n, b.n)
  const L = len3(d)
  if (L < KRYSS_MIN) return null
  const da = dot(a.n, a.o)
  const db = dot(b.n, b.o)
  const c = dot(a.n, b.n)
  const den = 1 - c * c
  const ka = (da - db * c) / den
  const kb = (db - da * c) / den
  return { p: add3(mul3(a.n, ka), mul3(b.n, kb)), d: mul3(d, 1 / L), sin: L }
}

const PARALLELT = 1e-3
const ROT_STEG = 64

export function kryssBoygd(kr: Ramme, fl: Ramme, u0: number, u1: number): Mote[] {
  if (!kr.k || fl.k) return []
  if (Math.abs(dot(fl.n, kr.v)) > PARALLELT) return []
  if (!(u1 > u0)) return []
  const dFl = dot(fl.n, fl.o)
  const f = (u: number) => dot(ut(kr, [u, 0], 0), fl.n) - dFl
  const rot: number[] = []
  let ua = u0
  let fa = f(ua)
  for (let i = 1; i <= ROT_STEG; i++) {
    const ub = u0 + ((u1 - u0) * i) / ROT_STEG
    const fb = f(ub)
    if (fa === 0) rot.push(ua)
    else if (fa * fb < 0) {
      let lo = ua
      let hi = ub
      let flo = fa
      for (let it = 0; it < 20; it++) {
        const m = (lo + hi) / 2
        const fm = f(m)
        if (flo * fm <= 0) hi = m
        else {
          lo = m
          flo = fm
        }
      }
      rot.push((lo + hi) / 2)
    }
    ua = ub
    fa = fb
  }
  return rot.map((u) => {
    const a = kr.k * u
    const nu = norm3(sub3(mul3(kr.n, Math.cos(a)), mul3(kr.u, Math.sin(a))))
    return { p: ut(kr, [u, 0], 0), d: kr.v, sin: len3(cross(nu, fl.n)) }
  })
}

export function kryssRing(kr: Ramme, fl: Ramme, u0: number, u1: number): Mote | null {
  if (!kr.k || fl.k) return null
  if (Math.hypot(dot(fl.n, kr.u), dot(fl.n, kr.n)) > PARALLELT) return null
  if (!(u1 > u0)) return null
  const cv = dot(fl.n, kr.v)
  const R = 1 / kr.k
  const dFl = dot(fl.n, fl.o)
  const w = (dFl - dot(fl.n, kr.o)) / cv
  const u = (u0 + u1) / 2
  const a = kr.k * u
  const nu = norm3(sub3(mul3(kr.n, Math.cos(a)), mul3(kr.u, Math.sin(a))))
  const tang = norm3(add3(mul3(kr.u, Math.cos(a)), mul3(kr.n, Math.sin(a))))
  const h = Math.abs(R) / 4
  return {
    p: ut(kr, [u, w], 0),
    d: tang,
    sin: len3(cross(nu, fl.n)),
    boge: [ut(kr, [u - h, w], 0), ut(kr, [u + h, w], 0)],
  }
}

const KRUM_NULL = 1e-9

export const ein2 = (b: Pt, a: Pt): Pt => {
  const q: Pt = [b[0] - a[0], b[1] - a[1]]
  const L = Math.hypot(q[0], q[1]) || 1
  return [q[0] / L, q[1] / L]
}

export function moteInn(r: Ramme, x: Mote): { p: Pt; d: Pt; k: number } {
  const P = inn(r, x.p)
  if (!x.boge) return { p: P, d: ein2(inn(r, add3(x.p, x.d)), P), k: 0 }
  const A = inn(r, x.boge[0])
  const B = inn(r, x.boge[1])
  const ax = P[0] - A[0]
  const ay = P[1] - A[1]
  const bx = B[0] - P[0]
  const by = B[1] - P[1]
  const nemn = Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(B[0] - A[0], B[1] - A[1])
  const k = nemn > 1e-12 ? (2 * (ax * by - ay * bx)) / nemn : 0
  return { p: P, d: ein2(B, A), k: Math.abs(k) < KRUM_NULL ? 0 : k }
}

const tal4 = (v: number) => String(+v.toFixed(4))
const vec = (v: Vec3) => v.map(tal4).join(",")

const skrivStrek = (s: Strek) =>
  `${s.slag === "gods" ? "+" : "-"}${s.form === "rekt" ? "r" : s.form === "kontur" ? "k" : "o"}:${[s.x, s.y, s.w, s.h, s.a, ...(s.form === "kontur" ? (s.punkt ?? []).flat() : [])].map(tal4).join(",")}`

const skrivOmriss = (o: readonly Pt[]) => `p:${o.map((q) => `${tal4(q[0])},${tal4(q[1])}`).join(",")}`
const skrivRunde = (r: readonly number[]) => `r:${r.join(",")}`

export function skrivPlan(l: readonly Plan[]): string {
  return l
    .map((p) =>
      [`${p.id}@${vec(p.o)}/${vec(p.n)}`, ...(p.bog ? [`b:${+p.bog.toFixed(4)}`] : []), ...(p.firkant ? ["f:1"] : []), ...(p.nett && p.omriss?.length ? ["n:1"] : []), ...(p.mjuk ? [`m:${+p.mjuk.toFixed(4)}`] : []), ...(p.omriss?.length ? [skrivOmriss(p.omriss)] : []), ...(p.omriss?.length && p.runde?.length ? [skrivRunde(p.runde)] : []), ...(p.gruppe ? [`g:${p.gruppe}`] : []), ...(p.farge ? [`c:${p.farge}`] : []), ...p.strek.map(skrivStrek)].join("/"),
    )
    .join(";")
}

const lesVec = (s: string): Vec3 | null => {
  const v = s.split(",").map(Number)
  if (v.length !== 3 || !v.every(Number.isFinite)) return null
  return [v[0], v[1], v[2]]
}

const lesStrek = (s: string): Strek | null => {
  const m = /^([+-])([rok]):(.*)$/.exec(s)
  if (!m) return null
  const slag = m[1] === "+" ? "gods" : "hol"
  const v = m[3].split(",").map(Number)
  const kontur = m[2] === "k"
  if (kontur ? v.length < 11 || v.length % 2 === 0 || v.length > 5 + 2 * OMRISS_TAK : v.length !== 5) return null
  if (!v.every(Number.isFinite)) return null
  const [x, y, w, h, a] = v
  if (Math.abs(x) > 2 || Math.abs(y) > 2 || w <= 0 || h <= 0 || w > 2 || h > 2) return null
  const punkt: Pt[] = []
  for (let i = 5; i + 1 < v.length; i += 2) punkt.push([Math.max(-0.5, Math.min(0.5, +v[i].toFixed(4))), Math.max(-0.5, Math.min(0.5, +v[i + 1].toFixed(4)))])
  return {
    slag,
    form: kontur ? "kontur" : m[2] === "r" ? "rekt" : "rund",
    ...(kontur ? { punkt } : {}),
    x: +x.toFixed(4),
    y: +y.toFixed(4),
    w: +w.toFixed(4),
    h: +h.toFixed(4),
    a: +(((a % 360) + 360) % 360).toFixed(4),
  }
}

const BOGE_TOL = 0.002
const BOGE_DJUP = 4
const bogePkt = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const t2 = t * t
  const t3 = t2 * t
  const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3)
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]
}
const bogeFire = (o: readonly Pt[], rund: ReadonlySet<number>, i: number): [Pt, Pt, Pt, Pt] => {
  const n = o.length
  const j = (i + 1) % n
  return [rund.has(i) ? o[(i - 1 + n) % n] : o[i], o[i], o[j], rund.has(j) ? o[(j + 1) % n] : o[j]]
}
function bogeFlat(ut: Pt[], f: (t: number) => Pt, t0: number, t1: number, p0: Pt, p1: Pt, djup: number) {
  const tm = (t0 + t1) / 2
  const m = f(tm)
  if (djup >= BOGE_DJUP || Math.hypot(m[0] - (p0[0] + p1[0]) / 2, m[1] - (p0[1] + p1[1]) / 2) <= BOGE_TOL) {
    ut.push(p1)
    return
  }
  bogeFlat(ut, f, t0, tm, p0, m, djup + 1)
  bogeFlat(ut, f, tm, t1, m, p1, djup + 1)
}
export const bogeVed = (o: readonly Pt[], rund: ReadonlySet<number>, i: number, t: number): Pt => bogePkt(...bogeFire(o, rund, i), t)
export function omrissLine(omriss: readonly Pt[], runde?: readonly number[]): Pt[] {
  const n = omriss.length
  if (n < 3 || !runde?.length) return omriss.slice()
  const rund = new Set(runde)
  const ut: Pt[] = []
  for (let i = 0; i < n; i++) {
    ut.push(omriss[i])
    const j = (i + 1) % n
    if (!rund.has(i) && !rund.has(j)) continue
    const [a, b, c, d] = bogeFire(omriss, rund, i)
    const stykke: Pt[] = []
    bogeFlat(stykke, (t) => bogePkt(a, b, c, d, t), 0, 1, omriss[i], omriss[j], 0)
    stykke.pop()
    for (const q of stykke) ut.push(q)
  }
  return ut
}
export function omrissMidt(omriss: readonly Pt[], rund: ReadonlySet<number>, i: number): Pt {
  const n = omriss.length
  const j = (i + 1) % n
  if (!rund.has(i) && !rund.has(j)) return [(omriss[i][0] + omriss[j][0]) / 2, (omriss[i][1] + omriss[j][1]) / 2]
  const [a, b, c, d] = bogeFire(omriss, rund, i)
  return bogePkt(a, b, c, d, 0.5)
}

const lesOmriss = (s: string): Pt[] | null => {
  const v = s.split(",").map(Number)
  if (v.length < 6 || v.length % 2 !== 0 || !v.every(Number.isFinite)) return null
  const ut: Pt[] = []
  for (let i = 0; i + 1 < v.length && ut.length < OMRISS_TAK; i += 2) {
    if (Math.abs(v[i]) > 2 || Math.abs(v[i + 1]) > 2) return null
    ut.push([+v[i].toFixed(4), +v[i + 1].toFixed(4)])
  }
  if (ut.length < 3) return null
  return Math.abs(shoelace(ut)) > 1e-6 ? ut : null
}

export const PLAN_ROM = 4

const lesRunde = (s: string, n: number): number[] => {
  const v = s.split(",").map(Number)
  const ut = [...new Set(v.filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b)
  return ut
}

export function lesPlan(s: unknown): Plan[] {
  const ut: Plan[] = []
  if (typeof s !== "string" || !s) return ut
  const sett = new Set<number>()
  for (const bit of s.split(";")) {
    if (ut.length >= PLAN_TAK) break
    const [hovud, ...rest] = bit.split("/")
    const m = /^(\d{1,5})@(.*)$/.exec(hovud)
    if (!m || rest.length < 1) continue
    const id = Number(m[1])
    if (id < 1 || sett.has(id)) continue
    const o = lesVec(m[2])
    const n0 = lesVec(rest[0])
    if (!o || !n0 || len3(n0) < 1e-6) continue
    if (o.some((c) => c < -PLAN_ROM || c > 1 + PLAN_ROM)) continue
    const n = norm3(n0).map((c) => +c.toFixed(4)) as Vec3
    const strek: Strek[] = []
    let bog = 0
    let gruppe = 0
    let farge = 0
    let firkant = false
    let nett = false
    let mjuk = 0
    let omriss: Pt[] | null = null
    let runde = ""
    for (const r of rest.slice(1)) {
      const c = /^c:(\d{1,2})$/.exec(r)
      if (c) {
        farge = lagFarge(Number(c[1])) ?? 0
        continue
      }
      const g = /^g:(\d{1,5})$/.exec(r)
      if (g) {
        gruppe = Number(g[1])
        continue
      }
      const b = /^b:(-?[\d.]+)$/.exec(r)
      if (b) {
        const v = Number(b[1])
        if (Number.isFinite(v)) bog = Math.max(-BOG_TAK, Math.min(BOG_TAK, +v.toFixed(4)))
        continue
      }
      if (r === "f:1") {
        firkant = true
        continue
      }
      if (r === "n:1") {
        nett = true
        continue
      }
      const mj = /^m:([\d.]+)$/.exec(r)
      if (mj) {
        const v = Number(mj[1])
        if (Number.isFinite(v)) mjuk = Math.max(0, Math.min(MJUK_TAK, +v.toFixed(4)))
        continue
      }
      const om = /^p:([\d.,-]+)$/.exec(r)
      if (om) {
        omriss = lesOmriss(om[1]) ?? omriss
        continue
      }
      const bg = /^r:([\d,]+)$/.exec(r)
      if (bg) {
        runde = bg[1]
        continue
      }
      if (strek.length >= STREK_TAK) break
      const st = lesStrek(r)
      if (!st) continue
      strek.push(st)
    }
    sett.add(id)
    const rd = omriss && runde ? lesRunde(runde, omriss.length) : []
    ut.push({ id, o: o.map((c) => +c.toFixed(4)) as Vec3, n, bog, ...(firkant ? { firkant: true as const } : {}), ...(mjuk ? { mjuk } : {}), ...(omriss ? { omriss } : {}), ...(omriss && nett ? { nett: true as const } : {}), ...(rd.length ? { runde: rd } : {}), strek, ...(gruppe ? { gruppe } : {}), ...(farge ? { farge } : {}) })
  }
  return ut
}

export const nyGruppe = (l: readonly Plan[]) => l.reduce((m, p) => Math.max(m, p.gruppe ?? 0), 0) + 1
export const iGruppa = (l: readonly Plan[], g: number) => l.filter((p) => p.gruppe === g).sort((a, b) => a.id - b.id)
export function delAv(rad: readonly Plan[], leiar: number, fordel: boolean): Map<number, number> {
  const m = new Map<number, number>()
  const L = rad.findIndex((p) => p.id === leiar)
  const N = rad.length
  rad.forEach((p, k) => {
    if (!fordel || N < 2 || L < 0) m.set(p.id, 1)
    else if (L > 0) m.set(p.id, k / L)
    else m.set(p.id, (N - 1 - k) / (N - 1))
  })
  return m
}

export const reinPlan = (s: unknown) => skrivPlan(lesPlan(s))

export const nyId = (l: readonly Plan[]) => l.reduce((m, p) => Math.max(m, p.id), 0) + 1

export function spegla(o: Vec3, n: Vec3, akse: number): { o: Vec3; n: Vec3 } {
  const o2 = [...o] as Vec3
  const n2 = [...n] as Vec3
  o2[akse] = +(1 - o[akse]).toFixed(4)
  n2[akse] = -n[akse] === 0 ? 0 : -n[akse]
  return { o: o2, n: n2 }
}

export function skuvKopi(p: Pick<Plan, "o" | "n">, min: Vec3, max: Vec3, tjukn: number): Vec3 | null {
  const steg = p.n.map((n, a) => n * 2 * tjukn / Math.max(1e-6, max[a] - min[a]))
  for (const forteikn of [1, -1]) {
    const o = p.o.map((c, a) => c + forteikn * steg[a])
    if (o.some((c) => c < -PLAN_ROM || c > 1 + PLAN_ROM)) continue
    const rund = o.map((c) => +c.toFixed(4)) as Vec3
    if (rund.some((c, a) => c !== p.o[a])) return rund
  }
  return null
}

export function speglingar(sp: number): number[][] {
  let ut: number[][] = [[]]
  for (let a = 0; a < 3; a++) if (sp & (1 << a)) ut = ut.flatMap((q) => [q, [...q, a]])
  return ut
}

export function sameSnitt(a: { o: Vec3; n: Vec3 }, b: { o: Vec3; n: Vec3 }, tol = 1e-3): boolean {
  for (let i = 0; i < 3; i++) if (Math.abs(a.o[i] - b.o[i]) > tol) return false
  const same = a.n.every((c, i) => Math.abs(c - b.n[i]) <= tol)
  const motsett = a.n.every((c, i) => Math.abs(c + b.n[i]) <= tol)
  return same || motsett
}

export function rutenett(nx: number, ny: number, fraa = 1, gFraa = 1): Plan[] {
  const ut: Plan[] = []
  let id = fraa
  for (let i = 0; i < nx; i++) {
    ut.push({ id: id++, o: [(i + 0.5) / nx, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [], gruppe: gFraa })
  }
  for (let j = 0; j < ny; j++) {
    ut.push({ id: id++, o: [0.5, (j + 0.5) / ny, 0.5], n: [0, 1, 0], bog: 0, strek: [], gruppe: nx ? gFraa + 1 : gFraa })
  }
  return ut
}

const naerNok = (a: number, b: number) => Math.abs(a - b) < 1e-3
function radStaar(rad: readonly Plan[], akse: 0 | 1): boolean {
  const n = rad.length
  if (!n) return false
  const brukt = new Set<number>()
  for (const q of rad) {
    const i = Math.round(q.o[akse] * n - 0.5)
    if (i < 0 || i >= n || brukt.has(i) || !naerNok(q.o[akse], (i + 0.5) / n)) return false
    brukt.add(i)
  }
  return true
}

export function skilRute(l: readonly Plan[]): { rute: Plan[]; andre: Plan[]; nx: number; ny: number } {
  const rein = (q: Plan) => !q.bog && q.strek.length === 0 && !q.farge && !q.omriss?.length && !q.firkant && !q.mjuk
  const kx = l.filter((q) => rein(q) && Math.abs(q.n[0]) > 0.999 && naerNok(q.o[1], 0.5) && naerNok(q.o[2], 0.5))
  const ky = l.filter((q) => rein(q) && Math.abs(q.n[1]) > 0.999 && naerNok(q.o[0], 0.5) && naerNok(q.o[2], 0.5))
  const okx = radStaar(kx, 0)
  const oky = radStaar(ky, 1)
  const rute = [...(okx ? kx : []), ...(oky ? ky : [])]
  const mine = new Set(rute.map((q) => q.id))
  return { rute, andre: l.filter((q) => !mine.has(q.id)), nx: okx ? kx.length : 0, ny: oky ? ky.length : 0 }
}

export type Snapp = {
  p: Pt
  slag: "punkt" | "kant" | "akse" | null
  mot?: number
}

const reint = (q: Pt): Pt => [+q[0].toFixed(4), +q[1].toFixed(4)]

function paaKanten(p: Pt, a: Pt, b: Pt): { q: Pt; d: number } {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const L = vx * vx + vy * vy
  let t = L > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const q: Pt = [a[0] + vx * t, a[1] + vy * t]
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) }
}

export function snappPunkt(omriss: readonly Pt[], i: number, p: Pt, r: number, rPunkt = r, steg = 90): Snapp {
  const n = omriss.length
  if (n < 3 || r <= 0 || !omriss[i]) return { p, slag: null }

  let best = rPunkt
  let mot = -1
  for (let k = 0; k < n; k++) {
    if (k === i) continue
    const d = Math.hypot(p[0] - omriss[k][0], p[1] - omriss[k][1])
    if (d < best) {
      best = d
      mot = k
    }
  }
  if (mot >= 0) return { p: [omriss[mot][0], omriss[mot][1]], slag: "punkt", mot }

  let bestK = r
  let paa: Pt | null = null
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    if (k === i || j === i) continue
    const { q, d } = paaKanten(p, omriss[k], omriss[j])
    if (d < bestK) {
      bestK = d
      paa = q
    }
  }
  if (paa) return { p: reint(paa), slag: "kant" }

  if (!steg) return { p, slag: null }
  const rad = (steg * Math.PI) / 180
  const m = Math.round((2 * Math.PI) / rad)
  let bestV = r
  let paaV: Pt | null = null
  for (const q of [omriss[(i - 1 + n) % n], omriss[(i + 1) % n]]) {
    for (let k = 0; k < m; k++) {
      const a = k * rad
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const t = (p[0] - q[0]) * dx + (p[1] - q[1]) * dy
      if (t <= 0) continue
      const qq: Pt = [q[0] + dx * t, q[1] + dy * t]
      const d = Math.hypot(p[0] - qq[0], p[1] - qq[1])
      if (d < bestV) {
        bestV = d
        paaV = qq
      }
    }
  }
  if (paaV) return { p: reint(paaV), slag: "akse" }
  return { p, slag: null }
}

export function slaaSaman(omriss: readonly Pt[], i: number, mot: number): { omriss: Pt[]; fall: number } | null {
  const n = omriss.length
  if (n <= 3 || i === mot) return null
  const nabo = (i + 1) % n === mot || (mot + 1) % n === i
  if (!nabo) return null
  return { omriss: omriss.filter((_, k) => k !== i), fall: i }
}

export type FormSlag = "firkant" | "trekant" | "sekskant" | "sirkel"
export const FORM_SLAG: readonly FormSlag[] = ["firkant", "trekant", "sekskant", "sirkel"] as const

export function formPunkt(slag: FormSlag, b: { x0: number; y0: number; x1: number; y1: number }): { omriss: Pt[]; runde?: number[] } {
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  const rx = (b.x1 - b.x0) / 2
  const ry = (b.y1 - b.y0) / 2
  if (slag === "firkant") return { omriss: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] }
  if (slag === "sirkel") return { omriss: [[cx, b.y0], [b.x1, cy], [cx, b.y1], [b.x0, cy]], runde: [0, 1, 2, 3] }
  const n = slag === "trekant" ? 3 : 6
  const ut: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    ut.push([+(cx + rx * Math.cos(a)).toFixed(4), +(cy + ry * Math.sin(a)).toFixed(4)])
  }
  return { omriss: ut }
}
