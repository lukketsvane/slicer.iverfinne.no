/**
 * Kuttarket som bilete.
 *
 * Ei pakking kan vera rett i tal og likevel gale for handa: nummer som
 * fell utanfor delen, delar som ligg opp i kanten, eit ark som er tomt.
 * Talet fangar ikkje det. Difor vert arka skrivne ut og fotograferte.
 *
 *   npx tsx scripts/ark.ts
 */
import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { VAFFEL } from "../lib/vaffel/engine"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import type { ParamBag } from "../lib/core"

const UT = "bilete"

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
  const saker: [string, Params][] = [
    ["kube", DEFAULT_PARAMS],
    ["egg", { ...DEFAULT_PARAMS, kjelde: "egg", ribbX: 8, ribbY: 8, tjukn: 4 }],
  ]
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  for (const [namn, p] of saker) {
    for (const kind of ["ark", "svg"] as const) {
      const out = VAFFEL.exportFile(p as unknown as ParamBag, kind)
      const svg = out.text ?? ""
      writeFileSync(join(UT, `${namn}-${kind}.svg`), svg)
      // SVG-en er i millimeter og kan vera fleire meter høg. Han vert lagd
      // i ei side som klemmer han ned til ruta, elles ventar nettlesaren
      // på ei teikning ingen skjerm har plass til.
      const html = join(UT, `${namn}-${kind}.html`)
      writeFileSync(
        html,
        `<!doctype html><meta charset="utf-8">` +
          `<style>html,body{margin:0;background:#fff}` +
          `svg{display:block;width:auto;height:auto;max-width:100vw;max-height:100vh;margin:0 auto}</style>` +
          svg.replace(/ width="[^"]*" height="[^"]*"/, ""),
      )
      await page.goto("file://" + resolve(html), { waitUntil: "load" })
      await page.screenshot({ path: join(UT, `ark-${namn}-${kind}.png`) })
      console.log(`${namn} ${kind}: ${svg.length} B`)
    }
  }
  await browser.close()
}

void main()
