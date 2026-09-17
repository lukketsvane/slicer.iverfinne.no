import { bbox, inRing, MATERIALS, MIN_AREA, perimeter, shoelace, type Material, type ParamBag, type Pt, type Vec3 } from "./core"
import { contour, simplify } from "./contour"
import type { Solid, Span } from "./mesh/solid"
import { rull, vend, type BitBoks, type Kropp } from "./kropp"
import { add3, akser, cross, dot, ein2, inn, kryss as kryssAv, kryssBoygd, kryssRing, len3, lesPlan, moteInn, mul3, norm3, omrissLine, skrivPlan, sub3, ut, type Mote, type Plan, type Ramme, type Strek } from "./plan"
import { lesDeling, leddNokkel, snittKey, type Params } from "./params"
import { bogMin, rilla } from "./rille"
import { forenklaSpor, sporAksar, sporRute } from "./sporfelt"
import { felles, iGods, sporInn, sporPunkt, stykkeLangs, utan, type Line } from "./stykke"
import { kilar, moteLedd, skoyt, tappIn, slisseGods, type Boks as TappBoks, type Tapp } from "./tapp"
import { monteringsorden, veg, type Vegar } from "./orden"

export { sporPunkt, stykkeLangs, tappIn, type Tapp }

export const DETAIL = { lav: 120, mid: 220, hog: 320, fil: 1200 } as const
export type DetailStep = (typeof DETAIL)[keyof typeof DETAIL]

export type Spor = {
  p: Pt
  d: Pt
  k: number
  munn: number
  botn: number
  ut: number
  w: number
  mot: number
  nokkel: string
  lo: number
  hi: number
}

const BOGE_SYN = 0.1

export function sporBoge(q: Line, a: number, b: number): Pt[] {
  if (!q.k) return [sporPunkt(q, a), sporPunkt(q, b)]
  const R = Math.abs(1 / q.k)
  const vinkel = Math.abs(b - a) / R
  const n = Math.max(1, Math.min(64, Math.ceil(vinkel / Math.sqrt((8 * BOGE_SYN) / R))))
  const ut: Pt[] = []
  for (let i = 0; i <= n; i++) ut.push(sporPunkt(q, a + ((b - a) * i) / n))
  return ut
}

export type Ribbe = {
  plan: Plan
  r: Ramme
  nullpkt: Pt
  outlines: Pt[][]
  holes: Pt[][]
  raa: Pt[][]
  rille: Pt[][]
  spor: Spor[]
  tapp: Tapp[]
  area: number
  narrow: number
  cutLen: number
}

export type Montering = {
  orden: number[]
  retning: Record<number, Vec3 | null>
  boygde: number[]
  brot: number[]
  klem: [number, number][]
}

const KLEM_MIN = 1

export type Snitt = {
  k: Kropp
  ribber: Ribbe[]
  ledd: number
  tappar: number
  avvist: number
  kurva: number[]
  kasta: number
  slotW: number
  minGap: number
  montering: Montering
}

export type Del = {
  id: string
  adr: string
  plan: number
  farge?: number
  outline: Pt[]
  holes: Pt[][]
  rille: Pt[][]
  t: number
  area: number
  mass: number
  cutLen: number
  joints: number
  spor: Spor[]
}

export type DelListe = {
  delar: Del[]
  ids: string[]
  area: number
  mass: number
  cutLen: number
  lause: number
}

function axisDist(spans: Span[], t: number): number {
  const n = spans.length
  if (!n) return -1e9
  let best = -Infinity
  for (let i = 0; i < n; i++) {
    const s = spans[i]
    const a = s[0]
    const b = s[1]
    const d = t >= a && t <= b ? Math.min(t - a, b - t) : -Math.min(Math.abs(t - a), Math.abs(t - b))
    if (d > best) best = d
  }
  return best
}

type Rute = {
  t0: number
  dt: number
  nt: number
  z0: number
  dz: number
  nz: number
  rows: Span[][]
  cols: Span[][]
}

const TOMME: Span[] = []
function ruteAv(kjelde: Solid | Kasse, d: number, step: number, former: readonly Form[] = [], straale?: Solid): Rute {
  const PAD = Math.max(4, step * 2)
  const boks = "runs" in kjelde ? null : kjelde
  const s = boks ? straale ?? null : (kjelde as Solid)
  let t0 = boks ? boks.bx0 : s!.min[0]
  let t1 = boks ? boks.bx1 : s!.max[0]
  let z0 = boks ? boks.by0 : s!.min[1]
  let z1 = boks ? boks.by1 : s!.max[1]
  for (const f of former) {
    t0 = Math.min(t0, f.bx0)
    t1 = Math.max(t1, f.bx1)
    z0 = Math.min(z0, f.by0)
    z1 = Math.max(z1, f.by1)
  }
  t0 -= PAD
  t1 += PAD
  z0 -= PAD
  z1 += PAD
  const nt = Math.max(24, Math.min(520, Math.ceil((t1 - t0) / step)))
  const nz = Math.max(24, Math.min(520, Math.ceil((z1 - z0) / step)))
  const dt = (t1 - t0) / nt
  const dz = (z1 - z0) / nz
  const rows: Span[][] = new Array(nz + 1)
  for (let j = 0; j <= nz; j++) rows[j] = s ? s.runs(0, z0 + j * dz, d) : TOMME
  const cols: Span[][] = new Array(nt + 1)
  for (let i = 0; i <= nt; i++) cols[i] = s ? s.runs(1, d, t0 + i * dt) : TOMME
  return { t0, dt, nt, z0, dz, nz, rows, cols }
}

type Kasse = { bx0: number; bx1: number; by0: number; by1: number }
type Form = Kasse & { gods: boolean; rund: boolean; cx: number; cy: number; hw: number; hh: number; c: number; s: number; kant?: Kant[] }

function formDist(f: Form, x: number, y: number): number {
  if (f.kant) return -omrissDist(f.kant, x, y)
  const dx = x - f.cx
  const dy = y - f.cy
  const a = dx * f.c + dy * f.s
  const b = -dx * f.s + dy * f.c
  if (!f.rund) return Math.max(Math.abs(a) - f.hw, Math.abs(b) - f.hh)
  const r = Math.hypot(a / f.hw, b / f.hh)
  return (r - 1) * Math.min(f.hw, f.hh)
}

function formAv(st: Strek, ou: number, ov: number, S: number): Form {
  const gods = st.slag === "gods"
  const a = (st.a * Math.PI) / 180
  const c = Math.cos(a)
  const si = Math.sin(a)
  const cx = ou + st.x * S
  const cy = ov + st.y * S
  const hw = (st.w * S) / 2
  const hh = (st.h * S) / 2
  if (st.form === "kontur" && st.punkt && st.punkt.length >= 3) {
    const poly = st.punkt.map(([px, py]): Pt => {
      const lx = px * 2 * hw
      const ly = py * 2 * hh
      return [cx + lx * c - ly * si, cy + lx * si + ly * c]
    })
    const b = bbox(poly)
    return { gods, rund: false, cx, cy, hw, hh, c, s: si, bx0: b.x0, bx1: b.x1, by0: b.y0, by1: b.y1, kant: kantar(poly) }
  }
  const rx = hw * Math.abs(c) + hh * Math.abs(si)
  const ry = hw * Math.abs(si) + hh * Math.abs(c)
  return { gods, rund: st.form === "rund", cx, cy, hw, hh, c, s: si, bx0: cx - rx, bx1: cx + rx, by0: cy - ry, by1: cy + ry }
}

type Kant = { ax: number; ay: number; bx: number; by: number; ex: number; ey: number; inv: number }
const kantar = (poly: readonly Pt[]): Kant[] => {
  const ut: Kant[] = []
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ex = poly[i][0] - poly[j][0]
    const ey = poly[i][1] - poly[j][1]
    ut.push({ ax: poly[j][0], ay: poly[j][1], bx: poly[i][0], by: poly[i][1], ex, ey, inv: 1 / Math.max(1e-12, ex * ex + ey * ey) })
  }
  return ut
}
function omrissDist(kant: readonly Kant[], x: number, y: number): number {
  let d2 = Infinity
  let inne = false
  for (const k of kant) {
    const px = x - k.ax
    const py = y - k.ay
    const t = Math.max(0, Math.min(1, (px * k.ex + py * k.ey) * k.inv))
    const qx = px - k.ex * t
    const qy = py - k.ey * t
    const q = qx * qx + qy * qy
    if (q < d2) d2 = q
    if (k.ay > y !== k.by > y && x < k.ax + ((y - k.ay) / (k.by - k.ay)) * k.ex) inne = !inne
  }
  const d = Math.sqrt(d2)
  return inne ? d : -d
}

type Boks = { px: number; py: number; dx: number; dy: number; k: number; lo: number; hi: number; half: number }

function boksAv(q: Spor): Boks {
  return {
    px: q.p[0],
    py: q.p[1],
    dx: q.d[0],
    dy: q.d[1],
    k: q.k,
    lo: Math.min(q.botn, q.ut),
    hi: Math.max(q.botn, q.ut),
    half: q.w / 2,
  }
}

export type Klipp = { r: Ramme; boksar: readonly { min: Vec3; max: Vec3 }[] }

function klippDist(kl: Klipp, t: number, z: number): number {
  const p = ut(kl.r, [t, z])
  let best = Infinity
  for (const b of kl.boksar) {
    const dx = Math.max(b.min[0] - p[0], p[0] - b.max[0])
    const dy = Math.max(b.min[1] - p[1], p[1] - b.max[1])
    const dz = Math.max(b.min[2] - p[2], p[2] - b.max[2])
    const ute = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
    const d = ute + Math.min(Math.max(dx, dy, dz), 0)
    if (d < best) best = d
  }
  return best
}

const SLOER_VENDER = 2
function sloer(g: Float64Array, w: number, h: number, kx: number, kz: number) {
  const tmp = new Float64Array(g.length)
  for (let v = 0; v < SLOER_VENDER; v++) {
    if (kx > 0) {
      const n = 2 * kx + 1
      for (let j = 0; j < h; j++) {
        const rad = j * w
        let sum = 0
        for (let i = -kx; i <= kx; i++) sum += g[rad + Math.min(w - 1, Math.max(0, i))]
        for (let i = 0; i < w; i++) {
          tmp[rad + i] = sum / n
          sum += g[rad + Math.min(w - 1, i + kx + 1)] - g[rad + Math.min(w - 1, Math.max(0, i - kx))]
        }
      }
      g.set(tmp)
    }
    if (kz > 0) {
      const n = 2 * kz + 1
      for (let i = 0; i < w; i++) {
        let sum = 0
        for (let j = -kz; j <= kz; j++) sum += g[Math.min(h - 1, Math.max(0, j)) * w + i]
        for (let j = 0; j < h; j++) {
          tmp[j * w + i] = sum / n
          sum += g[Math.min(h - 1, j + kz + 1) * w + i] - g[Math.min(h - 1, Math.max(0, j - kz)) * w + i]
        }
      }
      g.set(tmp)
    }
  }
}

function formLiner(former: readonly Form[], hjorne: readonly Pt[] = []): { x: number[]; y: number[] } | undefined {
  if (!former.length && !hjorne.length) return undefined
  const x: number[] = []
  const y: number[] = []
  for (const q of hjorne) x.push(q[0] - 1e-3, q[0] + 1e-3), y.push(q[1] - 1e-3, q[1] + 1e-3)
  for (const f of former) {
    if (f.rund) continue
    const inn = f.gods ? [0, -1e-3, 1e-3] : [0]
    const [hx, hy] = Math.abs(f.s) < 1e-9 ? [f.hw, f.hh] : Math.abs(f.c) < 1e-9 ? [f.hh, f.hw] : [NaN, NaN]
    if (Number.isNaN(hx)) continue
    for (const e of inn) {
      x.push(f.cx - hx - e, f.cx + hx + e)
      y.push(f.cy - hy - e, f.cy + hy + e)
    }
  }
  return { x, y }
}

function felt(ru: Rute, former: Form[], spor: Spor[], klipp?: Klipp, mjuk = 0, omriss?: readonly Pt[], etter: readonly Form[] = [], hjorne: readonly Pt[] = [], nett = false) {
  const { t0, dt, z0, dz, rows, cols } = ru
  let { nt, nz } = ru
  const boksar = spor.map(boksAv)
  const kant = omriss && omriss.length >= 3 ? kantar(omriss) : null
  const direkte = kant && !(mjuk > 0) && !nett
  const aksar = direkte ? sporAksar(t0, dt, nt, z0, dz, nz, spor, formLiner(etter, hjorne)) : null
  if (aksar) {
    nt = aksar.x.length - 1
    nz = aksar.y.length - 1
  }
  let g = new Float64Array((nt + 1) * (nz + 1))
  for (let j = 0; j <= nz; j++) {
    const z = aksar ? aksar.y[j] : z0 + j * dz
    const row = rows[j]
    for (let i = 0; i <= nt; i++) {
      const t = aksar ? aksar.x[i] : t0 + i * dt
      let v: number
      if (kant && !nett) v = omrissDist(kant, t, z)
      else {
        const dh = axisDist(row, t)
        const dv = axisDist(cols[i], z)
        const mag = Math.min(Math.abs(dh), Math.abs(dv))
        v = dh > 0 && dv > 0 ? mag : -mag
        if (kant) v = Math.min(v, omrissDist(kant, t, z))
      }
      if (klipp) {
        const d = -klippDist(klipp, t, z)
        if (d < v) v = d
      }
      for (const f of former) {
        const d = formDist(f, t, z)
        v = f.gods ? Math.max(v, -d) : Math.min(v, d)
      }
      g[j * (nt + 1) + i] = v
    }
  }
  if (mjuk > 0) sloer(g, nt + 1, nz + 1, Math.round(mjuk / dt), Math.round(mjuk / dz))
  let tett: { x: number[]; y: number[] } | null = aksar
  if (!direkte) {
    const fin = sporRute(g, t0, dt, nt, z0, dz, nz, spor, formLiner(etter))
    if (fin) { g = fin.g; tett = fin; nt = fin.x.length - 1; nz = fin.y.length - 1 }
  }
  if (etter.length) {
    for (let j = 0; j <= nz; j++) {
      const z = tett ? tett.y[j] : z0 + j * dz
      for (let i = 0; i <= nt; i++) {
        const t = tett ? tett.x[i] : t0 + i * dt
        const k = j * (nt + 1) + i
        let v = g[k]
        for (const f of etter) {
          const d = formDist(f, t, z)
          v = f.gods ? Math.max(v, -d) : Math.min(v, d)
        }
        g[k] = v
      }
    }
  }
  if (boksar.length) {
    for (let j = 0; j <= nz; j++) {
      const z = tett ? tett.y[j] : z0 + j * dz
      for (let i = 0; i <= nt; i++) {
        const k = j * (nt + 1) + i
        let v = g[k]
        if (v <= 0) continue
        const t = tett ? tett.x[i] : t0 + i * dt
        for (const b of boksar) {
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
  return contour(g, t0, dt, nt, z0, dz, nz, tett ?? undefined)
}

const NETT = new WeakMap<Kropp, Map<string, Snitt>>()

export type Flate = { r: Ramme; ringar: readonly Pt[][] }

const PAR_10 = Math.sin((10 * Math.PI) / 180)
const MIDT_STEG = 64

export function lukene(flater: readonly Flate[], tjukn: number) {
  const boks = flater.map((a): [number, number, number, number] => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const ring of a.ringar) {
      for (const q of ring) {
        if (q[0] < u0) u0 = q[0]
        if (q[0] > u1) u1 = q[0]
        if (q[1] < v0) v0 = q[1]
        if (q[1] > v1) v1 = q[1]
      }
    }
    return [u0, u1, v0, v1]
  })
  const spenn = boks.map((b): [number, number] => [b[0], b[1]])
  const sagitta = flater.map((a, i) => {
    if (!a.r.k) return 0
    const [lo, hi] = spenn[i]
    if (!(hi > lo)) return 0
    const av = (u: number) => Math.abs(dot(a.r.n, ut(a.r, [u, 0], 0)) - dot(a.r.n, a.r.o))
    return Math.max(av(lo), av(hi))
  })
  const midt: (Vec3[] | null)[] = flater.map(() => null)
  const midtlina = (i: number): Vec3[] => {
    const m = midt[i]
    if (m) return m
    const a = flater[i]
    const [lo, hi] = spenn[i]
    const ut2: Vec3[] = []
    if (!(hi > lo)) ut2.push(ut(a.r, [0, 0], 0))
    else for (let t = 0; t <= MIDT_STEG; t++) ut2.push(ut(a.r, [lo + ((hi - lo) * t) / MIDT_STEG, 0], 0))
    midt[i] = ut2
    return ut2
  }
  const tilStykket = (q: Vec3, a: Vec3, b: Vec3): number => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const LL = dx * dx + dy * dy + dz * dz
    const t = LL > 1e-12 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy + (q[2] - a[2]) * dz) / LL)) : 0
    return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy, q[2] - a[2] - t * dz)
  }
  const midtAvstand = (i: number, j: number): number => {
    const la = midtlina(i)
    const lb = midtlina(j)
    let m = Infinity
    for (const q of la) for (let t = 1; t < lb.length; t++) m = Math.min(m, tilStykket(q, lb[t - 1], lb[t]))
    for (const q of lb) for (let t = 1; t < la.length; t++) m = Math.min(m, tilStykket(q, la[t - 1], la[t]))
    return m
  }
  const luka = (i: number, j: number, grense = Infinity): number => {
    const A = flater[i]
    const B = flater[j]
    if (len3(cross(A.r.n, B.r.n)) > PAR_10) return Infinity
    const d: Vec3 = [B.r.o[0] - A.r.o[0], B.r.o[1] - A.r.o[1], B.r.o[2] - A.r.o[2]]
    const [au0, au1, av0, av1] = boks[i]
    const [bu0, bu1, bv0, bv1] = boks[j]
    const du = dot(d, A.r.u)
    const dv = dot(d, A.r.v)
    if (bu0 + du > au1 || bu1 + du < au0 || bv0 + dv > av1 || bv1 + dv < av0) return Infinity
    const g0 = Math.abs(dot(A.r.n, A.r.o) - dot(A.r.n, B.r.o))
    if (!A.r.k && !B.r.k) return g0 - tjukn
    if (g0 - sagitta[i] - sagitta[j] - tjukn >= grense) return Infinity
    return midtAvstand(i, j) - tjukn
  }
  return {
    luka,
    minste: (tak: number) => {
      let m = tak
      for (let i = 0; i < flater.length; i++) {
        for (let j = i + 1; j < flater.length; j++) m = Math.min(m, luka(i, j, m))
      }
      return m
    },
  }
}

export function buildSnitt(k: Kropp, p: Params, cells: number): Snitt {
  const key = snittKey(p as unknown as ParamBag, cells)
  let per = NETT.get(k)
  if (!per) {
    per = new Map()
    NETT.set(k, per)
  }
  const hit = per.get(key)
  if (hit) return hit
  const v = buildSnittRaw(k, p, cells)
  per.set(key, v)
  if (per.size > 4) per.delete(per.keys().next().value as string)
  return v
}

type Raa = {
  plan: Plan
  r: Ramme
  nullpkt: Pt
  d: number
  sol: Solid
  ru: Rute
  former: Form[]
  ringar: Pt[][]
  spor: Spor[]
  boygd: boolean
  mjuk: number
  omriss?: Pt[]
  klipp?: Klipp
  nett?: boolean
  tapp: Tapp[]
  tform: TappBoks[]
  hjorne: Pt[]
  utvida: boolean
}

function kanonisk(d: Vec3): Vec3 {
  for (const c of d) {
    if (Math.abs(c) > 1e-6) return c < 0 ? mul3(d, -1) : d
  }
  return d
}

function buildSnittRaw(k: Kropp, p: Params, cells: number): Snitt {
  const s = k.solid
  const span = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2], 1)
  const step = span / cells
  const slotW = p.tjukn + p.klaring
  const handDeling = lesDeling(p.deling)
  const plan = lesPlan(p.plan)
  const eigd = new Map<number, BitBoks[]>()
  for (const b of k.bitar) {
    if (!b.farge) continue
    const l = eigd.get(b.farge)
    if (l) l.push(b)
    else eigd.set(b.farge, [b])
  }

  const raa: Raa[] = plan.map((pl) => {
    const { u, v } = akser(pl.n)
    const o: Vec3 = [
      s.min[0] + pl.o[0] * (s.max[0] - s.min[0]),
      s.min[1] + pl.o[1] * (s.max[1] - s.min[1]),
      s.min[2] + pl.o[2] * (s.max[2] - s.min[2]),
    ]
    const d = dot(o, pl.n)
    const kurv = (pl.bog || 0) / Math.max(1e-6, s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2])
    const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v, k: kurv }
    const boygd = !!kurv
    const sol = boygd ? rull(k, r) : vend(k, pl.n)
    const S = p.storleik
    const ou = dot(o, u)
    const ov = dot(o, v)
    const former: Form[] = pl.strek.map((st: Strek) => formAv(st, ou, ov, S))
    const mine = pl.farge ? eigd.get(pl.farge) : undefined
    const klipp: Klipp | undefined = mine ? { r, boksar: mine } : undefined
    const mjuk = (pl.mjuk ?? 0) * S
    const omriss = pl.omriss && pl.omriss.length >= 3 ? (omrissLine(pl.omriss, pl.runde).map((q) => [ou + q[0] * S, ov + q[1] * S]) as Pt[]) : undefined
    const ob = omriss ? bbox(omriss) : null
    const nett = !!(omriss && pl.nett)
    const ru = ruteAv(ob ? { bx0: ob.x0, bx1: ob.x1, by0: ob.y0, by1: ob.y1 } : sol, boygd ? 0 : d, step, former, nett ? sol : undefined)
    let ringar = felt(ru, former, [], klipp, mjuk, omriss, [], [], nett).map((l) => l.pts as Pt[])
    if (pl.firkant && ringar.length) {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const ring of ringar) {
        const b = bbox(ring)
        x0 = Math.min(x0, b.x0)
        y0 = Math.min(y0, b.y0)
        x1 = Math.max(x1, b.x1)
        y1 = Math.max(y1, b.y1)
      }
      former.push({ gods: true, rund: false, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, c: 1, s: 0, bx0: x0, bx1: x1, by0: y0, by1: y1 })
      ringar = felt(ru, former, [], klipp, mjuk, omriss, [], [], nett).map((l) => l.pts as Pt[])
    }
    const rund = new Set(pl.runde ?? [])
    const hjorne = omriss ? (pl.omriss ?? []).filter((_, i) => !rund.has(i)).map((q): Pt => [ou + q[0] * S, ov + q[1] * S]) : []
    return { plan: pl, r, d, sol, ru, former, ringar, spor: [], tapp: [], tform: [], hjorne, utvida: false, nullpkt: [ou, ov] as Pt, boygd, klipp, mjuk, omriss, nett }
  })

  const minLap = Math.max(2, p.tjukn)
  const skulder = (w: number) => w / 2 + Math.min(6, Math.max(2, p.tjukn / 2))
  let ledd = 0
  let avvist = 0
  const boygde: number[] = []
  const vegar: Vegar = new Map()
  const rom = (a: Raa, li: Line, t: number, sw: number) => {
    const S = 7
    for (let q = -S; q <= S; q++) {
      if (!iGods(a.ringar, sporPunkt(li, t, (q / S) * sw))) return false
    }
    return true
  }

  const klar = (a: Raa, li: Line, munn: number, opp: boolean, w: number) => {
    let e = opp ? -Infinity : Infinity
    for (let q = -1; q <= 1; q++) {
      const off = q * (w / 2)
      const sk = 1 - li.k * off
      const sid: Line = { p: sporPunkt(li, 0, off), d: li.d, k: li.k ? li.k / sk : 0 }
      for (const [lo0, hi0] of stykkeLangs(a.ringar, sid.p, sid.d, sid.k)) {
        const lo = lo0 / sk
        const hi = hi0 / sk
        if (munn < lo - 0.6 || munn > hi + 0.6) continue
        e = opp ? Math.max(e, hi) : Math.min(e, lo)
      }
    }
    if (!Number.isFinite(e)) e = munn
    e = opp ? e + 3 : e - 3
    const eiga = stykkeLangs(a.ringar, li.p, li.d, li.k)
    let grense = opp ? Infinity : -Infinity
    for (let i = 0; i < eiga.length; i++) {
      const [lo, hi] = eiga[i]
      if (munn < lo - 0.6 || munn > hi + 0.6) continue
      const nabo = opp ? eiga[i + 1] : eiga[i - 1]
      if (nabo) grense = opp ? (hi + nabo[0]) / 2 : (lo + nabo[1]) / 2
      break
    }
    return opp ? Math.min(e, grense) : Math.max(e, grense)
  }

  const KURVE_STEG = 64
  const uSpenn = (a: Raa): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const ring of a.ringar) {
      for (const q of ring) {
        if (q[0] < lo) lo = q[0]
        if (q[0] > hi) hi = q[0]
      }
    }
    return [lo, hi]
  }
  const kurveInne = (kr: Raa, fl: Ramme, lo: number, hi: number): boolean => {
    const nv = dot(fl.n, kr.r.v)
    if (Math.abs(nv) <= 1e-3 || !(hi > lo)) return false
    const dFl = dot(fl.n, fl.o)
    for (let i = 0; i <= KURVE_STEG; i++) {
      const u = lo + ((hi - lo) * i) / KURVE_STEG
      const w = (dFl - dot(ut(kr.r, [u, 0], 0), fl.n)) / nv
      for (const ring of kr.ringar) if (inRing(ring, [u, w])) return true
    }
    return false
  }
  const kurva: number[] = []
  const møta = (A: Raa, B: Raa): Mote[] => {
    if (A.boygd && B.boygd) return []
    if (A.boygd || B.boygd) {
      const kr = A.boygd ? A : B
      const fl = A.boygd ? B : A
      const [lo, hi] = uSpenn(kr)
      const x = kryssBoygd(kr.r, fl.r, lo, hi)
      if (x.length) return x
      const ring = kryssRing(kr.r, fl.r, lo, hi)
      if (ring) return [ring]
      if (kurveInne(kr, fl.r, lo, hi)) kurva.push(kr.plan.id)
      return []
    }
    const x = kryssAv(A.r, B.r)
    return x ? [x] : []
  }

  let tappar = 0
  const tappKtx = { tjukn: p.tjukn, klaring: p.klaring, slotW, kilar: p.kilar === 1 }

  for (let j = 1; j < raa.length; j++) {
    const B = raa[j]
    for (let i = 0; i < j; i++) {
      const A = raa[i]
      let fann = false
      let treff = 0
      const c = dot(A.r.n, B.r.n)
      if (!A.boygd && !B.boygd && Math.abs(c) > 0.99999 && Math.abs(dot(sub3(A.r.o, B.r.o), A.r.n)) < 0.01) {
        const sk = skoyt(tappKtx, A, B, c < 0, tappar)
        if (sk) {
          tappar += sk.tal
          ledd += sk.tal
          veg(vegar, B.plan.id, A.plan.id, kanonisk(A.r.n))
          veg(vegar, A.plan.id, B.plan.id, mul3(kanonisk(A.r.n), -1))
        }
        continue
      }
      for (const x0 of møta(A, B)) {
      const d3 = kanonisk(x0.d)
      const x: Mote = dot(d3, x0.d) > 0 ? x0 : { ...x0, d: d3, boge: x0.boge && [x0.boge[1], x0.boge[0]] }
      const retn = Math.abs(d3[2]) > 0.3 ? (d3[2] > 0 ? -1 : 1) : -1
      const lA = moteInn(A.r, x)
      const lB = moteInn(B.r, x)
      const tekne: Span[] = []
      {
        const m = moteLedd(tappKtx, A, B, lA, lB, x.sin, tappar)
        tappar += m.tal
        ledd += m.tal
        for (const [del, mot, d] of m.vegar) veg(vegar, del, mot, d)
        tekne.push(...m.tekne)
      }
      const runs = utan(felles(stykkeLangs(A.ringar, lA.p, lA.d, lA.k), stykkeLangs(B.ringar, lB.p, lB.d, lB.k)), tekne)
      const w = slotW / x.sin
      for (const [lo, hi] of runs) {
        if (hi - lo < minLap) continue
        const nokkel = leddNokkel(A.plan.id, B.plan.id, treff)
        const kv = handDeling.get(nokkel)
        const zm = lo + (kv ?? p.ledd) * (hi - lo)
        const munnB = retn < 0 ? lo : hi
        const munnA = retn < 0 ? hi : lo
        if (!rom(A, lA, (zm + munnA) / 2, skulder(w)) || !rom(B, lB, (zm + munnB) / 2, skulder(w))) {
          avvist++
          continue
        }
        treff++
        A.spor.push({ ...lA, munn: munnA, botn: zm, ut: klar(A, lA, munnA, munnA > zm, w), w, mot: B.plan.id, nokkel, lo, hi })
        B.spor.push({ ...lB, munn: munnB, botn: zm, ut: klar(B, lB, munnB, munnB > zm, w), w, mot: A.plan.id, nokkel, lo, hi })
        ledd++
        fann = true
      }
      const m = mul3(d3, retn)
      if (fann) {
        if (!A.boygd && !B.boygd) {
          veg(vegar, B.plan.id, A.plan.id, m)
          veg(vegar, A.plan.id, B.plan.id, mul3(m, -1))
        }
        if (B.boygd && !boygde.includes(B.plan.id)) boygde.push(B.plan.id)
      }
      }
    }
  }
  const { orden, retning, brot } = monteringsorden(plan.map((q) => q.id), vegar, new Set(boygde))
  for (const a of raa) {
    if (!a.utvida || !a.omriss) continue
    const ob = bbox(a.omriss)
    a.ru = ruteAv({ bx0: ob.x0, bx1: ob.x1, by0: ob.y0, by1: ob.y1 }, a.boygd ? 0 : a.d, step, [...a.former, ...a.tform])
  }

  const tol = Math.max(Math.min(0.25, step / 8), p.forenkl)
  const minHol = Math.PI * (p.hol / 2) ** 2
  let kasta = 0

  const ribber: Ribbe[] = raa.map((a) => {
    a.spor.sort((u, v) => u.munn - v.munn)
    const loops = felt(a.ru, a.former, a.spor, a.klipp, a.mjuk, a.omriss, a.tform, a.hjorne, a.nett)
    let outlines: Pt[][] = []
    let holes: Pt[][] = []
    for (const l of loops) {
      const q = forenklaSpor(l.pts, tol, a.spor, a.tform)
      if (q.length < 3) continue
      if (l.area > 0) outlines.push(q)
      else if (Math.abs(l.area) >= minHol) holes.push(q)
    }
    const holesOf = (o: Pt[]) => (outlines.length === 1 ? holes : holes.filter((h) => inRing(o, h[0])))
    const netto = (o: Pt[]) => holesOf(o).reduce((s, h) => s - Math.abs(shoelace(h)), Math.abs(shoelace(o)))
    const heil = outlines.filter((o) => {
      if (netto(o) < MIN_AREA) return false
      if (p.lause && (a.spor.length || a.tapp.length) && jointsIn(a.spor, o) + tappIn(a.tapp, o).length === 0) {
        kasta++
        return false
      }
      return true
    })
    if (heil.length !== outlines.length) {
      holes = holes.filter((h) => heil.some((o) => inRing(o, h[0])))
      outlines = heil
    }
    const rille: Pt[][] = []
    const R = a.r.k ? 1 / Math.abs(a.r.k) : Infinity
    if (R < bogMin(String(p.material), p.tjukn)) {
      const b = bbox(outlines.flat())
      const lang = 2 * Math.hypot(Math.max(Math.abs(b.x0), Math.abs(b.x1)), Math.max(Math.abs(b.y0), Math.abs(b.y1)))
      const h = 3 * p.tjukn
      const sperr = a.spor.map((q) => {
        const ring: Pt[] = []
        const n = q.k ? 16 : 1
        for (let i = 0; i <= n; i++) ring.push(sporPunkt(q, -lang + (2 * lang * i) / n, h))
        for (let i = n; i >= 0; i--) ring.push(sporPunkt(q, -lang + (2 * lang * i) / n, -h))
        return ring
      })
      for (const o of outlines) {
        rille.push(
          ...rilla({ omriss: o, hol: holesOf(o), sperr, k: a.r.k, tjukn: p.tjukn, material: p.material }),
        )
      }
    }
    let area = 0
    let cut = 0
    for (const o of outlines) {
      area += Math.abs(shoelace(o))
      cut += perimeter(o)
    }
    for (const h of holes) {
      area -= Math.abs(shoelace(h))
      cut += perimeter(h)
    }
    for (const l of rille) cut += Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1])
    let narrow = Infinity
    for (const q of a.spor) {
      for (const [lo, hi] of stykkeLangs(a.ringar, q.p, q.d)) {
        if (q.botn < lo || q.botn > hi) continue
        narrow = Math.min(narrow, q.munn > q.botn ? q.botn - lo : hi - q.botn)
        break
      }
    }
    narrow = Math.min(narrow, slisseGods(a.tapp, [...outlines, ...holes]))
    return {
      plan: a.plan,
      r: a.r,
      nullpkt: a.nullpkt,
      outlines,
      holes,
      raa: a.ringar,
      rille,
      spor: a.spor,
      tapp: a.tapp,
      area,
      narrow: Number.isFinite(narrow) ? narrow : 0,
      cutLen: cut,
    }
  })

  const minGap = lukene(raa, p.tjukn).minste(span)

  const klem: [number, number][] = []
  for (let i = 0; i < ribber.length; i++) {
    for (let j = i + 1; j < ribber.length; j++) {
      const A = ribber[i]
      const B = ribber[j]
      if (A.r.k || B.r.k) continue
      const kr = kryssAv(A.r, B.r)
      if (!kr) continue
      const pA = inn(A.r, kr.p)
      const pB = inn(B.r, kr.p)
      const a = stykkeLangs([...A.outlines, ...A.holes], pA, ein2(inn(A.r, add3(kr.p, kr.d)), pA))
      if (!a.length) continue
      const b = stykkeLangs([...B.outlines, ...B.holes], pB, ein2(inn(B.r, add3(kr.p, kr.d)), pB))
      if (!b.length) continue
      if (felles(a, b).some(([lo, hi]) => hi - lo > KLEM_MIN)) klem.push([A.plan.id, B.plan.id])
    }
  }

  return {
    k,
    ribber,
    ledd,
    tappar,
    avvist,
    kurva,
    kasta,
    slotW,
    minGap,
    montering: { orden, retning, boygde, brot, klem },
  }
}

export function sporIn(spor: readonly Spor[], outline: Pt[]): Spor[] {
  const b = bbox(outline)
  const ut: Spor[] = []
  for (const q of spor) {
    const [x, y] = sporPunkt(q, q.botn + (q.munn > q.botn ? -0.3 : 0.3))
    if (x < b.x0 - 0.6 || x > b.x1 + 0.6 || y < b.y0 - 0.6 || y > b.y1 + 0.6) continue
    if (inRing(outline, [x, y])) ut.push(q)
  }
  return ut
}

export const jointsIn = (spor: readonly Spor[], outline: Pt[]): number => sporIn(spor, outline).length

const SIG = 96
const TOL = 2

function ringSig(ring: Pt[], ox: number, oy: number): string {
  const acc: number[] = [0]
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
    acc.push(total)
  }
  if (total < 1e-9) return ""
  const out: string[] = []
  let seg = 0
  for (let k = 0; k < SIG; k++) {
    const d = (k / SIG) * total
    while (seg < ring.length - 1 && acc[seg + 1] < d) seg++
    const a = ring[seg]
    const b = ring[(seg + 1) % ring.length]
    const t = (d - acc[seg]) / (acc[seg + 1] - acc[seg] || 1)
    out.push(Math.round((a[0] + (b[0] - a[0]) * t - ox) * TOL) + "," + Math.round((a[1] + (b[1] - a[1]) * t - oy) * TOL))
  }
  return out.join(";")
}

export function bokstav(n: number): string {
  let s = ""
  let k = n
  do {
    s = "abcdefghijklmnopqrstuvwxyz"[k % 26] + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

export function buildDelar(sn: Snitt, p: Params): DelListe {
  const mat = (p.material as Material) in MATERIALS ? (p.material as Material) : "finer"
  const rho = MATERIALS[mat].rho
  const t = p.tjukn
  const delar: Del[] = []
  const seen = new Map<string, string>()
  const ids: string[] = []
  for (const r of sn.ribber) {
    const fleire = r.outlines.length > 1
    r.outlines.forEach((o, k) => {
      const mine = fleire ? r.holes.filter((h) => inRing(o, h[0])) : r.holes
      let area = Math.abs(shoelace(o))
      let cut = perimeter(o)
      for (const h of mine) {
        area -= Math.abs(shoelace(h))
        cut += perimeter(h)
      }
      const b = bbox(o)
      const mineSpor = sporIn(r.spor, o)
      const mineRille = fleire ? r.rille.filter((l) => inRing(o, l[0])) : r.rille
      for (const l of mineRille) cut += Math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1])
      const key = [ringSig(o, b.x0, b.y0), ...mine.map((h) => ringSig(h, b.x0, b.y0)), mineRille.length].join("|")
      let id = seen.get(key)
      if (!id) {
        id = `D${String(ids.length + 1).padStart(2, "0")}`
        seen.set(key, id)
        ids.push(id)
      }
      delar.push({
        id,
        adr: String(r.plan.id) + (fleire ? bokstav(k) : ""),
        plan: r.plan.id,
        ...(r.plan.farge ? { farge: r.plan.farge } : {}),
        outline: o,
        holes: mine,
        rille: mineRille,
        t,
        area,
        mass: (area * t * rho) / 1e9,
        cutLen: cut,
        joints: mineSpor.length + tappIn(r.tapp, o).length,
        spor: mineSpor,
      })
    })
    for (const { adr, outline, key } of kilar(r.tapp, t)) {
      let id = seen.get(key)
      if (!id) seen.set(key, (id = `D${String(ids.length + 1).padStart(2, "0")}`)), ids.push(id)
      const area = Math.abs(shoelace(outline))
      delar.push({ id, adr, plan: 0, outline, holes: [], rille: [], t, area, mass: (area * t * rho) / 1e9, cutLen: perimeter(outline), joints: 1, spor: [] })
    }
  }
  return {
    delar,
    ids,
    area: delar.reduce((s, q) => s + q.area, 0),
    mass: delar.reduce((s, q) => s + q.mass, 0),
    cutLen: delar.reduce((s, q) => s + q.cutLen, 0),
    lause: delar.filter((q) => q.joints === 0).length,
  }
}

export type SkisseSyn = {
  r: Ramme
  ringar: Pt[][]
  raa?: Pt[][]
  kryss: { a: Pt; b: Pt; mot: number }[]
  avstand: number
  akse: "x" | "y" | "z"
  nokkel: string
  spor?: { nokkel: string; munn: Pt; botn: Pt; lo: Pt; hi: Pt; boge?: Pt[] }[]
}

function laastSyn(k: Kropp, p: Params, pl: Plan, cells: number): SkisseSyn | null {
  const rib = buildSnitt(k, p, cells).ribber.find((r) => r.plan.id === pl.id)
  if (!rib) return null
  const kryss: SkisseSyn["kryss"] = []
  for (const q of rib.spor) {
    const b = sporBoge(q, Math.min(q.munn, q.botn), Math.max(q.munn, q.botn))
    for (let i = 0; i + 1 < b.length; i++) kryss.push({ a: b[i], b: b[i + 1], mot: q.mot })
  }
  const spor = rib.spor.map((q) => ({
    nokkel: q.nokkel,
    munn: sporPunkt(q, q.munn),
    botn: sporPunkt(q, q.botn),
    lo: sporPunkt(q, q.lo),
    hi: sporPunkt(q, q.hi),
    ...(q.k ? { boge: sporBoge(q, q.lo, q.hi) } : {}),
  }))
  return { r: rib.r, ringar: [...rib.outlines, ...rib.holes], raa: rib.raa, kryss, spor, ...avstandAv(k, rib.r), nokkel: `laast|${pl.id}|${snittKey(p as unknown as ParamBag, cells)}` }
}

function avstandAv(k: Kropp, r: Ramme): { avstand: number; akse: "x" | "y" | "z" } {
  const s = k.solid
  let lo = Infinity
  for (const x of [s.min[0], s.max[0]]) for (const y of [s.min[1], s.max[1]]) for (const z of [s.min[2], s.max[2]]) lo = Math.min(lo, dot([x, y, z], r.n))
  const a = r.n.map(Math.abs)
  const akse = a[0] >= a[1] && a[0] >= a[2] ? "x" : a[1] >= a[2] ? "y" : "z"
  return { avstand: dot(r.o, r.n) - lo, akse }
}

export function skisseSyn(k: Kropp, p: Params, pl: Plan, cells: number): SkisseSyn {
  if (lesPlan(p.plan).some((q) => q.id === pl.id)) {
    const laast = laastSyn(k, p, pl, cells)
    if (laast) return laast
  }
  pl = { ...pl, n: norm3(pl.n).map((c: number) => +c.toFixed(4)) as Vec3 }
  const s = k.solid
  const span = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2], 1)
  const step = span / cells
  const { u, v } = akser(pl.n)
  const o: Vec3 = [
    s.min[0] + pl.o[0] * (s.max[0] - s.min[0]),
    s.min[1] + pl.o[1] * (s.max[1] - s.min[1]),
    s.min[2] + pl.o[2] * (s.max[2] - s.min[2]),
  ]
  const d = dot(o, pl.n)
  const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v, k: 0 }
  const sol = vend(k, pl.n)
  const ru = ruteAv(sol, d, step)
  const tol = Math.max(Math.min(0.25, step / 8), p.forenkl)
  const ringar = felt(ru, [], [])
    .map((l) => simplify(l.pts, tol) as Pt[])
    .filter((q) => q.length >= 3)
  const kryss: SkisseSyn["kryss"] = []
  if (ringar.length) {
    const laast = buildSnitt(k, p, cells)
    const til2 = (rr: Ramme, q: Vec3): Pt => [dot(q, rr.u), dot(q, rr.v)]
    for (const rib of laast.ribber) {
      const x = kryssAv(r, rib.r)
      if (!x) continue
      const pA = til2(r, x.p)
      const dA = til2(r, x.d)
      const pB = til2(rib.r, x.p)
      const dB = til2(rib.r, x.d)
      for (const [lo, hi] of felles(stykkeLangs(ringar, pA, dA), stykkeLangs(rib.raa, pB, dB))) {
        if (hi - lo < Math.max(2, p.tjukn)) continue
        kryss.push({ a: [pA[0] + dA[0] * lo, pA[1] + dA[1] * lo], b: [pA[0] + dA[0] * hi, pA[1] + dA[1] * hi], mot: rib.plan.id })
      }
    }
  }
  const nokkel = `skisse|${skrivPlan([pl])}|${snittKey(p as unknown as ParamBag, cells)}`
  return { r, ringar, kryss, ...avstandAv(k, r), nokkel }
}
