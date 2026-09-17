import { keep, type ParamBag } from "./core"
import { makeKropp, type Kropp } from "./kropp"
import { generasjon } from "./sources"
import { buildSnitt, buildDelar, type DelListe, type Snitt } from "./snitt"
import { nest, type Nesting } from "./nest"
import { byggKey, lesFest, type Params } from "./params"

export type Bygg = { k: Kropp; s: Snitt; dl: DelListe; ns: Nesting }

export const nestGap = (p: Params) => Math.max(4, 2 * p.snitt + 2)

const HUGS = keep<Bygg>(2)

export function makeBygg(p: Params, cells: number, rask = false): Bygg {
  return HUGS(byggKey(p as unknown as ParamBag, cells) + `|${generasjon()}` + (rask ? "|rask" : ""), () => {
    const k = makeKropp(p)
    const s = buildSnitt(k, p, cells)
    const dl = buildDelar(s, p)
    return { k, s, dl, ns: nest(dl.delar, p.arkB, p.arkH, nestGap(p), lesFest(p.fest), rask ? 0 : undefined) }
  })
}
