/**
 * KIKKEN — sida i ein ekte nettlesar, på begge flatene.
 *
 * Skjermbilete av kvar tilstand, og kvar einaste konsollfeil talt som brot.
 * Det harnesset spør om er det ingen typesjekk ser: kjem det eit objekt,
 * står det tal i hovudlina, vert eit plan låst når du ber om det, kjem fila
 * du slepte inn fram med namnet sitt, og gjev kvar uttaksknapp ei fil med
 * innhald i.
 *
 *   pnpm build && pnpm start -p 3210   (aldri dev: HMR under føtene ser ut som feil)
 *   PW_CHROMIUM=/opt/pw-browsers/chromium pnpm look [url]
 */
import { chromium, type Page } from "playwright"
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/export-stl"
import { glb } from "./glbfil"
import { rutenett, skrivPlan } from "../lib/plan"

// adressa frå miljøet, som i `panel`: eitt argument som tyder to ting er
// eitt argument for mykje
const URL = process.env.URL ?? process.argv[2] ?? "http://127.0.0.1:3210"
const HOVUDLINA = "[aria-label='plan, delar, ark og tid']"
const UT = "bilete"

const feil: string[] = []
const brot = (kva: string) => {
  feil.push(kva)
  console.log(`  !! ${kva}`)
}

/** arket seier sjølv når arbeidaren er ferdig */
const ferdig = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector("[aria-label='kontrollar']")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
const lina = async (page: Page) => (await page.locator(HOVUDLINA).innerText()).replace(/\s+/g, " ").trim()
const planTal = (s: string) => Number(/(\d+) plan/.exec(s)?.[1] ?? NaN)
/**
 * LINA SEIER EIT ORD FØR HO SEIER TALA.
 *
 * «prosjekt ope», «fann ikkje nettet», «kopiert» — ei melding står i lina i
 * fire sekund og dekkjer tala medan ho står. Ei vakt som les i det vindauget
 * les eit ord der ho venta eit tal, og fell på tidspunktet sitt og ikkje på
 * koden. Difor: vent til tala er der att.
 */
const talLina = async (page: Page, ms = 8000) => {
  const t0 = Date.now()
  let s = await lina(page)
  while (Date.now() - t0 < ms && Number.isNaN(planTal(s))) {
    await page.waitForTimeout(200)
    s = await lina(page)
  }
  return s
}

function kuleStl(r: number, seg: number): Buffer {
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
  const soup = makeSoup(new Float32Array(pos))
  const nrm = new Float32Array(soup.pos.length)
  for (let i = 0; i < nrm.length; i += 3) {
    const L = Math.hypot(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]) || 1
    nrm[i] = soup.pos[i] / L
    nrm[i + 1] = soup.pos[i + 1] / L
    nrm[i + 2] = soup.pos[i + 2] / L
  }
  return Buffer.from(meshToStl({ positions: soup.pos, normals: nrm, tris: soup.tris }, "kule"))
}

function eggGlb(r: number, seg: number): Buffer {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    // Y opp, som glTF krev, og vindinga snudd for det
    return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 1.5, r * Math.sin(ph) * Math.sin(th)]
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  return Buffer.from(new Uint8Array(glb(new Float32Array(pos), null, [{ mesh: 0 }], [0])))
}

async function flate(namn: string, w: number, h: number) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  const page = await browser.newPage({ viewport: { width: w, height: h }, acceptDownloads: true, hasTouch: w < 1180 })
  // Grensesnittet søv etter to sekund utan ei rørsle. Bileta her SKAL syne
  // kontrollane, so kikken seier at handa ligg på — som ein som sit med
  // telefonen. Søvnen er prøvd i `panel`, der handa er teken bort med vilje.
  await page.addInitScript(`setInterval(function () {
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
  }, 700)`)
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) brot(`${namn}: konsoll: ${m.text()}`)
  })
  page.on("pageerror", (e) => brot(`${namn}: sidefeil: ${String(e)}`))
  page.on("response", (r) => {
    if (r.status() >= 400 && !/\/favicon\.ico$|\/_vercel\//.test(r.url())) brot(`${namn}: ${r.status()} ${r.url()}`)
  })
  const benk = w >= 1180
  console.log(`\n=== ${namn} (${w}×${h}, ${benk ? "benk" : "ark"})`)

  await page.goto(URL, { waitUntil: "networkidle" })
  await ferdig(page)
  await page.waitForTimeout(800)
  const fyrst = await lina(page)
  console.log("  hovudlina:", fyrst)
  if (!/\d+ plan\s*·\s*\d+ delar\s*·\s*\d+ ark/.test(fyrst)) brot(`${namn}: hovudlina seier ikkje plan, delar og ark: «${fyrst}»`)
  await page.screenshot({ path: `${UT}/${namn}-1-lag.png` })

  // --- LÅS: skissa vert ein del, og talet i lina veks med eitt -------------
  const før = planTal(fyrst)
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  const etter = planTal(await lina(page))
  if (etter !== før + 1) brot(`${namn}: skjer gav ${etter} plan, venta ${før + 1}`)
  else console.log(`  skjer: ${før} → ${etter} plan`)

  // --- arket opnar seg, og lista er der -------------------------------------
  if (!benk) {
    await page.locator(HOVUDLINA).click()
    await page.waitForTimeout(500)
  }
  const rader = await page.locator("[role=listbox][aria-label='plan'] [role=option]").count()
  if (rader !== etter) brot(`${namn}: lista har ${rader} plan, lina seier ${etter}`)
  await page.screenshot({ path: `${UT}/${namn}-2-liste.png` })

  // --- slett det du nett låste --------------------------------------------
  await page.getByRole("button", { name: `slett plan ${etter}`, exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  if (planTal(await lina(page)) !== før) brot(`${namn}: slett tok ikkje planet bort`)

  // --- dei fire lesemåtane --------------------------------------------------
  // «lag» sist: resten av kikken står i rommet, og montasjen tek det over
  for (const v of ["flate", "kontur", "montasje", "lag"]) {
    // dei fire er ein `tablist` i topplina, og ikkje fire brytarar — kikken
    // leita etter knappar etter at dei vart faner, og stogga på den fyrste
    await page.getByRole("tab", { name: v, exact: true }).click()
    await ferdig(page)
    await page.waitForTimeout(1200)
    if (v !== "lag") await page.screenshot({ path: `${UT}/${namn}-3-${v}.png` })
  }

  // --- alt: skyvarane, tavla, uttaka ----------------------------------------
  if (!benk) {
    await page.getByRole("button", { name: "alle kontrollane" }).click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: `${UT}/${namn}-4-alt.png` })

  // --- import: fila kjem fram med namnet sitt, og plana er borte ------------
  const importer = async (fil: string, data: Buffer) => {
    const sti = join(UT, fil)
    writeFileSync(sti, data)
    await page.setInputFiles("input[type=file]", sti)
    await ferdig(page)
    await page.waitForTimeout(1500)
    const l = await talLina(page)
    const kjelde = (await page.locator("button[data-kjelde]").innerText()).trim()
    console.log(`  import ${fil}: ${kjelde} — ${l}`)
    if (!kjelde.toLowerCase().includes(fil.toLowerCase())) brot(`${fil}: filnamnet kom ikkje fram («${kjelde}»)`)
    // eit nytt nett tømmer lista: dei gamle plana var eit svar om ein annan kropp
    if (planTal(l) !== 0) brot(`${fil}: ${planTal(l)} plan står att etter import`)
  }
  await importer("prove.stl", kuleStl(60, 40))
  await importer("prove.glb", eggGlb(60, 40))
  await page.screenshot({ path: `${UT}/${namn}-5-import.png` })

  // --- og på det nye nettet kan du låse -------------------------------------
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  const l2 = await lina(page)
  if (planTal(l2) !== 1 || /\b0 delar/.test(l2)) brot(`${namn}: skjering på importert nett gav «${l2}»`)
  else console.log(`  skjer på egget: ${l2}`)

  // --- uttaka gjev filer med innhald ----------------------------------------
  for (const [chip, vent] of [
    ["passprøve", /^passprove-.*\.svg$/],
    ["ark", /\.svg$|\.zip$/],
    ["png", /\.png$|\.zip$/],
    ["dxf", /\.dxf$|\.zip$/],
    ["glb", /\.glb$/],
    ["flat", /-flat\.glb$/],
    ["3mf", /-delar\.3mf$/],
    ["usdz", /\.usdz$/],
    ["svg", /profilar\.svg$/],
  ] as [string, RegExp][]) {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: chip, exact: true }).click(),
    ])
    const fil = dl.suggestedFilename()
    const sti = join(UT, fil)
    await dl.saveAs(sti)
    const stor = statSync(sti).size
    console.log(`  uttak ${chip.padEnd(10)} → ${fil} (${stor} B)`)
    if (!vent.test(fil)) brot(`${chip}: uventa filnamn «${fil}»`)
    if (stor < 200) brot(`${chip}: fila er tom (${stor} B)`)
  }

  // --- KROPPEN ER EI LISTE, OG HAN OVERLEVER EI NY ØKT ---------------------
  /**
   * Menyen legg eit primitiv til det som alt står, og brikka tel bitane.
   * So vert sida opna på nytt, og kroppen skal vera den same. Han er det
   * berre om kjelda heiter det bytane heiter: var namnet ein teljar, ville
   * fila fått eit nytt eit ved importen, og biten i scena peikt på ingenting.
   *
   * TO GONGER, OG DET ER POENGET. MED lenkja i adressefeltet — det appen
   * sjølv legg der, og difor det som faktisk skjer når nokon lastar om — og
   * UTAN, som når ein PWA vert teken fram att. Lenkja og økta er ikkje to
   * vegar inn: lenkja ber innstillingane, økta ber nettet, og båe måtte
   * lesast. Vart berre den fyrste lesen, kom du attende til ribbene dine på
   * ein kube, og det var nett det som hende.
   */
  await page.locator("button[data-kjelde]").click()
  await page.waitForTimeout(300)
  await page.locator("[data-meny] button", { hasText: "kube" }).first().click()
  await ferdig(page)
  await page.waitForTimeout(1500)
  const kropp = (await page.locator("button[data-kjelde]").innerText()).trim()
  const scena = () => decodeURIComponent(page.url().split("#p=")[1] ?? "").match(/"scene":"([^"]*)"/)?.[1] ?? ""
  console.log(`  kroppen: ${kropp} — ${scena()}`)
  if (!/\+1$/.test(kropp)) brot(`${namn}: ei form til gav «${kropp}»`)
  const før4 = kropp
  const scene4 = scena()
  const attKropp = async (kva: string) => {
    await ferdig(page)
    // nettet vert lese om att i arbeidaren: vent på at kroppen er der, i
    // staden for på ei klokke
    await page
      .waitForFunction(() => (document.querySelector("button[data-kjelde]")?.textContent ?? "").includes("+"), undefined, { timeout: 20000 })
      .catch(() => undefined)
    await ferdig(page)
    await page.waitForTimeout(600)
    const att = (await page.locator("button[data-kjelde]").innerText()).trim()
    console.log(`  ${kva.padEnd(8)} ${att} — ${scena()}`)
    if (att !== før4 || scena() !== scene4) {
      brot(`${namn}: ${kva} kom attende som «${att}» (${scena()}) og ikkje «${før4}» (${scene4})`)
    }
  }
  await page.reload({ waitUntil: "networkidle" })
  await attKropp("med lenkje")
  await page.evaluate(() => { window.location.hash = "" })
  await page.reload({ waitUntil: "networkidle" })
  await attKropp("utan")

  /**
   * OG EI LENKJE FRÅ EIN ANNAN DREG INGENTING UT AV BASEN DIN.
   *
   * Ho må be om nøyaktig dei id-ane du har, og eit namn er bytane til fila.
   * Ber ho om eit du ikkje har, fell kroppen til kuben som han alltid har
   * gjort — og lina SEIER at det var eit nett ho ikkje fann, i staden for å
   * la deg tru at kuben er det nokon laga.
   */
  {
    const framand = "#p=" + encodeURIComponent(JSON.stringify({ kjelde: "fikkjemitt", storleik: 150 }))
    // ein hash åleine er inga ny side: `goto` til den same adressa byter
    // berre hashen, og då køyrer ingenting om att. Omlastinga er prøva.
    await page.goto(URL + framand, { waitUntil: "networkidle" })
    await page.reload({ waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(2500)
    const l = await lina(page)
    console.log(`  framand: ${(await page.locator("button[data-kjelde]").innerText()).trim()} — ${l}`)
    if (!/fann ikkje nettet/.test(l)) brot(`${namn}: ei lenkje til eit nett du ikkje har sa «${l}»`)
  }

  /**
   * PROSJEKTFILA ER EI ØKT SOM ALLE ANDRE.
   *
   * «lagre» skriv oppsettet og kvart nett i scena i eitt arkiv; slepp du det
   * inn att, står du der du gjekk frå. Men arkivet gjekk berre inn i
   * ARBEIDAREN, so ei omlasting etter «opna prosjekt» tok deg attende til
   * ein kube: fila du nett opna låg ikkje i basen. Prøva er difor ikkje at
   * ho opnar seg — det er at ho står der etter ei omlasting.
   */
  {
    // ein kropp med eit importert nett i, og eitt plan å kjenne han att på
    await page.goto(URL, { waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(1200)
    await importer("prosjekt.stl", kuleStl(70, 32))
    await page.getByRole("button", { name: "skjer", exact: true }).click()
    await ferdig(page)
    await page.waitForTimeout(800)
    // uttaka står i «alt» på telefonen; på benken står dei i kolonna
    if (!benk) {
      await page.locator(HOVUDLINA).click()
      await page.waitForTimeout(400)
      await page.getByRole("button", { name: "alle kontrollane" }).click()
      await page.waitForTimeout(500)
    }
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: "lagre", exact: true }).click(),
    ])
    const sti = join(UT, dl.suggestedFilename())
    await dl.saveAs(sti)
    console.log(`  prosjekt: ${dl.suggestedFilename()} (${statSync(sti).size} B)`)

    // tøm nettlesaren heilt, og opne arkivet på nytt
    await page.evaluate(() => new Promise<void>((ok) => { const r = indexedDB.deleteDatabase("slicer"); r.onsuccess = () => ok(); r.onerror = () => ok(); r.onblocked = () => ok() }))
    await page.goto(URL, { waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(1200)
    await page.setInputFiles("input[type=file]", sti)
    await ferdig(page)
    await page.waitForTimeout(2500)
    const ope = await talLina(page)
    console.log(`  opna:    ${(await page.locator("button[data-kjelde]").innerText()).trim()} — ${ope}`)
    if (planTal(ope) !== 1) brot(`${namn}: prosjektfila opna med ${planTal(ope)} plan`)

    await page.reload({ waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(3000)
    const att = await talLina(page)
    const kj = (await page.locator("button[data-kjelde]").innerText()).trim()
    console.log(`  omlasta: ${kj} — ${att}`)
    if (planTal(att) !== 1 || /^kube$/.test(kj)) brot(`${namn}: prosjektet overlevde ikkje ei omlasting — «${kj}», «${att}»`)
  }

  // --- BLINDGATA HAR EIN VEG UT: ei lenkje med for stort objekt -------------
  const brote = "#p=" + encodeURIComponent(JSON.stringify({ storleik: 1100, plan: skrivPlan(rutenett(3, 3)), arkB: 400, arkH: 300 }))
  await page.goto(URL + brote, { waitUntil: "networkidle" })
  await page.reload({ waitUntil: "networkidle" })
  await ferdig(page)
  await page.waitForTimeout(800)
  if (!benk) {
    // reglane og råda står i «alt», ikkje i midten
    await page.locator(HOVUDLINA).click()
    await page.waitForTimeout(500)
    await page.getByRole("button", { name: "alle kontrollane" }).click()
    await page.waitForTimeout(500)
  }
  const raad = page.locator("button[aria-label^='fiks ']")
  const n = await raad.count()
  await page.screenshot({ path: `${UT}/${namn}-6-blindgate.png` })
  if (!n) brot(`${namn}: ei broten regel utan råd`)
  else {
    const ord = await raad.first().getAttribute("aria-label")
    await raad.first().click()
    await ferdig(page)
    // reglane kjem i meldinga ETTER nettet, so «ferdig» er før dei er der
    await page.waitForFunction((n) => document.querySelectorAll("button[aria-label^='fiks ']").length < n, n, { timeout: 15000 }).catch(() => undefined)
    const att = await raad.count()
    console.log(`  råd «${ord}»: ${n} → ${att} knappar`)
    if (att >= n) brot(`${namn}: rådet «${ord}» tok ikkje brotet bort`)
  }

  await browser.close()
}

const main = async () => {
  mkdirSync(UT, { recursive: true })
  await flate("telefon", 390, 844)
  await flate("benk", 1320, 900)
  console.log(feil.length ? `\n${feil.length} brot` : "\nsida står")
  process.exit(feil.length ? 1 : 0)
}
void main()
