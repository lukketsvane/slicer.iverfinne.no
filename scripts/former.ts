/**
 * FORMENE: EIT TUNGT NETT VERT EI INNEBYGD FORM.
 *
 * Dei innebygde formene er møblar og ikkje matematikk: ein krakk du kan
 * skjere i seier meir om kva verktyet er til enn ein torus gjer. Men ei
 * modellfil frå verda er seks megabyte tekstur og to hundre tusen trekantar,
 * og INGEN av delane kjem med hit: verktyet snittar geometri, og det snittar
 * ho ned til `trekant`-taket uansett. Å sende bytane er berre venting.
 *
 * Difor dette: les fila, sveis henne, skjer henne ned til taket, og skriv
 * henne att som ein GLB med INDEKS. Hjørna står éin gong kvar i staden for
 * tre, og det er to tredelar av fila.
 *
 * VENDINGA, MEN IKKJE SKALAEN. Lesaren snur glTF sitt y-opp til verkstaden
 * sitt z-opp, so skrivinga må snu attende — elles kjem forma inn liggjande.
 * Men lesaren rører ikkje MÅLESTOKKEN, og `export-glb.ts` deler på tusen på
 * vegen ut (ein kropp er millimeter, glTF er meter). Gjer vi det same her,
 * krympar forma tusen gonger for kvar gong ho går gjennom. Det ser ingen —
 * alt vert skalert til `storleik` uansett — men ei fil med koordinat på ein
 * titusendel er ei fil som til slutt ikkje har att presisjon å miste.
 * Prøva under les fila attende og krev at boksen er den same.
 *
 *   npx tsx scripts/former.ts <namn>=<fil> [<namn>=<fil> ...]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { parseMesh } from "../lib/io"
import { weld } from "../lib/soup"
import { decimate } from "../lib/mesh/simplify"

/**
 * TAKET PÅ EI FORM. `trekant` står på førti tusen, og bygget skjer ned dit
 * med det same; ei form med meir i seg er berre nedlasting. Tjuefem tusen
 * ligg under taket med god margin og er langt meir enn ein profil gjennom
 * ein krakk kan sjå: feltet er to hundre og tjue celler breitt.
 */
const TAK = 25_000
const UT = "public/form"

function glb(m: { verts: Float32Array; idx: Uint32Array }, namn: string): Uint8Array {
  const nv = m.verts.length / 3
  const pos = new Float32Array(nv * 3)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < nv; i++) {
    // z opp → y opp, den same vendinga `meshToGlb` gjer, utan delinga
    const v: [number, number, number] = [m.verts[i * 3], m.verts[i * 3 + 2], -m.verts[i * 3 + 1]]
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] = v[a]
      if (v[a] < min[a]) min[a] = v[a]
      if (v[a] > max[a]) max[a] = v[a]
    }
  }
  // indeksane er 16 bit når dei får plass: halve fila mot 32
  const smaa = nv <= 65535
  const idx = smaa ? new Uint16Array(m.idx) : new Uint32Array(m.idx)
  const idxB = new Uint8Array(idx.buffer, 0, idx.byteLength)
  const posB = new Uint8Array(pos.buffer, 0, pos.byteLength)
  const padd = (b: Uint8Array, fyll: number) => {
    const n = (4 - (b.length % 4)) % 4
    if (!n) return b
    const ut = new Uint8Array(b.length + n)
    ut.set(b)
    ut.fill(fyll, b.length)
    return ut
  }
  const idxP = padd(idxB, 0)
  const bin = new Uint8Array(idxP.length + posB.length)
  bin.set(idxP)
  bin.set(posB, idxP.length)
  const json = {
    asset: { version: "2.0", generator: "slicerman" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: namn }],
    meshes: [{ name: namn, primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }] }],
    materials: [
      {
        name: "material",
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.72, 0.6, 0.42, 1], metallicFactor: 0, roughnessFactor: 0.85 },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: smaa ? 5123 : 5125, count: idx.length, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: nv, type: "VEC3", min, max },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: idxB.length, target: 34963 },
      { buffer: 0, byteOffset: idxP.length, byteLength: posB.length, target: 34962 },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  const jb = padd(new TextEncoder().encode(JSON.stringify(json)), 0x20)
  const bb = padd(bin, 0)
  const total = 12 + 8 + jb.length + 8 + bb.length
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jb.length, true)
  dv.setUint32(16, 0x4e4f534a, true)
  u8.set(jb, 20)
  const at = 20 + jb.length
  dv.setUint32(at, bb.length, true)
  dv.setUint32(at + 4, 0x004e4942, true)
  u8.set(bb, at + 8)
  return u8
}

const par = process.argv.slice(2).map((a) => a.split("="))
if (!par.length || par.some((p) => p.length !== 2)) {
  console.error("bruk: npx tsx scripts/former.ts <namn>=<fil> ...")
  process.exit(1)
}
mkdirSync(UT, { recursive: true })
for (const [namn, fil] of par) {
  const b = readFileSync(fil)
  const inn = parseMesh(fil, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  // Sveisen utan eit tal: `weld` reknar sitt eige på diagonalen. Ei fil i
  // meter er tusen gonger mindre enn ei i millimeter, og eit fast tal her
  // hadde smelta den eine og late den andre stå.
  const m = decimate(weld(inn), TAK)
  const ut = glb(m, namn)
  writeFileSync(`${UT}/${namn}.glb`, ut)
  // og les han attende: ei form som ikkje kan lesast er ei form som fell
  // attende på kuben utan å seie frå, og det ser ingen før nokon prøver
  const att = parseMesh(`${namn}.glb`, ut.buffer.slice(ut.byteOffset, ut.byteOffset + ut.byteLength) as ArrayBuffer)
  const boks = (s: { min: number[]; max: number[] }) => s.max.map((c, i) => c - s.min[i])
  const a = boks(inn)
  const b2 = boks(att)
  const like = att.tris === m.idx.length / 3 && a.every((c, i) => Math.abs(c - b2[i]) < c * 0.02 + 1e-9)
  console.log(
    `${namn.padEnd(13)} ${String(inn.tris).padStart(7)} → ${String(att.tris).padStart(6)} tri   ` +
      `${(b.length / 1e6).toFixed(1)} MB → ${(ut.length / 1024).toFixed(0)} kB   ` +
      `${b2.map((c) => +c.toPrecision(3)).join(" × ")}   ` +
      (like ? "les attende, same boks" : `LES IKKJE ATTENDE: ${att.tris} vs ${m.idx.length / 3}, ${a.map((c) => +c.toPrecision(3)).join("×")} → ${b2.map((c) => +c.toPrecision(3)).join("×")}`),
  )
  if (!like) process.exit(1)
}
