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
 *
 * OG EIN MONTASJE ER IKKJE EITT NETT. glTF er ei scene, ikkje ein haug
 * trekantar: kvar del får sin eigen node med adressa si som namn, og
 * nodane heng under ei gruppe — montasjen, eller plata dei ligg på. Då
 * kan den som opnar fila ta stabelen frå kvarandre med eit klikk, og
 * namnet på det han held i er det same som står gravert på plata.
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

/** ein del i fila: namnet noden får — adressa — og trekantane hans */
export type GlbDel = { namn: string; positions: Float32Array; tris: number }
/** delane samla under éin node: heile montasjen, eller éi plate */
export type GlbGruppe = { namn: string; delar: readonly GlbDel[] }

export function meshToGlb(
  grupper: readonly GlbGruppe[],
  name = "slicerman",
  farge: readonly [number, number, number] = [0.72, 0.6, 0.42],
): Uint8Array {
  // Ein del utan trekantar er ikkje ein feil å kaste — men ein accessor med
  // null element er ein ugyldig glTF, so han får ingen node. Ei gruppe som
  // står att tom får det heller ikkje.
  const grp = grupper
    .map((g) => ({ namn: g.namn, delar: g.delar.filter((d) => d.tris > 0) }))
    .filter((g) => g.delar.length > 0)
  const n = grp.reduce((s, g) => s + g.delar.reduce((t, d) => t + d.tris * 3, 0), 0)
  const pos = new Float32Array(n * 3)
  /** kvar del si eiga blokk i den eine bufferen: hjørne frå, hjørne til, og boksen */
  const blokk: { namn: string; frå: number; tal: number; min: number[]; max: number[] }[] = []
  let skrive = 0
  for (const g of grp) {
    for (const d of g.delar) {
      const tal = d.tris * 3
      const P = d.positions
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < tal; i++) {
        const v: [number, number, number] = [P[i * 3] / 1000, P[i * 3 + 2] / 1000, -P[i * 3 + 1] / 1000]
        for (let a = 0; a < 3; a++) {
          pos[(skrive + i) * 3 + a] = v[a]
          if (v[a] < min[a]) min[a] = v[a]
          if (v[a] > max[a]) max[a] = v[a]
        }
      }
      blokk.push({ namn: d.namn, frå: skrive, tal, min, max })
      skrive += tal
    }
  }
  const bin = new Uint8Array(pos.buffer, 0, pos.byteLength)
  const asset = { version: "2.0", generator: "slicerman" }
  /**
   * Nodane: fyrst delane, so gruppene. `blokk` ligg i den same
   * rekkjefylgja gruppene vart gått i, so borna til gruppe nummer g er
   * dei `blokk`-numra som kjem etter dei føregåande gruppene sine.
   * Rekkjefylgja er fri i glTF; dette er berre lettare å lesa i fila enn
   * to lister som flettar seg.
   */
  const delNodar = blokk.map((b, i) => ({ mesh: i, name: b.namn }))
  let barn = 0
  const gruppeNodar = grp.map((g) => ({ name: g.namn, children: g.delar.map(() => barn++) }))
  const json = n
    ? {
        asset,
        scene: 0,
        scenes: [{ name, nodes: gruppeNodar.map((_, i) => delNodar.length + i) }],
        nodes: [...delNodar, ...gruppeNodar],
        meshes: blokk.map((b, i) => ({ name: b.namn, primitives: [{ attributes: { POSITION: i }, material: 0 }] })),
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
        // Ei blokk per del: hjørna hennar ligg samla, so `byteOffset` er
        // hjørnet ho byrjar på gonga tolv. Det går alltid opp i fire, som
        // formatet krev av ein flyttal-accessor.
        accessors: blokk.map((b, i) => ({ bufferView: i, componentType: 5126, count: b.tal, type: "VEC3", min: b.min, max: b.max })),
        bufferViews: blokk.map((b) => ({ buffer: 0, byteOffset: b.frå * 12, byteLength: b.tal * 12, target: 34962 })),
        buffers: [{ byteLength: bin.length }],
      }
    : { asset, scene: 0, scenes: [{ name, nodes: [] }] }

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
