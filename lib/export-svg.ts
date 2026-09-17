import { nn, offsetPoly, type Pt } from "./core"
import { LAG_FARGAR, lagFarge } from "./core"
import { fitSize, strokes, strokesAt } from "./stroke"
import { bokstav, type Snitt } from "./snitt"
import { placedRings, type Nesting } from "./nest"
import { rilla, rilleMal } from "./rille"

const f = (v: number) => (Math.abs(v) < 1e-4 ? "0" : v.toFixed(2))
export const ring = (pts: Pt[]) =>
  pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])},${f(q[1])}`).join(" ") + "Z"
export const bane = (pts: Pt[]) =>
  pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])},${f(q[1])}`).join(" ")

const pen = (span: number) => Math.max(0.4, span / 1400)

const GRAV = "#000000"
const CUT = "#0000ff"

const kutt = (w: number, farge?: number) => `fill="none" stroke="${lagFarge(farge) !== null ? LAG_FARGAR[farge as number] : CUT}" stroke-width="${f(w)}"`
const grav = (w: number) =>
  `fill="none" stroke="${GRAV}" stroke-width="${f(w)}" stroke-linecap="round"`

const nedover = (lines: Pt[][], base: number): Pt[][] =>
  lines.map((l) => l.map(([x, y]) => [x, base - y] as Pt))

export function sheetSvg(n: Nesting, index: number, kerf: number): string {
  const W = n.sheetW
  const H = n.sheetH
  const w = pen(Math.max(W, H))
  const GRAV = grav(w)
  const sheet = n.sheets[index]

  const gravert: string[] = []
  const innvendig: string[] = []
  const omriss: string[] = []
  for (const q of sheet?.placed ?? []) {
    const r = placedRings(q)
    const KUTT = kutt(w, q.part.farge)
    omriss.push(`<path d="${ring(offsetPoly(r.outline, kerf / 2))}" ${KUTT}/>`)
    for (const h of r.holes) {
      innvendig.push(`<path d="${ring(offsetPoly(h, -kerf / 2))}" ${KUTT}/>`)
    }
    for (const l of r.rille) innvendig.push(`<path d="${bane(l)}" ${KUTT}/>`)
    const size = fitSize(q.part.adr, q.label.room, q.label.wide)
    if (size) {
      for (const line of strokesAt(q.part.adr, q.label.p[0], q.label.p[1], size)) {
        gravert.push(`<path d="${bane(line)}" ${GRAV}/>`)
      }
    }
  }
  const body = [...gravert, ...innvendig, ...omriss]

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">`,
    `<g transform="translate(0,${f(H)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n")
}

const STEG = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] as const

export function couponSvg(
  tjukn: number,
  kerf: number,
  snitt: number,
  material: string,
): string {
  const djup = Math.max(10, tjukn * 4)
  const skulder = Math.max(4, tjukn * 2)
  const celle = tjukn + STEG[STEG.length - 1] + 2 * skulder
  const W = celle * STEG.length
  const H = djup + 22
  const w = pen(Math.max(W, H))

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

  const body: string[] = []
  const GRAV = grav(w)
  const merk = (t: string, cx: number, cy: number, size: number) => {
    for (const line of strokesAt(t, cx, cy, size)) {
      body.push(`<path d="${bane(line)}" ${GRAV}/>`)
    }
  }
  for (let i = 0; i < STEG.length; i++) {
    merk(String(Math.round(STEG[i] * 100)), (i + 0.5) * celle, H - djup - 7, 4)
  }
  merk("KLARING 1/100 MM", W / 2, 10, 3)
  merk(`T${nn(tjukn, 1)} ${material.toUpperCase()}  KERF ${nn(snitt, 2)}`, W / 2, 4.5, 3)
  body.push(`<path d="${ring(offsetPoly(o, kerf / 2))}" ${kutt(w)}/>`)

  const k = kerf / 2

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W + 2 * k)}mm" ` +
      `height="${f(H + 2 * k)}mm" ` +
      `viewBox="${f(-k)} ${f(-k)} ${f(W + 2 * k)} ${f(H + 2 * k)}">`,
    `<g transform="translate(0,${f(H)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n")
}

const BOGSTEG = [0.5, 0.75, 1, 1.5, 2] as const

export function bendCouponSvg(tjukn: number, kerf: number, snitt: number, material: string): string {
  const grunn = rilleMal(1e6, tjukn, material).steg
  const mal = BOGSTEG.map((m) => ({ ...rilleMal(1e6, tjukn, material), steg: grunn * m }))
  const breidd = Math.max(30, 8 * grunn * BOGSTEG[BOGSTEG.length - 1])
  const luft = Math.max(6, 2 * tjukn)
  const hogd = 3 * (mal[0].lengd + mal[0].bru) + 2
  const W = BOGSTEG.length * breidd + (BOGSTEG.length + 1) * luft
  const H = hogd + 22
  const w = pen(Math.max(W, H))

  const o: Pt[] = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]

  const body: string[] = []
  const GRAV = grav(w)
  const KUTT = kutt(w)
  const merk = (t: string, cx: number, cy: number, size: number) => {
    for (const line of strokesAt(t, cx, cy, size)) body.push(`<path d="${bane(line)}" ${GRAV}/>`)
  }
  for (let i = 0; i < BOGSTEG.length; i++) {
    merk(nn(mal[i].steg, 1), luft + (i + 0.5) * breidd + i * luft, H - hogd - 7, 4)
  }
  merk("STEG MM · KRUM KVART FELT · TAK DET GROVASTE SOM HELD", W / 2, 10, 3)
  merk(`T${nn(tjukn, 1)} ${material.toUpperCase()}  KERF ${nn(snitt, 2)}`, W / 2, 4.5, 3)

  for (let i = 0; i < BOGSTEG.length; i++) {
    const x0 = luft + i * (breidd + luft)
    const felt: Pt[] = [
      [x0, H - hogd],
      [x0 + breidd, H - hogd],
      [x0 + breidd, H - 1],
      [x0, H - 1],
    ]
    for (const l of rilla({ omriss: felt, hol: [], sperr: [], k: 0, tjukn, material, mal: mal[i] })) {
      body.push(`<path d="${bane(l)}" ${KUTT}/>`)
    }
  }
  body.push(`<path d="${ring(offsetPoly(o, kerf / 2))}" ${KUTT}/>`)

  const k = kerf / 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W + 2 * k)}mm" ` +
      `height="${f(H + 2 * k)}mm" ` +
      `viewBox="${f(-k)} ${f(-k)} ${f(W + 2 * k)} ${f(H + 2 * k)}">`,
    `<g transform="translate(0,${f(H)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("\n")
}

export function profileSvg(sn: Snitt, kerf: number): string {
  const GAP = 10
  type Lagd = { r: Snitt["ribber"][number]; lo: number; hi: number; top: number }
  const alle: Lagd[] = []
  for (const r of sn.ribber) {
    let lo = Infinity
    let hi = -Infinity
    let top = -Infinity
    let btm = Infinity
    for (const o of r.outlines) {
      for (const q of o) {
        lo = Math.min(lo, q[0])
        hi = Math.max(hi, q[0])
        top = Math.max(top, q[1])
        btm = Math.min(btm, q[1])
      }
    }
    if (!Number.isFinite(lo)) continue
    alle.push({ r, lo, hi, top: top - btm })
  }
  const s = sn.k.solid
  const taket = Math.max(600, 3 * Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]))
  const rader: Lagd[][] = [[]]
  let bx = GAP
  for (const l of alle) {
    const w = l.hi - l.lo
    if (rader[rader.length - 1].length && bx + w > taket) {
      rader.push([])
      bx = GAP
    }
    rader[rader.length - 1].push(l)
    bx += w + GAP
  }
  let W = 10
  let H = GAP
  for (const rad of rader) {
    W = Math.max(W, rad.reduce((a, l) => a + l.hi - l.lo + GAP, GAP))
    H += rad.reduce((a, l) => Math.max(a, l.top), 0) + GAP + 12
  }
  const w = pen(Math.max(W, H))
  const GRAV = grav(w)

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" ` +
      `viewBox="0 0 ${f(W)} ${f(H)}">`,
  )

  const gravert: string[] = []
  const innvendig: string[] = []
  const omriss: string[] = []

  let yOff = GAP
  for (const rad of rader) {
    const h = rad.reduce((a, l) => Math.max(a, l.top), 0)
    yOff += h
    let x = GAP
    for (const { r, lo, hi } of rad) {
      const KUTT = kutt(w, r.plan.farge)
      let btm = Infinity
      for (const o of r.outlines) for (const q of o) btm = Math.min(btm, q[1])
      const lagd = (q: Pt[], d: number) =>
        offsetPoly(q, d).map((p) => [x + (p[0] - lo), yOff - (p[1] - btm)] as Pt)
      const fleire = r.outlines.length > 1
      r.outlines.forEach((o, i) => {
        let olo = Infinity
        for (const q of o) olo = Math.min(olo, q[0])
        const adr = String(r.plan.id) + (fleire ? bokstav(i) : "")
        for (const line of nedover(strokes(adr, x + (olo - lo) + 1, 0, 8), yOff + 11)) {
          gravert.push(`<path d="${bane(line)}" ${GRAV}/>`)
        }
      })
      for (const q of r.holes) {
        innvendig.push(`<path d="${ring(lagd(q, -kerf / 2))}" ${KUTT}/>`)
      }
      for (const l of r.rille) {
        innvendig.push(`<path d="${bane(lagd(l, 0))}" ${KUTT}/>`)
      }
      for (const q of r.outlines) {
        omriss.push(`<path d="${ring(lagd(q, kerf / 2))}" ${KUTT}/>`)
      }
      x += hi - lo + GAP
    }
    yOff += GAP + 12
  }
  out.push(...gravert, ...innvendig, ...omriss)
  out.push("</svg>")
  return out.join("\n")
}
