/**
 * Frå ny, tom nettlesarøkt til faktisk nedlasta nesta SVG — med
 * referansekrakken: to sider med vindauge, spegla, eit sete som landar
 * oppå, og tre stag med tapp og slisse.
 *
 * Dette er automatisert Chromium på ein PC, med 390×844 mobilflate og
 * ekte nettlesar-touch via CDP. Det er ikkje ei måling på ein iPhone,
 * og ikkje ei måling av ein uøvd brukar. Ingen prosjektdata vert injiserte.
 *
 *   pnpm build && pnpm start -p 3210
 *   pnpm minutt
 *
 * URL, PW_CHROMIUM og MINUTT_UT kan overstyrast i miljøet.
 * Kontur og 450 mm/12 mm er standarden. MINUTT_KONTUR=0 teiknar sida som
 * ein firkant, MINUTT_MODELL=1 set 150 mm/3 mm, og MINUTT_DEBUG=1 lagrar
 * mellomsteg (skjermbileta tel då med i tida). MINUTT_KRAKK=1 teiknar
 * bogesider med ovalt vindauge i staden for A-sider, MINUTT_KRAKK=2 to
 * kryssande bein lagde med ×2 og eit sekskanta sete, MINUTT_KRAKK=3
 * bogesidene med setet mellom seg (MELLOM=x0,y0,x1,y1 flyttar draget),
 * MINUTT_KRAKK=4 kubekrakken: éin vegg, ×4 til ei kasse med fingrar, sete oppå,
 * MINUTT_KRAKK=5 trekantkrakken: eitt bein ut frå midten, ×3, trekantsete,
 * MINUTT_KRAKK=6 spilekrakken: bogesider utan vindauge, setet mellom dei delt
 * i fem spiler i 2d-flata, kilar på, tre stag — kvar tapp stikk ut og har kilen sin.
 * MINUTT_KILAR=1 slår kilar på i kva scenario som helst, før teikninga.
 */
import { chromium, type CDPSession, type Locator, type Page } from "playwright"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { lesPlan, type Plan } from "../lib/plan"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { MOTOR } from "../lib/motor"
import type { ParamBag } from "../lib/core"
import { unzip } from "../lib/zip"

const URL = process.env.URL ?? "http://127.0.0.1:3210"
const UT = resolve(process.env.MINUTT_UT ?? "bilete/minutt")
const kontur = process.env.MINUTT_KONTUR !== "0"
const fullskala = process.env.MINUTT_MODELL !== "1"
const feilsok = process.env.MINUTT_DEBUG === "1"
const krakk = process.env.MINUTT_KRAKK === "1" || process.env.MINUTT_KRAKK === "3" || process.env.MINUTT_KRAKK === "6"
// MINUTT_KRAKK=2: to kryssande bein (×2) og eit sekskanta sete — rundt-grepet på tid
const sekskant = process.env.MINUTT_KRAKK === "2"
// MINUTT_KRAKK=3: bogesidene med setet MELLOM seg, tappane gjennom og i flukt
const mellomSete = process.env.MINUTT_KRAKK === "3" || process.env.MINUTT_KRAKK === "6"
// MINUTT_KRAKK=6: setet mellom sidene delt i fem spiler i 2d-flata, og kilar på
const spiler = process.env.MINUTT_KRAKK === "6"
// kilar på: eitt ord i materialfana, og kvar tapp gjennom stikk ut med kilen sin
const kilarPaa = spiler || process.env.MINUTT_KILAR === "1"
// MINUTT_KRAKK=4: kubekrakken — éin vegg med bogeopning, ×4 til ei kasse med fingrar, sete oppå
const kube = process.env.MINUTT_KRAKK === "4"
// MINUTT_KRAKK=5: trekantkrakken — eitt bein ut frå midten, ×3, eit runda trekantsete oppå
const trekant = process.env.MINUTT_KRAKK === "5"
const krom = "C:/Program Files/Google/Chrome/Application/chrome.exe"
type Punkt = [number, number]
const MELLOM_A: Punkt = [JSON.parse(process.env.MELLOM ?? "[136,337,254,473]")[0], JSON.parse(process.env.MELLOM ?? "[136,337,254,473]")[1]]
const MELLOM_B: Punkt = [JSON.parse(process.env.MELLOM ?? "[136,337,254,473]")[2], JSON.parse(process.env.MELLOM ?? "[136,337,254,473]")[3]]
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
  try {
    await side.goto(URL, { waitUntil: "networkidle" })
    await ferdig()
    if (lesPlan(params(side).plan).length) throw new Error("Økta starta med plan")
    klarTid = performance.now()
    foerre = klarTid
    console.log(`Kald oppstart: ${((klarTid - byrjing) / 1000).toFixed(2)} s`)
    console.log(`Web Share tilgjengeleg: ${await side.evaluate(() => typeof navigator.share === "function")}`)
    // TOM ARBEIDSFLATE: halvmeteren, tolv millimeter, framsida mot deg og konturen klar
    await trykk(side.locator("[data-kjelde]"))
    await trykk(knapp("tom arbeidsflate"))
    await endra((p) => p.storleik === 450 && p.tjukn === 12, "Tom arbeidsflate opna ikkje i møbelmål")
    await pause(700)
    if (!fullskala) {
      await trykk(knapp("opne kontrollane"))
      await trykk(side.getByRole("tab", { name: "plan", exact: true }))
      await noyaktigTal("storleik", 150)
      await trykk(side.getByRole("tab", { name: "materiale", exact: true }))
      await trykk(knapp("3"))
      await trykk(knapp("lat att kontrollane"))
      await endra((p) => p.storleik === 150 && p.tjukn === 3, "Modellmåla vart ikkje sette")
      await merk("150 mm og 3 mm")
    }
    // KILANE FYRST: materialet vert valt før teikninga, og tappane som stikk ut er med i ramma
    if (kilarPaa) {
      await trykk(knapp("opne kontrollane"))
      await trykk(side.getByRole("tab", { name: "materiale", exact: true }))
      await trykk(knapp("kilar på"))
      await trykk(knapp("lat att kontrollane"))
      await endra((p) => p.kilar === 1, "Kilane vart ikkje slegne på")
      await merk("kilar på")
    }
    if (trekant) {
      const mm = (x: number, z: number): Punkt => [195 + x / 2.28, 506 - z / 2.28]
      const bein = [mm(25, 438), mm(150, 438), mm(230, 0), mm(180, 0), mm(100, 170), mm(40, 0), mm(25, 0), mm(25, 438)]
      await drag(cdp, bein.flatMap((q, i) => (i ? linje(bein[i - 1], q, 5).slice(1) : [q])), 1000)
      await planTal(1)
      await merk("bein teikna")
      await trykk(knapp("3 rundt"))
      await planTal(3)
      await merk("tre bein")
      await heim()
      await side.touchscreen.tap(351, 61)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "kontur", exact: true }))
      const topp = (r: number, v: number): Punkt => [195 + (r / 2.21) * Math.cos(v), 405 - (r / 2.21) * Math.sin(v)]
      const sete: Punkt[] = []
      for (let k = 0; k < 3; k++) {
        const v = (k * 2 * Math.PI) / 3
        for (const d of [-0.18, -0.09, 0, 0.09, 0.18]) sete.push(topp(215 - 60 * Math.abs(d), v + d))
      }
      sete.push(sete[0])
      await drag(cdp, sete.flatMap((q, i) => (i ? linje(sete[i - 1], q, 3).slice(1) : [q])), 900)
      await planTal(4)
      await merk("sete teikna")
    } else if (kube) {
      await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }))
      await drag(cdp, linje([118, 331], [272, 506]), 550)
      await planTal(1)
      await merk("vegg teikna")
      await trykk(side.locator("[data-teiknknapp]"))
      await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "kontur", exact: true }))
      const boge = Array.from({ length: 9 }, (_, i): Punkt => [195 + 30 * Math.cos(Math.PI * i / 8), 390 - 30 * Math.sin(Math.PI * i / 8)])
      await drag(cdp, [...linje([225, 390], [225, 470], 6), [165, 470], ...linje([165, 470], [165, 390], 6).slice(1), ...boge.slice().reverse().slice(1), [225, 390]], 900)
      await endra((p) => lesPlan(p.plan)[0]?.strek.some((q) => q.form === "kontur") ?? false, "Bogeopninga vart ikkje eit hòl i veggen")
      await merk("opning")
      await trykk(knapp("4 rundt"))
      await planTal(4)
      await merk("kasse")
      await heim()
      await side.touchscreen.tap(351, 61)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }))
      await drag(cdp, linje([109, 319], [281, 491]), 550)
      await planTal(5)
      await merk("sete teikna")
    } else if (sekskant) {
      // BEINET: éin kontur med boge mellom føtene, midt i kroppen
      const bue = Array.from({ length: 9 }, (_, i): Punkt => [195 + 34 * Math.cos(Math.PI * i / 8), 506 - 60 * Math.sin(Math.PI * i / 8)])
      await drag(cdp, [[135, 312], [195, 312], [255, 312], [262, 506], [229, 506], ...bue.slice(1, -1), [161, 506], [128, 506], [135, 312]], 1200)
      await planTal(1)
      await merk("bein teikna")
      await trykk(knapp("2 rundt"))
      await planTal(2)
      await merk("bein kryssa")
      await heim()
      await side.touchscreen.tap(351, 61)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      const hex = Array.from({ length: 7 }, (_, i): Punkt => [195 + 88 * Math.cos(Math.PI * i / 3), 405 + 88 * Math.sin(Math.PI * i / 3)])
      await drag(cdp, hex.flatMap((q, i) => (i ? linje(hex[i - 1], q, 4).slice(1) : [q])), 700)
      await planTal(3)
      await merk("sete teikna")
    } else {
      // SIDA: éin kontur, føtene i golvet — nesten lik på båe sider, so ho vert lik
      const sideKontur: Punkt[] = krakk
        ? [[135, 310], [195, 310], [255, 310], [268, 330], [262, 400], [274, 470], [280, 506], [245, 506], [226, 472], [195, 458], [164, 472], [145, 506], [110, 506], [116, 470], [128, 400], [122, 330], [135, 310]]
        : [[115, 310], [175, 311], [235, 312], [262, 503], [214, 503], [178, 440], [136, 503], [88, 503], [115, 310]]
      await drag(cdp, kontur ? sideKontur : linje([80, 300], [310, 503]), kontur ? 1200 : 550)
      await planTal(1)
      await merk("side teikna")
      // VINDAUGET: ein kontur inni den valde sida er eit hòl i henne — spilekrakken har ikkje eit, staget går der
      if (!spiler) {
        await trykk(side.locator("[data-teiknknapp]"))
        const vindauge: Punkt[] = krakk
          ? Array.from({ length: 25 }, (_, i): Punkt => [195 + 29 * Math.sin(Math.PI * i / 12), 391 - 39 * Math.cos(Math.PI * i / 12)])
          : [[150, 360], [205, 360], [190, 420], [140, 420], [150, 360]]
        await drag(cdp, vindauge, 900)
        await endra((p) => lesPlan(p.plan)[0]?.strek.some((q) => q.form === "kontur") ?? false, "Vindauget vart ikkje eit hòl i sida")
        await merk("vindauge")
      }
      // PARET: sida står på spegelen, og spegelen deler henne i to
      await trykk(knapp("spegl planet om y"))
      await planTal(2)
      await merk("sidene spegla")
      // SETET: frå toppsynet, og det landar oppå sidene
      await heim()
      await side.touchscreen.tap(351, 61)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: "firkant", exact: true }))
      await drag(cdp, mellomSete ? linje(MELLOM_A, MELLOM_B) : linje([110, 320], [280, 490]), 550)
      await planTal(3)
      await merk("sete teikna")
      if (mellomSete) {
        await pause(300)
        await merk("sete mellom")
        await side.screenshot({ path: join(UT, "mellom.png") })
      }
      if (spiler) {
        // SPILENE: setet flatt i 2d-flata, eitt trykk deler det i fem like spiler
        await trykk(side.locator("[data-flatt]"))
        await trykk(knapp("5 spiler"))
        await planTal(7)
        await trykk(knapp("ferdig"))
        // og kroppen får stå ferdig snitta før ramma vert sett: tappane er med i henne
        await pause(500)
        await ferdig()
        await merk("fem spiler")
      }
      // STAGA: frå sida, endane hakar seg i sidene, og spegelen gjev det andre
      await heim()
      await side.touchscreen.tap(372, 88)
      await pause(650)
      await trykk(side.locator("[data-teiknknapp]"))
      await drag(cdp, linje([133, 440], [257, 468]), 550)
      await planTal(spiler ? 8 : 4)
      await trykk(knapp("spegl planet om x"))
      await planTal(spiler ? 9 : 5)
      await trykk(side.locator("[data-teiknknapp]"))
      // det øvste staget: under spilene med luft, ikkje inn i dei
      await drag(cdp, spiler ? linje([133, 344], [257, 371]) : linje([133, 318], [257, 345]), 550)
      await planTal(spiler ? 10 : 6)
      await merk("stag teikna")
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
    // FLEIRE ARK ER EI ZIP: kvar SVG i ho vert lesen for seg
    const raa = readFileSync(filsti)
    const erZip = raa[0] === 0x50 && raa[1] === 0x4b
    const ark = erZip
      ? unzip(raa.buffer.slice(raa.byteOffset, raa.byteOffset + raa.byteLength) as ArrayBuffer).map((e) => new TextDecoder().decode(e.data))
      : [raa.toString("utf8")]
    const lesSvg = (tekst: string) => side.evaluate((tekst) => {
      const dokument = new DOMParser().parseFromString(tekst, "image/svg+xml")
      const rot = dokument.documentElement
      const kutt = [...dokument.querySelectorAll("path")].filter((q) => q.getAttribute("stroke") !== "#000000")
      const breidd = rot.getAttribute("width") ?? ""
      const hogd = rot.getAttribute("height") ?? ""
      const koordinatar = kutt.flatMap((q) => [...(q.getAttribute("d") ?? "").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]))
      return { lesefeil: !!dokument.querySelector("parsererror"), breidd, hogd, synsboks: rot.getAttribute("viewBox"), kuttbaner: kutt.length, alleLukka: kutt.every((q) => /z\s*$/i.test(q.getAttribute("d") ?? "")), endeleg: !/NaN|Infinity/.test(tekst), innanArket: koordinatar.every(([x, y]) => x >= -0.02 && x <= parseFloat(breidd) + 0.02 && y >= -0.02 && y <= parseFloat(hogd) + 0.02) }
    }, tekst)
    const svgar = await Promise.all(ark.map(lesSvg))
    const svg = {
      ark: svgar.length,
      lesefeil: svgar.some((q) => q.lesefeil),
      breidd: svgar[0]?.breidd ?? "",
      hogd: svgar[0]?.hogd ?? "",
      synsboks: svgar[0]?.synsboks ?? null,
      likeArk: svgar.every((q) => q.breidd === svgar[0].breidd && q.hogd === svgar[0].hogd && q.synsboks === svgar[0].synsboks),
      kuttbaner: svgar.reduce((n, q) => n + q.kuttbaner, 0),
      alleLukka: svgar.every((q) => q.alleLukka),
      endeleg: svgar.every((q) => q.endeleg),
      innanArket: svgar.every((q) => q.innanArket),
    }
    const bygg = makeBygg(p, DETAIL.mid)
    const maal = measure(p, bygg)
    const reglar = checkRules(p, maal, bygg, false)
    const venta = MOTOR.exportFile(p as unknown as ParamBag, "ark")
    const ventaBytar = venta.text !== undefined ? Buffer.from(venta.text, "utf8") : Buffer.from(venta.data ?? new ArrayBuffer(0))
    const teikna = lesPlan(p.plan)
    const [s1, s2, sete] = teikna
    const S = p.storleik
    // toppen av sida, i millimeter over golvet
    const topp = S / 2 + Math.max(...(s1?.omriss ?? []).map((q) => q[1] * S))
    const spilene = teikna.slice(2, 7)
    // spilene går frå side til side (y), og er delte langs x
    const spileBreidd = (q: Plan) => q.omriss ? (Math.max(...q.omriss.map((r) => r[0])) - Math.min(...q.omriss.map((r) => r[0]))) * S : 0
    const sjekkar: Record<string, boolean> = spiler ? {
      tiPlater: teikna.length === 10,
      sideneErEitPar: !!s1 && !!s2 && Math.abs(s1.o[1] + s2.o[1] - 1) < 1e-3 && s1.gruppe === s2.gruppe && !!s1.gruppe,
      femSpiler: spilene.length === 5 && spilene.every((q) => q.n[2] > 0.999 && Math.abs(q.o[2] - spilene[0].o[2]) < 1e-6),
      likeSpiler: spilene.every((q) => Math.abs(spileBreidd(q) - spileBreidd(spilene[0])) < 0.05),
      eiTjuknLuft: (() => { const xs = spilene.map((q) => [Math.min(...q.omriss!.map((r) => r[0])), Math.max(...q.omriss!.map((r) => r[0]))] as const).sort((a, b) => a[0] - b[0]); return xs.slice(1).every((x, i) => Math.abs((x[0] - xs[i][1]) * S - p.tjukn) < 0.05) })(),
      fraaSideTilSide: spilene.every((q) => q.omriss!.some((r) => Math.abs(r[1] * S + 156) < 0.5) && q.omriss!.some((r) => Math.abs(r[1] * S - 156) < 0.5)),
      spileneMellom: spilene.every((q) => Math.abs(q.o[2] * S - (topp - 2.5 * p.tjukn)) < 0.2),
      berreTappar: bygg.s.tappar === 16 && bygg.s.ledd === bygg.s.tappar,
      ingenLause: bygg.dl.lause === 0 && bygg.s.kasta === 0,
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      ingenHardeBrot: reglar.every((r) => !r.hard || r.ok),
      eittArkPerPlate: svg.ark === bygg.ns.sheets.length,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= 10,
      kuttInnanArket: svg.innanArket,
      nedlastingLikMotor: raa.equals(ventaBytar),
      ingenSidefeil: feil.length === 0,
    } : trekant ? {
      firePlater: teikna.length === 4,
      treBein: teikna.slice(0, 3).every((q) => q.gruppe === teikna[0].gruppe && !!q.gruppe && Math.abs(q.n[2]) < 1e-6),
      beinPaa120: teikna.slice(0, 3).every((q, i, l) => Math.abs(Math.abs(q.n[0] * l[(i + 1) % 3].n[0] + q.n[1] * l[(i + 1) % 3].n[1]) - 0.5) < 1e-3),
      seteOppaa: !!teikna[3] && teikna[3].n[2] > 0.999 && teikna[3].o[2] * S > S / 2 + Math.max(...(teikna[0].omriss ?? []).map((q) => q[1] * S)),
      tapparISetet: bygg.s.tappar >= 3 && bygg.s.ledd === bygg.s.tappar,
      ingenLause: bygg.dl.lause === 0 && bygg.s.kasta === 0,
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      ingenHardeBrot: reglar.every((r) => !r.hard || r.ok),
      eittArkPerPlate: svg.ark === bygg.ns.sheets.length,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= 4,
      kuttInnanArket: svg.innanArket,
      nedlastingLikMotor: raa.equals(ventaBytar),
      ingenSidefeil: feil.length === 0,
    } : kube ? {
      femPlater: teikna.length === 5,
      kasse: teikna.slice(0, 4).every((q) => q.gruppe === teikna[0].gruppe && !!q.gruppe),
      opningIAlle: teikna.slice(0, 4).every((q) => q.strek.some((st) => st.slag === "hol")),
      fingrar: bygg.s.ribber.some((r) => r.tapp.some((q) => q.nokkel.startsWith("f"))),
      seteOppaa: !!teikna[4] && teikna[4].n[2] > 0.999 && teikna[4].o[2] * S > S / 2 + Math.max(...(teikna[0].omriss ?? []).map((q) => q[1] * S)),
      berreTappar: bygg.s.ledd === bygg.s.tappar,
      ingenLause: bygg.dl.lause === 0 && bygg.s.kasta === 0,
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      ingenHardeBrot: reglar.every((r) => !r.hard || r.ok),
      eittArkPerPlate: svg.ark === bygg.ns.sheets.length,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= 5,
      kuttInnanArket: svg.innanArket,
      nedlastingLikMotor: raa.equals(ventaBytar),
      ingenSidefeil: feil.length === 0,
    } : sekskant ? {
      trePlater: teikna.length === 3 && teikna.every((q) => (q.omriss?.length ?? 0) >= 4),
      beinaKryssar: !!s1 && !!s2 && Math.abs(Math.abs(s1.n[0] * s2.n[0] + s1.n[1] * s2.n[1])) < 1e-3 && s1.gruppe === s2.gruppe && !!s1.gruppe,
      seteOppaa: !!sete && Math.abs(sete.o[2] * S - (topp + p.tjukn / 2)) < 0.2,
      eitKryssOgTappar: bygg.s.tappar >= 4 && bygg.s.ledd === bygg.s.tappar + 1,
      ingenLause: bygg.dl.lause === 0 && bygg.s.kasta === 0,
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      ingenHardeBrot: reglar.every((r) => !r.hard || r.ok),
      eittArkPerPlate: svg.ark === bygg.ns.sheets.length,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= 3,
      kuttInnanArket: svg.innanArket,
      nedlastingLikMotor: raa.equals(ventaBytar),
      ingenSidefeil: feil.length === 0,
    } : {
      seksPlater: teikna.length === 6 && teikna.every((q) => (q.omriss?.length ?? 0) >= 4),
      sidaErLik: !!s1?.omriss && s1.omriss.every(([x, y]) => s1.omriss!.some(([a, b]) => Math.abs(a + x) < 2e-3 && Math.abs(b - y) < 2e-3)),
      sideneErEitPar: !!s1 && !!s2 && Math.abs(s1.o[1] + s2.o[1] - 1) < 1e-3 && s1.gruppe === s2.gruppe && !!s1.gruppe,
      vindaugeIBaae: [s1, s2].every((q) => q?.strek.some((st) => st.slag === "hol" && st.form === "kontur")),
      seteOppaa: !!sete && Math.abs(sete.o[2] * S - (mellomSete ? topp - 2.5 * p.tjukn : topp + p.tjukn / 2)) < 0.2,
      tapparOgSlisser: bygg.s.tappar >= 10 && bygg.s.ledd === bygg.s.tappar,
      ingenLause: bygg.dl.lause === 0 && bygg.s.kasta === 0,
      monterbarGeometri: bygg.s.montering.brot.length === 0 && bygg.s.montering.klem.length === 0,
      ingenHardeBrot: reglar.every((r) => !r.hard || r.ok),
      svgMillimeter: svg.likeArk && /mm$/.test(svg.breidd) && /mm$/.test(svg.hogd) && parseFloat(svg.breidd) === p.arkB && parseFloat(svg.hogd) === p.arkH && svg.synsboks?.split(/\s+/).map(Number).join(" ") === `0 0 ${p.arkB} ${p.arkH}`,
      eittArkPerPlate: svg.ark === bygg.ns.sheets.length,
      lukkaKutt: svg.alleLukka && svg.endeleg && !svg.lesefeil && svg.kuttbaner >= 6,
      kuttInnanArket: svg.innanArket,
      materialetFolgerLedda: Math.abs(maal.slotW - p.tjukn - p.klaring) < 0.001,
      nedlastingLikMotor: raa.equals(ventaBytar),
      ingenSidefeil: feil.length === 0,
      ...(fullskala ? { storleikOgTjukn: p.storleik === 450 && p.tjukn === 12 } : {}),
    }
    // KILANE, i kva krakk som helst: kvar tapp har hòlet sitt, og kvar kile står i lista
    if (kilarPaa) Object.assign(sjekkar, {
      kilarPaa: p.kilar === 1,
      kvarTappHarKile: bygg.s.ribber.every((r) => r.tapp.every((q) => q.slag !== "tapp" || q.nokkel.startsWith("f") || q.nokkel.startsWith("s") || q.nokkel.startsWith("g") || !!q.kile)),
      kilaneErDelar: bygg.dl.delar.filter((d) => d.adr.startsWith("k")).length === bygg.s.ribber.reduce((n, r) => n + r.tapp.filter((q) => q.kile).length, 0) && bygg.dl.delar.some((d) => d.adr.startsWith("k")),
    })
    await side.screenshot({ path: join(UT, "nesta.png") })
    // Bileta av resultatet kjem etter den stoppa klokka.
    await trykk(knapp("lat att kontrollane"))
    await trykk(side.getByRole("tab", { name: "lag", exact: true }))
    await heim()
    await side.touchscreen.tap(45, 610)
    await pause(350)
    await side.screenshot({ path: join(UT, "krakk.png") })
    const rapport = {
      dato: new Date().toISOString(),
      miljo: "Automatisert Chromium på PC, mobilflate 390×844; WebShare deaktivert for ekte nedlasting til disk. Ikkje fysisk iPhone, iOS-delingsark eller menneskeleg tidsprøve.",
      avgrensing: "Referansekrakk med tapp og slisse, målt i geometrien og kuttfila; ikkje fysisk samansett eller lastprøvd.",
      url: URL,
      scenario: `${fullskala ? "450 mm arbeidsrom, 12 mm" : "150 mm modell, 3 mm"}: ${spiler ? "spilekrakk: bogesider, sete mellom delt i fem spiler, tre stag" : trekant ? "trekantkrakk: eitt bein ut frå midten, ×3, runda trekantsete oppå" : kube ? "kubekrakk: vegg med bogeopning, ×4 til kasse med fingrar, sete oppå" : sekskant ? "to kryssande bein med boge (×2), sekskanta sete oppå" : `${krakk ? "bogesider med ovalt vindauge" : "A-sider med parallellogramvindauge"}, spegla par, sete ${mellomSete ? "mellom sidene" : "oppå"}, tre stag`}${kilarPaa ? ", kilar på" : ""}`,
      feilsokbileteMedITida: feilsok,
      sekundTilLagraFil: brukt,
      sekundMedOppstart: (fullfoert - byrjing) / 1000,
      maalsekund: 60,
      maalNaadd: brukt < 60 && Object.values(sjekkar).every(Boolean),
      steg, params: p, fil: filsti, svg,
      delar: bygg.dl.delar.length,
      tappar: bygg.s.tappar,
      ark: bygg.ns.sheets.length,
      faktiskeMillimeter: [maal.envX, maal.envY, maal.envZ],
      sporbreidd: maal.slotW,
      montasje: bygg.s.montering,
      reglar: reglar.filter((r) => !r.ok).map((r) => `${r.hard ? "HARD" : "mjuk"} ${r.id}: ${r.value}`),
      sjekkar, feil,
    }
    writeFileSync(join(UT, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n")
    console.log(JSON.stringify({ ...rapport, params: undefined, montasje: undefined, steg: undefined }, null, 2))
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
