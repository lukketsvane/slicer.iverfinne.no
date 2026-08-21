/**
 * Vakta over pakkinga.
 *
 * Ei pakking som legg to delar oppå kvarandre ser heilt fin ut i eit
 * bilete og er verdlaus på ei plate: du får éin del og eitt skrapstykke.
 * Difor vert kvar plate teikna opp att her, i eit finmaska rutenett, og
 * kvar celle talt. Ei celle som vert dekt to gonger er ein feil, og
 * skriptet seier frå kor mange og kor.
 *
 * Rutenettet er finare enn det pakkaren sjølv brukte, so testen er ikkje
 * berre pakkaren som får seg sjølv i tale.
 *
 *   npx tsx scripts/nest-sjekk.ts
 */
import { bbox, type Pt } from "../lib/core"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

const RES = 0.6

/** cellene ein ring dekkjer, med partals-regelen */
function fill(
  rings: Pt[][],
  hit: (i: number, j: number) => void,
  w: number,
  h: number,
) {
  const b = bbox(rings[0])
  const j0 = Math.max(0, Math.floor(b.y0 / RES))
  const j1 = Math.min(h - 1, Math.ceil(b.y1 / RES))
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) * RES
    const xs: number[] = []
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        if (p[1] === q[1]) continue
        if (y >= Math.min(p[1], q[1]) && y < Math.max(p[1], q[1])) {
          xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
        }
      }
    }
    xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / RES - 0.5))
      const i1 = Math.min(w - 1, Math.floor(xs[k + 1] / RES - 0.5))
      for (let i = i0; i <= i1; i++) hit(i, j)
    }
  }
}

let brot = 0

function sjekk(namn: string, p: Params) {
  const { pl, ns } = makePlan(p, DETAIL.mid)
  const w = Math.ceil(p.arkB / RES)
  const h = Math.ceil(p.arkH / RES)
  let overlapp = 0
  let utanfor = 0
  let dekt = 0
  let naer = Infinity
  const gap = nestGap(p)

  for (const sheet of ns.sheets) {
    const grid = new Int32Array(w * h)
    for (const q of sheet.placed) {
      const r = placedRings(q)
      const b = bbox(r.outline)
      if (b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > p.arkB + 0.01 || b.y1 > p.arkH + 0.01) {
        utanfor++
      }
      fill([r.outline, ...r.holes], (i, j) => {
        if (grid[j * w + i]++ > 0) overlapp++
        dekt++
      }, w, h)
    }
    // kortaste avstand mellom to delar på plata, målt frå kuttbanene
    for (let a = 0; a < sheet.placed.length; a++) {
      for (let c = a + 1; c < sheet.placed.length; c++) {
        const ra = placedRings(sheet.placed[a]).outline
        const rb = placedRings(sheet.placed[c]).outline
        const ba = bbox(ra)
        const bb2 = bbox(rb)
        if (ba.x0 > bb2.x1 + gap * 3 || bb2.x0 > ba.x1 + gap * 3) continue
        if (ba.y0 > bb2.y1 + gap * 3 || bb2.y0 > ba.y1 + gap * 3) continue
        for (const u of ra) {
          for (const v of rb) {
            const d = Math.hypot(u[0] - v[0], u[1] - v[1])
            if (d < naer) naer = d
          }
        }
      }
    }
  }

  const areal = pl.parts.reduce((s, q) => s + q.area, 0)
  const ok = overlapp === 0 && utanfor === 0
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(pl.parts.length).padStart(3)} delar · ${ns.sheets.length} ark · ` +
      `${Math.round(ns.util * 100)} % · ` +
      `overlapp ${overlapp} · utanfor ${utanfor} · ` +
      `næraste ${Number.isFinite(naer) ? naer.toFixed(1) : "–"} mm (luke ${gap}) · ` +
      `areal ${(areal / 1e4).toFixed(0)} vs teikna ${((dekt * RES * RES) / 1e4).toFixed(0)} cm²`,
  )
}

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

function torus(R: number, r: number, n: number, m: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const u = (i / n) * Math.PI * 2
    const v = (j / m) * Math.PI * 2
    return [
      (R + r * Math.cos(v)) * Math.cos(u),
      (R + r * Math.cos(v)) * Math.sin(u),
      r * Math.sin(v),
    ]
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  return makeSoup(new Float32Array(pos))
}

put("kule", "kule", kule(50, 48))
put("egg", "egg", kule(50, 48, 1.7))
put("torus", "torus", torus(60, 22, 64, 32))

sjekk("kube 6x6", DEFAULT_PARAMS)
sjekk("kube 12x9 i 12 mm", { ...DEFAULT_PARAMS, ribbX: 12, ribbY: 9, tjukn: 12 })
sjekk("kube vend/700", { ...DEFAULT_PARAMS, rotX: 30, rotY: 20, rotZ: 10, storleik: 700 })
sjekk("kule 7x7", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 7, ribbY: 7 })
sjekk("egg 8x8", { ...DEFAULT_PARAMS, kjelde: "egg", ribbX: 8, ribbY: 8 })
sjekk("torus staaende", { ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, ribbX: 9, ribbY: 9 })
sjekk("kule stor plate", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10, arkB: 2500, arkH: 1250 })
sjekk("hundebein", { ...DEFAULT_PARAMS, kjelde: "egg", leddtype: 1, fres: 6, ribbX: 7, ribbY: 7 })

console.log(brot ? `\n${brot} PAKKINGAR ER BROTNE` : "\nalle pakkingar held")
process.exit(brot ? 1 : 0)
