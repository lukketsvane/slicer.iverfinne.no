/**
 * VAFFEL — DXF ut.
 *
 * R12 ASCII, millimeter, to lag: KUTT og GRAVER. R12 er gamalt og fattig,
 * og nett difor rett: LWPOLYLINE kom fyrst i R13, so eldre fresprogram og
 * laserpanel les han ikkje. POLYLINE med VERTEX og SEQEND opnar alle stader.
 *
 * SNITTBREIDDA
 * Verktøyet har breidd. Køyrer senteret langs den nominelle konturen, et
 * halve snittet seg inn i delen på kvar side, og delen kjem ut ein heil
 * snittbreidd for lita. På ein vaffel er det ikkje ein finesse: klaringa er
 * under ein tidels millimeter per side, og eit ukompensert kutt gjer kvart
 * spor eit heilt snitt for vidt — og då fell rutenettet frå kvarandre.
 *
 * Kompensasjonen ligg i FILA og ikkje i maskina så lenge `snittveg` seier
 * det. Grunnen er at dei fleste som eig ein laser i kjellaren ikkje har ein
 * CAM-pakke som kan setje verktøyoffset, og dei skal kunne bruke reiskapen.
 * Set du offset i programmet ditt, kjem `kerf` hit som null.
 *
 * REKKJEFYLGDA: gravering fyrst, so dei innvendige kutta, og omrisset til
 * slutt. Ein del som er skoren laus før spora er skorne, ligg ikkje lenger
 * i plata når stråla kjem tilbake til han.
 *
 * EI PLATE, I EI FIL — same avgjerda som kuttarket tok i `export-svg.ts`,
 * og DXF-en var den eine skrivaren som ikkje tok henne. Han stabla kvar
 * plate 200 mm over den førre i den same teikninga, og då er ei heilt
 * vanleg oppgåve utanfor bordet: ein kube med seks ganger seks plan på
 * 600x400 vert 1200 mm hog, sju ganger sju vert 4200. Seks av sju plater
 * ligg utanfor kva maskina kan setjast til, og fila seier det ingen stad.
 * No er teikninga plata: $EXTMIN er hjørnet hennar og $EXTMAX er det andre
 * hjørnet, og kva plate dette er, står i FILNAMNET slik det gjer for arket.
 *
 * Difor er overskrifta borte. Ho stod utanfor plata for ikkje å kunne
 * brennast — men utanfor plata er òg utanfor bordet, og ho var det einaste
 * som sa kva plate du såg på. Namnet seier det no, og seier det før du har
 * opna fila.
 *
 * OG PLATEOMRISSET ER BORTE MED HENNE. Det stod att ein runde til, med den
 * grunngjevinga at ein DXF ikkje ber målet sitt slik ein SVG gjer det i
 * `width` og `height`, so ramma var det einaste i fila som sa kor plata
 * låg. Den grunnen fall same dagen: når teikninga ER plata, seier
 * $EXTMIN og $EXTMAX kor ho ligg, og filnamnet seier kva for ei.
 *
 * Og ramma var ikkje ei opplysning. LightBurn kastar lagnamn og sorterer
 * etter FARGE, so GRAVER — ACI 7, altso svart — kjem inn som C00: det
 * fyrste laget, det fila sjølv ber om skal køyre fyrst. Ei lukka bane
 * kring heile plata på det laget er to meter brend line rundt bordkanten
 * til den som skjer. `export-svg.ts` argumenterte seg fram til dette tre
 * filer unna — «eit lag nokon må hugse å slå av, og eit lag nokon ein dag
 * gløymer å slå av» — og DXF-en var den eine skrivaren som ikkje høyrde
 * etter. To fargar, og fargen er operasjonen: på GRAVER ligg det adresser
 * og ikkje anna.
 */
import { LAG_FARGAR, lagFarge, offsetPoly, type Pt } from "./core"
import { fitSize, strokesAt } from "./stroke"
import { placedRings, type Nesting } from "./nest"

/** Plate nummer `i` som ei heil R12-fil. Teikninga ER plata. */
export function sheetDxf(n: Nesting, i: number, kerf: number): string {
  const out: string[] = []
  const h = kerf / 2
  const sheet = n.sheets[i]

  // laga handa har merkt delar på denne plata med, i palettorden
  const merkte = [...new Set((sheet?.placed ?? []).map((q) => lagFarge(q.part.farge)).filter((v): v is number => v !== null))].sort((a, b) => a - b)
  head(out, n.sheetW, n.sheetH, merkte)

  if (sheet) {
    const lag = (q: { part: { farge?: number } }) => (lagFarge(q.part.farge) !== null ? lagNamn(q.part.farge as number) : "KUTT")
    for (const q of sheet.placed) {
      mark(out, q.part.adr, q.label.p[0], q.label.p[1], q.label)
    }
    for (const q of sheet.placed) {
      for (const hole of placedRings(q).holes) poly(out, lag(q), offsetPoly(hole, -h))
    }
    for (const q of sheet.placed) {
      poly(out, lag(q), offsetPoly(placedRings(q).outline, +h))
    }
  }

  out.push("0", "ENDSEC", "0", "EOF")
  return out.join("\r\n") + "\r\n"
}

/**
 * Adressa til delen, gravert som strekar.
 *
 * Ikkje som ein TEXT-entitet. Ein TEXT er eit spørsmål til maskina om ho
 * har den skrifta, og svaret er ofte at ho hoppar over han — og då står du
 * med tretti like ribber og ingen måte å vita kva som er kva. Strekar er
 * geometri, og geometri kan ingen maskin misforstå.
 */
function mark(
  out: string[],
  text: string,
  x: number,
  y: number,
  rom: { room: number; wide: number },
) {
  const size = fitSize(text, rom.room, rom.wide)
  if (!size) return
  for (const line of strokesAt(text, x, y, size)) poly(out, "GRAVER", line, false)
}

const centre = (poly: Pt[]): Pt => {
  let x = 0
  let y = 0
  for (const q of poly) {
    x += q[0]
    y += q[1]
  }
  return [x / poly.length, y / poly.length]
}

// =============================================================================
// DXF-STILLAS
// =============================================================================
const f = (v: number) => (Math.abs(v) < 1e-9 ? "0.0" : v.toFixed(4))

/**
 * EIT MERKT LAG I DXF-EN. Namnet er LightBurn sitt («C02»), so den som
 * les fila kjenner det att. Fargen er vanskelegare: R12 har berre ACI, eit
 * tal frå ein fast tabell, og dei fleste av dei tretti fargane i paletten
 * finst ikkje der. Laget får den nærmaste av grunnfargane som ACI, og den
 * EKSAKTE fargen som 420 (true colour) attåt — ein kode som kom seinare
 * enn R12, som lesarar som ikkje kjenner han hoppar over, og som dei som
 * gjer det les ordrett. SVG-en er den eksakte vegen; DXF-en gjer sitt
 * beste.
 */
const lagNamn = (farge: number) => `C${String(farge).padStart(2, "0")}`
const ACI: [number, [number, number, number]][] = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]],
  [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]], [30, [255, 127, 0]],
]
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
function aci(farge: number): number {
  const c = rgb(LAG_FARGAR[farge])
  let best = 5
  let d0 = Infinity
  for (const [i, q] of ACI) {
    const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2
    if (d < d0) {
      d0 = d
      best = i
    }
  }
  return best
}
const trueColour = (farge: number) => {
  const [r, g, b] = rgb(LAG_FARGAR[farge])
  return String((r << 16) | (g << 8) | b)
}

function head(out: string[], w: number, h: number, merkte: readonly number[] = []) {
  out.push(
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    // $INSUNITS kom fyrst i R14, men ukjende hovudvariablar vert hoppa over;
    // utan han står det ingen stad i fila at tala er millimeter
    "9", "$INSUNITS", "70", "4",
    "9", "$EXTMIN", "10", "0.0", "20", "0.0", "30", "0.0",
    "9", "$EXTMAX", "10", f(w), "20", f(h), "30", "0.0",
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", String(2 + merkte.length),
    // GRAVER står FYRST i tabellen og har det same fargenummeret som
    // graveringa har i SVG-en. Grunnen er den same: eit program som tek
    // laga i den orden dei kjem, skal ta graveringa før kuttet.
    "0", "LAYER", "2", "GRAVER", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "LAYER", "2", "KUTT", "70", "0", "62", "5", "6", "CONTINUOUS",
    // og dei merkte laga etter, i palettorden
    ...merkte.flatMap((c) => ["0", "LAYER", "2", lagNamn(c), "70", "0", "62", String(aci(c)), "420", trueColour(c), "6", "CONTINUOUS"]),
    "0", "ENDTAB", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  )
}

function poly(out: string[], layer: string, pts: Pt[], closed = true) {
  if (pts.length < 2) return
  out.push(
    "0", "POLYLINE", "8", layer,
    "66", "1", // hjørna fylgjer som eigne VERTEX-entitetar
    "70", closed ? "1" : "0",
    "10", "0.0", "20", "0.0", "30", "0.0",
  )
  for (const q of pts) {
    out.push("0", "VERTEX", "8", layer, "10", f(q[0]), "20", f(q[1]), "30", "0.0")
  }
  out.push("0", "SEQEND", "8", layer)
}
