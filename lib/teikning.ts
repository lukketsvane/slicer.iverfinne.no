import { shoelace, type Pt, type Vec3 } from "./core"
import { OMRISS_TAK } from "./plan"

/** Teikna inndata i planet si ramme, før motoren får ein ferdig profil. */
export const teiknaFirkant = (a: Pt, b: Pt): Pt[] => [a, [b[0], a[1]], b, [a[0], b[1]]]

/** Synskuben står nesten langs aksen av omsyn til kameraet. Plata er eksakt. */
export function teikneNormal(n: Vec3): Vec3 {
  const akse = n.findIndex((v) => Math.abs(v) > Math.cos(Math.PI / 60))
  return akse < 0 ? n : n.map((v, i) => i === akse ? Math.sign(v) : 0) as Vec3
}

const avstand = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const fraaKant = (p: Pt, a: Pt, b: Pt) => {
  const x = b[0] - a[0], y = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y || 1)))
  return avstand(p, [a[0] + t * x, a[1] + t * y])
}

/**
 * Hald dei punkta som seier mest om forma, òg i innsøkk. Tol er kring éin
 * skjermpiksel i planet sine einingar. Kvar forkasta prikk vert prøvd mot
 * kanten som faktisk kjem i staden; punkt-taket får aldri flattrykkje ein
 * detalj meir enn to toleransar eller 1,25 % av diagonalen.
 */
export function teiknaKontur(punkt: readonly Pt[], tol: number): Pt[] | null {
  if (!Number.isFinite(tol) || tol <= 0 || punkt.some((p) => !p.every(Number.isFinite))) return null
  const ring = punkt.filter((p, i) => !i || avstand(p, punkt[i - 1]) > 1e-7)
  if (ring.length > 1 && avstand(ring[0], ring[ring.length - 1]) <= tol * 2) ring.pop()
  if (ring.length < 3) return null
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  if (Math.min(w, h) < tol * 8 || Math.abs(shoelace(ring)) < tol * tol * 64) return null

  let fjern = 1
  for (let i = 2; i < ring.length; i++) if (avstand(ring[0], ring[i]) > avstand(ring[0], ring[fjern])) fjern = i
  const hald = [0, fjern]
  const grense = Math.max(tol * 2, Math.hypot(w, h) * 0.0125)
  for (;;) {
    let feil = -1, neste = -1
    for (let k = 0; k < hald.length; k++) {
      const a = hald[k], b = k + 1 < hald.length ? hald[k + 1] : ring.length
      for (let i = a + 1; i < b; i++) {
        const d = fraaKant(ring[i], ring[a], ring[b % ring.length])
        if (d > feil) { feil = d; neste = i }
      }
    }
    if (neste < 0 || (feil <= tol && hald.length >= 3)) break
    if (hald.length >= OMRISS_TAK) { if (feil > grense) return null; break }
    hald.push(neste)
    hald.sort((a, b) => a - b)
  }
  const omriss = hald.map((i) => ring[i])
  if (omriss.length < 3 || Math.abs(shoelace(omriss)) < tol * tol * 64) return null
  // Ei kryssande handrørsle er ikkje éi lukka plate. Lat reiskapen stå klar.
  const side = (a: Pt, b: Pt, p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  for (let i = 0; i < omriss.length; i++) for (let j = i + 2; j < omriss.length; j++) {
    if (i === 0 && j === omriss.length - 1) continue
    const a = omriss[i], b = omriss[(i + 1) % omriss.length], c = omriss[j], d = omriss[(j + 1) % omriss.length]
    const overlappar = [0, 1].every((k) => Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) <= Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])))
    if (overlappar && side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return null
  }
  return omriss
}
