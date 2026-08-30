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
const HOVUDLINA = "[aria-label='delar, kuttlengd og ark']"
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
    () => document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
  await page.waitForTimeout(1200)
  // To heilt ulike oppsett: benken med to veggar over 1180 px, arket med
  // tre høgder under. Alt som skal fotograferast finst i begge, men stega
  // for å opne eit ark finst berre i det eine.
  const benk = (await page.locator("aside[aria-label='innstillingar']").count()) > 0
  console.log("oppsett:", benk ? "benk" : "ark")

  // Hovudlina er ein KNAPP: eit trykk på tala opnar arket der grunngjevinga
  // står. Ho vert difor funnen på det ho heiter og ikkje på kva element ho
  // er laga av.
  const line = await page.locator(HOVUDLINA).innerText()
  console.log("hovudlina:", line.replace(/\s+/g, " "))
  await page.screenshot({ path: `${UT}/1-lag.png` })

  // panelet ope
  if (!benk) {
    await page.locator("button[aria-expanded]").first().click()
    await page.waitForTimeout(600)
  }
  await page.screenshot({ path: `${UT}/2-panel.png` })

  for (const v of ["flate", "kontur"]) {
    await page.getByRole("button", { name: v, exact: true }).click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${UT}/3-${v}.png` })
  }

  // heile skyveveggen
  if (!benk) {
    await page.getByRole("button", { name: "alle parametrar" }).click()
    await page.waitForTimeout(600)
  }
  await page.screenshot({ path: `${UT}/4-skyvarar.png`, fullPage: false })

  // --- importen ------------------------------------------------------------
  // Det andre halve av reiskapen er at nokon kan dra inn si eiga fil. Her
  // vert ei laga, lagd på filveljaren, og resultatet fotografert: går dette,
  // har heile vegen fil → arbeidar → strålar → ribber → skjerm gått.
  await page.getByRole("button", { name: "lag", exact: true }).click()
  // panelet heilt att, so biletet syner objektet og ikkje menyen
  if (!benk) {
    await page.getByRole("button", { name: "færre kontrollar" }).click()
    await page.getByRole("button", { name: "gøym kontrollane" }).click()
  }
  const ferdig = () =>
    page.waitForFunction(
      () => document.querySelector("[aria-busy]")?.getAttribute("aria-busy") === "false",
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
  if (!benk) {
    await page.getByRole("button", { name: "vis kontrollane" }).click()
    await page.waitForTimeout(400)
    // Uttaka bur i det FULLE steget: det halve er midten av jobben, og
    // uttaket er slutten av han.
    await page.getByRole("button", { name: "alle parametrar" }).click()
    await page.waitForTimeout(400)
  }
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

  // --- BLINDGATA ------------------------------------------------------------
  // Eit uttak som ikkje let seg hente er det einaste stoppunktet i heile
  // reiskapen. Det skal alltid ha ein knapp i seg, og han skal vera til å
  // sjå: eit bilete av kvar av dei to flatene med regelen broten.
  {
    const brote =
      "#p=" +
      encodeURIComponent(
        JSON.stringify({ storleik: 1100, ribbX: 3, ribbY: 3, arkB: 400, arkH: 300 }),
      )
    for (const [namn, w, h] of [
      ["9-blindgate-benk.png", 1320, 900],
      ["9-blindgate-ark.png", 420, 860],
    ] as [string, number, number][]) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(URL + brote, { waitUntil: "networkidle" })
      await page.reload({ waitUntil: "networkidle" })
      await ferdig()
      // Arket ligg att når det er lukka, og ein regel du ikkje ser har
      // ingen knapp. Hovudlina er vegen inn: ho er raud, og eit trykk på
      // henne opnar det halve steget der reglane står.
      if (w < 1180) {
        await page.locator("button[aria-expanded]").first().click()
        await page.waitForTimeout(700)
      }
      await page.waitForTimeout(900)
      const raad = page.getByLabel(/^fiks /)
      const tal = await raad.count()
      console.log(`blindgate ${w}px: ${tal} råd — ${(await raad.allInnerTexts()).join(", ")}`)
      if (tal === 0) feil.push(`blindgate ${w}px: ingen veg ut av ein broten regel`)
      await page.screenshot({ path: `${UT}/${namn}` })
    }
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
