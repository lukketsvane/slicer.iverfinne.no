/**
 * SLICERMAN — forenklinga.
 *
 * Nokon dreg inn eit skann av ein elefant på to millionar trekantar. Det
 * er tre problem i eitt: det er tregt, det er ruglete, og det er meir
 * oppløysing enn ein sag med tre millimeter snittbreidd nokon gong kan
 * bruke. Forenklinga tek det fyrste og halvparten av det andre.
 *
 * Metoden er hjørneklynging. Boksen kring nettet vert delt i eit rutenett,
 * alle hjørne i same celle vert eitt hjørne, og trekantar som endar med to
 * like hjørne fell bort. Det er ikkje den finaste forenklinga som finst —
 * ein kvadrikkfeil-kollaps held silhuetten betre — men han er lineær i tal
 * hjørne, han rører aldri meir enn ei celle om gongen, og han kan ikkje
 * lage sjølvgjennomtrengingar. På eit skann er det tre eigenskapar som er
 * meir verdt enn ein litt betre silhuett.
 *
 * Representanten for cella er MIDDELET av hjørna i henne, ikkje det fyrste
 * eller det næraste hjørnet. Middelet ligg litt inne i flata der ho er
 * krum, og det er rett veg: ei celle som spenner over ein rugl skal svare
 * med rugelen sitt senter og ikkje med toppen hans.
 */
import type { Indexed } from "../soup"
import { bounds } from "../soup"

/**
 * `n` er kor mange celler den lengste sida vert delt i. Under fire er det
 * ikkje eit objekt lenger; over det nettet sjølv har oppløysing til, er
 * det inga forenkling og steget vert hoppa over.
 */
export function cluster(m: Indexed, n: number): Indexed {
  const V = m.verts
  const nv = V.length / 3
  if (n < 3 || nv < 8) return m
  const b = bounds(V)
  const dx = b.max[0] - b.min[0]
  const dy = b.max[1] - b.min[1]
  const dz = b.max[2] - b.min[2]
  const cell = Math.max(dx, dy, dz) / n
  if (!(cell > 0)) return m
  const nx = Math.max(1, Math.ceil(dx / cell))
  const ny = Math.max(1, Math.ceil(dy / cell))
  const nz = Math.max(1, Math.ceil(dz / cell))
  // Er rutenettet finare enn nettet sjølv, er det ingenting å hente — og
  // ei tabell på ein milliard celler er verre enn ingenting.
  if (nx * ny * nz > 4 * nv + 4096) return m

  const inv = 1 / cell
  const cellOf = (i: number) => {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((V[i] - b.min[0]) * inv)))
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((V[i + 1] - b.min[1]) * inv)))
    const cz = Math.min(nz - 1, Math.max(0, Math.floor((V[i + 2] - b.min[2]) * inv)))
    return (cz * ny + cy) * nx + cx
  }

  // Fyrste runde: kva celler er tekne, og kva er middelet i kvar av dei.
  const slot = new Map<number, number>()
  const sum: number[] = []
  const cnt: number[] = []
  const map = new Uint32Array(nv)
  for (let v = 0; v < nv; v++) {
    const c = cellOf(v * 3)
    let s = slot.get(c)
    if (s === undefined) {
      s = cnt.length
      slot.set(c, s)
      sum.push(0, 0, 0)
      cnt.push(0)
    }
    map[v] = s
    sum[s * 3] += V[v * 3]
    sum[s * 3 + 1] += V[v * 3 + 1]
    sum[s * 3 + 2] += V[v * 3 + 2]
    cnt[s]++
  }
  const verts = new Float32Array(cnt.length * 3)
  for (let s = 0; s < cnt.length; s++) {
    const k = cnt[s] || 1
    verts[s * 3] = sum[s * 3] / k
    verts[s * 3 + 1] = sum[s * 3 + 1] / k
    verts[s * 3 + 2] = sum[s * 3 + 2] / k
  }

  // Andre runde: trekantane. Ein trekant der to hjørne fall i same celle
  // har null areal og skal bort — han ville berre stå i vegen for
  // nabooppslaget seinare.
  const out: number[] = []
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = map[m.idx[t]]
    const c = map[m.idx[t + 1]]
    const d = map[m.idx[t + 2]]
    if (a === c || c === d || d === a) continue
    out.push(a, c, d)
  }
  if (!out.length) return m
  return { verts, idx: new Uint32Array(out) }
}

/**
 * Same forenkling, men styrt av eit TAK på tal trekantar i staden for av
 * ei celleoppløysing. Ein skyvar som seier «tjue tusen trekantar» er noko
 * ein kan svare på; ein som seier «celle 3,4 mm» er det ikkje.
 *
 * Talet trekantar fell om lag som kvadratet av celleoppløysinga — flata er
 * todimensjonal, same kva ho ligg i — so eit halveringssøk over ti runder
 * treffer nært nok, og kvar runde er lineær.
 */
export function decimate(m: Indexed, maxTris: number): Indexed {
  if (m.idx.length / 3 <= maxTris) return m
  let lo = 3
  let hi = 512
  let best = cluster(m, lo)
  for (let k = 0; k < 10 && hi - lo > 1; k++) {
    const mid = Math.round((lo + hi) / 2)
    const c = cluster(m, mid)
    if (c.idx.length / 3 <= maxTris) {
      best = c
      lo = mid
    } else {
      hi = mid
    }
  }
  return best
}
