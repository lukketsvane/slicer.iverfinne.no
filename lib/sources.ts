import { erFilform } from "./scene"
import { makeSoup, type Soup } from "./soup"

export type SourceInfo = {
  id: string
  label: string
  tris: number
}

export function cubeSoup(side = 100): Soup {
  const h = side / 2
  const v: [number, number, number][] = [
    [-h, -h, 0],
    [h, -h, 0],
    [h, h, 0],
    [-h, h, 0],
    [-h, -h, side],
    [h, -h, side],
    [h, h, side],
    [-h, h, side],
  ]
  const faces: [number, number, number, number][] = [
    [0, 3, 2, 1], // botn
    [4, 5, 6, 7], // topp
    [0, 1, 5, 4], // -y
    [1, 2, 6, 5], // +x
    [2, 3, 7, 6], // +y
    [3, 0, 4, 7], // -x
  ]
  const pos = new Float32Array(faces.length * 2 * 9)
  let k = 0
  const put = (i: number) => {
    pos[k++] = v[i][0]
    pos[k++] = v[i][1]
    pos[k++] = v[i][2]
  }
  for (const [a, b, c, d] of faces) {
    put(a)
    put(b)
    put(c)
    put(a)
    put(c)
    put(d)
  }
  return makeSoup(pos)
}

const MAX_RAW = 96 * 1024 * 1024

const RAW = new Map<string, { soup: Soup; label: string; fil?: Uint8Array }>()

let gen = 0
export const generasjon = (): number => gen

export const KUBE = "kube"

const PRIMITIV: Record<string, () => Soup> = {
  kube: () => cubeSoup(),
}

export const erPrimitiv = (id: string) => id in PRIMITIV

export function source(id: string): Soup {
  const hit = RAW.get(id)
  if (hit) return hit.soup
  const lag = PRIMITIV[id]
  if (!lag) return source(KUBE)
  const s = lag()
  RAW.set(id, { soup: s, label: id })
  return s
}

export function put(id: string, label: string, soup: Soup, fil?: Uint8Array): SourceInfo {
  RAW.set(id, { soup, label, fil: fil && fil.byteLength <= MAX_RAW ? fil : undefined })
  gen++
  return { id, label, tris: soup.tris }
}

export function raw(id: string): Uint8Array | undefined {
  return RAW.get(id)?.fil
}

export function label(id: string): string {
  return RAW.get(id)?.label ?? (id === KUBE ? "kube" : id)
}

export function forget(keep: string | readonly string[]) {
  const hald = new Set(typeof keep === "string" ? [keep] : keep)
  for (const id of [...RAW.keys()]) {
    if (!hald.has(id) && !(id in PRIMITIV) && !erFilform(id)) RAW.delete(id)
  }
}
