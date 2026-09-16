/**
 * SLICERMAN — rekkjefylgja delane kjem i.
 *
 * Kvart ledd seier kva veg ein del MÅ gå for å kome inn på ein annan som
 * alt ligg: eit spor langs lina si, med munnen der han kjem frå; ein tapp
 * langs tappen, og ei slisse ned på han. Ein del som møter fleire som alt
 * ligg, må ha éin veg for alle — ei plate kan berre gå éin veg.
 *
 * REKKJEFYLGJA ER EI LESING, IKKJE EIT VAL. Lista er det du teikna, i den
 * rekkjefylgja du teikna det: to sider, so setet, so staga. Det er ikkje
 * rekkjefylgja nokon set ein krakk saman i — staget må inn mellom sidene
 * før den andre sida kjem på. Går lista opp, er ho svaret. Går ho ikkje
 * opp, vert ei anna leita fram av dei same vegane, og ho er svaret om ho
 * står fast på færre. Geometrien er den same same kva: spora er skorne
 * med munnen der lista sa, og vegane over er lesne av dei.
 *
 * Ein bøygd del vert rulla på plass og ikkje skuva, og står ikkje i strid
 * med nokon — sjå `Montering.boygde`.
 */
import type { Vec3 } from "./core"

/** for kvar del: kva veg han går inn mot kvar partnar, om han kjem etter han */
export type Vegar = Map<number, Map<number, Vec3>>

const PAR = Math.cos((3 * Math.PI) / 180)
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function veg(v: Vegar, del: number, mot: number, d: Vec3) {
  let m = v.get(del)
  if (!m) v.set(del, (m = new Map()))
  if (!m.has(mot)) m.set(mot, d)
}

/** lista lesen i ei rekkjefylgje: kva veg kvar kjem, og kven som står fast */
function les(orden: readonly number[], vegar: Vegar, boygde: ReadonlySet<number>) {
  const lagt = new Set<number>()
  const retning: Record<number, Vec3 | null> = {}
  const brot: number[] = []
  for (const id of orden) {
    let fyrst: Vec3 | null = null
    for (const [mot, d] of vegar.get(id) ?? []) {
      if (!lagt.has(mot)) continue
      if (!fyrst) fyrst = d
      else if (dot(fyrst, d) < PAR && !boygde.has(id) && !brot.includes(id)) brot.push(id)
    }
    retning[id] = fyrst
    lagt.add(id)
  }
  return { orden: [...orden], retning, brot }
}

/**
 * GRÅDIG, MED EITT STEG FRAM. Av dei som kan inn no: den som stengjer færrast
 * av dei attverande, so den med flest vegar, so den som står fyrst i lista.
 * To sider og eit stag kan alle leggjast fyrst — men legg du båe sidene
 * før staget, har staget tappar mot to flater som ser kvarandre.
 */
function leit(liste: readonly number[], vegar: Vegar, boygde: ReadonlySet<number>): number[] {
  const lagt = new Set<number>()
  const att = [...liste]
  const strid = (id: number) => {
    if (boygde.has(id)) return 0
    const ds: Vec3[] = []
    for (const [mot, d] of vegar.get(id) ?? []) if (lagt.has(mot)) ds.push(d)
    let n = 0
    for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) if (dot(ds[a], ds[b]) < PAR) n++
    return n
  }
  const klassar = (id: number) => {
    const ds: Vec3[] = []
    for (const d of (vegar.get(id) ?? new Map<number, Vec3>()).values()) if (!ds.some((e) => dot(e, d) >= PAR)) ds.push(d)
    return ds.length
  }
  const stengjer = (id: number) => {
    lagt.add(id)
    let n = 0
    for (const x of att) if (x !== id && strid(x) > 0) n++
    lagt.delete(id)
    return n
  }
  const ut: number[] = []
  while (att.length) {
    let best = -1
    let bs = Infinity
    let bk = -1
    for (let i = 0; i < att.length; i++) {
      if (strid(att[i]) > 0) continue
      const s = stengjer(att[i])
      const k = klassar(att[i])
      if (s < bs || (s === bs && k > bk)) {
        best = i
        bs = s
        bk = k
      }
    }
    if (best < 0) {
      for (let i = 0; i < att.length; i++) if (best < 0 || strid(att[i]) < strid(att[best])) best = i
    }
    const id = att.splice(best, 1)[0]
    lagt.add(id)
    ut.push(id)
  }
  return ut
}

export function monteringsorden(liste: readonly number[], vegar: Vegar, boygde: ReadonlySet<number>) {
  const som = les(liste, vegar, boygde)
  if (!som.brot.length) return som
  const anna = les(leit(liste, vegar, boygde), vegar, boygde)
  return anna.brot.length < som.brot.length ? anna : som
}
