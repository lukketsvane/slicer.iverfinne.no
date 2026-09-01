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
import { VAFFEL } from "../lib/vaffel/engine"
import { bbox, type ParamBag, type Pt } from "../lib/core"

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
// STABELEN: Å RØRE ÉI RIBBE SKAL LA DEI ANDRE STÅ
// =============================================================================
/**
 * DETTE ER HEILE PÅSTANDEN STABELEDITOREN KVILER PÅ.
 *
 * Ein FRI ribbe har ingen eigen plass — han er «den fjerde av seks jamne»,
 * og den plassen er ei rekning på talet. So «flytt X2» kan ikkje tyde noko
 * før heile stabelen er skriven ned; gjer du det utan, krev brøken den nye
 * ribba fekk ein av dei jamne plassane, og dei andre fordeler seg kring
 * henne. Ei ribbe flytta seg, og fem andre gjorde det same.
 *
 * Verba i studioet låser difor stabelen fyrst. Her vert den rekninga prøvd
 * for seg: `plasser` er den einaste fasiten på kvar ribbene står, og ho
 * står i motoren.
 */
console.log("")
{
  const alle = plasser(6, [])
  /** det studioet gjer: skriv ned heile stabelen, og byt ut éin */
  const flytt = (i: number, t: number) => plasser(6, alle.map((v, j) => (j === i ? t : v)))

  /**
   * MÅLET ER 0,35 og ikkje eit tal til.
   *
   * X2 står på 0,25, og eit lite dytt kjem ingen veg her: låsen krev den
   * jamne plassen ho ligg NÆRAST, so alt innanfor si eiga celle tek si
   * eiga celle og dei andre står — same kva veg det vart rekna. Prøva må
   * krysse ei cellegrense for å prøve noko: 0,35 ligg nærare 0,4167 enn
   * 0,25, so ULÅST krev han plassen til X3 i staden for sin eigen.
   */
  const etter = flytt(1, 0.35)
  sjekk(
    "flytt X2 til 0,35: dei fem andre står stille",
    etter.length === 6 && alle.every((v, j) => j === 1 || etter.includes(v)),
    p3(etter),
  )
  sjekk("og X2 står der du sette henne", etter.includes(0.35), p3(etter))

  // Same talet UTAN å låse fyrst: X2 står att der ho stod, og det er X3
  // som er borte. Ei ribbe flytta seg, og det var ikkje den du tok i.
  const utan = plasser(6, [0.35])
  sjekk(
    "utan å låse fyrst flyttar feil ribbe seg",
    utan.includes(alle[1]) && !utan.includes(alle[2]),
    p3(utan),
  )

  // Slett: talet går ned, og dei som står att står nøyaktig der dei stod.
  const utanEin = alle.filter((_, j) => j !== 3)
  const sletta = plasser(utanEin.length, utanEin)
  sjekk(
    "slett X4: dei fem andre står stille",
    sletta.length === 5 && utanEin.every((v) => sletta.includes(v)),
    p3(sletta),
  )

  // Lås alle, og dra så skyvaren opp: dei seks står, og dei nye kjem
  // imellom. Det er heile skilnaden på ein stabel du eig og eit rutenett.
  const opp = plasser(9, alle)
  sjekk(
    "lås alle, skyvaren til 9: dei seks står",
    opp.length === 9 && alle.every((v) => opp.includes(v)),
    p3(opp),
  )
}

// =============================================================================
// STABELEN I MILLIMETER
// =============================================================================
/**
 * BRUA MELLOM BRØKEN OG BORDET.
 *
 * Låsen er ein BRØKDEL av spennet — det er rett, og det er ubrukeleg å
 * redigere i. Stabelen syner millimeter, og han reknar dei ut av ei
 * RETTLINE han passar til to ribber i kuttlista: `pos = min + t · vidd`.
 *
 * Den lina er ei påstand om motoren, og ho er lett å ta feil av. Snittinga
 * fordeler ribbene over kroppen sitt eige spenn, ikkje over det ferdige
 * objektet sitt ytremål, og dei to er ikkje det same talet. Vert lina
 * passa til feil spenn, ser stabelen rett ut og kvart einaste tal i han er
 * nokre millimeter feil — den verste sorten feil, av di han ikkje syner.
 *
 * So her vert ho prøvd mot fasiten: kvar ribbe si eiga plassering, slik
 * kuttlista melder henne.
 */
console.log("")
{
  const bag = { ...DEFAULT_PARAMS, ribbX: 7, ribbY: 5 } as unknown as ParamBag
  const liste = VAFFEL.liste(bag)
  sjekk("kuttlista ber ei plassering per del", liste.every((k) => Number.isFinite(k.pos)))

  for (const akse of ["x", "y"] as const) {
    const alle = plasser(Number(bag[akse === "x" ? "ribbX" : "ribbY"]), [])
    const stor = akse.toUpperCase()
    /** det studioet gjer: to ribber med kjend plass gjev heile lina */
    let a: { t: number; mm: number } | null = null
    let b: { t: number; mm: number } | null = null
    for (const k of liste) {
      const m = new RegExp(`^${stor}(\\d+)`).exec(k.adr)
      if (!m) continue
      const t = alle[Number(m[1]) - 1]
      if (t === undefined) continue
      if (!a || t < a.t) a = { t, mm: k.pos }
      if (!b || t > b.t) b = { t, mm: k.pos }
    }
    if (!a || !b) {
      sjekk(`${akse}: to ribber å passe lina til`, false)
      continue
    }
    const vidd = (b.mm - a.mm) / (b.t - a.t)
    const min = a.mm - a.t * vidd

    // Og so kvar einaste ribbe, og ikkje berre dei to lina vart passa til.
    let verst = 0
    for (const k of liste) {
      const m = new RegExp(`^${stor}(\\d+)`).exec(k.adr)
      if (!m) continue
      const t = alle[Number(m[1]) - 1]
      if (t === undefined) continue
      verst = Math.max(verst, Math.abs(min + t * vidd - k.pos))
    }
    sjekk(
      `${akse}: lina treffer kvar ribbe`,
      verst < 0.01,
      `verste avvik ${verst.toFixed(4)} mm, spenn ${vidd.toFixed(1)} mm`,
    )
  }
}

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
