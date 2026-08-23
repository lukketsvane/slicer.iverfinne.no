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
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/vaffel/export-stl"
import { glb } from "./glbfil"

const URL = process.argv[2] ?? "http://127.0.0.1:3210"
const HOVUDLINA =
  "section[aria-label='kontrollar'] button[aria-label='delar, kuttlengd og ark']"
const UT = "bilete"

const main = async () => {
  mkdirSync(UT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  })
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

  // Hovudlina er ein KNAPP: eit trykk på tala opnar arket der grunngjevinga
  // står. Ho vert difor funnen på det ho heiter og ikkje på kva element ho
  // er laga av.
  const line = await page.locator(HOVUDLINA).innerText()
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
  const ferdig = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector('section[aria-label="kontrollar"]')
          ?.getAttribute("aria-busy") === "false",
      undefined,
      { timeout: 45000 },
    )

  /** legg ei fil på filveljaren og les av kva reiskapen gjorde med henne */
  const importer = async (namn: string, data: Buffer, bilete: string) => {
    const fil = join(UT, namn)
    writeFileSync(fil, data)
    await page.setInputFiles("input[type=file]", fil)
    await ferdig()
    await page.waitForTimeout(1500)
    const kjelde = (
      await page.locator("button[aria-label='hent eit nett']").innerText()
    ).trim()
    const tal = (await page.locator(HOVUDLINA).innerText()).replace(/\s+/g, " ")
    console.log(`import ${namn}: ${kjelde} — ${tal}`)
    await page.screenshot({ path: `${UT}/${bilete}` })
    if (!kjelde.toLowerCase().includes(namn.toLowerCase())) {
      feil.push(`${namn}: filnamnet kom ikkje fram i kjeldepilla («${kjelde}»)`)
    }
    if (/^\s*$|snittar/.test(tal)) feil.push(`${namn}: ingen måltal etter import`)
    if (/^0 delar/.test(tal)) feil.push(`${namn}: null delar — nettet vart ikkje lese`)
  }

  await importer("prove.stl", kuleStl(60, 40), "5-import-stl.png")
  await importer("prove.glb", eggGlb(60, 40), "6-import-glb.png")

  // --- uttaka ---------------------------------------------------------------
  // Ei knapp som ikkje leverer ei fil er ei knapp som ikkje finst. Kvart
  // uttak vert trykt på, og fila som kjem ut vert lesen: rett namn, rett
  // type, og noko inni.
  await page.getByRole("button", { name: "vis kontrollane" }).click()
  await page.waitForTimeout(400)
  for (const [chip, vent] of [
    ["passprøve", /^passprove-.*\.svg$/],
    ["ark", /\.svg$|\.zip$/],
    ["dxf", /\.dxf$/],
    ["svg", /profilar\.svg$/],
  ] as [string, RegExp][]) {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: chip, exact: true }).click(),
    ])
    const namn = dl.suggestedFilename()
    const sti = join(UT, namn)
    await dl.saveAs(sti)
    const stor = statSync(sti).size
    console.log(`uttak ${chip.padEnd(10)} → ${namn} (${stor} B)`)
    if (!vent.test(namn)) feil.push(`${chip}: uventa filnamn «${namn}»`)
    if (stor < 200) feil.push(`${chip}: fila er tom (${stor} B)`)
  }

  await browser.close()
  if (feil.length) {
    console.error("KONSOLLFEIL:")
    for (const f of feil) console.error("  " + f)
    process.exit(1)
  }
  console.log("bilete i " + UT + "/ — ingen konsollfeil")
}

void main()


/**
 * Det same egget som binær GLB, med Y opp slik glTF krev og heile
 * plasseringa i ein node — altså slik Blender faktisk skriv ei fil.
 */
function eggGlb(r: number, seg: number): Buffer {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [
      r * Math.sin(ph) * Math.cos(th),
      r * Math.cos(ph) * 1.6,
      r * Math.sin(ph) * Math.sin(th),
    ]
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  }
  const buf = glb(
    new Float32Array(pos),
    null,
    [{ mesh: 0, translation: [12, 40, -7], scale: [1.5, 1.5, 1.5] }],
    [0],
  )
  return Buffer.from(new Uint8Array(buf))
}

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
