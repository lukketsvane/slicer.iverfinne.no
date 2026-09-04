/**
 * TAKET PÅ PLANA, MÅLT.
 *
 * `REBUILD.md` spør: «How many hand-placed planes before a phone gives up?
 * Find the ceiling on real hardware early. It sets how ambitious the
 * editing model can be.» Spørsmålet stod ope, og ingen vakt såg langs den
 * aksen: `tung` måler TREKANTAR — ein kropp på ein million — og alt anna
 * måler eitt objekt med tolv plan i. Kva som skjer når du dreg rutenettet
 * til seksti og fire, visste ingen.
 *
 * Her vert det målt, og det vert eit BUDSJETT. Ei rekning som går frå
 * lineær til kvadratisk i talet på plan er den dyraste feilen denne koden
 * kan gjere, og den einaste som ikkje syner seg som eit gale tal: alt er
 * rett, det tek berre ti sekund.
 *
 * TO KOEFFISIENTAR, SKILDE MED EIN KONTROLL. Kostnaden er to ting som veks
 * ulikt: kvart plan vert snitta for seg (lineært), og kvart PAR av plan som
 * kryssar må finne ledda sine (kvadratisk i talet på plan). Eit rutenett
 * n×n har begge. Same talet plan, alle PARALLELLE, har berre den fyrste —
 * dei kryssar aldri. Skilnaden mellom dei to er leddarbeidet, og då står
 * dei to koeffisientane kvar for seg og kan få kvar sitt tak.
 *
 *   npx tsx scripts/tak.ts
 */
import { MOTOR } from "../lib/motor"
import { put } from "../lib/sources"
import { makeSoup } from "../lib/soup"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { PLAN_TAK, lesPlan, rutenett, skrivPlan } from "../lib/plan"
import type { ParamBag } from "../lib/core"

let brot = 0
const bryt = (kva: string) => {
  brot++
  console.log(`  FEIL ${kva}`)
}
const ok = (namn: string, sant: boolean, kva = "") => {
  if (sant) console.log(`  ok   ${namn.padEnd(46)} ${kva}`)
  else bryt(`${namn.padEnd(46)} ${kva}`)
}

/**
 * PRØVEKROPPEN er ei kule på to hundre millimeter: krum overalt, so kvart
 * plan gjev ein ulik profil og ingen av dei er gratis. Han vert snitta med
 * dei same plana kvar gong, so tala kan samanliknast frå køyring til
 * køyring — det er utviklinga i dei som er saka, ikkje talet i seg sjølv.
 */
/**
 * Kula vert laga her og ikkje henta: dei innebygde formene er filer no, og
 * ein prøvebenk som må over nettet for å måle er ein prøvebenk som måler
 * nettet. Same kula som `vrient` bruker, og ho står i minnet under sitt
 * eige namn so ingen ting anna kan koma til å svare på det.
 */
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

/** eitt mål, med nettet varmt: det er snittinga som skal målast, ikkje sveisinga */
function maal(plan: string): { ms: number; delar: number; ledd: number; plan: number } {
  const bag = { ...GRUNN, plan } as unknown as ParamBag
  const t0 = Date.now()
  const m = MOTOR.measure(bag)
  return { ms: Date.now() - t0, delar: m.parts, ledd: m.joints, plan: lesPlan(plan).length }
}

/**
 * OPPVARMINGA MÅ STÅ UTANFOR MÅLINGA.
 *
 * Bygget og snittet vert begge hugsa (`keep` i `bygg.ts`, og snittet på
 * `snittKey`), so eit plansett som er MÅLT ÉIN GONG er gratis andre gongen.
 * Varmar du opp med eit sett som seinare står i sveipet, måler du oppslaget
 * og ikkje rekninga — og kurva får eit hòl i seg som ser ut som ei
 * forbetring. Difor eitt einaste plan her, og aldri eit tal frå TAL.
 */
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
  // Rutenettet: n/2 kvar veg er n plan, og nesten kvart par på tvers kryssar.
  const rute = maal(skrivPlan(rutenett(n / 2, n / 2)))
  // Kontrollen: like mange plan, alle langs same aksen. Ingen av dei kryssar
  // kvarandre, so her er det berre snittinga.
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

/**
 * BUDSJETTA er romslege med vilje. Talet på ei anna maskin er eit anna tal,
 * og ei vakt som ryk av di prøvebenken var travel lærer deg å sjå bort frå
 * henne. Det som skal fangast er ikkje ein halv millisekund, det er ei
 * rekning som har bytt orden — og då er tre til fire gonger for lite,
 * ikkje for mykje.
 *
 * Målt på maskina dette vart skrive på: 16 ms per plan og 1,6 ms per ledd
 * ved taket, so seksti og fire plan er kring to sekund. Ein telefon er tre
 * til fem gonger tregare, og DET er svaret på spørsmålet i REBUILD.md:
 * taket er nådd lenge før seksti og fire.
 */
const MS_PER_PLAN = 60
const MS_PER_LEDD = 6

const siste = rader[rader.length - 1]
if (!siste) bryt("ingen rader vart målte")
else {
  ok(`snittinga held seg under ${MS_PER_PLAN} ms per plan`, siste.perPlan < MS_PER_PLAN, `${siste.perPlan.toFixed(1)} ms ved ${siste.n} plan`)
  ok(`leddarbeidet held seg under ${MS_PER_LEDD} ms per ledd`, siste.perLedd < MS_PER_LEDD, `${siste.perLedd.toFixed(2)} ms ved ${siste.ledd} ledd`)
}

/**
 * OG FORMA PÅ KURVA, som er det vakta eigentleg er til for.
 *
 * Snittinga er eitt plan om gongen og skal vera LINEÆR i talet på plan.
 * Prøva er difor DOBLINGA, på dei parallelle: dobbelt so mange plan skal
 * kosta dobbelt, ikkje fire gonger. Målt på rein kode ligg han på 1,89 til
 * 1,97 over mange køyringar — teorien seier 2,00, og han held seg der.
 *
 * Taket på 2,3 er rekna og ikkje gjetta. Legg nokon inn eit ledd som veks
 * kvadratisk og er berre HALVT so tungt som den lineære rekninga ved taket,
 * vert doblinga 2,40; er det like tungt, 2,67; er alt kvadratisk, 4,00. Ei
 * grense på 2,3 fangar difor sjølv den halve — og ligg framleis eit stykke
 * over det reine talet. Éin koeffisient per plan fanga ikkje det same: han
 * er ei brøk mellom to målingar med kvar sin støy, og ei innsprøyting som
 * dobla kostnaden per plan flytte han berre frå 14,6 til 28,7.
 */
const halv = rader.find((r) => r.n === 32)
if (halv && siste && halv !== siste && siste.n === halv.n * 2) {
  const dobling = siste.para / Math.max(1, halv.para)
  ok("snittinga er lineær: dobbelt so mange plan kostar dobbelt", dobling < 2.3, `${halv.para} → ${siste.para} ms (×${dobling.toFixed(2)}, lineært er 2,00)`)
}

/**
 * OG TAKET SKAL VERA NÅBART. Seksti og fire plan er det lista tek imot, og
 * det skal gje ein kropp med delar, ledd og ei pakking — ikkje eit unntak,
 * og ikkje null delar. Ei grense du ikkje kan gå heilt til er ei anna grense.
 */
{
  const full = maal(skrivPlan(rutenett(PLAN_TAK / 2, PLAN_TAK / 2)))
  ok(`taket på ${PLAN_TAK} plan er nåbart`, full.delar > 0 && full.ledd > 0, `${full.delar} delar, ${full.ledd} ledd`)
  const bag = { ...GRUNN, plan: skrivPlan(rutenett(PLAN_TAK / 2, PLAN_TAK / 2)) } as unknown as ParamBag
  const ark = MOTOR.exportFile(bag, "ark")
  ok("og kuttfila kjem ut av det", (ark.data?.byteLength ?? ark.text?.length ?? 0) > 0, `${ark.name}`)
}

console.log(brot ? `\n${brot} brot på taket` : "\ntaket held")
process.exit(brot ? 1 : 0)
