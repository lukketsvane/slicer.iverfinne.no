/**
 * OBJ inn.
 *
 * Berre `v` og `f`. Normalar, teksturkoordinat, materialbibliotek, grupper
 * og glattekantar vert hoppa over — reiskapen skal snitte forma, og ingen
 * av dei fortel noko om henne.
 *
 * Tre ting som pleier å velte ein OBJ-lesar er handterte: indeksane er
 * einbaserte, dei kan vera NEGATIVE (rekna bakover frå slutten), og ei
 * flate kan ha fleire enn tre hjørne. Ein vifte frå fyrste hjørnet
 * triangulerer alle konvekse flater rett, og OBJ-flater er i praksis alltid
 * konvekse.
 */
import { makeSoup, type Soup } from "../soup"

export function parseObj(txt: string): Soup {
  const vx: number[] = []
  const tri: number[] = []
  const idx = (tok: string, n: number) => {
    const i = parseInt(tok, 10)
    if (!Number.isFinite(i) || i === 0) return -1
    return i > 0 ? i - 1 : n + i
  }

  for (const raw of txt.split("\n")) {
    const line = raw.trim()
    if (line.length < 2) continue
    if (line[0] === "v" && (line[1] === " " || line[1] === "\t")) {
      const p = line.slice(2).trim().split(/\s+/)
      vx.push(+p[0], +p[1], +p[2])
    } else if (line[0] === "f" && (line[1] === " " || line[1] === "\t")) {
      const p = line.slice(2).trim().split(/\s+/)
      const n = vx.length / 3
      const ring: number[] = []
      for (const tok of p) {
        const v = idx(tok.split("/")[0], n)
        if (v >= 0 && v < n) ring.push(v)
      }
      for (let i = 1; i + 1 < ring.length; i++) {
        tri.push(ring[0], ring[i], ring[i + 1])
      }
    }
  }

  const pos = new Float32Array(tri.length * 3)
  for (let t = 0; t < tri.length; t++) {
    const v = tri[t] * 3
    pos[t * 3] = vx[v]
    pos[t * 3 + 1] = vx[v + 1]
    pos[t * 3 + 2] = vx[v + 2]
  }
  return makeSoup(pos)
}
