/**
 * SLICERMAN — parameterrommet.
 *
 * Eitt uttak er eitt punkt her inne. Nettet, plana, ledda og kuttfilene er
 * alle funksjonar av desse tala, og ingen annan fil held eit tal som ikkje
 * kjem herifrå.
 *
 * Djupna på ledda står ikkje her. Ho ER halve overlappet, og eit tal for
 * noko som alt er bestemt av geometrien er eit tal som kan kome i utakt med
 * henne. Det einaste som er eit val, er kvar i overlappet delinga ligg.
 *
 * Det som heller ikkje står her lenger: kor mange ribber. Ribbene var to
 * tal, og alt anna fylgde av nettet — raskt å få NOKO, umogleg å få DETTE.
 * No er dei ei liste over plan du har halde på, og lista står i `plan`.
 */
import { clampBag, type Group, type ParamBag, type Range } from "./core"
import type { Fest } from "./pack"
import { reinPlan } from "./plan"
import { reinScene } from "./scene"

export type Params = {
  /** hovudkjelda: «kube», eller namnet på ei importert fil. Namnet i pilla,
   *  stamma i filnamna. Sjølve kroppen står i `scene`. */
  kjelde: string
  /** kroppen som ei liste av bitar — sjå `lib/scene.ts`. Tom tyder kjelda åleine. */
  scene: string

  // --- FORM: kva som skjer med nettet før det vert snitta ----------------
  storleik: number // lengste side etter skalering, mm
  rotX: number // rotasjon kring X, grader
  rotY: number
  rotZ: number

  // --- NETT --------------------------------------------------------------
  glatt: number // glattingsrunder — Taubin, volumet står
  trekant: number // tak på tal trekantar, tusen

  // --- FORENKLING ---------------------------------------------------------
  /** kor langt kuttet får vike frå den sanne profilen, mm */
  forenkl: number
  /** minste hòl som er verdt å skjere, som TVERRMÅL i mm */
  hol: number

  // --- DELAR --------------------------------------------------------------
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

  /**
   * PLANA, SOM EIN STRENG. Sjå `lib/plan.ts`.
   *
   * Kvart plan du har låst: namn, punkt og normal i kroppen sitt rom, og
   * dei streka du har teikna i det. Rekkjefylgja er rekkjefylgja du låste
   * dei i, og det er òg monteringsrekkjefylgja til det du byter henne.
   */
  plan: string

  /**
   * FESTE DELAR: KVAR EIN DEL STÅR PÅ PLATA, NÅR HANDA HAR SAGT DET.
   *
   * «3a:0,0,12.5,340» — adresse, plate, kvartsving, og hjørnet i
   * millimeter. Pakkinga legg delane der ho vil, og det er rett heilt til
   * nokon har ei meining; ein festa del vert lagd ned FØR dei andre, og
   * resten pakkar seg kring han.
   *
   * Adressa og ikkje plassen i lista: eit plan til eller eit plan færre
   * flyttar kvar einaste indeks, og eit feste som peika på indeks fire
   * ville fylgt med til ein annan del. «3» er «3» so lenge planet finst.
   */
  fest: string
}

/**
 * Kven som tek snittbreidda.
 *
 * Ho må takast NØYAKTIG éin gong. Tek både fila og maskina henne, vert
 * kvart spor ei snittbreidd for vidt, og eit bygg med spor som er ei
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
 * Eit plan kan vera delt, og eit av stykka kan liggje der ingen andre plan
 * møter det: øyretippen på ein hest, ein bit av ein hov. Han er ei laus
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
 * som seier ordet i overskrifta om att er berre lengd: på ein telefon
 * braut det etiketten over to liner og gjorde rada halvanna gong so høg.
 */
export const PARAM_RANGES: Record<string, Range> = {
  storleik: { min: 40, max: 1200, step: 5, label: "storleik", unit: "mm" },
  rotX: { min: -180, max: 180, step: 1, label: "vend x", unit: "°" },
  rotY: { min: -180, max: 180, step: 1, label: "vend y", unit: "°" },
  rotZ: { min: -180, max: 180, step: 1, label: "vend z", unit: "°" },

  glatt: { min: 0, max: 24, step: 1, label: "glatting", int: true },
  trekant: { min: 0.5, max: 60, step: 0.5, label: "tak", unit: "k" },

  forenkl: { min: 0, max: 2, step: 0.05, label: "toleranse", unit: "mm" },
  hol: { min: 0, max: 80, step: 1, label: "minste hòl", unit: "mm" },

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
  { id: "delar", label: "delar", keys: ["tjukn", "lause"] },
  { id: "forenkling", label: "forenkling", keys: ["forenkl", "hol"] },
  { id: "ledd", label: "ledd", keys: ["klaring", "ledd"] },
  { id: "kutt", label: "kutt", keys: ["snitt", "snittveg", "fart"] },
  { id: "plate", label: "plate", keys: ["arkB", "arkH"] },
]

export const PARAM_KEYS = GROUPS.flatMap((g) => g.keys)

/** alt eit uttak er ein funksjon av, tal og namn */
export const ALLE_KEYS: readonly string[] = [...PARAM_KEYS, "kjelde", "scene", "material", "plan", "fest"]

/** Fleire feste enn dette er ikkje ei plate, det er ei lenkje som prøver seg. */
const FEST_TAK = 128
/** Ingen plate er større enn dette, so ingen del står lenger ute heller. */
const FEST_MM = 5000

/**
 * FESTA DELAR, LESE UT AV EIN STRENG.
 *
 * «3:0,0,12.5,340;7a:1,2,100,50» — adresse, plate, kvartsving, hjørne.
 * Same vegen inn som plana: alt som ikkje er eit gyldig feste fell på
 * golvet i staden for å nå pakkinga.
 */
export function lesFest(s: unknown): Map<string, Fest> {
  const ut = new Map<string, Fest>()
  if (typeof s !== "string" || !s) return ut
  for (const bit of s.split(";")) {
    if (ut.size >= FEST_TAK) break
    const m = /^(\d{1,5}[a-z]{0,3}):(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(bit)
    if (!m) continue
    const sheet = Number(m[2])
    const rot = Number(m[3])
    const x = Number(m[4])
    const y = Number(m[5])
    if (!Number.isInteger(sheet) || sheet < 0 || sheet > 255) continue
    if (!Number.isInteger(rot) || rot < 0 || rot > 3) continue
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= FEST_MM)) continue
    ut.set(m[1], { sheet, rot: rot as 0 | 1 | 2 | 3, x: +x.toFixed(2), y: +y.toFixed(2) })
  }
  return ut
}

export const skrivFest = (m: ReadonlyMap<string, Fest>): string =>
  [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "nn", { numeric: true }))
    .map(([adr, f]) => `${adr}:${f.sheet},${f.rot},${f.x},${f.y}`)
    .join(";")

export const reinFest = (s: unknown) => skrivFest(lesFest(s))

/**
 * NØKLANE EIT MELLOMBYGG KAN HUGSAST PÅ.
 *
 * Eit hugsa bygg som er nøkla på for få parametrar er den verste feilen
 * denne koden kan gjere: skyvaren rører seg, talet i panelet står stille,
 * og ingenting feilar. Det har hendt to gonger.
 *
 * Difor er lista snudd. Ho seier kva som IKKJE tel, og alt anna tel. Ein
 * ny parameter hamnar automatisk i nøkkelen, og verste utfallet er at eit
 * bygg vert rekna ein gong for mykje — ikkje at det står att eit svar frå
 * eit anna punkt i parameterrommet.
 */
/** Det som berre er FILA: korleis kuttet vert skrive, ikkje kva som vert
 *  skore. Kven som kompenserer for snittet, og kor fort maskina går. */
const BERRE_FIL = ["snittveg", "fart"] as const
const BERRE_ARK = ["arkB", "arkH", "material"] as const
/**
 * Snittbreidda rører ikkje snittet — plana står der dei står same kor brei
 * stråla er. Men ho rører PAKKINGA: luka mellom delane er `max(4, 2·snitt
 * + 2)`, av di to kutt inntil kvarandre et kvar si halve snittbreidd av
 * godset imellom. Difor: ute av snittnøkkelen, men INNE i byggnøkkelen.
 */
const UTANFOR_SNITTET = ["snitt", "fest", ...BERRE_FIL] as const

/**
 * Kva eit hugsa SNITT har lov til å vita om.
 *
 * Snittet vert hugsa på ein nøkkel som ikkje inneheld plata eller
 * materialet, av di dei ikkje rører geometrien. Les nokon materialet frå
 * eit hugsa snitt, får han materialet frå det fyrste bygget: massen i
 * panelet fraus på papp og stod der same kva du valde etterpå. Difor er
 * typen skoren ned til nett dei nøklane som ligg i nøkkelen.
 */
export type NettParams = Omit<
  Params,
  (typeof UTANFOR_SNITTET)[number] | (typeof BERRE_ARK)[number]
>

const nokkel = (p: ParamBag, keys: readonly string[], cells: number) =>
  cells + "|" + keys.map((k) => p[k]).join("|")

const utan = (drop: readonly string[]) => {
  const s = new Set<string>(drop)
  return ALLE_KEYS.filter((k) => !s.has(k))
}

/** bygget: plan, delar og PAKKING. Alt utanom det som berre er fila. */
export const byggKey = (p: ParamBag, cells: number) => nokkel(p, utan(BERRE_FIL), cells)

/** snittet: som bygget, men plata og materialet rører det ikkje. Det vert
 *  hugsa per kropp, so kroppsparametrane ligg alt i kroppen. */
export const snittKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan([...UTANFOR_SNITTET, ...BERRE_ARK]), cells)

/**
 * Standarden er ein kube i tre millimeter MDF, på ei plate på 600 × 400,
 * og INGEN PLAN.
 *
 * Reiskapen opnar tom med vilje. Eit rutenett som alt låg der var eit svar
 * på eit spørsmål ingen hadde stilt: du såg tolv ribber du ikkje valde, og
 * det fyrste du gjorde var å skjøne kva dei var. No ligg kroppen der som
 * eit skal, skissa står gjennom han, og det fyrste du gjer er å skjere.
 * Vil du ha rutenettet, ligg det eit trykk unna under framlegga.
 *
 * Resten er den maskina folk faktisk står ved. Tre millimeter MDF er det
 * som ligg i hylla på eit makerspace, og 600 × 400 er bordet på den
 * vanlege CO2-laseren — «6040» heiter han i katalogen.
 *
 * Trekanttaket er FØRTI tusen og ikkje tjue. Tjue tusen er nok til å måle
 * ein kropp med, men ikkje til å sjå på: ein skanna eller modellert figur
 * kjem ut med fasettar du kan telje, og det fyrste brukaren gjer er å tru
 * at det er reiskapen som er grov. Kostnaden er lita — snittinga spør
 * strålestrukturen og ikkje kvar trekant — og skyvaren går framleis frå ein
 * halv til seksti.
 */
export const DEFAULT_PARAMS: Params = {
  kjelde: "kube",
  scene: "",

  storleik: 150,
  rotX: 0,
  rotY: 0,
  rotZ: 0,

  glatt: 0,
  trekant: 40,

  forenkl: 0,
  hol: 0,

  tjukn: 3,
  lause: 1,

  klaring: 0.15,
  ledd: 0.5,

  snitt: 0.2,
  snittveg: 0,
  fart: 20,
  arkB: 600,
  arkH: 400,

  material: "mdf",
  plan: "",
  fest: "",
}

export function clampParams(o: unknown, prev: Params): Params {
  const ut = clampBag(o, prev, PARAM_RANGES, PARAM_KEYS)
  // `clampBag` kjenner tal, materialet og kjelda. Plana og festa er våre
  // eigne — `lib/core.ts` veit ikkje kva eit plan er, og skal ikkje lære
  // det for å sleppe ein streng gjennom.
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>
    if (typeof rec.plan === "string") ut.plan = reinPlan(rec.plan)
    if (typeof rec.fest === "string") ut.fest = reinFest(rec.fest)
    if (typeof rec.scene === "string") ut.scene = reinScene(rec.scene)
  }
  return ut
}
