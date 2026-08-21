/**
 * VAFFEL — parameterrommet.
 *
 * Eitt uttak er eitt punkt her inne. Nettet, ribbene, ledda og kuttfilene
 * er alle funksjonar av desse nitten tala, og ingen annan fil held eit tal
 * som ikkje kjem herifrå.
 *
 * Djupna på ledda står ikkje her. Ho ER halve overlappet, og eit tal for
 * noko som alt er bestemt av geometrien er eit tal som kan kome i utakt med
 * henne. Det einaste som er eit val, er kvar i overlappet delinga ligg.
 */
import {
  clampBag,
  randomBag,
  type Group,
  type ParamBag,
  type Range,
} from "../core"

export type Params = {
  /** kva nett som vert snitta: «kube», eller namnet på ei importert fil */
  kjelde: string

  // --- FORM: kva som skjer med nettet før det vert snitta ----------------
  storleik: number // lengste side etter skalering, mm
  rotX: number // rotasjon kring X, grader
  rotY: number
  rotZ: number

  // --- NETT --------------------------------------------------------------
  glatt: number // glattingsrunder — Taubin, volumet står
  trekant: number // tak på tal trekantar, tusen

  // --- RIBBER ------------------------------------------------------------
  ribbX: number // ribber på tvers av X
  ribbY: number // ribber på tvers av Y
  tjukn: number // platetjukn, mm

  // --- LEDD ---------------------------------------------------------------
  klaring: number // sporet breiare enn plata, mm
  ledd: number // kvar i overlappet delinga ligg, 0,5 er halvt om halvt
  leddtype: number // 0 rett, 1 hundebein, 2 t-bein

  // --- KUTT ---------------------------------------------------------------
  fres: number // fresediameter, mm — null er laser
  snitt: number // snittbreidd, mm
  arkB: number // plata, mm
  arkH: number

  material: string
}

export const LEDDTYPAR = ["rett", "hundebein", "t-bein"] as const

export const PARAM_RANGES: Record<string, Range> = {
  storleik: { min: 40, max: 1200, step: 5, label: "storleik", unit: "mm" },
  rotX: { min: -180, max: 180, step: 1, label: "vend x", unit: "°" },
  rotY: { min: -180, max: 180, step: 1, label: "vend y", unit: "°" },
  rotZ: { min: -180, max: 180, step: 1, label: "vend z", unit: "°" },

  glatt: { min: 0, max: 24, step: 1, label: "glatting", int: true },
  trekant: { min: 0.5, max: 60, step: 0.5, label: "trekantar", unit: "k" },

  ribbX: { min: 1, max: 32, step: 1, label: "ribber langs x", int: true },
  ribbY: { min: 1, max: 32, step: 1, label: "ribber langs y", int: true },
  tjukn: { min: 1, max: 25, step: 0.1, label: "tjukn", unit: "mm" },

  klaring: { min: 0, max: 0.6, step: 0.01, label: "klaring", unit: "mm" },
  ledd: { min: 0.2, max: 0.8, step: 0.01, label: "leddeling" },
  leddtype: { min: 0, max: 2, step: 1, label: "leddform", int: true, names: LEDDTYPAR },

  fres: { min: 0, max: 12, step: 0.5, label: "fres", unit: "mm" },
  snitt: { min: 0, max: 6, step: 0.05, label: "snittbreidd", unit: "mm" },
  arkB: { min: 200, max: 3000, step: 10, label: "ark breidd", unit: "mm" },
  arkH: { min: 200, max: 2000, step: 10, label: "ark høgd", unit: "mm" },
}

export const GROUPS: readonly Group[] = [
  { id: "form", label: "form", keys: ["storleik", "rotX", "rotY", "rotZ"] },
  { id: "nett", label: "nett", keys: ["glatt", "trekant"] },
  { id: "ribber", label: "ribber", keys: ["ribbX", "ribbY", "tjukn"] },
  { id: "ledd", label: "ledd", keys: ["klaring", "ledd", "leddtype"] },
  { id: "kutt", label: "kutt", keys: ["fres", "snitt", "arkB", "arkH"] },
]

export const PARAM_KEYS = GROUPS.flatMap((g) => g.keys)

/**
 * Standarden er ein kube.
 *
 * Ikkje av di kuben er interessant, men av di han er det einaste objektet
 * som ikkje gøymer noko. Seks ribber kvar veg gjev seks og tretti ledd, alle
 * like, alle synlege — og ser du at kuben held seg sjølv oppe, veit du kva
 * reiskapen gjer før du har lasta opp noko som helst.
 */
export const DEFAULT_PARAMS: Params = {
  kjelde: "kube",

  storleik: 300,
  rotX: 0,
  rotY: 0,
  rotZ: 0,

  glatt: 0,
  trekant: 20,

  ribbX: 6,
  ribbY: 6,
  tjukn: 6,

  klaring: 0.15,
  ledd: 0.5,
  leddtype: 0,

  fres: 3,
  snitt: 0.2,
  arkB: 900,
  arkH: 600,

  material: "finer",
}

/** kva to fingrar på lerretet skrur på */
export const NUDGE_PARAMS = { vertical: "ribbY", horizontal: "ribbX" }

export function clampParams(o: unknown, prev: Params): Params {
  return clampBag(o, prev, PARAM_RANGES, PARAM_KEYS)
}

/**
 * Terningen rører ribber, tjukn og vending — ikkje kjelda, ikkje arket og
 * ikkje fresen. Eit kast som byter ut nettet ditt er ikkje eit kast, det er
 * eit tap; og eit kast som gjev deg ei plate du ikkje har, er eit kast som
 * ikkje kan skjerast.
 */
const KAST = ["storleik", "rotX", "rotY", "rotZ", "glatt", "ribbX", "ribbY", "tjukn", "ledd"]

export function randomParams(
  rnd: () => number,
  prev: Params,
  locked: ReadonlySet<string> = new Set(),
): Params {
  const q = randomBag(rnd, prev, PARAM_RANGES, KAST, locked)
  // Tjukna skal vera ei plate ein får kjøpt. Terningen får velje kva for
  // ei, men ikkje å finne opp ei ny.
  if (!locked.has("tjukn")) {
    const t = [3, 4, 6, 9, 12, 18]
    q.tjukn = t[Math.floor(rnd() * t.length)]
  }
  return q
}
