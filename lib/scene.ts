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
import { lagFarge, type Vec3 } from "./core"

export const SCENE_TAK = 16
/**
 * DEI INNEBYGDE FORMENE, I FAMILIAR.
 *
 * Kula, sylinderen, kjegla og torusen var matematikk du kunne skjere i, og
 * det var ærleg nok — men ingen av dei fortalde kva verktyet er til. Ein
 * krakk gjer det. Formene her er møblar og dyr, forenkla ned til
 * trekanttaket og lagde med `scripts/former.ts`; dei ligg som glTF under
 * `public/form` og vert HENTA når du tek i dei.
 *
 * MENYEN LISTAR FAMILIEN OG IKKJE UTGÅVENE. Ti stolformer var ti liner i
 * ein meny som dekte objektet, og du måtte velje mellom ti ting du ikkje
 * hadde sett. Éi line seier «stolform», og du får den fyrste; er ho ikkje
 * den du ville ha, tek det same valet deg til den neste. Det er å BLA
 * gjennom utgåvene med kroppen framme i staden for å velje i ei liste med
 * kroppen dekt — og det einaste ein utgåve-id tyder er kva fil som vert
 * henta.
 *
 * Kuben står att, og han er den einaste som er laga i koden — og den
 * einaste familien med berre ei utgåve. Han er standardobjektet og fallet
 * når ei kjelde manglar, so han må stå på skjermen før noko nett har vore i
 * nærleiken av eit nettverk.
 */
export const FAMILIAR: readonly { namn: string; tal: number }[] = [
  { namn: "kube", tal: 1 },
  { namn: "stolform", tal: 10 },
  { namn: "sau", tal: 4 },
  // Fem dyr i ein familie og ikkje fem liner: hund, vêr, ei blokkete
  // skulptur, hest og ramn. Dei er ulike emne, og det er nett difor dei
  // høyrer saman her — menyen dekkjer objektet, og det du vil er å BLA
  // gjennom former med kroppen framme. Ein familie per dyr hadde gjort
  // menyen nesten tre gonger så lang for å spare deg eitt trykk.
  { namn: "dyr", tal: 5 },
]
/** utgåve nummer `n` i familien, ein-indeksert: «stolform», 3 → «stolform-03» */
const utgaave = (namn: string, n: number) => `${namn}-${String(n).padStart(2, "0")}`
export const FILFORMER: readonly string[] = FAMILIAR.filter((f) => f.tal > 1).flatMap((f) =>
  Array.from({ length: f.tal }, (_, i) => utgaave(f.namn, i + 1)),
)
/** det menyen listar: éi line per familie */
export const FORMER: readonly string[] = FAMILIAR.map((f) => f.namn)
export const erFilform = (id: string): boolean => FILFORMER.includes(id)
/** familien ei form høyrer til, eller forma sjølv når ho er heile familien */
export const familien = (id: string): string => id.replace(/-\d+$/, "")
/** den fyrste utgåva i ein familie: det du får når du vel henne */
export const fyrsteForm = (namn: string): string => {
  const f = FAMILIAR.find((q) => q.namn === namn)
  return !f ? namn : f.tal > 1 ? utgaave(namn, 1) : namn
}
/** den neste utgåva, rundt att på den fyrste. Ein familie på éi er seg sjølv. */
export const nesteForm = (id: string): string => {
  const namn = familien(id)
  const f = FAMILIAR.find((q) => q.namn === namn)
  if (!f || f.tal < 2) return id
  const no = Number(id.slice(namn.length + 1))
  return utgaave(namn, (Number.isFinite(no) ? no % f.tal : 0) + 1)
}

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
  /**
   * LAGET BITEN EIG (C02–C29, sjå `LAG_FARGAR` i core), om noko.
   *
   * Det er den same paletten plana merkjer seg med, og det er MEININGA:
   * fargen er bandet mellom dei. Eit plan merkt med same laget som ein bit
   * HØYRER TIL den biten, og vert skore inne i boksen hans åleine — sjå
   * `snitt.ts`. Ein kropp av fleire figurar fekk elles ribber som strekte
   * seg frå den eine tvers over lufta og inn i den andre: éin del som held
   * to figurar i hop, der du ville hatt to.
   *
   * Utan merke eig biten ingenting, og eit umerkt plan skjer heile kroppen
   * som før. Merket seier ikkje noko om geometrien til biten sjølv.
   */
  farge?: number
}

/** bandet kvar akse bur i: under dette er biten borte, over er han ikkje ein bit */
export const BIT_MIN = 0.05
export const BIT_MAX = 5

const tal = (v: number, d = 2) => String(+v.toFixed(d))
/** tre like tal er det eine talet strengen hadde før, og vert skrivne som det */
const skrivS = (s: Vec3) =>
  s[0] === s[1] && s[1] === s[2] ? tal(s[0], 3) : s.map((c) => tal(c, 3)).join(",")

/** laget står sist og berre når det finst, so ein streng utan lag er teikn
 *  for teikn den same strengen han alltid har vore */
export const skrivScene = (l: readonly Bit[]): string =>
  l
    .map((b) => `${b.id}@${b.t.map((c) => tal(c)).join(",")}/${skrivS(b.s)}/${tal(b.rz, 1)}${b.farge ? `/c:${b.farge}` : ""}`)
    .join(";")

/** Lesinga er den einaste vegen inn: alt som ikkje er ein bit fell på golvet. */
export function lesScene(s: unknown): Bit[] {
  const ut: Bit[] = []
  if (typeof s !== "string" || !s) return ut
  for (const del of s.split(";")) {
    if (ut.length >= SCENE_TAK) break
    // storleiken er anten eitt tal (som før) eller tre, eitt per akse;
    // laget står sist og treng ikkje stå
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

/** scena som høyrer til ei kjelde åleine, slik alt var før */
export const eiKjelde = (id: string): string => skrivScene([{ id, t: [0, 0, 0], s: [1, 1, 1], rz: 0 }])
