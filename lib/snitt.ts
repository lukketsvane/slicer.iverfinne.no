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
import { rull, vend, type BitBoks, type Kropp } from "./kropp"
import { add3, akser, cross, dot, inn, kryss as kryssAv, kryssBoygd, len3, lesPlan, mul3, norm3, omrissLine, skrivPlan, ut, type Plan, type Ramme, type Strek } from "./plan"
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
/**
 * KOR FINT FELTET VERT LESE — og kva det kostar.
 *
 * Målt på ei kule på 200 mm med åtte plan, buelengd i omrissa og tid:
 *
 *     celler    ms   punkt i omrissa   kuttlengd
 *        120   119               574     7461 mm
 *        220   127               684     7526 mm
 *        320   198               804     7564 mm
 *        640   287               986     7659 mm
 *       1200   343              1096     7736 mm
 *
 * To ting å lese ut av det. Kostnaden er STERKT underlineær — ti gonger så
 * mange celler er tre gonger tida — av di arbeidet ligg i trekantane per
 * plan og ikkje i feltet. Og oppløysinga kjøper noko ekte: kuttlengda stig
 * mot ein grense, av di eit grovt omriss bokstavleg talt skjer svingane.
 *
 * `mid` er det skjermen og kuttfilene går på: eit skyvarhakk skal svare, og
 * det gjer han på hundre og tretti millisekund. `fil` er for det som vert
 * skrive ÉIN GONG — eit objekt du tek med deg ut av reiskapen — der tre
 * hundre millisekund er ingenting og eit glatt omriss er alt.
 */
export const DETAIL = { lav: 120, mid: 220, hog: 320, fil: 1200 } as const
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
  /**
   * LEDDET SITT NAMN, og heile strekket det kan delast på.
   *
   * `nokkel` er den same nøkkelen `deling` i posen brukar, so ein finger på
   * eit spor-ende veit kva ledd han flyttar. `lo` og `hi` er overlappet
   * ledda vart funne i, langs `d` frå `p`: botnen står på `lo + t·(hi−lo)`,
   * og det er DET t-et som vert skrive. Begge spora i eit ledd har same
   * strekket og same t — difor er eit djupare spor i den eine eit grunnare
   * i den andre, utan at nokon reknar det om.
   */
  nokkel: string
  lo: number
  hi: number
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
  /** par som har gods på den same lina etter at spora er skorne: dei står i
   *  kvarandre, og bygget går ikkje i hop same kva rekkjefylgje du tek */
  klem: [number, number][]
}

/**
 * KOR MYKJE TO DELAR MÅ OVERLAPPE FØR DET ER EI KLEMME, mm.
 *
 * Under dette er det ikkje ei avlesing ein kan stole på: profilen er
 * forenkla til ein åttedels rutesteg, som er kring ein tidels millimeter
 * på eit objekt på to hundre. Over det er det ikkje noko ein kan presse i
 * hop heller — ein millimeter finér som skal vera to stader er ein
 * millimeter for mykje.
 */
const KLEM_MIN = 1

export type Snitt = {
  k: Kropp
  ribber: Ribbe[]
  ledd: number
  /**
   * MØTE SOM VART NEKTA AV SKULDRA.
   *
   * To plan kryssar, overlappet er langt nok — og so er det ikkje gods nok
   * ved sida av sporet til at noko held. Då vert møtet kasta, og det er
   * rett: eit spor utan skulder er ikkje eit ledd, det er ei kløft ribba
   * sig gjennom.
   *
   * Men det skjedde i STILLE. Målt på dei ti innebygde formene med eit
   * rutenett: 272 av 1186 møte, altso 23 %, og på stolform-02 seks av ti.
   * Eit rutenett på ein kube kastar ingen, og det er difor ingen såg det:
   * du siktar mot ei krysning, skissa teiknar merket, og leddet finst ikkje.
   * README seier at reiskapen skjer kva som helst men SEIER kva han skar.
   *
   * Berre skuldra vert talt her. Eit for kort overlapp og to plan under fem
   * grader frå parallelle er andre avvisingar med kvar sin grunn, og tre
   * ulike ting i eitt tal er eit tal som seier mindre enn namnet sitt.
   */
  avvist: number
  /**
   * MØTE SOM ER KURVER, OG SOM DIFOR IKKJE VART TEKNE.
   *
   * Eit bøygt plan er ein sylinder. Eit flatt plan som ligg LANGS aksen
   * hans møter han i ei generatorline — rett i rommet, rett utbretta, eit
   * ledd som alle andre. Eit flatt plan som SKRÅR mot aksen møter han i
   * eit kjeglesnitt, og den finnaren er ikkje skriven (`kryssBoygd`).
   *
   * Det stod i den harde regelen, men berre for ribber som ikkje fann eit
   * einaste spor. Ei bøygd ribbe som har spor frå eit plan langs aksen ER
   * festa, og dei skrå møta hennar fall bort i stille: eit krumt skal med
   * tak og botn melde fire og tjue ledd og sa ingenting om dei åtte som
   * heldt golva. Det er den same saka som `avvist`, og svaret er det same
   * — tel dei, og sei talet.
   *
   * Berre BØYGD MOT FLAT vert talt. To bøygde flater møtest i ei romkurve,
   * og å avgjera om dei i det heile møtest er ei anna rekning enn denne;
   * dei står att hjå den harde regelen. Eit tal som dekkjer to ulike ting
   * seier mindre enn namnet sitt.
   *
   * Lista ber DET BØYGDE PLANET sin id, eitt for kvart møte som fall — so
   * rådet kan rette nett dei og late resten stå.
   */
  kurva: number[]
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
  /** laget planet er merkt med, om noko — kuttfilene skriv delen i den fargen */
  farge?: number
  outline: Pt[]
  holes: Pt[][]
  t: number
  area: number
  mass: number
  cutLen: number
  /** kor mange ledd som fell innanfor akkurat dette stykket */
  joints: number
  /** dei same ledda, kvart med lina si — det handa dreg i. Sjå `Spor`. */
  spor: Spor[]
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
/** To kall per rutepunkt, og eit felt er tjue tusen av dei: lykkja går på
 *  indeks og ikkje gjennom ein itererar med utpakking i kvart steg. Talet
 *  er det same. */
function axisDist(spans: Span[], t: number): number {
  const n = spans.length
  if (!n) return -1e9
  let best = -Infinity
  for (let i = 0; i < n; i++) {
    const s = spans[i]
    const a = s[0]
    const b = s[1]
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
 *
 * KJELDA ER KROPPEN, ELLER EIN BOKS. Ber planet eit omriss, kjem profilen
 * frå punkta og ikkje frå nettet: då er det omrisset sin boks ruta skal
 * dekkje, og det står ikkje ein einaste stråle å kaste. Det er ikkje ei
 * innsparing som er funnen på — det er kva det tyder at handa har teke
 * over forma.
 */
const TOMME: Span[] = []
function ruteAv(kjelde: Solid | Kasse, d: number, step: number, former: readonly Form[] = []): Rute {
  // Ruta må dekkje HEILE profilen med litt mon: ein kontur som vert klipt
  // av kanten på ruta er ei open kjede og ikkje eit polygon. Og profilen
  // er ikkje berre kroppen: eit strek som tjuknar eit bein rekk gjerne ut
  // forbi boksen kring nettet, og vart klipt der — plata kom ut delt i to
  // av eit skrått band der kjeda vart lukka på måfå.
  const PAD = Math.max(4, step * 2)
  const s = "runs" in kjelde ? kjelde : null
  let t0 = s ? s.min[0] : (kjelde as Kasse).bx0
  let t1 = s ? s.max[0] : (kjelde as Kasse).bx1
  let z0 = s ? s.min[1] : (kjelde as Kasse).by0
  let z1 = s ? s.max[1] : (kjelde as Kasse).by1
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
  for (let j = 0; j <= nz; j++) rows[j] = s ? s.runs(0, z0 + j * dz, d) : TOMME
  const cols: Span[][] = new Array(nt + 1)
  for (let i = 0; i <= nt; i++) cols[i] = s ? s.runs(1, d, t0 + i * dt) : TOMME
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

/**
 * OMRISSET SOM FELT: EIN EKTE SIGNERT AVSTAND TIL MANGEKANTEN, positiv inne.
 *
 * Same krav som eit strek, og av same grunn: `contour` finn kanten ved å
 * interpolere mellom to hjørneverdiar, so eit merke («inne er +e») ville
 * lagt kvar einaste kryssing midt på ei cellekant og gjeve deg ei
 * fem og førti graders trappe der du sette ei rett line.
 *
 * Inne-spørsmålet er PARTAL/ODDETAL og ikkje vinding. Handa kan dra eit
 * punkt tvers over omrisset og lage ei mangekant som kryssar seg sjølv;
 * partal/oddetal har eit svar på det, og vindinga har det ikkje.
 *
 * Segmenta vert rekna ut ÉIN gong for heile ruta — feltet spør om dei
 * hundre tusen gonger — og avstanden vert halden i kvadrat til han skal
 * ut, so det er éi rot per rutepunkt og ikkje éi per side.
 */
type Kant = { ax: number; ay: number; bx: number; by: number; ex: number; ey: number; inv: number }
const kantar = (poly: readonly Pt[]): Kant[] => {
  const ut: Kant[] = []
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ex = poly[i][0] - poly[j][0]
    const ey = poly[i][1] - poly[j][1]
    ut.push({ ax: poly[j][0], ay: poly[j][1], bx: poly[i][0], by: poly[i][1], ex, ey, inv: 1 / Math.max(1e-12, ex * ex + ey * ey) })
  }
  return ut
}
function omrissDist(kant: readonly Kant[], x: number, y: number): number {
  let d2 = Infinity
  let inne = false
  for (const k of kant) {
    const px = x - k.ax
    const py = y - k.ay
    const t = Math.max(0, Math.min(1, (px * k.ex + py * k.ey) * k.inv))
    const qx = px - k.ex * t
    const qy = py - k.ey * t
    const q = qx * qx + qy * qy
    if (q < d2) d2 = q
    if (k.ay > y !== k.by > y && x < k.ax + ((y - k.ay) / (k.by - k.ay)) * k.ex) inne = !inne
  }
  const d = Math.sqrt(d2)
  return inne ? d : -d
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
/**
 * KLIPPET: BOKSANE EIT PLAN HØYRER TIL.
 *
 * Ein kropp av fleire figurar gav ribber som strekte seg frå den eine,
 * tvers over lufta mellom dei, og inn i den andre — éin del som held to
 * figurar i hop der du ville hatt to. Merkjer du ein bit med eit lag og eit
 * plan med det same laget, høyrer planet til biten, og profilen vert klipt
 * til boksen hans. Fleire bitar kan bera det same laget; då er klippet
 * unionen av boksane deira.
 *
 * KLIPPET ER EI EKTE SIGNERT AVSTAND og ikkje eit merke, av same grunn som
 * streka: `contour` interpolerer mellom to hjørneverdiar, og ein konstant
 * ±e legg kvar einaste kryssing midt på ein cellekant. Avstanden til ein
 * boks er eksakt langs kvar side og den verkelege avstanden utanfor eit
 * hjørne, so kanten hamnar der boksen faktisk sluttar.
 *
 * Punktet vert rekna med `ut`, so ein BØYGD plan vert klipt der flata hans
 * faktisk ligg i rommet og ikkje der det utrulla mønsteret hans ville lege.
 */
export type Klipp = { r: Ramme; boksar: readonly { min: Vec3; max: Vec3 }[] }

function klippDist(kl: Klipp, t: number, z: number): number {
  const p = ut(kl.r, [t, z])
  let best = Infinity
  for (const b of kl.boksar) {
    const dx = Math.max(b.min[0] - p[0], p[0] - b.max[0])
    const dy = Math.max(b.min[1] - p[1], p[1] - b.max[1])
    const dz = Math.max(b.min[2] - p[2], p[2] - b.max[2])
    const ute = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
    const d = ute + Math.min(Math.max(dx, dy, dz), 0)
    if (d < best) best = d
  }
  return best
}

/**
 * SLØRET: EIN KASSE OVER FELTET, med radius i celler.
 *
 * Mjukinga rundar hjørne ved å sløre AVSTANDEN og ikkje polygonet. Ei rett
 * side er ein rett rampe i feltet, og ein rampe slørt er den same rampen —
 * so ei rett kant står urørt, medan eit hjørne, der to rampar møtest,
 * vert runda. Det er nett det ein vil av «mjukare»: hakket frå trekantane
 * i nettet forsvinn, og forma står.
 *
 * To vendingar av ein kasse i staden for éin: éin kasse er ein trekant av
 * eit slør, og trekanten har eit knekk i seg som du ser att i konturen.
 * Springande sum, so kostnaden er den same kor brei kassen er.
 *
 * Kanten vert halden fast (klemt indeks). Ruta har alt eit belte luft
 * kring profilen (`PAD` i `ruteAv`), so det er luft som vert gjenteken.
 */
const SLOER_VENDER = 2
function sloer(g: Float64Array, w: number, h: number, kx: number, kz: number) {
  const tmp = new Float64Array(g.length)
  for (let v = 0; v < SLOER_VENDER; v++) {
    if (kx > 0) {
      const n = 2 * kx + 1
      for (let j = 0; j < h; j++) {
        const rad = j * w
        let sum = 0
        for (let i = -kx; i <= kx; i++) sum += g[rad + Math.min(w - 1, Math.max(0, i))]
        for (let i = 0; i < w; i++) {
          tmp[rad + i] = sum / n
          sum += g[rad + Math.min(w - 1, i + kx + 1)] - g[rad + Math.min(w - 1, Math.max(0, i - kx))]
        }
      }
      g.set(tmp)
    }
    if (kz > 0) {
      const n = 2 * kz + 1
      for (let i = 0; i < w; i++) {
        let sum = 0
        for (let j = -kz; j <= kz; j++) sum += g[Math.min(h - 1, Math.max(0, j)) * w + i]
        for (let j = 0; j < h; j++) {
          tmp[j * w + i] = sum / n
          sum += g[Math.min(h - 1, j + kz + 1) * w + i] - g[Math.min(h - 1, Math.max(0, j - kz)) * w + i]
        }
      }
      g.set(tmp)
    }
  }
}

/**
 * `mjuk` er millimeter, og sløret kjem MELLOM feltet og spora: eit rundt
 * hjørne skal ikkje gjere leddet rundt òg. Sporet er det einaste i denne
 * fila som må kome ut med skarpe kantar — det er det som grip.
 */
function felt(ru: Rute, former: Form[], spor: Spor[], klipp?: Klipp, mjuk = 0, omriss?: readonly Pt[]) {
  const { t0, dt, nt, z0, dz, nz, rows, cols } = ru
  const boksar = spor.map(boksAv)
  // OMRISSET STÅR I STADEN FOR KROPPEN, og ikkje ved sida av han: det er
  // det som gjer at handa kan ta forma MINDRE. Alt anna i feltet — klippet,
  // streka, mjukinga, spora — les det same feltet som før.
  const kant = omriss && omriss.length >= 3 ? kantar(omriss) : null
  const g = new Float64Array((nt + 1) * (nz + 1))
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * dz
    const row = rows[j]
    for (let i = 0; i <= nt; i++) {
      const t = t0 + i * dt
      let v: number
      if (kant) v = omrissDist(kant, t, z)
      else {
        const dh = axisDist(row, t)
        const dv = axisDist(cols[i], z)
        // Forteiknet er SNITTET av dei to prøvene — er dei usamde, står vi
        // på ein knivsegg og skal reknast som luft. Storleiken er avstanden
        // til den næraste av dei to kantane, og aldri den fjernaste.
        const mag = Math.min(Math.abs(dh), Math.abs(dv))
        v = dh > 0 && dv > 0 ? mag : -mag
      }
      // KLIPPET FYRST, og som eit hòl: det biten ikkje eig, er luft. Det
      // står før streka av di eit strek er noko du teikna PÅ delen, og ein
      // del som ikkje finst der har ingenting å teikne på.
      // Hòlet er det som ligg UTANFOR boksen, so avstanden vert snudd:
      // negativ ute, positiv inne, og `min` skjer henne inn i feltet nett
      // som eit teikna hòl.
      if (klipp) {
        const d = -klippDist(klipp, t, z)
        if (d < v) v = d
      }
      // Lista står som ho står: rekkjefylgja ER geometrien — eit gods etter
      // eit hòl fyller det att, og eit hòl etter eit gods skjer i det.
      for (const f of former) {
        const d = formDist(f, t, z)
        v = f.gods ? Math.max(v, -d) : Math.min(v, d)
      }
      g[j * (nt + 1) + i] = v
    }
  }
  if (mjuk > 0) sloer(g, nt + 1, nz + 1, Math.round(mjuk / dt), Math.round(mjuk / dz))
  if (boksar.length) {
    for (let j = 0; j <= nz; j++) {
      const z = z0 + j * dz
      for (let i = 0; i <= nt; i++) {
        const k = j * (nt + 1) + i
        let v = g[k]
        if (v <= 0) continue
        const t = t0 + i * dt
        for (const b of boksar) {
          const rx = t - b.px
          const ry = z - b.py
          const a = rx * b.dx + ry * b.dy
          const c = Math.abs(-rx * b.dy + ry * b.dx)
          const d = Math.max(c - b.half, b.lo - a, a - b.hi)
          if (d < v) v = d
          if (v <= 0) break
        }
        g[k] = v
      }
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

/** ei flate slik lukemålinga treng henne: ramma, og ringane profilen er */
export type Flate = { r: Ramme; ringar: readonly Pt[][] }

/** to plan innanfor ti grader av kvarandre er naboar */
const PAR_10 = Math.sin((10 * Math.PI) / 180)
const MIDT_STEG = 64

/**
 * LUKENE MELLOM NABOPLAN, EIN STAD.
 *
 * Både talet i tavla og rådet som tek plan bort les dette. Stod dei med kvar
 * si rekning, ville knappen ta bort plan regelen ikkje klaga på — eller la
 * dei stå medan lina var raud.
 *
 * Spenn og sagitta vert rekna éin gong per flate; `luka(i, j, grense)` gjev
 * luka mellom to av dei, og `Infinity` når dei ikkje er naboar eller når ho
 * kan prova at luka er større enn `grense`.
 */
export function lukene(flater: readonly Flate[], tjukn: number) {
  const spenn = flater.map((a): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const ring of a.ringar) {
      for (const q of ring) {
        if (q[0] < lo) lo = q[0]
        if (q[0] > hi) hi = q[0]
      }
    }
    return [lo, hi]
  })
  /**
   * Ei bøygd flate vik aldri lenger frå grunnplanet sitt enn dette:
   * n-avstanden ved kvar av endane av buen, som er det største han vert.
   */
  const sagitta = flater.map((a, i) => {
    if (!a.r.k) return 0
    const [lo, hi] = spenn[i]
    if (!(hi > lo)) return 0
    const av = (u: number) => Math.abs(dot(a.r.n, ut(a.r, [u, 0], 0)) - dot(a.r.n, a.r.o))
    return Math.max(av(lo), av(hi))
  })
  /** midtlina til flata i rommet, `w = 0`, over det spennet profilen har */
  const midt: (Vec3[] | null)[] = flater.map(() => null)
  const midtlina = (i: number): Vec3[] => {
    const m = midt[i]
    if (m) return m
    const a = flater[i]
    const [lo, hi] = spenn[i]
    const ut2: Vec3[] = []
    if (!(hi > lo)) ut2.push(ut(a.r, [0, 0], 0))
    else for (let t = 0; t <= MIDT_STEG; t++) ut2.push(ut(a.r, [lo + ((hi - lo) * t) / MIDT_STEG, 0], 0))
    midt[i] = ut2
    return ut2
  }
  /** frå eit punkt til stykket mellom a og b, og ikkje berre til endane:
   *  eit grovt skann av ei line ville lese ei luke som er større enn ho er */
  const tilStykket = (q: Vec3, a: Vec3, b: Vec3): number => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const LL = dx * dx + dy * dy + dz * dz
    const t = LL > 1e-12 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy + (q[2] - a[2]) * dz) / LL)) : 0
    return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy, q[2] - a[2] - t * dz)
  }
  const midtAvstand = (i: number, j: number): number => {
    const la = midtlina(i)
    const lb = midtlina(j)
    let m = Infinity
    for (const q of la) for (let t = 1; t < lb.length; t++) m = Math.min(m, tilStykket(q, lb[t - 1], lb[t]))
    for (const q of lb) for (let t = 1; t < la.length; t++) m = Math.min(m, tilStykket(q, la[t - 1], la[t]))
    return m
  }
  const luka = (i: number, j: number, grense = Infinity): number => {
    const A = flater[i]
    const B = flater[j]
    if (len3(cross(A.r.n, B.r.n)) > PAR_10) return Infinity
    const g0 = Math.abs(dot(A.r.n, A.r.o) - dot(A.r.n, B.r.o))
    if (!A.r.k && !B.r.k) return g0 - tjukn
    // grensa er eit prikk og ei subtraksjon; skanninga er åtte tusen avstandar
    if (g0 - sagitta[i] - sagitta[j] - tjukn >= grense) return Infinity
    return midtAvstand(i, j) - tjukn
  }
  return {
    luka,
    minste: (tak: number) => {
      let m = tak
      for (let i = 0; i < flater.length; i++) {
        for (let j = i + 1; j < flater.length; j++) m = Math.min(m, luka(i, j, m))
      }
      return m
    },
  }
}

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
  /** flata er ein sylinder og ikkje eit plan — sjå `Plan.bog` */
  boygd: boolean
  /** kor mykje feltet vert slørt før konturen vert dregen, mm — sjå `Plan.mjuk` */
  mjuk: number
  /** profilen handa har sett, i millimeter i ramma — står i staden for kroppen */
  omriss?: Pt[]
  /** boksane planet er lenkt til gjennom laget sitt, om nokon */
  klipp?: Klipp
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
  /**
   * KVA BITAR KVART LAG EIG. Eit lag utan ein einaste bit eig ingenting, og
   * eit plan med det laget skjer heile kroppen som det alltid har gjort:
   * merket er framleis berre eit lag i LightBurn til nokon knyter det til
   * noko. Det er difor lenkjer frå i fjor opnar det same objektet.
   */
  const eigd = new Map<number, BitBoks[]>()
  for (const b of k.bitar) {
    if (!b.farge) continue
    const l = eigd.get(b.farge)
    if (l) l.push(b)
    else eigd.set(b.farge, [b])
  }

  // --- kvart plan for seg: ramma, strålane og profilen utan spor ---------
  const raa: Raa[] = plan.map((pl) => {
    const { u, v } = akser(pl.n)
    const o: Vec3 = [
      s.min[0] + pl.o[0] * (s.max[0] - s.min[0]),
      s.min[1] + pl.o[1] * (s.max[1] - s.min[1]),
      s.min[2] + pl.o[2] * (s.max[2] - s.min[2]),
    ]
    const d = dot(o, pl.n)
    /**
     * BØYEN: KRUMMING I 1/MM, mot den lengste sida av kroppen. Er han null,
     * er alt som før. Er han det ikkje, vert ROMMET rulla ut i staden for
     * berre vendt (`rull` i `kropp.ts`): flata er eit plan i det utrulla
     * rommet, snittet er det same z-snittet som alle andre, og profilen
     * som kjem ut er alt det flate kuttmønsteret.
     */
    const kurv = (pl.bog || 0) / Math.max(1e-6, s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2])
    const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v, k: kurv }
    const boygd = !!kurv
    const sol = boygd ? rull(k, r) : vend(k, pl.n)
    const S = p.storleik
    // streka ligg kring planet sitt eige punkt, i planet si ramme
    const ou = dot(o, u)
    const ov = dot(o, v)
    const former: Form[] = pl.strek.map((st: Strek) => formAv(st, ou, ov, S))
    const mine = pl.farge ? eigd.get(pl.farge) : undefined
    const klipp: Klipp | undefined = mine ? { r, boksar: mine } : undefined
    // MJUKINGA er ein brøk av kroppen, som streka og bøyen; feltet reknar
    // i millimeter, so ho vert gjord om her og berre her
    const mjuk = (pl.mjuk ?? 0) * S
    /**
     * OMRISSET, UT AV BRØKANE OG INN I MILLIMETER — kring planet sitt eige
     * punkt, som streka og av same grunn (sjå `formAv`). Har planet eit,
     * er det profilen: kroppen vert ikkje lesen for dette planet, og ruta
     * skal difor dekkje omrisset og ikkje nettet.
     */
    // Bogane vert rekna ut til punkt her, so alt under dette — ruta,
    // feltet, ledda, kuttfila — ser den mangekanten dei alltid har sett.
    const omriss = pl.omriss && pl.omriss.length >= 3 ? (omrissLine(pl.omriss, pl.runde).map((q) => [ou + q[0] * S, ov + q[1] * S]) as Pt[]) : undefined
    // det utrulla rommet har flata på null; det vendte har henne på `d`
    const ob = omriss ? bbox(omriss) : null
    const ru = ruteAv(ob ? { bx0: ob.x0, bx1: ob.x1, by0: ob.y0, by1: ob.y1 } : sol, boygd ? 0 : d, step, former)
    let ringar = felt(ru, former, [], klipp, mjuk, omriss).map((l) => l.pts as Pt[])
    /**
     * FIRKANTEN: BOKSEN KRING PROFILEN, LAGD TIL SOM GODS.
     *
     * Ei ribbe gjennom eit dyr er ein kontur med øyre og hovar, og av og
     * til er det plata du vil ha og ikkje konturen. Boksen vert lagd inn i
     * feltet som eit gods-strek, og so går alt sin vanlege gang: spora
     * vert skorne i han, ledda vert lesne av HAN, og kuttfila er den same
     * fila ho alltid var.
     *
     * Difor må ringane reknast om att her, før ledda: eit ledd som vart
     * funne på den gamle profilen ville liggje ein annan stad enn det som
     * vert skore. Prisen er eitt felt til for planet, og berre for planet
     * som ber merket.
     *
     * Boksen er boksen kring det profilen FAKTISK er — etter klippet mot
     * biten og etter mjukinga — og ikkje kring heile kroppen.
     */
    if (pl.firkant && ringar.length) {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const ring of ringar) {
        const b = bbox(ring)
        x0 = Math.min(x0, b.x0)
        y0 = Math.min(y0, b.y0)
        x1 = Math.max(x1, b.x1)
        y1 = Math.max(y1, b.y1)
      }
      former.push({ gods: true, rund: false, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, c: 1, s: 0, bx0: x0, bx1: x1, by0: y0, by1: y1 })
      ringar = felt(ru, former, [], klipp, mjuk, omriss).map((l) => l.pts as Pt[])
    }
    return { plan: pl, r, d, sol, ru, former, ringar, spor: [], nullpkt: [ou, ov] as Pt, boygd, klipp, mjuk, omriss }
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
  let avvist = 0
  const retning: Record<number, Vec3 | null> = {}
  const brot: number[] = []
  /** retninga i ramma si flate, lesen som skilnaden mellom to punkt på lina
   *  og normert — den einaste måten som held for ei BØYGD ramme, der
   *  avbildinga ikkje er lineær og ein prikk mot aksane ikkje seier noko */
  const ein2 = (b: Pt, a: Pt): Pt => {
    const q: Pt = [b[0] - a[0], b[1] - a[1]]
    const L = Math.hypot(q[0], q[1]) || 1
    return [q[0] / L, q[1] / L]
  }

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

  /**
   * KVAR TO FLATER MØTEST — og eit møte er alltid ei RETT LINE.
   *
   * Spor-maskineriet under byggjer heilt igjennom på det: eitt punkt, éi
   * retning, og eitt tal som styrer båe sidene. Difor er det HER, og berre
   * her, det vert avgjort kva par som kan bera ledd.
   *
   * To flate plan møtest i ei line, alltid. Ei bøygd flate og eit flatt plan
   * møtest i ei kurve — utan om det eine tilfellet der planet ligg langs
   * sylinderaksen og møtet vert ein generator, som er rett både i rommet og
   * utbretta (sjå `kryssBoygd`). To bøygde flater står att, og dei er
   * framleis den harde regelen sitt.
   *
   * Lista, og ikkje eitt svar: eit plan kan skjera ein sylinder på to
   * generatorar, og båe er ekte ledd.
   */
  /** kor fint kurva vert skanna etter eit punkt inne i profilen. Same
   *  talet som `ROT_STEG` i `plan.ts`: ei bue på ein meter vert prøvd kvar
   *  sekstande millimeter, og eit møte som er smalare enn det er ikkje eit
   *  ledd uansett. */
  const KURVE_STEG = 64
  const uSpenn = (a: Raa): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const ring of a.ringar) {
      for (const q of ring) {
        if (q[0] < lo) lo = q[0]
        if (q[0] > hi) hi = q[0]
      }
    }
    return [lo, hi]
  }
  /**
   * MØTES DEI TO I DET HEILE, når finnaren sa nei?
   *
   * Aksen er `v`, so eit punkt på flata er `ut(kr, [u, w])` og `w` er
   * millimeter langs han. Eit flatt plan som skrår mot aksen har `n·v ≠ 0`,
   * og då gjev planlikninga nøyaktig éin `w` per `u`:
   *
   *     w(u) = (n·o_fl − n·ut(kr, [u, 0])) / (n·v)
   *
   * Kurva vert skanna i `u` over spennet profilen har, og møtet er ekte
   * dersom eit av punkta på henne ligg INNE i profilen. Utan den prøva
   * ville kvart skrå plan i rommet telje som eit tapt møte, og eit tal som
   * tel det som aldri var der er ikkje eit tal.
   */
  const kurveInne = (kr: Raa, fl: Ramme, lo: number, hi: number): boolean => {
    const nv = dot(fl.n, kr.r.v)
    if (Math.abs(nv) <= 1e-3 || !(hi > lo)) return false
    const dFl = dot(fl.n, fl.o)
    for (let i = 0; i <= KURVE_STEG; i++) {
      const u = lo + ((hi - lo) * i) / KURVE_STEG
      const w = (dFl - dot(ut(kr.r, [u, 0], 0), fl.n)) / nv
      for (const ring of kr.ringar) if (inRing(ring, [u, w])) return true
    }
    return false
  }
  const kurva: number[] = []
  const møta = (A: Raa, B: Raa): { p: Vec3; d: Vec3; sin: number }[] => {
    if (A.boygd && B.boygd) return []
    if (A.boygd || B.boygd) {
      const kr = A.boygd ? A : B
      const fl = A.boygd ? B : A
      const [lo, hi] = uSpenn(kr)
      const x = kryssBoygd(kr.r, fl.r, lo, hi)
      if (!x.length && kurveInne(kr, fl.r, lo, hi)) kurva.push(kr.plan.id)
      return x
    }
    const x = kryssAv(A.r, B.r)
    return x ? [x] : []
  }

  for (let j = 1; j < raa.length; j++) {
    const B = raa[j]
    let felt3: Vec3 | null = null
    for (let i = 0; i < j; i++) {
      const A = raa[i]
      let fann = false
      let treff = 0
      for (const x of møta(A, B)) {
      const d3 = kanonisk(x.d)
      // helst nedover; på ei vassrett line er retninga eit val, og valet
      // er det same kvar gong
      const retn = Math.abs(d3[2]) > 0.3 ? (d3[2] > 0 ? -1 : 1) : -1
      /**
       * INN I RAMMA SI EIGA FLATE — og `inn` er den same avbildinga for båe
       * slag. Ho trekkjer frå `r.o`, men `r.o` er punktet på planet nærast
       * origo (`mul3(pl.n, d)`), so `u`- og `v`-komponentane hans er null:
       * for eit flatt plan er `inn` difor ordrett det same som å prikke mot
       * aksane. For ei bøygd flate gjer ho det ingen prikk kan — vinkelen
       * kring aksen vert buelengd — og det er nett dei koordinatane ringane
       * hennar alt ligg i (`rull` i `kropp.ts` byggjer dei med den same).
       */
      const pA = inn(A.r, x.p)
      const dA = ein2(inn(A.r, add3(x.p, d3)), pA)
      const pB = inn(B.r, x.p)
      const dB = ein2(inn(B.r, add3(x.p, d3)), pB)
      const runs = felles(stykkeLangs(A.ringar, pA, dA), stykkeLangs(B.ringar, pB, dB))
      const w = slotW / x.sin
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
         *
         * Difor tel `treff` fyrst NEDANFOR skuldreprøvene. Nøkkelen må
         * reknast her — han slår opp handdelinga, og ho set `zm`, som er
         * eit av tala prøvene les — men han skal ikkje BRUKE opp eit
         * nummer før møtet er eit ledd. Eit møte som klarer overlappet og
         * fell på skuldra åt elles nummeret til dei som kom etter, og eit
         * «5-12-1» sett med handa ville lande på eit anna ledd enn det du
         * stilte: eitt spor djupt og makkeren grunn.
         */
        const nokkel = leddNokkel(A.plan.id, B.plan.id, treff)
        const kv = handDeling.get(nokkel)
        const zm = lo + (kv ?? p.ledd) * (hi - lo)
        // B kjem inn langs retn·d: munnen hans er i den enden han går mot,
        // og A sin munn er der B kjem frå
        const munnB = retn < 0 ? lo : hi
        const munnA = retn < 0 ? hi : lo
        if (!rom(A, pA, dA, (zm + munnA) / 2, skulder(w)) || !rom(B, pB, dB, (zm + munnB) / 2, skulder(w))) {
          avvist++
          continue
        }
        treff++
        A.spor.push({ p: pA, d: dA, munn: munnA, botn: zm, ut: klar(A, pA, dA, munnA, munnA > zm, w), w, mot: B.plan.id, nokkel, lo, hi })
        B.spor.push({ p: pB, d: dB, munn: munnB, botn: zm, ut: klar(B, pB, dB, munnB, munnB > zm, w), w, mot: A.plan.id, nokkel, lo, hi })
        ledd++
        fann = true
      }
      const m = mul3(d3, retn)
      if (fann) {
        if (!felt3) felt3 = m
        else if (dot(felt3, m) < Math.cos((3 * Math.PI) / 180) && !brot.includes(B.plan.id)) brot.push(B.plan.id)
      }
      }
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
    const loops = felt(a.ru, a.former, a.spor, a.klipp, a.mjuk, a.omriss)
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

  /**
   * LUKA ER MÅLT MELLOM NABOAR: to plan som er nesten parallelle, og kor
   * langt frå kvarandre dei står, minus plata.
   *
   * FOR TO FLATE PLAN er det eitt tal langs normalen, og det er eksakt.
   *
   * FOR EIT BØYGT ER DET IKKJE DET. Normalen til ei bøygd flate er normalen
   * DER BUEN BYRJAR; flata sjølv vender seg bort frå han heile vegen ut.
   * Målt slik det stod, på to ribber 36 mm frå kvarandre i eit objekt på
   * 300 mm, den eine bøygd 0,9 og den andre −0,9:
   *
   *     lika langs normalen      33,0 mm
   *     ekte næraste avstand      0,4 mm  (mellom flatene, so −2,6 mm luke)
   *
   * Ribbene rører kvarandre, og lina sa at det var tre centimeter å ta i.
   * Det er ikkje ei unøyaktigheit — det er eit anna tal.
   *
   * So der ei av dei to er bøygd, vert MIDTLINA prøvd: flata ved `w = 0`,
   * skanna over det spennet profilen har, og minste avstanden mellom dei to
   * linene. Det er den same blindsona som den flate rekninga alt har — to
   * plan som står langt frå kvarandre LANGS aksen tel som naboar — og det
   * er med vilje: regelen spør kor tett plana står, ikkje om dei møtest.
   */
  const minGap = lukene(raa, p.tjukn).minste(span)

  /**
   * TO DELAR PÅ DEN SAME STADEN.
   *
   * Eit møte skuldra nektar får ikkje spor, og det er rett: eit spor utan
   * skulder er ei kløft ribba sig gjennom. Men NEKTINGA TEK IKKJE GODSET
   * BORT. Begge delane står att med gods langs den same lina i rommet, og
   * to plater kan ikkje vera same staden. Det bygget går ikkje i hop, same
   * kva rekkjefylgje du tek det i — og reiskapen sa ingenting.
   *
   * Regelen «kan monterast» ser ikkje dette. Han spør om ein del har ÉI
   * retning inn, og det har desse: dei har ikkje eit ledd i det heile på
   * den lina dei klemmer kvarandre på. Målt på dei tjue innebygde formene
   * med rutenett 6×6: nitten av dei har minst eitt slikt par, ett og
   * hundre par i alt — medan «kan monterast» stod grøn på alle tjue.
   *
   * LESE PÅ DEI FERDIGE PROFILANE, ikkje på møta. Det er godset som står
   * att etter at ALLE spora er skorne som avgjer; eit møte som fall kan
   * vera rydda av eit spor frå eit anna møte, og eit tal som tel nektingar
   * ville meldt frå om noko som ikkje er der. `avvist` er større enn talet
   * på par kvar einaste gong, og det er skilnaden mellom mekanismen og
   * verknaden.
   *
   * BERRE FLAT MOT FLAT. Ei bøygd ramme avbildar ikkje lineært, so
   * buelengda langs kryssingslina er ikkje det same talet sett frå dei to
   * sidene — og eit tal som tyder ulike ting i dei to ramme er ikkje eit
   * tal ein kan samanlikne.
   */
  const klem: [number, number][] = []
  for (let i = 0; i < ribber.length; i++) {
    for (let j = i + 1; j < ribber.length; j++) {
      const A = ribber[i]
      const B = ribber[j]
      if (A.r.k || B.r.k) continue
      const kr = kryssAv(A.r, B.r)
      if (!kr) continue
      const pA = inn(A.r, kr.p)
      const pB = inn(B.r, kr.p)
      const a = stykkeLangs([...A.outlines, ...A.holes], pA, ein2(inn(A.r, add3(kr.p, kr.d)), pA))
      if (!a.length) continue
      const b = stykkeLangs([...B.outlines, ...B.holes], pB, ein2(inn(B.r, add3(kr.p, kr.d)), pB))
      if (!b.length) continue
      if (felles(a, b).some(([lo, hi]) => hi - lo > KLEM_MIN)) klem.push([A.plan.id, B.plan.id])
    }
  }

  return {
    k,
    ribber,
    ledd,
    avvist,
    kurva,
    kasta,
    slotW,
    minGap,
    montering: { orden: plan.map((q) => q.id), retning, brot, klem },
  }
}

/**
 * Spora som fell innanfor EITT stykke av ei ribbe. Punktet er eit hakk
 * FORBI sporbotnen, der godset stykket skal bera på står.
 */
export function sporIn(spor: readonly Spor[], outline: Pt[]): Spor[] {
  const b = bbox(outline)
  const ut: Spor[] = []
  for (const q of spor) {
    const t = q.botn + (q.munn > q.botn ? -0.3 : 0.3)
    const x = q.p[0] + q.d[0] * t
    const y = q.p[1] + q.d[1] * t
    if (x < b.x0 - 0.6 || x > b.x1 + 0.6 || y < b.y0 - 0.6 || y > b.y1 + 0.6) continue
    if (inRing(outline, [x, y])) ut.push(q)
  }
  return ut
}

/** og kor mange dei er — det tavla og reglane spør om */
export const jointsIn = (spor: readonly Spor[], outline: Pt[]): number => sporIn(spor, outline).length

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
      const mineSpor = sporIn(r.spor, o)
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
        ...(r.plan.farge ? { farge: r.plan.farge } : {}),
        outline: o,
        holes: mine,
        t,
        area,
        mass: (area * t * rho) / 1e9,
        cutLen: cut,
        joints: mineSpor.length,
        spor: mineSpor,
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
  /**
   * PROFILEN FØR SPORA, på eit plan som ER låst — det omrisset vert frose
   * av. `ringar` er profilen slik han vert skoren, med spora i, og å fryse
   * DEN ville bake ledda inn i forma og so skjere dei ein gong til.
   */
  raa?: Pt[][]
  /** stykke av kryssliner med gods i begge plan, i skissa si ramme: to endepunkt, og kva plan */
  kryss: { a: Pt; b: Pt; mot: number }[]
  /** kor langt inne i kroppen planet står, målt langs normalen frå den
   *  nærmaste kanten av boksen, mm — og kva akse normalen ligg nærast */
  avstand: number
  akse: "x" | "y" | "z"
  /** det svaret er ein funksjon av: same nøkkel, same svar, ingen grunn til å teikne om */
  nokkel: string
  /**
   * LEDDA SOM HANDTAK, i profilen si ramme — berre på eit plan som ER
   * låst, av di ei skisse ikkje har ledd enno.
   *
   * Same forma som `Delplass.spor` på plata: botnen er den lukka enden du
   * dreg i, `lo` og `hi` er heile strekket leddet kan delast på, og
   * `nokkel` er namnet `deling` i posen brukar. Difor kan handa setje det
   * same leddet frå rommet som frå plata — det er éi line, lesen frå to
   * stader.
   */
  spor?: { nokkel: string; munn: Pt; botn: Pt; lo: Pt; hi: Pt }[]
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
  const paa = (q: Spor, t: number): Pt => [q.p[0] + q.d[0] * t, q.p[1] + q.d[1] * t]
  const spor = rib.spor.map((q) => ({ nokkel: q.nokkel, munn: paa(q, q.munn), botn: paa(q, q.botn), lo: paa(q, q.lo), hi: paa(q, q.hi) }))
  return { r: rib.r, ringar: [...rib.outlines, ...rib.holes], raa: rib.raa, kryss, spor, ...avstandAv(k, rib.r), nokkel: `laast|${pl.id}|${snittKey(p as unknown as ParamBag, cells)}` }
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
  /**
   * SKISSA SPØR OM DEN SAME RETNINGA SOM SIST.
   *
   * Normalen kjem rett frå kameraet, med kvart siffer eit flyttal har, og
   * `vend` hugsar på fire desimalar. So kvar einaste ramme medan fingeren
   * står på skjermen var ein ny nøkkel: heile nettet snudd og to
   * søppelrutenett bygde om att — og kvar bom kasta ei av dei retningane
   * dei LÅSTE plana treng.
   *
   * Dei låste er alt runda til fire desimalar, i `lesPlan`. Skissa vert
   * runda til det same her, so ho spør om ei retning ho kan få svar på, og
   * so ho ikkje er ein tiandedels promille frå det ho spurde om sist.
   */
  pl = { ...pl, n: norm3(pl.n).map((c: number) => +c.toFixed(4)) as Vec3 }
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
  // skissa er ikkje låst enno, og bøyen vert sett på eit plan som ER låst
  const r: Ramme = { o: mul3(pl.n, d), n: pl.n, u, v, k: 0 }
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
