import { readFileSync } from "node:fs"
import { parseMesh } from "../../lib/io"
import { openEdges, reparer, signedVolume, weld } from "../../lib/soup"

for (const sti of process.argv.slice(2)) {
  const b = readFileSync(sti)
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  const soup = parseMesh(sti, buf)
  const raa = weld(soup)
  const kant = new Map<string, number>()
  for (let i = 0; i < raa.idx.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = raa.idx[i + k]
      const c = raa.idx[i + ((k + 1) % 3)]
      const n = a < c ? `${a}_${c}` : `${c}_${a}`
      kant.set(n, (kant.get(n) ?? 0) + 1)
    }
  let ein = 0
  let fleire = 0
  for (const v of kant.values()) {
    if (v === 1) ein++
    else if (v > 2) fleire++
  }
  const nett = reparer(soup)
  const boks = soup.min.map((x, i) => `${x.toFixed(1)}..${soup.max[i].toFixed(1)}`).join(" ")
  console.log(
    `${sti.split("/").pop()} · ${(b.byteLength / 1024).toFixed(0)} kB · ${soup.tris} trekantar · ${raa.verts.length / 3} hjørne · kantar med 1 trekant ${ein}, med >2 ${fleire} · motoren: opne kantar ${openEdges(nett)}, volum ${signedVolume(nett).toFixed(0)} mm3 · boks ${boks}`,
  )
}
