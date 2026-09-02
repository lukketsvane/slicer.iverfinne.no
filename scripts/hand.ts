/**
 * HANDA: HANDA OG FESTA DELAR.
 *
 * Ribbene var eit tal og er ei liste. Denne fila prøver dei to påstandane
 * lista må halde: at eit objekt UTAN låsar er nøyaktig det same objektet
 * som før, og at ei låst ribbe står der ho er låst same kva skyvaren seier.
 *
 * Og ho prøver vegen inn. `laas` og `fest` er dei to fyrste parametrane som
 * ikkje er tal med eit band kring seg — dei er strengar, dei kjem frå ei
 * lenkje, og ei lenkje er skriven av kven som helst.
 */
import { clampParams, DEFAULT_PARAMS, reinFest } from "../lib/params"
import { lesPlan, nyId, reinPlan, rutenett, skrivPlan, PLAN_TAK } from "../lib/plan"
import { apply, pack, type Fest } from "../lib/pack"
import { MOTOR } from "../lib/motor"
import { bbox, type ParamBag, type Pt } from "../lib/core"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(44), sagt)
  if (!ok) feil++
}

/**
 * PLANA ER EI LISTE, OG LISTA ER STRENGEN.
 *
 * Alt handa gjer med eit plan — låse, flytte, vinkle om, slette — er ei
 * endring i éi oppføring, og dei andre står. Det var det låsane måtte
 * reknast fram til før; no er det det lista ER. Vakta held likevel på det:
 * ein streng inn skal kome ut som den same lista, og alt som ikkje er eit
 * plan skal falle på golvet før det når geometrien.
 */
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
  ["<script>", ""],
  [Array.from({ length: 200 }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";"),
   Array.from({ length: PLAN_TAK }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";")],
] as const) {
  const fekk = reinPlan(inn)
  sjekk(`rein «${String(inn).slice(0, 26)}»`, fekk === vent, fekk.slice(0, 40))
}

const q = clampParams({ ...DEFAULT_PARAMS, plan: "1@0.5,0.5,0.5/1,0,0;x" }, DEFAULT_PARAMS)
sjekk("clampParams reinsar plan", q.plan === "1@0.5,0.5,0.5/1,0,0", q.plan)
const r = clampParams({ storleik: 200 }, { ...DEFAULT_PARAMS, plan: "1@0.5,0.5,0.5/1,0,0" })
sjekk("plan overlever ein annan endring", r.plan === "1@0.5,0.5,0.5/1,0,0", r.plan)

console.log("")
{
  const alle = lesPlan(nett(6, 6))
  sjekk("rutenettet 6×6 er tolv plan med tolv namn", alle.length === 12 && new Set(alle.map((p) => p.id)).size === 12)
  /** det studioet gjer: byt ut éi oppføring */
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

/**
 * TO FESTE I KVARANDRE.
 *
 * Pakkinga overprøver ikkje handa: set du to delar i kvarandre, ligg dei i
 * kvarandre. Men ho skal SEIE det — to kutt som går i kvarandre er to
 * stykke skrap — og det er `kross` som ber ordet frå pakkinga til regelen
 * og til plata. Éin del vert talt: den som vart lagd ned i gods som alt
 * låg der. Den fyrste låg på tomt bord.
 */
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

/**
 * EIT FESTE PÅ EI PLATE SOM IKKJE TRENGST LENGER.
 *
 * Delen vart festa på plate fire då jobben var stor. No er han liten, og
 * resten får plass på éi. Dei tomme platene imellom fell bort, delen
 * står att på si eiga — plate to no — og ingen fil er tom. To feste med
 * same nummer held saman.
 */
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

console.log(feil ? `\n${feil} FEIL` : "\nhanda held")
process.exit(feil ? 1 : 0)
