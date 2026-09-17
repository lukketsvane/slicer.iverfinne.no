import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright"
import { lesPlan } from "../lib/plan"

type Finger = { type: string; id: number; primary: boolean }
type ProvWindow = Window & { __avbrotHendingar: Finger[] }

async function prov() {
  const ut = process.env.AVBROT_UT ?? "bilete/avbrot"
  mkdirSync(ut, { recursive: true })
  const nettlesar = await chromium.launch({ executablePath: process.env.PW_CHROMIUM })
  const side = await nettlesar.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await side.addInitScript(() => {
    const logg: Finger[] = []
    ;(window as unknown as ProvWindow).__avbrotHendingar = logg
    for (const type of ["pointerdown", "pointerup", "pointercancel", "gotpointercapture", "lostpointercapture"] as const) {
      window.addEventListener(type, (e) => logg.push({ type, id: e.pointerId, primary: e.isPrimary }), true)
    }
  })
  side.setDefaultTimeout(10000)
  const feil: string[] = [], sjekkar: string[] = []
  side.on("pageerror", (e) => feil.push(e.message))
  const cdp = await side.context().newCDPSession(side)
  const punkt = (x: number, y: number, id = 1) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 })
  const start = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [punkt(100, 300)] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [punkt(180, 390)] })
    await side.locator('[data-teikn="dreg"]').waitFor()
  }
  const tal = async () => {
    const plan = await side.evaluate(() => JSON.parse(decodeURIComponent(location.hash.split("#p=")[1] ?? "%7B%7D")).plan ?? "")
    return lesPlan(plan).length
  }
  const klar = async (namn: string) => {
    await side.locator('[data-teikn="klar"]').waitFor()
    await side.waitForTimeout(400)
    assert.equal(await tal(), 0, namn)
    assert.equal(await side.locator("[data-teikn] polygon").getAttribute("points"), "", "ingen hengande omriss")
    sjekkar.push(namn)
  }
  try {
    await side.goto(process.env.URL ?? "http://127.0.0.1:3210", { waitUntil: "networkidle" })
    await side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor()
    await side.locator("[data-kjelde]").tap()
    await side.getByRole("button", { name: "tom arbeidsflate", exact: true }).tap()
    await side.touchscreen.tap(344, 87)
    await side.waitForTimeout(650)
    await side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }).tap()
    await side.evaluate(() => window.addEventListener("gotpointercapture", (e) => {
      if (e.target instanceof HTMLCanvasElement) e.target.dataset.provPeikar = String(e.pointerId)
    }, true))

    await start()
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
    await klar("pointercancel lagar inga plate")

    await start()
    await side.evaluate(() => {
      const c = document.querySelector("canvas")!
      const id = Number(c.dataset.provPeikar)
      if (!c.hasPointerCapture(id)) throw new Error("prøva fekk ikkje eit ekte peikargrep")
      c.releasePointerCapture(id)
    })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [punkt(230, 450)] })
    await klar("tapt peikargrep slepper teikninga straks")
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await klar("seint slipp etter tapt grep lagar inga plate")

    await start()
    const a = punkt(180, 390), b = punkt(275, 510, 2)
    const foer = await side.evaluate(() => (window as unknown as ProvWindow).__avbrotHendingar.length)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a, b] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [b] })
    const slepp = await side.evaluate((fra) => (window as unknown as ProvWindow).__avbrotHendingar.slice(fra).filter((e) => e.type === "pointerup"), foer)
    assert(slepp.length === 1 && !slepp[0].primary, "prøva må sleppe berre den andre fingeren")
    await side.locator('[data-teikn="dreg"]').waitFor()
    assert.equal(await tal(), 0, "den andre fingeren fullfører ikkje konturen")
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [punkt(230, 480)] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await side.waitForFunction(() => {
      const p = JSON.parse(decodeURIComponent(location.hash.split("#p=")[1] ?? "%7B%7D"))
      return !!p.plan && p.plan.split(";").length === 1
    })
    assert.equal(await tal(), 1, "nytt drag etter avbrot lagar nøyaktig éi plate")
    sjekkar.push("berre startfingeren fullfører", "nytt drag verkar etter avbrot")
    assert.deepEqual(feil, [])
    await side.screenshot({ path: join(ut, "ferdig.png") })
  } catch (e) {
    feil.push(String(e))
    await side.screenshot({ path: join(ut, "feil.png") }).catch(() => {})
    throw e
  } finally {
    const hendingar = await side.evaluate(() => (window as unknown as ProvWindow).__avbrotHendingar).catch(() => [])
    writeFileSync(join(ut, "rapport.json"), JSON.stringify({ sjekkar, feil, hendingar }, null, 2) + "\n")
    console.log(JSON.stringify({ sjekkar, feil }, null, 2))
    await nettlesar.close()
  }
}
void prov().catch((e) => { console.error(e); process.exitCode = 1 })
