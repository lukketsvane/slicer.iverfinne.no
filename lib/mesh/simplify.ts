import type { Indexed } from "../soup"
import { bounds } from "../soup"

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
  if (nx * ny * nz > 4 * nv + 4096) return m

  const inv = 1 / cell
  const cellOf = (i: number) => {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((V[i] - b.min[0]) * inv)))
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((V[i + 1] - b.min[1]) * inv)))
    const cz = Math.min(nz - 1, Math.max(0, Math.floor((V[i + 2] - b.min[2]) * inv)))
    return (cz * ny + cy) * nx + cx
  }

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
