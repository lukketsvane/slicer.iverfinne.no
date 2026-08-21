/**
 * Ein liten GLB-skrivar, til prøvene.
 *
 * Å teste ein GLB-lesar utan å kunne SKRIVE ein GLB er å teste han mot seg
 * sjølv. Denne skriv filer med kjend geometri og kjend nodetre, so fasiten
 * er rekna for hand og ikkje henta frå lesaren.
 */
export type Node = {
  mesh?: number
  children?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
  matrix?: number[]
}

export function glb(
  pos: Float32Array,
  idx: Uint32Array | null,
  nodes: Node[],
  roots: number[],
  opts: { mode?: number; kravExt?: string } = {},
): ArrayBuffer {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k])
      max[k] = Math.max(max[k], pos[i + k])
    }
  }
  const posBytes = new Uint8Array(pos.buffer.slice(0))
  const idxBytes = idx ? new Uint8Array(idx.buffer.slice(0)) : new Uint8Array(0)
  const pad4 = (n: number) => (n + 3) & ~3
  const idxOff = pad4(posBytes.length)
  const binLen = pad4(idxOff + idxBytes.length)
  const bin = new Uint8Array(binLen)
  bin.set(posBytes, 0)
  if (idx) bin.set(idxBytes, idxOff)

  const doc: Record<string, unknown> = {
    asset: { version: "2.0", generator: "slicerman prøve" },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes,
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            ...(idx ? { indices: 1 } : {}),
            ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
          },
        ],
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max },
      ...(idx
        ? [{ bufferView: 1, componentType: 5125, count: idx.length, type: "SCALAR" }]
        : []),
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
      ...(idx ? [{ buffer: 0, byteOffset: idxOff, byteLength: idxBytes.length }] : []),
    ],
    buffers: [{ byteLength: binLen }],
    ...(opts.kravExt ? { extensionsRequired: [opts.kravExt] } : {}),
  }

  const jsonRaw = new TextEncoder().encode(JSON.stringify(doc))
  const jsonLen = pad4(jsonRaw.length)
  const json = new Uint8Array(jsonLen).fill(0x20)
  json.set(jsonRaw, 0)

  const total = 12 + 8 + jsonLen + 8 + binLen
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  u8.set(json, 20)
  dv.setUint32(20 + jsonLen, binLen, true)
  dv.setUint32(24 + jsonLen, 0x004e4942, true)
  u8.set(bin, 28 + jsonLen)
  return out
}

/** ein kasse, med kjende mål, indeksert */
export function kasse(w: number, h: number, d: number) {
  const x = w / 2
  const z = d / 2
  const v = [
    [-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z],
    [-x, h, -z], [x, h, -z], [x, h, z], [-x, h, z],
  ]
  const f = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
  ]
  const pos = new Float32Array(v.flat())
  const idx: number[] = []
  for (const [a, b, c, e] of f) idx.push(a, b, c, a, c, e)
  return { pos, idx: new Uint32Array(idx) }
}
