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
const MAX_NETT = 48 * 1024 * 1024
/** og alle saman: seksten bitar à åtte og førti megabyte er ikkje ei økt */
const MAX_ALLE = 128 * 1024 * 1024
const BASE = "slicer"
const BUTIKK = "okt"
const NETT = "nett"
const NØKKEL = "siste"

export type Lagra = {
  params: Record<string, number | string>
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
      r.onsuccess = () => ok(r.result as T)
      r.onerror = () => ok(null)
      t.onabort = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

/** Skriv ned innstillingane. Dei er nokre hundre byte og vert skrivne ofte. */
export async function lagre(params: Record<string, number | string>): Promise<void> {
  const db = await opne()
  if (!db) return
  const gamal = (await køyr<Lagra>(db, BUTIKK, "readonly", (s) => s.get(NØKKEL))) ?? { params: {} }
  await køyr(db, BUTIKK, "readwrite", (s) => s.put({ ...gamal, params }, NØKKEL))
  db.close()
}

export async function hent(): Promise<Lagra | null> {
  const db = await opne()
  if (!db) return null
  const v = await køyr<Lagra>(db, BUTIKK, "readonly", (s) => s.get(NØKKEL))
  db.close()
  return v ?? null
}

/** det gamle eine nettet er teke inn att og treng ikkje liggje to stader */
export async function gløymGamaltNett(): Promise<void> {
  const db = await opne()
  if (!db) return
  const gamal = await køyr<Lagra>(db, BUTIKK, "readonly", (s) => s.get(NØKKEL))
  if (gamal?.nett) await køyr(db, BUTIKK, "readwrite", (s) => s.put({ params: gamal.params }, NØKKEL))
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
 * ALT SOM IKKJE STÅR PÅ SKJERMEN, GÅR.
 *
 * Ein brukar som har prøvd seks filer treng ikkje dei fem fyrste, og eit
 * skann er lett hundre megabyte. Same regelen som `forget` i `sources.ts`,
 * berre på disken i staden for i minnet: kroppen som står er lista, og
 * lista er sanninga. Går summen likevel over taket, ryk dei største fyrst
 * — dei er dei som gjer at ingenting kan skrivast.
 */
export async function ryddNett(hald: readonly string[]): Promise<void> {
  const db = await opne()
  if (!db) return
  const alle = (await køyr<LagraNett[]>(db, NETT, "readonly", (s) => s.getAll())) ?? []
  const halde = new Set(hald)
  const bort = alle.filter((v) => !halde.has(v.id)).map((v) => v.id)
  // og om det som STÅR er meir enn taket, må noko av det gå òg
  const att = alle.filter((v) => halde.has(v.id)).sort((a, b) => b.bytes.byteLength - a.bytes.byteLength)
  let sum = att.reduce((n, v) => n + v.bytes.byteLength, 0)
  for (const v of att) {
    if (sum <= MAX_ALLE) break
    bort.push(v.id)
    sum -= v.bytes.byteLength
  }
  for (const id of bort) await køyr(db, NETT, "readwrite", (s) => s.delete(id))
  db.close()
}

export async function gløym(): Promise<void> {
  const db = await opne()
  if (!db) return
  await køyr(db, BUTIKK, "readwrite", (s) => s.delete(NØKKEL))
  await køyr(db, NETT, "readwrite", (s) => s.clear())
  db.close()
}
