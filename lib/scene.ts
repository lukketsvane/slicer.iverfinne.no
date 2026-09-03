/**
 * SLICERMAN — scena: kroppen sett saman av bitar.
 *
 * Kroppen var éi fil. No er han ei liste: primitiv (kube, kule, sylinder,
 * kjegle, torus) og filer, kvar med sin plass, sin storleik og si vending,
 * lagde oppå kvarandre. Strålane tel skal og ikkje paritet, so to bitar
 * som går i kvarandre er éin kropp der dei overlappar — det er heile
 * grunnen til at dette er ein streng og ikkje ein boolsk operasjon.
 *
 * Kvar bit står i eit felles rom der den lengste sida hans er hundre
 * millimeter gonger `s`, flytt `t` millimeter og vend `rz` grader kring
 * z. Heile lista vert so vend, skalert til `storleik` og sett på golvet
 * som før. Ein streng i parameterposen, som plana: angre, lenkje,
 * prosjektfil og økt fylgjer med utan ei ny line.
 */
import type { Vec3 } from "./core"

export const SCENE_TAK = 16
/** dei fem som finst utan ei fil */
export const PRIMITIV = ["kube", "kule", "sylinder", "kjegle", "torus"] as const

export type Bit = {
  /** kjelde-id: eit primitiv, eller ei importert fil */
  id: string
  /** flytting, mm, i det felles rommet */
  t: Vec3
  /** storleik: lengste sida = 100 mm × s */
  s: number
  /** vending kring z, grader */
  rz: number
  /**
   * SPEGLINGANE, tre brytarar i eitt tal: 1 er x, 2 er y, 4 er z.
   *
   * Kvar brytar som står på gjev biten ein kopi på hi sida av planet
   * gjennom ORIGO, og saman gjev dei alle kombinasjonane: x og y er fire
   * bein av eitt. Planet står gjennom origo og ikkje gjennom biten sjølv —
   * ein bit ligg midt på x og y og står PÅ z null, so eit spegl om hans
   * eige senter ville vore ingenting for eit primitiv. Det er midten av
   * KROPPEN symmetrien handlar om.
   */
  sp: number
}

const tal = (v: number, d = 2) => String(+v.toFixed(d))

export const skrivScene = (l: readonly Bit[]): string =>
  // Speglingane står sist og berre når dei finst: ei scene utan symmetri
  // skriv seg akkurat som før, so ei lenkje frå i går er den same lenkja.
  l.map((b) => `${b.id}@${b.t.map((c) => tal(c)).join(",")}/${tal(b.s, 3)}/${tal(b.rz, 1)}${b.sp ? `/${b.sp}` : ""}`).join(";")

/** Lesinga er den einaste vegen inn: alt som ikkje er ein bit fell på golvet. */
export function lesScene(s: unknown): Bit[] {
  const ut: Bit[] = []
  if (typeof s !== "string" || !s) return ut
  for (const del of s.split(";")) {
    if (ut.length >= SCENE_TAK) break
    const m = /^([a-z0-9_-]{1,40})@(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\/([\d.]+)\/(-?[\d.]+)(?:\/([0-7]))?$/i.exec(del)
    if (!m) continue
    const t = [Number(m[2]), Number(m[3]), Number(m[4])] as Vec3
    const sk = Number(m[5])
    const rz = Number(m[6])
    if (!t.every(Number.isFinite) || !Number.isFinite(sk) || !Number.isFinite(rz)) continue
    if (t.some((c) => Math.abs(c) > 400) || sk < 0.05 || sk > 5) continue
    ut.push({ id: m[1], t: t.map((c) => +c.toFixed(2)) as Vec3, s: +sk.toFixed(3), rz: +((((rz % 360) + 360) % 360)).toFixed(1), sp: Number(m[7] ?? 0) })
  }
  return ut
}

export const reinScene = (s: unknown) => skrivScene(lesScene(s))

/** scena som høyrer til ei kjelde åleine, slik alt var før */
export const eiKjelde = (id: string): string => skrivScene([{ id, t: [0, 0, 0], s: 1, rz: 0, sp: 0 }])
