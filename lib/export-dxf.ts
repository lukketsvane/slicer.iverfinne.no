import { LAG_FARGAR, lagFarge, offsetPoly, type Pt } from "./core"
import { fitSize, strokesAt } from "./stroke"
import { placedRings, type Nesting } from "./nest"

export function sheetDxf(n: Nesting, i: number, kerf: number): string {
  const out: string[] = []
  const h = kerf / 2
  const sheet = n.sheets[i]

  const merkte = [...new Set((sheet?.placed ?? []).map((q) => lagFarge(q.part.farge)).filter((v): v is number => v !== null))].sort((a, b) => a - b)
  head(out, n.sheetW, n.sheetH, merkte)

  if (sheet) {
    const lag = (q: { part: { farge?: number } }) => (lagFarge(q.part.farge) !== null ? lagNamn(q.part.farge as number) : "KUTT")
    for (const q of sheet.placed) {
      mark(out, q.part.adr, q.label.p[0], q.label.p[1], q.label)
    }
    for (const q of sheet.placed) {
      for (const hole of placedRings(q).holes) poly(out, lag(q), offsetPoly(hole, -h))
      for (const l of placedRings(q).rille) poly(out, lag(q), l, false)
    }
    for (const q of sheet.placed) {
      poly(out, lag(q), offsetPoly(placedRings(q).outline, +h))
    }
  }

  out.push("0", "ENDSEC", "0", "EOF")
  return out.join("\r\n") + "\r\n"
}

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

const f = (v: number) => (Math.abs(v) < 1e-9 ? "0.0" : v.toFixed(4))

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
    "9", "$INSUNITS", "70", "4",
    "9", "$EXTMIN", "10", "0.0", "20", "0.0", "30", "0.0",
    "9", "$EXTMAX", "10", f(w), "20", f(h), "30", "0.0",
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", String(2 + merkte.length),
    "0", "LAYER", "2", "GRAVER", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "LAYER", "2", "KUTT", "70", "0", "62", "5", "6", "CONTINUOUS",
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
