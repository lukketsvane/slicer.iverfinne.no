/** Ei samanhengande utgåve: HTML, kode, geometrimotor, skrift og former.
 * Køyr etter next build. Ingen nettførespurnad trengst for å starte ho. */
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"

const side = await readFile(".next/server/app/index.html", "utf8")
const kode = (await readdir(".next/static", { recursive: true }))
  .filter((p) => /\.(js|css|woff2?|ttf|wasm)$/.test(p))
  .map((p) => ({ url: "/_next/static/" + p, fil: ".next/static/" + p }))
const former = (await readdir("public/form")).filter((p) => p.endsWith(".glb"))
  .map((p) => ({ url: "/form/" + p, fil: "public/form/" + p }))
const ikon = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]
  .map((p) => ({ url: "/" + p, fil: "public/" + p }))
const filer = [...kode, ...former, ...ikon].sort((a, b) => a.url.localeCompare(b.url))
if (!kode.length || !former.length) throw new Error("manglar kode eller former til nettlaus bruk")
const hash = createHash("sha256").update(side).update(await readFile(new URL(import.meta.url)))
let byte = Buffer.byteLength(side)
for (const f of filer) {
  const b = await readFile(f.fil)
  hash.update(f.url).update(b)
  byte += b.byteLength
}
const utgåve = hash.digest("hex").slice(0, 16)
const ressursar = [...filer.map((f) => f.url), "/manifest.webmanifest", "/apple-icon.png", "/icon.png", "/favicon.ico"]
const arbeidar = `// Laga av scripts/bygg-offline.mjs. Ikkje rediger byggjefila.
const NAMN = ${JSON.stringify("slicer-verkstad-" + utgåve)}
const FILER = ${JSON.stringify(ressursar)}
const SIDE = ${JSON.stringify(side)}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const lager = await caches.open(NAMN)
    await lager.addAll(FILER.map((p) => new Request(p, { cache: "reload" })))
    await lager.put("/", new Response(SIDE, { headers: { "Content-Type": "text/html; charset=utf-8" } }))
    // Ikkje skipWaiting: ein open verkstad held si utgåve til han vert lukka.
  })())
})

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const namn of await caches.keys()) {
      if (namn.startsWith("slicer-verkstad-") && namn !== NAMN) await caches.delete(namn)
    }
    await self.clients.claim()
  })())
})

self.addEventListener("fetch", (e) => {
  const r = e.request
  const url = new URL(r.url)
  if (r.method !== "GET" || url.origin !== self.location.origin) return
  const side = r.mode === "navigate" && url.pathname === "/"
  if (!side && !FILER.includes(url.pathname)) return
  e.respondWith((async () => {
    const lager = await caches.open(NAMN)
    const lagra = await lager.match(side ? "/" : url.pathname)
    return lagra || fetch(r)
  })())
})
`
await writeFile("public/verkstad-sw.js", arbeidar)
console.log(`nettlaus verkstad: ${utgåve}, ${ressursar.length} filer, ${(byte / 1048576).toFixed(1)} MB`)
