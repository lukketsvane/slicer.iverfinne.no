/**
 * SLICERMAN — kontrakten.
 *
 * Reiskapen gjer éin ting: han tek eit tredimensjonalt nett og gjev deg
 * flate delar du kan skjere ut på laser eller fres, og som held seg sjølve
 * saman når du set dei i hop. Ingen dyr programvare, ingen lisens, ingen
 * eksportdialog i tolv steg.
 *
 * Denne fila er det alt anna les frå: kva ein parameter er, kva eit måltal
 * er, kva ein regel er, og geometrien som både snittinga, målinga og
 * kuttfilene deler. Ho kjenner korkje vaffel, kube eller STL.
 *
 * Aksar: X og Y er planet, Z er opp. Alt i millimeter, vinklar i grader ut
 * mot skyvaren.
 */

export type Pt = [number, number]
export type Vec3 = [number, number, number]

// =============================================================================
// MATERIALE
// =============================================================================
export type Material = "finer" | "mdf" | "akryl" | "papp"

export const MATERIALS: Record<
  Material,
  { label: string; rho: number; hex: string }
> = {
  // rho i kg/m³ — det er han massen vert rekna av
  finer: { label: "kryssfinér", rho: 680, hex: "#e9dcc0" },
  mdf: { label: "mdf", rho: 750, hex: "#c9a889" },
  akryl: { label: "akryl", rho: 1190, hex: "#dfe7ea" },
  papp: { label: "papp", rho: 220, hex: "#d8c9ac" },
}

/** Platetjukner ein faktisk får kjøpt. Skyvaren er fri — ei plate kan vera
 *  5,8 mm om ho er det — men desse er dei ein finn på lager, og difor er
 *  dei knappar og ikkje eit tal ein må treffe. */
/**
 * Platene som står som knappar i panelet.
 *
 * Ikkje alle platene som finst: dei ein laser skjer. Ni, tolv og atten
 * millimeter er plater ein fres tek og ein CO2-laser ikkje, og åtte
 * knappar braut rada i to på ein telefon for tre val ingen bruker her.
 * Skyvaren går framleis frå éin til fem og tjue.
 */
export const TJUKNER = [2, 2.5, 3, 4, 6] as const

/**
 * Minste stykke som er ein DEL, mm².
 *
 * Under fire kvadratcentimeter er det ein flis: fresen slit han laus,
 * laseren slepp han ned i bordet, og ingen finn han att i eska. Talet står
 * her og ikkje i kuttlista, av di rutenettet må bruke det same: eit stykke
 * som ikkje kjem i fila, skal ikkje stå i biletet heller.
 */
export const MIN_AREA = 400

// =============================================================================
// PARAMETERROM
// =============================================================================
export type Range = {
  min: number
  max: number
  step: number
  label: string
  unit?: string
  int?: boolean
  /** namn i staden for tal: eit val og ikkje ei mengd */
  names?: readonly string[]
}

export type Group = { id: string; label: string; keys: readonly string[] }

/** Ein parametersats slik grensesnittet ser han: tal, pluss dei få nøklane
 *  som er namn — materialet og kjelda. */
export type ParamBag = Record<string, number | string>

/**
 * EIT TAL INN I EIT BAND — REGELEN, EIN STAD.
 *
 * Ein skyvar kan ikkje gå utanfor bandet sitt, men eit talfelt kan, og ei
 * URL-hash kan kva som helst. Difor vert kvart tal klemt inn i sitt eige
 * band før det får røre noko.
 *
 * Fire desimalar er taket. Det er ikkje pynt: eit flyttal etter ei klemming
 * ber gjerne på 0,30000000000000004, og eit slikt tal i ein memo-nøkkel er
 * ein nøkkel som aldri treffer seg sjølv.
 *
 * `clamp1` gjev NaN når talet ikkje er eit tal — den som les ei lenkje vil
 * VITE at feltet var tull, so han kan la det gamle stå. `snap` gjev botnen
 * i staden, av di eit felt i grensesnittet må ende opp med ein verdi. Same
 * regel, to svar på det eine spørsmålet dei er usamde om. Dei stod som to
 * kopiar i kvar sin fil, og ein kopi som er nesten lik er ein kopi som
 * driv.
 */
const clamp1 = (v: number, r: Range) => {
  if (!Number.isFinite(v)) return NaN
  const c = Math.min(r.max, Math.max(r.min, v))
  return r.int ? Math.round(c) : +c.toFixed(4)
}

export const snap = (v: number, r: Range) => {
  const c = clamp1(v, r)
  return Number.isFinite(c) ? c : r.min
}

/** «1,5» er eit tal for eit menneske og NaN for Number() */
export const lesTal = (raw: string) => Number(String(raw).replace(",", ".").replace(/\s+/g, ""))

/** kor mange desimalar steget til ein skyvar treng */
export const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3)

/**
 * TALET SLIK DET ER, IKKJE SLIK SKYVAREN VILLE SKRIVE DET.
 *
 * Steget er skyvaren si oppløysing, ikkje verdien si. Talfeltet finst nett
 * for å koma forbi steget: den som har målt plata si til 2,87 med
 * skyvelære skal kunne skrive 2,87, av di klaringa i kvart einaste spor
 * kjem av det talet — og passprøva er laga for å måle til ein tjuedels
 * millimeter.
 *
 * Men feltet skreiv talet med STEGET si oppløysing. 2,87 stod som «2,9»
 * medan motoren rekna med 2,87, og oppsettet i verktykassa skreiv 2.87 —
 * to visningar av det same talet som ikkje var samde.
 *
 * Og verre: feltet legg det som STÅR der inn i utkastet når det vert teke.
 * Eit klikk i feltet og eit klikk ut att las difor «2,9» og skreiv 2,9. Ei
 * måling gjekk tapt av å bli sedd på.
 *
 * So steget er eit MINSTE tal desimalar og ikkje eit største. Fire er
 * taket, av di klemminga ikkje held fleire.
 */
export const feltTal = (v: number, step: number) => {
  for (let d = decimals(step); d < 4; d++) if (+v.toFixed(d) === v) return v.toFixed(d)
  return v.toFixed(4)
}

/**
 * URL-hashen er ikkje til å stole på. Kvart felt vert lese for seg, klemt
 * inn i sitt eige band, og alt som ikkje er eit tal fell tilbake til det som
 * stod frå før — inga laga lenkje kan skyve NaN inn i snittinga.
 */
export function clampBag<P extends ParamBag>(
  o: unknown,
  prev: P,
  ranges: Record<string, Range>,
  keys: readonly string[],
): P {
  if (!o || typeof o !== "object") return prev
  const rec = o as Record<string, unknown>
  const out = { ...prev } as Record<string, number | string>
  for (const k of keys) {
    const raw = rec[k]
    if (typeof raw !== "number") continue
    const v = clamp1(raw, ranges[k])
    if (Number.isFinite(v)) out[k] = v
  }
  if (typeof rec.material === "string" && rec.material in MATERIALS) {
    out.material = rec.material
  }
  // Kjelda er eit lause-handtak til eit nett som ligg i arbeidaren. Ei
  // lenkje kan ikkje bera nettet, so ho ber berre namnet — og eit namn
  // arbeidaren ikkje kjenner fell tilbake til kuben når han vert bygd.
  if (typeof rec.kjelde === "string" && /^[a-z0-9_-]{1,40}$/i.test(rec.kjelde)) {
    out.kjelde = rec.kjelde
  }
  return out as P
}

/** Norsk desimalskiljeteikn. Eit tal med punktum i ein norsk tabell les som
 *  eit tal henta frå eit anna dokument. */
export const nn = (v: number, d = 0) =>
  Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–"

/** Sekund som klokke. «1520 s» er eit tal ein må rekne om for å kjenne att;
 *  «25:20» er den same opplysninga i det formatet ein alt les tid i. */
export const klokke = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "–"
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const r = t % 60
  const pad = (v: number) => String(v).padStart(2, "0")
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

// =============================================================================
// MÅLTAL
// =============================================================================
/** Eit måltal med ferdig sats. Formateringa skjer i motoren og ikkje i
 *  grensesnittet: målinga går i ein worker, og ein funksjon kan ikkje
 *  sendast gjennom postMessage — han ville drepe heile meldinga. */
export type Metric = {
  id: string
  label: string
  value: number
  unit: string
  text: string
}

/**
 * Det reiskapen må kunne svare på. Alt er LESE av geometrien: eit tal her
 * er aldri ei avskrift av eit tal frå ein skyvar.
 */
export type Metrics = {
  envX: number // ytre mål på det ferdige objektet, mm
  envY: number
  envZ: number

  parts: number // tal delar i kuttlista
  unique: number // kor mange av dei som er ULIKE — det er oppspenningane
  loose: number // stykke utan eit einaste ledd: kasta, eller med i lista
  joints: number // kryssledd som faktisk vart skorne
  units: number // ribber i alt
  unitLabel: string

  mass: number // ferdig masse, kg
  plyArea: number // plateareal delane dekkjer, mm²
  sheets: number // ark som trengst
  util: number // utnytting av arka, 0–1
  cutLen: number // samla kuttlengd, mm — laseren si eiga tid
  cutTime: number // kuttetid, sekund: kuttlengda delt på kuttfarta

  narrow: number // smalaste gods som er att i eit ledd, mm
  minGap: number // minste opning mellom to naboribber, mm
  slotW: number // sporbreidd, mm

  tris: number // trekantar i kjeldenettet etter forenkling
  srcTris: number // trekantar i kjeldenettet slik det kom inn
  openEdges: number // kantar som berre høyrer til éin trekant

  list: Metric[]
}

// =============================================================================
// KUTTLISTA
// =============================================================================
/**
 * EI LINE PER DEL SOM SKAL SKJERAST.
 *
 * Panelet seier «12 delar · 12 · 2 unike». Det er sant, og det er ikkje
 * nok når du står ved maskina: kva for tolv, kor store, kva for plate,
 * og kva for to av dei er den same forma. Kuttlista er det same talet
 * skrive ut — ikkje ei ny rekning, berre den som alt er gjord, lesen linje
 * for linje.
 *
 * Adressa er den som står gravert på delen. Det er nøkkelen mellom denne
 * lista, kuttfila og plata du held i handa.
 */
export type Kutt = {
  /** «X3», «X3b» — det som er gravert på delen */
  adr: string
  /** forma. To delar med same id er den same delen, og treng éi oppspenning */
  id: string
  /** ytremål, mm */
  w: number
  h: number
  /** flate, mm² */
  area: number
  /** kuttlengd for denne eine delen, mm */
  cutLen: number
  /** kryssledd som fell i dette stykket */
  joints: number
  /** kva plate han ligg på, frå 1. Null tyder at han ikkje fekk plass. */
  ark: number
}

/** Ei plate slik ho ligg, til skjermen: teikninga og dei to tala som høyrer
 *  til henne. `tal` er kor mange plater det er i alt. */
export type ArkSyn = {
  i: number
  tal: number
  svg: string
  delar: number
  util: number
}

// =============================================================================
// REGLAR
// =============================================================================
/**
 * Det som skil ein reiskap frå ein demonstrasjon er om han seier nei.
 * `hard` tyder at delane ikkje kan skjerast eller ikkje kan setjast saman;
 * ein mjuk regel er eit val som skal stå på papiret i staden for i hovudet.
 */
export type Rule = {
  id: string
  label: string
  ok: boolean
  hard: boolean
  value: string
  why: string
  /** kva som rettar han, om noko av det reiskapen rår over gjer det */
  fiks?: Fiks
}

/**
 * REGELEN BER RÅDA SI.
 *
 * Ein regel som ryk og ikkje seier vegen ut er ei blindgate: «delane får
 * plass · 15 utanfor», og so står du der med to uttak strekne over og
 * ingen ting å trykkje på. Grunngjevinga sa alt kva som måtte gjerast —
 * «anten mindre objekt, fleire ribber, eller ei større plate» — men ho sa
 * det med ord, og orda måtte lesast, tolkast og reknast om til eit tal du
 * sjølv skulle finne fram til i ein skyvar.
 *
 * Tala står alt her. Regelen som veit at femten delar er for store veit
 * òg kor mykje for store dei er, og då kan han seie 420 i staden for
 * «mindre». `set` går rett inn i parametrane gjennom den vanlege vegen,
 * so eit råd du ikkje likar er eitt angre unna.
 *
 * Nokre reglar har ikkje noko råd, og då skal dei ikkje lage eit. Eit
 * nett med hòl i vert ikkje lukka av eit tal.
 */
export type Fiks = {
  /** det som står på knappen: «prøv 420 mm» */
  ord: string
  /** parametrane som skal endrast */
  set: Record<string, number>
}

// =============================================================================
// NETT UT AV MOTOREN
// =============================================================================
export type DetailKey = "lav" | "mid" | "hog"

/** Dei tre lesemåtane av eitt og same objekt:
 *   flate   nettet slik det kom inn — etter forenkling og glatting
 *   lag     ribbene slik dei faktisk står, med spor
 *   kontur  dei flate kuttprofilane, lagde ved sida av kvarandre */
export type View = "flate" | "lag" | "kontur"

export type ExportKind = "stl" | "dxf" | "svg" | "ark" | "prove" | "alt" | "prosjekt"

/**
 * Kuttlista som tekst, til rekneark og til innkjøpslista.
 *
 * Semikolon og ikkje komma: tala er norske og har komma i seg, og eit
 * rekneark som skal gjettast på er eit rekneark som gjettar feil.
 */
export function kuttCsv(liste: readonly Kutt[]): string {
  return [
    "adresse;form;breidd_mm;hogd_mm;flate_cm2;kutt_mm;ledd;plate",
    ...liste.map((k) =>
      [
        k.adr,
        k.id,
        nn(k.w, 2),
        nn(k.h, 2),
        nn(k.area / 100, 2),
        nn(k.cutLen, 1),
        String(k.joints),
        k.ark ? String(k.ark) : "",
      ].join(";"),
    ),
  ].join("\n")
}

export type BuildOut = {
  positions: Float32Array<ArrayBufferLike>
  normals: Float32Array<ArrayBufferLike>
  tris: number
  min: Vec3
  max: Vec3
  lines: Float32Array<ArrayBufferLike>
  heavy: Float32Array<ArrayBufferLike>
  /**
   * Flate eller kant, eitt tal per hjørne: 0 er ei PLATEFLATE, 1 er eit
   * KUTT gjennom plata. Skiljet er noko berre byggjaren veit — ei loddrett
   * ribbe har flatene sine liggjande vassrett i normalen, og ei global
   * tommelfingerregel ville farga henne feil.
   */
  kant: Float32Array<ArrayBufferLike>
  /**
   * Kva line i kuttlista kvart hjørne høyrer til, eller −1.
   *
   * Berre «lag» har dette: der ER kvar flate ein del du kan halde i handa.
   * Merket vert sett der trekanten vert bygd, og det er den einaste vegen
   * frå ein piksel på skjermen til ei line i lista — å gjette ut frå kvar
   * peikaren står i rommet ville vore ei ny rekning som kunne svare noko
   * anna enn snittinga.
   */
  del: Float32Array<ArrayBufferLike>
}

export type ExportOut = {
  name: string
  mime: string
  text?: string
  data?: ArrayBuffer
}

// =============================================================================
// GEOMETRI ALLE DELER
// =============================================================================
export function shoelace(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const b = poly[(i + 1) % poly.length]
    a += poly[i][0] * b[1] - b[0] * poly[i][1]
  }
  return a / 2
}

export function bbox(poly: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const q of poly) {
    if (q[0] < x0) x0 = q[0]
    if (q[0] > x1) x1 = q[0]
    if (q[1] < y0) y0 = q[1]
    if (q[1] > y1) y1 = q[1]
  }
  return { x0, y0, x1, y1 }
}

/**
 * Ligg punktet inne i ringen? Stråle mot høgre, tel kryssingar.
 *
 * Ho står her og ikkje i vaffelmappa av di tre ting spør om det same:
 * kva hòl som høyrer til kva ytterkant når ei ribbe er delt i fleire
 * stykke — i biletet, i kuttlista og i ribba sjølv.
 */
export function inRing(ring: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      if (p[0] < x) inside = !inside
    }
  }
  return inside
}

/** omkrinsen av ein ring — kuttlengda hans */
export function perimeter(ring: Pt[]): number {
  let L = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    L += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return L
}

/** sats av eit måltal: teksten som skal stå på skjermen */
export function metric(
  id: string,
  label: string,
  value: number,
  unit: string,
  text: string,
): Metric {
  return { id, label, value, unit, text }
}

/**
 * Konturen skuva `d` millimeter utover langs vinkelhalveringslina. Det er
 * ikkje eit ekte offset — eit ekte offset kollapsar hjørne der radien er
 * mindre enn skuvet — men på ein tidels millimeter mot ein hjørneradius på
 * fleire er skilnaden under det maskina kan halde, og han går rette vegen.
 */
export function offsetPoly(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  if (n < 3 || Math.abs(d) < 1e-6) return poly
  const ccw = shoelace(poly) > 0
  const s = ccw ? d : -d
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const n1 = norm(a, b)
    const n2 = norm(b, c)
    let mx = n1[0] + n2[0]
    let my = n1[1] + n2[1]
    const L = Math.hypot(mx, my)
    if (L < 1e-9) {
      out.push(b)
      continue
    }
    mx /= L
    my /= L
    // korriger for at halveringslina er kortare enn normalen i eit hjørne
    const k = Math.max(0.4, n1[0] * mx + n1[1] * my || 1)
    out.push([b[0] + (s * mx) / k, b[1] + (s * my) / k])
  }
  return out
}

/** utovernormalen til kanten a→b i eit polygon mot klokka */
function norm(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return [dy / L, -dx / L]
}

// =============================================================================
// HUGS
// =============================================================================
/**
 * Hugsar dei siste resultata per nøkkel — ein bitteliten LRU.
 *
 * For eitt og same punkt spør arbeidaren om bygg, måltal og reglar etter
 * kvarandre, og kvar av dei tre startar med å reise det same rutenettet frå
 * dei same tala. Utan hugs kostar kvart skyvartrykk tre snittingar; med han
 * kostar det éin.
 *
 * Berre mellombygg skal hugsast — ALDRI eit nett som vert sendt gjennom
 * postMessage: overføringa koplar frå bufferane, og eit hugsa nett med
 * fråkopla bufferar er eit usynleg objekt.
 */
export function keep<T>(size = 3): (key: string, make: () => T) => T {
  const m = new Map<string, T>()
  return (key, make) => {
    if (m.has(key)) {
      const hit = m.get(key) as T
      m.delete(key)
      m.set(key, hit)
      return hit
    }
    const v = make()
    m.set(key, v)
    if (m.size > size) m.delete(m.keys().next().value as string)
    return v
  }
}
