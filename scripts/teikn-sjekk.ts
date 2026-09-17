import assert from "node:assert/strict"
import { inRing, shoelace, type Pt } from "../lib/core"
import { lesPlan, OMRISS_TAK, skrivPlan, ut } from "../lib/plan"
import { haldt, landing, lukkTeikning, mellom, midtPaa, ogSysken, mjukePunkt, snapp, snappaKontur, snappliner, symmetrisk, teiknaFirkant, teiknaKontur, teikneNormal, tettMjukt, type Snappline } from "../lib/teikning"
import { ramme, type Plan } from "../lib/plan"
import { nesteSteg, rundt } from "../lib/gruppe"
import { bileteForm, skalerForm } from "../lib/bilete"
import { delIto, spileAkse, spiler, flyttPunkt, flyttStrek, leggPunkt, leggStrek, rundPunkt, strekRing, takPunkt, takStrek } from "../lib/vektor"
import type { Vec3 } from "../lib/core"

assert.deepEqual(teikneNormal([0, -0.02, Math.sqrt(1 - 0.02 ** 2)]), [0, 0, 1], "toppsynet lagar eit eksakt vassrett sete")
assert.deepEqual(teikneNormal([-Math.cos(Math.PI / 90), 0, Math.sin(Math.PI / 90)]), [-1, 0, 0], "det nære aksesynet held forteiknet")
assert.deepEqual(teikneNormal([0, -0.1, Math.sqrt(0.99)]), [0, -0.1, Math.sqrt(0.99)], "medvite skrå teikneplan følgjer kameraet")

const sirkel: Pt[] = Array.from({ length: 401 }, (_, i) => [150 * Math.cos(i * Math.PI / 200), 150 * Math.sin(i * Math.PI / 200)])
const mjuk = teiknaKontur(sirkel, 1.25)
assert(mjuk && mjuk.length >= 12 && mjuk.length <= OMRISS_TAK, "eit rundt fingerdrag vert få redigerbare punkt")
assert(Math.abs(shoelace(mjuk) / shoelace(sirkel) - 1) < 0.03, "sirkelarealet held innanfor tre prosent")
assert.deepEqual(teiknaKontur([[0, 0], [2, 1], [3, 3], [0, 0]], 1.25), null, "eit mikromerke er ikkje ei plate")
assert.deepEqual(teiknaKontur([[0, 0], [50, 1], [100, 0]], 1.25), null, "ei line er ikkje ei plate")
const aatte = teiknaKontur([[0, 0], [100, 100], [0, 80], [100, 0]], 1.25)
assert(aatte && aatte.length >= 3 && Math.abs(shoelace(aatte)) > 1000, "ein kryssande kontur vert den største løkka")
for (let i = 0; i < aatte!.length; i++) for (let j = i + 2; j < aatte!.length; j++) if (!(i === 0 && j === aatte!.length - 1)) {
  const [a, b, c, d] = [aatte![i], aatte![i + 1], aatte![j], aatte![(j + 1) % aatte!.length]]
  const sd = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  assert(!(sd(a, b, c) * sd(a, b, d) < 0 && sd(c, d, a) * sd(c, d, b) < 0), "løkka kryssar ikkje seg sjølv")
}
const krull = teiknaKontur([...Array.from({ length: 200 }, (_, i): Pt => [120 * Math.cos(i * Math.PI / 100), 120 * Math.sin(i * Math.PI / 100)]), [130, 10], [110, -10], [125, 0]], 1.25)
assert(krull && Math.abs(shoelace(krull)) > 0.9 * Math.PI * 120 * 120, "ein krøll i enden av ein sirkel fell bort, sirkelen står")
const takt = teiknaKontur(Array.from({ length: 2000 }, (_, i): Pt => { const v = i * Math.PI / 1000; return [(100 + 30 * Math.sin(12 * v)) * Math.cos(v), (100 + 30 * Math.sin(12 * v)) * Math.sin(v)] }), 1.25)
assert(takt && takt.length === OMRISS_TAK, "ei form med fleire detaljar enn taket vert teken med så mange punkt taket gjev")

const sigd: Pt[] = [[0, 0], [240, 0], [240, 35], [180, 40], [115, 55], [75, 95], [65, 150], [75, 210], [115, 255], [220, 285], [220, 320], [160, 315], [70, 280], [20, 220], [0, 145], [0, 0]]
const tett = sigd.slice(0, -1).flatMap((p, i) => Array.from({ length: 25 }, (_, j): Pt => [p[0] + (sigd[i + 1][0] - p[0]) * j / 25, p[1] + (sigd[i + 1][1] - p[1]) * j / 25]))
const start = performance.now()
const side = teiknaKontur([...tett, sigd[0]], 1.25)
const ms = performance.now() - start
assert(side && side.length <= OMRISS_TAK, "stolsida vert eit redigerbart omriss")
assert(inRing(side, [25, 150]), "beinet har gods")
assert(!inRing(side, [150, 150]), "C-opninga held seg open")
assert(Math.abs(shoelace(side) / shoelace(sigd) - 1) < 0.02, "stolsida held arealet innanfor to prosent")

const omriss = side.map(([x, y]): Pt => [+(x / 400).toFixed(4), +(y / 400).toFixed(4)])
const plan = { id: 1, o: [0.5, 0.5, 0.5] as [number, number, number], n: [0, 1, 0] as [number, number, number], bog: 0, strek: [], omriss }
assert.deepEqual(lesPlan(skrivPlan([plan]))[0].omriss, omriss, "alle redigerbare punkt overlever lagring")
assert.deepEqual(teiknaFirkant([2, 3], [-1, -2]), [[2, 3], [-1, 3], [-1, -2], [2, -2]], "firkanten held alle fire hjørne i begge dragretningar")
console.log(`teikning: sirkel ${mjuk.length} punkt, Sigd ${side.length} punkt frå ${tett.length} prøver (${ms.toFixed(1)} ms); areal, innsøkk, avvising og lagring held`)

{
  const S = 450
  const min: Vec3 = [-225, -225, 0]
  const max: Vec3 = [225, 225, 450]
  const side = (id: number, y: number): Plan => ({ id, o: [0.5, (y + 225) / S, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-150 / S, 213 / S], [150 / S, 213 / S], [190 / S, -225 / S], [-190 / S, -225 / S]] })
  const sider = [side(1, -150), side(2, 150)]
  const sete: Vec3[] = [[-175, -175, 225], [175, -175, 225], [175, 175, 225], [-175, 175, 225]]
  const z = landing(sider, min, max, S, sete)
  assert(z !== null && Math.abs(z - 438) < 0.01, `setet landar på toppen av sidene, ikkje ${z}`)
  assert.equal(landing(sider, min, max, S, sete.map((p): Vec3 => [p[0] + 800, p[1], p[2]])), null, "eit sete utanfor sidene landar ikkje")
  const smalt: Vec3[] = [[-60, -175, 225], [60, -175, 225], [60, 175, 225], [-60, 175, 225]]
  assert(Math.abs((landing(sider, min, max, S, smalt) ?? 0) - 438) < 0.01, "eit smalt sete finn kanten mellom hjørna")
  const stol = (id: number, y: number): Plan => ({ id, o: [0.5, (y + 225) / S, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: ([[-205, 0], [-165, 0], [-165, 200], [165, 200], [165, 0], [205, 0], [205, 450], [165, 450], [165, 235], [-205, 235]] as Pt[]).map(([x, z]): Pt => [-x / S, (z - 225) / S]) })
  const stolsider = [stol(1, -150), stol(2, 150)]
  const t = 12
  const stolsete = (bak: number): Vec3[] => [[-190, -175, 225], [bak, -175, 225], [bak, 175, 225], [-190, 175, 225]]
  assert(Math.abs((landing(stolsider, min, max, S, stolsete(165 + t - 1), t) ?? 0) - 235) < 0.01, "eit sete som so vidt når bakfoten landar på ramma")
  assert(Math.abs((landing(stolsider, min, max, S, stolsete(165 + t + 1), t) ?? 0) - 450) < 0.01, "eit sete som dekkjer bakfoten landar oppå han")
  assert(Math.abs((landing(stolsider, min, max, S, stolsete(160), t) ?? 0) - 235) < 0.01, "eit sete framfor bakfoten landar på ramma")
  assert(Math.abs((landing(stolsider, min, max, S, stolsete(165), t) ?? 0) - 235) < 0.01, "eit sete som endar nett ved bakfoten landar på ramma")
  const vegg = (id: number, o: Vec3, n: Vec3): Plan => ({ id, o, n, bog: 0, strek: [], omriss: [[-0.3769, 0.3598], [0.3769, 0.3598], [0.3769, -0.5], [-0.3769, -0.5]] })
  const kasse = [vegg(1, [0.5, 0.8636, 0.5], [0, -1, 0]), vegg(2, [0.1364, 0.5, 0.5], [1, 0, 0]), vegg(3, [0.5, 0.1364, 0.5], [0, 1, 0]), vegg(4, [0.8636, 0.5, 0.5], [-1, 0, 0])]
  const kasseSete: Vec3[] = [[-169.6, -169.6, 225], [169.6, -169.6, 225], [169.6, 169.6, 225], [-169.6, 169.6, 225]]
  assert(Math.abs((landing(kasse, min, max, S, kasseSete, t) ?? 0) - (225 + 0.3598 * S)) < 0.01, `setet på kassa landar på veggane: ${landing(kasse, min, max, S, kasseSete, t)}`)

  const flate = ramme({ o: [0.5, 0.5, 0.5], n: [1, 0, 0] }, min, max)
  const liner = snappliner(sider, min, max, S, flate)
  assert.equal(liner.filter((l) => Math.abs(l.d[1]) > 0.5).length, 2, "dei to sidene på kant")
  assert.equal(liner.filter((l) => Math.abs(l.d[0]) > 0.5).length, 5, "golvet, og toppen og botnen av kvar side")
  const u = (y: number) => y / S
  const naer = snapp([u(147), 0.1], liner, 8 / S)
  assert(Math.abs(Math.abs(naer[0]) - u(150)) < 1e-9 && naer[1] === 0.1, `enden hakar seg i sida: ${naer}`)
  const fri = snapp([u(120), 0.1], liner, 8 / S)
  assert.deepEqual(fri, [u(120), 0.1], "langt frå sida står punktet")
  const hjorne = snapp([u(146), -223 / S], liner, 8 / S)
  assert(Math.abs(Math.abs(hjorne[0]) - u(150)) < 1e-9 && Math.abs(hjorne[1] + 225 / S) < 1e-9, `hjørnet ved sida og golvet: ${hjorne}`)
  const topp = ramme({ o: [0.5, 0.5, 0.5], n: [0, 0, 1] }, min, max)
  const ovanfraa = snappliner(stolsider, min, max, S, topp)
  const tversX = ovanfraa.filter((l) => Math.abs(l.d[0]) < 1e-9).map((l) => +(l.p[0] * S).toFixed(3))
  assert([-205, -165, 165, 205].every((x) => tversX.includes(x)), `fotsidene står som snappliner: ${[...new Set(tversX)].join(",")}`)
  assert(!tversX.some((x) => Math.abs(x) < 100), "ramma sine vassrette kantar gjev ingen line")
  const seteHjorne = snapp([160 / S, 0.3], ovanfraa, 8 / S)
  assert(Math.abs(seteHjorne[0] * S - 165) < 1e-6, `setehjørnet hakar seg i framsida av bakfoten: ${seteHjorne[0] * S}`)
  const nesten: Pt[] = [[-0.42, -0.3], [0.367, -0.3], [0.367, 0.3], [-0.42, 0.3]]
  assert.equal(midtPaa(nesten, 0.1, true, [true, false])[1][0], 0.367, "x snappa: står")
  assert.notEqual(midtPaa(nesten, 0.1, true, [false, false])[1][0], 0.367, "ikkje snappa: midtstilt")
  const mellomStol = mellom(stolsider, min, max, S, t, [[-190, -150, 225], [165 + t - 1, -150, 225], [165 + t - 1, 150, 225], [-190, 150, 225]])
  assert(mellomStol && Math.abs(mellomStol.z - (235 - 2.5 * t)) < 0.01, `setet mellom sidene ligg under ramma, ikkje under ryggen: ${mellomStol?.z}`)
  const rygg: Vec3[] = [[0, -150, 320], [0, 150, 320], [0, 150, 420], [0, -150, 420]]
  const flytta = haldt(stolsider, min, max, S, t, [0, 0, 225], [1, 0, 0], rygg)
  assert(flytta && Math.abs(flytta[0] - 185) <= t / 2 && flytta[1] === 0, `ryggen vert skuva til bakfoten: ${flytta}`)
  const stag: Vec3[] = [[0, -150, 205], [0, 150, 205], [0, 150, 230], [0, -150, 230]]
  assert.equal(haldt(stolsider, min, max, S, t, [0, 0, 225], [1, 0, 0], stag), null, "eit stag i ramma står der det vart teikna")
  assert.equal(haldt(stolsider, min, max, S, t, [0, 0, 225], [1, 0, 0], rygg.map((p): Vec3 => [p[0], p[1] * 0.5, p[2]])), null, "ei plate som ikkje endar i sidene vert ikkje skuva")
  const breiRygg = haldt(stolsider, min, max, S, t, [0, 0, 225], [1, 0, 0], rygg.map((p): Vec3 => [p[0], p[1] * 1.4, p[2]]))
  assert(breiRygg && Math.abs(breiRygg[0] - 185) <= t / 2, `ein rygg breiare enn stolen kryssar sidene og går til bakfoten: ${breiRygg}`)
  {
    const ru = (id: number, o: Vec3, n: Vec3): Plan => ({ id, o, n, bog: 0, strek: [], omriss: [[-0.3, 0.35], [0.3, 0.35], [0.3, -0.5], [-0.3, -0.5]], gruppe: 7 })
    const kasse = [ru(1, [0.5, 0.86, 0.5], [0, -1, 0]), ru(2, [0.14, 0.5, 0.5], [1, 0, 0]), ru(3, [0.5, 0.14, 0.5], [0, 1, 0]), ru(4, [0.86, 0.5, 0.5], [-1, 0, 0])]
    const flate = ramme({ o: kasse[0].o, n: kasse[0].n }, min, max)
    const hol: Pt[] = [[-0.08, 0.08], [0.08, 0.08], [0.08, -0.08], [-0.08, -0.08]].map((q) => [q[0], q[1]] as Pt)
    const r = lukkTeikning(kasse, 1, ut(flate, [0, 0]), kasse[0].n, hol, hol, min, max, S, t)
    assert.equal(r.slag, "hol", "eit drag inni ein vegg i ei ×4-gruppe er eit hòl")
    if (r.slag === "hol") assert.deepEqual(r.plan.map((q: Plan) => q.strek.length), [1, 1, 1, 1], "og hòlet står i alle fire veggane")
    const ulik = [kasse[0], { ...kasse[1], omriss: [[-0.2, 0.3], [0.2, 0.3], [0.2, -0.4], [-0.2, -0.4]] as Pt[] }]
    const r2 = lukkTeikning(ulik, 1, ut(flate, [0, 0]), kasse[0].n, hol, hol, min, max, S, t)
    if (r2.slag === "hol") assert.deepEqual(r2.plan.map((q: Plan) => q.strek.length), [1, 0], "ein gruppemedlem med eit anna omriss får ikkje hòlet")
    const nett = [{ ...kasse[0] }, { id: 2, o: [0.14, 0.5, 0.5] as Vec3, n: [1, 0, 0] as Vec3, bog: 0, strek: [], gruppe: 7 }]
    const r3 = lukkTeikning(nett, 1, ut(flate, [0, 0]), kasse[0].n, hol, hol, min, max, S, t)
    if (r3.slag === "hol") assert.deepEqual(r3.plan.map((q: Plan) => q.strek.length), [1, 0], "eit plan utan omriss får ikkje hòlet")
    const ny: Pt[] = [[-0.25, 0.3], [0.25, 0.3], [0.25, -0.45], [-0.25, -0.45]]
    const forma = ogSysken(kasse, kasse.map((q) => (q.id === 1 ? { ...q, omriss: ny } : q)), 1)
    assert.deepEqual(forma.map((q) => q.omriss?.[0][0]), [-0.25, -0.25, -0.25, -0.25], "ei forma kant i éin vegg står i alle fire")
    const losna = ogSysken(kasse, kasse.map((q) => (q.id === 1 ? (({ omriss: _o, ...r }) => r as Plan)(q) : q)), 1)
    assert.deepEqual(losna.map((q) => !!q.omriss), [false, false, false, false], "og eit sleppt omriss vert sleppt i alle fire")
    const ulikForm = ogSysken(ulik, ulik.map((q) => (q.id === 1 ? { ...q, omriss: ny } : q)), 1)
    assert.equal(ulikForm[1].omriss?.[0][0], -0.2, "ein medlem med eit anna omriss står")
    console.log("gruppehòl og gruppeform: éin vegg formar alle fire, og berre dei som er same plata")
  }

  console.log("landing og snapp: setet på 438 mm, staget i midtplanet, foten i golvet, setet ved bakfoten, ryggen i bakfoten")
}

{
  const a: Pt[] = [[-150, 213], [140, 215], [186, -225], [55, -225], [-3, -118], [-62, -225], [-192, -223]]
  const s = symmetrisk(a)
  assert(s, "ei nesten lik side vert spegla")
  const c = (Math.min(...a.map((p) => p[0])) + Math.max(...a.map((p) => p[0]))) / 2
  for (const p of s) assert(s.some((q) => Math.abs(q[0] - (2 * c - p[0])) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6), "kvart punkt har spegelpunktet sitt")
  assert(s.some((p) => Math.abs(p[0] - c) < 1e-9 && Math.abs(p[1] + 118) < 3), "spissen i hakket står på aksen")
  const skeiv: Pt[] = [[-150, 213], [60, 215], [186, -225], [-192, -223]]
  assert.equal(symmetrisk(skeiv), null, "ei side som er meint skeiv står")
  const hjarte = symmetrisk([[-100, 0], [-50, 100], [0, 20], [52, 100], [100, 0], [0, -50]])
  assert(hjarte && hjarte.length === 6 && hjarte.filter((p) => Math.abs(p[0]) < 1.01).length === 2, "eit hjarte har to hjørne på aksen")
  const midt = midtPaa([[-0.3, 0.2], [0.26, 0.2], [0.26, -0.5], [-0.3, -0.5]], 0.05, false)
  assert(Math.abs(midt[0][0] + 0.28) < 1e-9 && midt[0][1] === 0.2, "ei side nær midten vert flytt til midten, og ikkje opp")
  const langt = midtPaa([[0.1, 0.2], [0.4, 0.2], [0.4, -0.5]], 0.05, false)
  assert.equal(langt[0][0], 0.1, "ei plate langt frå midten står")
  const sete = midtPaa([[-0.4, -0.35], [0.36, -0.35], [0.36, 0.39], [-0.4, 0.39]], 0.05, true)
  assert(Math.abs(sete[0][0] + 0.38) < 1e-9 && Math.abs(sete[0][1] + 0.37) < 1e-9, "eit sete vert midtstilt båe vegar")
  console.log(`symmetri: ${a.length} punkt → ${s.length} spegla; skeiv står; hjartet held spissane; midtstilling held`)
}

{

  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const bein: Plan = { id: 1, o: [0.5, (120 + 225) / 450, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-0.2, 0.4], [0.2, 0.4], [0.2, -0.5], [-0.2, -0.5]] }
  const tre = rundt(bein, 3, min, max, 2, 1)
  assert.deepEqual(tre.map((p) => p.id), [1, 2, 3], "namna held fram frå det neste ubrukte")
  for (const p of tre) {
    const x = min[0] + p.o[0] * 450, y = min[1] + p.o[1] * 450
    assert(Math.abs(Math.hypot(x, y) - 120) < 0.1, "kvart bein står 120 mm frå aksen")
    assert(Math.abs(x * p.n[0] + y * p.n[1] - 120) < 0.1, "normalen peikar ut frå aksen")
    assert.deepEqual(p.omriss, bein.omriss, "eit ståande plan tek omrisset med seg")
  }
  const kryss = rundt({ ...bein, o: [0.5, 0.5, 0.5] }, 3, min, max, 2, 1)
  assert(Math.abs(kryss[1].n[1] - 0.5) < 1e-3 && Math.abs(Math.abs(kryss[1].n[0]) - 0.866) < 1e-3, "plan gjennom aksen: 60° mellom, ikkje 120° oppå seg sjølv")
  const sete: Plan = { id: 1, o: [0.5, 0.5, 0.99], n: [0, 0, 1], bog: 0, strek: [], omriss: [[0.2, 0], [0.3, 0], [0.3, 0.1]] }
  const s4 = rundt(sete, 4, min, max, 2, 1)
  assert.deepEqual(s4[1].omriss![0], [0, 0.2], "eit liggjande plan dreier punkta i planet")
  const l: Plan[] = [{ ...bein, id: 1, o: [0.2, 0.5, 0.5] }, { ...bein, id: 2, o: [0.35, 0.5, 0.5] }]
  assert.deepEqual(nesteSteg(l, 2, 1), [0.5, 0.5, 0.5], "den tredje kjem like langt frå den andre")
  assert.equal(nesteSteg([l[0], { ...l[1], n: [1, 0, 0] }], 2, 1), null, "ei anna normal er ikkje eit steg")
  console.log("rundt og gjenta: tre bein på 120°, kryss på 60°, sete dreidd, steget går vidare")
}

{
  const bue: Pt[] = Array.from({ length: 9 }, (_, i): Pt => [60 * Math.cos(Math.PI * (1 - i / 8)), 80 * Math.sin(Math.PI * (1 - i / 8))])
  const side: Pt[] = [[-150, 300], [150, 300], [180, 0], [60, 0], ...bue.slice(1, -1).reverse(), [-60, 0], [-180, 0]]
  const m = mjukePunkt(side)
  assert(m.length >= 5, `bogen vert rund: ${m}`)
  for (const i of [0, 1, 2, side.length - 1]) assert(!m.includes(i), `hjørne ${i} står skarpt`)
  assert.deepEqual(mjukePunkt([[0, 0], [100, 0], [100, 100], [0, 100]]), [], "ein firkant har ingen boge")
  const oval: Pt[] = Array.from({ length: 9 }, (_, i): Pt => [0.05 * Math.cos((i * 2 * Math.PI) / 9), 0.08 * Math.sin((i * 2 * Math.PI) / 9)])
  const tett = tettMjukt(oval)
  assert(tett.length > 9 && tett.length <= OMRISS_TAK, `eit ovalt hòl vert tetta: ${tett.length}`)
  const para: Pt[] = [[0, 0], [0.1, 0], [0.12, 0.1], [0.02, 0.1]]
  assert.deepEqual(tettMjukt(para), para, "parallellogrammet står")
  console.log(`mjukt og skarpt: ${m.length} runde punkt i bogen, ovalen ${tett.length} punkt`)
}

{
  const tol = 1.25 / 390
  const golv = 0.4
  const liner: Snappline[] = [{ p: [0, golv], d: [1, 0] }]
  const sn = (p: Pt) => snapp(p, liner, tol * 8)
  const fot: Pt[] = []
  for (let i = 0; i <= 40; i++) fot.push([0.1 + 0.02 * i / 40, 0.1 + 0.3 * i / 40])
  for (let i = 1; i <= 40; i++) fot.push([0.12 + 0.1 * i / 40, golv - 3 * tol + (i % 2 ? tol : 0)])
  for (let i = 1; i <= 40; i++) fot.push([0.22 + 0.02 * i / 40, golv - 0.3 * i / 40])
  const fotUt = snappaKontur(fot, fot.map(sn), tol)
  assert(fotUt.slice(41, 81).every((p) => Math.abs(p[1] - golv) < 1e-12), "foten langs golvet ligg på golvet")
  assert(fotUt.slice(0, 30).every((p, i) => p === fot[i]), "beinet står som det vart teikna")
  const R = 118 * tol / 1.25
  const meie: Pt[] = []
  for (let i = 0; i <= 80; i++) { const v = Math.PI / 2 + (i / 80 - 0.5) * 1.6; meie.push([0.5 + R * Math.cos(v), golv - R + R * Math.sin(v)]) }
  const meieSn = meie.map(sn)
  assert(meieSn.filter((p, i) => Math.abs(p[1] - golv) < 1e-12 && Math.abs(meie[i][1] - golv) > 1e-9).length > 10, "punkt for punkt ville snappet lagt botnen flat")
  const meieUt = snappaKontur(meie, meieSn, tol)
  assert(meieUt.every((p, i) => i === 0 || i === meie.length - 1 || p === meie[i]), "meia står som ein boge: berre endane er snappa")
  console.log("snappet i konturen: foten flat på golvet, meia ein boge")
}

{
  const S = 450, t = 12
  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const side = (id: number, y: number): Plan => ({ id, o: [0.5, (y + 225) / S, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-150 / S, 213 / S], [150 / S, 213 / S], [190 / S, -225 / S], [-190 / S, -225 / S]] })
  const sider = [side(1, -150), side(2, 150)]
  const fot: Vec3[] = [[-140, -150, 225], [140, -150, 225], [140, 150, 225], [-140, 150, 225]]
  const m = mellom(sider, min, max, S, t, fot)
  assert(m && Math.abs(m.z - (438 - 30)) < 0.01, `setet står to tjukner under toppen: ${m?.z}`)
  assert(m!.fot.every((p) => Math.abs(Math.abs(p[1]) - 156) < 1e-9 && Math.abs(Math.abs(p[0]) - 140) < 1e-9), "kantane går ut til utsida")
  assert.equal(mellom(sider, min, max, S, t, fot.map((p): Vec3 => [p[0], p[1] * 1.2, p[2]])), null, "eit sete som stikk forbi ligg oppå")
  assert.equal(mellom([sider[0]], min, max, S, t, fot), null, "éi side er ikkje mellom")
  assert.equal(mellom(sider, min, max, S, t, fot.map((p): Vec3 => [p[0], p[1] * 0.8, p[2]])), null, "eit sete som ikkje når sidene står der det vart teikna")
  console.log("mellom: setet på 408 mm mellom sidene, kantane på ±156")
}

{
  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const ut = rundt({ id: 1, o: [0.5, 0.5, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-0.4, 0.4], [-0.1, 0.4], [-0.1, -0.5], [-0.4, -0.5]] }, 3, min, max, 2, 1)
  const vinklar = ut.map((p) => Math.round((Math.atan2(p.n[1], p.n[0]) * 180) / Math.PI))
  assert.deepEqual(vinklar, [90, -150, -30], `tre radiale bein på 120°: ${vinklar}`)
  console.log("rundt: radiale bein ut frå midten får 120°")
}

{
  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const vegg: Plan = { id: 1, o: [0.5, 0.5, 0.5], n: [0, -1, 0], bog: 0, strek: [], omriss: [[-176 / 450, 0.4], [176 / 450, 0.4], [176 / 450, -0.5], [-176 / 450, -0.5]] }
  const k = rundt(vegg, 4, min, max, 2, 1, 12)
  for (const p of k) {
    const x = min[0] + p.o[0] * 450, y = min[1] + p.o[1] * 450
    assert(Math.abs(Math.hypot(x, y) - 170) < 0.1, `kvar vegg 170 mm ut: ${x}, ${y}`)
  }
  const vinklar = k.map((p) => Math.round((Math.atan2(p.n[1], p.n[0]) * 180) / Math.PI))
  assert.deepEqual(vinklar, [-90, 0, 90, 180], `fire veggar på 90°: ${vinklar}`)
  console.log("×4 på ein vegg midt i: ei kasse, veggane 170 mm ut")
}

{
  const bein: Pt[] = [[0.05, 0.4], [0.3, 0.4], [0.5, -0.5], [0.06, -0.5]]
  assert.deepEqual(midtPaa(bein, Infinity, false), bein, "beinet står der det vart teikna")
  const midt: Pt[] = [[-0.3, 0.4], [0.35, 0.4], [0.35, -0.5], [-0.3, -0.5]]
  assert.equal(midtPaa(midt, Infinity, false)[0][0], -0.325, "ei side over midten vert midtstilt")
  console.log("midtstilling: eit bein ut frå aksen står")
}

{
  const w = 120, h = 100
  const lys = new Float32Array(w * h).fill(1)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inne = Math.hypot(x - 60, y - 50) < 40
    const hol = Math.abs(x - 60) < 12 && Math.abs(y - 50) < 12
    if (inne && !hol) lys[y * w + x] = 0.1
  }
  lys[5 * w + 5] = 0
  const f = bileteForm({ lys, w, h }, { terskel: 0.5, mjuk: 0, snu: false })
  assert(f, "ringen gjev ei form")
  const s = 1 / 120
  const areal = Math.abs(shoelace(f!.omriss)) / (s * s)
  assert(Math.abs(areal - Math.PI * 1600) < 0.05 * Math.PI * 1600, `omrisset er sirkelen: ${areal.toFixed(0)}`)
  assert.equal(f!.hol.length, 1, "eitt hòl, og støvet fell bort")
  assert(Math.abs(f!.hol[0].w / s - 24) < 2 && Math.abs(f!.hol[0].h / s - 24) < 2, `hòlet er 24 px: ${(f!.hol[0].w / s).toFixed(1)}`)
  assert(f!.runde.length > 6, "sirkelen er runde punkt")
  assert(Math.abs(f!.hol[0].y) < 0.02 && f!.omriss.every(([, y]) => Math.abs(y) < 0.45), "midten av biletet er midten av forma")
  const snudd = bileteForm({ lys, w, h }, { terskel: 0.5, mjuk: 0, snu: true })
  assert(snudd && Math.abs(shoelace(snudd.omriss)) / (s * s) > w * h * 0.9, "snudd er det ljose gods: heile biletet")
  const tomt = bileteForm({ lys: new Float32Array(w * h).fill(1), w, h }, { terskel: 0.5, mjuk: 2, snu: false })
  assert.equal(tomt, null, "eit kvitt bilete er inga form")
  const sk = skalerForm(f!, 0.8)
  assert(Math.abs(sk.hol[0].w - f!.hol[0].w * 0.8) < 1e-3, "skaleringa tek hòla med")
  console.log(`bilete: ring med ${f!.omriss.length} punkt og eitt hòl, støvet borte, snudd og tomt held`)
}

{
  const side: Plan = { id: 1, o: [0.5, 0.5, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-0.3, 0.4], [0.3, 0.4], [0.4, -0.5], [0.1, -0.5], [0, -0.2], [-0.1, -0.5], [-0.4, -0.5]], runde: [4] }
  const erSym = (q: Plan) => q.omriss!.every(([x, y]) => q.omriss!.some(([a, b]) => Math.abs(a + x) < 1e-6 && Math.abs(b - y) < 1e-6))
  const f = flyttPunkt(side, 2, [0.45, -0.5], true)
  assert(erSym(f) && f.omriss![6][0] === -0.45, "eit punkt dregi, makkeren fylgjer spegla")
  assert.deepEqual(flyttPunkt(side, 4, [0.03, -0.25], true).omriss![4], [0, -0.25], "punktet på midtlina held seg på lina")
  const l = leggPunkt(side, 1, true)
  assert.equal(l.omriss!.length, 9, "eitt punkt og makkeren")
  assert(erSym(l), `framleis lik på båe sider: ${JSON.stringify(l.omriss)}`)
  assert.deepEqual(l.runde, [5], "bogen flytta seg med plassen")
  const t = takPunkt(l, 2, true)
  assert(t.omriss!.length === 7 && erSym(t), "eit punkt bort, og makkeren")
  const r = rundPunkt(side, 1, true)
  assert.deepEqual(r.runde, [0, 1, 4], "boge på punktet og makkeren")
  assert.deepEqual(rundPunkt(r, 0, true).runde, [4], "og av att")
  assert.equal(takPunkt({ ...side, omriss: side.omriss!.slice(0, 3) }, 0).omriss!.length, 3, "tre er golvet")
  const h = leggStrek(side, { slag: "hol", form: "rund", x: 0, y: 0, w: 0.1, h: 0.2, a: 0 })
  assert(Math.abs(strekRing(h.strek[0], 4)[1][1] - 0.1) < 1e-9, "ringen til ein ellipse står der han skal")
  assert.equal(flyttStrek(h, 0, 0.05, 0.1).strek[0].x, 0.05, "hòlet flytt")
  assert.equal(takStrek(h, 0).strek.length, 0, "hòlet bort")
  console.log("vektor: dra, legg til, ta bort og rund — spegla; hòl flytt og bort")
}

{
  const sete: Plan = { id: 3, o: [0.5, 0.5, 0.9], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-0.39, -0.33], [0.39, -0.33], [0.39, 0.33], [-0.39, 0.33]] }
  const d = delIto(sete, 9)
  assert(d, "setet vert delt")
  const [a, b] = d!
  assert.equal(b.id, 9, "den nye halvdelen får det nye namnet")
  assert(Math.abs(Math.abs(shoelace(a.omriss!)) + Math.abs(shoelace(b.omriss!)) - Math.abs(shoelace(sete.omriss!))) < 1e-6, "arealet held")
  assert(a.omriss!.every((p) => p[0] <= 1e-9) && b.omriss!.every((p) => p[0] >= -1e-9), "delt langs den lengste leia, i midten")
  const rund: Plan = { ...sete, omriss: Array.from({ length: 12 }, (_, i): Pt => [0.3 * Math.cos(i * Math.PI / 6), 0.2 * Math.sin(i * Math.PI / 6)]), runde: [...Array(12).keys()] }
  const r = delIto(rund, 10)
  assert(r && r[0].runde && r[0].runde.length > 2, "ein ellipse vert to halve med bogane att")
  console.log("del i to: setet i to halvdelar, arealet held, bogane finst att")
}

{
  const sete: Plan = { id: 3, o: [0.5, 0.5, 0.9], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-0.39, -0.33], [0.39, -0.33], [0.39, 0.33], [-0.39, 0.33]] }
  const sp = spiler(sete, 5, 12 / 450, 9)
  assert(sp && sp.length === 5, "fem spiler")
  assert.deepEqual(sp!.map((p) => p.id), [3, 9, 10, 11, 12], "den fyrste held namnet, resten frå det nye")
  const breidd = (p: Plan) => Math.max(...p.omriss!.map((q) => q[0])) - Math.min(...p.omriss!.map((q) => q[0]))
  assert(sp!.every((p) => Math.abs(breidd(p) * 450 - 60.6) < 0.1), `like breie: ${sp!.map((p) => (breidd(p) * 450).toFixed(1))}`)
  for (let i = 1; i < 5; i++) {
    const luft = Math.min(...sp![i].omriss!.map((q) => q[0])) - Math.max(...sp![i - 1].omriss!.map((q) => q[0]))
    assert(Math.abs(luft * 450 - 12) < 0.1, `tolv millimeter luft: ${(luft * 450).toFixed(2)}`)
  }
  assert.equal(spiler(sete, 40, 12 / 450, 9), null, "for mange spiler er ingen spiler")
  const S = 450, t = 12
  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const side = (id: number, y: number): Plan => ({ id, o: [0.5, (y + 225) / S, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-150 / S, 213 / S], [150 / S, 213 / S], [190 / S, -225 / S], [-190 / S, -225 / S]] })
  const mellomSete: Plan = { id: 3, o: [0.5, 0.5, 408 / S], n: [0, 0, 1], bog: 0, strek: [], omriss: [[-130 / S, -156 / S], [130 / S, -156 / S], [130 / S, 156 / S], [-130 / S, 156 / S]] }
  const alle = [side(1, -150), side(2, 150), mellomSete]
  assert.equal(spileAkse(mellomSete, alle, min, max, S, t), 1, "setet mellom sidene endar i dei langs y")
  assert.equal(spileAkse(sete, [sete], min, max, S, t), null, "eit sete åleine endar ingen stad")
  const langs = spiler(mellomSete, 5, t / S, 9, 1)!
  assert(langs.every((p) => Math.abs(Math.max(...p.omriss!.map((q) => q[1])) * S - 156) < 0.05 && Math.abs(Math.min(...p.omriss!.map((q) => q[1])) * S + 156) < 0.05), "kvar spile når frå side til side")
  assert(langs.every((p) => Math.abs(breidd(p) * S - (260 - 4 * t) / 5) < 0.1), `fem spiler på 42,4 langs x: ${langs.map((p) => (breidd(p) * S).toFixed(1))}`)
  console.log("spiler: fem like breie med tolv millimeter luft, namna i rekkje, og frå side til side når setet står mellom")
}
