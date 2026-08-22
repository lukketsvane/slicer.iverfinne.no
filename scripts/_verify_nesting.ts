/** THROWAWAY verifier - delete after use. */
import { bbox, offsetPoly, type Pt } from "../lib/core"
import { pack } from "../lib/pack"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const ux=b[0]-a[0], uy=b[1]-a[1], vx=d[0]-c[0], vy=d[1]-c[1]
  const wx=a[0]-c[0], wy=a[1]-c[1]
  const A=ux*ux+uy*uy, B=ux*vx+uy*vy, C=vx*vx+vy*vy, D=ux*wx+uy*wy, E=vx*wx+vy*wy
  const den=A*C-B*B
  let s=0,t=0
  if(den<1e-12){s=0;t=C>1e-12?E/C:0}else{s=(B*E-C*D)/den;t=(A*E-B*D)/den}
  s=Math.max(0,Math.min(1,s)); t=Math.max(0,Math.min(1,t))
  t=C>1e-12?Math.max(0,Math.min(1,(B*s+E)/C)):t
  s=A>1e-12?Math.max(0,Math.min(1,(B*t-D)/A)):s
  return Math.hypot(a[0]+s*ux-(c[0]+t*vx), a[1]+s*uy-(c[1]+t*vy))
}
function ringDist(r1:Pt[],r2:Pt[]){let b=Infinity
  for(let i=0;i<r1.length;i++)for(let j=0;j<r2.length;j++){
    const q=segSeg(r1[i],r1[(i+1)%r1.length],r2[j],r2[(j+1)%r2.length]); if(q<b)b=q}
  return b}

function measure(namn: string, p: Params) {
  const { ns } = makePlan(p, DETAIL.mid)
  const gap = nestGap(p)
  const kerf = p.snittveg ? 0 : p.snitt
  let nomMin = Infinity, cutMin = Infinity, where = ""
  for (const sh of ns.sheets) {
    const nom = sh.placed.map((q) => placedRings(q).outline)
    const cut = nom.map((o) => offsetPoly(o, kerf / 2))
    for (let a = 0; a < nom.length; a++) for (let c = a + 1; c < nom.length; c++) {
      const ba = bbox(nom[a]), bb = bbox(nom[c])
      if (ba.x0 > bb.x1 + gap*4 || bb.x0 > ba.x1 + gap*4) continue
      if (ba.y0 > bb.y1 + gap*4 || bb.y0 > ba.y1 + gap*4) continue
      const dn = ringDist(nom[a], nom[c])
      if (dn < nomMin) { nomMin = dn; where = `${sh.placed[a].part.from}/${sh.placed[c].part.from}` }
      const dc = ringDist(cut[a], cut[c]); if (dc < cutMin) cutMin = dc
    }
  }
  const res = Math.min(6, Math.max(gap/3, Math.max(p.arkB,p.arkH)/620, 1))
  const k = Math.max(1, Math.ceil(gap/2/res))
  const bad = nomMin < gap - 0.01
  console.log(`${bad?"VIOLATION":"  ok     "} ${namn.padEnd(30)} gap=${gap.toFixed(1)} res=${res.toFixed(2)} k=${k} `+
    `nominal=${nomMin.toFixed(2)} cutpath=${cutMin.toFixed(2)} (${where})`)
  return { gap, nomMin, cutMin }
}

function kule(r:number,seg:number,strekk=1){const pos:number[]=[]
  const at=(i:number,j:number):[number,number,number]=>{const th=(i/seg)*Math.PI*2, ph=(j/seg)*Math.PI
    return [r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th), r*Math.cos(ph)*strekk]}
  for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1)
    pos.push(...a,...b,...c,...a,...c,...d)}
  return makeSoup(new Float32Array(pos))}
put("kule","kule",kule(50,48)); put("egg","egg",kule(50,48,1.7))

console.log("=== CLAIM 2 real pipeline: router fres=6, snittveg=1 (machine applies kerf) ===")
for (const [w,h] of [[2440,1220],[2500,1250],[3000,1500]] as const) {
  const r = measure(`kule fres6 mach ${w}x${h}`, { ...DEFAULT_PARAMS, kjelde:"kule", ribbX:12, ribbY:12,
    storleik:600, tjukn:12, fres:6, snittveg:1, arkB:w, arkH:h })
  console.log(`      -> gods between the two 6 mm cutter swaths: ${(r.nomMin-6).toFixed(2)} mm`)
}
console.log("\n=== CLAIM 2 real pipeline: laser gap 4 on big sheets ===")
measure("kube 12x12 1250x750", { ...DEFAULT_PARAMS, ribbX:12, ribbY:12, storleik:400, arkB:1250, arkH:750 })
measure("kube 12x12 1600x1000", { ...DEFAULT_PARAMS, ribbX:12, ribbY:12, storleik:400, arkB:1600, arkH:1000 })
