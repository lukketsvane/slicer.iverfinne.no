/** THROWAWAY - sweep for worst real-pipeline router clearance. */
import { bbox, type Pt } from "../lib/core"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
function segSeg(a:Pt,b:Pt,c:Pt,d:Pt):number{
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],wx=a[0]-c[0],wy=a[1]-c[1]
  const A=ux*ux+uy*uy,B=ux*vx+uy*vy,C=vx*vx+vy*vy,D=ux*wx+uy*wy,E=vx*wx+vy*wy,den=A*C-B*B
  let s=0,t=0; if(den<1e-12){s=0;t=C>1e-12?E/C:0}else{s=(B*E-C*D)/den;t=(A*E-B*D)/den}
  s=Math.max(0,Math.min(1,s));t=Math.max(0,Math.min(1,t))
  t=C>1e-12?Math.max(0,Math.min(1,(B*s+E)/C)):t; s=A>1e-12?Math.max(0,Math.min(1,(B*t-D)/A)):s
  return Math.hypot(a[0]+s*ux-(c[0]+t*vx),a[1]+s*uy-(c[1]+t*vy))}
function ringDist(r1:Pt[],r2:Pt[]){let b=Infinity
  for(let i=0;i<r1.length;i++)for(let j=0;j<r2.length;j++){
    const q=segSeg(r1[i],r1[(i+1)%r1.length],r2[j],r2[(j+1)%r2.length]);if(q<b)b=q}return b}
function minNominal(p:Params){const {ns}=makePlan(p,DETAIL.mid);const gap=nestGap(p)
  let m=Infinity,w=""
  for(const sh of ns.sheets){const nom=sh.placed.map(q=>placedRings(q).outline)
    for(let a=0;a<nom.length;a++)for(let c=a+1;c<nom.length;c++){
      const ba=bbox(nom[a]),bb=bbox(nom[c])
      if(ba.x0>bb.x1+gap*4||bb.x0>ba.x1+gap*4)continue
      if(ba.y0>bb.y1+gap*4||bb.y0>ba.y1+gap*4)continue
      const d=ringDist(nom[a],nom[c]);if(d<m){m=d;w=`${sh.placed[a].part.from}/${sh.placed[c].part.from}`}}}
  return {gap,m,w,sheets:ns.sheets.length}}
function kule(r:number,seg:number,st=1){const pos:number[]=[]
  const at=(i:number,j:number):[number,number,number]=>{const th=(i/seg)*Math.PI*2,ph=(j/seg)*Math.PI
    return [r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph)*st]}
  for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1)
    pos.push(...a,...b,...c,...a,...c,...d)}return makeSoup(new Float32Array(pos))}
put("kule","kule",kule(50,48)); put("egg","egg",kule(50,48,1.7))

let worst = {gods: Infinity, desc: ""}
for (const kjelde of ["kube","kule","egg"])
for (const fres of [6,7])
for (const [w,h] of [[2500,1250],[2800,1400],[3000,1500]] as const)
for (const n of [10,12,14]) {
  const p:Params = {...DEFAULT_PARAMS, kjelde, ribbX:n, ribbY:n, storleik:700, tjukn:12,
    fres, snittveg:1, arkB:w, arkH:h}
  const r = minNominal(p)
  const res=Math.min(6,Math.max(r.gap/3,Math.max(w,h)/620,1)); const k=Math.max(1,Math.ceil(r.gap/2/res))
  const gods = r.m - fres // cutter dia removes fres/2 each side of nominal path
  const flag = r.m < r.gap-0.01 ? (gods<0?"OVERLAP":"under") : "ok"
  if (gods < worst.gods) worst = {gods, desc:`${kjelde} ${n}x${n} fres${fres} ${w}x${h} gap=${r.gap} nominal=${r.m.toFixed(2)} k=${k}`}
  if (flag!=="ok") console.log(`${flag.padEnd(8)} ${kjelde} ${n}x${n} fres=${fres} ${w}x${h} `+
    `gap=${r.gap} res=${res.toFixed(2)} k=${k} nominal=${r.m.toFixed(2)} gods=${gods.toFixed(2)} (${r.w})`)
}
console.log("\nWORST gods:", worst.gods.toFixed(2), "mm |", worst.desc)
