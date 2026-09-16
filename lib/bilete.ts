/**
 * SLICERMAN — eit bilete vert ei plate.
 *
 * Ein silhuett, ein logo, ei skisse på papir: det mørke er gods, det ljose
 * er luft. Biletet vert lese som ljosstyrke, jamna ut, skore ved ein
 * terskel, og nullstaden er omrisset — den største ytterkanten — med hòla
 * inni han som teikna konturar. Reint: pikslar inn, punkt ut. Studioet
 * set det inn i teikneplanet.
 */
import { contour } from "./contour"
import { inRing, shoelace, type Pt } from "./core"
import { OMRISS_TAK, STREK_TAK, type Strek } from "./plan"
import { mjukePunkt, teiknaKontur, tettMjukt } from "./teikning"

/** ljosstyrke 0 (svart) til 1 (kvitt), rad for rad ovanfrå */
export type Maske = { lys: Float32Array; w: number; h: number }
/** terskel 0–1, mjuking i pikslar, snu gjer det ljose til gods */
export type BileteVal = { terskel: number; mjuk: number; snu: boolean }
/** i einingar av den lengste sida av biletet, kring midten, y opp */
export type BileteForm = { omriss: Pt[]; runde: number[]; hol: Strek[] }

/** eit boksslør i to gonger, rad og kolonne */
function sloer(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const b = new Float32Array(a.length)
  const c = new Float32Array(a.length)
  for (let y = 0; y < h; y++) {
    let sum = 0, n = 0
    for (let x = -r; x < w + r; x++) {
      if (x + r < w) { sum += a[y * w + x + r]; n++ }
      if (x - r - 1 >= 0) { sum -= a[y * w + x - r - 1]; n-- }
      if (x >= 0 && x < w) b[y * w + x] = sum / n
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0, n = 0
    for (let y = -r; y < h + r; y++) {
      if (y + r < h) { sum += b[(y + r) * w + x]; n++ }
      if (y - r - 1 >= 0) { sum -= b[(y - r - 1) * w + x]; n-- }
      if (y >= 0 && y < h) c[y * w + x] = sum / n
    }
  }
  return c
}

/** eit hòl som konturstrek: punkta i einingsboksen, boksen der hòlet er */
export function konturStrek(p: readonly Pt[]): Strek {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const w = Math.max(1e-4, x1 - x0), h = Math.max(1e-4, y1 - y0)
  const x = (x0 + x1) / 2, y = (y0 + y1) / 2
  const k = (v: number) => Math.max(-0.5, Math.min(0.5, +v.toFixed(4)))
  return { slag: "hol", form: "kontur", punkt: p.map((q): Pt => [k((q[0] - x) / w), k((q[1] - y) / h)]), x, y, w, h, a: 0 }
}

/**
 * FORMA I BILETET, eller null når ingenting er mørkt nok.
 *
 * Ein ramme av luft kring biletet gjer at kvar kant er lukka, òg der det
 * mørke går ut i kanten. Hòl mindre enn ein promille av biletet er støv og
 * fell bort; dei største kjem fyrst, opp til streketaket.
 */
export function bileteForm(m: Maske, val: BileteVal): BileteForm | null {
  const { w, h } = m
  if (w < 2 || h < 2) return null
  const r = Math.max(0, Math.round(val.mjuk))
  const lys = r > 0 ? sloer(m.lys, w, h, r) : m.lys
  const W = w + 2, H = h + 2
  const g = new Float64Array(W * H).fill(-1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = lys[y * w + x]
      const d = val.snu ? v - val.terskel : val.terskel - v
      // null er ein knivsegg for marsjen: ein bitteliten skuv avgjer han
      g[(h - y) * W + x + 1] = d === 0 ? -1e-6 : d
    }
  }
  const s = 1 / Math.max(w, h)
  const loops = contour(g, 0, 1, W - 1, 0, 1, H - 1).map((l) => ({ ...l, pts: l.pts.map(([x, y]): Pt => [(x - W / 2) * s, (y - H / 2) * s]) }))
  const ytre = loops.filter((l) => l.area > 0).sort((a, b) => b.area - a.area)[0]
  if (!ytre) return null
  const tol = 0.6 * s
  const omriss = teiknaKontur(ytre.pts, tol)
  if (!omriss || omriss.length > OMRISS_TAK) return null
  const hol: Strek[] = []
  const inni = loops
    .filter((l) => l.area < 0 && Math.abs(l.area) * s * s > 1e-3 && inRing(omriss, l.pts[0]))
    .sort((a, b) => a.area - b.area)
  for (const l of inni) {
    if (hol.length >= STREK_TAK) break
    const k = teiknaKontur(l.pts, tol)
    if (k && Math.abs(shoelace(k)) > 0) hol.push(konturStrek(tettMjukt(k)))
  }
  return { omriss, runde: mjukePunkt(omriss), hol }
}

/** forma skalert med `k` — frå einingar av biletet til brøk av storleiken */
export function skalerForm(f: BileteForm, k: number): BileteForm {
  const r = (v: number) => +(v * k).toFixed(4)
  return {
    omriss: f.omriss.map(([x, y]): Pt => [r(x), r(y)]),
    runde: f.runde,
    hol: f.hol.map((st) => ({ ...st, x: r(st.x), y: r(st.y), w: r(st.w), h: r(st.h) })),
  }
}
