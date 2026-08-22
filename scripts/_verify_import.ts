/** kastast etter bruk */
import { parseMesh } from "../lib/io"
import { bounds, signedVolume, weld } from "../lib/soup"
import { makeSolid } from "../lib/mesh/solid"
import { glb, kasse } from "./glbfil"

const line = (s: string) => console.log("\n=== " + s + " ===")

// ---------------------------------------------------------------- KRAV 1
line("KRAV 1: spegla node i GLB")
{
  // eining-kube 0..1, CCW ut
  const V = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ]
  const F: number[][] = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ]
  const pos = new Float32Array(V.flat())
  const idx: number[] = []
  for (const [a, b, c, d] of F) idx.push(a, b, c, a, c, d)
  const I = new Uint32Array(idx)

  const kontroll = glb(pos, I, [
    { mesh: 0, scale: [40, 40, 40] },
    { mesh: 0, translation: [46, 0, 14], scale: [12, 12, 12] },
  ], [0, 1])
  const spegla = glb(pos, I, [
    { mesh: 0, scale: [40, 40, 40] },
    { mesh: 0, translation: [58, 0, 14], scale: [-12, 12, 12] },
  ], [0, 1])

  for (const [namn, buf] of [["kontroll", kontroll], ["spegla", spegla]] as const) {
    const s = parseMesh("p.glb", buf as ArrayBuffer)
    const b = bounds(s.pos)
    console.log(namn, "tris", s.tris, "vol", signedVolume(weld(s)).toFixed(1),
      "min", b.min.map((v) => +v.toFixed(2)), "max", b.max.map((v) => +v.toFixed(2)))
  }

  // redusert: eitt einaste spegla nett
  const eitt = glb(pos, I, [{ mesh: 0, matrix: [-12, 0, 0, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 0, 0, 1] }], [0])
  const s = parseMesh("p.glb", eitt)
  const sol = makeSolid(s)
  const cx = (s.min[0] + s.max[0]) / 2
  const cy = (s.min[1] + s.max[1]) / 2
  const cz = (s.min[2] + s.max[2]) / 2
  console.log("eitt spegla nett: runs(2,cx,cy)", JSON.stringify(sol.runs(2, cx, cy)),
    "inside(sentrum)", sol.inside(cx, cy, cz), "vol", sol.volume().toFixed(1))
}

// ---------------------------------------------------------------- KRAV 2
line("KRAV 2: ASCII PLY med texcoord-liste")
{
  const utan = [
    "ply", "format ascii 1.0", "element vertex 4",
    "property float x", "property float y", "property float z",
    "element face 2", "property list uchar int vertex_indices", "end_header",
    "0 0 0", "10 0 0", "10 10 0", "0 10 0",
    "3 0 1 2", "3 0 2 3", "",
  ].join("\n")
  const med = [
    "ply", "format ascii 1.0", "element vertex 4",
    "property float x", "property float y", "property float z",
    "element face 2",
    "property list uchar int vertex_indices",
    "property list uchar float texcoord",
    "end_header",
    "0 0 0", "10 0 0", "10 10 0", "0 10 0",
    "3 0 1 2 6 0.12 0.34 0.56 0.78 0.90 0.11",
    "3 0 2 3 6 0.21 0.43 0.65 0.87 0.09 0.22", "",
  ].join("\n")
  for (const [namn, txt] of [["utan texcoord", utan], ["med texcoord", med]] as const) {
    const b = new TextEncoder().encode(txt)
    const s = parseMesh("skann.ply", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    const nan = Array.from(s.pos).filter((v) => Number.isNaN(v)).length
    console.log(namn, "tris", s.tris, "flyttal", s.pos.length, "NaN", nan)
  }
  // og teksturlista FYRST, indeksane etterpå
  const snudd = [
    "ply", "format ascii 1.0", "element vertex 4",
    "property float x", "property float y", "property float z",
    "element face 2",
    "property list uchar float texcoord",
    "property list uchar int vertex_indices",
    "end_header",
    "0 0 0", "10 0 0", "10 10 0", "0 10 0",
    "6 0.12 0.34 0.56 0.78 0.90 0.11 3 0 1 2",
    "6 0.21 0.43 0.65 0.87 0.09 0.22 3 0 2 3", "",
  ].join("\n")
  const b2 = new TextEncoder().encode(snudd)
  const s2 = parseMesh("skann.ply", b2.buffer.slice(b2.byteOffset, b2.byteOffset + b2.byteLength) as ArrayBuffer)
  console.log("texcoord fyrst", "tris", s2.tris, "NaN", Array.from(s2.pos).filter((v) => Number.isNaN(v)).length)
}

// ---------------------------------------------------------------- KRAV 3
line("KRAV 3: fleire bufferar i .gltf")
{
  const k = kasse(20, 40, 10)
  const posBytes = new Uint8Array(k.pos.buffer.slice(0))
  const idxBytes = new Uint8Array(k.idx.buffer.slice(0))
  const pad4 = (n: number) => (n + 3) & ~3
  const idxOff = pad4(posBytes.length)
  const binLen = pad4(idxOff + idxBytes.length)
  const ekte = new Uint8Array(binLen)
  ekte.set(posBytes, 0)
  ekte.set(idxBytes, idxOff)
  const soppel = new Uint8Array(binLen).fill(0x7f)

  const doc = (buf1: { uri?: string; byteLength: number }) => ({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: k.pos.length / 3, type: "VEC3" },
      { bufferView: 1, componentType: 5125, count: k.idx.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 1, byteOffset: 0, byteLength: posBytes.length },
      { buffer: 1, byteOffset: idxOff, byteLength: idxBytes.length },
    ],
    buffers: [
      { byteLength: binLen, uri: "data:application/octet-stream;base64," + Buffer.from(soppel).toString("base64") },
      buf1,
    ],
  })

  const kjor = (namn: string, d: unknown) => {
    const t = new TextEncoder().encode(JSON.stringify(d))
    try {
      const s = parseMesh("to-bufferar.gltf", t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) as ArrayBuffer)
      const b = bounds(s.pos)
      console.log(namn, "tris", s.tris, "min", b.min, "max", b.max)
    } catch (e) {
      console.log(namn, "KASTA:", (e as Error).message)
    }
  }
  kjor("buffer1 = data-uri med ekte data", doc({ byteLength: binLen, uri: "data:application/octet-stream;base64," + Buffer.from(ekte).toString("base64") }))
  kjor("buffer1 = ekstern scene.bin", doc({ byteLength: binLen, uri: "scene.bin" }))
  // og kontrollen: éin buffer, alt rett
  const eitt = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: k.pos.length / 3, type: "VEC3" },
      { bufferView: 1, componentType: 5125, count: k.idx.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
      { buffer: 0, byteOffset: idxOff, byteLength: idxBytes.length },
    ],
    buffers: [{ byteLength: binLen, uri: "data:application/octet-stream;base64," + Buffer.from(ekte).toString("base64") }],
  }
  kjor("kontroll, éin buffer", eitt)
}
