import { akser } from "../../lib/plan"
import type { Pt, Vec3 } from "../../lib/core"

export type Ekstra = { namn: string; tjukn: number; omriss: Pt[]; hol?: Pt[][]; matrise: number[]; krumming?: number; material?: string; farge?: string }

const eins = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

const mat = (u: Vec3, v: Vec3, n: Vec3, o: Vec3, t: number): number[] => [...u, 0, ...v, 0, ...n, 0, o[0] - (t / 2) * n[0], o[1] - (t / 2) * n[1], o[2] - (t / 2) * n[2], 1]

export function flatark(val: { namn: string; punkt: Vec3; n: Vec3; omriss: Pt[]; hol?: Pt[][]; tjukn: number; material?: string; farge?: string }): Ekstra {
  const n = eins(val.n)
  const { u, v } = akser(n)
  return { namn: val.namn, tjukn: val.tjukn, omriss: val.omriss, hol: val.hol ?? [], matrise: mat(u, v, n, val.punkt, val.tjukn), material: val.material, farge: val.farge }
}

export function sylinderark(val: { namn: string; R: number; grader: number; z0: number; z1: number; midt?: number; tjukn: number; senter?: Pt; material?: string; farge?: string }): Ekstra {
  const t = ((val.midt ?? 180) * Math.PI) / 180
  const a = (val.grader / 360) * Math.PI * val.R
  const zm = (val.z0 + val.z1) / 2
  const n: Vec3 = [-Math.cos(t), -Math.sin(t), 0]
  const u: Vec3 = [Math.sin(t), -Math.cos(t), 0]
  const c = val.senter ?? [0, 0]
  const o: Vec3 = [c[0] + val.R * Math.cos(t), c[1] + val.R * Math.sin(t), zm]
  const h = (val.z1 - val.z0) / 2
  return { namn: val.namn, tjukn: val.tjukn, omriss: [[-a, -h], [a, -h], [a, h], [-a, h]], hol: [], matrise: mat(u, [0, 0, 1], n, o, val.tjukn), krumming: 1 / val.R, material: val.material, farge: val.farge }
}

export function ekstraSvg(e: Ekstra): string {
  const xs = e.omriss.map((p) => p[0])
  const ys = e.omriss.map((p) => p[1])
  const x0 = Math.min(...xs) - 2
  const y1 = Math.max(...ys) + 2
  const b = Math.max(...xs) + 2 - x0
  const h = y1 - (Math.min(...ys) - 2)
  const sti = (r: readonly Pt[]) => "M" + r.map((p) => `${(p[0] - x0).toFixed(3)} ${(y1 - p[1]).toFixed(3)}`).join("L") + "Z"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="0 0 ${b.toFixed(2)} ${h.toFixed(2)}"><path d="${[e.omriss, ...(e.hol ?? [])].map(sti).join("")}" fill="none" stroke="#0000ff" stroke-width="0.1"/></svg>\n`
}

export function ekstraDxf(e: Ekstra): string {
  const x0 = Math.min(...e.omriss.map((p) => p[0])) - 2
  const y0 = Math.min(...e.omriss.map((p) => p[1])) - 2
  const l: (string | number)[] = [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"]
  for (const r of [...(e.hol ?? []), e.omriss]) {
    l.push(0, "POLYLINE", 8, "KUTT", 66, 1, 70, 1)
    for (const p of r) l.push(0, "VERTEX", 8, "KUTT", 10, (p[0] - x0).toFixed(4), 20, (p[1] - y0).toFixed(4))
    l.push(0, "SEQEND")
  }
  l.push(0, "ENDSEC", 0, "EOF")
  return l.join("\n") + "\n"
}
