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
import { perimeter, type Pt } from "../core"
import { contour, simplify } from "../contour"
import type { Span } from "../mesh/solid"
import type { Kropp } from "./kropp"
import type { Params } from "./params"

/** ruter langs den lengste sida av objektet, per detaljnivå */
export const DETAIL = { lav: 90, mid: 150, hog: 240 } as const
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

export type Grid = {
  k: Kropp
  p: Params
  ribs: Rib[]
  joints: number
  xs: number[]
  ys: number[]
  pitchX: number
  pitchY: number
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

type Box = {
  t: number
  half: number
  zlo: number
  zhi: number
  /** avlastingshòl i dei to innerste hjørna — hundebein eller t-bein */
  discs: { cx: number; cz: number; r: number }[]
}

/**
 * Sporet som ein boks med forteikn, pluss avlastinga.
 *
 * Ein fres har ein diameter, og eit rundt verktøy kan ikkje skjere eit
 * skarpt innerhjørne. Utan avlasting står det att ein liten kvartsirkel av
 * gods i kvart hjørne av sporet, og den kvartsirkelen er nøyaktig det som
 * hindrar at dei to ribbene går heilt saman. Difor:
 *
 *   HUNDEBEIN  eit hòl på diagonalen ut frå hjørnet. Kortaste vegen ut,
 *              og det som stel minst av godset.
 *   T-BEIN     eit hòl på sjølve sporveggen, tangert av sporbotnen.
 *              Sporet vert like djupt, og botnen står flat — ein del som
 *              skal liggje an mot botnen ligg an mot han og ikkje mot to
 *              hundebein.
 *
 * På laser er det ingenting å avlaste: stråla har ingen radius å snakke
 * om, og då står valet på «rett».
 */
function boxOf(q: Slot, p: Params): Box {
  const fromTop = q.fromTop
  const zlo = fromTop ? Math.min(q.zEnd, q.zMouth) : q.zOut
  const zhi = fromTop ? q.zOut : Math.max(q.zEnd, q.zMouth)
  const half = q.w / 2
  const discs: Box["discs"] = []
  const r = p.fres / 2
  if (p.leddtype > 0 && r > 0.05) {
    // inn i godset: sporet ligg over botnen når det kjem ovanfrå
    const sZ = fromTop ? -1 : 1
    for (const sT of [-1, 1]) {
      if (p.leddtype === 1) {
        const d = r / Math.SQRT2
        discs.push({ cx: q.t + sT * (half + d), cz: q.zEnd + sZ * d, r })
      } else {
        discs.push({ cx: q.t + sT * half, cz: q.zEnd - sZ * r, r })
      }
    }
  }
  return { t: q.t, half, zlo, zhi, discs }
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

  const boxes = slots.map((q) => boxOf(q, p))
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
        for (const c of q.discs) {
          const dd = Math.hypot(t - c.cx, z - c.cz) - c.r
          if (dd < v) v = dd
        }
      }
      g[j * (nt + 1) + i] = v
    }
  }
  return contour(g, t0, dt, nt, z0, dz, nz)
}

const NETT = new WeakMap<Kropp, Map<string, Grid>>()

export function buildGrid(k: Kropp, p: Params, cells: number): Grid {
  const key = [cells, p.ribbX, p.ribbY, p.tjukn, p.klaring, p.ledd, p.leddtype, p.fres].join(
    "|",
  )
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
  const pitchX = (s.max[0] - s.min[0]) / p.ribbX
  const pitchY = (s.max[1] - s.min[1]) / p.ribbY
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < p.ribbX; i++) xs.push(s.min[0] + (i + 0.5) * pitchX)
  for (let j = 0; j < p.ribbY; j++) ys.push(s.min[1] + (j + 0.5) * pitchY)

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

  /** kor langt sporet må gå for å koma UT på den krumme kanten */
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
    return up ? e + 3 : e - 3
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

  const mk = (axis: "x" | "y", kk: number, pos: number, slots: Slot[]): Rib => {
    const loops = profileOf(k, p, axis, pos, slots, step)
    const outlines: Pt[][] = []
    const holes: Pt[][] = []
    for (const l of loops) {
      const q = simplify(l.pts, Math.min(0.25, step / 8)) as Pt[]
      if (q.length < 3) continue
      if (l.area > 0) outlines.push(q)
      else holes.push(q)
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
      // skal ikkje målast mot foten som ligg under ei luke. Munnen på
      // sporet ligg per definisjon på kanten av sitt eige stykke.
      const rr = axis === "x" ? runsZ(pos, q.t) : runsZ(q.t, pos)
      for (const run of rr) {
        if (q.zMouth >= run[0] - 0.6 && q.zMouth <= run[1] + 0.6) return run
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
    xs,
    ys,
    pitchX,
    pitchY,
    gapX: pitchX - p.tjukn,
    gapY: pitchY - p.tjukn,
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
