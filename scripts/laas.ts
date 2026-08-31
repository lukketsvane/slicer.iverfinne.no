/**
 * LÅSTE RIBBER.
 *
 * Ribbene var eit tal og er ei liste. Denne fila prøver dei to påstandane
 * lista må halde: at eit objekt UTAN låsar er nøyaktig det same objektet
 * som før, og at ei låst ribbe står der ho er låst same kva skyvaren seier.
 *
 * Og ho prøver vegen inn. `laas` er den fyrste parameteren som ikkje er eit
 * tal med eit band kring seg — han er ein streng, han kjem frå ei lenkje,
 * og ei lenkje er skriven av kven som helst.
 */
import { plasser } from "../lib/vaffel/ribs"
import { lesLaas, reinLaas, skrivLaas, clampParams, DEFAULT_PARAMS } from "../lib/vaffel/params"

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

console.log(feil ? `\n${feil} FEIL` : "\nalle låsar held")
process.exit(feil ? 1 : 0)
