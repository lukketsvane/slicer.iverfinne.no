/** THROWAWAY - claim 3: does mass follow the material button? */
import { makePlan } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { MATERIALS } from "../lib/core"
console.log("densities:", Object.entries(MATERIALS).map(([k,v]:any)=>`${k}=${v.rho}`).join(" "))
// One long-lived process, clicking through materials in order, like the worker.
for (const material of ["mdf","papp","akryl","finer","mdf"]) {
  const p = { ...DEFAULT_PARAMS, material } as Params
  const { pl } = makePlan(p, DETAIL.mid)
  console.log(`  ${material.padEnd(6)} masse=${pl.mass.toFixed(4)} kg  (parts ${pl.parts.length})`)
}
