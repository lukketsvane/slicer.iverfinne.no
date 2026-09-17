import { klokke, metric, nn, type Metric, type Metrics, type Pt } from "./core"
import { makeBygg, type Bygg } from "./bygg"
import { DETAIL, type Snitt } from "./snitt"
import { ut } from "./plan"
import type { Params } from "./params"

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
  const finger = s.ribber.flatMap((r) => r.tapp.filter((q) => q.nokkel.startsWith("f")).map((q) => Math.hypot(q.hjorne[1][0] - q.hjorne[0][0], q.hjorne[1][1] - q.hjorne[0][1])))
  const narrow = s.ribber.reduce((m, r) => (r.spor.length || r.tapp.some((q) => q.slag === "slisse") ? Math.min(m, r.narrow) : m), Math.min(Infinity, ...finger))
  const list: Metric[] = []
  const m: Metrics = {
    envX: env.x,
    envY: env.y,
    envZ: env.z,
    parts: dl.delar.length,
    unique: dl.ids.length,
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
