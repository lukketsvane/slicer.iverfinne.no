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
import { lesPlan, nyId, reinPlan, rutenett, skrivPlan, PLAN_TAK, PUNKT_TAK, STREK_TAK } from "../lib/plan"
import { reinScene, SCENE_TAK } from "../lib/scene"
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
  // BANEN: eit merke handa drog. Understrek inni, komma utanfor.
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_-0.3_0.1_0.2_-0.1", "1@0.5,0.5,0.5/1,0,0/-b:0.04_-0.3_0.1_0.2_-0.1"],
  ["1@0.5,0.5,0.5/1,0,0/+b:0.04_0_0_0.1_0.1_0.2_0", "1@0.5,0.5,0.5/1,0,0/+b:0.04_0_0_0.1_0.1_0.2_0"],
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04,-0.3,0.1,0.2,-0.1", "1@0.5,0.5,0.5/1,0,0"], // komma inni er ikkje eit merke
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0.1", "1@0.5,0.5,0.5/1,0,0"],           // partal: eit punkt manglar helvta
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0", "1@0.5,0.5,0.5/1,0,0"],               // eitt punkt er ikkje ei line
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_NaN_0.1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_Infinity_0.1", "1@0.5,0.5,0.5/1,0,0"],
  ["1@0.5,0.5,0.5/1,0,0/-b:0_0_0_0.1_0.1", "1@0.5,0.5,0.5/1,0,0"],          // penn utan breidd
  ["1@0.5,0.5,0.5/1,0,0/-b:3_0_0_0.1_0.1", "1@0.5,0.5,0.5/1,0,0"],          // penn breiare enn kroppen
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_2.5_0", "1@0.5,0.5,0.5/1,0,0"],         // punkt langt utanfor
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_-1.5_0_1.5_0", "1@0.5,0.5,0.5/1,0,0"],      // boks på tri
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0_0_0.1_0.1", "1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0.1_0.1"], // like punkt fell saman
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0_0", "1@0.5,0.5,0.5/1,0,0"],           // og eitt punkt att er ingen bane
  ["1@0.5,0.5,0.5/1,0,0/-b:0.04_0.00004_0_0.1_0.1", "1@0.5,0.5,0.5/1,0,0/-b:0.04_0_0_0.1_0.1"], // rundinga fyrst
  // for lang hale: forkasta av lengdeporten, og han brukar ikkje strekplassen
  [`1@0.5,0.5,0.5/1,0,0/-b:${Array.from({ length: 5000 }, () => "0.1").join("_")}/-o:0,0,0.1,0.1,0`,
   "1@0.5,0.5,0.5/1,0,0/-o:0,0,0.1,0.1,0"],
  // punktbudsjettet per plan: den fyrste får plass, den andre vert forkasta HEIL
  [`1@0.5,0.5,0.5/1,0,0/-b:0.04_${Array.from({ length: 120 }, (_, i) => `${(i % 40) / 100}_0.1`).join("_")}`,
   "1@0.5,0.5,0.5/1,0,0"],
  ["<script>", ""],
  [Array.from({ length: 200 }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";"),
   Array.from({ length: PLAN_TAK }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";")],
] as const) {
  const fekk = reinPlan(inn)
  sjekk(`rein «${String(inn).slice(0, 26)}»`, fekk === vent, fekk.slice(0, 40))
  // FASTPUNKTET. `MOTOR.clamp` køyrer `reinPlan` på kvar einaste endring,
  // og eit råd som rettar ein strengparameter må overleve det ordrett.
  sjekk(`  og han er eit fastpunkt`, reinPlan(fekk) === fekk, reinPlan(fekk).slice(0, 40))
}

/**
 * TAKA. Ein boks er tri og førti teikn same kva, so `STREK_TAK` heldt
 * strengen nede av seg sjølv; ein bane er so mange tal som handa gav han,
 * og der er det `PUNKT_TAK` som gjer det. Begge er prøvde her, av di
 * ingen av dei var det før.
 */
{
  const mange = Array.from({ length: 25 }, () => "-o:0,0,0.1,0.1,0").join("/")
  const fekk = lesPlan(`1@0.5,0.5,0.5/1,0,0/${mange}`)
  sjekk("fem og tjue strek på eitt plan vert fire og tjue", fekk[0]?.strek.length === STREK_TAK, `${fekk[0]?.strek.length}`)
  const to = [
    `-b:0.04_${Array.from({ length: 60 }, (_, i) => `${i / 100}_0`).join("_")}`,
    `-b:0.04_${Array.from({ length: 60 }, (_, i) => `${i / 100}_0.2`).join("_")}`,
  ].join("/")
  const b = lesPlan(`1@0.5,0.5,0.5/1,0,0/${to}`)
  const s0 = b[0]?.strek[0]
  sjekk(
    "to merke over punkttaket: det fyrste står, det andre fell heilt",
    b[0]?.strek.length === 1 && s0?.form === "bane" && s0.p.length / 2 === 60,
    `${b[0]?.strek.length} strek, ${s0 && s0.form === "bane" ? s0.p.length / 2 : 0} punkt av ${PUNKT_TAK}`,
  )
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

/**
 * STREKA: gods legg til, hòl tek bort, og eit strek som rekk ut forbi
 * kroppen er ikkje eit strek som kløyver plata.
 *
 * Det var det: ruta som feltet vert lese på dekte kroppen og ikkje
 * streka, og eit strek over kanten vart klipt av ruta — ei open kjede,
 * lukka på måfå, og plata kom ut i to stykke med eit skrått band imellom.
 */
console.log("")
{
  const grunn = lesPlan(nett(6, 6))
  const med = (strek: object[]) => {
    const l = grunn.map((q) => ({ ...q, strek: q.id === 3 ? (strek as never) : q.strek }))
    const bag = { ...DEFAULT_PARAMS, plan: skrivPlan(l) } as unknown as ParamBag
    const m = MOTOR.measure(bag)
    return { delar: m.parts, flate: m.plyArea, ledd: m.joints, nodar: m.nodes }
  }
  const utan = med([])
  const gods = med([{ slag: "gods", form: "rekt", x: 0.55, y: 0.1, w: 0.2, h: 0.1, a: 20 }])
  const hol = med([{ slag: "hol", form: "rund", x: 0, y: -0.3, w: 0.15, h: 0.15, a: 0 }])
  sjekk("gods over kanten legg til flate, og delar ikkje plata", gods.delar === utan.delar && gods.flate > utan.flate && gods.ledd === utan.ledd, `${utan.delar}→${gods.delar} delar, ${Math.round(utan.flate)}→${Math.round(gods.flate)} mm², ${gods.ledd} ledd`)
  sjekk("eit hòl tek flate og legg til ein ring", hol.delar === utan.delar && hol.flate < utan.flate && hol.nodar > utan.nodar, `${Math.round(utan.flate)}→${Math.round(hol.flate)} mm²`)

  /**
   * BANEN ER EI SAG, IKKJE EIN ANGRE. Han skil ikkje gods du la til frå
   * gods nettet gav deg: eit merke tvers over plata deler henne i to
   * delar, og adressene fylgjer med. Det er meininga med han, og det er
   * grunnen til at knappen framleis heiter «skjer hòl».
   */
  const tvers = med([{ slag: "hol", form: "bane", br: 0.04, p: [-0.6, -0.15, 0.6, -0.15] }])
  sjekk(
    "eit merke tvers over plata deler henne",
    tvers.delar > utan.delar && tvers.flate < utan.flate,
    `${utan.delar}→${tvers.delar} delar, ${Math.round(utan.flate)}→${Math.round(tvers.flate)} mm²`,
  )
  const kort = med([{ slag: "hol", form: "bane", br: 0.04, p: [-0.1, -0.1, 0.1, 0.1] }])
  sjekk(
    "og eit merke inni ho tek berre flate",
    kort.delar === utan.delar && kort.flate < utan.flate,
    `${utan.delar}→${kort.delar} delar, ${Math.round(utan.flate)}→${Math.round(kort.flate)} mm²`,
  )
  const gBane = med([{ slag: "gods", form: "bane", br: 0.06, p: [0.4, 0.1, 0.62, 0.1] }])
  sjekk(
    "eit gods-merke over kanten legg til flate, og klipper ikkje plata",
    gBane.delar === utan.delar && gBane.flate > utan.flate,
    `${utan.delar}→${gBane.delar} delar, ${Math.round(utan.flate)}→${Math.round(gBane.flate)} mm²`,
  )
  // rekkjefylgja er geometrien: eit gods etter eit hòl fyller det att
  const attfylt = med([
    { slag: "hol", form: "bane", br: 0.04, p: [-0.1, -0.1, 0.1, 0.1] },
    { slag: "gods", form: "bane", br: 0.06, p: [-0.1, -0.1, 0.1, 0.1] },
  ])
  sjekk("og eit gods etter eit hòl fyller det att", attfylt.flate > kort.flate, `${Math.round(kort.flate)}→${Math.round(attfylt.flate)} mm²`)
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
