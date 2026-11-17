import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { MOTOR } from "../lib/motor"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { makeSoup } from "../lib/soup"
import { makeKropp } from "../lib/kropp"
import { makeBygg } from "../lib/bygg"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { DETAIL } from "../lib/snitt"
import { FILFORMER } from "../lib/scene"
import { DEFAULT_PARAMS, lesFest, type Params } from "../lib/params"
import { lesPlan, PLAN_TAK, reinPlan, skrivPlan, type Plan } from "../lib/plan"
import { FINN_PRIS, FINN_TAK, finnSett } from "../lib/finn"
import type { ParamBag } from "../lib/core"

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(56), sagt)
  if (!ok) feil++
}

const SETTREGLAR = ["grip", "delar", "orden", "klem", "gods"]
const bag = (o: Partial<Params>) => ({ ...DEFAULT_PARAMS, scene: "", plan: "", fest: "", ...o }) as unknown as ParamBag
const bygd = (b: ParamBag) => {
  const p = b as unknown as Params
  const bygg = makeBygg(p, DETAIL.mid)
  const plan = lesPlan(p.plan)
  return {
    bygg,
    plan,
    brot: checkRules(p, measure(p, bygg), bygg, false).filter((r) => !r.ok && r.hard && SETTREGLAR.includes(r.id)),
    tome: plan.filter((q) => !bygg.dl.delar.some((d) => d.plan === q.id)).map((q) => q.id),
    flokkar: flokkar(bygg.dl.delar.filter((d) => !plan.find((q) => q.id === d.plan)?.omriss)),
  }
}
function flokkar(delar: readonly { spor: readonly { nokkel: string }[] }[]): number {
  const far = delar.map((_, i) => i)
  const rot = (i: number): number => (far[i] === i ? i : (far[i] = rot(far[i])))
  const sett = new Map<string, number>()
  delar.forEach((d, i) => {
    for (const v of d.spor) {
      const j = sett.get(v.nokkel)
      if (j === undefined) sett.set(v.nokkel, i)
      else far[rot(i)] = rot(j)
    }
  })
  return new Set(delar.map((_, i) => rot(i))).size
}
const held = (b: ParamBag) => {
  const u = bygd(b)
  return u.brot.length === 0 && u.tome.length === 0 && u.flokkar === 1
}
const kvifor = (b: ParamBag) => {
  const u = bygd(b)
  return [...u.brot.map((r) => `${r.label}: ${r.value}`), ...(u.tome.length ? [`utan del: ${u.tome.join(",")}`] : []), ...(u.flokkar === 1 ? [] : [`${u.flokkar} flokkar som ikkje heng i hop`])].join("; ")
}

const TYNNE = ["skulptur-06"]
for (const id of FILFORMER) {
  const b = readFileSync(`public/form/${id}.glb`)
  put(id, id, parseMesh(`${id}.glb`, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
}

console.log("=== kvar form får eitt sett, og det går i hop ===")
const tal = new Map<string, number>()
let lengst = 0
for (const id of [...FILFORMER, "kube"]) {
  const inn = bag({ kjelde: id })
  const t0 = performance.now()
  const ut = MOTOR.finn(inn)
  const ms = performance.now() - t0
  lengst = Math.max(lengst, ms)
  const u = bygd(ut.p)
  tal.set(id, ut.plan)
  const familiar = new Set(u.plan.map((q) => q.n.join(",")))
  const eins = reinPlan(ut.p.plan) === ut.p.plan && MOTOR.finn(inn).p.plan === ut.p.plan
  if (TYNNE.includes(id)) {
    sjekk(`${id}: for tynn — eit sett som held, eller ingenting`, ut.plan === 0 ? ut.p.plan === inn.plan : held(ut.p), `${ut.plan} plan · ${ut.proevde} prøvde`)
    continue
  }
  sjekk(
    id,
    ut.plan === u.plan.length && ut.plan >= 2 && ut.plan <= 2 * FINN_TAK && familiar.size === 2 && held(ut.p) && u.bygg.s.ledd >= ut.plan - 1 && eins,
    `${ut.plan} plan · ${u.bygg.dl.delar.length} delar · ${u.bygg.s.ledd} ledd · ${ut.proevde} prøvde · ${ms.toFixed(0)} ms${held(ut.p) ? "" : " · " + kvifor(ut.p)}${eins ? "" : " · strengen skifter"}`,
  )
}
console.log(`  lengste trykk ${lengst.toFixed(0)} ms`)

console.log("\n=== forma avgjer talet ===")
sjekk("ein kube er to plan i kross", tal.get("kube") === 2, `${tal.get("kube")} plan`)
sjekk("stolform-01 er fem plan, sau-04 sju, dyr-01 seks", tal.get("stolform-01") === 5 && tal.get("sau-04") === 7 && tal.get("dyr-01") === 6, `stolform-01 ${tal.get("stolform-01")} · sau-04 ${tal.get("sau-04")} · dyr-01 ${tal.get("dyr-01")}`)
{
  const p = bag({ kjelde: "dyr-01" }) as unknown as Params
  const { rekkje, proevde } = finnSett(makeKropp(p), p)
  const best = rekkje[0]
  const fleire = rekkje.filter((s) => s.a.length + s.b.length > best.a.length + best.b.length)
  const faerre = rekkje.filter((s) => s.a.length + s.b.length < best.a.length + best.b.length)
  sjekk("kring hundre sett er prøvde, og kvart er talt éin gong", proevde >= 100 && rekkje.length === proevde, `${proevde} prøvde · ${rekkje.length} i rekkja`)
  sjekk(
    "eit større sett var ikkje verdt prisen",
    fleire.length > 0 && fleire.every((s) => s.treff - best.treff <= FINN_PRIS * (s.a.length + s.b.length - best.a.length - best.b.length) + 1e-9 + (s.vinkel ? 1 : 0)),
    `${fleire.length} større · beste treff ${Math.max(...fleire.map((s) => s.treff)).toFixed(3)} mot ${best.treff.toFixed(3)}`,
  )
  sjekk("og eit mindre sa for lite", faerre.length > 0 && faerre.every((s) => s.skaar <= best.skaar), `${faerre.length} mindre · beste treff ${Math.max(...faerre.map((s) => s.treff)).toFixed(3)}`)
  sjekk("treffet er eit tal mellom null og éin", rekkje.every((s) => s.treff > 0 && s.treff <= 1 && s.volum <= 1 && s.syn <= 1))
}

console.log("\n=== det som står frå før ===")
{
  const golv: Plan = { id: 3, o: [0.5, 0.5, 0.5], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]] }
  const skoren: Plan = { id: 9, o: [0.3, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [] }
  const inn = bag({ kjelde: "dyr-01", plan: skrivPlan([golv, skoren]), fest: "3:0,0,10,10;9:0,0,40,40" })
  const ut = MOTOR.finn(inn)
  const plan = lesPlan(ut.p.plan)
  const nye = plan.filter((q) => q.id !== 3)
  const fest = lesFest(ut.p.fest)
  sjekk("ei teikna flate står", plan.some((q) => q.id === 3 && q.omriss?.length === 4))
  sjekk("eit plan skore i kroppen vert bytt ut", !plan.some((q) => q.id === 9) && nye.length === ut.plan && nye.length >= 2, `${nye.length} nye`)
  sjekk("ingen nummer vert brukte om att", nye.every((q) => q.id > 9), nye.map((q) => q.id).join(","))
  sjekk("festet fylgjer delen ut, og berre han", fest.has("3") && !fest.has("9"), [...fest.keys()].join(","))
  sjekk("resten av posen er urørt", Object.keys(inn).every((n) => n === "plan" || n === "fest" || inn[n] === ut.p[n]))
  sjekk("settet går i hop MED flata: ingen ny normal på tvers av henne", nye.every((q) => Math.abs(q.n[0]) < 0.01 || Math.abs(q.n[1]) < 0.01) && held(ut.p), kvifor(ut.p) || nye.map((q) => q.n.join(",")).join(" | "))
  sjekk("og svaret seier kva liste det vart rekna frå", ut.fraa === inn.plan)

  const mange = Array.from({ length: 62 }, (_, i): Plan => ({ ...golv, id: i + 1, o: [0.5, 0.5, 0.2 + i * 0.005] }))
  const fullt = MOTOR.finn(bag({ kjelde: "dyr-01", plan: skrivPlan(mange) }))
  const lest = lesPlan(fullt.p.plan)
  sjekk("taket på 64 plan held: det som vert sagt er det som står i lista", lest.length <= PLAN_TAK && lest.length === 62 + fullt.plan, `62 teikna + ${fullt.plan} nye = ${lest.length} lesne`)
}

console.log("\n=== andre innstillingar ===")
for (const [namn, o] of [
  ["dyr-02 på 60 mm", { kjelde: "dyr-02", storleik: 60 }],
  ["sau-01 på 100 mm", { kjelde: "sau-01", storleik: 100 }],
  ["stolform-03 med lause «ta med»", { kjelde: "stolform-03", lause: 0 }],
  ["dyr-03 med delinga på 0,2", { kjelde: "dyr-03", ledd: 0.2 }],
  ["sau-03 i 25 mm plate", { kjelde: "sau-03", tjukn: 25 }],
  ["stolform-08 på 400 mm i 6 mm", { kjelde: "stolform-08", storleik: 400, tjukn: 6 }],
] as [string, Partial<Params>][]) {
  const ut = MOTOR.finn(bag(o))
  sjekk(`${namn}: kvart plan vert ein del, og settet held`, ut.plan >= 2 && held(ut.p), `${ut.plan} plan${ut.plan ? (held(ut.p) ? "" : " · " + kvifor(ut.p)) : ""}`)
}

console.log("\n=== vrange kroppar ===")
{
  const boks = (x: number, y: number, z: number, vri = 0) => {
    const c = Math.cos((vri * Math.PI) / 180)
    const s = Math.sin((vri * Math.PI) / 180)
    const h: [number, number, number][] = ([[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]] as [number, number, number][]).map(([a, b, d]) => [a * c - b * s, a * s + b * c, d])
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
    return makeSoup(new Float32Array(f.flatMap((t) => t.flatMap((i) => h[i]))))
  }
  put("plate", "plate", boks(200, 120, 3))
  put("pinne", "pinne", boks(4, 4, 300))
  put("skeiv", "skeiv", boks(200, 60, 100, 45))
  put("lang", "lang", boks(600, 20, 20))
  for (const id of ["plate", "pinne", "lang"]) {
    let ut: ReturnType<typeof MOTOR.finn> | null = null
    let kast = ""
    const inn = bag({ kjelde: id, plan: "1@0.5,0.5,0.5/1,0,0", storleik: id === "lang" ? 600 : 150 })
    try { ut = MOTOR.finn(inn) } catch (e) { kast = String(e).slice(0, 80) }
    sjekk(`${id}: eit sett som held, eller ingenting`, !!ut && (ut.plan === 0 ? ut.p.plan === inn.plan : held(ut.p) && lesPlan(ut.p.plan).length === ut.plan), kast || `${ut?.plan} plan`)
  }
  const ut = MOTOR.finn(bag({ kjelde: "skeiv" }))
  const n = lesPlan(ut.p.plan).map((q) => q.n.map((c) => Math.abs(c).toFixed(4)).join(","))
  sjekk("ein boks som står 45° på skrå får planet sitt langs seg", ut.plan === 2 && n.every((q) => q === "0.7071,0.7071,0.0000") && held(ut.p), n.join(" | "))
}

console.log(feil ? `\n${feil} FEIL` : "\nsøket held")
process.exit(feil ? 1 : 0)
