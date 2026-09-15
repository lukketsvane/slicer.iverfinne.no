/** Gjenteken flytting er nye, sjølvstendige plan, aldri ferdige kuttprofilar. */
import { PLAN_ROM, PLAN_TAK, nyId, skrivPlan, type Plan } from "./plan"
import type { Vec3 } from "./core"

export type Planval = { plan: readonly Plan[]; vald: number | null }
export type Kopipar = { fraa: Plan; til: number }

/** Berre ei faktisk dublering av det valde, handforma planet startar ei rekkje. */
export function finnKopipar(foer: Planval, etter: Planval): Kopipar | null {
  if (etter.plan.length !== foer.plan.length + 1) return null
  const fraa = foer.plan.find((p) => p.id === foer.vald)
  const til = etter.plan.find((p) => p.id === etter.vald)
  if (!fraa?.omriss || !til || foer.plan.some((p) => p.id === til.id)) return null
  // Dei gamle plana må stå urørte; ei importert teikning er ikkje ein kopi.
  if (skrivPlan(etter.plan.filter((p) => p.id !== til.id)) !== skrivPlan(foer.plan)) return null
  const profil = (p: Plan) => skrivPlan([{ ...p, id: 1, o: [0, 0, 0], gruppe: undefined }])
  return profil(fraa) === profil(til) ? { fraa, til: til.id } : null
}

/** Avvis, ikkje klem: ei klemd siste ribbe ville fått feil avstand. */
export function gjentaFlytting(plan: readonly Plan[], par: Kopipar): { kopi?: Plan; grunn?: string } {
  const fraa = plan.find((p) => p.id === par.fraa.id)
  const til = plan.find((p) => p.id === par.til)
  if (!fraa || !til || skrivPlan([fraa]) !== skrivPlan([par.fraa])) return { grunn: "kjelda er endra" }
  if (til.n.some((n, i) => Math.abs(n - fraa.n[i]) > 1e-8)) return { grunn: "gjenta krev same retning" }
  if (plan.length >= PLAN_TAK) return { grunn: `taket er ${PLAN_TAK} plan` }
  const d = til.o.map((v, i) => v - fraa.o[i]) as Vec3
  if (Math.hypot(...d) < 0.0001) return { grunn: "flytt kopien fyrst" }
  const o = til.o.map((v, i) => +(v + d[i]).toFixed(4)) as Vec3
  if (o.some((v) => !Number.isFinite(v) || v < -PLAN_ROM || v > 1 + PLAN_ROM)) return { grunn: "ikkje rom for fleire kopiar" }
  // Profil, bogar og hòl kjem frå den siste plata. Ledda vert rekna på nytt.
  return { kopi: { ...til, id: nyId(plan), o, gruppe: undefined } }
}
