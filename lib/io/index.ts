import { makeSoup, type Soup } from "../soup"
import { isGlb, parseGlb, parseGltf } from "./glb"
import { parseObj } from "./obj"
import { parsePly } from "./ply"
import { parseStl } from "./stl"

export const FORMAT = [".glb", ".gltf", ".stl", ".obj", ".ply", ".zip"] as const

export function parseMesh(name: string, buf: ArrayBuffer): Soup {
  if (isGlb(buf)) return parseGlb(buf)

  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase()
  const txt = () => new TextDecoder().decode(buf)
  if (ext === ".gltf") return parseGltf(txt())
  if (ext === ".obj") return parseObj(txt())
  if (ext === ".ply") return parsePly(buf)
  if (ext === ".stl") return parseStl(buf)

  const head = new TextDecoder()
    .decode(new Uint8Array(buf, 0, Math.min(256, buf.byteLength)))
    .toLowerCase()
  if (head.startsWith("ply")) return parsePly(buf)
  if (/"asset"|"gltf"/.test(head)) return parseGltf(txt())
  if (/^\s*(v\s|#|mtllib|o\s|g\s)/.test(head)) return parseObj(txt())
  if (buf.byteLength > 84) return parseStl(buf)
  return makeSoup(new Float32Array(0))
}
