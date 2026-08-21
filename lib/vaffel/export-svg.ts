/**
 * VAFFEL — SVG ut.
 *
 * Tre teikningar, og dei svarar på kvar sitt spørsmål. Kuttarket svarar på
 * «kva må eg kjøpe og kva ligg kvar», profilarket på «kor mange ULIKE
 * delar er dette eigentleg», og synet i panelet på «kva er det eg held på
 * med akkurat no».
 *
 * FARGANE ER LAG. Ein SVG har ikkje lag slik ein DXF har det, so kvart
 * laserprogram i verda har landa på den same avtalen i staden: éin farge
 * er éi operasjon. Her tyder
 *
 *   svart   KUTT — heilt gjennom
 *   blått   GRAVER — adressa til delen, ein strek og ikkje eit fylt felt
 *
 * To fargar, og ikkje ein til. Alt anna — plateramme, overskrift, hjelpe-
 * liner — er eit lag nokon må hugse å slå av, og eit lag nokon ein dag
 * gløymer å slå av. Kva plate dette er, står i filnamnet.
 *
 * Ingenting er fylt. Ei fylling er ei oppmoding til maskina om å brenne
 * heile flata, og det er nett det ho ikkje skal.
 *
 * Alt er i millimeter med viewBox i millimeter, so eit uttak kan skrivast
 * ut i 1:1 utan at nokon må rekne om noko.
 */
import { nn, offsetPoly, type Pt } from "../core"
import { fitSize, strokes, strokesAt } from "../stroke"
import { placedRings, type Nesting } from "./nest"
import type { Grid } from "./ribs"

const f = (v: number) => (Math.abs(v) < 1e-4 ? "0" : v.toFixed(2))
const ring = (pts: Pt[]) =>
  pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])},${f(q[1])}`).join(" ") + "Z"
const open = (pts: Pt[]) =>
  pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])},${f(q[1])}`).join(" ")

/**
 * Strektjukna er berre til AUGET.
 *
 * Eit laserprogram les banen og fargen; kor tjukk streken er teikna, bryr
 * det seg ikkje om. Difor kan ho veljast etter kor stor teikninga er, so
 * eit kuttark på ein halv meter framleis er synleg når nokon opnar det i
 * ein nettlesar — ein hårstrek på ei plate i den storleiken er ein
 * femtedels piksel, og ei fil ingen kan sjå er ei fil ingen stolar på.
 */
const pen = (span: number) => Math.max(0.4, span / 1400)

/**
 * FARGEN ER OPERASJONEN, og han må vera EKSAKT.
 *
 * Ein SVG har ikkje lag slik ein DXF har det, so laserprogramma har landa
 * på ein avtale i staden: éin farge er éi operasjon. LightBurn — som ni av
 * ti av desse filene endar i — held ein palett med faste verdiar, og ein
 * farge som ligg NÆR ein av dei er ikkje den fargen. #0047ff er ikkje blå;
 * han er noko som må gjettast på ved import, og gjettinga treng ikkje falle
 * likt to gonger. Rein svart og rein blå fell alltid på same laget.
 */
const CUT = "#000000"
const GRAV = "#0000ff"

const kutt = (w: number) => `fill="none" stroke="${CUT}" stroke-width="${f(w)}"`
const grav = (w: number) =>
  `fill="none" stroke="${GRAV}" stroke-width="${f(w)}" stroke-linecap="round"`

/**
 * Ein tekst rett-lesande i eit SVG, som er snudd på hovudet i høve til ei
 * plate: skrifta vert teikna med y opp, og so vert han spegla om si eiga
 * grunnline. Utan det steget står nummera opp-ned, og eit opp-ned nummer
 * på eit kuttark er verre enn ingen nummer.
 */
const nedover = (lines: Pt[][], base: number): Pt[][] =>
  lines.map((l) => l.map(([x, y]) => [x, base - y] as Pt))

/**
 * EI plate, i éi fil.
 *
 * Ikkje alle på ein gong. I LightBurn arbeider du med ei plate om gongen,
 * og eit uttak med tre plater i same fila tyder at du må merkje og slette
 * dei to andre kvar einaste gong. Uttaket gjev ein ZIP med ei fil per
 * plate når det er fleire enn ei.
 *
 * Dokumentet ER plata: `width` og `height` i millimeter, med viewBox i dei
 * same millimetrane. Difor treng fila korkje ei plateramme eller ei
 * overskrift — ramma ville berre vore eit lag til å slå av, og eit lag til
 * å skjere ved eit uhell. Kva plate dette er, står i FILNAMNET.
 *
 * Y vert spegla, av di SVG reknar nedover og ei plate ikkje gjer det:
 * delen som ligg nede til venstre på plata skal liggja nede til venstre på
 * papiret.
 */
export function sheetSvg(n: Nesting, index: number, kerf: number): string {
  const W = n.sheetW
  const H = n.sheetH
  const w = pen(Math.max(W, H))
  const KUTT = kutt(w)
  const GRAV = grav(w)
  const sheet = n.sheets[index]

  const body: string[] = []
  for (const q of sheet?.placed ?? []) {
    const r = placedRings(q)
    // Snittbreidda ligg i FILA, som i DXF-en: den som har ein laser i
    // kjellaren har sjeldan ein CAM-pakke som kan setje verktøyoffset.
    // Set du kerf i programmet ditt òg, kompenserer du to gonger.
    body.push(`<path d="${ring(offsetPoly(r.outline, kerf / 2))}" ${KUTT}/>`)
    for (const h of r.holes) {
      body.push(`<path d="${ring(offsetPoly(h, -kerf / 2))}" ${KUTT}/>`)
    }
    const size = fitSize(q.part.from, q.label.room, q.label.wide)
    if (size) {
      for (const line of strokesAt(q.part.from, q.label.p[0], q.label.p[1], size)) {
        body.push(`<path d="${open(line)}" ${GRAV}/>`)
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">`,
    `<g transform="translate(0,${f(H)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n")
}

/**
 * PASSPRØVA.
 *
 * Klaring og snittbreidd er to gjettingar, og dei gangar seg med kvarandre
 * i kvart einaste ledd. Bommar du med ein tjuedels millimeter, må seksti
 * ledd bankast i hop — eller dei sit ikkje. Og du får ikkje vita det før
 * heile plata er skoren.
 *
 * Dette er heile svaret, og det tek tjue sekund å skjere: ei lita plate
 * med sju spor, kvart av dei ein tjuedel breiare enn det førre, og talet
 * gravert under. Skjer henne i den plata du skal bruke, skyv eit avkapp av
 * den SAME plata ned i kvart spor, og finn det som går inn med
 * tommelkraft. Det talet er klaringa di.
 *
 * Prøva ber snittbreidda som er sett, av di det er SUMMEN av dei to som
 * vert målt. Kalibrerer du med kerf på null og skjer med kerf på 0,2, har
 * du målt noko anna enn det du skal byggje.
 */
const STEG = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] as const

export function couponSvg(tjukn: number, kerf: number, material: string): string {
  const djup = Math.max(10, tjukn * 4)
  const skulder = Math.max(4, tjukn * 2)
  const celle = tjukn + STEG[STEG.length - 1] + 2 * skulder
  const W = celle * STEG.length
  const H = djup + 22
  const w = pen(Math.max(W, H))

  // Omrisset går mot klokka og dukkar ned i eit spor for kvart steg. Spora
  // er OPNE i overkanten: du skal kunne skyve avkappet ned i dei ovanfrå.
  const o: Pt[] = [
    [0, 0],
    [W, 0],
    [W, H],
  ]
  for (let i = STEG.length - 1; i >= 0; i--) {
    const cx = (i + 0.5) * celle
    const half = (tjukn + STEG[i]) / 2
    o.push([cx + half, H], [cx + half, H - djup], [cx - half, H - djup], [cx - half, H])
  }
  o.push([0, H])

  const body = [`<path d="${ring(offsetPoly(o, kerf / 2))}" ${kutt(w)}/>`]
  const GRAV = grav(w)
  // Inga spegling her: gruppa er alt spegla, so ein tekst teikna med y opp
  // kjem ut rett veg.
  const merk = (t: string, cx: number, cy: number, size: number) => {
    for (const line of strokesAt(t, cx, cy, size)) {
      body.push(`<path d="${open(line)}" ${GRAV}/>`)
    }
  }
  for (let i = 0; i < STEG.length; i++) {
    merk(String(Math.round(STEG[i] * 100)), (i + 0.5) * celle, H - djup - 7, 4)
  }
  merk("KLARING 1/100 MM", W / 2, 10, 3)
  merk(`T${nn(tjukn, 1)} ${material.toUpperCase()}  KERF ${nn(kerf, 2)}`, W / 2, 4.5, 3)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">`,
    `<g transform="translate(0,${f(H)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n")
}

/**
 * Profilarket: alle ribbene ved sida av kvarandre i den rekkjefylgja dei
 * står i, X-familien øvst og Y-familien nedst.
 *
 * Arket svarar på eitt spørsmål: kor mange ULIKE delar er dette? Er
 * objektet symmetrisk og ribbetalet likt, fell dei to familiane saman og
 * heile stabelen er kopiar av nokre få former.
 *
 * `syn` er den same teikninga med tjukkare strek. Ho er til skjermen i
 * panelet, der ho vert vist tjue gonger for lita: ein hårtynn strek på ei
 * teikning som er skrumpa til hundre og seksti pikslar er ingen strek i
 * det heile.
 */
export function profileSvg(g: Grid, kerf: number, syn = false): string {
  const GAP = Math.max(10, g.p.tjukn * 2)
  const xr = g.ribs.filter((r) => r.axis === "x")
  const yr = g.ribs.filter((r) => r.axis === "y")

  const extent = (rs: typeof g.ribs) => {
    let w = 0
    let h = 0
    for (const r of rs) {
      let lo = Infinity
      let hi = -Infinity
      let top = 0
      for (const o of r.outlines) {
        for (const q of o) {
          lo = Math.min(lo, q[0])
          hi = Math.max(hi, q[0])
          top = Math.max(top, q[1])
        }
      }
      if (!Number.isFinite(lo)) continue
      w += hi - lo + GAP
      h = Math.max(h, top)
    }
    return { w: w + GAP, h }
  }
  const ex = extent(xr)
  const ey = extent(yr)
  const W = Math.max(ex.w, ey.w, 10)
  const H = ex.h + ey.h + 3 * GAP + 24
  // Synet i panelet er vist tjue gonger for lite. Ein strek som er rett
  // på ei plate er ingen strek i det heile der.
  const w = syn ? pen(Math.max(W, H)) * 2.2 : pen(Math.max(W, H))
  const KUTT = kutt(w)
  const GRAV = grav(w)

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" ` +
      `viewBox="0 0 ${f(W)} ${f(H)}">`,
  )

  let yOff = GAP + ex.h
  for (const rs of [xr, yr]) {
    let x = GAP
    for (const r of rs) {
      let lo = Infinity
      let hi = -Infinity
      for (const o of r.outlines) {
        for (const q of o) {
          lo = Math.min(lo, q[0])
          hi = Math.max(hi, q[0])
        }
      }
      if (!Number.isFinite(lo)) continue
      // Y vert spegla: SVG reknar nedover, og ei ribbe står oppreist. Etter
      // speglinga snur ytterkant og hòl om på vindinga, so skuvet er alt
      // rekna FØR henne.
      const lagd = (q: Pt[], d: number) =>
        offsetPoly(q, d).map((p) => [x + (p[0] - lo), yOff - p[1]] as Pt)
      for (const q of r.outlines) {
        out.push(`<path d="${ring(lagd(q, kerf / 2))}" ${KUTT}/>`)
      }
      for (const q of r.holes) {
        out.push(`<path d="${ring(lagd(q, -kerf / 2))}" ${KUTT}/>`)
      }
      const adr = r.axis.toUpperCase() + (r.k + 1)
      for (const line of nedover(strokes(adr, x + 1, 0, 8), yOff + 11)) {
        out.push(`<path d="${open(line)}" ${GRAV}/>`)
      }
      x += hi - lo + GAP
    }
    yOff += ey.h + GAP + 12
  }
  out.push("</svg>")
  return out.join("\n")
}
