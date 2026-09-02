/**
 * NESTING — delane lagde ut på plata, etter konturen og ikkje etter boksen.
 *
 * Den enkle pakkaren ser berre den omsluttande boksen til kvar del. På ei
 * ribbe frå eit krumt objekt er den boksen mest luft: ribba er ei tunge
 * eller ein boge, og hjørna kring henne er tomme. Ho tel likevel som full,
 * og då kjøper du to plater der du trong ei.
 *
 * Denne pakkaren ser forma. Kvar del vert rasterisert til eit rutenett der
 * ei celle er sett når det er material der — HÒLA er ikkje sett, so ein
 * mindre del kan liggje inne i opninga på ein større. Så vert delen dytta
 * ned og til venstre til han stoggar mot noko: bottom-left-fill, den same
 * grunnalgoritmen som ligg under svgnest og resten av dei.
 *
 * Skilnaden på denne og svgnest er at svgnest legg ein genetisk algoritme
 * oppå: han prøver tusen rekkjefylgjer og held den beste. Det er betre, og
 * det tek minutt. Denne prøver ei handfull, deterministisk, på titals
 * millisekund — og han må det, av di talet på plater står i panelet og
 * skal fylgje skyvaren medan du dreg i han. Eit tal som kjem eit minutt for
 * seint er ikkje eit tal, det er ei melding. Sjå `STRATEGIAR` for kva dei
 * få passasjane er, og kva dei får lov til å koste.
 *
 * KLARINGA ligg i rasteret og ikkje i søket: kvar del vert utvida med
 * halve luka på alle kantar før han vert lagd. Då kan to delar liggje
 * celle mot celle utan at kuttbanene deira kjem nærare kvarandre enn dei
 * skal, og plata sin eigen kant er dekt av den same utvidinga.
 */
import { bbox, type Pt } from "./core"

export type Ring = Pt[]
/** ring 0 er ytterkanten; resten er hòl, og hòl er LEDIG plass */
export type Piece = { key: string; rings: Ring[] }

/**
 * EIN DEL SOM STÅR FAST.
 *
 * Pakkinga legg delane der ho vil, og det er rett heilt til nokon har ei
 * meining. Er ein del FESTA, vert han lagd ned der han står før nokon
 * annan får plass, og resten pakkar seg kring han.
 *
 * `x` og `y` er hjørnet av masken i millimeter — det same rommet
 * pakkinga sjølv reknar i, so eit feste er ei avlesing ho har gjeve frå
 * seg og ikkje ei omrekning nokon har gjort på vegen.
 */
export type Fest = { sheet: number; rot: 0 | 1 | 2 | 3; x: number; y: number }

export type Slot = {
  piece: number
  sheet: number
  rot: 0 | 1 | 2 | 3
  /** affint på delen sine eigne koordinat: [a b e | c d f] */
  m: [number, number, number, number, number, number]
  /**
   * Hjørnet av masken på plata, i millimeter.
   *
   * Det SAME rommet `Fest` reknar i, og difor det einaste talet som kan
   * sendast rett attende hit og gje same plasseringa. Det let seg rekne ut
   * av `m` òg — men berre ved å snu affinen for kvar av dei fire
   * kvartsvingane, og ei omrekning skriven to gonger er to omrekningar.
   */
  sx: number
  sy: number
  /**
   * Ein FESTA del som vart lagd ned i gods som alt låg der — altso i ein
   * annan festa del. Pakkinga går aldri sjølv i nokon; det er berre handa
   * som kan setje to delar i kvarandre, og då skal plata seie det. Sjå
   * `kross` i `Packing`.
   */
  kross?: boolean
}

export type Packing = {
  slots: Slot[]
  sheets: number
  /** kor høgt det ligg delar på kvar plate, mm */
  used: number[]
  /** delar som ikkje fekk plass på ei tom plate heller */
  spilt: number[]
  /**
   * Festa delar som ligg i kvarandre.
   *
   * Pakkinga overprøver ikkje handa: eit feste vert lagt der det står, òg
   * når det står i eit anna. Men to kutt som går i kvarandre er to delar
   * som er øydelagde, og ei fil som ser fin ut på skjermen og gjev skrap på
   * bordet er den verste fila som finst. So det vert talt, og regelen om
   * plata seier nei.
   */
  kross: number
}

export const apply = (m: Slot["m"], p: Pt): Pt => [
  m[0] * p[0] + m[1] * p[1] + m[2],
  m[3] * p[0] + m[4] * p[1] + m[5],
]

export const placeRings = (rings: Ring[], s: Slot): Ring[] =>
  rings.map((r) => r.map((p) => apply(s.m, p)))

// =============================================================================
// RASTER
// =============================================================================
type Mask = {
  w: number
  h: number
  /** to tal per stykke: [a, b) i celler */
  span: Int32Array
  start: Int32Array
  /** nedste sette celle per kolonne, −1 når kolonnen er tom */
  bot: Int32Array
  /** kor mange celler som er sette — det er arealet, i celler */
  cells: number
}

type Raw = { w: number; h: number; a: Uint8Array }

/**
 * Polygonet til celler, med partals-regelen.
 *
 * Alle ringane vert lagde i den same krysslista, so eit hòl slår seg sjølv
 * av: ei celle inne i ytterkanten og inne i eit hòl har eit partal kryss
 * til venstre for seg, og er ute. Det er heile grunnen til at ein mindre
 * del kan hamne inne i opninga på ein større.
 */
function rasterise(
  rings: Ring[],
  ox: number,
  oy: number,
  res: number,
  w: number,
  h: number,
  /**
   * Krev at HEILE cella ligg inne, og ikkje berre senteret hennar.
   *
   * Pakkaren vil ha senteret: masken hans vert utvida med klaringa etterpå,
   * og ei celle som halvvegs er inne er halvvegs oppteken. Adressa vil ha
   * det motsette. Ei ribbe er ein kam, og eit spor er tre millimeter —
   * smalare der konturen skjer det på skrå. Eit senter kvar andre
   * millimeter hoppar over eit slikt spor av og til, rasteret fyller tvers
   * over det, og «det feitaste punktet på delen» hamnar midt på ein
   * sporvegg. Ei celle som ikkje er heil, er ikkje gods.
   */
  heil = false,
): Raw {
  const a = new Uint8Array(w * h)
  const xs: number[] = []
  for (let j = 0; j < h; j++) {
    const y = oy + (j + 0.5) * res
    xs.length = 0
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        if (p[1] === q[1]) continue
        if (y >= Math.min(p[1], q[1]) && y < Math.max(p[1], q[1])) {
          xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
        }
      }
    }
    if (xs.length < 2) continue
    xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // celle `i` spenner [ox + i·res, ox + (i+1)·res]
      const i0 = heil
        ? Math.max(0, Math.ceil((xs[k] - ox) / res))
        : Math.max(0, Math.ceil((xs[k] - ox) / res - 0.5))
      const i1 = heil
        ? Math.min(w - 1, Math.floor((xs[k + 1] - ox) / res) - 1)
        : Math.min(w - 1, Math.floor((xs[k + 1] - ox) / res - 0.5))
      for (let i = i0; i <= i1; i++) a[j * w + i] = 1
    }
  }
  return { w, h, a }
}

/** Utvidinga: klaringa lagd inn i sjølve forma, so søket slepp å tenkje på
 *  henne. Kvadratisk kjerne: kvart stykke i ei rad vert `k` lengre i kvar
 *  ende, og lagt i dei `k` radene over og under òg. Det er heile summen, og
 *  eit stykke er eitt `fill` og ikkje ei celle om gongen — celle for celle
 *  var utvidinga dyrare enn sjølve leitinga etter plass. */
function dilate(r: Raw, k: number): Raw {
  if (k <= 0) return r
  const w = r.w + 2 * k
  const h = r.h + 2 * k
  const out = new Uint8Array(w * h)
  for (let j = 0; j < r.h; j++) {
    const rad = j * r.w
    let i = 0
    while (i < r.w) {
      if (!r.a[rad + i]) {
        i++
        continue
      }
      const a = i
      while (i < r.w && r.a[rad + i]) i++
      // stykket [a, i) vert [a, i + 2k) i kvar av radene j .. j + 2k
      for (let jj = j; jj <= j + 2 * k; jj++) out.fill(1, jj * w + a, jj * w + i + 2 * k)
    }
  }
  return { w, h, a: out }
}

/** Fire kvartsvingar. Rasteret vert snudd med indeksar og ikkje teikna om:
 *  ei kvartsving er ein transponering, og han er eksakt. */
function turn(r: Raw, rot: 0 | 1 | 2 | 3): Raw {
  if (rot === 0) return r
  const swap = rot === 1 || rot === 3
  const w = swap ? r.h : r.w
  const h = swap ? r.w : r.h
  const a = new Uint8Array(w * h)
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      if (!r.a[j * r.w + i]) continue
      let ii: number
      let jj: number
      if (rot === 1) {
        ii = r.h - 1 - j
        jj = i
      } else if (rot === 2) {
        ii = r.w - 1 - i
        jj = r.h - 1 - j
      } else {
        ii = j
        jj = r.w - 1 - i
      }
      a[jj * w + ii] = 1
    }
  }
  return { w, h, a }
}

function toMask(r: Raw): Mask {
  const span: number[] = []
  const start = new Int32Array(r.h + 1)
  const bot = new Int32Array(r.w).fill(-1)
  let cells = 0
  for (let j = 0; j < r.h; j++) {
    start[j] = span.length
    let i = 0
    while (i < r.w) {
      if (!r.a[j * r.w + i]) {
        i++
        continue
      }
      const a0 = i
      while (i < r.w && r.a[j * r.w + i]) {
        if (bot[i] < 0) bot[i] = j
        i++
      }
      span.push(a0, i)
      cells += i - a0
    }
  }
  start[r.h] = span.length
  return { w: r.w, h: r.h, span: new Int32Array(span), start, bot, cells }
}

// =============================================================================
// PLATA
// =============================================================================
type Board = {
  w: number
  h: number
  words: number
  bits: Uint32Array
  /** høgste sette celle pluss éin, per kolonne */
  top: Int32Array
  used: number
  /**
   * Former denne plata alt har sagt nei til.
   *
   * Ei plate får berre MEIR gods; ho vert aldri tømd. So eit nei kan
   * aldri verte eit ja, og då er det ingen grunn til å spørje to gonger.
   * Utan dette skanna kvar del kvar einaste plate på nytt: ei kule med
   * 32 ribber kvar veg vart 64 delar på 40 plater, og pakkinga tok 930 ms
   * — nesten halve tida i eit drag, av ein funksjon som seier om seg
   * sjølv at han går på titals millisekund av di platetalet skal fylgje
   * skyvaren.
   *
   * Dette hoppar berre over arbeid som ville svart nei. Kvar del hamnar
   * på nøyaktig same plata som før.
   */
  nei: Set<string>
}

const board = (w: number, h: number): Board => {
  const words = (w + 31) >> 5
  return {
    w,
    h,
    words,
    bits: new Uint32Array(words * h),
    top: new Int32Array(w),
    used: 0,
    nei: new Set(),
  }
}

/** er nokon bit sett i [a, b) på denne rada? */
function anySet(bits: Uint32Array, base: number, a: number, b: number): boolean {
  if (b <= a) return false
  const wa = a >> 5
  const wb = (b - 1) >> 5
  const lo = -1 << (a & 31)
  const hiBit = (b - 1) & 31
  const hi = hiBit === 31 ? -1 : (1 << (hiBit + 1)) - 1
  if (wa === wb) return (bits[base + wa] & lo & hi) !== 0
  if (bits[base + wa] & lo) return true
  for (let w = wa + 1; w < wb; w++) if (bits[base + w]) return true
  return (bits[base + wb] & hi) !== 0
}

function setBits(bits: Uint32Array, base: number, a: number, b: number) {
  if (b <= a) return
  const wa = a >> 5
  const wb = (b - 1) >> 5
  const lo = -1 << (a & 31)
  const hiBit = (b - 1) & 31
  const hi = hiBit === 31 ? -1 : (1 << (hiBit + 1)) - 1
  if (wa === wb) {
    bits[base + wa] |= lo & hi
    return
  }
  bits[base + wa] |= lo
  for (let w = wa + 1; w < wb; w++) bits[base + w] = 0xffffffff
  bits[base + wb] |= hi
}

function fits(b: Board, m: Mask, px: number, py: number): boolean {
  for (let r = 0; r < m.h; r++) {
    const base = (py + r) * b.words
    arbeid += (m.start[r + 1] - m.start[r]) >> 1
    for (let s = m.start[r]; s < m.start[r + 1]; s += 2) {
      if (anySet(b.bits, base, px + m.span[s], px + m.span[s + 1])) return false
    }
  }
  return true
}

function stamp(b: Board, m: Mask, px: number, py: number) {
  for (let r = 0; r < m.h; r++) {
    const base = (py + r) * b.words
    for (let s = m.start[r]; s < m.start[r + 1]; s += 2) {
      const a = px + m.span[s]
      const c = px + m.span[s + 1]
      setBits(b.bits, base, a, c)
      for (let i = a; i < c; i++) if (py + r + 1 > b.top[i]) b.top[i] = py + r + 1
    }
  }
  if (py + m.h > b.used) b.used = py + m.h
}

/**
 * Lågaste ledige plass for denne masken på denne plata.
 *
 * `ySky` er skylinja: legg du delen der, ligg han over ALT som står frå
 * før i kvar einaste kolonne han rører, og då kan han ikkje kollidere. Han
 * er difor både ei garantert løysing og eit tak på leitinga — under han
 * ligg berre plassar inne i hòl og lommer, og over han er det ingenting å
 * hente.
 */
function lowest(b: Board, m: Mask, px: number, step: number): number {
  // Grovt fyrst. Nesten kvar kolonne som vert spurd får nei — skylinja
  // står for høgt for delen — og det neiet stod i to hundre oppslag. Eit
  // knippe kolonnar med stort sprang gjev kvar si nedre grense for
  // skylinja, so eit nei frå ei av dei er det same neiet, funne på åtte.
  const hopp = Math.max(1, m.w >> 3)
  for (let c = 0; c < m.w; c += hopp) {
    if (m.bot[c] >= 0 && b.top[px + c] - m.bot[c] + m.h > b.h) return -1
  }
  let ySky = 0
  arbeid += m.w
  for (let c = 0; c < m.w; c++) {
    if (m.bot[c] < 0) continue
    const t = b.top[px + c] - m.bot[c]
    if (t > ySky) ySky = t
  }
  if (ySky + m.h > b.h) return -1
  for (let py = 0; py < ySky; py += step) {
    if (fits(b, m, px, py)) return py
  }
  return ySky
}

// =============================================================================
// PAKKINGA
// =============================================================================
/**
 * Cella og utvidinga pakkinga arbeider i.
 *
 * Oppløysinga vert vald av KLARINGA og ikkje av plata.
 *
 * Klaringa er kvantisert til rutenettet: ei celle for grovt, og to delar
 * som ser ut til å ha fem millimeter imellom seg har fire. Med ei celle på
 * ein tredels luke og to celler utviding er den minste avstanden som kan
 * oppstå nøyaktig luka — og det er den eine garantien pakkinga må gje, av
 * di ho er det som avgjer om verktøyet kjem imellom delane. Golvet er der
 * for store plater: ein fire meters plate på ei millimetercelle er fire
 * millionar celler, og det er inga pakking, det er ei venting.
 *
 * Men golvet braut garantien det stod under. Cellene vert sette på
 * senterpunkt, so rasteret dekkjer forma for lite med ei halv celle på
 * kvar side, og den avstanden som faktisk kjem ut er (2k−1)·res. Med
 * res = luke/3 og k = 2 er det nøyaktig luka. Vart res drege OPP av plata,
 * fall k til 1, og då er avstanden berre res: ei plate på 1600 × 1000 gav
 * 2,58 mm av ei lova luke på 4, og ei heil finérplate på 2440 × 1220 gav
 * 3,94. Målt mellom dei lagde omrissa: 3,23 mm.
 *
 * Vegen ut er ikkje å utvide meir — k = 2 på ei grov celle reserverer tre
 * celler og kastar bort ei plate. Det er å la cella VERA luka når ho fyrst
 * er drege forbi ein tredel av henne: éi celle utviding er då nøyaktig den
 * luka som er lova, og rutenettet vert på kjøpet fire gonger billegare.
 */
function rutenettet(sheetW: number, sheetH: number, gap: number) {
  let res = Math.min(6, Math.max(gap / 3, Math.max(sheetW, sheetH) / 620, 1))
  if (res > gap / 3 && res < gap) res = gap
  return { res, k: Math.max(1, Math.ceil((gap / res + 1) / 2)) }
}

/**
 * KOR STOR EIN DEL KAN VERA OG FRAMLEIS FÅ PLASS PÅ EI TOM PLATE.
 *
 * Ein del vert spilt når ikkje ein einaste kvartsving av masken hans går
 * inn i brettet. Masken er delen sitt raster — `ceil(boks/res) + 1` celler
 * — pluss `k` celler utviding på KVAR side, og brettet er `floor(plate/res)`
 * celler. Difor er det største boksmålet som går inn `(SW − 1 − 2k)·res`,
 * og ikkje plata minus ei luke.
 *
 * Skilnaden er ikkje akademisk. Rådet «for stort til plata» rekna på plata
 * minus ei luke, og på ei plate på 200 × 200 er det 196 mm der det verkelege
 * svaret er 193,3. Knappen sa «prøv 195 mm», du trykte, og lina stod
 * framleis raud med to delar utanfor. Seks prosent av dei brotne tilfella
 * i eit sveip på 252 var slik.
 *
 * Difor står talet HER, hjå den som avgjer det, og ikkje som ei gjetting
 * hjå den som spør.
 */
export function fitRoom(
  sheetW: number,
  sheetH: number,
  gap: number,
): { w: number; h: number } {
  const { res, k } = rutenettet(sheetW, sheetH, gap)
  return {
    w: Math.max(0, (Math.floor(sheetW / res) - 1 - 2 * k) * res),
    h: Math.max(0, (Math.floor(sheetH / res) - 1 - 2 * k) * res),
  }
}

/**
 * KVA SOM ER EI PLASSERING, OG KVA SOM ER EI GOD.
 *
 * Kvar del vert lagd på det lågaste ledige punktet han finn, og «lågast»
 * kan målast på to måtar:
 *
 *   botn   lågaste NEDRE kant, og so lengst til venstre. Det er
 *          bottom-left-fill slik han alltid har lege her.
 *   topp   lågaste ØVRE kant, og so lengst til venstre. Ein del som er
 *          høg og smal legg seg heller ned enn opp, og skylina vert
 *          flatare: neste rad finn eit golv i staden for ei trapp. På ein
 *          vendt kube gjekk siste plata frå 840 til 556 mm av det eine
 *          ordet.
 *
 * `bryt` er ein snarveg botnen har hatt heile tida: står den fyrste
 * kvartsvingen alt på golvet, prøver han ikkje dei tre andre. Ho er ikkje
 * rett — ein annan sving kunne stått på golvet lenger til venstre — men
 * det er slik den fyrste passasjen alltid har lagt, og den fyrste passasjen
 * skal leggje NØYAKTIG som før. Sjå `STRATEGIAR`.
 */
type Poeng = "botn" | "topp"
type Strategi = {
  /** 0 er største fyrst; eit anna tal er frøet til støyen — sjå `ordna` */
  fro: number
  poeng: Poeng
  bryt?: boolean
}

/**
 * FLEIRE PASSASJAR, OG DEN BESTE STÅR.
 *
 * Ein grådig pakkar legg kvar del der ho passar best akkurat då, og angrar
 * aldri. Det er billeg, og det er ofte nokre prosent frå det ei anna
 * rekkjefylgje hadde gjeve: to mellomstore delar som fyller ei rad FØR den
 * store kjem, i staden for etter. svgnest løyser det med ein genetisk
 * algoritme over tusen rekkjefylgjer, og tek minutt.
 *
 * Her er det ei handfull. Den fyrste passasjen er den gamle, ordrett, so
 * inga plate kan verte verre enn ho var. So kjem toppregelen på den same
 * rekkjefylgja, og so den same regelen på rekkjefylgjer der storleiken har
 * fått litt støy på seg: like store delar byter plass, og det er nett det
 * som lèt ei rad fyllast annleis. Støyen er DETERMINISTISK — same frø, same
 * rekkje, same plate kvar gong, på kvar maskin.
 *
 * Det beste svaret er det med færrast plater, og med like mange, det som
 * let mest att av den siste: resten av henne er ikkje svinn, han ligg der
 * og ventar på neste jobb, og eit reint stykke er meir verdt enn eit
 * frynsa.
 *
 * Målt over fire og tjue objekt mot den eine passasjen: elleve vart betre
 * og ingen verre. Siste plata på ein vendt kube gjekk frå 840 til 556 mm,
 * på eit egg med åtte og fyrti ribber frå 344 til 208, på ei kule med sju
 * frå 131 til 84. Platetalet stod stille på alle — det er grensa for det
 * ein handfull grådige passasjar kan; ei plate mindre krev tusen.
 *
 * Fire og ikkje tolv. Med tolv frø prøvde vann kvart av dei nokre få
 * objekt med nokre få millimeter, og ingen av dei skilde seg ut: det er
 * støyen som gjer nytta, ikkje frøet. To held, og resten er tid.
 */
const STRATEGIAR: readonly Strategi[] = [
  { fro: 0, poeng: "botn", bryt: true },
  { fro: 0, poeng: "topp" },
  { fro: 1, poeng: "topp" },
  { fro: 2, poeng: "topp" },
]

/**
 * KOR MANGE PASSASJAR TIL, ETTER KVA DEN FYRSTE KOSTA.
 *
 * Platetalet står i panelet og skal fylgje skyvaren, og søket pakkar
 * tretten kandidatar på rad. Ein pakkar som tek fire gonger so lang tid er
 * fire gonger for sein der. So den fyrste passasjen TEL arbeidet sitt —
 * kolonnar sedde og spenn prøvde, eit tal som er det same på kvar maskin —
 * og dei neste får det som er att av eit fast budsjett: ein liten jobb får
 * alle tre, ein stor får ingen. Målt: ei pakking som tok 35 ms tek 135, ei
 * som tok 430 tek 440. Søket, som pakkar tretten gonger, tok ein tredel
 * lenger på det verste objektet og ein sjettedel på kuben.
 */
const BUDSJETT = 12_000_000
let arbeid = 0

/**
 * Støy med frø. Ein liten kongruensgenerator er nok: ho skal ikkje vera
 * tilfeldig, ho skal vera den SAME kvar gong, og ulik for kvart frø.
 */
function stoy(fro: number): () => number {
  let x = (fro * 747796405 + 2891336453) | 0
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    return (x >>> 8) / 16777216
  }
}

export function pack(
  pieces: readonly Piece[],
  sheetW: number,
  sheetH: number,
  gap: number,
  /** delar som står fast, etter plassen sin i `pieces` */
  fest?: ReadonlyMap<number, Fest>,
  /**
   * Tak på kor mange passasjar TIL den fyrste får. Søket set 0: det
   * snittar hundrevis av kandidatar og treng eit platetal som er sant
   * nok til å rangere på, ikkje den beste plata — henne får vinnaren når
   * han vert sett. Utan tak gjeld budsjettet.
   */
  ekstra?: number,
): Packing {
  if (!pieces.length) return { slots: [], sheets: 0, used: [], spilt: [], kross: 0 }

  // Oppløysinga vert vald av KLARINGA og ikkje av plata.
  //
  // Klaringa er kvantisert til rutenettet: ei celle for grovt, og to delar
  // som ser ut til å ha fem millimeter imellom seg har fire. Med ei celle
  // på ein tredels luke og to celler utviding er den minste avstanden som
  // kan oppstå nøyaktig luka — og det er den eine garantien pakkinga må
  // gje, av di ho er det som avgjer om verktøyet kjem imellom delane.
  // Golvet er der for store plater: ein fire meters plate på ei
  // millimetercelle er fire millionar celler, og det er inga pakking, det
  // er ei venting.
  //
  // Men golvet braut garantien det stod under. Cellene vert sette på
  // senterpunkt, so rasteret dekkjer forma for lite med ei halv celle på
  // kvar side, og den avstanden som faktisk kjem ut er (2k−1)·res. Med
  // res = luke/3 og k = 2 er det nøyaktig luka. Vart res drege OPP av
  // plata, fall k til 1, og då er avstanden berre res: ei plate på 1600 ×
  // 1000 gav 2,58 mm av ei lova luke på 4, og ei heil finérplate på 2440
  // × 1220 gav 3,94. Målt mellom dei lagde omrissa: 3,23 mm.
  //
  // Vegen ut er ikkje å utvide meir — k = 2 på ei grov celle reserverer
  // tre celler og kastar bort ei plate. Det er å la cella VERA luka når
  // ho fyrst er drege forbi ein tredel av henne: éi celle utviding er då
  // nøyaktig den luka som er lova, og rutenettet vert på kjøpet fire
  // gonger billegare.
  const { res, k } = rutenettet(sheetW, sheetH, gap)
  const step = Math.max(1, Math.round(3 / res))
  const SW = Math.floor(sheetW / res)
  const SH = Math.floor(sheetH / res)

  // Like delar er like: eit kuttark med femti ribber har ofte ti former.
  // Rasteret vert laga éin gong per FORM, ikkje éin gong per del — og éin
  // gong for alle passasjane.
  //
  // Men RASTERET er det einaste som er felles. Forma hugsar òg kvar det
  // fyrste stykket med den nøkkelen låg, og den koordinaten høyrer til
  // det stykket og ikkje til forma: to like ribber kan liggje kvar sin
  // stad i sitt eige rom. Vert det andre stykket lagt ut med det fyrste
  // sitt opphav, kjem det ut skuva med skilnaden mellom dei to — og
  // pakkinga melder null delar utanfor plata medan delen ligg to hundre
  // millimeter utanfor henne.
  //
  // Difor: masker frå forma, opphav frå stykket.
  type Form = { masks: Mask[]; ox: number; oy: number; Wm: number; Hm: number; cells: number }
  const forms = new Map<string, Form>()
  const formOf = (p: Piece): Form => {
    const hit = forms.get(p.key)
    if (hit) return hit
    const bb = bbox(p.rings[0])
    const nw = Math.ceil((bb.x1 - bb.x0) / res) + 1
    const nh = Math.ceil((bb.y1 - bb.y0) / res) + 1
    const raw = dilate(rasterise(p.rings, bb.x0, bb.y0, res, nw, nh), k)
    const masks = ([0, 1, 2, 3] as const).map((r) => toMask(turn(raw, r)))
    const f: Form = {
      masks,
      ox: bb.x0 - k * res,
      oy: bb.y0 - k * res,
      Wm: raw.w * res,
      Hm: raw.h * res,
      cells: masks[0].cells,
    }
    forms.set(p.key, f)
    return f
  }
  const alle = pieces.map((p, i) => ({ i, key: p.key, f: formOf(p) }))

  /**
   * REKKJEFYLGJA. Størst fyrst: ein liten del finn alltid ei lomme; ein
   * stor gjer det berre medan plata framleis er open.
   *
   * Med eit frø får storleiken støy på seg, opp til ein tredel. Det er nok
   * til at to delar som er om lag like store byter plass, og for lite til
   * at ein liten del går føre ein stor: det er dei jamstore som kan fylle
   * ei rad annleis, ikkje dei ulike.
   */
  const ordna = (fro: number) => {
    if (!fro) return [...alle].sort((a, b) => b.f.cells - a.f.cells || a.i - b.i)
    const rnd = stoy(fro)
    const vekt = alle.map((q) => ({ q, v: q.f.cells * (1 + 0.35 * rnd()) }))
    return vekt.sort((a, b) => b.v - a.v || a.q.i - b.q.i).map((z) => z.q)
  }

  /** lågaste ledige plass for denne forma på denne plata, over alle fire
   *  kvartsvingane, målt slik strategien seier */
  const seek = (b: Board, f: Form, s: Strategi) => {
    let best: { rot: 0 | 1 | 2 | 3; px: number; py: number; sc: number } | null = null
    for (let r = 0; r < 4; r++) {
      const m = f.masks[r]
      if (m.w > b.w || m.h > b.h) continue
      for (let px = 0; px + m.w <= b.w; px += step) {
        const py = lowest(b, m, px, step)
        if (py < 0) continue
        // Éin sum og ikkje to tal: `px` er alltid mindre enn breidda, so
        // han skil berre der kanten er den same.
        const sc = (s.poeng === "topp" ? py + m.h : py) * b.w + px
        if (!best || sc < best.sc) best = { rot: r as 0 | 1 | 2 | 3, px, py, sc }
        // Golvet er det lågaste som finst for denne svingen, og px veks:
        // ingenting lenger til høgre kan slå det.
        if (py === 0) break
      }
      // botnen til venstre er det beste som finst; er han teken, er det
      // ingen grunn til å prøve dei tre andre svingane — slik han alltid
      // har gjort. Sjå `bryt`.
      if (s.bryt && best && best.py === 0) break
    }
    return best
  }

  type Passasje = { slots: Slot[]; boards: Board[]; spilt: number[]; kross: number }

  const legg = (s: Strategi): Passasje => {
    const order = ordna(s.fro)
    const slots: Slot[] = []
    const spilt: number[] = []
    const boards: Board[] = []
    /** plater nok til at plate nummer `n` finst */
    const platerTil = (n: number) => {
      while (boards.length <= n) boards.push(board(SW, SH))
    }

    /**
     * DEI FASTE FYRST, OG SO RESTEN KRING DEI.
     *
     * Rekkjefylgja er heile mekanismen. Eit feste er ikkje ei rekning
     * pakkinga gjer — det er ei celle som alt er teken når ho byrjar, og
     * resten av lykkja under er ordrett den same som før. Ho ser eit merkt
     * felt og går utanom, slik ho alltid har gått utanom det ho sjølv har
     * lagt ned.
     *
     * To feste kan overlappe kvarandre. Det er handa som har gjort det, og
     * pakkinga skal ikkje overprøve henne — ho held berre orden på sitt
     * eige, og seier frå: sjå `kross`.
     */
    const staar = new Set<number>()
    let kross = 0
    if (fest?.size) {
      for (const { i, f } of order) {
        const ft = fest.get(i)
        if (!ft) continue
        if (!Number.isInteger(ft.sheet) || ft.sheet < 0 || ft.sheet > 255) continue
        platerTil(ft.sheet)
        const b = boards[ft.sheet]
        const m = f.masks[ft.rot]
        // Ein del som er større enn plata kan ikkje festast på henne. Han
        // fell ned i den vanlege lykkja, som alt veit kva ho skal seie om
        // slike.
        if (m.w > b.w || m.h > b.h) continue
        const px = Math.max(0, Math.min(b.w - m.w, Math.round(ft.x / res)))
        const py = Math.max(0, Math.min(b.h - m.h, Math.round(ft.y / res)))
        // Ligg det alt gods der? Berre eit anna feste kan ha lagt det:
        // dei frie kjem etterpå.
        const iNokon = !fits(b, m, px, py)
        if (iNokon) kross++
        stamp(b, m, px, py)
        const bb = bbox(pieces[i].rings[0])
        slots.push({
          piece: i,
          sheet: ft.sheet,
          rot: ft.rot,
          m: affine(
            { ...f, ox: bb.x0 - k * res, oy: bb.y0 - k * res },
            ft.rot,
            px * res,
            py * res,
          ),
          sx: px * res,
          sy: py * res,
          ...(iNokon ? { kross: true } : {}),
        })
        staar.add(i)
      }
    }

    for (const { i, key, f } of order) {
      if (staar.has(i)) continue
      let put: { s: number; rot: 0 | 1 | 2 | 3; px: number; py: number } | null = null
      // Fyrste plate som tek han. Det held dei fyrste platene fulle, og det
      // er dei ein faktisk skjer ut fyrst.
      for (let n = 0; n < boards.length && !put; n++) {
        if (boards[n].nei.has(key)) continue
        const best = seek(boards[n], f, s)
        if (best) put = { s: n, rot: best.rot, px: best.px, py: best.py }
        else boards[n].nei.add(key)
      }
      if (!put) {
        // Ei ny plate. Får han ikkje plass på ei TOM plate heller, er han
        // større enn plata, og då er det plata som er feil.
        if (f.masks.every((m) => m.w > SW || m.h > SH)) {
          spilt.push(i)
          continue
        }
        const b = board(SW, SH)
        const best = seek(b, f, s)
        if (!best) {
          spilt.push(i)
          continue
        }
        boards.push(b)
        put = { s: boards.length - 1, rot: best.rot, px: best.px, py: best.py }
      }
      const m = f.masks[put.rot]
      stamp(boards[put.s], m, put.px, put.py)
      const bb = bbox(pieces[i].rings[0])
      slots.push({
        piece: i,
        sheet: put.s,
        rot: put.rot,
        m: affine(
          { ...f, ox: bb.x0 - k * res, oy: bb.y0 - k * res },
          put.rot,
          put.px * res,
          put.py * res,
        ),
        sx: put.px * res,
        sy: put.py * res,
      })
    }
    /**
     * TOMME PLATER FELL BORT.
     *
     * Eit feste ber nummeret på den plata delen stod på DÅ han vart festa.
     * Vert jobben mindre etterpå — færre ribber, mindre objekt — treng
     * resten kanskje berre éi plate, og ein del festa på plate fire gav
     * fire plater der to var tomme: tomme filer i uttaket, og eit platetal
     * som laug. Dei tomme går ut, og dei som er att vert talde om att.
     *
     * Ikkje pakka tettare enn det: delen står på SI plate, ikkje på den
     * fyrste. Eit feste er «her», og «her» er òg kva plate. Det er òg det
     * som gjer at «neste plate» i verktyet tyder noko for ein einsleg del.
     */
    const att: number[] = []
    boards.forEach((b, n) => {
      if (b.used > 0) att.push(n)
    })
    if (att.length < boards.length) {
      const ny = new Map(att.map((n, i) => [n, i]))
      for (const sl of slots) sl.sheet = ny.get(sl.sheet) ?? sl.sheet
      return { slots, boards: att.map((n) => boards[n]), spilt, kross }
    }
    return { slots, boards, spilt, kross }
  }

  /** færrast plater; med like mange, den som lét mest att av den siste */
  const betre = (a: Passasje, b: Passasje) => {
    if (a.boards.length !== b.boards.length) return a.boards.length < b.boards.length
    const sist = (q: Passasje) => (q.boards.length ? q.boards[q.boards.length - 1].used : 0)
    return sist(a) < sist(b)
  }

  // Den gamle fyrst, og ho tel kva ho kosta. Sjå `BUDSJETT`.
  arbeid = 0
  let best = legg(STRATEGIAR[0])
  const fleire = Math.min(
    ekstra ?? STRATEGIAR.length - 1,
    STRATEGIAR.length - 1,
    Math.floor(BUDSJETT / Math.max(1, arbeid)),
  )
  for (let n = 1; n <= fleire; n++) {
    const p = legg(STRATEGIAR[n])
    if (betre(p, best)) best = p
  }

  return {
    slots: best.slots,
    sheets: best.boards.length,
    used: best.boards.map((b) => b.used * res),
    spilt: best.spilt,
    kross: best.kross,
  }
}

/**
 * Det affine biletet av kvartsvinga, i delen sine eigne koordinat.
 *
 * (u, v) er punktet målt frå masken sitt hjørne. Ei kvartsving mot klokka
 * sender (u, v) til (Hm − v, u), og so vert heile greia flytt dit han
 * hamna på plata. Rekninga står her og ikkje i teikninga, av di kuttfila,
 * biletet og målinga alle må bruke NØYAKTIG same flytting — ei omrekning
 * skriven to gonger er to omrekningar.
 */
function affine(
  f: { ox: number; oy: number; Wm: number; Hm: number },
  rot: 0 | 1 | 2 | 3,
  sx: number,
  sy: number,
): Slot["m"] {
  const { ox, oy, Wm, Hm } = f
  switch (rot) {
    case 0:
      return [1, 0, sx - ox, 0, 1, sy - oy]
    case 1:
      return [0, -1, sx + Hm + oy, 1, 0, sy - ox]
    case 2:
      return [-1, 0, Wm + ox + sx, 0, -1, Hm + oy + sy]
    default:
      return [0, 1, sx - oy, -1, 0, Wm + ox + sy]
  }
}

// =============================================================================
// KVAR NUMMERET SKAL STÅ
// =============================================================================
/**
 * Største kvadrat som får plass inne i delen, og senteret hans.
 *
 * Tyngdepunktet duger ikkje. Ei ribbe som er ein boge har tyngdepunktet
 * sitt i lause lufta under bogen, og eit nummer gravert der er gravert i
 * plata under. Ein ring har det midt i hòlet. Det ein vil ha er den
 * feitaste staden på delen, og det er nett det største innskrivne kvadrat
 * er.
 *
 * Rekninga er den klassiske: for kvar celle, det største kvadratet med
 * nedre høgre hjørne der, er éin meir enn det minste av dei tre naboane
 * opp, til venstre og på skrå. Éin gjennomgang, og svaret er eksakt på
 * rutenettet.
 */
export function anchor(rings: Ring[], res = 2): { p: Pt; room: number; wide: number } {
  // `p` kjem ut RELATIVT til hjørnet av delen sin eigen boks, og ikkje i
  // absolutte koordinatar. Grunnen er at svaret høyrer til FORMA: to like
  // ribber har merket på same staden i seg sjølve, og då kan rekninga
  // hugsast per form. Var svaret absolutt, ville det hugsa svaret peike på
  // ein stad i den FYRSTE ribba sitt rom — og på ei form som finst fleire
  // stader i objektet hamna adressa på nabodelen eller på bert bord.
  const bb = bbox(rings[0])
  const w = Math.max(1, Math.ceil((bb.x1 - bb.x0) / res) + 1)
  const h = Math.max(1, Math.ceil((bb.y1 - bb.y0) / res) + 1)
  const mid: Pt = [(bb.x1 - bb.x0) / 2, (bb.y1 - bb.y0) / 2]
  if (w * h > 4e6) return { p: mid, room: 0, wide: 0 }
  const arr = rasterise(rings, bb.x0, bb.y0, res, w, h, true).a
  const dp = new Int32Array(w * h)
  let best = 0
  let bi = 0
  let bj = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!arr[j * w + i]) continue
      const v =
        i === 0 || j === 0
          ? 1
          : Math.min(dp[(j - 1) * w + i], dp[j * w + i - 1], dp[(j - 1) * w + i - 1]) + 1
      dp[j * w + i] = v
      if (v > best) {
        best = v
        bi = i
        bj = j
      }
    }
  }
  if (best === 0) return { p: mid, room: 0, wide: 0 }
  // kvadratet endar i (bi, bj) og er `best` celler breitt
  const ci = Math.round(bi - best / 2 + 0.5)
  const cj = Math.round(bj - best / 2 + 0.5)

  // EI CELLE ER EIT PUNKT, IKKJE EIT AREAL.
  //
  // Rasteret merkjer ei celle når SENTERET hennar ligg inne. Ei rekkje på
  // `n` slike celler lovar difor berre strekninga frå det fyrste senteret
  // til det siste — `(n − 1)` celler — og ikkje `n`. Halvcella i kvar ende
  // kan vera kva som helst.
  //
  // Kvadratet vart likevel meldt som `best · res`, ei heil celle for
  // stort. På ein del med rette kantar tok margane i `fitSize` det att; på
  // ein del som smalnar gjorde dei ikkje det, og adressa kryssa si eiga
  // kuttline. Ei kjegle med tretten ribber la ho ein millimeter utanfor.
  const rom = Math.max(0, best - 1) * res

  // OG EI RAD SEIER INGENTING OM RADA OVER.
  //
  // Ein tekst er tre gonger så brei som han er høg, so kvadratet åleine er
  // ein for streng målestokk på tvers: der det er plass til ein bokstav i
  // høgda, er det som regel plass til fleire ved sida av kvarandre. Difor
  // vert stykket gjennom delen målt òg.
  //
  // Men det vart målt gjennom SENTERRADA, og so brukt til å setje ein
  // tekst som har høgd. På ei ribbe som smalnar er rada over kortare enn
  // senterrada, og toppen av sifra stod utanfor. Difor det SMALASTE
  // stykket gjennom dei radene kvadratet dekkjer: teksten er lågare enn
  // kvadratet, so han kan ikkje nå ut av det bandet.
  const halvBest = Math.floor(Math.max(0, best - 1) / 2)
  let halv = Infinity
  for (let j = Math.max(0, cj - halvBest); j <= Math.min(h - 1, cj + halvBest); j++) {
    if (!arr[j * w + ci]) {
      halv = 0
      break
    }
    let a = ci
    let b = ci
    while (a > 0 && arr[j * w + a - 1]) a--
    while (b < w - 1 && arr[j * w + b + 1]) b++
    halv = Math.min(halv, ci - a, b - ci)
  }

  return {
    p: [(ci + 0.5) * res, (cj + 0.5) * res],
    room: rom,
    wide: 2 * (Number.isFinite(halv) ? halv : 0) * res,
  }
}
