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

export function source(id: string): Soup {
  const hit = RAW.get(id)
  if (hit) return hit.soup
  if (id !== KUBE) return source(KUBE)
  const s = cubeSoup()
  RAW.set(KUBE, { soup: s, label: "kube" })
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
export function forget(keep: string) {
  for (const id of [...RAW.keys()]) {
    if (id !== keep && id !== KUBE) RAW.delete(id)
  }
}
