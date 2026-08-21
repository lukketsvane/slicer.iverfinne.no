/**
 * Fila inn.
 *
 * Tre format, og det er ikkje eit tilfeldig utval: STL er det alle
 * CAD-program skriv, OBJ er det alle modelleringsprogram skriv, og PLY er
 * det skannarane skriv. Har du ei fil frå noko som helst, har du ei av dei
 * tre — og har du ikkje det, opnar Blender ho og skriv ei STL på tjue
 * sekund.
 *
 * Etternamnet vert brukt der det finst, og innhaldet der det ikkje gjer:
 * ei fil drege ut av eit arkiv har ofte mist namnet sitt undervegs.
 */
import { makeSoup, type Soup } from "../soup"
import { parseObj } from "./obj"
import { parsePly } from "./ply"
import { parseStl } from "./stl"

export const FORMAT = [".stl", ".obj", ".ply"] as const

export function parseMesh(name: string, buf: ArrayBuffer): Soup {
  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase()
  if (ext === ".obj") return parseObj(new TextDecoder().decode(buf))
  if (ext === ".ply") return parsePly(buf)
  if (ext === ".stl") return parseStl(buf)

  // Ingen etternamn: les dei fyrste bytane og lat fila seie det sjølv.
  const head = new TextDecoder()
    .decode(new Uint8Array(buf, 0, Math.min(256, buf.byteLength)))
    .toLowerCase()
  if (head.startsWith("ply")) return parsePly(buf)
  if (/^\s*(v\s|#|mtllib|o\s|g\s)/.test(head)) return parseObj(new TextDecoder().decode(buf))
  if (buf.byteLength > 84) return parseStl(buf)
  return makeSoup(new Float32Array(0))
}
