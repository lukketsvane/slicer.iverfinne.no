/**
 * SLICERMAN — nettet, i tre lesemåtar.
 *
 *   flate   nettet slik det kom inn, etter forenkling og glatting. Det er
 *           ikkje objektet — det er forma objektet er ei tilnærming til.
 *   lag     ribbene med spor, kvar der ho står. Dette ER objektet.
 *   kontur  profilane lagde flatt ved sida av kvarandre.
 *
 * Nettet og kuttfila kjem frå dei same polygona. Ein laser som fylgjer
 * konturen skjer den ribba biletet viser.
 */
import { inRing, type Pt, type Vec3 } from "./core"
import type { Kropp } from "./kropp"
import { ut } from "./plan"
import type { Ribbe, Snitt } from "./snitt"

/**
 * kant: 0 = plateflate, 1 = kutt gjennom plata
 * del:  kva stykke i kuttlista trekanten høyrer til, eller −1
 * Begge er merke motoren set der han byggjer trekanten, og som fylgjer
 * han heilt fram til skjermkortet.
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
  return { positions, normals, kant: new Float32Array(s.kan), del: new Float32Array(s.del), ...boxOf(positions) }
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
/** Øyreklipping. Polygonet er lite, og ein kvadratisk algoritme på nokre
 *  hundre hjørne er raskare enn eit bibliotek, og lesbar. */
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
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  // STRENGT inni, og punkt som fell saman med eit hjørne tel ikkje: brua
  // frå eit hòl legg att koordinat-dublettar, og med >= ville kvar dublett
  // blokkere kvart einaste øyre han rører.
  const same = (u: Pt, v: Pt) => u[0] === v[0] && u[1] === v[1]
  const inside = (a: Pt, b: Pt, c: Pt, p: Pt) =>
    !same(p, a) && !same(p, b) && !same(p, c) && cross(a, b, p) > 0 && cross(b, c, p) > 0 && cross(c, a, p) > 0
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
        // Eit hjørne utan areal. Ein DUBLETT fell stilt bort; eit ekte
        // kolineært hjørne må LIKEVEL leggjast, elles står skalet ope der.
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

/** Eit hòl vert sydd inn i ytterkanten med ei bru fram og attende, so
 *  polygonet framleis er eitt einfelt polygon. */
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
  // KOPI: bufferane vert OVERFØRTE til hovudtråden, og ei overføring koplar
  // dei frå. Kroppen er hugsa og lever vidare, so utan kopien er han tom
  // andre gongen nokon spør.
  const positions = k.soup.pos.slice()
  const normals = k.nrm.slice()
  return { positions, normals, kant: new Float32Array(0), ...boxOf(positions) }
}

// =============================================================================
// LAG — objektet slik det står
// =============================================================================
/**
 * Ribba som ei plate: to sider og ein kant heile vegen rundt, lagd ut frå
 * profilen gjennom ramma hennar. (u, v, n) er høgrehendt, so ein profil
 * mot klokka gjev flater som vender ut — for alle plan, utan unnatak.
 */
export function ribSolid(s: Soup, r: Ribbe, t: number, del0 = -1) {
  const h = t / 2
  const put = (q: Pt, off: number): Vec3 => ut(r.r, q, off)
  const nBack: Vec3 = [-r.r.n[0], -r.r.n[1], -r.r.n[2]]
  for (let oi = 0; oi < r.outlines.length; oi++) {
    const o = r.outlines[oi]
    // Same rekkjefylgje som `buildDelar` går omrissa i, so dette er det
    // same stykket som line nummer `del0+oi` i kuttlista.
    s.d = del0 < 0 ? -1 : del0 + oi
    const mine = r.holes.filter((hole) => inRing(o, hole[0]))
    const merged = mine.length ? bridge(o, mine) : o
    s.k = 0
    for (const [a, b, c] of earClip(merged)) {
      tri(s, put(a, h), put(b, h), put(c, h), r.r.n)
      tri(s, put(c, -h), put(b, -h), put(a, -h), nBack)
    }
    s.k = 1
    // Hòlveggen med SAME vinding som ytterkanten: `contour` gjev hòl med
    // motsett omløp, so den same rekkjefylgja peikar den andre vegen av
    // seg sjølv. Å snu han her er å snu han to gonger.
    for (const ring of [o, ...mine]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        tri(s, put(a, -h), put(b, -h), put(b, h))
        tri(s, put(a, -h), put(b, h), put(a, h))
      }
    }
  }
}

export function lagMesh(sn: Snitt, t: number) {
  const s = newSoup()
  let del = 0
  for (const r of sn.ribber) {
    ribSolid(s, r, t, del)
    del += r.outlines.length
  }
  return soupToMesh(s)
}

// =============================================================================
// KONTUR — profilane flatt ved sida av kvarandre
// =============================================================================
export function contourLines(sn: Snitt, t: number): { lines: Float32Array; heavy: Float32Array } {
  const thin: number[] = []
  const seg = (a: Vec3, b: Vec3) => thin.push(a[0], a[1], a[2], b[0], b[1], b[2])
  const GAP = Math.max(12, t * 3)
  let x = 0
  for (const r of sn.ribber) {
    // BREIDDA TIL PROFILEN, IKKJE DEN LENGSTE ARMEN HANS: venstre- og
    // høgrekanten, so ein skeiv profil ikkje vert teikna oppå den neste.
    let lo = Infinity
    let hi = -Infinity
    let btm = Infinity
    for (const o of r.outlines) {
      for (const q of o) {
        if (q[0] < lo) lo = q[0]
        if (q[0] > hi) hi = q[0]
        if (q[1] < btm) btm = q[1]
      }
    }
    if (!Number.isFinite(lo)) continue
    for (const ring of [...r.outlines, ...r.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        seg([x - lo + a[0], 0, a[1] - btm], [x - lo + b[0], 0, b[1] - btm])
      }
    }
    x += hi - lo + GAP
  }
  const shift = -x / 2
  for (let i = 0; i < thin.length; i += 3) thin[i] += shift
  return { lines: new Float32Array(thin), heavy: new Float32Array(0) }
}
