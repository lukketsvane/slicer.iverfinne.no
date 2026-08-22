/** THROWAWAY - diagnose the egg fres6/snitt6 600x400 violation. */
import { bbox, type Pt } from "../lib/core"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
function kule(r:number,seg:number,st=1){const pos:number[]=[]
  const at=(i:number,j:number):[number,number,number]=>{const th=(i/seg)*Math.PI*2,ph=(j/seg)*Math.PI
    return [r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph)*st]}
  for(let j=0;j<seg;j++)for(let i=0;i<seg;i++){const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1)
    pos.push(...a,...b,...c,...a,...c,...d)}return makeSoup(new Float32Array(pos))}
put("egg","egg",kule(50,48,1.7))
const p = {...DEFAULT_PARAMS, kjelde:"egg", ribbX:8, ribbY:8, fres:6, snitt:6, tjukn:9, leddtype:1}
const {ns, pl} = makePlan(p as any, DETAIL.mid)
console.log("gap", nestGap(p as any), "parts", pl.parts.length, "sheets", ns.sheets.length)
// does any outline self-intersect?
function segInt(a:Pt,b:Pt,c:Pt,d:Pt){
  const o=(p:Pt,q:Pt,r:Pt)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))
  return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b)}
for (const part of pl.parts) {
  const o = part.outline; let self=0
  for(let i=0;i<o.length;i++)for(let j=i+2;j<o.length;j++){
    if(i===0&&j===o.length-1)continue
    if(segInt(o[i],o[(i+1)%o.length],o[j],o[(j+1)%o.length]))self++}
  const b=bbox(o)
  if(self) console.log(`  ${part.from} SELF-INTERSECTS ${self}x  verts=${o.length} bbox=${(b.x1-b.x0).toFixed(1)}x${(b.y1-b.y0).toFixed(1)} holes=${part.holes.length}`)
}
console.log("--- checked all", pl.parts.length, "parts for self-intersection ---")
// where are X3 and X6?
for (const sh of ns.sheets) for (const q of sh.placed) {
  if(["X3","X6"].includes(q.part.from)){const b=bbox(placedRings(q).outline)
    console.log(`  ${q.part.from} on sheet: x[${b.x0.toFixed(1)},${b.x1.toFixed(1)}] y[${b.y0.toFixed(1)},${b.y1.toFixed(1)}] holes=${q.part.holes.length}`)}
}
