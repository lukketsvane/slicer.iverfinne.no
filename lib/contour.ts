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

export function contour(
  g: Float64Array,
  x0: number,
  dx: number,
  nx: number,
  y0: number,
  dy: number,
  ny: number,
): Loop[] {
  const W = nx + 1
  const at = (i: number, j: number) => g[j * W + i]

  // Kvar kant i ruta har eit TAL og ikkje ein tekst: den vassrette kanten
  // ut frå hjørne (i, j) har 2·(j·W + i), den loddrette det talet pluss
  // éin. Nøklane var tekstar — «h12,7» — og å byggje og slå opp ein tekst
  // for kvar kant i kvar rute var dyrare enn sjølve marsjen.
  const N = 2 * W * (ny + 1)
  const px = new Float64Array(N)
  const py = new Float64Array(N)
  const har = new Uint8Array(N)
  const next = new Int32Array(N).fill(-1)

  const hPt = (i: number, j: number) => {
    const k = 2 * (j * W + i)
    if (!har[k]) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const t = a / (a - b)
      px[k] = x0 + i * dx + t * dx
      py[k] = y0 + j * dy
      har[k] = 1
    }
    return k
  }
  const vPt = (i: number, j: number) => {
    const k = 2 * (j * W + i) + 1
    if (!har[k]) {
      const a = at(i, j)
      const b = at(i, j + 1)
      const t = a / (a - b)
      px[k] = x0 + i * dx
      py[k] = y0 + j * dy + t * dy
      har[k] = 1
    }
    return k
  }

  /** par av kantar: frå, til */
  const segs: number[] = []
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
        case 1: segs.push(B(), L()); break
        case 2: segs.push(R(), B()); break
        case 4: segs.push(T(), R()); break
        case 8: segs.push(L(), T()); break
        case 14: segs.push(L(), B()); break
        case 13: segs.push(B(), R()); break
        case 11: segs.push(R(), T()); break
        case 7: segs.push(T(), L()); break
        case 3: segs.push(R(), L()); break
        case 6: segs.push(T(), B()); break
        case 12: segs.push(L(), R()); break
        case 9: segs.push(B(), T()); break
        case 5: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push(B(), R()); segs.push(T(), L()) }
          else { segs.push(B(), L()); segs.push(T(), R()) }
          break
        }
        case 10: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (mid > 0) { segs.push(L(), B()); segs.push(R(), T()) }
          else { segs.push(R(), B()); segs.push(L(), T()) }
          break
        }
      }
    }
  }
  for (let s = 0; s < segs.length; s += 2) next[segs[s]] = segs[s + 1]

  // Kjedene vert fylgde frå segmenta i den rekkjefylgja dei vart funne:
  // det er den rekkjefylgja sløyfene kjem ut i, og stykka i ei delt ribbe
  // får bokstavane sine etter henne.
  const seen = new Uint8Array(N)
  const loops: Loop[] = []
  for (let s = 0; s < segs.length; s += 2) {
    const start = segs[s]
    if (seen[start]) continue
    const poly: Pt2[] = []
    let k = start
    while (k >= 0 && !seen[k]) {
      seen[k] = 1
      poly.push([px[k], py[k]])
      k = next[k]
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

/** avstanden frå p til lina gjennom a og c */
function fråLina(p: Pt2, a: Pt2, c: Pt2): number {
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

/**
 * Fjernar punkt som ikkje seier noko: tre punkt på ei line er to for
 * mange, og ei ribbe med 900 hjørne er ei DXF-fil ingen fres vil lesa.
 *
 * TOLERANSEN MÅ VERA TOLERANSEN.
 *
 * Den fyrste utgåva prøvde kvart punkt mot lina frå det siste haldne
 * punktet til NABOEN sin — ei kort line som knapt bøyer seg. På ein boge
 * fall punkta då eitt for eitt, og feilen hopa seg opp langt forbi
 * toleransen utan at noko målte henne. Målt på ein sirkel med radius 75,
 * fire hundre punkt: med toleranse 0,125 mm vart det verste avviket 0,45
 * mm, og med 0,25 mm vart det 1,8. Det er ikkje avrunding — det er ein
 * tidels millimeter klaring gonger fire, på ein reiskap der ein
 * tjuedels millimeter avgjer om delane går i hop.
 *
 * No vert kvart punkt som er kasta prøvt mot den lina som FAKTISK vert
 * teikna, og lina får ikkje strekkje seg lenger enn til det fyrste
 * punktet ho ikkje lenger held. Då tyder toleransen det han seier.
 */
export function simplify(poly: Pt2[], tol: number): Pt2[] {
  const n = poly.length
  if (n < 4) return poly
  const out: Pt2[] = [poly[0]]
  let start = 0
  for (let i = 2; i < n; i++) {
    let held = true
    for (let j = start + 1; j < i; j++) {
      if (fråLina(poly[j], poly[start], poly[i]) >= tol) {
        held = false
        break
      }
    }
    if (!held) {
      out.push(poly[i - 1])
      start = i - 1
    }
  }
  // Det siste punktet står alltid: lina attende til fyrste punktet er ein
  // ekte kant i ringen, og ikkje ei line nokon har funne på.
  if (start !== n - 1) out.push(poly[n - 1])
  return out.length >= 3 ? out : poly
}
