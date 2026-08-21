/**
 * GLB og glTF inn.
 *
 * Det er dette Blender skriv når du trykkjer eksporter og ikkje tenkjer
 * over det, og det er det Sketchfab, Polycam og halve telefonverda leverer.
 * Ei STL må nokon velje; ei GLB får du.
 *
 * Formatet er ikkje eit nett — det er ei SCENE. Trekantane ligg i eit tre
 * av nodar med kvar si flytting, og eit typisk Blender-uttak har heile
 * Z-opp-til-Y-opp-vendinga liggjande i rotnoden. Les ein berre
 * hjørnelistene og hoppar over treet, kjem objektet ut på skakke, i feil
 * storleik, eller ti meter frå origo — og det er ikkje synleg i tala, berre
 * i biletet. Difor vert treet gått, og kvar node ber matrisa si vidare.
 *
 * Til slutt vert alt vendt frå glTF sitt Y-opp til verkstaden sitt Z-opp.
 * glTF-spesifikasjonen SEIER at Y er opp; STL og PLY seier ingenting, og
 * difor kjem dei inn som dei er. Her veit vi det, og då skal reiskapen
 * bruke det han veit.
 */
import { makeSoup, type Soup } from "../soup"

const MAGIC = 0x46546c67 // «glTF»
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** kolonnevis 4×4, som i glTF sjølv */
type Mat = number[]

const ID: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Y opp (glTF) til Z opp (verkstaden): (x, y, z) → (x, −z, y) */
const ZUP: Mat = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]

function mul(a: Mat, b: Mat): Mat {
  const o = new Array<number>(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3]
    }
  }
  return o
}

type Node = {
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}

/** Noden si eiga flytting: anten ei ferdig matrise, eller flytt–vend–skaler
 *  i den rekkjefylgja spesifikasjonen krev. */
function localMatrix(n: Node): Mat {
  if (n.matrix && n.matrix.length === 16) return n.matrix.slice()
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const s = n.scale ?? [1, 1, 1]
  const t = n.translation ?? [0, 0, 0]
  const m: Mat = [
    (1 - 2 * (y * y + z * z)) * s[0],
    2 * (x * y + z * w) * s[0],
    2 * (x * z - y * w) * s[0],
    0,
    2 * (x * y - z * w) * s[1],
    (1 - 2 * (x * x + z * z)) * s[1],
    2 * (y * z + x * w) * s[1],
    0,
    2 * (x * z + y * w) * s[2],
    2 * (y * z - x * w) * s[2],
    (1 - 2 * (x * x + y * y)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ]
  return m
}

type Doc = {
  scene?: number
  scenes?: { nodes?: number[] }[]
  nodes?: Node[]
  meshes?: {
    primitives: {
      attributes: Record<string, number>
      indices?: number
      mode?: number
      extensions?: Record<string, unknown>
    }[]
  }[]
  accessors?: {
    bufferView?: number
    byteOffset?: number
    componentType: number
    count: number
    type: string
    sparse?: unknown
  }[]
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  buffers?: { byteLength: number; uri?: string }[]
  extensionsRequired?: string[]
}

const KOMP: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TAL: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/**
 * Pakkar som komprimerer sjølve trekantane. Det er ikkje eit format vi kan
 * lese oss ut av: Draco er ein eigen dekodar på fleire hundre kilobyte,
 * meshopt likeins. Reiskapen seier heller frå kva som er gale og kva som
 * må gjerast, i staden for å levere eit tomt objekt.
 */
const UMOGLEG: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco",
  EXT_meshopt_compression: "meshopt",
}

export function parseGlb(buf: ArrayBuffer): Soup {
  const dv = new DataView(buf)
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) {
    throw new Error("ikkje ei GLB-fil")
  }
  const total = Math.min(dv.getUint32(8, true), buf.byteLength)
  let json: Doc | null = null
  let bin: Uint8Array | null = null
  let off = 12
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true)
    const kind = dv.getUint32(off + 4, true)
    const at = off + 8
    if (at + len > buf.byteLength) break
    if (kind === JSON_CHUNK) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, at, len))) as Doc
    } else if (kind === BIN_CHUNK && !bin) {
      bin = new Uint8Array(buf, at, len)
    }
    off = at + len
  }
  if (!json) throw new Error("GLB-fila manglar JSON-delen")
  return fromDoc(json, bin)
}

/** glTF som tekst. Berre med data-URI-ar: ei .gltf som peikar på ei .bin
 *  ved sida av seg har ikkje den fila med seg når ho vert dregen inn. */
export function parseGltf(txt: string): Soup {
  const doc = JSON.parse(txt) as Doc
  const uri = doc.buffers?.[0]?.uri
  let bin: Uint8Array | null = null
  if (uri) {
    if (!uri.startsWith("data:")) {
      throw new Error("gltf peikar på ei .bin ved sida av seg — bruk .glb i staden")
    }
    bin = b64(uri.slice(uri.indexOf(",") + 1))
  }
  return fromDoc(doc, bin)
}

function b64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function fromDoc(doc: Doc, bin: Uint8Array | null): Soup {
  for (const ext of doc.extensionsRequired ?? []) {
    if (UMOGLEG[ext]) {
      throw new Error(
        `nettet er komprimert med ${UMOGLEG[ext]} — eksporter på nytt utan komprimering`,
      )
    }
  }
  if (!bin) throw new Error("fann ingen bufferdata i fila")
  const views = doc.bufferViews ?? []
  const accs = doc.accessors ?? []

  /** eit accessor lese ut som flyttal, uansett kva han er lagra som */
  const read = (i: number): Float64Array => {
    const a = accs[i]
    if (!a) return new Float64Array(0)
    if (a.sparse) throw new Error("glisne accessorar er ikkje støtta")
    const n = TAL[a.type] ?? 1
    const size = KOMP[a.componentType] ?? 4
    const out = new Float64Array(a.count * n)
    if (a.bufferView === undefined) return out
    const v = views[a.bufferView]
    if (!v) return out
    const stride = v.byteStride || size * n
    const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
    for (let e = 0; e < a.count; e++) {
      const o = base + e * stride
      for (let k = 0; k < n; k++) {
        const p = o + k * size
        if (p + size > bin.byteLength) return out
        switch (a.componentType) {
          case 5120: out[e * n + k] = dv.getInt8(p); break
          case 5121: out[e * n + k] = dv.getUint8(p); break
          case 5122: out[e * n + k] = dv.getInt16(p, true); break
          case 5123: out[e * n + k] = dv.getUint16(p, true); break
          case 5125: out[e * n + k] = dv.getUint32(p, true); break
          default: out[e * n + k] = dv.getFloat32(p, true)
        }
      }
    }
    return out
  }

  const pos: number[] = []
  const meshes = doc.meshes ?? []
  const nodes = doc.nodes ?? []

  const emit = (mi: number, m: Mat) => {
    for (const prim of meshes[mi]?.primitives ?? []) {
      for (const ext of Object.keys(prim.extensions ?? {})) {
        if (UMOGLEG[ext]) {
          throw new Error(
            `nettet er komprimert med ${UMOGLEG[ext]} — eksporter på nytt utan komprimering`,
          )
        }
      }
      const mode = prim.mode ?? 4
      if (mode < 4) continue // punkt og liner er ikkje flater
      const pi = prim.attributes?.POSITION
      if (pi === undefined) continue
      const p = read(pi)
      const nv = Math.floor(p.length / 3)
      if (nv < 3) continue
      const idx =
        prim.indices !== undefined
          ? read(prim.indices)
          : Float64Array.from({ length: nv }, (_, k) => k)

      const put = (v: number) => {
        const o = v * 3
        const x = p[o]
        const y = p[o + 1]
        const z = p[o + 2]
        pos.push(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        )
      }

      if (mode === 4) {
        for (let t = 0; t + 2 < idx.length; t += 3) {
          put(idx[t])
          put(idx[t + 1])
          put(idx[t + 2])
        }
      } else if (mode === 5) {
        // stripe: annakvar trekant snur, elles vender halve nettet feil veg
        for (let t = 0; t + 2 < idx.length; t++) {
          if (t % 2 === 0) {
            put(idx[t])
            put(idx[t + 1])
            put(idx[t + 2])
          } else {
            put(idx[t + 1])
            put(idx[t])
            put(idx[t + 2])
          }
        }
      } else if (mode === 6) {
        for (let t = 1; t + 1 < idx.length; t++) {
          put(idx[0])
          put(idx[t])
          put(idx[t + 1])
        }
      }
    }
  }

  const seen = new Set<number>()
  const walk = (ni: number, parent: Mat) => {
    // Ein syklisk nodegraf er ulovleg, men ei fil er ei fil: utan vakta her
    // går gjennomgangen for alltid, og fana med henne.
    if (seen.has(ni)) return
    seen.add(ni)
    const n = nodes[ni]
    if (!n) return
    const m = mul(parent, localMatrix(n))
    if (n.mesh !== undefined) emit(n.mesh, m)
    for (const c of n.children ?? []) walk(c, m)
  }

  const roots =
    doc.scenes?.[doc.scene ?? 0]?.nodes ??
    (nodes.length ? nodes.map((_, i) => i) : [])
  if (roots.length) {
    for (const r of roots) walk(r, ZUP)
  } else {
    // ei fil utan scene og utan nodar: nettet ligg der åleine
    for (let i = 0; i < meshes.length; i++) emit(i, ZUP)
  }

  if (!pos.length) throw new Error("fann ingen trekantar i scena")
  return makeSoup(new Float32Array(pos))
}

/** ser dei fyrste bytane ut som ei GLB? */
export const isGlb = (buf: ArrayBuffer) =>
  buf.byteLength >= 12 && new DataView(buf).getUint32(0, true) === MAGIC
