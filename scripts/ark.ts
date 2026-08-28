/**
 * Uttaka på disk, og som bilete.
 *
 * Ei pakking kan vera rett i tal og likevel gale for handa: nummer som
 * fell utanfor delen, tekst opp-ned, eit ark som er tomt. Talet fangar
 * ikkje det. Difor vert filene skrivne ut og fotograferte — og zoomen vert
 * rekna av SVG-en sitt eige millimetermål, so eit ark på seks hundre
 * millimeter og ein kupong på sytti begge fyller ruta.
 *
 *   npx tsx scripts/ark.ts
 */
import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { kerfOf, VAFFEL } from "../lib/vaffel/engine"
import { sheetSvg } from "../lib/vaffel/export-svg"
import { makePlan } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import type { ExportKind, ParamBag } from "../lib/core"

const UT = "bilete"
const RUTE = { width: 1180, height: 800 }

function kule(r: number, seg: number, strekk = 1) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [
      r * Math.sin(ph) * Math.cos(th),
      r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph) * strekk,
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
  return makeSoup(new Float32Array(pos))
}

const main = async () => {
  mkdirSync(UT, { recursive: true })
  put("egg", "egg.stl", kule(50, 40, 1.7))

  const filer: { namn: string; svg: string }[] = []
  const saker: [string, Params][] = [
    ["kube", DEFAULT_PARAMS],
    ["egg", { ...DEFAULT_PARAMS, kjelde: "egg", ribbX: 8, ribbY: 8, storleik: 200 }],
  ]

  for (const [namn, p] of saker) {
    const bag = p as unknown as ParamBag
    // uttaka slik brukaren får dei
    for (const kind of ["ark", "prove", "svg", "dxf"] as ExportKind[]) {
      const o = VAFFEL.exportFile(bag, kind)
      const data = o.text ? Buffer.from(o.text) : Buffer.from(new Uint8Array(o.data!))
      writeFileSync(join(UT, o.name), data)
      console.log(`${namn} ${kind.padEnd(6)} → ${o.name} (${data.length} B)`)
    }
    // og kvar einskild plate, til biletet
    const { ns } = makePlan(p, DETAIL.mid)
    ns.sheets.forEach((_, i) => {
      filer.push({
        namn: `ark-${namn}-${i + 1}av${ns.sheets.length}`,
        // Den SAME kompensasjonen som uttaket. Skriptet fotograferer
        // «uttaka slik brukaren får dei», og står `snittveg` på maskina,
        // ber ikkje fila kompensasjonen — teikninga her gjorde det
        // likevel, og synte eit ark ingen får.
        svg: sheetSvg(ns, i, kerfOf(p)),
      })
    })
    filer.push({ namn: `prove-${namn}`, svg: couponOf(bag) })
  }

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  })
  for (const { namn, svg } of filer) {
    // millimetermålet står i sjølve fila; zoomen fell ut av det
    const mm = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/)
    const px = (v: number) => (v / 25.4) * 96
    const zoom = mm
      ? Math.min(RUTE.width / px(+mm[1]), RUTE.height / px(+mm[2])) * 0.95
      : 1
    const html = join(UT, `${namn}.html`)
    writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}` +
        `#w{zoom:${zoom.toFixed(3)};display:inline-block}</style><div id="w">${svg}</div>`,
    )
    const page = await browser.newPage({ viewport: RUTE })
    await page.goto("file://" + resolve(html), { waitUntil: "load" })
    await page.screenshot({ path: join(UT, `${namn}.png`) })
    await page.close()
    console.log(`bilete → ${namn}.png`)
  }
  await browser.close()
}

const couponOf = (bag: ParamBag) => VAFFEL.exportFile(bag, "prove").text ?? ""

void main()
