/**
 * Tungprøva. Eit skann er ikkje fire tusen trekantar — det er to millionar,
 * og heile spørsmålet om reiskapen er brukbar er om han overlever eit slikt
 * eit. Her vert eitt laga, importert som STL, og snitta.
 *
 *   npx tsx scripts/tung.ts
 */
import { makeSoup } from "../lib/soup"
import { meshToStl } from "../lib/vaffel/export-stl"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { VAFFEL } from "../lib/vaffel/engine"
import { DEFAULT_PARAMS } from "../lib/vaffel/params"
import type { ParamBag } from "../lib/core"

/** ei knudrete kule: ei kule med støy på, som eit skann */
function scan(seg: number): Float32Array {
  const pos: number[] = []
  const noise = (a: number, b: number) =>
    1 + 0.04 * Math.sin(a * 17.3) * Math.sin(b * 11.7) + 0.02 * Math.sin(a * 53.1)
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    const r = 80 * noise(th, ph)
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  return new Float32Array(pos)
}

const t0 = Date.now()
const soup = makeSoup(scan(720))
console.log(`laga ${soup.tris} trekantar på ${Date.now() - t0} ms`)

const nrm = new Float32Array(soup.pos.length)
for (let i = 0; i < nrm.length; i += 3) {
  const L = Math.hypot(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]) || 1
  nrm[i] = soup.pos[i] / L
  nrm[i + 1] = soup.pos[i + 1] / L
  nrm[i + 2] = soup.pos[i + 2] / L
}
const t1 = Date.now()
const stl = meshToStl({ positions: soup.pos, normals: nrm, tris: soup.tris }).buffer.slice(0)
console.log(`skreiv STL på ${Date.now() - t1} ms (${(stl.byteLength / 1e6).toFixed(1)} MB)`)

const t2 = Date.now()
const inn = parseMesh("skann.stl", stl as ArrayBuffer)
console.log(`las STL på ${Date.now() - t2} ms → ${inn.tris} trekantar`)
put("skann", "skann.stl", inn)

for (const trekant of [8, 20, 60]) {
  const p = { ...DEFAULT_PARAMS, kjelde: "skann", trekant, glatt: 4, ribbX: 8, ribbY: 8 }
  const t = Date.now()
  const m = VAFFEL.measure(p as unknown as ParamBag)
  const tMeasure = Date.now() - t
  const t3 = Date.now()
  VAFFEL.build(p as unknown as ParamBag, "mid", "lag")
  const tBuild = Date.now() - t3
  console.log(
    `  tak ${trekant}k → ${m.tris} trekantar, ${m.parts} delar, ${m.joints} ledd, ` +
      `${(m.cutLen / 1000).toFixed(1)} m kutt · fyrste snitt ${tMeasure} ms, bygg ${tBuild} ms`,
  )
}

// Vendinga skal vera billeg. Nettet er alt sveisa og forenkla; det einaste
// som står att er ein rotasjon, ein skalering og ei ny rutetabell.
{
  const base = { ...DEFAULT_PARAMS, kjelde: "skann", trekant: 20, glatt: 4, ribbX: 8, ribbY: 8 }
  VAFFEL.measure(base as unknown as ParamBag)
  for (const rotX of [5, 10, 15]) {
    const t = Date.now()
    VAFFEL.measure({ ...base, rotX } as unknown as ParamBag)
    console.log(`  vend ${rotX}° → ${Date.now() - t} ms`)
  }
}
