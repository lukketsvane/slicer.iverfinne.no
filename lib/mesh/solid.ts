/**
 * SLICERMAN — nettet som ein kropp.
 *
 * Ei ribbe er eit snitt gjennom eit legeme, og eit snitt treng eit svar på
 * eitt einaste spørsmål: er dette punktet inne i objektet eller ute? Eit
 * trekantnett svarar ikkje på det av seg sjølv. Det er ei skalvegg, ikkje
 * ein kropp.
 *
 * Svaret vert henta med ein stråle. Skyt ein stråle langs ein akse gjennom
 * punktet, og tel kva veg kvar trekant han råkar vender: ein trekant som
 * vender MOT strålen er ein veg inn, ein som vender med han er ein veg ut.
 * Summen undervegs er kor mange skal du står inne i, og alt over null er
 * material. Difor kjem svaret ikkje som ein bit, men som LISTA over dei
 * stykka strålen ligg inne i objektet — og det er nett den lista både
 * ledda, profilane og målinga vil ha.
 *
 * Summen og ikkje paritet: eit skann har ofte to skal oppå kvarandre, eller
 * ein hatt som stikk inn i eit hovud. Paritet ville lese overlappet som
 * LUFT — eit hòl midt i objektet der to skal krysser. Summen les det som
 * det er.
 *
 * Kostnaden er ei rutetabell per akse: trekantane sortert etter kvar dei
 * ligg i det planet strålen står vinkelrett på. Utan henne kostar kvar
 * stråle heile nettet, og eit bygg er nokre tusen strålar.
 */
import type { Vec3 } from "../core"
import type { Soup } from "../soup"

export type Span = [number, number]

/** aksane, sykliske og høgrehendte: (u, v, w) er (y,z,x), (z,x,y), (x,y,z) */
const AX = [
  { u: 1, v: 2, w: 0 },
  { u: 2, v: 0, w: 1 },
  { u: 0, v: 1, w: 2 },
] as const

type Bucket = {
  nu: number
  nv: number
  u0: number
  v0: number
  inv: number
  start: Uint32Array
  items: Uint32Array
}

function bucketFor(s: Soup, axis: 0 | 1 | 2): Bucket {
  const { u, v } = AX[axis]
  const P = s.pos
  const n = s.tris
  const u0 = s.min[u]
  const v0 = s.min[v]
  const du = Math.max(1e-6, s.max[u] - u0)
  const dv = Math.max(1e-6, s.max[v] - v0)
  // Sikt på nokre få trekantar per celle. Fleire celler enn trekantar er
  // berre minne; færre er berre arbeid.
  const g = Math.min(192, Math.max(6, Math.round(Math.sqrt(n))))
  const cell = Math.max(du, dv) / g
  const inv = 1 / cell
  const nu = Math.max(1, Math.min(256, Math.ceil(du * inv)))
  const nv = Math.max(1, Math.min(256, Math.ceil(dv * inv)))

  const cnt = new Uint32Array(nu * nv + 1)
  const lo = new Int32Array(n * 4)
  for (let t = 0; t < n; t++) {
    const o = t * 9
    let au = Infinity
    let bu = -Infinity
    let av = Infinity
    let bv = -Infinity
    for (let k = 0; k < 3; k++) {
      const q = o + k * 3
      const x = P[q + u]
      const y = P[q + v]
      if (x < au) au = x
      if (x > bu) bu = x
      if (y < av) av = y
      if (y > bv) bv = y
    }
    const i0 = Math.max(0, Math.min(nu - 1, Math.floor((au - u0) * inv)))
    const i1 = Math.max(0, Math.min(nu - 1, Math.floor((bu - u0) * inv)))
    const j0 = Math.max(0, Math.min(nv - 1, Math.floor((av - v0) * inv)))
    const j1 = Math.max(0, Math.min(nv - 1, Math.floor((bv - v0) * inv)))
    lo[t * 4] = i0
    lo[t * 4 + 1] = i1
    lo[t * 4 + 2] = j0
    lo[t * 4 + 3] = j1
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) cnt[j * nu + i + 1]++
    }
  }
  for (let i = 0; i < nu * nv; i++) cnt[i + 1] += cnt[i]
  const items = new Uint32Array(cnt[nu * nv])
  const fill = cnt.slice(0, nu * nv)
  for (let t = 0; t < n; t++) {
    const i0 = lo[t * 4]
    const i1 = lo[t * 4 + 1]
    const j0 = lo[t * 4 + 2]
    const j1 = lo[t * 4 + 3]
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) items[fill[j * nu + i]++] = t
    }
  }
  return { nu, nv, u0, v0, inv, start: cnt, items }
}

export type Solid = {
  soup: Soup
  min: Vec3
  max: Vec3
  /** stykka strålen ligg inne i objektet, langs aksen, sortert */
  runs(axis: 0 | 1 | 2, u: number, v: number): Span[]
  /** loddrette stykke med material i søyla (x, y) — den vanlegaste */
  runsZ(x: number, y: number): Span[]
  inside(x: number, y: number, z: number): boolean
  /** samla volum av nettet, mm³ — divergenssetninga */
  volume(): number
}

/**
 * Strålen vert flytta eit hårstrå til sides før han vert skoten.
 *
 * Grunnen er kuben. Ein kube har hjørne og kantar som ligg NØYAKTIG på
 * heiltalskoordinat, og eit rutenett med runde tal legg strålar rett
 * gjennom dei. Ein stråle gjennom ein kant høyrer til to trekantar eller
 * til ingen, og eit slikt svar er ikkje eit svar. To ulike, irrasjonalt
 * valde forskyvingar tek både aksane og diagonalane — og eit tidels
 * mikrometer flyttar ingen kutt.
 */
const E1 = 1.7e-4
const E2 = 1.0513e-4

export function makeSolid(soup: Soup): Solid {
  const buckets: (Bucket | null)[] = [null, null, null]
  const P = soup.pos

  const runs = (axis: 0 | 1 | 2, uq: number, vq: number): Span[] => {
    let bk = buckets[axis]
    if (!bk) {
      bk = bucketFor(soup, axis)
      buckets[axis] = bk
    }
    const { u, v, w } = AX[axis]
    const uu = uq + E1
    const vv = vq + E2
    const i = Math.floor((uu - bk.u0) * bk.inv)
    const j = Math.floor((vv - bk.v0) * bk.inv)
    if (i < 0 || j < 0 || i >= bk.nu || j >= bk.nv) return []
    const s0 = bk.start[j * bk.nu + i]
    const s1 = bk.start[j * bk.nu + i + 1]
    if (s1 <= s0) return []

    const hit: number[] = []
    const dir: number[] = []
    for (let s = s0; s < s1; s++) {
      const o = bk.items[s] * 9
      const au = P[o + u]
      const av = P[o + v]
      const aw = P[o + w]
      const bu = P[o + 3 + u]
      const bv = P[o + 3 + v]
      const bw = P[o + 3 + w]
      const cu = P[o + 6 + u]
      const cv = P[o + 6 + v]
      const cw = P[o + 6 + w]
      // Dobbelt det signerte arealet av trekanten sedd langs aksen. Ligg
      // trekanten i strålen sitt eige plan er han null, og då kryssar
      // strålen han ikkje — han glir langs han.
      const d = (bu - au) * (cv - av) - (bv - av) * (cu - au)
      if (d > -1e-12 && d < 1e-12) continue
      const w0 = (bu - uu) * (cv - vv) - (bv - vv) * (cu - uu)
      const w1 = (cu - uu) * (av - vv) - (cv - vv) * (au - uu)
      const w2 = (au - uu) * (bv - vv) - (av - vv) * (bu - uu)
      if (d > 0) {
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
      } else if (w0 > 0 || w1 > 0 || w2 > 0) continue
      // Ligg alle tre hjørna i same plan vinkelrett på strålen — ei
      // loddrett vegg, ei vassrett plate, kvar einaste flate på ein kube —
      // er svaret det planet, og ingenting anna. Utrekninga gjev det same
      // talet matematisk, men ikkje bitvis: w0+w1+w2 er d berre om ein
      // reknar eksakt. Skilnaden er ein tiandels mikrometer, og han er
      // nok til at to ribber som skal vera identiske får kvar sin profil i
      // fjerde desimal — og då står det to delar i kuttlista der det er
      // éin. Difor denne lina.
      hit.push(aw === bw && bw === cw ? aw : (w0 * aw + w1 * bw + w2 * cw) / d)
      // vender trekanten MOT strålen, er han ein veg INN
      dir.push(d < 0 ? 1 : -1)
    }
    if (!hit.length) return []

    const ord = hit.map((_, k) => k).sort((a, b) => hit[a] - hit[b])
    const out: Span[] = []
    let depth = 0
    let open = 0
    for (const k of ord) {
      const was = depth
      depth += dir[k]
      if (was <= 0 && depth > 0) open = hit[k]
      else if (was > 0 && depth <= 0 && hit[k] - open > 1e-6) out.push([open, hit[k]])
    }
    return out
  }

  const runsZ = (x: number, y: number) => runs(2, x, y)

  return {
    soup,
    min: soup.min,
    max: soup.max,
    runs,
    runsZ,
    inside(x, y, z) {
      for (const [lo, hi] of runsZ(x, y)) if (z >= lo && z <= hi) return true
      return false
    },
    volume() {
      let v = 0
      for (let t = 0; t < soup.tris; t++) {
        const i = t * 9
        v +=
          (P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) -
            P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) +
            P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6])) /
          6
      }
      return Math.abs(v)
    },
  }
}
