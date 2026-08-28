/**
 * Vakta over GLB-lesaren.
 *
 * Ein GLB er ikkje eit nett — han er ei scene, og dei fleste feil ein kan
 * gjere her er USYNLEGE i tala: objektet kjem inn på skakke, i feil
 * storleik, eller ti meter frå origo, og trekanttalet stemmer heile vegen.
 * Difor vert filene skrivne her, med kjend geometri, og lesne att med
 * fasit i handa.
 *
 *   npx tsx scripts/glb-sjekk.ts
 */
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

// =============================================================================
// PRØVENE
// =============================================================================
const k = kasse(20, 40, 10)

// glTF er Y-OPP: kassa er 20 brei langs X, 40 høg langs Y, 10 djup langs Z.
// Verkstaden er Z-opp, so (x, y, z) skal kome ut som (x, −z, y).
sjekk("kasse, inga flytting", glb(k.pos, k.idx, [{ mesh: 0 }], [0]), {
  min: [-10, -5, 0],
  max: [10, 5, 40],
  tris: 12,
})

// Flytting og skalering i noden. Blender legg som regel heile vendinga si
// her, og ein lesar som hoppar over treet får rett trekanttal og feil objekt.
sjekk(
  "kasse, flytta og skalert node",
  glb(k.pos, k.idx, [{ mesh: 0, translation: [100, 5, -3], scale: [2, 2, 2] }], [0]),
  { min: [80, -7, 5], max: [120, 13, 85], tris: 12 },
)

// Ein forelder med skalering og eit barn med flytting: matrisene skal
// hopast opp nedover treet, ikkje berre lesast av den siste noden.
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

// Ei kvartsving om Y i kvaternion. Kjem tala ut i feil rekkjefylgje her,
// står objektet på skakke — og trekanttalet er framleis tolv.
const s45 = Math.SQRT1_2
sjekk(
  "kasse, vend 90° om Y",
  glb(k.pos, k.idx, [{ mesh: 0, rotation: [0, s45, 0, s45] }], [0]),
  { min: [-5, -10, 0], max: [5, 10, 40], tris: 12 },
)

// Utan indeksliste: hjørna ligg tre og tre, slik ei STL har dei.
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

// Trekantstripe. Annakvar trekant må snuast, elles vender halve nettet
// feil veg og stråleskytinga les halve objektet som luft.
const stripe = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0])
sjekk(
  "stripe (mode 5)",
  glb(stripe, new Uint32Array([0, 1, 2, 3]), [{ mesh: 0 }], [0], { mode: 5 }),
  { min: [0, 0, 0], max: [10, 0, 10], tris: 2 },
)

// Ein vifte-primitiv.
sjekk(
  "vifte (mode 6)",
  glb(stripe, new Uint32Array([0, 1, 3, 2]), [{ mesh: 0 }], [0], { mode: 6 }),
  { min: [0, 0, 0], max: [10, 0, 10], tris: 2 },
)

// Komprimerte nett kan vi ikkje lese. Då skal brukaren få vita KVA som er
// gale og kva han skal gjere, ikkje eit tomt objekt.
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

// .gltf som tekst, med bufferen som data-URI.
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

// Ei .gltf som peikar på ei .bin ved sida av seg har ikkje den fila med seg
// når ho vert dregen inn i ein nettlesar. Sei det, i staden for å ryke.
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

// Ei GLB som heiter noko anna skal framleis lesast som GLB.
sjekk("glb kalla .stl", glb(k.pos, k.idx, [{ mesh: 0 }], [0]), {
  min: [-10, -5, 0],
  max: [10, 5, 40],
  tris: 12,
}, "skann.stl")

// Ei fil kan ha fleire bufferar, og `bufferView.buffer` seier kva for ein.
// Vakta mot .bin-filer ved sida av såg berre på den fyrste: ei fil der
// buffer TO låg utanfor slapp gjennom, og las skrot ut av den fyrste i
// staden — utan ei feilmelding, av di byte er byte.
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

// =============================================================================
// SPEGLA NODAR OG PLY-LISTER
// =============================================================================
/**
 * Ei spegling snur handa på trekantane, og snittinga tel vindinga med SUM.
 * Ein spegla node vert difor talt som minus eitt skal: der han ligg har
 * objektet inga innside. Det globale vrengjevernet reddar det ikkje —
 * det snur heile nettet når volumet er negativt, og eit nett der berre
 * HALVPARTEN er spegla har framleis positivt volum. Ein symmetrisk
 * Blender-modell med ein spegla instans er nett den fila.
 */
/**
 * Fasiten er ikkje eit forteikn, men SAMSVAR: den spegla noden skal vende
 * same vegen som den uspegla. Kva veg hjelpefunksjonen `kasse` vind
 * boksen sin er hennar sak, og ho skal ikkje stå i ein fasit her.
 */
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
  // Boksen er 10 x 4 x 6. Forteiknet kjem frå den uspegla noden.
  const fasit = signedVolume(weld(parseMesh("spegla.glb", glb(boks, boksIdx, [{ mesh: 0, matrix: I }], [0]))))
  const vol = fasit

  speglaSjekk("node utan spegling", glb(boks, boksIdx, [{ mesh: 0, matrix: I }], [0]), vol)
  speglaSjekk("node spegla i X", glb(boks, boksIdx, [{ mesh: 0, matrix: speglX }], [0]), vol)
  // Den viktige: ein heil node og ein spegla, side om side. Volumet er
  // positivt anten vindinga er rett eller ikkje, so det globale
  // vrengjevernet ser ingenting — men halve objektet er vrengt.
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

/**
 * Ei PLY-flate kan ha fleire lister. `vertex_indices` er hjørna; ved sida
 * av han ligg det ofte `texcoord` med seks flyttal. Vert HO lesen som
 * hjørne òg, kjem det fire ekstra trekantar per flate, laga av
 * teksturkoordinatar tolka som indeksar.
 */
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

/**
 * EI ROT ER EIN NODE INGEN HAR SOM BARN.
 *
 * `scene` og `scenes` er begge valfrie i glTF 2.0 — berre `asset` er
 * påkravd. Kvar prøve i denne fila går gjennom `glbfil.ts`, som alltid
 * skriv ein `scenes`-tabell, so reserveløysinga for filer UTAN har aldri
 * vore prøvd her. Ho gjekk kvar node som ei rot, og eit barn med lågare
 * nodenummer enn forelderen vart då gått fyrst, med identitet: eit hjørne
 * med `translation [100, 0, 0]` over eit barn med nettet la objektet på
 * origo i staden for hundre millimeter ut.
 *
 * Tre filer med det same nettet og det same treet — berre scena skil dei —
 * skal gje det same objektet.
 */
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
        // barnet fyrst, forelderen etterpå: nett den rekkjefylgja som beit
        nodes: [{ mesh: 0 }, { children: [0], translation: [100, 0, 0] }],
        ...ekstra,
      }),
    ).buffer as ArrayBuffer

  // Y-opp vert Z-opp: [100..120, 0..20, 0] i fila vert [100..120, 0, 0..20]
  const fasit = { min: [100, 0, 0], max: [120, 0, 20], tris: 1 }
  sjekk("gltf med scene", doc({ scene: 0, scenes: [{ nodes: [1] }] }), fasit, "p.gltf")
  sjekk("gltf utan scenes", doc({}), fasit, "p.gltf")
  sjekk("gltf med tom scene", doc({ scene: 0, scenes: [{ nodes: [] }] }), fasit, "p.gltf")
}

console.log(brot ? `\n${brot} PRØVER RYK` : "\nalle GLB-prøver held")
process.exit(brot ? 1 : 0)
