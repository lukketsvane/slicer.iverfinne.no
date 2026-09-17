import { inRing, type Pt, type Vec3 } from "./core"
import type { Span } from "./mesh/solid"
import { add3, ein2, mul3, type Plan, type Ramme } from "./plan"
import { felles, sporInn, sporPunkt, stykkeLangs, utan, type Line } from "./stykke"

export type Tapp = {
  mot: number
  slag: "tapp" | "slisse"
  midt: Pt
  hjorne: Pt[]
  inn: Vec3
  nokkel: string
  boge?: Line & { t0: number; t1: number; s0: number; s1: number }
  kile?: { w: number }
}

const KILE_EPS = 0.5
const kileBreidd = (k: Ktx, u: number) => {
  const w = u >= 1.5 * k.tjukn ? Math.max(0.5 * k.tjukn, Math.min(k.tjukn, u - k.tjukn + KILE_EPS)) : 0
  return w >= 6 ? w : 0
}
export function kile(w: number, t: number): Pt[] {
  const L = 4 * t
  const d = (L / 2) * Math.tan((6 * Math.PI) / 180)
  return [[-L / 2, 0], [L / 2, 0], [L / 2, w + d], [-L / 2, w - d]]
}
export const kilar = (tapp: readonly Tapp[], t: number) =>
  tapp.filter((q) => q.kile).map((q) => ({ adr: `k${q.nokkel.slice(1)}`, outline: kile(q.kile!.w, t), key: `kile|${q.kile!.w.toFixed(2)}` }))

const bogeAv = (l: Line, t0: number, t1: number, s0: number, s1: number) => (l.k ? { boge: { p: l.p, d: l.d, k: l.k, t0, t1, s0, s1 } } : {})

export type Boks = { gods: boolean; rund: boolean; cx: number; cy: number; hw: number; hh: number; c: number; s: number; bx0: number; bx1: number; by0: number; by1: number }

export type TappFlate = {
  plan: Plan
  r: Ramme
  ringar: Pt[][]
  omriss?: Pt[]
  hjorne: Pt[]
  boygd: boolean
  tform: Boks[]
  tapp: Tapp[]
  utvida: boolean
}

type Ktx = { tjukn: number; klaring: number; slotW: number; kilar?: boolean }

export const tappIn = (tapp: readonly Tapp[], outline: Pt[]): Tapp[] => tapp.filter((q) => inRing(outline, q.midt))

const fangAv = (k: Ktx) => Math.max(1.5, 0.5 * k.tjukn)
const tappMinAv = (k: Ktx) => Math.max(6, 3 * k.tjukn)
const utMaxAv = (k: Ktx) => Math.max(10, 2 * k.tjukn)
const kileU = (k: Ktx, u: number) => (k.kilar ? Math.max(u, 2 * k.tjukn - 0.5) : u)
const langsAv = (a: TappFlate, l: Line, off: number): Span[] => {
  if (!l.k) return stykkeLangs(a.ringar, [l.p[0] - l.d[1] * off, l.p[1] + l.d[0] * off], l.d)
  const R = 1 / l.k
  if (Math.abs(R - off) < 1e-6) return []
  const f = R / (R - off)
  return stykkeLangs(a.ringar, sporPunkt(l, 0, off), l.d, 1 / (R - off)).map(([x, y]): Span => (f > 0 ? [x * f, y * f] : [y * f, x * f]))
}
const boksar = (l: Line, t0: number, t1: number, s0: number, s1: number, gods: boolean): Boks[] => {
  if (!l.k) return [boks(l, t0, t1, s0, s1, gods)]
  const r = Math.abs(1 / l.k) + Math.max(Math.abs(s0), Math.abs(s1))
  const steg = Math.max(0.5, Math.sqrt(8 * r * 0.01))
  const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / steg))
  const ut: Boks[] = []
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n, b = t0 + ((t1 - t0) * (i + 1)) / n
    const tm = (a + b) / 2
    const o = sporPunkt(l, tm, 0)
    const vinkel = l.k * tm
    const d: Pt = [l.d[0] * Math.cos(vinkel) - l.d[1] * Math.sin(vinkel), l.d[1] * Math.cos(vinkel) + l.d[0] * Math.sin(vinkel)]
    const sm = (s0 + s1) / 2
    const h = ((b - a) / 2) * Math.abs(1 - l.k * sm) + 0.02
    ut.push(boks({ p: o, d, k: 0 }, -h, h, s0, s1, gods))
  }
  return ut
}
const boks = (l: Line, t0: number, t1: number, s0: number, s1: number, gods: boolean): Boks => {
  const tm = (t0 + t1) / 2
  const sm = (s0 + s1) / 2
  const hw = Math.abs(t1 - t0) / 2
  const hh = Math.abs(s1 - s0) / 2
  const c = l.d[0]
  const si = l.d[1]
  const cx = l.p[0] + c * tm - si * sm
  const cy = l.p[1] + si * tm + c * sm
  const rx = hw * Math.abs(c) + hh * Math.abs(si)
  const ry = hw * Math.abs(si) + hh * Math.abs(c)
  return { gods, rund: false, cx, cy, hw, hh, c, s: si, bx0: cx - rx, bx1: cx + rx, by0: cy - ry, by1: cy + ry }
}
const sluttar = (k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, tb2: number, wM: number) => {
  const fang = fangAv(k)
  const tappMin = tappMinAv(k)
  if (!T.omriss) return []
  const mKryss = felles(felles(langsAv(M, lM, 0), langsAv(M, lM, -(wM / 2 + 0.5))), langsAv(M, lM, wM / 2 + 0.5))
  if (!mKryss.length) return []
  const utMax = utMaxAv(k)
  const ut: { s: number; strekk: Span[]; u: number }[] = []
  for (const s of [-1, 1]) {
    const naer = langsAv(T, lT, s * (tb2 + fang))
    const fjern = langsAv(T, lT, -s * (tb2 + fang))
    const strekk = felles(utan(naer, fjern), mKryss)
      .filter(([lo, hi]) => hi - lo >= tappMin)
      .sort((a, b) => a[0] - b[0])
    if (strekk.length) ut.push({ s, strekk, u: 0 })
    const gjennom = felles(felles(naer, fjern), mKryss).filter(([lo, hi]) => hi - lo >= tappMin)
    if (!gjennom.length) continue
    const stikk = utan(gjennom, langsAv(T, lT, -s * (tb2 + utMax))).filter(([lo, hi]) => hi - lo >= tappMin)
    if (!stikk.length) continue
    let u = fang
    for (let off = fang + 0.5; off < utMax; off += 0.5) {
      if (felles(langsAv(T, lT, -s * (tb2 + off)), stikk).some(([lo, hi]) => hi - lo >= tappMin)) u = off
      else break
    }
    ut.push({ s, strekk: stikk.sort((a, b) => a[0] - b[0]), u: Math.round(u * 2) / 2 })
  }
  return ut
}
const hjorne = (l: Line, t0: number, t1: number, s0: number, s1: number): Pt[] => [
  sporPunkt(l, t0, s0),
  sporPunkt(l, t1, s0),
  sporPunkt(l, t1, s1),
  sporPunkt(l, t0, s1),
]
function rettKant(T: TappFlate, lT: Line, s: number, tb2: number, rom: number, strekk: readonly Span[]) {
  if (T.omriss) {
    const rett = (q: Pt): Pt => {
      const [lam, off] = sporInn(lT.p[0], lT.p[1], lT.d[0], lT.d[1], lT.k, q[0], q[1])
      if (Math.abs(off) >= rom) return q
      if (!strekk.some(([a, b]) => lam >= a - rom && lam <= b + rom)) return q
      return sporPunkt(lT, lam, s * tb2)
    }
    T.omriss = T.omriss.map(rett)
    T.hjorne = T.hjorne.map(rett)
  }
}

export function stikkUt(k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, sin: number, cos: number): Span[] {
  return sluttar(k, T, M, lT, lM, k.tjukn / (2 * sin), (k.slotW + k.tjukn * cos) / sin).filter((q) => q.u > 0).flatMap((q) => q.strekk)
}

export function tappa(k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, sin: number, cos: number, nr: number, fredt: readonly Span[] = []) {
  const fang = fangAv(k)
  const tb2 = k.tjukn / (2 * sin)
  const wM = (k.slotW + k.tjukn * cos) / sin
  const ut: { inn: Vec3; strekk: Span[]; tal: number }[] = []
  const utMax = utMaxAv(k)
  const tappMin = tappMinAv(k)
  for (const svar of sluttar(k, T, M, lT, lM, tb2, wM)) {
    const { s } = svar
    const u = kileU(k, svar.u)
    const strekk = fredt.length ? utan(svar.strekk, fredt as Span[]).filter(([lo, hi]) => hi - lo >= tappMin) : svar.strekk
    if (!strekk.length) continue
    let tal = 0
    const inn2: Pt = [s * lT.d[1], -s * lT.d[0]]
    const a = T.boygd ? T.r.k * lT.p[0] : 0
    const uHer = a ? add3(mul3(T.r.u, Math.cos(a)), mul3(T.r.n, Math.sin(a))) : T.r.u
    const inn: Vec3 = add3(mul3(uHer, inn2[0]), mul3(T.r.v, inn2[1]))
    const rom = tb2 + fang
    rettKant(T, lT, s, tb2, rom, strekk)
    const retta = T.omriss ? [T.omriss] : T.ringar
    for (const [c0, c1] of strekk) {
      T.tform.push(...boksar(lT, c0, c1, s * tb2, -s * (tb2 + (u ? utMax : fang) + 1), false))
      const naer = s * (tb2 + 0.01)
      for (const [g0, g1] of utan([[c0, c1]], stykkeLangs(retta, [lT.p[0] - lT.d[1] * naer, lT.p[1] + lT.d[0] * naer], lT.d))) {
        if (g1 - g0 > rom) T.tform.push(...boksar(lT, g0, g1, s * (tb2 + fang + 0.5), s * tb2, true))
      }
      const L = c1 - c0
      const n = Math.max(1, Math.round(L / 150))
      const celle = L / n
      const marg = Math.max(k.tjukn + k.klaring, 0.15 * celle)
      for (let i = 0; i < n; i++) {
        const a0 = c0 + i * celle + marg
        const a1 = c0 + (i + 1) * celle - marg
        T.tform.push(...boksar(lT, a0, a1, s * (tb2 + 0.5), -s * (tb2 + u), true))
        M.tform.push(...boksar(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2, false))
        const nokkel = `t${T.plan.id}-${M.plan.id}-${nr + tal}`
        const kw = kileBreidd(k, u)
        if (kw) {
          const m = (a0 + a1) / 2, hb = (k.tjukn + k.klaring) / 2
          T.tform.push(...boksar(lT, m - hb, m + hb, -s * (tb2 - KILE_EPS), -s * (tb2 - KILE_EPS + kw), false))
        }
        T.tapp.push({ mot: M.plan.id, slag: "tapp", midt: sporPunkt(lT, (a0 + a1) / 2, 0), hjorne: hjorne(lT, a0, a1, s * tb2, -s * (tb2 + u)), inn, nokkel, ...bogeAv(lT, a0, a1, s * tb2, -s * (tb2 + u)), ...(kw ? { kile: { w: kw } } : {}) })
        M.tapp.push({ mot: T.plan.id, slag: "slisse", midt: sporPunkt(lM, (a0 + a1) / 2, 0), hjorne: hjorne(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2), inn, nokkel, ...bogeAv(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2) })
        tal++
      }
    }
    T.utvida = true
    ut.push({ inn, strekk, tal })
    nr += tal
  }
  return ut
}

export function slisseGods(tapp: readonly Tapp[], skorne: readonly Pt[][]): number {
  let minst = Infinity
  for (const q of tapp) {
    if (q.slag !== "slisse") continue
    const [h0, h1, h2] = q.hjorne
    const b = q.boge
    const proever: { halv: number; runs: Span[] }[] = []
    if (b) {
      const tm = (b.t0 + b.t1) / 2, sm = (b.s0 + b.s1) / 2
      const R = 1 / b.k
      const f = R / (R - sm)
      const langs = stykkeLangs(skorne, sporPunkt(b, 0, sm), b.d, 1 / (R - sm)).map(([x, y]): Span => (f > 0 ? [x * f - tm, y * f - tm] : [y * f - tm, x * f - tm]))
      const a = b.k * tm
      const o = sporPunkt(b, tm, sm)
      const n: Pt = [-(b.d[1] * Math.cos(a) + b.d[0] * Math.sin(a)), b.d[0] * Math.cos(a) - b.d[1] * Math.sin(a)]
      proever.push({ halv: (b.t1 - b.t0) / 2, runs: langs }, { halv: Math.abs(b.s1 - b.s0) / 2, runs: stykkeLangs(skorne, o, n) })
    } else {
      for (const [fraa, til] of [[h0, h1], [h1, h2]] as const) proever.push({ halv: Math.hypot(til[0] - fraa[0], til[1] - fraa[1]) / 2, runs: stykkeLangs(skorne, q.midt, ein2(til, fraa)) })
    }
    for (const { halv, runs } of proever) {
      for (const side of [1, -1]) {
        const kant = side * halv
        const run = runs.find(([lo, hi]) => Math.abs((side > 0 ? lo : hi) - kant) < 0.75)
        minst = Math.min(minst, run ? run[1] - run[0] : 0)
      }
    }
  }
  return minst
}

export function fingrar(k: Ktx, A: TappFlate, B: TappFlate, lA: Line, lB: Line, sin: number, nr: number, fredt: readonly Span[] = []) {
  if (!A.omriss || !B.omriss || lA.k || lB.k) return null
  const fang = fangAv(k)
  const tb2 = k.tjukn / (2 * sin)
  const ende = (T: TappFlate, l: Line) => {
    for (const s of [-1, 1]) {
      const sp = utan(langsAv(T, l, s * (tb2 + fang)), langsAv(T, l, -s * (tb2 + fang)))
      if (sp.length) return { s, sp }
    }
    return null
  }
  const a = ende(A, lA), b = ende(B, lB)
  if (!a || !b) return null
  const strekk = utan(felles(a.sp, b.sp), fredt as Span[]).filter(([lo, hi]) => hi - lo >= tappMinAv(k))
  if (!strekk.length) return null
  const rom = tb2 + fang
  rettKant(A, lA, a.s, tb2, rom, strekk)
  rettKant(B, lB, b.s, tb2, rom, strekk)
  const retn = (T: TappFlate, l: Line, s: number): Vec3 => add3(mul3(T.r.u, s * l.d[1]), mul3(T.r.v, -s * l.d[0]))
  const innA = retn(A, lA, a.s), innB = retn(B, lB, b.s)
  let tal = 0
  for (const [c0, c1] of strekk) {
    A.tform.push(boks(lA, c0, c1, a.s * tb2, -a.s * (tb2 + fang + 1), false))
    B.tform.push(boks(lB, c0, c1, b.s * tb2, -b.s * (tb2 + fang + 1), false))
    const L = c1 - c0
    const n = Math.max(3, 2 * Math.round((L / (6 * k.tjukn) - 1) / 2) + 1)
    const f = L / n
    for (let i = 0; i < n; i++) {
      const [T, l, s, inn] = i % 2 ? [A, lA, a.s, innA] as const : [B, lB, b.s, innB] as const
      const f0 = c0 + i * f + (i ? k.klaring / 2 : 0)
      const f1 = c0 + (i + 1) * f - (i < n - 1 ? k.klaring / 2 : 0)
      T.tform.push(boks(l, f0, f1, s * (tb2 + 0.5), -s * tb2, true))
      const mot = T === A ? B : A
      T.tapp.push({ mot: mot.plan.id, slag: "tapp", midt: sporPunkt(l, (f0 + f1) / 2, 0), hjorne: hjorne(l, f0, f1, s * tb2, -s * tb2), inn, nokkel: `f${A.plan.id}-${B.plan.id}-${nr + tal}` })
      tal++
    }
  }
  A.utvida = B.utvida = true
  return { strekk, tal, innA: mul3(innB, -1), innB: mul3(innA, -1) }
}

export function gjennomgang(k: Ktx, P: TappFlate, G: TappFlate, lP: Line, lG: Line, sin: number, cos: number, nr: number, fredt: readonly Span[] = []) {
  if ((!G.omriss && !P.omriss) || lP.k || lG.k) return null
  const m = Math.max(2 * k.tjukn, 6)
  const rP = langsAv(P, lP, 0)
  const rG = langsAv(G, lG, 0)
  const ut: Span[] = []
  for (const [g0, g1] of rG) {
    if (g1 - g0 < tappMinAv(k) / 2) continue
    if (!rP.some(([p0, p1]) => p0 <= g0 - m && p1 >= g1 + m)) continue
    if (utan([[g0, g1]], fredt as Span[]).length === 0) continue
    const tb2 = k.tjukn / (2 * sin)
    const tvers = felles(felles(langsAv(P, lP, -(tb2 + m)), langsAv(P, lP, tb2 + m)), [[g0, g1]])
    if (!tvers.some(([a, b]) => b - a >= g1 - g0 - 1e-6)) continue
    ut.push([g0, g1])
  }
  if (!ut.length) return null
  const wP = (k.slotW + k.tjukn * cos) / sin
  const n = P.r.n
  const st = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? Math.sign(n[0]) : Math.abs(n[1]) >= Math.abs(n[2]) ? Math.sign(n[1]) : Math.sign(n[2])
  const inn = mul3(n, st || 1)
  let tal = 0
  for (const [g0, g1] of ut) {
    const a0 = g0 - k.klaring / 2, a1 = g1 + k.klaring / 2
    P.tform.push(boks(lP, a0, a1, -wP / 2, wP / 2, false))
    const nokkel = `g${G.plan.id}-${P.plan.id}-${nr + tal}`
    P.tapp.push({ mot: G.plan.id, slag: "slisse", midt: sporPunkt(lP, (a0 + a1) / 2, 0), hjorne: hjorne(lP, a0, a1, -wP / 2, wP / 2), inn, nokkel })
    G.tapp.push({ mot: P.plan.id, slag: "tapp", midt: sporPunkt(lG, (g0 + g1) / 2, 0), hjorne: hjorne(lG, g0, g1, -k.tjukn / (2 * sin), k.tjukn / (2 * sin)), inn, nokkel })
    tal++
  }
  P.utvida = true
  return { strekk: ut, tal, inn }
}

export function moteLedd(k: Ktx, A: TappFlate, B: TappFlate, lA: Line, lB: Line, sin: number, nr: number) {
  const cos = Math.sqrt(Math.max(0, 1 - sin * sin))
  const tekne: Span[] = []
  const vegar: [number, number, Vec3][] = []
  let tal = 0
  const pil = (del: TappFlate, mot: TappFlate, d: Vec3) => vegar.push([del.plan.id, mot.plan.id, d], [mot.plan.id, del.plan.id, mul3(d, -1)])
  for (const t of tappa(k, A, B, lA, lB, sin, cos, nr + tal, stikkUt(k, B, A, lB, lA, sin, cos))) {
    tal += t.tal
    pil(A, B, t.inn)
    tekne.push(...t.strekk)
  }
  for (const t of tappa(k, B, A, lB, lA, sin, cos, nr + tal, tekne)) {
    tal += t.tal
    pil(B, A, t.inn)
    tekne.push(...t.strekk)
  }
  for (const [P, G, lP, lG] of [[A, B, lA, lB], [B, A, lB, lA]] as const) {
    const gj = gjennomgang(k, P, G, lP, lG, sin, cos, nr + tal, tekne)
    if (!gj) continue
    tal += gj.tal
    pil(G, P, gj.inn)
    tekne.push(...gj.strekk)
  }
  const fi = fingrar(k, A, B, lA, lB, sin, nr + tal, tekne)
  if (fi) {
    tal += fi.tal
    vegar.push([A.plan.id, B.plan.id, fi.innA], [B.plan.id, A.plan.id, fi.innB])
    tekne.push(...fi.strekk)
  }
  return { tal, vegar, tekne }
}

export function skoyt(k: Ktx, A: TappFlate, B: TappFlate, snudd: boolean, nr: number) {
  if (!A.omriss || !B.omriss || A.boygd || B.boygd) return null
  const band = fangAv(k) + 0.5
  const iB = (l: Line): Line => (snudd ? { p: [-l.p[0], l.p[1]], d: [-l.d[0], l.d[1]], k: 0 } : l)
  const sB = snudd ? -1 : 1
  const djup = 1.5 * k.tjukn
  const ut: { strekk: Span[]; tal: number } = { strekk: [], tal: 0 }
  const o = A.omriss
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 3 * k.tjukn) continue
    const l: Line = { p: a, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k: 0 }
    const lb = iB(l)
    const kant: Span[] = [[0, L]]
    for (const s of [1, -1]) {
      const aInn = langsAv(A, l, s * band), aUt = langsAv(A, l, -s * band)
      const bInn = langsAv(B, lb, -s * sB * band), bUt = langsAv(B, lb, s * sB * band)
      const felt = felles(felles(utan(aInn, aUt), utan(bInn, bUt)), kant).filter(([x, y]) => y - x >= 3 * k.tjukn)
      for (const [c0, c1] of felt) {
        A.tform.push(boks(l, c0, c1, -s * 0, -s * (band + 1), false))
        B.tform.push(boks(lb, c0, c1, 0, s * sB * (band + 1), false))
        const n = Math.max(3, 2 * Math.round(((c1 - c0) / (3 * k.tjukn) - 1) / 2) + 1)
        const f = (c1 - c0) / n
        for (let j = 0; j < n; j++) {
          const f0 = c0 + j * f, f1 = c0 + (j + 1) * f
          const nokkel = `s${A.plan.id}-${B.plan.id}-${nr + ut.tal}`
          if (j % 2 === 0) {
            A.tform.push(boks(l, f0, f1, s * 0.5, -s * djup, true))
            B.tform.push(boks(lb, f0 - k.klaring / 2, f1 + k.klaring / 2, 0, -s * sB * (djup + k.klaring / 2), false))
            A.tapp.push({ mot: B.plan.id, slag: "tapp", midt: sporPunkt(l, (f0 + f1) / 2, -s * djup / 2), hjorne: hjorne(l, f0, f1, 0, -s * djup), inn: [0, 0, 0], nokkel })
          } else {
            B.tform.push(boks(lb, f0, f1, -s * sB * 0.5, s * sB * djup, true))
            A.tform.push(boks(l, f0 - k.klaring / 2, f1 + k.klaring / 2, 0, s * (djup + k.klaring / 2), false))
            B.tapp.push({ mot: A.plan.id, slag: "tapp", midt: sporPunkt(lb, (f0 + f1) / 2, s * sB * djup / 2), hjorne: hjorne(lb, f0, f1, 0, s * sB * djup), inn: [0, 0, 0], nokkel })
          }
          ut.tal++
        }
        ut.strekk.push([c0, c1])
      }
    }
  }
  if (!ut.tal) return null
  A.utvida = B.utvida = true
  return ut
}
