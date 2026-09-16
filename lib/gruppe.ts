/**
 * SLICERMAN — gruppa fylgjer leiaren.
 *
 * Reint: ei liste plan inn, ei liste plan ut. Studioet kallar dette når
 * handa flyttar eit plan, og vaktene kan kalle det utan ein nettlesar.
 */
import { PLAN_ROM, add3, delAv, dreiing, iGruppa, mul3, norm3, sub3, vriOm, type Plan } from "./plan"
import type { Pt, Vec3 } from "./core"

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

/**
 * RUNDT: N PLAN KRING DEN LODDRETTE MIDTAKSEN.
 *
 * Tre bein på 120°, seks ribber i ein sekskant: det valde planet og N − 1
 * kopiar, kvar dreidd 360/N grader kring z gjennom midten av boksen. Eit
 * ståande plan dreier ramma med seg (v er opp, u fylgjer normalen), so
 * omrisset står. Eit liggjande plan har ei fast ramme (v er nord), so der
 * vert punkta og streka dreidde i planet i staden.
 */
export function rundt(q: Plan, N: number, min: Vec3, max: Vec3, fraaId: number, gruppe: number, t = 0): Plan[] {
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2
  let o: Vec3 = [min[0] + q.o[0] * (max[0] - min[0]), min[1] + q.o[1] * (max[1] - min[1]), q.o[2]]
  const ligg = Math.abs(q.n[2]) > 0.9999
  // eit plan gjennom aksen er det same planet ein halv runde seinare — men berre
  // når plata går OVER aksen er steget 180/N; eit bein som står ut frå midten
  // i eit radialt plan er eitt av N, kvar si side
  const paaAksen = !ligg && Math.abs((o[0] - cx) * q.n[0] + (o[1] - cy) * q.n[1]) < 1e-3 && Math.abs(q.n[2]) < 1e-6
  const u0 = -((o[0] - cx) * q.n[1] - (o[1] - cy) * q.n[0])
  const us = (q.omriss ?? []).map((p) => p[0] * (max[0] - min[0]) + u0)
  let gjennom = paaAksen && (!us.length || (Math.min(...us) < -1e-3 && Math.max(...us) > 1e-3))
  /**
   * FIRE RUNDT EIN VEGG MIDT I ER EI KASSE. Veggen går ut til halve breidda
   * si minus ei halv tjukn, og dei fire hjørna møtest i flukt — der vert dei
   * fingrar (`fingrar` i tapp.ts).
   */
  if (gjennom && N === 4 && us.length) {
    const ut0 = Math.max(-Math.min(...us), Math.max(...us)) - t / 2
    const L = Math.hypot(q.n[0], q.n[1])
    o = [o[0] - (q.n[0] / L) * ut0, o[1] - (q.n[1] / L) * ut0, o[2]]
    gjennom = false
  }
  const ut: Plan[] = []
  for (let k = 0; k < N; k++) {
    const a = ((gjennom ? 1 : 2) * Math.PI * k) / N
    const c = Math.cos(a), s = Math.sin(a)
    const x = cx + (o[0] - cx) * c - (o[1] - cy) * s
    const y = cy + (o[0] - cx) * s + (o[1] - cy) * c
    const r4 = (v: number) => +v.toFixed(4) || 0
    const n: Vec3 = [r4(q.n[0] * c - q.n[1] * s), r4(q.n[0] * s + q.n[1] * c), q.n[2]]
    const dreidd = (p: Pt): Pt => (ligg ? [r4(p[0] * c - p[1] * s), r4(p[0] * s + p[1] * c)] : p)
    ut.push({
      ...q,
      id: k ? fraaId + k - 1 : q.id,
      gruppe,
      o: klemO([r4((x - min[0]) / (max[0] - min[0])), r4((y - min[1]) / (max[1] - min[1])), q.o[2]]),
      n,
      ...(q.omriss ? { omriss: q.omriss.map(dreidd) } : {}),
      strek: q.strek.map((st) => {
        if (!ligg) return st
        const [sx, sy] = dreidd([st.x, st.y])
        return { ...st, x: sx, y: sy, a: +(((st.a + (a * 180) / Math.PI) % 360 + 360) % 360).toFixed(2) }
      }),
    })
  }
  return ut
}

/**
 * GJENTA: KOPIEN GÅR SAME STEGET SOM DEN FØRRE.
 *
 * Dupliser, dra kopien dit den neste skal stå, dupliser att — og den
 * tredje kjem like langt frå den andre. Steget er skilnaden mellom
 * kopien og kjelda slik dei står NO, so eit drag på kopien er steget.
 * Null når det ikkje er noko steg å gå (ingen kjelde, eller ei anna normal).
 */
export function nesteSteg(l: readonly Plan[], kopi: number, kjelde: number): Vec3 | null {
  const a = l.find((p) => p.id === kjelde), b = l.find((p) => p.id === kopi)
  if (!a || !b || a.bog !== b.bog) return null
  if (Math.abs(a.n[0] - b.n[0]) + Math.abs(a.n[1] - b.n[1]) + Math.abs(a.n[2] - b.n[2]) > 1e-3) return null
  const d = sub3(b.o, a.o)
  if (Math.hypot(...d) < 1e-4) return null
  return klemO(add3(b.o, d)).map((c) => +c.toFixed(4)) as Vec3
}
