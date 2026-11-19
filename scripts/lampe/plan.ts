import { lesPlan, rutenett, skrivPlan, type Plan, type Strek } from "../../lib/plan"
import type { Pt, Vec3 } from "../../lib/core"
import type { Registrert } from "./form"

export type { Plan, Strek, Registrert }
export { lesPlan, rutenett, skrivPlan }

const f4 = (v: number) => +v.toFixed(4) || 0
const rad = (g: number) => (g * Math.PI) / 180

export const brok = (k: Registrert, p: Vec3): Vec3 => [f4((p[0] - k.min[0]) / k.side[0]), f4((p[1] - k.min[1]) / k.side[1]), f4((p[2] - k.min[2]) / k.side[2])]

export function plan(k: Registrert, id: number, punkt: Vec3, n: Vec3, meir: Partial<Plan> = {}): Plan {
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return { id, o: brok(k, punkt), n: [f4(n[0] / l), f4(n[1] / l), f4(n[2] / l)], bog: 0, strek: [], ...meir }
}

export const mm = (k: Registrert, pts: readonly Pt[]): Pt[] => pts.map(([a, b]) => [f4(a / k.storleik), f4(b / k.storleik)] as Pt)

export const ringar = (k: Registrert, fraa: number, zs: readonly number[], meir: Partial<Plan> = {}): Plan[] => zs.map((z, i) => plan(k, fraa + i, [0, 0, z], [0, 0, 1], meir))

export const radial = (k: Registrert, fraa: number, N: number, fase = 0): Plan[] =>
  Array.from({ length: N }, (_, i) => {
    const a = rad(fase) + (Math.PI * i) / N
    return plan(k, fraa + i, [0, 0, (k.min[2] + k.max[2]) / 2], [Math.cos(a), Math.sin(a), 0])
  })

export const tangent = (k: Registrert, fraa: number, N: number, r: number, fase = 0): Plan[] =>
  Array.from({ length: N }, (_, i) => {
    const a = rad(fase) + (2 * Math.PI * i) / N
    return plan(k, fraa + i, [r * Math.cos(a), r * Math.sin(a), (k.min[2] + k.max[2]) / 2], [Math.cos(a), Math.sin(a), 0])
  })

export const lameller = (k: Registrert, fraa: number, akse: "x" | "y", stader: readonly number[]): Plan[] =>
  stader.map((s, i) => plan(k, fraa + i, akse === "x" ? [s, 0, (k.min[2] + k.max[2]) / 2] : [0, s, (k.min[2] + k.max[2]) / 2], akse === "x" ? [1, 0, 0] : [0, 1, 0]))

export const radialplate = (k: Registrert, id: number, grad: number, rz: readonly Pt[], meir: Partial<Plan> = {}, forskyving = 0): Plan => {
  const t = rad(grad)
  const n: Vec3 = [Math.sin(t), -Math.cos(t), 0]
  return plan(k, id, [forskyving * n[0], forskyving * n[1], k.min[2]], n, { omriss: mm(k, rz.map(([r, z]) => [r, z - k.min[2]] as Pt)), ...meir })
}

export type RibbeVal = { r1?: number; z0?: number; z1?: number; fase?: number; forskyving?: number }

export const halvribber = (k: Registrert, fraa: number, N: number, r0: number, val: RibbeVal = {}): Plan[] => {
  const r1 = val.r1 ?? k.storleik
  const z0 = val.z0 ?? k.min[2] - 10
  const z1 = val.z1 ?? k.max[2] + 10
  return Array.from({ length: N }, (_, i) => radialplate(k, fraa + i, (val.fase ?? 0) + (360 * i) / N, [[r0, z0], [r1, z0], [r1, z1], [r0, z1]], { nett: true }, val.forskyving ?? 0))
}

export const utanfraa = (horisontale: readonly Plan[], ribber: readonly Plan[]): Plan[] => {
  const neg = ribber.filter((q) => {
    const ex = -q.n[1]
    const ey = q.n[0]
    return ex < -1e-6 || (Math.abs(ex) <= 1e-6 && ey < 0)
  })
  return [...neg, ...horisontale, ...ribber.filter((q) => !neg.includes(q))]
}

export const sirkel = (k: Registrert, r: number, n = 24, senter: Pt = [0, 0]): { omriss: Pt[]; runde: number[] } => ({
  omriss: mm(k, Array.from({ length: n }, (_, i) => [senter[0] + r * Math.cos((2 * Math.PI * i) / n), senter[1] + r * Math.sin((2 * Math.PI * i) / n)] as Pt)),
  runde: Array.from({ length: n }, (_, i) => i),
})

export const rundt = (k: Registrert, slag: "gods" | "hol", d: number, x = 0, y = 0): Strek => ({ slag, form: "rund", x: f4(x / k.storleik), y: f4(y / k.storleik), w: f4(d / k.storleik), h: f4(d / k.storleik), a: 0 })

export const ellipse = (k: Registrert, slag: "gods" | "hol", b: number, h: number, x = 0, y = 0, grad = 0): Strek => ({ slag, form: "rund", x: f4(x / k.storleik), y: f4(y / k.storleik), w: f4(b / k.storleik), h: f4(h / k.storleik), a: grad })

export const rektStrek = (k: Registrert, slag: "gods" | "hol", b: number, h: number, x = 0, y = 0, grad = 0): Strek => ({ slag, form: "rekt", x: f4(x / k.storleik), y: f4(y / k.storleik), w: f4(b / k.storleik), h: f4(h / k.storleik), a: grad })

export const golv = (k: Registrert, id: number, z: number, omrissMm: readonly Pt[], meir: Partial<Plan> = {}): Plan => plan(k, id, [0, 0, z], [0, 0, 1], { omriss: mm(k, omrissMm), ...meir })

export const rundskive = (k: Registrert, id: number, z: number, r: number, hol = 0, meir: Partial<Plan> = {}): Plan =>
  plan(k, id, [0, 0, z], [0, 0, 1], { ...sirkel(k, r), strek: hol > 0 ? [rundt(k, "hol", hol)] : [], ...meir })

export const vegg = (k: Registrert, id: number, n: Vec3, avstand: number, omrissMm: readonly Pt[], meir: Partial<Plan> = {}): Plan => {
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return plan(k, id, [(n[0] / l) * avstand, (n[1] / l) * avstand, k.min[2]], n, { omriss: mm(k, omrissMm.map(([u, z]) => [u, z - k.min[2]] as Pt)), ...meir })
}

export const skjerm = (k: Registrert, id: number, R: number, grader: number, z0: number, z1: number, midt = 180, meir: Partial<Plan> = {}): Plan => {
  const a = (grader / 360) * Math.PI * R
  const t = rad(midt)
  const n: Vec3 = [-Math.cos(t), -Math.sin(t), 0]
  const zm = (z0 + z1) / 2
  return plan(k, id, [-R * n[0], -R * n[1], zm], n, { bog: f4(k.storleik / R), omriss: mm(k, [[-a, z0 - zm], [a, z0 - zm], [a, z1 - zm], [-a, z1 - zm]]), ...meir })
}

export const renne = (k: Registrert, id: number, R: number, grader: number, y0: number, y1: number, zTopp: number, meir: Partial<Plan> = {}): Plan => {
  const a = (grader / 360) * Math.PI * R
  return plan(k, id, [0, 0, zTopp], [0, 0, -1], { bog: f4(k.storleik / R), omriss: mm(k, [[-a, y0], [a, y0], [a, y1], [-a, y1]]), ...meir })
}
