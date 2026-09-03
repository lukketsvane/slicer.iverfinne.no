/**
 * SLICERMAN — snittet: plana vert ribber, ribbene får spor, og stykka vert
 * delar.
 *
 * Ei ribbe er eit plansnitt gjennom kroppen, med spor der ho kryssar eit
 * anna plan. Profilen vert lesen ut av eit felt med ei marsjerande rute i
 * staden for å skrivast ned, av di forma hennar er eit spørsmål om kva
 * grense som bit kvar — og på eit importert nett veit ingen det på
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
 * rute. Eit skrått plan har ingen akse å skyte langs; då vert kroppen
 * snudd (sjå `vend`) so planet ER ein akse.
 *
 * LEDDA
 * Kjem av at to plan kryssar kvarandre i rommet, ikkje av at rader møter
 * kolonnar. Lina dei deler går gjennom begge profilane; der begge har gods
 * langs henne, er det eit ledd. Halvt om halvt: den eine ribba får sporet
 * frå den eine enden av godset, den andre frå den andre, og kva for ei som
 * får kva kjem av MONTERINGA — sjå nedst.
 *
 * Spora står i FELTET og ikkje i polygonet etterpå. Det er ikkje ein
 * snarveg forbi ein boolsk operasjon: det er den einaste måten kuttfila og
 * nettet ikkje kan kome i utakt på. Det same gjeld streka handa har
 * teikna.
 */
import { bbox, inRing, MATERIALS, MIN_AREA, perimeter, shoelace, type Material, type ParamBag, type Pt, type Vec3 } from "./core"
import { contour, simplify } from "./contour"
import type { Solid, Span } from "./mesh/solid"
import { vend, type Kropp } from "./kropp"
import { akser, cross, dot, kryss as kryssAv, len3, lesPlan, mul3, skrivPlan, type Plan, type Ramme, type Strek } from "./plan"
import { lesDeling, leddNokkel, snittKey, type Params } from "./params"

/**
 * Ruter langs den lengste sida av objektet, per detaljnivå.
 *
 * Ruta er ikkje presisjonen — radene og kolonnane les kanten NØYAKTIG med
 * strålar, og den marsjerande ruta interpolerer mellom to eksakte tal — men
 * ho er kor tett kanten vert punktprøvd, og det ser du: ein figur på fire
 * hundre og femti millimeter fekk fem millimeters celler på det låge
 * nivået, og fem millimeter er trappetrinn du kan telje på skjermen.
 *
 * Prisen er nesten berre i den marsjerande ruta: på ein kropp av seks
 * hundre tusen trekantar med åtte og tretti plan kosta eit heilt snitt 292
 * ms ved nitti ruter, 463 ved hundre og femti og 743 ved to hundre og
 * tjue. Det midtre nivået er det filene vert skorne på, og no det same som
 * skjermen syner: to millimeters celler på ein halvmeter.
 */
export const DETAIL = { lav: 120, mid: 220, hog: 320 } as const
export type DetailStep = (typeof DETAIL)[keyof typeof DETAIL]

export type Spor = {
  /** lina leddet ligg på, i profilen si ramme: eit punkt og ei einingsretning */
  p: Pt
  d: Pt
  /** munnen, botnen og utgangen, som avstand langs d frå p. Utgangen ligg
   *  forbi munnen: kanten ribba opnar seg i er krum, og eit spor som stoggar
   *  ved munnen midt i sporet står att med gods i kvar side. */
  munn: number
  botn: number
  ut: number
  /** sporbreidd på tvers, mm — plata delt på sinus til vinkelen mellom plana */
  w: number
  /** planet på den andre sida av leddet */
  mot: number
}

export type Ribbe = {
  plan: Plan
  /** ramma profilen står i: o er foten av planet, so `ut(r, q)` er punktet */
  r: Ramme
  /**
   * PLANET SITT EIGE PUNKT I PROFILEN SI RAMME, millimeter.
   *
   * Streka ligg kring dette punktet, og det er den einaste vegen frå ein
   * stad i teikninga attende til planet si ramme. Det kan ikkje reknast om
   * att på teiknetråden: `plan.ts` sin `ramme` har `o` som punktet sjølv,
   * medan snittinga byggjer ramma med `o = n·d` — foten — og legg dette
   * til for hand. Dei to er ikkje same tal, og to sanningar om same
   * profilen er nett det denne fila finst for å hindre.
   */
  nullpkt: Pt
  /** ytterkantane. Meir enn éin tyder at ribba er delt i lause stykke. */
  outlines: Pt[][]
  holes: Pt[][]
  /** profilen FØR spora: ringane ledda vart lesne av. Vaktene spør dei. */
  raa: Pt[][]
  spor: Spor[]
  /** netto areal etter spor og hòl, mm² */
  area: number
  /** smalaste godset som er att gjennom eit spor, mm */
  narrow: number
  cutLen: number
}

/**
 * MONTERINGA, LESEN AV KRYSSA.
 *
 * Ein del med spor kan berre skuvast inn langs spora sine. Har han ledd
 * mot fleire delar som alt ligg, må alle dei linene vera parallelle — ei
 * plate kan ikkje gå to vegar. Rekkjefylgja er lista si: den seinare delen
 * kjem inn på dei tidlegare, langs den felles lina, og helst nedover.
 * Sporet på den som kjem opnar seg i fartsretninga; sporet på den som ligg
 * opnar seg mot han. Det er nøyaktig det rutenettet gjorde — X-familien
 * med spora opp, Y-familien senka ned i han — og det held for alle sett
 * der kvar del har éi retning inn.
 *
 * `brot` er delane som ikkje har det: to ledd mot alt lagde delar som
 * ikkje er parallelle. Sporet vert skore likevel, og regelen seier frå.
 */
export type Montering = {
  /** namna, i den rekkjefylgja delane kjem inn */
  orden: number[]
  /** fartsretninga for kvar del som kjem inn på nokon; null for dei som berre ligg */
  retning: Record<number, Vec3 | null>
  brot: number[]
}

export type Snitt = {
  k: Kropp
  ribber: Ribbe[]
  ledd: number
  /** stykke som vart kasta av di dei ikkje hang i eit einaste ledd */
  kasta: number
  slotW: number
  /** minste opning mellom to nesten parallelle plan, mm */
  minGap: number
  montering: Montering
}

export type Del = {
  /** forma. To delar med same id er den same delen */
  id: string
  /** det som vert gravert: namnet på planet, med bokstav om planet er delt — «3», «3a» */
  adr: string
  plan: number
  outline: Pt[]
  holes: Pt[][]
  t: number
  area: number
  mass: number
  cutLen: number
  /** kor mange ledd som fell innanfor akkurat dette stykket */
  joints: number
}

export type DelListe = {
  delar: Del[]
  ids: string[]
  area: number
  mass: number
  cutLen: number
  /** delar utan eit einaste ledd — laus plate i eska */
  lause: number
}

// =============================================================================
// PROFILEN AV EITT PLAN
// =============================================================================
/**
 * Signert avstand langs éin akse, lesen av stykka strålen fann. Positivt
 * inne, negativt ute, og talet er avstanden til NÆRASTE kant langs den
 * aksen — langs ein rutekant er dette talet eksakt.
 */
function axisDist(spans: Span[], t: number): number {
  if (!spans.length) return -1e9
  let best = -Infinity
  for (const [a, b] of spans) {
    const d = t >= a && t <= b ? Math.min(t - a, b - t) : -Math.min(Math.abs(t - a), Math.abs(t - b))
    if (d > best) best = d
  }
  return best
}

type Rute = {
  t0: number
  dt: number
  nt: number
  z0: number
  dz: number
  nz: number
  rows: Span[][]
  cols: Span[][]
}

/**
 * Éin stråle per rad og éin per kolonne, i den snudde kroppen der planet
 * er w = d. Det er heile kostnaden ved ei ribbe — resten er aritmetikk på
 * ei tabell som alt ligg i minnet.
 */
function ruteAv(s: Solid, d: number, step: number, former: readonly Form[] = []): Rute {
  // Ruta må dekkje HEILE profilen med litt mon: ein kontur som vert klipt
  // av kanten på ruta er ei open kjede og ikkje eit polygon. Og profilen
  // er ikkje berre kroppen: eit strek som tjuknar eit bein rekk gjerne ut
  // forbi boksen kring nettet, og vart klipt der — plata kom ut delt i to
  // av eit skrått band der kjeda vart lukka på måfå.
  const PAD = Math.max(4, step * 2)
  let t0 = s.min[0]
  let t1 = s.max[0]
  let z0 = s.min[1]
  let z1 = s.max[1]
  for (const f of former) {
    t0 = Math.min(t0, f.bx0)
    t1 = Math.max(t1, f.bx1)
    z0 = Math.min(z0, f.by0)
    z1 = Math.max(z1, f.by1)
  }
  t0 -= PAD
  t1 += PAD
  z0 -= PAD
  z1 += PAD
  const nt = Math.max(24, Math.min(520, Math.ceil((t1 - t0) / step)))
  const nz = Math.max(24, Math.min(520, Math.ceil((z1 - z0) / step)))
  const dt = (t1 - t0) / nt
  const dz = (z1 - z0) / nz
  const rows: Span[][] = new Array(nz + 1)
  for (let j = 0; j <= nz; j++) rows[j] = s.runs(0, z0 + j * dz, d)
  const cols: Span[][] = new Array(nt + 1)
  for (let i = 0; i <= nt; i++) cols[i] = s.runs(1, d, t0 + i * dt)
  return { t0, dt, nt, z0, dz, nz, rows, cols }
}

/** ytterkanten til eit strek, millimeter: det einaste ruta treng vite om han */
type Kasse = { bx0: number; bx1: number; by0: number; by1: number }
/** EIN STREK I MILLIMETER, i profilen si ramme: ein midt og ei halvside. */
type Form = Kasse & { gods: boolean; rund: boolean; cx: number; cy: number; hw: number; hh: number; c: number; s: number }

/**
 * EIN STREK MÅ KOME INN I FELTET SOM EI EKTE SIGNERT AVSTAND, og aldri som
 * eit merke («inne er −e, ute er +e»). `contour` reknar ut kvar kanten går
 * ved å INTERPOLERE mellom to hjørneverdiar; med ein konstant ±e hamnar
 * kvar einaste kryssing midt på ein cellekant, og alt du teikna kjem ut med
 * ei fem og førti graders trappe på kvart hjørne. Det gjeld den neste
 * forma nokon legg til her like mykje som dei tre som står.
 *
 * Signert avstand til ein handteikna strek: negativt inne. Rektangelet er
 * eksakt på sidene og ei tilnærming i hjørna; ellipsen er skalert radius.
 * Begge er nøyaktige der det tel — på nullstaden ruta leitar etter.
 */
function formDist(f: Form, x: number, y: number): number {
  const dx = x - f.cx
  const dy = y - f.cy
  const a = dx * f.c + dy * f.s
  const b = -dx * f.s + dy * f.c
  if (!f.rund) return Math.max(Math.abs(a) - f.hw, Math.abs(b) - f.hh)
  const r = Math.hypot(a / f.hw, b / f.hh)
  return (r - 1) * Math.min(f.hw, f.hh)
}

/**
 * EIN STREK UT AV PLANET SI RAMME OG INN I MILLIMETER. Streka ligg kring
 * planet sitt eige punkt, so `ou`/`ov` er nullpunktet og `S` er storleiken
 * dei er brøkar av. Boksen vert rekna her, éin gong, av di ruta treng han
 * FØR feltet finst: eit merke som stikk utanfor kroppen og ikkje er med i
 * ruta vert klipt av kanten hennar, og ei open kjede vert lukka på måfå.
 */
function formAv(st: Strek, ou: number, ov: number, S: number): Form {
  const gods = st.slag === "gods"
  const a = (st.a * Math.PI) / 180
  const c = Math.cos(a)
  const si = Math.sin(a)
  const cx = ou + st.x * S
  const cy = ov + st.y * S
  const hw = (st.w * S) / 2
  const hh = (st.h * S) / 2
  const rx = hw * Math.abs(c) + hh * Math.abs(si)
  const ry = hw * Math.abs(si) + hh * Math.abs(c)
  return { gods, rund: st.form === "rund", cx, cy, hw, hh, c, s: si, bx0: cx - rx, bx1: cx + rx, by0: cy - ry, by1: cy + ry }
}

type Boks = { px: number; py: number; dx: number; dy: number; lo: number; hi: number; half: number }

/** sporet som ein vend boks: langs lina frå botn til utgang, halv breidd på tvers */
function boksAv(q: Spor): Boks {
  return {
    px: q.p[0],
    py: q.p[1],
    dx: q.d[0],
    dy: q.d[1],
    lo: Math.min(q.botn, q.ut),
    hi: Math.max(q.botn, q.ut),
    half: q.w / 2,
  }
}

/**
 * Feltet: kroppen frå strålane, so godset handa la til, so hòla handa
 * skar, so spora. Rekkjefylgja er ei avgjerd: eit spor skal skjere
 * gjennom gods du la til, og eit hòl du skar skal ikkje fyllast att av
 * eit spor.
 */
function felt(ru: Rute, former: Form[], spor: Spor[]) {
  const { t0, dt, nt, z0, dz, nz, rows, cols } = ru
  const boksar = spor.map(boksAv)
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
      // til den næraste av dei to kantane, og aldri den fjernaste.
      const mag = Math.min(Math.abs(dh), Math.abs(dv))
      let v = dh > 0 && dv > 0 ? mag : -mag
      // Lista står som ho står: rekkjefylgja ER geometrien — eit gods etter
      // eit hòl fyller det att, og eit hòl etter eit gods skjer i det.
      for (const f of former) {
        const d = formDist(f, t, z)
        v = f.gods ? Math.max(v, -d) : Math.min(v, d)
      }
      if (v > 0) {
        for (const b of boksar) {
          const rx = t - b.px
          const ry = z - b.py
          const a = rx * b.dx + ry * b.dy
          const c = Math.abs(-rx * b.dy + ry * b.dx)
          const d = Math.max(c - b.half, b.lo - a, a - b.hi)
          if (d < v) v = d
          if (v <= 0) break
        }
      }
      g[j * (nt + 1) + i] = v
    }
  }
  return contour(g, t0, dt, nt, z0, dz, nz)
}

// =============================================================================
// LINER GJENNOM RINGAR
// =============================================================================
/**
 * Kvar ei line går gjennom gods: stykka [t0, t1] langs `d` frå `p`, lesne
 * av alle ringane med partal/oddetal. Eit hòl er ein ring, og ei line som
 * går inn i eit hòl går ut av godset — det er det same talet. Halvopen
 * regel på hjørna, so ei line gjennom eit hjørne tel éin gong.
 */
export function stykkeLangs(ringar: readonly Pt[][], p: Pt, d: Pt): Span[] {
  const nx = -d[1]
  const ny = d[0]
  const ts: number[] = []
  for (const ring of ringar) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]
      const b = ring[i]
      const sa = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny
      const sb = (b[0] - p[0]) * nx + (b[1] - p[1]) * ny
      if (sa > 0 === sb > 0) continue
      const ta = (a[0] - p[0]) * d[0] + (a[1] - p[1]) * d[1]
      const tb = (b[0] - p[0]) * d[0] + (b[1] - p[1]) * d[1]
      ts.push(ta + ((tb - ta) * sa) / (sa - sb))
    }
  }
  ts.sort((u, v) => u - v)
  const ut: Span[] = []
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-6) ut.push([ts[i], ts[i + 1]])
  return ut
}

/** snittet av to stykkelister */
function felles(a: Span[], b: Span[]): Span[] {
  const ut: Span[] = []
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0)
      const hi = Math.min(a1, b1)
      if (hi > lo) ut.push([lo, hi])
    }
  }
  return ut
}

/** ligg punktet i gods: i eit oddetal ringar */
function iGods(ringar: readonly Pt[][], q: Pt): boolean {
  let n = 0
  for (const r of ringar) if (inRing(r, q)) n++
  return n % 2 === 1
}

// =============================================================================
// SNITTET
// =============================================================================
const NETT = new WeakMap<Kropp, Map<string, Snitt>>()

export function buildSnitt(k: Kropp, p: Params, cells: number): Snitt {
  const key = snittKey(p as unknown as ParamBag, cells)
  let per = NETT.get(k)
  if (!per) {
    per = new Map()
    NETT.set(k, per)
  }
  const hit = per.get(key)
  if (hit) return hit
  const v = buildSnittRaw(k, p, cells)
  per.set(key, v)
  if (per.size > 4) per.delete(per.keys().next().value as string)
  return v
}

type Raa = {
  plan: Plan
  r: Ramme
  /** planet sitt eige punkt i ramma — sjå `Ribbe.nullpkt` */
  nullpkt: Pt
  d: number
  sol: Solid
  ru: Rute
  former: Form[]
  /** ringane utan spor: det ledda vert lesne av */
  ringar: Pt[][]
  spor: Spor[]
}

/** fyrste komponenten som ikkje er null skal vera positiv, so den same
 *  lina alltid har den same retninga, same kva plan som spurde */
function kanonisk(d: Vec3): Vec3 {
  for (const c of d) {
    if (Math.abs(c) > 1e-6) return c < 0 ? mul3(d, -1) : d
  }
  return d
}

function buildSnittRaw(k: Kropp, p: Params, cells: number): Snitt {
  const s = k.solid
  const span = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2], 1)
  const step = span / cells
  const slotW = p.tjukn + p.klaring
  /** delingar handa har sett, per ledd. Tom er «alle som skyvaren seier». */
  const handDeling = lesDeling(p.deling)
  const plan = lesPlan(p.plan)

  // --- kvart plan for seg: ramma, strålane og profilen utan spor ---------
  const raa: Raa[] = plan.map((pl) => {
    const { u, v } = akser(pl.n)
    const o: Vec3 = [
      s.min[0] + pl.o[0] * (s.max[0] - s.min[0]),
      s.min[1] + pl.o[1] * (s.max[1] - s.min[1]),
      s.min[2] + pl.o[2] * (s.max[2] - s.min[2]),
    ]
    const d = dot(o, pl.n)
    const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v }
    const sol = vend(k, pl.n)
    const S = p.storleik
    // streka ligg kring planet sitt eige punkt, i planet si ramme
    const ou = dot(o, u)
    const ov = dot(o, v)
    const former: Form[] = pl.strek.map((st: Strek) => formAv(st, ou, ov, S))
    const ru = ruteAv(sol, d, step, former)
    const ringar = felt(ru, former, []).map((l) => l.pts as Pt[])
    return { plan: pl, r, d, sol, ru, former, ringar, spor: [], nullpkt: [ou, ov] as Pt }
  })

  // --- ledda -------------------------------------------------------------
  // Eit ledd finst berre der begge plana har gods langs den same lina. Ledda
  // må reknast FØR profilane, av di det er dei som skal skjerast i profilen.
  const minLap = Math.max(2, p.tjukn)
  // Skulderen er kor mykje gods leddet må ha på kvar side av sporet. Ikkje
  // eit styrkekrav — eit krav om at sporet skal GRIPE og ikkje kappe av ein
  // flis langs kanten. Nokre få millimeter utanfor sporet slik det faktisk
  // vert, breitt eller smalt: eit tak på seks, av di seksten ville kasta
  // den ytste ribba ut av eit stort objekt.
  const skulder = (w: number) => w / 2 + Math.min(6, Math.max(2, p.tjukn / 2))
  let ledd = 0
  const retning: Record<number, Vec3 | null> = {}
  const brot: number[] = []
  const til2 = (r: Ramme, q: Vec3): Pt => [dot(q, r.u), dot(q, r.v)]

  /** gods på begge sider av sporet, i den høgda sporet står i */
  const rom = (a: Raa, p0: Pt, d0: Pt, t: number, sw: number) => {
    const S = 7
    for (let q = -S; q <= S; q++) {
      const w = (q / S) * sw
      if (!iGods(a.ringar, [p0[0] + d0[0] * t - d0[1] * w, p0[1] + d0[1] * t + d0[0] * w])) return false
    }
    return true
  }

  /**
   * Kor langt sporet må gå for å koma UT på den krumme kanten: kanten lesen
   * tre stader tvers over sporbreidda, sporet går til den ytste av dei pluss
   * tre millimeter. MEN ALDRI INN I NABOSTYKKET: ei line kan gå gjennom
   * kroppen fleire gonger — ein torus som står, eit bein under ein kropp —
   * og då er svaret klemt inn i lufta mellom stykka, midt i glipa.
   */
  const klar = (a: Raa, p0: Pt, d0: Pt, munn: number, opp: boolean, w: number) => {
    let e = opp ? -Infinity : Infinity
    for (let q = -1; q <= 1; q++) {
      const off = q * (w / 2)
      const st = stykkeLangs(a.ringar, [p0[0] - d0[1] * off, p0[1] + d0[0] * off], d0)
      for (const [lo, hi] of st) {
        if (munn < lo - 0.6 || munn > hi + 0.6) continue
        e = opp ? Math.max(e, hi) : Math.min(e, lo)
      }
    }
    if (!Number.isFinite(e)) e = munn
    e = opp ? e + 3 : e - 3
    const eiga = stykkeLangs(a.ringar, p0, d0)
    let grense = opp ? Infinity : -Infinity
    for (let i = 0; i < eiga.length; i++) {
      const [lo, hi] = eiga[i]
      if (munn < lo - 0.6 || munn > hi + 0.6) continue
      const nabo = opp ? eiga[i + 1] : eiga[i - 1]
      if (nabo) grense = opp ? (hi + nabo[0]) / 2 : (lo + nabo[1]) / 2
      break
    }
    return opp ? Math.min(e, grense) : Math.max(e, grense)
  }

  for (let j = 1; j < raa.length; j++) {
    const B = raa[j]
    let felt3: Vec3 | null = null
    for (let i = 0; i < j; i++) {
      const A = raa[i]
      const x = kryssAv(A.r, B.r)
      if (!x) continue
      const d3 = kanonisk(x.d)
      // helst nedover; på ei vassrett line er retninga eit val, og valet
      // er det same kvar gong
      const retn = Math.abs(d3[2]) > 0.3 ? (d3[2] > 0 ? -1 : 1) : -1
      const pA = til2(A.r, x.p)
      const dA = til2(A.r, d3)
      const pB = til2(B.r, x.p)
      const dB = til2(B.r, d3)
      const runs = felles(stykkeLangs(A.ringar, pA, dA), stykkeLangs(B.ringar, pB, dB))
      const w = slotW / x.sin
      let fann = false
      let treff = 0
      for (const [lo, hi] of runs) {
        if (hi - lo < minLap) continue
        /**
         * DELINGA: skyvaren for heile objektet, eller handa for DETTE
         * leddet. Eitt tal styrer BEGGE spora — A får botnen sin her og B
         * får den same — so eit djupare spor i den eine ER eit grunnare i
         * den andre. Det er ikkje ein regel som held dei i lag; det er den
         * same lina, lesen frå kvar si side.
         *
         * Nummeret er kva møte på kryssingslina det er, talt over dei som
         * VART LEDD: eit overlapp som er for kort til å bere eit ledd er
         * ikkje eit ledd, og skal ikkje flytte namnet på dei som kjem etter.
         */
        const kv = handDeling.get(leddNokkel(A.plan.id, B.plan.id, treff++))
        const zm = lo + (kv ?? p.ledd) * (hi - lo)
        // B kjem inn langs retn·d: munnen hans er i den enden han går mot,
        // og A sin munn er der B kjem frå
        const munnB = retn < 0 ? lo : hi
        const munnA = retn < 0 ? hi : lo
        if (!rom(A, pA, dA, (zm + munnA) / 2, skulder(w))) continue
        if (!rom(B, pB, dB, (zm + munnB) / 2, skulder(w))) continue
        A.spor.push({ p: pA, d: dA, munn: munnA, botn: zm, ut: klar(A, pA, dA, munnA, munnA > zm, w), w, mot: B.plan.id })
        B.spor.push({ p: pB, d: dB, munn: munnB, botn: zm, ut: klar(B, pB, dB, munnB, munnB > zm, w), w, mot: A.plan.id })
        ledd++
        fann = true
      }
      if (!fann) continue
      const m = mul3(d3, retn)
      if (!felt3) felt3 = m
      else if (dot(felt3, m) < Math.cos((3 * Math.PI) / 180) && !brot.includes(B.plan.id)) brot.push(B.plan.id)
    }
    retning[B.plan.id] = felt3
  }
  if (raa.length) retning[raa[0].plan.id] = null

  // --- profilane, no med spor ----------------------------------------------
  /**
   * KOR LANGT KUTTET FÅR VIKE FRÅ PROFILEN. Ruta gjev punkt på kvar einaste
   * rutekant, dei fleste på ei rett line; ein åttedels rutesteg er under ei
   * snittbreidd, so det er ei opprydding og ikkje eit val. `forenkl` er
   * valet, som eit golv over det.
   */
  const tol = Math.max(Math.min(0.25, step / 8), p.forenkl)
  /** taket for småhòl, som areal: eit hòl er ein ring, og ringen er rund */
  const minHol = Math.PI * (p.hol / 2) ** 2
  let kasta = 0

  const ribber: Ribbe[] = raa.map((a) => {
    a.spor.sort((u, v) => u.munn - v.munn)
    const loops = felt(a.ru, a.former, a.spor)
    let outlines: Pt[][] = []
    let holes: Pt[][] = []
    for (const l of loops) {
      const q = simplify(l.pts, tol) as Pt[]
      if (q.length < 3) continue
      if (l.area > 0) outlines.push(q)
      // Eit hòl mindre enn taket kostar meir å skjere enn det er verdt, og
      // det som fell ut er ein flis. Taket er eit TVERRMÅL, gjort om her.
      else if (Math.abs(l.area) >= minHol) holes.push(q)
    }
    /**
     * KVA SOM IKKJE SKAL VERA MED, avgjort HER og ikkje i kuttlista, so
     * biletet og fila er den same lista: FLIS under `MIN_AREA`, og LAUST —
     * eit stykke utan eit einaste ledd, om `lause` seier kast.
     */
    const holesOf = (o: Pt[]) => (outlines.length === 1 ? holes : holes.filter((h) => inRing(o, h[0])))
    const netto = (o: Pt[]) => holesOf(o).reduce((s, h) => s - Math.abs(shoelace(h)), Math.abs(shoelace(o)))
    // Berre ØYER vert kasta: eit stykke utan ledd i ei ribbe som elles har
    // ledd — øyretippen, hoven. Eit plan utan eit einaste ledd er noko anna:
    // det er det fyrste planet du låste, og skal stå der so du ser det. At
    // det heng i ingenting seier regelen, ikkje tomrommet.
    const heil = outlines.filter((o) => {
      if (netto(o) < MIN_AREA) return false
      if (p.lause && a.spor.length && jointsIn(a.spor, o) === 0) {
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
      area += Math.abs(shoelace(o))
      cut += perimeter(o)
    }
    for (const h of holes) {
      area -= Math.abs(shoelace(h))
      cut += perimeter(h)
    }
    // Det tynnaste godset: målt langs sporet, frå botnen til den andre
    // kanten av det stykket botnen står i. Botnen og ikkje munnen peikar
    // ut stykket: munnen ligg per definisjon PÅ kanten og svarar på to.
    let narrow = Infinity
    for (const q of a.spor) {
      for (const [lo, hi] of stykkeLangs(a.ringar, q.p, q.d)) {
        if (q.botn < lo || q.botn > hi) continue
        narrow = Math.min(narrow, q.munn > q.botn ? q.botn - lo : hi - q.botn)
        break
      }
    }
    return {
      plan: a.plan,
      r: a.r,
      nullpkt: a.nullpkt,
      outlines,
      holes,
      raa: a.ringar,
      spor: a.spor,
      area,
      narrow: Number.isFinite(narrow) ? narrow : 0,
      cutLen: cut,
    }
  })

  // LUKA ER MÅLT MELLOM NABOAR: to plan som er nesten parallelle, og kor
  // langt frå kvarandre dei står langs normalen, minus plata.
  let minGap = span
  for (let i = 0; i < raa.length; i++) {
    for (let j = i + 1; j < raa.length; j++) {
      if (len3(cross(raa[i].r.n, raa[j].r.n)) > Math.sin((10 * Math.PI) / 180)) continue
      const g = Math.abs(dot(raa[i].r.n, raa[i].r.o) - dot(raa[i].r.n, raa[j].r.o))
      minGap = Math.min(minGap, g - p.tjukn)
    }
  }

  return {
    k,
    ribber,
    ledd,
    kasta,
    slotW,
    minGap,
    montering: { orden: plan.map((q) => q.id), retning, brot },
  }
}

/**
 * Kor mange ledd som fell innanfor EITT stykke av ei ribbe. Punktet er eit
 * hakk FORBI sporbotnen, der godset stykket skal bera på står.
 */
export function jointsIn(spor: readonly Spor[], outline: Pt[]): number {
  const b = bbox(outline)
  let n = 0
  for (const q of spor) {
    const t = q.botn + (q.munn > q.botn ? -0.3 : 0.3)
    const x = q.p[0] + q.d[0] * t
    const y = q.p[1] + q.d[1] * t
    if (x < b.x0 - 0.6 || x > b.x1 + 0.6 || y < b.y0 - 0.6 || y > b.y1 + 0.6) continue
    if (inRing(outline, [x, y])) n++
  }
  return n
}

// =============================================================================
// DELANE
// =============================================================================
/**
 * Ein signatur som er lik for like delar og ulik for ulike: ringen
 * resampla til eit fast tal punkt langs omkrinsen, runda til ein halv
 * millimeter. Då tel forma og ikkje bokføringa, og to delar som skil seg
 * med mindre enn maskina kan halde er den same delen.
 */
const SIG = 96
const TOL = 2

function ringSig(ring: Pt[], ox: number, oy: number): string {
  const acc: number[] = [0]
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
    acc.push(total)
  }
  if (total < 1e-9) return ""
  const out: string[] = []
  let seg = 0
  for (let k = 0; k < SIG; k++) {
    const d = (k / SIG) * total
    while (seg < ring.length - 1 && acc[seg + 1] < d) seg++
    const a = ring[seg]
    const b = ring[(seg + 1) % ring.length]
    const t = (d - acc[seg]) / (acc[seg + 1] - acc[seg] || 1)
    out.push(Math.round((a[0] + (b[0] - a[0]) * t - ox) * TOL) + "," + Math.round((a[1] + (b[1] - a[1]) * t - oy) * TOL))
  }
  return out.join(";")
}

/** Bokstaven til eit stykke: a … z, aa, ab. Tjue stykke skal ha tjue namn. */
export function bokstav(n: number): string {
  let s = ""
  let k = n
  do {
    s = "abcdefghijklmnopqrstuvwxyz"[k % 26] + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

/** `p` kjem inn utanfrå: materialet er ikkje med i snittnøkkelen, og eit
 *  hugsa snitt skal ikkje svare på kva material du valde. */
export function buildDelar(sn: Snitt, p: Params): DelListe {
  const mat = (p.material as Material) in MATERIALS ? (p.material as Material) : "finer"
  const rho = MATERIALS[mat].rho
  const t = p.tjukn
  const delar: Del[] = []
  const seen = new Map<string, string>()
  const ids: string[] = []
  for (const r of sn.ribber) {
    const fleire = r.outlines.length > 1
    r.outlines.forEach((o, k) => {
      const mine = fleire ? r.holes.filter((h) => inRing(o, h[0])) : r.holes
      let area = Math.abs(shoelace(o))
      let cut = perimeter(o)
      for (const h of mine) {
        area -= Math.abs(shoelace(h))
        cut += perimeter(h)
      }
      const b = bbox(o)
      const key = [ringSig(o, b.x0, b.y0), ...mine.map((h) => ringSig(h, b.x0, b.y0))].join("|")
      let id = seen.get(key)
      if (!id) {
        id = `D${String(ids.length + 1).padStart(2, "0")}`
        seen.set(key, id)
        ids.push(id)
      }
      delar.push({
        id,
        adr: String(r.plan.id) + (fleire ? bokstav(k) : ""),
        plan: r.plan.id,
        outline: o,
        holes: mine,
        t,
        area,
        mass: (area * t * rho) / 1e9,
        cutLen: cut,
        joints: jointsIn(r.spor, o),
      })
    })
  }
  return {
    delar,
    ids,
    area: delar.reduce((s, q) => s + q.area, 0),
    mass: delar.reduce((s, q) => s + q.mass, 0),
    cutLen: delar.reduce((s, q) => s + q.cutLen, 0),
    lause: delar.filter((q) => q.joints === 0).length,
  }
}

// =============================================================================
// SKISSA — eitt plan, snitta før det er låst
// =============================================================================
/**
 * Det du ser før du skjer.
 *
 * Ei line over skjermen seier ikkje kva du får; snittet gjer det. Skissa
 * vert difor snitta for seg, på det låge nivået og utan spor, medan du
 * siktar: profilen gjennom kroppen, og linene der planet kryssar plan som
 * alt er låste — der leddet ville kome. Ingenting av dette vert hugsa; ei
 * skisse er ein straum av punkt, og berre det siste tel.
 */
export type SkisseSyn = {
  r: Ramme
  ringar: Pt[][]
  /** stykke av kryssliner med gods i begge plan, i skissa si ramme: to endepunkt, og kva plan */
  kryss: { a: Pt; b: Pt; mot: number }[]
  /** kor langt inne i kroppen planet står, målt langs normalen frå den
   *  nærmaste kanten av boksen, mm — og kva akse normalen ligg nærast */
  avstand: number
  akse: "x" | "y" | "z"
  /** det svaret er ein funksjon av: same nøkkel, same svar, ingen grunn til å teikne om */
  nokkel: string
}

/** eit plan som alt er låst: profilen slik han faktisk vert skoren, med spor og strek */
function laastSyn(k: Kropp, p: Params, pl: Plan, cells: number): SkisseSyn | null {
  const rib = buildSnitt(k, p, cells).ribber.find((r) => r.plan.id === pl.id)
  if (!rib) return null
  const kryss: SkisseSyn["kryss"] = []
  for (const q of rib.spor) {
    const lo = Math.min(q.munn, q.botn)
    const hi = Math.max(q.munn, q.botn)
    kryss.push({ a: [q.p[0] + q.d[0] * lo, q.p[1] + q.d[1] * lo], b: [q.p[0] + q.d[0] * hi, q.p[1] + q.d[1] * hi], mot: q.mot })
  }
  return { r: rib.r, ringar: [...rib.outlines, ...rib.holes], kryss, ...avstandAv(k, rib.r), nokkel: `laast|${pl.id}|${snittKey(p as unknown as ParamBag, cells)}` }
}

function avstandAv(k: Kropp, r: Ramme): { avstand: number; akse: "x" | "y" | "z" } {
  const s = k.solid
  let lo = Infinity
  for (const x of [s.min[0], s.max[0]]) for (const y of [s.min[1], s.max[1]]) for (const z of [s.min[2], s.max[2]]) lo = Math.min(lo, dot([x, y, z], r.n))
  const a = r.n.map(Math.abs)
  const akse = a[0] >= a[1] && a[0] >= a[2] ? "x" : a[1] >= a[2] ? "y" : "z"
  return { avstand: dot(r.o, r.n) - lo, akse }
}

export function skisseSyn(k: Kropp, p: Params, pl: Plan, cells: number): SkisseSyn {
  // Eit plan som står i lista er ikkje ei skisse: det er skore, med spor
  // og strek, og det er DET du skal sjå når du vel det.
  if (lesPlan(p.plan).some((q) => q.id === pl.id)) {
    const laast = laastSyn(k, p, pl, cells)
    if (laast) return laast
  }
  const s = k.solid
  const span = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2], 1)
  const step = span / cells
  const { u, v } = akser(pl.n)
  const o: Vec3 = [
    s.min[0] + pl.o[0] * (s.max[0] - s.min[0]),
    s.min[1] + pl.o[1] * (s.max[1] - s.min[1]),
    s.min[2] + pl.o[2] * (s.max[2] - s.min[2]),
  ]
  const d = dot(o, pl.n)
  const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v }
  const sol = vend(k, pl.n)
  const ru = ruteAv(sol, d, step)
  const tol = Math.max(Math.min(0.25, step / 8), p.forenkl)
  const ringar = felt(ru, [], [])
    .map((l) => simplify(l.pts, tol) as Pt[])
    .filter((q) => q.length >= 3)
  const kryss: SkisseSyn["kryss"] = []
  if (ringar.length) {
    const laast = buildSnitt(k, p, cells)
    const til2 = (rr: Ramme, q: Vec3): Pt => [dot(q, rr.u), dot(q, rr.v)]
    for (const rib of laast.ribber) {
      const x = kryssAv(r, rib.r)
      if (!x) continue
      const pA = til2(r, x.p)
      const dA = til2(r, x.d)
      const pB = til2(rib.r, x.p)
      const dB = til2(rib.r, x.d)
      for (const [lo, hi] of felles(stykkeLangs(ringar, pA, dA), stykkeLangs(rib.raa, pB, dB))) {
        if (hi - lo < Math.max(2, p.tjukn)) continue
        kryss.push({ a: [pA[0] + dA[0] * lo, pA[1] + dA[1] * lo], b: [pA[0] + dA[0] * hi, pA[1] + dA[1] * hi], mot: rib.plan.id })
      }
    }
  }
  const nokkel = `skisse|${skrivPlan([pl])}|${snittKey(p as unknown as ParamBag, cells)}`
  return { r, ringar, kryss, ...avstandAv(k, r), nokkel }
}
