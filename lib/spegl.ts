import type { Pt, Vec3 } from "./core"
import { dot, ramme, spegla, type Plan } from "./plan"

/** Spegelbiletet tek heile teikninga med inn i den nye lokale ramma. */
export function speglPlan(p: Plan, akse: number, min: Vec3, max: Vec3): Plan {
  const ny = { ...p, ...spegla(p.o, p.n, akse) }
  const foer = ramme(p, min, max)
  const etter = ramme(ny, min, max)
  const vend = (v: Vec3): Vec3 => v.map((q, i) => i === akse ? -q : q) as Vec3
  // Hovudaksane held referanseaksen i akser(). Difor er avbildinga to
  // forteikn: ingen skeivskalering av eit rundt hòl eller av bøyen.
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
      return { ...s, x, y, a: +((Math.atan2(sv * Math.sin(a), su * Math.cos(a)) * 180) / Math.PI).toFixed(4) }
    }),
  }
}
