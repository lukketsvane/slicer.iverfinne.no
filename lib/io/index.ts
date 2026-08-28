/**
 * Fila inn.
 *
 * Fire format, og det er ikkje eit tilfeldig utval:
 *
 *   GLB   det Blender skriv når du trykkjer eksporter og ikkje tenkjer over
 *         det, og det telefonskannarar og Sketchfab leverer
 *   STL   det alle CAD-program skriv
 *   OBJ   det alle modelleringsprogram skriv
 *   PLY   det skannarane skriv
 *
 * Har du ei fil frå noko som helst, har du ei av dei fire.
 *
 * Etternamnet vert brukt der det finst, og innhaldet der det ikkje gjer: ei
 * fil drege ut av eit arkiv har ofte mist namnet sitt undervegs. GLB kjenner
 * seg sjølv att på dei fyrste fire bytane, so han vert prøvd fyrst uansett
 * kva fila heiter.
 */
import { makeSoup, type Soup } from "../soup"
import { isGlb, parseGlb, parseGltf } from "./glb"
import { parseObj } from "./obj"
import { parsePly } from "./ply"
import { parseStl } from "./stl"

/** Det som kan sleppast inn. `.zip` er ikkje eit nett — det er ei
 *  prosjektfil, og ho vert opna i arbeidaren og ikkje her. */
export const FORMAT = [".glb", ".gltf", ".stl", ".obj", ".ply", ".zip"] as const

export function parseMesh(name: string, buf: ArrayBuffer): Soup {
  // Magien fyrst. Ei GLB som heiter «scan.stl» er framleis ei GLB, og ho
  // ville kome ut av STL-lesaren som eit par tusen tilfeldige trekantar
  // i staden for som ein feil.
  if (isGlb(buf)) return parseGlb(buf)

  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase()
  const txt = () => new TextDecoder().decode(buf)
  if (ext === ".gltf") return parseGltf(txt())
  if (ext === ".obj") return parseObj(txt())
  if (ext === ".ply") return parsePly(buf)
  if (ext === ".stl") return parseStl(buf)

  // Ingen etternamn: les dei fyrste bytane og lat fila seie det sjølv.
  const head = new TextDecoder()
    .decode(new Uint8Array(buf, 0, Math.min(256, buf.byteLength)))
    .toLowerCase()
  if (head.startsWith("ply")) return parsePly(buf)
  if (/"asset"|"gltf"/.test(head)) return parseGltf(txt())
  if (/^\s*(v\s|#|mtllib|o\s|g\s)/.test(head)) return parseObj(txt())
  if (buf.byteLength > 84) return parseStl(buf)
  return makeSoup(new Float32Array(0))
}
