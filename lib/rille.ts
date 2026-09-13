import { inRing, type Material, type Pt } from "./core"

// =============================================================================
// RILLA — MØNSTERET SOM LÈT EI PLATE BØYA SEG STRAMMARE ENN HO TOLER
// =============================================================================
/**
 * KVA DENNE FILA ER.
 *
 * Eit bøygt plan er ein sylinder, og `rules.ts` har til no hatt éin dom over
 * han: ytterfiberen strekkjer seg med t/2R, og under ein viss radius sprekk
 * plata. Svaret var «rett ut bøyen, eller ta ei tynnare plate».
 *
 * Det finst eit tredje svar, og verkstaden har brukt det i hundre år: SKJER
 * PLATA OPP. Ei rad snitt på tvers av bøyeretninga tek vekk godset som elles
 * hadde vorte strekt, og det som står att er ei kjede av korte bruer som vrir
 * seg. Plata bøyer seg då ikkje som ei plate — ho bøyer seg som eit hengsle.
 *
 * FILA VEIT INGENTING OM PLAN, RIBBER ELLER MESH. Ho får eit omriss i
 * millimeter, hòla som alt står i det, krumminga til ramma, og dei sonene ho
 * ikkje har lov til å røre. Ho gjev att ringar. At dei ringane er hòl i ein
 * del, at dei hamnar i kuttfila mellom graveringa og omrisset, at dei vert
 * talde i kuttlengda — det er `snitt.ts` og `export-svg.ts` sitt, og dei gjer
 * det alt for kvart anna hòl.
 *
 * KVA HO IKKJE PÅSTÅR. Mønsteret under er ein VERKSTADSTABELL, ikkje ei
 * utleiing. Kor stramt eit gjeve mønster faktisk går før brua ryk er eit
 * vridingsproblem i eit anisotropt materiale, og det talet står ikkje i denne
 * fila av di eg ikkje kan lesa det av geometrien. Det som ER rekna, og som
 * vaktene måler, er GEOMETRIEN: kor mange rader det vert, kor dei ligg, at
 * ingen av dei fell i ei sperresone, og kor langt den fasetterte flata står
 * frå den runde ho skal vera (`avvik`). Tabellen er inndata. Avviket er eit
 * resultat.
 */

// =============================================================================
// KVA MATERIALET TOLER
// =============================================================================
/**
 * MINSTE BØYERADIUS SOM EIN HEIL PLATE, i tjukner.
 *
 * Flytta hit frå `rules.ts` den 13. — ikkje for å rydde, men av di han no har
 * TO lesarar: regelen som seier frå, og mønsteret som er svaret på han. To
 * kopiar av dette talet ville vore to meiningar om kva finér toler.
 *
 * Talet er konservativt med vilje: langs fiberen toler finéren under
 * halvparten av det han gjer på tvers, og verkstaden veit ikkje kva veg plata
 * ligg. Faktoren er 1/2ε — finér på 100 er ein ytterfiber som toler ein halv
 * prosent.
 */
export const BOG_FAKTOR: Record<string, number> = { finer: 100, mdf: 200, akryl: 230, papp: 10 }

/** radien ei HEIL plate av dette toler, mm */
export const bogMin = (material: string, tjukn: number) => (BOG_FAKTOR[material] ?? 100) * tjukn

/**
 * STEGET MELLOM TO RADER, i tjukner — verkstadstabellen.
 *
 * Sprøtt materiale vil ha tettare snitt: akryl og mdf har ingen fiber å bera
 * vridinga med og må dele henne på fleire bruer, medan papp toler nær kva som
 * helst og ikkje treng mønsteret i det heile før radien er svært stram.
 */
const STEG: Record<string, number> = { finer: 1, mdf: 0.8, akryl: 0.8, papp: 2 }

// =============================================================================
// MØNSTERET, SOM TAL
// =============================================================================
export type Rillemal = {
  /** avstanden mellom to rader, langs buen (u), mm */
  steg: number
  /** lengda på eitt snitt, langs sylinderaksen (v), mm */
  lengd: number
  /** godset mellom to snitt i same rada — brua som vrir seg, mm */
  bru: number
}

/**
 * MØNSTERET FOR EIN GJEVEN RADIUS.
 *
 * Steget er det MINSTE av to bindingar, og dei seier kvar sitt:
 *
 *   fasetten   Mellom to rader er plata rett. Flata vert eit mangekant og
 *              ikkje ein sirkel, og feilen er sagitta til eit steg: s²/8R.
 *              Held han seg under ein fjerdedels platetjukn, er fasetten
 *              under det plata sjølv er tjukk, og forma er den ho skal vera.
 *              Det gjev s ≤ √(2tR).
 *   materialet Verkstadstabellen over. Han er alltid den strammaste av dei to
 *              på radiane dette er til for, og det er meininga: fasetten er
 *              ei ØVRE grense, materialet den verkelege.
 *
 * SNITTBREIDDA STÅR IKKJE HER. Ho er FILA og ikkje geometrien — mønsteret
 * skal ikkje endre form når nokon dreg i snittskyvaren — og ho er dessutan
 * halden utanfor nøkkelen eit hugsa snitt vert lagra på (`snittKey`). Er
 * verktyet so grovt at det et rada, seier `bog`-regelen frå i staden.
 */
export function rilleMal(R: number, tjukn: number, material: string): Rillemal {
  const fasett = Math.sqrt(2 * tjukn * Math.max(R, 1))
  const steg = Math.min(fasett, (STEG[material] ?? 1) * tjukn)
  // Brua skal ikkje vera tynnare enn plata er tjukk: ei bru under ei tjukn er
  // ein flis som ryk i staden for å vri seg.
  const bru = tjukn
  return { steg, lengd: 12 * bru, bru }
}

// =============================================================================
// GEOMETRIEN
// =============================================================================
/** Kryssingane til den loddrette lina u = c med ein ring, som v-verdiar. */
function kryssar(ring: readonly Pt[], c: number, ut: number[]) {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % n]
    if (x0 === x1) continue
    // halvopen: eit hjørne nett på lina skal teljast éin gong og ikkje to
    if (c < Math.min(x0, x1) || c >= Math.max(x0, x1)) continue
    ut.push(y0 + ((y1 - y0) * (c - x0)) / (x1 - x0))
  }
}

/**
 * GODSET LANGS LINA u = c, som [frå, til] i v.
 *
 * Omriss og hòl vert kasta i den same haugen og para anna-kvar: det er
 * odde–like-regelen, og han gjev gods der gods er, uavhengig av kor mange hòl
 * lina går gjennom og kva veg dei er vridde.
 */
function gods(ringar: readonly (readonly Pt[])[], c: number): [number, number][] {
  const v: number[] = []
  for (const r of ringar) kryssar(r, c, v)
  v.sort((a, b) => a - b)
  const ut: [number, number][] = []
  for (let i = 0; i + 1 < v.length; i += 2) ut.push([v[i], v[i + 1]])
  return ut
}

/** kryssar strekket a→b strekket c→d? */
function strekKryss(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const s = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = s(c, d, a)
  const d2 = s(c, d, b)
  const d3 = s(a, b, c)
  const d4 = s(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/**
 * LIGG STREKET a→b I EI SPERRESONE?
 *
 * Midtlina er nok, og det er ikkje ei forenkling: sonene vert lagde med ein
 * monn som er breiare enn eit snitt er breitt, so eit snitt som ikkje råkar
 * med midtlina si råkar ikkje i det heile.
 */
function sperra(a: Pt, b: Pt, soner: readonly (readonly Pt[])[]): boolean {
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  for (const s of soner) {
    const ring = s as Pt[]
    if (inRing(ring, a) || inRing(ring, b) || inRing(ring, m)) return true
    for (let i = 0; i < ring.length; i++) {
      if (strekKryss(a, b, ring[i], ring[(i + 1) % ring.length])) return true
    }
  }
  return false
}

export type Rille = {
  /** omrisset til stykket, i ramma si eiga ramme (u er buelengd), mm */
  omriss: readonly Pt[]
  /** hòla som alt står i det — snitta skal ikkje gå gjennom dei */
  hol: readonly (readonly Pt[])[]
  /** STIVE ØYAR: soner mønsteret ikkje har lov til å røre */
  sperr: readonly (readonly Pt[])[]
  /** krumminga til ramma, 1/mm */
  k: number
  tjukn: number
  material: Material | string
}

/**
 * MØNSTERET FOR EITT STYKKE.
 *
 * Snitta står PARALLELT MED SYLINDERAKSEN — langs v — av di det er den vegen
 * godset må gje etter når flata krummar seg i u. Radene kjem etter kvarandre
 * langs buen, og anna kvar rad er forskuva ein halv periode, so brua i ei rad
 * står midt for snittet i naboraden. Utan den forskuvinga ville alle bruene
 * stått på line, og lina hadde vore ein rivestad.
 *
 * Monnen inn frå kanten er ei brubreidd: eit snitt som endar på kanten er
 * ikkje eit snitt, det er eit hakk, og delen opnar seg i det.
 *
 * KVART SNITT KJEM UT SOM TO PUNKT — ei OPA line og ikkje ein ring. Det er
 * ikkje ei forenkling av ein tynn firkant; det er det eit rillesnitt ER. Ein
 * ring ville sagt til maskina at ho skal gå ned den eine sida og attende den
 * andre, og det er DOBBEL kuttlengd for den same opninga. Målt på eit krumt
 * skal i 3 mm finér: 44 meter som ringar, 22 som liner.
 */
export function rilla(q: Rille): Pt[][] {
  if (!q.k) return []
  const R = Math.abs(1 / q.k)
  const mal = rilleMal(R, q.tjukn, String(q.material))
  const ringar = [q.omriss, ...q.hol]
  let u0 = Infinity
  let u1 = -Infinity
  for (const p of q.omriss) {
    if (p[0] < u0) u0 = p[0]
    if (p[0] > u1) u1 = p[0]
  }
  const monn = mal.bru
  const periode = mal.lengd + mal.bru
  const ut: Pt[][] = []
  const rader = Math.floor((u1 - u0 - 2 * monn) / mal.steg)
  if (rader < 1) return []
  for (let i = 0; i <= rader; i++) {
    const u = u0 + monn + i * mal.steg
    // anna kvar rad forskuva ein halv periode — bruene skal ikkje stå på line
    const skift = i % 2 ? periode / 2 : 0
    for (const [a, b] of gods(ringar, u)) {
      const lo = a + monn
      const hi = b - monn
      if (hi - lo < mal.bru) continue
      // rada byrjar på eit fast rutenett og ikkje på stykket: to stykke av
      // den same ribba skal ha det same mønsteret, og eit snitt som flytta
      // seg med kanten ville gjeve to ulike delar av ein del som er éin
      const start = Math.ceil((lo - skift) / periode) * periode + skift
      for (let v = start; v < hi; v += periode) {
        const v0 = Math.max(v, lo)
        const v1 = Math.min(v + mal.lengd, hi)
        if (v1 - v0 < mal.bru) continue
        if (sperra([u, v0], [u, v1], q.sperr)) continue
        ut.push([
          [u, v0],
          [u, v1],
        ])
      }
    }
  }
  return ut
}
