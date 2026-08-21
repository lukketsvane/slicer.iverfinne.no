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
 * Kompensasjonen ligg i FILA og ikkje i maskina. Grunnen er at dei fleste
 * som eig ein laser i kjellaren ikkje har ein CAM-pakke som kan setje
 * verktøyoffset, og dei skal kunne bruke reiskapen.
 */
import { shoelace, type Pt } from "../core"
import { placedRings, type Nesting } from "./nest"

/** luka mellom arka i uttaket, mm */
const SHEET_GAP = 200

export function partsToDxf(nesting: Nesting, plyT: number, kerf: number): string {
  const out: string[] = []
  const h = kerf / 2
  const pitch = nesting.sheetH + SHEET_GAP

  head(out, nesting.sheetW, Math.max(1, nesting.sheets.length) * pitch)

  nesting.sheets.forEach((sheet, i) => {
    const oy = i * pitch
    // plateomrisset står på GRAVER: det er ei opplysning, ikkje eit kutt
    poly(out, "GRAVER", [
      [0, oy],
      [sheet.w, oy],
      [sheet.w, oy + sheet.h],
      [0, oy + sheet.h],
    ])
    text(
      out,
      "GRAVER",
      [sheet.w / 2, oy + sheet.h - 26],
      18,
      `ARK ${i + 1}/${nesting.sheets.length}  ${fmt(plyT)} MM`,
    )
    for (const q of sheet.placed) {
      const r = placedRings({ ...q, y: q.y + oy })
      poly(out, "KUTT", offsetPoly(r.outline, +h))
      for (const hole of r.holes) poly(out, "KUTT", offsetPoly(hole, -h))
      text(out, "GRAVER", centre(r.outline), 14, q.part.id)
    }
  })

  out.push("0", "ENDSEC", "0", "EOF")
  return out.join("\r\n") + "\r\n"
}

// =============================================================================
// SNITTBREIDD
// =============================================================================
/**
 * Konturen skuva `d` millimeter utover langs vinkelhalveringslina. Det er
 * ikkje eit ekte offset — eit ekte offset kollapsar hjørne der radien er
 * mindre enn skuvet — men på ein tidels millimeter mot ein hjørneradius på
 * fleire er skilnaden under det maskina kan halde, og han går rette vegen.
 */
export function offsetPoly(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  if (n < 3 || Math.abs(d) < 1e-6) return poly
  const ccw = shoelace(poly) > 0
  const s = ccw ? d : -d
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const n1 = norm(a, b)
    const n2 = norm(b, c)
    let mx = n1[0] + n2[0]
    let my = n1[1] + n2[1]
    const L = Math.hypot(mx, my)
    if (L < 1e-9) {
      out.push(b)
      continue
    }
    mx /= L
    my /= L
    // korriger for at halveringslina er kortare enn normalen i eit hjørne
    const k = Math.max(0.4, n1[0] * mx + n1[1] * my || 1)
    out.push([b[0] + (s * mx) / k, b[1] + (s * my) / k])
  }
  return out
}

/** utovernormalen til kanten a→b i eit polygon mot klokka */
function norm(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return [dy / L, -dx / L]
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
    "0", "LAYER", "2", "KUTT", "70", "0", "62", "1", "6", "CONTINUOUS",
    "0", "LAYER", "2", "GRAVER", "70", "0", "62", "3", "6", "CONTINUOUS",
    "0", "ENDTAB", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  )
}

function poly(out: string[], layer: string, pts: Pt[]) {
  if (pts.length < 2) return
  out.push(
    "0", "POLYLINE", "8", layer,
    "66", "1", // hjørna fylgjer som eigne VERTEX-entitetar
    "70", "1", // lukka
    "10", "0.0", "20", "0.0", "30", "0.0",
  )
  for (const q of pts) {
    out.push("0", "VERTEX", "8", layer, "10", f(q[0]), "20", f(q[1]), "30", "0.0")
  }
  out.push("0", "SEQEND", "8", layer)
}

function text(out: string[], layer: string, at: Pt, hgt: number, s: string) {
  out.push(
    "0", "TEXT", "8", layer,
    "10", f(at[0]), "20", f(at[1]), "30", "0.0",
    "40", f(hgt),
    "1", s,
    "72", "1", "73", "2", // midtstilt i begge retningar
    "11", f(at[0]), "21", f(at[1]), "31", "0.0",
  )
}
