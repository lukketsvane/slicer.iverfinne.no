/**
 * VAFFEL — måltala.
 *
 * Alt her er LESE av geometrien og ikkje henta frå parameterlista. Tjukna
 * er unntaket, og ho står med namn i staden for å gøymast. Alt anna — ytre
 * mål, tal delar, kuttlengd, masse, kor mange ark du må kjøpe — er målt av
 * dei polygona kuttfila sjølv vert skriven av.
 *
 * KUTTLENGDA er talet dei fleste kjem for, og KUTTETIDA er det dei
 * eigentleg spurde om. Ein vaffel med ti ribber er lett tretti meter kutt;
 * på tjue millimeter i sekundet er det femogtjue minutt, og det er verdt å
 * vita FØR ein trykkjer på knappen og ikkje etter. Farta står i panelet, av
 * di ho høyrer til maskina og materialet og ikkje til geometrien.
 */
import {
  MATERIALS,
  bbox,
  klokke,
  metric,
  nn,
  type Material,
  type Metric,
  type Metrics,
} from "../core"
import { DETAIL, type Grid } from "./ribs"
import { makePlan } from "./plan"
import type { Params } from "./params"

export function measure(p: Params): Metrics {
  const { k, g, pl, ns } = makePlan(p, DETAIL.mid)

  const env = envelope(g)
  const narrow = g.ribs.reduce(
    (s, r) => (r.slots.length ? Math.min(s, r.narrow) : s),
    Infinity,
  )
  const mat = (p.material in MATERIALS ? p.material : "finer") as Material

  const list: Metric[] = []
  const m: Metrics = {
    envX: env.x,
    envY: env.y,
    envZ: env.z,

    parts: pl.parts.length,
    unique: pl.ids.length,
    loose: pl.lause,
    joints: g.joints,
    units: g.ribs.length,
    unitLabel: "ribber",

    mass: pl.mass,
    plyArea: pl.area,
    sheets: ns.sheets.length,
    util: ns.util,
    cutLen: pl.cutLen,
    // Rein kuttetid ved den farta som er sett. Tomgangen mellom delane er
    // ikkje med: han kjem an på kor programmet vel å hoppe, og eit tal som
    // er gjetta oppå eit tal som er gjetta er ikkje eit overslag lenger.
    cutTime: p.fart > 0 ? pl.cutLen / p.fart : 0,

    narrow: Number.isFinite(narrow) ? narrow : 0,
    minGap: Math.min(g.gapX, g.gapY),
    slotW: g.slotW,

    tris: k.soup.tris,
    srcTris: k.srcTris,
    openEdges: k.openEdges,

    list,
  }

  const add = (id: string, label: string, v: number, unit: string, text: string) =>
    list.push(metric(id, label, v, unit, text))

  add("ytre", "ytre mål", Math.max(env.x, env.y, env.z), "mm",
    `${nn(env.x)} × ${nn(env.y)} × ${nn(env.z)}`)
  add("delar", "delar · unike", m.parts, "stk", `${nn(m.parts)} · ${nn(m.unique)}`)
  add("ledd", "ledd", m.joints, "stk", nn(m.joints))
  add("lause", "lause delar", m.loose, "stk", nn(m.loose))
  add("kutt", "kuttlengd", m.cutLen, "m", nn(m.cutLen / 1000, 1))
  add("tid", "kuttetid", m.cutTime, "min", klokke(m.cutTime))
  add("masse", "masse", m.mass, "kg", nn(m.mass, 2))
  add("ark", "ark", m.sheets, "stk", `${nn(m.sheets)} × ${nn(p.arkB)}×${nn(p.arkH)}`)
  add("utnytting", "utnytting", m.util, "%", nn(m.util * 100))
  add("gods", "minste gods", m.narrow, "mm", nn(m.narrow, 1))
  add("opning", "opning", m.minGap, "mm", nn(m.minGap, 1))
  add("spor", "sporbreidd", m.slotW, "mm", nn(m.slotW, 2))
  add("nett", "trekantar", m.tris, "stk", `${nn(m.tris)} av ${nn(m.srcTris)}`)
  add("kantar", "opne kantar", m.openEdges, "stk", nn(m.openEdges))
  add("materiale", "materiale", 0, "", `${MATERIALS[mat].label} ${nn(p.tjukn, 1)} mm`)

  return m
}

/**
 * Kor stor plass det ferdige objektet tek.
 *
 * Ikkje omrisset av nettet: ribbene står i cellesenter og når aldri heilt
 * ut til kanten av forma dei er skorne av, og ei ribbe er tjukk. Difor
 * vert boksen lesen av dei polygona som faktisk vert skorne, pluss halve
 * tjukna ut til kvar side av kvart ribbeplan.
 */
export function envelope(g: Grid) {
  const h = g.p.tjukn / 2
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let z1 = 0
  for (const r of g.ribs) {
    if (!r.outlines.length) continue
    let t0 = Infinity
    let t1 = -Infinity
    for (const o of r.outlines) {
      const b = bbox(o)
      t0 = Math.min(t0, b.x0)
      t1 = Math.max(t1, b.x1)
      z1 = Math.max(z1, b.y1)
    }
    if (r.axis === "x") {
      x0 = Math.min(x0, r.pos - h)
      x1 = Math.max(x1, r.pos + h)
      y0 = Math.min(y0, t0)
      y1 = Math.max(y1, t1)
    } else {
      y0 = Math.min(y0, r.pos - h)
      y1 = Math.max(y1, r.pos + h)
      x0 = Math.min(x0, t0)
      x1 = Math.max(x1, t1)
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, z: 0 }
  return { x: x1 - x0, y: y1 - y0, z: z1 }
}
