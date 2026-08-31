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
import type { Fest } from "../pack"

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

  /**
   * LÅSTE RIBBER, SOM EIN STRENG.
   *
   * «x:0.125,0.375;y:0.5» — kvar låst ribbe som ein BRØKDEL av spennet og
   * ikkje som millimeter. Brøken overlever at objektet vert skalert: låser
   * du ribba midt på ein hund og dreg storleiken frå 80 til 300 mm, står
   * ho framleis midt på hunden. Millimeter ville stått stille medan hunden
   * voks frå dei.
   *
   * Ein STRENG i parameterposen, og ikkje ein tilstand ved sida av. Alt
   * reiskapen alt kan med parametrar gjeld då òg låsane, utan ei einaste
   * ny line: angre er ein parameterpose, lenkja er ein parameterpose,
   * prosjektfila og økta er parameterposar, og nøklane som hugsar
   * mellombygg er bygde av dei. Ein tilstand ved sida av måtte hatt alle
   * seks på nytt, og kvar av dei er ein stad han kunne kome i utakt.
   */
  laas: string

  /**
   * FESTE DELAR: KVAR EIN DEL STÅR PÅ PLATA, NÅR HANDA HAR SAGT DET.
   *
   * «X1:0,0,12.5,340» — adresse, plate, kvartsving, og hjørnet i
   * millimeter. Pakkinga legg delane der ho vil, og det er rett heilt til
   * nokon har ei meining; ein festa del vert lagd ned FØR dei andre, og
   * resten pakkar seg kring han.
   *
   * Adressa og ikkje plassen i lista: ei ribbe til eller ein ribbe færre
   * flyttar kvar einaste indeks, og eit feste som peika på indeks fire
   * ville fylgt med til ein annan del. «X1» er «X1» so lenge ribba finst.
   */
  fest: string
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
export const ALLE_KEYS: readonly string[] = [...PARAM_KEYS, "kjelde", "material", "laas", "fest"]

/**
 * LÅSANE: LESING, SKRIVING OG REINSING.
 *
 * `laas` kjem frå ei lenkje, og ei lenkje er skriven av kven som helst.
 * Difor er lesinga den einaste vegen inn: ho tek imot kva som helst og
 * gjev alltid ei gyldig liste — feil akse, tal utanfor bandet, NaN og
 * tusen oppføringar fell alle på golvet i staden for å nå geometrien.
 */
export type Laas = { x: number[]; y: number[] }

/** Fleire enn dette er ikkje ein lås, det er ei lenkje som prøver seg. */
const LAAS_TAK = 64

export function lesLaas(s: unknown): Laas {
  const ut: Laas = { x: [], y: [] }
  if (typeof s !== "string" || !s) return ut
  for (const bit of s.split(";")) {
    const m = /^([xy]):(.*)$/.exec(bit)
    if (!m) continue
    const akse = m[1] as "x" | "y"
    for (const del of m[2].split(",")) {
      if (ut[akse].length >= LAAS_TAK) break
      const v = Number(del)
      // Kanten tel ikkje: ei ribbe på 0 eller 1 er ei ribbe med null
      // breidd, og ho ville stå i kuttlista utan å bera noko.
      if (!Number.isFinite(v) || v <= 0 || v >= 1) continue
      ut[akse].push(+v.toFixed(4))
    }
    ut[akse] = [...new Set(ut[akse])].sort((a, b) => a - b)
  }
  return ut
}

export const skrivLaas = (l: Laas): string =>
  (["x", "y"] as const)
    .filter((a) => l[a].length)
    .map((a) => `${a}:${l[a].join(",")}`)
    .join(";")

/** ein streng inn, den same lista ut i normalform */
export const reinLaas = (s: unknown) => skrivLaas(lesLaas(s))

/** Fleire feste enn dette er ikkje ei plate, det er ei lenkje som prøver seg. */
const FEST_TAK = 128
/** Ingen plate er større enn dette, so ingen del står lenger ute heller. */
const FEST_MM = 5000

/**
 * FESTA DELAR, LESE UT AV EIN STRENG.
 *
 * «X1:0,0,12.5,340;Y3a:1,2,100,50» — adresse, plate, kvartsving, hjørne.
 * Same vegen inn som låsane: alt som ikkje er eit gyldig feste fell på
 * golvet i staden for å nå pakkinga.
 */
export function lesFest(s: unknown): Map<string, Fest> {
  const ut = new Map<string, Fest>()
  if (typeof s !== "string" || !s) return ut
  for (const bit of s.split(";")) {
    if (ut.size >= FEST_TAK) break
    const m = /^([XY]\d{1,3}[a-z]{0,3}):(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(bit)
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

/** Fleire ribber enn skyvaren sitt eige tak har reiskapen aldri lova å
 *  handtere, og ei låseliste er ikkje ein veg utanom det. */
const RIBB_TAK = 32

/**
 * KVAR RIBBENE STÅR, SOM BRØKDELAR AV SPENNET.
 *
 * Ribbene var eit TAL: seks ribber tydde seks jamt fordelte plan, rekna av
 * `vidd / ribbX`. Eit tal har ingen ribber i seg — det finst ingenting å
 * peike på, låse eller flytte — og difor kunne ingen byggje ein stabel for
 * hand. No er dei ei LISTE, og talet er berre kor mange av dei som er frie.
 *
 * Ei låst ribbe tek den jamne plassen ho ligg nærast, og dei frie fordeler
 * seg kring henne. Det er skilnaden på ein lås og ei handskriven liste:
 * skyvaren held fram med å tyde noko. Dreg du han frå seks til ti, kjem det
 * fire nye ribber imellom dei du har låst — dei låste rikkar seg ikkje, og
 * du treng ikkje plassere dei ni andre for hand for å få lov til å halde på
 * den eine.
 *
 * Er ingen ting låst, er svaret nøyaktig den jamne fordelinga som stod her
 * før: (i + ½) / n, den same rekninga, det same objektet.
 */
export function plasser(tal: number, laast: readonly number[]): number[] {
  const n = Math.max(1, Math.round(tal))
  const jamt = Array.from({ length: n }, (_, i) => (i + 0.5) / n)
  const fast = laast.slice(0, RIBB_TAK)
  if (!fast.length) return jamt

  const teken = new Array<boolean>(n).fill(false)
  for (const t of fast) {
    let best = -1
    let av = Infinity
    for (let i = 0; i < n; i++) {
      if (teken[i]) continue
      const d = Math.abs(jamt[i] - t)
      if (d < av) {
        av = d
        best = i
      }
    }
    if (best >= 0) teken[best] = true
  }
  const ut = [...fast]
  for (let i = 0; i < n; i++) if (!teken[i]) ut.push(jamt[i])
  return [...new Set(ut)].sort((a, b) => a - b).slice(0, RIBB_TAK)
}

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
/**
 * Det som berre er FILA: korleis kuttet vert skrive, ikkje kva som vert
 * skore. Kven som kompenserer for snittet, og kor fort maskina går.
 */
const BERRE_FIL = ["snittveg", "fart"] as const
const BERRE_ARK = ["arkB", "arkH", "material"] as const
/**
 * SNITTET STOD HER, OG DET HØYRDE IKKJE HEIME.
 *
 * Snittbreidda rører ikkje rutenettet: ribbene står der dei står same kor
 * brei stråla er. Men ho rører PAKKINGA — luka mellom delane er
 * `max(4, 2·snitt + 2)`, av di to kutt som ligg inntil kvarandre et kvar
 * si halve snittbreidd av godset imellom.
 *
 * Med snittet ute av plannøkkelen fekk ein ny snittbreidd servert den
 * gamle pakkinga: målt på ein kube i 420 mm med åtte ribber kvar veg gjekk
 * luka frå 4 til 14 mm utan at platetalet eller utnyttinga rørte seg — og
 * uttaket la delane like tett som før. Det er nett den kollisjonen luka
 * finst for å hindre.
 *
 * Difor: ute av rutenettnøkkelen, men INNE i plannøkkelen.
 */
const UTANFOR_NETTET = ["snitt", "fest", ...BERRE_FIL] as const

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
  (typeof UTANFOR_NETTET)[number] | (typeof BERRE_ARK)[number]
>

const nokkel = (p: ParamBag, keys: readonly string[], cells: number) =>
  cells + "|" + keys.map((k) => p[k]).join("|")

const utan = (drop: readonly string[]) => {
  const s = new Set<string>(drop)
  return ALLE_KEYS.filter((k) => !s.has(k))
}

/** planen: ribber, delar og PAKKING. Alt utanom det som berre er fila. */
export const planKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan(BERRE_FIL), cells)

/** rutenettet: som planen, men plata og materialet rører det ikkje. Han
 *  vert hugsa per kropp, so kroppsparametrane ligg alt i kroppen. */
export const gridKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan([...UTANFOR_NETTET, ...BERRE_ARK]), cells)

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
  laas: "",
  fest: "",
}

/** kva to fingrar på lerretet skrur på */
export const NUDGE_PARAMS = { vertical: "ribbY", horizontal: "ribbX" }

export function clampParams(o: unknown, prev: Params): Params {
  const ut = clampBag(o, prev, PARAM_RANGES, PARAM_KEYS)
  // `clampBag` kjenner tal, materialet og kjelda. Låsane er vaffelen sine
  // eigne — `lib/core.ts` veit ikkje kva ei ribbe er, og skal ikkje lære
  // det for å sleppe ein streng gjennom.
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>
    if (typeof rec.laas === "string") ut.laas = reinLaas(rec.laas)
    if (typeof rec.fest === "string") ut.fest = reinFest(rec.fest)
  }
  return ut
}
