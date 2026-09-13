/** iPhone regression check: every control is reachable without vertical scroll.
 * Run after npm run build. Starts its own server so browser and app share the
 * same local network namespace. PW_CHROMIUM can select a locally installed browser. */
import { chromium, type Page } from "playwright"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { lesPlan, rutenett, skrivPlan } from "../lib/plan"

const port = 3217
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)])
const ready = new Promise<void>((resolve, reject) => {
  server.stdout.on("data", d => { if (String(d).includes("Ready")) resolve() })
  server.stderr.on("data", d => process.stderr.write(d))
  server.once("error", reject)
  server.once("exit", code => reject(new Error(`server exited: ${code}`)))
})
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const errors: string[] = []
const out = process.env.QA_OUT
if (out) mkdirSync(out, { recursive: true })
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const settled = (p: Page) => p.waitForFunction(() => document.querySelector('[aria-label="kontrollar"]')?.getAttribute("aria-busy") === "false")
async function fits(p: Page, name: string, selector = ".telefon-ark") {
  await p.waitForTimeout(40) // allow ResizeObserver to lay out the active page
  const problems = await p.locator(selector).evaluate(el => {
    const rect = el.getBoundingClientRect()
    const issues: string[] = []
    if (rect.height > innerHeight * .4 + 1) issues.push(`height ${rect.height} > ${innerHeight * .4}`)
    for (const child of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
      const box = child.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const style = getComputedStyle(child)
      if (style.boxShadow !== "none") issues.push("shadow")
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && child.scrollHeight > child.clientHeight + 1) issues.push(`vertical scroll: ${child.className}`)
      if (child.matches("button,[role=slider]")) {
        if (box.top < rect.top - 1 || box.bottom > rect.bottom + 1) issues.push(`clipped: ${child.getAttribute("aria-label") || child.textContent}`)
        // Off-screen swatches are intentionally horizontal; every other control fits.
        if (!child.closest(".rull-x") && (box.left < rect.left - 1 || box.right > rect.right + 1)) issues.push(`too wide: ${child.getAttribute("aria-label") || child.textContent}`)
      }
    }
    return issues
  })
  assert(!problems.length, `${name}: ${problems.join("; ")}`)
}
async function pages(p: Page, name: string, selector = ".telefon-ark") {
  let n = 0
  for (;;) {
    await fits(p, `${name}/${n}`, selector)
    const next = p.locator(selector).getByRole("button", { name: /^neste side:/ })
    if (!await next.count() || !await next.isEnabled()) break
    assert(n++ < 120, "pagination did not terminate")
    await next.click()
  }
}
try {
  await ready
  for (const [width, height, scheme] of [[390, 844, "light"], [375, 667, "dark"], [320, 568, "light"], [844, 390, "dark"]] as const) {
    const p = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true, colorScheme: scheme, acceptDownloads: true })
    p.setDefaultTimeout(8000)
    p.on("pageerror", e => errors.push(e.message))
    await p.addInitScript(() => setInterval(() => window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })), 700))
    await p.goto(`http://127.0.0.1:${port}/#p=${encodeURIComponent(JSON.stringify({ plan: skrivPlan(rutenett(12, 12)), storleik: 150 }))}`)
    await settled(p)
    await p.getByRole("button", { name: "plan, delar, ark og tid" }).click()
    const mainTabs = p.getByRole("tablist", { name: "kontrollfaner", exact: true })
    for (const tab of await mainTabs.getByRole("tab").all()) {
      const name = await tab.getAttribute("aria-label")
      await tab.click()
      const subTabs = p.getByRole("tablist", { name: `${name}: innstillingar`, exact: true })
      for (const sub of await subTabs.getByRole("tab").all()) {
        const section = `${width}×${height} ${name}/${await sub.getAttribute("aria-label")}`
        await sub.click()
        await pages(p, section)
      }
    }
    // The sheet stays compact after returning to a short tab.
    await mainTabs.getByRole("tab", { name: "form", exact: true }).click()
    await p.getByRole("tablist", { name: "form: innstillingar" }).getByRole("tab", { name: "storleik", exact: true }).click()
    await fits(p, "size")
    if (height > 500) {
      const slider = p.getByRole("slider", { name: "storleik, tal" })
      const before = Number(await slider.getAttribute("aria-valuenow"))
      await slider.press("ArrowRight")
      assert(Number(await slider.getAttribute("aria-valuenow")) > before, "size control did not update")
      await p.getByRole("button", { name: "angre", exact: true }).click()
      assert(Number(await slider.getAttribute("aria-valuenow")) === before, "undo lost parameter state")
      await settled(p)
      await mainTabs.getByRole("tab", { name: "eksport", exact: true }).click()
      await p.getByRole("tablist", { name: "eksport: innstillingar" }).getByRole("tab", { name: "plate", exact: true }).click()
      const download = p.waitForEvent("download")
      await p.getByRole("button", { name: "dxf", exact: true }).click()
      assert(/\.(dxf|zip)$/.test((await download).suggestedFilename()), "DXF export failed")
      await p.getByRole("tablist", { name: "eksport: innstillingar" }).getByRole("tab", { name: "alt", exact: true }).click()
      const toolsNext = p.getByRole("button", { name: "neste side: eksport: alt", exact: true })
      await p.waitForTimeout(150)
      while (!await p.getByRole("button", { name: "oppsett", exact: true }).count()) { await toolsNext.click(); await p.waitForTimeout(100) }
      await p.getByRole("button", { name: "oppsett", exact: true }).click()
      await pages(p, "oppsett", ".telefon-skuff")
      await p.getByRole("button", { name: "lat att verktyet" }).click()
      await p.locator("[data-kjelde]").click()
      await fits(p, "source menu", ".kjelde-meny")
      await p.getByRole("tab", { name: "lagra (0)", exact: true }).click()
      await fits(p, "saved menu", ".kjelde-meny")
      await p.locator("[data-kjelde]").click()
      await p.getByRole("button", { name: "eksport", exact: true }).click()
    }
    // Ei ny skisse, ei rekkje og eitt angresteg på kvar telefonstorleik.
    await p.goto(`http://127.0.0.1:${port}/#p=${encodeURIComponent(JSON.stringify({ plan: "", storleik: 150 }))}`)
    await p.reload()
    await settled(p)
    await p.getByRole("button", { name: "plan, delar, ark og tid" }).click()
    await p.getByRole("tablist", { name: "kontrollfaner", exact: true }).getByRole("tab", { name: "form", exact: true }).click()
    const skissefaner = p.getByRole("tablist", { name: "form: innstillingar", exact: true })
    await skissefaner.getByRole("tab", { name: "skisse", exact: true }).click()
    await p.waitForTimeout(150)
    const nå = async (mål: ReturnType<Page["getByRole"]>) => {
      const førre = p.getByRole("button", { name: /^førre side: form:/ })
      while (await førre.count() && await førre.isEnabled()) { await førre.click(); await p.waitForTimeout(80) }
      for (let i = 0; !await mål.count() && i < 6; i++) { await p.getByRole("button", { name: /^neste side: form:/ }).click(); await p.waitForTimeout(80) }
      return mål
    }
    await (await nå(p.getByRole("button", { name: "legg til c-profil", exact: true }))).click()
    await settled(p)
    const planNo = () => lesPlan(JSON.parse(decodeURIComponent(p.url().split("#p=")[1])).plan)
    await p.waitForFunction(() => JSON.parse(decodeURIComponent(location.hash.slice(3))).plan?.includes("p:"))
    assert(planNo().length === 1 && !!planNo()[0].omriss, "startprofil manglar omriss")
    await skissefaner.getByRole("tab", { name: "gjenta", exact: true }).click()
    await p.waitForTimeout(150)
    await (await nå(p.getByRole("spinbutton", { name: "ribber", exact: true }))).fill("6")
    await p.getByRole("spinbutton", { name: "avstand", exact: true }).fill("8")
    await (await nå(p.getByRole("button", { name: "lag rekkje", exact: true }))).click()
    await settled(p)
    await p.waitForFunction(() => JSON.parse(decodeURIComponent(location.hash.slice(3))).plan?.split(";").length === 6)
    assert(planNo().every(q => q.omriss && q.gruppe), "rekkja må bere profilen og gruppa")
    if (out) await p.screenshot({ path: `${out}/skisse-${width}-${height}.png` })
    await p.getByRole("button", { name: "angre", exact: true }).click()
    await settled(p)
    assert(planNo().length === 1, "angre må ta heile rekkja")
    await p.getByRole("tablist", { name: "kontrollfaner", exact: true }).getByRole("tab", { name: "grupper", exact: true }).click()
    await p.getByRole("tablist", { name: "grupper: innstillingar", exact: true }).getByRole("tab", { name: "plan", exact: true }).click()
    await p.getByRole("button", { name: "plan 1", exact: true }).click()
    await p.getByRole("button", { name: height > 500 ? "plan, delar, ark og tid" : "lat att kontrollane", exact: true }).click()
    await p.getByRole("tab", { name: "lag", exact: true }).click()
    await p.getByRole("button", { name: "dubler planet", exact: true }).click()
    await settled(p)
    assert(planNo().length === 2 && planNo().every(q => q.omriss?.length === 12), "dubler mista C-profilen")
    if (out) await p.screenshot({ path: `${out}/ios-${width}-${height}-${scheme}.png` })
    console.log(`OK ${width}×${height} ${scheme}: tabs, pages, bounds${height > 500 ? ", values, undo, DXF and settings" : ""}`)
    await p.close()
  }
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await desktop.goto(`http://127.0.0.1:${port}`)
  assert(await desktop.locator('aside[aria-label="kontrollar"]').count() === 1, "desktop inspector missing")
  console.log("OK desktop inspector")
  assert(!errors.length, errors.join("\n"))
} catch (e) {
  if (out) for (const [i, p] of browser.contexts().flatMap(c => c.pages()).entries()) await p.screenshot({path:`${out}/failure-${i}.png`}).catch(() => {})
  throw e
} finally { await browser.close(); server.kill() }
