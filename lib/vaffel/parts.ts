/**
 * VAFFEL — dei flate delane.
 *
 * Kvar del er ei ribbe, og ribba ER konturen: spora står alt i polygonet
 * frå `ribs.ts`, av di dei vart skorne i feltet og ikkje lagde oppå
 * etterpå. Difor finst det ikkje eit steg her der kuttfila kan skilje lag
 * frå biletet.
 *
 * To ribber med same profil er den same delen. Talet på ULIKE delar står i
 * lista av di det er talet som avgjer kor mange oppspenningar ein treng —
 * og på ein kube er det eitt, same kor mange ribber du set opp.
 */
import { bbox, MATERIALS, perimeter, shoelace, inRing, type Material, type Pt } from "../core"
import { jointsIn, type Grid } from "./ribs"
import type { Params } from "./params"

export type Part = {
  /** forma. To delar med same id er den same delen */
  id: string
  /** kvar han skal stå — «X3», «Y7». Er ei ribbe delt i fleire stykke,
   *  får kvart stykke sin bokstav: «X3a», «X3b». Det er DETTE som vert
   *  gravert, av di det er det som fortel deg kvar delen høyrer heime. */
  from: string
  outline: Pt[]
  holes: Pt[][]
  t: number
  area: number
  mass: number
  cutLen: number
  /** kor mange ledd som fell innanfor akkurat dette stykket */
  joints: number
}

export type PartList = {
  parts: Part[]
  ids: string[]
  area: number
  mass: number
  cutLen: number
  /** delar utan eit einaste ledd — laus plate i eska */
  lause: number
}

/**
 * Ein signatur som er lik for like delar og ulik for ulike.
 *
 * To ting gjer dette vanskelegare enn det ser ut. Det eine er at to
 * identiske profilar ikkje har same TAL på hjørne: forenklinga kastar
 * kolineære punkt, og eit punkt som ligg ein tiandels mikrometer frå lina
 * i den eine ribba og på henne i den andre, vert kasta i den eine og ikkje
 * i den andre. Difor vert ringen resampla til eit fast tal punkt langs
 * omkrinsen før han vert samanlikna — då tel forma og ikkje bokføringa.
 *
 * Det andre er kor likt «likt» skal vera. Svaret er ein halv millimeter:
 * to delar som skil seg med mindre enn det, skil seg med mindre enn
 * maskina kan halde, og då er dei den same delen i alt som betyr noko —
 * i oppspenninga, i kuttlista og på plata.
 */
const SIG = 96
const TOL = 2 // punkt per millimeter i signaturen

function ringSig(ring: Pt[], ox: number, oy: number): string {
  const acc: number[] = [0]
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
    acc.push(total)
  }
  if (total < 1e-9) return ""
  const out: string[] = []
  let seg = 0
  for (let k = 0; k < SIG; k++) {
    const d = (k / SIG) * total
    while (seg < ring.length - 1 && acc[seg + 1] < d) seg++
    const a = ring[seg]
    const b = ring[(seg + 1) % ring.length]
    const span = acc[seg + 1] - acc[seg] || 1
    const t = (d - acc[seg]) / span
    out.push(
      Math.round((a[0] + (b[0] - a[0]) * t - ox) * TOL) +
        "," +
        Math.round((a[1] + (b[1] - a[1]) * t - oy) * TOL),
    )
  }
  return out.join(";")
}

function shapeKey(o: Pt[], holes: Pt[][]): string {
  const b = bbox(o)
  return [
    ringSig(o, b.x0, b.y0),
    ...holes.map((h) => ringSig(h, b.x0, b.y0)),
  ].join("|")
}

/**
 * Bokstaven til eit stykke: a, b, ... z, aa, ab.
 *
 * Åtte bokstavar heldt i den fyrste utgåva, og alt over det fekk «z».
 * Ei ribbe gjennom eit gitter eller ei hand kan bli delt i tjue stykke,
 * og då stod det «X7z» på fleire av dei. To ulike delar med same adressa
 * er verre enn ingen adresse: du finn ut av det når du står med ei plate
 * som ikkje passar i det hòlet ho seier ho høyrer til.
 */
function bokstav(n: number): string {
  let s = ""
  let k = n
  do {
    s = "abcdefghijklmnopqrstuvwxyz"[k % 26] + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

/**
 * `p` kjem inn utanfrå og vert ikkje lesen av rutenettet.
 *
 * Materialet rører ikkje geometrien, so rutenettet vert hugsa utan det i
 * nøkkelen — og eit hugsa rutenett ber difor materialet frå det fyrste
 * bygget. Massen i panelet fraus på det materialet du valde fyrst.
 */
export function buildParts(g: Grid, p: Params): PartList {
  const mat = (p.material as Material) in MATERIALS ? (p.material as Material) : "finer"
  const rho = MATERIALS[mat].rho
  const t = g.p.tjukn
  const parts: Part[] = []
  const seen = new Map<string, string>()
  const ids: string[] = []

  for (const r of g.ribs) {
    let stykke = 0
    const fleire = r.outlines.length > 1
    for (const o of r.outlines) {
      // Hòl høyrer til den ytterkanten som omsluttar dei. Med éin ytterkant
      // er det trivielt; er ribba delt, må kvart hòl finne heimen sin.
      const mine =
        r.outlines.length === 1 ? r.holes : r.holes.filter((h) => inRing(o, h[0]))
      // Ingen minstegrense her: rutenettet har alt sila bort flisa, og
      // det er heile poenget at dei to listene er den same lista.
      let area = Math.abs(shoelace(o))
      for (const h of mine) area -= Math.abs(shoelace(h))
      const key = shapeKey(o, mine)
      let id = seen.get(key)
      if (!id) {
        id = `D${String(ids.length + 1).padStart(2, "0")}`
        seen.set(key, id)
        ids.push(id)
      }
      let cut = perimeter(o)
      for (const h of mine) cut += perimeter(h)
      // Ei ribbe kan vera delt i fleire stykke, og då er det ikkje nok at
      // RIBBA har ledd — dette stykket må ha dei.
      const joints = jointsIn(r.slots, o)
      const adr = r.axis.toUpperCase() + (r.k + 1) + (fleire ? bokstav(stykke++) : "")
      parts.push({
        id,
        from: adr,
        outline: o,
        holes: mine,
        t,
        area,
        mass: (area * t * rho) / 1e9,
        cutLen: cut,
        joints,
      })
    }
  }

  return {
    parts,
    ids,
    area: parts.reduce((s, q) => s + q.area, 0),
    mass: parts.reduce((s, q) => s + q.mass, 0),
    cutLen: parts.reduce((s, q) => s + q.cutLen, 0),
    lause: parts.filter((q) => q.joints === 0).length,
  }
}
