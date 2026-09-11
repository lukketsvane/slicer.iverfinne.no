/**
 * MONTASJEN — vegen frå plata til objektet, som tal.
 *
 * Ei kuttfil seier kva du skal skjere. Ho seier ikkje kva som går kvar,
 * eller kva som må ned FØRST, og det er der ein stabel like plater vert ein
 * ettermiddag med prøving. Denne fila svarar på begge, og ho svarar av
 * geometrien og ikkje av ei liste nokon har skrive.
 *
 * TO PLASSAR PER DEL, OG EIN STIV VEG MELLOM DEI.
 *
 * Omrisset til ein del er dei same punkta begge stader: montasjen legg dei
 * i planet si ramme, nestinga legg dei ned på ei plate med ein kvartsving
 * og eit skuv. Begge er STIVE flyttingar — `akser` gjev `u × v = n`, so
 * ramma er ei ekte rotasjon, og alle fire kvartsvingane i `affine` har
 * determinant +1, so nestinga speglar aldri ein del. Difor treng ein del
 * berre EITT nett, i si eiga flate ramme, og to matriser: kvar han ligg,
 * og kvar han skal. Alt imellom er ei interpolering, ikkje ein ny
 * geometri.
 *
 * REKKJEFYLGJA ER MOTOREN SI, OG EIT STEG ER BERRE EI GROVARE UTGÅVE AV HENNE.
 *
 * `snitt.montering.orden` er den rekkjefylgja delane KAN monterast i: kvar
 * del som kjem inn møter dei som alt ligg langs parallelle liner, sporet
 * hans opnar seg i fartsretninga, og hardregelen «kan monterast» vaktar
 * henne. Ho står i `montering.txt` i ALT-bunten. Å rekne ut ei ny
 * rekkjefylgje her ville vore ei ANDRE sanning om det same — og då er det
 * berre eit spørsmål om tid før animasjonen syner deg ei anna montering
 * enn arket i eska.
 *
 * Stega er ei gruppering av henne og ingenting meir: to plan som er
 * parallelle kryssar aldri kvarandre, so so lenge retninga står, går dei
 * ned i lag. Eit rutenett vert difor to steg — tvers, so langs — og ein
 * virvel eitt steg per ribbe, som er sant om ein virvel: han vert bygd éi
 * om gongen. Delar utan eit einaste ledd står ikkje i ordenen; dei ligg
 * berre der, og dei kjem sist.
 */
import type { Vec3 } from "./core"
import { newSoup, ribSolid } from "./mesh"
import { placedRings, type Nesting } from "./nest"
import type { Del, Snitt } from "./snitt"
import type { Ramme } from "./plan"

export type MontDel = {
  /** det som står gravert på plata: «3a» */
  adr: string
  /** kva runde han kjem i, frå 0 */
  steg: number
  /** kva plate han ligg på, frå 1 */
  ark: number
  /** trekantane i delen si EIGA flate ramme: profilen i xy, plata frå 0 til tjukna */
  positions: Float32Array
  /**
   * ...og, BERRE for ein bøygd del, dei same trekantane slik han faktisk
   * står ferdig.
   *
   * Ein bøygd del er den eine som ikkje er ei stiv flytting av seg sjølv:
   * han vert skoren flat og står krum, og det er heile poenget med han. Han
   * flyg difor flat — som han ER medan han ligg på plata — og kjem på plass
   * som det han er. Feltet står tomt for alle andre, og det er det vanlege.
   */
  boygd?: Float32Array
  /** dei to plassane, 4×4 i kolonnerekkjefylgje — det `Matrix4.fromArray` les */
  ferdig: Float32Array
  flat: Float32Array
}

export type Montasje = {
  /** kor mange steg montasjen er, minst 1 */
  steg: number
  delar: MontDel[]
  /**
   * ALT ANIMASJONEN NOKON GONG DEKKJER — stabelen og objektet i eitt.
   *
   * Delar lagde flatt tek ALLTID meir plass enn dei same delane sette i
   * kvarandre: tolv ribber ved sida av kvarandre er tolv gonger arealet
   * dei har når dei kryssar. Difor kan ikkje scena ramme inn kroppen og
   * håpe: ho må vite kor stort dette vert, og krympe heile biletet so
   * begge endane står inne. Kameraet treng ikkje røre seg — innramminga
   * skalerer objektet inn i den same ramma same kor stort det er.
   */
  boks: { min: Vec3; max: Vec3 }
}

/** delen si eiga ramme: profilen der han står, plata frå z = 0 og opp */
const eiga = (t: number): Ramme => ({ o: [0, 0, t / 2], n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], k: 0 })

/**
 * RAMMA SOM MATRISE. Kolonnene er u, v og n, og flyttinga er foten minus
 * halve tjukna langs normalen — av di nettet er bygd med z frå 0 til t,
 * medan `ribSolid` reknar `off` frå midten av plata.
 */
const ferdigMat = (r: Ramme, t: number): Float32Array =>
  new Float32Array([
    r.u[0], r.u[1], r.u[2], 0,
    r.v[0], r.v[1], r.v[2], 0,
    r.n[0], r.n[1], r.n[2], 0,
    r.o[0] - (t / 2) * r.n[0], r.o[1] - (t / 2) * r.n[1], r.o[2] - (t / 2) * r.n[2], 1,
  ])

/**
 * OG NESTINGA SI, SOM MATRISE.
 *
 * Affinen `[a b e | c d f]` verkar på delen sine eigne to koordinat og lèt
 * z stå: plata ligg i xy, og delen ligg der nestinga la han.
 *
 * PLATENE LIGG I STABEL, IKKJE VED SIDA AV KVARANDRE.
 *
 * Den flate GLB-fila sprer dei bortover — ho er ei fil du ser gjennom, og
 * der skal ingenting liggje oppå noko anna. Dette er ikkje ei fil: det er
 * kroppen din som reiser seg av sine eigne plater, og då er det stabelen
 * på benken som er sant. Tolv plater ved sida av kvarandre er tre og ein
 * halv meter mot ein kropp på tre hundre millimeter — objektet vert ein
 * prikk i det biletet, og det er ikkje eit bilete nokon lærer noko av.
 *
 * Stabelen står midt under kroppen, med den fyrste plata på golvet, og
 * delane lyfter seg ut av han. `luft` er kor tjukk kvar etasje er.
 */
const flatMat = (m: readonly number[], off: Vec3): Float32Array =>
  new Float32Array([
    m[0], m[3], 0, 0,
    m[1], m[4], 0, 0,
    0, 0, 1, 0,
    m[2] + off[0], m[5] + off[1], off[2], 1,
  ])

/** normalen som nøkkel, med teiknet vaska bort: n og −n er den same retninga */
const RETN_NULL = 1e-4
function retning(n: Vec3): string {
  // DEN SAME GRENSA BEGGE STADER. Teiknet vart teke av det fyrste leddet
  // over 1e-6, medan nøkkelen nulla ut alt under 1e-4 — so [1e-4, 1, 0] og
  // [−1e-4, 1, 0], som er det same planet på seks tusendels grad, fekk
  // «0,1,0» og «0,−1,0» og vart to steg der geometrien har eitt. Normalane
  // kjem ut av `lesPlan` i multiplar av 1e-4, so det bandet er nåeleg frå
  // ei lenkje.
  let s: Vec3 = [n[0], n[1], n[2]]
  for (const c of s) {
    if (Math.abs(c) >= RETN_NULL) {
      if (c < 0) s = [-s[0], -s[1], -s[2]]
      break
    }
  }
  return s.map((c) => (Math.abs(c) < RETN_NULL ? 0 : c).toFixed(3)).join(",")
}

/** kva steg kvart plan høyrer til: motoren si rekkjefylgje, klumpa i retningar */
function stega(sn: Snitt, delar: readonly Del[]): Map<number, number> {
  const normal = new Map(sn.ribber.map((r) => [r.plan.id, r.r.n]))
  const ut = new Map<number, number>()
  let steg = -1
  let sist = ""
  for (const id of sn.montering.orden) {
    const n = normal.get(id)
    if (!n) continue
    const k = retning(n)
    if (k !== sist) {
      steg++
      sist = k
    }
    ut.set(id, steg)
  }
  // Delar utan ledd står ikkje i ordenen — dei heng ikkje i noko, so det
  // finst ingen stad dei MÅ kome. Dei kjem sist, i eitt steg for seg.
  const laus = delar.filter((d) => !ut.has(d.plan))
  if (laus.length) {
    steg++
    for (const d of laus) ut.set(d.plan, steg)
  }
  return ut
}

/** kvar etasje i stabelen er plata pluss to av henne i luft */
export const STABEL_LUFT = 3

export function montasjen(sn: Snitt, delar: readonly Del[], ns: Nesting, t: number, min: Vec3, max: Vec3): Montasje {
  const rammer = new Map(sn.ribber.map((r) => [r.plan.id, r.r]))
  /**
   * STABELEN MIDT UNDER KROPPEN — og midt på DELANE, ikkje på plata.
   *
   * Plata er 600 × 400 og kroppen 150: sentrerte vi på plata, ville
   * biletet vore fire femdelar tom plate med objektet som ein prikk i
   * midten. Delane står der nestinga la dei — det er framleis den plata
   * dei kjem frå — men det er DEI biletet handlar om.
   */
  const brukt = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const sh of ns.sheets) {
    for (const q of sh.placed) {
      for (const pt of placedRings(q).outline) {
        brukt.x0 = Math.min(brukt.x0, pt[0])
        brukt.y0 = Math.min(brukt.y0, pt[1])
        brukt.x1 = Math.max(brukt.x1, pt[0])
        brukt.y1 = Math.max(brukt.y1, pt[1])
      }
    }
  }
  const skuv = (i: number): Vec3 => [
    (min[0] + max[0]) / 2 - (brukt.x0 + brukt.x1) / 2,
    (min[1] + max[1]) / 2 - (brukt.y0 + brukt.y1) / 2,
    min[2] + i * t * STABEL_LUFT,
  ]
  // frå adressa til kvar nestinga la delen: plata og affinen hennar
  const lagd = new Map<string, { ark: number; m: readonly number[]; off: Vec3 }>()
  ns.sheets.forEach((sh, i) =>
    sh.placed.forEach((q) => lagd.set(q.part.adr, { ark: i + 1, m: q.slot.m, off: skuv(i) })),
  )
  const steg = stega(sn, delar)
  const lokal = eiga(t)
  const ut: MontDel[] = []
  for (const d of delar) {
    const r = rammer.get(d.plan)
    const p = lagd.get(d.adr)
    // Ein del utan ramme eller utan plass er ein del montasjen ikkje kan
    // seie noko sant om. `pnpm probe` tel at det ikkje hender.
    if (!r || !p) continue
    const s = newSoup()
    ribSolid(s, { r: lokal, outlines: [d.outline], holes: d.holes }, t)
    const m: MontDel = {
      adr: d.adr,
      steg: steg.get(d.plan) ?? 0,
      ark: p.ark,
      positions: new Float32Array(s.pos),
      ferdig: ferdigMat(r, t),
      flat: flatMat(p.m, p.off),
    }
    if (r.k) {
      const b = newSoup()
      ribSolid(b, { r, outlines: [d.outline], holes: d.holes }, t)
      m.boygd = new Float32Array(b.pos)
    }
    ut.push(m)
  }
  return { steg: Math.max(1, ...ut.map((d) => d.steg + 1)), delar: ut, boks: boksen(ut) }
}

/**
 * Boksen kring begge endane, rekna av hjørna til kvar del sin eigen boks.
 *
 * Hjørna og ikkje kvart punkt: ein boks kring dei åtte hjørna til ein
 * vridd boks er litt for stor, og for ei innramming er litt for stor det
 * rette svaret — han skal ha luft kring seg uansett.
 */
function boksen(delar: readonly MontDel[]): { min: Vec3; max: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const d of delar) {
    const a: Vec3 = [Infinity, Infinity, Infinity]
    const b: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < d.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        a[k] = Math.min(a[k], d.positions[i + k])
        b[k] = Math.max(b[k], d.positions[i + k])
      }
    }
    for (const M of [d.ferdig, d.flat]) {
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? b[0] : a[0]
        const y = c & 2 ? b[1] : a[1]
        const z = c & 4 ? b[2] : a[2]
        for (let k = 0; k < 3; k++) {
          const q = M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k]
          lo[k] = Math.min(lo[k], q)
          hi[k] = Math.max(hi[k], q)
        }
      }
    }
  }
  if (!Number.isFinite(lo[0])) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min: lo, max: hi }
}
