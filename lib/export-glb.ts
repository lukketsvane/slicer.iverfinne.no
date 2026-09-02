/**
 * SLICERMAN — GLB ut.
 *
 * Same objekt som STL-en, i det formatet resten av verda opnar utan å
 * spørje: nettlesaren, Blender, Sketchfab, meldingsappen. `lib/io/glb.ts`
 * les GLB inn; dette skriv han attende, og dei to skal vera kvarandre sitt
 * spegelbilete — vaktene snittar ein kropp, skriv han og les han inn att.
 *
 * To ting er ikkje smak. glTF er METER og Y OPP; verkstaden er millimeter
 * og Z opp. Vendinga (x, y, z) → (x, z, −y) er nett den inverse av den
 * lesinga gjer, og determinanten hennar er +1, so vindinga står og
 * innsida er innsida. Skalaen er tusendelen: eit hundre og femti
 * millimeters objekt skal vera 0,15 i ei verd som meiner meter.
 *
 * Ingen normalar. Ei kuttdel er flat, og glTF seier sjølv at ein lesar
 * SKAL rekne flatenormalar når dei manglar — då vert fila ein tredjedel
 * mindre og skyggjinga rettare enn med mjuke hjørnenormalar frå eit nett
 * som er skore i plater.
 */
const HEADER = 12
const CHUNK = 8

/** ein blokk lagd til fire, med det polstringsteiknet formatet krev */
function padd(b: Uint8Array, fyll: number): Uint8Array {
  const n = (4 - (b.length % 4)) % 4
  if (!n) return b
  const ut = new Uint8Array(b.length + n)
  ut.set(b)
  ut.fill(fyll, b.length)
  return ut
}

export function meshToGlb(
  mesh: { positions: Float32Array; tris: number },
  name = "slicerman",
  farge: readonly [number, number, number] = [0.72, 0.6, 0.42],
): Uint8Array {
  const n = mesh.tris * 3
  const P = mesh.positions
  const pos = new Float32Array(n * 3)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) {
    const v: [number, number, number] = [P[i * 3] / 1000, P[i * 3 + 2] / 1000, -P[i * 3 + 1] / 1000]
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] = v[a]
      if (v[a] < min[a]) min[a] = v[a]
      if (v[a] > max[a]) max[a] = v[a]
    }
  }
  const bin = new Uint8Array(pos.buffer, 0, pos.byteLength)
  const asset = { version: "2.0", generator: "slicerman" }
  // Eit nett utan trekantar er ikkje ein feil å kaste: det er ei scene utan
  // noko i. Ein accessor med null element er derimot ein ugyldig glTF.
  const json = n
    ? {
        asset,
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name }],
        meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        materials: [
          {
            name: "material",
            doubleSided: true,
            pbrMetallicRoughness: {
              baseColorFactor: [farge[0], farge[1], farge[2], 1],
              metallicFactor: 0,
              roughnessFactor: 0.85,
            },
          },
        ],
        accessors: [{ bufferView: 0, componentType: 5126, count: n, type: "VEC3", min, max }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, target: 34962 }],
        buffers: [{ byteLength: bin.length }],
      }
    : { asset, scene: 0, scenes: [{ nodes: [] }] }

  const jsonBytes = padd(new TextEncoder().encode(JSON.stringify(json)), 0x20)
  const binBytes = n ? padd(bin, 0) : new Uint8Array(0)
  const total = HEADER + CHUNK + jsonBytes.length + (n ? CHUNK + binBytes.length : 0)
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  dv.setUint32(0, 0x46546c67, true) // «glTF»
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length, true)
  dv.setUint32(16, 0x4e4f534a, true) // JSON
  u8.set(jsonBytes, HEADER + CHUNK)
  if (n) {
    const at = HEADER + CHUNK + jsonBytes.length
    dv.setUint32(at, binBytes.length, true)
    dv.setUint32(at + 4, 0x004e4942, true) // BIN
    u8.set(binBytes, at + CHUNK)
  }
  return u8
}
