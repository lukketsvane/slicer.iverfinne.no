import { measure } from "../lib/metrics"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { newSoup } from "../lib/mesh"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(46), sagt)
  if (!ok) feil++
}

function torus(R: number, r: number, n: number, m: number) {
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
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  return makeSoup(new Float32Array(pos))
}
void newSoup
put("torus", "torus", torus(50, 18, 64, 32))

const maal = (o: Partial<Params>) =>
  measure({ ...DEFAULT_PARAMS, plan: nett(6, 6), kjelde: "torus", storleik: 300, ...o } as Params)

const grunn = maal({})
console.log(
  `  torus 300 mm, seks ribber kvar veg: ${grunn.parts} delar, ` +
    `${grunn.nodes} nodar, ${Math.round(grunn.cutLen)} mm kutt\n`,
)

const trinn = [0, 0.25, 0.5, 1, 2].map((t) => ({ t, m: maal({ forenkl: t }) }))
for (const { t, m } of trinn) {
  console.log(
    `  forenkl ${String(t).padEnd(5)} → ${String(m.nodes).padStart(5)} nodar · ` +
      `${String(m.parts).padStart(3)} delar · ${String(Math.round(m.cutLen)).padStart(5)} mm · ` +
      `${m.envX.toFixed(1)}×${m.envY.toFixed(1)}×${m.envZ.toFixed(1)} mm`,
  )
}

sjekk(
  "null forenkling er objektet som før",
  trinn[0].m.nodes === grunn.nodes && trinn[0].m.cutLen === grunn.cutLen,
  `${trinn[0].m.nodes} nodar`,
)
sjekk(
  "fleire millimeter gjev færre nodar",
  trinn.every((q, i) => i === 0 || q.m.nodes <= trinn[i - 1].m.nodes),
  trinn.map((q) => q.m.nodes).join(" → "),
)
sjekk(
  "og det er ei MERKBAR forenkling",
  trinn[trinn.length - 1].m.nodes < grunn.nodes * 0.7,
  `${grunn.nodes} → ${trinn[trinn.length - 1].m.nodes}`,
)
sjekk(
  "ingen delar går tapt undervegs",
  trinn.every((q) => q.m.parts === grunn.parts),
  trinn.map((q) => q.m.parts).join(" "),
)
for (const { t, m } of trinn) {
  const av = Math.max(
    Math.abs(m.envX - grunn.envX),
    Math.abs(m.envY - grunn.envY),
    Math.abs(m.envZ - grunn.envZ),
  )
  sjekk(`toleranse ${t} mm held ytremålet innanfor lovnaden`, av <= 2 * t + 0.05, `${av.toFixed(3)} mm`)
}

console.log("")
const hol = [0, 40, 60].map((h) => ({ h, m: maal({ rotX: 90, storleik: 100, hol: h }) }))
for (const { h, m } of hol) {
  console.log(`  hòl under ${String(h).padEnd(3)} mm → ${String(m.nodes).padStart(5)} nodar · ${String(m.parts).padStart(3)} delar`)
}
sjekk("det FINST hòl å ta", hol[0].m.nodes > hol[hol.length - 1].m.nodes,
  `${hol[0].m.nodes} → ${hol[hol.length - 1].m.nodes}`)
sjekk("null tak tek ingen hòl", hol[0].m.nodes === maal({ rotX: 90, storleik: 100 }).nodes, `${hol[0].m.nodes}`)
sjekk(
  "eit tak tek berre bort, aldri legg til",
  hol.every((q, i) => i === 0 || q.m.nodes <= hol[i - 1].m.nodes),
  hol.map((q) => q.m.nodes).join(" → "),
)

console.log(feil ? `\n${feil} FEIL` : "\nforenklinga held")
process.exit(feil ? 1 : 0)
