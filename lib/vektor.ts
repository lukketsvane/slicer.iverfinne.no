/**
 * SLICERMAN — vektorgrepa på eit omriss, flatt.
 *
 * Reint: eit plan inn, eit plan ut. 2D-flata (`components/vektor.tsx`)
 * kallar desse, og vaktene kan kalle dei utan ein nettlesar. Eininga er
 * brøk av storleiken, som i strengen; punkta står i planet si eiga ramme.
 */
import { shoelace, type Pt } from "./core"
import { OMRISS_TAK, STREK_TAK, omrissMidt, type Plan, type Strek } from "./plan"

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
