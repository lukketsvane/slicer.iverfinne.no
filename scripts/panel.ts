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
import { lesPlan } from "../lib/plan"
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
  await page.locator(HOVUDLINA).click()
  await page.waitForTimeout(500)
  sjekk("eit trykk på lina opnar midten, med planlista", (await liste.count()) === 1)
  await page.getByRole("button", { name: "alle kontrollane" }).click()
  await page.waitForTimeout(500)
  const felt = await page.locator("input[aria-label$=', tal']").count()
  sjekk("«alle kontrollane» syner skyvarane", felt >= 12, `${felt} talfelt`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  sjekk("esc stengjer arket til lina", (await liste.count()) === 0)

  // --- lås og slett, med knapp og med tast ------------------------------------
  const n0 = plana(page).length
  await page.getByRole("button", { name: "lås", exact: true }).click()
  await vent(page, talPlan(n0 + 1))
  sjekk("lås legg eitt plan i lenkja", plana(page).length === n0 + 1, `${n0} → ${plana(page).length}`)
  await midt(page)
  const nytt = plana(page)[plana(page).length - 1]
  sjekk("det nye planet har eit namn ingen har hatt", plana(page).filter((p) => p.id === nytt.id).length === 1 && nytt.id > n0, `namn ${nytt.id}`)
  sjekk("og lista har like mange rader", (await liste.locator("[role=option]").count()) === n0 + 1)

  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 2))
  sjekk("L låser òg", plana(page).length === n0 + 2)
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
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 2))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  sjekk("og tre til er attende ved starten", plana(page).length === n0)

  // --- GESTANE, SOM FØR: knip = storleik, vri = vend, dra = flytt snittet -----
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  const s0 = hash(page).storleik
  await toFingrar(page, (t) => [[195 - 30 - 70 * t, 380], [195 + 30 + 70 * t, 380]])
  await vent(page, (p) => p.storleik !== s0)
  sjekk("to fingrar som spreier seg set storleiken", hash(page).storleik > s0, `${s0} → ${hash(page).storleik} mm`)
  await page.keyboard.press("z")
  await vent(page, (p) => p.storleik === s0)

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
  sjekk("og dei andre står stille", plana(page).slice(1).every((p, i) => JSON.stringify(p) === JSON.stringify(før[i + 1])))
  await page.keyboard.press("z")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) === JSON.stringify(fyrst.o))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

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
  await page.getByRole("button", { name: "ta alle", exact: true }).click()
  await vent(page, (p) => !!m && lesPlan(p.plan).length === Number(m[1]) + Number(m[2]))
  sjekk("«ta alle» set nett dei plana", !!m && plana(page).length === Number(m[1]) + Number(m[2]), `${namn} → ${plana(page).length} plan`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  sjekk("og Z tek det attende", plana(page).length === n0)
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
  const tekst = await page.locator("textarea[aria-label='alle innstillingane som tekst']").inputValue()
  sjekk("oppsettet som tekst ber plana", /\bplan\b/.test(tekst) && tekst.includes("@"), `${tekst.length} teikn`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

  await alt()
  await page.getByRole("button", { name: "kuttliste", exact: true }).click()
  await verkty.waitFor({ timeout: 10000 })
  const kutt = (await verkty.innerText()).replace(/\s+/g, " ")
  sjekk("kuttlista har éi line per del, med plan og ledd", /ledd/i.test(kutt) && /\b1\b/.test(kutt), kutt.slice(0, 60))
  await page.keyboard.press("Escape")

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
  sjekk("L låser på benken", plana(page).length === n0 + 1)
  await page.locator("[role=listbox][aria-label='plan'] [role=option]").last().locator("button").first().click()
  await page.keyboard.press("Delete")
  await vent(page, talPlan(n0))
  sjekk("Delete tek det valde bort", plana(page).length === n0)

  // storleiken er eit tal du kan skrive
  const felt = page.locator("input[aria-label='storleik, tal']")
  await felt.fill("200")
  await felt.press("Enter")
  await vent(page, (p) => p.storleik === 200)
  sjekk("talfeltet set storleiken", hash(page).storleik === 200, String(hash(page).storleik))
  sjekk("og plana står der dei stod, som brøkar", plana(page).length === n0 && plana(page)[0].o[0] < 0.2)

  await page.keyboard.press("f")
  const kand = page.locator("button[aria-pressed]").filter({ hasText: /^\d+×\d+/ })
  await page.locator("button[aria-label='forslag'][title^='(F)']").waitFor({ timeout: 90000 })
  await kand.first().waitFor({ timeout: 10000 })
  sjekk("F hentar framlegg", (await kand.count()) >= 3)

  sjekk("ingen konsollfeil på benken", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

const main = async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  await telefon(browser)
  await benk(browser)
  await browser.close()
  console.log(feil ? `\n${feil} FEIL` : "\npanelet held")
  process.exit(feil ? 1 : 0)
}
void main()
