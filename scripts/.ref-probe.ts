// Referansane som motor: kvar krakk som planliste, og kva motoren gjer med han.
import { writeFileSync, mkdirSync } from "node:fs"
import { makeBygg } from "../lib/bygg"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { inn, norm3, ramme, skrivPlan, type Plan } from "../lib/plan"
import { DETAIL } from "../lib/snitt"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { slisseGods } from "../lib/tapp"
import type { Pt, Vec3 } from "../lib/core"

type P3 = [number, number, number]
function lag(S: number) {
  const min: Vec3 = [-S / 2, -S / 2, 0], max: Vec3 = [S / 2, S / 2, S]
  const plate = (id: number, o: P3, n: P3, pts: P3[], ekstra: Partial<Plan> = {}): Plan => {
    const nn = norm3(n)
    const of: Vec3 = [(o[0] - min[0]) / S, (o[1] - min[1]) / S, (o[2] - min[2]) / S]
    const r = ramme({ o: of, n: nn }, min, max)
    const omriss = pts.map((p) => { const q = inn(r, p); return [+(q[0] / S).toFixed(5), +(q[1] / S).toFixed(5)] as Pt })
    return { id, o: of, n: nn, bog: 0, strek: [], omriss, ...ekstra }
  }
  return { min, max, plate }
}
const bue = (cx: number, cz: number, rx: number, rz: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cz + rz * Math.sin(a)] })

const T = 12
const design: Record<string, { S: number; plan: (p: ReturnType<typeof lag>["plate"]) => Plan[] }> = {
  // 2: bogesider med ovalt hol, setet MELLOM sidene, gjennomgåande tappar
  boge: { S: 450, plan: (plate) => {
    const side: [number, number][] = [[-150, 440], [150, 440], [180, 0], [110, 0], ...bue(0, 0, 110, 150, 0, Math.PI, 10).slice(1, -1), [-110, 0], [-180, 0]]
    const y = (yy: number) => side.map(([x, z]) => [x, yy, z] as P3)
    return [
      plate(1, [0, -150, 220], [0, 1, 0], y(-150)),
      plate(2, [0, 150, 220], [0, 1, 0], y(150)),
      plate(3, [0, 0, 400], [0, 0, 1], [[-140, -156, 400], [140, -156, 400], [140, 156, 400], [-140, 156, 400]]),
      plate(4, [-120, 0, 350], [1, 0, 0], [[-120, -144, 320], [-120, 144, 320], [-120, 144, 380], [-120, -144, 380]]),
    ]
  } },
  // 4: tre C-bein langs x, stag gjennom alle tre
  cbein: { S: 450, plan: (plate) => {
    const c: [number, number][] = [[-150, 0], [150, 0], [150, 40], [-90, 40], [-90, 400], [150, 400], [150, 440], [-150, 440]]
    const leg = (id: number, x: number) => plate(id, [x, 0, 220], [1, 0, 0], c.map(([y, z]) => [x, y, z] as P3))
    return [
      leg(1, -150), leg(2, 0), leg(3, 150),
      plate(4, [0, -120, 200], [0, 1, 0], [[-200, -120, 150], [200, -120, 150], [200, -120, 250], [-200, -120, 250]]),
      plate(5, [0, 0, 446], [0, 0, 1], [[-200, -150, 446], [200, -150, 446], [200, 150, 446], [-200, 150, 446]]),
    ]
  } },
  // 5: gyngekrakk
  gynge: { S: 450, plan: (plate) => {
    const R = 700
    const botn = Array.from({ length: 13 }, (_, i) => { const x = 220 - (440 * i) / 12; return [x, R - Math.sqrt(R * R - x * x)] as [number, number] })
    const side: [number, number][] = [[-140, 420], [140, 420], ...botn, ]
    const y = (yy: number) => side.map(([x, z]) => [x, yy, z] as P3)
    return [
      plate(1, [0, -140, 220], [0, 1, 0], y(-140)),
      plate(2, [0, 140, 220], [0, 1, 0], y(140)),
      plate(3, [0, 0, 426], [0, 0, 1], [[-170, -170, 426], [170, -170, 426], [170, 170, 426], [-170, 170, 426]]),
      plate(4, [100, 0, 230], [1, 0, 0], [[100, -134, 200], [100, 134, 200], [100, 134, 260], [100, -134, 260]]),
      plate(5, [-100, 0, 230], [1, 0, 0], [[-100, -134, 200], [-100, 134, 200], [-100, 134, 260], [-100, -134, 260]]),
    ]
  } },
  // 6: armstol, rygg på skrå mellom stolpane
  arm: { S: 800, plan: (plate) => {
    const side: [number, number][] = [[-300, 0], [-240, 0], [-240, 340], [200, 340], [200, 0], [280, 0], [310, 760], [230, 760], [216, 560], [-300, 560]]
    const y = (yy: number) => side.map(([x, z]) => [x, yy, z] as P3)
    const a = (12 * Math.PI) / 180
    const d: P3 = [Math.sin(a), 0, Math.cos(a)]
    const nr: P3 = [Math.cos(a), 0, -Math.sin(a)]
    const o: P3 = [262, 0, 660]
    const ps = (s: number, yy: number): P3 => [o[0] + d[0] * s, yy, o[2] + d[2] * s]
    const vindauge = (yy: number): Plan["strek"] => {
      // hol i sida: x −240…195, z 420…500, i ramma til normal y (a = −x)
      return [{ slag: "hol", form: "rekt", x: +(-(-240 + 195) / 2 / 800).toFixed(5), y: +((460 - 400) / 800).toFixed(5), w: +(435 / 800).toFixed(5), h: +(80 / 800).toFixed(5), a: 0 }]
    }
    return [
      plate(1, [0, -250, 400], [0, 1, 0], y(-250), { strek: vindauge(-250) }),
      plate(2, [0, 250, 400], [0, 1, 0], y(250), { strek: vindauge(250) }),
      plate(3, [0, 0, 380], [0, 0, 1], [[-290, -256, 380], [190, -256, 380], [190, 256, 380], [-290, 256, 380]]),
      plate(4, o, nr, [ps(-80, -256), ps(80, -256), ps(80, 256), ps(-80, 256)]),
      plate(5, [-270, 0, 130], [1, 0, 0], [[-270, -256, 100], [-270, 256, 100], [-270, 256, 160], [-270, -256, 160]]),
    ]
  } },
  // 7: trekantkrakk, tre bein på 120°, hylle med synlege tappar
  trekant: { S: 450, plan: (plate) => {
    const r = 120
    const l: Plan[] = []
    for (let i = 0; i < 3; i++) {
      const v = (Math.PI / 2) + (i * 2 * Math.PI) / 3
      const n: P3 = [Math.cos(v), Math.sin(v), 0], tg: P3 = [-Math.sin(v), Math.cos(v), 0]
      const c: P3 = [n[0] * r, n[1] * r, 220]
      const pt = (s: number, z: number): P3 => [c[0] + tg[0] * s, c[1] + tg[1] * s, z]
      l.push(plate(i + 1, c, n, [pt(-110, 440), pt(110, 440), pt(130, 0), pt(50, 0), pt(0, 80), pt(-50, 0), pt(-130, 0)]))
    }
    const tri = (rr: number, z: number): P3[] => [0, 1, 2].map((i) => { const v = -Math.PI / 2 + (i * 2 * Math.PI) / 3; return [2 * rr * Math.cos(v), 2 * rr * Math.sin(v), z] as P3 })
    l.push(plate(4, [0, 0, 446], [0, 0, 1], tri(132, 446)))
    l.push(plate(5, [0, 0, 160], [0, 0, 1], tri(r + T / 2, 160)))
    return l
  } },
  // 8: sete av lameller
  lamell: { S: 450, plan: (plate) => {
    const side: [number, number][] = [[-150, 440], [150, 440], [190, 0], [60, 0], [0, 110], [-60, 0], [-190, 0]]
    const y = (yy: number) => side.map(([x, z]) => [x, yy, z] as P3)
    const l: Plan[] = [plate(1, [0, -150, 220], [0, 1, 0], y(-150)), plate(2, [0, 150, 220], [0, 1, 0], y(150))]
    for (let i = 0; i < 5; i++) {
      const x = -140 + i * 70
      l.push(plate(3 + i, [x, 0, 446], [0, 0, 1], [[x - 30, -175, 446], [x + 30, -175, 446], [x + 30, 175, 446], [x - 30, 175, 446]]))
    }
    l.push(plate(8, [120, 0, 120], [1, 0, 0], [[120, -144, 90], [120, 144, 90], [120, 144, 150], [120, -144, 150]]))
    return l
  } },
  // 9: sekskantsete på to kryssande bein
  sekskant: { S: 450, plan: (plate) => {
    const bein: [number, number][] = [[-170, 440], [170, 440], [170, 0], [100, 0], ...bue(0, 0, 100, 120, 0, Math.PI, 8).slice(1, -1), [-100, 0], [-170, 0]]
    const hex: P3[] = Array.from({ length: 6 }, (_, i) => { const v = (i * Math.PI) / 3; return [195 * Math.cos(v), 195 * Math.sin(v), 446] as P3 })
    return [
      plate(1, [0, 0, 220], [0, 1, 0], bein.map(([x, z]) => [x, 0, z] as P3)),
      plate(2, [0, 0, 220], [1, 0, 0], bein.map(([y, z]) => [0, y, z] as P3)),
      plate(3, [0, 0, 446], [0, 0, 1], hex),
    ]
  } },
}

const ut = "/tmp/claude-0/ref-probe"
mkdirSync(ut, { recursive: true })
const kun = process.argv.slice(2)
for (const [namn, d] of Object.entries(design)) {
  if (kun.length && !kun.includes(namn)) continue
  const { plate } = lag(d.S)
  const plan = d.plan(plate)
  const p: Params = { ...DEFAULT_PARAMS, storleik: d.S, tjukn: T, skal: false, arkB: 1000, arkH: 1000, plan: skrivPlan(plan) } as Params
  const t0 = performance.now()
  let b
  try { b = makeBygg(p, DETAIL.mid) } catch (e) { console.log(namn, "KRASJ", e); continue }
  const ms = performance.now() - t0
  const m = measure(p)
  const reglar = checkRules(p, m).filter((r) => !r.ok).map((r) => `${r.hard ? "HARD" : "mjuk"} ${r.id} ${r.value}`)
  const tynne: string[] = []
  for (const r of b.s.ribber) for (const q of r.tapp) if (q.slag === "slisse") {
    const g = slisseGods([q], [...r.outlines, ...r.holes])
    if (g < 14) tynne.push(`${r.plan.id}:${g.toFixed(1)}`)
  }
  console.log(`\n== ${namn} (${ms.toFixed(0)} ms): ledd ${b.s.ledd}, tappar ${b.s.tappar}, delar ${b.dl.delar.length}, lause ${b.dl.lause}, ark ${b.ns.sheets.length}, orden ${b.s.montering.orden}, brot ${b.s.montering.brot}, klem ${b.s.montering.klem.length}`)
  for (const r of b.s.ribber) console.log(`  ${r.plan.id}: ${r.tapp.map((q) => `${q.slag}→${q.mot}`).join(" ") || "-"} · spor ${r.spor.map((s) => `→${s.mot ?? "?"}`).join(" ")} · omriss ${r.outlines.length} hol ${r.holes.length}`)
  for (const s of reglar) console.log("  " + s)
  if (tynne.length) console.log("  tynne veggar", tynne.join(" "))
  const hash = encodeURIComponent(JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k, v]) => (DEFAULT_PARAMS as any)[k] !== v))))
  writeFileSync(`${ut}/${namn}.txt`, hash)
}
