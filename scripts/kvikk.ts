import { chromium, type CDPSession, type Locator, type Page } from "playwright"
import { mkdirSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { lesPlan } from "../lib/plan"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"

type Punkt = [number, number]
const ADR = process.env.URL ?? "http://127.0.0.1:3210"
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pt = (s: string): Punkt => s.split(",").map(Number) as Punkt
const linje = (a: Punkt, b: Punkt, n = 14): Punkt[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)])

function params(side: Page): Params {
  const h = new globalThis.URL(side.url()).hash.split("#p=")[1]
  return { ...DEFAULT_PARAMS, ...(h ? JSON.parse(decodeURIComponent(h)) : {}) }
}
async function drag(cdp: CDPSession, punkt: Punkt[], tid = 500) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: punkt[0][0], y: punkt[0][1] }] })
  for (const q of punkt.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: q[0], y: q[1] }] })
    await pause(tid / (punkt.length - 1))
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
async function toFingrar(cdp: CDPSession, fraa: [Punkt, Punkt], til: [Punkt, Punkt], tid = 500) {
  const n = 14
  const ved = (i: number) => fraa.map((p, k): { x: number; y: number; id: number } => ({ x: p[0] + ((til[k][0] - p[0]) * i) / (n - 1), y: p[1] + ((til[k][1] - p[1]) * i) / (n - 1), id: k }))
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [ved(0)[0]] })
  await pause(60)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: ved(0) })
  for (let i = 1; i < n; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: ved(i) })
    await pause(tid / (n - 1))
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

async function hovud() {
  const ord = (process.argv.slice(2).join(" ") || "tom; les").split(";").map((s) => s.trim()).filter(Boolean)
  const nettlesar = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--disable-features=WebShare"] })
  const oekt = await nettlesar.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const side = await oekt.newPage()
  side.setDefaultTimeout(8000)
  const cdp = await oekt.newCDPSession(side)
  const konsoll: string[] = []
  side.on("pageerror", (e) => konsoll.push(e.message))
  side.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) konsoll.push(m.text()) })
  const ferdig = async () => {
    await side.locator('[aria-label="kontrollar"][aria-busy="false"]').waitFor()
    let sist = side.url()
    for (let i = 0, ro = 0; i < 50 && ro < 4; i++) { await pause(100); const no = side.url(); ro = no === sist ? ro + 1 : 0; sist = no }
  }
  const trykk = async (e: Locator) => { await e.first().tap(); await pause(150) }
  const knapp = (namn: string) => side.getByRole("button", { name: namn.startsWith("/") ? new RegExp(namn.slice(1, -1)) : namn, exact: !namn.startsWith("/") })
  const verkty = async (slag: "firkant" | "kontur" | "rund") => {
    const k = side.locator("[data-teiknknapp]")
    if ((await k.getAttribute("data-teiknknapp")) !== "klar") await trykk(k)
    await trykk(side.getByRole("group", { name: "teiknemåte" }).getByRole("button", { name: slag, exact: true }))
  }
  const kube: Record<string, Punkt> = { topp: [351, 61], framme: [352, 82], hogre: [372, 88] }
  const talPlan = () => lesPlan(params(side).plan).length
  const ventPlan = async (minst: number) => {
    await side.waitForFunction((n) => { const h = location.hash.split("#p=")[1]; const pl = h ? JSON.parse(decodeURIComponent(h)).plan ?? "" : ""; return (pl ? pl.split(";").length : 0) >= n }, minst, { timeout: 8000 }).catch(() => undefined)
    await ferdig()
  }
  const t0 = performance.now()
  let feil = 0
  mkdirSync("bilete", { recursive: true })
  try {
    await side.goto(ADR, { waitUntil: "networkidle" })
    await ferdig()
    for (const o of ord) {
      const [kva, ...resten] = o.split(/\s+/)
      const p = resten.map(pt)
      switch (kva) {
        case "tom": await trykk(side.locator("[data-kjelde]")); await trykk(knapp("tom arbeidsflate")); await pause(900); await ferdig(); break
        case "trykk": await trykk(knapp(resten.join(" "))); await ferdig(); break
        case "fane": await trykk(side.getByRole("tab", { name: resten.join(" "), exact: true })); break
        case "kontur": { const n = talPlan(); await verkty("kontur"); await drag(cdp, [...p, p[0]].flatMap((q, i, a) => (i ? linje(a[i - 1], q, 5).slice(1) : [q])), 900); await ventPlan(n + 1); break }
        case "firkant":
        case "rund": { const n = talPlan(); await verkty(kva); await drag(cdp, linje(p[0], p[1]), 500); await ventPlan(n + 1); break }
        case "dra": await drag(cdp, linje(p[0], p[1]), 400); await pause(300); break
        case "to": await toFingrar(cdp, [p[0], p[1]], [p[2], p[3]]); await pause(300); await ferdig(); break
        case "grep": {
          const sel = `[data-handtak='${resten[0]}'], [data-${resten[0]}]`
          const b = await side.locator(sel).first().boundingBox()
          if (!b) throw new Error(`fann ikkje handtaket «${resten[0]}»`)
          const [gx, gy] = pt(resten[1])
          await drag(cdp, linje([b.x + b.width / 2, b.y + b.height / 2], [b.x + b.width / 2 + gx, b.y + b.height / 2 + gy]), 450)
          await pause(300); await ferdig(); break
        }
        case "tapp": await side.touchscreen.tap(p[0][0], p[0][1]); await pause(300); break
        case "tast": await side.keyboard.press(resten[0]); await pause(300); await ferdig(); break
        case "syn": await trykk(knapp("ramm inn")); await pause(500); await side.touchscreen.tap(...kube[resten[0]]); await pause(800); break
        case "heim": await trykk(knapp("ramm inn")); await pause(500); break
        case "spegl": await trykk(knapp(`spegl planet om ${resten[0]}`)); await ferdig(); break
        case "vent": await pause(Number(resten[0])); break
        case "bilete": await side.screenshot({ path: `bilete/kvikk${resten[0] ? "-" + resten[0] : ""}.png` }); break
        case "les": {
          await ferdig()
          const pr = params(side)
          const bygg = makeBygg(pr, DETAIL.mid)
          const brot = checkRules(pr, measure(pr, bygg), bygg, false).filter((r) => !r.ok)
          const s = ((performance.now() - t0) / 1000).toFixed(1)
          console.log(`${lesPlan(pr.plan).length} plan · ${bygg.dl.delar.length} delar · ${bygg.s.ledd} ledd · ${bygg.s.tappar} tappar · ${brot.length ? brot.map((r) => `${r.hard ? "HARD " : ""}${r.label}: ${r.value}`).join(" | ") : "ingen brot"} · ${konsoll.length ? `KONSOLL ${konsoll.length}: ${konsoll[0].slice(0, 80)}` : "konsoll rein"} · ${s} s`)
          break
        }
        case "delar": {
          await ferdig()
          const pr = params(side)
          const bygg = makeBygg(pr, DETAIL.mid)
          for (const q of lesPlan(pr.plan)) console.log(`  plan ${q.id} o ${q.o.map((v) => v.toFixed(3)).join(",")} n ${q.n.join(",")}${q.bog ? ` bog ${q.bog}` : ""}${q.omriss ? ` omriss ${q.omriss.length}` : ""}`)
          for (const d of bygg.dl.delar) {
            const b = d.outline.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity])
            console.log(`  ${d.adr}: ${(b[2] - b[0]).toFixed(0)} × ${(b[3] - b[1]).toFixed(0)} mm · ${d.outline.length} pkt · ${d.holes.length} hòl${d.holes.map((h) => { const c = h.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]); return ` [${(c[2] - c[0]).toFixed(0)}×${(c[3] - c[1]).toFixed(0)}]` }).join("")}`)
          }
          break
        }
        default: throw new Error(`ukjent ord «${kva}»`)
      }
    }
  } catch (e) {
    feil = 1
    await side.screenshot({ path: "bilete/kvikk-feil.png" }).catch(() => undefined)
    console.log(`FEIL: ${String(e).split("\n")[0].slice(0, 200)} — bilete/kvikk-feil.png`)
  } finally {
    await nettlesar.close()
  }
  process.exit(feil)
}
hovud()
