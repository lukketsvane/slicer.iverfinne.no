import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS } from "../lib/params"
import { rutenett, skrivPlan, type Plan } from "../lib/plan"
import type { ParamBag } from "../lib/core"
import { put } from "../lib/sources"
import { makeSoup } from "../lib/soup"
import { eiKjelde, skrivScene } from "../lib/scene"
import { makeKropp } from "../lib/kropp"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))
const ms = (f: () => unknown) => { const t = Date.now(); f(); return Date.now() - t }
function boks(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number): number[] {
  const p:number[]=[]; const V=(x:number,y:number,z:number)=>[x,y,z]
  const s=[[V(x0,y0,z0),V(x1,y0,z0),V(x1,y1,z0),V(x0,y1,z0)],[V(x0,y0,z1),V(x0,y1,z1),V(x1,y1,z1),V(x1,y0,z1)],[V(x0,y0,z0),V(x0,y1,z0),V(x0,y1,z1),V(x0,y0,z1)],[V(x1,y0,z0),V(x1,y0,z1),V(x1,y1,z1),V(x1,y1,z0)],[V(x0,y0,z0),V(x0,y0,z1),V(x1,y0,z1),V(x1,y0,z0)],[V(x0,y1,z0),V(x1,y1,z0),V(x1,y1,z1),V(x0,y1,z1)]]
  for(const f of s){p.push(...f[0],...f[1],...f[2]);p.push(...f[0],...f[2],...f[3])}
  return p
}
const mk = (setebreidd: number) => {
  const a: number[] = []
  const h = setebreidd/2
  a.push(...boks(-h,-h,89,h,h,100))
  const c = h - 11
  for (const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const) a.push(...boks(sx*c-5.5, sy*c-5.5, 0, sx*c+5.5, sy*c+5.5, 91))
  return makeSoup(new Float32Array(a))
}
put("k80","k80", mk(80))
function kjor(namn: string, over: Record<string, unknown>) {
  const p = { ...DEFAULT_PARAMS, ...over } as unknown as ParamBag
  const m = MOTOR.measure(p)
  const r = MOTOR.rules(p, m)
  const raude = r.filter((x) => x.hard && !x.ok).map((x) => `${x.label}=${x.value}${x.fiks?` [${x.fiks.ord}]`:""}`)
  console.log(`${namn.padEnd(28)} delar=${String(m.parts).padStart(3)} ledd=${String(m.joints).padStart(3)} ark=${String(m.sheets).padStart(3)} env=${m.envX.toFixed(0)}x${m.envY.toFixed(0)}x${m.envZ.toFixed(0)} | ${raude.length?"RAUDT: "+raude.join(" ; "):"grønt"}`)
}
const seks: Plan[] = [
  {id:1,o:[0.18,0.5,0.5],n:[1,0,0],strek:[]},{id:2,o:[0.5,0.5,0.5],n:[1,0,0],strek:[]},{id:3,o:[0.82,0.5,0.5],n:[1,0,0],strek:[]},
  {id:4,o:[0.5,0.18,0.5],n:[0,1,0],strek:[]},{id:5,o:[0.5,0.5,0.5],n:[0,1,0],strek:[]},{id:6,o:[0.5,0.82,0.5],n:[0,1,0],strek:[]},
]
kjor("k80 450 seks ribber", {kjelde:"k80", scene: eiKjelde("k80"), storleik:450, plan: skrivPlan(seks)})
kjor("k80 450 4x4", {kjelde:"k80", scene: eiKjelde("k80"), storleik:450, plan: nett(4,4)})
kjor("k80 450 5x5", {kjelde:"k80", scene: eiKjelde("k80"), storleik:450, plan: nett(5,5)})

// prisen på EIN FRAME av eit bit-drag: scena endrar seg, so NETT_HUGS bommar
const femBitar = (dx: number) => skrivScene([
  {id:"kube", t:[0,0,0], s:1, rz:0},
  {id:"sylinder", t:[dx,0,0], s:0.4, rz:0},
  {id:"sylinder", t:[-120,0,0], s:0.4, rz:0},
  {id:"sylinder", t:[0,120,0], s:0.4, rz:0},
  {id:"sylinder", t:[0,-120,0], s:0.4, rz:0},
])
let sum = 0
for (let i = 0; i < 20; i++) {
  const p = {...DEFAULT_PARAMS, scene: femBitar(100 + i), storleik: 450, plan: nett(5,5)} as unknown as ParamBag
  sum += ms(() => { makeKropp(p as never) })
}
console.log(`fem primitiv-bitar, kropp per frame i eit drag: ${(sum/20).toFixed(1)} ms`)
let sum2 = 0
for (let i = 0; i < 10; i++) {
  const p = {...DEFAULT_PARAMS, scene: femBitar(100 + i), storleik: 450, plan: nett(5,5)} as unknown as ParamBag
  sum2 += ms(() => MOTOR.build(p, "lav", "lag"))
}
console.log(`same, heilt lavt bygg (kropp + snitt 120) per frame: ${(sum2/10).toFixed(1)} ms`)
