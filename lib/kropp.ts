/**
 * SLICERMAN — kroppen.
 *
 * Mellom fila brukaren drog inn og ribbene som kjem ut, ligg fire steg, og
 * dei skjer alltid i denne rekkjefylgja:
 *
 *   1  SVEIS      lause trekantar vert hjørne med naboar
 *   2  SNU        er heile nettet ut-inn, vert det snudd
 *   3  FORENKL    hjørneklynging ned til det taket skyvaren set
 *   4  GLATT      Taubin, so ruglet går og volumet står
 *   5  PLASSER    vend, skaler til storleiken, sentrer og sett på golvet
 *
 * Rekkjefylgja er ikkje ein smak. Glatting før forenkling er å bruke tid
 * på hjørne som skal bort; forenkling etter plassering gjer at «tjue tusen
 * trekantar» tyder noko ulikt alt etter kva rotasjon som står — og eit tal
 * på ein skyvar skal tyde det same uansett kva dei andre står på.
 *
 * Heile kroppen er hugsa på innhaldet sitt. For eitt og same punkt spør
 * arbeidaren om bygg, måltal og reglar etter kvarandre, og alle tre startar
 * her; utan hugs kostar eit skyvartrykk tre snittingar av same nett.
 */
import { keep } from "./core"
import {
  bounds,
  flip,
  makeSoup,
  openEdges,
  plassering,
  shade,
  signedVolume,
  weld,
  type Indexed,
  type Soup,
} from "./soup"
import { decimate } from "./mesh/simplify"
import { taubin } from "./mesh/smooth"
import { makeSolid, type Solid } from "./mesh/solid"
import { source } from "./sources"
import { eiKjelde, lesScene } from "./scene"
import { akser } from "./plan"
import type { Vec3 } from "./core"
import type { Params } from "./params"

/** ein bit av kroppen, slik han hamna: kva kjelde han er, og boksen kring han */
export type BitBoks = { id: string; min: Vec3; max: Vec3 }

export type Kropp = {
  /** nettet slik det står: vend, skalert, sentrert, på golvet */
  soup: Soup
  /**
   * Bitane kroppen er sett saman av, med boksen sin i det PLASSERTE rommet.
   *
   * Dei er ikkje ein del av geometrien — dei er kvar bit vart av. Handa
   * treng dei for å kunne peike på ein bit og flytte han, og då må dei
   * reknast der plasseringa vert rekna. Å rekne dei om att på teiknetråden
   * er å be om to sanningar om same kroppen.
   */
  bitar: BitBoks[]
  /** millimeter i det plasserte rommet per millimeter i det felles: `place` sin k */
  skala: number
  /** dei same trekantane med mjuke hjørnenormalar — «flate»-visinga */
  nrm: Float32Array
  net: Indexed
  solid: Solid
  srcTris: number
  openEdges: number
}

/**
 * To hugs og ikkje éin.
 *
 * Grunnen er dei to fyrste stega. Å sveise og forenkle eit skann på ein
 * million trekantar tek nærare eit sekund; å vende det og skalere det tek
 * fem millisekund. Låg dei i same hugsen, ville kvart einaste dytt på
 * vendeskyvaren kosta det fyrste sekundet om att — og ein skyvar som
 * kostar eit sekund per steg er ein skyvar ingen dreg i.
 *
 * Difor står NETTET for seg: han avheng av fila, trekanttaket og
 * glattinga, og ingenting anna. Kroppen legg vendinga og storleiken oppå.
 * Det er òg heile grunnen til at rekkjefylgja i toppen av fila er som ho
 * er: hadde plasseringa kome før forenklinga, hadde dei ikkje late seg
 * skilje.
 */
type Net = { net: Indexed; srcTris: number; openEdges: number; bitar: BitBoks[] }

const NETT_NOKKEL = (p: Params) => [scenaAv(p), p.trekant, p.glatt].join("|")
const KROPP_NOKKEL = (p: Params) =>
  [scenaAv(p), p.trekant, p.glatt, p.storleik, p.rotX, p.rotY, p.rotZ].join("|")

/** scena som gjeld: lista, eller kjelda åleine når lista er tom */
export const scenaAv = (p: Params) => p.scene || eiKjelde(p.kjelde)

/**
 * BITANE LAGDE SAMAN TIL EITT NETT.
 *
 * Kvar bit vert skalert til hundre millimeter på det lengste gonger sin
 * eigen storleik, vend kring z, flytt, og so lagd rett inn i den same
 * trekantsuppa. Ingen boolsk operasjon: strålane tel skal, so der to
 * lukka skal ligg oppå kvarandre er det gods, og der ingen ligg er det
 * luft. Det er nett det ein kropp bygd av klossar treng, og ikkje meir.
 */
function samlaSoup(p: Params): { soup: Soup; tris: number; bitar: BitBoks[] } {
  const bitar = lesScene(scenaAv(p))
  const delar: Float32Array[] = []
  const boksar: BitBoks[] = []
  let tris = 0
  for (const b of bitar.length ? bitar : lesScene(eiKjelde(p.kjelde))) {
    const src = source(b.id)
    tris += src.tris
    const span = Math.max(src.max[0] - src.min[0], src.max[1] - src.min[1], src.max[2] - src.min[2], 1e-6)
    const k = (100 * b.s) / span
    const cx = (src.min[0] + src.max[0]) / 2
    const cy = (src.min[1] + src.max[1]) / 2
    const cz = src.min[2]
    const a = (b.rz * Math.PI) / 180
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const P = src.pos
    const ut = new Float32Array(P.length)
    for (let i = 0; i < P.length; i += 3) {
      const x = (P[i] - cx) * k
      const y = (P[i + 1] - cy) * k
      const z = (P[i + 2] - cz) * k
      ut[i] = x * c - y * sn + b.t[0]
      ut[i + 1] = x * sn + y * c + b.t[1]
      ut[i + 2] = z + b.t[2]
    }
    delar.push(ut)
    const bb = bounds(ut)
    boksar.push({ id: b.id, min: bb.min, max: bb.max })
  }
  if (delar.length === 1) return { soup: makeSoup(delar[0]), tris, bitar: boksar }
  const alle = new Float32Array(delar.reduce((n, d) => n + d.length, 0))
  let o = 0
  for (const d of delar) {
    alle.set(d, o)
    o += d.length
  }
  return { soup: makeSoup(alle), tris, bitar: boksar }
}

const NETT_HUGS = keep<Net>(2)
const KROPP_HUGS = keep<Kropp>(3)

function makeNet(p: Params): Net {
  return NETT_HUGS(NETT_NOKKEL(p), () => {
    const samla = samlaSoup(p)
    const raw = samla.soup
    let net = weld(raw)
    // Ut-inn fyrst, og før alt anna: er nettet snudd, er kvar einaste
    // seinare avgjerd teken på feil side av flata.
    if (signedVolume(net) < 0) net = flip(net)
    net = decimate(net, Math.max(64, Math.round(p.trekant * 1000)))
    net = taubin(net, p.glatt)
    return { net, srcTris: samla.tris, openEdges: openEdges(net), bitar: samla.bitar }
  })
}

export function makeKropp(p: Params): Kropp {
  return KROPP_HUGS(KROPP_NOKKEL(p), () => {
    const n = makeNet(p)
    const pl = plassering(n.net.verts, p)
    const net = { verts: pl.pos, idx: n.net.idx }
    const flat = shade(net)
    const soup = makeSoup(flat.pos)
    // boksane gjennom den same avbildinga som hjørna: ein vend boks er
    // ingen boks, so det er dei åtte hjørna som vert vende og målte om att
    const bitar = n.bitar.map((b) => {
      const lo: Vec3 = [Infinity, Infinity, Infinity]
      const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < 8; i++) {
        const q = pl.vend([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]])
        for (let a = 0; a < 3; a++) {
          if (q[a] < lo[a]) lo[a] = q[a]
          if (q[a] > hi[a]) hi[a] = q[a]
        }
      }
      return { id: b.id, min: lo, max: hi }
    })
    return {
      soup,
      nrm: flat.nrm,
      net,
      solid: makeSolid(soup),
      srcTris: n.srcTris,
      openEdges: n.openEdges,
      bitar,
      skala: pl.k,
    }
  })
}

/**
 * KROPPEN SEDD LANGS EI NORMAL.
 *
 * Strålane går langs aksane, og eit skrått plan har ingen akse. I staden
 * for å lære strålane å gå på skrå vert NETTET snudd: (u, v, n) vert
 * (x, y, z), og planet er då eit z-snitt som alle andre — same rader, same
 * kolonnar, same marsjerande rute. Å snu tjue tusen trekantar kostar
 * ingenting mot å snitte dei; å snu ein million kostar eit par titals
 * millisekund, og svaret vert hugsa per retning. Eit rutenett har to.
 *
 * Vendinga er høgrehendt, so vindinga står og innsida er innsida.
 */
const VENDT = new WeakMap<Kropp, Map<string, Solid>>()
const VENDT_TAK = 12

export function vend(k: Kropp, n: Vec3): Solid {
  const key = n.map((c) => c.toFixed(4)).join(",")
  let per = VENDT.get(k)
  if (!per) {
    per = new Map()
    VENDT.set(k, per)
  }
  const hit = per.get(key)
  if (hit) return hit
  const { u, v } = akser(n)
  const P = k.soup.pos
  const ut = new Float32Array(P.length)
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]
    const y = P[i + 1]
    const z = P[i + 2]
    ut[i] = x * u[0] + y * u[1] + z * u[2]
    ut[i + 1] = x * v[0] + y * v[1] + z * v[2]
    ut[i + 2] = x * n[0] + y * n[1] + z * n[2]
  }
  const sol = makeSolid(makeSoup(ut))
  per.set(key, sol)
  if (per.size > VENDT_TAK) per.delete(per.keys().next().value as string)
  return sol
}
