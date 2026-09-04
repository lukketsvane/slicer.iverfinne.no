/**
 * PANELET — kontrollane i ein ekte nettlesar, på begge flatene.
 *
 * Kikken (`look.ts`) ser om sida står. Dette harnesset TEK I HENNE: låser
 * og slettar plan med knapp og tast, vel eit plan i lista, skisserer med to
 * fingrar (CDP-touch: dra og vri) og ser at planet som vert låst faktisk
 * flytta seg og vinkla seg, angrar, set eit rutenett med to fingrar, opnar
 * platene og snur ein del, les oppsettet som tekst. Alt vert lese attende
 * frå lenkja — ho ber parameterposen, og posen er sanninga.
 *
 *   pnpm build && pnpm start -p 3210
 *   PW_CHROMIUM=/opt/pw-browsers/chromium pnpm panel [url]
 */
import { chromium, type Browser, type Page } from "playwright"
import { lesPlan, rutenett, skrivPlan, type Strek } from "../lib/plan"
import { FORMER } from "../lib/scene"
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

/**
 * EIN FINGER PÅ SKJERMEN, TIL VAKTA.
 *
 * Grensesnittet SØV etter to sekund utan ei rørsle, og medan det søv tek
 * det ikkje imot fingrar — det er heile poenget med det. Ein prøvebenk har
 * ingen finger: han ventar på eit bygg i fire sekund og trykkjer så på ein
 * knapp som ikkje er der lenger, og då ryk hundre vakter av éi avgjerd dei
 * ikkje prøver.
 *
 * Difor seier benken at handa ligg på: ei rørsle i sekundet, som ein som
 * sit med telefonen. Søvnen sjølv vert prøvd i sin eigen del, der handa er
 * teken bort med vilje (`opne(..., { sov: true })`).
 */
async function opne(url: string, browser: Browser, w: number, h: number, o?: { sov?: boolean }) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 1180 })
  if (!o?.sov) {
    await page.addInitScript(`setInterval(function () {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
    }, 700)`)
  }
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

  /**
   * ORD, IKKJE PILLER. Lesemåtane i toppen og speglingane over skjer stod i
   * ringar, med ei fylt flate under den som gjaldt — chrome som sa det ordet
   * alt sa, og tre flater midt i biletet. No er dei ord i det same blekket
   * ikona bruker. Vakta ser etter ringen og flata, ikkje etter utsjånaden:
   * ein kant med breidd, eller ein bakgrunn som ikkje er ingenting.
   */
  const pille = await page.evaluate(`(() => {
    var ut = []
    document.querySelectorAll("header button[aria-pressed], .tumme [data-speil]").forEach(function (e) {
      var c = getComputedStyle(e)
      var kant = parseFloat(c.borderTopWidth) > 0.01 || parseFloat(c.borderLeftWidth) > 0.01
      var flate = c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent"
      if (kant || flate) ut.push((e.getAttribute("aria-label") || e.textContent || "?").trim())
    })
    return ut
  })()`) as string[]
  sjekk("lesemåtane og speglingane er ord, ikkje piller", pille.length === 0, pille.join(" · "))
  // og speglingane står RETT OVER skjer: det er skjer dei endrar
  {
    const sp = await page.locator("[data-speil='z']").boundingBox()
    const sk = await page.getByRole("button", { name: "skjer", exact: true }).boundingBox()
    sjekk("speglingane står rett over skjer", !!sp && !!sk && sp.y < sk.y && sk.y - (sp.y + sp.height) < 40, sp && sk ? `${Math.round(sk.y - sp.y - sp.height)} px mellom` : "finst ikkje")
  }

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

  /**
   * VRIDINGA SIKTAR SNITTET, IKKJE KROPPEN. Ho snudde objektet på bordet
   * før. Prøva vrir, låser, og les normalen på planet som vart til: han
   * skal stå på skrå — og vendinga på kroppen skal stå urørt.
   */
  const vriFingrar = (grader: number) => (t: number) => {
    const a = (grader * t * Math.PI) / 180
    return [[195 - 80 * Math.cos(a), 380 - 80 * Math.sin(a)], [195 + 80 * Math.cos(a), 380 + 80 * Math.sin(a)]] as [[number, number], [number, number]]
  }
  await toFingrar(page, vriFingrar(40))
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const vridd0 = plana(page)[plana(page).length - 1]
  sjekk("to fingrar som vrir vinklar SNITTET", Math.abs(vridd0.n[2]) > 0.1, `n = ${vridd0.n.map((c) => c.toFixed(2)).join(",")}`)
  sjekk("og kroppen står som han stod", hash(page).rotZ === 0, `rotZ ${hash(page).rotZ}°`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  // og attende: skissa hugsar vinkelen sin, so ho vert vridd like mykje motsett
  await toFingrar(page, vriFingrar(-40))
  await page.waitForTimeout(300)

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
  const dubl = page.getByRole("button", { name: "dubler planet", exact: true })
  sjekk("eit valt plan får «skjer hòl» og «dubler planet» under tommelen", (await hol.count()) === 1 && (await dubl.count()) === 1)
  /**
   * DUBLERINGA. Knappen stod for «legg til gods» og lagar no eit plan til:
   * same normal, same strek, skuva eitt hakk langs normalen — og det NYE er
   * det valde, av di du dublerer for å flytte kopien.
   */
  {
    const fyrr = plana(page)
    await dubl.click()
    await vent(page, talPlan(fyrr.length + 1))
    const etter = plana(page)
    const ny = etter.find((q) => !fyrr.some((r) => r.id === q.id))
    sjekk("dubleringa lagar eitt plan til", etter.length === fyrr.length + 1 && !!ny, `${fyrr.length} → ${etter.length}`)
    if (ny) {
      const gml = fyrr[0]
      const same = ny.n.every((c, i) => Math.abs(c - gml.n[i]) < 1e-6)
      const flytt = Math.hypot(...ny.o.map((c, i) => c - gml.o[i]))
      sjekk("kopien har same normal, og ligg eit hakk unna", same && flytt > 1e-3, `flytt ${flytt.toFixed(4)}`)
    }
    await page.keyboard.press("z")
    await vent(page, talPlan(fyrr.length))
    await page.waitForTimeout(300)
    await midt(page)
    await liste.locator("[role=option]").first().locator("button").first().click()
    await page.waitForTimeout(300)
  }
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
    const holX = (q?: Strek) => q?.x ?? 0
    await vent(page, (p) => Math.abs(holX(lesPlan(p.plan)[0]?.strek[0]) - holX(medHol.strek[0])) > 0.01)
    const flytta = plana(page)[0].strek[0]
    sjekk("handtaket flyttar hòlet, og lenkja veit det", Math.abs(holX(flytta) - holX(medHol.strek[0])) > 0.01, `x ${holX(medHol.strek[0])} → ${holX(flytta)}`)
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

  // --- RUTENETTET ---------------------------------------------------------------
  /**
   * VERKTYET SOM SET DEI TO TALA. Vassrett er kolonner, loddrett er rader,
   * og fyrtifire pikslar er eitt plan. Vakta les grunnstoda av lista slik
   * ho står, dreg til høgre, og ser at lista er eit reint rutenett med nett
   * so mange plan fleire langs x — og ikkje eitt fleire langs y.
   */
  const rutAv = (p: Params) => {
    let nx = 0
    let ny = 0
    for (const q of lesPlan(p.plan)) {
      if (Math.abs(q.n[0]) > 0.999) nx++
      else if (Math.abs(q.n[1]) > 0.999) ny++
    }
    return [nx, ny] as [number, number]
  }
  const rutTal = () => rutAv(hash(page))
  const ruteKnapp = page.getByRole("button", { name: "rutenett", exact: true })
  sjekk("rutenettet står på lina", (await ruteKnapp.count()) === 1)
  await ruteKnapp.click()
  await page.waitForTimeout(200)
  sjekk("og knappen seier at han står på", (await ruteKnapp.getAttribute("aria-pressed")) === "true")
  sjekk("skissehandtaket er borte medan han står på", !(await page.locator("[data-handtak='flytt']").isVisible()))
  // fingrane står midt i det frie bandet: arket veks når lista veks, og eit
  // drag som byrjar på arket er eit drag lerretet aldri ser
  const [nx0, ny0] = rutTal()
  await toFingrar(page, (t) => [[120 + 176 * t, 300], [120 + 176 * t, 380]])
  await vent(page, (p) => rutAv(p)[0] >= nx0 + 3)
  const [nx1, ny1] = rutTal()
  sjekk("to fingrar til høgre set kolonner", nx1 >= nx0 + 3, `${nx0} → ${nx1} kolonner`)
  sjekk("og rader står", ny1 === ny0, `${ny0} → ${ny1} rader`)
  sjekk("og lista er eit reint rutenett", plana(page).length === nx1 + ny1 && plana(page).every((q) => Math.abs(q.n[0]) > 0.999 || Math.abs(q.n[1]) > 0.999), `${plana(page).length} plan`)
  // draget må falle på plass i angrestakken før det neste, elles er dei to éi bokføring
  await page.waitForTimeout(1400)
  await toFingrar(page, (t) => [[130, 380 - 176 * t], [260, 380 - 176 * t]])
  await vent(page, (p) => rutAv(p)[1] >= ny1 + 3)
  const [nx2, ny2] = rutTal()
  sjekk("to fingrar oppover set rader", ny2 >= ny1 + 3, `${ny1} → ${ny2} rader`)
  sjekk("og kolonner står", nx2 === nx1, `${nx1} → ${nx2} kolonner`)
  // eitt drag er éi bokføring: Z tek heile rutenettet attende, ikkje eitt plan
  await page.waitForTimeout(1400)
  await page.keyboard.press("z")
  await vent(page, talPlan(nx1 + ny1))
  sjekk("og Z tek draget attende i eitt", plana(page).length === nx1 + ny1, `${plana(page).length} plan`)
  await ruteKnapp.click()
  await page.waitForTimeout(200)
  sjekk("trykk att slepper verktyet", (await ruteKnapp.getAttribute("aria-pressed")) === "false")

  // --- PLATEFLATA: konturvisinga ER platene ------------------------------------
  /**
   * «Kontur» var ei stripe med profilane ved sida av kvarandre i lerretet,
   * og platene låg i ei skuff. No er dei det same: trykk «kontur» og du står
   * på arket delane vert skorne ut av, med fingrane på dei. Skuffa har ikkje
   * platene lenger — det står i vakta under, med talet på verkty.
   */
  /** arket ope med «alt»: storleiken står alt i midten, verktya står i alt */
  const alt = async () => {
    await midt(page)
    if ((await page.getByRole("button", { name: "kuttliste", exact: true }).count()) === 0) {
      await page.getByRole("button", { name: "alle kontrollane" }).click()
      await page.waitForTimeout(400)
    }
  }
  await alt()
  sjekk("arket er ope med alt", (await page.getByRole("button", { name: "kuttliste", exact: true }).count()) === 1)
  sjekk("og platene er ikkje eit verkty i skuffa lenger", (await page.getByRole("button", { name: "plater", exact: true }).count()) === 0)
  await page.getByRole("button", { name: "kontur", exact: true }).click()
  const flata = page.locator("section[aria-label='plateflata']")
  await flata.waitFor({ timeout: 10000 })
  await roleg(page)
  const delar = flata.locator("g[data-del]")
  const nDel = await delar.count()
  sjekk("platene syner delane som noko du kan ta i", nDel > 0, `${nDel} delar på plata`)
  /**
   * MÅLRUTA. Plata er der du avgjer om noko går opp på det restkappet du
   * har, og det stod ingen målestokk i ruta. No ligg ho under delane, med
   * eit steg som fylgjer auget og tal på kvar femte line. Vakta krev at ho
   * finst, at ho ber millimeter, og at ho IKKJE tek imot fingrar — ei
   * hjelpeline som stel eit drag frå ein del er verre enn ingen målestokk.
   */
  const maalrute = flata.locator("svg g[aria-hidden='true']").first()
  const nLiner = await maalrute.locator("line").count()
  sjekk("målruta ligg i plata", nLiner > 4, `${nLiner} liner`)
  // `allInnerTexts` gjev undefined for SVG-tekst: han har ikkje innerText
  // `allInnerTexts` gjev undefined for kvar SVG-tekst — han har ikkje
  // innerText — og ei prøve på undefined kastar i staden for å seie frå
  const merke = await maalrute.locator("text").allTextContents()
  sjekk("og ho ber tal i millimeter", merke.length > 0 && merke.every((t) => /^\d+$/.test((t ?? "").trim())), merke.join(" "))
  sjekk("og ho tek ikkje imot fingrar", (await maalrute.evaluate((el) => getComputedStyle(el).pointerEvents)) === "none")
  /**
   * EIN DEL ER EIT PLAN. Eit trykk på ein del i plata vel planet han vart
   * skoren av — det same valet eit trykk i rommet gjev — og då står
   * reiskapane for profilen hans under tommelen.
   */
  // Trykket må kome når hovudtråden er ledig. Eit trykk gjennom CDP ber
  // klokka si frå då det vart sendt, ikkje frå då fingeren letta, so eit
  // svar som ligg i kø bak eit bygg les seg som eit LANGT trykk — og då
  // opnar menyen i staden for å velje. Ein finger av kjøt og blod har
  // maskinvara si eiga klokke og møter det aldri.
  await roleg(page, 700)
  await delar.first().click()
  const skjerHol = page.getByRole("button", { name: "skjer hòl", exact: true })
  await skjerHol.waitFor({ timeout: 5000 }).catch(() => {})
  sjekk("eit trykk på ein del vel planet hans", (await skjerHol.count()) === 1, `${await skjerHol.count()} knapp`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

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
  await page.getByRole("button", { name: "lag", exact: true }).click()
  await page.waitForTimeout(400)
  sjekk("og «lag» tek deg attende til rommet", (await flata.count()) === 0)

  const verkty = page.locator("section[aria-label='verkty']")
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

  // --- SKALET ER GJENNOMSIKTIG, OG BLIR VERANDE DET -------------------------
  /**
   * Kroppen er den same geometrien i «flate» og i «lag», men med materialet
   * som prop det eine stadet og som barn det andre. Byter eitt element
   * mellom dei to, sit instansen att med standardmaterialet — kvitt og tett
   * — og skalet legg seg over delane som ei maling. Prøva er at biletet er
   * NØYAKTIG det same før og etter ein tur innom «flate».
   */
  const klipp = { x: 30, y: 150, width: 330, height: 420 }
  /**
   * BILETET MÅ STÅ STILLE FØR DET VERT MÅLT. Skissa vert ikkje snitta medan
   * konturen står framme, so snittet kjem fyrst etter ein tur innom
   * arbeidaren når vi er attende i rommet — og kameraet dempar seg på plass
   * imens. Ei prøve som skyt før det er stille måler tida og ikkje
   * materialet. Difor: skyt til to bilete på rad er like.
   */
  const stille = async (n = 12) => {
    let fyrr = await page.screenshot({ clip: klipp })
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(400)
      const naa = await page.screenshot({ clip: klipp })
      if (naa.equals(fyrr)) return naa
      fyrr = naa
    }
    return fyrr
  }
  const skalFør = await stille()
  await page.getByRole("button", { name: "flate", exact: true }).click()
  await roleg(page, 1200)
  await page.getByRole("button", { name: "lag", exact: true }).click()
  await roleg(page, 1200)
  const skalEtter = await stille()
  sjekk("ein tur innom «flate» let skalet stå som det stod", skalFør.equals(skalEtter), `${skalFør.length} B → ${skalEtter.length} B`)

  /**
   * OG PLATEFLATA HAR INGEN PENN. Pennen og viskelêret som teikna i den
   * gamle stripa er borte — konturen er plateflata, ikkje ei teikneflate.
   */
  sjekk("det finst ingen penn å teikne med", (await page.locator("button[data-penn]").count()) === 0 && (await page.getByRole("button", { name: "teikn", exact: true }).count()) === 0)

  // --- KROPPEN ER EI LISTE: menyen legg til eit primitiv ----------------------
  const kjelde = page.locator("button[data-kjelde]")
  sjekk("kjelda står i toppen med namn", (await kjelde.isVisible()) && (await kjelde.innerText()).trim() === "kube")
  await kjelde.click()
  await page.waitForTimeout(250)
  const meny2 = page.locator("[data-meny]")
  sjekk("og opnar lista med formene og fila", (await meny2.count()) === 1 && (await meny2.getByRole("button").count()) === FORMER.length + 1)
  /**
   * EI INNEBYGD FORM ER EI FIL. Kuben er laga i koden; dei fem andre ligg
   * under `public/form` og vert henta når du tek i dei. Prøva er at biletet
   * ENDRAR SEG: eit nett som kom inn etter at scena peika på det endra ikkje
   * eit teikn i byggjenøkkelen, og kuben som stod der medan det lasta vart
   * servert for alltid. Det såg ut som ein kube ingen hadde bede om.
   */
  {
    const klipp = { x: 40, y: 200, width: 310, height: 380 }
    const fyrr = await page.screenshot({ clip: klipp })
    await meny2.getByRole("button", { name: "stolform-01", exact: true }).click()
    await vent(page, (p) => /stolform-01/.test(String(p.scene ?? "")))
    await roleg(page, 2500)
    const etter = await page.screenshot({ clip: klipp })
    sjekk("ei innebygd form vert henta og bygd", !fyrr.equals(etter), `${fyrr.length} B → ${etter.length} B`)
    sjekk("og ho står i lenkja, so ho fylgjer med", /stolform-01/.test(String(hash(page).scene ?? "")), String(hash(page).scene ?? "").slice(0, 40))
    await page.keyboard.press("z")
    await roleg(page, 600)
    // eit val lèt menyen att; neste prøve tek han fram att
    await kjelde.click()
    await page.waitForTimeout(300)
  }
  await meny2.getByRole("button", { name: "kube", exact: true }).click()
  await vent(page, (p) => !!p.scene)
  // Ein kube til, og ikkje ei form: bitane vert prøvde her, ikkje henting,
  // og ei form på tjuefem tusen trekantar for kvar gest er berre venting.
  sjekk("ein bit til vert lagd til kroppen", /kube@.*;kube@/.test(hash(page).scene ?? ""), (hash(page).scene ?? "").slice(0, 40))
  sjekk("og brikka seier kor mange bitar han er", (await kjelde.innerText()).trim() === "kube +1")
  await page.keyboard.press("z")
  await vent(page, (p) => !p.scene)
  sjekk("angre tek biten bort att", !hash(page).scene, `«${hash(page).scene ?? ""}»`)

  // --- VERKTYET FOR KROPPEN: flytt, vri, skaler, dubler, slett --------------
  /**
   * Bitane er boksar du kan peike på, og dei same tre gestane gjeld dei:
   * draget flyttar (loddrett lyfter), klypet gjer større, vridinga snur.
   * Prøva les scenestrengen — han er sanninga om kroppen, og han ligg i
   * lenkja.
   */
  const bitScene = () => hash(page).scene ?? ""
  const bitTal = () => (bitScene() ? bitScene().split(";").length : 0)
  await kjelde.click()
  await page.waitForTimeout(250)
  await meny2.getByRole("button", { name: "kube", exact: true }).click()
  await vent(page, (p) => !!p.scene)
  const bitVerkty = page.locator("[data-bitverkty]")
  sjekk("verktyet for kroppen er ein knapp med tilstand", (await bitVerkty.count()) === 1 && (await bitVerkty.getAttribute("aria-pressed")) === "false")
  await bitVerkty.click()
  await page.waitForTimeout(500)
  sjekk("og eit trykk slår han på", (await bitVerkty.getAttribute("aria-pressed")) === "true")
  // den andre biten ligg til høgre i kroppen; boksen hans tek trykket
  await page.touchscreen.tap(250, 430)
  await page.waitForTimeout(500)
  sjekk("eit trykk vel ein bit", (await page.locator("[aria-label='dubler biten']").count()) === 1)
  const bitFør = bitScene()
  await toFingrar(page, (t) => [[140, 430 - 90 * t], [220, 430 - 90 * t]])
  await vent(page, (p) => (p.scene ?? "") !== bitFør)
  // den ANDRE biten i lista, ikkje eit namn: kva form han har er ei anna sak
  const andre = () => bitScene().split(";")[1] ?? ""
  const lyft = /@[-\d.]+,[-\d.]+,([\d.]+)/.exec(andre())
  sjekk("to fingrar rett opp lyfter biten", !!lyft && Number(lyft[1]) > 5, bitScene().slice(0, 48))
  const førKlyp = bitScene()
  await toFingrar(page, (t) => [[180 - 30 - 60 * t, 400], [180 + 30 + 60 * t, 400]])
  await vent(page, (p) => (p.scene ?? "") !== førKlyp)
  const stor = /@[^/]+\/([\d.]+)\//.exec(andre())
  sjekk("og eit klyp gjer HAN større, ikkje kroppen", !!stor && Number(stor[1]) > 1.05 && hash(page).storleik === 150, `${stor?.[1]} · kroppen ${hash(page).storleik} mm`)
  const n1 = bitTal()
  await page.locator("[aria-label='dubler biten']").click()
  await vent(page, () => bitTal() === n1 + 1)
  sjekk("dubleringa legg ein bit til", bitTal() === n1 + 1, bitScene().slice(0, 60))
  await page.locator("[aria-label='ta biten bort']").click()
  await vent(page, () => bitTal() === n1)
  sjekk("og slettinga tek han bort att", bitTal() === n1, bitScene().slice(0, 60))
  await bitVerkty.click()
  await page.waitForTimeout(300)
  sjekk("eit trykk til lèt verktyet att", (await bitVerkty.getAttribute("aria-pressed")) === "false" && (await page.locator("[aria-label='dubler biten']").count()) === 0)

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

  await page.keyboard.press("r")
  await page.waitForTimeout(200)
  sjekk("R tek verktyet for rutenettet", (await page.locator("button[aria-label='rutenett'][aria-pressed='true']").count()) === 1)
  await page.keyboard.press("r")

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

/**
 * REGLANE SOM INGEN KUNNE SJÅ.
 *
 * Tavla teiknar avlesingane, og ein regel finn lina si gjennom `rad`. Tre
 * reglar har inga rad å peike på — «kan monterast», klaringa og
 * snittbreidda — og dei vart difor rekna, dømde, gjevne eit råd og teikna
 * INGEN STAD. Den fyrste av dei er hard: delane kunne ikkje setjast saman
 * i nokon rekkjefylgje, reiskapen visste det, reiskapen hadde knappen som
 * retta det, og du fekk aldri sjå noko av det.
 *
 * Lenkja her er den same saka `pnpm raad` prøver hovudlaust: tre plan der
 * eitt har to vegar inn. Vakta ser at lina STÅR i tavla, at ho ber knappen
 * sin, og at knappen tek brotet bort.
 */
async function reglar(browser: Browser) {
  console.log("\n=== reglane utan ei rad")
  const bag = { plan: "1@0.2,0.5,0.5/1,0,0;2@0.5,0.5,1/0.7071,0,0.7071;3@0.5,0.5,0.5/0,1,0", klaring: 0 }
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify(bag)), browser, 390, 844)
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(400)
  await page.getByRole("button", { name: "alle kontrollane" }).click()
  await roleg(page, 600)
  const tavla = page.locator("[aria-label='kontrollar'] dl").first()
  const tekst = (await tavla.innerText()).replace(/\s+/g, " ")
  sjekk("den harde regelen utan ei rad står i tavla", /kan monterast/.test(tekst), tekst.slice(-90))
  sjekk("og den mjuke òg", /klaring/.test(tekst))
  const bytt = page.locator("button[aria-label^='fiks kan monterast']")
  sjekk("og han ber rådet sitt", (await bytt.count()) === 1)
  const planFør = hash(page).plan
  if (await bytt.count()) {
    await bytt.click()
    await vent(page, (p) => p.plan !== planFør)
    await roleg(page, 400)
    sjekk("og rådet tek brotet bort", !/kan monterast/.test((await tavla.innerText()).replace(/\s+/g, " ")), hash(page).plan.slice(0, 40))
  }
  sjekk("ingen konsollfeil i reglane", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * VIRVELEN: DET ANDRE RIBBESPRÅKET.
 *
 * Rutenettet gjev ribber på tvers av kvarandre; virvelen gjev dei kring
 * loddaksen. Vassrett set kor mange, loddrett kor langt ut frå aksen — og
 * skuvet ut er heile saka, av di ribber som alle går gjennom aksen kryssar
 * kvarandre langs den same lina og fell frå kvarandre.
 *
 * Vakta dreg til høgre og krev fleire ribber, dreg opp og krev at avstanden
 * veks utan at talet endrar seg, og ser at det som kom ut HELD SAMAN: ledd,
 * og ingen lause stykke. Rekninga står i `pnpm hand`; her er det verktyet.
 */
async function virvelen(browser: Browser) {
  console.log("\n=== virvelen")
  const bag = { scene: "sylinder@0,0,0/1/0", storleik: 300, tjukn: 9 }
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify(bag)), browser, 390, 844)
  const knapp = page.locator("[data-virvelverkty]")
  sjekk("virvelen står på lina", (await knapp.count()) === 1 && (await knapp.getAttribute("aria-pressed")) === "false")
  await knapp.click()
  await page.waitForTimeout(250)
  sjekk("og eit trykk slår han på", (await knapp.getAttribute("aria-pressed")) === "true")
  await toFingrar(page, (t) => [[110 + 200 * t, 300], [110 + 200 * t, 400]])
  await vent(page, (p) => lesPlan(p.plan).length > 0)
  await ferdig(page)
  const n1 = plana(page).length
  sjekk("to fingrar til høgre set ribber kring aksen", n1 >= 12, `${n1} ribber`)
  const loddrett = plana(page).every((q) => Math.abs(q.n[2]) < 1e-3)
  sjekk("og kvar ribbe står loddrett", loddrett, plana(page).slice(0, 2).map((q) => q.n.join(",")).join(" · "))
  // ingen av dei går gjennom midten: det er skuvet som held virvelen open
  const gjennomMidten = plana(page).filter((q) => Math.hypot(q.o[0] - 0.5, q.o[1] - 0.5) < 0.01).length
  sjekk("og ingen av dei gjennom midten", gjennomMidten === 0, `${gjennomMidten} i midten`)
  // at det HENG SAMAN — ledd, ingen lause — står i `pnpm probe`, som har heile
  // målinga. Lina har berre tala sine, og dei skal vera der.
  const l1 = await lina(page)
  sjekk("og det vart delar av det", /[1-9]\d* delar/.test(l1), l1)
  // opp: lenger ut frå aksen, og talet på ribber står
  const av0 = Math.hypot(plana(page)[0].o[0] - 0.5, plana(page)[0].o[1] - 0.5)
  await toFingrar(page, (t) => [[130, 400 - 120 * t], [260, 400 - 120 * t]])
  await vent(page, (p) => Math.hypot(lesPlan(p.plan)[0].o[0] - 0.5, lesPlan(p.plan)[0].o[1] - 0.5) > av0 + 0.005)
  const av1 = Math.hypot(plana(page)[0].o[0] - 0.5, plana(page)[0].o[1] - 0.5)
  sjekk("to fingrar oppover skyv ribbene ut frå aksen", av1 > av0, `${av0.toFixed(3)} → ${av1.toFixed(3)}`)
  sjekk("og talet på ribber står", plana(page).length === n1, `${plana(page).length} ribber`)
  await knapp.click()
  await page.waitForTimeout(250)
  sjekk("trykk att slepper verktyet", (await knapp.getAttribute("aria-pressed")) === "false")
  sjekk("ingen konsollfeil i virvelen", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * SYMMETRIEN PÅ SNITTET.
 *
 * Tre brytarar rett over skjer, og dei endrar KVA SKJER GJER: eitt trykk
 * låser snittet du siktar og spegelbileta hans om midtplana i kroppen.
 * Vakta siktar snittet til sides — eit snitt gjennom midten speglar seg
 * til seg sjølv, og då ville prøva ikkje prøvd noko — slår på x, skjer, og
 * krev TO plan som ligg spegelvendt om ein halv. So x av att, og eitt.
 *
 * Rekninga sjølv står i `pnpm hand`, rein og utan ein kropp. Her er det
 * brytaren og skjer som vert prøvde.
 */
async function symmetri(browser: Browser) {
  console.log("\n=== symmetrien på snittet")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const speil = (ord: string) => page.locator(`[data-speil='${ord}']`)
  sjekk("tre brytarar står over skjer", (await speil("x").count()) === 1 && (await speil("y").count()) === 1 && (await speil("z").count()) === 1)
  sjekk("og dei står av", (await speil("x").getAttribute("aria-pressed")) === "false")
  // snittet til sides, so spegelbiletet er eit anna plan enn snittet sjølv
  await toFingrar(page, (t) => [[150 + 80 * t, 330], [150 + 80 * t, 430]])
  await page.waitForTimeout(300)
  await speil("x").click()
  await page.waitForTimeout(200)
  sjekk("brytaren lyser", (await speil("x").getAttribute("aria-pressed")) === "true")
  const n0 = plana(page).length
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 2))
  const nye = plana(page).slice(-2)
  sjekk("eitt trykk på skjer låser TO plan", plana(page).length === n0 + 2, `${plana(page).length} plan`)
  const spegla = nye.length === 2 && Math.abs(nye[0].o[0] + nye[1].o[0] - 1) < 0.01 && Math.abs(nye[0].n[0] + nye[1].n[0]) < 0.01
  sjekk("og dei ligg spegelvendt om ein halv", spegla, nye.map((q) => `o ${q.o[0].toFixed(3)} n ${q.n[0].toFixed(3)}`).join("  ·  "))
  sjekk("med kvart sitt namn", nye.length === 2 && nye[0].id !== nye[1].id, nye.map((q) => q.id).join(" og "))
  await speil("x").click()
  await page.waitForTimeout(200)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 3))
  sjekk("og med brytaren av er skjer eitt plan att", plana(page).length === n0 + 3, `${plana(page).length} plan`)
  sjekk("ingen konsollfeil i symmetrien", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * TAKET SEIER FRÅ.
 *
 * Lista stoggar på `PLAN_TAK`, og eit trykk på skjer gav att posen han
 * fekk — men blinken fyrte likevel. Du trykte, noko lyste opp, og ingen
 * del vart laga. Vakta fyller lista til taket gjennom lenkja, trykkjer
 * skjer, og krev at TALET STÅR og at lina seier kva som ikkje hende.
 */
async function taket(browser: Browser) {
  console.log("\n=== taket på plana")
  const fullt = skrivPlan(rutenett(32, 32))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan: fullt })), browser, 390, 844)
  sjekk("lenkja ber taket", plana(page).length === 64, `${plana(page).length} plan`)
  const skjer = page.getByRole("button", { name: "skjer", exact: true })
  await skjer.click()
  await page.waitForTimeout(900)
  sjekk("skjer legg ikkje eit plan nummer 65", plana(page).length === 64, `${plana(page).length} plan`)
  sjekk("og lina seier kvifor", /taket er 64 plan/.test(await lina(page)), await lina(page))
  sjekk("ingen konsollfeil ved taket", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * HANDTAKA PÅ SPOR-ENDANE.
 *
 * `hand` prøver rekninga: at brøken som vert skriven set botnen der
 * handtaket vart sleppt, i plata sine eigne koordinatar. Det denne prøver
 * er det andre halve: at ein FINGER på prikken skriv den brøken — at
 * handtaket tek imot trykket sitt sjølv i staden for å sende det vidare til
 * delen under, som ville dregi heile delen i staden for eitt spor.
 */
async function handtaka(browser: Browser) {
  console.log("\n=== handtaka på spor-endane")
  const plan = skrivPlan(rutenett(2, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan })), browser, 390, 844)
  await page.getByRole("button", { name: "kontur", exact: true }).click()
  const flata = page.locator("section[aria-label='plateflata']")
  await flata.waitFor({ timeout: 10000 })
  await roleg(page, 900)
  const handtak = flata.locator("g[data-spor]")
  sjekk("ingen handtak før du har peikt på ein del", (await handtak.count()) === 0)
  await flata.locator("g[data-del]").first().click()
  await roleg(page, 600)
  const n = await handtak.count()
  sjekk("den valde delen har eitt handtak per ledd", n > 0, `${n} handtak`)
  if (n > 0) {
    // RETNINGA STÅR I TEIKNINGA. Sporet ligg langs éi line, og eit drag på
    // tvers av henne projiserer seg til ingenting. Streken bak prikken er
    // den lina: er han høgare enn han er brei, går draget opp og ned.
    const spor = handtak.first()
    const bane = await spor.locator("line").boundingBox()
    const prikk = await spor.locator("circle").last().boundingBox()
    if (bane && prikk) {
      const cx = prikk.x + prikk.width / 2
      const cy = prikk.y + prikk.height / 2
      const loddrett = bane.height > bane.width
      const steg = Math.max(24, Math.round((loddrett ? bane.height : bane.width) * 0.25))
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(loddrett ? cx : cx + steg, loddrett ? cy + steg : cy, { steps: 10 })
      await page.mouse.up()
      await vent(page, (p) => !!p.deling)
      const d = String(hash(page).deling ?? "")
      const t = Number(d.split(":")[1])
      sjekk("eit drag på handtaket skriv delinga på det leddet", /^\d+-\d+-\d+:[\d.]+$/.test(d), d)
      sjekk("og brøken er ikkje midt på lenger", Number.isFinite(t) && Math.abs(t - 0.5) > 0.03, String(t))
      sjekk("og delen vart ikkje dregen med", !hash(page).fest, String(hash(page).fest ?? ""))
      await page.getByRole("button", { name: "jamt", exact: true }).click()
      await vent(page, (p) => !p.deling)
      sjekk("og «jamt» tek delinga bort att", !hash(page).deling)
    }
  }
  sjekk("ingen konsollfeil på handtaka", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * SKALET, OG SØVNEN.
 *
 * To ting du ikkje kan lese av eit tal: at brytaren for skalet faktisk tek
 * det gjennomsiktige omrisset bort — biletet må endre seg — og at
 * grensesnittet fell bort av seg sjølv når ingen rører skjermen, og kjem
 * att med det same nokon gjer.
 */
async function skaletOgSovnen(browser: Browser) {
  console.log("\n=== skalet og søvnen")
  const plan = skrivPlan(rutenett(3, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan })), browser, 390, 844, { sov: true })
  const lerret = { x: 20, y: 240, width: 350, height: 380 }
  /** biletet når det står stille — vakna, so ingenting glir medan vi skyt */
  const stille = async (n = 10) => {
    await page.mouse.move(190, 700)
    let fyrr = await page.screenshot({ clip: lerret })
    for (let i = 0; i < n; i++) {
      await page.mouse.move(190 + (i % 2), 700)
      await page.waitForTimeout(320)
      const naa = await page.screenshot({ clip: lerret })
      if (naa.equals(fyrr)) return naa
      fyrr = naa
    }
    return fyrr
  }
  const skalKnapp = page.getByRole("button", { name: "skalet", exact: true })
  sjekk("skalet har ein brytar i «lag»", (await skalKnapp.count()) === 1)
  sjekk("og han står på", (await skalKnapp.getAttribute("aria-pressed")) === "true")
  const med = await stille()
  await skalKnapp.click()
  await vent(page, (p) => (p as unknown as { skal?: boolean }).skal === false)
  const utan = await stille()
  sjekk("brytaren tek det gjennomsiktige omrisset bort", !med.equals(utan), `${med.length} B → ${utan.length} B`)
  sjekk("og lenkja ber synet", (hash(page) as unknown as { skal?: boolean }).skal === false, JSON.stringify((hash(page) as unknown as { skal?: boolean }).skal))
  await skalKnapp.click()
  await vent(page, (p) => (p as unknown as { skal?: boolean }).skal !== false)
  const att = await stille()
  sjekk("og eit trykk til set det attende", med.equals(att))
  // I «flate» ER kroppen kroppen, og då er det ingenting å slå av
  await page.getByRole("button", { name: "flate", exact: true }).click()
  await roleg(page, 700)
  sjekk("i «flate» finst brytaren ikkje", (await skalKnapp.count()) === 0)
  await page.getByRole("button", { name: "lag", exact: true }).click()
  await roleg(page, 700)

  /**
   * SØVNEN. Etter to sekund utan ein finger fell alt som ikkje er objektet
   * bort. Prøva les gjennomsikta, ikkje eit bilete: ho skal vera null, og
   * grensesnittet skal ikkje ta imot fingrar medan det ligg der.
   */
  const gjennomsikt = async () => page.evaluate(`(() => {
    var ut = {}
    ;[["topp", "header"], ["tumme", ".tumme"], ["synskube", ".synskube"], ["ark", "[aria-label='kontrollar']"]].forEach(function (p) {
      var e = document.querySelector(p[1])
      ut[p[0]] = e ? Number(getComputedStyle(e).opacity) : -1
    })
    ut.peik = document.querySelector(".tumme") ? getComputedStyle(document.querySelector(".tumme")).pointerEvents : "?"
    ut.sov = document.querySelector("main").hasAttribute("data-sov")
    return ut
  })()`) as Promise<Record<string, number | string | boolean>>
  await page.mouse.move(190, 700)
  await page.waitForTimeout(600)
  const vaken = await gjennomsikt()
  sjekk("grensesnittet står framme medan ein finger er på", vaken.sov === false && vaken.topp === 1 && vaken.tumme === 1, JSON.stringify(vaken))
  await page.waitForTimeout(3200)
  const sovande = await gjennomsikt()
  sjekk("og fell bort etter to sekund utan ein finger", sovande.sov === true && sovande.topp === 0 && sovande.tumme === 0 && sovande.ark === 0 && sovande.synskube === 0, JSON.stringify(sovande))
  sjekk("og tek ikkje imot fingrar medan det søv", sovande.peik === "none", String(sovande.peik))
  await page.mouse.move(190, 700)
  await page.waitForTimeout(400)
  const attende = await gjennomsikt()
  sjekk("ei rørsle hentar det att", attende.sov === false && attende.topp === 1, JSON.stringify(attende))

  /**
   * OG BERRE I KVILE. Står eit plan valt, er du midt i noko: det som står
   * framme er det du arbeider i, og det skal ikkje forsvinne under handa.
   */
  await page.mouse.move(190, 700)
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(500)
  await page.locator("[role=listbox][aria-label='plan'] [role=option]").first().locator("button").first().click()
  await page.waitForTimeout(400)
  // arket att: eit ope ark held det vake av seg sjølv, og då prøver vi ingenting
  await page.locator(HOVUDLINA).click()
  await roleg(page, 600)
  await page.waitForTimeout(3200)
  const valt = await gjennomsikt()
  sjekk("med eit plan valt søv det ikkje", valt.sov === false && valt.tumme === 1, JSON.stringify(valt))
  sjekk("ingen konsollfeil kring skalet og søvnen", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * DEN ANDRE FINGEREN.
 *
 * Nettlesaren lagar berre `click` av den FYRSTE fingeren på skjermen. Held
 * du snitthandtaket med tommelen og trykkjer skjer med peikefingeren, er
 * det andre trykket ikkje primært, og knappen høyrde det aldri — tommelen
 * måtte sleppe det du nett hadde sikta inn.
 *
 * Vakta gjer nett det: tek handtaket med finger éin, dreg det, og trykkjer
 * skjer med finger to. Målt på koden før dette var svaret ingen plan.
 */
async function andreFingeren(browser: Browser) {
  console.log("\n=== den andre fingeren")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const h = await page.locator("[data-handtak='flytt']").boundingBox()
  const k = await page.getByRole("button", { name: "skjer", exact: true }).boundingBox()
  sjekk("handtaket og skjer står begge på skjermen", !!h && !!k)
  if (h && k) {
    const cdp = await page.context().newCDPSession(page)
    const pt = (x: number, y: number, id: number) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 })
    const hx = h.x + h.width / 2
    const hy = h.y + h.height / 2
    const kx = k.x + k.width / 2
    const ky = k.y + k.height / 2
    // finger éin tek handtaket og dreg snittet dit han vil ha det
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(hx, hy, 0)] })
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(hx + 4 * i, hy, 0)] })
      await page.waitForTimeout(20)
    }
    const foer = plana(page).length
    // finger to trykkjer skjer, medan finger éin framleis held
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(hx + 32, hy, 0), pt(kx, ky, 1)] })
    await page.waitForTimeout(80)
    // CDP kan berre sleppe alle på ein gong; det er den ANDRE fingeren sitt
    // trykk som skal telje, og han er ikkje primær same kva
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await vent(page, (p) => lesPlan(p.plan).length === foer + 1)
    sjekk("finger to skjer medan finger éin held handtaket", plana(page).length === foer + 1, `${foer} → ${plana(page).length} plan`)
    sjekk("og berre eitt plan, ikkje to", plana(page).length === foer + 1, `${plana(page).length} plan`)
  }
  sjekk("ingen konsollfeil på den andre fingeren", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

/**
 * BØYEN, MED EIN FINGER.
 *
 * Eit plan treng ikkje vera flatt. Knappen under tommelen er eit DRAG som
 * lupa er: opp bøyer den eine vegen, ned den andre, og null i midten er
 * flatt. Prøva les lenkja — bøyen står i plan-strengen — og ser at
 * regelen om materialet fylgjer med når han vert for stram.
 */
async function boyen(browser: Browser) {
  console.log("\n=== bøyen")
  const plan = skrivPlan(rutenett(3, 0))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 300, tjukn: 6, material: "finer" })), browser, 390, 844)
  await midt(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option]").first().locator("button").first().click()
  await roleg(page, 600)
  const knapp = page.locator("[data-boy]")
  sjekk("eit valt plan har ein bøyeknapp", (await knapp.count()) === 1)
  const b = await knapp.boundingBox()
  const bogAv = (i = 0) => lesPlan(hash(page).plan)[i]?.bog ?? 0
  sjekk("og planet er flatt til nokon dreg i han", bogAv() === 0, String(bogAv()))
  if (b) {
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 120, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan)[0]?.bog ?? 0) > 0)
    const opp = bogAv()
    sjekk("eit drag opp bøyer planet", opp > 0.2, `bog ${opp}`)
    sjekk("og dei andre plana står flate", lesPlan(hash(page).plan).slice(1).every((q) => q.bog === 0))
    // og ned att, forbi null, til andre vegen. FØR arket vert opna: escape
    // slepper planet, og då er knappen borte.
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 260, { steps: 20 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan)[0]?.bog ?? 0) < 0)
    sjekk("og eit drag ned bøyer han andre vegen", bogAv() < 0, `bog ${bogAv()}`)
    // regelen om materialet: 300 mm kropp, 6 mm finér toler 600 mm radius
    await midt(page)
    await page.getByRole("button", { name: "alle kontrollane" }).click()
    await roleg(page, 900)
    const tekst = (await page.locator("[aria-label='kontrollar']").innerText()).replace(/\s+/g, " ")
    sjekk("bøyeradien står i tavla", /bøyeradius/.test(tekst), (tekst.match(/bøyeradius[^·]{0,44}/) ?? [""])[0])
  }
  sjekk("ingen konsollfeil på bøyen", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

const main = async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  await telefon(browser)
  await reglar(browser)
  await symmetri(browser)
  await virvelen(browser)
  await handtaka(browser)
  await andreFingeren(browser)
  await boyen(browser)
  await skaletOgSovnen(browser)
  await taket(browser)
  await flyt(browser)
  await mork(browser)
  await benk(browser)
  await browser.close()
  console.log(feil ? `\n${feil} FEIL` : "\npanelet held")
  process.exit(feil ? 1 : 0)
}
void main()
