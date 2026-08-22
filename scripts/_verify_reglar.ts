/** throwaway verification — DELETE */
import { VAFFEL } from "../lib/vaffel/engine"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeKropp } from "../lib/vaffel/kropp"
import { buildGrid, DETAIL, jointsIn } from "../lib/vaffel/ribs"
import { makePlan } from "../lib/vaffel/plan"
import { put } from "../lib/sources"
import { makeSoup } from "../lib/soup"
import type { ParamBag } from "../lib/core"

const nn = (v: number, d = 2) => v.toFixed(d)

function torusSoup(R: number, r: number, n: number, m: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const u = (i / n) * Math.PI * 2
    const v = (j / m) * Math.PI * 2
    return [
      (R + r * Math.cos(v)) * Math.cos(u),
      (R + r * Math.cos(v)) * Math.sin(u),
      r * Math.sin(v),
    ]
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  return makeSoup(new Float32Array(pos))
}
put("torus", "torus", torusSoup(60, 22, 64, 32))

function show(name: string, p: Params) {
  const bag = p as unknown as ParamBag
  const m = VAFFEL.measure(bag)
  const r = VAFFEL.rules(bag, m)
  console.log(`\n=== ${name} ===`)
  console.log(
    `  parts ${m.parts}  joints ${m.joints}  narrow ${nn(m.narrow)}  minGap ${nn(m.minGap)}  slotW ${nn(m.slotW)}  cut ${nn(m.cutLen / 1000)} m  ark ${m.sheets}`,
  )
  for (const q of r) {
    console.log(`   ${q.ok ? "ok  " : q.hard ? "BRYT" : "merk"}  ${q.id.padEnd(11)} ${q.value}`)
  }
  return { m, r }
}

// ---------------- CLAIM 1 -------------------------------------------------
const P1: Params = {
  ...DEFAULT_PARAMS,
  storleik: 150,
  tjukn: 12,
  ribbX: 16,
  ribbY: 16,
}
const c1 = show("CLAIM1 kube 150, tjukn 12, 16x16", P1)
{
  const g = buildGrid(makeKropp(P1), P1, DETAIL.mid)
  const { pl } = makePlan(P1, DETAIL.mid)
  console.log(`  grid: pitchX ${nn(g.pitchX)} slotW ${nn(g.slotW)} joints ${g.joints} kasta ${g.kasta}`)
  // per rib: corner count of each outline, and jointsIn
  let totalCorners = 0
  for (const r of g.ribs.slice(0, 6)) {
    console.log(
      `   rib ${r.axis}${r.k} pos ${nn(r.pos, 1)} slots ${r.slots.length} outlines ${r.outlines.length} holes ${r.holes.length} corners ${r.outlines.map((o) => o.length).join(",")} jointsIn ${r.outlines.map((o) => jointsIn(r.slots, o)).join(",")}`,
    )
  }
  for (const r of g.ribs) for (const o of r.outlines) totalCorners += o.length
  console.log(`  total outlines corners ${totalCorners}, parts ${pl.parts.length}`)
  // dump one middle rib outline
  const mid = g.ribs.find((r) => r.axis === "x" && r.k === 3)!
  console.log(`  rib x3 outline pts:`, mid.outlines[0]?.map((q) => `(${nn(q[0], 0)},${nn(q[1], 0)})`).join(" "))
  const dxf = VAFFEL.exportFile(P1 as unknown as ParamBag, "dxf")
  console.log(`  dxf bytes ${dxf.text?.length ?? 0}`)
}

// ---------------- CLAIM 2 -------------------------------------------------
const P2: Params = {
  ...DEFAULT_PARAMS,
  kjelde: "torus",
  storleik: 150,
  rotX: 45,
  ribbX: 20,
  ribbY: 32,
  tjukn: 6,
  ledd: 0.2,
  lause: 1,
  arkB: 1200,
  arkH: 900,
}
const c2 = show("CLAIM2 torus 150 rotX45 20x32 tjukn6 ledd0.2", P2)
{
  const g = buildGrid(makeKropp(P2), P2, DETAIL.mid)
  let minAll = Infinity
  let minReal = Infinity
  const ghosts: string[] = []
  for (const r of g.ribs) {
    if (!r.slots.length) continue
    minAll = Math.min(minAll, r.narrow)
    if (r.outlines.length) minReal = Math.min(minReal, r.narrow)
    else ghosts.push(`${r.axis}${r.k}(slots ${r.slots.length}, narrow ${nn(r.narrow)})`)
  }
  console.log(`  min over ribs-with-slots ${nn(minAll)} ; min over ribs-with-outlines ${nn(minReal)}`)
  console.log(`  ghost ribs (slots but no outline): ${ghosts.join(" ") || "none"}`)
}

const P2b: Params = {
  ...DEFAULT_PARAMS,
  kjelde: "torus",
  storleik: 80,
  rotX: 30,
  rotY: 20,
  ribbX: 20,
  ribbY: 6,
  tjukn: 4,
  ledd: 0.8,
  arkB: 1200,
  arkH: 900,
}
const c2b = show("CLAIM2b torus 80 rot30/20 20x6 tjukn4 ledd0.8", P2b)
{
  const g = buildGrid(makeKropp(P2b), P2b, DETAIL.mid)
  let minAll = Infinity
  let minReal = Infinity
  const ghosts: string[] = []
  for (const r of g.ribs) {
    if (!r.slots.length) continue
    minAll = Math.min(minAll, r.narrow)
    if (r.outlines.length) minReal = Math.min(minReal, r.narrow)
    else ghosts.push(`${r.axis}${r.k}(slots ${r.slots.length}, narrow ${nn(r.narrow)})`)
  }
  console.log(`  min over ribs-with-slots ${nn(minAll)} ; min over ribs-with-outlines ${nn(minReal)}`)
  console.log(`  ghost ribs: ${ghosts.join(" ") || "none"}`)
}

// ---------------- CLAIM 3 -------------------------------------------------
for (const snitt of [0, 2, 4, 6]) {
  const P3: Params = {
    ...DEFAULT_PARAMS,
    fres: 12,
    snitt,
    tjukn: 12.5,
    storleik: 300,
    arkB: 1200,
    arkH: 900,
  }
  const r = show(`CLAIM3 fres 12 snitt ${snitt} tjukn 12.5`, P3)
  console.log(
    `   broken: ${r.r.filter((q) => !q.ok).map((q) => (q.hard ? "HARD:" : "") + q.id).join(", ") || "none"}`,
  )
}
