import type { View } from "./core"

const MAX_NETT = 48 * 1024 * 1024
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
  filnamn?: string
  nett?: ArrayBuffer
}

export type LagraNett = { id: string; label: string; bytes: ArrayBuffer }

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
      t.oncomplete = () => ok(r.result as T)
      r.onerror = () => ok(null)
      t.onabort = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

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

export function lagre(params: Record<string, number | string>, syn: Pick<Lagra, "view" | "skal"> = {}): Promise<void> {
  const ny: Lagra = { params, ...syn }
  const tekst = JSON.stringify(ny)
  try { localStorage.setItem(VAKT, tekst) } catch {
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

export async function gløymGamaltNett(): Promise<void> {
  const db = await opne()
  if (!db) return
  await endreOkta(db, ({ params, view, skal }) => ({ params, view, skal }))
  db.close()
}

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
