/** WebKit på PC: mobil-layout, talfelt og teikning; ikkje fysisk iOS. */
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { webkit } from "playwright"
import { lesPlan } from "../lib/plan"
import type { Params } from "../lib/params"

async function prov() {
  const nettlesar = await webkit.launch()
  const side = await nettlesar.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  side.setDefaultTimeout(15000)
  const feil: string[] = []
  side.on("pageerror", (e) => feil.push(e.message))
  await side.addInitScript(() => { setInterval(() => window.dispatchEvent(new PointerEvent("pointermove")), 500) })
  const params = (): Params => JSON.parse(decodeURIComponent(side.url().split("#p=")[1] ?? "%7B%7D"))
  const knapp = (namn: string) => side.getByRole("button", { name: namn, exact: true })
  const ferdig = () => side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor({ timeout: 45000 })
  const vent = async (vil: () => boolean, namn: string) => {
    const start = Date.now()
    while (!vil()) { assert(Date.now() - start < 15000, namn); await side.waitForTimeout(80) }
    await ferdig()
  }
  try {
    await side.goto(process.env.URL ?? "http://127.0.0.1:3210", { waitUntil: "networkidle" })
    await ferdig()
    await side.locator("[data-kjelde]").tap()
    await knapp("tom arbeidsflate").tap()
    await side.touchscreen.tap(344, 87)
    await side.waitForTimeout(900)
    await side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "kontur", exact: true }).tap()
    // Playwright har ikkje fleirfingerdrag i WebKit. Denne delen prøver
    // den same peikarløypa med mus; knappetrykka over/under er touch.
    const bane = [[100, 300], [230, 300], [260, 490], [210, 490], [195, 450], [130, 450], [110, 490], [75, 490], [100, 300]]
    await side.mouse.move(...bane[0] as [number, number])
    await side.mouse.down()
    for (const p of bane.slice(1)) await side.mouse.move(...p as [number, number], { steps: 4 })
    await side.mouse.up()
    await vent(() => lesPlan(params().plan).length === 1, "konturen vart ikkje ei plate")
    const plate = lesPlan(params().plan)[0]
    assert((plate.omriss?.length ?? 0) > 4, "fri kontur vart erstatta med ein firkant")
    assert.deepEqual(plate.n, [0, -1, 0], "synskuben valde ikkje teikneplanet")
    await knapp("skjer hòl").tap()
    await vent(() => lesPlan(params().plan)[0]?.strek.length === 1, "hòlet manglar")
    assert.equal(await side.locator("button[data-punkt]").count(), 0, "omrisshandtak dekkjer hòlhandtak")
    await knapp("opne kontrollane").tap()
    await side.getByRole("tab", { name: "materiale", exact: true }).tap()
    await knapp("neste materiale").tap()
    await knapp("neste plate").tap()
    const rad = side.getByRole("slider", { name: "tjukn, tal", exact: true })
    await rad.tap()
    await side.waitForTimeout(90)
    await rad.tap()
    const felt = side.getByRole("textbox", { name: "tjukn, skriv", exact: true })
    assert.equal(await felt.evaluate((e) => getComputedStyle(e).fontSize), "16px")
    await felt.fill("11,85")
    await felt.press("Enter")
    await vent(() => params().tjukn === 11.85, "materialtalet vart ikkje lagra")
    assert.equal(await side.evaluate(() => innerWidth), 390, "sida endra viewport")
    await knapp("lat att kontrollane").tap()
    await side.getByRole("tab", { name: "kontur", exact: true }).tap()
    await ferdig()
    await side.locator('[aria-label="plateflata"] svg').waitFor()
    assert.deepEqual(feil, [], "WebKit kasta feil")
    mkdirSync("bilete/webkit", { recursive: true })
    await side.screenshot({ path: "bilete/webkit/nesta.png" })
    console.log("WebKit: kontur, aksesyn, hòl, presis tjukn og nesting grøne på 390×844")
  } catch (e) {
    mkdirSync("bilete/webkit", { recursive: true })
    await side.screenshot({ path: "bilete/webkit/feil.png" }).catch(() => {})
    console.error("WebKit-sidefeil:", feil)
    throw e
  } finally { await nettlesar.close() }
}
void prov().catch((e) => { console.error(e); process.exitCode = 1 })
