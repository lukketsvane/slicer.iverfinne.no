/** Eksport må vera synleg UTAN at Playwright rullar knappen fram åt oss. */
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium, webkit, type Locator } from "playwright"

const treffbar = (el: Locator) => el.evaluate((knapp) => {
  const b = knapp.getBoundingClientRect()
  const midt = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
  // Heile knappen, ikkje berre ein synleg piksel langs kanten av skuffa.
  let klipt = b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth
  for (let p = knapp.parentElement; p; p = p.parentElement) {
    if (!/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) continue
    const r = p.getBoundingClientRect()
    klipt ||= b.top < r.top - 1 || b.bottom > r.bottom + 1
  }
  return !klipt && (midt === knapp || (!!midt && knapp.contains(midt)))
})

async function prov() {
  const ut = process.env.UTTAK_UT ?? "bilete/uttak"
  mkdirSync(ut, { recursive: true })
  const rapport: { motor: string; hogd: number; feil: string[] }[] = []
  for (const motor of [chromium, webkit]) {
    const nettlesar = await motor.launch(motor === chromium ? { executablePath: process.env.PW_CHROMIUM } : {})
    try {
      for (const hogd of [844, 664]) {
        const side = await nettlesar.newPage({ viewport: { width: 390, height: hogd }, isMobile: true, hasTouch: true })
        const feil: string[] = []
        rapport.push({ motor: motor.name(), hogd, feil })
        side.on("pageerror", (e) => feil.push(e.message))
        const knapp = (namn: string) => side.getByRole("button", { name: namn, exact: true })
        const fane = (namn: string) => side.getByRole("tab", { name: namn, exact: true })
        const tal = side.getByRole("slider", { name: "storleik, tal", exact: true })
        try {
          await side.goto(process.env.URL ?? "http://127.0.0.1:3210", { waitUntil: "networkidle" })
          await side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor()
          await knapp("eksport").tap()
          assert(await treffbar(knapp("ark")), "nesta ark er ikkje direkte synleg frå eksportikonet")
          assert(await treffbar(knapp("dxf")), "DXF er ikkje direkte synleg frå eksportikonet")
          await side.screenshot({ path: join(ut, `${motor.name()}-${hogd}.png`) })
          await fane("materiale").tap()
          // Oppsett: ein brukar har rulla ned til platemåla i ei anna fane.
          await side.getByRole("slider", { name: "høgd, tal", exact: true }).scrollIntoViewIfNeeded()
          await fane("plan").tap()
          assert(await treffbar(tal), "ei ny fane arva den gamle rulleposisjonen")
          assert.deepEqual(await side.evaluate(() => [scrollX, scrollY, visualViewport?.scale ?? 1]), [0, 0, 1], "berre skuffa skal rulla")
          await knapp("lat att kontrollane").tap()
          await knapp("eksport").tap()
          assert(await treffbar(knapp("ark")), "eksportikonet verkar berre fyrste gongen")
          assert.deepEqual(feil, [])
        } catch (e) {
          feil.push(String(e))
          await side.screenshot({ path: join(ut, `${motor.name()}-${hogd}-feil.png`) }).catch(() => {})
        } finally { await side.close() }
      }
    } finally { await nettlesar.close() }
  }
  writeFileSync(join(ut, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n")
  console.log(JSON.stringify(rapport, null, 2))
  assert(rapport.every((r) => !r.feil.length), "uttaksprøva feila")
}
void prov().catch((e) => { console.error(e); process.exitCode = 1 })
