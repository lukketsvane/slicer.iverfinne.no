import type { Vec3 } from "./core"
import type { Kropp } from "./kropp"
import type { Params } from "./params"
import { broek, type Plan } from "./plan"

const FINN_N = 64
export const FINN_TAK = 6
const FINN_VINKLAR = [0, 45] as const
export const FINN_PRIS = 0.01
export const FINN_BYGG = 6
const BITAR = 32
const OVANFRAA = 0.5
const SKRAA = 0.03
const AKSE = [[1, 2], [2, 0], [0, 1]] as const

export type Sett = { d: 0 | 1 | 2; vinkel: number; a: number[]; b: number[]; volum: number; syn: number; treff: number; skaar: number }

type Aksar = { pa: 0 | 1 | 2; qa: 0 | 1 | 2; c: number; s: number; ra: number; rb: number; ea: Vec3; eb: Vec3 }

type Rom = Aksar & {
  hd: number
  T: Int32Array
  U: Int32Array
  mote: Uint8Array
  syn: [number, number, number]
  rute: [number, number, number]
}

function aksar(k: Kropp, d: 0 | 1 | 2, vinkel: number): Aksar {
  const [pa, qa] = AKSE[d]
  const { min, max } = k.solid
  const c = Math.cos((vinkel * Math.PI) / 180)
  const s = Math.sin((vinkel * Math.PI) / 180)
  const rp = (max[pa] - min[pa]) / 2
  const rq = (max[qa] - min[qa]) / 2
  const ea: Vec3 = [0, 0, 0]
  const eb: Vec3 = [0, 0, 0]
  ea[pa] = c
  ea[qa] = s
  eb[pa] = -s
  eb[qa] = c
  return { pa, qa, c, s, ra: Math.abs(c) * rp + Math.abs(s) * rq, rb: Math.abs(s) * rp + Math.abs(c) * rq, ea, eb }
}

const tel = (x: number) => {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

function rommet(k: Kropp, d: 0 | 1 | 2, vinkel: number): Rom {
  const N = FINN_N
  const ak = aksar(k, d, vinkel)
  const { pa, qa, c, s, ra, rb, ea, eb } = ak
  const { min, max } = k.solid
  const mp = (min[pa] + max[pa]) / 2
  const mq = (min[qa] + max[qa]) / 2
  const d0 = min[d]
  const hd = Math.max(1e-9, max[d] - min[d]) / BITAR
  const T = new Int32Array(N * N)
  const U = new Int32Array(N * N)
  const syn: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < N; i++) {
    const al = -ra + ((i + 0.5) * 2 * ra) / N
    for (let j = 0; j < N; j++) {
      const be = -rb + ((j + 0.5) * 2 * rb) / N
      let bits = 0
      for (const [lo, hi] of k.solid.runs(d, mp + al * c - be * s, mq + al * s + be * c)) {
        let k0 = Math.max(0, Math.ceil((lo - d0) / hd - 0.5))
        let k1 = Math.min(BITAR - 1, Math.floor((hi - d0) / hd - 0.5))
        if (k1 < k0) k0 = k1 = Math.max(0, Math.min(BITAR - 1, Math.floor(((lo + hi) / 2 - d0) / hd)))
        bits |= k1 - k0 === BITAR - 1 ? -1 : ((1 << (k1 - k0 + 1)) - 1) << k0
      }
      T[i * N + j] = bits
      U[j * N + i] = bits
      if (bits) syn[2]++
    }
  }
  for (let x = 0; x < N; x++) {
    let langsA = 0
    let langsB = 0
    for (let y = 0; y < N; y++) {
      langsA |= U[x * N + y]
      langsB |= T[x * N + y]
    }
    syn[0] += tel(langsA)
    syn[1] += tel(langsB)
  }
  const fraaSida = (z: number) => 1 - (1 - OVANFRAA) * Math.abs(z)
  const rute: [number, number, number] = [rb * hd * fraaSida(ea[2]), ra * hd * fraaSida(eb[2]), ((ra * rb * 2) / N) * fraaSida(d === 2 ? 1 : 0)]
  return { ...ak, hd, T, U, mote: new Uint8Array(N * N), syn, rute }
}

function mota(r: Rom, p: Params) {
  const N = FINN_N
  const gods = Math.max(2, p.tjukn)
  const skulder = (p.tjukn + p.klaring) / 2 + Math.min(6, Math.max(2, p.tjukn / 2))
  const lengd = Math.ceil((2 * gods) / r.hd) + 1
  const sa = Math.ceil((skulder * N) / (2 * r.ra)) + 1
  const sb = Math.ceil((skulder * N) / (2 * r.rb)) + 1
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const t = r.T[i * N + j]
      if (!t) continue
      let god = true
      for (let lo = 0; lo < BITAR && god; ) {
        if (!((t >>> lo) & 1)) { lo++; continue }
        let hi = lo
        while (hi + 1 < BITAR && (t >>> (hi + 1)) & 1) hi++
        const n = hi - lo + 1
        if (n < lengd) god = false
        for (const kv of [lo + Math.floor(n / 4), hi - Math.floor(n / 4)]) {
          for (let e = 1; e <= sa && god; e++) god = i - e >= 0 && i + e < N && !!((r.T[(i - e) * N + j] >>> kv) & (r.T[(i + e) * N + j] >>> kv) & 1)
          for (let e = 1; e <= sb && god; e++) god = j - e >= 0 && j + e < N && !!((r.T[i * N + j - e] >>> kv) & (r.T[i * N + j + e] >>> kv) & 1)
        }
        lo = hi + 1
      }
      r.mote[i * N + j] = god ? 1 : 2
    }
  }
}

type Side = { F: Int32Array; C: Float64Array; areal: Int32Array; sum: number; skugge: Int32Array; syn: number; kan: number[]; luft: number }

function sida(F: Int32Array, luft: number): Side {
  const N = FINN_N
  const areal = new Int32Array(N)
  const skugge = new Int32Array(N)
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      areal[x] += tel(F[x * N + y])
      skugge[y] |= F[x * N + y]
    }
  }
  const sum = areal.reduce((a, b) => a + b, 0)
  const strekk = (0.02 * sum) / N / (N * N)
  const C = new Float64Array(N * N)
  for (let x = 0; x < N; x++) {
    for (let z = x + 1; z < N; z++) {
      let v = strekk * (x - z) * (x - z)
      for (let y = 0; y < N; y++) v += tel(F[x * N + y] ^ F[z * N + y])
      C[x * N + z] = v
      C[z * N + x] = v
    }
  }
  const stor = Math.max(...areal) * 0.04
  const kan: number[] = []
  for (let x = 0; x < N; x++) if (areal[x] > stor) kan.push(x)
  return { F, C, areal, sum, skugge, syn: skugge.reduce((a, b) => a + tel(b), 0), kan, luft }
}

function veks(s: Side, lovlege: readonly number[]): number[][] {
  const N = FINN_N
  const best = Float64Array.from(s.areal, (v) => v + (0.02 * s.sum) / N)
  const dekt = new Int32Array(N)
  const valde: number[] = []
  const ut: number[][] = []
  while (valde.length < FINN_TAK) {
    let topp = -1
    let vinst = 0
    for (const x of lovlege) {
      if (valde.some((z) => Math.abs(z - x) < s.luft)) continue
      let vol = 0
      let syn = 0
      for (let i = 0; i < N; i++) {
        if (best[i] > s.C[i * N + x]) vol += best[i] - s.C[i * N + x]
        syn += tel(s.F[x * N + i] & ~dekt[i])
      }
      const v = vol / s.sum + syn / s.syn
      if (v > vinst) { vinst = v; topp = x }
    }
    if (topp < 0) break
    for (let i = 0; i < N; i++) {
      if (best[i] > s.C[i * N + topp]) best[i] = s.C[i * N + topp]
      dekt[i] |= s.F[topp * N + i]
    }
    valde.push(topp)
    ut.push([...valde].sort((x, y) => x - y))
  }
  return ut
}

const naerast = (pos: readonly number[]): Int32Array => {
  const ut = new Int32Array(FINN_N)
  for (let i = 0, n = 0; i < FINN_N; i++) {
    while (n + 1 < pos.length && Math.abs(pos[n + 1] - i) < Math.abs(pos[n] - i)) n++
    ut[i] = n
  }
  return ut
}

function feste(F: Int32Array, x: number, kryss: readonly number[]): Int32Array {
  const N = FINN_N
  const f = new Int32Array(N)
  for (const y of kryss) f[y] = F[x * N + y]
  if (!kryss.length) return f
  for (let endra = true; endra; ) {
    endra = false
    for (let runde = 0; runde < 2; runde++) {
      for (let q = 0; q < N; q++) {
        const y = runde ? N - 1 - q : q
        const s = F[x * N + y]
        if (!s) continue
        let v = (f[y] | (y > 0 ? f[y - 1] : 0) | (y < N - 1 ? f[y + 1] : 0)) & s
        for (;;) {
          const w = (v | (v << 1) | (v >>> 1)) & s
          if (w === v) break
          v = w
        }
        if (v !== f[y]) { f[y] = v; endra = true }
      }
    }
  }
  return f
}

function treffet(r: Rom, a: readonly number[], b: readonly number[]): { volum: number; syn: number; treff: number } {
  const N = FINN_N
  const na = naerast(a)
  const nb = naerast(b)
  const ja = a.map((x) => feste(r.T, x, b.filter((y) => r.mote[x * N + y] === 1)))
  const jb = b.map((y) => feste(r.U, y, a.filter((x) => r.mote[x * N + y] === 1)))
  const ra = new Int32Array(N)
  const rb = new Int32Array(N)
  const kant = new Uint8Array(N * N)
  a.forEach((x, q) => {
    for (let j = 0; j < N; j++) {
      ra[j] |= ja[q][j]
      rb[x] |= ja[q][j]
      if (ja[q][j]) kant[x * N + j] = 1
    }
  })
  b.forEach((y, q) => {
    for (let i = 0; i < N; i++) {
      rb[i] |= jb[q][i]
      ra[y] |= jb[q][i]
      if (jb[q][i]) kant[i * N + y] = 1
    }
  })
  let felles = 0
  let samla = 0
  let topp = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < N; i++) {
    const A = ja[na[i]]
    sa += tel(ra[i])
    sb += tel(rb[i])
    for (let j = 0; j < N; j++) {
      const spaadd = A[j] & jb[nb[j]][i]
      const t = r.T[i * N + j]
      felles += tel(spaadd & t)
      samla += tel(spaadd | t)
      topp += kant[i * N + j]
    }
  }
  const volum = samla ? felles / samla : 0
  const syn = (sa * r.rute[0] + sb * r.rute[1] + topp * r.rute[2]) / (r.syn[0] * r.rute[0] + r.syn[1] * r.rute[1] + r.syn[2] * r.rute[2])
  return { volum, syn, treff: (volum + syn) / 2 }
}

export function settPlan(k: Kropp, s: Sett, fraa = 1, gFraa = 1): Plan[] {
  const { min, max } = k.solid
  const { ea, eb, ra, rb } = aksar(k, s.d, s.vinkel)
  const midt: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const eitt = (e: Vec3, rad: number, x: number, id: number, gruppe: number): Plan => {
    const al = -rad + ((x + 0.5) * 2 * rad) / FINN_N
    return { id, o: broek([midt[0] + e[0] * al, midt[1] + e[1] * al, midt[2] + e[2] * al], min, max), n: [+e[0].toFixed(4), +e[1].toFixed(4), +e[2].toFixed(4)], bog: 0, strek: [], gruppe }
  }
  return [...s.a.map((x, i) => eitt(ea, ra, x, fraa + i, gFraa)), ...s.b.map((y, i) => eitt(eb, rb, y, fraa + s.a.length + i, gFraa + 1))]
}

export function finnSett(k: Kropp, p: Params): { rekkje: Sett[]; proevde: number } {
  const N = FINN_N
  const rekkje: Sett[] = []
  let proevde = 0
  if (!k.soup.tris) return { rekkje, proevde }
  for (const d of [2, 1, 0] as const) {
    for (const vinkel of FINN_VINKLAR) {
      const r = rommet(k, d, vinkel)
      mota(r, p)
      const m = [(x: number, y: number) => r.mote[x * N + y], (y: number, x: number) => r.mote[x * N + y]]
      const sider = [
        sida(r.T, Math.max(2, Math.ceil(((p.tjukn + 6) * N) / (2 * r.ra)))),
        sida(r.U, Math.max(2, Math.ceil(((p.tjukn + 6) * N) / (2 * r.rb)))),
      ]
      const sett = new Set<string>()
      for (const fyrst of [0, 1]) {
        const e = sider[fyrst]
        const t = sider[1 - fyrst]
        const em = m[fyrst]
        for (const e0 of veks(e, e.kan.filter((x) => t.kan.some((y) => em(x, y) === 1)))) {
          for (const t0 of veks(t, t.kan.filter((y) => !e0.some((x) => em(x, y) === 2) && e0.some((x) => em(x, y) === 1)))) {
            proevde++
            const eigne = e0.filter((x) => t0.some((y) => em(x, y) === 1))
            const andre = t0.filter((y) => eigne.some((x) => em(x, y) === 1))
            if (!eigne.length || !andre.length) continue
            const a = fyrst ? andre : eigne
            const b = fyrst ? eigne : andre
            const nokkel = `${a.join(",")}|${b.join(",")}`
            if (sett.has(nokkel)) continue
            sett.add(nokkel)
            const t3 = treffet(r, a, b)
            rekkje.push({ d, vinkel, a, b, ...t3, skaar: t3.treff - FINN_PRIS * (a.length + b.length) - (vinkel ? SKRAA : 0) })
          }
        }
      }
    }
  }
  rekkje.sort((x, y) => y.skaar - x.skaar || x.a.length + x.b.length - y.a.length - y.b.length)
  return { rekkje, proevde }
}
