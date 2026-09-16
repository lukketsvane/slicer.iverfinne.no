/**
 * SLICERMAN — vektorgrepa på eit omriss, flatt.
 *
 * Reint: eit plan inn, eit plan ut. 2D-flata (`components/vektor.tsx`)
 * kallar desse, og vaktene kan kalle dei utan ein nettlesar. Eininga er
 * brøk av storleiken, som i strengen; punkta står i planet si eiga ramme.
 */
import { shoelace, type Pt, type Vec3 } from "./core"
import { OMRISS_TAK, STREK_TAK, omrissLine, omrissMidt, ramme, ut as utAv, type Plan, type Ramme, type Strek } from "./plan"
import { mjukePunkt, teiknaKontur } from "./teikning"

const klem = (v: number) => Math.max(-2, Math.min(2, +v.toFixed(4)))
const kp = (p: Pt): Pt => [klem(p[0]), klem(p[1])]
/** bogane er plassar: kvart grep som flyttar plassar, flyttar dei med */
const skift = (r: number[] | undefined, f: (k: number) => number | null) => {
  const ny = (r ?? []).map(f).filter((k): k is number => k !== null)
  return ny.length ? { runde: ny } : { runde: undefined }
}

/**
 * SPEGELMAKKEREN: punktet på den andre sida av midtlina (x = 0), eller
 * null. Eit punkt på lina er sin eigen makker.
 */
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

/** eitt punkt dit fingeren er — og makkeren spegla, når spegelen er på */
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

/** eit nytt punkt midt på stykket etter `i`, på kurva — med makkeren sin */
export function leggPunkt(q: Plan, i: number, spegl = false): Plan {
  const o = q.omriss
  if (!o?.[i] || o.length >= OMRISS_TAK) return q
  const rund = new Set(q.runde ?? [])
  const midt = kp(omrissMidt(o, rund, i))
  const ny = o.slice()
  ny.splice(i + 1, 0, midt)
  let ut: Plan = { ...q, omriss: ny, ...skift(q.runde, (k) => (k > i ? k + 1 : k)) }
  if (spegl && ut.omriss!.length < OMRISS_TAK && Math.abs(midt[0]) > 2e-3) {
    // makkerstykket: det som endar der det spegla stykket byrjar
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

/** punktet bort, og makkeren. Tre er golvet. */
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

/** hjørne eller boge — for punktet og makkeren */
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

/** eit strek flytt, eller bort */
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

/** eit strek som ein ring i planet si ramme: det 2D-flata teiknar og treffer */
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

/** halvplanet `x·a ≤ c` (eller ≥ når `snu`) av ein ring — Sutherland–Hodgman */
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

/**
 * DEL I TO: plata vert to, delte på tvers av den lengste leia midt i.
 * Dei ligg i same plan, kant i kant, og snittinga gjev dei fingrar
 * (`skoyt` i tapp.ts). For eit delt sete, og for ei plate som er større
 * enn arket. Bogane vert rekna ut til punkt og funne att.
 */
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

/**
 * SPILER: plata vert `n` like breie spiler på tvers av den lengste leia,
 * med ei luft på `glipe` mellom kvar — eit sete av lameller, ei rist. Den
 * fyrste held namnet; dei andre får namna frå `fraaId` og oppover. Kvar
 * spile tek omrisset sitt frå plata, so ein runda kant vert runda i den
 * ytste spila og rett i dei inni.
 */
/**
 * KVA VEG SPILENE GÅR: langs den aksen der omrisset endar i andre plater.
 *
 * Eit sete mellom to sider når frå den eine sida til den andre, og spilene
 * skal gjera det same — kvar spile er eit sete for seg, med tappane sine i
 * båe endar. Aksen er den der både den lågaste og den høgaste kanten ligg
 * innanfor ei tjukn av midtplanet til ei anna plate. Når ingen eller båe
 * gjer det, seier forma sjølv: null, og `spiler` tek den lengste.
 */
export function spileAkse(q: Plan, alle: readonly Plan[], min: Vec3, max: Vec3, S: number, t: number): 0 | 1 | null {
  if (!q.omriss || q.bog) return null
  const r = ramme(q, min, max)
  const pk = omrissLine(q.omriss, q.runde).map((p) => ({ p, w: utAv(r, [p[0] * S, p[1] * S]) }))
  const plan = alle.filter((o) => o.id !== q.id && o.omriss && !o.bog).map((o) => ramme(o, min, max)).filter((o) => Math.abs(o.n[0] * r.n[0] + o.n[1] * r.n[1] + o.n[2] * r.n[2]) < 0.99)
  const naar = (w: Vec3, o: Ramme) => { const L = Math.hypot(o.n[0], o.n[1], o.n[2]) || 1; return Math.abs(((w[0] - o.o[0]) * o.n[0] + (w[1] - o.o[1]) * o.n[1] + (w[2] - o.o[2]) * o.n[2]) / L) <= t }
  const eps = 1e-3
  // heile kanten i den enden — kvart punkt der — ligg i den same plata
  const kant = (pkt: typeof pk) => pkt.length > 0 && plan.some((o) => pkt.every((k) => naar(k.w, o)))
  const treff = (a: 0 | 1) => {
    const v = pk.map((k) => k.p[a])
    const lo = Math.min(...v), hi = Math.max(...v)
    return kant(pk.filter((k) => k.p[a] <= lo + eps)) && kant(pk.filter((k) => k.p[a] >= hi - eps))
  }
  const x = treff(0), y = treff(1)
  return x === y ? null : x ? 0 : 1
}

/** `langs` er aksen spilene går langs; utan han går dei langs den lengste */
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
