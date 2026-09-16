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
import { klokke, metric, nn, type Metric, type Metrics, type Pt } from "./core"
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
  // og fingrane i eit hjørne: den kortaste fingeren er det som ber
  const finger = s.ribber.flatMap((r) => r.tapp.filter((q) => q.nokkel.startsWith("f")).map((q) => Math.hypot(q.hjorne[1][0] - q.hjorne[0][0], q.hjorne[1][1] - q.hjorne[0][1])))
  const narrow = s.ribber.reduce((m, r) => (r.spor.length || r.tapp.some((q) => q.slag === "slisse") ? Math.min(m, r.narrow) : m), Math.min(Infinity, ...finger))
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
    avvist: s.avvist,
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
  // AVVISTE STÅR I DEN SAME RADA. Dei er ikkje ein regel som er broten —
  // eit møte utan skulder SKAL kastast — men eit tal du må sjå medan alt
  // er grønt, av di det seier at ei krysning du sikta på ikkje vart eit
  // ledd. Rada ber to tal frå før andre stader; her er det andre stille.
  add("ledd", m.joints, m.avvist ? `${nn(m.joints)} · ${nn(m.avvist)} avviste` : nn(m.joints))
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
 *
 * OG PÅ EI BØYGD RIBBE LIGG BULEN MELLOM HJØRNA.
 *
 * Omrisset er ein mangekant med få punkt — ei firkanta ribbe har fire — og
 * `ut` bøyer kvart punkt rett. Men bogen mellom to punkt er ei RETT LINE i
 * det flate mønsteret og ein BOGE i rommet, og boksen kring berre hjørna
 * ser ikkje bogen. På ei firkanta ribbe står alle fire hjørna på same
 * buelengd frå midten, so dei har nøyaktig same avstand ut — og boksen vart
 * flat. Målt på ei einsam ribbe på 300 mm med bog 0,9:
 *
 *     ytremålet sa      3,0 × 301,4 × 299,9 mm
 *     ribba i rommet   35,7 × 300,0 × 300,0 mm
 *
 * Reiskapen sa altso at det ferdige objektet var tre millimeter tjukt når
 * det var seks centimeter. Difor vert kanten DELT når ramma er bøygd: kvar
 * femte millimeter buelengd, som er finare enn ein boge på ein halv meter
 * treng for eit ytremål i heile millimeter.
 */
const KANT_STEG = 5
export function envelope(s: Snitt, tjukn: number) {
  const h = tjukn / 2
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const ta = (r: Snitt["ribber"][number], q: Pt) => {
    for (const off of [-h, h]) {
      const p = ut(r.r, q, off)
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i]
        if (p[i] > max[i]) max[i] = p[i]
      }
    }
  }
  for (const r of s.ribber) {
    for (const o of r.outlines) {
      for (let i = 0; i < o.length; i++) {
        const a = o[i]
        ta(r, a)
        if (!r.r.k) continue
        const b = o[(i + 1) % o.length]
        const n = Math.ceil(Math.abs(b[0] - a[0]) / KANT_STEG)
        for (let t = 1; t < n; t++) ta(r, [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n])
      }
    }
  }
  if (!Number.isFinite(min[0])) return { x: 0, y: 0, z: 0 }
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }
}
