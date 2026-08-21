/**
 * Nullstaden i eit skalarfelt, som lukka polygon.
 *
 * Ei ribbe er ikkje eit uttrykk ein kan skrive ned. Nettet kan vera delt i
 * to der ribba står; eit spor kan kappe henne; eit hòl i objektet kan
 * gjera eitt stykke til to. Kva form ho får er eit spørsmål om kva grense
 * som bit kvar, og det er nett det ei marsjerande rute svarar på utan å
 * bli spurd.
 *
 * Kantane vert nøkla på ruta og ikkje på koordinatet. To segment som deler
 * ein kant deler difor NØKKELEN, og kjeda let seg lenkje utan å samanlikne
 * flyttal — som er den eine staden ein slik algoritme plar rakne.
 *
 * Salryttarane (5 og 10) vert avgjorde på midtverdien. Det er ikkje eit
 * hjelpetriks: utan han er valet vilkårleg, og eit vilkårleg val her er
 * skilnaden mellom eitt hòl og to.
 */
export type Pt2 = [number, number]

export type Loop = {
  pts: Pt2[]
  /** signert areal: positivt er ytterkant, negativt er hòl */
  area: number
}

type Seg = [string, string]

export function contour(
  g: Float64Array,
  x0: number,
  dx: number,
  nx: number,
  y0: number,
  dy: number,
  ny: number,
): Loop[] {
  const X = (i: number) => x0 + i * dx
  const Y = (j: number) => y0 + j * dy
  const at = (i: number, j: number) => g[j * (nx + 1) + i]

  const pts = new Map<string, Pt2>()
  const next = new Map<string, string>()

  const hKey = (i: number, j: number) => `h${i},${j}`
  const vKey = (i: number, j: number) => `v${i},${j}`
  const hPt = (i: number, j: number) => {
    const k = hKey(i, j)
    if (!pts.has(k)) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const t = a / (a - b)
      pts.set(k, [X(i) + t * dx, Y(j)])
    }
    return k
  }
  const vPt = (i: number, j: number) => {
    const k = vKey(i, j)
    if (!pts.has(k)) {
      const a = at(i, j)
      const b = at(i, j + 1)
      const t = a / (a - b)
      pts.set(k, [X(i), Y(j) + t * dy])
    }
    return k
  }

  const segs: Seg[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c00 = at(i, j) > 0
      const c10 = at(i + 1, j) > 0
      const c11 = at(i + 1, j + 1) > 0
      const c01 = at(i, j + 1) > 0
      const m = (c00 ? 1 : 0) | (c10 ? 2 : 0) | (c11 ? 4 : 0) | (c01 ? 8 : 0)
      if (m === 0 || m === 15) continue
      const B = () => hPt(i, j)
      const T = () => hPt(i, j + 1)
      const L = () => vPt(i, j)
      const R = () => vPt(i + 1, j)
      switch (m) {
        case 1: segs.push([B(), L()]); break
        case 2: segs.push([R(), B()]); break
        case 4: segs.push([T(), R()]); break
        case 8: segs.push([L(), T()]); break
        case 14: segs.push([L(), B()]); break
        case 13: segs.push([B(), R()]); break
        case 11: segs.push([R(), T()]); break
        case 7: segs.push([T(), L()]); break
        case 3: segs.push([R(), L()]); break
        case 6: segs.push([T(), B()]); break
        case 12: segs.push([L(), R()]); break
        case 9: segs.push([B(), T()]); break
        case 5: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push([B(), R()]); segs.push([T(), L()]) }
          else { segs.push([B(), L()]); segs.push([T(), R()]) }
          break
        }
        case 10: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push([L(), B()]); segs.push([R(), T()]) }
          else { segs.push([R(), B()]); segs.push([L(), T()]) }
          break
        }
      }
    }
  }
  for (const [a, b] of segs) next.set(a, b)

  const seen = new Set<string>()
  const loops: Loop[] = []
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const poly: Pt2[] = []
    let k: string | undefined = start
    while (k !== undefined && !seen.has(k)) {
      seen.add(k)
      const p = pts.get(k)
      if (p) poly.push(p)
      k = next.get(k)
    }
    if (poly.length < 3) continue
    let a2 = 0
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      a2 += p[0] * q[1] - q[0] * p[1]
    }
    loops.push({ pts: poly, area: a2 / 2 })
  }
  return loops
}

/** Fjernar punkt som ikkje seier noko: tre punkt på ei line er to for
 *  mange, og ei ribbe med 900 hjørne er ei DXF-fil ingen fres vil lesa. */
export function simplify(poly: Pt2[], tol: number): Pt2[] {
  if (poly.length < 4) return poly
  const out: Pt2[] = [poly[0]]
  for (let i = 1; i < poly.length; i++) {
    const a = out[out.length - 1]
    const b = poly[i]
    const c = poly[(i + 1) % poly.length]
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const len = Math.hypot(c[0] - a[0], c[1] - a[1])
    if (len > 1e-9 && Math.abs(cross) / len < tol) continue
    out.push(b)
  }
  return out.length >= 3 ? out : poly
}
