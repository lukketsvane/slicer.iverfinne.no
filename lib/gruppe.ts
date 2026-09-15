/**
 * SLICERMAN — gruppa fylgjer leiaren.
 *
 * Reint: ei liste plan inn, ei liste plan ut. Studioet kallar dette når
 * handa flyttar eit plan, og vaktene kan kalle det utan ein nettlesar.
 */
import { PLAN_ROM, add3, delAv, dreiing, iGruppa, mul3, norm3, sub3, vriOm, type Plan } from "./plan"
import type { Vec3 } from "./core"

/** brøkane må halde seg nær boksen: eit plan langt utanfor råkar ingenting */
// same rommet `lesPlan` slepper gjennom: klemmer handa til eitt tal og
// strengen til eit anna, forsvinn planet du nett drog dit ved neste lesing
export const klemO = (o: Vec3): Vec3 => o.map((c) => Math.min(1 + PLAN_ROM, Math.max(-PLAN_ROM, c))) as Vec3

/**
 * KVAR TO PLAN I EI GRUPPE ER SPEGELBILETE AV KVARANDRE, om ein av midtplana.
 *
 * Ei spegling om aksen `k` snur `o[k]` om midten og `n[k]` om null og lèt
 * resten stå (`spegla`). Ei gruppe som er nett det, er eit par sider:
 * skuvet og dreiinga vert spegla for den andre, so du dreg dei frå
 * kvarandre med éin finger — og namna står kvar for seg som før.
 */
export function spegelakse(a: Plan, b: Plan): number | null {
  for (let k = 0; k < 3; k++) {
    const ok = [0, 1, 2].every((j) =>
      j === k
        ? Math.abs(a.o[j] + b.o[j] - 1) < 2e-4 && Math.abs(a.n[j] + b.n[j]) < 1e-3
        : Math.abs(a.o[j] - b.o[j]) < 2e-4 && Math.abs(a.n[j] - b.n[j]) < 1e-3,
    )
    if (ok) return k
  }
  return null
}

/**
 * GRUPPA FYLGJER LEIAREN. Plan `i` i lista har fått eit nytt punkt og ei ny
 * normal; er det i den valde gruppa, tek dei andre i gruppa det same
 * skuvet og den same dreiinga — heilt (saman) eller sin del av det
 * (fordelt, sjå `delAv`). Skuvet er det same for alle, so rada flyttar seg
 * stiv; dreiinga er den minste som tek den gamle normalen til den nye, lagd
 * på kvar si normal. Utan gruppe er det planet åleine som før.
 */
export function medGruppa(l: Plan[], i: number, o: Vec3, n: Vec3, g: number | null, fordel: boolean): Plan[] {
  const q = l[i]
  const ut = [...l]
  ut[i] = { ...q, o: klemO(o), n }
  if (g === null || q.gruppe !== g) return ut
  const dO = sub3(o, q.o)
  const { akse, ang } = dreiing(q.n, n)
  const rad = iGruppa(l, g)
  const par = rad.length === 2 ? rad.find((p) => p.id !== q.id)! : null
  const k = par ? spegelakse(q, par) : null
  if (par && k !== null) {
    const j = l.findIndex((p) => p.id === par.id)
    const sp = (v: Vec3): Vec3 => v.map((c, a) => (a === k ? -c : c)) as Vec3
    // ei spegla dreiing er dreiinga om den spegla aksen, den andre vegen
    const nn = ang ? (norm3(vriOm(par.n, sp(akse), -ang)).map((c) => +c.toFixed(4)) as Vec3) : par.n
    ut[j] = { ...par, o: klemO(add3(par.o, sp(dO))), n: nn }
    return ut
  }
  const del = delAv(rad, q.id, fordel)
  for (let j = 0; j < l.length; j++) {
    if (j === i) continue
    const t = del.get(l[j].id)
    if (t === undefined) continue
    const nn = ang ? (norm3(vriOm(l[j].n, akse, ang * t)).map((c) => +c.toFixed(4)) as Vec3) : l[j].n
    ut[j] = { ...l[j], o: klemO(add3(l[j].o, mul3(dO, t))), n: nn }
  }
  return ut
}
