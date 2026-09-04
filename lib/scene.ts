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
/**
 * DEI INNEBYGDE FORMENE.
 *
 * Kula, sylinderen, kjegla og torusen var matematikk du kunne skjere i, og
 * det var ærleg nok — men ingen av dei fortalde kva verktyet er til. Ein
 * krakk gjer det. Formene her er møblar, forenkla ned til trekanttaket og
 * lagde med `scripts/former.ts`; dei ligg som glTF under `public/form` og
 * vert HENTA når du tek i dei.
 *
 * Kuben står att, og han er den einaste som er laga i koden. Han er
 * standardobjektet og fallet når ei kjelde manglar, so han må stå på
 * skjermen før noko nett har vore i nærleiken av eit nettverk.
 */
export const FILFORMER = [
  "stolform-01", "stolform-02", "stolform-03", "stolform-04", "stolform-05",
  "stolform-06", "stolform-07", "stolform-08", "stolform-09", "stolform-10",
] as const
export const FORMER = ["kube", ...FILFORMER] as const
export const erFilform = (id: string): boolean => (FILFORMER as readonly string[]).includes(id)

export type Bit = {
  /** kjelde-id: eit primitiv, eller ei importert fil */
  id: string
  /** flytting, mm, i det felles rommet */
  t: Vec3
  /**
   * STORLEIK PER AKSE: lengste sida = 100 mm × s, kvar veg for seg.
   *
   * Han var eitt tal. Eitt tal kan berre gjere ein kropp større, og det du
   * treng er som oftast å gjere han BREIARE eller LÅGARE — ein krakk er
   * ikkje ein oppblåsen kube. Tre tal gjev deg det, og prikkane på sidene
   * av boksen set eitt av dei kvar.
   *
   * Alle tre like er nett det eine talet var, so ein gamal streng med eitt
   * tal i les seg som tre like — og ei lenkje frå i fjor opnar det same
   * objektet ho alltid har opna.
   */
  s: Vec3
  /** vending kring z, grader */
  rz: number
}

/** bandet kvar akse bur i: under dette er biten borte, over er han ikkje ein bit */
export const BIT_MIN = 0.05
export const BIT_MAX = 5

const tal = (v: number, d = 2) => String(+v.toFixed(d))
/** tre like tal er det eine talet strengen hadde før, og vert skrivne som det */
const skrivS = (s: Vec3) =>
  s[0] === s[1] && s[1] === s[2] ? tal(s[0], 3) : s.map((c) => tal(c, 3)).join(",")

export const skrivScene = (l: readonly Bit[]): string =>
  l.map((b) => `${b.id}@${b.t.map((c) => tal(c)).join(",")}/${skrivS(b.s)}/${tal(b.rz, 1)}`).join(";")

/** Lesinga er den einaste vegen inn: alt som ikkje er ein bit fell på golvet. */
export function lesScene(s: unknown): Bit[] {
  const ut: Bit[] = []
  if (typeof s !== "string" || !s) return ut
  for (const del of s.split(";")) {
    if (ut.length >= SCENE_TAK) break
    // storleiken er anten eitt tal (som før) eller tre, eitt per akse
    const m = /^([a-z0-9_-]{1,40})@(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\/([\d.]+(?:,[\d.]+,[\d.]+)?)\/(-?[\d.]+)$/i.exec(del)
    if (!m) continue
    const t = [Number(m[2]), Number(m[3]), Number(m[4])] as Vec3
    const sd = m[5].split(",").map(Number)
    const sk: Vec3 = sd.length === 3 ? [sd[0], sd[1], sd[2]] : [sd[0], sd[0], sd[0]]
    const rz = Number(m[6])
    if (!t.every(Number.isFinite) || !sk.every(Number.isFinite) || !Number.isFinite(rz)) continue
    if (t.some((c) => Math.abs(c) > 400) || sk.some((c) => c < BIT_MIN || c > BIT_MAX)) continue
    ut.push({
      id: m[1],
      t: t.map((c) => +c.toFixed(2)) as Vec3,
      s: sk.map((c) => +c.toFixed(3)) as Vec3,
      rz: +((((rz % 360) + 360) % 360)).toFixed(1),
    })
  }
  return ut
}

export const reinScene = (s: unknown) => skrivScene(lesScene(s))

/** scena som høyrer til ei kjelde åleine, slik alt var før */
export const eiKjelde = (id: string): string => skrivScene([{ id, t: [0, 0, 0], s: [1, 1, 1], rz: 0 }])
