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
import { offsetPoly, type Pt } from "./core"
import { fitSize, strokesAt } from "./stroke"
import { placedRings, type Nesting } from "./nest"

/** Plate nummer `i` som ei heil R12-fil. Teikninga ER plata. */
export function sheetDxf(n: Nesting, i: number, kerf: number): string {
  const out: string[] = []
  const h = kerf / 2
  const sheet = n.sheets[i]

  head(out, n.sheetW, n.sheetH)

  if (sheet) {
    for (const q of sheet.placed) {
      mark(out, q.part.adr, q.label.p[0], q.label.p[1], q.label)
    }
    for (const q of sheet.placed) {
      for (const hole of placedRings(q).holes) poly(out, "KUTT", offsetPoly(hole, -h))
    }
    for (const q of sheet.placed) {
      poly(out, "KUTT", offsetPoly(placedRings(q).outline, +h))
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

function head(out: string[], w: number, h: number) {
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
    "0", "TABLE", "2", "LAYER", "70", "2",
    // GRAVER står FYRST i tabellen og har det same fargenummeret som
    // graveringa har i SVG-en. Grunnen er den same: eit program som tek
    // laga i den orden dei kjem, skal ta graveringa før kuttet.
    "0", "LAYER", "2", "GRAVER", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "LAYER", "2", "KUTT", "70", "0", "62", "5", "6", "CONTINUOUS",
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
