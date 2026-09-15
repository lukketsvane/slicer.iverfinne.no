import assert from "node:assert/strict"
import { inRing, shoelace, type Pt } from "../lib/core"
import { lesPlan, OMRISS_TAK, skrivPlan } from "../lib/plan"
import { teiknaFirkant, teiknaKontur, teikneNormal } from "../lib/teikning"

assert.deepEqual(teikneNormal([0, -0.02, Math.sqrt(1 - 0.02 ** 2)]), [0, 0, 1], "toppsynet lagar eit eksakt vassrett sete")
assert.deepEqual(teikneNormal([-Math.cos(Math.PI / 90), 0, Math.sin(Math.PI / 90)]), [-1, 0, 0], "det nære aksesynet held forteiknet")
assert.deepEqual(teikneNormal([0, -0.1, Math.sqrt(0.99)]), [0, -0.1, Math.sqrt(0.99)], "medvite skrå teikneplan følgjer kameraet")

const sirkel: Pt[] = Array.from({ length: 401 }, (_, i) => [150 * Math.cos(i * Math.PI / 200), 150 * Math.sin(i * Math.PI / 200)])
const mjuk = teiknaKontur(sirkel, 1.25)
assert(mjuk && mjuk.length >= 12 && mjuk.length <= OMRISS_TAK, "eit rundt fingerdrag vert få redigerbare punkt")
assert(Math.abs(shoelace(mjuk) / shoelace(sirkel) - 1) < 0.03, "sirkelarealet held innanfor tre prosent")
assert.deepEqual(teiknaKontur([[0, 0], [2, 1], [3, 3], [0, 0]], 1.25), null, "eit mikromerke er ikkje ei plate")
assert.deepEqual(teiknaKontur([[0, 0], [50, 1], [100, 0]], 1.25), null, "ei line er ikkje ei plate")
assert.deepEqual(teiknaKontur([[0, 0], [100, 100], [0, 80], [100, 0]], 1.25), null, "kryssande konturar vert avviste")
assert.deepEqual(teiknaKontur([[0, 0], [100, 0], [100, 100], [50, 0], [0, 100]], 1.25), null, "ei kant som rører ei anna vert avvist")

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
