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
 * det tek minutt. Denne køyrer éin gong, deterministisk, på titals
 * millisekund — og han må det, av di talet på plater står i panelet og
 * skal fylgje skyvaren medan du dreg i han. Eit tal som kjem eit minutt for
 * seint er ikkje eit tal, det er ei melding.
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

export type Slot = {
  piece: number
  sheet: number
  rot: 0 | 1 | 2 | 3
  /** affint på delen sine eigne koordinat: [a b e | c d f] */
  m: [number, number, number, number, number, number]
}

export type Packing = {
  slots: Slot[]
  sheets: number
  /** kor høgt det ligg delar på kvar plate, mm */
  used: number[]
  /** delar som ikkje fekk plass på ei tom plate heller */
  spilt: number[]
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
 *  henne. Kvadratisk kjerne, og han er separabel — to sveip i staden for
 *  eitt kvadratisk. */
function dilate(r: Raw, k: number): Raw {
  if (k <= 0) return r
  const w = r.w + 2 * k
  const h = r.h + 2 * k
  const mid = new Uint8Array(w * h)
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      if (!r.a[j * r.w + i]) continue
      const row = (j + k) * w
      for (let d = -k; d <= k; d++) mid[row + i + k + d] = 1
    }
  }
  const out = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!mid[j * w + i]) continue
      for (let d = -k; d <= k; d++) {
        const jj = j + d
        if (jj >= 0 && jj < h) out[jj * w + i] = 1
      }
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
  let ySky = 0
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
export function pack(
  pieces: readonly Piece[],
  sheetW: number,
  sheetH: number,
  gap: number,
): Packing {
  const slots: Slot[] = []
  const spilt: number[] = []
  if (!pieces.length) return { slots, sheets: 0, used: [], spilt }

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
  let res = Math.min(6, Math.max(gap / 3, Math.max(sheetW, sheetH) / 620, 1))
  if (res > gap / 3 && res < gap) res = gap
  const k = Math.max(1, Math.ceil((gap / res + 1) / 2))
  const step = Math.max(1, Math.round(3 / res))
  const SW = Math.floor(sheetW / res)
  const SH = Math.floor(sheetH / res)

  // Like delar er like: eit kuttark med femti ribber har ofte ti former.
  // Rasteret vert laga éin gong per FORM, ikkje éin gong per del.
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

  // Størst fyrst. Ein liten del finn alltid ein lomme; ein stor gjer det
  // berre medan plata framleis er open.
  const order = pieces
    .map((p, i) => ({ i, key: p.key, f: formOf(p) }))
    .sort((a, b) => b.f.cells - a.f.cells)

  /** lågaste ledige plass for denne forma på denne plata, over alle fire
   *  kvartsvingane */
  const seek = (b: Board, f: Form) => {
    let best: { rot: 0 | 1 | 2 | 3; px: number; py: number } | null = null
    for (let r = 0; r < 4; r++) {
      const m = f.masks[r]
      if (m.w > b.w || m.h > b.h) continue
      for (let px = 0; px + m.w <= b.w; px += step) {
        const py = lowest(b, m, px, step)
        if (py < 0) continue
        if (!best || py < best.py || (py === best.py && px < best.px)) {
          best = { rot: r as 0 | 1 | 2 | 3, px, py }
        }
        if (py === 0) break
      }
      // botnen til venstre er det beste som finst; er han teken, er det
      // ingen grunn til å prøve dei tre andre svingane
      if (best && best.py === 0) break
    }
    return best
  }

  const boards: Board[] = []
  for (const { i, key, f } of order) {
    let put: { s: number; rot: 0 | 1 | 2 | 3; px: number; py: number } | null = null
    // Fyrste plate som tek han. Det held dei fyrste platene fulle, og det
    // er dei ein faktisk skjer ut fyrst.
    for (let s = 0; s < boards.length && !put; s++) {
      if (boards[s].nei.has(key)) continue
      const best = seek(boards[s], f)
      if (best) put = { s, ...best }
      else boards[s].nei.add(key)
    }
    if (!put) {
      // Ei ny plate. Får han ikkje plass på ei TOM plate heller, er han
      // større enn plata, og då er det plata som er feil.
      if (f.masks.every((m) => m.w > SW || m.h > SH)) {
        spilt.push(i)
        continue
      }
      const b = board(SW, SH)
      const best = seek(b, f)
      if (!best) {
        spilt.push(i)
        continue
      }
      boards.push(b)
      put = { s: boards.length - 1, ...best }
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
    })
  }

  return {
    slots,
    sheets: boards.length,
    used: boards.map((b) => b.used * res),
    spilt,
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
