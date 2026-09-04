/**
 * SLICERMAN — heile rekninga, éin gong.
 *
 * Måltala, reglane og kuttfilene stiller det same spørsmålet: kva ribber
 * vart det, kva delar vart dei, og korleis ligg dei på plata? Kvar av dei
 * tre startar på nøyaktig same staden, og utan denne fila gjer dei arbeidet
 * kvar sin gong. Det er ikkje berre fart: ei pakking er ei rekning med val
 * i seg, og står det «2 ark» i panelet, skal DXF-en innehalde dei same to
 * arka. Eitt bygg, éi sanning.
 */
import { keep, type ParamBag } from "./core"
import { makeKropp, type Kropp } from "./kropp"
import { generasjon } from "./sources"
import { buildSnitt, buildDelar, type DelListe, type Snitt } from "./snitt"
import { nest, type Nesting } from "./nest"
import { byggKey, lesFest, type Params } from "./params"

export type Bygg = { k: Kropp; s: Snitt; dl: DelListe; ns: Nesting }

/**
 * Luft mellom delane på plata: fire millimeter er nok til å få ei plate
 * laus utan å ta nabodelen med. Men luka vert målt mellom dei NOMINELLE
 * omrissa, og maskina fylgjer dei kompenserte — kvart kutt et eit halvt
 * snitt til på kvar side, so godset imellom er luka minus to snittbreidder.
 */
export const nestGap = (p: Params) => Math.max(4, 2 * p.snitt + 2)

const HUGS = keep<Bygg>(2)

/** `rask` er søket sitt bygg: pakkinga tek éin passasje og ikkje fire, og
 *  har sin eigen nøkkel, so eit raskt bygg aldri vert servert som det sanne. */
export function makeBygg(p: Params, cells: number, rask = false): Bygg {
  return HUGS(byggKey(p as unknown as ParamBag, cells) + `|${generasjon()}` + (rask ? "|rask" : ""), () => {
    const k = makeKropp(p)
    const s = buildSnitt(k, p, cells)
    const dl = buildDelar(s, p)
    return { k, s, dl, ns: nest(dl.delar, p.arkB, p.arkH, nestGap(p), lesFest(p.fest), rask ? 0 : undefined) }
  })
}
