/**
 * Samanlikn same teikneoppgåve med og utan gjentaking, gjennom synlege
 * kontrollar og nettlesar-touch. Ingen prosjekt vert lasta inn. Klokka
 * stoggar fyrst når den nesta fila er lagra, før bilete og geometri blir lesne.
 * Automatisert Chromium på Linux er ikkje ein fysisk iPhone eller ein brukar.
 */
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { chromium, type Page, type CDPSession, type Locator } from "playwright"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { lesPlan } from "../lib/plan"
import { makeBygg } from "../lib/bygg"
import { measure } from "../lib/metrics"
import { DETAIL } from "../lib/snitt"
import { MOTOR } from "../lib/motor"
import type { ParamBag, Pt } from "../lib/core"

const URL = process.env.URL ?? "http://127.0.0.1:3210"
const UT = resolve(process.env.GJENTA_MOBIL_UT ?? "bilete/gjenta-mobil")
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const params = (s: Page): Params => ({ ...DEFAULT_PARAMS, ...JSON.parse(decodeURIComponent(s.url().split("#p=")[1] ?? "%7B%7D")) })
const plan = (s: Page) => lesPlan(params(s).plan)
const line = (a: Pt, b: Pt): Pt[] => Array.from({ length: 19 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 18, a[1] + (b[1] - a[1]) * i / 18])
async function dra(c: CDPSession, punkt: Pt[], ms: number) {
  const p = ([x, y]: Pt) => ({ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 })
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p(punkt[0])] })
  for (const q of punkt.slice(1)) { await pause(ms / (punkt.length - 1)); await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p(q)] }) }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
async function flytt(c: CDPSession, dx: number, dy = 0) {
  const punkt = (t: number) => [90, 235].map((x, i) => ({ x: x + dx * t, y: 575 + dy * t, id: i + 1, radiusX: 5, radiusY: 5, force: 1 }))
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [punkt(0)[0]] })
  await pause(65)
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punkt(0) })
  for (let i = 1; i <= 18; i++) { await pause(25); await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punkt(i / 18) }) }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

async function hovud() {
  mkdirSync(UT, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ["--disable-features=WebShare"] })
  const rapport = []
  try {
    // To sjølvstendige økter; manuell brukar den gamle dubler-og-dra-flyten.
    for (const maate of ["manuell", "gjenta"] as const) {
      const ut = join(UT, maate); mkdirSync(ut, { recursive: true })
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, acceptDownloads: true })
      const s = await context.newPage(); s.setDefaultTimeout(15000)
      const c = await context.newCDPSession(s)
      const feil: string[] = []; s.on("pageerror", (e) => feil.push(e.message))
      const knapp = (n: string) => s.getByRole("button", { name: n, exact: true })
      const trykk = async (el: Locator) => { await el.tap(); await pause(120) }
      const klar = () => s.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor({ timeout: 45000 })
      const vent = async (vil: () => boolean) => { const frist = performance.now() + 15000; while (!vil()) { assert(performance.now() < frist, "prosjektet endra seg ikkje"); await pause(60) }; await klar() }
      const tal = async (n: string, v: number) => { await trykk(knapp(`${n}, skriv tal`)); const t = s.getByRole("textbox", { name: `${n}, skriv`, exact: true }); await t.fill(String(v)); await t.press("Enter"); await pause(120) }
      const heim = async () => { await trykk(knapp("ramm inn")); await pause(450) }
      const flyttValt = async (dx: number, dy = 0) => { const foer = params(s).plan; await flytt(c, dx, dy); await vent(() => params(s).plan !== foer) }
      try {
        const oppstart = performance.now()
        await s.goto(URL, { waitUntil: "networkidle" }); await klar()
        assert.equal(plan(s).length, 0)
        const start = performance.now()
        await trykk(s.locator("[data-kjelde]")); await trykk(knapp("tom arbeidsflate"))
        await trykk(knapp("opne kontrollane")); await trykk(s.getByRole("tab", { name: "plan", exact: true })); await tal("storleik", 450)
        await trykk(s.getByRole("tab", { name: "materiale", exact: true })); await trykk(knapp("12")); await tal("breidd", 1500); await tal("høgd", 1500)
        await trykk(knapp("lat att kontrollane")); await klar(); await heim()
        await s.touchscreen.tap(344, 87); await pause(600)
        await trykk(s.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "kontur", exact: true }))
        await dra(c, [[100, 305], [230, 305], [258, 490], [217, 490], [202, 456], [130, 456], [115, 490], [75, 490], [100, 305]], 1100)
        await vent(() => plan(s).length === 1)
        await trykk(knapp("skjer hòl")); await vent(() => plan(s)[0].strek.length === 1)
        await trykk(knapp("dubler planet")); await vent(() => plan(s).length === 2); await heim(); await flyttValt(15)
        const par = plan(s).slice(0, 2)
        assert.equal(await knapp("gjenta flyttinga").count(), 1, "gjentakinga skal finnast rett ved tommelen")
        // Hit-test midten: ein synleg knapp under eit anna element er ikkje tilgjengeleg.
        assert(await knapp("gjenta flyttinga").evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === el }))
        const startRekkje = performance.now()
        for (let n = 3; n <= 6; n++) {
          if (maate === "gjenta") await trykk(knapp("gjenta flyttinga"))
          else { await trykk(knapp("dubler planet")); await vent(() => plan(s).length === n); await heim(); await flyttValt(15) }
          await vent(() => plan(s).length === n)
        }
        const rekkjeSekund = (performance.now() - startRekkje) / 1000
        const ribber = plan(s)
        assert.deepEqual(ribber.slice(0, 2), par, "dei to fyrste ribbene skal ikkje flytte seg")
        const d = par[1].o.map((v, i) => v - par[0].o[i])
        const avvik = Math.max(...ribber.flatMap((r, n) => r.o.map((v, i) => Math.abs(v - par[0].o[i] - n * d[i]) * 450)))
        if (maate === "gjenta") assert(avvik < 0.001, "gjentakinga skal halde nøyaktig avstand")
        await heim(); await s.touchscreen.tap(351, 61); await pause(650)
        await trykk(s.locator("[data-teiknknapp]"))
        await trykk(s.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }))
        await dra(c, line([65, 295], [265, 515]), 550); await vent(() => plan(s).length === 7)
        await heim(); await flyttValt(0, -80)
        await trykk(s.getByRole("tab", { name: "kontur", exact: true })); await klar(); await trykk(knapp("eksport"))
        const nedlasting = s.waitForEvent("download", { timeout: 45000 }); await trykk(knapp("ark")); const fil = await nedlasting
        const filsti = join(ut, fil.suggestedFilename()); await fil.saveAs(filsti); assert.equal(await fil.failure(), null)
        const slutt = performance.now()
        const p = params(s), bygg = makeBygg(p, DETAIL.mid), m = measure(p, bygg)
        assert.equal(readFileSync(filsti, "utf8"), MOTOR.exportFile(p as unknown as ParamBag, "ark").text, "nedlasta geometri skal vere motoren si")
        assert.equal(bygg.dl.delar.length, 7); assert.equal(bygg.s.ledd, 6)
        assert.equal(bygg.ns.spilt, 0); assert.equal(bygg.ns.kross, 0)
        assert.equal(bygg.ns.sheets.reduce((n, a) => n + a.placed.length, 0), 7)
        assert.equal(bygg.s.montering.brot.length, 0); assert.equal(bygg.s.montering.klem.length, 0)
        assert(Math.abs(m.slotW - p.tjukn - p.klaring) < 0.001)
        assert.deepEqual(feil, [])
        await s.screenshot({ path: join(ut, "nesta.png") })
        await trykk(knapp("lat att kontrollane")); await trykk(s.getByRole("tab", { name: "lag", exact: true })); await heim()
        await s.screenshot({ path: join(ut, "konstruksjon.png") })
        const r = { maate, sekundTilLagraFil: (slutt - start) / 1000, sekundMedOppstart: (slutt - oppstart) / 1000, rekkjeSekund, rekkjeTrykk: maate === "gjenta" ? 4 : 8, rekkjeDrag: maate === "gjenta" ? 0 : 4, storsteAvstandsavvikMM: avvik, delar: 7, ledd: 6, ark: bygg.ns.sheets.length, faktiskeMM: [m.envX, m.envY, m.envZ], params: p }
        rapport.push(r); writeFileSync(join(ut, "rapport.json"), JSON.stringify(r, null, 2))
        console.log(`${maate}: ${r.sekundTilLagraFil.toFixed(2)} s til lagra fil; rekkje ${rekkjeSekund.toFixed(2)} s; avstand ${avvik.toFixed(4)} mm`)
        // Angre, gjer om og ny arbeidsflate blir prøvde etter at klokka stoggar.
        await trykk(knapp("angre")); await pause(500); await trykk(knapp("gjer om")); await vent(() => params(s).plan === p.plan)
        await trykk(s.locator("[data-kjelde]")); await trykk(knapp("tom arbeidsflate")); await vent(() => plan(s).length === 0)
        assert.equal(await knapp("gjenta flyttinga").count(), 0, "gamal rekkje må ikkje følgje ny arbeidsflate")
      } catch (e) {
        await s.screenshot({ path: join(ut, "feil.png") }).catch(() => {})
        writeFileSync(join(ut, "feil.json"), JSON.stringify({ feil: String(e), params: params(s), sidefeil: feil }, null, 2)); throw e
      } finally { await context.close() }
    }
    writeFileSync(join(UT, "rapport.json"), JSON.stringify({ miljo: "Automatisert Chromium, Linux, 390×844 og CDP-touch. Ikkje fysisk iPhone eller menneskeleg tidsprøve.", avgrensing: "Platestudie, ikkje ferdig referansemøbel eller fysisk lastprøve.", rapport }, null, 2))
  } finally { await browser.close() }
}
void hovud().catch((e) => { console.error(e); process.exitCode = 1 })
