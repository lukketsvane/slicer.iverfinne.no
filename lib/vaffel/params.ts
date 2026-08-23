/**
 * VAFFEL — parameterrommet.
 *
 * Eitt uttak er eitt punkt her inne. Nettet, ribbene, ledda og kuttfilene
 * er alle funksjonar av desse tala, og ingen annan fil held eit tal som
 * ikkje kjem herifrå.
 *
 * Djupna på ledda står ikkje her. Ho ER halve overlappet, og eit tal for
 * noko som alt er bestemt av geometrien er eit tal som kan kome i utakt med
 * henne. Det einaste som er eit val, er kvar i overlappet delinga ligg.
 */
import { clampBag, type Group, type ParamBag, type Range } from "../core"

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
  lause: number // 0 tek med stykke utan ledd, 1 kastar dei

  // --- LEDD ---------------------------------------------------------------
  klaring: number // sporet breiare enn plata, mm
  ledd: number // kvar i overlappet delinga ligg, 0,5 er halvt om halvt

  // --- KUTT ---------------------------------------------------------------
  snitt: number // snittbreidd, mm
  snittveg: number // 0 kompenserer i fila, 1 lèt maskina gjera det
  fart: number // kuttfart, mm/s — berre til tidsoverslaget
  arkB: number // plata, mm
  arkH: number

  material: string
}

/**
 * Kven som tek snittbreidda.
 *
 * Ho må takast NØYAKTIG éin gong. Tek både fila og maskina henne, vert
 * kvart spor ei snittbreidd for vidt, og eit rutenett med spor som er ei
 * snittbreidd for vide held seg ikkje sjølv. Tek ingen henne, er delane
 * ei snittbreidd for små og ingenting sit fast.
 *
 * Standarden er fila, av di dei fleste som har ein laser i kjellaren
 * ikkje har ein CAM-pakke som kan setje verktøyoffset. Har du sett
 * offset i LightBurn, står valet her.
 */
export const SNITTVEGAR = ["i fila", "i maskina"] as const

/**
 * Kva som skjer med eit stykke som ikkje heng i eit einaste ledd.
 *
 * Ei ribbe kan vera delt, og eit av stykka kan liggje der kroppen er
 * tynnare enn luka mellom ribbene: øyretippen på ein hest, ein bit av ein
 * hov. Ingen ribbe frå den andre familien møter han, so han er ei laus
 * plate. Han står i kuttlista, tek plass på plata, og ligg att i eska.
 *
 * Standarden kastar dei. Talet står framleis i panelet, so du ser kva du
 * mista — men du får ikkje ei fil full av flis du ikkje bad om.
 */
export const LAUSE = ["ta med", "kast"] as const

/**
 * ETIKETTANE STÅR UNDER SI EIGA OVERSKRIFT.
 *
 * Skyvarane er grupperte, og gruppa har namnet sitt over seg. Ein skyvar
 * som heiter «ribber langs x» under overskrifta «RIBBER» seier ordet to
 * gonger, og det andre er berre lengd: på ein telefon braut det etiketten
 * over to liner og gjorde rada halvanna gong so høg. Difor «langs x».
 */
export const PARAM_RANGES: Record<string, Range> = {
  storleik: { min: 40, max: 1200, step: 5, label: "storleik", unit: "mm" },
  rotX: { min: -180, max: 180, step: 1, label: "vend x", unit: "°" },
  rotY: { min: -180, max: 180, step: 1, label: "vend y", unit: "°" },
  rotZ: { min: -180, max: 180, step: 1, label: "vend z", unit: "°" },

  glatt: { min: 0, max: 24, step: 1, label: "glatting", int: true },
  trekant: { min: 0.5, max: 60, step: 0.5, label: "tak", unit: "k" },

  ribbX: { min: 1, max: 32, step: 1, label: "langs x", int: true },
  ribbY: { min: 1, max: 32, step: 1, label: "langs y", int: true },
  tjukn: { min: 1, max: 25, step: 0.1, label: "tjukn", unit: "mm" },
  lause: { min: 0, max: 1, step: 1, label: "lause", int: true, names: LAUSE },

  klaring: { min: 0, max: 0.6, step: 0.01, label: "klaring", unit: "mm" },
  ledd: { min: 0.2, max: 0.8, step: 0.01, label: "deling" },

  snitt: { min: 0, max: 6, step: 0.05, label: "snitt", unit: "mm" },
  snittveg: { min: 0, max: 1, step: 1, label: "snittveg", int: true, names: SNITTVEGAR },
  fart: { min: 1, max: 200, step: 1, label: "fart", unit: "mm/s", int: true },
  arkB: { min: 200, max: 3000, step: 10, label: "breidd", unit: "mm" },
  arkH: { min: 200, max: 2000, step: 10, label: "høgd", unit: "mm" },
}

export const GROUPS: readonly Group[] = [
  { id: "form", label: "form", keys: ["storleik", "rotX", "rotY", "rotZ"] },
  { id: "nett", label: "nett", keys: ["glatt", "trekant"] },
  { id: "ribber", label: "ribber", keys: ["ribbX", "ribbY", "tjukn", "lause"] },
  { id: "ledd", label: "ledd", keys: ["klaring", "ledd"] },
  { id: "kutt", label: "kutt", keys: ["snitt", "snittveg", "fart"] },
  { id: "plate", label: "plate", keys: ["arkB", "arkH"] },
]

export const PARAM_KEYS = GROUPS.flatMap((g) => g.keys)

/** alt eit uttak er ein funksjon av, tal og namn */
export const ALLE_KEYS: readonly string[] = [...PARAM_KEYS, "kjelde", "material"]

/**
 * NØKLANE EIT MELLOMBYGG KAN HUGSAST PÅ.
 *
 * Eit hugsa bygg som er nøkla på for få parametrar er den verste feilen
 * denne koden kan gjere: skyvaren rører seg, talet i panelet står stille,
 * og ingenting feilar. Det har hendt to gonger her.
 *
 * Difor er lista snudd. Ho seier kva som IKKJE tel, og alt anna tel. Ein
 * ny parameter hamnar automatisk i nøkkelen, og verste utfallet er at eit
 * bygg vert rekna ein gong for mykje — ikkje at det står att eit svar frå
 * eit anna punkt i parameterrommet.
 */
const BERRE_UTTAK = ["snitt", "snittveg", "fart"] as const
const BERRE_ARK = ["arkB", "arkH", "material"] as const

/**
 * Kva eit hugsa RUTENETT har lov til å vita om.
 *
 * Rutenettet vert hugsa på ein nøkkel som ikkje inneheld plata eller
 * materialet, av di dei ikkje rører geometrien. Men rutenettet ber med
 * seg parametrane det vart bygd med, og les nokon materialet DERIFRÅ, får
 * han materialet frå det fyrste bygget: massen i panelet fraus på papp og
 * stod der same kva du valde etterpå. Det stod der i ein halvtime.
 *
 * Difor er typen skoren ned til nett dei nøklane som ligg i nøkkelen.
 * Å lesa `material` av eit rutenett er no ein typefeil, og ikkje ein feil
 * nokon oppdagar på plata.
 */
export type NettParams = Omit<
  Params,
  (typeof BERRE_UTTAK)[number] | (typeof BERRE_ARK)[number]
>

const nokkel = (p: ParamBag, keys: readonly string[], cells: number) =>
  cells + "|" + keys.map((k) => p[k]).join("|")

const utan = (drop: readonly string[]) => {
  const s = new Set<string>(drop)
  return ALLE_KEYS.filter((k) => !s.has(k))
}

/** planen: ribber, delar og pakking. Alt utanom det som berre er uttak. */
export const planKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan(BERRE_UTTAK), cells)

/** rutenettet: som planen, men plata og materialet rører det ikkje. Han
 *  vert hugsa per kropp, so kroppsparametrane ligg alt i kroppen. */
export const gridKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan([...BERRE_UTTAK, ...BERRE_ARK]), cells)

/**
 * Standarden er ein kube i tre millimeter MDF, på ei plate på 800 × 600.
 *
 * Kuben er ikkje interessant. Han er det einaste objektet som ikkje gøymer
 * noko: seks ribber kvar veg gjev seks og tretti ledd, alle like, alle
 * synlege — og ser du at kuben held seg sjølv oppe, veit du kva reiskapen
 * gjer før du har lasta opp noko som helst.
 *
 * Resten er den maskina folk faktisk står ved. Tre millimeter MDF er det
 * som ligg i hylla på eit makerspace, og 800 × 600 er bordet på ein
 * vanleg CO2-laser. Set du inn dine eigne tal, står dei i lenkja.
 */
export const DEFAULT_PARAMS: Params = {
  kjelde: "kube",

  storleik: 150,
  rotX: 0,
  rotY: 0,
  rotZ: 0,

  glatt: 0,
  trekant: 20,

  ribbX: 6,
  ribbY: 6,
  tjukn: 3,
  lause: 1,

  klaring: 0.15,
  ledd: 0.5,

  snitt: 0.2,
  snittveg: 0,
  fart: 20,
  arkB: 800,
  arkH: 600,

  material: "mdf",
}

/** kva to fingrar på lerretet skrur på */
export const NUDGE_PARAMS = { vertical: "ribbY", horizontal: "ribbX" }

export function clampParams(o: unknown, prev: Params): Params {
  return clampBag(o, prev, PARAM_RANGES, PARAM_KEYS)
}
