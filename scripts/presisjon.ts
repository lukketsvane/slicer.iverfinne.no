import { readFileSync } from "node:fs"
import { makeBygg } from "../lib/bygg"
import { makeKropp } from "../lib/kropp"
import type { Pt, Vec3 } from "../lib/core"
import { apply } from "../lib/pack"
import { sheetSvg } from "../lib/export-svg"
import { DEFAULT_PARAMS } from "../lib/params"
import { ramme, rutenett, skrivPlan, type Plan } from "../lib/plan"
import { newSoup, ribSolid } from "../lib/mesh"
import { buildSnitt, DETAIL, sporPunkt, stykkeLangs, type Spor } from "../lib/snitt"
import { sporInn } from "../lib/stykke"
import { put } from "../lib/sources"
import { parseMesh } from "../lib/io"

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

function tilKant(ringar: Pt[][], p: Pt): number {
  let best = Infinity
  for (const r of ringar) for (let i = 0; i < r.length; i++) {
    const a = r[i]
    const b = r[(i + 1) % r.length]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)))
    best = Math.min(best, Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t))
  }
  return best
}

function sete(q: Spor, ringar: Pt[][], band: number): number {
  const inn = Math.sign(q.munn - q.botn)
  let midt = Infinity
  let topp = NaN
  for (const r of ringar) {
    const n = r.length
    const f = r.map(p => sporInn(q.p[0], q.p[1], q.d[0], q.d[1], q.k, p[0], p[1]))
    const S = f.map(v => inn * (v[0] - q.botn))
    const C = f.map(v => v[1])
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      if (C[i] * C[j] > 0 || Math.max(Math.abs(C[i]), Math.abs(C[j])) > 2 * q.w) continue
      const s0 = S[i] + (S[j] - S[i]) * (C[i] / (C[i] - C[j] || 1))
      if (Math.abs(s0) >= Math.abs(midt)) continue
      midt = s0
      topp = s0
      for (const [fraa, steg] of [[j, 1], [i, n - 1]]) {
        let fs = s0
        let fc = 0
        for (let g = 0, v = fraa; g < n; g++, v = (v + steg) % n) {
          const c = Math.abs(C[v])
          if (c > band) {
            topp = Math.max(topp, fs + (S[v] - fs) * ((band - fc) / (c - fc)))
            break
          }
          topp = Math.max(topp, S[v])
          fs = S[v]
          fc = c
        }
      }
    }
  }
  return topp
}

function kryssar(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

const flate = (id: number, o: Vec3, n: Vec3, meir: Partial<Plan> = {}): Plan => ({ id, o, n, bog: 0, strek: [], ...meir })
const golv = (id: number, z: number) => flate(id, [0.5, 0.5, z], [0, 0, 1])
const halvribbe = (i: number) => {
  const a = ((i + 0.5) * Math.PI) / 4
  return flate(3 + i, [0.5, 0.5, 0], [Math.sin(a), -Math.cos(a), 0], { nett: true, omriss: [[0.2, -0.1], [1, -0.1], [1, 1.1], [0.2, 1.1]] })
}
const langs = (q: Spor) => !q.k && (Math.abs(q.d[0]) < 1e-8 || Math.abs(q.d[1]) < 1e-8)
const BOTNAR: [string, string, number, (q: Spor) => boolean][] = [
  ["langs aksane", skrivPlan(rutenett(3, 3)), 9, langs],
  ["skrått 45°", skrivPlan([...rutenett(2, 0), flate(3, [0.5, 0.5, 0.5], [0, 1, 1]), flate(4, [0.5, 0.5, 0.25], [0, 1, 1])]), 4, q => !q.k && Math.abs(Math.abs(q.d[0]) - Math.SQRT1_2) < 1e-4],
  ["radialt, halvribber på ringar", skrivPlan([...[2, 3, 4, 5].map(halvribbe), golv(1, 0.35), golv(2, 0.65), ...[0, 1, 6, 7].map(halvribbe)]), 16, q => !q.k && !langs(q)],
  ["boge, bøygd plan med golv", skrivPlan([flate(1, [0.7, 0.5, 0.5], [1, 0, 0], { bog: 2 }), golv(2, 0.5)]), 1, q => q.k !== 0],
]
for (const [namn, botnplan, ledd, slag] of BOTNAR) {
  for (const storleik of [150, 300, 600]) {
    for (const tjukn of [3, 6]) {
      const b = makeBygg({ ...DEFAULT_PARAMS, storleik, tjukn, plan: botnplan, arkB: 1500, arkH: 1500 }, DETAIL.mid)
      let hjorne = 0
      let stogg = 0
      let maalte = 0
      let avSlaget = 0
      let sjolvkryss = 0
      let overkutt = 0
      b.ns.sheets.forEach((ark, i) => {
        const les = (snitt: number) => [...sheetSvg(b.ns, i, snitt).matchAll(/<path d="([^"]+)Z"/g)].map(m => m[1].replace(/[ML]/g, " ").trim().split(/\s+/).map(p => p.split(",").map(Number) as Pt))
        const baner = les(0)
        const snittbaner = les(0.2)
        for (const del of ark.placed) {
          const m = del.slot.m
          const det = m[0] * m[4] - m[1] * m[3]
          const inn = (r: Pt[]) => r.map(([x, y]): Pt => [(m[4] * (x - m[2]) - m[1] * (y - m[5])) / det, (m[0] * (y - m[5]) - m[3] * (x - m[2])) / det])
          const ringar = baner.map(inn)
          const kutt = snittbaner.map(inn)
          for (const q of del.part.spor) {
            for (const side of [-1, 1]) {
              const c = sporPunkt(q, q.botn, (side * q.w) / 2)
              hjorne = Math.max(hjorne, tilKant(ringar, c))
              for (const r of kutt) {
                const naer = r.map((p, j): [Pt, Pt] => [p, r[(j + 1) % r.length]]).filter(l => l.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.5))
                naer.forEach(([u, v], j) => {
                  overkutt = Math.max(overkutt, 0.1 - tilKant(ringar, u))
                  for (const [x, y] of naer.slice(j + 1)) if (kryssar(u, v, x, y)) sjolvkryss++
                })
              }
            }
            stogg = Math.max(stogg, Math.abs(sete(q, ringar, (q.w * tjukn) / (2 * b.s.slotW))))
            maalte++
            if (slag(q)) avSlaget++
          }
        }
      })
      const ok = b.s.ledd === ledd && maalte === 2 * ledd && avSlaget > 0 && hjorne < 0.01 && stogg < 0.02 && sjolvkryss === 0 && overkutt < 0.01
      if (!ok) brot++
      console.log(`${ok ? "ok" : "FEIL"} sporbotn ${namn}, ${storleik} mm / ${tjukn} mm: ${b.s.ledd} ledd, ${avSlaget} av ${maalte} spor av slaget, hjørne ${hjorne.toFixed(3)} mm, plata stoggar ${stogg.toFixed(3)} mm frå delinga; snitt 0,2: ${sjolvkryss} sjølvkryss, ${Math.max(0, overkutt).toFixed(3)} mm forbi`)
    }
  }
}

{
  const fil = readFileSync("public/form/skulptur-01.glb")
  put("skulptur-01", "skulptur-01", parseMesh("skulptur-01.glb", fil.buffer.slice(fil.byteOffset, fil.byteOffset + fil.byteLength) as ArrayBuffer))
  const p = { ...DEFAULT_PARAMS, kjelde: "skulptur-01", storleik: 600, tjukn: 6, plan: skrivPlan(rutenett(6, 6)) }
  const [mid, hog] = [DETAIL.mid, DETAIL.hog].map(d => buildSnitt(makeKropp(p), p, d).ribber.reduce((a, r) => a + r.outlines.length, 0))
  if (mid !== hog) brot++
  console.log(`${mid === hog ? "ok" : "FEIL"} sporbotn ved tunt gods, skulptur-01 6x6, 600 mm / 6 mm: ${mid} omriss ved ${DETAIL.mid} celler, ${hog} ved ${DETAIL.hog}`)
}

console.log(`${samla.toFixed(0)} ms geometri for tolv konstruksjonar; ${brot} feil`)
process.exit(brot ? 1 : 0)
