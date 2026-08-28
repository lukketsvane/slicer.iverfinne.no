/**
 * DET DU HADDE, DER DU SLAPP.
 *
 * Lenkja ber kvar innstilling utan om nettet. Prosjektfila ber begge, men
 * ho er noko du må hugse å lage. Dette er det tredje: nettlesaren hugsar
 * det sjølv, so ei fane som vart lukka ved eit uhell — eller ein maskin
 * som starta på nytt — ikkje kostar deg arbeidet.
 *
 * IndexedDB og ikkje localStorage: eit nett er megabyte, og localStorage
 * er fem. Han er dessutan synkron, og eit skann skrive synkront er ei side
 * som står stille medan det skjer.
 *
 * Med eit tak. Over dette er skanet stort nok til at ein kopi i basen er
 * ein kopi som kostar meir enn han er verd, og då vert berre innstillingane
 * hugsa — prosjektfila er staden for eit slikt nett.
 */
const MAX_NETT = 48 * 1024 * 1024
const BASE = "slicer"
const BUTIKK = "okt"
const NØKKEL = "siste"

export type Lagra = {
  params: Record<string, number | string>
  /** namnet på fila nettet kom av, om det var ei */
  filnamn?: string
  nett?: ArrayBuffer
}

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
      const req = indexedDB.open(BASE, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BUTIKK)) db.createObjectStore(BUTIKK)
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
  modus: IDBTransactionMode,
  gjer: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return new Promise((ok) => {
    try {
      const t = db.transaction(BUTIKK, modus)
      const r = gjer(t.objectStore(BUTIKK))
      r.onsuccess = () => ok(r.result as T)
      r.onerror = () => ok(null)
      t.onabort = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

/**
 * Skriv ned det som står.
 *
 * Nettet vert berre skrive når det er NYTT — `nett` er undefined elles.
 * Ei skriving på hundre megabyte per skyvartrykk ville vore ei anna
 * reiskap enn denne.
 */
export async function lagre(v: Partial<Lagra>): Promise<void> {
  const db = await opne()
  if (!db) return
  const gamal = (await køyr<Lagra>(db, "readonly", (s) => s.get(NØKKEL))) ?? { params: {} }
  // Kvar skriving rører éin ting. Skyvarane skriv innstillingar og skal
  // ikkje kaste nettet; ein import skriv eit nett og skal ikkje kaste
  // innstillingane.
  const nytt: Lagra = {
    params: v.params && Object.keys(v.params).length ? v.params : gamal.params,
    filnamn: v.filnamn ?? gamal.filnamn,
    nett: v.nett ?? gamal.nett,
  }
  if (nytt.nett && nytt.nett.byteLength > MAX_NETT) {
    // For stort til å hugse. Innstillingane held, og det gamle nettet skal
    // ikkje stå att og hevde at det høyrer til dei.
    nytt.nett = undefined
    nytt.filnamn = undefined
  }
  await køyr(db, "readwrite", (s) => s.put(nytt, NØKKEL))
  db.close()
}

export async function hent(): Promise<Lagra | null> {
  const db = await opne()
  if (!db) return null
  const v = await køyr<Lagra>(db, "readonly", (s) => s.get(NØKKEL))
  db.close()
  return v ?? null
}

export async function gløym(): Promise<void> {
  const db = await opne()
  if (!db) return
  await køyr(db, "readwrite", (s) => s.delete(NØKKEL))
  db.close()
}
