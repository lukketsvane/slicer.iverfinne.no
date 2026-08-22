/** mellombels prøve — vert sletta */
import { bbox, type Pt } from "../lib/core"
import { anchor, apply } from "../lib/pack"
import { makePlan } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

function boxTris(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): number[] {
  const x0 = cx - sx / 2, x1 = cx + sx / 2
  const y0 = cy - sy / 2, y1 = cy + sy / 2
  const z0 = cz - sz / 2, z1 = cz + sz / 2
  const v: [number, number, number][] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const faces: [number, number, number, number][] = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ]
  const out: number[] = []
  for (const [a, b, c, d] of faces) {
    out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d])
  }
  return out
}

// tre pigger + ei rygg oppå
const pos: number[] = []
for (const x of [-40, 0, 40]) pos.push(...boxTris(x, 0, 45, 20, 40, 90))
pos.push(...boxTris(0, 0, 95, 100, 10, 10))
put("kam3", "kam3", makeSoup(new Float32Array(pos)))

const p: Params = { ...DEFAULT_PARAMS, kjelde: "kam3", ribbX: 5, ribbY: 4 }
const { pl, ns } = makePlan(p, DETAIL.mid)
console.log("delar:", pl.parts.length, "unike:", pl.ids.length)
for (const q of pl.parts) {
  const b = bbox(q.outline)
  console.log(
    `  ${q.from.padEnd(5)} id=${q.id}  bbox x[${b.x0.toFixed(1)}..${b.x1.toFixed(1)}] y[${b.y0.toFixed(1)}..${b.y1.toFixed(1)}]  areal ${q.area.toFixed(0)}`,
  )
}

// like id, ulik plassering?
const grp = new Map<string, { from: string; x0: number; y0: number }[]>()
for (const q of pl.parts) {
  const b = bbox(q.outline)
  const l = grp.get(q.id) ?? []
  l.push({ from: q.from, x0: b.x0, y0: b.y0 })
  grp.set(q.id, l)
}
console.log("\n--- former med same id, ulik origo ---")
for (const [id, l] of grp) {
  const spread = Math.max(...l.map((q) => q.x0)) - Math.min(...l.map((q) => q.x0))
  const spreadY = Math.max(...l.map((q) => q.y0)) - Math.min(...l.map((q) => q.y0))
  if (l.length > 1 && (spread > 0.01 || spreadY > 0.01)) {
    console.log(`  ${id}: ${l.map((q) => `${q.from}@(${q.x0.toFixed(1)},${q.y0.toFixed(1)})`).join(" ")}`)
  }
}

// merkelappar: kvar dei hamnar mot kvar dei SKULLE hamna
console.log("\n--- merkelapp: teikna vs rett ---")
let verst = 0
for (const sheet of ns.sheets) {
  for (const q of sheet.placed) {
    const rett = apply(q.slot.m, anchor([q.part.outline, ...q.part.holes]).p)
    const d = Math.hypot(rett[0] - q.label.p[0], rett[1] - q.label.p[1])
    if (d > 0.01) {
      console.log(`  ${q.part.from} id=${q.part.id}  teikna (${q.label.p[0].toFixed(1)},${q.label.p[1].toFixed(1)})  rett (${rett[0].toFixed(1)},${rett[1].toFixed(1)})  avvik ${d.toFixed(1)} mm`)
    }
    verst = Math.max(verst, d)
    // ligg merket innanfor delen?
    const r = placedRings(q)
    const b = bbox(r.outline)
    if (q.label.p[0] < b.x0 - 0.01 || q.label.p[0] > b.x1 + 0.01 || q.label.p[1] < b.y0 - 0.01 || q.label.p[1] > b.y1 + 0.01) {
      console.log(`    ^ MERKET LIGG UTANFOR DELEN sin boks x[${b.x0.toFixed(1)}..${b.x1.toFixed(1)}] y[${b.y0.toFixed(1)}..${b.y1.toFixed(1)}]`)
    }
  }
}
console.log("verste merkeavvik:", verst.toFixed(2), "mm")

// omriss utanfor plata?
let ute = 0
for (const sheet of ns.sheets) {
  for (const q of sheet.placed) {
    const b = bbox(placedRings(q).outline)
    if (b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > p.arkB + 0.01 || b.y1 > p.arkH + 0.01) {
      ute++
      console.log(`  UTANFOR: ${q.part.from} x[${b.x0.toFixed(1)}..${b.x1.toFixed(1)}] y[${b.y0.toFixed(1)}..${b.y1.toFixed(1)}]`)
    }
  }
}
console.log("delar utanfor plata:", ute, " ark:", ns.sheets.length, " spilt:", ns.spilt)
