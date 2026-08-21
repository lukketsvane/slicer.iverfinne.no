/**
 * Biletet.
 *
 * Typesjekken seier at koden går; prøvebenken seier at tala stemmer. Ingen
 * av dei seier om objektet står på skjermen. Dette skriptet startar sida,
 * ventar til motoren har levert måltala, og tek eit bilete — éin per
 * lesemåte, og eitt av panelet ope.
 *
 *   npx tsx scripts/look.ts [url]
 */
import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/vaffel/export-stl"

const URL = process.argv[2] ?? "http://127.0.0.1:3210"
const UT = "bilete"

const main = async () => {
  mkdirSync(UT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const feil: string[] = []
  // Ei melding om ein ressurs som ikkje kom, seier ikkje KVA for ein i
  // teksten sin. Difor vert nettverket lese for seg, og konsollen berre
  // for det som faktisk er kode som kasta.
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
      feil.push(m.text())
    }
  })
  page.on("pageerror", (e) => feil.push(String(e)))
  // To ting som ikkje finst lokalt og som ikkje er feil i sida:
  // /favicon.ico, som nettlesaren spør etter av gamal vane same kva sida
  // har sagt om ikonet sitt, og målescriptet til Vercel, som berre finst
  // på Vercel sin eigen tenar.
  const heime = /\/favicon\.ico$|\/_vercel\//
  page.on("response", (r) => {
    if (r.status() >= 400 && !heime.test(r.url())) feil.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(URL, { waitUntil: "networkidle" })
  // Prikken i hovudlina er «reknar». Er han dimma, er motoren ferdig — og
  // det er det einaste haldepunktet som ikkje er ei gjetting på tid.
  await page.waitForFunction(
    () => document.querySelector('section[aria-label="kontrollar"]')?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
  await page.waitForTimeout(1200)

  const line = await page.locator("section[aria-label='kontrollar'] span.tab").first().innerText()
  console.log("hovudlina:", line.replace(/\s+/g, " "))
  await page.screenshot({ path: `${UT}/1-lag.png` })

  // panelet ope
  await page.locator("button[aria-expanded]").first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${UT}/2-panel.png` })

  for (const v of ["flate", "kontur"]) {
    await page.getByRole("button", { name: v, exact: true }).click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${UT}/3-${v}.png` })
  }

  // heile skyveveggen
  await page.getByRole("button", { name: "alle parametrar" }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${UT}/4-skyvarar.png`, fullPage: false })

  // --- importen ------------------------------------------------------------
  // Det andre halve av reiskapen er at nokon kan dra inn si eiga fil. Her
  // vert ei laga, lagd på filveljaren, og resultatet fotografert: går dette,
  // har heile vegen fil → arbeidar → strålar → ribber → skjerm gått.
  await page.getByRole("button", { name: "lag", exact: true }).click()
  // panelet heilt att, so biletet syner objektet og ikkje menyen
  await page.getByRole("button", { name: "færre kontrollar" }).click()
  await page.getByRole("button", { name: "gøym kontrollane" }).click()
  const fil = join(UT, "prove.stl")
  writeFileSync(fil, kuleStl(60, 40))
  await page.setInputFiles("input[type=file]", fil)
  await page.waitForFunction(
    () =>
      document
        .querySelector('section[aria-label="kontrollar"]')
        ?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
  await page.waitForTimeout(1500)
  const kjelde = await page.locator("button[aria-label='hent eit nett']").innerText()
  const etter = await page
    .locator("section[aria-label='kontrollar'] span.tab")
    .first()
    .innerText()
  console.log("etter import:", kjelde.trim(), "—", etter.replace(/\s+/g, " "))
  await page.screenshot({ path: `${UT}/5-import.png` })
  if (!/prove\.stl/i.test(kjelde)) feil.push("filnamnet kom ikkje fram i kjeldepilla")
  if (/^\s*$|snittar/.test(etter)) feil.push("ingen måltal etter import")

  await browser.close()
  if (feil.length) {
    console.error("KONSOLLFEIL:")
    for (const f of feil) console.error("  " + f)
    process.exit(1)
  }
  console.log("bilete i " + UT + "/ — ingen konsollfeil")
}

void main()


/** ei kule som binær STL — noko å dra inn som ikkje er kuben */
function kuleStl(r: number, seg: number): Buffer {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [
      r * Math.sin(ph) * Math.cos(th),
      r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph) * 1.6,
    ]
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
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
