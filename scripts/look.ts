import { chromium, type Page } from "playwright"
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/export-stl"
import { glb } from "./glbfil"
import { rutenett, skrivPlan } from "../lib/plan"

const URL = process.env.URL ?? process.argv[2] ?? "http://127.0.0.1:3210/nn"
const HOVUDLINA = "[aria-label='plan, delar, ark og tid']"
const UT = "bilete"

const feil: string[] = []
const brot = (kva: string) => {
  feil.push(kva)
  console.log(`  !! ${kva}`)
}

const ferdig = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector("[aria-label='kontrollar']")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
const setPose = async (page: Page, pose: Record<string, unknown>) => {
  await page.waitForFunction(() => !!window.slicer)
  await page.evaluate((o) => new Promise((ok) => { window.slicer!.set(o); requestAnimationFrame(() => requestAnimationFrame(ok)) }), pose)
  await ferdig(page)
}
const lina = async (page: Page) => {
  if (!await page.locator(HOVUDLINA).count()) await page.getByRole("button", { name: "lat att kontrollane", exact: true }).click()
  return (await page.locator(HOVUDLINA).textContent() ?? "").replace(/\s+/g, " ").trim()
}
const opneFane = async (page: Page, namn: string) => {
  const opne = page.getByRole("button", { name: "opne kontrollane", exact: true })
  if (await opne.count()) await opne.click()
  await page.getByRole("tab", { name: namn, exact: true }).click()
}
const opneUttak = async (page: Page, benk: boolean) => {
  if (!benk) await page.getByRole("button", { name: "eksport", exact: true }).click()
  const alle = page.getByRole("button", { name: benk ? /^uttak/ : /alle format/ })
  if (await alle.count() && await alle.first().getAttribute("aria-expanded") === "false") await alle.first().click()
}
const planTal = (s: string) => Number(/(\d+) plan/.exec(s)?.[1] ?? NaN)
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
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--disable-features=WebShare"] })
  const page = await browser.newPage({ viewport: { width: w, height: h }, acceptDownloads: true, hasTouch: w < 1180 })
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

  const før = planTal(fyrst)
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  const etter = planTal(await lina(page))
  if (etter !== før + 1) brot(`${namn}: skjer gav ${etter} plan, venta ${før + 1}`)
  else console.log(`  skjer: ${før} → ${etter} plan`)

  if (!benk) {
    await opneFane(page, "plan")
    await page.waitForTimeout(500)
  }
  const rader = await page.locator("[role=listbox][aria-label='plan'] [role=option]").count()
  if (rader !== etter) brot(`${namn}: lista har ${rader} plan, lina seier ${etter}`)
  await page.screenshot({ path: `${UT}/${namn}-2-liste.png` })

  await page.getByRole("button", { name: `slett plan ${etter}`, exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  if (planTal(await lina(page)) !== før) brot(`${namn}: slett tok ikkje planet bort`)

  for (const v of ["flate", "kontur", "montasje", "lag"]) {
    const tab = page.getByRole("tab", { name: v, exact: true })
    if (await tab.isDisabled()) {
      if (v !== "montasje") brot(`${namn}: ${v} er utilgjengeleg`)
      continue
    }
    await tab.click()
    await ferdig(page)
    await page.waitForTimeout(1200)
    if (v !== "lag") await page.screenshot({ path: `${UT}/${namn}-3-${v}.png` })
  }

  if (!benk) {
    await opneUttak(page, benk)
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: `${UT}/${namn}-4-alt.png` })

  const importer = async (fil: string, data: Buffer) => {
    const sti = join(UT, fil)
    writeFileSync(sti, data)
    await page.setInputFiles('input[type=file][accept*=".stl"]', sti)
    await ferdig(page)
    await page.waitForTimeout(1500)
    const l = await talLina(page)
    const kjelde = (await page.locator("button[data-kjelde]").innerText()).trim()
    console.log(`  import ${fil}: ${kjelde} — ${l}`)
    if (!kjelde.toLowerCase().includes(fil.toLowerCase())) brot(`${fil}: filnamnet kom ikkje fram («${kjelde}»)`)
    if (planTal(l) !== 0) brot(`${fil}: ${planTal(l)} plan står att etter import`)
  }
  await importer("prove.stl", kuleStl(60, 40))
  await importer("prove.glb", eggGlb(60, 40))
  await page.screenshot({ path: `${UT}/${namn}-5-import.png` })

  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await ferdig(page)
  await page.waitForTimeout(400)
  const l2 = await lina(page)
  if (planTal(l2) !== 1 || /\b0 delar/.test(l2)) brot(`${namn}: skjering på importert nett gav «${l2}»`)
  else console.log(`  skjer på egget: ${l2}`)

  await opneUttak(page, benk)
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
      page.getByRole("button", { name: chip, exact: true }).first().click(),
    ])
    const fil = dl.suggestedFilename()
    const sti = join(UT, fil)
    await dl.saveAs(sti)
    const stor = statSync(sti).size
    console.log(`  uttak ${chip.padEnd(10)} → ${fil} (${stor} B)`)
    if (!vent.test(fil)) brot(`${chip}: uventa filnamn «${fil}»`)
    if (stor < 200) brot(`${chip}: fila er tom (${stor} B)`)
  }

  await page.locator("button[data-kjelde]").click()
  await page.waitForTimeout(300)
  await page.locator("[data-meny] button", { hasText: "kube" }).first().click()
  await ferdig(page)
  await page.waitForTimeout(1500)
  const kropp = (await page.locator("button[data-kjelde]").innerText()).trim()
  const scena = () => page.evaluate(() => String(window.slicer?.posen().scene ?? ""))
  const scene4 = await scena()
  console.log(`  kroppen: ${kropp} — ${scene4}`)
  if (!/\+1$/.test(kropp)) brot(`${namn}: ei form til gav «${kropp}»`)
  const før4 = kropp
  const attKropp = async (kva: string) => {
    await ferdig(page)
    await page
      .waitForFunction(() => (document.querySelector("button[data-kjelde]")?.textContent ?? "").includes("+"), undefined, { timeout: 20000 })
      .catch(() => undefined)
    await ferdig(page)
    await page.waitForTimeout(600)
    const att = (await page.locator("button[data-kjelde]").innerText()).trim()
    const sc = await scena()
    console.log(`  ${kva.padEnd(8)} ${att} — ${sc}`)
    if (att !== før4 || sc !== scene4) {
      brot(`${namn}: ${kva} kom attende som «${att}» (${sc}) og ikkje «${før4}» (${scene4})`)
    }
  }
  await page.reload({ waitUntil: "networkidle" })
  await attKropp("omlasta")

  {
    await setPose(page, { kjelde: "fikkjemitt", scene: "", storleik: 150 })
    await page
      .waitForFunction((sel) => /fann ikkje nettet/.test(document.querySelector(sel)?.textContent ?? ""), HOVUDLINA, { timeout: 8000 })
      .catch(() => undefined)
    const l = await lina(page)
    console.log(`  framand: ${(await page.locator("button[data-kjelde]").innerText()).trim()} — ${l}`)
    if (!/fann ikkje nettet/.test(l)) brot(`${namn}: ein pose med eit nett du ikkje har sa «${l}»`)
  }

  {
    await page.goto(URL, { waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(1200)
    await importer("prosjekt.stl", kuleStl(70, 32))
    await page.getByRole("button", { name: "skjer", exact: true }).click()
    await ferdig(page)
    await page.waitForTimeout(800)
    await opneUttak(page, benk)
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: "lagre", exact: true }).click(),
    ])
    const sti = join(UT, dl.suggestedFilename())
    await dl.saveAs(sti)
    console.log(`  prosjekt: ${dl.suggestedFilename()} (${statSync(sti).size} B)`)

    await page.evaluate(() => new Promise<void>((ok) => { const r = indexedDB.deleteDatabase("slicer"); r.onsuccess = () => ok(); r.onerror = () => ok(); r.onblocked = () => ok() }))
    await page.goto(URL, { waitUntil: "networkidle" })
    await ferdig(page)
    await page.waitForTimeout(1200)
    await page.setInputFiles('input[type=file][accept*=".stl"]', sti)
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

  await setPose(page, { kjelde: "kube", scene: "", storleik: 1100, plan: skrivPlan(rutenett(3, 3)), arkB: 400, arkH: 300 })
  await page.waitForTimeout(800)
  if (!benk) await opneFane(page, "sjekk")
  const raad = page.locator("button[aria-label^='fiks ']")
  const n = await raad.count()
  await page.screenshot({ path: `${UT}/${namn}-6-blindgate.png` })
  if (!n) brot(`${namn}: ei broten regel utan råd`)
  else {
    const ord = await raad.first().getAttribute("aria-label")
    await raad.first().click()
    await ferdig(page)
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
