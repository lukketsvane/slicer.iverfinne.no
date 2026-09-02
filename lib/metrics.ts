/**
 * SLICERMAN — måltala.
 *
 * Alt her er LESE av geometrien og ikkje henta frå parameterlista. Tjukna
 * er unntaket, og ho står med namn i staden for å gøymast. Alt anna — ytre
 * mål, tal delar, kuttlengd, masse, kor mange ark du må kjøpe — er målt av
 * dei polygona kuttfila sjølv vert skriven av.
 *
 * KUTTLENGDA er talet dei fleste kjem for, og KUTTETIDA er det dei
 * eigentleg spurde om: tretti meter kutt på tjue millimeter i sekundet er
 * femogtjue minutt, og det er verdt å vita FØR knappen.
 */
import { klokke, metric, nn, type Metric, type Metrics } from "./core"
import { makeBygg, type Bygg } from "./bygg"
import { DETAIL, type Snitt } from "./snitt"
import { ut } from "./plan"
import type { Params } from "./params"

/**
 * RADENE I TAVLA, EIN STAD. Panelet må kunne teikne tavla FØR fyrste
 * målinga er inne, og to lister driv frå kvarandre. Eininga står berre der
 * ho seier noko: «40 ledd stk» er støy.
 */
export const RADER: readonly { id: string; label: string; unit: string }[] = [
  { id: "delar", label: "delar · unike", unit: "" },
  { id: "ledd", label: "ledd", unit: "" },
  { id: "lause", label: "lause stykke", unit: "" },
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

export function measure(p: Params, bygg?: Bygg): Metrics {
  const { k, s, dl, ns } = bygg ?? makeBygg(p, DETAIL.mid)
  const env = envelope(s, p.tjukn)
  const narrow = s.ribber.reduce((m, r) => (r.spor.length ? Math.min(m, r.narrow) : m), Infinity)
  const list: Metric[] = []
  const m: Metrics = {
    envX: env.x,
    envY: env.y,
    envZ: env.z,
    parts: dl.delar.length,
    unique: dl.ids.length,
    // Ein av dei to er alltid null: anten står dei lause stykka i lista,
    // eller so er dei kasta ut av snittet.
    loose: dl.lause + s.kasta,
    joints: s.ledd,
    units: s.ribber.length,
    unitLabel: "plan",
    mass: dl.mass,
    plyArea: dl.area,
    sheets: ns.sheets.length,
    util: ns.util,
    cutLen: dl.cutLen,
    // Rein kuttetid ved den farta som er sett. Tomgangen mellom delane er
    // ikkje med: eit tal gjetta oppå eit tal gjetta er ikkje eit overslag.
    cutTime: p.fart > 0 ? dl.cutLen / p.fart : 0,
    nodes: dl.delar.reduce((n, q) => n + q.outline.length + q.holes.reduce((h, r) => h + r.length, 0), 0),
    narrow: Number.isFinite(narrow) ? narrow : 0,
    minGap: s.minGap,
    slotW: s.slotW,
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
 * Kor stor plass det ferdige objektet tek: boksen kring dei polygona som
 * faktisk vert skorne, lagde ut i rommet gjennom ramma si, pluss halve
 * tjukna til kvar side av kvart plan. Ikkje omrisset av nettet.
 */
export function envelope(s: Snitt, tjukn: number) {
  const h = tjukn / 2
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const r of s.ribber) {
    for (const o of r.outlines) {
      for (const q of o) {
        for (const off of [-h, h]) {
          const p = ut(r.r, q, off)
          for (let i = 0; i < 3; i++) {
            if (p[i] < min[i]) min[i] = p[i]
            if (p[i] > max[i]) max[i] = p[i]
          }
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) return { x: 0, y: 0, z: 0 }
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }
}
