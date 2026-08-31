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
import { keep, type ParamBag } from "../core"
import { makeKropp, type Kropp } from "./kropp"
import { buildGrid, type Grid } from "./ribs"
import { buildParts, type PartList } from "./parts"
import { nest, type Nesting } from "./nest"
import { lesFest, planKey, type Params } from "./params"

export type Plan = { k: Kropp; g: Grid; pl: PartList; ns: Nesting }

/**
 * Luft mellom delane på plata.
 *
 * Fire millimeter er nok til å få ei plate laus utan å ta nabodelen med,
 * og lite nok til at plata ikkje er halvtom.
 *
 * Men luka vert målt mellom dei NOMINELLE omrissa, og det maskina fylgjer
 * er dei KOMPENSERTE. Kvar av dei ligg eit halvt snitt lenger ut, og kvart
 * kutt et eit halvt snitt til på kvar side. Godset som står att mellom to
 * delar er difor luka minus to snittbreidder — ikkje luka. På ei stråle
 * på to tidelar tyder det ingenting; skrur du snittet opp, gjer det det.
 */
export const nestGap = (p: Params) => Math.max(4, 2 * p.snitt + 2)

const HUGS = keep<Plan>(2)

export function makePlan(p: Params, cells: number): Plan {
  return HUGS(planKey(p as unknown as ParamBag, cells), () => {
    const k = makeKropp(p)
    const g = buildGrid(k, p, cells)
    const pl = buildParts(g, p)
    return { k, g, pl, ns: nest(pl.parts, p.arkB, p.arkH, nestGap(p), lesFest(p.fest)) }
  })
}
