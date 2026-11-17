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
import { DEFAULT_PARAMS, lesFest, type Params } from "../lib/params"
import { lesPlan, reinPlan, skrivPlan, type Plan } from "../lib/plan"
import { FINN_PRIS, FINN_TAK, finnSett } from "../lib/finn"
import type { ParamBag } from "../lib/core"

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(52), sagt)
  if (!ok) feil++
}

const bag = (o: Partial<Params>) => ({ ...DEFAULT_PARAMS, scene: "", plan: "", fest: "", ...o }) as unknown as ParamBag
const SETTREGLAR = ["grip", "delar", "orden", "klem", "lause", "gods"]
const harde = (b: ParamBag) => {
  const p = b as unknown as Params
  const bygg = makeBygg(p, DETAIL.mid)
  return { bygg, brot: checkRules(p, measure(p, bygg), bygg, false).filter((r) => !r.ok && r.hard && SETTREGLAR.includes(r.id)) }
}

const FORMER = ["dyr-01", "dyr-02", "dyr-03", "dyr-05", "sau-01", "sau-03", "stolform-03", "stolform-07", "stolform-09", "skulptur-01", "skulptur-07"]
const TYNNE = ["skulptur-06"]
for (const id of [...FORMER, ...TYNNE]) {
  const b = readFileSync(`public/form/${id}.glb`)
  put(id, id, parseMesh(`${id}.glb`, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
}

console.log("=== kvar form får eitt sett, og det går i hop ===")
const tal = new Map<string, number>()
for (const id of [...FORMER, "kube"]) {
  const inn = bag({ kjelde: id })
  const t0 = performance.now()
  const ut = MOTOR.finn(inn)
  const ms = performance.now() - t0
  const plan = lesPlan(ut.p.plan)
  const { bygg, brot } = harde(ut.p)
  tal.set(id, plan.length)
  const familiar = new Set(plan.map((q) => q.n.join(",")))
  sjekk(
    id,
    ut.plan === plan.length && plan.length >= 2 && plan.length <= 2 * FINN_TAK && familiar.size === 2 && ut.proevde >= 60 && brot.length === 0 && bygg.s.ledd >= plan.length - 1,
    `${plan.length} plan · ${bygg.dl.delar.length} delar · ${bygg.s.ledd} ledd · ${ut.proevde} prøvde · ${ms.toFixed(0)} ms${brot.length ? " · " + brot.map((r) => `${r.label}: ${r.value}`).join("; ") : ""}`,
  )
  sjekk(`  ${id}: strengen er rein og den same kvar gong`, reinPlan(ut.p.plan) === ut.p.plan && MOTOR.finn(inn).p.plan === ut.p.plan)
}

console.log("\n=== forma avgjer talet ===")
sjekk("ein kube er to plan i kross", tal.get("kube") === 2, `${tal.get("kube")} plan`)
sjekk("eit dyr tek fleire enn kuben", (tal.get("dyr-01") ?? 0) > 2 && (tal.get("sau-03") ?? 0) > 2, `dyr-01 ${tal.get("dyr-01")} · sau-03 ${tal.get("sau-03")}`)
{
  const p = bag({ kjelde: "dyr-01" }) as unknown as Params
  const { rekkje, proevde } = finnSett(makeKropp(p), p)
  const best = rekkje[0]
  const fleire = rekkje.filter((s) => s.a.length + s.b.length > best.a.length + best.b.length)
  const faerre = rekkje.filter((s) => s.a.length + s.b.length < best.a.length + best.b.length)
  sjekk("kring hundre sett er prøvde, og fleire", proevde >= 100 && rekkje.length >= 50, `${proevde} prøvde · ${rekkje.length} gyldige`)
  sjekk(
    "eit større sett var ikkje verdt prisen",
    fleire.length > 0 && fleire.every((s) => s.treff - best.treff <= FINN_PRIS * (s.a.length + s.b.length - best.a.length - best.b.length) + 1e-9 + (s.vinkel ? 1 : 0)),
    `${fleire.length} større · beste treff ${Math.max(...fleire.map((s) => s.treff)).toFixed(3)} mot ${best.treff.toFixed(3)}`,
  )
  sjekk(
    "og eit mindre sa for lite",
    faerre.length > 0 && faerre.every((s) => s.skaar <= best.skaar),
    `${faerre.length} mindre · beste treff ${Math.max(...faerre.map((s) => s.treff)).toFixed(3)}`,
  )
  sjekk("treffet er eit tal mellom null og éin", rekkje.every((s) => s.treff > 0 && s.treff <= 1 && s.volum <= 1 && s.syn <= 1))
}

console.log("\n=== det som står frå før ===")
{
  const teikna: Plan = { id: 3, o: [0.5, 0.5, 0.5], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]] }
  const skoren: Plan = { id: 9, o: [0.3, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [] }
  const inn = bag({ kjelde: "dyr-01", plan: skrivPlan([teikna, skoren]), fest: "3:0,0,10,10;9:0,0,40,40" })
  const ut = MOTOR.finn(inn)
  const plan = lesPlan(ut.p.plan)
  const nye = plan.filter((q) => q.id !== 3)
  const fest = lesFest(ut.p.fest)
  sjekk("ei teikna flate står", plan.some((q) => q.id === 3 && q.omriss?.length === 4))
  sjekk("eit plan skore i kroppen vert bytt ut", !plan.some((q) => q.id === 9) && nye.length === ut.plan && nye.length >= 2, `${nye.length} nye`)
  sjekk("ingen nummer vert brukte om att", nye.every((q) => q.id > 9), nye.map((q) => q.id).join(","))
  sjekk("festet fylgjer delen ut, og berre han", fest.has("3") && !fest.has("9"), [...fest.keys()].join(","))
  sjekk("resten av posen er urørt", Object.keys(inn).every((n) => n === "plan" || n === "fest" || inn[n] === ut.p[n]))
}

console.log("\n=== vrange kroppar ===")
{
  const boks = (x: number, y: number, z: number) => {
    const h: [number, number, number][] = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]]
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
    return makeSoup(new Float32Array(f.flatMap((t) => t.flatMap((i) => h[i]))))
  }
  put("plate", "plate", boks(200, 120, 3))
  put("pinne", "pinne", boks(4, 4, 300))
  for (const id of ["plate", "pinne", ...TYNNE]) {
    let ut: ReturnType<typeof MOTOR.finn> | null = null
    let kast = ""
    const inn = bag({ kjelde: id, plan: "1@0.5,0.5,0.5/1,0,0" })
    try { ut = MOTOR.finn(inn) } catch (e) { kast = String(e).slice(0, 80) }
    sjekk(`${id}: eit sett som held, eller ingenting`, !!ut && (ut.plan === 0 ? ut.p.plan === inn.plan : harde(ut.p).brot.length === 0), kast || `${ut?.plan} plan`)
  }
}

console.log(feil ? `\n${feil} FEIL` : "\nsøket held")
process.exit(feil ? 1 : 0)
