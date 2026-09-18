import { shoelace, type Pt, type Vec3 } from "./core"
import { OMRISS_TAK, STREK_TAK, omrissLine, omrissMidt, ramme, ut as utAv, type Plan, type Ramme, type Strek } from "./plan"
import { forenklaBane, fraaKant, mjukePunkt, teiknaKontur } from "./teikning"

const klem = (v: number) => Math.max(-2, Math.min(2, +v.toFixed(4)))
const kp = (p: Pt): Pt => [klem(p[0]), klem(p[1])]
const skift = (r: number[] | undefined, f: (k: number) => number | null) => {
  const ny = (r ?? []).map(f).filter((k): k is number => k !== null)
  return ny.length ? { runde: ny } : { runde: undefined }
}

export function makker(o: readonly Pt[], i: number, tol = 2e-3): number | null {
  const [x, y] = o[i]
  if (Math.abs(x) <= tol) return i
  let best: number | null = null
  let bd = tol
  o.forEach(([a, b], k) => {
    const d = Math.hypot(a + x, b - y)
    if (k !== i && d <= bd) { bd = d; best = k }
  })
  return best
}

type Feste = { i: number; t: number; p: Pt }

const paaRingen = (o: readonly Pt[], p: Pt, tol: number): Feste | null => {
  const n = o.length
  let best: Feste | null = null
  let bd = tol
  for (let i = 0; i < n; i++) {
    const a = o[i]
    const b = o[(i + 1) % n]
    const x = b[0] - a[0]
    const y = b[1] - a[1]
    const L = x * x + y * y
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / L)) : 0
    const q: Pt = [a[0] + t * x, a[1] + t * y]
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d <= bd) {
      bd = d
      best = { i, t, p: q }
    }
  }
  return best
}

const tilBane = (p: Pt, b: readonly Pt[]): number => {
  let m = Infinity
  for (let i = 0; i + 1 < b.length; i++) m = Math.min(m, fraaKant(p, b[i], b[i + 1]))
  return m
}

const midtpunkt = (pkt: readonly Pt[]): Pt => {
  const bit = pkt.slice(1).map((p, i) => Math.hypot(p[0] - pkt[i][0], p[1] - pkt[i][1]))
  const halv = bit.reduce((s, v) => s + v, 0) / 2
  let gaatt = 0
  for (let i = 0; i < bit.length; i++) {
    if (gaatt + bit[i] >= halv) {
      const t = bit[i] ? (halv - gaatt) / bit[i] : 0
      return [pkt[i][0] + (pkt[i + 1][0] - pkt[i][0]) * t, pkt[i][1] + (pkt[i + 1][1] - pkt[i][1]) * t]
    }
    gaatt += bit[i]
  }
  return pkt[pkt.length - 1]
}

export function blyantPunkt(q: Plan, bane: readonly Pt[], tol: number, feste: number): Plan {
  const o = q.omriss
  if (!o || o.length < 3) return q
  const n = o.length
  const fyrst = forenklaBane(bane, tol)
  if (fyrst.length < 2) return q
  const A = paaRingen(o, fyrst[0], feste)
  const B = paaRingen(o, fyrst[fyrst.length - 1], feste)
  if (!A || !B) return q
  if (Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1]) < feste / 4) return q
  const loype = (fraa: number, til: number) => {
    const ut: number[] = []
    for (let i = (fraa + 1) % n; i !== (til + 1) % n; i = (i + 1) % n) ut.push(i)
    return ut
  }
  const fram = loype(A.i, B.i)
  const att = loype(B.i, A.i)
  const skore = (a: Feste, idx: readonly number[], b: Feste) => tilBane(midtpunkt([a.p, ...idx.map((i) => o[i]), b.p]), fyrst)
  const byt = skore(B, att, A) < skore(A, fram, B)
  const halde = byt ? fram : att
  const [start, slutt] = byt ? [A, B] : [B, A]
  const glatt = forenklaBane(byt ? [...bane].reverse() : bane, tol, Math.max(2, OMRISS_TAK - halde.length - 2))
  const nye = glatt.slice(1, -1)

  const pkt: Pt[] = [start.p, ...halde.map((i) => o[i]), slutt.p, ...nye]
  const gml: number[] = [-1, ...halde, -1, ...nye.map(() => -1)]
  const omriss: Pt[] = []
  const kjelde: number[] = []
  for (let k = 0; k < pkt.length; k++) {
    const p = kp(pkt[k])
    const sist = omriss[omriss.length - 1]
    if (sist && Math.hypot(sist[0] - p[0], sist[1] - p[1]) < 1e-4) {
      if (gml[k] >= 0) kjelde[kjelde.length - 1] = gml[k]
      continue
    }
    omriss.push(p)
    kjelde.push(gml[k])
  }
  if (omriss.length > 3 && Math.hypot(omriss[0][0] - omriss[omriss.length - 1][0], omriss[0][1] - omriss[omriss.length - 1][1]) < 1e-4) {
    omriss.pop()
    kjelde.pop()
  }
  if (omriss.length < 3 || omriss.length > OMRISS_TAK || Math.abs(shoelace(omriss)) < 1e-9) return q
  const fyrre = new Set(q.runde ?? [])
  const rund = new Set(kjelde.flatMap((i, k) => (i >= 0 && fyrre.has(i) ? [k] : [])))
  const mjuk = new Set(mjukePunkt(omriss))
  for (let k = 0; k < omriss.length; k++) if (kjelde[k] < 0 && mjuk.has(k)) rund.add(k)
  const runde = [...rund].sort((x, y) => x - y)
  return { ...q, omriss, ...(runde.length ? { runde } : { runde: undefined }) }
}

export function flyttPunkt(q: Plan, i: number, p: Pt, spegl = false): Plan {
  const o = q.omriss
  if (!o?.[i]) return q
  const ny = o.slice()
  const m = spegl ? makker(o, i) : null
  if (m === i) ny[i] = kp([0, p[1]])
  else {
    ny[i] = kp(p)
    if (m !== null) ny[m] = kp([-p[0], p[1]])
  }
  return Math.abs(shoelace(ny)) < 1e-6 ? q : { ...q, omriss: ny }
}

export function leggPunkt(q: Plan, i: number, spegl = false): Plan {
  const o = q.omriss
  if (!o?.[i] || o.length >= OMRISS_TAK) return q
  const rund = new Set(q.runde ?? [])
  const midt = kp(omrissMidt(o, rund, i))
  const ny = o.slice()
  ny.splice(i + 1, 0, midt)
  let ut: Plan = { ...q, omriss: ny, ...skift(q.runde, (k) => (k > i ? k + 1 : k)) }
  if (spegl && ut.omriss!.length < OMRISS_TAK && Math.abs(midt[0]) > 2e-3) {
    const a = makker(o, (i + 1) % o.length), b = makker(o, i)
    if (a !== null && b !== null && (a + 1) % o.length === b && a !== i) {
      const j = a < i + 1 ? a : a + 1
      const o2 = ut.omriss!.slice()
      o2.splice(j + 1, 0, kp([-midt[0], midt[1]]))
      ut = { ...ut, omriss: o2, ...skift(ut.runde, (k) => (k > j ? k + 1 : k)) }
    }
  }
  return ut
}

export function takPunkt(q: Plan, i: number, spegl = false): Plan {
  const o = q.omriss
  if (!o?.[i]) return q
  const m = spegl ? makker(o, i) : null
  const bort = new Set([i, ...(m !== null ? [m] : [])])
  if (o.length - bort.size < 3) return q
  const ny = o.filter((_, k) => !bort.has(k))
  const flytt = (k: number) => (bort.has(k) ? null : k - [...bort].filter((b) => b < k).length)
  return { ...q, omriss: ny, ...skift(q.runde, flytt) }
}

export function rundPunkt(q: Plan, i: number, spegl = false): Plan {
  const o = q.omriss
  if (!o?.[i]) return q
  const r = new Set(q.runde ?? [])
  const paa = !r.has(i)
  const m = spegl ? makker(o, i) : null
  for (const k of m !== null ? [i, m] : [i]) {
    if (paa) r.add(k)
    else r.delete(k)
  }
  const ny = [...r].sort((a, b) => a - b)
  return { ...q, runde: ny.length ? ny : undefined }
}

export function flyttStrek(q: Plan, k: number, x: number, y: number): Plan {
  const s = q.strek[k]
  if (!s) return q
  return { ...q, strek: q.strek.map((st, j) => (j === k ? { ...st, x: klem(x), y: klem(y) } : st)) }
}
export function takStrek(q: Plan, k: number): Plan {
  return q.strek[k] ? { ...q, strek: q.strek.filter((_, j) => j !== k) } : q
}
export function leggStrek(q: Plan, s: Strek): Plan {
  return q.strek.length >= STREK_TAK ? q : { ...q, strek: [...q.strek, s] }
}

export function strekRing(s: Strek, n = 32): Pt[] {
  const a = (s.a * Math.PI) / 180
  const c = Math.cos(a), si = Math.sin(a)
  const lok: Pt[] =
    s.form === "kontur" && s.punkt
      ? s.punkt.map(([x, y]) => [x * s.w, y * s.h])
      : s.form === "rund"
        ? Array.from({ length: n }, (_, i) => [(s.w / 2) * Math.cos((2 * Math.PI * i) / n), (s.h / 2) * Math.sin((2 * Math.PI * i) / n)])
        : [[-s.w / 2, -s.h / 2], [s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2]]
  return lok.map(([x, y]) => [s.x + x * c - y * si, s.y + x * si + y * c])
}

function klippRing(ring: readonly Pt[], a: 0 | 1, c: number, snu: boolean): Pt[] {
  const inne = (p: Pt) => (snu ? p[a] >= c : p[a] <= c)
  const ut: Pt[] = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]
    if (inne(p)) ut.push(p)
    if (inne(p) !== inne(q)) {
      const t = (c - p[a]) / (q[a] - p[a])
      ut.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return ut
}

export function delIto(q: Plan, nyId: number, tol = 5e-4): [Plan, Plan] | null {
  if (!q.omriss || q.bog) return null
  const tett = omrissLine(q.omriss, q.runde)
  const xs = tett.map((p) => p[0]), ys = tett.map((p) => p[1])
  const a: 0 | 1 = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1
  const v = a ? ys : xs
  const c = (Math.max(...v) + Math.min(...v)) / 2
  const halv = (snu: boolean): Plan | null => {
    const k = teiknaKontur(klippRing(tett, a, c, snu), tol)
    if (!k) return null
    const o = k.map(kp)
    const runde = mjukePunkt(o)
    return { ...q, omriss: o, runde: runde.length ? runde : undefined }
  }
  const A = halv(false), B = halv(true)
  return A && B ? [A, { ...B, id: nyId }] : null
}

export function spileAkse(q: Plan, alle: readonly Plan[], min: Vec3, max: Vec3, S: number, t: number): 0 | 1 | null {
  if (!q.omriss || q.bog) return null
  const r = ramme(q, min, max)
  const pk = omrissLine(q.omriss, q.runde).map((p) => ({ p, w: utAv(r, [p[0] * S, p[1] * S]) }))
  const plan = alle.filter((o) => o.id !== q.id && o.omriss && !o.bog).map((o) => ramme(o, min, max)).filter((o) => Math.abs(o.n[0] * r.n[0] + o.n[1] * r.n[1] + o.n[2] * r.n[2]) < 0.99)
  const naar = (w: Vec3, o: Ramme) => { const L = Math.hypot(o.n[0], o.n[1], o.n[2]) || 1; return Math.abs(((w[0] - o.o[0]) * o.n[0] + (w[1] - o.o[1]) * o.n[1] + (w[2] - o.o[2]) * o.n[2]) / L) <= t }
  const eps = 1e-3
  const kant = (pkt: typeof pk) => pkt.length > 0 && plan.some((o) => pkt.every((k) => naar(k.w, o)))
  const treff = (a: 0 | 1) => {
    const v = pk.map((k) => k.p[a])
    const lo = Math.min(...v), hi = Math.max(...v)
    return kant(pk.filter((k) => k.p[a] <= lo + eps)) && kant(pk.filter((k) => k.p[a] >= hi - eps))
  }
  const x = treff(0), y = treff(1)
  return x === y ? null : x ? 0 : 1
}

export function spiler(q: Plan, n: number, glipe: number, fraaId: number, langs?: 0 | 1 | null, tol = 5e-4): Plan[] | null {
  if (!q.omriss || q.bog || n < 2) return null
  const tett = omrissLine(q.omriss, q.runde)
  const xs = tett.map((p) => p[0]), ys = tett.map((p) => p[1])
  const a: 0 | 1 = langs === 0 ? 1 : langs === 1 ? 0 : Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1
  const v = a ? ys : xs
  const lo = Math.min(...v), hi = Math.max(...v)
  const b = (hi - lo - (n - 1) * glipe) / n
  if (b <= glipe) return null
  const ut: Plan[] = []
  for (let i = 0; i < n; i++) {
    const c0 = lo + i * (b + glipe), c1 = c0 + b
    const k = teiknaKontur(klippRing(klippRing(tett, a, c0, true), a, c1, false), tol)
    if (!k) return null
    const o = k.map(kp)
    const runde = mjukePunkt(o)
    ut.push({ ...q, id: i ? fraaId + i - 1 : q.id, omriss: o, runde: runde.length ? runde : undefined })
  }
  return ut
}
