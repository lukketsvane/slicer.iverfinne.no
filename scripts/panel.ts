/**
 * PANELET — kontrollane i ein ekte nettlesar, på begge flatene.
 *
 * Kikken (`look.ts`) ser om sida står. Dette harnesset TEK I HENNE: låser
 * og slettar plan med knapp og tast, vel eit plan i lista, skisserer med to
 * fingrar (CDP-touch: dra og vri) og ser at planet som vert låst faktisk
 * flytta seg og vinkla seg, angrar, hentar framlegg og tek eitt, opnar
 * platene og snur ein del, les oppsettet som tekst. Alt vert lese attende
 * frå lenkja — ho ber parameterposen, og posen er sanninga.
 *
 *   pnpm build && pnpm start -p 3210
 *   PW_CHROMIUM=/opt/pw-browsers/chromium pnpm panel [url]
 */
import { chromium, type Browser, type Page } from "playwright"
import { lesPlan, skrivPlan } from "../lib/plan"
import type { Params } from "../lib/params"

const URL = process.argv[2] ?? "http://127.0.0.1:3210"
const HOVUDLINA = "[aria-label='plan, delar, ark og tid']"

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(50), sagt)
  if (!ok) feil++
}

const ferdig = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector("[aria-label='kontrollar']")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
/** parameterposen slik lenkja ber henne */
const hash = (page: Page): Params => {
  const h = page.url().split("#p=")[1]
  return h ? (JSON.parse(decodeURIComponent(h)) as Params) : ({} as Params)
}
const plana = (page: Page) => lesPlan(hash(page).plan)
const lina = async (page: Page) => (await page.locator(HOVUDLINA).innerText()).replace(/\s+/g, " ").trim()
const roleg = async (page: Page, ms = 500) => {
  await ferdig(page)
  await page.waitForTimeout(ms)
}
/** lenkja vert skriven litt etter handlinga; vent på at posen seier det ho skal */
const vent = async (page: Page, f: (p: Params) => boolean, ms = 10000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (f(hash(page))) break
    await page.waitForTimeout(100)
  }
  await roleg(page, 200)
}
const talPlan = (n: number) => (p: Params) => lesPlan(p.plan).length === n
/** arket i midten, med planlista synleg */
const midt = async (page: Page) => {
  if ((await page.locator("[role=listbox][aria-label='plan']").count()) === 0) {
    await page.locator(HOVUDLINA).click()
    await page.waitForTimeout(400)
  }
}

async function opne(url: string, browser: Browser, w: number, h: number) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 1180 })
  const konsoll: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) konsoll.push(m.text())
  })
  page.on("pageerror", (e) => konsoll.push(String(e)))
  await page.goto(url, { waitUntil: "networkidle" })
  await roleg(page, 800)
  return { page, konsoll }
}

/**
 * TO FINGRAR, GJENNOM CDP. Playwright har éin finger; skissa treng to.
 * `steg` gjev fingrane sine plassar frå 0 til 1.
 */
async function toFingrar(page: Page, steg: (t: number) => [[number, number], [number, number]], n = 12) {
  const cdp = await page.context().newCDPSession(page)
  const pkt = (t: number) => steg(t).map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 }))
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(0) })
  for (let i = 1; i <= n; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(i / n) })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}

async function telefon(browser: Browser) {
  console.log("\n=== telefon 390×844")
  const { page, konsoll } = await opne(URL, browser, 390, 844)

  // --- arket har tre høgder ---------------------------------------------------
  const liste = page.locator("[role=listbox][aria-label='plan']")
  sjekk("arket startar som éi line", (await liste.count()) === 0)
  // ikon ELLER ord på ein knapp, aldri begge: låsen er ikonet åleine
  const laasKnapp = page.getByRole("button", { name: "skjer", exact: true })
  sjekk("skjer-knappen er eit ikon utan tekst", (await laasKnapp.count()) === 1 && ((await laasKnapp.innerText()).trim() === ""), `«${(await laasKnapp.innerText()).trim()}»`)
  const kb = await laasKnapp.boundingBox()
  sjekk("og han ligg under høgre tommel: nedst til høgre, minst 56 px", !!kb && kb.x + kb.width / 2 > 390 * 0.6 && kb.y + kb.height / 2 > 844 * 0.6 && Math.min(kb.width, kb.height) >= 56, kb ? `${Math.round(kb.x)},${Math.round(kb.y)} ${Math.round(kb.width)}×${Math.round(kb.height)}` : "finst ikkje")
  // snittet er synleg før du skjer: skissa har ein profil gjennom kroppen
  const snitt = page.locator("[data-skisse='snitt']")
  await snitt.first().waitFor({ timeout: 15000 }).catch(() => undefined)
  sjekk("skissa syner snittet gjennom kroppen før du skjer", (await snitt.count()) >= 1)
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(500)
  sjekk("eit trykk på lina opnar midten, med planlista", (await liste.count()) === 1)
  await page.getByRole("button", { name: "alle kontrollane" }).click()
  await page.waitForTimeout(500)
  // Tala er DRAGSKIVER og ikkje tekstfelt: eit felt tek fokus, og iOS
  // zoomar sida. Difor `[aria-label$=", tal"]` og ikkje `input[…]`.
  const felt = await page.locator("[aria-label$=', tal'][role=slider]").count()
  sjekk("«alle kontrollane» syner skyvarane", felt >= 12, `${felt} dragskiver`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  sjekk("esc stengjer arket til lina", (await liste.count()) === 0)

  // --- TALA: tap-drag set verdien, ingen tekstfelt å zoome inn i ----------------
  await midt(page)
  const talet = page.locator("[aria-label='storleik, tal']")
  const tb = await talet.boundingBox()
  const sFør = hash(page).storleik
  if (tb) {
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    const cx = tb.x + tb.width / 2
    const cy = tb.y + tb.height / 2
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 6 * i, cy) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
  }
  await vent(page, (p) => p.storleik !== sFør)
  sjekk("tap-drag på talet set storleiken", hash(page).storleik > sFør, `${sFør} → ${hash(page).storleik}`)
  await page.keyboard.press("z")
  await vent(page, (p) => p.storleik === sFør)
  sjekk("ingen tekstfelt på sida å zoome inn i", (await page.locator("input:not([type=file]):not([type=range])").count()) === 0)

  // --- lås og slett, med knapp og med tast ------------------------------------
  const n0 = plana(page).length
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await vent(page, talPlan(n0 + 1))
  sjekk("skjer legg eitt plan i lenkja", plana(page).length === n0 + 1, `${n0} → ${plana(page).length}`)
  await midt(page)
  const nytt = plana(page)[plana(page).length - 1]
  sjekk("det nye planet har eit namn ingen har hatt", plana(page).filter((p) => p.id === nytt.id).length === 1 && nytt.id > n0, `namn ${nytt.id}`)
  sjekk("og lista har like mange rader", (await liste.locator("[role=option]").count()) === n0 + 1)

  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 2))
  sjekk("L skjer òg", plana(page).length === n0 + 2)
  await midt(page)

  const rad = liste.locator("[role=option]").last()
  await rad.locator("button").first().click()
  await page.waitForTimeout(300)
  sjekk("eit trykk på rada vel planet", (await rad.getAttribute("aria-selected")) === "true")
  sjekk("og den store knappen seier «ferdig»", (await page.getByRole("button", { name: "ferdig", exact: true }).count()) === 1)
  await page.keyboard.press("Backspace")
  await vent(page, talPlan(n0 + 1))
  sjekk("⌫ tek det valde planet bort", plana(page).length === n0 + 1)
  await midt(page)
  await page.getByRole("button", { name: `slett plan ${nytt.id}`, exact: true }).click()
  await vent(page, talPlan(n0))
  sjekk("× på rada tek planet bort", plana(page).length === n0 && !plana(page).some((p) => p.id === nytt.id))

  // --- angre --------------------------------------------------------------------
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  sjekk("Z angrar slettinga", plana(page).length === n0 + 1)
  await page.keyboard.press("Shift+Z")
  await vent(page, talPlan(n0))
  sjekk("⇧Z gjer slettinga om att", plana(page).length === n0)
  await page.getByRole("button", { name: "angre", exact: true }).first().click()
  await vent(page, talPlan(n0 + 1))
  sjekk("angre-knappen står øvst, der merket stod", plana(page).length === n0 + 1 && (await page.getByRole("button", { name: "gjer om", exact: true }).count()) >= 1 && (await page.locator("text=slicerman").count()) === 0)
  await page.keyboard.press("Shift+Z")
  await vent(page, talPlan(n0))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 2))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  sjekk("og tre til er attende ved starten", plana(page).length === n0)

  // --- GESTANE: klyp = synet, vri = vend, dra = flytt snittet ----------------
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  /**
   * KLYPET ER KAMERAET, IKKJE KROPPEN. Det skalerte objektet før: du ville
   * sjå nærare og fekk ein større krakk. Prøva spreier fingrane og krev at
   * kameraet kom nærare OG at storleiken står som han stod.
   */
  const kamDist = async () => Number((await page.locator(".handtak").getAttribute("data-avstand")) ?? 0)
  const s0 = hash(page).storleik
  const d0 = await kamDist()
  await toFingrar(page, (t) => [[195 - 30 - 70 * t, 380], [195 + 30 + 70 * t, 380]])
  await roleg(page, 600)
  const d1 = await kamDist()
  sjekk("to fingrar som spreier seg tek synet nærare", d1 < d0 - 0.2, `avstand ${d0.toFixed(2)} → ${d1.toFixed(2)}`)
  sjekk("og storleiken på kroppen står", hash(page).storleik === s0, `${s0} mm`)

  await toFingrar(page, (t) => {
    const a = (40 * t * Math.PI) / 180
    return [[195 - 80 * Math.cos(a), 380 - 80 * Math.sin(a)], [195 + 80 * Math.cos(a), 380 + 80 * Math.sin(a)]]
  })
  await vent(page, (p) => p.rotZ !== 0)
  sjekk("to fingrar som vrir vender objektet (rotZ)", hash(page).rotZ !== 0, `rotZ ${hash(page).rotZ}°`)
  await page.keyboard.press("z")
  await vent(page, (p) => p.rotZ === 0)

  // Skisseplanet står gjennom midten. Dra to fingrar sidelengs over objektet,
  // lås, og planet som vart låst står ikkje i midten lenger.
  await toFingrar(page, (t) => [[150 + 90 * t, 330], [150 + 90 * t, 430]])
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const flytt = plana(page)[plana(page).length - 1]
  const av = Math.hypot(flytt.o[0] - 0.5, flytt.o[1] - 0.5)
  sjekk("to fingrar sidelengs flyttar skissa: planet står ikkje i midten", av > 0.05, `o = ${flytt.o.map((c) => c.toFixed(2)).join(",")}`)
  sjekk("men det står framleis loddrett", Math.abs(flytt.n[2]) < 0.05, `n = ${flytt.n.map((c) => c.toFixed(2)).join(",")}`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  // --- SKISSE-MODUSEN: same to fingrane, men på planet -----------------------------
  const skisse = page.getByRole("button", { name: "skisse", exact: true })
  sjekk("«skisse» er ein knapp med tilstand", (await skisse.count()) === 1 && (await skisse.getAttribute("aria-pressed")) === "false")
  await skisse.click()
  await page.waitForTimeout(300)
  sjekk("og eit trykk slår han på", (await skisse.getAttribute("aria-pressed")) === "true")
  await toFingrar(page, (t) => {
    const a = (30 * t * Math.PI) / 180
    return [[195, 380], [195 + 80 * Math.cos(a), 380 + 80 * Math.sin(a)]]
  })
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const vriddS = plana(page)[plana(page).length - 1]
  sjekk("i skisse-modus vrir to fingrar planet, ikkje objektet", Math.abs(vriddS.n[2]) > 0.1 && hash(page).rotZ === 0, `n = ${vriddS.n.map((c) => c.toFixed(2)).join(",")}, rotZ ${hash(page).rotZ}`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  const s1 = hash(page).storleik
  await toFingrar(page, (t) => [[195 - 30 - 70 * t, 380], [195 + 30 + 70 * t, 380]])
  await page.waitForTimeout(400)
  sjekk("og eit knip rører ikkje storleiken der", hash(page).storleik === s1, `${s1} → ${hash(page).storleik}`)
  await page.keyboard.press("s")
  await page.waitForTimeout(300)
  sjekk("S slår skissa av att", (await skisse.getAttribute("aria-pressed")) === "false")

  // --- HANDTAKA: éin finger på handtaket flyttar og vrir --------------------------
  const flyttH = page.locator("[data-handtak='flytt']")
  const vriH = page.locator("[data-handtak='vri']")
  sjekk("skissa har eit handtak å flytte og eitt å vri", (await flyttH.count()) === 1 && (await vriH.count()) === 1)
  const boks = await vriH.boundingBox()
  if (boks) {
    const cx = boks.x + boks.width / 2
    const cy = boks.y + boks.height / 2
    await page.touchscreen.tap(cx, cy).catch(() => undefined)
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 60 * (i / 12), cy + 40 * (i / 12)) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(300)
    await page.keyboard.press("l")
    await vent(page, talPlan(n0 + 1))
    const vridd = plana(page)[plana(page).length - 1]
    sjekk("vrihandtaket vinklar skissa: planet står ikkje loddrett", Math.abs(vridd.n[2]) > 0.1, `n = ${vridd.n.map((c) => c.toFixed(2)).join(",")}`)
    await page.keyboard.press("z")
    await vent(page, talPlan(n0))
  }

  // --- eit valt plan tek gestane ---------------------------------------------
  // Standarden er tom: vakta skjer eitt plan å ta i.
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  await midt(page)
  const fyrst = plana(page)[0]
  await liste.locator("[role=option]").first().locator("button").first().click()
  await page.waitForTimeout(300)
  // lina lukkar arket utan å sleppe valet — esc ville sleppt det
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(400)
  const før = plana(page)
  await toFingrar(page, (t) => [[150 + 90 * t, 330], [150 + 90 * t, 430]])
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) !== JSON.stringify(fyrst.o))
  const etter = plana(page)[0]
  const rørt = Math.hypot(etter.o[0] - fyrst.o[0], etter.o[1] - fyrst.o[1], etter.o[2] - fyrst.o[2]) > 0.02
  sjekk("med eit plan valt flyttar to fingrar DET planet", rørt && etter.id === fyrst.id, `o ${fyrst.o.map((c) => c.toFixed(2))} → ${etter.o.map((c) => c.toFixed(2))}`)
  /**
   * OG KAMERAET STÅR MEDAN DEI GJER DET.
   *
   * Ei hand held aldri to fingrar nøyaktig like langt frå kvarandre medan ho
   * dreg. Prøva under dreg planet OG lèt fingrane gli frå kvarandre femten
   * prosent — meir enn nok til å låse opp klypet — og krev at avstanden til
   * kameraet er den same etterpå. Eit drag på planet er ikkje ein zoom.
   */
  const avstandNo = async () => Number((await page.locator(".handtak").getAttribute("data-avstand")) ?? 0)
  const kamFør = await avstandNo()
  const planStod = plana(page)[0]
  await toFingrar(page, (t) => {
    const glid = 50 + 7 * t
    return [[170 + 60 * t, 380 - glid], [170 + 60 * t, 380 + glid]]
  })
  await page.waitForTimeout(600)
  const kamEtter = await avstandNo()
  const planKom = plana(page)[0]
  const flytta = Math.hypot(planKom.o[0] - planStod.o[0], planKom.o[1] - planStod.o[1], planKom.o[2] - planStod.o[2])
  sjekk("og eit drag som glir frå kvarandre rører ikkje kameraet", Math.abs(kamEtter - kamFør) < 1e-3 && flytta > 0.005, `avstand ${kamFør.toFixed(3)} → ${kamEtter.toFixed(3)}, planet flytta ${flytta.toFixed(3)}`)
  await page.keyboard.press("z")
  await roleg(page, 300)
  sjekk("og dei andre står stille", plana(page).slice(1).every((p, i) => JSON.stringify(p) === JSON.stringify(før[i + 1])))
  await page.keyboard.press("z")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) === JSON.stringify(fyrst.o))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  // --- TEIKNE I PROFILEN: gods og hòl på eit valt plan ---------------------------
  // Standarden er tom, so vakta skjer sjølv det planet ho skal teikne i.
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  await midt(page)
  await liste.locator("[role=option]").first().locator("button").first().click()
  await page.waitForTimeout(300)
  const hol = page.getByRole("button", { name: "skjer hòl", exact: true })
  sjekk("eit valt plan får «skjer hòl» og «legg til gods» under tommelen", (await hol.count()) === 1 && (await page.getByRole("button", { name: "legg til gods", exact: true }).count()) === 1)
  const planFør = plana(page)[0]
  await hol.click()
  await vent(page, (p) => lesPlan(p.plan)[0]?.strek.length === 1)
  const medHol = plana(page)[0]
  sjekk("hòlet står i lenkja som ein strek på planet", medHol.strek.length === 1 && medHol.strek[0].slag === "hol", skrivPlan([medHol]).slice(0, 50))
  const flyttS = page.locator("[data-handtak='strek-flytt']")
  sjekk("streken har handtak: flytt, storleik, vri", (await flyttS.count()) === 1 && (await page.locator("[data-handtak='strek-storleik']").count()) === 1 && (await page.locator("[data-handtak='strek-vri']").count()) === 1)
  const sb = await flyttS.boundingBox()
  if (sb) {
    const cx = sb.x + sb.width / 2
    const cy = sb.y + sb.height / 2
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 40 * (i / 12), cy) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await vent(page, (p) => Math.abs((lesPlan(p.plan)[0]?.strek[0]?.x ?? 0) - medHol.strek[0].x) > 0.01)
    const flytta = plana(page)[0].strek[0]
    sjekk("handtaket flyttar hòlet, og lenkja veit det", Math.abs(flytta.x - medHol.strek[0].x) > 0.01, `x ${medHol.strek[0].x} → ${flytta.x}`)
    // draget må få falle på plass i angrestakken før neste endring, elles er
    // dei to éi bokføring — som er meint, men ikkje det vakta måler her
    await page.waitForTimeout(1400)
  }
  await page.keyboard.press("Backspace")
  await vent(page, (p) => lesPlan(p.plan)[0]?.strek.length === 0)
  // Bokføringa i angrestakken er dempa 450 ms — eit drag er hundre punkt og
  // éi endring. Vakta må la ho falle på plass før ho angrar.
  await page.waitForTimeout(1400)
  sjekk("⌫ tek streken bort, ikkje planet", plana(page)[0]?.strek.length === 0 && plana(page).length === n0 + 1 && plana(page)[0].id === planFør.id)
  /**
   * Z HENTAR STREKEN ATT — men ikkje prøvd her.
   *
   * Han gjer det: prøvd for hand, skjer → hòl → ⌫ → Z gjev hòlet attende.
   * Men etter eit HANDTAKSDRAG i same rekkja er dempinga på 450 ms og
   * arbeidaren si eiga svartid ikkje til å tidfeste utanfrå, og dei to
   * endringane fell i lag til éi bokføring like ofte som ikkje. Ei vakt som
   * er grøn halvparten av gongene er verre enn inga: ho lærer deg å sjå bort
   * frå henne. Draget og slettinga står prøvde kvar for seg over.
   */
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  // --- framlegga ----------------------------------------------------------------
  await midt(page)
  await page.getByRole("button", { name: "forslag", exact: true }).click()
  const kand = page.locator("button[aria-pressed]").filter({ hasText: /^\d+×\d+/ })
  // søket går kandidat for kandidat; vent til knappen seier at det er ferdig
  await page.locator("button[aria-label='forslag'][title^='(F)']").waitFor({ timeout: 90000 })
  await kand.first().waitFor({ timeout: 10000 })
  const tal = await kand.count()
  sjekk("forslag gjev ei liste", tal >= 3, `${tal} sett`)
  // det beste står alt valt når lista kjem; eit trykk på det slepper det
  const valt = page.locator("button[aria-pressed='true']").filter({ hasText: /^\d+×\d+/ })
  sjekk("og det beste er valt frå starten, som spøkjelsesplan", (await valt.count()) === 1)
  if ((await valt.count()) === 0) await kand.first().click()
  await page.waitForTimeout(200)
  const namn = (await valt.first().innerText()).trim()
  const m = /^(\d+)×(\d+)/.exec(namn)
  // kva som stod FØR framlegget — det er dit Z skal ta oss, og det treng
  // ikkje vera det same som ved starten av prøva
  const førFramlegg = plana(page).length
  await page.getByRole("button", { name: "ta alle", exact: true }).click()
  await vent(page, (p) => !!m && lesPlan(p.plan).length === Number(m[1]) + Number(m[2]))
  sjekk("«ta alle» set nett dei plana", !!m && plana(page).length === Number(m[1]) + Number(m[2]), `${namn} → ${plana(page).length} plan`)
  await page.keyboard.press("z")
  await vent(page, talPlan(førFramlegg))
  sjekk("og Z tek det attende", plana(page).length === førFramlegg, `${plana(page).length} plan`)
  // «lat att» legg framlegga bort og syner planlista att
  const latAtt = page.getByRole("button", { name: "lat att", exact: true })
  if (await latAtt.count()) await latAtt.click()
  await page.waitForTimeout(300)
  sjekk("«lat att» syner planlista att", (await liste.count()) === 1)

  // --- verktya: platene, kuttlista, oppsettet ----------------------------------
  /** arket ope med «alt»: storleiken står alt i midten, verktya står i alt */
  const alt = async () => {
    await midt(page)
    if ((await page.getByRole("button", { name: "plater", exact: true }).count()) === 0) {
      await page.getByRole("button", { name: "alle kontrollane" }).click()
      await page.waitForTimeout(400)
    }
  }
  await alt()
  sjekk("arket er ope med alt", (await page.getByRole("button", { name: "plater", exact: true }).count()) === 1)
  await page.getByRole("button", { name: "plater", exact: true }).click()
  const verkty = page.locator("section[aria-label='verkty']")
  await verkty.waitFor({ timeout: 10000 })
  await roleg(page)
  const delar = verkty.locator("g[data-del]")
  const nDel = await delar.count()
  sjekk("platene syner delane som noko du kan ta i", nDel > 0, `${nDel} delar på plata`)
  const adr = await delar.first().getAttribute("data-del")
  await delar.first().dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, buttons: 1 })
  await page.waitForTimeout(700)
  await delar.first().dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, buttons: 0 })
  const meny = page.getByRole("dialog", { name: `del ${adr}` })
  const harMeny = (await meny.count()) === 1
  sjekk("hald på ein del opnar menyen hans", harMeny, `del ${adr}`)
  if (harMeny) {
    await meny.getByRole("button", { name: /snu/ }).first().click()
    await vent(page, (p) => !!p.fest)
    sjekk("«snu» festar delen, med kvartsving, i lenkja", new RegExp(`(^|;)${adr}:\\d+,[123],`).test(hash(page).fest), hash(page).fest.slice(0, 40))
    await page.keyboard.press("z")
    await roleg(page)
  }
  // menyen ligg over alt til du trykkjer utanfor han
  const bak = page.locator("div[aria-hidden='true'].fixed.inset-0")
  if (await bak.count()) await bak.dispatchEvent("pointerdown")
  await page.waitForTimeout(200)
  await page.getByRole("button", { name: "lat att verktyet" }).click()
  await page.waitForTimeout(300)
  sjekk("«lat att» stengjer verktyet", (await verkty.count()) === 0)

  await alt()
  await page.getByRole("button", { name: "oppsett", exact: true }).click()
  await verkty.waitFor({ timeout: 10000 })
  const tekstfelt = page.locator("textarea[aria-label='alle innstillingane som tekst']")
  const tekst = await tekstfelt.inputValue()
  sjekk("oppsettet som tekst ber plana", /\bplan\b/.test(tekst) && tekst.includes("@"), `${tekst.length} teikn`)
  sjekk("og feltet er lese-berre, med kopier og lim inn som knappar", (await tekstfelt.getAttribute("readonly")) !== null && (await page.getByRole("button", { name: "kopier", exact: true }).count()) === 1 && (await page.getByRole("button", { name: "lim inn", exact: true }).count()) === 1)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

  await alt()
  await page.getByRole("button", { name: "kuttliste", exact: true }).click()
  await verkty.waitFor({ timeout: 10000 })
  const kutt = (await verkty.innerText()).replace(/\s+/g, " ")
  sjekk("kuttlista har éi line per del, med plan og ledd", /ledd/i.test(kutt) && /\b1\b/.test(kutt), kutt.slice(0, 60))
  await page.keyboard.press("Escape")

  // --- SYNSKUBEN, INNRAMMINGA OG DOBBELTTRYKKET -------------------------------
  /**
   * Kameraet står i lappen scena skriv kvar teikning (`data-kamera`), so
   * her kan ein LESE kva synet gjer: at ei side set det, at innramminga tek
   * det heim att — og at eit dobbelttrykk ikkje rører det. Det siste er
   * heile poenget: innramminga skal kome av at du bad om henne.
   */
  await page.keyboard.press("Escape")
  await roleg(page, 400)
  const kamera = async (): Promise<[number, number, number]> => {
    const s = (await page.locator(".handtak").getAttribute("data-kamera")) ?? "0,0,0"
    return s.split(",").map(Number) as [number, number, number]
  }
  /**
   * SYNSKUBEN er geometri i lerretet no (`GizmoViewcube` frå drei) og ikkje
   * knappar i DOM: han vert prøvd med fingeren der han står, og svaret vert
   * lese av kameraet scena skriv i lappen. Midten av kuben er sida som
   * vender mot deg; hjørnet hans er synet frå tre sider på ein gong.
   */
  const h = await page.locator("header").boundingBox()
  const v = page.viewportSize()!
  // dei same tala som marginen i scena: 38 px inn frå det frie bandet
  const kx = v.width - 38
  const ky = (h?.height ?? 44) + 38
  await page.locator("[data-heim]").click()
  await page.waitForTimeout(900)
  const kubeFør = await kamera()
  await page.touchscreen.tap(kx, ky)
  await page.waitForTimeout(1700)
  const framme = await kamera()
  sjekk("eit tapp midt på synskuben ser rett framanfrå", Math.abs(framme[0]) < 0.5 && framme[2] > 10, `${kubeFør.map((c) => c.toFixed(1)).join(", ")} → ${framme.map((c) => c.toFixed(2)).join(", ")}`)
  await page.touchscreen.tap(kx + 14, ky - 14)
  await page.waitForTimeout(1700)
  const hjorne = await kamera()
  sjekk("og eit tapp på hjørnet hans ser frå tre sider", Math.min(...hjorne) > 1 && Math.max(...hjorne) - Math.min(...hjorne) < 1, hjorne.map((c) => c.toFixed(2)).join(", "))

  await page.locator("[data-heim]").click()
  await page.waitForTimeout(700)
  const heim = await kamera()
  sjekk("innramminga tek synet heim att", heim[1] > 0 && heim[2] > Math.abs(heim[0]), heim.map((c) => c.toFixed(2)).join(", "))
  // eit dobbelttrykk på objektet: to korte trykk, same staden
  await page.touchscreen.tap(195, 380)
  await page.waitForTimeout(90)
  await page.touchscreen.tap(195, 380)
  await page.waitForTimeout(900)
  const kEtter = await kamera()
  const kSprang = Math.hypot(kEtter[0] - heim[0], kEtter[1] - heim[1], kEtter[2] - heim[2])
  sjekk("eit dobbelttrykk rammar IKKJE inn på nytt", kSprang < 1e-3, `${kSprang.toFixed(4)} frå der det stod`)

  // --- KONTUREN ER EI TEIKNING, OG EI TEIKNING SER EIN PÅ TETT ---------------
  /**
   * I kroppen står kameraet aldri nærare enn MIN_DIST — nærare er inni
   * objektet. Konturen er flat, og der er den same grensa berre ein grense:
   * eit spor på tre millimeter i eit omriss på ein halvmeter er fire pikslar,
   * og då må ein kunne gå heilt inn. Avstanden står i lappen scena skriv.
   */
  const avstand = async () => Number((await page.locator(".handtak").getAttribute("data-avstand")) ?? 0)
  await page.getByRole("button", { name: "kontur", exact: true }).click()
  await roleg(page, 900)
  const naerFør = await avstand()
  await page.mouse.move(195, 380)
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, -90)
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(900)
  const naerEtter = await avstand()
  // MIN_DIST er 3,2 og MIN_NAER 0,45: heilt inn, og ikkje forbi
  sjekk("konturen kan zoomast inn forbi kroppen si grense", naerEtter < 1 && naerEtter >= 0.4, `${naerFør.toFixed(2)} → ${naerEtter.toFixed(2)}`)
  await page.getByRole("button", { name: "lag", exact: true }).click()
  await roleg(page, 900)

  // --- SKALET ER GJENNOMSIKTIG, OG BLIR VERANDE DET -------------------------
  /**
   * Kroppen er den same geometrien i «flate» og i «lag», men med materialet
   * som prop det eine stadet og som barn det andre. Byter eitt element
   * mellom dei to, sit instansen att med standardmaterialet — kvitt og tett
   * — og skalet legg seg over delane som ei maling. Prøva er at biletet er
   * NØYAKTIG det same før og etter ein tur innom «flate».
   */
  const klipp = { x: 30, y: 150, width: 330, height: 420 }
  const skalFør = await page.screenshot({ clip: klipp })
  await page.getByRole("button", { name: "flate", exact: true }).click()
  await roleg(page, 1200)
  await page.getByRole("button", { name: "lag", exact: true }).click()
  await roleg(page, 1200)
  const skalEtter = await page.screenshot({ clip: klipp })
  sjekk("ein tur innom «flate» let skalet stå som det stod", skalFør.equals(skalEtter), `${skalFør.length} B → ${skalEtter.length} B`)

  // --- KROPPEN ER EI LISTE: menyen legg til eit primitiv ----------------------
  const kjelde = page.locator("button[data-kjelde]")
  sjekk("kjelda står i toppen med namn", (await kjelde.isVisible()) && (await kjelde.innerText()).trim() === "kube")
  await kjelde.click()
  await page.waitForTimeout(250)
  const meny2 = page.locator("[data-meny]")
  sjekk("og opnar lista med dei fem primitiva og fila", (await meny2.count()) === 1 && (await meny2.getByRole("button").count()) === 6)
  await meny2.getByRole("button", { name: "kule", exact: true }).click()
  await vent(page, (p) => !!p.scene)
  sjekk("ein kule vert lagd til kroppen", /kube@.*;kule@/.test(hash(page).scene ?? ""), (hash(page).scene ?? "").slice(0, 40))
  sjekk("og brikka seier kor mange bitar han er", (await kjelde.innerText()).trim() === "kube +1")
  await page.keyboard.press("z")
  await vent(page, (p) => !p.scene)
  sjekk("angre tek biten bort att", !hash(page).scene, `«${hash(page).scene ?? ""}»`)

  sjekk("ingen konsollfeil på telefonen", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

async function benk(browser: Browser) {
  console.log("\n=== benk 1400×900")
  const { page, konsoll } = await opne(URL, browser, 1400, 900)
  sjekk("kolonna står", (await page.locator("aside[aria-label='kontrollar']").count()) === 1)

  for (const [tast, view] of [["1", "flate"], ["3", "kontur"], ["2", "lag"]] as const) {
    await page.keyboard.press(tast)
    await roleg(page, 300)
    sjekk(`tast ${tast} vel «${view}»`, (await page.getByRole("button", { name: view, exact: true }).getAttribute("aria-pressed")) === "true")
  }

  const n0 = plana(page).length
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  sjekk("L skjer på benken", plana(page).length === n0 + 1)
  await page.locator("[role=listbox][aria-label='plan'] [role=option]").last().locator("button").first().click()
  await page.keyboard.press("Delete")
  await vent(page, talPlan(n0))
  sjekk("Delete tek det valde bort", plana(page).length === n0)

  // storleiken er eit tal du DREG i, ikkje skriv: eit tekstfelt zoomar sida
  const felt = page.locator("[aria-label='storleik, tal']")
  const fb = await felt.boundingBox()
  const s0b = hash(page).storleik
  if (fb) {
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(fb.x + fb.width / 2 + 8 * i, fb.y + fb.height / 2)
    await page.mouse.up()
  }
  await vent(page, (p) => p.storleik !== s0b)
  sjekk("dra i talet set storleiken", hash(page).storleik > s0b, `${s0b} → ${hash(page).storleik}`)
  sjekk("og talet er ikkje eit tekstfelt", (await page.locator("input[aria-label='storleik, tal']").count()) === 0)
  sjekk("og plana står der dei stod", plana(page).length === n0 && plana(page).every((q, i) => JSON.stringify(q) === JSON.stringify(plana(page)[i])))
  await page.keyboard.press("z")
  await vent(page, (p) => p.storleik === s0b)

  await page.keyboard.press("f")
  const kand = page.locator("button[aria-pressed]").filter({ hasText: /^\d+×\d+/ })
  await page.locator("button[aria-label='forslag'][title^='(F)']").waitFor({ timeout: 90000 })
  await kand.first().waitFor({ timeout: 10000 })
  sjekk("F hentar framlegg", (await kand.count()) >= 3)

  sjekk("ingen konsollfeil på benken", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

/**
 * FLYTEN PÅ TELEFONEN SLIK HO STÅR PÅ HEIMSKJERMEN.
 *
 * Målet er ein PWA på iPhone 16e, lagra og opna frå heimskjermen. Det er
 * ikkje det same som «sida i Safari»: statuslina ligg over toppen, det finst
 * ingen adresselinje å rulle bort, eit felt under seksten pikslar zoomar
 * sida inn når det får fokus, og alt som ikkje er nådd med éin tumme er
 * ikkje nådd. Harnesset går flyten frå fyrste opning til fyrste låste plan
 * som ein ny brukar, og måler det som kan målast utan ei ekte iPhone.
 */
async function flyt(browser: Browser) {
  console.log("\n=== flyten på heimskjermen (iPhone 16e)")
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  })
  const page = await ctx.newPage()
  const konsoll: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) konsoll.push(m.text())
  })
  page.on("pageerror", (e) => konsoll.push(String(e)))
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: "domcontentloaded" })
  await page.locator("[aria-label='kontrollar']").waitFor({ timeout: 30000 })
  const tSide = Date.now() - t0
  await page.waitForFunction(() => /\d+ plan/.test(document.querySelector("[aria-label='plan, delar, ark og tid']")?.textContent ?? ""), undefined, { timeout: 45000 })
  const tTal = Date.now() - t0
  sjekk("fyrste tal i lina innan fem sekund", tTal < 5000, `side ${tSide} ms, tal ${tTal} ms`)

  // --- det ein PWA treng i hovudet på sida --------------------------------------
  const meta = await page.evaluate(() => ({
    viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "",
    capable: !!document.querySelector("meta[name='apple-mobile-web-app-capable'][content=yes], meta[name='mobile-web-app-capable'][content=yes]"),
    manifest: !!document.querySelector("link[rel=manifest]"),
    ikon: !!document.querySelector("link[rel='apple-touch-icon']"),
    tema: !!document.querySelector("meta[name=theme-color]"),
  }))
  sjekk("viewport-fit=cover, so innhaldet går under statuslina med vilje", /viewport-fit=cover/.test(meta.viewport), meta.viewport)
  // Telefonen er det einaste målet: ingenting kan forstørrast, merkjast eller rullast.
  sjekk("sida kan ikkje forstørrast (maximum-scale=1, user-scalable=no)", /maximum-scale=1/.test(meta.viewport) && /user-scalable=no/.test(meta.viewport), meta.viewport)
  const merkbart = await page.evaluate(() => {
    const ut: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>("body, button, p, span, h3, li, textarea, label, div")) {
      if (e.getBoundingClientRect().width === 0) continue
      const st = getComputedStyle(e)
      const sel = (st as unknown as { webkitUserSelect?: string }).webkitUserSelect || st.userSelect
      if (sel !== "none") ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${sel}`)
      if (ut.length > 5) break
    }
    return ut
  })
  sjekk("ingenting kan merkjast (user-select: none overalt)", merkbart.length === 0, merkbart.join(" · "))
  const rulling = await page.evaluate(() => {
    const h = getComputedStyle(document.documentElement)
    const b = getComputedStyle(document.body)
    return { html: `${h.overflow}/${h.position}`, body: `${b.overflow}/${b.overscrollBehavior}` }
  })
  sjekk("html og body er faste og utan rulling", /hidden/.test(rulling.html) && /fixed/.test(rulling.html) && /hidden/.test(rulling.body) && /none/.test(rulling.body), JSON.stringify(rulling))
  const laust = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, input, a, canvas, [data-handtak]")]
      .filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).touchAction === "auto")
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}`)
      .slice(0, 5),
  )
  sjekk("ingen kontroll med touch-action: auto (dobbelttrykk-zoom)", laust.length === 0, laust.join(" · "))
  // Flatt: ingen skugge, glød, forstørring eller animasjon på ein knapp.
  const pynt = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, [data-handtak], [aria-label='kontrollar']")]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ n: `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}`, st: getComputedStyle(e) }))
      .filter(({ st }) => st.boxShadow !== "none" || st.animationName !== "none" || st.filter !== "none" || st.backgroundImage !== "none")
      .map(({ n }) => n)
      .slice(0, 6),
  )
  sjekk("flate knappar: ingen skugge, glød, gradient eller animasjon", pynt.length === 0, pynt.join(" · "))
  // Ord og tal, ikkje setningar: ingen knapp seier meir enn tre ord.
  // Hovudlina er TAL og ikkje ei setning — «12 plan · 12 delar · 2 ark» er
  // fire avlesingar, ikkje fire ord prosa. Ho er den eine som er unnateken.
  const ordrike = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button")]
      .filter((e) => e.getBoundingClientRect().width > 0 && e.getAttribute("aria-label") !== "plan, delar, ark og tid")
      .map((e) => (e.textContent ?? "").trim())
      .filter((t) => t.split(/[\s·]+/).filter(Boolean).length > 3)
      .slice(0, 4),
  )
  sjekk("ingen knapp ber ei setning", ordrike.length === 0, ordrike.join(" | ").slice(0, 120))
  sjekk("kan lagrast på heimskjermen: capable, manifest, ikon, tema", meta.capable && meta.manifest && meta.ikon && meta.tema, JSON.stringify(meta))

  // --- sida rullar ikkje, korkje opp-ned eller sidelengs, i nokon høgd ---------
  const rull = () => page.evaluate(() => ({
    h: document.documentElement.scrollHeight - window.innerHeight,
    w: document.documentElement.scrollWidth - window.innerWidth,
  }))
  const r0 = await rull()
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(400)
  const r1 = await rull()
  await page.getByRole("button", { name: "alle kontrollane" }).click()
  await page.waitForTimeout(400)
  const r2 = await rull()
  sjekk("dokumentet rullar aldri", [r0, r1, r2].every((r) => r.h <= 0 && r.w <= 0), JSON.stringify([r0, r1, r2]))
  // Arket ligg INNANFOR skjermen i alle tre høgdene, og alt i det òg. På ein
  // ekte iPhone stakk det ut til venstre: etikettane las «IK» og «ana grip».
  const utanfor = await page.evaluate(() => {
    const ut: string[] = []
    const W = window.innerWidth
    for (const e of document.querySelectorAll<HTMLElement>("[aria-label='kontrollar'], [aria-label='kontrollar'] *")) {
      const r = e.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.left < -0.5 || r.right > W + 0.5) ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${Math.round(r.left)}..${Math.round(r.right)}`)
      if (ut.length > 4) break
    }
    return ut
  })
  sjekk("arket og alt i det ligg innanfor skjermen", utanfor.length === 0, utanfor.join(" · "))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(400)
  sjekk("midten er storleik og planlista, ingen reglar", (await page.locator("[aria-label='kontrollar'] button[aria-label^='fiks ']").count()) === 0 && (await page.locator("[role=listbox][aria-label='plan']").count()) === 1)

  // --- trykkflatene: alt som kan trykkjast er stort nok for ein tumme ----------
  const smaa = await page.evaluate(() => {
    const ut: string[] = []
    for (const b of document.querySelectorAll<HTMLElement>("button, [role=button], input[type=range], [data-handtak]")) {
      const r = b.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const st = getComputedStyle(b)
      // padding tel med i trykkflata; eit «hit»-pseudo-element òg, men det kan vi ikkje måle her
      if (Math.min(r.width, r.height) < 36 && !b.classList.contains("hit") && st.visibility !== "hidden") {
        ut.push(`${(b.getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 18)} ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return ut
  })
  sjekk("ingen trykkflate under 36 px utan utvida treffsone", smaa.length === 0, smaa.slice(0, 6).join(" · "))

  // --- felt som iOS ville zooma inn på -----------------------------------------
  const smaaFelt = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input:not([type=range]):not([type=file]), textarea")]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ n: e.getAttribute("aria-label") ?? e.tagName, px: parseFloat(getComputedStyle(e).fontSize) })),
  )
  const zoomar = smaaFelt.filter((f) => f.px < 16)
  sjekk("ingen tekstfelt under 16 px (iOS zoomar inn på fokus)", zoomar.length === 0, zoomar.slice(0, 4).map((f) => `${f.n} ${f.px}px`).join(" · ") || `${smaaFelt.length} felt`)

  // --- flyten: ny brukar, éin tumme ----------------------------------------------
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  // Ingen rettleiing og inga hintline: grensesnittet er handlingar og tal.
  const prosa = await page.locator("text=/knip = storleik|éin finger snur|slik skjer du/i").count()
  sjekk("ingen introtekst på skjermen", prosa === 0)
  // éin finger snur objektet
  await page.touchscreen.tap(195, 300)
  const cdp = await page.context().newCDPSession(page)
  const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(120, 380) })
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(120 + 12 * i, 380) })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(400)
  const n0 = plana(page).length
  const t1 = Date.now()
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await vent(page, talPlan(n0 + 1))
  await page.waitForFunction((n) => new RegExp(`${n} plan`).test(document.querySelector("[aria-label='plan, delar, ark og tid']")?.textContent ?? ""), n0 + 1, { timeout: 15000 })
  sjekk("skjer svarar i lina innan to sekund", Date.now() - t1 < 2000, `${Date.now() - t1} ms`)
  // uttaket er eitt trykk unna lina
  const eksport = page.getByRole("button", { name: "eksport", exact: true })
  sjekk("eksport ligg på lina", (await eksport.count()) === 1)
  if (await eksport.count()) {
    await eksport.click()
    await page.waitForTimeout(300)
    sjekk("og opnar uttaka med eitt trykk", (await page.getByRole("button", { name: "ark", exact: true }).count()) >= 1)
    await page.keyboard.press("Escape")
  }
  // og fila du la inn står i toppen, eitt trykk frå å byte
  sjekk("kjelda står synleg med namn, eitt trykk frå å byte", (await page.locator("button[data-kjelde]").first().isVisible()))

  sjekk("ingen konsollfeil i flyten", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await ctx.close()
}

/**
 * MØRKT ER SVART. Ingen brytar: systemet seier det, og sida fylgjer.
 * Fargane står i fire token i `globals.css`, og prøva her er at dei —
 * og berre dei — bestemmer kva flatene vert. Ei flate som er mørkegrå
 * er ein farge nokon har skrive ein annan stad.
 */
async function mork(browser: Browser) {
  console.log("\n=== mørkt (systemet står mørkt)")
  const side = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "dark" })
  const konsoll: string[] = []
  side.on("pageerror", (e) => konsoll.push(String(e)))
  await side.goto(URL, { waitUntil: "networkidle" })
  await roleg(side, 800)
  const token = await side.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return {
      paper: s.getPropertyValue("--paper").trim(),
      ink: s.getPropertyValue("--ink").trim(),
      body: getComputedStyle(document.body).backgroundColor,
      skjema: s.colorScheme,
    }
  })
  // nettlesaren kortar ned #000000 til #000 når han les tokenet attende
  const hex = (v: string) => v.replace(/^#([0-9a-f])\1?([0-9a-f])\2?([0-9a-f])\3?$/i, "#$1$1$2$2$3$3").toLowerCase()
  sjekk("papiret er svart og blekket kvitt", hex(token.paper) === "#000000" && hex(token.ink) === "#ffffff", JSON.stringify(token))
  sjekk("og sida er svart, ikkje mørkegrå", token.body === "rgb(0, 0, 0)", token.body)
  sjekk("color-scheme seier frå til nettlesaren", /dark/.test(token.skjema), token.skjema)
  // Flatene som ber grensesnittet skal vera papiret sjølv — ikkje ein grå
  // tone nokon har skrive i ein komponent.
  const graa = await side.evaluate(() => {
    const ut: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>("header, [aria-label='kontrollar'], section[aria-label='verkty'], .tumme button, [data-kjelde], [data-heim]")) {
      const bg = getComputedStyle(e).backgroundColor
      const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(bg)
      if (!m) continue
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
      // svart, kvitt eller heilt gjennomsiktig er greitt; alt imellom er ein gråtone
      const kant = (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
      if (!kant && !/rgba\(0, 0, 0, 0\)/.test(bg)) ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${bg}`)
    }
    return ut
  })
  sjekk("ingen flate er ein gråtone", graa.length === 0, graa.slice(0, 4).join(" · "))
  // og lerretet tek den same fargen: teiknar han kvitt, blinkar sida
  const lerret = await side.evaluate(() => {
    const c = document.querySelector("canvas")
    if (!c) return "ikkje noko lerret"
    const g = c.getContext("webgl2") ?? c.getContext("webgl")
    if (!g) return "ingen kontekst"
    const px = new Uint8Array(4)
    ;(g as WebGLRenderingContext).readPixels(4, 4, 1, 1, 5121 /* UNSIGNED_BYTE */, 6408 /* RGBA */, px)
    return `${px[0]},${px[1]},${px[2]}`
  })
  sjekk("lerretet er svart i hjørnet", lerret === "0,0,0" || lerret === "ikkje noko lerret", lerret)
  sjekk("ingen konsollfeil i mørkt", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await side.close()
}

const main = async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  await telefon(browser)
  await flyt(browser)
  await mork(browser)
  await benk(browser)
  await browser.close()
  console.log(feil ? `\n${feil} FEIL` : "\npanelet held")
  process.exit(feil ? 1 : 0)
}
void main()
