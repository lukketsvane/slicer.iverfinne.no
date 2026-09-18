import { chromium, type Browser, type Page } from "playwright"
import { lesPlan, OMRISS_TAK, rutenett, skrivPlan, type Strek } from "../lib/plan"
import type { Vec3 } from "../lib/core"
import { FORMER } from "../lib/scene"
import { UTTAK } from "../components/deler"
import type { Params } from "../lib/params"

const URL = process.env.URL ?? process.env.PANEL_URL ?? "http://127.0.0.1:3210"
const DOBBELT = 320
const HOVUDLINA = "[aria-label='plan, delar, ark og tid']"

let feil = 0
const sjekk = (namn: string, ok: boolean, sagt = "") => {
  console.log(ok ? "  ok  " : "  FEIL", namn.padEnd(50), sagt)
  if (!ok) feil++
}

const ferdig = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector("[aria-label='kontrollar']")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 45000 },
  )
const hash = (page: Page): Params => {
  const h = page.url().split("#p=")[1]
  return h ? (JSON.parse(decodeURIComponent(h)) as Params) : ({} as Params)
}
const plana = (page: Page) => lesPlan(hash(page).plan)
const lina = async (page: Page) => (await page.locator(HOVUDLINA).innerText()).replace(/\s+/g, " ").trim()
const roleg = async (page: Page, ms = 500) => {
  await ferdig(page)
  await page.waitForTimeout(ms)
}
const vent2 = async (page: Page, f: () => Promise<boolean>, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await f()) return
    await page.waitForTimeout(100)
  }
}
const vent = async (page: Page, f: (p: Params) => boolean, ms = 10000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (f(hash(page))) break
    await page.waitForTimeout(100)
  }
  await roleg(page, 200)
}
const talPlan = (n: number) => (p: Params) => lesPlan(p.plan).length === n
const blur = async (page: Page) => {
  await page.evaluate(`(document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1)`)
  await page.waitForTimeout(150)
}
const utbrett = async (page: Page) => {
  const rader = page.locator("[role=listbox][aria-label='plan'] [data-gruppe] button[aria-expanded='false']")
  for (let vakt = 0; vakt < 8 && (await rader.count()) > 0; vakt++) {
    await rader.first().click()
    await page.waitForTimeout(200)
  }
}

const bytArket = async (page: Page) => {
  const att = page.getByRole("button", { name: "lat att kontrollane" })
  if (await att.count()) await att.first().click()
  else await page.locator(HOVUDLINA).click()
}

const opneArket = async (page: Page, fane: "plan" | "materiale" | "kutt" | "sjekk") => {
  const opne = page.getByRole("button", { name: "opne kontrollane" })
  if (await opne.count()) {
    await opne.first().click()
    await page.waitForTimeout(400)
  }
  await page.getByRole("tab", { name: fane, exact: true }).click()
  await page.waitForTimeout(300)
}

const midt = async (page: Page) => {
  if ((await page.locator("[role=listbox][aria-label='plan']").count()) === 0) {
    await bytArket(page)
    await page.waitForTimeout(400)
  }
}

async function opne(url: string, browser: Browser, w: number, h: number, o?: { sov?: boolean }) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 1180 })
  if (!o?.sov) {
    await page.addInitScript(`setInterval(function () {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
    }, 700)`)
  }
  const konsoll: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) konsoll.push(m.text())
  })
  page.on("pageerror", (e) => konsoll.push(String(e)))
  await page.goto(url, { waitUntil: "networkidle" })
  await roleg(page, 800)
  return { page, konsoll }
}

const LAG = Number(process.env.LAG ?? 6)
const SKJELV = 1

async function toFingrar(
  page: Page,
  steg: (t: number) => [[number, number], [number, number]],
  n = 12,
  mellom?: () => Promise<void>,
  lag = LAG,
  vandre = 0,
) {
  const cdp = await page.context().newCDPSession(page)
  const pkt = (t: number) => steg(t).map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 }))
  const l = Math.max(0, Math.round(lag))
  if (l) {
    const a = pkt(0)[0]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] })
    for (let i = 1; i <= l; i++) {
      const x = a.x + (vandre * i) / l
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...a, x, y: a.y + (i % 2 ? SKJELV : -SKJELV) }] })
      await page.waitForTimeout(16)
      if (mellom) await mellom()
    }
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(0) })
  for (let i = 1; i <= n; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(i / n) })
    await page.waitForTimeout(16)
    if (mellom) await mellom()
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}

async function telefon(browser: Browser) {
  console.log("\n=== telefon 390×844")
  const { page, konsoll } = await opne(URL, browser, 390, 844)

  const pille = await page.evaluate(`(() => {
    var ut = []
    document.querySelectorAll("header button[aria-pressed], [data-speil]").forEach(function (e) {
      var c = getComputedStyle(e)
      var kant = parseFloat(c.borderTopWidth) > 0.01 || parseFloat(c.borderLeftWidth) > 0.01
      var flate = c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent"
      if (kant || flate) ut.push((e.getAttribute("aria-label") || e.textContent || "?").trim())
    })
    return ut
  })()`) as string[]
  sjekk("lesemåtane og speglingane er ord, ikkje piller", pille.length === 0, pille.join(" · "))
  {
    const x = await page.locator("[data-speil='x']").boundingBox()
    const z = await page.locator("[data-speil='z']").boundingBox()
    const midt = x && z ? (x.x + z.x + z.width) / 2 : 0
    sjekk("speglingane står midtstilte", !!x && !!z && Math.abs(midt - 195) < 12, x && z ? `midten ${Math.round(midt)} av 390` : "finst ikkje")
    sjekk("og øvst, under topplina", !!z && z.y < 120, z ? `${Math.round(z.y)} px ned` : "finst ikkje")
    const kven = await page.evaluate(`(() => {
      var el = document.querySelector("[data-speil='z']")
      var b = el.getBoundingClientRect()
      var ute = document.elementFromPoint(20, b.y + b.height / 2)
      var paa = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
      return {
        ute: ute ? (ute.closest(".speil") ? "speil" : ute.tagName.toLowerCase()) : "?",
        paa: paa === el || el.contains(paa) ? "ordet" : (paa ? paa.tagName.toLowerCase() : "?"),
      }
    })()`) as { ute: string; paa: string }
    sjekk("og lina tek ingen fingrar utanom orda", kven.ute !== "speil" && kven.ute !== "?", kven.ute)
    sjekk("men ordet tek sitt eige", kven.paa === "ordet", kven.paa)
  }

  {
    const r = await page.locator("[data-ruteverkty]").boundingBox()
    const b = await page.locator("[data-bitverkty]").boundingBox()
    sjekk("rutenettet står i tommelspalta", (await page.locator(".tumme [data-ruteverkty]").count()) === 1)
    sjekk("og over dei andre reiskapane", !!r && !!b && r.y + r.height <= b.y + 1, r && b ? `${Math.round(r.y)} over ${Math.round(b.y)}` : "finst ikkje")
    sjekk("og ikkje i lina på arket lenger", (await page.locator("[aria-label='kontrollar'] [data-ruteverkty]").count()) === 0)
  }

  const liste = page.locator("[role=listbox][aria-label='plan']")
  sjekk("arket startar som éi line", (await liste.count()) === 0)
  const laasKnapp = page.getByRole("button", { name: "skjer", exact: true })
  sjekk("skjer-knappen er eit ikon utan tekst", (await laasKnapp.count()) === 1 && ((await laasKnapp.innerText()).trim() === ""), `«${(await laasKnapp.innerText()).trim()}»`)
  const kb = await laasKnapp.boundingBox()
  sjekk("og han ligg under høgre tommel: nedst til høgre, minst 56 px", !!kb && kb.x + kb.width / 2 > 390 * 0.6 && kb.y + kb.height / 2 > 844 * 0.6 && Math.min(kb.width, kb.height) >= 56, kb ? `${Math.round(kb.x)},${Math.round(kb.y)} ${Math.round(kb.width)}×${Math.round(kb.height)}` : "finst ikkje")
  const snitt = page.locator("[data-skisse='snitt']")
  await snitt.first().waitFor({ timeout: 15000 }).catch(() => undefined)
  sjekk("skissa syner snittet gjennom kroppen før du skjer", (await snitt.count()) >= 1)
  await bytArket(page)
  await page.waitForTimeout(500)
  sjekk("eit trykk på lina opnar midten, med planlista", (await liste.count()) === 1)
  await opneArket(page, "kutt")
  const skyv = () => page.locator("input[type=range][aria-label$=', tal']").count()
  const felt = await skyv()
  sjekk("kuttfana syner skyvarane", felt >= 4, `${felt} dragskiver`)
  await page.getByRole("tab", { name: "materiale", exact: true }).click()
  await page.waitForTimeout(300)
  const felt2 = await skyv()
  sjekk("materialfana byter dei ut med sine eigne", felt2 > 0 && felt2 !== felt, `${felt} → ${felt2} dragskiver`)
  await page.getByRole("tab", { name: "plan", exact: true }).click()
  await page.waitForTimeout(300)
  sjekk("og planfana gjev planlista att", (await liste.count()) === 1, `${await skyv()} dragskiver`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  sjekk("esc stengjer arket til lina", (await liste.count()) === 0)

  await midt(page)
  const talet = page.locator("[aria-label='storleik, tal']")
  const tb = await talet.boundingBox()
  const sFør = hash(page).storleik
  if (tb) {
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    const cx = tb.x + tb.width / 2
    const cy = tb.y + tb.height / 2
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 6 * i, cy) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
  }
  await vent(page, (p) => p.storleik !== sFør)
  sjekk("tap-drag på talet set storleiken", hash(page).storleik > sFør, `${sFør} → ${hash(page).storleik}`)
  await page.keyboard.press("z")
  await vent(page, (p) => p.storleik === sFør)
  sjekk("ingen tekstfelt på sida å zoome inn i", (await page.locator("input:not([type=file]):not([type=range])").count()) === 0)

  const n0 = plana(page).length
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await vent(page, talPlan(n0 + 1))
  sjekk("skjer legg eitt plan i lenkja", plana(page).length === n0 + 1, `${n0} → ${plana(page).length}`)
  await midt(page)
  const nytt = plana(page)[plana(page).length - 1]
  sjekk("det nye planet har eit namn ingen har hatt", plana(page).filter((p) => p.id === nytt.id).length === 1 && nytt.id > n0, `namn ${nytt.id}`)
  sjekk("og lista har like mange rader", (await liste.locator("[role=option]").count()) === n0 + 1)

  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 2))
  sjekk("L skjer òg", plana(page).length === n0 + 2)
  await midt(page)

  const rad = liste.locator("[role=option][data-plan]").last()
  await rad.locator("button").first().click()
  await page.waitForTimeout(300)
  sjekk("eit trykk på rada vel planet", (await rad.getAttribute("aria-selected")) === "true")
  sjekk("og den store knappen står tom", (await page.getByRole("button", { name: "ferdig", exact: true }).count()) === 0 && (await page.getByRole("button", { name: "skjer", exact: true }).count()) === 0)
  await page.keyboard.press("Backspace")
  await vent(page, talPlan(n0 + 1))
  sjekk("⌫ tek det valde planet bort", plana(page).length === n0 + 1)
  await midt(page)
  await page.getByRole("button", { name: `slett plan ${nytt.id}`, exact: true }).click()
  await vent(page, talPlan(n0))
  sjekk("× på rada tek planet bort", plana(page).length === n0 && !plana(page).some((p) => p.id === nytt.id))

  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  sjekk("Z angrar slettinga", plana(page).length === n0 + 1)
  await page.keyboard.press("Shift+Z")
  await vent(page, talPlan(n0))
  sjekk("⇧Z gjer slettinga om att", plana(page).length === n0)
  await page.getByRole("button", { name: "angre", exact: true }).first().click()
  await vent(page, talPlan(n0 + 1))
  sjekk("angre-knappen står øvst, der merket stod", plana(page).length === n0 + 1 && (await page.getByRole("button", { name: "gjer om", exact: true }).count()) >= 1 && (await page.locator("text=slicerman").count()) === 0)
  await page.keyboard.press("Shift+Z")
  await vent(page, talPlan(n0))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 2))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0 + 1))
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  sjekk("og tre til er attende ved starten", plana(page).length === n0)

  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  const kamDist = async () => Number((await page.locator(".handtak").getAttribute("data-avstand")) ?? 0)
  const kamStad = async () => ((await page.locator(".handtak").getAttribute("data-kamera")) ?? "0,0,0").split(",").map(Number)
  const stadAv = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const s0 = hash(page).storleik
  const d0 = await kamDist()
  const p0 = await kamStad()
  await toFingrar(page, (t) => [[195 - 30 - 70 * t, 380], [195 + 30 + 70 * t, 380]])
  await roleg(page, 600)
  const d1 = await kamDist()
  const p1 = await kamStad()
  sjekk("eit reint klyp på objektet rører ikkje kameraet", Math.abs(d1 - d0) < 1e-3 && stadAv(p0, p1) < 1e-3, `avstand ${d0.toFixed(3)} → ${d1.toFixed(3)}, staden ${stadAv(p0, p1).toFixed(4)}`)
  sjekk("og storleiken på kroppen står", hash(page).storleik === s0, `${s0} mm`)

  await page.locator("[data-heim]").click()
  await roleg(page, 600)
  const innramma = await kamDist()
  const lupe = page.locator("[aria-label='zoom']")
  for (let i = 0; i < 6; i++) {
    const b = await lupe.boundingBox()
    if (!b) break
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 220, { steps: 12 })
    await page.mouse.up()
    await roleg(page, 250)
  }
  const ute = await kamDist()
  sjekk(
    "og forstørraren kjem minst tre gonger så langt ut som innramminga",
    ute > innramma * 3,
    `innramma ${innramma.toFixed(1)} → ute ${ute.toFixed(1)} (${(ute / innramma).toFixed(2)}×)`,
  )
  sjekk("og stoggar der: eit kamera utan tak finn ingen att", ute <= 48.001, `avstand ${ute.toFixed(2)}`)
  await page.locator("[data-heim]").click()
  await roleg(page, 600)
  sjekk("og innramminga tek deg attende", Math.abs((await kamDist()) - innramma) < 0.5, `avstand ${(await kamDist()).toFixed(2)}`)

  const vriFingrar = (grader: number) => (t: number) => {
    const a = (grader * t * Math.PI) / 180
    return [[195 - 80 * Math.cos(a), 380 - 80 * Math.sin(a)], [195 + 80 * Math.cos(a), 380 + 80 * Math.sin(a)]] as [[number, number], [number, number]]
  }
  await toFingrar(page, vriFingrar(40))
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const vridd0 = plana(page)[plana(page).length - 1]
  sjekk("to fingrar som vrir vinklar SNITTET", Math.abs(vridd0.n[2]) > 0.1, `n = ${vridd0.n.map((c) => c.toFixed(2)).join(",")}`)
  sjekk("og kroppen står som han stod", hash(page).rotZ === 0, `rotZ ${hash(page).rotZ}°`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  await toFingrar(page, vriFingrar(-40))
  await page.waitForTimeout(300)
  sjekk("det finst ingen skissebrytar lenger", (await page.getByRole("button", { name: "skisse", exact: true }).count()) === 0)
  const gest2 = (grader: number, dx: number, dy: number) => (t: number) => {
    const a = (grader * t * Math.PI) / 180
    const cx = 195 + dx * t
    const cy = 380 + dy * t
    return [[cx - 80 * Math.cos(a), cy - 80 * Math.sin(a)], [cx + 80 * Math.cos(a), cy + 80 * Math.sin(a)]] as [[number, number], [number, number]]
  }
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const foer = plana(page)[plana(page).length - 1]
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  await toFingrar(page, gest2(34, -42, -42))
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const baade = plana(page)[plana(page).length - 1]
  const vridd = Math.hypot(baade.n[0] - foer.n[0], baade.n[1] - foer.n[1], baade.n[2] - foer.n[2])
  const flytt2 = Math.hypot(baade.o[0] - foer.o[0], baade.o[1] - foer.o[1], baade.o[2] - foer.o[2])
  sjekk(
    "ei vriding og eit drag i same rørsla gjev BEGGE",
    vridd > 0.1 && flytt2 > 0.02 && hash(page).rotZ === 0,
    `normalen ${vridd.toFixed(2)}, punktet ${flytt2.toFixed(3)}, rotZ ${hash(page).rotZ}`,
  )
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))
  await toFingrar(page, gest2(-34, 42, 42))
  await page.waitForTimeout(300)

  await toFingrar(page, (t) => [[150 + 90 * t, 330], [150 + 90 * t, 430]])
  await page.waitForTimeout(300)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  const flytt = plana(page)[plana(page).length - 1]
  const av = Math.hypot(flytt.o[0] - 0.5, flytt.o[1] - 0.5)
  sjekk("to fingrar sidelengs flyttar skissa: planet står ikkje i midten", av > 0.05, `o = ${flytt.o.map((c) => c.toFixed(2)).join(",")}`)
  sjekk("men det står framleis loddrett", Math.abs(flytt.n[2]) < 0.05, `n = ${flytt.n.map((c) => c.toFixed(2)).join(",")}`)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  const s1 = hash(page).storleik
  await toFingrar(page, (t) => [[195 - 30 - 70 * t, 380], [195 + 30 + 70 * t, 380]])
  await page.waitForTimeout(400)
  sjekk("og eit knip rører ikkje storleiken på kroppen", hash(page).storleik === s1, `${s1} → ${hash(page).storleik}`)

  const flyttH = page.locator("[data-handtak='flytt']")
  const vriH = page.locator("[data-handtak='vri']")
  sjekk("skissa har eit handtak å flytte og eitt å vri", (await flyttH.count()) === 1 && (await vriH.count()) === 1)
  const boks = await vriH.boundingBox()
  if (boks) {
    const cx = boks.x + boks.width / 2
    const cy = boks.y + boks.height / 2
    await page.touchscreen.tap(cx, cy).catch(() => undefined)
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 60 * (i / 12), cy + 40 * (i / 12)) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(300)
    await page.keyboard.press("l")
    await vent(page, talPlan(n0 + 1))
    const vridd = plana(page)[plana(page).length - 1]
    sjekk("vrihandtaket vinklar skissa: planet står ikkje loddrett", Math.abs(vridd.n[2]) > 0.1, `n = ${vridd.n.map((c) => c.toFixed(2)).join(",")}`)
    await page.keyboard.press("z")
    await vent(page, talPlan(n0))
  }

  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  await midt(page)
  const fyrst = plana(page)[0]
  await liste.locator("[role=option][data-plan]").first().locator("button").first().click()
  await page.waitForTimeout(300)
  await bytArket(page)
  await page.waitForTimeout(400)
  const før = plana(page)
  await toFingrar(page, (t) => [[150 + 90 * t, 330], [150 + 90 * t, 430]])
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) !== JSON.stringify(fyrst.o))
  const etter = plana(page)[0]
  const rørt = Math.hypot(etter.o[0] - fyrst.o[0], etter.o[1] - fyrst.o[1], etter.o[2] - fyrst.o[2]) > 0.02
  sjekk("med eit plan valt flyttar to fingrar DET planet", rørt && etter.id === fyrst.id, `o ${fyrst.o.map((c) => c.toFixed(2))} → ${etter.o.map((c) => c.toFixed(2))}`)
  const avstandNo = async () => Number((await page.locator(".handtak").getAttribute("data-avstand")) ?? 0)
  const kamPos = async () => ((await page.locator(".handtak").getAttribute("data-kamera")) ?? "0,0,0").split(",").map(Number)
  const kamAv = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const kamFør = await avstandNo()
  const stadFør = await kamPos()
  const planStod = plana(page)[0]
  await toFingrar(page, (t) => {
    const glid = 50 + 7 * t
    return [[170 + 60 * t, 380 - glid], [170 + 60 * t, 380 + glid]]
  })
  await page.waitForTimeout(600)
  const kamEtter = await avstandNo()
  const stadEtter = await kamPos()
  const planKom = plana(page)[0]
  const flytta = Math.hypot(planKom.o[0] - planStod.o[0], planKom.o[1] - planStod.o[1], planKom.o[2] - planStod.o[2])
  sjekk(
    "og eit drag som glir frå kvarandre rører ikkje kameraet",
    Math.abs(kamEtter - kamFør) < 1e-3 && kamAv(stadFør, stadEtter) < 1e-3 && flytta > 0.005,
    `avstand ${kamFør.toFixed(3)} → ${kamEtter.toFixed(3)}, staden ${kamAv(stadFør, stadEtter).toFixed(4)}, planet flytta ${flytta.toFixed(3)}`,
  )
  const kamFør2 = await avstandNo()
  const planStod2 = plana(page)[0]
  await toFingrar(page, (t) => {
    const glid = 50 * (1 + 0.12 * Math.min(1, t * 3))
    const dx = -60 * Math.max(0, t - 0.34)
    return [[230 + dx, 380 - glid], [230 + dx, 380 + glid]]
  })
  await page.waitForTimeout(600)
  const kamEtter2 = await avstandNo()
  const planKom2 = plana(page)[0]
  const flytta2 = Math.hypot(planKom2.o[0] - planStod2.o[0], planKom2.o[1] - planStod2.o[1], planKom2.o[2] - planStod2.o[2])
  sjekk(
    "og eit klyp som kjem FØR draget rører det ikkje heller",
    Math.abs(kamEtter2 - kamFør2) < 1e-3 && flytta2 > 0.005,
    `avstand ${kamFør2.toFixed(3)} → ${kamEtter2.toFixed(3)}, planet flytta ${flytta2.toFixed(3)}`,
  )
  const kamFør3 = await kamPos()
  const planStod3 = plana(page)[0]
  const undervegs: number[] = []
  await toFingrar(
    page,
    (t) => {
      const glid = 50 * (1 + 0.05 * Math.min(1, t * 4))
      const dx = 70 * t * t
      return [[170 + dx, 380 - glid], [170 + dx, 380 + glid]]
    },
    12,
    async () => { undervegs.push(kamAv(kamFør3, await kamPos())) },
  )
  await page.waitForTimeout(600)
  const planKom3 = plana(page)[0]
  const flytta3 = Math.hypot(planKom3.o[0] - planStod3.o[0], planKom3.o[1] - planStod3.o[1], planKom3.o[2] - planStod3.o[2])
  const verst = Math.max(...undervegs)
  sjekk(
    "og kameraet står i KVART hakk av draget, ikkje berre til slutt",
    verst < 1e-3 && flytta3 > 0.005,
    `verste avvik ${verst.toFixed(4)} over ${undervegs.length} hakk, planet flytta ${flytta3.toFixed(3)}`,
  )
  await page.waitForTimeout(700)
  await page.keyboard.press("z")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) === JSON.stringify(planStod3.o))
  await page.waitForTimeout(700)
  await page.keyboard.press("z")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) === JSON.stringify(planStod2.o))
  await page.keyboard.press("z")
  await roleg(page, 300)
  sjekk("og dei andre står stille", plana(page).slice(1).every((p, i) => JSON.stringify(p) === JSON.stringify(før[i + 1])))
  await page.keyboard.press("z")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[0]?.o) === JSON.stringify(fyrst.o))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  await midt(page)
  await liste.locator("[role=option][data-plan]").first().locator("button").first().click()
  await page.waitForTimeout(300)
  const hol = page.getByRole("button", { name: "skjer hòl", exact: true })
  const dubl = page.getByRole("button", { name: "dubler planet", exact: true })
  sjekk("eit valt plan får «skjer hòl» og «dubler planet» under tommelen", (await hol.count()) === 1 && (await dubl.count()) === 1)
  {
    const fyrr = plana(page)
    await dubl.click()
    await vent(page, talPlan(fyrr.length + 1))
    const etter = plana(page)
    const ny = etter.find((q) => !fyrr.some((r) => r.id === q.id))
    sjekk("dubleringa lagar eitt plan til", etter.length === fyrr.length + 1 && !!ny, `${fyrr.length} → ${etter.length}`)
    if (ny) {
      const gml = fyrr[0]
      const same = ny.n.every((c, i) => Math.abs(c - gml.n[i]) < 1e-6)
      const flytt = Math.hypot(...ny.o.map((c, i) => c - gml.o[i]))
      sjekk("kopien har same normal, og ligg eit hakk unna", same && flytt > 1e-3, `flytt ${flytt.toFixed(4)}`)
    }
    await page.keyboard.press("z")
    await vent(page, talPlan(fyrr.length))
    await page.waitForTimeout(300)
    await midt(page)
    await liste.locator("[role=option][data-plan]").first().locator("button").first().click()
    await page.waitForTimeout(300)
  }
  const planFør = plana(page)[0]
  await page.locator("[data-heim]").click()
  await roleg(page, 700)
  await hol.click()
  await vent(page, (p) => lesPlan(p.plan)[0]?.strek.length === 1)
  const medHol = plana(page)[0]
  sjekk("hòlet står i lenkja som ein strek på planet", medHol.strek.length === 1 && medHol.strek[0].slag === "hol", skrivPlan([medHol]).slice(0, 50))
  const flyttS = page.locator("[data-handtak='strek-flytt']")
  sjekk("streken har handtak: flytt, storleik, vri", (await flyttS.count()) === 1 && (await page.locator("[data-handtak='strek-storleik']").count()) === 1 && (await page.locator("[data-handtak='strek-vri']").count()) === 1)
  const vriDrag = async () => {
    const vb = await page.locator("[data-handtak='strek-vri']").boundingBox()
    if (!vb) return null
    const vp = page.viewportSize()!
    const kx = (v: number) => Math.max(2, Math.min(v, vp.width - 2))
    const ky = (v: number) => Math.max(2, Math.min(v, vp.height - 2))
    const x = vb.x + vb.width / 2
    const y = vb.y + vb.height / 2
    const c = await page.context().newCDPSession(page)
    const pk = (px: number, py: number) => [{ x: px, y: py, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pk(x, y) })
    for (let i = 1; i <= 12; i++) {
      await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pk(kx(x + Math.min(48, i * 8)), ky(y + Math.max(0, i * 8 - 48))) })
      await page.waitForTimeout(16)
    }
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await c.detach()
    await roleg(page, 600)
    return plana(page)[0].strek[0]
  }
  {
    const foer = plana(page)[0].strek[0]
    const na = await vriDrag()
    sjekk("vrihandtaket endrar VINKELEN", !!na && Math.abs((na.a ?? 0) - (foer?.a ?? 0)) > 0.5, `a ${foer?.a} → ${na?.a}`)
    await page.waitForTimeout(1400)
  }
  const sb = await flyttS.boundingBox()
  if (sb) {
    const cx = sb.x + sb.width / 2
    const cy = sb.y + sb.height / 2
    const cdp = await page.context().newCDPSession(page)
    const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(cx, cy) })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(cx + 40 * (i / 12), cy) })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    const holX = (q?: Strek) => q?.x ?? 0
    await vent(page, (p) => Math.abs(holX(lesPlan(p.plan)[0]?.strek[0]) - holX(medHol.strek[0])) > 0.01)
    const flytta = plana(page)[0].strek[0]
    sjekk("handtaket flyttar hòlet, og lenkja veit det", Math.abs(holX(flytta) - holX(medHol.strek[0])) > 0.01, `x ${holX(medHol.strek[0])} → ${holX(flytta)}`)
    await page.waitForTimeout(1400)

    const drag = async (vel: string, dx: number, dy: number) => {
      const b = await page.locator(vel).boundingBox()
      if (!b) return false
      const vp = page.viewportSize()!
      const x = Math.max(2, Math.min(b.x + b.width / 2, vp.width - 2))
      const y = Math.max(2, Math.min(b.y + b.height / 2, vp.height - 2))
      const cdp2 = await page.context().newCDPSession(page)
      const pk = (px: number, py: number) => [{ x: px, y: py, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
      await cdp2.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pk(x, y) })
      for (let i = 1; i <= 12; i++) {
        await cdp2.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pk(Math.max(2, Math.min(x + (dx * i) / 12, vp.width - 2)), Math.max(2, Math.min(y + (dy * i) / 12, vp.height - 2))) })
        await page.waitForTimeout(16)
      }
      await cdp2.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await cdp2.detach()
      await roleg(page, 600)
      return true
    }
    const strek0 = plana(page)[0].strek[0]
    if (await drag("[data-handtak='strek-storleik']", 40, 40)) {
      const na = plana(page)[0].strek[0]
      sjekk("storleikshandtaket endrar BREIDDA og ikkje staden", Math.abs((na?.w ?? 0) - (strek0?.w ?? 0)) > 0.01, `w ${strek0?.w} → ${na?.w} · x ${strek0?.x} → ${na?.x}`)
      await page.waitForTimeout(1400)
    }
  }
  await page.keyboard.press("Backspace")
  await vent(page, (p) => lesPlan(p.plan)[0]?.strek.length === 0)
  await page.waitForTimeout(1400)
  sjekk(
    "⌫ tek streken bort, ikkje planet",
    plana(page)[0]?.strek.length === 0 && plana(page).length === n0 + 1 && plana(page)[0].id === planFør.id,
    `${plana(page).length} plan (venta ${n0 + 1}), namn ${plana(page)[0]?.id ?? "–"} av ${planFør.id}, ${plana(page)[0]?.strek.length ?? "–"} strek`,
  )
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.keyboard.press("z")
  await vent(page, talPlan(n0))

  const rutAv = (p: Params) => {
    let nx = 0
    let ny = 0
    for (const q of lesPlan(p.plan)) {
      if (Math.abs(q.n[0]) > 0.999) nx++
      else if (Math.abs(q.n[1]) > 0.999) ny++
    }
    return [nx, ny] as [number, number]
  }
  const rutTal = () => rutAv(hash(page))
  const ruteKnapp = page.getByRole("button", { name: "rutenett", exact: true })
  sjekk("rutenettet står på lina", (await ruteKnapp.count()) === 1)
  await ruteKnapp.click()
  await page.waitForTimeout(200)
  sjekk("og knappen seier at han står på", (await ruteKnapp.getAttribute("aria-pressed")) === "true")
  sjekk("skissehandtaket er borte medan han står på", !(await page.locator("[data-handtak='flytt']").isVisible()))
  const [nx0, ny0] = rutTal()
  const utanfor = plana(page).filter((q) => Math.abs(q.n[0]) <= 0.999 && Math.abs(q.n[1]) <= 0.999)
  await toFingrar(page, (t) => [[120 + 176 * t, 300], [120 + 176 * t, 380]])
  await vent(page, (p) => rutAv(p)[0] >= nx0 + 3)
  const [nx1, ny1] = rutTal()
  sjekk("to fingrar til høgre set kolonner", nx1 >= nx0 + 3, `${nx0} → ${nx1} kolonner`)
  sjekk("og rader står", ny1 === ny0, `${ny0} → ${ny1} rader`)
  sjekk(
    "og lista er nettet pluss det som stod der",
    plana(page).length === utanfor.length + nx1 + ny1 && utanfor.every((q) => plana(page).some((p) => p.id === q.id)),
    `${plana(page).length} plan = ${utanfor.length} + ${nx1}×${ny1}`,
  )
  await page.waitForTimeout(1400)
  await toFingrar(page, (t) => [[130, 380 - 176 * t], [260, 380 - 176 * t]])
  await vent(page, (p) => rutAv(p)[1] >= ny1 + 3)
  const [nx2, ny2] = rutTal()
  sjekk("to fingrar oppover set rader", ny2 >= ny1 + 3, `${ny1} → ${ny2} rader`)
  sjekk("og kolonner står", nx2 === nx1, `${nx1} → ${nx2} kolonner`)
  await page.waitForTimeout(1400)
  await page.keyboard.press("z")
  await vent(page, talPlan(utanfor.length + nx1 + ny1))
  sjekk("og Z tek draget attende i eitt", plana(page).length === utanfor.length + nx1 + ny1, `${plana(page).length} plan`)
  await ruteKnapp.click()
  await page.waitForTimeout(200)
  sjekk("trykk att slepper verktyet", (await ruteKnapp.getAttribute("aria-pressed")) === "false")

  {
    await toFingrar(page, (t) => [[150, 330 + 60 * t], [230, 430 - 60 * t]])
    await roleg(page, 400)
    await page.keyboard.press("l")
    await vent(page, talPlan(plana(page).length + 1))
    const mitt = plana(page).find((q) => Math.abs(q.n[0]) < 0.999 && Math.abs(q.n[1]) < 0.999)
    sjekk("eit skrått plan skore for hand", !!mitt, mitt ? `namn ${mitt.id}, n ${mitt.n.map((c) => c.toFixed(2)).join(",")}` : "fann ikkje eitt")
    await ruteKnapp.click()
    await page.waitForTimeout(200)
    const foer = plana(page).length
    await toFingrar(page, (t) => [[120 + 132 * t, 300], [120 + 132 * t, 380]])
    await vent(page, (p) => lesPlan(p.plan).length !== foer)
    const etter = plana(page)
    const staar = mitt ? etter.find((q) => q.id === mitt.id) : undefined
    sjekk("rutenettet tek det ikkje bort", !!staar, `${foer} → ${etter.length} plan`)
    sjekk("og det står uendra, med namnet sitt", !!staar && !!mitt && JSON.stringify(staar) === JSON.stringify(mitt), JSON.stringify(staar ?? null).slice(0, 60))
    sjekk("nettet kom i tillegg", etter.length > (mitt ? 1 : 0), `${etter.length} plan`)
    await ruteKnapp.click()
    await page.waitForTimeout(200)
    for (let i = 0; i < 4 && plana(page).length > utanfor.length + nx1 + ny1; i++) {
      await page.keyboard.press("z")
      await roleg(page, 500)
    }
  }

  const alt = async () => {
    await midt(page)
    if ((await page.getByRole("button", { name: "kuttliste", exact: true }).count()) === 0) await opneArket(page, "sjekk")
  }
  await alt()
  sjekk("arket er ope med alt", (await page.getByRole("button", { name: "kuttliste", exact: true }).count()) === 1)
  sjekk("og platene er ikkje eit verkty i skuffa lenger", (await page.getByRole("button", { name: "plater", exact: true }).count()) === 0)
  await page.getByRole("tab", { name: "kontur", exact: true }).click()
  const flata = page.locator("section[aria-label='plateflata']")
  await flata.waitFor({ timeout: 10000 })
  await roleg(page)
  const delar = flata.locator("g[data-del]")
  const nDel = await delar.count()
  sjekk("platene syner delane som noko du kan ta i", nDel > 0, `${nDel} delar på plata`)
  const maalrute = flata.locator("svg g[aria-hidden='true']").first()
  const nLiner = await maalrute.locator("line").count()
  sjekk("målruta ligg i plata", nLiner > 4, `${nLiner} liner`)
  const merke = await maalrute.locator("text").allTextContents()
  sjekk("og ho ber tal i millimeter", merke.length > 0 && merke.every((t) => /^\d+$/.test((t ?? "").trim())), merke.join(" "))
  sjekk("og regelen står skriven på henne", (await maalrute.evaluate((el) => getComputedStyle(el).pointerEvents)) === "none")
  {
    const vald0 = await page.locator("[data-plan][aria-selected='true']").count()
    const rb = await maalrute.boundingBox()
    if (rb) {
      await page.touchscreen.tap(Math.round(rb.x + rb.width / 2), Math.round(rb.y + rb.height / 2))
      await page.waitForTimeout(400)
    }
    sjekk("og eit trykk i ruta endrar ingenting", (await page.locator("[data-plan][aria-selected='true']").count()) === vald0, `${vald0} valde`)
  }
  await roleg(page, 700)
  await delar.first().click()
  const slettPlan = page.getByRole("button", { name: "slett", exact: true })
  await slettPlan.waitFor({ timeout: 5000 }).catch(() => {})
  sjekk("eit trykk på ein del vel planet hans", (await slettPlan.count()) === 1, `${await slettPlan.count()} knapp`)
  const spalta = await page.locator(".tumme button").evaluateAll((el) => el.map((e) => (e.getAttribute("aria-label") || e.textContent || "?").trim()))
  sjekk("og spalta ber berre det plata kan syne", JSON.stringify(spalta) === JSON.stringify(["dubler planet", "slett"]), JSON.stringify(spalta))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  const tom = await page.locator(".tumme button").count()
  sjekk("og utan eit plan valt står ho tom", tom === 0, `${tom} knappar`)

  const adr = await delar.first().getAttribute("data-del")
  await delar.first().dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, buttons: 1 })
  await page.waitForTimeout(700)
  await delar.first().dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, buttons: 0 })
  const meny = page.getByRole("dialog", { name: `del ${adr}` })
  const harMeny = (await meny.count()) === 1
  sjekk("hald på ein del opnar menyen hans", harMeny, `del ${adr}`)
  if (harMeny) {
    await meny.getByRole("button", { name: /snu/ }).first().click()
    await vent(page, (p) => !!p.fest)
    sjekk("«snu» festar delen, med kvartsving, i lenkja", new RegExp(`(^|;)${adr}:\\d+,[123],`).test(hash(page).fest), hash(page).fest.slice(0, 40))
    await page.keyboard.press("z")
    await roleg(page)
  }
  const bak = page.locator("div[aria-hidden='true'].fixed.inset-0")
  if (await bak.count()) await bak.dispatchEvent("pointerdown")
  await page.waitForTimeout(200)
  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await page.waitForTimeout(400)
  sjekk("og «lag» tek deg attende til rommet", (await flata.count()) === 0)

  const verkty = page.locator("section[aria-label='verkty']")
  await alt()
  await page.getByRole("button", { name: "oppsett", exact: true }).click()
  await verkty.waitFor({ timeout: 10000 })
  const tekstfelt = page.locator("textarea[aria-label='alle innstillingane som tekst']")
  const tekst = await tekstfelt.inputValue()
  sjekk("oppsettet som tekst ber plana", /\bplan\b/.test(tekst) && tekst.includes("@"), `${tekst.length} teikn`)
  sjekk("og feltet er lese-berre, med kopier og lim inn som knappar", (await tekstfelt.getAttribute("readonly")) !== null && (await page.getByRole("button", { name: "kopier", exact: true }).count()) === 1 && (await page.getByRole("button", { name: "lim inn", exact: true }).count()) === 1)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

  await alt()
  await page.getByRole("button", { name: "kuttliste", exact: true }).click()
  await verkty.waitFor({ timeout: 10000 })
  const kutt = (await verkty.innerText()).replace(/\s+/g, " ")
  sjekk("kuttlista har éi line per del, med plan og ledd", /ledd/i.test(kutt) && /\b1\b/.test(kutt), kutt.slice(0, 60))
  await page.keyboard.press("Escape")

  await page.keyboard.press("Escape")
  await roleg(page, 400)
  const kamera = async (): Promise<[number, number, number]> => {
    const s = (await page.locator(".handtak").getAttribute("data-kamera")) ?? "0,0,0"
    return s.split(",").map(Number) as [number, number, number]
  }
  const syn = async () => {
    const b = page.locator(".handtak")
    const d = Number((await b.getAttribute("data-avstand")) ?? "0")
    const fov = Number((await b.getAttribute("data-fov")) ?? "30")
    return { d, fov, skala: d * Math.tan((fov * Math.PI) / 360) }
  }
  const h = await page.locator("header").boundingBox()
  const v = page.viewportSize()!
  const kx = v.width - 38
  const ky = (h?.height ?? 44) + 38
  await page.locator("[data-heim]").click()
  await page.waitForTimeout(900)
  const kubeFør = await kamera()
  const synFør = await syn()
  await page.touchscreen.tap(kx, ky)
  await page.waitForTimeout(1700)
  const framme = await kamera()
  sjekk("eit tapp midt på synskuben ser rett framanfrå", Math.abs(framme[0]) < 0.5 && framme[2] > 10, `${kubeFør.map((c) => c.toFixed(1)).join(", ")} → ${framme.map((c) => c.toFixed(2)).join(", ")}`)

  const synFlat = await syn()
  sjekk("og då flatar synet seg ut: synsfeltet ned mot to grader", synFlat.fov < 2.2 && synFlat.d > synFør.d * 10, `${synFør.fov.toFixed(1)}° på ${synFør.d.toFixed(1)} → ${synFlat.fov.toFixed(2)}° på ${synFlat.d.toFixed(1)}`)
  sjekk("utan at objektet vert større eller mindre", Math.abs(synFlat.skala / synFør.skala - 1) < 0.02, `${synFør.skala.toFixed(3)} → ${synFlat.skala.toFixed(3)}`)

  await page.touchscreen.tap(kx + 14, ky - 14)
  await page.waitForTimeout(1700)
  const hjorne = await kamera()
  sjekk("og eit tapp på hjørnet hans ser frå tre sider", Math.min(...hjorne) > 1 && Math.max(...hjorne) - Math.min(...hjorne) < 1, hjorne.map((c) => c.toFixed(2)).join(", "))
  const synHjorne = await syn()
  sjekk("og perspektivet kjem attende når du forlet sida", synHjorne.fov > 29, `${synHjorne.fov.toFixed(2)}°`)
  sjekk("med objektet framleis like stort", Math.abs(synHjorne.skala / synFør.skala - 1) < 0.02, `${synFør.skala.toFixed(3)} → ${synHjorne.skala.toFixed(3)}`)

  await page.locator("[data-heim]").click()
  await page.waitForTimeout(700)
  await page.touchscreen.tap(kx, ky)
  await page.waitForTimeout(1700)
  sjekk("ei side til: flatt att", (await syn()).fov < 2.2, `${(await syn()).fov.toFixed(2)}°`)
  await page.mouse.move(195, 420)
  await page.mouse.down()
  await page.mouse.move(300, 350, { steps: 12 })
  await page.mouse.up()
  await roleg(page, 900)
  const synFinger = await syn()
  sjekk("og ein finger tek deg ut av det like godt", synFinger.fov > 29 && Math.abs(synFinger.skala / synFør.skala - 1) < 0.02, `${synFinger.fov.toFixed(2)}° · ${synFinger.skala.toFixed(3)} mot ${synFør.skala.toFixed(3)}`)

  await page.locator("[data-heim]").click()
  await page.waitForTimeout(700)
  const heim = await kamera()
  sjekk("innramminga tek synet heim att", heim[1] > 0 && heim[2] > Math.abs(heim[0]), heim.map((c) => c.toFixed(2)).join(", "))

  const laas = page.locator("[data-laas]")
  sjekk("låsen står under kuben, open", (await laas.count()) === 1 && (await laas.getAttribute("aria-pressed")) === "false")
  await page.mouse.move(195, 430)
  await page.mouse.down()
  await page.mouse.move(300, 350, { steps: 12 })
  await page.mouse.up()
  await roleg(page, 900)
  await laas.click()
  await page.waitForTimeout(250)
  sjekk("og eit trykk låser han", (await laas.getAttribute("aria-pressed")) === "true")
  const laastFraa = await kamera()
  sjekk("og synet står i ein annan vinkel enn heimvinkelen", Math.hypot(laastFraa[0] - heim[0], laastFraa[1] - heim[1], laastFraa[2] - heim[2]) > 1, `${heim.map((c) => c.toFixed(2)).join(", ")} → ${laastFraa.map((c) => c.toFixed(2)).join(", ")}`)
  await page.mouse.move(195, 420)
  await page.mouse.down()
  await page.mouse.move(310, 330, { steps: 12 })
  await page.mouse.up()
  await roleg(page, 500)
  sjekk("ein finger snur ikkje synet medan han er låst", (await kamera()).join() === laastFraa.join(), `${laastFraa.map((c) => c.toFixed(2)).join(", ")} → ${(await kamera()).map((c) => c.toFixed(2)).join(", ")}`)
  await page.touchscreen.tap(kx, ky)
  await roleg(page, 900)
  const sida = await kamera()
  const smaa = sida.map((c) => Math.abs(c)).sort((a, b) => a - b)
  sjekk("men synskuben snur han til den sida du trykte", smaa[2] > 1 && smaa[1] < 0.01 * smaa[2], sida.map((c) => c.toFixed(2)).join(", "))
  await page.locator("[data-heim]").click()
  await roleg(page, 700)
  const rammaLaast = await kamera()
  const einn = (a: number[]) => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return a.map((c) => c / L) }
  const [e0, e1] = [einn(sida), einn(rammaLaast)]
  sjekk("innramminga rammar inn utan å snu", Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]) < 0.01, rammaLaast.map((c) => c.toFixed(2)).join(", "))
  await laas.click()
  await page.waitForTimeout(250)
  await page.mouse.move(195, 420)
  await page.mouse.down()
  await page.mouse.move(310, 330, { steps: 12 })
  await page.mouse.up()
  await roleg(page, 500)
  sjekk("og eit trykk til slepper han: fingeren snur att", (await kamera()).join() !== rammaLaast.join(), (await kamera()).map((c) => c.toFixed(2)).join(", "))
  await page.locator("[data-heim]").click()
  await roleg(page, 700)
  await page.touchscreen.tap(195, 380)
  await page.waitForTimeout(90)
  await page.touchscreen.tap(195, 380)
  await page.waitForTimeout(900)
  const kEtter = await kamera()
  const kSprang = Math.hypot(kEtter[0] - heim[0], kEtter[1] - heim[1], kEtter[2] - heim[2])
  sjekk("eit dobbelttrykk rammar IKKJE inn på nytt", kSprang < 1e-3, `${kSprang.toFixed(4)} frå der det stod`)

  const klipp = { x: 30, y: 150, width: 330, height: 420 }
  const stille = async (n = 12) => {
    let fyrr = await page.screenshot({ clip: klipp })
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(400)
      const naa = await page.screenshot({ clip: klipp })
      if (naa.equals(fyrr)) return naa
      fyrr = naa
    }
    return fyrr
  }
  const skalFør = await stille()
  await page.getByRole("tab", { name: "flate", exact: true }).click()
  await roleg(page, 1200)
  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await roleg(page, 1200)
  const skalEtter = await stille()
  sjekk("ein tur innom «flate» let skalet stå som det stod", skalFør.equals(skalEtter), `${skalFør.length} B → ${skalEtter.length} B`)

  sjekk("det finst ingen penn å teikne med", (await page.locator("button[data-penn]").count()) === 0 && (await page.getByRole("button", { name: "teikn", exact: true }).count()) === 0)

  const kjelde = page.locator("button[data-kjelde]")
  sjekk("kjelda står i toppen med namn", (await kjelde.isVisible()) && (await kjelde.innerText()).trim() === "kube")
  await kjelde.click()
  await page.waitForTimeout(250)
  const meny2 = page.locator("[data-meny]")
  sjekk("og opnar lista med tom flate, familiane og fila", (await meny2.count()) === 1 && (await meny2.getByRole("button").count()) === FORMER.length + 2, `tom + ${FORMER.join(" ")} + fil · ${await meny2.getByRole("button").count()} knappar`)
  sjekk("og ingen utgåve står i henne", (await meny2.getByRole("button", { name: /-\d\d$/ }).count()) === 0)
  {
    const klipp = { x: 40, y: 200, width: 310, height: 380 }
    const fyrr = await page.screenshot({ clip: klipp })
    await meny2.getByRole("button", { name: "stolform", exact: true }).click()
    await vent(page, (p) => /stolform-01/.test(String(p.scene ?? "")))
    await roleg(page, 2500)
    const etter = await page.screenshot({ clip: klipp })
    sjekk("ei innebygd form vert henta og bygd", !fyrr.equals(etter), `${fyrr.length} B → ${etter.length} B`)
    sjekk("familien gjev den fyrste utgåva si", /stolform-01/.test(String(hash(page).scene ?? "")), String(hash(page).scene ?? "").slice(0, 40))
    await page.keyboard.press("z")
    await roleg(page, 600)

    for (const fam of FORMER.filter((f) => f !== "kube" && f !== "stolform")) {
      await kjelde.click()
      await page.waitForTimeout(300)
      const foer = await page.screenshot({ clip: klipp })
      await meny2.getByRole("button", { name: fam, exact: true }).click()
      await vent(page, (p) => new RegExp(`${fam}-01`).test(String(p.scene ?? "")))
      await roleg(page, 2500)
      const ny = await page.screenshot({ clip: klipp })
      sjekk(`«${fam}» hentar ein kropp`, !foer.equals(ny), `${foer.length} B → ${ny.length} B`)
      await page.keyboard.press("z")
      await roleg(page, 600)
    }
    await kjelde.click()
    await page.waitForTimeout(300)
  }
  await meny2.getByRole("button", { name: "kube", exact: true }).click()
  await vent(page, (p) => !!p.scene)
  sjekk("ein bit til vert lagd til kroppen", /kube@.*;kube@/.test(hash(page).scene ?? ""), (hash(page).scene ?? "").slice(0, 40))
  sjekk("og brikka seier kor mange bitar han er", (await kjelde.innerText()).trim() === "kube +1")
  await page.keyboard.press("z")
  await vent(page, (p) => !p.scene)
  sjekk("angre tek biten bort att", !hash(page).scene, `«${hash(page).scene ?? ""}»`)

  sjekk("ingen konsollfeil på telefonen", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

async function skrivebordet(browser: Browser) {
  console.log("\n=== skrivebordet")
  const { page, konsoll } = await opne(URL, browser, 1400, 900)
  const tetra = (a: number) => `v 0 0 0\nv ${a} 0 0\nv 0 ${a} 0\nv 0 0 ${a}\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 1 4 3\n`
  const kjeldeknapp = page.locator("[data-kjelde]")
  const lagra = () => page.locator("[data-meny] [data-lagra]")
  const opneKjelde = async () => {
    for (let i = 0; i < 3 && (await kjeldeknapp.getAttribute("aria-expanded")) !== "true"; i++) {
      await kjeldeknapp.click()
      await roleg(page, 600)
    }
  }

  await page.locator("header input[type=file]").setInputFiles([
    { name: "ein.obj", mimeType: "text/plain", buffer: Buffer.from(tetra(40)) },
    { name: "to.obj", mimeType: "text/plain", buffer: Buffer.from(tetra(60)) },
  ])
  await vent(page, (p) => typeof p.kjelde === "string" && p.kjelde !== "kube", 25000)
  await roleg(page, 1800)
  const vist = (await kjeldeknapp.innerText()).trim()
  sjekk("den fyrste fila vert kroppen", /ein/.test(vist), vist)

  await opneKjelde()
  const namn = await lagra().allInnerTexts()
  sjekk("og BEGGE står i menyen etterpå", namn.length >= 2 && namn.some((t) => /ein/.test(t)) && namn.some((t) => /to/.test(t)), namn.join(" · "))
  await page.keyboard.press("Escape")
  await roleg(page, 300)

  await page.reload({ waitUntil: "load" })
  await ferdig(page)
  await roleg(page, 1800)
  await opneKjelde()
  const etter = await lagra().allInnerTexts()
  sjekk("og lista står over ei omlasting", etter.length >= 2, etter.join(" · "))

  await page.locator("header input[type=file]").setInputFiles(
    Array.from({ length: 22 }, (_, i) => ({ name: `fyll-${i}.obj`, mimeType: "text/plain", buffer: Buffer.from(tetra(20 + i)) })),
  )
  await ferdig(page)
  await roleg(page, 2000)
  await page.setViewportSize({ width: 390, height: 844 })
  await roleg(page, 800)
  await page.mouse.move(200, 400)
  await roleg(page, 1000)
  await opneKjelde()
  const boks = page.locator("[data-meny]")
  sjekk("menyen er open etter trykket", (await boks.count()) === 1, (await kjeldeknapp.getAttribute("aria-expanded")) ?? "?")
  const mm = (await boks.count()) ? await boks.boundingBox() : null
  const vh = page.viewportSize()!.height
  sjekk("menyen held seg innanfor skjermen", !!mm && mm.y + mm.height <= vh, mm ? `botn ${Math.round(mm.y + mm.height)} av ${vh} px` : "fann han ikkje")
  const rullar = await boks.evaluate((e) => ({ s: e.scrollHeight, c: e.clientHeight, t: e.getBoundingClientRect().top }))
  sjekk("lista er lengre enn skjermen", rullar.t + rullar.s > vh, `${Math.round(rullar.t + rullar.s)} px mot ${vh} px skjerm`)
  sjekk("og ho rullar inni seg sjølv", rullar.s > rullar.c + 4, `${rullar.s} px innhald i ${rullar.c} px`)
  await boks.evaluate((e) => { e.scrollTop = e.scrollHeight })
  await roleg(page, 400)
  const sist = boks.locator("[data-lagra]").last()
  const sb = await sist.boundingBox()
  sjekk("og den siste lina er å nå", !!sb && sb.y >= 0 && sb.y + sb.height <= vh, sb ? `${Math.round(sb.y)}..${Math.round(sb.y + sb.height)} px` : "fann henne ikkje")
  await page.keyboard.press("Escape")
  await roleg(page, 300)
  await page.setViewportSize({ width: 1400, height: 900 })
  await roleg(page, 800)

  const bitFoer = String(hash(page).scene ?? "").split(";").filter(Boolean).length
  await opneKjelde()
  await lagra().filter({ hasText: "to" }).first().click()
  await vent(page, (p) => String(p.scene ?? "").split(";").filter(Boolean).length > bitFoer, 25000)
  await roleg(page, 900)
  sjekk("eit trykk i lista legg nettet i kroppen", String(hash(page).scene ?? "").split(";").filter(Boolean).length > bitFoer, String(hash(page).scene ?? "").slice(0, 50))

  await page.evaluate("location.hash = '#p=' + encodeURIComponent(JSON.stringify({ plan: '1@0.2,0.5,0.5/1,0,0;2@0.4,0.5,0.5/1,0,0;3@0.6,0.5,0.5/1,0,0;4@0.8,0.5,0.5/1,0,0' }))")
  await page.reload({ waitUntil: "load" })
  await ferdig(page)
  await roleg(page, 1500)
  const rader = page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]")
  sjekk("fire plan i lista", (await rader.count()) === 4, `${await rader.count()}`)
  await rader.nth(0).locator("button").first().click()
  await roleg(page, 500)
  await rader.nth(3).locator("button").first().click({ modifiers: ["Shift"] })
  await roleg(page, 800)
  const gr = lesPlan(hash(page).plan).map((q) => q.gruppe ?? 0)
  const ein = [...new Set(gr.filter(Boolean))]
  sjekk("skift-trykk gjer strekket til éi gruppe", ein.length === 1 && gr.every((g) => g === ein[0]), gr.join(","))
  sjekk("og gruppa står som ei rad i lista", (await page.locator("[role=option][data-gruppe]").count()) === 1)

  sjekk("ingen konsollfeil på skrivebordet", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function kroppen(browser: Browser) {
  console.log("\n=== verktyet for kroppen")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const kjelde = page.locator("button[data-kjelde]")
  const meny2 = page.locator("[data-meny]")

  const bitScene = () => hash(page).scene ?? ""
  const bitTal = () => (bitScene() ? bitScene().split(";").length : 0)
  await kjelde.click()
  await page.waitForTimeout(250)
  await meny2.getByRole("button", { name: "kube", exact: true }).click()
  await vent(page, (p) => !!p.scene)
  const bitVerkty = page.locator("[data-bitverkty]")
  sjekk("verktyet for kroppen er ein knapp med tilstand", (await bitVerkty.count()) === 1 && (await bitVerkty.getAttribute("aria-pressed")) === "false")
  await bitVerkty.click()
  await page.waitForTimeout(500)
  sjekk("og eit trykk slår han på", (await bitVerkty.getAttribute("aria-pressed")) === "true")
  await page.touchscreen.tap(250, 430)
  await page.waitForTimeout(500)
  sjekk("eit trykk vel ein bit", (await page.locator("[aria-label='dubler biten']").count()) === 1)

  {
    const foer = bitScene().split(";")
    const valdBit = () => bitScene().split(";")[1] ?? ""
    const hale = (q: string) => q.slice(q.indexOf("@"))
    const vel = async (namn: string) => {
      await kjelde.click()
      await page.waitForTimeout(250)
      await meny2.getByRole("button", { name: namn, exact: true }).click()
    }
    await vel("stolform")
    await vent(page, (p) => /stolform-01/.test(String(p.scene ?? "")))
    const etter = bitScene().split(";")
    sjekk("eit val med ein bit vald legg ingen bit til", etter.length === foer.length, `${foer.length} → ${etter.length} bitar`)
    sjekk("det byter forma i den valde biten", /^stolform-01@/.test(etter[1] ?? ""), (etter[1] ?? "").slice(0, 40))
    sjekk("og plassen, storleiken og vendinga hans står", hale(etter[1] ?? "") === hale(foer[1] ?? ""), `${foer[1]} → ${etter[1]}`)
    sjekk("og dei andre bitane står urørte", etter[0] === foer[0], `${foer[0]} → ${etter[0]}`)
    await vel("stolform")
    await vent(page, (p) => /stolform-02/.test(String(p.scene ?? "")), 20000)
    sjekk("den same familien om att blar til den neste utgåva", /^stolform-02@/.test(valdBit()), valdBit().slice(0, 40))
    sjekk("og han står framleis der han stod", hale(valdBit()) === hale(foer[1] ?? ""), valdBit())
    const bla = page.locator("[data-bla]")
    const bx = await bla.boundingBox()
    const tx = await page.locator("[data-bitverkty]").boundingBox()
    sjekk("bladeren står med ein bit som har fleire utgåver", (await bla.count()) === 1)
    sjekk("og han står motsett veg av reiskapane", !!bx && !!tx && bx.x + bx.width < tx.x, `${bx ? Math.round(bx.x) : "–"} mot ${tx ? Math.round(tx.x) : "–"} px`)
    const kamBla = async () => (await page.locator(".handtak").getAttribute("data-kamera")) ?? "?"
    const kFyrr = await kamBla()
    await bla.click()
    await vent(page, (p) => /stolform-03/.test(String(p.scene ?? "")), 20000)
    sjekk("eitt trykk blar til den neste utgåva", /^stolform-03@/.test(valdBit()), valdBit().slice(0, 40))
    sjekk("og synet står medan du blar", (await kamBla()) === kFyrr, `${kFyrr} → ${await kamBla()}`)
    sjekk("og plassen, storleiken og vendinga står", hale(valdBit()) === hale(foer[1] ?? ""), valdBit())
    await page.keyboard.press("b")
    await vent(page, (p) => /stolform-04/.test(String(p.scene ?? "")), 20000)
    sjekk("og B gjer det same frå tastaturet", /^stolform-04@/.test(valdBit()), valdBit().slice(0, 40))
    await vel("sau")
    await vent(page, (p) => /sau-01/.test(String(p.scene ?? "")), 20000)
    sjekk("ein annan familie byrjar på si eiga fyrste", /^sau-01@/.test(valdBit()), valdBit().slice(0, 40))
    for (let i = 0; i < 8 && bitScene() !== foer.join(";"); i++) {
      await page.keyboard.press("z")
      await roleg(page, 500)
    }
    sjekk("og angre tek bytta attende", bitScene() === foer.join(";"), bitScene().slice(0, 48))
  }

  {
    const foer = bitScene().split(";")
    const planFoer = plana(page).length
    const obj = "v 0 0 0\nv 40 0 0\nv 0 40 0\nv 0 0 40\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 1 4 3\n"
    await page.locator("header input[type=file]").setInputFiles({ name: "prove.obj", mimeType: "text/plain", buffer: Buffer.from(obj) })
    await vent(page, (p) => (String(p.scene ?? "").split(";")[1] ?? "") !== foer[1], 20000)
    const etter = bitScene().split(";")
    sjekk("ei fil med ein bit vald går inn i HAN", etter.length === foer.length && !/^kube@/.test(etter[1] ?? ""), (etter[1] ?? "").slice(0, 40))
    sjekk("og lèt kroppen elles stå", etter[0] === foer[0] && plana(page).length === planFoer, `${foer[0]} → ${etter[0]} · ${planFoer} plan`)
    await page.keyboard.press("z")
    await vent(page, (p) => (String(p.scene ?? "").split(";")[1] ?? "") === foer[1])
    sjekk("og angre tek fila attende", bitScene() === foer.join(";"), bitScene().slice(0, 48))
  }

  const bitFør = bitScene()
  const prikkar = await page.locator(".sider button").evaluateAll((el) =>
    el.map((e) => {
      const r = e.getBoundingClientRect()
      return [r.x + r.width / 2, r.y + r.height / 2] as [number, number]
    }),
  )
  const fritt = (x: number, y: number) => prikkar.every(([px, py]) => Math.hypot(px - x, py - y) > 34)
  const par = ([[140, 430], [220, 430]] as [number, number][]).map(([x, y]) => {
    for (const dy of [0, 40, -40, 70, -70, 110]) if (fritt(x, y + dy)) return [x, y + dy] as [number, number]
    return [x, y] as [number, number]
  })
  await toFingrar(page, (t) => [[par[0][0], par[0][1] - 90 * t], [par[1][0], par[1][1] - 90 * t]])
  await vent(page, (p) => (p.scene ?? "") !== bitFør)
  const andre = () => bitScene().split(";")[1] ?? ""
  const lyft = /@[-\d.]+,[-\d.]+,([\d.]+)/.exec(andre())
  sjekk("to fingrar rett opp lyfter biten", !!lyft && Number(lyft[1]) > 5, bitScene().slice(0, 48))
  const førKlyp = bitScene()
  const klypY = fritt(180, 400) ? 400 : 470
  await toFingrar(page, (t) => [[180 - 30 - 60 * t, klypY], [180 + 30 + 60 * t, klypY]])
  await vent(page, (p) => (p.scene ?? "") !== førKlyp)
  const stor = /@[^/]+\/([\d.]+)\//.exec(andre())
  sjekk("og eit klyp gjer HAN større, ikkje kroppen", !!stor && Number(stor[1]) > 1.05 && hash(page).storleik === 150, `${stor?.[1]} · kroppen ${hash(page).storleik} mm`)
  {
    const sider = page.locator(".sider button")
    sjekk("den valde biten har seks prikkar", (await sider.count()) === 6, `${await sider.count()}`)
    const tal3 = (q: string) => {
      const m = /@[^/]+\/([^/]+)\//.exec(q)
      if (!m) return [1, 1, 1]
      const d = m[1].split(",").map(Number)
      return d.length === 3 ? d : [d[0], d[0], d[0]]
    }
    const foer = tal3(andre())
    const kamera = async () => (await page.locator(".handtak").getAttribute("data-kamera")) ?? "?"
    const kamFoer = await kamera()
    const d = await page.locator('.sider [data-side="0"]').boundingBox()
    if (!d) sjekk("prikken på x-sida står på skjermen", false)
    else {
      const cx = d.x + d.width / 2
      const cy = d.y + d.height / 2
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 70, cy, { steps: 14 })
      await page.mouse.up()
      await vent(page, (p) => JSON.stringify(tal3((p.scene ?? "").split(";")[1] ?? "")) !== JSON.stringify(foer))
      const etter = tal3(andre())
      const rort = etter.filter((c, i) => Math.abs(c - foer[i]) > 0.01).length
      sjekk("eit drag i prikken rører NØYAKTIG éin akse", rort === 1, `${foer.join(",")} → ${etter.join(",")}`)
      await roleg(page, 900)
      sjekk("og synet står stille medan du dreg", (await kamera()) === kamFoer, `${kamFoer} → ${await kamera()}`)
      {
        const cdp = await page.context().newCDPSession(page)
        const pt = (px: number, py: number, id: number) => ({ x: px, y: py, id, radiusX: 4, radiusY: 4, force: 1 })
        const kamHald = await kamera()
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(cx, cy, 0)] })
        await page.waitForTimeout(24)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(cx, cy, 0), pt(60, 700, 1)] })
        await page.waitForTimeout(24)
        for (let i = 1; i <= 12; i++) {
          const t = i / 12
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(cx + 50 * t, cy, 0), pt(60 + 30 * t, 700 - 40 * t, 1)] })
          await page.waitForTimeout(16)
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await cdp.detach()
        await roleg(page, 900)
        sjekk("og ein finger til på lerretet snur han ikkje", (await kamera()) === kamHald, `${kamHald} → ${await kamera()}`)
      }
      await page.locator("[data-heim]").click()
      await roleg(page, 900)
      sjekk("men innrammingsknappen ramar inn på nytt", (await kamera()) !== kamFoer, await kamera())
    }
  }
  {
    await midt(page)
    const rad = page.locator("[data-lag='bit']")
    sjekk("ein vald bit får laget sitt under storleiken", (await rad.count()) === 1)
    const merke = rad.locator("[aria-label='lag C03']")
    await merke.click()
    await vent(page, (p) => /\/c:3/.test(String(p.scene ?? "")))
    sjekk("og merket hamnar i scenestrengen", /\/c:3(;|$)/.test(bitScene()), bitScene().slice(0, 60))
    sjekk("på den valde biten og ikkje ein annan", /^[a-z0-9-]+@[^;]*\/c:3$/.test(bitScene().split(";")[1] ?? ""), bitScene().split(";")[1] ?? "")
    sjekk("og knappen lyser", (await merke.getAttribute("aria-pressed")) === "true")
    await page.locator("[data-lag='bit'] [aria-label='ikkje noko lag']").click()
    await vent(page, (p) => !/\/c:3/.test(String(p.scene ?? "")))
    sjekk("ringen tek merket av att", !/c:/.test(bitScene()), bitScene().slice(0, 60))
    await bytArket(page)
    await page.waitForTimeout(400)
  }

  const n1 = bitTal()
  await page.locator("[aria-label='dubler biten']").click()
  await vent(page, () => bitTal() === n1 + 1)
  sjekk("dubleringa legg ein bit til", bitTal() === n1 + 1, bitScene().slice(0, 60))
  await page.locator("[aria-label='ta biten bort']").click()
  await vent(page, () => bitTal() === n1)
  sjekk("og slettinga tek han bort att", bitTal() === n1, bitScene().slice(0, 60))
  await bitVerkty.click()
  await page.waitForTimeout(300)
  sjekk("eit trykk til lèt verktyet att", (await bitVerkty.getAttribute("aria-pressed")) === "false" && (await page.locator("[aria-label='dubler biten']").count()) === 0)

  sjekk("ingen konsollfeil i verktyet for kroppen", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

async function teikninga(browser: Browser) {
  console.log("\n=== teikne ei flate")
  const { page, konsoll } = await opne(URL, browser, 1400, 900)
  await roleg(page, 800)
  const knapp = page.locator("[data-teiknknapp]")
  sjekk("reiskapen står i spalta", (await knapp.count()) === 1)

  const mid = { x: 700, y: 430 }
  await knapp.click()
  await roleg(page, 500)
  sjekk("og eit trykk tek han", (await knapp.getAttribute("aria-pressed")) === "true")

  const foer0 = plana(page).length
  await page.mouse.click(mid.x, mid.y)
  await roleg(page, 400)
  sjekk("eit trykk lagar ingenting, og reiskapen står att", plana(page).length === foer0 && (await knapp.getAttribute("aria-pressed")) === "true", `${plana(page).length} plan, venta ${foer0}`)

  const foer = plana(page).length
  await page.mouse.move(mid.x - 90, mid.y - 90)
  await page.mouse.down()
  await page.mouse.move(mid.x, mid.y - 40, { steps: 4 })
  await roleg(page, 250)
  const undervegs = await page.locator("[data-teikn]").getAttribute("data-teikn")
  const hjorne = await page.evaluate(() => (document.querySelector(".teiknflate polygon")?.getAttribute("points") ?? "").trim().split(/\s+/).filter(Boolean).length)
  sjekk("firkanten står på skjermen medan fingeren går", undervegs === "dreg" && hjorne === 4, `${undervegs}, ${hjorne} hjørne`)
  await page.mouse.move(mid.x + 90, mid.y + 90, { steps: 6 })
  await page.mouse.up()
  await vent(page, talPlan(foer + 1), 15000)
  await roleg(page, 900)
  sjekk("og eitt drag gjev eitt plan", plana(page).length === foer + 1)
  const pl = lesPlan(hash(page).plan)[foer]
  sjekk("og planet ber ein firkant på fire punkt", (pl?.omriss?.length ?? 0) === 4, `${pl?.omriss?.length ?? 0} punkt i omrisset`)
  const om = pl?.omriss ?? []
  const uu = [...new Set(om.map((q) => q[0]))]
  const vv = [...new Set(om.map((q) => q[1]))]
  sjekk("og hjørna står på to u og to v", uu.length === 2 && vv.length === 2, `${uu.length} u, ${vv.length} v`)
  sjekk("og reiskapen slepper seg sjølv etterpå", (await knapp.getAttribute("aria-pressed")) === "false")

  await vent2(page, async () => (await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").count()) > 0, 15000)
  const rad = page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").last()
  const tekst = (await rad.innerText()).replace(/\s+/g, " ")
  sjekk("og flata står i lista som ein del", !/utanfor/.test(tekst), tekst.slice(0, 60))

  const foer2 = plana(page).length
  await knapp.click()
  await roleg(page, 400)
  await page.mouse.move(mid.x - 40, mid.y + 120)
  await page.mouse.down()
  await page.mouse.move(mid.x + 40, mid.y + 190, { steps: 4 })
  await roleg(page, 250)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await roleg(page, 700)
  sjekk("escape slepper teikninga utan å lage noko", plana(page).length === foer2 && (await knapp.getAttribute("aria-pressed")) === "false", `${plana(page).length} plan, venta ${foer2}`)

  sjekk("ingen konsollfeil i teikninga", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function kamera(browser: Browser) {
  console.log("\n=== kameraet under to fingrar")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  await page.evaluate(() => {
    location.hash = "p=" + encodeURIComponent(JSON.stringify({ kjelde: "kube", storleik: 300, plan: "1@0.3,0.5,0.5/1,0,0;2@0.7,0.5,0.5/1,0,0;3@0.5,0.5,0.5/0,1,0" }))
    location.reload()
  })
  await roleg(page, 1500)

  await bytArket(page)
  await roleg(page, 500)
  await page.locator("[role=tab][aria-label='grupper']").click()
  await roleg(page, 500)
  const rad = page.locator("[role=option][data-plan]").first()
  sjekk("planlista står i skuffa", (await page.locator("[role=option][data-plan]").count()) >= 2, `${await page.locator("[role=option][data-plan]").count()} rader`)
  await rad.locator("button").first().click()
  await roleg(page, 400)
  await page.getByRole("button", { name: "lat att kontrollane" }).click()
  await roleg(page, 500)
  sjekk("og eit plan er valt", (await page.locator(".handtak").getAttribute("data-slag")) === "plan", (await page.locator(".handtak").getAttribute("data-slag")) ?? "?")

  const kamPos = async () => ((await page.locator(".handtak").getAttribute("data-kamera")) ?? "0,0,0").split(",").map(Number)
  const kamAv = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

  const VANDRE = 60
  const planStod = plana(page)[0]
  const kamFor = await kamPos()
  const spor: { ein: boolean; p: number[] }[] = []
  let hakk = 0
  await toFingrar(
    page,
    (t) => {
      const glid = 50 * (1 + 0.15 * t)
      const cx = 170 + VANDRE + 70 * t
      return [[cx, 380 - glid], [cx, 380 + glid]]
    },
    12,
    async () => {
      hakk++
      spor.push({ ein: hakk <= LAG, p: await kamPos() })
    },
    LAG,
    VANDRE,
  )
  await roleg(page, 700)
  const planKom = plana(page)[0]
  const flytta = Math.hypot(planKom.o[0] - planStod.o[0], planKom.o[1] - planStod.o[1], planKom.o[2] - planStod.o[2])
  const ein = spor.filter((q) => q.ein)
  const to = spor.filter((q) => !q.ein)

  const einSvinga = ein.length ? kamAv(kamFor, ein[ein.length - 1].p) : 0
  sjekk("den eine fingeren snudde synet før den andre landa", einSvinga > 0.5, `${einSvinga.toFixed(2)} einingar`)

  const etterTo = to.length ? kamAv(kamFor, to[0].p) : 0
  sjekk(
    "og den andre fingeren tek ikkje svingen attende",
    etterTo >= einSvinga * 0.9,
    `${einSvinga.toFixed(2)} → ${etterTo.toFixed(2)} einingar frå der synet stod`,
  )

  const verst = to.length > 1 ? Math.max(...to.slice(1).map((q) => kamAv(to[0].p, q.p))) : Infinity
  sjekk(
    "kameraet står i kvart hakk etter at BEGGE fingrane er nede",
    verst < 1e-3 && flytta > 0.005,
    `verste avvik ${verst.toFixed(4)} over ${to.length - 1} hakk, planet flytta ${flytta.toFixed(3)}`,
  )
  sjekk("ingen konsollfeil", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function benk(browser: Browser) {
  console.log("\n=== benk 1400×900")
  const { page, konsoll } = await opne(URL, browser, 1400, 900)
  sjekk("kolonna står", (await page.locator("aside[aria-label='kontrollar']").count()) === 1)

  for (const [tast, view] of [["1", "flate"], ["3", "kontur"], ["2", "lag"]] as const) {
    await page.keyboard.press(tast)
    await roleg(page, 300)
    sjekk(`tast ${tast} vel «${view}»`, (await page.getByRole("tab", { name: view, exact: true }).getAttribute("aria-selected")) === "true")
  }

  const n0 = plana(page).length
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 1))
  sjekk("L skjer på benken", plana(page).length === n0 + 1)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").last().locator("button").first().click()
  await page.keyboard.press("Delete")
  await vent(page, talPlan(n0))
  sjekk("Delete tek det valde bort", plana(page).length === n0)

  const felt = page.locator("[aria-label='storleik, tal']")
  const fb = await felt.boundingBox()
  const s0b = hash(page).storleik
  if (fb) {
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(fb.x + fb.width / 2 + 8 * i, fb.y + fb.height / 2)
    await page.mouse.up()
  }
  await vent(page, (p) => p.storleik !== s0b)
  sjekk("dra i talet set storleiken", hash(page).storleik > s0b, `${s0b} → ${hash(page).storleik}`)
  sjekk("og draget opna ikkje skrivefeltet", (await page.locator("input[aria-label='storleik, skriv']").count()) === 0)
  sjekk("og plana står der dei stod", plana(page).length === n0 && plana(page).every((q, i) => JSON.stringify(q) === JSON.stringify(plana(page)[i])))
  await page.keyboard.press("z")
  await vent(page, (p) => p.storleik === s0b)

  const rulle = (merke: string, shift = false) =>
    page.evaluate(
      ([m, sh]) => {
        document.querySelector(`[aria-label="${m}"]`)?.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true, shiftKey: sh === "1" }))
      },
      [merke, shift ? "1" : ""] as const,
    )
  const b0 = hash(page).arkB
  await rulle("breidd, tal")
  await vent(page, (p) => p.arkB !== b0)
  const b1 = hash(page).arkB
  sjekk("eit hjulhakk stegar talet under peikaren", b1 < b0, `${b0} → ${b1} mm`)
  const h0 = hash(page).arkH
  await page.evaluate(() => {
    for (const m of ["breidd, tal", "høgd, tal"]) {
      document.querySelector(`[aria-label="${m}"]`)?.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }))
    }
  })
  await roleg(page, 400)
  sjekk("ei rulling som er i gang tek ikkje raden ho glir over", hash(page).arkH === h0, `${h0} → ${hash(page).arkH} mm`)
  await rulle("høgd, tal", true)
  await vent(page, (p) => p.arkH !== h0)
  sjekk("etter ein pause er hakket hennar, og skift er ti steg", hash(page).arkH < h0 - (b0 - b1) * 5, `${h0} → ${hash(page).arkH} mm`)

  await blur(page)
  await page.keyboard.press("k")
  await page.waitForTimeout(300)
  sjekk("K tek verktyet for kroppen", (await page.locator("[data-bitverkty][aria-pressed='true']").count()) === 1)
  await page.keyboard.press("k")
  await page.waitForTimeout(300)
  sjekk("og K slepper han att", (await page.locator("[data-bitverkty][aria-pressed='false']").count()) === 1)

  await page.keyboard.press("r")
  await page.waitForTimeout(200)
  sjekk("R tek verktyet for rutenettet", (await page.locator("button[aria-label='rutenett'][aria-pressed='true']").count()) === 1)
  {
    const kamera = async () => (await page.locator(".handtak").getAttribute("data-kamera")) ?? "?"
    const k0 = await kamera()
    await page.mouse.move(500, 450)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(500 + 22 * i, 450 - 15 * i)
      await page.waitForTimeout(30)
    }
    await page.mouse.up()
    await vent(page, (p) => lesPlan(p.plan).length > 0)
    const nett = lesPlan(hash(page).plan)
    const nx = nett.filter((q) => Math.abs(q.n[0]) > 0.9).length
    const ny = nett.filter((q) => Math.abs(q.n[1]) > 0.9).length
    sjekk("og eit musedrag set kolonner og rader", nx === 3 && ny === 2, `${nx}×${ny} av 3×2`)
    sjekk("og synet stod stille medan draget gjekk", (await kamera()) === k0)
    await page.keyboard.press("z")
    await roleg(page, 400)
  }
  await page.keyboard.press("r")

  const tjukn = page.locator("[aria-label='tjukn, tal']")
  const talet = page.locator("[aria-label='tjukn, skriv tal']")
  await talet.click()
  const felt2 = page.locator("input[aria-label='tjukn, skriv']")
  sjekk("eit trykk på talet opnar eit felt", (await felt2.count()) === 1)
  await felt2.fill("4,5")
  await page.keyboard.press("Enter")
  await vent(page, (p) => p.tjukn === 4.5)
  sjekk("enter set talet, med komma", hash(page).tjukn === 4.5, String(hash(page).tjukn))
  sjekk("og feltet er borte att", (await page.locator("input[aria-label='tjukn, skriv']").count()) === 0)
  await talet.click()
  await page.locator("input[aria-label='tjukn, skriv']").fill("9")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  sjekk("escape let talet stå", hash(page).tjukn === 4.5 && (await page.locator("input[aria-label='tjukn, skriv']").count()) === 0, String(hash(page).tjukn))
  await tjukn.focus()
  await page.keyboard.press("Shift+ArrowRight")
  await vent(page, (p) => p.tjukn !== 4.5)
  sjekk("skift+pil stegar ti", hash(page).tjukn === 5, String(hash(page).tjukn))
  await blur(page)
  await page.keyboard.press("z")
  await page.keyboard.press("z")
  await vent(page, (p) => p.tjukn !== 4.5 && Math.abs(p.tjukn - 4.5) < 3)

  await page.locator("[aria-label='storleik, skriv tal']").click()
  await page.locator("input[aria-label='storleik, skriv']").fill(String(s0b))
  await page.keyboard.press("Enter")
  await vent(page, (p) => p.storleik === s0b)
  await blur(page)
  sjekk("storleiken er sett attende før millimeterprøva", hash(page).storleik === s0b, `${hash(page).storleik} mm`)
  const foerL = plana(page).length
  await page.keyboard.press("l")
  await vent(page, talPlan(foerL + 1))
  sjekk("L skjer eitt plan til etter angrekjeda", plana(page).length === foerL + 1, `${foerL} → ${plana(page).length} plan`)
  const ida = plana(page)[foerL].id
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").last().locator("button").first().click()
  await page.waitForTimeout(300)
  const rad = page.locator("[role=listbox][aria-label='plan'] [role=option][aria-selected='true']")
  const radTekst = async () => (await rad.innerText()).replace(/\s+/g, " ").trim()
  const mm0 = (await rad.innerText()).match(/[+−]\d+,\d mm/)?.[0] ?? ""
  sjekk("rada på benken les millimeteren frå midten", /[+−]\d+,\d mm/.test(mm0), mm0)
  const mmNo = async () => Number((await rad.innerText()).match(/[+−]\d+,\d mm/)?.[0]?.replace("−", "-").replace(",", ".").replace(" mm", "") ?? NaN)
  const ventMm = async (v: number) => {
    for (let i = 0; i < 60; i++) {
      if (Math.abs((await mmNo()) - v) < 0.06) return true
      await page.waitForTimeout(100)
    }
    return false
  }
  const m0 = await mmNo()
  await page.keyboard.press("ArrowUp")
  sjekk("pil opp flyttar planet éin millimeter langs normalen", await ventMm(m0 + 1), `${m0} → ${await mmNo()}`)
  for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowUp", { delay: 0 })
  sjekk("tolv trykk tett i hop er tolv millimeter", await ventMm(m0 + 12), `${m0} → ${await mmNo()}`)
  for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowDown", { delay: 0 })
  sjekk("og elleve attende er éin", await ventMm(m0 + 1), `${m0} → ${await mmNo()}`)
  await page.keyboard.press("Shift+ArrowDown")
  sjekk("skift+pil ned er ti", await ventMm(m0 - 9), `${m0} → ${await mmNo()}`)
  await page.keyboard.press("d")
  await vent(page, talPlan(n0 + 2))
  sjekk("D dublerer det valde planet, og kopien er vald", plana(page).length === n0 + 2 && (await rad.innerText()).startsWith(String(plana(page)[n0 + 1].id)))
  await page.keyboard.press("Tab")
  await page.waitForTimeout(200)
  sjekk("tab går til neste plan i lista", (await rad.innerText()).startsWith(String(plana(page)[0].id)), await radTekst())
  await page.keyboard.press("Shift+Tab")
  await page.waitForTimeout(200)
  sjekk("skift+tab går attende", (await rad.innerText()).startsWith(String(plana(page)[n0 + 1].id)), await radTekst())

  const boks = page.locator(".handtak")
  const avst0 = await boks.getAttribute("data-avstand")
  await page.mouse.move(400, 450)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(400)
  const avst1 = await boks.getAttribute("data-avstand")
  sjekk("hjulet zoomar", avst0 !== avst1, `${avst0} → ${avst1}`)
  await page.keyboard.press("f")
  await page.waitForTimeout(600)
  sjekk("F rammar inn att", (await boks.getAttribute("data-avstand")) === avst0, `${avst0} vs ${await boks.getAttribute("data-avstand")}`)

  await page.keyboard.press("Escape")
  await page.keyboard.press("3")
  await roleg(page, 600)
  const del = page.locator("g[data-del]").first()
  if (await del.count()) {
    await del.click()
    await page.waitForTimeout(300)
    const fest0 = hash(page).fest ?? ""
    await page.keyboard.press("ArrowRight")
    await vent(page, (p) => (p.fest ?? "") !== fest0)
    const f1 = hash(page).fest
    await page.keyboard.press("Shift+ArrowUp")
    await vent(page, (p) => p.fest !== f1)
    sjekk("pilene festar delen ein millimeter om gongen på plata", !!hash(page).fest && hash(page).fest !== fest0, hash(page).fest.slice(0, 40))
  } else sjekk("plata har ein del å flytte", false)
  await page.keyboard.press("2")

  await page.evaluate("(document.activeElement instanceof HTMLElement) && document.activeElement.blur()")
  const s0 = plana(page).length
  await page.keyboard.press(" ")
  await vent(page, talPlan(s0 + 1))
  sjekk("mellomrom skjer òg", plana(page).length === s0 + 1)
  const knapp = page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan] button").first()
  await knapp.focus()
  const s1 = plana(page).length
  await page.keyboard.press(" ")
  await roleg(page, 400)
  sjekk("men ikkje når ein knapp er teken — han eig tasten sjølv", plana(page).length === s1, `${s1} → ${plana(page).length}`)

  const mrad = page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first()
  await mrad.click({ button: "right" })
  await roleg(page, 300)
  const hmeny = page.locator("[data-meny]")
  sjekk("høgreklikk på ei planrad opnar menyen", (await hmeny.count()) === 1)
  sjekk("og han vel rada han står på", (await mrad.getAttribute("aria-selected")) === "true")
  const linene = await hmeny.locator("[data-meny-line]").allInnerTexts()
  sjekk("og linene ber tastane sine", linene.some((t) => /dubler/.test(t) && /D/.test(t)), linene.join(" · ").replace(/\s+/g, " ").slice(0, 60))
  const f0 = plana(page).length
  await hmeny.locator("[data-meny-line='dubler']").click()
  await vent(page, talPlan(f0 + 1))
  sjekk("og «dubler» dublerer", plana(page).length === f0 + 1)
  sjekk("og menyen er borte etterpå", (await page.locator("[data-meny]").count()) === 0)
  await mrad.click({ button: "right" })
  await roleg(page, 250)
  await page.keyboard.press("Escape")
  await roleg(page, 250)
  sjekk("og escape lukkar han", (await page.locator("[data-meny]").count()) === 0)

  sjekk("ingen konsollfeil på benken", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

async function grupper(browser: Browser) {
  console.log("\n=== grupper (benk 1400×900)")
  const plan = skrivPlan(rutenett(0, 4))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 150 })), browser, 1400, 900)
  sjekk("lista har gruppa som rad", (await page.locator("[data-gruppe='1']").count()) === 1)
  const iLista = page.locator("[role=listbox][aria-label='plan'] [data-plan]")
  sjekk("og plana hennar ligg saman frå fyrst av", (await iLista.count()) === 0, `${await iLista.count()} av 4 plan i lista`)
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(300)
  sjekk("trykk på gruppa vel henne", (await page.locator("[data-gruppe='1'][aria-selected='true']").count()) === 1)
  sjekk("og brettar henne ut", (await iLista.count()) === 4 && (await page.getByRole("button", { name: "gruppe 1", exact: true }).getAttribute("aria-expanded")) === "true", `${await iLista.count()} av 4 plan i lista`)
  sjekk("og det siste planet er leiaren", (await page.locator("[data-plan='4'][aria-selected='true']").count()) === 1)
  sjekk("fordel står under tommelen", (await page.locator("[data-fordel]").count()) === 1)

  const y = () => plana(page).map((p) => p.o[1])
  const y0 = y()
  await page.keyboard.press("ArrowUp")
  await vent(page, (p) => lesPlan(p.plan)[3].o[1] !== y0[3])
  const y1 = y()
  const steg = y1.map((v, i) => v - y0[i])
  sjekk("pil opp flyttar heile gruppa likt", steg.every((d) => Math.abs(d - steg[3]) < 2e-4) && steg[3] > 0.005, steg.map((d) => d.toFixed(4)).join(" "))

  await page.locator("[data-fordel]").click()
  await page.waitForTimeout(150)
  sjekk("fordel er på", (await page.locator("[data-fordel][aria-pressed='true']").count()) === 1)
  await page.keyboard.press("ArrowUp")
  await vent(page, (p) => lesPlan(p.plan)[3].o[1] !== y1[3])
  const y2 = y()
  const s2 = y2.map((v, i) => v - y1[i])
  sjekk("fordelt: det fyrste står, leiaren tek alt, dei imellom sin del", Math.abs(s2[0]) < 1e-9 && s2[3] > 0.005 && Math.abs(s2[1] - s2[3] / 3) < 3e-4 && Math.abs(s2[2] - (2 * s2[3]) / 3) < 3e-4, s2.map((d) => d.toFixed(4)).join(" "))

  const n0 = plana(page).map((p) => p.n)
  await page.keyboard.down("Alt")
  await page.mouse.move(520, 450)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(520 + 8 * i, 450)
  await page.mouse.up()
  await page.keyboard.up("Alt")
  await vent(page, (p) => JSON.stringify(lesPlan(p.plan)[3].n) !== JSON.stringify(n0[3]))
  const n1 = plana(page).map((p) => p.n)
  const vinkel = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  const v = n1.map((n, i) => vinkel(n, n0[i]))
  sjekk("⌥-drag vrir leiaren, og rada er ei vifte", v[0] < 1e-3 && v[3] > 0.05 && v[1] > 1e-3 && v[1] < v[2] && v[2] < v[3], v.map((a) => ((a * 180) / Math.PI).toFixed(1) + "°").join(" "))

  const virr = page.locator("[aria-label='virr, tal']")
  sjekk("ei vald gruppe har ei virr-rad", (await virr.count()) === 1)
  const yv0 = y()
  const draVirr = async (dx: number) => {
    const bx = await virr.boundingBox()
    if (!bx) return
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2)
    await page.mouse.down()
    await page.mouse.move(bx.x + bx.width / 2 + dx, bx.y + bx.height / 2, { steps: 12 })
    await page.mouse.up()
  }
  await draVirr(90)
  await vent(page, (p) => lesPlan(p.plan).some((q, i) => Math.abs(q.o[1] - yv0[i]) > 1e-3))
  const yv1 = y().map((v, i) => v - yv0[i])
  sjekk("virret skuvar kvart plan sitt eige hakk", yv1.some((d) => d > 1e-3) && yv1.some((d) => d < -1e-3), yv1.map((d) => (d * 150).toFixed(1)).join(" "))
  await draVirr(-220)
  await roleg(page, 500)
  const yv2 = y()
  sjekk("og eit drag attende tek rada dit ho stod", yv2.every((v, i) => Math.abs(v - yv0[i]) < 2e-3), yv2.map((v, i) => ((v - yv0[i]) * 150).toFixed(2)).join(" "))

  await page.keyboard.press("d")
  await vent(page, talPlan(8))
  sjekk("D dublerer gruppa, og kopiane er ei ny gruppe som er vald", plana(page).slice(4).every((p) => p.gruppe === 2) && (await page.locator("[data-gruppe='2'][aria-selected='true']").count()) === 1)
  await page.keyboard.press("Delete")
  await vent(page, talPlan(4))
  sjekk("Delete tek heile gruppa", plana(page).length === 4 && plana(page).every((p) => p.gruppe === 1))
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(300)
  sjekk("trykk att slepper gruppa", (await page.locator("[role=option][aria-selected='true']").count()) === 0)
  sjekk("og legg henne saman att", (await iLista.count()) === 0, `${await iLista.count()} av 4 plan i lista`)
  await page.getByRole("button", { name: "slett gruppe 1", exact: true }).click()
  await vent(page, talPlan(0))
  sjekk("× på gruppa tek alle plana", plana(page).length === 0)

  await page.goto(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 150 })))
  await page.reload({ waitUntil: "networkidle" })
  await roleg(page, 800)
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(300)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await page.waitForTimeout(300)
  sjekk("eit valt plan har laga under seg", (await page.locator("[data-lag='lag']").count()) === 1 && (await page.locator("[data-lag='lag'] button").count()) === 29)
  await page.getByRole("button", { name: "lag C03", exact: true }).click()
  await vent(page, (p) => lesPlan(p.plan)[0].farge === 3)
  sjekk("eit trykk merkjer planet med laget", plana(page)[0].farge === 3 && plana(page).slice(1).every((q) => !q.farge), plana(page).map((q) => q.farge ?? 0).join())
  await page.keyboard.press("3")
  await roleg(page, 800)
  const grøn = await page.locator("g[data-del] path[style*='stroke: rgb(0, 224, 0)']").count()
  sjekk("og plata teiknar delen i den fargen", grøn >= 1, `${grøn} baner`)
  await page.keyboard.press("2")
  await roleg(page, 300)
  await page.getByRole("button", { name: "gruppe 1", exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "lag C05", exact: true }).click()
  await vent(page, (p) => lesPlan(p.plan).every((q) => q.farge === 5))
  sjekk("med gruppa vald merkjer trykket heile gruppa", plana(page).every((q) => q.farge === 5), plana(page).map((q) => q.farge ?? 0).join())
  await page.getByRole("button", { name: "ikkje noko lag", exact: true }).click()
  await vent(page, (p) => lesPlan(p.plan).every((q) => !q.farge))
  sjekk("og ringen tek merket bort att", plana(page).every((q) => !q.farge))

  await page.goto(
    URL + "#p=" + encodeURIComponent(JSON.stringify({
      scene: "kube@-90,0,0/1/0;kube@90,0,0/1/0",
      plan: skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] }]),
      storleik: 150,
    })),
  )
  await page.reload({ waitUntil: "networkidle" })
  await roleg(page, 800)
  await page.getByRole("button", { name: "kuttliste", exact: true }).click()
  const verkty = page.locator("section[aria-label='verkty']")
  await verkty.waitFor({ timeout: 10000 })
  const bolk = verkty.locator("[data-bolk='plan-1']")
  const rader = verkty.locator("tbody tr")
  const rad0 = await rader.count()
  sjekk("kuttlista samlar dei to stykka under planet sitt", (await bolk.count()) === 1 && rad0 === 3, `${rad0} rader`)
  await bolk.click()
  await page.waitForTimeout(250)
  sjekk("og overskrifta brettar dei saman", (await rader.count()) === 1 && (await bolk.getAttribute("aria-expanded")) === "false", `${await rader.count()} rader`)
  await bolk.click()
  await page.waitForTimeout(250)
  sjekk("og eit trykk til brettar dei ut att", (await rader.count()) === rad0, `${await rader.count()} rader`)

  sjekk("ingen konsollfeil på gruppene", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await page.close()
}

async function flyt(browser: Browser) {
  console.log("\n=== flyten på heimskjermen (iPhone 16e)")
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  })
  const page = await ctx.newPage()
  const konsoll: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) konsoll.push(m.text())
  })
  page.on("pageerror", (e) => konsoll.push(String(e)))
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: "domcontentloaded" })
  await page.locator("[aria-label='kontrollar']").waitFor({ timeout: 30000 })
  const tSide = Date.now() - t0
  await page.waitForFunction(() => /\d+ plan/.test(document.querySelector("[aria-label='plan, delar, ark og tid']")?.textContent ?? ""), undefined, { timeout: 45000 })
  const tTal = Date.now() - t0
  sjekk("fyrste tal i lina innan fem sekund", tTal < 5000, `side ${tSide} ms, tal ${tTal} ms`)

  const meta = await page.evaluate(() => ({
    viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "",
    capable: !!document.querySelector("meta[name='apple-mobile-web-app-capable'][content=yes], meta[name='mobile-web-app-capable'][content=yes]"),
    manifest: !!document.querySelector("link[rel=manifest]"),
    ikon: !!document.querySelector("link[rel='apple-touch-icon']"),
    tema: !!document.querySelector("meta[name=theme-color]"),
  }))
  sjekk("viewport-fit=cover, so innhaldet går under statuslina med vilje", /viewport-fit=cover/.test(meta.viewport), meta.viewport)
  sjekk("sida kan ikkje forstørrast (maximum-scale=1, user-scalable=no)", /maximum-scale=1/.test(meta.viewport) && /user-scalable=no/.test(meta.viewport), meta.viewport)
  const merkbart = await page.evaluate(() => {
    const ut: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>("body, button, p, span, h3, li, textarea, label, div")) {
      if (e.getBoundingClientRect().width === 0) continue
      const st = getComputedStyle(e)
      const sel = (st as unknown as { webkitUserSelect?: string }).webkitUserSelect || st.userSelect
      if (sel !== "none") ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${sel}`)
      if (ut.length > 5) break
    }
    return ut
  })
  sjekk("ingenting kan merkjast (user-select: none overalt)", merkbart.length === 0, merkbart.join(" · "))
  const rulling = await page.evaluate(() => {
    const h = getComputedStyle(document.documentElement)
    const b = getComputedStyle(document.body)
    return { html: `${h.overflow}/${h.position}`, body: `${b.overflow}/${b.overscrollBehavior}` }
  })
  sjekk("html og body er faste og utan rulling", /hidden/.test(rulling.html) && /fixed/.test(rulling.html) && /hidden/.test(rulling.body) && /none/.test(rulling.body), JSON.stringify(rulling))
  const laust = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, input, a, canvas, [data-handtak]")]
      .filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).touchAction === "auto")
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}`)
      .slice(0, 5),
  )
  sjekk("ingen kontroll med touch-action: auto (dobbelttrykk-zoom)", laust.length === 0, laust.join(" · "))
  const pynt = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, [data-handtak], [aria-label='kontrollar']")]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ n: `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}`, st: getComputedStyle(e) }))
      .filter(({ st }) => st.boxShadow !== "none" || st.animationName !== "none" || st.filter !== "none" || st.backgroundImage !== "none")
      .map(({ n }) => n)
      .slice(0, 6),
  )
  sjekk("flate knappar: ingen skugge, glød, gradient eller animasjon", pynt.length === 0, pynt.join(" · "))
  const ordrike = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button")]
      .filter((e) => e.getBoundingClientRect().width > 0 && e.getAttribute("aria-label") !== "plan, delar, ark og tid")
      .map((e) => (e.textContent ?? "").trim())
      .filter((t) => t.split(/[\s·]+/).filter(Boolean).length > 3)
      .slice(0, 4),
  )
  sjekk("ingen knapp ber ei setning", ordrike.length === 0, ordrike.join(" | ").slice(0, 120))
  sjekk("kan lagrast på heimskjermen: capable, manifest, ikon, tema", meta.capable && meta.manifest && meta.ikon && meta.tema, JSON.stringify(meta))

  const rull = () => page.evaluate(() => ({
    h: document.documentElement.scrollHeight - window.innerHeight,
    w: document.documentElement.scrollWidth - window.innerWidth,
  }))
  const r0 = await rull()
  await bytArket(page)
  await page.waitForTimeout(400)
  const r1 = await rull()
  await opneArket(page, "kutt")
  const r2 = await rull()
  sjekk("dokumentet rullar aldri", [r0, r1, r2].every((r) => r.h <= 0 && r.w <= 0), JSON.stringify([r0, r1, r2]))
  const utanfor = await page.evaluate(() => {
    const ut: string[] = []
    const W = window.innerWidth
    for (const e of document.querySelectorAll<HTMLElement>("[aria-label='kontrollar'], [aria-label='kontrollar'] *")) {
      const r = e.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.left < -0.5 || r.right > W + 0.5) ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${Math.round(r.left)}..${Math.round(r.right)}`)
      if (ut.length > 4) break
    }
    return ut
  })
  sjekk("arket og alt i det ligg innanfor skjermen", utanfor.length === 0, utanfor.join(" · "))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await bytArket(page)
  await page.waitForTimeout(400)
  sjekk("midten er storleik og planlista, ingen reglar", (await page.locator("[aria-label='kontrollar'] button[aria-label^='fiks ']").count()) === 0 && (await page.locator("[role=listbox][aria-label='plan']").count()) === 1)

  const smaa = await page.evaluate(() => {
    const ut: string[] = []
    for (const b of document.querySelectorAll<HTMLElement>("button, [role=button], input[type=range], [data-handtak]")) {
      const r = b.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const st = getComputedStyle(b)
      if (Math.min(r.width, r.height) < 36 && !b.classList.contains("hit") && st.visibility !== "hidden") {
        ut.push(`${(b.getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 18)} ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return ut
  })
  sjekk("ingen trykkflate under 36 px utan utvida treffsone", smaa.length === 0, smaa.slice(0, 6).join(" · "))

  const smaaFelt = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input:not([type=range]):not([type=file]), textarea")]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ n: e.getAttribute("aria-label") ?? e.tagName, px: parseFloat(getComputedStyle(e).fontSize) })),
  )
  const zoomar = smaaFelt.filter((f) => f.px < 16)
  sjekk("ingen tekstfelt under 16 px (iOS zoomar inn på fokus)", zoomar.length === 0, zoomar.slice(0, 4).map((f) => `${f.n} ${f.px}px`).join(" · ") || `${smaaFelt.length} felt`)

  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  const prosa = await page.locator("text=/knip = storleik|éin finger snur|slik skjer du/i").count()
  sjekk("ingen introtekst på skjermen", prosa === 0)
  await page.touchscreen.tap(195, 300)
  const cdp = await page.context().newCDPSession(page)
  const pkt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pkt(120, 380) })
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pkt(120 + 12 * i, 380) })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(400)
  const n0 = plana(page).length
  const t1 = Date.now()
  await page.getByRole("button", { name: "skjer", exact: true }).click()
  await vent(page, talPlan(n0 + 1))
  await page.waitForFunction((n) => new RegExp(`${n} plan`).test(document.querySelector("[aria-label='plan, delar, ark og tid']")?.textContent ?? ""), n0 + 1, { timeout: 15000 })
  sjekk("skjer svarar i lina innan to sekund", Date.now() - t1 < 2000, `${Date.now() - t1} ms`)
  const eksport = page.getByRole("button", { name: "eksport", exact: true })
  sjekk("eksport ligg på lina", (await eksport.count()) === 1)
  if (await eksport.count()) {
    await eksport.click()
    await page.waitForTimeout(300)
    sjekk("og opnar uttaka med eitt trykk", (await page.getByRole("button", { name: "ark", exact: true }).count()) >= 1)
    await page.keyboard.press("Escape")
  }
  sjekk("kjelda står synleg med namn, eitt trykk frå å byte", (await page.locator("button[data-kjelde]").first().isVisible()))

  sjekk("ingen konsollfeil i flyten", konsoll.length === 0, konsoll.join(" | ").slice(0, 200))
  await ctx.close()
}

async function mork(browser: Browser) {
  console.log("\n=== mørkt (systemet står mørkt)")
  const side = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "dark" })
  const konsoll: string[] = []
  side.on("pageerror", (e) => konsoll.push(String(e)))
  await side.goto(URL, { waitUntil: "networkidle" })
  await roleg(side, 800)
  const token = await side.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return {
      paper: s.getPropertyValue("--paper").trim(),
      ink: s.getPropertyValue("--ink").trim(),
      body: getComputedStyle(document.body).backgroundColor,
      skjema: s.colorScheme,
    }
  })
  const hex = (v: string) => v.replace(/^#([0-9a-f])\1?([0-9a-f])\2?([0-9a-f])\3?$/i, "#$1$1$2$2$3$3").toLowerCase()
  sjekk("papiret er svart og blekket kvitt", hex(token.paper) === "#000000" && hex(token.ink) === "#ffffff", JSON.stringify(token))
  sjekk("og sida er svart, ikkje mørkegrå", token.body === "rgb(0, 0, 0)", token.body)
  sjekk("color-scheme seier frå til nettlesaren", /dark/.test(token.skjema), token.skjema)
  const graa = await side.evaluate(() => {
    const ut: string[] = []
    for (const e of document.querySelectorAll<HTMLElement>("header, [aria-label='kontrollar'], section[aria-label='verkty'], .tumme button, [data-kjelde], [data-heim]")) {
      const bg = getComputedStyle(e).backgroundColor
      const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(bg)
      if (!m) continue
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
      const kant = (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
      if (!kant && !/rgba\(0, 0, 0, 0\)/.test(bg)) ut.push(`${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""} ${bg}`)
    }
    return ut
  })
  sjekk("ingen flate er ein gråtone", graa.length === 0, graa.slice(0, 4).join(" · "))
  const lerret = await side.evaluate(() => {
    const c = document.querySelector("canvas")
    if (!c) return "ikkje noko lerret"
    const g = c.getContext("webgl2") ?? c.getContext("webgl")
    if (!g) return "ingen kontekst"
    const px = new Uint8Array(4)
    ;(g as WebGLRenderingContext).readPixels(4, 4, 1, 1, 5121 /* UNSIGNED_BYTE */, 6408 /* RGBA */, px)
    return `${px[0]},${px[1]},${px[2]}`
  })
  sjekk("lerretet er svart i hjørnet", lerret === "0,0,0" || lerret === "ikkje noko lerret", lerret)
  sjekk("ingen konsollfeil i mørkt", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await side.close()
}

async function reglar(browser: Browser) {
  console.log("\n=== reglane utan ei rad")
  const bag = { plan: "1@0.2,0.5,0.5/1,0,0;2@0.8,0.5,0.5/1,0,0;3@0.5,0.2,0.5/0,1,0;4@0.5,0.8,0.5/0,1,0;5@0.5,0.5,0.25/0,0,1", klaring: 0 }
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify(bag)), browser, 390, 844)
  await bytArket(page)
  await page.waitForTimeout(400)
  await opneArket(page, "sjekk")
  await roleg(page, 600)
  const tavla = page.locator("[aria-label='kontrollar'] dl").first()
  const tekst = (await tavla.innerText()).replace(/\s+/g, " ")
  sjekk("den harde regelen utan ei rad står i tavla", /kan monterast/.test(tekst), tekst.slice(-90))
  sjekk("og den mjuke òg", /klaring/.test(tekst))

  const mfane = page.getByRole("tab", { name: "montasje", exact: true })
  sjekk("og montasjefana er slegen av medan det ikkje går i hop", await mfane.isDisabled(), (await mfane.getAttribute("title")) ?? "")
  await page.keyboard.press("4")
  await roleg(page, 300)
  sjekk("og tasten hans opnar henne ikkje", (await mfane.getAttribute("aria-selected")) === "false")
  await page.keyboard.press("m")
  await roleg(page, 300)
  sjekk("og M heller ikkje", (await mfane.getAttribute("aria-selected")) === "false")
  const bytt = page.locator("button[aria-label^='fiks kan monterast']")
  sjekk("og han ber rådet sitt", (await bytt.count()) === 1)
  const planFør = hash(page).plan
  if (await bytt.count()) {
    await bytt.click()
    await vent(page, (p) => p.plan !== planFør)
    await roleg(page, 400)
    sjekk("og rådet tek brotet bort", !/kan monterast/.test((await tavla.innerText()).replace(/\s+/g, " ")), hash(page).plan.slice(0, 40))
  }
  {
    const to = { plan: skrivPlan(rutenett(3, 3)), storleik: 1200, arkB: 300, arkH: 200, tjukn: 1, snitt: 6 }
    await page.goto(URL + "#p=" + encodeURIComponent(JSON.stringify(to)), { waitUntil: "networkidle" })
    await page.reload({ waitUntil: "networkidle" })
    await roleg(page, 900)
    await bytArket(page)
    await page.waitForTimeout(400)
    await opneArket(page, "sjekk")
    await roleg(page, 700)
    const knapp = page.locator("[data-fiksalle]")
    await vent2(page, async () => (await knapp.count()) > 0, 8000)
    sjekk("fleire brot gjev éin «fiks alt»-knapp", (await knapp.count()) === 1, ((await knapp.first().textContent()) ?? "").trim())
    const foer = hash(page)
    await knapp.first().click()
    await vent(page, (q) => q.storleik !== foer.storleik || q.snitt !== foer.snitt)
    await roleg(page, 900)
    const tav = (await page.locator("[aria-label='kontrollar'] dl").first().innerText()).replace(/\s+/g, " ")
    sjekk("og eitt trykk tek dei", !/delane får plass|snittet et/i.test(tav), `storleik ${foer.storleik} → ${hash(page).storleik}, snitt ${foer.snitt} → ${hash(page).snitt}`)
    await page.keyboard.press("z")
    await vent(page, (q) => q.storleik === foer.storleik)
    sjekk("og eitt steg i angre tek heile kjeda", hash(page).storleik === foer.storleik && hash(page).snitt === foer.snitt, `${hash(page).storleik} / ${hash(page).snitt}`)
  }

  sjekk("ingen konsollfeil i reglane", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function symmetri(browser: Browser) {
  console.log("\n=== symmetrien på snittet")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const speil = (ord: string) => page.locator(`[data-speil='${ord}']`)
  sjekk("tre brytarar står over skjer", (await speil("x").count()) === 1 && (await speil("y").count()) === 1 && (await speil("z").count()) === 1)
  sjekk("og dei står av", (await speil("x").getAttribute("aria-pressed")) === "false")
  await toFingrar(page, (t) => [[150 + 80 * t, 330], [150 + 80 * t, 430]])
  await page.waitForTimeout(300)
  await speil("x").click()
  await page.waitForTimeout(200)
  sjekk("brytaren lyser", (await speil("x").getAttribute("aria-pressed")) === "true")
  const n0 = plana(page).length
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 2))
  const nye = plana(page).slice(-2)
  sjekk("eitt trykk på skjer låser TO plan", plana(page).length === n0 + 2, `${plana(page).length} plan`)
  const spegla = nye.length === 2 && Math.abs(nye[0].o[0] + nye[1].o[0] - 1) < 0.01 && Math.abs(nye[0].n[0] + nye[1].n[0]) < 0.01
  sjekk("og dei ligg spegelvendt om ein halv", spegla, nye.map((q) => `o ${q.o[0].toFixed(3)} n ${q.n[0].toFixed(3)}`).join("  ·  "))
  sjekk("med kvart sitt namn", nye.length === 2 && nye[0].id !== nye[1].id, nye.map((q) => q.id).join(" og "))
  await speil("x").click()
  await page.waitForTimeout(200)
  await page.keyboard.press("l")
  await vent(page, talPlan(n0 + 3))
  sjekk("og med brytaren av er skjer eitt plan att", plana(page).length === n0 + 3, `${plana(page).length} plan`)
  sjekk("ingen konsollfeil i symmetrien", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function uttaka(browser: Browser) {
  console.log("\n=== uttaksboksen")
  const plan = skrivPlan(rutenett(3, 3))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan })), browser, 390, 844)
  await vent(page, talPlan(6))
  const knapp = page.getByRole("button", { name: "eksport", exact: true })
  await knapp.click()
  await roleg(page, 600)
  const boks = page.locator("section[aria-label='uttak']")
  const fana = page.getByRole("tab", { name: "sjekk", exact: true })
  sjekk("trykk på uttak opnar sjekkfana med uttaka i", (await boks.count()) === 1 && (await boks.isVisible()) && (await fana.getAttribute("aria-selected")) === "true")
  const bolkar = await page.locator("[data-bolk]").evaluateAll((e) => e.map((q) => q.getAttribute("data-bolk")))
  sjekk("og han står i tre bolkar, med plata fyrst", bolkar.join(" ") === "plate rom alt", bolkar.join(" "))
  const brikker = UTTAK.reduce((n, g) => n + g.filer.length, 0)
  const namn = await page.locator("[data-bolk] button").evaluateAll((e) => e.map((q) => q.textContent?.trim() ?? ""))
  sjekk(`${brikker} brikker, med flat og 3mf mellom dei`, namn.length === brikker && namn.includes("flat") && namn.includes("3mf"), namn.join(" "))
  const daarlege = await page.evaluate(() => {
    const ut: string[] = []
    for (const b of document.querySelectorAll("[data-bolk] button")) {
      b.scrollIntoView({ block: "center" })
      const r = b.getBoundingClientRect()
      const ord = b.textContent?.trim() ?? "?"
      if (!r.width || !r.height) {
        ut.push(`${ord}: inga rute`)
        continue
      }
      const paa = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      if (!paa || !(b === paa || b.contains(paa))) ut.push(`${ord}: ${paa?.tagName.toLowerCase() ?? "ingen"} ligg over`)
    }
    return ut
  })
  sjekk("og KVAR brikke ligg øvst der ho står — ingen er klipt eller dekt", daarlege.length === 0, daarlege.join(" · "))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  sjekk("escape lukkar arket til lina att", (await boks.count()) === 0)
  sjekk("eit rutenett utan brot ber ikkje varselet", (await page.locator("[data-uttakvarsel]").count()) === 0)
  await page.goto(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,1,0;3@0.5,0.5,0.5/0,0,1" })), { waitUntil: "networkidle" })
  await page.reload({ waitUntil: "networkidle" })
  await roleg(page, 900)
  await page.getByRole("button", { name: "eksport", exact: true }).click()
  await page.waitForTimeout(300)
  await vent2(page, async () => (await page.locator("[data-uttakvarsel]").count()) > 0, 8000)
  const varseltekst = ((await page.locator("[data-uttakvarsel]").first().textContent()) ?? "").trim()
  sjekk("ein umogeleg montasje varslar på uttaket", /går ikkje i hop/.test(varseltekst), varseltekst)
  const merkte = await page.locator("[data-bolk] button[data-varsel]").count()
  sjekk("og brikkene ber merket", merkte > 0, `${merkte} brikker`)

  sjekk("ingen konsollfeil i uttaka", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function taket(browser: Browser) {
  console.log("\n=== taket på plana")
  const fullt = skrivPlan(rutenett(32, 32))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan: fullt })), browser, 390, 844)
  sjekk("lenkja ber taket", plana(page).length === 64, `${plana(page).length} plan`)
  const skjer = page.getByRole("button", { name: "skjer", exact: true })
  await skjer.click()
  await page.waitForTimeout(900)
  sjekk("skjer legg ikkje eit plan nummer 65", plana(page).length === 64, `${plana(page).length} plan`)
  sjekk("og lina seier kvifor", /taket er 64 plan/.test(await lina(page)), await lina(page))
  sjekk("ingen konsollfeil ved taket", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function handtaka(browser: Browser) {
  console.log("\n=== handtaka på spor-endane")
  const plan = skrivPlan(rutenett(2, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan })), browser, 390, 844)
  await page.getByRole("tab", { name: "kontur", exact: true }).click()
  const flata = page.locator("section[aria-label='plateflata']")
  await flata.waitFor({ timeout: 10000 })
  await roleg(page, 900)
  const handtak = flata.locator("g[data-spor]")
  sjekk("ingen handtak før du har peikt på ein del", (await handtak.count()) === 0)

  const band = page.locator("[data-arkband]")
  const foerH = (await band.boundingBox())?.height ?? 0
  await flata.locator("g[data-del]").first().click()
  await roleg(page, 600)
  const etterH = (await band.boundingBox())?.height ?? 0
  sjekk("og bandet over plata står like høgt når ein del vert vald", foerH > 0 && Math.abs(etterH - foerH) < 1, `${foerH.toFixed(0)} → ${etterH.toFixed(0)} px`)
  sjekk("og lina seier kva du valde", /\d/.test((await page.locator("[data-arklesing]").innerText()) || ""), await page.locator("[data-arklesing]").innerText())
  const n = await handtak.count()
  sjekk("den valde delen har eitt handtak per ledd", n > 0, `${n} handtak`)
  if (n > 0) {
    const spor = handtak.first()
    const bane = await spor.locator("polyline").boundingBox()
    const prikk = await spor.locator("circle").last().boundingBox()
    if (bane && prikk) {
      const cx = prikk.x + prikk.width / 2
      const cy = prikk.y + prikk.height / 2
      const loddrett = bane.height > bane.width
      const steg = Math.max(24, Math.round((loddrett ? bane.height : bane.width) * 0.25))
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(loddrett ? cx : cx + steg, loddrett ? cy + steg : cy, { steps: 10 })
      await page.mouse.up()
      await vent(page, (p) => !!p.deling)
      const d = String(hash(page).deling ?? "")
      const t = Number(d.split(":")[1])
      sjekk("eit drag på handtaket skriv delinga på det leddet", /^\d+-\d+-\d+:[\d.]+$/.test(d), d)
      sjekk("og brøken er ikkje midt på lenger", Number.isFinite(t) && Math.abs(t - 0.5) > 0.03, String(t))
      sjekk("og delen vart ikkje dregen med", !hash(page).fest, String(hash(page).fest ?? ""))
      await page.getByRole("button", { name: "jamt", exact: true }).click()
      await vent(page, (p) => !p.deling)
      sjekk("og «jamt» tek delinga bort att", !hash(page).deling)
    }
  }

  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await roleg(page, 800)
  const prikk = page.locator("[data-spor]")
  sjekk("ingen prikkar i rommet utan eit plan valt", (await prikk.count()) === 0)
  await midt(page)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await roleg(page, 900)
  const nr = await prikk.count()
  sjekk("det valde planet har ein prikk per ledd i rommet", nr > 0, `${nr} prikkar`)
  const pb = await prikk.first().boundingBox()
  if (pb) {
    const kamera = async () => (await page.locator(".handtak").getAttribute("data-kamera")) ?? "?"
    const kFyrr = await kamera()
    const cx = pb.x + pb.width / 2
    const cy = pb.y + pb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 26, cy + 26, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => !!p.deling)
    const d3 = String(hash(page).deling ?? "")
    sjekk("eit drag i rommet skriv den same delinga", /^\d+-\d+-\d+:[\d.]+$/.test(d3), d3)
    sjekk("og synet stod stille medan du drog", (await kamera()) === kFyrr, `${kFyrr} → ${await kamera()}`)
  }

  sjekk("ingen konsollfeil på handtaka", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function skaletOgSovnen(browser: Browser) {
  console.log("\n=== skalet og søvnen")
  const plan = skrivPlan(rutenett(3, 2))
  const adressa = URL + "#p=" + encodeURIComponent(JSON.stringify({ plan }))
  const { page, konsoll } = await opne(adressa, browser, 390, 844, { sov: true })
  const lerret = { x: 20, y: 240, width: 350, height: 380 }
  const stille = async (n = 10) => {
    await page.mouse.move(190, 700)
    let fyrr = await page.screenshot({ clip: lerret })
    for (let i = 0; i < n; i++) {
      await page.mouse.move(190 + (i % 2), 700)
      await page.waitForTimeout(320)
      const naa = await page.screenshot({ clip: lerret })
      if (naa.equals(fyrr)) return naa
      fyrr = naa
    }
    return fyrr
  }
  const skalKnapp = page.getByRole("button", { name: "skalet", exact: true })
  sjekk("skalet har ein brytar i «lag»", (await skalKnapp.count()) === 1)
  sjekk("og han står på", (await skalKnapp.getAttribute("aria-pressed")) === "true")
  const med = await stille()
  await skalKnapp.click()
  await vent(page, (p) => (p as unknown as { skal?: boolean }).skal === false)
  const utan = await stille()
  sjekk("brytaren tek det gjennomsiktige omrisset bort", !med.equals(utan), `${med.length} B → ${utan.length} B`)
  sjekk("og lenkja ber synet", (hash(page) as unknown as { skal?: boolean }).skal === false, JSON.stringify((hash(page) as unknown as { skal?: boolean }).skal))
  await skalKnapp.click()
  await vent(page, (p) => (p as unknown as { skal?: boolean }).skal !== false)
  const att = await stille()
  sjekk("og eit trykk til set det attende", med.equals(att))
  await page.getByRole("tab", { name: "flate", exact: true }).click()
  await roleg(page, 700)
  sjekk("i «flate» finst brytaren ikkje", (await skalKnapp.count()) === 0)
  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await roleg(page, 700)

  const gjennomsikt = async () => page.evaluate(`(() => {
    var ut = {}
    ;[["topp", "header"], ["tumme", ".tumme"], ["synskube", ".synskube"], ["ark", "[aria-label='kontrollar']"]].forEach(function (p) {
      var e = document.querySelector(p[1])
      ut[p[0]] = e ? Number(getComputedStyle(e).opacity) : -1
    })
    ut.peik = document.querySelector(".tumme") ? getComputedStyle(document.querySelector(".tumme")).pointerEvents : "?"
    ut.sov = document.querySelector("main").hasAttribute("data-sov")
    return ut
  })()`) as Promise<Record<string, number | string | boolean>>
  await page.mouse.move(190, 700)
  await page.waitForTimeout(600)
  const vaken = await gjennomsikt()
  sjekk("grensesnittet står framme medan ein finger er på", vaken.sov === false && vaken.topp === 1 && vaken.tumme === 1, JSON.stringify(vaken))
  await page.waitForTimeout(3200)
  const sovande = await gjennomsikt()
  sjekk("og fell bort etter to sekund utan ein finger", sovande.sov === true && sovande.topp === 0 && sovande.tumme === 0 && sovande.ark === 0 && sovande.synskube === 0, JSON.stringify(sovande))
  sjekk("og regelen står skriven på spalta", sovande.peik === "none", String(sovande.peik))
  await page.mouse.move(190, 700)
  await page.waitForTimeout(400)
  const attende = await gjennomsikt()
  sjekk("ei rørsle hentar det att", attende.sov === false && attende.topp === 1, JSON.stringify(attende))

  const doed = async (namn: string, veljar: string) => {
    await page.evaluate(`new Promise(function (res) {
      var r = indexedDB.deleteDatabase("slicer")
      r.onsuccess = r.onerror = r.onblocked = function () { res(null) }
    })`)
    await page.goto(adressa, { waitUntil: "networkidle" })
    await page.reload({ waitUntil: "networkidle" })
    await roleg(page, 800)
    await page.mouse.move(190, 700)
    await roleg(page, 300)
    const boks = await page.locator(veljar).first().boundingBox()
    if (!boks) return sjekk(`${namn} står å trykkje på`, false)
    await page.evaluate(`(() => {
      window.__traff = false
      document.querySelector(${JSON.stringify(veljar)}).addEventListener("click", function () { window.__traff = true }, { capture: true })
    })()`)
    const foer = hash(page).plan ?? ""
    await page.waitForTimeout(3200)
    const sov = await page.evaluate(`document.querySelector("main").hasAttribute("data-sov")`)
    await page.touchscreen.tap(Math.round(boks.x + boks.width / 2), Math.round(boks.y + boks.height / 2))
    await page.waitForTimeout(1000)
    const traff = await page.evaluate(`window.__traff`)
    const lik = (hash(page).plan ?? "") === foer
    sjekk(`eit trykk på ${namn} medan det søv gjer ingenting`, sov === true && traff === false && lik, `sov=${sov} klikk=${traff}${lik ? "" : " · POSEN ENDRA SEG"}`)
  }
  await doed("skjer", ".tumme .skjer")
  await doed("ein reiskap i spalta", ".tumme button:not(.skjer)")
  await doed("synskuben", ".synskube button")

  await page.mouse.move(190, 700)
  await bytArket(page)
  await page.waitForTimeout(500)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await page.waitForTimeout(400)
  await bytArket(page)
  await roleg(page, 600)
  await page.waitForTimeout(3200)
  const valt = await gjennomsikt()
  sjekk("med eit plan valt søv det ikkje", valt.sov === false && valt.tumme === 1, JSON.stringify(valt))

  await page.evaluate(`new Promise(function (res) {
    var r = indexedDB.deleteDatabase("slicer")
    r.onsuccess = r.onerror = r.onblocked = function () { res(null) }
  })`)
  await page.goto(adressa, { waitUntil: "networkidle" })
  await page.reload({ waitUntil: "networkidle" })
  await roleg(page, 800)
  await page.getByRole("tab", { name: "montasje", exact: true }).click()
  await vent2(page, async () => (await page.locator("[data-lesing] .tab").first().count()) > 0, 10000)
  await page.mouse.move(190, 700)
  await page.waitForTimeout(3600)
  const imont = await page.evaluate(`document.querySelector("main").hasAttribute("data-sov")`)
  sjekk("montasjen kviler ikkje — han er eit bilete i rørsle", imont === false, `sov=${imont}`)

  sjekk("ingen konsollfeil kring skalet og søvnen", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function andreFingeren(browser: Browser) {
  console.log("\n=== den andre fingeren")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const h = await page.locator("[data-handtak='flytt']").boundingBox()
  const k = await page.getByRole("button", { name: "skjer", exact: true }).boundingBox()
  sjekk("handtaket og skjer står begge på skjermen", !!h && !!k)
  if (h && k) {
    const cdp = await page.context().newCDPSession(page)
    const pt = (x: number, y: number, id: number) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 })
    const hx = h.x + h.width / 2
    const hy = h.y + h.height / 2
    const kx = k.x + k.width / 2
    const ky = k.y + k.height / 2
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(hx, hy, 0)] })
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(hx + 4 * i, hy, 0)] })
      await page.waitForTimeout(20)
    }
    const foer = plana(page).length
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(hx + 32, hy, 0), pt(kx, ky, 1)] })
    await page.waitForTimeout(80)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await cdp.detach()
    await vent(page, (p) => lesPlan(p.plan).length === foer + 1)
    sjekk("finger to skjer medan finger éin held handtaket", plana(page).length === foer + 1, `${foer} → ${plana(page).length} plan`)
    sjekk("og berre eitt plan, ikkje to", plana(page).length === foer + 1, `${plana(page).length} plan`)
  }
  sjekk("ingen konsollfeil på den andre fingeren", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function boyen(browser: Browser) {
  console.log("\n=== bøyen")
  const plan = skrivPlan(rutenett(3, 0))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 300, tjukn: 6, material: "finer" })), browser, 390, 844)
  await midt(page)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await roleg(page, 600)
  const knapp = page.locator("[data-boy]")
  sjekk("eit valt plan har ein bøyeknapp", (await knapp.count()) === 1)
  const b = await knapp.boundingBox()
  const bogAv = (i = 0) => lesPlan(hash(page).plan)[i]?.bog ?? 0
  sjekk("og planet er flatt til nokon dreg i han", bogAv() === 0, String(bogAv()))
  if (b) {
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 120, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan)[0]?.bog ?? 0) > 0)
    const opp = bogAv()
    sjekk("eit drag opp bøyer planet", opp > 0.2, `bog ${opp}`)
    sjekk("og dei andre plana står flate", lesPlan(hash(page).plan).slice(1).every((q) => q.bog === 0))
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 260, { steps: 20 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan)[0]?.bog ?? 0) < 0)
    sjekk("og eit drag ned bøyer han andre vegen", bogAv() < 0, `bog ${bogAv()}`)
    await midt(page)
    const opne = page.getByRole("button", { name: /^(alle|opne) kontrollane$/ })
    if (await opne.count()) await opne.first().click()
    await roleg(page, 900)
    const tekst = (await page.locator("[aria-label='kontrollar']").innerText()).replace(/\s+/g, " ")
    sjekk("bøyeradien står i tavla", /bøyeradius/i.test(tekst), (tekst.match(/[Bb][Øø]YERADIUS[^·]{0,44}/i) ?? [""])[0])
    const b2 = await knapp.boundingBox()
    if (b2) {
      const tx = b2.x + b2.width / 2
      const ty = b2.y + b2.height / 2
      await page.mouse.click(tx, ty)
      await page.waitForTimeout(DOBBELT + 80)
      sjekk("eitt trykk rører ikkje bøyen", bogAv() < 0, `bog ${bogAv()}`)
      await page.mouse.dblclick(tx, ty)
      await vent(page, (p) => !(lesPlan(p.plan)[0]?.bog ?? 0))
      sjekk("men eit dobbelttrykk rettar planet ut att", bogAv() === 0, `bog ${bogAv()}`)
    }
  }

  const spalta = await page.evaluate(`(function () {
    function bb(e) { return e.getBoundingClientRect() }
    var h = document.querySelector("header") ? bb(document.querySelector("header")).bottom : 0
    var kube = document.querySelector(".synskube")
    var k = kube ? bb(kube) : null
    var alle = document.querySelectorAll(".tumme button")
    var ute = []
    var over = []
    var smaa = []
    for (var i = 0; i < alle.length; i++) {
      var r = bb(alle[i])
      var namn = alle[i].getAttribute("aria-label")
      if (r.width === 0 || r.height === 0) continue
      if (r.top < h - 1 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1) ute.push(namn + " " + Math.round(r.top) + ".." + Math.round(r.bottom))
      if (k && r.top < k.bottom && r.bottom > k.top && r.left < k.right && r.right > k.left) over.push(namn)
      if (Math.min(r.width, r.height) < 44) smaa.push(namn + " " + Math.round(r.height))
    }
    var heim = document.querySelector("[data-heim]")
    var tek = "-"
    if (heim) {
      var q = bb(heim)
      var e = document.elementFromPoint((q.left + q.right) / 2, (q.top + q.bottom) / 2)
      tek = e ? (e.closest("[data-heim]") ? "innramminga" : (e.getAttribute("aria-label") || e.tagName)) : "-"
    }
    return { ute: ute, over: over, smaa: smaa, n: alle.length, topp: Math.round(h), H: innerHeight, tek: tek }
  })()`) as { ute: string[]; over: string[]; smaa: string[]; n: number; topp: number; H: number; tek: string }
  sjekk(
    "og heile tommelspalta står på skjermen, under topplina",
    spalta.ute.length === 0 && spalta.n >= 7,
    `${spalta.n} knappar mellom ${spalta.topp} og ${spalta.H} px${spalta.ute.length ? " · " + spalta.ute.slice(0, 3).join(" · ") : ""}`,
  )
  sjekk("og ingen av dei legg seg over synskuben", spalta.over.length === 0, spalta.over.slice(0, 3).join(" · "))
  sjekk("so innrammingsknappen tek sitt eige trykk", spalta.tek === "innramminga", spalta.tek)
  sjekk("og ingen reiskap er klemt under 44 px", spalta.smaa.length === 0, spalta.smaa.slice(0, 3).join(" · "))

  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await midt(page)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]").first().locator("button").first().click()
  await roleg(page, 500)
  const mjuk = page.locator("[aria-label='mjuk, tal']")
  sjekk("eit valt plan har mjukinga i arket og forma i spalta", (await mjuk.count()) === 1 && (await page.locator("[data-form]").count()) === 1)
  const dra = async (dx: number) => {
    const mb = await mjuk.boundingBox()
    if (!mb) return
    const y = mb.y + mb.height / 2
    await page.mouse.move(mb.x + mb.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(mb.x + mb.width / 2 + dx, y, { steps: 12 })
    await page.mouse.up()
  }
  await dra(60)
  await vent(page, (p) => (lesPlan(p.plan)[0]?.mjuk ?? 0) > 0)
  const m0 = lesPlan(hash(page).plan)[0]?.mjuk ?? 0
  sjekk("eit drag mjukar kanten", m0 > 0 && m0 <= 0.02, `mjuk ${m0}`)
  sjekk("og dei andre plana står skarpe", lesPlan(hash(page).plan).slice(1).every((q) => !q.mjuk))
  await dra(-160)
  await vent(page, (p) => !(lesPlan(p.plan)[0]?.mjuk ?? 0))
  sjekk("og eit drag attende tek henne heilt bort", !(lesPlan(hash(page).plan)[0]?.mjuk ?? 0), hash(page).plan.slice(0, 44))

  sjekk("ingen konsollfeil på bøyen", konsoll.length === 0, konsoll.join(" | ").slice(0, 160))
  await page.close()
}

async function snappet(browser: Browser) {
  console.log("\n=== snappet i omrisset")
  const plan = skrivPlan(rutenett(2, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 150 })), browser, 390, 844)
  const h = await page.locator("header").boundingBox()
  const v = page.viewportSize()!
  await page.touchscreen.tap(v.width - 38, (h?.height ?? 44) + 38)
  await roleg(page, 1400)
  await midt(page)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan='3'] button").first().click()
  await roleg(page, 600)
  await bytArket(page)
  await roleg(page, 400)
  const form = page.locator("[data-form]")
  await page.waitForTimeout(DOBBELT + 80)
  await form.dblclick()
  await vent(page, (q) => (lesPlan(q.plan).find((x) => x.id === 3)?.omriss?.length ?? 0) === 4)
  await roleg(page, 600)
  sjekk("boksen står med fire hjørne", (await page.locator("[data-punkt]").count()) === 4, `${await page.locator("[data-punkt]").count()} punkt`)

  const om3 = () => lesPlan(hash(page).plan).find((q) => q.id === 3)
  const runde = () => (om3()?.runde ?? []).length
  const spor: string[] = [`${om3()?.omriss?.length ?? 0}`]
  for (const venta of [3, 6, 4]) {
    await page.waitForTimeout(DOBBELT + 80)
    await form.dblclick()
    await vent(page, (q) => (lesPlan(q.plan).find((x) => x.id === 3)?.omriss?.length ?? 0) === venta, 8000)
    await roleg(page, 400)
    spor.push(`${om3()?.omriss?.length ?? 0}`)
  }
  sjekk("kvart dobbelttrykk stemplar den neste forma", spor.join(" → ") === "4 → 3 → 6 → 4", spor.join(" → "))
  sjekk("og sirkelen er fire punkt med boge på alle fire", runde() === 4, `${runde()} bogar`)
  await page.waitForTimeout(DOBBELT + 80)
  await form.dblclick()
  await vent(page, (q) => (lesPlan(q.plan).find((x) => x.id === 3)?.omriss?.length ?? 0) === 4, 8000)
  await roleg(page, 500)
  sjekk("og ein runde til er firkanten att", (om3()?.runde ?? []).length === 0, `${runde()} bogar`)

  const sknapp = page.locator("[data-snapp]")
  const runda: string[] = []
  for (let i = 0; i < 4; i++) {
    runda.push(`${(await sknapp.getAttribute("data-snapp")) ?? "?"}:${(await sknapp.innerText()).trim()}`)
    await sknapp.click()
    await roleg(page, 300)
  }
  sjekk("snappknappen går runden: 90, av, 15, 45", runda.join(" ") === "90:90° 0:av 15:15° 45:45°", runda.join(" "))
  sjekk("og talet står i lenkja", String(hash(page).snapp) === "3", `snapp=${hash(page).snapp}`)

  const pkt = async (i: number) => {
    const b = await page.locator(`[data-punkt='${i}']`).first().boundingBox().catch(() => null)
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null
  }
  const tal = () => page.locator("[data-punkt]").count()
  await page.mouse.move(200, 450)
  await roleg(page, 400)
  const synleg: number[] = []
  for (let i = 0; i < 4; i++) if (await pkt(i)) synleg.push(i)
  const iA = synleg.find((i) => synleg.includes((i + 1) % 4)) ?? -1
  const iB = (iA + 1) % 4
  const a = iA >= 0 ? await pkt(iA) : null
  const b = iA >= 0 ? await pkt(iB) : null
  sjekk("to nabohjørne er å ta i", !!a && !!b, a && b ? `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px mellom dei` : "fann dei ikkje")
  if (a && b) {
    const midtveges = { x: a.x + (b.x - a.x) * 0.45, y: a.y + (b.y - a.y) * 0.45 }
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(midtveges.x, midtveges.y, { steps: 10 })
    await page.mouse.up()
    await roleg(page, 500)
    sjekk("eit drag som stoggar eit stykke unna tek ikkje hjørnet", (await tal()) === 4, `${await tal()} punkt att`)

    const c = await pkt(iA)
    const d = await pkt(iB)
    sjekk("og hjørna står framleis etter det draget", !!c && !!d)
    if (c && d) {
      await page.mouse.move(c.x, c.y)
      await page.mouse.down()
      await page.mouse.move(d.x, d.y, { steps: 12 })
      await page.mouse.up()
      await roleg(page, 600)
      sjekk("men lagd OPPÅ nabohjørnet vert dei eitt", (await tal()) === 3, `${await tal()} punkt att`)
    }
  }
  sjekk("ingen konsollfeil i snappet", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function forma(browser: Browser) {
  console.log("\n=== forma")
  const plan = skrivPlan(rutenett(2, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ plan, storleik: 150 })), browser, 390, 844)
  const om = (id: number) => lesPlan(hash(page).plan).find((q) => q.id === id)?.omriss ?? []
  const h = await page.locator("header").boundingBox()
  const v = page.viewportSize()!
  await page.touchscreen.tap(v.width - 38, (h?.height ?? 44) + 38)
  await roleg(page, 1400)

  await midt(page)
  await utbrett(page)
  await page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan='3'] button").first().click()
  await roleg(page, 600)
  await bytArket(page)
  await roleg(page, 400)
  const form = page.locator("[data-form]")
  const synlege = async (vel: string) => {
    let n = 0
    for (const e of await page.locator(vel).all()) if (await e.isVisible()) n++
    return n
  }
  sjekk("eit valt plan har forma i spalta", (await form.count()) === 1)
  sjekk("og ho står i ro til nokon trykkjer", (await form.getAttribute("aria-pressed")) === "false" && (await page.locator("[data-punkt]").count()) === 0)

  await form.click()
  await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) >= 3)
  const frose = om(3)
  sjekk(
    "eit trykk frys profilen til punkt",
    frose.length >= 3 && frose.length <= OMRISS_TAK && frose.every((q) => Math.abs(q[0]) <= 1.5 && Math.abs(q[1]) <= 1.5),
    `${frose.length} punkt av ${OMRISS_TAK}`,
  )
  sjekk("og berre DET planet fekk ei form", lesPlan(hash(page).plan).filter((q) => q.omriss?.length).length === 1, hash(page).plan.slice(0, 40))
  sjekk("merket på knappen fylgjer forma", (await form.getAttribute("aria-pressed")) === "true")
  const n = await page.locator("[data-punkt]").count()
  sjekk("og kvart punkt står som eit handtak i rommet", n === frose.length, `${n} handtak av ${frose.length} punkt`)
  const midtFrose = await synlege("[data-midt]")
  sjekk("og midtmerka står berre der kanten har plass til eitt", midtFrose > 0 && midtFrose < frose.length, `${midtFrose} merke på ${frose.length} kantar`)

  const boksar = []
  for (let i = 0; i < n; i++) boksar.push(await page.locator(`[data-punkt='${i}']`).boundingBox())
  const xs = boksar.map((b) => b?.x ?? 0)
  const ys = boksar.map((b) => b?.y ?? 0)
  const bredd = Math.max(...xs) - Math.min(...xs)
  const hogd = Math.max(...ys) - Math.min(...ys)
  sjekk("handtaka står som profilen står, og ikkje på ei line", bredd > 40 && hogd > 40, `${bredd.toFixed(0)} × ${hogd.toFixed(0)} px`)

  const bb = boksar[0]
  if (bb) {
    const cx = bb.x + bb.width / 2
    const cy = bb.y + bb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 46, cy - 34, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => {
      const o = lesPlan(p.plan).find((q) => q.id === 3)?.omriss ?? []
      return o.some((q, i) => !frose[i] || q[0] !== frose[i][0] || q[1] !== frose[i][1])
    })
    const drege = om(3)
    const i = drege.findIndex((q, k) => !frose[k] || q[0] !== frose[k][0] || q[1] !== frose[k][1])
    const rort = drege.filter((q, k) => !frose[k] || q[0] !== frose[k][0] || q[1] !== frose[k][1])
    sjekk("eit drag i eit punkt flyttar NØYAKTIG det punktet", rort.length === 1 && drege.length === frose.length, `${rort.length} av ${drege.length} punkt rørte`)
    const etterBb = await page.locator(`[data-punkt='${i}']`).boundingBox()
    if (i >= 0 && etterBb) {
      const av = Math.hypot(etterBb.x + etterBb.width / 2 - (cx + 46), etterBb.y + etterBb.height / 2 - (cy - 34))
      sjekk("og merket endar under fingeren", av < 6, `${av.toFixed(1)} px frå der fingeren slapp`)
    }
  }

  await page.waitForTimeout(DOBBELT + 80)
  await form.dblclick()
  await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) === 4)
  const boks = om(3)
  const bx = [...new Set(boks.map((q) => q[0]))]
  const by = [...new Set(boks.map((q) => q[1]))]
  sjekk("eit dobbelttrykk gjer forma til boksen kring henne", boks.length === 4 && bx.length === 2 && by.length === 2, boks.map((q) => q.join(",")).join(" · "))
  sjekk("og hjørna er handtak som alle andre punkt", (await page.locator("[data-punkt]").count()) === 4)

  const midtBoks = await synlege("[data-midt]")
  sjekk("boksen har midtmerke å ta i", midtBoks >= 2, `${midtBoks} av 4 kantar`)

  const utanfor = async () => {
    const feil: string[] = []
    for (const e of await page.locator("[data-punkt], [data-midt]").all()) {
      if (!(await e.isVisible())) continue
      const bb = await e.boundingBox()
      if (!bb) continue
      const kva = await page.evaluate(([x, y]) => {
        const t = document.elementFromPoint(x, y) as HTMLElement | null
        return t?.closest("[data-punkt],[data-midt]") ? "" : `${t?.tagName ?? "-"}.${(t?.className || "-").split(" ")[0]}`
      }, [bb.x + bb.width / 2, bb.y + bb.height / 2])
      if (kva) feil.push(`${await e.getAttribute("aria-label")} under ${kva}`)
    }
    return feil
  }
  const dekte = await utanfor()
  sjekk("og kvart merke som står framme kan takast", dekte.length === 0, dekte.slice(0, 2).join(" · "))

  const mb = await page.locator("[data-midt='1']").boundingBox()
  if (mb) {
    const foer = om(3)
    const cx = mb.x + mb.width / 2
    const cy = mb.y + mb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 40, cy - 30, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) === 5)
    const ny = om(3)
    const naboane = ny.length === 5 && JSON.stringify(ny[1]) === JSON.stringify(foer[1]) && JSON.stringify(ny[3]) === JSON.stringify(foer[2])
    sjekk("eit drag i eit midtmerke er eitt punkt til, mellom naboane sine", naboane, `${foer.length} → ${ny.length} punkt`)
    sjekk("og det nye punktet er DET fingeren dreg", JSON.stringify(ny[2]) !== JSON.stringify([(foer[1][0] + foer[2][0]) / 2, (foer[1][1] + foer[2][1]) / 2]), ny[2]?.join(","))
    sjekk("og det står som eit handtak med dei andre", (await page.locator("[data-punkt]").count()) === 5)
  }

  const rund = () => lesPlan(hash(page).plan).find((q) => q.id === 3)?.runde ?? []
  const midtBb = async (i: number) => {
    const e = page.locator(`[data-midt='${i}']`)
    return (await e.isVisible()) ? await e.boundingBox() : null
  }
  const pb = await page.locator("[data-punkt='1']").boundingBox()
  if (pb) {
    const foer = om(3)
    const mFoer = await midtBb(1)
    await page.waitForTimeout(DOBBELT + 80)
    await page.mouse.dblclick(pb.x + pb.width / 2, pb.y + pb.height / 2)
    await vent(page, () => rund().includes(1))
    sjekk(
      "eit dobbelttrykk på eit punkt vrir det til ein boge",
      rund().join() === "1" && JSON.stringify(om(3)) === JSON.stringify(foer),
      `bogar: ${rund().join(",") || "ingen"} · ${om(3).length} punkt står`,
    )
    sjekk("og merket seier kva punktet er vorte", (await page.locator("[data-punkt='1']").getAttribute("data-rund")) !== null)
    const mEtter = await midtBb(1)
    if (mFoer && mEtter) {
      const flytt = Math.hypot(mEtter.x - mFoer.x, mEtter.y - mFoer.y)
      sjekk("og midtmerket flytta seg ut på kurva", flytt > 3, `${flytt.toFixed(1)} px`)
    }
    await page.waitForTimeout(DOBBELT + 80)
    await page.mouse.dblclick(pb.x + pb.width / 2, pb.y + pb.height / 2)
    await vent(page, () => !rund().includes(1))
    sjekk("og eit til vrir det attende til eit hjørne", rund().length === 0 && JSON.stringify(om(3)) === JSON.stringify(foer), `bogar: ${rund().join(",") || "ingen"}`)
  }

  const lb = await page.locator("[data-punkt='1']").boundingBox()
  if (lb) {
    const foer = om(3)
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(900)
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) === foer.length - 1)
    const ny = om(3)
    sjekk(
      "eit langt trykk tek NØYAKTIG det punktet bort",
      ny.length === foer.length - 1 && !ny.some((q) => JSON.stringify(q) === JSON.stringify(foer[1])),
      `${foer.length} → ${ny.length} punkt`,
    )
  }
  const taSynleg = async () => {
    for (const e of await page.locator("[data-punkt]").all()) {
      if (!(await e.isVisible())) continue
      const bb = await e.boundingBox()
      if (bb) return { el: e, x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
    }
    return null
  }
  const t1 = await taSynleg()
  if (t1) {
    const foer = om(3).length
    await page.mouse.click(t1.x, t1.y)
    await page.waitForTimeout(500)
    sjekk("eit trykk på eit punkt tek det: merket står fullt", (await t1.el.getAttribute("aria-current")) === "true")
    const i1 = Number(await t1.el.getAttribute("data-punkt"))
    const p0 = om(3)[i1]
    const planFoer = JSON.stringify(lesPlan(hash(page).plan).find((q) => q.id === 3)?.o)
    await page.keyboard.press("ArrowRight")
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.[i1]?.[0] ?? 0) !== p0[0])
    const p1 = om(3)[i1]
    sjekk("og ei pil flyttar det éin millimeter i profilen", Math.abs(p1[0] - p0[0] - 1 / 150) < 1e-4 && p1[1] === p0[1], `${p0.join(",")} → ${p1.join(",")}`)
    await page.keyboard.press("Shift+ArrowUp")
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.[i1]?.[1] ?? 0) !== p1[1])
    const p2 = om(3)[i1]
    sjekk("og skift gjer han ti", Math.abs(p2[1] - p1[1] - 10 / 150) < 1e-4 && p2[0] === p1[0], `${p1.join(",")} → ${p2.join(",")}`)
    await page.keyboard.down("Shift")
    await page.mouse.move(t1.x, t1.y)
    await page.mouse.down()
    await page.mouse.move(t1.x + 50, t1.y - 22, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up("Shift")
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.[i1]?.[0] ?? 0) !== p2[0])
    const p3 = om(3)[i1]
    sjekk("og skift låser aksen i eit drag", p3[0] !== p2[0] && p3[1] === p2[1], `${p2.join(",")} → ${p3.join(",")}`)
    const planEtter = JSON.stringify(lesPlan(hash(page).plan).find((q) => q.id === 3)?.o)
    sjekk("og planet sjølv stod stille medan pilene gjekk", planEtter === planFoer, `${planFoer} → ${planEtter}`)
    await page.keyboard.press("Backspace")
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) === foer - 1)
    sjekk("og ⌫ tek det bort — ikkje planet", om(3).length === foer - 1 && lesPlan(hash(page).plan).length === 4, `${foer} → ${om(3).length} punkt · ${lesPlan(hash(page).plan).length} plan`)
  }
  for (let vakt = 0; vakt < 4 && om(3).length > 3; vakt++) {
    const t = await taSynleg()
    if (!t) break
    await page.mouse.click(t.x, t.y)
    await page.waitForTimeout(400)
    await page.keyboard.press("Backspace")
    await page.waitForTimeout(900)
  }
  const golv = om(3).length
  const t2 = await taSynleg()
  if (t2) {
    await page.mouse.click(t2.x, t2.y)
    await page.waitForTimeout(400)
    await page.keyboard.press("Backspace")
    await page.waitForTimeout(900)
  }
  sjekk("og tre punkt er golvet: forma kan ikkje trykkjast bort", golv === 3 && om(3).length === 3, `${golv} → ${om(3).length} punkt`)

  await page.waitForTimeout(DOBBELT + 80)
  await form.click()
  await vent(page, (p) => !lesPlan(p.plan).find((q) => q.id === 3)?.omriss)
  sjekk(
    "og eit einslegt trykk slepper henne",
    !lesPlan(hash(page).plan).find((q) => q.id === 3)?.omriss && (await page.locator("[data-punkt]").count()) === 0 && (await form.getAttribute("aria-pressed")) === "false",
  )

  await page.waitForTimeout(DOBBELT + 80)
  await form.click()
  await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) >= 3)

  const forenkl = page.locator(".tumme [data-forenkl]")
  sjekk("eit plan med omriss har forenklinga i spalta, på same knapp som 2d", (await forenkl.count()) === 1 && (await page.locator(".tumme [data-flatt][data-forenkl]").count()) === 1)
  const fb = await forenkl.boundingBox()
  sjekk("og ho er ein reiskap som dei andre: minst 44 px, på skjermen", !!fb && Math.min(fb.width, fb.height) >= 44 && fb.y + fb.height <= 844, fb ? `${Math.round(fb.width)}×${Math.round(fb.height)} px, botnen ${Math.round(fb.y + fb.height)}` : "finst ikkje")
  const spalta = await page.evaluate(`(() =>  {
    var alle = Array.from(document.querySelectorAll(".tumme > *"))
    var ute = [], smaa = []
    for (var i = 0; i < alle.length; i++) {
      var r = alle[i].getBoundingClientRect()
      var namn = alle[i].getAttribute("aria-label") || alle[i].tagName
      if (r.top < 0 || r.bottom > innerHeight + 0.5 || r.left < 0 || r.right > innerWidth + 0.5) ute.push(namn)
      if (Math.min(r.width, r.height) < 44) smaa.push(namn + " " + Math.round(Math.min(r.width, r.height)))
    }
    return { ute: ute, smaa: smaa, n: alle.length, topp: Math.round(alle.length ? alle[0].getBoundingClientRect().top : 0), namn: alle.map(function (e) { var r = e.getBoundingClientRect(); return (e.getAttribute("aria-label") || e.tagName) + "@" + Math.round(r.top) + "-" + Math.round(r.bottom) }) }
  })()`) as { ute: string[]; smaa: string[]; n: number; topp: number; namn: string[] }
  sjekk("og heile spalta står framleis på skjermen med henne i", spalta.ute.length === 0 && spalta.n >= 11, `${spalta.n} knappar frå ${spalta.topp} px${spalta.ute.length ? " · ute: " + spalta.ute.slice(0, 3).join(" · ") : ""}`)
  sjekk("og ingen av dei er klemt under 44 px", spalta.smaa.length === 0, spalta.smaa.slice(0, 3).join(" · "))
  if (fb) {
    const foer = om(3)
    const cx = fb.x + fb.width / 2
    const cy = fb.y + fb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 90, { steps: 12 })
    await page.mouse.up()
    await vent(page, (p) => (lesPlan(p.plan).find((q) => q.id === 3)?.omriss?.length ?? 0) < foer.length)
    const etter = om(3)
    sjekk("eit drag opp tek punkt bort", etter.length < foer.length && etter.length >= 3, `${foer.length} → ${etter.length} punkt`)
    sjekk("og dei som står att stod der frå før", etter.every((q) => foer.some((p) => p[0] === q[0] && p[1] === q[1])))
    sjekk("og kvart av dei er framleis eit handtak", (await page.locator("[data-punkt]").count()) === etter.length, `${await page.locator("[data-punkt]").count()} handtak av ${etter.length}`)
  }

  await page.locator("[data-flatt]").click()
  await page.waitForTimeout(700)
  const flata = page.locator("section[aria-label='2d-flata']")
  const blyant = flata.getByRole("button", { name: "blyant", exact: true })
  sjekk("2d-flata har ein blyant", (await flata.count()) === 1 && (await blyant.count()) === 1)
  const vpunkt = async (i: number) => {
    const b = await page.locator(`[data-vpunkt='${i}']`).first().boundingBox()
    return b ? ([b.x + b.width / 2, b.y + b.height / 2] as const) : null
  }
  const v0 = await vpunkt(0)
  const v2 = await vpunkt(2)
  if (v0 && v2) {
    const foer = om(3)
    await blyant.click()
    await page.waitForTimeout(200)
    await page.mouse.move(v0[0], v0[1])
    await page.mouse.down()
    await page.mouse.move((v0[0] + v2[0]) / 2 + 40, (v0[1] + v2[1]) / 2 + 40, { steps: 10 })
    await page.mouse.move(v2[0], v2[1], { steps: 10 })
    await page.mouse.up()
    await vent(page, (p) => JSON.stringify(lesPlan(p.plan).find((q) => q.id === 3)?.omriss) !== JSON.stringify(foer))
    const etter = om(3)
    sjekk("blyanten teiknar om biten han går langs", etter.length !== foer.length || JSON.stringify(etter) !== JSON.stringify(foer), `${foer.length} → ${etter.length} punkt`)
    sjekk("og dei to punkta han byrja og slutta i står", [foer[0], foer[2]].every((p) => etter.some((q) => q[0] === p[0] && q[1] === p[1])), `${JSON.stringify(foer[0])} og ${JSON.stringify(foer[2])}`)
    sjekk("og minst eitt punkt utanfor biten står med dei", etter.some((q) => [foer[1], foer[3]].some((p) => p && p[0] === q[0] && p[1] === q[1])))
    sjekk("og taket på punkt held", etter.length <= OMRISS_TAK, `${etter.length} av ${OMRISS_TAK}`)
  }
  await flata.getByRole("button", { name: "ferdig", exact: true }).click()
  await page.waitForTimeout(400)

  sjekk("ingen konsollfeil på forma", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function montasjen(browser: Browser) {
  console.log("\n=== montasjen")
  const bag = { plan: skrivPlan(rutenett(3, 3)), storleik: 150, tjukn: 6 }
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify(bag)), browser, 390, 844)
  const fana = page.getByRole("tab", { name: "montasje", exact: true })
  const kn = page.locator(".tumme [data-montasje]")
  const lesing = async () => {
    const e = page.locator("[data-lesing] .tab").first()
    return (await e.count()) ? ((await e.textContent()) ?? "").trim() : ""
  }
  sjekk("montasjen er ei fane i topplina", (await fana.count()) === 1 && (await fana.getAttribute("aria-selected")) === "false")
  sjekk("og ingen montasjeknapp står i tommelspalta", (await kn.count()) === 0)
  sjekk("og han er av til nokon vel fana", (await lesing()) === "")

  await fana.click()
  await vent2(page, async () => /^steg /.test(await lesing()), 8000)
  const opna = await lesing()
  sjekk("fana opnar han, og lina seier kva steg vi er på", /^steg 1\/2 · 3$/.test(opna), opna)
  const spalta = async () =>
    page.locator(".tumme button").evaluateAll((el) => el.map((e) => (e.getAttribute("aria-label") || e.textContent || "?").trim()))
  sjekk("og spalta ber berre steget", JSON.stringify(await spalta()) === JSON.stringify(["steget"]), JSON.stringify(await spalta()))
  sjekk("og speglingane er borte med resten", (await page.locator(".speil").count()) === 0)

  const klipp = { x: 20, y: 120, width: 350, height: 560 }
  const bilete = async () => (await page.screenshot({ clip: klipp })).length
  const tidleg = await bilete()
  await vent2(page, async () => (await lesing()).startsWith("steg 2/"), 8000)
  const andre = await lesing()
  sjekk("han spelar av seg sjølv, og steg 2 kjem etter steg 1", andre.startsWith("steg 2/2"), andre)
  await page.waitForTimeout(1600)
  const ferdig = await bilete()
  sjekk("og delane har faktisk flytt seg", Math.abs(ferdig - tidleg) > 200, `${tidleg} B → ${ferdig} B`)
  await page.waitForTimeout(700)
  const staar = await bilete()
  sjekk("og so står han stille: animasjonen er ferdig", Math.abs(staar - ferdig) < 200, `${ferdig} B → ${staar} B`)

  const kb = await kn.boundingBox()
  if (kb) {
    const cx = kb.x + kb.width / 2
    const cy = kb.y + kb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 200, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const dregen = await lesing()
    sjekk("eit drag ned tek deg attende til fyrste steget", dregen.startsWith("steg 1/2"), dregen)
    const attende = await bilete()
    sjekk("og biletet er eit anna enn det ferdige", Math.abs(attende - ferdig) > 200, `${ferdig} B → ${attende} B`)
    await page.waitForTimeout(700)
    const staaOgso = await bilete()
    sjekk("og han vert STÅANDE der fingeren slapp han", Math.abs(staaOgso - attende) < 200, `${attende} B → ${staaOgso} B`)
    await page.mouse.click(cx, cy)
    await page.waitForTimeout(400)
    const omatt = await lesing()
    sjekk("og eit trykk spelar han om att frå golvet", omatt.startsWith("steg 1/2"), omatt)
    await vent2(page, async () => (await lesing()).startsWith("steg 2/"), 8000)
    sjekk("og han går heile vegen opp att", (await lesing()).startsWith("steg 2/2"), await lesing())
  }

  await bytArket(page)
  await roleg(page, 600)
  const rader = page.locator("[aria-label='steget'] [data-steg-del]")
  const planrader = page.locator("[role=listbox][aria-label='plan'] [role=option][data-plan]")
  await vent2(page, async () => (await rader.count()) > 0, 8000)
  sjekk("arket ber stega og ikkje plana", (await rader.count()) > 0 && (await planrader.count()) === 0, `${await rader.count()} stegrader · ${await planrader.count()} planrader`)
  const fyrste = ((await rader.first().innerText()) ?? "").replace(/\s+/g, " ").trim()
  sjekk("og kvar rad ber adressa, vegen inn og plata", /^\S+ (ned|opp|frå sida|ligg) ark \d+$/.test(fyrste), fyrste)
  await bytArket(page)
  await roleg(page, 500)

  {
    await page.waitForTimeout(1800)
    const klipp2 = { x: 20, y: 360, width: 350, height: 300 }
    const utan = await page.screenshot({ clip: klipp2 })
    let sagt = ""
    let traff: [number, number] | null = null
    for (const [x, y] of [[195, 470], [195, 520], [150, 440], [240, 500], [195, 400], [120, 560]] as [number, number][]) {
      await page.touchscreen.tap(x, y)
      await page.waitForTimeout(400)
      sagt = await lesing()
      if (/^\S+ · steg \d+$/.test(sagt)) { traff = [x, y]; break }
    }
    sjekk("eit trykk på ei ribbe seier adressa og steget", /^\S+ · steg \d+$/.test(sagt), `«${sagt}»`)
    sjekk("og ribba står i blekk", !(await page.screenshot({ clip: klipp2 })).equals(utan))
    if (traff) await page.touchscreen.tap(traff[0], traff[1])
    await page.waitForTimeout(600)
    sjekk("og eit trykk til slepper henne, og steget står att", /^steg /.test(await lesing()), await lesing())
  }

  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await roleg(page, 700)
  sjekk("ei anna fane slepper montasjen", (await fana.getAttribute("aria-selected")) === "false" && (await lesing()) === "")
  sjekk("og skjer er attende", (await page.getByRole("button", { name: "skjer", exact: true }).count()) === 1)
  await page.keyboard.press("m")
  await vent2(page, async () => /^steg /.test(await lesing()), 8000)
  sjekk("og M gjer det same frå tastaturet", (await fana.getAttribute("aria-selected")) === "true")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  sjekk("og escape tek deg attende dit du kom frå", (await fana.getAttribute("aria-selected")) === "false" && (await page.getByRole("tab", { name: "lag", exact: true }).getAttribute("aria-selected")) === "true")
  await page.getByRole("tab", { name: "kontur", exact: true }).click()
  await roleg(page, 700)
  await page.keyboard.press("m")
  await vent2(page, async () => /^steg /.test(await lesing()), 8000)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
  sjekk(
    "og frå konturen kjem du attende til konturen",
    (await page.getByRole("tab", { name: "kontur", exact: true }).getAttribute("aria-selected")) === "true",
    `kontur=${await page.getByRole("tab", { name: "kontur", exact: true }).getAttribute("aria-selected")} lag=${await page.getByRole("tab", { name: "lag", exact: true }).getAttribute("aria-selected")}`,
  )
  await page.getByRole("tab", { name: "lag", exact: true }).click()
  await roleg(page, 700)
  await page.keyboard.press("4")
  await vent2(page, async () => /^steg /.test(await lesing()), 8000)
  sjekk("og 4 er fana hans, som 1, 2 og 3 er dei andre sine", (await fana.getAttribute("aria-selected")) === "true")
  await page.keyboard.press("2")
  await roleg(page, 500)
  sjekk("ingen konsollfeil i montasjen", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.close()
}

async function teiknehand(browser: Browser) {
  console.log("\n=== teiknehand 390×844")
  const { page, konsoll } = await opne(URL, browser, 390, 844)
  const knapp = page.locator("[data-teiknknapp]")
  await knapp.click()
  const cdp = await page.context().newCDPSession(page)
  const a = { x: 90, y: 290, id: 1 }
  const b = { x: 190, y: 410, id: 1 }
  const c = { x: 230, y: 490, id: 1 }
  const andre = { x: 265, y: 330, id: 2 }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [b] })
  await page.waitForTimeout(100)
  sjekk("måla fylgjer fingeren før flata finst", /[0-9].*×.*mm/.test(await page.locator(".teiknmaal").textContent() ?? "") && plana(page).length === 0)
  if (process.env.PANEL_BILETE) await page.screenshot({ path: `${process.env.PANEL_BILETE}/teikne-drag.png` })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
  await roleg(page, 300)
  sjekk("eit avbrot lagar ingen flate", plana(page).length === 0 && await knapp.getAttribute("aria-pressed") === "true")
  sjekk("og slepper den uferdige streken", await page.locator(".teiknflate polygon").getAttribute("points") === "")

  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [b] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [b, andre] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [andre] })
  await page.waitForTimeout(100)
  sjekk("den andre fingeren slepper utan å avslutte draget", await page.evaluate(() => document.querySelector("[data-teikn]")?.getAttribute("data-teikn")) === "dreg" && plana(page).length === 0)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [c] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await vent(page, talPlan(1))
  sjekk("berre fingeren som teikna lagar flata", plana(page).length === 1 && plana(page)[0].omriss?.length === 4)
  sjekk("hjørna er klare til å formast med ein gong", await page.locator("button[data-punkt]").count() === 4)
  if (process.env.PANEL_BILETE) await page.screenshot({ path: `${process.env.PANEL_BILETE}/teikna-flate.png` })
  await page.getByRole("button", { name: "angre", exact: true }).click()
  await vent(page, talPlan(0))
  sjekk("heile draget er eitt steg i angre", plana(page).length === 0)
  sjekk("ingen konsollfeil i teiknehanda", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await cdp.detach()
  await page.close()
}

async function heimskjermen(browser: Browser) {
  console.log("\n=== heimskjermen utan nett")
  const plan = skrivPlan(rutenett(2, 2))
  const { page, konsoll } = await opne(URL + "#p=" + encodeURIComponent(JSON.stringify({ storleik: 187, plan })), browser, 390, 844)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 45000 })
  const mellomlager = await page.evaluate(async () => {
    const namn = (await caches.keys()).find((n) => n.startsWith("slicer-verkstad-"))
    const filer = namn ? await (await caches.open(namn)).keys() : []
    return filer.map((r) => new globalThis.URL(r.url).pathname)
  })
  sjekk("arbeidar, skrift og alle former er på telefonen", mellomlager.some((p) => p.endsWith(".js")) && mellomlager.some((p) => p.endsWith(".woff2")) && mellomlager.filter((p) => p.endsWith(".glb")).length === 19, `${mellomlager.length} filer`)
  await page.getByRole("tab", { name: "kontur", exact: true }).click()
  await roleg(page, 700)
  const foer = hash(page)
  await page.context().setOffline(true)
  await page.goto(URL, { waitUntil: "networkidle" })
  await roleg(page, 700)
  sjekk("prosjektet kjem att utan nett og utan lenkje", hash(page).storleik === 187 && hash(page).plan === foer.plan)
  sjekk("og same arbeidsflate er open", await page.getByRole("tab", { name: "kontur", exact: true }).getAttribute("aria-selected") === "true")

  await page.addInitScript((params) => localStorage.setItem("slicer-okt-vakt", JSON.stringify({ params: { ...params, storleik: 213 }, view: "lag", skal: false })), foer)
  await page.addInitScript(() => {
    const opne = indexedDB.open.bind(indexedDB)
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
      const r = opne(...args)
      Object.defineProperty(r, "onsuccess", { set(fn: (e: Event) => void) {
        r.addEventListener("success", (e) => setTimeout(() => fn.call(r, e), 350))
      } })
      return r
    }
  })
  await page.goto(URL, { waitUntil: "networkidle" })
  await roleg(page, 600)
  sjekk("siste uferdige skriving vert berga", hash(page).storleik === 213 && hash(page).plan === foer.plan)
  sjekk("og synet fylgjer den berga økta", await page.getByRole("tab", { name: "lag", exact: true }).getAttribute("aria-selected") === "true" && await page.getByRole("button", { name: "skalet", exact: true }).getAttribute("aria-pressed") === "false")
  sjekk("kvitteringa slepper fyrst etter lagring", await page.evaluate(() => localStorage.getItem("slicer-okt-vakt")) === null)

  const form = await page.evaluate(async () => {
    const r = await fetch("/form/stolform-01.glb")
    return r.ok && (await r.arrayBuffer()).byteLength > 100000
  })
  sjekk("ei ubrukt innebygd form kan hentast utan nett", form)
  sjekk("ingen kodefeil ved nettlaus opning", konsoll.length === 0, konsoll.slice(0, 2).join(" · "))
  await page.context().setOffline(false)
  await page.close()
}

const DELAR: [string, (b: Browser) => Promise<void>][] = [
  ["telefon", telefon],
  ["kroppen", kroppen],
  ["reglar", reglar],
  ["symmetri", symmetri],
  ["montasjen", montasjen],
  ["handtaka", handtaka],
  ["andrefingeren", andreFingeren],
  ["boyen", boyen],
  ["forma", forma],
  ["snappet", snappet],
  ["skalet", skaletOgSovnen],
  ["taket", taket],
  ["flyt", flyt],
  ["mork", mork],
  ["uttaka", uttaka],
  ["benk", benk],
  ["teikninga", teikninga],
  ["teiknehand", teiknehand],
  ["heimskjermen", heimskjermen],
  ["kamera", kamera],
  ["skrivebordet", skrivebordet],
  ["grupper", grupper],
]

const main = async () => {
  const bedne = process.argv.slice(2).map((a) => a.toLowerCase())
  const ukjend = bedne.filter((a) => !DELAR.some(([n]) => n === a))
  if (ukjend.length) {
    console.error(`ukjend del: ${ukjend.join(", ")}\nvel mellom: ${DELAR.map(([n]) => n).join(" ")}`)
    process.exit(2)
  }
  const kjor = DELAR.filter(([n]) => !bedne.length || bedne.includes(n))
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
  const tider: string[] = []
  const t00 = Date.now()
  for (const [namn, fn] of kjor) {
    const t0 = Date.now()
    await fn(browser)
    tider.push(`${namn} ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  }
  await browser.close()
  console.log(`\n  ${tider.join("   ")}`)
  console.log(`  til saman ${((Date.now() - t00) / 1000).toFixed(1)} s`)
  console.log(feil ? `\n${feil} FEIL` : "\npanelet held")
  process.exit(feil ? 1 : 0)
}
void main()
