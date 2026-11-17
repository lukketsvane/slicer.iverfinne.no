import assert from "node:assert/strict"
import { contour } from "../lib/contour"
import { shoelace, type Pt, type Vec3 } from "../lib/core"
import { meshToStl } from "../lib/export-stl"
import { parseMesh } from "../lib/io"
import { makeKropp, vendNull, vendTal } from "../lib/kropp"
import { newSoup, ribSolid, soupToMesh } from "../lib/mesh"
import { decimate } from "../lib/mesh/simplify"
import { avFlata, inn, ramme as planRamme, skrivPlan, ut, type Ramme } from "../lib/plan"
import { DEFAULT_PARAMS } from "../lib/params"
import { buildSnitt, DETAIL } from "../lib/snitt"
import { cubeSoup, put } from "../lib/sources"
import { makeSoup, openEdges, reparer, signedVolume, type Indexed } from "../lib/soup"

let brot = 0
function prov(namn: string, fn: () => void) {
  try { fn(); console.log(`ok ${namn}`) }
  catch (e) { brot++; console.error(`FEIL ${namn}: ${e instanceof Error ? e.message : e}`) }
}

function indeksert(pos: Float32Array): Indexed {
  const punkt = new Map<string, number>()
  const verts: number[] = [], idx: number[] = []
  for (let i = 0; i < pos.length; i += 3) {
    const nokkel = `${pos[i]},${pos[i + 1]},${pos[i + 2]}`
    let j = punkt.get(nokkel)
    if (j === undefined) { j = punkt.size; punkt.set(nokkel, j); verts.push(pos[i], pos[i + 1], pos[i + 2]) }
    idx.push(j)
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) }
}

const rekt = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const ramme = (k: number): Ramme => ({ o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], k })

prov("ugyldige trekantar forgiftar ikkje importen eller endrar inndata", () => {
  const kube = cubeSoup()
  const pos = new Float32Array([...kube.pos.slice(0, 27), NaN, 0, 0, 1, 0, 0, 1, 1, 0, ...kube.pos.slice(27), Infinity, 0, 0, 1, 0, 0, 1, 1, 0, 7])
  const kopi = pos.slice()
  const rein = makeSoup(pos)
  assert.deepEqual(rein, kube)
  assert.deepEqual(pos, kopi)
  const fil = meshToStl({ positions: pos.slice(0, -1), normals: new Float32Array(pos.length - 1), tris: (pos.length - 1) / 9 })
  assert.deepEqual(parseMesh("uren.stl", fil.buffer as ArrayBuffer), kube)
  assert.equal(makeSoup(new Float32Array([NaN, 0, 0, 1, 0, 0, 1, 1, 0])).tris, 0)
})

prov("doble og areallause flater vert tekne bort før orientering", () => {
  const kube = cubeSoup()
  const pos = new Float32Array([...kube.pos, ...kube.pos.slice(0, 9), ...kube.pos.slice(3, 9), ...kube.pos.slice(0, 3), 0, 0, 0, 10, 0, 0, 20, 0, 0])
  const nett = reparer(makeSoup(pos))
  assert.equal(nett.idx.length / 3, 12)
  assert.equal(openEdges(nett), 0)
  assert(Math.abs(signedVolume(nett) - 1e6) < 1e-8)
  const blanda = kube.pos.slice()
  for (let t = 0; t < blanda.length; t += 18) for (let a = 0; a < 3; a++) [blanda[t + 3 + a], blanda[t + 6 + a]] = [blanda[t + 6 + a], blanda[t + 3 + a]]
  const retta = reparer(makeSoup(blanda))
  assert.equal(openEdges(retta), 0)
  assert(Math.abs(signedVolume(retta) - 1e6) < 1e-8)
})

prov("tvetydige doble flater og mange kantbruk vert ikkje kalla tette", () => {
  const kube = cubeSoup()
  const motsett = [...kube.pos.slice(0, 3), ...kube.pos.slice(6, 9), ...kube.pos.slice(3, 6)]
  assert.equal(openEdges(reparer(makeSoup(new Float32Array([...kube.pos, ...motsett])))), 3)
  const idx = new Uint32Array(65538 * 3)
  for (let i = 0; i < idx.length; i++) idx[i] = i % 3
  assert.equal(openEdges({ verts: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), idx }), 3)
})

prov("reparasjon er per kjelde, ikkje per innstilling eller kjeldenamn", () => {
  const a = cubeSoup(), b = cubeSoup(200)
  const nett = reparer(a)
  assert.equal(reparer(a), nett)
  const pos: number[] = []
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pos.push(x, y, 0, x + 1, y, 0, x + 1, y + 1, 0, x, y, 0, x + 1, y + 1, 0, x, y + 1, 0)
  const fin = reparer(makeSoup(new Float32Array(pos)))
  const grov = decimate(fin, 256)
  assert.notEqual(grov, fin)
  assert.equal(decimate(fin, 256), grov)
  assert.notEqual(reparer(b), nett)
  put("nett-prov", "nett", a)
  const p = { ...DEFAULT_PARAMS, kjelde: "nett-prov", glatt: 0 }
  const forst = makeKropp(p)
  put("nett-prov", "nett", b)
  assert.notEqual(makeKropp(p), forst)
  assert(Math.abs(signedVolume(nett) - 1e6) < 1e-8)
})

for (const [namn, verdiar, tal] of [
  ["to øyar", [10, -4, 1, -4], 2],
  ["samanhengande gods", [4, -10, 4, -1], 1],
  ["to spegla øyar", [-4, 10, -4, 1], 2],
  ["spegla samanheng", [-10, 4, -1, 4], 1],
] as const) prov(`sadelpunkt: ${namn}`, () => {
  const g = new Float64Array(16).fill(-20)
  ;[g[5], g[6], g[10], g[9]] = verdiar
  const ringar = contour(g, 0, 1, 3, 0, 1, 3)
  assert.equal(ringar.length, tal)
  assert(ringar.every((q) => q.area > 0))
})

const omriss: Pt[] = [[-60, 0], [60, 0], [60, 200], [20, 200], [20, 70], [-20, 70], [-20, 200], [-60, 200]]
const hol = [rekt(-52, 20, 22, 25).reverse(), rekt(30, 25, 20, 80).reverse()]
for (const k of [0, 1 / 150, -1 / 150, 1 / 30, -1 / 30]) prov(`hol og innhakk, krumming ${k.toFixed(4)}`, () => {
  const r = ramme(k), t = Math.abs(k) > 0.03 ? 24 : 3, s = newSoup()
  ribSolid(s, { r, outlines: [omriss], holes: hol }, t)
  const mesh = soupToMesh(s)
  const nett = indeksert(mesh.positions)
  assert.equal(openEdges(nett), 0, "kvar kant skal ha to flater utan toleransesveising")
  const vol = (Math.abs(shoelace(omriss)) - hol.reduce((a, q) => a + Math.abs(shoelace(q)), 0)) * t
  assert(Math.abs(signedVolume(nett) / vol - 1) < 0.002)
  for (let i = 0; i < s.pos.length; i += 9) {
    if (s.kan[i / 3]) continue
    const a = s.pos.slice(i, i + 3) as Vec3, b = s.pos.slice(i + 3, i + 6) as Vec3, c = s.pos.slice(i + 6, i + 9) as Vec3
    const off = avFlata(r, a)
    for (const q of [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]] as Vec3[]) {
      assert(Math.abs(avFlata(r, q) - off) <= 0.050001, "maksimal pilhøgd er 0,05 mm")
    }
  }
  const stl = meshToStl(mesh)
  assert.equal(openEdges(indeksert(parseMesh("boygd.stl", stl.buffer as ArrayBuffer).pos)), 0)
})

prov("skrå rammer og runde hol får dei same kantpunkta på kvar side", () => {
  for (let i = 0; i < 12; i++) {
    const r = planRamme({ o: [0.4, 0.6, 0.2], n: [Math.cos(i), Math.sin(i), 0.3], bog: i % 2 ? 2 : -2 }, [-100, -100, 0], [100, 100, 200])
    const o = Array.from({ length: 36 }, (_, j): Pt => {
      const a = j * 2 * Math.PI / 36, rad = 60 + 8 * Math.sin(a * 5)
      return [rad * Math.cos(a) + 0.123, rad * Math.sin(a) + 0.456]
    })
    const hol = Array.from({ length: 17 }, (_, j): Pt => [12 * Math.cos(j * 2 * Math.PI / 17) + 23, -12 * Math.sin(j * 2 * Math.PI / 17) + 5])
    const s = newSoup()
    ribSolid(s, { r, outlines: [o], holes: [hol] }, 12)
    assert.equal(openEdges(indeksert(soupToMesh(s).positions)), 0)
  }
})

prov("lukka ring og kollineære punkt gjev ingen sprekker", () => {
  const o: Pt[] = [[0, 0], [20, 0], [40, 0], [40, 40], [0, 40], [0, 40], [0, 0]]
  const s = newSoup()
  ribSolid(s, { r: ramme(1 / 100), outlines: [o], holes: [] }, 12)
  assert.equal(openEdges(indeksert(soupToMesh(s).positions)), 0)
})

prov("utrulling bevarer lengda på nøytralflata, begge bøyeretningar", () => {
  for (const k of [1 / 150, -1 / 150]) for (const u of [-400, -100, 0, 150, 400]) {
    const r = ramme(k), q: Pt = [u, 120], p = ut(r, q)
    const tilbake = inn(r, p)
    assert(Math.hypot(tilbake[0] - q[0], tilbake[1] - q[1]) < 1e-10)
    assert(Math.abs(avFlata(r, p)) < 1e-10)
  }
})

prov("eigd omriss snur ikkje kroppen og vert ikkje klipt av han", () => {
  const p = { ...DEFAULT_PARAMS, plan: skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5], n: [0.6, 0.8, 0], bog: 0.8, strek: [], omriss: rekt(-0.6, -0.3, 1.2, 0.6) }]) }
  const k = makeKropp(p)
  const sol = k.solid, soup = k.soup
  k.solid = { ...sol, runs: () => { throw new Error("omrisset treng ingen strålar") } }
  k.soup = { ...soup, get pos(): Float32Array { throw new Error("omrisset treng ikkje å rulle kroppen") } }
  vendNull()
  try {
    const s = buildSnitt(k, p, DETAIL.mid)
    assert.equal(s.ribber.length, 1)
    assert.equal(vendTal().bom, 0)
    assert(Math.abs(s.ribber[0].area / (p.storleik ** 2 * 0.72) - 1) < 0.005)
  } finally { k.solid = sol; k.soup = soup }
})

for (const hogd of [200, 1000]) {
  const tider: number[] = []
  let tris = 0
  for (let i = 0; i < 40; i++) {
    const start = performance.now(), s = newSoup()
    ribSolid(s, { r: ramme(1 / 150), outlines: [rekt(-60, 0, 120, hogd)], holes: [] }, 3)
    if (i >= 10) tider.push(performance.now() - start)
    tris = s.pos.length / 9
  }
  prov(`120 × ${hogd} mm bøygd plate: under 250 trekantar`, () => assert(tris < 250))
  console.log(`  ${tris} trekantar · median ${tider.sort((a, b) => a - b)[15].toFixed(3)} ms (30 bygg)`)
}
console.log(`${brot} brot`)
process.exitCode = brot ? 1 : 0
