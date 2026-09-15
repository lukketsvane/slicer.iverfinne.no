/**
 * Mobilredigering gjennom DOM og ekte nettlesar-touch, seriell som panel.
 * Start eit ferdig bygg på 3210. Berre spegelprøva byrjar med ei kjent
 * prosjektlenkje; resten tek i kontrollane frå ei heilt ny nettlesarøkt.
 * Chromium på PC provar gestane og parameterflyten, ikkje iOS-tastaturet.
 *
 *   pnpm exec tsx scripts/redigering-sjekk.ts [teikning materiale spegling skuff ledd]
 */
import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { chromium, type Browser, type CDPSession, type Locator, type Page } from "playwright"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { lesPlan, OMRISS_TAK, rutenett, skrivPlan, type Plan } from "../lib/plan"
import type { Pt } from "../lib/core"

const URL = process.env.URL ?? process.env.PANEL_URL ?? "http://127.0.0.1:3210"
const UT = resolve(process.env.REDIGERING_UT ?? "bilete/redigering")
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
const param = (side: Page): Params => ({ ...DEFAULT_PARAMS, ...JSON.parse(decodeURIComponent(side.url().split("#p=")[1] ?? "%7B%7D")) })
const plana = (side: Page) => lesPlan(param(side).plan)
const knapp = (side: Page, namn: string) => side.getByRole("button", { name: namn, exact: true })
const roleg = async (side: Page, ms = 550) => {
  await side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor({ timeout: 45000 })
  await side.waitForTimeout(ms)
}
const vent = async (side: Page, vil: (p: Params) => boolean, kvifor: string) => {
  const frist = performance.now() + 15000
  while (!vil(param(side))) {
    assert(performance.now() < frist, kvifor)
    await side.waitForTimeout(70)
  }
  await roleg(side)
}
const trykk = async (el: Locator) => { await el.tap(); await el.page().waitForTimeout(100) }
const sjekk = (namn: string, ok: boolean) => { assert(ok, namn); console.log(`  ok  ${namn}`) }
const bilete = (side: Page, namn: string) => side.screenshot({ path: join(UT, `${namn}.png`) })

async function dra(side: Page, cdp: CDPSession, punkt: Pt[], ms = 700) {
  const p = ([x, y]: Pt) => ({ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p(punkt[0])] })
  for (let i = 1; i < punkt.length; i++) {
    await side.waitForTimeout(ms / (punkt.length - 1))
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p(punkt[i])] })
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
const line = (a: Pt, b: Pt): Pt[] => Array.from({ length: 15 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 14, a[1] + (b[1] - a[1]) * i / 14])

async function tom(side: Page) {
  await trykk(side.locator("[data-kjelde]"))
  await trykk(knapp(side, "tom arbeidsflate"))
  await roleg(side)
  sjekk("tom arbeidsflate har ingen plan og er klar til teikning", plana(side).length === 0 && await side.locator("[data-teiknknapp]").getAttribute("aria-pressed") === "true")
}

async function teikning(side: Page, cdp: CDPSession) {
  await tom(side)
  // Den teikna framsida av synskuben, same synlege treffmål som minutt.
  // Reiskapen er alt armert: arbeidsplanet vert valt før fyrste drag.
  await side.touchscreen.tap(344, 87)
  await roleg(side)
  sjekk("kniven og skissehandtaka er borte", await side.locator(".handtak").evaluate((el) => getComputedStyle(el).visibility === "hidden") && await side.locator("[data-skisse='snitt']").count() === 0)
  sjekk("ingen gamle punkt eller spor står over flata", await side.locator("button[data-punkt],button[data-spor]").count() === 0)
  const maate = side.getByRole("group", { name: "teiknemåte", exact: true })
  for (const slag of ["kontur", "firkant", "kontur"]) {
    await trykk(maate.getByRole("button", { name: slag, exact: true }))
    sjekk(`${slag} kan veljast med fingeren`, await maate.getByRole("button", { name: slag, exact: true }).getAttribute("aria-pressed") === "true")
  }
  await bilete(side, "tom-kontur")
  await dra(side, cdp, [[100, 295], [224, 295], [253, 355], [238, 491], [191, 491], [181, 455], [132, 449], [113, 486], [76, 486], [89, 360], [100, 295]], 1200)
  await vent(side, (p) => lesPlan(p.plan).length === 1, "konturdraget laga ikkje ei plate")
  const kontur = plana(side)[0]
  sjekk("frihandkonturen har redigerbare punkt innanfor taket", (kontur.omriss?.length ?? 0) > 4 && (kontur.omriss?.length ?? Infinity) <= OMRISS_TAK && await side.locator("button[data-punkt]").count() === kontur.omriss?.length)
  sjekk("synskuben vel arbeidsplanet medan reiskapen er armert", kontur.n[0] === 0 && Math.abs(kontur.n[1]) === 1 && kontur.n[2] === 0)
  await trykk(knapp(side, "skjer hòl"))
  await vent(side, (p) => lesPlan(p.plan)[0]?.strek.length === 1, "hòlet kom ikkje i prosjektet")
  sjekk("omrisspunkta konkurrerer ikkje med det valde hòlet", await side.locator("button[data-punkt],button[data-midt]").count() === 0)
  const hol = plana(side)[0].strek[0]
  const holtak = await side.locator('[data-handtak="strek-storleik"]').boundingBox()
  assert(holtak, "hòlet manglar storleikshandtak")
  const h: Pt = [holtak.x + holtak.width / 2, holtak.y + holtak.height / 2]
  await dra(side, cdp, line(h, [h[0] + 18, h[1] + 22]))
  await vent(side, (p) => lesPlan(p.plan)[0].strek[0].w !== hol.w || lesPlan(p.plan)[0].strek[0].h !== hol.h, "storleikshandtaket endra ikkje hòlet")
  assert.deepEqual(plana(side)[0].omriss, kontur.omriss, "hòldraget endrar ikkje omrisspunkta")
  const original = plana(side)[0]
  sjekk("hòlet er valt før dublering", await side.locator('[data-handtak="strek-storleik"]').isVisible())
  await trykk(knapp(side, "dubler planet"))
  await vent(side, (p) => lesPlan(p.plan).length === 2, "dublering laga ikkje ein kopi")
  const [foer, kopi] = plana(side)
  assert.deepEqual(foer, original, "originalen vert ikkje endra av dublering")
  for (const felt of ["omriss", "runde", "strek", "bog", "n"] as const) assert.deepEqual(kopi[felt], original[felt], `kopien held ${felt} nøyaktig`)
  sjekk("kopien har eige namn", kopi.id !== original.id)
  sjekk("dublering slepper hòlet og gjev flyttehandtaket", await side.locator('[data-handtak="flytt"]').isVisible() && !await side.locator('[data-handtak="strek-storleik"]').isVisible())
  await trykk(knapp(side, "ramm inn"))
  await roleg(side)
  const tak = await side.locator('[data-handtak="flytt"]').boundingBox()
  assert(tak, "kopien manglar flyttehandtak")
  const a: Pt = [tak.x + tak.width / 2, tak.y + tak.height / 2]
  await dra(side, cdp, line(a, [a[0] + 30, a[1]]))
  await vent(side, (p) => JSON.stringify(lesPlan(p.plan)[1].o) !== JSON.stringify(kopi.o), "kopien flytta seg ikkje med handtaket")
  assert.deepEqual(plana(side)[0], original, "eit drag i kopien flyttar ikkje originalen")
  await bilete(side, "kontur-hol-kopi")
}

async function materiale(side: Page, cdp: CDPSession) {
  await trykk(knapp(side, "opne kontrollane"))
  await trykk(side.getByRole("tab", { name: "materiale", exact: true }))
  const rad = knapp(side, "18").locator("..")
  const b = await rad.boundingBox()
  assert(b, "tjuknrad manglar")
  // Dei siste platetjuknene vert nådde ved eit fingerdrag i den vassrette rada.
  await dra(side, cdp, line([Math.min(350, b.x + b.width - 16), b.y + b.height / 2], [70, b.y + b.height / 2]), 350)
  await trykk(knapp(side, "18"))
  await vent(side, (p) => p.tjukn === 18, "18 mm-valet verka ikkje")
  await trykk(knapp(side, "12"))
  await vent(side, (p) => p.tjukn === 12, "12 mm-valet verka ikkje")
  sjekk("12 og 18 mm er tilgjengelege med fingeren", param(side).tjukn === 12)
  const foer = await side.evaluate(() => ({ skala: visualViewport?.scale ?? 1, breidd: innerWidth, x: scrollX, y: scrollY }))
  // Klaring startar på 0,1: gå fyrst til 0,2, so ei broten skriving ikkje
  // kan passere berre fordi målet tilfeldigvis er standardverdien.
  for (const [namn, verdi, felt] of [["klaring", "0,2", "klaring"], ["tjukn", "11,85", "tjukn"], ["klaring", "0,1", "klaring"]] as const) {
    const foerVerdi = param(side)[felt]
    await knapp(side, `${namn}, skriv tal`).tap()
    assert.equal(param(side)[felt], foerVerdi, "å opne talet endra verdien")
    const inn = side.getByRole("textbox", { name: `${namn}, skriv`, exact: true })
    await inn.waitFor()
    sjekk(`${namn} opnar med eitt trykk utan lite iOS-felt`, await inn.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16))
    await inn.fill(verdi)
    await inn.press("Enter")
    await vent(side, (p) => Math.abs(p[felt] - Number(verdi.replace(",", "."))) < 1e-8, `${namn} vart ikkje sett nøyaktig`)
  }
  const etter = await side.evaluate(() => ({ skala: visualViewport?.scale ?? 1, breidd: innerWidth, x: scrollX, y: scrollY }))
  assert.deepEqual(etter, foer, "talinnlegging zoomar eller flyttar ikkje sida")
  sjekk("målt tjukn 11,85 og klaring 0,1 står i prosjektet", param(side).tjukn === 11.85 && param(side).klaring === 0.1)
  await bilete(side, "passform-11-85")
}

const SPEGL: Plan = {
  id: 7, o: [0.5, 0.27, 0.5], n: [0, -1, 0], bog: 0,
  omriss: [[-0.34, -0.35], [0.29, -0.35], [0.38, 0.12], [0.11, 0.38], [-0.26, 0.28]],
  runde: [2, 4], strek: [{ slag: "hol", form: "rekt", x: 0.08, y: 0.05, w: 0.12, h: 0.17, a: 25 }],
}

async function spegling(side: Page) {
  await trykk(knapp(side, "opne kontrollane"))
  await trykk(side.locator('[data-plan="7"] button').first())
  await trykk(knapp(side, "lat att kontrollane"))
  const original = plana(side)[0]
  await trykk(knapp(side, "spegl planet om x"))
  await vent(side, (p) => p.plan !== skrivPlan([original]), "spegling i same plan endra ingenting")
  const vend = plana(side)[0]
  sjekk("spegling i same plan held identiteten", plana(side).length === 1 && vend.id === original.id)
  assert.deepEqual(vend.omriss, original.omriss!.map(([x, y]) => [-x || 0, y]), "konturen vert spegla rundt x i rommet")
  assert.deepEqual(vend.runde, original.runde, "bogepunkta følgjer konturen")
  assert.equal(vend.strek[0].x, -original.strek[0].x, "hòlet vert spegla med konturen")
  assert.equal(vend.strek[0].y, original.strek[0].y)
  assert.equal(vend.strek[0].a, 180 - original.strek[0].a)
  sjekk("hòl og kontur er spegla saman", true)
  await trykk(knapp(side, "angre"))
  await vent(side, (p) => p.plan === skrivPlan([original]), "angre gjenoppretta ikkje originalen")
  await trykk(knapp(side, "gjer om"))
  await vent(side, (p) => p.plan === skrivPlan([vend]), "gjer om gjenoppretta ikkje speglinga")
  await trykk(knapp(side, "spegl planet om y"))
  await vent(side, (p) => lesPlan(p.plan).length === 2, "spegling utanfor midten laga ikkje ein kopi")
  const ny = plana(side)[1]
  sjekk("spegling utanfor midten lagar eige plan", ny.id !== vend.id && Math.abs(ny.o[1] + vend.o[1] - 1) < 1e-8)
  assert.deepEqual(plana(side)[0], vend, "originalen står etter spegelkopiering")
  await trykk(knapp(side, "angre"))
  await vent(side, (p) => lesPlan(p.plan).length === 1, "angre tok ikkje bort spegelkopien")
  await trykk(knapp(side, "gjer om"))
  await vent(side, (p) => lesPlan(p.plan).length === 2, "gjer om fekk ikkje spegelkopien attende")
  assert.deepEqual(plana(side)[1], ny, "gjer om held kopien nøyaktig")
  await bilete(side, "spegelkopi")
}

async function skuff(side: Page) {
  await trykk(knapp(side, "opne kontrollane"))
  await trykk(side.getByRole("tab", { name: "sjekk", exact: true }))
  await trykk(knapp(side, "oppsett"))
  await side.locator('section[aria-label="verkty"]').waitFor()
  await tom(side)
  sjekk("tom arbeidsflate lukkar den gamle skuffa", await side.locator('section[aria-label="verkty"]').count() === 0)
  sjekk("teiknemåten kan nåast etter at skuffa er lukka", await side.getByRole("group", { name: "teiknemåte" }).isVisible())
  await bilete(side, "tom-etter-skuff")
}

async function ledd(side: Page, cdp: CDPSession) {
  await trykk(knapp(side, "opne kontrollane"))
  await trykk(side.locator('[data-plan="1"] button').first())
  await trykk(knapp(side, "lat att kontrollane"))
  await roleg(side)
  sjekk("leddprikken står framleis på det valde planet", await side.locator("button[data-spor]").count() > 0)
  const grep = side.locator('[data-handtak="flytt"]')
  sjekk("flyttgrepet sitt sentrum treff flytt og ikkje ledd", await grep.evaluate((el) => {
    const b = el.getBoundingClientRect()
    return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest("[data-handtak]") === el
  }))
  const b = await grep.boundingBox()
  assert(b, "flyttgrepet manglar")
  const foer = param(side)
  const a: Pt = [b.x + b.width / 2, b.y + b.height / 2]
  await dra(side, cdp, line(a, [a[0] + 28, a[1] + 12]))
  await vent(side, (p) => p.plan !== foer.plan, "grepet flytta ikkje planet")
  assert.equal(param(side).deling, foer.deling, "eit drag i flyttgrepet endrar ikkje ledd-delinga")
  await bilete(side, "flytt-klart-av-ledd")
}

const DELAR: [string, (p: Page, c: CDPSession) => Promise<void>][] = [["teikning", teikning], ["materiale", materiale], ["spegling", spegling], ["skuff", skuff], ["ledd", ledd]]

async function main() {
  mkdirSync(UT, { recursive: true })
  const bedne = process.argv.slice(2)
  assert(bedne.every((n) => DELAR.some(([d]) => d === n)), "ukjend del; vel teikning, materiale, spegling, skuff eller ledd")
  const nettlesar: Browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? (existsSync(CHROME) ? CHROME : undefined) })
  let feil = 0
  try {
    for (const [namn, prov] of DELAR.filter(([n]) => !bedne.length || bedne.includes(n))) {
      const start = performance.now()
      const okt = await nettlesar.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
      // Som panel: ei roleg hand held kontrollane vakne medan motoren reknar.
      await okt.addInitScript(() => setInterval(() => window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })), 700))
      const side = await okt.newPage()
      side.setDefaultTimeout(12000)
      const konsoll: string[] = []
      side.on("pageerror", (e) => konsoll.push(e.message))
      side.on("console", (e) => { if (e.type() === "error" && !e.text().startsWith("Failed to load resource")) konsoll.push(e.text()) })
      console.log(`\n=== ${namn} · 390×844`)
      try {
        const plan = namn === "spegling" ? [SPEGL] : namn === "ledd" ? rutenett(1, 1).map((p) => ({ ...p, gruppe: undefined })) : null
        const lenkje = plan ? `${URL}#p=${encodeURIComponent(JSON.stringify({ plan: skrivPlan(plan), storleik: 200, tjukn: 3, view: "lag", skal: false }))}` : URL
        await side.goto(lenkje, { waitUntil: "networkidle" })
        await roleg(side)
        const cdp = await okt.newCDPSession(side)
        await prov(side, cdp)
        assert.deepEqual(konsoll, [], "ingen kodefeil i nettlesaren")
        await cdp.detach()
        console.log(`  ${namn}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
      } catch (e) {
        feil++
        console.error(`  FEIL ${namn}: ${e instanceof Error ? e.message : String(e)}`)
        await bilete(side, `${namn}-feil`).catch(() => {})
      } finally { await okt.close() }
    }
  } finally { await nettlesar.close() }
  console.log(feil ? `\n${feil} bolkar feila` : "\nredigeringa held")
  process.exitCode = feil ? 1 : 0
}
void main().catch((e) => { console.error(e); process.exitCode = 1 })
