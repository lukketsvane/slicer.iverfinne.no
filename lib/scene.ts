import { lagFarge, type Vec3 } from "./core"

export const SCENE_TAK = 16
export const FAMILIAR: readonly { namn: string; tal: number }[] = [
  { namn: "kube", tal: 1 },
  { namn: "stolform", tal: 10 },
  { namn: "sau", tal: 4 },
  { namn: "dyr", tal: 5 },
]
const utgaave = (namn: string, n: number) => `${namn}-${String(n).padStart(2, "0")}`
export const FILFORMER: readonly string[] = FAMILIAR.filter((f) => f.tal > 1).flatMap((f) =>
  Array.from({ length: f.tal }, (_, i) => utgaave(f.namn, i + 1)),
)
export const FORMER: readonly string[] = FAMILIAR.map((f) => f.namn)
export const erFilform = (id: string): boolean => FILFORMER.includes(id)
export const familien = (id: string): string => id.replace(/-\d+$/, "")
export const fyrsteForm = (namn: string): string => {
  const f = FAMILIAR.find((q) => q.namn === namn)
  return !f ? namn : f.tal > 1 ? utgaave(namn, 1) : namn
}
export const nesteForm = (id: string): string => {
  const namn = familien(id)
  const f = FAMILIAR.find((q) => q.namn === namn)
  if (!f || f.tal < 2) return id
  const no = Number(id.slice(namn.length + 1))
  return utgaave(namn, (Number.isFinite(no) ? no % f.tal : 0) + 1)
}

export type Bit = {
  id: string
  t: Vec3
  s: Vec3
  rz: number
  farge?: number
}

export const BIT_MIN = 0.05
export const BIT_MAX = 5

const tal = (v: number, d = 2) => String(+v.toFixed(d))
const skrivS = (s: Vec3) =>
  s[0] === s[1] && s[1] === s[2] ? tal(s[0], 3) : s.map((c) => tal(c, 3)).join(",")

export const skrivScene = (l: readonly Bit[]): string =>
  l
    .map((b) => `${b.id}@${b.t.map((c) => tal(c)).join(",")}/${skrivS(b.s)}/${tal(b.rz, 1)}${b.farge ? `/c:${b.farge}` : ""}`)
    .join(";")

export function lesScene(s: unknown): Bit[] {
  const ut: Bit[] = []
  if (typeof s !== "string" || !s) return ut
  for (const del of s.split(";")) {
    if (ut.length >= SCENE_TAK) break
    const m = /^([a-z0-9_-]{1,40})@(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\/([\d.]+(?:,[\d.]+,[\d.]+)?)\/(-?[\d.]+)(?:\/c:(\d{1,2}))?$/i.exec(del)
    if (!m) continue
    const t = [Number(m[2]), Number(m[3]), Number(m[4])] as Vec3
    const sd = m[5].split(",").map(Number)
    const sk: Vec3 = sd.length === 3 ? [sd[0], sd[1], sd[2]] : [sd[0], sd[0], sd[0]]
    const rz = Number(m[6])
    const farge = m[7] === undefined ? 0 : (lagFarge(Number(m[7])) ?? 0)
    if (!t.every(Number.isFinite) || !sk.every(Number.isFinite) || !Number.isFinite(rz)) continue
    if (t.some((c) => Math.abs(c) > 400) || sk.some((c) => c < BIT_MIN || c > BIT_MAX)) continue
    ut.push({
      id: m[1],
      t: t.map((c) => +c.toFixed(2)) as Vec3,
      s: sk.map((c) => +c.toFixed(3)) as Vec3,
      rz: +((((rz % 360) + 360) % 360)).toFixed(1),
      ...(farge ? { farge } : {}),
    })
  }
  return ut
}

export const reinScene = (s: unknown) => skrivScene(lesScene(s))

export const eiKjelde = (id: string): string => skrivScene([{ id, t: [0, 0, 0], s: [1, 1, 1], rz: 0 }])
