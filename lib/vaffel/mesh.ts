/**
 * VAFFEL — nettet, i tre lesemåtar.
 *
 *   flate   nettet slik det kom inn, etter forenkling og glatting. Det er
 *           ikkje objektet — det er forma objektet er ei tilnærming til,
 *           og skilnaden mellom dei to er heile poenget.
 *   lag     ribbene med spor, kvar der ho står. Dette ER objektet.
 *   kontur  profilane lagde flatt ved sida av kvarandre, slik dei ligg på
 *           plata.
 *
 * Nettet og kuttfila kjem frå dei same polygona. Ein fres som fylgjer
 * konturen skjer den ribba biletet viser.
 */
import { inRing, type Pt, type Vec3 } from "../core"
import type { Kropp } from "./kropp"
import type { Grid, Rib } from "./ribs"

/**
 * kant: 0 = plateflate, 1 = kutt gjennom plata
 * del:  kva stykke i kuttlista trekanten høyrer til, eller −1
 *
 * Begge er merke motoren set der han byggjer trekanten, og som fylgjer
 * han heilt fram til skjermkortet. Kanten avgjer korleis flata vert
 * teikna; delen avgjer kva du peikar på når du peikar på henne.
 */
export type Soup = { pos: number[]; nrm: number[]; kan: number[]; k: number; del: number[]; d: number }
export const newSoup = (): Soup => ({ pos: [], nrm: [], kan: [], k: 1, del: [], d: -1 })

export function tri(s: Soup, a: Vec3, b: Vec3, c: Vec3, n?: Vec3) {
  let nx: number
  let ny: number
  let nz: number
  if (n) [nx, ny, nz] = n
  else {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz) || 1
    nx /= L
    ny /= L
    nz /= L
  }
  s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  for (let i = 0; i < 3; i++) s.nrm.push(nx, ny, nz)
  s.kan.push(s.k, s.k, s.k)
  s.del.push(s.d, s.d, s.d)
}

export function soupToMesh(s: Soup) {
  const positions = new Float32Array(s.pos)
  const normals = new Float32Array(s.nrm)
  return {
    positions,
    normals,
    kant: new Float32Array(s.kan),
    del: new Float32Array(s.del),
    ...boxOf(positions),
  }
}

export function boxOf(positions: Float32Array) {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 1
  }
  return { tris: positions.length / 9, min, max }
}

// =============================================================================
// TRIANGULERING
// =============================================================================
/**
 * Øyreklipping. Polygonet er lite — nokre hundre hjørne — og ein kvadratisk
 * algoritme på nokre hundre hjørne er raskare enn å dra inn eit bibliotek,
 * og lesbar, som er den andre grunnen.
 */
function earClip(poly: Pt[]): [Pt, Pt, Pt][] {
  const n = poly.length
  if (n < 3) return []
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const idx = Array.from({ length: n }, (_, i) => i)
  if (area < 0) idx.reverse()

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  // STRENGT inni, og punkt som fell saman med eit hjørne tel ikkje: brua
  // frå eit hòl legg att koordinat-dublettar i polygonet, og med >= ville
  // kvar dublett blokkere kvart einaste øyre han rører — klipparen stoggar
  // då halvvegs og lèt loket stå ope.
  const same = (u: Pt, v: Pt) => u[0] === v[0] && u[1] === v[1]
  const inside = (a: Pt, b: Pt, c: Pt, p: Pt) =>
    !same(p, a) &&
    !same(p, b) &&
    !same(p, c) &&
    cross(a, b, p) > 0 &&
    cross(b, c, p) > 0 &&
    cross(c, a, p) > 0

  const out: [Pt, Pt, Pt][] = []
  let guard = idx.length * idx.length + 16
  while (idx.length > 3 && guard-- > 0) {
    let cut = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]
      const ib = idx[i]
      const ic = idx[(i + 1) % idx.length]
      const a = poly[ia]
      const b = poly[ib]
      const c = poly[ic]
      const cc = cross(a, b, c)
      if (cc === 0) {
        // Eit hjørne utan areal. Er det ein DUBLETT (brua sin kopi), fell
        // det stilt bort. Er det eit ekte kolineært hjørne, må trekanten
        // med null areal LIKEVEL leggjast: veggen under har kantar til
        // hjørnet, og utan makkeren i loket står skalet ope der.
        if (!same(a, b) && !same(b, c)) out.push([a, b, c])
        idx.splice(i, 1)
        cut = true
        break
      }
      if (cc < 0) continue
      let bad = false
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue
        if (inside(a, b, c, poly[j])) {
          bad = true
          break
        }
      }
      if (bad) continue
      out.push([a, b, c])
      idx.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  if (idx.length === 3) out.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]])
  return out
}

/** Eit hòl vert sydd inn i ytterkanten med ei bru fram og attende, så
 *  polygonet framleis er eitt einfelt polygon. Brua er null brei og
 *  forsvinn i trianguleringa. */
function bridge(outline: Pt[], holes: Pt[][]): Pt[] {
  let poly = outline.slice()
  for (const h of holes) {
    let bi = 0
    let hi = 0
    let best = Infinity
    for (let i = 0; i < poly.length; i++) {
      for (let j = 0; j < h.length; j++) {
        const d = Math.hypot(poly[i][0] - h[j][0], poly[i][1] - h[j][1])
        if (d < best) {
          best = d
          bi = i
          hi = j
        }
      }
    }
    const ring = h.slice(hi).concat(h.slice(0, hi))
    let a2 = 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      a2 += a[0] * b[1] - b[0] * a[1]
    }
    const r = a2 > 0 ? ring.slice().reverse() : ring
    poly = poly.slice(0, bi + 1).concat(r, [r[0]], poly.slice(bi))
  }
  return poly
}

// =============================================================================
// FLATE — nettet slik det kom inn
// =============================================================================
export function flateMesh(k: Kropp) {
  // KOPI, og det er ikkje sløsing.
  //
  // Bufferane vert OVERFØRTE til hovudtråden, og ei overføring koplar dei
  // frå: etter fyrste sending er originalen null byte lang. Kroppen er
  // hugsa og lever vidare, so utan kopien er han tom andre gongen nokon
  // spør — og då kjem det ingenting på skjermen, utan at noko feilar. Dei
  // to andre lesemåtane byggjer nye bufferar kvar gong og har ikkje
  // problemet.
  const positions = k.soup.pos.slice()
  const normals = k.nrm.slice()
  return {
    positions,
    normals,
    // Nettet er ikkje ei plate og har korkje flate eller kutt. Tom liste
    // tyder «byggjaren sa ingenting», og då let framsyninga fargen gjelde
    // heile flata.
    kant: new Float32Array(0),
    ...boxOf(positions),
  }
}

// =============================================================================
// LAG — objektet slik det står
// =============================================================================
/**
 * Ribba som ei plate: to sider og ein kant heile vegen rundt.
 *
 * X-ribba legg profilen i (y, z) og Y-ribba i (x, z). Dei to plana er
 * spegelvende av kvarandre — y × z peikar langs +x, men x × z peikar langs
 * −y — så ein profil mot klokka gjev utoverpeikande trekantar i det eine
 * planet og innoverpeikande i det andre. Difor snur Y-familien vindinga.
 * Utan det er halve objektet eit hòl med negativt volum.
 */
export function ribSolid(s: Soup, r: Rib, t: number, del0 = -1) {
  const h = t / 2
  const isX = r.axis === "x"
  const put = (q: Pt, off: number): Vec3 =>
    isX ? [r.pos + off, q[0], q[1]] : [q[0], r.pos + off, q[1]]
  const nAxis: Vec3 = isX ? [1, 0, 0] : [0, 1, 0]
  const nBack: Vec3 = isX ? [-1, 0, 0] : [0, -1, 0]
  const T = (a: Vec3, b: Vec3, c: Vec3, n?: Vec3) =>
    isX ? tri(s, a, b, c, n) : tri(s, c, b, a, n)

  for (let oi = 0; oi < r.outlines.length; oi++) {
    const o = r.outlines[oi]
    // Same rekkjefylgje som `buildParts` går omrissa i, og han hoppar ikkje
    // over noko. Difor er dette det same stykket som line nummer `del0+oi`
    // i kuttlista — utan at nokon av dei to treng vita om den andre.
    s.d = del0 < 0 ? -1 : del0 + oi
    const mine = r.holes.filter((hole) => inRing(o, hole[0]))
    const merged = mine.length ? bridge(o, mine) : o
    s.k = 0 // platesidene
    for (const [a, b, c] of earClip(merged)) {
      T(put(a, h), put(b, h), put(c, h), nAxis)
      T(put(c, -h), put(b, -h), put(a, -h), nBack)
    }
    s.k = 1 // kuttkantane
    for (let i = 0; i < o.length; i++) {
      const a = o[i]
      const b = o[(i + 1) % o.length]
      T(put(a, -h), put(b, -h), put(b, h))
      T(put(a, -h), put(b, h), put(a, h))
    }
    // Same to trekantane som ytterkanten. Det ser feil ut — ein hòlvegg
    // skal jo vende INN mot tomrommet, motsett av ytterkanten — men
    // vendinga ligg alt i ringen: `contour` gjev hòl med motsett omløp av
    // ytterkantar, so den same rekkjefylgja peikar den andre vegen av seg
    // sjølv. Å snu han her er å snu han to gonger.
    //
    // Målt på ståande torus: kvar ribbe med eit hòl kom ut på 52 386,6
    // mm³ der ho skulle vore 33 216,3 — 19 170,3 for mykje, som er
    // nøyaktig 2·(2/3)·tjukn·hòlareal, altso hòlveggen tald med feil
    // forteikn. STL-en hadde vrengde flater rundt kvart einaste hòl.
    for (const hole of mine) {
      for (let i = 0; i < hole.length; i++) {
        const a = hole[i]
        const b = hole[(i + 1) % hole.length]
        T(put(a, -h), put(b, -h), put(b, h))
        T(put(a, -h), put(b, h), put(a, h))
      }
    }
  }
}

/** Ligg punktet inne i ringen? Eit hòl høyrer til den ytterkanten som
 *  omsluttar det, og ei delt ribbe har fleire å velje mellom. */
export function lagMesh(g: Grid) {
  const s = newSoup()
  let del = 0
  for (const r of g.ribs) {
    ribSolid(s, r, g.p.tjukn, del)
    del += r.outlines.length
  }
  return soupToMesh(s)
}

// =============================================================================
// KONTUR — profilane flatt ved sida av kvarandre
// =============================================================================
export function contourLines(g: Grid): { lines: Float32Array; heavy: Float32Array } {
  const thin: number[] = []
  const bold: number[] = []
  const seg = (dst: number[], a: Vec3, b: Vec3) =>
    dst.push(a[0], a[1], a[2], b[0], b[1], b[2])
  const GAP = Math.max(12, g.p.tjukn * 3)
  let x = 0
  for (const r of g.ribs) {
    const dst = r.axis === "x" ? bold : thin
    // BREIDDA TIL PROFILEN, IKKJE DEN LENGSTE ARMEN HANS.
    //
    // Rada gjekk fram med to gonger største |t| pluss ei luke, medan kvar
    // profil vart teikna sentrert. Ein profil som ligg skeivt — og det
    // gjer alle som ikkje er symmetriske kring ribba — rekk då lenger til
    // den eine sida enn steget tek høgd for, og den neste vert teikna oppå
    // han: 41,7 mm gjennom kvarandre på ein firbeint, og 31 mm daud luft
    // ein annan stad i den same rada.
    //
    // Venstrekanten og høgrekanten, som `profileSvg` har gjort heile
    // tida for den plata dette skal likne på.
    let lo = Infinity
    let hi = -Infinity
    for (const o of r.outlines) {
      for (const q of o) {
        if (q[0] < lo) lo = q[0]
        if (q[0] > hi) hi = q[0]
      }
    }
    // Ei ribbe som ikkje råka nettet har ingen profil, og skal ikkje
    // leggje att ei tom luke i rada heller.
    if (!Number.isFinite(lo)) continue
    for (const ring of [...r.outlines, ...r.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        seg(dst, [x - lo + a[0], 0, a[1]], [x - lo + b[0], 0, b[1]])
      }
    }
    x += hi - lo + GAP
  }
  // sentrer rekkja, elles står ho og dreg kameraet med seg
  const shift = -x / 2
  for (const arr of [thin, bold]) {
    for (let i = 0; i < arr.length; i += 3) arr[i] += shift
  }
  return { lines: new Float32Array(thin), heavy: new Float32Array(bold) }
}
