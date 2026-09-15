/**
 * Frå ny, tom nettlesarøkt til faktisk nedlasta nesta SVG.
 *
 * Dette er automatisert Chromium på ein PC, med 390×844 mobilflate og
 * ekte nettlesar-touch via CDP. Det er ikkje ei måling på ein iPhone,
 * og ikkje ei måling av ein uøvd brukar. Ingen prosjektdata vert injiserte.
 *
 *   pnpm build && pnpm start -p 3210
 *   pnpm minutt
 *
 * URL, PW_CHROMIUM og MINUTT_UT kan overstyrast i miljøet.
 * Kontur og 450 mm/12 mm finer er standarden. MINUTT_KONTUR=0 prøver
 * firkant, MINUTT_MODELL=1 held 150 mm/3 mm, og MINUTT_DEBUG=1 lagrar
 * mellomsteg (skjermbileta tel då med i tida). Synlege talfelt vert opna
 * med eitt trykk på talet før Playwright skriv i det fokuserte feltet.
 * MINUTT_KRAKK=1 prøver breiare fotavstand og ein låg bindebit.
 */
import { chromium, type CDPSession, type Locator, type Page } from "playwright"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { measure } from "../lib/metrics"
import { lesPlan } from "../lib/plan"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { MOTOR } from "../lib/motor"
import type { ParamBag } from "../lib/core"

const URL = process.env.URL ?? "http://127.0.0.1:3210"
const UT = resolve(process.env.MINUTT_UT ?? "bilete/minutt")
const kontur = process.env.MINUTT_KONTUR !== "0"
const fullskala = process.env.MINUTT_MODELL !== "1"
const feilsok = process.env.MINUTT_DEBUG === "1"
const krakk = process.env.MINUTT_KRAKK === "1"
const krom = "C:/Program Files/Google/Chrome/Application/chrome.exe"
type Punkt = [number, number]
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

function params(side: Page): Params {
  const h = side.url().split("#p=")[1]
  return { ...DEFAULT_PARAMS, ...(h ? JSON.parse(decodeURIComponent(h)) : {}) }
}

async function drag(cdp: CDPSession, punkt: Punkt[], tid = 500) {
  const pkt = ([x, y]: Punkt) => ({ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pkt(punkt[0])] })
  for (let i = 1; i < punkt.length; i++) {
    await pause(tid / (punkt.length - 1))
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pkt(punkt[i])] })
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

function linje(a: Punkt, b: Punkt, n = 18): Punkt[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])
}

async function toFingrar(cdp: CDPSession, dx: number, dy: number) {
  const punkt = (t: number) => [90, 235].map((x, id) => ({ x: x + dx * t, y: 575 + dy * t, id: id + 1, radiusX: 5, radiusY: 5, force: 1 }))
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [punkt(0)[0]] })
  await pause(65)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punkt(0) })
  for (let i = 1; i <= 18; i++) {
    await pause(25)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punkt(i / 18) })
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

async function hovud() {
  mkdirSync(UT, { recursive: true })
  const nettlesar = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? (existsSync(krom) ? krom : undefined), args: ["--disable-features=WebShare"] })
  const oekt = await nettlesar.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true })
  const side = await oekt.newPage()
  side.setDefaultTimeout(15000)
  const cdp = await oekt.newCDPSession(side)
  const feil: string[] = []
  side.on("pageerror", (e) => feil.push(e.message))
  const byrjing = performance.now()
  let klarTid = byrjing
  const steg: { namn: string; sekund: number; brukt: number }[] = []
  let foerre = byrjing
  const merk = async (namn: string) => {
    const no = performance.now()
    const trinn = { namn, sekund: +(no - foerre).toFixed(1) / 1000, brukt: +(no - klarTid).toFixed(1) / 1000 }
    steg.push(trinn)
    foerre = no
    console.log(`${namn}: ${trinn.sekund.toFixed(2)} s · ${trinn.brukt.toFixed(2)} s`)
    if (feilsok) {
      console.log(JSON.stringify(lesPlan(params(side).plan)))
      await side.screenshot({ path: join(UT, `${steg.length}-${namn.replace(/[^a-z0-9]/gi, "-")}.png`) })
    }
  }
  const ferdig = async () => {
    await side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor()
  }
  const endra = async (vilkaar: (p: Params) => boolean, kvifor: string) => {
    const frist = performance.now() + 10000
    while (!vilkaar(params(side))) {
      if (performance.now() > frist) throw new Error(kvifor)
      await pause(60)
    }
    await ferdig()
  }
  const planTal = async (n: number) => {
    await side.waitForFunction((tal) => {
      const h = location.hash.split("#p=")[1]
      if (!h) return tal === 0
      const plan = JSON.parse(decodeURIComponent(h)).plan ?? ""
      return plan ? plan.split(";").length === tal : tal === 0
    }, n)
    await ferdig()
  }
  const trykk = async (element: Locator) => {
    await element.tap()
    await pause(120)
  }
  const knapp = (namn: string) => side.getByRole("button", { name: namn, exact: true })
  const heim = async () => { await trykk(knapp("ramm inn")); await pause(450) }
  const noyaktigTal = async (namn: string, maal: number) => {
    await knapp(`${namn}, skriv tal`).tap()
    const felt = side.getByRole("textbox", { name: `${namn}, skriv`, exact: true })
    await felt.fill(String(maal))
    await felt.press("Enter")
    await pause(120)
  }
  const flytt = async (dx: number, dy: number) => {
    const foer = params(side).plan
    await toFingrar(cdp, dx, dy)
    await endra((p) => p.plan !== foer, "Draget flytta ikkje det valde planet")
  }
  try {
    await side.goto(URL, { waitUntil: "networkidle" })
    await ferdig()
    if (lesPlan(params(side).plan).length) throw new Error("Økta starta med plan")
    klarTid = performance.now()
    foerre = klarTid
    console.log(`Kald oppstart: ${((klarTid - byrjing) / 1000).toFixed(2)} s`)
    console.log(`Web Share tilgjengeleg: ${await side.evaluate(() => typeof navigator.share === "function")}`)
    await trykk(side.locator("[data-kjelde]"))
    await trykk(knapp("tom arbeidsflate"))
    if (fullskala) {
      await trykk(knapp("opne kontrollane"))
      await trykk(side.getByRole("tab", { name: "plan", exact: true }))
      await noyaktigTal("storleik", 450)
      await trykk(side.getByRole("tab", { name: "materiale", exact: true }))
      await trykk(knapp("12"))
      await noyaktigTal("breidd", 1000)
      await noyaktigTal("høgd", 1000)
      await trykk(knapp("lat att kontrollane"))
      await endra((p) => p.storleik === 450 && p.tjukn === 12 && p.arkB === 1000 && p.arkH === 1000, "Måla vart ikkje sette gjennom kontrollane")
      await merk("450 mm og 12 mm finer")
      await heim()
    }
    // Kubens framside er eit synleg, teikna treffmål på denne mobilflata.
    await side.touchscreen.tap(344, 87)
    await pause(600)
    // Tom arbeidsflate har alt teke fram reiskapen; kuben kan veljast
    // medan han står på. Berre ei avskrudd teikning treng eit trykk.
    if (await side.locator("[data-teiknknapp]").getAttribute("aria-pressed") !== "true") await trykk(side.locator("[data-teiknknapp]"))
    if (kontur) await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "kontur", exact: true }))
    await drag(cdp, kontur ? [[100, 305], [230, 305], [258, 490], [217, 490], [202, 456], [130, 456], [115, 490], [75, 490], [100, 305]] : linje([80, 300], [250, 500]), kontur ? 1100 : 550)
    await planTal(1)
    if (krakk) {
      await heim()
      await flytt(-35, 0)
      await side.touchscreen.tap(344, 87)
      await pause(600)
    }
    await merk("side teikna")
    await trykk(knapp("skjer hòl"))
    await endra((p) => lesPlan(p.plan)[0]?.strek.length === 1, "Hòlet vart ikkje skrive til prosjektet")
    // Hòlet får plass mellom setet og utsparinga til føtene.
    const holFlytt = await side.locator('[data-handtak="strek-flytt"]').boundingBox()
    if (!holFlytt) throw new Error("Hòlet manglar flyttehandtak")
    const holMidt: Punkt = [holFlytt.x + holFlytt.width / 2, holFlytt.y + holFlytt.height / 2]
    const holY = lesPlan(params(side).plan)[0].strek[0].y
    await drag(cdp, linje(holMidt, [holMidt[0], holMidt[1] - 25]))
    await endra((p) => lesPlan(p.plan)[0].strek[0].y > holY, "Hòlet flytta seg ikkje")
    // Forma hòlet med same handtak som fingeren brukar; 12 mm er berre startpunktet.
    const holgrep = await side.locator('[data-handtak="strek-storleik"]').boundingBox()
    if (!holgrep) throw new Error("Hòlet manglar storleikshandtak")
    const holStart: Punkt = [holgrep.x + holgrep.width / 2, holgrep.y + holgrep.height / 2]
    const holFoer = lesPlan(params(side).plan)[0].strek[0].w
    await drag(cdp, linje(holStart, [holStart[0] + 20, holStart[1] + 25]))
    await endra((p) => lesPlan(p.plan)[0].strek[0].w > holFoer, "Hòlet vart ikkje større av draget")
    await merk("hol forma")
    await trykk(knapp("dubler planet"))
    await planTal(2)
    await heim()
    await flytt(krakk ? 70 : 35, 0)
    await merk("side dublert og flytta")
    // Heimvinkelen gjer den øvste kubesida tilgjengeleg att.
    await heim()
    await side.touchscreen.tap(351, 61)
    await pause(650)
    await trykk(side.locator("[data-teiknknapp]"))
    if (kontur) await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }))
    await drag(cdp, linje([65, 295], [265, 515]), 550)
    await planTal(3)
    await heim()
    await flytt(0, -80)
    await merk("sete teikna og lyft")
    if (krakk) {
      await heim()
      await side.touchscreen.tap(351, 61)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      await drag(cdp, linje([210, 295], [235, 515]), 550)
      await planTal(4)
      await heim()
      await flytt(0, 55)
      await merk("laag bindebit teikna og senka")
    }
    await trykk(side.getByRole("tab", { name: "kontur", exact: true }))
    await ferdig()
    await trykk(knapp("eksport"))
    const nedlastingVent = side.waitForEvent("download", { timeout: 45000 })
    await trykk(knapp("ark"))
    const nedlasting = await nedlastingVent
    const filsti = join(UT, nedlasting.suggestedFilename())
    await nedlasting.saveAs(filsti)
    const fullfoert = performance.now()
    if (await nedlasting.failure()) throw new Error(`Nedlasting feila: ${await nedlasting.failure()}`)
    const brukt = (fullfoert - klarTid) / 1000
    await merk("nesta fil lagra")
    const p = params(side)
    const fil = readFileSync(filsti, "utf8")
    const svg = await side.evaluate((tekst) => {
      const dokument = new DOMParser().parseFromString(tekst, "image/svg+xml")
      const rot = dokument.documentElement
      const kutt = [...dokument.querySelectorAll("path")].filter((q) => q.getAttribute("stroke") !== "#000000")
      const breidd = rot.getAttribute("width") ?? ""
      const hogd = rot.getAttribute("height") ?? ""
      const koordinatar = kutt.flatMap((q) => [...(q.getAttribute("d") ?? "").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]))
      return { lesefeil: !!dokument.querySelector("parsererror"), breidd, hogd, synsboks: rot.getAttribute("viewBox"), kuttbaner: kutt.length, alleLukka: kutt.every((q) => /z\s*$/i.test(q.getAttribute("d") ?? "")), endeleg: !/NaN|Infinity/.test(tekst), innanArket: koordinatar.every(([x, y]) => x >= -0.02 && x <= parseFloat(breidd) + 0.02 && y >= -0.02 && y <= parseFloat(hogd) + 0.02) }
    }, fil)
    const bygg = makeBygg(p, DETAIL.mid)
    const maal = measure(p, bygg)
    const venta = MOTOR.exportFile(p as unknown as ParamBag, "ark")
    const teikna = lesPlan(p.plan)
    const deltal = krakk ? 4 : 3
    const sjekkar = {
      redigerbarePlater: teikna.length === deltal && teikna.every((q) => (q.omriss?.length ?? 0) >= 4),
      kopierteHol: teikna.slice(0, 2).every((q) => q.strek.some((s) => s.slag === "hol")),
      sameKopierteOmriss: JSON.stringify(teikna[0]?.omriss) === JSON.stringify(teikna[1]?.omriss),
      sameKopierteHol: JSON.stringify(teikna[0]?.strek) === JSON.stringify(teikna[1]?.strek),
      skildeSider: Math.abs(teikna[0].o[1] - teikna[1].o[1]) > (krakk ? 0.55 : 0.2),
      rettvinklaSete: Math.abs(teikna[0].n.reduce((sum, v, i) => sum + v * teikna[2].n[i], 0)) < 0.0001,
      automatiskeLedd: bygg.s.ledd === (krakk ? 4 : 2),
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      godsVedSporbotn: maal.narrow >= Math.max(2, p.tjukn),
      svgMillimeter: /mm$/.test(svg.breidd) && /mm$/.test(svg.hogd) && parseFloat(svg.breidd) === p.arkB && parseFloat(svg.hogd) === p.arkH && svg.synsboks?.split(/\s+/).map(Number).join(" ") === `0 0 ${p.arkB} ${p.arkH}`,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= deltal,
      kuttInnanArket: svg.innanArket,
      materialetFolgerLedda: Math.abs(maal.slotW - p.tjukn - p.klaring) < 0.001,
      alleDelarNesta: bygg.dl.delar.length === deltal && bygg.ns.sheets.reduce((n, ark) => n + ark.placed.length, 0) === deltal && !bygg.ns.spilt && !bygg.ns.kross,
      nedlastingLikMotor: fil === venta.text,
      ingenSidefeil: feil.length === 0,
      ...(fullskala ? { storleikOgTjukn: p.storleik === 450 && p.tjukn === 12 } : {}),
    }
    await side.screenshot({ path: join(UT, "nesta.png") })
    // Bileta av resultatet kjem etter den stoppa klokka.
    await trykk(knapp("lat att kontrollane"))
    await trykk(side.getByRole("tab", { name: "lag", exact: true }))
    await heim()
    await side.touchscreen.tap(45, 610)
    await pause(350)
    await side.screenshot({ path: join(UT, "platestudie.png") })
    const rapport = {
      dato: new Date().toISOString(),
      miljo: "Automatisert Chromium på PC, mobilflate 390×844; WebShare deaktivert for ekte nedlasting til disk. Ikkje fysisk iPhone, iOS-delingsark eller menneskeleg tidsprøve.",
      avgrensing: "Platestudie med halv-i-halv-ledd; ikkje ei ferdig referansekrakk, tapp-/slisskonstruksjon eller fysisk lastprøvd stol.",
      url: URL,
      scenario: `${fullskala ? "450 mm arbeidsrom, 12 mm finer" : "150 mm modell"}: teikna ${kontur ? "konturside" : "firkanta side"} med hol, duplikat, sete${krakk ? " og laag bindebit" : ""}`,
      feilsokbileteMedITida: feilsok,
      sekundTilLagraFil: brukt,
      sekundMedOppstart: (fullfoert - byrjing) / 1000,
      maalsekund: 60,
      maalNaadd: brukt < 60 && Object.values(sjekkar).every(Boolean),
      steg, params: p, fil: filsti, svg,
      delar: bygg.dl.delar.length,
      ark: bygg.ns.sheets.length,
      faktiskeMillimeter: [maal.envX, maal.envY, maal.envZ],
      sporbreidd: maal.slotW,
      montasje: bygg.s.montering,
      sjekkar, feil,
    }
    writeFileSync(join(UT, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n")
    console.log(JSON.stringify(rapport, null, 2))
    if (!Object.values(sjekkar).every(Boolean)) process.exitCode = 1
  } catch (e) {
    await side.screenshot({ path: join(UT, "feil.png") }).catch(() => {})
    writeFileSync(join(UT, "feil.json"), JSON.stringify({ feil: String(e), params: params(side), steg, sidefeil: feil }, null, 2))
    throw e
  } finally {
    await cdp.detach()
    await nettlesar.close()
  }
}

void hovud().catch((e) => { console.error(e); process.exitCode = 1 })
