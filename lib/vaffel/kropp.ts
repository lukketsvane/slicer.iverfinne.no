/**
 * VAFFEL — kroppen.
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
import { keep } from "../core"
import {
  flip,
  makeSoup,
  openEdges,
  place,
  shade,
  signedVolume,
  weld,
  type Indexed,
  type Soup,
} from "../soup"
import { decimate } from "../mesh/simplify"
import { taubin } from "../mesh/smooth"
import { makeSolid, type Solid } from "../mesh/solid"
import { source } from "../sources"
import type { Params } from "./params"

export type Kropp = {
  /** nettet slik det står: vend, skalert, sentrert, på golvet */
  soup: Soup
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
type Net = { net: Indexed; srcTris: number; openEdges: number }

const NETT_NOKKEL = (p: Params) => [p.kjelde, p.trekant, p.glatt].join("|")
const KROPP_NOKKEL = (p: Params) =>
  [p.kjelde, p.trekant, p.glatt, p.storleik, p.rotX, p.rotY, p.rotZ].join("|")

const NETT_HUGS = keep<Net>(2)
const KROPP_HUGS = keep<Kropp>(3)

function makeNet(p: Params): Net {
  return NETT_HUGS(NETT_NOKKEL(p), () => {
    const raw = source(p.kjelde)
    let net = weld(raw)
    // Ut-inn fyrst, og før alt anna: er nettet snudd, er kvar einaste
    // seinare avgjerd teken på feil side av flata.
    if (signedVolume(net) < 0) net = flip(net)
    net = decimate(net, Math.max(64, Math.round(p.trekant * 1000)))
    net = taubin(net, p.glatt)
    return { net, srcTris: raw.tris, openEdges: openEdges(net) }
  })
}

export function makeKropp(p: Params): Kropp {
  return KROPP_HUGS(KROPP_NOKKEL(p), () => {
    const n = makeNet(p)
    const net = { verts: place(n.net.verts, p), idx: n.net.idx }
    const flat = shade(net)
    const soup = makeSoup(flat.pos)
    return {
      soup,
      nrm: flat.nrm,
      net,
      solid: makeSolid(soup),
      srcTris: n.srcTris,
      openEdges: n.openEdges,
    }
  })
}
