/**
 * VAFFEL — heile rekninga, éin gong.
 *
 * Måltala, reglane og kuttfilene stiller det same spørsmålet: kva ribber
 * vart det, kva delar vart dei, og korleis ligg dei på plata? Kvar av dei
 * tre startar difor på nøyaktig same staden, og utan denne fila gjer dei
 * arbeidet kvar sin gong — tre snittingar og tre pakkingar per skyvartrykk,
 * der éi av kvar er nok.
 *
 * Det er ikkje berre fart. Ei pakking er ei rekning med val i seg, og to
 * pakkingar av det same kan i prinsippet gje to ulike svar. Står det «2
 * ark» i panelet, skal DXF-en innehalde dei same to arka — ikkje to som
 * liknar. Éin plan, éin sanning.
 */
import { keep } from "../core"
import { makeKropp, type Kropp } from "./kropp"
import { buildGrid, type Grid } from "./ribs"
import { buildParts, type PartList } from "./parts"
import { nest, type Nesting } from "./nest"
import type { Params } from "./params"

export type Plan = { k: Kropp; g: Grid; pl: PartList; ns: Nesting }

/** luft mellom delane på plata: verktøyet sin diameter pluss litt å ta i */
export const nestGap = (p: Params) => Math.max(4, p.fres + 2)

const NOKKEL = (p: Params, cells: number) =>
  [
    cells,
    p.kjelde, p.storleik, p.rotX, p.rotY, p.rotZ, p.glatt, p.trekant,
    p.ribbX, p.ribbY, p.tjukn, p.klaring, p.ledd, p.leddtype,
    p.fres, p.arkB, p.arkH, p.material,
  ].join("|")

const HUGS = keep<Plan>(2)

export function makePlan(p: Params, cells: number): Plan {
  return HUGS(NOKKEL(p, cells), () => {
    const k = makeKropp(p)
    const g = buildGrid(k, p, cells)
    const pl = buildParts(g)
    return { k, g, pl, ns: nest(pl.parts, p.arkB, p.arkH, nestGap(p)) }
  })
}
