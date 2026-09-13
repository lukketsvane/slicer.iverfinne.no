/** Profilar og rekkjer gjennom den verkelege motoren og planformatet. */
import assert from "node:assert/strict"
import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS } from "../lib/params"
import { lesPlan, skrivPlan, rutenett, ramme, ut } from "../lib/plan"
import { SKISSEFORMER, skisseprofil, kopierPlan, gjentaProfil } from "../lib/skisseverkty"
import type { Vec3 } from "../lib/core"

const min: Vec3 = [-75,-50,-100], max: Vec3 = [75,50,100]
for (const form of SKISSEFORMER) {
  const p = skisseprofil(form, 1, 0)
  const kopi = kopierPlan(p)
  kopi.omriss![0][0] += .1
  assert.notDeepEqual(kopi.omriss, p.omriss, "kopien må eige punkta sine")
  for (const slag of ["rett", "vifte", "vridd"] as const) {
    const svar = gjentaProfil([p], 1, 8, 10, 35, slag, min, max)
    assert(!("feil" in svar), `${form}/${slag}`)
    assert.equal(svar.plan.length, 8)
    assert.deepEqual(svar.plan[0].o, p.o, "originalen står stille")
    assert.deepEqual(svar.plan[0].omriss, p.omriss, "originalen held forma")
    assert.equal(new Set(svar.plan.map(q => q.id)).size, 8)
    const bag = { ...DEFAULT_PARAMS, plan: skrivPlan(svar.plan), storleik: 150, lause: 1 }
    assert.equal(lesPlan(bag.plan).length, 8)
    assert.equal(MOTOR.measure(bag).parts, 8, `${form}/${slag}: kvar profil vert éin del`)
    const fil = MOTOR.exportFile(bag, "svg")
    assert((fil.text?.length ?? fil.data?.byteLength ?? 0) > 100, "profilane kan eksporterast")
  }
  console.log(`ok ${form}: rett, vifte, vridd og SVG`)
}
const p = { ...skisseprofil("sadel", 19, 0), mjuk: .003, farge: 9, bog: 0, strek: [{ slag: "hol" as const, form: "rekt" as const, x: .1, y: .2, w: .04, h: .06, a: 15 }] }
assert.deepEqual(kopierPlan(p), p, "dubler held alle eigenskapane")
const svar = gjentaProfil([p], 19, 3, 20, 90, "vridd", min, max)
assert(!("feil" in svar))
const siste = svar.plan[2]
assert(Math.abs(siste.strek[0].x + .2) < 1e-8 && Math.abs(siste.strek[0].y - .1) < 1e-8)
assert.equal(siste.strek[0].a, 105)
assert.equal(siste.mjuk, p.mjuk)
assert.equal(siste.farge, p.farge)
assert.deepEqual(siste.runde, p.runde)
const a = ramme(p, min, max), b = ramme(siste, min, max)
assert(Math.abs(ut(b, [0,0], 0)[0] - ut(a, [0,0], 0)[0] - 40) < 1e-8, "senteravstand er mm i ulik boks")
assert("feil" in gjentaProfil(rutenett(32,32), 1, 2, 10, 0, "rett", min, max))
for (const tal of [NaN, 1, 2.5, 100]) assert("feil" in gjentaProfil([p], 19, tal, 10, 0, "rett", min, max))
assert("feil" in gjentaProfil([p], 19, 8, 10000, 0, "rett", min, max))
assert("feil" in gjentaProfil([{ ...p, bog: 1 }], 19, 3, 10, 30, "vridd", min, max))
console.log("ok kopiering, strokar, millimeter, tak og ugyldige inndata")
