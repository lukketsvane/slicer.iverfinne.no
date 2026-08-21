/**
 * VAFFEL — SVG ut.
 *
 * To teikningar, og dei svarar på kvar sitt spørsmål. Kuttarket svarar på
 * «kva må eg kjøpe og kva ligg kvar», og profilarket på «kor mange ULIKE
 * delar er dette eigentleg». Det siste er det interessante talet: er
 * objektet symmetrisk og ribbetalet likt, fell dei to familiane saman og
 * heile stabelen er kopiar av nokre få delar.
 *
 * SVG-en er i millimeter med viewBox i millimeter, så eit uttak kan
 * skrivast ut i 1:1 utan at nokon må rekne om noko. Det er òg formatet dei
 * fleste laserprogram opnar utan å klage.
 */
import { bbox, type Pt } from "../core"
import { placedRings, type Nesting } from "./nest"
import type { Grid } from "./ribs"

const f = (v: number) => (Math.abs(v) < 1e-4 ? "0" : v.toFixed(2))
const path = (pts: Pt[]) =>
  pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])},${f(q[1])}`).join(" ") + "Z"

/**
 * Kuttarket. Y vert spegla, av di SVG reknar nedover og ei plate ikkje gjer
 * det: delen som ligg nede til venstre på plata skal liggja nede til
 * venstre på arket.
 */
export function sheetSvg(n: Nesting, index = 0): string {
  const sheet = n.sheets[Math.min(index, n.sheets.length - 1)]
  if (!sheet) return "<svg xmlns='http://www.w3.org/2000/svg'/>"
  const W = n.sheetW
  const H = n.sheetH
  const body: string[] = []
  for (const q of sheet.placed) {
    const r = placedRings(q)
    body.push(`<path d="${path(r.outline)}" fill="#f2efe9" stroke="#111" stroke-width="1"/>`)
    for (const h of r.holes) {
      body.push(`<path d="${path(h)}" fill="#fff" stroke="#111" stroke-width="1"/>`)
    }
    const b = bbox(r.outline)
    body.push(
      `<text x="${f((b.x0 + b.x1) / 2)}" y="${f((b.y0 + b.y1) / 2)}" font-family="monospace" font-size="16" text-anchor="middle" fill="#111">${q.part.id}</text>`,
    )
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<g transform="translate(0,${H}) scale(1,-1)">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#c00" stroke-width="2" stroke-dasharray="12 8"/>`,
    ...body,
    `</g>`,
    `<text x="20" y="${H - 16}" font-family="monospace" font-size="20" fill="#111">ARK ${index + 1}/${n.sheets.length} · ${W} × ${H} mm · utnytting ${Math.round(n.util * 100)} %</text>`,
    `</svg>`,
  ].join("\n")
}

/**
 * Profilarket. Alle ribbene lagde ut ved sida av kvarandre i den
 * rekkjefylgja dei står i, X-familien øvst og Y-familien nedst. Det er
 * denne teikninga som står i menyen og fylgjer kvar einaste
 * parameterendring — ingen skal måtte laste ned ei fil for å sjå kva
 * delane er.
 */
export function profileSvg(g: Grid): string {
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
      for (const ring of r.outlines) {
        for (const q of ring) {
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

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" ` +
      `viewBox="0 0 ${f(W)} ${f(H)}">`,
  )
  out.push(`<rect width="${f(W)}" height="${f(H)}" fill="#fff"/>`)

  let yOff = GAP + ex.h
  for (const rs of [xr, yr]) {
    let x = GAP
    for (const r of rs) {
      let lo = Infinity
      let hi = -Infinity
      for (const ring of r.outlines) {
        for (const q of ring) {
          lo = Math.min(lo, q[0])
          hi = Math.max(hi, q[0])
        }
      }
      if (!Number.isFinite(lo)) continue
      for (const ring of [...r.outlines, ...r.holes]) {
        // Y vert spegla: SVG reknar nedover, og ei ribbe står oppreist.
        const pts = ring.map((q) => [x + (q[0] - lo), yOff - q[1]] as Pt)
        out.push(`<path d="${path(pts)}" fill="none" stroke="#111" stroke-width="0.6"/>`)
      }
      out.push(
        `<text x="${f(x + 2)}" y="${f(yOff + 8)}" font-family="sans-serif" ` +
          `font-size="7" fill="#666">${r.axis.toUpperCase()}${r.k + 1}</text>`,
      )
      x += hi - lo + GAP
    }
    yOff += ey.h + GAP + 12
  }
  out.push("</svg>")
  return out.join("\n")
}
