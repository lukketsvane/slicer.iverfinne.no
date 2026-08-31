/**
 * VAFFEL — ribbene og ledda.
 *
 * Ei ribbe er eit plansnitt gjennom kroppen, med spor der ho kryssar den
 * andre familien. Profilen vert lesen ut av eit felt med ei marsjerande
 * rute i staden for å skrivast ned, av di forma hennar er eit spørsmål om
 * kva grense som bit kvar — og på eit importert nett veit ingen det på
 * førehand. Ein torus gjev to stykke; ein figur med bein gjev fire; ein
 * kube gjev eitt.
 *
 * FELTET
 * Nettet er ei skalvegg og ikkje ein kropp, so avstanden til overflata må
 * lesast med strålar. To familiar strålar gjer det: éin langs ribba for
 * kvar rad, og éin på tvers for kvar kolonne. Ei rad veit då nøyaktig kvar
 * kanten ligg vassrett, og ei kolonne nøyaktig kvar han ligg loddrett — og
 * det er dei to tala den marsjerande ruta interpolerer mellom. Difor ligg
 * konturen på overflata og ikkje på næraste rutepunkt, sjølv med ei grov
 * rute.
 *
 * LEDDA
 * Halvt om halvt. X-ribbene har spor opne oppover, Y-ribbene spor opne
 * nedover, og då kan ein leggje X-familien på bordet og senke Y-familien
 * ned i han. Det er heile monteringa, og det finst ikkje ein skrue.
 *
 * Spora står i FELTET og ikkje i polygonet etterpå. Det er ikkje ein
 * snarveg forbi ein boolsk operasjon: det er den einaste måten kuttfila og
 * nettet ikkje kan kome i utakt på. Ein fres som fylgjer denne konturen
 * skjer nøyaktig den ribba biletet viser, spor, hundebein og alt.
 */
import { bbox, inRing, MIN_AREA, perimeter, type ParamBag, type Pt } from "../core"
import { contour, simplify } from "../contour"
import type { Span } from "../mesh/solid"
import type { Kropp } from "./kropp"
import { lesLaas, gridKey, type NettParams, type Params } from "./params"

/** ruter langs den lengste sida av objektet, per detaljnivå */
export const DETAIL = { lav: 90, mid: 150, hog: 240 } as const

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
 * Minste avstanden mellom to naboribber.
 *
 * Éi ribbe har ingen nabo og difor inga luke: då er heile spennet svaret,
 * som er det same som den gamle rekninga gav, og regelen som ser på luka
 * har ingenting å klage på.
 */
function luft(v: readonly number[], vidd: number): number {
  if (v.length < 2) return vidd
  let m = Infinity
  for (let i = 1; i < v.length; i++) m = Math.min(m, v[i] - v[i - 1])
  return m
}
export type DetailStep = (typeof DETAIL)[keyof typeof DETAIL]

export type Slot = {
  /** senter langs ribba, mm */
  t: number
  /** munnen på sporet */
  zMouth: number
  /** botnen i sporet */
  zEnd: number
  /** opnar sporet seg oppover? */
  fromTop: boolean
  /** sporbreidd, mm */
  w: number
  /** kor langt forbi munnen sporet må gå for å bryte gjennom over HEILE
   *  breidda si. Kanten ribba opnar seg i er krum, så eit spor som stoggar
   *  ved munnen midt i sporet står att med gods i kvar side. */
  zOut: number
}

export type Rib = {
  axis: "x" | "y"
  k: number
  /** kvar planet står, mm */
  pos: number
  /** ytterkantane. Meir enn éin tyder at ribba er delt i lause stykke. */
  outlines: Pt[][]
  holes: Pt[][]
  slots: Slot[]
  /** netto areal etter spor og hòl, mm² */
  area: number
  height: number
  width: number
  /** smalaste godset som er att gjennom eit spor, mm */
  narrow: number
  /** kuttlengd for denne ribba, mm */
  cutLen: number
}

/**
 * Kor mange ledd som fell innanfor EITT stykke av ei ribbe.
 *
 * Ei ribbe kan vera delt: eit dyr med fire bein gjev ei tverribbe i fire
 * stykke, og at RIBBA har spor seier ingenting om at akkurat dette stykket
 * har det. Sporet ligg i stykket sitt eige omriss, med munnen på kanten av
 * det og botnen inne i det.
 */
export function jointsIn(slots: Slot[], outline: Pt[]): number {
  const b = bbox(outline)
  let n = 0
  for (const q of slots) {
    // Boksen fyrst, av di han er billeg og tek dei fleste.
    if (
      q.t < b.x0 - 0.6 ||
      q.t > b.x1 + 0.6 ||
      q.zEnd < b.y0 - 0.6 ||
      q.zEnd > b.y1 + 0.6
    ) {
      continue
    }
    // Og so omrisset, av di boksen ikkje er stykket.
    //
    // Ei ribbe frå eit krumt objekt er ein boge, og boksen kring ein boge
    // er for det meste lufta under han. Sporet til nabostykket ligg i den
    // lufta, og vart talt med: ståande torus med fjorten ribber kvar veg
    // gav 424 ledd i boksane der stykka har 388.
    //
    // Punktet er eit hakk FORBI sporbotnen, der godset stykket skal bera
    // på står. Eit spor som opnar seg oppover et frå toppen, so godset
    // ligg under botnen; eit spor nedanfrå et motsett veg.
    if (inRing(outline, [q.t, q.zEnd + (q.fromTop ? -0.3 : 0.3)])) n++
  }
  return n
}

export type Grid = {
  k: Kropp
  /** Berre det rutenettet ER ein funksjon av. Sjå `NettParams`: eit
   *  hugsa rutenett kan ikkje svare på kva material du valde. */
  p: NettParams
  ribs: Rib[]
  joints: number
  /** stykke som vart kasta av di dei ikkje hang i eit einaste ledd */
  kasta: number
  xs: number[]
  ys: number[]
  gapX: number
  gapY: number
  slotW: number
}

/**
 * Signert avstand langs éin akse, lesen av stykka strålen fann.
 *
 * Positivt inne, negativt ute, og talet er avstanden til NÆRASTE kant
 * langs den aksen — ikkje til næraste punkt på flata. Nett det er poenget:
 * den marsjerande ruta interpolerer berre langs rutekantar, og langs ein
 * rutekant er dette talet eksakt.
 */
function axisDist(spans: Span[], t: number): number {
  if (!spans.length) return -1e9
  let best = -Infinity
  for (const [a, b] of spans) {
    const d =
      t >= a && t <= b
        ? Math.min(t - a, b - t)
        : -Math.min(Math.abs(t - a), Math.abs(t - b))
    if (d > best) best = d
  }
  return best
}

type Box = { t: number; half: number; zlo: number; zhi: number }

/**
 * Sporet som ein boks med forteikn.
 *
 * Her stod det ei avlasting òg: hundebein og t-bein, hòl i dei innerste
 * hjørna av sporet. Eit rundt verktøy kan ikkje skjere eit skarpt
 * innerhjørne, so ein fres treng dei. Ei laserstråle har ingen radius å
 * snakke om, og denne reiskapen skjer på laser. Avlastinga er ute, og med
 * henne ein skyvar, ein hard regel og ei korrigering i måltala.
 */
function boxOf(q: Slot): Box {
  const fromTop = q.fromTop
  return {
    t: q.t,
    half: q.w / 2,
    zlo: fromTop ? Math.min(q.zEnd, q.zMouth) : q.zOut,
    zhi: fromTop ? q.zOut : Math.max(q.zEnd, q.zMouth),
  }
}

function profileOf(
  k: Kropp,
  p: Params,
  axis: "x" | "y",
  pos: number,
  slots: Slot[],
  step: number,
) {
  const s = k.solid
  // Ruta må dekkje HEILE profilen med litt mon: ein kontur som vert klipt
  // av kanten på ruta er ei open kjede og ikkje eit polygon.
  const PAD = Math.max(4, step * 2)
  const ti = axis === "x" ? 1 : 0
  const t0 = s.min[ti] - PAD
  const t1 = s.max[ti] + PAD
  const z0 = s.min[2] - PAD
  const z1 = s.max[2] + PAD
  const nt = Math.max(24, Math.min(520, Math.ceil((t1 - t0) / step)))
  const nz = Math.max(24, Math.min(520, Math.ceil((z1 - z0) / step)))
  const dt = (t1 - t0) / nt
  const dz = (z1 - z0) / nz

  // Éin stråle per rad og éin per kolonne. Det er heile kostnaden ved ei
  // ribbe — resten er aritmetikk på ei tabell som alt ligg i minnet.
  const rows: Span[][] = new Array(nz + 1)
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * dz
    rows[j] = axis === "x" ? s.runs(1, z, pos) : s.runs(0, pos, z)
  }
  const cols: Span[][] = new Array(nt + 1)
  for (let i = 0; i <= nt; i++) {
    const t = t0 + i * dt
    cols[i] = axis === "x" ? s.runs(2, pos, t) : s.runs(2, t, pos)
  }

  const boxes = slots.map(boxOf)
  const g = new Float64Array((nt + 1) * (nz + 1))
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * dz
    const row = rows[j]
    for (let i = 0; i <= nt; i++) {
      const t = t0 + i * dt
      const dh = axisDist(row, t)
      const dv = axisDist(cols[i], z)
      // Forteiknet er SNITTET av dei to prøvene — er dei usamde, står vi
      // på ein knivsegg og skal reknast som luft. Storleiken er avstanden
      // til den næraste av dei to kantane, og aldri den fjernaste: eit
      // punkt ti millimeter frå ein kant og to frå ein annan er to
      // millimeter frå flata.
      const mag = Math.min(Math.abs(dh), Math.abs(dv))
      let v = dh > 0 && dv > 0 ? mag : -mag
      for (const q of boxes) {
        if (v <= 0) break
        const d = Math.max(Math.abs(t - q.t) - q.half, q.zlo - z, z - q.zhi)
        if (d < v) v = d
      }
      g[j * (nt + 1) + i] = v
    }
  }
  return contour(g, t0, dt, nt, z0, dz, nz)
}

const NETT = new WeakMap<Kropp, Map<string, Grid>>()

export function buildGrid(k: Kropp, p: Params, cells: number): Grid {
  const key = gridKey(p as unknown as ParamBag, cells)
  let per = NETT.get(k)
  if (!per) {
    per = new Map()
    NETT.set(k, per)
  }
  const hit = per.get(key)
  if (hit) return hit
  const v = buildGridRaw(k, p, cells)
  per.set(key, v)
  if (per.size > 4) per.delete(per.keys().next().value as string)
  return v
}

function buildGridRaw(k: Kropp, p: Params, cells: number): Grid {
  const s = k.solid
  const span = Math.max(
    s.max[0] - s.min[0],
    s.max[1] - s.min[1],
    s.max[2] - s.min[2],
    1,
  )
  const step = span / cells
  const slotW = p.tjukn + p.klaring

  // Ribbene står i CELLESENTER og ikkje på cellekantar. Ei ribbe på kanten
  // av omrisset er ei ribbe med null breidd: ho ville telje som ein del,
  // stå i kuttlista og ikkje bera noko.
  const laas = lesLaas(p.laas)
  const viddX = s.max[0] - s.min[0]
  const viddY = s.max[1] - s.min[1]
  const xs = plasser(p.ribbX, laas.x).map((t) => s.min[0] + t * viddX)
  const ys = plasser(p.ribbY, laas.y).map((t) => s.min[1] + t * viddY)

  // Same søyle vert spurd om att og om att: éin gong per kryss frå kvar
  // familie, og éin gong til av kvart spor si skuldermåling. Strålen er
  // den dyraste einskildoperasjonen, so svaret vert hugsa for dette bygget.
  const cache = new Map<string, Span[]>()
  const runsZ = (x: number, y: number): Span[] => {
    const key = x.toFixed(3) + "," + y.toFixed(3)
    let v = cache.get(key)
    if (!v) {
      v = s.runsZ(x, y)
      cache.set(key, v)
    }
    return v
  }
  const solidAt = (x: number, y: number, z: number) => {
    for (const [lo, hi] of runsZ(x, y)) if (z >= lo && z <= hi) return true
    return false
  }

  // --- ledda fyrst -----------------------------------------------------------
  // Eit ledd finst berre der begge ribbene har gods i same høgd. På eit
  // importert nett er det ikkje sjølvsagt: ein figur med to bein har
  // søyler som er tomme mellom beina, og eit spor skore der er eit spor i
  // lause lufta. Ledda må reknast FØR profilane, av di det er dei som
  // skal skjerast i profilen.
  const slotsX: Slot[][] = xs.map(() => [])
  const slotsY: Slot[][] = ys.map(() => [])
  let joints = 0
  const minLap = Math.max(2, p.tjukn)
  // Skulderen er kor mykje gods leddet må ha på kvar side av sporet.
  //
  // Det er ikkje eit styrkekrav — det er eit kravu om at sporet skal GRIPE
  // og ikkje kappe av ein flis langs kanten. Difor er han nokre få
  // millimeter og ikkje ei heil platetjukn: eit tak på seks, av di ein
  // skulder på seks millimeter og ein på seksten held nøyaktig like godt,
  // medan kravet om seksten kastar heile den ytste ribba ut av rutenettet
  // på eit stort objekt — og ei ribbe utan eit einaste ledd er ei laus
  // plate i eska.
  const shoulder = slotW / 2 + Math.min(6, Math.max(2, p.tjukn / 2))

  const room = (axis: "x" | "y", rpos: number, t: number, zTest: number) => {
    const S = 7
    for (let q = -S; q <= S; q++) {
      const tt = t + (q / S) * shoulder
      const ok =
        axis === "x" ? solidAt(rpos, tt, zTest) : solidAt(tt, rpos, zTest)
      if (!ok) return false
    }
    return true
  }

  /**
   * Kor langt sporet må gå for å koma UT på den krumme kanten.
   *
   * Kanten ribba opnar seg i er krum, so eit spor som stoggar nøyaktig
   * ved munnen står att med gods i kvar side: munnen er målt midt i
   * sporet, og kanten ligg lenger ute eit par millimeter til sidene.
   * Difor vert kanten lesen tre stader tvers over sporbreidda, og sporet
   * går til den ytste av dei, pluss tre millimeter.
   *
   * MEN DET MÅ ALDRI NÅ INN I NABOSTYKKET.
   *
   * Ei søyle kan treffe kroppen fleire gonger: ein torus som står har ein
   * nedre og ein øvre boge, ein hest har eit bein under ein kropp. Og
   * tvers over sporbreidda kan topologien BYTE — ein millimeter til sida
   * kan dei to stykka ha runne saman til eitt. Les ein då ytterkanten av
   * den søyla, får eit ledd i det eine stykket eit spor som går heilt
   * gjennom det andre, og ribba vert saga i to i staden for å få eit
   * hakk. Målt på ein torus som står: 72 spor gjekk forbi, det verste 107
   * mm på eit objekt som er 150 mm høgt, og stykka som fall av vart lause
   * plater.
   *
   * Difor er svaret klemt inn i LUFTA mellom stykka: sporet får gå til
   * midt i glipa og ikkje ein millimeter lenger. Gjennom luft skjer det
   * ingenting — det er nabostykket det ikkje har noko i å gjere.
   */
  const clear = (
    axis: "x" | "y",
    rpos: number,
    t: number,
    up: boolean,
    fall: number,
  ) => {
    let e = up ? -Infinity : Infinity
    for (let q = -1; q <= 1; q++) {
      const tt = t + q * (slotW / 2)
      const rr = axis === "x" ? runsZ(rpos, tt) : runsZ(tt, rpos)
      if (!rr.length) continue
      const pick = up ? rr[rr.length - 1][1] : rr[0][0]
      e = up ? Math.max(e, pick) : Math.min(e, pick)
    }
    if (!Number.isFinite(e)) e = fall
    e = up ? e + 3 : e - 3

    // Glipa over eller under leddet sitt eige stykke, i leddet si eiga
    // søyle. `fall` er munnen, so stykket som inneheld han er stykket.
    const eiga = axis === "x" ? runsZ(rpos, t) : runsZ(t, rpos)
    let grense = up ? Infinity : -Infinity
    for (let i = 0; i < eiga.length; i++) {
      const [lo, hi] = eiga[i]
      if (fall < lo - 0.6 || fall > hi + 0.6) continue
      const nabo = up ? eiga[i + 1] : eiga[i - 1]
      if (nabo) grense = up ? (hi + nabo[0]) / 2 : (lo + nabo[1]) / 2
      break
    }
    return up ? Math.min(e, grense) : Math.max(e, grense)
  }

  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) {
      // X-ribba si søyle ved t = y og Y-ribba si ved t = x er den SAME
      // søyla (x, y). Difor eitt oppslag og ikkje to, og overlappet av eit
      // stykke med seg sjølv er stykket.
      for (const [lo, hi] of runsZ(xs[i], ys[j])) {
        if (hi - lo < minLap) continue
        const zm = lo + p.ledd * (hi - lo)
        // Leddet treng gods på BEGGE sider av sporet, i begge ribbene, i
        // den høgda sporet står i. Utan det kappar sporet av ein flis
        // langs kanten, og ein flis er ikkje eit grep.
        if (!room("x", xs[i], ys[j], (zm + hi) / 2)) continue
        if (!room("y", ys[j], xs[i], (lo + zm) / 2)) continue
        slotsX[i].push({
          t: ys[j],
          zMouth: hi,
          zEnd: zm,
          fromTop: true,
          w: slotW,
          zOut: clear("x", xs[i], ys[j], true, hi),
        })
        slotsY[j].push({
          t: xs[i],
          zMouth: lo,
          zEnd: zm,
          fromTop: false,
          w: slotW,
          zOut: clear("y", ys[j], xs[i], false, lo),
        })
        joints++
      }
    }
  }
  for (const l of slotsX) l.sort((u, v) => u.t - v.t)
  for (const l of slotsY) l.sort((u, v) => u.t - v.t)

  let kasta = 0

  const mk = (axis: "x" | "y", kk: number, pos: number, slots: Slot[]): Rib => {
    const loops = profileOf(k, p, axis, pos, slots, step)
    let outlines: Pt[][] = []
    let holes: Pt[][] = []
    for (const l of loops) {
      const q = simplify(l.pts, Math.min(0.25, step / 8)) as Pt[]
      if (q.length < 3) continue
      if (l.area > 0) outlines.push(q)
      else holes.push(q)
    }

    /**
     * KVA SOM IKKJE SKAL VERA MED.
     *
     * To ting, og begge vert avgjorde HER — i rutenettet, ikkje i
     * kuttlista. Blir dei avgjorde seinare, står det att stykke i biletet
     * som aldri kjem i fila, og då er ikkje biletet lenger eit svar på kva
     * maskina gjer. Nett det var feilen: små flis flaut i lufta på skjermen
     * medan uttaket for lengst hadde sila dei bort.
     *
     *   FLIS    under `MIN_AREA`. Går alltid bort.
     *   LAUST   eit stykke utan eit einaste ledd. Det heng ikkje i noko:
     *           på ein hest er det øyretippen og ein bit av ein hov, der
     *           kroppen er tynnare enn luka mellom ribbene og ingen ribbe
     *           frå den andre familien møter han. `lause` avgjer om han
     *           skal skjerast likevel.
     */
    const holesOf = (o: Pt[]) =>
      outlines.length === 1 ? holes : holes.filter((h) => inRing(o, h[0]))
    const netto = (o: Pt[]) => {
      let a = Math.abs(shoe(o))
      for (const h of holesOf(o)) a -= Math.abs(shoe(h))
      return a
    }
    const heil = outlines.filter((o) => {
      if (netto(o) < MIN_AREA) return false
      if (p.lause && jointsIn(slots, o) === 0) {
        kasta++
        return false
      }
      return true
    })
    if (heil.length !== outlines.length) {
      holes = holes.filter((h) => heil.some((o) => inRing(o, h[0])))
      outlines = heil
    }

    let area = 0
    let cut = 0
    for (const o of outlines) {
      area += Math.abs(shoe(o))
      cut += perimeter(o)
    }
    for (const h of holes) {
      area -= Math.abs(shoe(h))
      cut += perimeter(h)
    }
    let zMax = 0
    let tMin = Infinity
    let tMax = -Infinity
    for (const o of outlines) {
      for (const q of o) {
        if (q[1] > zMax) zMax = q[1]
        if (q[0] < tMin) tMin = q[0]
        if (q[0] > tMax) tMax = q[0]
      }
    }
    const r: Rib = {
      axis,
      k: kk,
      pos,
      outlines,
      holes,
      slots,
      area,
      height: zMax,
      width: Number.isFinite(tMin) ? tMax - tMin : 0,
      narrow: 0,
      cutLen: cut,
    }
    r.narrow = narrowOf(r, (q) => {
      // Stykket sporet står i, ikkje heile ribba: eit spor i overkroppen
      // skal ikkje målast mot foten som ligg under ei luke.
      //
      // Botnen i sporet peikar ut stykket, ikkje munnen. Munnen ligg per
      // definisjon PÅ kanten av stykket sitt — og ein kropp som står på
      // bein har eit stykke som sluttar nett der det neste byrjar. Då
      // svarar munnen på to stykke, og lista vert lesen nedanfrå: for eit
      // spor som opnar seg nedover fann han beinet under i staden for
      // kroppen sporet står i, og godset kom ut NEGATIVT — ribba vart
      // spegla i staden for målt. Botnen ligg `ledd` inne i sitt eige
      // stykke, og kan ikkje svare på noko anna. Difor heller ingen
      // slingring her: ho er det som gjorde munnen tvitydig.
      const rr = axis === "x" ? runsZ(pos, q.t) : runsZ(q.t, pos)
      for (const run of rr) {
        if (q.zEnd >= run[0] && q.zEnd <= run[1]) return run
      }
      return rr.length ? rr[rr.length - 1] : null
    })
    return r
  }

  const ribs: Rib[] = []
  for (let i = 0; i < xs.length; i++) ribs.push(mk("x", i, xs[i], slotsX[i]))
  for (let j = 0; j < ys.length; j++) ribs.push(mk("y", j, ys[j], slotsY[j]))

  return {
    k,
    p,
    ribs,
    joints,
    kasta,
    xs,
    ys,
    // LUKA ER MÅLT MELLOM NABOAR, IKKJE REKNA AV EIT SNITT.
    //
    // Ho var `vidd / ribbX - tjukn` — spennet delt på talet. Det er den
    // same luka overalt berre so lenge ribbene står jamt, og det gjer dei
    // ikkje lenger når du har låst ei av dei. Ei snittluke ville meldt
    // fire millimeter der to ribber faktisk stod ein halv frå kvarandre,
    // og det er nett den kollisjonen regelen finst for å fange.
    //
    // Står ribbene jamt, gjev dei to reknestykka nøyaktig same talet.
    gapX: luft(xs, viddX) - p.tjukn,
    gapY: luft(ys, viddY) - p.tjukn,
    slotW,
  }
}

const shoe = (poly: Pt[]) => {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const b = poly[(i + 1) % poly.length]
    a += poly[i][0] * b[1] - b[0] * poly[i][1]
  }
  return a / 2
}

/**
 * Kor mykje gods ribba har att på det tynnaste, målt loddrett gjennom
 * sporet. Det er dette talet som avgjer om ho knekk når nokon tek i —
 * ikkje høgda hennar, og ikkje breidda. Eit spor som opnar seg oppover et
 * frå toppen, so det som ber er det som ligg UNDER sporbotnen; eit spor
 * nedanfrå et motsett veg.
 */
function narrowOf(r: Rib, span: (s: Slot) => Span | null): number {
  let worst = Infinity
  for (const s of r.slots) {
    const q = span(s)
    if (!q) continue
    const left = s.fromTop ? s.zEnd - q[0] : q[1] - s.zEnd
    if (left < worst) worst = left
  }
  return Number.isFinite(worst) ? worst : r.height
}
