import { parseMesh } from "../lib/io"
import { bounds, signedVolume, weld } from "../lib/soup"
import { glb, kasse } from "./glbfil"

let brot = 0

const nn = (v: number) => (Math.abs(v) < 1e-4 ? 0 : +v.toFixed(2))

function sjekk(
  namn: string,
  buf: ArrayBuffer,
  fasit: { min: number[]; max: number[]; tris: number },
  fil = "prove.glb",
) {
  try {
    const s = parseMesh(fil, buf)
    const b = bounds(s.pos)
    const got = { min: b.min.map(nn), max: b.max.map(nn), tris: s.tris }
    const ok =
      got.tris === fasit.tris &&
      got.min.every((v, i) => Math.abs(v - fasit.min[i]) < 0.05) &&
      got.max.every((v, i) => Math.abs(v - fasit.max[i]) < 0.05)
    if (!ok) brot++
    console.log(
      `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(30)} ${got.tris} tri  ` +
        `[${got.min}] .. [${got.max}]` +
        (ok ? "" : `\n        venta ${fasit.tris} tri  [${fasit.min}] .. [${fasit.max}]`),
    )
  } catch (e) {
    brot++
    console.log(`FEIL  ${namn.padEnd(30)} kasta: ${(e as Error).message}`)
  }
}

function sjekkFeil(namn: string, buf: ArrayBuffer, vent: RegExp, fil = "prove.glb") {
  try {
    parseMesh(fil, buf)
    brot++
    console.log(`FEIL  ${namn.padEnd(30)} skulle ha kasta`)
  } catch (e) {
    const m = (e as Error).message
    const ok = vent.test(m)
    if (!ok) brot++
    console.log(`${ok ? "  ok " : "FEIL"}  ${namn.padEnd(30)} «${m}»`)
  }
}

const k = kasse(20, 40, 10)

sjekk("kasse, inga flytting", glb(k.pos, k.idx, [{ mesh: 0 }], [0]), {
  min: [-10, -5, 0],
  max: [10, 5, 40],
  tris: 12,
})

sjekk(
  "kasse, flytta og skalert node",
  glb(k.pos, k.idx, [{ mesh: 0, translation: [100, 5, -3], scale: [2, 2, 2] }], [0]),
  { min: [80, -7, 5], max: [120, 13, 85], tris: 12 },
)

sjekk(
  "kasse, node inni node",
  glb(
    k.pos,
    k.idx,
    [
      { children: [1], scale: [3, 3, 3] },
      { mesh: 0, translation: [0, 10, 0] },
    ],
    [0],
  ),
  { min: [-30, -15, 30], max: [30, 15, 150], tris: 12 },
)

const s45 = Math.SQRT1_2
sjekk(
  "kasse, vend 90° om Y",
  glb(k.pos, k.idx, [{ mesh: 0, rotation: [0, s45, 0, s45] }], [0]),
  { min: [-5, -10, 0], max: [5, 10, 40], tris: 12 },
)

const laus = new Float32Array(k.idx.length * 3)
k.idx.forEach((v, i) => {
  laus[i * 3] = k.pos[v * 3]
  laus[i * 3 + 1] = k.pos[v * 3 + 1]
  laus[i * 3 + 2] = k.pos[v * 3 + 2]
})
sjekk("kasse, utan indeksar", glb(laus, null, [{ mesh: 0 }], [0]), {
  min: [-10, -5, 0],
  max: [10, 5, 40],
  tris: 12,
})

const stripe = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0])
sjekk(
  "stripe (mode 5)",
  glb(stripe, new Uint32Array([0, 1, 2, 3]), [{ mesh: 0 }], [0], { mode: 5 }),
  { min: [0, 0, 0], max: [10, 0, 10], tris: 2 },
)

sjekk(
  "vifte (mode 6)",
  glb(stripe, new Uint32Array([0, 1, 3, 2]), [{ mesh: 0 }], [0], { mode: 6 }),
  { min: [0, 0, 0], max: [10, 0, 10], tris: 2 },
)

sjekkFeil(
  "draco-komprimert",
  glb(k.pos, k.idx, [{ mesh: 0 }], [0], { kravExt: "KHR_draco_mesh_compression" }),
  /Draco/,
)
sjekkFeil(
  "meshopt-komprimert",
  glb(k.pos, k.idx, [{ mesh: 0 }], [0], { kravExt: "EXT_meshopt_compression" }),
  /meshopt/,
)

{
  const buf = glb(k.pos, k.idx, [{ mesh: 0 }], [0])
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  const doc = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)),
  ) as Record<string, unknown>
  const binLen = dv.getUint32(20 + jsonLen, true)
  const bin = new Uint8Array(buf, 28 + jsonLen, binLen)
  ;(doc.buffers as { uri?: string }[])[0].uri =
    "data:application/octet-stream;base64," + Buffer.from(bin).toString("base64")
  const txt = new TextEncoder().encode(JSON.stringify(doc))
  sjekk(
    "gltf med data-uri",
    txt.buffer.slice(txt.byteOffset, txt.byteOffset + txt.byteLength) as ArrayBuffer,
    { min: [-10, -5, 0], max: [10, 5, 40], tris: 12 },
    "prove.gltf",
  )
}

{
  const doc = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 12, uri: "scene.bin" }],
  }
  const txt = new TextEncoder().encode(JSON.stringify(doc))
  sjekkFeil(
    "gltf med ekstern .bin",
    txt.buffer.slice(txt.byteOffset, txt.byteOffset + txt.byteLength) as ArrayBuffer,
    /\.bin|glb/i,
  )
}

sjekk("glb kalla .stl", glb(k.pos, k.idx, [{ mesh: 0 }], [0]), {
  min: [-10, -5, 0],
  max: [10, 5, 40],
  tris: 12,
}, "skann.stl")

{
  const doc = {
    asset: { version: "2.0" },
    buffers: [
      { byteLength: 4, uri: "data:application/octet-stream;base64,AAAAAA==" },
      { byteLength: 12, uri: "hjorne.bin" },
    ],
    bufferViews: [{ buffer: 1, byteOffset: 0, byteLength: 12 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  }
  sjekkFeil(
    "gltf med .bin i buffer to",
    new TextEncoder().encode(JSON.stringify(doc)).buffer as ArrayBuffer,
    /bruk \.glb i staden/,
    "scene.gltf",
  )
}

function speglaSjekk(namn: string, buf: ArrayBuffer, vent: number) {
  const s = parseMesh("spegla.glb", buf)
  const v = signedVolume(weld(s))
  const ok = Math.sign(v) === Math.sign(vent) && Math.abs(Math.abs(v) - Math.abs(vent)) < 1
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(30)} ${s.tris} tri, signert volum ${v.toFixed(0)}` +
      (ok ? "" : `  venta ${vent}`),
  )
  return v
}

{
  const { pos: boks, idx: boksIdx } = kasse(10, 4, 6)
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const speglX = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const flytt = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]
  const speglOgFlytt = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, 0, 0, 1]
  const fasit = signedVolume(weld(parseMesh("spegla.glb", glb(boks, boksIdx, [{ mesh: 0, matrix: I }], [0]))))
  const vol = fasit

  speglaSjekk("node utan spegling", glb(boks, boksIdx, [{ mesh: 0, matrix: I }], [0]), vol)
  speglaSjekk("node spegla i X", glb(boks, boksIdx, [{ mesh: 0, matrix: speglX }], [0]), vol)
  speglaSjekk(
    "halv scene spegla",
    glb(
      boks,
      boksIdx,
      [
        { mesh: 0, matrix: flytt(-20) },
        { mesh: 0, matrix: speglOgFlytt },
      ],
      [0, 1],
    ),
    vol * 2,
  )
}

{
  const V = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]]
  const F = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]
  const ply = (texcoord: boolean) =>
    [
      "ply",
      "format ascii 1.0",
      `element vertex ${V.length}`,
      "property float x",
      "property float y",
      "property float z",
      `element face ${F.length}`,
      "property list uchar int vertex_indices",
      ...(texcoord ? ["property list uchar float texcoord"] : []),
      "end_header",
      ...V.map((p) => p.join(" ")),
      ...F.map((f) => `3 ${f.join(" ")}${texcoord ? " 6 0.1 0.2 0.3 0.4 0.5 0.6" : ""}`),
    ].join("\n")
  for (const [namn, tex] of [["ply utan texcoord", false], ["ply med texcoord", true]] as const) {
    sjekk(
      namn,
      new TextEncoder().encode(ply(tex)).buffer as ArrayBuffer,
      { min: [0, 0, 0], max: [10, 10, 10], tris: 4 },
      "skann.ply",
    )
  }
}

{
  const tri = new Float32Array([0, 0, 0, 20, 0, 0, 0, 20, 0])
  const b64 = Buffer.from(new Uint8Array(tri.buffer)).toString("base64")
  const doc = (ekstra: Record<string, unknown>) =>
    new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ byteLength: tri.byteLength, uri: `data:application/octet-stream;base64,${b64}` }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: tri.byteLength }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [20, 20, 0] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ mesh: 0 }, { children: [0], translation: [100, 0, 0] }],
        ...ekstra,
      }),
    ).buffer as ArrayBuffer

  const fasit = { min: [100, 0, 0], max: [120, 0, 20], tris: 1 }
  sjekk("gltf med scene", doc({ scene: 0, scenes: [{ nodes: [1] }] }), fasit, "p.gltf")
  sjekk("gltf utan scenes", doc({}), fasit, "p.gltf")
  sjekk("gltf med tom scene", doc({ scene: 0, scenes: [{ nodes: [] }] }), fasit, "p.gltf")
}

console.log(brot ? `\n${brot} PRØVER RYK` : "\nalle GLB-prøver held")
process.exit(brot ? 1 : 0)
