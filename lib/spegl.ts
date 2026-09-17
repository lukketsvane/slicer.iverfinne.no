import type { Pt, Vec3 } from "./core"
import { add3, dot, inn, nyGruppe, nyId, omrissLine, ramme, spegla, ut, type Plan } from "./plan"
import { stykkeLangs } from "./stykke"

export function speglPlan(p: Plan, akse: number, min: Vec3, max: Vec3): Plan {
  const ny = { ...p, ...spegla(p.o, p.n, akse) }
  const foer = ramme(p, min, max)
  const etter = ramme(ny, min, max)
  const vend = (v: Vec3): Vec3 => v.map((q, i) => i === akse ? -q : q) as Vec3
  const su = Math.sign(dot(etter.u, vend(foer.u)))
  const sv = Math.sign(dot(etter.v, vend(foer.v)))
  const punkt = ([x, y]: Pt): Pt => [su * x || 0, sv * y || 0]
  return {
    ...ny,
    ...(p.omriss ? { omriss: p.omriss.map(punkt) } : {}),
    ...(p.runde ? { runde: [...p.runde] } : {}),
    strek: p.strek.map((s) => {
      const [x, y] = punkt([s.x, s.y])
      const a = s.a * Math.PI / 180
      const snudd = su * sv < 0 && s.punkt ? { punkt: s.punkt.map(([px, py]): Pt => [px, -py || 0]) } : {}
      return { ...s, ...snudd, x, y, a: +((Math.atan2(sv * Math.sin(a), su * Math.cos(a)) * 180) / Math.PI).toFixed(4) }
    }),
  }
}

export function speglPar(q: Plan, akse: number, min: Vec3, max: Vec3, S: number, l: readonly Plan[], t = 0): { flytt: Plan; kopi: Plan } | null {
  if (q.bog || Math.abs(Math.abs(q.n[akse]) - 1) > 1e-6 || Math.abs(q.o[akse] - 0.5) > 1e-4) return null
  const ut = Math.min(S / 3, innafor(q, akse, min, max, S, l, t) - 2.5 * t) / Math.max(1e-6, max[akse] - min[akse])
  if (!(ut > 0)) return null
  const gruppe = nyGruppe(l)
  const flytt: Plan = { ...q, gruppe, o: q.o.map((c, a) => (a === akse ? +(0.5 - ut).toFixed(4) : c)) as Vec3 }
  return { flytt, kopi: { ...speglPlan(flytt, akse, min, max), id: nyId(l), gruppe } }
}

function innafor(q: Plan, akse: number, min: Vec3, max: Vec3, S: number, l: readonly Plan[], t: number): number {
  const aks = (n: Vec3) => n.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-6)
  const rq = ramme(q, min, max)
  const qp = omrissLine(q.omriss ?? [], q.runde).map((p) => ut(rq, [p[0] * S, p[1] * S]))
  let best = Infinity
  for (const Q of l) {
    const b = aks(Q.n)
    if (Q.id === q.id || Q.bog || !Q.omriss || b < 0 || b === akse || !qp.length) continue
    const ob = ramme(Q, min, max).o[b]
    if (ob < Math.min(...qp.map((p) => p[b])) - t || ob > Math.max(...qp.map((p) => p[b])) + t) continue
    const h = 3 - akse - b
    const h0 = Math.min(...qp.map((p) => p[h]))
    const h1 = Math.max(...qp.map((p) => p[h]))
    const r = ramme(Q, min, max)
    const ring = omrissLine(Q.omriss, Q.runde).map((p): Pt => [p[0] * S, p[1] * S])
    const midt = (min[akse] + max[akse]) / 2
    for (let i = 0; i <= 8; i++) {
      const P: Vec3 = [0, 0, 0]
      P[akse] = midt
      P[b] = r.o[b]
      P[h] = h0 + ((h1 - h0) * i) / 8
      const e: Vec3 = [0, 0, 0]
      e[akse] = 1
      const p0 = inn(r, P)
      const p1 = inn(r, add3(P, e))
      const runs = stykkeLangs([ring], p0, [p1[0] - p0[0], p1[1] - p0[1]])
      if (!runs.length) continue
      best = Math.min(best, -runs[0][0], runs[runs.length - 1][1])
    }
  }
  return best
}
