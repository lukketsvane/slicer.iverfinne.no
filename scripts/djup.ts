/**
 * DJUPSØKET — det lange trykket på finn-knappen.
 *
 * Det raske søket ser på tretten rutenett valde på ribbeAVSTAND, og
 * rangerer dei på kva som plar vera greitt. Djupsøket ser på alle tusen og
 * rangerer dei på kva NETT DENNE FORMA treng: kor mykje av henne ribbene
 * ber, og kor mange plater det tek.
 *
 * Det kviler på to påstandar, og båe er lette å tru på og umoglege å stole
 * på utan å måle:
 *
 *   1  at `truskap` MÅLER noko. Han skal vera 1 på ein kube uansett
 *      ribbetal — profilen er konstant, so éi prøve fortel alt — og han
 *      skal falle når ribbene vert færre på ei form som skifter. På ein
 *      kropp med bein skal han ikkje vera jamn i det heile: nokre
 *      ribbetal landar på beina, andre imellom, og eit søk som ikkje ser
 *      den skilnaden er eit søk som ikkje finn noko det raske ikkje fann.
 *
 *   2  at det VIDE steget er gratis og det SMALE er sant. Profilen skal
 *      kosta mindre enn éi snitting, og svara som kjem ut skal vera ekte
 *      snitta: dei skal halde dei harde reglane, og tala i dei skal vera
 *      dei same tala ei måling av det same punktet gjev.
 *
 *   npx tsx scripts/djup.ts
 */
import { makeKropp } from "../lib/kropp"
import { maalProfil, plateoverslag, truskap } from "../lib/profil"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { front, tune } from "../lib/forslag"
import { DEFAULT_PARAMS, lesLaas, plasser, type Params } from "../lib/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))


let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(48), sagt)
  if (!ok) feil++
}

/** ei kule: krum, men jamn — profilen hennar har ingen overraskingar */
function kule(r: number, seg: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  return makeSoup(new Float32Array(pos))
}

/** ein torus som står: dramatisk profil den eine vegen, roleg den andre */
function torus(R: number, r: number, n: number, m: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const u = (i / n) * Math.PI * 2
    const v = (j / m) * Math.PI * 2
    return [
      (R + r * Math.cos(v)) * Math.cos(u),
      (R + r * Math.cos(v)) * Math.sin(u),
      r * Math.sin(v),
    ]
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  return makeSoup(new Float32Array(pos))
}

/**
 * Ein kropp på fire bein. Han er heile grunnen til at profilen vert målt og
 * ikkje rekna: eit plan gjennom beina finn fire stykke, eit plan mellom dei
 * finn ingen ting, og kva av dei to du får er ikkje ein funksjon av kor
 * MANGE ribber du har — det er ein funksjon av kvar dei landar.
 */
function firbeint() {
  const out: number[] = []
  const boks = (w: number, d: number, h: number, ox: number, oy: number, oz: number) => {
    const p: [number, number, number][] = [
      [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
      [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h],
    ]
    const f = [
      [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
    ]
    for (const [a, b, c] of f) out.push(...p[a], ...p[b], ...p[c])
  }
  for (const [x, y] of [[-40, -18], [22, -18], [-40, 8], [22, 8]]) boks(18, 10, 60, x, y, 0)
  boks(100, 40, 40, -50, -20, 60)
  boks(26, 24, 46, 44, -12, 88)
  return makeSoup(new Float32Array(out))
}

put("d-kule", "kule", kule(50, 40))
put("d-torus", "torus", torus(50, 18, 48, 24))
put("d-firbeint", "firbeint", firbeint())

const par = (o: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...o }) as Params

/** truskapen langs éin akse for eit gjeve ribbetal */
function troFor(p: Params, akse: "x" | "y", n: number): number {
  const k = makeKropp(p)
  const pr = maalProfil(k)
  const i = akse === "x" ? 0 : 1
  const laas = lesLaas(p.laas)
  const vidd = k.solid.max[i] - k.solid.min[i]
  const ribber = plasser(n, akse === "x" ? laas.x : laas.y).map((t) => k.solid.min[i] + t * vidd)
  return truskap(pr, akse, ribber)
}

// =============================================================================
// PROFILEN MÅLER FORMA
// =============================================================================
console.log("\nprofilen måler forma")
{
  // Ein kube har konstant tverrsnitt. To ribber fortel alt om han, og
  // tretti fortel ikkje meir — so truskapen skal vera 1 heile vegen. Ein
  // profil som ikkje seier det, måler si eiga oppløysing.
  const kube = par({})
  const alle = [2, 3, 5, 8, 13, 21, 32].map((n) => troFor(kube, "x", n))
  sjekk(
    "ein kube er heil ved kvart einaste ribbetal",
    alle.every((t) => t > 0.995),
    alle.map((t) => t.toFixed(3)).join(" "),
  )

  // Ei kule skifter jamt, so fleire ribber skal alltid gje meir form.
  const k = par({ kjelde: "d-kule" })
  const kuler = [2, 4, 8, 16, 32].map((n) => troFor(k, "x", n))
  sjekk(
    "ei kule vert meir seg sjølv for kvar ribbe",
    kuler.every((t, i) => i === 0 || t > kuler[i - 1]),
    kuler.map((t) => t.toFixed(3)).join(" → "),
  )
  sjekk("og to ribber er langt frå nok", kuler[0] < 0.75, kuler[0].toFixed(3))

  // Ein torus som står er ikkje den same forma dei to vegane. Ser profilen
  // ikkje skilnaden, finn ikkje søket dei skeive rutenetta heller.
  const t = par({ kjelde: "d-torus", rotX: 90 })
  const tx = troFor(t, "x", 6)
  const ty = troFor(t, "y", 6)
  sjekk("ein ståande torus er ulik dei to vegane", Math.abs(tx - ty) > 0.05, `x ${tx.toFixed(3)}, y ${ty.toFixed(3)}`)

  // Og den eine påstanden ingen annan prøve dekkjer: på ein kropp med bein
  // er truskapen IKKJE stigande i ribbetalet. Eit plan som landar mellom
  // to bein finn mindre enn eitt som landar på dei, og det er nett den
  // skilnaden eit søk som berre tel ribber aldri kan sjå.
  const f = par({ kjelde: "d-firbeint" })
  const rad = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => troFor(f, "x", n))
  sjekk(
    "eit bein kan forsvinne av at det kjem ei ribbe TIL",
    rad.some((t, i) => i > 0 && t < rad[i - 1] - 0.01),
    rad.map((t) => t.toFixed(2)).join(" "),
  )
}

// =============================================================================
// OVERSLAGET
// =============================================================================
console.log("\noverslaget over plateforbruket")
{
  const p = par({ kjelde: "d-kule" })
  const k = makeKropp(p)
  const pr = maalProfil(k)
  const laas = lesLaas(p.laas)
  const vidd = k.solid.max[0] - k.solid.min[0]
  const xs = (n: number) => plasser(n, laas.x).map((t) => k.solid.min[0] + t * vidd)

  const ei = plateoverslag(pr, xs(4), [])
  const to = plateoverslag(pr, xs(8), [])
  sjekk("fleire ribber er meir plate", to > ei, `${(ei / 100).toFixed(0)} → ${(to / 100).toFixed(0)} cm²`)

  // Overslaget er profilen summert i ribbeplana, og profilen er kroppen.
  // Ei ribbe kan difor ikkje bera meir enn det største tverrsnittet han
  // har, og åtte kan ikkje bera meir enn åtte av dei.
  let storst = 0
  for (const a of pr.ax) if (a > storst) storst = a
  sjekk("og ingen ribbe er større enn kroppen sitt største snitt", to <= storst * 8 + 1, `${(to / 100).toFixed(0)} mot ${(storst * 8 / 100).toFixed(0)} cm²`)
}

// =============================================================================
// SVARA ER EKTE SNITTA
// =============================================================================
console.log("\nsvara er ekte snitta")
for (const [namn, over] of [
  ["kube", {}],
  ["kule", { kjelde: "d-kule" }],
  ["torus ståande", { kjelde: "d-torus", rotX: 90 }],
  ["firbeint", { kjelde: "d-firbeint" }],
] as [string, Partial<Params>][]) {
  const p = par(over)
  const t0 = Date.now()
  // Eit lite budsjett: påstandane her handlar om at svara er EKTE, og dei
  // gjeld like mykje for tolv snittingar som for to hundre. Breidda vert
  // prøvd for seg nedanfor.
  const alle = tune(p, true, 1500)
  const ms = Date.now() - t0

  sjekk(`${namn}: djupsøket svarar`, alle.length > 0, `${alle.length} svar på ${ms} ms`)
  if (!alle.length) continue

  // Fronten fyrst, resten etter, og båe sorterte med det beste fyrst.
  // Knappen tek det fyrste.
  const fr = new Set(front(alle))
  const fronten = alle.filter((q) => fr.has(q))
  const resten = alle.filter((q) => !fr.has(q))
  const sortert = (l: typeof alle) => l.every((q, i) => i === 0 || q.poeng <= l[i - 1].poeng)
  sjekk(
    `${namn}: fronten fyrst, sortert, beste fyrst`,
    sortert(fronten) &&
      sortert(resten) &&
      (!resten.length || alle.indexOf(resten[0]) > alle.indexOf(fronten[fronten.length - 1])),
    `${fronten.length} i fronten, ${resten.length} bak · ${alle[0].poeng.toFixed(1)} … ${alle[alle.length - 1].poeng.toFixed(1)}`,
  )

  // Og kvart svar seier SJØLV om han står i fronten. Det er det merket
  // panelet les — ei line i lista på benken, eit ord på telefonen — og
  // eit merke som ikkje stemmer med rekninga er verre enn ingen: det
  // seier «her sluttar det som er verdt å sjå på» på feil stad.
  sjekk(
    `${namn}: og kvar av dei veit om han står der`,
    alle.every((q) => q.fremst === fr.has(q)),
    `${alle.filter((q) => q.fremst).length} merkte, ${fronten.length} i fronten`,
  )

  // Kvart svar ber eit formtal. Det er heile skilnaden på dei to knappane,
  // og eit svar utan det er eit svar frå det raske søket på avvegar.
  sjekk(
    `${namn}: kvart svar seier kor mykje av forma det ber`,
    alle.every((q) => q.troskap > 0 && q.troskap <= 1),
    alle.map((q) => (q.troskap * 100).toFixed(0) + "%").join(" "),
  )

  // Og tala er ekte. Ei MÅLING av vinnaren skal seie det same som svaret
  // gjer — same delar, same ark — elles er lista ei gjetting med to
  // desimalar på.
  const beste = alle[0]
  const q = { ...p, ribbX: beste.ribbX, ribbY: beste.ribbY, ledd: beste.ledd }
  const m = measure(q)
  sjekk(
    `${namn}: vinnaren måler det han seier`,
    m.parts === beste.parts && m.sheets === beste.sheets && m.joints === beste.joints,
    `${beste.ribbX}×${beste.ribbY}: ${m.parts}/${beste.parts} delar, ${m.sheets}/${beste.sheets} ark, ${m.joints}/${beste.joints} ledd`,
  )

  // Ingen hard regel får vera broten. Eit svar som ikkje let seg lage er
  // ikkje eit svar.
  const brotne = checkRules(q, m).filter((r) => r.hard && !r.ok)
  sjekk(`${namn}: vinnaren held dei harde reglane`, brotne.length === 0, brotne.map((r) => r.id).join(" "))

  // Færrast plater fyrst i lista han vart bygd av: svaret på «kva får eg
  // på éi plate» skal ikkje stå bak svaret på «kva får eg på fire».
  sjekk(
    `${namn}: vinnaren tek ikkje fleire plater enn nokon annan`,
    alle.every((v) => v.sheets >= beste.sheets),
    `${beste.sheets} ark, minst i lista ${Math.min(...alle.map((v) => v.sheets))}`,
  )
}

// =============================================================================
// SØKET SER HUNDREVIS FOR ALVOR
// =============================================================================
/**
 * Det lange trykket lova hundrevis av ekte snittingar over heile fronten:
 * for kvart tal delar, dei beste rutenetta. Éin kropp med fullt budsjett
 * er nok til å halde løftet ærleg — og til å seie kva det kostar.
 */
console.log("\nsøket ser hundrevis for alvor")
{
  const p = par({ kjelde: "d-kule" })
  const t0 = Date.now()
  const alle = tune(p, true)
  const ms = Date.now() - t0
  const delar = new Set(alle.map((q) => q.parts))
  sjekk("djupsøket snittar hundrevis for alvor", alle.length >= 100, `${alle.length} svar på ${(ms / 1000).toFixed(1)} s`)
  sjekk("og dei spenner over fronten av delar", delar.size >= 20, `${delar.size} ulike deletal, ${Math.min(...delar)}–${Math.max(...delar)}`)
  // Fronten står fyrst: vinnaren er ikkje slegen på delar, plater, form og
  // kasta stykke av nokon annan, og ingen slegen står før ein uslegen.
  const f = new Set(front(alle))
  const beste = alle[0]
  const sisteUslegne = alle.reduce((n, q, i) => (f.has(q) ? i : n), -1)
  const fyrsteSlegne = alle.findIndex((q) => !f.has(q))
  sjekk(
    "fronten står fyrst, og vinnaren er ikkje slegen av nokon",
    f.has(beste) && f.size >= 30 && (fyrsteSlegne < 0 || fyrsteSlegne > sisteUslegne),
    `${f.size} i fronten av ${alle.length} · vinnar ${beste.ribbX}×${beste.ribbY}: ${beste.parts} delar, ${beste.sheets} ark, ${(beste.troskap * 100).toFixed(0)} % av forma`,
  )
}

// =============================================================================
// DET VIDE STEGET ER BILLIG
// =============================================================================
console.log("\ndet vide steget er billig")
{
  const p = par({ kjelde: "d-firbeint" })
  const k = makeKropp(p)
  const t0 = Date.now()
  maalProfil(k)
  const profil = Date.now() - t0

  const t1 = Date.now()
  measure({ ...p, plan: nett(8, 8), })
  const snitt = Date.now() - t1

  // Heile grunnen til at tavla kan vera tusen ruter: målinga kostar mindre
  // enn éi av dei snittingane ho sparer.
  sjekk("målinga av kroppen kostar under ei snitting", profil <= snitt, `${profil} ms mot ${snitt} ms`)
}

// =============================================================================
// DET DJUPE OG DET RASKE ER TO SPØRSMÅL
// =============================================================================
console.log("\ndet djupe og det raske er to spørsmål")
{
  // På ein ståande torus er profilen dramatisk den eine vegen og roleg den
  // andre. Det raske søket vel ribbetal på AVSTAND, so det held dei to
  // retningane like tette; djupsøket har inga slik binding og skal finne
  // noko det raske ikkje kan.
  const p = par({ kjelde: "d-torus", rotX: 90 })
  const rask = tune(p, false)
  const djup = tune(p, true, 1500)
  sjekk(
    "dei to gjev ikkje det same svaret på ein ståande torus",
    rask.length > 0 &&
      djup.length > 0 &&
      (rask[0].ribbX !== djup[0].ribbX || rask[0].ribbY !== djup[0].ribbY),
    `rask ${rask[0]?.ribbX}×${rask[0]?.ribbY}, djup ${djup[0]?.ribbX}×${djup[0]?.ribbY}`,
  )

  // Og det raske reknar ikkje truskap. Ikkje av di han ikkje kunne, men av
  // di målinga kostar meir enn han har råd til for eit tal han ikkje
  // rangerer på — og eit null som SER ut som eit måltal er verre enn
  // ingen.
  sjekk("det raske søket reknar ingen truskap", rask.every((q) => q.troskap === 0))
}

console.log(feil ? `\n${feil} BROT` : "\ndjupsøket held")
process.exit(feil ? 1 : 0)
