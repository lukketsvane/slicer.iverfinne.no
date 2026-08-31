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

/**
 * RADENE I TAVLA, EIN STAD.
 *
 * Panelet må kunne teikne tavla FØR fyrste målinga er inne, og gjorde det
 * med si eiga handskrivne liste over dei same etikettane. Dei to lista
 * dreiv frå kvarandre: tavla synte tretten rader tom og femten full, ho
 * bytte ord på ei rad i det fyrste svaret kom, og to av radene datt inn
 * frå ingenstad. Ei liste kan ikkje drive frå seg sjølv.
 *
 * EININGA STÅR BERRE DER HO SEIER NOKO. «40 ledd stk» er ikkje eit
 * målesystem, det er støy: talet ved sida av ordet «ledd» er sjølvsagt eit
 * tal ledd. Millimeter, kilogram, meter og prosent seier noko.
 *
 * Kva som IKKJE står her: ytremålet, som står under storleikskyvaren der
 * handa er når spørsmålet vert stilt; materialet, som står som fire
 * fargeprikkar og ei rad tjukner rett over; og kuttlengda, som står i
 * hovudlina i alle tre tilstandane, ordrett den same strengen. Eit tal to
 * stader er eit tal for mykje, og det som er handsett høyrer heime ved
 * handa. Kuttetida vert ståande: ho er det hovudlina ikkje kan seie.
 */
export const RADER: readonly { id: string; label: string; unit: string }[] = [
  { id: "delar", label: "delar · unike", unit: "" },
  { id: "ledd", label: "ledd", unit: "" },
  { id: "lause", label: "lause stykke", unit: "" },
  // Verdien er ei KLOKKE — «14:54», og «1:02:03» over timen. Ho stod med
  // «min» etter seg, so ein jobb på ein time og to minutt las «1:02:03
  // min». Kolonet seier alt som skal seiast om eininga.
  { id: "tid", label: "kuttetid", unit: "" },
  { id: "masse", label: "masse", unit: "kg" },
  { id: "ark", label: "ark", unit: "" },
  { id: "utnytting", label: "utnytting", unit: "%" },
  { id: "gods", label: "minste gods", unit: "mm" },
  { id: "opning", label: "opning", unit: "mm" },
  { id: "spor", label: "sporbreidd", unit: "mm" },
  { id: "nodar", label: "nodar", unit: "" },
  { id: "nett", label: "trekantar", unit: "" },
  { id: "kantar", label: "opne kantar", unit: "" },
]

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
    // Ein av dei to er alltid null: anten står dei lause stykka i lista,
    // eller so er dei kasta ut av rutenettet.
    loose: pl.lause + g.kasta,
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

    // Kvar ring i kuttfila, lagd saman. Ein node er eit punkt maskina må
    // ta stilling til, so dette er tala forenklinga handlar om.
    nodes: pl.parts.reduce(
      (n, q) => n + q.outline.length + q.holes.reduce((h, r) => h + r.length, 0),
      0,
    ),

    narrow: Number.isFinite(narrow) ? narrow : 0,
    minGap: Math.min(g.gapX, g.gapY),
    slotW: g.slotW,

    tris: k.soup.tris,
    srcTris: k.srcTris,
    openEdges: k.openEdges,

    list,
  }

  const add = (id: string, v: number, text: string) => {
    const r = RADER.find((q) => q.id === id)
    if (r) list.push(metric(id, r.label, v, r.unit, text))
  }

  add("delar", m.parts, `${nn(m.parts)} · ${nn(m.unique)}`)
  add("ledd", m.joints, nn(m.joints))
  add("lause", m.loose, nn(m.loose))
  add("tid", m.cutTime, klokke(m.cutTime))
  add("masse", m.mass, nn(m.mass, 2))
  add("ark", m.sheets, nn(m.sheets))
  add("utnytting", m.util, nn(m.util * 100))
  add("gods", m.narrow, nn(m.narrow, 1))
  add("opning", m.minGap, nn(m.minGap, 1))
  add("spor", m.slotW, nn(m.slotW, 2))
  add("nodar", m.nodes, nn(m.nodes))
  add("nett", m.tris, `${nn(m.tris)} av ${nn(m.srcTris)}`)
  add("kantar", m.openEdges, nn(m.openEdges))

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
