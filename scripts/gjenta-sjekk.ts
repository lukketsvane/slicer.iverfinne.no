import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { finnKopipar, gjentaFlytting } from "../lib/gjenta"
import { lesPlan, PLAN_TAK, skrivPlan, type Plan } from "../lib/plan"
import { DEFAULT_PARAMS } from "../lib/params"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { measure } from "../lib/metrics"
import { MOTOR } from "../lib/motor"
import type { ParamBag } from "../lib/core"

let sjekkar = 0
const sjekk = (vil: unknown, ord: string) => { assert(vil, ord); sjekkar++; console.log(`ok ${ord}`) }
const fraa: Plan = { id: 3, o: [0.5, 0.15, 0.5], n: [0, -1, 0], bog: 0,
  omriss: [[-0.4, -0.42], [0.4, -0.42], [0.4, 0.42], [-0.4, 0.42]],
  strek: [{ slag: "hol", form: "rund", x: -0.22, y: 0.08, w: 0.1, h: 0.1, a: 0 }],
}
let plan: Plan[] = [fraa, { ...fraa, id: 7, o: [0.5, 0.29, 0.5] }]
let par = finnKopipar({ plan: [fraa], vald: 3 }, { plan, vald: 7 })
sjekk(par, "dublering av den valde plata vert kjend att")
const foer = skrivPlan(plan)
for (let i = 2; i < 6; i++) {
  const ny = gjentaFlytting(plan, par!).kopi
  sjekk(ny && Math.abs(ny.o[1] - (0.15 + i * 0.14)) < 1e-10, `ribbe ${i + 1} held avstanden`)
  const etter = lesPlan(skrivPlan([...plan, ny!]))
  par = finnKopipar({ plan, vald: par!.til }, { plan: etter, vald: ny!.id })
  sjekk(par, "den nye kopien kan gjentakast igjen")
  plan = etter
}
sjekk(skrivPlan(plan.slice(0, 2)) === foer, "kjeldene er urørte")
sjekk(new Set(plan.map((p) => p.id)).size === 6, "alle ribbene har eigne namn")
sjekk(plan.every((p) => JSON.stringify(p.strek) === JSON.stringify(fraa.strek)), "hòla følgjer kvar kopi nøyaktig")
sjekk(plan.every((p) => JSON.stringify(p.omriss) === JSON.stringify(fraa.omriss)), "omrissa er framleis redigerbare")
sjekk(finnKopipar({ plan: [fraa], vald: null }, { plan: plan.slice(0, 2), vald: 7 }) === null, "ei nyteikna plate startar ikkje ei rekkje")
sjekk(!finnKopipar({ plan: [fraa], vald: 3 }, { plan: [{ ...fraa, o: [0.1, 0.1, 0.1] }, plan[1]], vald: 7 }), "utskifting av prosjekt vert ikkje tolka som dublering")
sjekk(!gjentaFlytting(plan.slice(0, -1), par!).kopi, "ein sletta kopi vert ikkje gjenoppliva")
sjekk(!gjentaFlytting(plan.map((p) => p.id === par!.fraa.id ? { ...p, bog: 0.3 } : p), par!).kopi, "endra kjelde avlyser den gamle flyttinga")
sjekk(!gjentaFlytting(plan.map((p) => p.id === par!.til ? { ...p, n: [1, 0, 0] } : p), par!).kopi, "rotasjon vert ikkje kalla ei gjenteken flytting")
sjekk(!gjentaFlytting([fraa, { ...fraa, id: 7 }], { fraa, til: 7 }).kopi, "nullavstand lagar ikkje samanfallande plater")
sjekk(!gjentaFlytting([fraa, { ...fraa, id: 7, o: [0.5, 4.9, 0.5] }], { fraa, til: 7 }).kopi, "romgrensa avviser utan å endre avstanden")
sjekk(!gjentaFlytting([...plan, ...Array.from({ length: PLAN_TAK - plan.length }, (_, i) => ({ ...fraa, id: i + 100 }))], par!).kopi, "64 plan er eit hardt tak")
sjekk(gjentaFlytting(plan.map((p) => p.id === par!.til ? { ...p, strek: [{ ...p.strek[0], w: 0.16 }] } : p), par!).kopi?.strek[0].w === 0.16, "vidare forming av den siste plata følgjer neste kopi")
const bakover = { ...fraa, id: 7, o: [0.43, 0.01, 0.53] as [number, number, number] }
assert.deepEqual(gjentaFlytting([fraa, bakover], { fraa, til: 7 }).kopi?.o, [0.36, -0.13, 0.56])
sjekkar++

const sete: Plan = { id: 20, o: [0.5, 0.5, 0.78], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-0.42, -0.49], [0.42, -0.49], [0.42, 0.49], [-0.42, 0.49]] }
const ut = process.env.GJENTA_UT
if (ut) mkdirSync(ut, { recursive: true })
const rapport: unknown[] = []
for (const tjukn of [3, 11.85, 12, 18]) {
  const p = { ...DEFAULT_PARAMS, storleik: 450, tjukn, material: "bjork", snitt: 0.2, arkB: 1500, arkH: 1500, plan: skrivPlan([...plan, sete]) }
  const bygg = makeBygg(p, DETAIL.mid)
  const maal = measure(p, bygg)
  sjekk(bygg.s.ledd === 6 && bygg.dl.delar.length === 7, `${tjukn} mm: seks nye ledd og sju delar`)
  sjekk(!bygg.s.montering.brot.length && !bygg.s.montering.klem.length, `${tjukn} mm: ingen brot i monteringskontrollen`)
  sjekk(Math.abs(maal.slotW - (tjukn + p.klaring)) < 0.001, `${tjukn} mm: sporet følgjer målt tjukn og klaring`)
  sjekk(!bygg.ns.spilt && !bygg.ns.kross && bygg.ns.sheets.reduce((n, s) => n + s.placed.length, 0) === 7, `${tjukn} mm: alle delane nesta utan overlapp`)
  const svg = MOTOR.exportFile(p as unknown as ParamBag, "ark").text
  sjekk(svg && !/NaN|Infinity/.test(svg) && Number(/width="([\d.]+)mm"/.exec(svg)?.[1]) === 1500, `${tjukn} mm: endeleg SVG i millimeter`)
  if (ut && tjukn === 12) { writeFileSync(join(ut, "gjenta-nesta.svg"), svg!); writeFileSync(join(ut, "gjenta-prosjekt.json"), JSON.stringify(p, null, 2)) }
  rapport.push({ tjukn, ledd: bygg.s.ledd, delar: bygg.dl.delar.length, ark: bygg.ns.sheets.length, sporbreidd: maal.slotW })
}
if (ut) writeFileSync(join(ut, "geometri.json"), JSON.stringify({ sjekkar, rapport, avgrensing: "Geometrikontroll av platestudie, ikkje fysisk bereevneprøve." }, null, 2))
console.log(`${sjekkar} sjekkar held`)
