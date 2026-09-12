/**
 * NUMMERET I DELEN.
 *
 * Kuttfila graverer adressa med `strokesAt`: eit einstrøks alfabet, polyliner
 * utan breidd, av di stråla køyrer LANGS streken og fyller ingenting. Det
 * held på ei plate. Det held ikkje i eit nett: ein tredimensjonal del er
 * gods, og ein strek utan breidd er ingen ting å skjere bort.
 *
 * Så streken må verte ei FLATE fyrst, og det er den eine reelle vanskelege
 * biten: to strekar i ein bokstav møtest i eit punkt, og legg du eit
 * rektangel kring kvar av dei, OVERLAPPAR rektangla i møtet. To overlappande
 * ringar er ikkje eit polygon øyreklippet kan lese — med partal/oddetal
 * slettar dei kvarandre i skjeringa, og «4» får eit hòl der streken er
 * tjukkast.
 *
 * Difor same vegen profilane sjølve går: legg streken ut i eit felt, og les
 * konturen av feltet. Eit felt har ingen skjeringar — det har ein verdi per
 * punkt — so eit møte mellom to strekar er berre ein stad der to avstandar
 * er små, og konturen går utanom heile klumpen på ein gong. Same svaret som
 * ein union, utan å skrive ein union.
 *
 * Rutesteget er ein tredel av strekbreidda. Det er ikkje eit val for
 * kvalitet: under det byrjar ringen å klatre i trappa si eiga rute, og over
 * det kan ei rute misse heile streken mellom to prøvepunkt.
 */
import { simplify } from "./contour"
import { strokesAt } from "./stroke"
import { inRing, type Pt } from "./core"

/**
 * EI FLATE TEKSTEN DEKKJER: ytterkanten, og dei lukka romma inni han —
 * augo i «0», «4», «6», «8» og «A». Begge mot uret.
 */
export type Flate = { ytre: Pt[]; indre: Pt[][] }

/** avstand frå eit punkt til eit linestykke */
function tilStrek(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const L = vx * vx + vy * vy
  let t = L > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / L : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t))
}

/**
 * KONTURANE KRING TEKSTEN, i det same rommet `strokesAt` teiknar i.
 *
 * `brei` er kor brei streken vert. Svaret er ringar som ikkje skjer
 * kvarandre: ytterkantane fyrst, og hòla inni «0», «8» og «A» med motsett
 * omløp — det øyreklippet og `bridge` treng for å lese dei som hòl.
 *
 * Tom liste tyder at det ikkje vart noko å skjere: tom tekst, eller ein
 * storleik som er null.
 */
export function merkeRingar(tekst: string, cx: number, cy: number, size: number, brei: number): Pt[][] {
  if (!tekst || size <= 0 || brei <= 0) return []
  const strek: [Pt, Pt][] = []
  for (const line of strokesAt(tekst, cx, cy, size)) {
    for (let i = 1; i < line.length; i++) strek.push([line[i - 1], line[i]])
    // eit punkt for seg sjølv er ein prikk, og han skal ha flate òg
    if (line.length === 1) strek.push([line[0], line[0]])
  }
  if (!strek.length) return []

  const r = brei / 2
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [a, b] of strek) {
    x0 = Math.min(x0, a[0], b[0])
    y0 = Math.min(y0, a[1], b[1])
    x1 = Math.max(x1, a[0], b[0])
    y1 = Math.max(y1, a[1], b[1])
  }
  const steg = Math.max(brei / 3, 0.02)
  // to ruter luft kring, so konturen aldri vert klipt av kanten på feltet:
  // ei open kjede er ikkje ein ring
  const pad = r + 2 * steg
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const nx = Math.max(2, Math.ceil((x1 - x0) / steg))
  const ny = Math.max(2, Math.ceil((y1 - y0) / steg))
  if (nx * ny > 4e6) return []
  const hx = (x1 - x0) / nx
  const hy = (y1 - y0) / ny

  const F = new Float32Array((nx + 1) * (ny + 1))
  const at = (i: number, j: number) => F[j * (nx + 1) + i]
  for (let j = 0; j <= ny; j++) {
    const py = y0 + j * hy
    for (let i = 0; i <= nx; i++) {
      const px = x0 + i * hx
      let d = Infinity
      for (const [a, b] of strek) {
        const q = tilStrek(px, py, a, b)
        if (q < d) d = q
      }
      F[j * (nx + 1) + i] = d - r
    }
  }

  /** punktet på ei kant mellom to naboar, der feltet skiftar teikn */
  const paa = (i: number, j: number, vassrett: boolean): Pt => {
    const fa = at(i, j)
    const fb = vassrett ? at(i + 1, j) : at(i, j + 1)
    const t = fa === fb ? 0.5 : fa / (fa - fb)
    return vassrett ? [x0 + (i + t) * hx, y0 + j * hy] : [x0 + i * hx, y0 + (j + t) * hy]
  }
  const idH = (i: number, j: number) => `h${i},${j}`
  const idV = (i: number, j: number) => `v${i},${j}`

  /**
   * KVAR RUTE GJEV NULL, EITT ELLER TO STYKKE, og stykka peikar so godset
   * ligg på same sida heile vegen. Dei to tvitydige rutene (berre dei to
   * motståande hjørna inne) vert løyste med midtverdien, som er den einaste
   * opplysninga ruta har om kva som heng i hop.
   */
  const fraa = new Map<string, { til: string; p: Pt; q: Pt }>()
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c0 = at(i, j) < 0
      const c1 = at(i + 1, j) < 0
      const c2 = at(i + 1, j + 1) < 0
      const c3 = at(i, j + 1) < 0
      const b = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0)
      if (b === 0 || b === 15) continue
      const B = { id: idH(i, j), p: () => paa(i, j, true) }
      const R = { id: idV(i + 1, j), p: () => paa(i + 1, j, false) }
      const T = { id: idH(i, j + 1), p: () => paa(i, j + 1, true) }
      const L = { id: idV(i, j), p: () => paa(i, j, false) }
      const legg = (a: typeof B, c: typeof B) => fraa.set(a.id, { til: c.id, p: a.p(), q: c.p() })
      const midt = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < 0
      switch (b) {
        case 1: legg(L, B); break
        case 2: legg(B, R); break
        case 3: legg(L, R); break
        case 4: legg(R, T); break
        case 5: if (midt) { legg(L, T); legg(R, B) } else { legg(L, B); legg(R, T) } break
        case 6: legg(B, T); break
        case 7: legg(L, T); break
        case 8: legg(T, L); break
        case 9: legg(T, B); break
        case 10: if (midt) { legg(B, R); legg(T, L) } else { legg(B, L); legg(T, R) } break
        case 11: legg(T, R); break
        case 12: legg(R, L); break
        case 13: legg(R, B); break
        case 14: legg(B, L); break
      }
    }
  }

  const ringar: Pt[][] = []
  const brukt = new Set<string>()
  for (const start of fraa.keys()) {
    if (brukt.has(start)) continue
    const ring: Pt[] = []
    let k: string | undefined = start
    while (k && !brukt.has(k)) {
      const e = fraa.get(k)
      if (!e) break
      brukt.add(k)
      ring.push(e.p)
      k = e.til
    }
    if (ring.length >= 3) {
      const enkel = simplify(ring, steg / 4)
      if (enkel.length >= 3) ringar.push(enkel)
    }
  }
  return ringar
}

/** signert areal — positivt mot klokka */
export function areal(ring: readonly Pt[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return a / 2
}

/**
 * FLATENE TEKSTEN DEKKJER, kvar som EITT enkelt polygon.
 *
 * Ein ring for seg sjølv er ikkje nok: «0» er ein ring med to hòl i, og
 * «4» og «A» har kvart sitt. Skal flata brukast som ei lomme, må hòlet
 * vera med — elles vert nullen ein fylt klump.
 *
 * `bridge` er den same funksjonen ribba sjølv vert lagd ut med: han syr
 * hòla inn i ytterkanten gjennom ein kanal utan breidd, og resultatet er
 * eitt polygon øyreklippet kan lese. So ei lomme her er nøyaktig det same
 * slaget form som eit stykke av ein profil, og ikkje eit nytt slag.
 */
export function merkeFlater(tekst: string, cx: number, cy: number, size: number, brei: number): Flate[] {
  const raa = merkeRingar(tekst, cx, cy, size, brei)
  if (!raa.length) return []
  /**
   * KVA SOM ER YTTERKANT OG KVA SOM ER HÒL, lese av NESTINGA og ikkje av
   * omløpet. Marsjen gjev eit omløp som heng saman — hòl går motsett veg av
   * ytterkanten sin — men kva veg det heile går er ein konvensjon i tabellen
   * og ikkje ei opplysning om forma. Ligg ein ring inni eit ULIKT tal andre
   * ringar, er han eit hòl. Det er den same partal/oddetal-regelen resten av
   * fila les gods med.
   *
   * OG DEI VERT IKKJE SYDDE I HOP HER. Ein «4» er ein ytterkant med ein
   * trekant inni, og syr du trekanten inn i kanten får du eit polygon med
   * ein kanal utan breidd i seg. Det polygonet er greitt for seg sjølv —
   * men brukt som HÒL i endå ei syning finn næraste-punkt-regelen punkt på
   * kvar si side av kanalen, og sauma kryssar seg sjølv. Målt: «4» og «6»
   * gav åtte og fire kantar som ikkje var delte av to flater, medan «1»,
   * «2», «3» og «5» stod lukka. Difor ligg dei kvar for seg her, og den
   * som legg dei ut avgjer kva han treng.
   */
  const djup = raa.map((r) => raa.filter((q) => q !== r && inRing(q, r[0])).length)
  const motUret = (r: Pt[]) => (areal(r) < 0 ? r.slice().reverse() : r.slice())
  const ut: Flate[] = []
  for (let i = 0; i < raa.length; i++) {
    if (djup[i] % 2 !== 0) continue
    const indre: Pt[][] = []
    for (let j = 0; j < raa.length; j++) {
      if (j === i || djup[j] !== djup[i] + 1 || !inRing(raa[i], raa[j][0])) continue
      indre.push(motUret(raa[j]))
    }
    ut.push({ ytre: motUret(raa[i]), indre })
  }
  return ut
}
