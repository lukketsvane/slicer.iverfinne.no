/** THROWAWAY verifier - delete after use. */
import { bbox, offsetPoly, type Pt } from "../lib/core"
import { apply, pack } from "../lib/pack"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

// ---- true segment-to-segment distance -------------------------------------
function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const ux = b[0] - a[0], uy = b[1] - a[1]
  const vx = d[0] - c[0], vy = d[1] - c[1]
  const wx = a[0] - c[0], wy = a[1] - c[1]
  const A = ux * ux + uy * uy, B = ux * vx + uy * vy, C = vx * vx + vy * vy
  const D = ux * wx + uy * wy, E = vx * wx + vy * wy
  const den = A * C - B * B
  let s: number, t: number
  if (den < 1e-12) { s = 0; t = C > 1e-12 ? E / C : 0 }
  else { s = (B * E - C * D) / den; t = (A * E - B * D) / den }
  s = Math.max(0, Math.min(1, s)); t = Math.max(0, Math.min(1, t))
  // refine after clamping
  s = C > 1e-12 ? Math.max(0, Math.min(1, (B * t - D) / (A || 1))) : s
  t = C > 1e-12 ? Math.max(0, Math.min(1, (B * s + E) / C)) : t
  const px = a[0] + s * ux - (c[0] + t * vx)
  const py = a[1] + s * uy - (c[1] + t * vy)
  return Math.hypot(px, py)
}
function ringRingDist(r1: Pt[], r2: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < r1.length; i++) {
    const a = r1[i], b = r1[(i + 1) % r1.length]
    for (let j = 0; j < r2.length; j++) {
      const c = r2[j], d = r2[(j + 1) % r2.length]
      const q = segSeg(a, b, c, d)
      if (q < best) best = q
    }
  }
  return best
}

function measure(namn: string, p: Params) {
  const { ns } = makePlan(p, DETAIL.mid)
  const gap = nestGap(p)
  const kerf = p.snittveg ? 0 : p.snitt
  let nomMin = Infinity   // nominal outline-to-outline
  let cutMin = Infinity   // exported (kerf-compensated) path-to-path
  let where = ""
  for (const sh of ns.sheets) {
    const nom = sh.placed.map((q) => placedRings(q).outline)
    const cut = nom.map((o) => offsetPoly(o, kerf / 2))
    for (let a = 0; a < nom.length; a++) {
      for (let c = a + 1; c < nom.length; c++) {
        const ba = bbox(nom[a]), bb = bbox(nom[c])
        if (ba.x0 > bb.x1 + gap * 4 || bb.x0 > ba.x1 + gap * 4) continue
        if (ba.y0 > bb.y1 + gap * 4 || bb.y0 > ba.y1 + gap * 4) continue
        const dn = ringRingDist(nom[a], nom[c])
        if (dn < nomMin) { nomMin = dn; where = `${sh.placed[a].part.from}/${sh.placed[c].part.from}` }
        const dc = ringRingDist(cut[a], cut[c])
        if (dc < cutMin) cutMin = dc
      }
    }
  }
  const gods = cutMin - kerf // material left after both cuts eat kerf/2 each side
  const bad = nomMin < gap - 0.01
  console.log(
    `${bad ? "VIOLATION" : "  ok     "} ${namn.padEnd(28)} gap=${gap.toFixed(2)} ` +
      `nominal=${nomMin.toFixed(2)} cutpath=${cutMin.toFixed(2)} gods=${gods.toFixed(2)} (${where})`,
  )
  return { gap, nomMin, cutMin, gods }
}

function kule(r: number, seg: number, strekk = 1) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2, ph = (j / seg) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) * strekk]
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
    pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  return makeSoup(new Float32Array(pos))
}
put("kule", "kule", kule(50, 48))
put("egg", "egg", kule(50, 48, 1.7))

console.log("=== CLAIM 1: kerf vs nestGap ===")
console.log("nestGap source:", nestGap.toString())
measure("c1 cube fres6 snitt6", { ...DEFAULT_PARAMS, fres: 6, snitt: 6, tjukn: 9, leddtype: 1 })
measure("c1 egg fres6 snitt6", { ...DEFAULT_PARAMS, kjelde: "egg", ribbX: 8, ribbY: 8, fres: 6, snitt: 6, tjukn: 9, leddtype: 1 })

console.log("\n=== CLAIM 2: raster clearance on large sheets ===")
for (const [w, h] of [[600, 400], [1250, 750], [1600, 1000], [2500, 1250]] as const) {
  const gap = 4
  const res = Math.min(6, Math.max(gap / 3, Math.max(w, h) / 620, 1))
  const k = Math.max(1, Math.ceil(gap / 2 / res))
  console.log(`  sheet ${w}x${h}: res=${res.toFixed(3)} k=${k} guarantee(2k-1)*res=${((2 * k - 1) * res).toFixed(2)} vs gap=${gap}`)
}
measure("c2 kule 600x400", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10 })
measure("c2 kule 1250x750", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10, arkB: 1250, arkH: 750 })
measure("c2 kule 1600x1000", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10, arkB: 1600, arkH: 1000 })
measure("c2 kule 2500x1250", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10, arkB: 2500, arkH: 1250 })
