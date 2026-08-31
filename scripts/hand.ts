/**
 * HANDA: LÅSTE RIBBER OG FESTA DELAR.
 *
 * Ribbene var eit tal og er ei liste. Denne fila prøver dei to påstandane
 * lista må halde: at eit objekt UTAN låsar er nøyaktig det same objektet
 * som før, og at ei låst ribbe står der ho er låst same kva skyvaren seier.
 *
 * Og ho prøver vegen inn. `laas` og `fest` er dei to fyrste parametrane som
 * ikkje er tal med eit band kring seg — dei er strengar, dei kjem frå ei
 * lenkje, og ei lenkje er skriven av kven som helst.
 */
import {
  plasser,
  lesLaas,
  reinLaas,
  skrivLaas,
  reinFest,
  clampParams,
  DEFAULT_PARAMS,
} from "../lib/vaffel/params"
import { apply, pack, type Fest } from "../lib/pack"
import { bbox, type Pt } from "../lib/core"

const p3 = (v: readonly number[]) => v.map((t) => t.toFixed(3)).join(" ")
let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(44), sagt)
  if (!ok) feil++
}

// 1) utan lås er det den gamle jamne fordelinga
const jamt6 = Array.from({ length: 6 }, (_, i) => (i + 0.5) / 6)
sjekk("utan lås = jamt", p3(plasser(6, [])) === p3(jamt6), p3(plasser(6, [])))

// 2) ei låst ribbe står nøyaktig der ho er låst, uansett tal
for (const n of [4, 6, 10, 20]) {
  const ut = plasser(n, [0.2])
  sjekk(`lås 0,200 held ved ${n} ribber`, ut.includes(0.2) && ut.length === n, p3(ut))
}

// 3) dei frie fordeler seg — ingen dublettar, alltid sortert
const ut = plasser(8, [0.2, 0.25])
sjekk("to låsar tett i hop", ut.length === 8 && new Set(ut).size === 8 &&
  ut.every((v, i) => i === 0 || v > ut[i - 1]), p3(ut))

// 4) fleire låsar enn ribber: låsane vinn
const many = plasser(2, [0.1, 0.3, 0.5, 0.7, 0.9])
sjekk("5 låsar, skyvaren på 2", many.length === 5, p3(many))

// 5) fiendtleg streng frå ei lenkje
for (const [inn, vent] of [
  ["x:0.5", "x:0.5"],
  ["y:0.25,0.75", "y:0.25,0.75"],
  ["x:0.5;y:0.5", "x:0.5;y:0.5"],
  ["z:0.5", ""],                              // ukjend akse
  ["x:2,-1,NaN,Infinity", ""],                // utanfor bandet
  ["x:0,1", ""],                              // kanten tel ikkje
  ["x:0.5,0.5,0.5", "x:0.5"],                 // dublettar
  ["x:0.9,0.1", "x:0.1,0.9"],                 // usortert
  ["<script>", ""],
  ["x:" + Array.from({ length: 400 }, (_, i) => (i + 1) / 500).join(","),
   "x:" + Array.from({ length: 64 }, (_, i) => (i + 1) / 500).join(",")],
] as const) {
  const fekk = reinLaas(inn)
  sjekk(`rein «${String(inn).slice(0, 26)}»`, fekk === vent, fekk.slice(0, 40))
}

// 6) clampParams slepp han gjennom, og reinsar
const q = clampParams({ ...DEFAULT_PARAMS, laas: "x:0.5;z:9" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar laas", q.laas === "x:0.5", q.laas)
const r = clampParams({ storleik: 200 }, { ...DEFAULT_PARAMS, laas: "x:0.5" })
sjekk("laas overlever ein annan endring", r.laas === "x:0.5", r.laas)

// 7) fram og attende
const l = lesLaas("x:0.125,0.375;y:0.5")
sjekk("les → skriv er identitet", skrivLaas(l) === "x:0.125,0.375;y:0.5", skrivLaas(l))

// =============================================================================
// FESTA DELAR
// =============================================================================
for (const [inn, vent] of [
  ["X1:0,0,12.5,340", "X1:0,0,12.5,340"],
  ["Y3a:1,2,100,50", "Y3a:1,2,100,50"],
  ["X1:9,0,0,0;X1:0,0,5,5", "X1:0,0,5,5"],        // siste vinn, fyrste er ugyldig plate
  ["X1:0,4,0,0", ""],                              // kvartsving finst ikkje
  ["X1:-1,0,0,0", ""],                             // negativ plate
  ["X1:0,0,-5,0", ""],                             // utanfor plata
  ["X1:0,0,99999,0", ""],                          // langt utanfor
  ["X1:0,0,NaN,0", ""],
  ["tull", ""],
  ["<script>:0,0,0,0", ""],
] as const) {
  const fekk = reinFest(inn)
  sjekk(`fest «${String(inn).slice(0, 26)}»`, fekk === vent, fekk)
}

const f = clampParams({ ...DEFAULT_PARAMS, fest: "X1:0,0,5,5;tull" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar fest", f.fest === "X1:0,0,5,5", f.fest)

// --- og gjennom sjølve pakkinga -------------------------------------------
const rute = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]]
const bitar = ["a", "b", "c"].map((key) => ({ key, rings: [rute(100, 100)] }))
/** kvar ein del hamna, som hjørnet av boksen sin */
const kvar = (pk: ReturnType<typeof pack>, i: number) => {
  const sl = pk.slots.find((q) => q.piece === i)
  if (!sl) return null
  const b = bbox(bitar[i].rings[0].map((q) => apply(sl.m, q)))
  return { ark: sl.sheet, x: Math.round(b.x0), y: Math.round(b.y0) }
}

const fritt = pack(bitar, 400, 400, 4)
sjekk("utan feste: alle tre lagde", fritt.slots.length === 3, JSON.stringify(kvar(fritt, 0)))
const heim = kvar(fritt, 0)!
sjekk("utan feste: fyrste i hjørnet", heim.x < 8 && heim.y < 8, `${heim.x},${heim.y}`)

const festa = new Map<number, Fest>([[0, { sheet: 0, rot: 0, x: 250, y: 250 }]])
const med = pack(bitar, 400, 400, 4, festa)
const p0 = kvar(med, 0)!
sjekk("med feste: alle tre lagde", med.slots.length === 3, String(med.slots.length))
sjekk(
  "med feste: den festa står der han vart sett",
  p0.ark === 0 && Math.abs(p0.x - 250) <= 6 && Math.abs(p0.y - 250) <= 6,
  `${p0.x},${p0.y}`,
)

// og ingen av dei tre overlappar kvarandre
const boksar = [0, 1, 2].map((i) => {
  const sl = med.slots.find((q) => q.piece === i)!
  return bbox(bitar[i].rings[0].map((q) => apply(sl.m, q)))
})
let kross = 0
for (let i = 0; i < 3; i++)
  for (let j = i + 1; j < 3; j++) {
    const a = boksar[i]
    const b = boksar[j]
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) kross++
  }
sjekk("med feste: ingen overlappar", kross === 0, `${kross} kryss`)

console.log(feil ? `\n${feil} FEIL` : "\nhanda held")
process.exit(feil ? 1 : 0)
