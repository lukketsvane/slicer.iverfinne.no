/**
 * SLICERMAN — glattinga.
 *
 * Eit skann er ruglete, og ruglet er ikkje form: det er støy frå eit
 * kamera. Ruglet kostar på to måtar. Estetisk, av di kvar rugl vert til ei
 * bukt i ein kuttkontur som fresen så pliktskuldig køyrer. Og reknemessig,
 * av di ein kontur med tusen små buktingar er tusen linestykke i DXF-fila.
 *
 * Metoden er Taubin. Ein rein Laplace-glatting — flytt kvart hjørne mot
 * middelet av naboane — glattar fint, men han KRYMPER: ei kule vert mindre
 * for kvar runde, og etter tjue runder er elefanten ei ert. Taubin
 * annakvar gong dreg motsett veg med ein litt større faktor, og dei to
 * stega saman er eit lågpassfilter med om lag flat forsterking i det
 * bandet ein vil ha att. Volumet står; ruglet går.
 */
import type { Indexed } from "../soup"

/** naboane til kvart hjørne, som ei pakka liste (CSR) */
function adjacency(m: Indexed): { start: Uint32Array; nb: Uint32Array; rand: Uint8Array } {
  const nv = m.verts.length / 3
  const deg = new Uint32Array(nv + 1)
  // Kor mange trekantar kvar kant høyrer til. Ein kant med berre éin er
  // ein randkant, og eit hjørne på ein randkant står på randa.
  const bruk = new Map<number, number>()
  // Fyrst teljinga. Kvar kant vert talt éin gong per retning, og dublettar
  // frå to trekantar som deler kanten vert luka ut med det same: eit
  // hjørne som tel ein nabo to gonger, vektar han to gonger.
  const edges: number[] = []
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]
    const b = m.idx[t + 1]
    const c = m.idx[t + 2]
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (u === v) continue
      const k = u < v ? u * nv + v : v * nv + u
      const n = bruk.get(k) ?? 0
      bruk.set(k, n + 1)
      if (n) continue
      edges.push(u, v)
      deg[u + 1]++
      deg[v + 1]++
    }
  }
  for (let i = 0; i < nv; i++) deg[i + 1] += deg[i]
  const start = deg
  const fill = start.slice(0, nv)
  const nb = new Uint32Array(edges.length)
  for (let e = 0; e < edges.length; e += 2) {
    const u = edges[e]
    const v = edges[e + 1]
    nb[fill[u]++] = v
    nb[fill[v]++] = u
  }
  const rand = new Uint8Array(nv)
  for (let e = 0; e < edges.length; e += 2) {
    const u = edges[e]
    const v = edges[e + 1]
    const k = u < v ? u * nv + v : v * nv + u
    if (bruk.get(k) === 1) {
      rand[u] = 1
      rand[v] = 1
    }
  }

  return { start, nb, rand }
}

const LAMBDA = 0.55
/** mu må vera meir negativ enn lambda er positiv — det er han som gjer at
 *  volumet ikkje siv ut mellom fingrane */
const MU = -0.58

export function taubin(m: Indexed, passes: number): Indexed {
  if (passes <= 0) return m
  const nv = m.verts.length / 3
  if (nv < 4) return m
  const { start, nb, rand } = adjacency(m)
  let cur = Float32Array.from(m.verts)
  let next = new Float32Array(cur.length)

  const step = (w: number) => {
    for (let v = 0; v < nv; v++) {
      const s = start[v]
      const e = start[v + 1]
      const k = e - s
      const o = v * 3
      if (k < 2 || rand[v]) {
        // Eit hjørne på ein open kant har ikkje ein ring kring seg, og
        // middelet av ein halv ring dreg hòlet att. Randa står stille.
        //
        // Prøven var GRADEN, og grad er ikkje rand: eit hjørne på ein
        // open kant har tre eller fire naboar, ikkje under to, so ingen av
        // dei tok denne greina. Ei open plate på hundre millimeter kraup
        // til 98,97 etter éin runde, 96,82 etter fire og 93,34 etter fire
        // og tjue — tre millimeter av kvar kant, av ei utjamning
        // README-en seier tek støy «without shrinking». Og randa på ein
        // halvkuleskann letta frå planet sitt.
        //
        // Randa er ein KANT som berre høyrer til éin trekant, og det veit
        // `adjacency` medan ho byggjer: `rand`.
        next[o] = cur[o]
        next[o + 1] = cur[o + 1]
        next[o + 2] = cur[o + 2]
        continue
      }
      let ax = 0
      let ay = 0
      let az = 0
      for (let i = s; i < e; i++) {
        const q = nb[i] * 3
        ax += cur[q]
        ay += cur[q + 1]
        az += cur[q + 2]
      }
      ax = ax / k - cur[o]
      ay = ay / k - cur[o + 1]
      az = az / k - cur[o + 2]
      next[o] = cur[o] + w * ax
      next[o + 1] = cur[o + 1] + w * ay
      next[o + 2] = cur[o + 2] + w * az
    }
    const t = cur
    cur = next
    next = t
  }

  for (let i = 0; i < passes; i++) {
    step(LAMBDA)
    step(MU)
  }
  return { verts: cur, idx: m.idx }
}
