/**
 * DET DU HADDE, DER DU SLAPP.
 *
 * Lenkja ber kvar innstilling utan om nettet. Prosjektfila ber begge, men
 * ho er noko du må hugse å lage. Dette er det tredje: nettlesaren hugsar
 * det sjølv, so ei fane som vart lukka ved eit uhell — eller ein maskin
 * som starta på nytt — ikkje kostar deg arbeidet.
 *
 * HO SKAL BERE DET PROSJEKTFILA BER. Ho bar EITT nett, det sist importerte,
 * og det heldt so lenge ein kropp var éi fil. Ein kropp er ei liste no, og
 * ein kropp av tre importerte figurar kom attende som ein kube og to til:
 * du hadde ribbene dine i behald og ingenting å ha dei på. Difor eit nett
 * per KJELDE-ID, som i arkivet — `nett/<id>__<etikett>` der, `nett`-butikken
 * her — so scena finn kvar einaste ein att på namn.
 *
 * IndexedDB og ikkje localStorage: eit nett er megabyte, og localStorage
 * er fem. Han er dessutan synkron, og eit skann skrive synkront er ei side
 * som står stille medan det skjer.
 *
 * Med eit tak. Over dette er skanet stort nok til at ein kopi i basen er
 * ein kopi som kostar meir enn han er verd, og då vert berre innstillingane
 * hugsa — prosjektfila er staden for eit slikt nett, og lina seier frå.
 */
import type { View } from "./core"

const MAX_NETT = 48 * 1024 * 1024
/** og alle saman: seksten bitar à åtte og førti megabyte er ikkje ei økt */
const MAX_ALLE = 128 * 1024 * 1024
const BASE = "slicer"
const BUTIKK = "okt"
const NETT = "nett"
const NØKKEL = "siste"
const VAKT = "slicer-okt-vakt"
let skrivekø: Promise<void> = Promise.resolve()

export type Lagra = {
  params: Record<string, number | string>
  view?: View
  skal?: boolean
  /**
   * DET GAMLE EINE NETTET, frå den tida ein kropp var éi fil.
   *
   * Ei økt som alt ligg i ein nettlesar skal ikkje gå tapt av di lagringa
   * vart betre. Ho vert lesen, importert som ho alltid vart, og skriven ned
   * att under id-en sin — namnet på eit nett er bytane sine, so ho landar
   * nøyaktig der ho høyrer heime. Etter det er feltet tomt for alltid.
   */
  filnamn?: string
  nett?: ArrayBuffer
}

/** eitt nett i basen, under kjelde-id-en sin */
export type LagraNett = { id: string; label: string; bytes: ArrayBuffer }

/**
 * Basen, eller ingenting.
 *
 * Ein nettlesar i privat modus, ein brukar som har slege av lagring, ein
 * gamal nettlesar: alle tre er lovlege svar, og ingen av dei skal stogge
 * reiskapen. Difor `null` og ikkje eit kast — den som lagrar bryr seg
 * ikkje om kvifor det ikkje gjekk.
 */
function opne(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === "undefined") return ok(null)
      const req = indexedDB.open(BASE, 2)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BUTIKK)) db.createObjectStore(BUTIKK)
        if (!db.objectStoreNames.contains(NETT)) db.createObjectStore(NETT)
      }
      req.onsuccess = () => ok(req.result)
      req.onerror = () => ok(null)
      req.onblocked = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

function køyr<T>(
  db: IDBDatabase,
  butikk: string,
  modus: IDBTransactionMode,
  gjer: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return new Promise((ok) => {
    try {
      const t = db.transaction(butikk, modus)
      const r = gjer(t.objectStore(butikk))
      // Ei vellukka førespurnad er ikkje ei ferdig transaksjon.
      t.oncomplete = () => ok(r.result as T)
      r.onerror = () => ok(null)
      t.onabort = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

/** Les og skriv i SAME transaksjon: ei sein skriving tek ikkje attende ei ny. */
function endreOkta(db: IDBDatabase, endre: (v: Lagra) => Lagra): Promise<boolean> {
  return new Promise((ok) => {
    try {
      const t = db.transaction(BUTIKK, "readwrite")
      const s = t.objectStore(BUTIKK)
      const r = s.get(NØKKEL)
      r.onsuccess = () => s.put(endre(r.result ?? { params: {} }), NØKKEL)
      t.oncomplete = () => ok(true)
      t.onabort = () => ok(false)
      t.onerror = () => ok(false)
    } catch { ok(false) }
  })
}

/** Innstillingane er små. Ein synkron kvittering overlever at iOS stoggar
 * appen FØR IndexedDB er ferdig; netta går framleis berre til IndexedDB. */
export function lagre(params: Record<string, number | string>, syn: Pick<Lagra, "view" | "skal"> = {}): Promise<void> {
  const ny: Lagra = { params, ...syn }
  const tekst = JSON.stringify(ny)
  try { localStorage.setItem(VAKT, tekst) } catch {
    // Ei eldre kvittering må ikkje slå ei ny vellukka IndexedDB-skriving.
    try { localStorage.removeItem(VAKT) } catch { /* inga synkron lagring */ }
  }
  const skriv = async () => {
    const db = await opne()
    if (!db) return
    const ok = await endreOkta(db, (gamal) => ({ ...gamal, ...ny }))
    db.close()
    if (ok) {
      try {
        if (localStorage.getItem(VAKT) === tekst) localStorage.removeItem(VAKT)
      } catch { /* kvitteringa kan trygt stå att */ }
    }
  }
  skrivekø = skrivekø.then(skriv, skriv)
  return skrivekø
}

export async function hent(): Promise<Lagra | null> {
  let vakt: Lagra | null = null
  try {
    const v = JSON.parse(localStorage.getItem(VAKT) ?? "null")
    if (v?.params && typeof v.params === "object" && !Array.isArray(v.params)) vakt = v
  } catch { /* ei øydelagd kvittering skal ikkje gøyme økta */ }
  const db = await opne()
  if (!db) return vakt
  const v = await køyr<Lagra>(db, BUTIKK, "readonly", (s) => s.get(NØKKEL))
  db.close()
  return vakt ? { ...v, ...vakt } : v ?? null
}

/** det gamle eine nettet er teke inn att og treng ikkje liggje to stader */
export async function gløymGamaltNett(): Promise<void> {
  const db = await opne()
  if (!db) return
  await endreOkta(db, ({ params, view, skal }) => ({ params, view, skal }))
  db.close()
}

/**
 * EITT NETT NED, UNDER ID-EN SIN.
 *
 * Svaret seier om det vart hugsa. Eit nett som er for stort er ikkje ein
 * feil — det er ei opplysning den som står med fila treng, av di ei
 * omlasting då kostar henne arbeidet om ho ikkje har lagra prosjektfila.
 */
export async function lagreNett(id: string, label: string, bytes: ArrayBuffer): Promise<boolean> {
  if (bytes.byteLength > MAX_NETT) return false
  const db = await opne()
  if (!db) return false
  const ut = await køyr<IDBValidKey>(db, NETT, "readwrite", (s) => s.put({ id, label, bytes } satisfies LagraNett, id))
  db.close()
  return ut !== null
}

export async function hentNett(idar: readonly string[]): Promise<LagraNett[]> {
  const db = await opne()
  if (!db) return []
  const ut: LagraNett[] = []
  for (const id of idar) {
    const v = await køyr<LagraNett>(db, NETT, "readonly", (s) => s.get(id))
    if (v?.bytes) ut.push(v)
  }
  db.close()
  return ut
}

/**
 * DET DU HAR HENTA INN ÉIN GONG, STÅR I LISTA.
 *
 * Regelen var «alt som ikkje står på skjermen, går»: kroppen som står var
 * lista, og alt anna vart sletta. Det var rett då nettet berre var noko som
 * måtte finnast att ved neste opning. No er det òg eit BIBLIOTEK — du
 * hentar ei fil inn, og ho står i menyen etterpå — og eit bibliotek som
 * tømmer seg sjølv kvar gong du byter objekt er ikkje eit bibliotek.
 *
 * So det som går, går av PLASS og ikkje av bruk: er summen over taket, ryk
 * dei største fyrst, av di det er dei som gjer at ingenting kan skrivast.
 * Det som står på skjermen er verna — å slette det du ser på ville kosta
 * deg arbeid — og det er det `hald` er.
 */
export async function ryddNett(hald: readonly string[]): Promise<void> {
  const db = await opne()
  if (!db) return
  const alle = (await køyr<LagraNett[]>(db, NETT, "readonly", (s) => s.getAll())) ?? []
  const halde = new Set(hald)
  let sum = alle.reduce((n, v) => n + v.bytes.byteLength, 0)
  if (sum <= MAX_ALLE) {
    db.close()
    return
  }
  // dei største fyrst, og det som står på skjermen sist av alt
  const bort: string[] = []
  for (const v of [...alle].sort((a, b) => b.bytes.byteLength - a.bytes.byteLength)) {
    if (sum <= MAX_ALLE) break
    if (halde.has(v.id)) continue
    bort.push(v.id)
    sum -= v.bytes.byteLength
  }
  for (const id of bort) await køyr(db, NETT, "readwrite", (s) => s.delete(id))
  db.close()
}

/**
 * HEILE LISTA, UTAN BYTANE.
 *
 * Menyen treng namna og ikkje netta: eit skann er lett hundre megabyte, og
 * ei liste som dreg alle inn i minnet for å skrive fem ord er ei liste som
 * gjer opninga treg for ingenting. Bytane vert henta fyrst når nokon vel
 * ein av dei.
 */
export async function alleNett(): Promise<{ id: string; label: string; byte: number }[]> {
  const db = await opne()
  if (!db) return []
  const alle = (await køyr<LagraNett[]>(db, NETT, "readonly", (s) => s.getAll())) ?? []
  db.close()
  return alle.map((v) => ({ id: v.id, label: v.label, byte: v.bytes.byteLength })).sort((a, b) => a.label.localeCompare(b.label, "nn"))
}

export async function gløym(): Promise<void> {
  await skrivekø
  try { localStorage.removeItem(VAKT) } catch { /* inga synkron lagring */ }
  const db = await opne()
  if (!db) return
  await køyr(db, BUTIKK, "readwrite", (s) => s.delete(NØKKEL))
  await køyr(db, NETT, "readwrite", (s) => s.clear())
  db.close()
}
