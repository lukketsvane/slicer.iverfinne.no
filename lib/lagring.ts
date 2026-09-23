import type { View } from "./core"
import { erFilform, lesScene } from "./scene"
import { erPrimitiv } from "./sources"

const MAX_NETT = 48 * 1024 * 1024
const MAX_ALLE = 128 * 1024 * 1024
const BASE = "slicer"
const BUTIKK = "okt"
const NETT = "nett"
const PROSJEKT = "prosjekt"
const NØKKEL = "siste"
const GJELDANDE = "gjeldande"
const VAKT = "slicer-okt-vakt"
let skrivekø: Promise<void> = Promise.resolve()

export type Prosjekt = {
  id: string
  namn: string
  params: Record<string, number | string>
  view?: View
  skal?: boolean
  oppretta: number
  endra: number
}

type Lagra = {
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
      const req = indexedDB.open(BASE, 3)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BUTIKK)) db.createObjectStore(BUTIKK)
        if (!db.objectStoreNames.contains(NETT)) db.createObjectStore(NETT)
        if (!db.objectStoreNames.contains(PROSJEKT)) db.createObjectStore(PROSJEKT, { keyPath: "id" })
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

export function idarI(p: Record<string, unknown>): string[] {
  const kj = typeof p.kjelde === "string" ? p.kjelde : ""
  return [...new Set([kj, ...lesScene(p.scene).map((b) => b.id)])].filter((id) => id && !erPrimitiv(id) && !erFilform(id))
}

const nyId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

function nesteNamn(alle: readonly Prosjekt[]): string {
  let n = 0
  for (const p of alle) {
    const m = /^prosjekt (\d+)$/.exec(p.namn)
    if (m) n = Math.max(n, +m[1])
  }
  return `prosjekt ${n + 1}`
}

function lesVakt(): Record<string, unknown> | null {
  try {
    const v = JSON.parse(localStorage.getItem(VAKT) ?? "null")
    return v && typeof v === "object" && v.params && typeof v.params === "object" && !Array.isArray(v.params) ? v : null
  } catch {
    return null
  }
}
const erProsjekt = (v: Record<string, unknown> | null): v is Prosjekt => !!v && typeof v.id === "string" && typeof v.namn === "string"

export function lagreProsjekt(p: Prosjekt): Promise<void> {
  const tekst = JSON.stringify(p)
  try { localStorage.setItem(VAKT, tekst) } catch {
    try { localStorage.removeItem(VAKT) } catch {}
  }
  const skriv = async () => {
    const db = await opne()
    if (!db) return
    const ok = (await køyr(db, PROSJEKT, "readwrite", (s) => s.put(p))) !== null
    db.close()
    if (ok) {
      try {
        if (localStorage.getItem(VAKT) === tekst) localStorage.removeItem(VAKT)
      } catch {}
    }
  }
  skrivekø = skrivekø.then(skriv, skriv)
  return skrivekø
}

export function setGjeldande(id: string): Promise<void> {
  const skriv = async () => {
    const db = await opne()
    if (!db) return
    await køyr(db, BUTIKK, "readwrite", (s) => s.put(id, GJELDANDE))
    db.close()
  }
  skrivekø = skrivekø.then(skriv, skriv)
  return skrivekø
}

export async function hentProsjekt(id: string): Promise<Prosjekt | null> {
  await skrivekø
  const db = await opne()
  if (!db) return null
  const p = await køyr<Prosjekt>(db, PROSJEKT, "readonly", (s) => s.get(id))
  db.close()
  return p ?? null
}

export async function alleProsjekt(): Promise<Prosjekt[]> {
  await skrivekø
  const db = await opne()
  if (!db) return []
  const alle = (await køyr<Prosjekt[]>(db, PROSJEKT, "readonly", (s) => s.getAll())) ?? []
  db.close()
  return alle.sort((a, b) => b.endra - a.endra)
}

export async function nyttProsjekt(namn?: string, fraa: Partial<Prosjekt> = {}): Promise<Prosjekt> {
  const no = Date.now()
  const p: Prosjekt = { params: {}, ...fraa, id: nyId(), namn: namn?.trim() || nesteNamn(await alleProsjekt()), oppretta: no, endra: no }
  await lagreProsjekt(p)
  await setGjeldande(p.id)
  return p
}

export async function opneProsjekt(id: string): Promise<Prosjekt | null> {
  await setGjeldande(id)
  return hentProsjekt(id)
}

export async function dupliserProsjekt(id: string): Promise<Prosjekt | null> {
  const p = await hentProsjekt(id)
  return p ? nyttProsjekt(`${p.namn} kopi`, { params: p.params, view: p.view, skal: p.skal }) : null
}

export async function slettProsjekt(id: string): Promise<Prosjekt> {
  await skrivekø
  try { if (lesVakt()?.id === id) localStorage.removeItem(VAKT) } catch {}
  const db = await opne()
  let gid: string | null = null
  if (db) {
    await køyr(db, PROSJEKT, "readwrite", (s) => s.delete(id))
    gid = await køyr<string>(db, BUTIKK, "readonly", (s) => s.get(GJELDANDE))
    db.close()
  }
  const rest = await alleProsjekt()
  const same = rest.find((p) => p.id === gid)
  if (same) return same
  if (rest[0]) {
    await setGjeldande(rest[0].id)
    return rest[0]
  }
  return nyttProsjekt()
}

async function flyttOkta(db: IDBDatabase, vakt: Record<string, unknown> | null, gjeld: boolean): Promise<Prosjekt | null> {
  let g = await køyr<Lagra>(db, BUTIKK, "readonly", (s) => s.get(NØKKEL))
  const fraaVakt = !!vakt && !erProsjekt(vakt)
  if (fraaVakt) g = { ...g, ...(vakt as Lagra) }
  if (!g?.params) return null
  if (g.nett && g.nett.byteLength <= MAX_NETT) {
    const har = new Set((await køyr<IDBValidKey[]>(db, NETT, "readonly", (s) => s.getAllKeys())) ?? [])
    const sakna = idarI(g.params).find((id) => !har.has(id))
    const nett = g.nett
    if (sakna && (await køyr(db, NETT, "readwrite", (s) => s.put({ id: sakna, label: g.filnamn ?? "nett.stl", bytes: nett } satisfies LagraNett, sakna))) === null) return null
  }
  const no = Date.now()
  const p: Prosjekt = { id: nyId(), namn: nesteNamn((await køyr<Prosjekt[]>(db, PROSJEKT, "readonly", (s) => s.getAll())) ?? []), params: g.params, view: g.view, skal: g.skal, oppretta: no, endra: no }
  if ((await køyr(db, PROSJEKT, "readwrite", (s) => s.put(p))) === null) return null
  if ((await køyr(db, BUTIKK, "readwrite", (s) => { if (gjeld) s.put(p.id, GJELDANDE); return s.delete(NØKKEL) })) === null) return null
  if (fraaVakt) try { localStorage.removeItem(VAKT) } catch {}
  return p
}

let lesande: Promise<Prosjekt> | null = null
export function hentGjeldande(): Promise<Prosjekt> {
  return (lesande ??= lesGjeldande().finally(() => { lesande = null }))
}
async function lesGjeldande(): Promise<Prosjekt> {
  await skrivekø
  const vakt = lesVakt()
  const db = await opne()
  const gid = db ? await køyr<string>(db, BUTIKK, "readonly", (s) => s.get(GJELDANDE)) : null
  let p = db && gid ? await køyr<Prosjekt>(db, PROSJEKT, "readonly", (s) => s.get(gid)) : null
  if (erProsjekt(vakt)) {
    const lagra = db ? await køyr<Prosjekt>(db, PROSJEKT, "readonly", (s) => s.get(vakt.id)) : null
    if (!lagra || vakt.endra >= lagra.endra) {
      if (!p || vakt.id === p.id) p = vakt
      void lagreProsjekt(vakt)
    }
  }
  if (!db) {
    const no = Date.now()
    return p ?? { id: nyId(), namn: "prosjekt 1", params: vakt && !erProsjekt(vakt) ? (vakt as Lagra).params : {}, oppretta: no, endra: no }
  }
  const flytt = await flyttOkta(db, erProsjekt(vakt) ? null : vakt, !p)
  p ??= flytt
  db.close()
  if (!p) return nyttProsjekt()
  if (p.id !== gid) await setGjeldande(p.id)
  return p
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

export async function ryddNett(hald: readonly string[] = []): Promise<void> {
  const db = await opne()
  if (!db) return
  const alle = (await køyr<LagraNett[]>(db, NETT, "readonly", (s) => s.getAll())) ?? []
  const halde = new Set(hald)
  for (const p of (await køyr<Prosjekt[]>(db, PROSJEKT, "readonly", (s) => s.getAll())) ?? []) for (const id of idarI(p.params)) halde.add(id)
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
  try { localStorage.removeItem(VAKT) } catch {}
  const db = await opne()
  if (!db) return
  await køyr(db, BUTIKK, "readwrite", (s) => s.clear())
  await køyr(db, PROSJEKT, "readwrite", (s) => s.clear())
  await køyr(db, NETT, "readwrite", (s) => s.clear())
  db.close()
}
