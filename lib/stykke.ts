/**
 * SLICERMAN — liner gjennom profilar.
 *
 * Kvar ei line — rett eller boge — går gjennom gods, og kvar eit punkt
 * ligg langs henne. Snittinga, tappane, vaktene og teikninga spør om det
 * same, og svaret skal vera det same same kven som spør. Difor éin stad.
 */
import { inRing, type Pt } from "./core"
import type { Span } from "./mesh/solid"
import { bogPar } from "./plan"

/**
 * PUNKTET `t` MILLIMETER LANGS SPORLINA, `s` MILLIMETER TIL SIDES.
 *
 * Éin stad, av di sju stader spurde om det same: feltet som skjer sporet,
 * stykket ein ende høyrer til, handtaka på plata, handtaka i rommet,
 * skissa og leddvakta. Ei rett line og ein boge er det same uttrykket her —
 * `bogPar` går mot `[t, 0]` når krumminga går mot null — men greina står
 * likevel, av di eit flatt spor er det vanlege og ein `sin` og ein `cos`
 * per celle i ei rute på 220 × 220 er ikkje gratis.
 *
 * Sida er mot VENSTRE for `d`, som overalt elles i huset: `n̂⊥ = (−d_y, d_x)`.
 */
export function sporPunkt(q: { p: Pt; d: Pt; k: number }, t: number, s = 0): Pt {
  const nx = -q.d[1]
  const ny = q.d[0]
  if (!q.k) return [q.p[0] + q.d[0] * t + nx * s, q.p[1] + q.d[1] * t + ny * s]
  const a = q.k * t
  const [su, sn] = bogPar(q.k, t)
  // `s` fylgjer flata og ikkje der bogen byrja — same rekninga som tjukna
  // på ei bøygd ribbe i `ut`, so sporet er like breitt heile vegen
  const du = su - s * Math.sin(a)
  const dn = sn + s * Math.cos(a)
  return [q.p[0] + q.d[0] * du + nx * dn, q.p[1] + q.d[1] * du + ny * dn]
}

/** ei sporline for seg: det dei to rekningane over treng, og ikkje eit heilt ledd */
export type Line = { p: Pt; d: Pt; k: number }

/**
 * OG ATTENDE: buelengda langs lina, og kor langt frå henne punktet ligg.
 *
 * Tal og ikkje eit punkt inn, av di den eine staden dette vert spurt tett
 * er feltet, og der ligg tala alt i kvar sin variabel. Rekninga er
 * `inn`/`avFlata` i `plan.ts`, med ei dimensjon mindre.
 */
export function sporInn(px: number, py: number, dx: number, dy: number, k: number, x: number, y: number): [number, number] {
  const rx = x - px
  const ry = y - py
  const a = rx * dx + ry * dy
  const b = -rx * dy + ry * dx
  if (!k) return [a, b]
  const R = 1 / k
  const sg = Math.sign(R)
  return [Math.atan2(sg * a, sg * (R - b)) * R, R - Math.hypot(a, R - b) * sg]
}

// =============================================================================
// LINER GJENNOM RINGAR
// =============================================================================
/**
 * Kvar ei line går gjennom gods: stykka [t0, t1] langs `d` frå `p`, lesne
 * av alle ringane med partal/oddetal. Eit hòl er ein ring, og ei line som
 * går inn i eit hòl går ut av godset — det er det same talet. Halvopen
 * regel på hjørna, so ei line gjennom eit hjørne tel éin gong.
 */
export function stykkeLangs(ringar: readonly Pt[][], p: Pt, d: Pt, k = 0): Span[] {
  if (k) return stykkeBoge(ringar, p, d, k)
  const nx = -d[1]
  const ny = d[0]
  const ts: number[] = []
  for (const ring of ringar) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]
      const b = ring[i]
      const sa = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny
      const sb = (b[0] - p[0]) * nx + (b[1] - p[1]) * ny
      if (sa > 0 === sb > 0) continue
      const ta = (a[0] - p[0]) * d[0] + (a[1] - p[1]) * d[1]
      const tb = (b[0] - p[0]) * d[0] + (b[1] - p[1]) * d[1]
      ts.push(ta + ((tb - ta) * sa) / (sa - sb))
    }
  }
  ts.sort((u, v) => u - v)
  const ut: Span[] = []
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-6) ut.push([ts[i], ts[i + 1]])
  return ut
}

/**
 * DET SAME, MEN LANGS EIN BOGE.
 *
 * Ei rett line er open i båe endar, so ho byrjar i lufta og pari kan
 * lesast av rekkjefylgja åleine: fyrste kryssinga går INN i gods. Ein
 * sirkel er LUKKA — han har ingen ende å byrje utanfor — so pariteten må
 * lesast éin stad og gjelde derifrå.
 *
 * Skøyta ligg på ±πR, og `kryssRing` legg nullpunktet midt i delen nett
 * for at ho skal liggje langt frå godset. Går bogen heilt rundt utan å
 * krysse noko, er han anten heilt inne eller heilt ute, og eitt punkt
 * svarar på kva.
 */
function stykkeBoge(ringar: readonly Pt[][], p: Pt, d: Pt, k: number): Span[] {
  const q = { p, d, k }
  const R = 1 / k
  const omkrins = 2 * Math.PI * Math.abs(R)
  // sentrum ligg på `p + n̂⊥·R` — same teiknvedtaket som `bogPar`
  const cx = p[0] - d[1] * R
  const cy = p[1] + d[0] * R
  const rad = Math.abs(R)
  const ts: number[] = []
  for (const ring of ringar) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]
      const b = ring[i]
      // |a + t(b−a) − c|² = R², t i [0, 1)
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const fx = a[0] - cx
      const fy = a[1] - cy
      const A = ex * ex + ey * ey
      if (A < 1e-18) continue
      const B = 2 * (fx * ex + fy * ey)
      const C = fx * fx + fy * fy - rad * rad
      const disk = B * B - 4 * A * C
      if (disk <= 0) continue
      const rot = Math.sqrt(disk)
      for (const t of [(-B - rot) / (2 * A), (-B + rot) / (2 * A)]) {
        if (t < 0 || t >= 1) continue
        ts.push(sporInn(p[0], p[1], d[0], d[1], k, a[0] + ex * t, a[1] + ey * t)[0])
      }
    }
  }
  ts.sort((u, v) => u - v)
  if (!ts.length) {
    let n = 0
    for (const ring of ringar) if (inRing(ring, p)) n++
    return n % 2 === 1 ? [[-omkrins / 2, omkrins / 2]] : []
  }
  // spenna mellom to nabokryssingar, med den siste attende til den fyrste
  const ut: Span[] = []
  for (let i = 0; i < ts.length; i++) {
    const lo = ts[i]
    const hi = i + 1 < ts.length ? ts[i + 1] : ts[0] + omkrins
    if (hi - lo <= 1e-6) continue
    const m = sporPunkt(q, (lo + hi) / 2)
    let n = 0
    for (const ring of ringar) if (inRing(ring, m)) n++
    if (n % 2 === 1) ut.push([lo, hi])
  }
  return ut
}

/** snittet av to stykkelister */
export function felles(a: Span[], b: Span[]): Span[] {
  const ut: Span[] = []
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0)
      const hi = Math.min(a1, b1)
      if (hi > lo) ut.push([lo, hi])
    }
  }
  return ut
}

/** stykka i `a` som ikkje er i `b` */
export function utan(a: readonly Span[], b: readonly Span[]): Span[] {
  let ut: Span[] = a.map(([lo, hi]) => [lo, hi])
  for (const [b0, b1] of b) {
    const neste: Span[] = []
    for (const [a0, a1] of ut) {
      if (b1 <= a0 || b0 >= a1) {
        neste.push([a0, a1])
        continue
      }
      if (b0 > a0) neste.push([a0, b0])
      if (b1 < a1) neste.push([b1, a1])
    }
    ut = neste
  }
  return ut
}

/** ligg punktet i gods: i eit oddetal ringar */
export function iGods(ringar: readonly Pt[][], q: Pt): boolean {
  let n = 0
  for (const r of ringar) if (inRing(r, q)) n++
  return n % 2 === 1
}
