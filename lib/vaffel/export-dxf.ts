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
 */
import { offsetPoly, type Pt } from "../core"
import { fitSize, strokesAt, strokes } from "../stroke"
import { placedRings, type Nesting } from "./nest"

/** luka mellom arka i uttaket, mm */
export const SHEET_GAP = 200

export function partsToDxf(n: Nesting, plyT: number, kerf: number): string {
  const out: string[] = []
  const h = kerf / 2
  const pitch = n.sheetH + SHEET_GAP

  head(out, n.sheetW, Math.max(1, n.sheets.length) * pitch)

  n.sheets.forEach((sheet, i) => {
    const oy = i * pitch
    // plateomrisset står på GRAVER: det er ei opplysning om kor plata
    // ligg, ikkje ein kant nokon skal skjere
    poly(out, "GRAVER", [
      [0, oy],
      [n.sheetW, oy],
      [n.sheetW, oy + n.sheetH],
      [0, oy + n.sheetH],
    ])
    // Overskrifta ligg UTANFOR plata. Ho er til den som opnar fila, ikkje
    // til stråla — og ligg ho utanfor, kan ho ikkje brennast ved eit uhell.
    for (const line of strokes(
      `ARK ${i + 1}/${n.sheets.length}  ${fmt(plyT)} MM`,
      0,
      oy + n.sheetH + 24,
      16,
    )) {
      poly(out, "GRAVER", line, false)
    }
    for (const q of sheet.placed) {
      mark(out, q.part.from, q.label.p[0], q.label.p[1] + oy, q.label)
    }
    for (const q of sheet.placed) {
      for (const hole of placedRings(q).holes) {
        poly(out, "KUTT", offsetPoly(hole.map(([x, y]) => [x, y + oy] as Pt), -h))
      }
    }
    for (const q of sheet.placed) {
      const r = placedRings(q)
      poly(out, "KUTT", offsetPoly(r.outline.map(([x, y]) => [x, y + oy] as Pt), +h))
    }
  })

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
const fmt = (v: number) => String(+v.toFixed(2))

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
