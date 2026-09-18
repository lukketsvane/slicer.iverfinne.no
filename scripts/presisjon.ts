import { makeBygg } from "../lib/bygg"
import { makeKropp } from "../lib/kropp"
import type { Pt, Vec3 } from "../lib/core"
import { apply } from "../lib/pack"
import { sheetSvg } from "../lib/export-svg"
import { DEFAULT_PARAMS } from "../lib/params"
import { ramme, rutenett, skrivPlan } from "../lib/plan"
import { newSoup, ribSolid } from "../lib/mesh"
import { buildSnitt, DETAIL, sporPunkt, stykkeLangs } from "../lib/snitt"

function breidd(ringar: Pt[][], punkt: Pt, retning: Pt): number {
  const deler = stykkeLangs(ringar, punkt, retning)
  if (deler.some(([a, b]) => a < 0 && b > 0)) return Infinity
  const venstre = deler.filter(d => d[1] <= 0).at(-1)?.[1]
  const hogre = deler.find(d => d[0] >= 0)?.[0]
  return venstre === undefined || hogre === undefined ? Infinity : hogre - venstre
}

const plan = skrivPlan(rutenett(2, 2).map(q => ({ ...q,
  o: q.o.map((c, i) => c + q.n[i] * 0.0017) as Vec3,
  omriss: [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]] as Pt[],
})))
let brot = 0
let samla = 0
for (const storleik of [200, 450, 600, 1000]) {
  for (const tjukn of [1, 3, 12]) {
    const p = { ...DEFAULT_PARAMS, storleik, tjukn, plan }
    const start = performance.now()
    const s = buildSnitt(makeKropp(p), p, DETAIL.mid)
    const ms = performance.now() - start
    samla += ms
    let verst = 0
    for (const r of s.ribber) for (const q of r.spor) for (const t of [0.25, 0.5, 0.75]) {
      const pt = sporPunkt(q, q.botn + t * (q.munn - q.botn))
      verst = Math.max(verst, Math.abs(breidd([...r.outlines, ...r.holes], pt, [-q.d[1], q.d[0]]) - q.w))
    }
    const talPunkt = s.ribber.reduce((sum, r) => sum + r.outlines.reduce((n, o) => n + o.length, 0), 0)
    const ok = s.ledd === 4 && verst < 0.001 && talPunkt < 200
    if (!ok) brot++
    console.log(`${ok ? "ok" : "FEIL"} ${storleik} mm / ${tjukn} mm: 4 ledd, ${talPunkt} hjørne, avvik ${verst.toFixed(6)} mm, ${ms.toFixed(0)} ms`)
  }
}

const { ns } = makeBygg({ ...DEFAULT_PARAMS, storleik: 600, tjukn: 3, plan, arkB: 1500, arkH: 1500 }, DETAIL.mid)
for (const kerf of [0, 0.2, 0.5]) {
  let verst = 0
  let maalte = 0
  ns.sheets.forEach((ark, i) => {
    const svg = sheetSvg(ns, i, kerf)
    const baner = [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="#0000ff"/g)].map(m => m[1].replace(/[MLZ]/g, " ").trim().split(/\s+/).map(p => p.split(",").map(Number) as Pt))
    if (baner.length !== ark.placed.length) brot++
    ark.placed.forEach((del, j) => {
      for (const q of del.part.spor) {
        const pt = sporPunkt(q, (q.munn + q.botn) / 2)
        const p = apply(del.slot.m, pt)
        const side = apply(del.slot.m, [pt[0] - q.d[1], pt[1] + q.d[0]])
        const d: Pt = [side[0] - p[0], side[1] - p[1]]
        verst = Math.max(verst, Math.abs(breidd([baner[j] ?? []], p, d) + kerf - q.w))
        maalte++
      }
    })
  })
  const ok = ns.spilt === 0 && maalte === 8 && verst < 0.02
  if (!ok) brot++
  console.log(`${ok ? "ok" : "FEIL"} nesta SVG, kerf ${kerf} mm: ${maalte} slissar, avvik ${verst.toFixed(6)} mm`)
}
{
  const min: Vec3 = [-225, -225, 0]
  const max: Vec3 = [225, 225, 450]
  const S = 450
  const t = 12
  for (const bog of [0.3, 0.7, 0.999]) {
    const r = ramme({ o: [0.5, 0.5, 0.5], n: [0, -1, 0], bog }, min, max)
    const o: Pt[] = ([[-0.42, 0.42], [0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]] as Pt[]).map(([x, y]): Pt => [x * S, y * S])
    const s2 = newSoup()
    ribSolid(s2, { r, outlines: [o], holes: [] }, t)
    const R = Math.abs(1 / r.k)
    const sentrum: Vec3 = [r.o[0] + r.n[0] * (1 / r.k), r.o[1] + r.n[1] * (1 / r.k), r.o[2] + r.n[2] * (1 / r.k)]
    const radius = (q: Vec3) => {
      const d: Vec3 = [q[0] - sentrum[0], q[1] - sentrum[1], q[2] - sentrum[2]]
      const langs = d[0] * r.v[0] + d[1] * r.v[1] + d[2] * r.v[2]
      return Math.hypot(d[0] - langs * r.v[0], d[1] - langs * r.v[1], d[2] - langs * r.v[2])
    }
    const pkt = (i: number): Vec3 => [s2.pos[3 * i], s2.pos[3 * i + 1], s2.pos[3 * i + 2]]
    let verst = 0
    for (let i = 0; i + 2 < s2.pos.length / 3; i += 3) {
      const a = pkt(i)
      const b = pkt(i + 1)
      const c = pkt(i + 2)
      for (const [x, y] of [[a, b], [b, c], [c, a]] as [Vec3, Vec3][]) {
        if (Math.abs(radius(x) - radius(y)) > 0.01) continue
        const m: Vec3 = [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2]
        const rm = radius(m)
        verst = Math.max(verst, Math.min(Math.abs(rm - (R - t / 2)), Math.abs(rm - (R + t / 2))))
      }
    }
    const ok = verst < 0.2
    if (!ok) brot++
    console.log(`${ok ? "ok" : "FEIL"} bøygd mesh, bog ${bog}: R ${R.toFixed(0)} mm, verste kant ${verst.toFixed(3)} mm frå sylinderen`)
  }
}

console.log(`${samla.toFixed(0)} ms geometri for tolv konstruksjonar; ${brot} feil`)
process.exit(brot ? 1 : 0)
