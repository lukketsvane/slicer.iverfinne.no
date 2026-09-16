import assert from "node:assert/strict"
import { inRing, shoelace, type Pt } from "../lib/core"
import { lesPlan, OMRISS_TAK, skrivPlan } from "../lib/plan"
import { landing, mellom, midtPaa, mjukePunkt, snapp, snappliner, symmetrisk, teiknaFirkant, teiknaKontur, teikneNormal, tettMjukt } from "../lib/teikning"
import { ramme, type Plan } from "../lib/plan"
import { nesteSteg, rundt } from "../lib/gruppe"
import { bileteForm, skalerForm } from "../lib/bilete"
import { flyttPunkt, flyttStrek, leggPunkt, leggStrek, rundPunkt, strekRing, takPunkt, takStrek } from "../lib/vektor"
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
// EI KRYSSANDE RØRSLE ER EI FORM: den største løkka vinn
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

// Ei C-side som Sigd: innsøkket må overleve, og opninga må halde seg open.
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

// KVAR EI NY PLATE LANDAR: to sider med toppen på 438 mm, og eit sete teikna
// ovanfrå — det skal liggje med underflata på toppen av sidene.
{
  const S = 450
  const min: Vec3 = [-225, -225, 0]
  const max: Vec3 = [225, 225, 450]
  const side = (id: number, y: number): Plan => ({ id, o: [0.5, (y + 225) / S, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-150 / S, 213 / S], [150 / S, 213 / S], [190 / S, -225 / S], [-190 / S, -225 / S]] })
  const sider = [side(1, -150), side(2, 150)]
  const sete: Vec3[] = [[-175, -175, 225], [175, -175, 225], [175, 175, 225], [-175, 175, 225]]
  const z = landing(sider, min, max, S, sete)
  assert(z !== null && Math.abs(z - 438) < 0.01, `setet landar på toppen av sidene, ikkje ${z}`)
  // eit sete som ikkje ligg over noko, står der det vart teikna
  assert.equal(landing(sider, min, max, S, sete.map((p): Vec3 => [p[0] + 800, p[1], p[2]])), null, "eit sete utanfor sidene landar ikkje")
  // smalare enn toppen: kanten kryssar fotavtrykket utan eit hjørne i det
  const smalt: Vec3[] = [[-60, -175, 225], [60, -175, 225], [60, 175, 225], [-60, 175, 225]]
  assert(Math.abs((landing(sider, min, max, S, smalt) ?? 0) - 438) < 0.01, "eit smalt sete finn kanten mellom hjørna")

  // SNAPPET: eit stag teikna frå sida hakar enden fast i midtplanet til sida,
  // og foten i golvet. Teikneplanet står gjennom midten med normalen langs x.
  const flate = ramme({ o: [0.5, 0.5, 0.5], n: [1, 0, 0] }, min, max)
  const liner = snappliner(sider, min, max, S, flate)
  assert.equal(liner.length, 3, "golvet og dei to sidene")
  const u = (y: number) => y / S
  const naer = snapp([u(147), 0.1], liner, 8 / S)
  assert(Math.abs(Math.abs(naer[0]) - u(150)) < 1e-9 && naer[1] === 0.1, `enden hakar seg i sida: ${naer}`)
  const fri = snapp([u(120), 0.1], liner, 8 / S)
  assert.deepEqual(fri, [u(120), 0.1], "langt frå sida står punktet")
  const hjorne = snapp([u(146), -223 / S], liner, 8 / S)
  assert(Math.abs(Math.abs(hjorne[0]) - u(150)) < 1e-9 && Math.abs(hjorne[1] + 225 / S) < 1e-9, `hjørnet ved sida og golvet: ${hjorne}`)
  console.log("landing og snapp: setet på 438 mm, staget i midtplanet, foten i golvet")
}


// DET FINGEREN MEINTE: ei A-side teikna litt skeiv vert lik på båe sider,
// og ei side teikna med vilje skeiv står.
{
  const a: Pt[] = [[-150, 213], [140, 215], [186, -225], [55, -225], [-3, -118], [-62, -225], [-192, -223]]
  const s = symmetrisk(a)
  assert(s, "ei nesten lik side vert spegla")
  const c = (Math.min(...a.map((p) => p[0])) + Math.max(...a.map((p) => p[0]))) / 2
  for (const p of s) assert(s.some((q) => Math.abs(q[0] - (2 * c - p[0])) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6), "kvart punkt har spegelpunktet sitt")
  assert(s.some((p) => Math.abs(p[0] - c) < 1e-9 && Math.abs(p[1] + 118) < 3), "spissen i hakket står på aksen")
  const skeiv: Pt[] = [[-150, 213], [60, 215], [186, -225], [-192, -223]]
  assert.equal(symmetrisk(skeiv), null, "ei side som er meint skeiv står")
  // eit hjarte har to hjørne på aksen, og båe står att
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

// RUNDT OG GJENTA: tre bein på 120°, og ein kopi som går same steget
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

// MJUKT OG SKARPT: bogen i ei side vert rund, hjørna står
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

// SETET MELLOM SIDENE: kantane i midtplana → mellom, to tjukner under toppen, ut til utsida
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

// RUNDT MED BEIN SOM STÅR UT FRÅ MIDTEN: radialt plan, men omrisset berre på den eine sida
{
  const min: Vec3 = [-225, -225, 0], max: Vec3 = [225, 225, 450]
  const ut = rundt({ id: 1, o: [0.5, 0.5, 0.5], n: [0, 1, 0], bog: 0, strek: [], omriss: [[-0.4, 0.4], [-0.1, 0.4], [-0.1, -0.5], [-0.4, -0.5]] }, 3, min, max, 2, 1)
  const vinklar = ut.map((p) => Math.round((Math.atan2(p.n[1], p.n[0]) * 180) / Math.PI))
  assert.deepEqual(vinklar, [90, -150, -30], `tre radiale bein på 120°: ${vinklar}`)
  console.log("rundt: radiale bein ut frå midten får 120°")
}

// ×4 PÅ EIN VEGG MIDT I: ei kasse med hjørna i flukt
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

// eit bein heilt på den eine sida vert ikkje flytt til midten, sjølv som fyrste plate
{
  const bein: Pt[] = [[0.05, 0.4], [0.3, 0.4], [0.5, -0.5], [0.06, -0.5]]
  assert.deepEqual(midtPaa(bein, Infinity, false), bein, "beinet står der det vart teikna")
  const midt: Pt[] = [[-0.3, 0.4], [0.35, 0.4], [0.35, -0.5], [-0.3, -0.5]]
  assert.equal(midtPaa(midt, Infinity, false)[0][0], -0.325, "ei side over midten vert midtstilt")
  console.log("midtstilling: eit bein ut frå aksen står")
}

// BILETET: ein svart ring med eit kvadratisk hòl, og eit støvkorn
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

// VEKTORGREPA: ei A-side, redigert med spegelen på
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
