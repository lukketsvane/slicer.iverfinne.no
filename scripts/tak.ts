import { MOTOR } from "../lib/motor"
import { kjeldeNull, kjeldeTal, makeKropp, vendNull, vendTal } from "../lib/kropp"
import { put } from "../lib/sources"
import { makeSoup } from "../lib/soup"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { PLAN_TAK, lesPlan, rutenett, skrivPlan, type Plan } from "../lib/plan"
import type { ParamBag } from "../lib/core"
import { DETAIL, buildSnitt } from "../lib/snitt"

let brot = 0
const bryt = (kva: string) => {
  brot++
  console.log(`  FEIL ${kva}`)
}
const ok = (namn: string, sant: boolean, kva = "") => {
  if (sant) console.log(`  ok   ${namn.padEnd(46)} ${kva}`)
  else bryt(`${namn.padEnd(46)} ${kva}`)
}

function kuleSuppe(r: number, seg: number): Float32Array {
  const p: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r + r * Math.cos(ph)]
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      p.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  }
  return new Float32Array(p)
}
put("t-kule", "kule", makeSoup(kuleSuppe(50, 48)))

const GRUNN = { ...DEFAULT_PARAMS, kjelde: "t-kule", storleik: 200 } as Params

function maal(plan: string, frø = 0): { ms: number; delar: number; ledd: number; plan: number } {
  const bag = { ...GRUNN, storleik: 200 + frø, plan } as unknown as ParamBag
  const t0 = Date.now()
  const m = MOTOR.measure(bag)
  return { ms: Date.now() - t0, delar: m.parts, ledd: m.joints, plan: lesPlan(plan).length }
}

MOTOR.measure({ ...GRUNN, plan: skrivPlan(rutenett(1, 1)) } as unknown as ParamBag)

console.log("taket på plana, målt på ei kule på 200 mm:\n")
console.log(
  "  " +
    "plan".padStart(5) +
    "rutenett".padStart(11) +
    "parallelle".padStart(12) +
    "ledd".padStart(7) +
    "ms/plan".padStart(9) +
    "ms/ledd".padStart(9),
)

const TAL = [8, 16, 32, 48, PLAN_TAK] as const
const rader: { n: number; rute: number; para: number; ledd: number; perPlan: number; perLedd: number }[] = []

for (const n of TAL) {
  const rute = maal(skrivPlan(rutenett(n / 2, n / 2)))
  const para = maal(skrivPlan(rutenett(n, 0)))
  if (rute.plan !== n || para.plan !== n) {
    bryt(`${n} plan vart ${rute.plan} og ${para.plan} — rutenettet gjev ikkje talet det skal`)
    continue
  }
  if (para.ledd !== 0) bryt(`${n} parallelle plan gav ${para.ledd} ledd — dei kryssar ikkje kvarandre`)
  const perPlan = para.ms / n
  const perLedd = rute.ledd ? Math.max(0, rute.ms - para.ms) / rute.ledd : 0
  rader.push({ n, rute: rute.ms, para: para.ms, ledd: rute.ledd, perPlan, perLedd })
  console.log(
    "  " +
      String(n).padStart(5) +
      `${rute.ms} ms`.padStart(11) +
      `${para.ms} ms`.padStart(12) +
      String(rute.ledd).padStart(7) +
      perPlan.toFixed(1).padStart(9) +
      perLedd.toFixed(2).padStart(9),
  )
}

console.log("")

const MS_PER_PLAN = 60
const MS_PER_LEDD = 6

const siste = rader[rader.length - 1]
if (!siste) bryt("ingen rader vart målte")
else {
  ok(`snittinga held seg under ${MS_PER_PLAN} ms per plan`, siste.perPlan < MS_PER_PLAN, `${siste.perPlan.toFixed(1)} ms ved ${siste.n} plan`)
  ok(`leddarbeidet held seg under ${MS_PER_LEDD} ms per ledd`, siste.perLedd < MS_PER_LEDD, `${siste.perLedd.toFixed(2)} ms ved ${siste.ledd} ledd`)
}

const halv = rader.find((r) => r.n === 32)
if (halv && siste && halv !== siste && siste.n === halv.n * 2) {
  let dobling = siste.para / Math.max(1, halv.para)
  const alle = [dobling]
  for (const frø of [1, 2]) {
    const a = maal(skrivPlan(rutenett(32, 0)), frø)
    const b = maal(skrivPlan(rutenett(PLAN_TAK, 0)), frø)
    const d = b.ms / Math.max(1, a.ms)
    alle.push(d)
    dobling = Math.min(dobling, d)
  }
  ok(
    "snittinga er lineær: dobbelt so mange plan kostar dobbelt",
    dobling < 2.3,
    `beste av ${alle.map((d) => `×${d.toFixed(2)}`).join(" ")} — lineært er 2,00`,
  )
}

{
  const full = maal(skrivPlan(rutenett(PLAN_TAK / 2, PLAN_TAK / 2)))
  ok(`taket på ${PLAN_TAK} plan er nåbart`, full.delar > 0 && full.ledd > 0, `${full.delar} delar, ${full.ledd} ledd`)
  const bag = { ...GRUNN, plan: skrivPlan(rutenett(PLAN_TAK / 2, PLAN_TAK / 2)) } as unknown as ParamBag
  const ark = MOTOR.exportFile(bag, "ark")
  ok("og kuttfila kjem ut av det", (ark.data?.byteLength ?? ark.text?.length ?? 0) > 0, `${ark.name}`)
}

const vifte = (n: number, r: number, vidd: readonly [number, number], fraa = 1): Plan[] => {
  const W = Math.max(1e-6, vidd[0])
  const D = Math.max(1e-6, vidd[1])
  const d = r * Math.min(W, D)
  const ut: Plan[] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const nv: [number, number, number] = [+Math.cos(a).toFixed(4), +Math.sin(a).toFixed(4), 0]
    ut.push({
      id: fraa + i,
      o: [+(0.5 + (d * nv[0]) / W).toFixed(4), +(0.5 + (d * nv[1]) / D).toFixed(4), 0.5],
      n: nv, bog: 0, strek: [], gruppe: 1,
    })
  }
  return ut
}

{
  const vifteMaal = (n: number) => maal(skrivPlan(vifte(n, 0.25, [1, 1])))
  const lite = vifteMaal(8)
  const stort = vifteMaal(32)
  const perLite = lite.ms / Math.max(1, lite.plan)
  const perStort = stort.ms / Math.max(1, stort.plan)
  console.log(
    `\n  vifte: ${lite.plan} plan ${lite.ms} ms (${perLite.toFixed(1)} ms/plan) · ` +
      `${stort.plan} ribber ${stort.ms} ms (${perStort.toFixed(1)} ms/plan)`,
  )
  const plan32 = skrivPlan(vifte(32, 0.25, [1, 1]))
  MOTOR.measure({ ...GRUNN, plan: plan32 } as unknown as ParamBag)
  vendNull()
  MOTOR.measure({ ...GRUNN, plan: plan32, tjukn: 3.5 } as unknown as ParamBag)
  const t = vendTal()
  ok(
    "eit drag i tjukna snur ikkje nettet på nytt",
    t.bom === 0 && t.treff > 0,
    `${t.treff} treff · ${t.bom} bom på 32 ribber`,
  )
}

{
  console.log("\n=== ein gest på ein bit ===")
  const plan = skrivPlan(rutenett(3, 3))
  const scene = (rz: number) =>
    [`t-kule@-60,0,0/1/0`, `t-kule@60,0,0/1/${rz.toFixed(1)}`, `kube@0,0,0/0.6/0`].join(";")
  const frame = (rz: number) => {
    const p = { ...GRUNN, plan, scene: scene(rz) } as unknown as ParamBag
    const t0 = Date.now()
    MOTOR.build(p, "lav", "flate")
    MOTOR.build(p, "lav", "lag")
    return Date.now() - t0
  }
  frame(0)
  frame(1)
  kjeldeNull()
  const tider: number[] = []
  for (let i = 2; i <= 7; i++) tider.push(frame(i * 3))
  const k = kjeldeTal()
  ok(
    "eit drag på ein bit sveisar ikkje kjeldene om att",
    k.bom === 0 && k.treff > 0,
    `${k.treff} treff · ${k.bom} bom over ${tider.length} bilete`,
  )
  console.log(`  gest: ${Math.min(...tider)}–${Math.max(...tider)} ms per bilete, tre bitar`)
}

{
  console.log("\n=== bogar ved taket ===")
  const sirkel = (n: number, r = 0.35) =>
    Array.from({ length: n }, (_, i) => [+(r * Math.cos((2 * Math.PI * i) / n)).toFixed(4), +(r * Math.sin((2 * Math.PI * i) / n)).toFixed(4)] as [number, number])
  const om = sirkel(24)
  const lag = (bogar: boolean) =>
    Array.from({ length: 32 }, (_, i) => ({
      id: i + 1,
      o: [0.5, 0.05 + (0.9 * i) / 31, 0.5],
      n: [0, 1, 0],
      bog: 0,
      strek: [],
      omriss: om,
      ...(bogar ? { runde: om.map((_, k) => k) } : {}),
    }))
  const kost = (bogar: boolean) => {
    const bag = { ...GRUNN, storleik: 200, plan: skrivPlan(lag(bogar) as never) } as unknown as ParamBag
    const t0 = Date.now()
    const n = MOTOR.liste(bag).length
    return { ms: Date.now() - t0, n }
  }
  const utan = kost(false)
  const med = kost(true)
  ok(
    "32 omriss med boge på kvart punkt kostar under det doble av ingen bogar",
    med.n === utan.n && med.ms < utan.ms * 2,
    `${utan.ms} ms utan → ${med.ms} ms med (${(med.ms / Math.max(1, utan.ms)).toFixed(2)}×), ${med.n} delar`,
  )
}

{
  console.log("\n=== rilla ved taket ===")
  const plan = skrivPlan(
    lesPlan(skrivPlan(rutenett(6, 6))).map((q) => (q.n[0] === 1 ? { ...q, bog: 1.2 } : q)),
  )
  const snitt = (material: string) => {
    const p = { ...GRUNN, storleik: 300, tjukn: 3, material, plan } as unknown as Params
    return buildSnitt(makeKropp(p), p, DETAIL.mid)
  }
  const utan = snitt("papp").ribber.reduce((a, q) => a + q.rille.length, 0)
  const rilla = snitt("finer")
  const med = rilla.ribber.reduce((a, q) => a + q.rille.length, 0)
  const TAK_SNITT = 2400
  ok(
    `eit rilla snitt legg under ${TAK_SNITT} snittliner, og eit urilla ingen`,
    utan === 0 && med > 0 && med < TAK_SNITT,
    `papp ${utan} · finér ${med} snittliner over ${rilla.ribber.filter((q) => q.r.k).length} bøygde ribber`,
  )
  const ribbe = rilla.ribber.find((q) => q.r.k && q.rille.length)
  const us = [...new Set((ribbe?.rille ?? []).map((l) => +l[0][0].toFixed(3)))].sort((a, b) => a - b)
  const verst = us.slice(1).reduce((m, v, i) => {
    const n = (v - us[i]) / 3
    return Math.max(m, Math.abs(n - Math.round(n)))
  }, 0)
  ok(
    "og radene ligg eit heilt tal steg frå kvarandre, heile vegen rundt bogen",
    us.length > 10 && verst < 0.01,
    `${us.length} rader i ei ribbe, verste avvik frå eit heilt steg på 3,0 mm: ${(verst * 3).toFixed(4)} mm`,
  )
}

{
  console.log("\n=== montasjen ved taket ===")
  const plan = skrivPlan(rutenett(PLAN_TAK / 2, PLAN_TAK / 2))
  const bag = { ...GRUNN, plan } as unknown as ParamBag
  MOTOR.liste(bag)
  const t0 = Date.now()
  const m = MOTOR.montasje(bag)
  const ms = Date.now() - t0
  ok(
    `${PLAN_TAK} plan: montasjen kjem på under eit halvt sekund`,
    ms < 500 && m.delar.length > 0,
    `${ms} ms, ${m.delar.length} delar, ${m.steg} steg`,
  )
}

console.log(brot ? `\n${brot} brot på taket` : "\ntaket held")
process.exit(brot ? 1 : 0)
