/**
 * SLICERMAN — kjeldene.
 *
 * Eit nett er for stort til å liggje i ein URL og for stort til å sendast
 * fram og attende for kvart skyvartrykk. Difor bur nettet i arbeidaren, og
 * parameterlista ber berre NAMNET på det. Hovudtråden les fila, sender
 * bytane éin gong, og etter det er ein import berre eit ord.
 *
 * Kuben er alltid der. Han er ikkje ei prøvefil — han er standardobjektet,
 * og han vert laga i koden i staden for lasta ned, so fyrste biletet står
 * på skjermen før noko nett har vore i nærleiken av eit nettverk.
 */
import { makeSoup, type Soup } from "./soup"

export type SourceInfo = {
  id: string
  /** namnet slik brukaren kjenner det */
  label: string
  tris: number
}

/**
 * Ein kube som lause trekantar, sentrert i planet og med botnen i z = 0.
 *
 * Storleiken er likegyldig: alt vert skalert til `storleik` før det vert
 * snitta. Han er skriven som seks sider og ikkje som tolv lause trekantar
 * av di vindinga då er ei line kode i staden for tolv sjansar til å snu ein
 * normal feil veg — og ein normal feil veg er eit hòl i kroppen.
 */
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
  // kvar side mot klokka sedd UTANFRÅ
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

/**
 * Fila slik ho kom inn, ved sida av nettet ho vart til.
 *
 * Ein URL kan ikkje bera eit nett, so ei lenkje tek deg attende til
 * innstillingane og ikkje til arbeidet. Ei prosjektfil kan — men berre om
 * nokon har teke vare på bytane. Difor ligg dei her, hjå kjelda dei høyrer
 * til, og `forget` ryddar dei bort saman med henne.
 *
 * Med eit tak: over dette er nettet alt so stort at ein kopi til er ein
 * kopi for mykje, og prosjektfila seier frå i staden for å ta maskina.
 */
const MAX_RAW = 96 * 1024 * 1024

const RAW = new Map<string, { soup: Soup; label: string; fil?: Uint8Array }>()

export const KUBE = "kube"

/**
 * DEI FEM PRIMITIVA, laga i koden og ikkje lasta: kube, kule, sylinder,
 * kjegle, torus. Alle hundre millimeter på det lengste, sentrerte i planet
 * og med botnen på z = 0, vindinga mot klokka sedd utanfrå. Ein kropp du
 * byggjer av dei treng ikkje ei fil i det heile.
 */
function rotasjonsSoup(
  profil: (v: number) => [number, number],
  n: number,
  m: number,
  lukka = false,
): Soup {
  // profil(v) gjev (radius, z) for v i [0, 1]; lukka tyder at profilen er
  // ein ring (torus) og ikkje ein boge frå topp til botn
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / n) * Math.PI * 2
    const [r, z] = profil(lukka ? (j / m) % 1 : Math.min(1, j / m))
    return [r * Math.cos(th), r * Math.sin(th), z]
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  return makeSoup(new Float32Array(pos))
}

const PRIMITIV: Record<string, () => Soup> = {
  kube: () => cubeSoup(),
  // v går frå toppen (0) til botnen (1) med polane som nullradius, so
  // skalet lukkar seg der og trekantane i polen fell saman utan hòl
  kule: () => rotasjonsSoup((v) => [50 * Math.sin(v * Math.PI), 50 + 50 * Math.cos(v * Math.PI)], 48, 24),
  sylinder: () =>
    rotasjonsSoup((v) => (v < 0.05 ? [(v / 0.05) * 40, 100] : v > 0.95 ? [((1 - v) / 0.05) * 40, 0] : [40, 100 - ((v - 0.05) / 0.9) * 100]), 48, 40),
  kjegle: () =>
    rotasjonsSoup((v) => (v > 0.95 ? [((1 - v) / 0.05) * 50, 0] : [(v / 0.95) * 50, 100 - (v / 0.95) * 100]), 48, 40),
  torus: () => rotasjonsSoup((v) => [35 + 15 * Math.cos(v * Math.PI * 2), 15 + 15 * Math.sin(v * Math.PI * 2)], 48, 24, true),
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
  return { id, label, tris: soup.tris }
}

/** fila kjelda kom av, om ho er teken vare på */
export function raw(id: string): Uint8Array | undefined {
  return RAW.get(id)?.fil
}

export function label(id: string): string {
  return RAW.get(id)?.label ?? (id === KUBE ? "kube" : id)
}

/** Importar hopar seg opp i minnet. Ein brukar som har prøvd seks filer
 *  treng ikkje dei fem fyrste, og eit skann er lett hundre megabyte. */
export function forget(keep: string | readonly string[]) {
  const hald = new Set(typeof keep === "string" ? [keep] : keep)
  for (const id of [...RAW.keys()]) {
    if (!hald.has(id) && !(id in PRIMITIV)) RAW.delete(id)
  }
}
