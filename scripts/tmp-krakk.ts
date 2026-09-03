import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS } from "../lib/params"
import { rutenett, skrivPlan, type Plan } from "../lib/plan"
import type { ParamBag, Vec3 } from "../lib/core"
import { put } from "../lib/sources"
import { makeSoup, type Soup } from "../lib/soup"
import { eiKjelde } from "../lib/scene"

const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))
const ms = (f: () => unknown) => { const t = Date.now(); f(); return Date.now() - t }

// same maskineriet som lib/sources.ts brukar
function rotasjon(profil: (v: number) => [number, number], n = 48, m = 48): Soup {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / n) * Math.PI * 2
    const [r, z] = profil(Math.min(1, j / m))
    return [r * Math.cos(th), r * Math.sin(th), z]
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
    pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  return makeSoup(new Float32Array(pos))
}
// stykkevis lineær profil frå ei liste (r, z) ovanfrå og ned
const linje = (pkt: [number, number][]) => (v: number): [number, number] => {
  const t = v * (pkt.length - 1)
  const i = Math.min(pkt.length - 2, Math.floor(t))
  const f = t - i
  return [pkt[i][0] + (pkt[i + 1][0] - pkt[i][0]) * f, pkt[i][1] + (pkt[i + 1][1] - pkt[i][1]) * f]
}

// design 1: sete r0->34 @100, kant til z=88, midje r22 @55, flare r38 @4, botn r38->0
put("krakk1", "krakk1", rotasjon(linje([[0, 100], [34, 100], [34, 88], [22, 55], [38, 4], [38, 0], [0, 0]])))
// design 3: r36 @100, r36 @90, r42 @0
put("krakk3", "krakk3", rotasjon(linje([[0, 100], [36, 100], [36, 90], [42, 0], [0, 0]])))

// design 4: fem boksar — sete 400x400x50 over fire bein 50x50x460, rom 360x360x450
function boks(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const p: number[] = []
  const q = (a: Vec3, b: Vec3, c: Vec3) => p.push(...a, ...b, ...c)
  const V = (x: number, y: number, z: number) => [x, y, z] as Vec3
  const s = [
    [V(x0,y0,z0),V(x1,y0,z0),V(x1,y1,z0),V(x0,y1,z0)], // botn (ned)
    [V(x0,y0,z1),V(x0,y1,z1),V(x1,y1,z1),V(x1,y0,z1)], // topp
    [V(x0,y0,z0),V(x0,y1,z0),V(x0,y1,z1),V(x0,y0,z1)],
    [V(x1,y0,z0),V(x1,y0,z1),V(x1,y1,z1),V(x1,y1,z0)],
    [V(x0,y0,z0),V(x0,y0,z1),V(x1,y0,z1),V(x1,y0,z0)],
    [V(x0,y1,z0),V(x1,y1,z0),V(x1,y1,z1),V(x0,y1,z1)],
  ]
  for (const f of s) { q(f[0], f[1], f[2]); q(f[0], f[2], f[3]) }
  return p
}
const krakk4: number[] = []
// i 100-eininga: sete 89x89x11 på toppen, fire bein 11x11x91 innafor
krakk4.push(...boks(-44.5, -44.5, 89, 44.5, 44.5, 100))
for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
  const cx = sx * 33, cy = sy * 33
  krakk4.push(...boks(cx - 5.5, cy - 5.5, 0, cx + 5.5, cy + 5.5, 91))
}
put("krakk4", "krakk4", makeSoup(new Float32Array(krakk4)))

function kjor(namn: string, over: Record<string, unknown>) {
  const p = { ...DEFAULT_PARAMS, ...over } as unknown as ParamBag
  const tM = ms(() => MOTOR.measure(p))
  const m = MOTOR.measure(p)
  const r = MOTOR.rules(p, m)
  const tMid = ms(() => MOTOR.build(p, "mid", "lag"))
  const raude = r.filter((x) => x.hard && !x.ok).map((x) => `${x.label}=${x.value}${x.fiks ? ` [${x.fiks.ord}]` : ""}`)
  console.log(`${namn.padEnd(26)} delar=${String(m.parts).padStart(3)} ledd=${String(m.joints).padStart(3)} lause=${String(m.loose ?? "-").padStart(2)} ark=${String(m.sheets).padStart(3)} kutt=${(m.cutLen/1000).toFixed(1)}m env=${m.envX.toFixed(0)}x${m.envY.toFixed(0)}x${m.envZ.toFixed(0)} | fyrste ${String(tM).padStart(4)}ms mid ${String(tMid).padStart(4)}ms | ${raude.length ? "RAUDT: " + raude.join(" ; ") : "grønt"}`)
}

for (const id of ["krakk1", "krakk3", "krakk4"]) {
  for (const n of [4, 5, 6, 7]) {
    kjor(`${id} 450 ${n}x${n}`, { kjelde: id, scene: eiKjelde(id), storleik: 450, plan: nett(n, n) })
  }
}
// design 4: seks ribber, tre kvar veg, på boksekrakken
const seks: Plan[] = [
  { id: 1, o: [0.18, 0.5, 0.5], n: [1, 0, 0], strek: [] },
  { id: 2, o: [0.5, 0.5, 0.5], n: [1, 0, 0], strek: [] },
  { id: 3, o: [0.82, 0.5, 0.5], n: [1, 0, 0], strek: [] },
  { id: 4, o: [0.5, 0.18, 0.5], n: [0, 1, 0], strek: [] },
  { id: 5, o: [0.5, 0.5, 0.5], n: [0, 1, 0], strek: [] },
  { id: 6, o: [0.5, 0.82, 0.5], n: [0, 1, 0], strek: [] },
]
kjor("krakk4 450 seks ribber", { kjelde: "krakk4", scene: eiKjelde("krakk4"), storleik: 450, plan: skrivPlan(seks) })
