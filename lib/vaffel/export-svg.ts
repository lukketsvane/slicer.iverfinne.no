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
 *   grått   berre til opplysning: plateomrisset og overskrifta
 *
 * Ingenting er fylt. Ei fylling er ei oppmoding til maskina om å brenne
 * heile flata, og det er nett det ho ikkje skal.
 *
 * Alt er i millimeter med viewBox i millimeter, so eit uttak kan skrivast
 * ut i 1:1 utan at nokon må rekne om noko.
 */
import { offsetPoly, type Pt } from "../core"
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
 * eit kuttark på ni hundre millimeter framleis er synleg når nokon opnar
 * det i ein nettlesar — ein hårstrek på ei plate i den storleiken er ein
 * femtedels piksel, og ei fil ingen kan sjå er ei fil ingen stolar på.
 */
const pen = (span: number) => Math.max(0.4, span / 1400)

/** kuttlinene: svarte, utan fyll. Ei fylling er ei oppmoding om å brenne
 *  heile flata, og det er nett det ho ikkje skal. */
const kutt = (w: number) => `fill="none" stroke="#000000" stroke-width="${f(w)}"`
/** graveringa: blå — det er fargen som skil operasjonane */
const grav = (w: number) =>
  `fill="none" stroke="#0047ff" stroke-width="${f(w)}" stroke-linecap="round"`
/** opplysning, ikkje ein operasjon */
const note = (w: number) =>
  `fill="none" stroke="#9a9a9a" stroke-width="${f(w * 1.4)}" stroke-dasharray="${f(w * 14)} ${f(w * 10)}"`
/** overskrifta, som ligg utanfor materialet */
const tekst = (w: number) =>
  `fill="none" stroke="#9a9a9a" stroke-width="${f(w * 1.2)}" stroke-linecap="round"`

/**
 * Ein tekst rett-lesande i eit SVG, som er snudd på hovudet i høve til ei
 * plate: skrifta vert teikna med y opp, og so vert han spegla om si eiga
 * grunnline. Utan det steget står nummera opp-ned, og eit opp-ned nummer
 * på eit kuttark er verre enn ingen nummer.
 */
const nedover = (lines: Pt[][], base: number): Pt[][] =>
  lines.map((l) => l.map(([x, y]) => [x, base - y] as Pt))

/**
 * Kuttarket, alle platene i éi fil.
 *
 * Y vert spegla, av di SVG reknar nedover og ei plate ikkje gjer det:
 * delen som ligg nede til venstre på plata skal liggja nede til venstre
 * på arket. Platene ligg under kvarandre med luft imellom, so det som er
 * eit ark i fila er eit ark på bordet.
 */
export function sheetSvg(n: Nesting, plyT: number, kerf: number): string {
  const W = n.sheetW
  const H = n.sheetH
  const PAD = 46
  const pitch = H + PAD
  const total = Math.max(1, n.sheets.length) * pitch
  const w = pen(Math.max(W, H))
  const KUTT = kutt(w)
  const GRAV = grav(w)

  const body: string[] = []
  n.sheets.forEach((sheet, i) => {
    const top = i * pitch
    // Plata står med botnen ned. SVG reknar y nedover, so heile arket vert
    // spegla om si eiga midtline: delen som ligg nede til venstre på plata
    // skal liggja nede til venstre på papiret.
    body.push(`<g transform="translate(0,${f(top + H)}) scale(1,-1)">`)
    body.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" ${note(w)}/>`)
    for (const q of sheet.placed) {
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
        // Ingen spegling her: gruppa er alt spegla, so ein tekst teikna
        // med y opp kjem ut rett veg. Det er overskrifta UTANFOR gruppa
        // som treng snuinga.
        for (const line of strokesAt(q.part.from, q.label.p[0], q.label.p[1], size)) {
          body.push(`<path d="${open(line)}" ${GRAV}/>`)
        }
      }
    }
    body.push(`</g>`)
    // Overskrifta ligg i luka MELLOM platene og ikkje på materialet: ho er
    // til den som opnar fila, og ho skal ikkje kunne brennast ved eit uhell.
    const base = top + H + PAD - 12
    for (const line of nedover(strokes(`ARK ${i + 1}/${n.sheets.length}  ${+plyT.toFixed(2)} MM  ${Math.round(n.util * 100)} PROSENT`, 2, 0, 16), base)) {
      body.push(`<path d="${open(line)}" ${tekst(w)}/>`)
    }
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(total)}mm" viewBox="0 0 ${f(W)} ${f(total)}">`,
    ...body,
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
