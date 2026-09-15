import { inRing, shoelace, type Pt, type Vec3 } from "./core"
import { broek, dot, kryss, omrissLine, OMRISS_TAK, ramme, STREK_TAK, sub3, ut, type Plan, type Ramme, type Strek } from "./plan"
import { speglPlan } from "./spegl"
import { spegelakse } from "./gruppe"

/** Teikna inndata i planet si ramme, før motoren får ein ferdig profil. */
export const teiknaFirkant = (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b, [a[0], b[1]]]

/** Synskuben står nesten langs aksen av omsyn til kameraet. Plata er eksakt. */
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

/**
 * Hald dei punkta som seier mest om forma, òg i innsøkk. Tol er kring éin
 * skjermpiksel i planet sine einingar. Kvar forkasta prikk vert prøvd mot
 * kanten som faktisk kjem i staden; punkt-taket får aldri flattrykkje ein
 * detalj meir enn to toleransar eller 1,25 % av diagonalen.
 */
export function teiknaKontur(punkt: readonly Pt[], tol: number): Pt[] | null {
  if (!Number.isFinite(tol) || tol <= 0 || punkt.some((p) => !p.every(Number.isFinite))) return null
  const ring = punkt.filter((p, i) => !i || avstand(p, punkt[i - 1]) > 1e-7)
  if (ring.length > 1 && avstand(ring[0], ring[ring.length - 1]) <= tol * 2) ring.pop()
  if (ring.length < 3) return null
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  if (Math.min(w, h) < tol * 8 || Math.abs(shoelace(ring)) < tol * tol * 64) return null

  let fjern = 1
  for (let i = 2; i < ring.length; i++) if (avstand(ring[0], ring[i]) > avstand(ring[0], ring[fjern])) fjern = i
  const hald = [0, fjern]
  const grense = Math.max(tol * 2, Math.hypot(w, h) * 0.0125)
  for (;;) {
    let feil = -1, neste = -1
    for (let k = 0; k < hald.length; k++) {
      const a = hald[k], b = k + 1 < hald.length ? hald[k + 1] : ring.length
      for (let i = a + 1; i < b; i++) {
        const d = fraaKant(ring[i], ring[a], ring[b % ring.length])
        if (d > feil) { feil = d; neste = i }
      }
    }
    if (neste < 0 || (feil <= tol && hald.length >= 3)) break
    if (hald.length >= OMRISS_TAK) { if (feil > grense) return null; break }
    hald.push(neste)
    hald.sort((a, b) => a - b)
  }
  const omriss = hald.map((i) => ring[i])
  if (omriss.length < 3 || Math.abs(shoelace(omriss)) < tol * tol * 64) return null
  // Ei kryssande handrørsle er ikkje éi lukka plate. Lat reiskapen stå klar.
  const side = (a: Pt, b: Pt, p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  for (let i = 0; i < omriss.length; i++) for (let j = i + 2; j < omriss.length; j++) {
    if (i === 0 && j === omriss.length - 1) continue
    const a = omriss[i], b = omriss[(i + 1) % omriss.length], c = omriss[j], d = omriss[(j + 1) % omriss.length]
    const overlappar = [0, 1].every((k) => Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) <= Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])))
    if (overlappar && side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return null
  }
  return omriss
}

// =============================================================================
// KVAR EI NY PLATE LANDAR, OG KVA TEIKNINGA HAKAR SEG FAST I
// =============================================================================
type Boks2 = { x0: number; x1: number; y0: number; y1: number }

/** stykket av linja a→b som ligg inne i boksen, i xy — Liang–Barsky */
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

/**
 * EI PLATE TEIKNA OVANFRÅ LANDAR OPPÅ DET SOM STÅR UNDER HO.
 *
 * Teikneplanet går gjennom midten av kroppen, og eit sete teikna der står
 * midt i beina. Det er aldri det nokon meinte: frå toppsynet teiknar du det
 * som skal liggje OPPÅ. So den nye plata vert lagd med underflata på den
 * høgaste kanten av dei ståande platene innanfor fotavtrykket hennar — og
 * tappane gjer resten. Ingenting under: ho står der ho vart teikna.
 *
 * Svaret er høgda på den kanten, i millimeter, eller null.
 */
export function landing(plan: readonly Plan[], min: Vec3, max: Vec3, S: number, fot: readonly Vec3[]): number | null {
  if (fot.length < 3) return null
  const k: Boks2 = {
    x0: Math.min(...fot.map((p) => p[0])),
    x1: Math.max(...fot.map((p) => p[0])),
    y0: Math.min(...fot.map((p) => p[1])),
    y1: Math.max(...fot.map((p) => p[1])),
  }
  let topp = -Infinity
  for (const q of plan) {
    if (!q.omriss || q.bog || Math.abs(q.n[2]) > 0.5) continue
    const r = ramme(q, min, max)
    const pk = omrissLine(q.omriss, q.runde).map((p) => ut(r, [p[0] * S, p[1] * S]))
    for (let i = 0; i < pk.length; i++) {
      const s = klippXY(pk[i], pk[(i + 1) % pk.length], k)
      if (s) topp = Math.max(topp, s[0][2], s[1][2])
    }
  }
  return Number.isFinite(topp) ? topp : null
}

/** ei line i teikneplanet, i brøk av storleiken: eit punkt og ei retning */
export type Snappline = { p: Pt; d: Pt }

/**
 * KVA TEIKNINGA HAKAR SEG FAST I: golvet, og midtplanet til kvar plate
 * teikneplanet ser på kant.
 *
 * Eit stag skal ende i sida, og sida står på kant når du teiknar staget:
 * ei tynn line. Treff fingeren innanfor ein tomme av henne, ligg enden
 * PÅ henne — i midtplanet, der tappen vert lesen frå. Golvet er det same
 * for foten på ei side: han står på golvet, ikkje ein millimeter under.
 */
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
  return ut2
}

/**
 * PUNKTET HAKA FAST: i den næraste lina innanfor `tol`, og i krysset
 * mellom to når båe er nære — hjørnet der eit stag møter sida og golvet.
 */
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
    // krysset: f.p + t·f.d på s-lina
    const t = ((s.l.p[0] - f.l.p[0]) * s.l.d[1] - (s.l.p[1] - f.l.p[1]) * s.l.d[0]) / c
    const x: Pt = [f.l.p[0] + f.l.d[0] * t, f.l.p[1] + f.l.d[1] * t]
    if (Math.hypot(x[0] - q[0], x[1] - q[1]) <= tol * 1.5) return x
  }
  return paa
}

/**
 * EIN KONTUR TEIKNA INNI DEN VALDE PLATA ER EIT HÒL I HO.
 *
 * Punkta kjem frå det frosne teikneplanet, i brøk kring midten av kroppen;
 * plata står parallelt med det, ein annan stad langs normalen. Ført ut i
 * rommet og inn att i ramma til plata er dei same punkta — og ligg dei
 * alle innanfor omrisset hennar, er det eit hòl og ikkje ei ny plate.
 * Null når plata ikkje er parallell, ikkje har eit omriss, eller når
 * konturen går utanfor.
 */
export function holAv(punkt: readonly Pt[], flate: Ramme, q: Plan, min: Vec3, max: Vec3, S: number): Strek | null {
  if (!q.omriss || q.bog || punkt.length < 3) return null
  const r = ramme(q, min, max)
  if (Math.abs(Math.abs(dot(r.n, flate.n)) - 1) > 1e-6) return null
  const lok = punkt.map((p): Pt => {
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

// =============================================================================
// DET FINGEREN MEINTE: SYMMETRISK OG MIDT PÅ
// =============================================================================
const tilKant = (p: Pt, a: Pt, b: Pt) => fraaKant(p, a, b)

/** avstanden frå punktet til omrisset */
function tilRing(p: Pt, ring: readonly Pt[]): number {
  let m = Infinity
  for (let i = 0; i < ring.length; i++) m = Math.min(m, tilKant(p, ring[i], ring[(i + 1) % ring.length]))
  return m
}

/**
 * EI SIDE TEIKNA NESTEN LIK PÅ BÅE SIDER ER EI SIDE SOM SKAL VERA LIK.
 *
 * Ein finger teiknar ikkje to like bein. Er konturen spegla om sin eigen
 * midtakse nær nok seg sjølv — i snitt under fem prosent av breidda, og
 * ingen stad over tolv — vert den høgre halvdelen klipt ved aksen og spegla
 * over. Ein kontur som er meint skeiv, er skeivare enn det, og står som han
 * vart teikna. Aksen må skjere konturen nett to gonger; ein W har fleire,
 * og han står òg.
 */
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
  // Sutherland–Hodgman mot x ≥ c
  const halv: { p: Pt; paa: boolean }[] = []
  for (let i = 0; i < punkt.length; i++) {
    const a = punkt[i]
    const b = punkt[(i + 1) % punkt.length]
    const ai = a[0] >= c
    const bi = b[0] >= c
    if (ai) halv.push({ p: a, paa: Math.abs(a[0] - c) < 1e-9 })
    if (ai !== bi) {
      const t = (c - a[0]) / (b[0] - a[0])
      // eit hjørne PÅ aksen er alt med, som seg sjølv eller som neste punkt
      if (t > 1e-12 && t < 1 - 1e-12) halv.push({ p: [c, a[1] + (b[1] - a[1]) * t], paa: true })
    }
  }
  const paa = halv.map((h, i) => (h.paa ? i : -1)).filter((i) => i >= 0)
  if (paa.length !== 2) return null
  // kjeda utanfor aksen: frå det eine aksepunktet til det andre, den vegen som ikkje går langs aksen
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
  // Eit aksepunkt nesten på lina mellom naboane sine er ikkje eit hjørne: ein
  // topp teikna ein millimeter skeiv vert eit tak med møne når han vert
  // spegla, og det meinte ingen.
  return ut.filter((p, i) => {
    if (Math.abs(p[0] - c) > 1e-9) return true
    const f = ut[(i + ut.length - 1) % ut.length]
    const e = ut[(i + 1) % ut.length]
    return fraaKant(p, f, e) > 0.01 * w
  })
}

/**
 * OG MIDT PÅ. Står midten av det teikna innanfor `tol` av midtlina til
 * arbeidsflata, var det der det skulle stå: ei side du teiknar rett
 * framfor deg skal stå midt i krakken, og eit par stag spegla om midten
 * treff henne berre då. `vassrett` sentrerer òg i den andre retninga —
 * eit sete — der eit loddrett plan har golvet sitt og står der det står.
 */
export function midtPaa(punkt: readonly Pt[], tol: number, vassrett: boolean): Pt[] {
  const xs = punkt.map((p) => p[0])
  const ys = punkt.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const dx = Math.abs(cx) <= tol ? -cx : 0
  const dy = vassrett && Math.abs(cy) <= tol ? -cy : 0
  return dx || dy ? punkt.map((p): Pt => [+(p[0] + dx).toFixed(6), +(p[1] + dy).toFixed(6)]) : [...punkt]
}

/**
 * DET TEIKNA SLIK DET VART MEINT: ein kontur spegla om han nesten er lik på
 * båe sider, og båe slag midt på når dei nesten står der. `tol` er ein
 * fingerbreidd i planet si eining.
 */
export function rettOpp(punkt: readonly Pt[], slag: "firkant" | "kontur", tol: number, vassrett: boolean): Pt[] {
  const s = slag === "kontur" ? symmetrisk(punkt) ?? punkt : punkt
  return midtPaa(s, tol, vassrett)
}

/**
 * KVA EIT LUKKA DRAG VERT.
 *
 * Inni den valde plata er det eit hòl — og i spegelbiletet hennar òg, når
 * ho er ein del av eit spegla par. Ovanfrå landar det oppå det som står
 * under. Elles er det ei ny plate der teikneplanet stod. Reint: studioet
 * gjer berre det svaret seier.
 */
export type Lukka =
  | { slag: "hol"; plan: Plan[]; strek: number }
  | { slag: "plate"; o: Vec3 }
  | { slag: "nei"; kvifor: string }

export function lukkTeikning(l: readonly Plan[], vald: number | null, po: Vec3, pn: Vec3, punkt: readonly Pt[], omriss: readonly Pt[], min: Vec3, max: Vec3, S: number, t: number): Lukka {
  const flate = ramme({ o: broek(po, min, max), n: pn }, min, max)
  const maal = l.find((q) => q.id === vald)
  const hol = maal && holAv(punkt, flate, maal, min, max, S)
  if (maal && hol) {
    if (maal.strek.length >= STREK_TAK) return { slag: "nei", kvifor: `taket er ${STREK_TAK} strek` }
    const med: Plan = { ...maal, strek: [...maal.strek, hol] }
    const par = maal.gruppe ? l.filter((q) => q.gruppe === maal.gruppe && q.id !== maal.id) : []
    const akse = par.length === 1 ? spegelakse(maal, par[0]) : null
    return {
      slag: "hol",
      plan: l.map((q) => (q.id === maal.id ? med : akse !== null && q.id === par[0].id ? { ...q, strek: speglPlan(med, akse, min, max).strek } : q)),
      strek: med.strek.length - 1,
    }
  }
  let p = po
  if (pn[2] > 0.999) {
    const z = landing(l, min, max, S, omriss.map((q) => ut(flate, [q[0] * S, q[1] * S])))
    if (z !== null) p = [po[0], po[1], z + t / 2]
  }
  return { slag: "plate", o: broek(p, min, max) }
}
