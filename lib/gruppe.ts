import { PLAN_ROM, add3, delAv, dreiing, iGruppa, mul3, norm3, sub3, vriOm, type Plan } from "./plan"
import type { Pt, Vec3 } from "./core"

export const klemO = (o: Vec3): Vec3 => o.map((c) => Math.min(1 + PLAN_ROM, Math.max(-PLAN_ROM, c))) as Vec3

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

export function rundt(q: Plan, N: number, min: Vec3, max: Vec3, fraaId: number, gruppe: number, t = 0): Plan[] {
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2
  let o: Vec3 = [min[0] + q.o[0] * (max[0] - min[0]), min[1] + q.o[1] * (max[1] - min[1]), q.o[2]]
  const ligg = Math.abs(q.n[2]) > 0.9999
  const paaAksen = !ligg && Math.abs((o[0] - cx) * q.n[0] + (o[1] - cy) * q.n[1]) < 1e-3 && Math.abs(q.n[2]) < 1e-6
  const u0 = -((o[0] - cx) * q.n[1] - (o[1] - cy) * q.n[0])
  const us = (q.omriss ?? []).map((p) => p[0] * (max[0] - min[0]) + u0)
  let gjennom = paaAksen && (!us.length || (Math.min(...us) < -1e-3 && Math.max(...us) > 1e-3))
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

export function nesteSteg(l: readonly Plan[], kopi: number, kjelde: number): Vec3 | null {
  const a = l.find((p) => p.id === kjelde), b = l.find((p) => p.id === kopi)
  if (!a || !b || a.bog !== b.bog) return null
  if (Math.abs(a.n[0] - b.n[0]) + Math.abs(a.n[1] - b.n[1]) + Math.abs(a.n[2] - b.n[2]) > 1e-3) return null
  const d = sub3(b.o, a.o)
  if (Math.hypot(...d) < 1e-4) return null
  return klemO(add3(b.o, d)).map((c) => +c.toFixed(4)) as Vec3
}
