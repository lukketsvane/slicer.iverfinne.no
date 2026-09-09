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
import { placedRings, type Nesting } from "./nest"
import { ut, type Ramme } from "./plan"
import type { Del, Ribbe, Snitt } from "./snitt"

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
export function ribSolid(s: Soup, r: Pick<Ribbe, "r" | "outlines" | "holes">, t: number, del0 = -1) {
  const h = t / 2
  const put = (q: Pt, off: number): Vec3 => ut(r.r, q, off)
  const boygd = !!r.r.k
  const nBack: Vec3 = [-r.r.n[0], -r.r.n[1], -r.r.n[2]]
  /**
   * EI BØYGD RIBBE MÅ DELAST FØR HO VERT LAGD UT.
   *
   * Profilen er eit flatt polygon, og øyreklippet gjev store trekantar av
   * han. Store trekantar lagde ut på ein sylinder er korder: dei skjer av
   * buen og ribba ser ut som ei kasse som påstår at ho er bøygd. Same
   * grensa som utrullinga bruker — `√(8·R·tol)` — og same grunnen.
   *
   * Normalen fylgjer med: ei bøygd flate har inga einaste normal, so han
   * vert rekna per trekant i staden for gjeven.
   */
  const lim = boygd ? Math.sqrt(8 * Math.abs(1 / r.r.k) * 0.05) : Infinity
  const flate = (a: Pt, b: Pt, c: Pt, off: number, n: Vec3 | undefined, djup: number) => {
    const lang =
      djup < 5 &&
      Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1])) > lim
    if (!lang) {
      tri(s, put(a, off), put(b, off), put(c, off), n)
      return
    }
    const m = (x: Pt, y: Pt): Pt => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2]
    const ab = m(a, b)
    const bc = m(b, c)
    const ca = m(c, a)
    flate(a, ab, ca, off, n, djup + 1)
    flate(ab, b, bc, off, n, djup + 1)
    flate(ca, bc, c, off, n, djup + 1)
    flate(ab, bc, ca, off, n, djup + 1)
  }
  for (let oi = 0; oi < r.outlines.length; oi++) {
    const o = r.outlines[oi]
    // Same rekkjefylgje som `buildDelar` går omrissa i, so dette er det
    // same stykket som line nummer `del0+oi` i kuttlista.
    s.d = del0 < 0 ? -1 : del0 + oi
    const mine = r.holes.filter((hole) => inRing(o, hole[0]))
    const merged = mine.length ? bridge(o, mine) : o
    s.k = 0
    for (const [a, b, c] of earClip(merged)) {
      flate(a, b, c, h, boygd ? undefined : r.r.n, 0)
      flate(c, b, a, -h, boygd ? undefined : nBack, 0)
    }
    s.k = 1
    // Hòlveggen med SAME vinding som ytterkanten: `contour` gjev hòl med
    // motsett omløp, so den same rekkjefylgja peikar den andre vegen av
    // seg sjølv. Å snu han her er å snu han to gonger.
    for (const ring of [o, ...mine]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        // kanten er alt korte bitar: konturen fylgjer ruta, og ho er finare
        // enn grensa over
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
// DELANE KVAR FOR SEG — det same nettet, delt der kuttlista deler det
// =============================================================================
/**
 * EIN DEL SOM SITT EIGE NETT, MED ADRESSA SI.
 *
 * `lagMesh` byggjer heile stabelen som éin haug trekantar, og det er rett
 * for skjermkortet: han skal teikne alt kvar ramme. Ei FIL er noko anna.
 * Ein montasje som kjem inn i Blender som eitt einaste nett er ein
 * montasje du ikkje kan ta frå kvarandre — du ser han, og du kan ikkje
 * dra ei ribbe ut av han utan å skilje trekantane for hand.
 *
 * Difor får kvar del sitt eige nett her, og namnet er ADRESSA — det same
 * som står gravert på plata og i kuttlista og i monteringa. Éin del i
 * fila, éin del på benken, eitt namn.
 */
export type DelMesh = { adr: string; positions: Float32Array; tris: number }

const delMesh = (adr: string, s: Soup): DelMesh => ({
  adr,
  positions: new Float32Array(s.pos),
  tris: s.pos.length / 9,
})

/**
 * Montasjen slik han står, delt.
 *
 * Delane kjem frå kuttlista og ikkje frå ribbene: der ligg omrisset,
 * hòla som høyrer til det, og adressa — alt utanom RAMMA, som er planet
 * si og finst per plan. Å gå ribbene i staden ville krevd at denne
 * lykkja delte omrissa i same rekkjefylgje som `buildDelar` gjer det, og
 * to lykkjer som må halde takta er ei takt som fyrr eller seinare ryk.
 */
export function lagDelar(sn: Snitt, delar: readonly Del[], t: number): DelMesh[] {
  const rammer = new Map(sn.ribber.map((r) => [r.plan.id, r.r]))
  const ut: DelMesh[] = []
  for (const q of delar) {
    const r = rammer.get(q.plan)
    // Kuttlista er BYGD av desse ribbene, so det finst alltid ei ramme.
    // Skulle ho likevel mangle, ville delen falle stilt ut av fila — og
    // det er nett det `pnpm probe` tel: like mange nodar som liner.
    if (!r) continue
    const s = newSoup()
    ribSolid(s, { r, outlines: [q.outline], holes: q.holes }, t)
    ut.push(delMesh(q.adr, s))
  }
  return ut
}

/** ei flat ramme i XY, med plata frå z = 0 og opp til tjukna */
const flatRamme = (dx: number, t: number): Ramme => ({
  o: [dx, 0, t / 2],
  n: [0, 0, 1],
  u: [1, 0, 0],
  v: [0, 1, 0],
  k: 0,
})

/**
 * DEI SAME DELANE, LAGDE FLATT DER MASKINA SKJER DEI.
 *
 * Ringane er nestinga sine — same plassering, same sving, same plate som
 * DXF-en og arket — so fila er kuttjobben i tre dimensjonar: ho ligg
 * flatt, ho er sprengd frå kvarandre, og kvar del ligg alt der han skal
 * liggje. Ein montasje du kan sjå gjennom, og ei plate du kan måle.
 *
 * Omrisset er det NOMINELLE: snittet vert teke i kuttfila og berre der.
 * Ein 3D-modell som var kompensert for laseren sin veg ville vera ein
 * modell av noko ingen skal lage.
 *
 * Platene ligg ved sida av kvarandre langs x, med ein tidel av breidda
 * imellom: nok til at auget ser kvar den eine sluttar, og lite nok til at
 * to plater framleis er eitt bilete.
 */
export function flatDelar(ns: Nesting, t: number): { ark: number; delar: DelMesh[] }[] {
  return ns.sheets.map((sh, i) => {
    const r = flatRamme(i * ns.sheetW * 1.1, t)
    return {
      ark: i + 1,
      delar: sh.placed.map((q) => {
        const rg = placedRings(q)
        const s = newSoup()
        ribSolid(s, { r, outlines: [rg.outline], holes: rg.holes }, t)
        return delMesh(q.part.adr, s)
      }),
    }
  })
}
