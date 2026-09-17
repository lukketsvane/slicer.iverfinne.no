import { clampParams, DEFAULT_PARAMS, reinFest, reinDeling, skrivDeling, leddNokkel, type Params } from "../lib/params"
import { delAv, dreiing, lesPlan, nyGruppe, nyId, omrissLine, ramme, reinPlan, rutenett, sameSnitt, skilRute, skuvKopi, spegla, speglingar, skrivPlan, slaaSaman, snappPunkt, ut, vriOm, MJUK_TAK, PLAN_ROM, OMRISS_TAK, PLAN_TAK, STREK_TAK, type Plan } from "../lib/plan"
import { reinScene, SCENE_TAK } from "../lib/scene"
import { speglPlan } from "../lib/spegl"
import { apply, pack, type Fest } from "../lib/pack"
import { MOTOR } from "../lib/motor"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { bbox, nn, type ParamBag, type Pt, type Vec3 } from "../lib/core"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))
const sirkel = (n: number, r = 0.3) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI) / 20
    return `${+(Math.cos(a) * r).toFixed(4)},${+(Math.sin(a) * r).toFixed(4)}`
  }).join(",")

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(44), sagt)
  if (!ok) feil++
}

for (const [inn, vent] of [
  ["1@0.5,0.5,0.5/1,0,0", "1@0.5,0.5,0.5/1,0,0"],
  ["3@0.25,0.5,0.5/0,1,0;7@0.5,0.5,0.5/0,0,1", "3@0.25,0.5,0.5/0,1,0;7@0.5,0.5,0.5/0,0,1"],
  ["1@0.5,0.5,0.5/2,0,0", "1@0.5,0.5,0.5/1,0,0"],                 // normalen vert einingslang
  ["1@0.5,0.5,0.5/0,0,0", ""],                                     // inga retning
  ["1@0.5,0.5,0.5/1,0,0;1@0.5,0.5,0.5/0,1,0", "1@0.5,0.5,0.5/1,0,0"], // same namn to gonger
  ["0@0.5,0.5,0.5/1,0,0", ""],                                     // null er ikkje eit namn
  ["1@9,0.5,0.5/1,0,0", ""],                                       // langt utanfor kroppen
  ["1@NaN,0.5,0.5/1,0,0", ""],
  ["1@0.5,0.5,0.5", ""],                                           // ingen normal
  ["1@0.5,0.5,0.5/1,0,0/-o:0,0,0.1,0.1,0", "1@0.5,0.5,0.5/1,0,0/-o:0,0,0.1,0.1,0"],
  ["1@0.5,0.5,0.5/1,0,0/+r:0,0,0,0.1,0", "1@0.5,0.5,0.5/1,0,0"],  // strek utan breidd
  ["1@0.5,0.5,0.5/1,0,0/tull", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/g:3", "1@0.5,0.5,0.5/1,0,0/g:3"],
  ["1@0.5,0.5,0.5/1,0,0/b:0.5/g:2/-o:0,0,0.1,0.1,0", "1@0.5,0.5,0.5/1,0,0/b:0.5/g:2/-o:0,0,0.1,0.1,0"],
  ["1@0.5,0.5,0.5/1,0,0/g:0", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/g:x", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/c:3", "1@0.5,0.5,0.5/1,0,0/c:3"],
  ["1@0.5,0.5,0.5/1,0,0/g:2/c:29/-o:0,0,0.1,0.1,0", "1@0.5,0.5,0.5/1,0,0/g:2/c:29/-o:0,0,0.1,0.1,0"],
  ["1@0.5,0.5,0.5/1,0,0/c:1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/c:0", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/c:30", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/f:1", "1@0.5,0.5,0.5/1,0,0/f:1"],
  ["1@0.5,0.5,0.5/1,0,0/m:0.01", "1@0.5,0.5,0.5/1,0,0/m:0.01"],
  ["1@0.5,0.5,0.5/1,0,0/f:1/m:0.005/g:2", "1@0.5,0.5,0.5/1,0,0/f:1/m:0.005/g:2"],
  ["1@0.5,0.5,0.5/1,0,0/m:9", `1@0.5,0.5,0.5/1,0,0/m:${MJUK_TAK}`],
  ["1@0.5,0.5,0.5/1,0,0/m:0", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/m:-0.01", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/f:2", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2"],
  ["1@0.5,0.5,0.5/1,0,0/m:0.01/p:-0.2,-0.2,0.2,-0.2,0,0.2/g:2", "1@0.5,0.5,0.5/1,0,0/m:0.01/p:-0.2,-0.2,0.2,-0.2,0,0.2/g:2"],
  ["1@0.5,0.5,0.5/1,0,0/n:1/p:-0.2,-0.2,0.2,-0.2,0,0.2", "1@0.5,0.5,0.5/1,0,0/n:1/p:-0.2,-0.2,0.2,-0.2,0,0.2"],
  ["1@0.5,0.5,0.5/1,0,0/n:1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/n:2/p:-0.2,-0.2,0.2,-0.2,0,0.2", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0,0.2"],
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,1,0", "1@0.5,0.5,0.5/1,0,0"],        // to punkt er inga flate
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,1,0,1", "1@0.5,0.5,0.5/1,0,0"],      // oddetal er ikkje punkt
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,0,0,0,0", "1@0.5,0.5,0.5/1,0,0"],    // tre punkt oppå kvarandre har inga flate
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,0.1,0,0.2,0", "1@0.5,0.5,0.5/1,0,0"], // tre punkt på ei line òg
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,9,0,0,9", "1@0.5,0.5,0.5/1,0,0"],    // langt utanfor kroppen
  ["1@0.5,0.5,0.5/1,0,0/p:0,0,x,0,0,1", "1@0.5,0.5,0.5/1,0,0"],
  [`1@0.5,0.5,0.5/1,0,0/p:${sirkel(OMRISS_TAK + 16, 0.3)}`, `1@0.5,0.5,0.5/1,0,0/p:${sirkel(OMRISS_TAK)}`],
  ["1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:0,2", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:0,2"],
  ["1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:2,0,2", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:0,2"],
  ["1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:9", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2"],
  ["1@0.5,0.5,0.5/1,0,0/r:0,1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2/r:x", "1@0.5,0.5,0.5/1,0,0/p:-0.2,-0.2,0.2,-0.2,0.2,0.2,-0.2,0.2"],
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0.1_0.1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0.1_0.1/-o:0,0,0.1,0.1,0", "1@0.5,0.5,0.5/1,0,0/-o:0,0,0.1,0.1,0"],
  ["<script>", ""],
  [Array.from({ length: 200 }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";"),
   Array.from({ length: PLAN_TAK }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";")],
] as const) {
  const fekk = reinPlan(inn)
  sjekk(`rein «${String(inn).slice(0, 26)}»`, fekk === vent, fekk.slice(0, 40))
  sjekk(`  og han er eit fastpunkt`, reinPlan(fekk) === fekk, reinPlan(fekk).slice(0, 40))
}

{
  const r22 = rutenett(2, 2)
  sjekk("rutenettet er to grupper: tvers og langs", r22.map((p) => p.gruppe).join() === "1,1,2,2", r22.map((p) => p.gruppe).join())
  sjekk("berre rader er éi gruppe", rutenett(0, 3).every((p) => p.gruppe === 1))
  sjekk("og gruppa overlever strengen", lesPlan(skrivPlan(r22)).map((p) => p.gruppe).join() === "1,1,2,2")
  const rad = rutenett(0, 4)
  const del = (leiar: number, fordel: boolean) => [...delAv(rad, leiar, fordel).values()].map((v) => nn(v, 2)).join(" ")
  sjekk("saman: alle tek alt", del(4, false) === "1,00 1,00 1,00 1,00", del(4, false))
  sjekk("fordelt frå den siste: fyrste står, leiaren tek alt", del(4, true) === "0,00 0,33 0,67 1,00", del(4, true))
  sjekk("fordelt frå den fyrste: den andre enden står", del(1, true) === "1,00 0,67 0,33 0,00", del(1, true))
  sjekk("leiaren midt i: dei forbi tek meir enn alt", del(2, true) === "0,00 1,00 2,00 3,00", del(2, true))
  const d = dreiing([1, 0, 0], [0, 1, 0])
  const v = vriOm([1, 0, 0], d.akse, d.ang)
  sjekk("dreiinga frå x til y er ein kvart om z", Math.abs(d.ang - Math.PI / 2) < 1e-9 && d.akse[2] === 1 && Math.hypot(v[0], v[1] - 1, v[2]) < 1e-9, `${nn(d.ang, 3)} om ${d.akse.join()}`)
  sjekk("same normal er inga dreiing", dreiing([0, 0, 1], [0, 0, 1]).ang === 0)
  sjekk("motsett normal er ein halv", Math.abs(dreiing([0, 0, 1], [0, 0, -1]).ang - Math.PI) < 1e-9)
}

{
  const mange = Array.from({ length: 25 }, () => "-o:0,0,0.1,0.1,0").join("/")
  const fekk = lesPlan(`1@0.5,0.5,0.5/1,0,0/${mange}`)
  sjekk("fem og tjue strek på eitt plan vert fire og tjue", fekk[0]?.strek.length === STREK_TAK, `${fekk[0]?.strek.length}`)
}

console.log("")
for (const [inn, vent] of [
  ["kube@0,0,0/1/0", "kube@0,0,0/1/0"],
  ["kule@10,-20,30/0.5/45;torus@0,0,0/1/0", "kule@10,-20,30/0.5/45;torus@0,0,0/1/0"],
  ["kube@0,0,0/1/400", "kube@0,0,0/1/40"],           // vendinga går rundt
  ["kube@0,0,0/9/0", ""],                            // for stor
  ["kube@999,0,0/1/0", ""],                          // for langt ute
  ["kube@NaN,0,0/1/0", ""],
  ["../x@0,0,0/1/0", ""],
  ["<b>@0,0,0/1/0", ""],
  [Array.from({ length: 40 }, () => "kube@0,0,0/1/0").join(";"), Array.from({ length: SCENE_TAK }, () => "kube@0,0,0/1/0").join(";")],
] as const) {
  const fekk = reinScene(inn)
  sjekk(`scene «${String(inn).slice(0, 24)}»`, fekk === vent, fekk.slice(0, 40))
}
console.log("\nstorleiken per akse:")
for (const [inn, vent] of [
  ["kube@0,0,0/1/0", "kube@0,0,0/1/0"],                       // eitt tal står som eitt
  ["kube@0,0,0/1,1,1/0", "kube@0,0,0/1/0"],                   // tre like vert eitt
  ["kube@0,0,0/2,0.5,1/0", "kube@0,0,0/2,0.5,1/0"],           // tre ulike står
  ["kube@0,0,0/2,0.5/0", ""],                                 // to er ikkje eit tal og ikkje tre
  ["kube@0,0,0/2,0.5,99/0", ""],                              // ein akse over taket tek heile biten
  ["kube@0,0,0/2,0.01,1/0", ""],                              // og ein under botnen
  ["kube@0,0,0/2,0.5,1,3/0", ""],
] as const) {
  const fekk = reinScene(inn)
  sjekk(`storleik «${String(inn).slice(5, 24)}»`, fekk === vent, fekk)
}
{
  const bag = (scene: string) => ({ ...DEFAULT_PARAMS, scene, storleik: 300, plan: nett(2, 2) }) as unknown as ParamBag
  const a = MOTOR.measure(bag("kube@0,0,0/1/0"))
  const b = MOTOR.measure(bag("kube@0,0,0/2,1,1/0"))
  const fyrr = a.envX / a.envY
  const etter = b.envX / b.envY
  sjekk("ein akse dregen for seg endrar forholdet", Math.abs(fyrr - 1) < 0.02 && Math.abs(etter - 2) < 0.05, `${fyrr.toFixed(2)} → ${etter.toFixed(2)}`)
  sjekk("og dei to andre står i forhold til kvarandre", Math.abs(b.envY - b.envZ) < 0.5, `${nn(b.envY, 1)} × ${nn(b.envZ, 1)}`)
}

const sc = clampParams({ ...DEFAULT_PARAMS, scene: "kule@0,0,0/1/0;tull" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar scena", sc.scene === "kule@0,0,0/1/0", sc.scene)

const q = clampParams({ ...DEFAULT_PARAMS, plan: "1@0.5,0.5,0.5/1,0,0;x" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar plan", q.plan === "1@0.5,0.5,0.5/1,0,0", q.plan)
const r = clampParams({ storleik: 200 }, { ...DEFAULT_PARAMS, plan: "1@0.5,0.5,0.5/1,0,0" })
sjekk("plan overlever ein annan endring", r.plan === "1@0.5,0.5,0.5/1,0,0", r.plan)

console.log("")
{
  const alle = lesPlan(nett(6, 6))
  sjekk("rutenettet 6×6 er tolv plan med tolv namn", alle.length === 12 && new Set(alle.map((p) => p.id)).size === 12)
  const flytt = alle.map((p) => (p.id === 2 ? { ...p, o: [0.35, 0.5, 0.5] as [number, number, number] } : p))
  sjekk(
    "flytt plan 2 til 0,35: dei elleve andre står stille",
    flytt.length === 12 && alle.every((p, i) => p.id === 2 || skrivPlan([p]) === skrivPlan([flytt[i]])),
  )
  sjekk("og plan 2 står der du sette det", flytt.find((p) => p.id === 2)?.o[0] === 0.35)
  const sletta = alle.filter((p) => p.id !== 4)
  sjekk("slett plan 4: dei elleve andre står, og namna deira", sletta.length === 11 && !sletta.some((p) => p.id === 4) && sletta.every((p) => alle.some((a) => a.id === p.id)))
  sjekk("eit nytt plan får eit namn ingen har hatt", nyId(alle) === 13 && nyId(sletta) === 13)
  const vinkla = alle.map((p) => (p.id === 7 ? { ...p, n: [0, 0.7071, 0.7071] as [number, number, number] } : p))
  const m1 = MOTOR.measure({ ...DEFAULT_PARAMS, plan: skrivPlan(alle) } as unknown as ParamBag)
  const m2 = MOTOR.measure({ ...DEFAULT_PARAMS, plan: skrivPlan(vinkla) } as unknown as ParamBag)
  sjekk("vinkle om eitt plan: dei andre elleve delane er dei same", m2.parts >= 12 && m2.joints > 0 && m1.joints === 36, `${m2.parts} delar, ${m2.joints} ledd`)
}

console.log("")
{
  const bag = { ...DEFAULT_PARAMS, plan: nett(7, 5) } as unknown as ParamBag
  const liste = MOTOR.liste(bag)
  const plan = lesPlan(String(bag.plan))
  sjekk("kuttlista ber planet kvar del høyrer til", liste.length === 12 && liste.every((k) => plan.some((p) => p.id === k.plan)))
  sjekk("og adressa er namnet på planet", liste.every((k) => new RegExp(`^${k.plan}[a-z]*$`).test(k.adr)))
}

console.log("")
{
  const grunn = lesPlan(nett(6, 6))
  const medOp = (strek: object[], op: Partial<Plan> = {}) => {
    const l = grunn.map((q) => (q.id === 3 ? { ...q, strek: strek as never, ...op } : q))
    const bag = { ...DEFAULT_PARAMS, plan: skrivPlan(l) } as unknown as ParamBag
    const m = MOTOR.measure(bag)
    return { delar: m.parts, flate: m.plyArea, ledd: m.joints, nodar: m.nodes, kutt: m.cutLen }
  }
  const med = (strek: object[]) => medOp(strek)
  const utan = med([])
  const gods = med([{ slag: "gods", form: "rekt", x: 0.55, y: 0.1, w: 0.2, h: 0.1, a: 20 }])
  const hol = med([{ slag: "hol", form: "rund", x: 0, y: -0.3, w: 0.15, h: 0.15, a: 0 }])
  sjekk("gods over kanten legg til flate, og delar ikkje plata", gods.delar === utan.delar && gods.flate > utan.flate && gods.ledd === utan.ledd, `${utan.delar}→${gods.delar} delar, ${Math.round(utan.flate)}→${Math.round(gods.flate)} mm², ${gods.ledd} ledd`)
  sjekk("eit hòl tek flate og legg til ein ring", hol.delar === utan.delar && hol.flate < utan.flate && hol.nodar > utan.nodar, `${Math.round(utan.flate)}→${Math.round(hol.flate)} mm²`)

  const tvers = med([{ slag: "hol", form: "rekt", x: 0, y: -0.15, w: 1.2, h: 0.04, a: 0 }])
  sjekk(
    "eit strek tvers over plata deler henne",
    tvers.delar > utan.delar && tvers.flate < utan.flate,
    `${utan.delar}→${tvers.delar} delar, ${Math.round(utan.flate)}→${Math.round(tvers.flate)} mm²`,
  )
  const kort = med([{ slag: "hol", form: "rekt", x: 0, y: 0, w: 0.2, h: 0.04, a: 0 }])
  sjekk(
    "og eit strek inni ho tek berre flate",
    kort.delar === utan.delar && kort.flate < utan.flate,
    `${utan.delar}→${kort.delar} delar, ${Math.round(utan.flate)}→${Math.round(kort.flate)} mm²`,
  )
  const gStrek = med([{ slag: "gods", form: "rekt", x: 0.5, y: 0.1, w: 0.24, h: 0.06, a: 0 }])
  sjekk(
    "eit gods-strek over kanten legg til flate, og klipper ikkje plata",
    gStrek.delar === utan.delar && gStrek.flate > utan.flate,
    `${utan.delar}→${gStrek.delar} delar, ${Math.round(utan.flate)}→${Math.round(gStrek.flate)} mm²`,
  )
  const attfylt = med([
    { slag: "hol", form: "rekt", x: 0, y: 0, w: 0.2, h: 0.04, a: 0 },
    { slag: "gods", form: "rekt", x: 0, y: 0, w: 0.22, h: 0.06, a: 0 },
  ])
  sjekk("og eit gods etter eit hòl fyller det att", attfylt.flate > kort.flate, `${Math.round(kort.flate)}→${Math.round(attfylt.flate)} mm²`)

  const hakk = [{ slag: "hol", form: "rund", x: 0.42, y: 0, w: 0.3, h: 0.3, a: 0 }]
  const medHakk = med(hakk)
  const firk = medOp(hakk, { firkant: true })
  sjekk(
    "firkanten fyller hakket att: profilen er boksen kring seg sjølv",
    firk.flate > medHakk.flate && firk.delar === medHakk.delar,
    `${Math.round(medHakk.flate)}→${Math.round(firk.flate)} mm², ${firk.delar} delar`,
  )
  const mj = medOp([], { mjuk: 0.01 })
  sjekk(
    "mjukinga rundar hjørna: mindre flate, kortare kutt, dei same ledda",
    mj.flate < utan.flate && mj.kutt < utan.kutt && mj.ledd === utan.ledd,
    `${Math.round(utan.flate)}→${Math.round(mj.flate)} mm², ${Math.round(utan.kutt)}→${Math.round(mj.kutt)} mm, ${mj.ledd} ledd`,
  )

  const kvadrat = (r: number): Pt[] => [[-r, -r], [r, -r], [r, r], [-r, r]]
  const eitt = (op: Partial<Plan> = {}) => {
    const bag = { ...DEFAULT_PARAMS, plan: skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [], ...op } as Plan]) } as unknown as ParamBag
    const m = MOTOR.measure(bag)
    return { delar: m.parts, flate: m.plyArea, nodar: m.nodes }
  }
  const nett1 = eitt()
  const om = eitt({ omriss: kvadrat(0.1) })
  sjekk(
    "omrisset er profilen: flata er den mangekanten seier, ikkje den nettet seier",
    om.delar === 1 && Math.abs(om.flate - 900) < 30,
    `${Math.round(nett1.flate)} mm² frå nettet → ${Math.round(om.flate)} av 900, ${om.delar} del`,
  )
  sjekk(
    "og det kan gjere forma MINDRE — det eit merke som vart lagt til som gods aldri kunne",
    om.flate < nett1.flate * 0.2,
    `${Math.round(nett1.flate)}→${Math.round(om.flate)} mm²`,
  )

  const stort = medOp([], { omriss: kvadrat(0.4) })
  sjekk(
    "ei ribbe med omriss har framleis ledd med naboane sine",
    stort.ledd > 0 && stort.delar === utan.delar,
    `${stort.ledd} ledd, ${stort.delar} delar`,
  )
  const skore = medOp([{ slag: "hol", form: "rund", x: 0, y: 0, w: 0.06, h: 0.06, a: 0 }], { omriss: kvadrat(0.4) })
  sjekk(
    "og eit strek vert framleis skore i det",
    skore.flate < stort.flate && skore.nodar > stort.nodar,
    `${Math.round(stort.flate)}→${Math.round(skore.flate)} mm²`,
  )

  const rutene = kvadrat(0.1)
  const rein = omrissLine(rutene)
  sjekk(
    "utan bogar er lina nøyaktig punkta, uendra",
    JSON.stringify(rein) === JSON.stringify(rutene) && JSON.stringify(omrissLine(rutene, [])) === JSON.stringify(rutene),
    `${rein.length} punkt`,
  )
  const alleFire = omrissLine(rutene, [0, 1, 2, 3])
  sjekk(
    "og kurva går gjennom kvart einaste punkt handa sette",
    rutene.every((q) => alleFire.some((r) => Math.abs(r[0] - q[0]) < 1e-9 && Math.abs(r[1] - q[1]) < 1e-9)),
    `${rutene.length} punkt i ${alleFire.length}`,
  )
  const eittRundt = omrissLine(rutene, [0])
  const i1 = eittRundt.findIndex((q) => q[0] === rutene[1][0] && q[1] === rutene[1][1])
  const etter = eittRundt[(i1 + 1) % eittRundt.length]
  sjekk(
    "stykket mellom to hjørne er framleis ei rett line, utan eit punkt i mellom",
    i1 >= 0 && etter[0] === rutene[2][0] && etter[1] === rutene[2][1],
    `${eittRundt.length} punkt i alt, og punkt 2 kjem rett etter punkt 1`,
  )
  const bogen = eitt({ omriss: rutene, runde: [0, 1, 2, 3] })
  sjekk(
    "fire bogar bular firkanten ut til noko rundare: større flate",
    bogen.delar === 1 && bogen.flate > om.flate * 1.2,
    `${Math.round(om.flate)}→${Math.round(bogen.flate)} mm²`,
  )
}

for (const [inn, vent] of [
  ["1:0,0,12.5,340", "1:0,0,12.5,340"],
  ["3a:1,2,100,50", "3a:1,2,100,50"],
  ["1:9,0,0,0;1:0,0,5,5", "1:0,0,5,5"],           // siste vinn, fyrste er ugyldig plate
  ["1:0,4,0,0", ""],                              // kvartsving finst ikkje
  ["1:-1,0,0,0", ""],                             // negativ plate
  ["1:0,0,-5,0", ""],                             // utanfor plata
  ["1:0,0,99999,0", ""],                          // langt utanfor
  ["1:0,0,NaN,0", ""],
  ["tull", ""],
  ["<script>:0,0,0,0", ""],
] as const) {
  const fekk = reinFest(inn)
  sjekk(`fest «${String(inn).slice(0, 26)}»`, fekk === vent, fekk)
}

const f = clampParams({ ...DEFAULT_PARAMS, fest: "1:0,0,5,5;tull" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar fest", f.fest === "1:0,0,5,5", f.fest)

const rute = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]]
const bitar = ["a", "b", "c"].map((key) => ({ key, rings: [rute(100, 100)] }))
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

const iKvarandre = pack(bitar, 400, 400, 4, new Map<number, Fest>([
  [0, { sheet: 0, rot: 0, x: 100, y: 100 }],
  [1, { sheet: 0, rot: 0, x: 150, y: 120 }],
]))
sjekk("to feste i kvarandre vert talde", iKvarandre.kross === 1, `kross ${iKvarandre.kross}`)
sjekk(
  "og det er den andre som ber merket",
  iKvarandre.slots.filter((q) => q.kross).length === 1 &&
    !iKvarandre.slots.find((q) => q.piece === 0)?.kross,
  iKvarandre.slots.map((q) => `${q.piece}${q.kross ? "!" : ""}`).join(" "),
)
sjekk("og den frie tredje går utanom", iKvarandre.slots.length === 3 && med.kross === 0, `kross utan ${med.kross}`)

const langtUte = pack(bitar, 400, 400, 4, new Map<number, Fest>([[0, { sheet: 3, rot: 0, x: 50, y: 50 }]]))
sjekk(
  "eit feste på plate 4 lagar ikkje tomme plater",
  langtUte.sheets === 2 && langtUte.used.every((u) => u > 0) && langtUte.slots.find((q) => q.piece === 0)?.sheet === 1,
  `${langtUte.sheets} plater · festa på ${langtUte.slots.find((q) => q.piece === 0)?.sheet}`,
)
const toUte = pack(bitar, 400, 400, 4, new Map<number, Fest>([
  [0, { sheet: 3, rot: 0, x: 0, y: 0 }],
  [1, { sheet: 3, rot: 0, x: 250, y: 250 }],
  [2, { sheet: 1, rot: 0, x: 0, y: 0 }],
]))
const plateAv = (i: number) => toUte.slots.find((q) => q.piece === i)?.sheet
sjekk(
  "og to feste med same nummer held saman, i rekkjefylgje",
  toUte.sheets === 2 && plateAv(2) === 0 && plateAv(0) === 1 && plateAv(1) === 1,
  `${toUte.sheets} plater · 2@${plateAv(2)} 0@${plateAv(0)} 1@${plateAv(1)}`,
)

console.log("\nsymmetrien på snittet:")
{
  const o0: Vec3 = [0.25, 0.5, 0.5]
  const n0: Vec3 = [0.7071, 0, 0.7071]
  const x = spegla(o0, n0, 0)
  sjekk(
    "eit spegl om x flyttar punktet over midten og snur normalen",
    Math.abs(x.o[0] - 0.75) < 1e-6 && Math.abs(x.n[0] + 0.7071) < 1e-6 && Math.abs(x.n[2] - 0.7071) < 1e-6,
    `o ${x.o.join(",")} n ${x.n.join(",")}`,
  )
  const att = spegla(x.o, x.n, 0)
  sjekk("og to gonger er ingen gong", sameSnitt({ o: o0, n: n0 }, att), `o ${att.o.join(",")}`)
  const y = spegla(o0, n0, 1)
  sjekk("ein akse snittet alt står symmetrisk om gjev det same snittet", sameSnitt({ o: o0, n: n0 }, y))

  const m = { o: [0.5, 0.5, 0.5] as Vec3, n: [1, 0, 0] as Vec3 }
  sjekk("eit snitt gjennom midten speglar seg til seg sjølv", sameSnitt(m, spegla(m.o, m.n, 0)))

  sjekk("x og y gjev fire snitt, x åleine to, ingen brytar eitt",
    speglingar(3).length === 4 && speglingar(1).length === 2 && speglingar(0).length === 1,
    JSON.stringify(speglingar(3)))
  sjekk("og alle tre gjev åtte", speglingar(7).length === 8)

  const alle = (o: Vec3, n: Vec3, sp: number) => {
    const ut: { o: Vec3; n: Vec3 }[] = []
    for (const akser of speglingar(sp)) {
      let q = { o, n }
      for (const a of akser) q = spegla(q.o, q.n, a)
      if (!ut.some((r) => sameSnitt(r, q))) ut.push(q)
    }
    return ut
  }
  const skeivt = alle([0.25, 0.3, 0.5], [0.5774, 0.5774, 0.5774], 3)
  sjekk("eit snitt skeivt i begge aksar vert fire ulike med x og y", skeivt.length === 4, skeivt.map((q) => q.o.slice(0, 2).join(",")).join(" · "))
  const halvskeivt = alle(o0, n0, 3)
  sjekk("men eit som alt står symmetrisk om y vert to, ikkje fire", halvskeivt.length === 2, halvskeivt.map((q) => q.o.slice(0, 2).join(",")).join(" · "))
  sjekk("og alle tre aksane på eit heilt skeivt snitt gjev åtte", alle([0.25, 0.3, 0.35], [0.5774, 0.5774, 0.5774], 7).length === 8)
}

{
  const min: Vec3 = [-180, -140, -230]
  const max: Vec3 = [220, 160, 270]
  const S = 500
  const avstand = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]))
  for (const n of [[1, 0, 0], [0, 0, 1], [0.5774, 0.5774, 0.5774]] as Vec3[]) {
    for (const bog of [0, 0.4]) for (let akse = 0; akse < 3; akse++) {
      const p: Plan = { id: 9, o: [0.23, 0.37, 0.62], n, bog, farge: 6, gruppe: 2, mjuk: 0.01,
        omriss: [[-0.3, -0.4], [0.2, -0.35], [0.3, 0.22], [-0.14, 0.4]], runde: [1, 3],
        strek: [{ slag: "hol", form: "rund", x: 0.05, y: -0.08, w: 0.17, h: 0.09, a: 32 }] }
      const q = speglPlan(p, akse, min, max)
      const r0 = ramme(p, min, max)
      const r1 = ramme(q, min, max)
      const spegel = (v: Vec3): Vec3 => v.map((c, i) => i === akse ? min[i] + max[i] - c : c) as Vec3
      const linje0 = omrissLine(p.omriss!, p.runde)
      const linje1 = omrissLine(q.omriss!, q.runde)
      const feilOm = Math.max(...linje0.map((v, i) => avstand(spegel(ut(r0, [v[0] * S, v[1] * S])), ut(r1, [linje1[i][0] * S, linje1[i][1] * S]))))
      const hòl = (s: Plan["strek"][number], t: number): Pt => {
        const a = s.a * Math.PI / 180
        const x = s.w / 2 * Math.cos(t)
        const y = s.h / 2 * Math.sin(t)
        return [(s.x + x * Math.cos(a) - y * Math.sin(a)) * S, (s.y + x * Math.sin(a) + y * Math.cos(a)) * S]
      }
      const feilHol = Math.max(...[0, 0.6, 1.7, 3.1].map(t => avstand(spegel(ut(r0, hòl(p.strek[0], t))), ut(r1, hòl(q.strek[0], -t)))))
      sjekk(`spegl ${akse}, normal ${n.join(",")}, bøy ${bog}: heile profilen står rett`, feilOm < 0.0001 && feilHol < 0.0001, `${feilOm.toFixed(6)} / ${feilHol.toFixed(6)} mm`)
      sjekk("speglinga bevarer eigenskapar og to gonger gjev originalen", q.farge === p.farge && q.gruppe === p.gruppe && q.mjuk === p.mjuk && skrivPlan([speglPlan(q, akse, min, max)]) === skrivPlan([p]))
    }
  }
}

{
  const min: Vec3 = [-200, -100, -50], max: Vec3 = [200, 100, 50]
  const h = Math.SQRT1_2
  const tilfelle: [string, Vec3, Vec3, number][] = [
    ["midt i rommet", [0.5, 0.5, 0.5], [h, h, 0], 1],
    ["øvre x-grense", [1 + PLAN_ROM, 0.5, 0.5], [h, h, 0], -1],
    ["nedre x-grense", [-PLAN_ROM, 0.5, 0.5], [-h, h, 0], -1],
    ["nedre y-grense", [0.5, -PLAN_ROM, 0.5], [h, h, 0], 1],
  ]
  for (const [namn, o, n, forteikn] of tilfelle) {
    const p: Plan = { id: 1, o, n, bog: 0, strek: [] }
    const nyO = skuvKopi(p, min, max, 12)
    sjekk(`kopi ved ${namn} får plass`, nyO !== null)
    if (!nyO) continue
    const q = lesPlan(skrivPlan([{ ...p, id: 2, o: nyO }]))[0]
    sjekk(`kopi ved ${namn} overlever lagring`, !!q)
    if (!q) continue
    const feil = Math.hypot(...q.o.map((c, a) => (c - o[a]) * (max[a] - min[a]) - forteikn * 24 * n[a]))
    sjekk(`kopi ved ${namn} går 24 mm langs heile normalen`, feil < 0.024, `${feil.toFixed(5)} mm avvik`)
  }
  const fast = { o: [1 + PLAN_ROM, -PLAN_ROM, 0.5] as Vec3, n: [h, h, 0] as Vec3 }
  sjekk("motsette romgrenser lagar ingen tangentiell kopi", skuvKopi(fast, min, max, 12) === null)
  sjekk("ei for smal boks lagar ingen klemt kopi", skuvKopi({ o: [0.5, 0.5, 0.5], n: [1, 0, 0] }, [0, 0, 0], [1, 2, 3], 25) === null)
}

console.log("\nrutenettet og det som er ditt:")
{
  const rute = rutenett(3, 2)
  const hand = (id: number, o: Vec3, n: Vec3, meir: Partial<ReturnType<typeof lesPlan>[number]> = {}) =>
    ({ id, o, n, bog: 0, strek: [], ...meir }) as ReturnType<typeof lesPlan>[number]

  const reint = skilRute(rute)
  sjekk("eit heilt rutenett er verktyet sitt", reint.andre.length === 0 && reint.nx === 3 && reint.ny === 2, `${reint.nx}×${reint.ny}, ${reint.andre.length} andre`)

  const tomt = skilRute([])
  sjekk("ei tom liste er null og null", tomt.nx === 0 && tomt.ny === 0 && tomt.rute.length === 0)

  for (const [ord, meir] of [
    ["omriss", { omriss: [[-0.3, -0.4], [0.3, -0.4], [0.2, 0.4], [-0.2, 0.4]] as Pt[] }],
    ["boksprofil", { firkant: true as const }],
    ["mjuka profil", { mjuk: 0.02 }],
  ] as const) {
    const eiga = hand(1, [0.5, 0.5, 0.5], [1, 0, 0], meir)
    const skild = skilRute(lesPlan(skrivPlan([eiga])))
    const ny = [...skild.andre, ...rutenett(2, 2, nyId(skild.andre), nyGruppe(skild.andre))]
    sjekk(`${ord} på rutenettplassen er handa sin`, skild.nx === 0 && skild.rute.length === 0 && skrivPlan(ny.slice(0, 1)) === skrivPlan([eiga]))
  }

  const mine: [string, ReturnType<typeof lesPlan>[number]][] = [
    ["eit skrått plan", hand(90, [0.5, 0.5, 0.5], [0.7071, 0.7071, 0])],
    ["eit vassrett plan", hand(91, [0.5, 0.5, 0.4], [0, 0, 1])],
    ["eit plan med eit strek", hand(92, [0.25, 0.5, 0.5], [1, 0, 0], { strek: [{ slag: "hol", form: "rund", x: 0, y: 0, w: 0.1, h: 0.1, a: 0 }] })],
    ["eit bøygt plan", hand(93, [0.75, 0.5, 0.5], [1, 0, 0], { bog: 0.5 })],
    ["eit plan med lag", hand(94, [0.25, 0.5, 0.5], [0, 1, 0], { farge: 5 })],
    ["ei ribbe skoven ut av rekkja", hand(95, [0.31, 0.5, 0.5], [1, 0, 0])],
  ]
  for (const [ord, q] of mine) {
    const r = skilRute([...rute, q])
    const eig = r.andre.some((p) => p.id === q.id)
    const heil = q.id === 95 ? r.nx === 0 && r.andre.filter((p) => Math.abs(p.n[0]) > 0.999).length === 4 : r.nx === 3
    sjekk(`${ord} står att som ditt`, eig && heil, `${r.nx}×${r.ny}, ${r.andre.length} andre`)
  }

  {
    const eigne = mine.map(([, q]) => q)
    const foer = [...rute, ...eigne]
    const { rute: eigd, andre } = skilRute(foer)
    const nytt = [...andre, ...rutenett(5, 5, nyId(andre), nyGruppe(andre))]
    const att = new Set(nytt.map((q) => q.id))
    sjekk("alle plana du sette står att", eigne.every((q) => att.has(q.id)), `${eigne.filter((q) => att.has(q.id)).length} av ${eigne.length}`)
    sjekk("og ei broten rad er di og står ho òg", rute.filter((q) => Math.abs(q.n[0]) > 0.999).every((q) => att.has(q.id)), `${andre.length} andre`)
    sjekk("men det verktyet eigde er borte", eigd.length > 0 && !eigd.some((q) => att.has(q.id)), `${eigd.length} eigde`)
    sjekk("namna er kvar sitt", new Set(nytt.map((q) => q.id)).size === nytt.length, `${nytt.length} plan`)
    const gRute = new Set(nytt.slice(andre.length).map((q) => q.gruppe))
    const gAndre = new Set(andre.map((q) => q.gruppe).filter(Boolean))
    sjekk("og gruppene til nettet krasjar ikkje med dei andre", [...gRute].every((g) => !gAndre.has(g)), `nett ${[...gRute].join(",")} · andre ${[...gAndre].join(",") || "ingen"}`)
    sjekk("lista går gjennom strengen som ho er", reinPlan(skrivPlan(nytt)) === skrivPlan(nytt), `${skrivPlan(nytt).length} teikn`)
  }
}

console.log("\nbøyen i plana:")
for (const [inn, vent] of [
  ["1@0.5,0.5,0.5/0,1,0/b:0.5", "1@0.5,0.5,0.5/0,1,0/b:0.5"],
  ["1@0.5,0.5,0.5/0,1,0/b:-0.5", "1@0.5,0.5,0.5/0,1,0/b:-0.5"],
  ["1@0.5,0.5,0.5/0,1,0/b:0", "1@0.5,0.5,0.5/0,1,0"],           // flatt skriv ingen bøy
  ["1@0.5,0.5,0.5/0,1,0/b:99", "1@0.5,0.5,0.5/0,1,0/b:4"],      // taket klemmer
  ["1@0.5,0.5,0.5/0,1,0/b:-99", "1@0.5,0.5,0.5/0,1,0/b:-4"],
  ["1@0.5,0.5,0.5/0,1,0/b:NaN", "1@0.5,0.5,0.5/0,1,0"],
  ["1@0.5,0.5,0.5/0,1,0/b:tull", "1@0.5,0.5,0.5/0,1,0"],
  ["1@0.5,0.5,0.5/0,1,0/b:0.3/+r:0.1,0.2,0.3,0.4,0", "1@0.5,0.5,0.5/0,1,0/b:0.3/+r:0.1,0.2,0.3,0.4,0"],
] as const) {
  const fekk = reinPlan(inn)
  sjekk(`bøy «${String(inn).slice(-14)}»`, fekk === vent, fekk)
}
{
  const to = "1@0.5,0.5,0.5/0,1,0/b:0.4;2@0.6,0.5,0.5/1,0,0"
  const l = lesPlan(to)
  l[1] = { ...l[1], o: [0.7, 0.5, 0.5] }
  const ut2 = lesPlan(skrivPlan(l))
  sjekk("ei endring på eitt plan lèt bøyen på det andre stå", ut2[0].bog === 0.4 && ut2[1].bog === 0, `${ut2[0].bog} / ${ut2[1].bog}`)
}

console.log("\ndelinga på eitt ledd:")
for (const [inn, vent] of [
  ["5-12-0:0.35", "5-12-0:0.35"],
  ["12-5-0:0.35", ""],                     // namna må stige: eitt ledd, éin nøkkel
  ["5-5-0:0.35", ""],                      // eit plan kryssar ikkje seg sjølv
  ["5-12-0:0.05", ""],                     // utanfor bandet skyvaren har
  ["5-12-0:0.95", ""],
  ["5-12-0:NaN", ""],
  ["5-12:0.35", ""],                       // utan møtenummer er det ikkje ein nøkkel
  ["tull", ""],
  ["5-12-0:0.35;1-2-0:0.6", "1-2-0:0.6;5-12-0:0.35"],
  ["5-12-0:0.35;5-12-0:0.6", "5-12-0:0.6"], // siste vinn, og det er éin oppføring
] as const) {
  const fekk = reinDeling(inn)
  sjekk(`deling «${String(inn).slice(0, 24)}»`, fekk === vent, fekk)
}
{
  const grunn = { ...DEFAULT_PARAMS, plan: skrivPlan(rutenett(3, 3)), storleik: 200, tjukn: 6 } as Params
  const spora = (p: Params) => {
    const { s } = makeBygg(p, DETAIL.mid)
    const ut: string[] = []
    for (const r of s.ribber) for (const q of r.spor) ut.push(`${r.plan.id}→${q.mot} ${q.botn.toFixed(2)} ${q.munn.toFixed(2)}`)
    return ut.sort()
  }
  const utan = spora(grunn)
  const nokk = leddNokkel(1, 4, 0)
  const med = spora({ ...grunn, deling: skrivDeling(new Map([[nokk, 0.75]])) })
  const ulike = utan.filter((q, i) => q !== med[i])
  sjekk("ei hand på eitt ledd flyttar NØYAKTIG to spor", ulike.length === 2, `${ulike.length} av ${utan.length}`)
  sjekk("og dei to er dei to sidene av det leddet",
    ulike.length === 2 && ulike.every((q) => /^(1→4|4→1) /.test(q)), ulike.join(" · "))
  const par = med.filter((q) => /^(1→4|4→1) /.test(q)).map((q) => q.split(" ").slice(1).map(Number))
  sjekk("dei har same botn, og munnane i kvar sin ende",
    par.length === 2 && Math.abs(par[0][0] - par[1][0]) < 1e-6 && par[0][1] !== par[1][1],
    par.map((q) => `botn ${q[0]} munn ${q[1]}`).join(" · "))
  const tull = spora({ ...grunn, deling: skrivDeling(new Map([[leddNokkel(1, 2, 0), 0.75]])) })
  sjekk("og ein nøkkel til eit ledd som ikkje finst rører ingenting", tull.every((q, i) => q === utan[i]))
}

console.log("\nhandtaka på spor-endane:")
{
  const grunn = { ...DEFAULT_PARAMS, plan: nett(3, 3), storleik: 200, tjukn: 6 } as unknown as ParamBag
  const arket = (p: ParamBag, i = 0) => MOTOR.arkSyn(p, i)
  const a0 = arket(grunn)
  const paaBroek = (v: { lo: Pt; hi: Pt }, t: number): Pt => [v.lo[0] + (v.hi[0] - v.lo[0]) * t, v.lo[1] + (v.hi[1] - v.lo[1]) * t]
  const langt = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

  const medSpor = a0.plasser.filter((d) => d.spor.length)
  sjekk("plata gjev spor-endar på delane", medSpor.length > 0, `${medSpor.length} av ${a0.plasser.length} delar`)

  const skeivt = medSpor.flatMap((d) => d.spor.filter((v) => langt(v.botn, paaBroek(v, 0.5)) > 0.5).map((v) => `${d.adr} ${v.nokkel}`))
  sjekk("botnen står der skyvaren seier, i plata sine koordinatar", skeivt.length === 0, skeivt.slice(0, 4).join(" · "))

  const laus = medSpor.flatMap((d) => d.spor.filter((v) => Math.min(langt(v.munn, v.lo), langt(v.munn, v.hi)) > 0.5).map((v) => `${d.adr} ${v.nokkel}`))
  sjekk("og munnen ligg i den eine enden av strekket", laus.length === 0, laus.slice(0, 4).join(" · "))

  const v0 = medSpor[0].spor[0]
  const adr = medSpor[0].adr
  const T = 0.72
  const a1 = arket({ ...grunn, deling: skrivDeling(new Map([[v0.nokkel, T]])) } as ParamBag)
  const d1 = a1.plasser.find((d) => d.adr === adr)
  const v1 = d1?.spor.find((q) => q.nokkel === v0.nokkel)
  sjekk("delen og leddet finst att etter at brøken er skriven", !!v1, `${adr} · ${v0.nokkel}`)
  if (v1) {
    const av = langt(v1.botn, paaBroek(v1, T))
    sjekk("og botnen står der handtaket vart sleppt", av < 0.5, `${av.toFixed(2)} mm frå brøken`)
    const flytta = langt(v1.botn, v0.botn)
    sjekk("og han flytte seg", flytta > 1, `${flytta.toFixed(1)} mm`)
  }

  const alle = new Map<string, string[]>()
  for (let i = 0; i < a0.tal; i++) {
    for (const d of arket(grunn, i).plasser) for (const v of d.spor) alle.set(v.nokkel, [...(alle.get(v.nokkel) ?? []), d.adr])
  }
  const eine = [...alle.entries()].filter(([, d]) => d.length !== 2)
  sjekk("kvart ledd har handtak på nøyaktig to delar", eine.length === 0, eine.slice(0, 4).map(([k, d]) => `${k}:${d.length}`).join(" · "))
}

{
  console.log("\n=== snappet i omrisset")
  const kv: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const R = 0.1

  const fritt = snappPunkt(kv, 0, [0.5, 0.5], R)
  sjekk("midt inne fangar ingenting", fritt.slag === null && fritt.p[0] === 0.5, `${fritt.slag}`)

  const nær = snappPunkt(kv, 0, [0.95, 0.03], R)
  sjekk("nær eit anna punkt fell det PÅ punktet", nær.slag === "punkt" && nær.mot === 1 && nær.p[0] === 1 && nær.p[1] === 0, `${nær.slag} mot ${nær.mot} → ${nær.p.join(",")}`)

  const langt = snappPunkt(kv, 0, [0.95, 0.03], R, 0.02)
  sjekk("men ikkje når punktradien er trongare enn avstanden", langt.slag !== "punkt", `${langt.slag}`)
  const paa = snappPunkt(kv, 0, [0.995, 0.005], R, 0.02)
  sjekk("og legg du det OPPÅ, fangar han likevel", paa.slag === "punkt" && paa.mot === 1, `${paa.slag} mot ${paa.mot}`)

  const kant = snappPunkt(kv, 0, [0.97, 0.5], R)
  sjekk("nær ei kant fell det NED PÅ kanten", kant.slag === "kant" && Math.abs(kant.p[0] - 1) < 1e-9 && Math.abs(kant.p[1] - 0.5) < 1e-9, `${kant.slag} → ${kant.p.join(",")}`)

  const akse = snappPunkt(kv, 0, [0.04, 0.5], R)
  sjekk("nær aksen til ein nabo fangar berre den eine koordinaten", akse.slag === "akse" && akse.p[0] === 0 && akse.p[1] === 0.5, `${akse.slag} → ${akse.p.join(",")}`)

  const sjolv = snappPunkt(kv, 0, [0.001, 0.001], R)
  sjekk("punktet fangar ikkje seg sjølv", sjolv.slag !== "punkt" || sjolv.mot !== 0, `${sjolv.slag} mot ${sjolv.mot}`)

  const nabo = slaaSaman(kv, 0, 1)
  sjekk("to naboar som fell saman vert eitt punkt", !!nabo && nabo.omriss.length === 3, `${nabo?.omriss.length} att`)
  const over = slaaSaman(kv, 0, 2)
  sjekk("to som IKKJE er naboar vert ikkje eitt — ringen ville klemt seg til eit åttetal", over === null)
  const tre = slaaSaman([[0, 0], [1, 0], [0, 1]], 0, 1)
  sjekk("og tre punkt slår aldri saman: under fire er det ikkje ei flate", tre === null)

  const diag = snappPunkt(kv, 0, [0.55, 0.48], R, 0.02, 45)
  sjekk("med steg 45 finst diagonalen frå naboen", diag.slag === "akse" && Math.abs(diag.p[0] + diag.p[1] - 1) < 1e-4, `${diag.slag} → ${diag.p.join(",")}`)
  const ikkje = snappPunkt(kv, 0, [0.55, 0.48], R, 0.02, 90)
  sjekk("og med steg 90 finst han ikkje: punktet står der det stod", ikkje.slag === null && ikkje.p[0] === 0.55, `${ikkje.slag} → ${ikkje.p.join(",")}`)
  const utan = snappPunkt(kv, 0, [0.04, 0.5], R, 0.02, 0)
  sjekk("og steg null slår vinkelsnappet heilt av", utan.slag === null, `${utan.slag}`)

  const utePlan = lesPlan(`1@0.5,4,0.5/0,1,0`)
  sjekk("eit plan fire boksbreidder ute står", utePlan.length === 1, `${utePlan.length} plan`)
  const langtUte = lesPlan(`1@0.5,9,0.5/0,1,0`)
  sjekk("og eitt langt utanfor det fell framleis", langtUte.length === 0, `${langtUte.length} plan`)
  const paaGrensa = lesPlan(`1@0.5,${1 + PLAN_ROM},0.5/0,1,0`)
  sjekk("og grensa sjølv står", paaGrensa.length === 1, `${paaGrensa.length} plan ved ${1 + PLAN_ROM}`)

  const av = snappPunkt(kv, 0, [0.95, 0.03], 0)
  sjekk("radius null fangar ingenting", av.slag === null, `${av.slag}`)
}

console.log(feil ? `\n${feil} FEIL` : "\nhanda held")
process.exit(feil ? 1 : 0)
