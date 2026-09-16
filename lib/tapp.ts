/**
 * SLICERMAN — tapp og slisse.
 *
 * Halvt om halvt er det møtet snittinga har kunna sidan fyrste dag: to
 * plater som går gjennom kvarandre. Ein krakk er ikkje bygd slik. Beina
 * sluttar under setet, staget sluttar mot sida, og der ein kant møter ei
 * flate går ein tapp gjennom ei slisse. Denne fila er det møtet.
 *
 * Ho kjenner ikkje nettet og ikkje feltet. Ho får to flater med ringar,
 * lina dei deler, og legg boksar i kvar si liste: klipp og fyll og tappar
 * på den eine, slisser på den andre. Snittinga skjer dei inn saman med alt
 * anna, og profilen er sanninga som før.
 */
import { inRing, type Pt, type Vec3 } from "./core"
import type { Span } from "./mesh/solid"
import { add3, ein2, mul3, type Plan, type Ramme } from "./plan"
import { felles, sporInn, sporPunkt, stykkeLangs, utan, type Line } from "./stykke"

/**
 * TAPP OG SLISSE — der ei teikna plate SLUTTAR mot ei anna.
 *
 * Halvt om halvt krev at båe platene går GJENNOM kvarandre. Ein krakk er
 * ikkje bygd slik: beina sluttar under setet, staget sluttar mot sida.
 * Kanten på den eine møter flata på den andre, og der går ein tapp
 * gjennom ei slisse. Utan det kunne setet berre skjerast GJENNOM beina.
 *
 * Kva som er kva, les snittinga av godset og ikkje av ei merking: plata som
 * har gods like innanfor den nære flata på den andre og INKJE gods forbi
 * den fjerne, sluttar der. Plata som har gods på båe sider av den andre,
 * går gjennom. Det fyrste får tappen; det andre slissa.
 *
 * KANTEN VERT RETTA. Ein finger teiknar ikkje ein kant nøyaktig i flata
 * på setet, so alt mellom ei halv tjukn under og ei halv tjukn over
 * vert lese som «sluttar her»: godset vert klipt ved den nære flata, fylt
 * opp til henne der kanten stod lågare, og tappen går gjennom til den
 * fjerne flata. Strengen står som du teikna han; snittet er sanninga.
 *
 * BERRE EIT TEIKNA OMRISS FÅR TAPP. Ein kant nettet gav er berre der nettet
 * slutta, og ei ribbe gjennom eit dyr som endar ved eit anna plan er ikkje
 * ei plate nokon ville stå på. Ein kant handa teikna der, er det.
 */
export type Tapp = {
  /** planet på den andre sida */
  mot: number
  slag: "tapp" | "slisse"
  /** midten av tappen, eller av slissa, i profilen si ramme */
  midt: Pt
  /** dei fire hjørna, i same ramme: det vakta og teikninga les */
  hjorne: Pt[]
  /** retninga tappen peikar i rommet, frå tapp-plata inn i slisse-plata */
  inn: Vec3
  /** same nøkkel på båe sider: `t` + tapp-plata, slisse-plata og nummeret */
  nokkel: string
  /**
   * BOGEN, når tappen eller slissa ligg langs ein: lina og boksen på henne,
   * `t` langs og `s` til sides. Hjørna åleine seier ikkje kvar kanten går
   * mellom dei, og det er det vakta må vite.
   */
  boge?: Line & { t0: number; t1: number; s0: number; s1: number }
  /**
   * KILEN, når tappen stikk langt nok ut til å bera ein: breidda på hòlet
   * i tappen der kilen sit. Kilen er ein eigen del (sjå `kile`), og
   * han står berre på tapp-sida.
   */
  kile?: { w: number }
}

/**
 * KILEN — ein tapp som stikk ut halvanna tjukn eller meir får eit hòl, og
 * ein kile gjennom hòlet dreg leddet saman.
 *
 * Hòlet står i tappen, på tvers av han, ei halv millimeter INNANFOR den
 * fjerne flata: då ber kilen på flata og ikkje på hòlveggen, og eit slag
 * på kilen strammar. Hòlet er ei tjukn breitt langs lina (kilen er skoren
 * av same plata) og `w` langs tappen — ei tjukn når tappen rekk, og aldri
 * mindre enn ei halv. Utanfor hòlet står minst ei tjukn gods.
 *
 * Kilen sjølv er fire tjukner lang og køyrer inn på tvers av tappen: rett
 * på den sida som ber mot flata, seks grader skrå på den andre, og `w`
 * brei der han sit midt i. `kile` gjev profilen hans, y opp, kanten som
 * ber på y = 0.
 */
const KILE_EPS = 0.5
// og under seks millimeter er ein kile ei flis: modellar i tre millimeter får ingen
const kileBreidd = (k: Ktx, u: number) => {
  const w = u >= 1.5 * k.tjukn ? Math.max(0.5 * k.tjukn, Math.min(k.tjukn, u - k.tjukn + KILE_EPS)) : 0
  return w >= 6 ? w : 0
}
export function kile(w: number, t: number): Pt[] {
  const L = 4 * t
  const d = (L / 2) * Math.tan((6 * Math.PI) / 180)
  return [[-L / 2, 0], [L / 2, 0], [L / 2, w + d], [-L / 2, w - d]]
}
/** kilane til ei ribbe, som delar: namnet er tappen sitt med k framfor, og like breie kilar er same delen */
export const kilar = (tapp: readonly Tapp[], t: number) =>
  tapp.filter((q) => q.kile).map((q) => ({ adr: `k${q.nokkel.slice(1)}`, outline: kile(q.kile!.w, t), key: `kile|${q.kile!.w.toFixed(2)}` }))

const bogeAv = (l: Line, t0: number, t1: number, s0: number, s1: number) => (l.k ? { boge: { p: l.p, d: l.d, k: l.k, t0, t1, s0, s1 } } : {})

/** ein rett boks i feltet, same form som eit strek */
export type Boks = { gods: boolean; rund: boolean; cx: number; cy: number; hw: number; hh: number; c: number; s: number; bx0: number; bx1: number; by0: number; by1: number }

/** det tappane treng å vita om ei flate, og det dei skriv attende */
export type TappFlate = {
  plan: Plan
  r: Ramme
  /** profilen før nokon ledd, i ramma */
  ringar: Pt[][]
  /** omrisset handa teikna, i millimeter — utan det er det ingen tapp */
  omriss?: Pt[]
  hjorne: Pt[]
  boygd: boolean
  tform: Boks[]
  tapp: Tapp[]
  utvida: boolean
}

type Ktx = { tjukn: number; klaring: number; slotW: number; kilar?: boolean }

/** tappane og slissene som fell innanfor eitt stykke: midten ligg i ringen
 *  hans — ei slisse er eit hòl, men midten hennar er framleis innanfor
 *  ytterkanten */
export const tappIn = (tapp: readonly Tapp[], outline: Pt[]): Tapp[] => tapp.filter((q) => inRing(outline, q.midt))


/**
 * TAPP OG SLISSE, REKNA — sjå `Tapp`.
 *
 * `fang` er kor langt kanten får stå frå flata og framleis lesast som at
 * han sluttar der: ei halv tjukn, og aldri under halvannan millimeter.
 * Det er fingeren sin toleranse, og det er òg det som skil ein tapp frå
 * eit halvt-om-halvt-ledd: ei plate som held fram forbi det, går gjennom.
 *
 * `tappMin` er det kortaste møtet som ber ein tapp. Under tre tjukner
 * står det ikkje ein tapp att mellom to skuldrer, og ein kant som kryssar
 * flata SKRÅTT gjev eit kort møte der han passerer — det er ikkje ein
 * kant som sluttar mot setet, det er ein kant som går forbi det.
 */
const fangAv = (k: Ktx) => Math.max(1.5, 0.5 * k.tjukn)
const tappMinAv = (k: Ktx) => Math.max(6, 3 * k.tjukn)
/**
 * SYNLEGE TAPPAR: ein kant teikna litt FORBI den fjerne flata er ikkje ei
 * plate som går gjennom, men ein tapp som stikk ut. Opp til to tjukner
 * (og ti millimeter) forbi er det eit utstikk; lenger er det halvt om halvt.
 */
const utMaxAv = (k: Ktx) => Math.max(10, 2 * k.tjukn)
/**
 * KILAR PÅ: kvar tapp som går gjennom stikk ut ei halv millimeter under to
 * tjukner — det lengste utstikket som framleis er ein tapp — same om handa
 * teikna han i flukt. Kilehòlet vert då ei tjukn breitt, og godset utanfor
 * det ei tjukn så nær som millimeteren. Eit utstikk teikna lenger står.
 */
const kileU = (k: Ktx, u: number) => (k.kilar ? Math.max(u, 2 * k.tjukn - 0.5) : u)
/** stykka langs lina, `off` millimeter til venstre for henne */
// EIN BOGE: den parallelle bogen `off` til sides har same sentrum og radius R − off, og
// buelengda hans vert skalert attende til lina sin, so `t` er det same talet på båe
const langsAv = (a: TappFlate, l: Line, off: number): Span[] => {
  if (!l.k) return stykkeLangs(a.ringar, [l.p[0] - l.d[1] * off, l.p[1] + l.d[0] * off], l.d)
  const R = 1 / l.k
  if (Math.abs(R - off) < 1e-6) return []
  const f = R / (R - off)
  return stykkeLangs(a.ringar, sporPunkt(l, 0, off), l.d, 1 / (R - off)).map(([x, y]): Span => (f > 0 ? [x * f, y * f] : [y * f, x * f]))
}
/**
 * BOKSANE LANGS LINA: éin når ho er rett, og ein bogen full av korte når
 * ho er ein boge — kvar so kort at pilhøgda er under ein hundredels
 * millimeter, so slissa fylgjer bogen og ikkje korda.
 */
const boksar = (l: Line, t0: number, t1: number, s0: number, s1: number, gods: boolean): Boks[] => {
  if (!l.k) return [boks(l, t0, t1, s0, s1, gods)]
  const r = Math.abs(1 / l.k) + Math.max(Math.abs(s0), Math.abs(s1))
  const steg = Math.max(0.5, Math.sqrt(8 * r * 0.01))
  const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / steg))
  const ut: Boks[] = []
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n, b = t0 + ((t1 - t0) * (i + 1)) / n
    const tm = (a + b) / 2
    // ei rett line som tangerer bogen i midten av stykket, litt lengre so stykka går i hop
    const o = sporPunkt(l, tm, 0)
    const vinkel = l.k * tm
    const d: Pt = [l.d[0] * Math.cos(vinkel) - l.d[1] * Math.sin(vinkel), l.d[1] * Math.cos(vinkel) + l.d[0] * Math.sin(vinkel)]
    const sm = (s0 + s1) / 2
    const h = ((b - a) / 2) * Math.abs(1 - l.k * sm) + 0.02
    ut.push(boks({ p: o, d, k: 0 }, -h, h, s0, s1, gods))
  }
  return ut
}
/** ein rett boks langs lina: [t0, t1] langs, [s0, s1] til sides, som eit strek i feltet */
const boks = (l: Line, t0: number, t1: number, s0: number, s1: number, gods: boolean): Boks => {
  const tm = (t0 + t1) / 2
  const sm = (s0 + s1) / 2
  const hw = Math.abs(t1 - t0) / 2
  const hh = Math.abs(s1 - s0) / 2
  const c = l.d[0]
  const si = l.d[1]
  const cx = l.p[0] + c * tm - si * sm
  const cy = l.p[1] + si * tm + c * sm
  const rx = hw * Math.abs(c) + hh * Math.abs(si)
  const ry = hw * Math.abs(si) + hh * Math.abs(c)
  return { gods, rund: false, cx, cy, hw, hh, c, s: si, bx0: cx - rx, bx1: cx + rx, by0: cy - ry, by1: cy + ry }
}
/**
 * Der T sluttar mot M: stykka langs lina, og kva side godset til T ligg
 * på. M må ha gods på båe sider av slissa og midt i henne; T må ha gods
 * like innanfor den nære flata og ingenting forbi den fjerne.
 */
const sluttar = (k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, tb2: number, wM: number) => {
  const fang = fangAv(k)
  const tappMin = tappMinAv(k)
  if (!T.omriss) return []
  const mKryss = felles(felles(langsAv(M, lM, 0), langsAv(M, lM, -(wM / 2 + 0.5))), langsAv(M, lM, wM / 2 + 0.5))
  if (!mKryss.length) return []
  const utMax = utMaxAv(k)
  const ut: { s: number; strekk: Span[]; u: number }[] = []
  for (const s of [-1, 1]) {
    const naer = langsAv(T, lT, s * (tb2 + fang))
    const fjern = langsAv(T, lT, -s * (tb2 + fang))
    const strekk = felles(utan(naer, fjern), mKryss)
      .filter(([lo, hi]) => hi - lo >= tappMin)
      .sort((a, b) => a[0] - b[0])
    if (strekk.length) ut.push({ s, strekk, u: 0 })
    // utstikket: gods forbi den fjerne flata, men ikkje lenger enn utMax
    const gjennom = felles(felles(naer, fjern), mKryss).filter(([lo, hi]) => hi - lo >= tappMin)
    if (!gjennom.length) continue
    const stikk = utan(gjennom, langsAv(T, lT, -s * (tb2 + utMax))).filter(([lo, hi]) => hi - lo >= tappMin)
    if (!stikk.length) continue
    // kor langt: det ytste godset over heile møtet, på halve millimeteren
    let u = fang
    for (let off = fang + 0.5; off < utMax; off += 0.5) {
      if (felles(langsAv(T, lT, -s * (tb2 + off)), stikk).some(([lo, hi]) => hi - lo >= tappMin)) u = off
      else break
    }
    ut.push({ s, strekk: stikk.sort((a, b) => a[0] - b[0]), u: Math.round(u * 2) / 2 })
  }
  return ut
}
const hjorne = (l: Line, t0: number, t1: number, s0: number, s1: number): Pt[] => [
  sporPunkt(l, t0, s0),
  sporPunkt(l, t1, s0),
  sporPunkt(l, t1, s1),
  sporPunkt(l, t0, s1),
]
/**
 * Klipp, fyll, tappar og slisser for eitt møte. Gjev retninga tappane
 * peikar i rommet — frå T inn i M — og stykka dei tok, so halvt om halvt
 * ikkje les den same kanten ein gong til.
 */
/** punkta i fangbandet ut på den nære flata, i omrisset og hjørna — sjå under */
function rettKant(T: TappFlate, lT: Line, s: number, tb2: number, rom: number, strekk: readonly Span[]) {
  /**
   * KANTEN VERT RETTA I OMRISSET, og ikkje berre i feltet: kvart punkt i
   * fangbandet vert flytt ut på den nære flata. Då står sidene rette opp
   * til skuldra, der eit fyll ville ha stukke ut som eit øyre der sida
   * skrår — og ein kant som vart teikna tre hundredelar under setet får
   * ikkje ei trapp ved rota av kvar tapp. Langs ein boge er den nære
   * flata den parallelle bogen.
   */
  if (T.omriss) {
    const rett = (q: Pt): Pt => {
      const [lam, off] = sporInn(lT.p[0], lT.p[1], lT.d[0], lT.d[1], lT.k, q[0], q[1])
      if (Math.abs(off) >= rom) return q
      if (!strekk.some(([a, b]) => lam >= a - rom && lam <= b + rom)) return q
      return sporPunkt(lT, lam, s * tb2)
    }
    T.omriss = T.omriss.map(rett)
    T.hjorne = T.hjorne.map(rett)
  }
}

/**
 * DER T STIKK GJENNOM M. Ei plate som stikk ut gjennom ei anna gjev den
 * andre gods på båe sider av seg — og då ser det ut som om den andre
 * sluttar mot henne. Det gjer ho ikkje: stykka her er fredte for tappar
 * den andre vegen.
 */
export function stikkUt(k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, sin: number, cos: number): Span[] {
  return sluttar(k, T, M, lT, lM, k.tjukn / (2 * sin), (k.slotW + k.tjukn * cos) / sin).filter((q) => q.u > 0).flatMap((q) => q.strekk)
}

export function tappa(k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, sin: number, cos: number, nr: number, fredt: readonly Span[] = []) {
  const fang = fangAv(k)
  const tb2 = k.tjukn / (2 * sin)
  // SLISSA ER BREIARE ENN PLATA NÅR PLATA STÅR PÅ SKRÅ: tappen går gjennom
  // heile tjukna på M, og kvar flate hans ser han ein annan stad
  const wM = (k.slotW + k.tjukn * cos) / sin
  const ut: { inn: Vec3; strekk: Span[]; tal: number }[] = []
  const utMax = utMaxAv(k)
  const tappMin = tappMinAv(k)
  for (const svar of sluttar(k, T, M, lT, lM, tb2, wM)) {
    const { s } = svar
    const u = kileU(k, svar.u)
    const strekk = fredt.length ? utan(svar.strekk, fredt as Span[]).filter(([lo, hi]) => hi - lo >= tappMin) : svar.strekk
    if (!strekk.length) continue
    let tal = 0
    const inn2: Pt = [s * lT.d[1], -s * lT.d[0]]
    // ei bøygd plate peikar langs tangenten der lina ligg: u vrir seg med buen
    const a = T.boygd ? T.r.k * lT.p[0] : 0
    const uHer = a ? add3(mul3(T.r.u, Math.cos(a)), mul3(T.r.n, Math.sin(a))) : T.r.u
    const inn: Vec3 = add3(mul3(uHer, inn2[0]), mul3(T.r.v, inn2[1]))
    const rom = tb2 + fang
    rettKant(T, lT, s, tb2, rom, strekk)
    const retta = T.omriss ? [T.omriss] : T.ringar
    for (const [c0, c1] of strekk) {
      // KLIPPET: det som står forbi den nære flata, er i vegen for M
      T.tform.push(...boksar(lT, c0, c1, s * tb2, -s * (tb2 + (u ? utMax : fang) + 1), false))
      // FYLLET: der kanten framleis står under flata — der hjørna låg
      // utanfor møtet og ikkje vart flytte — vert han løfta opp til henne.
      // Eit hol kortare enn fangbandet er ikkje ein kant som står lågt, men
      // ei side som skrår inn mot toppen, og ho skal stå som ho er.
      const naer = s * (tb2 + 0.01)
      for (const [g0, g1] of utan([[c0, c1]], stykkeLangs(retta, [lT.p[0] - lT.d[1] * naer, lT.p[1] + lT.d[0] * naer], lT.d))) {
        if (g1 - g0 > rom) T.tform.push(...boksar(lT, g0, g1, s * (tb2 + fang + 0.5), s * tb2, true))
      }
      /**
       * TAPPANE: éin per femten centimeter møte, med skuldrer i båe endar.
       * Ei heil tjukn til sides er det minste som står att — møtet sluttar
       * ofte der den andre plata sluttar, og då er skuldra veggen kring
       * slissa, og «gods i leddet» krev ei tjukn der; femten prosent
       * av cella er det som gjer at eit sete på tretti centimeter får to
       * tappar med gods imellom og ikkje éin lang. Talet følgjer lengda og
       * ikkje plata: ein krakk i tre millimeter er ein modell av den same
       * krakken, ikkje ein kam.
       */
      const L = c1 - c0
      const n = Math.max(1, Math.round(L / 150))
      const celle = L / n
      const marg = Math.max(k.tjukn + k.klaring, 0.15 * celle)
      for (let i = 0; i < n; i++) {
        const a0 = c0 + i * celle + marg
        const a1 = c0 + (i + 1) * celle - marg
        T.tform.push(...boksar(lT, a0, a1, s * (tb2 + 0.5), -s * (tb2 + u), true))
        M.tform.push(...boksar(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2, false))
        const nokkel = `t${T.plan.id}-${M.plan.id}-${nr + tal}`
        // kilehòlet: på tvers av tappen, like innanfor den fjerne flata
        const kw = kileBreidd(k, u)
        if (kw) {
          const m = (a0 + a1) / 2, hb = (k.tjukn + k.klaring) / 2
          T.tform.push(...boksar(lT, m - hb, m + hb, -s * (tb2 - KILE_EPS), -s * (tb2 - KILE_EPS + kw), false))
        }
        T.tapp.push({ mot: M.plan.id, slag: "tapp", midt: sporPunkt(lT, (a0 + a1) / 2, 0), hjorne: hjorne(lT, a0, a1, s * tb2, -s * (tb2 + u)), inn, nokkel, ...bogeAv(lT, a0, a1, s * tb2, -s * (tb2 + u)), ...(kw ? { kile: { w: kw } } : {}) })
        M.tapp.push({ mot: T.plan.id, slag: "slisse", midt: sporPunkt(lM, (a0 + a1) / 2, 0), hjorne: hjorne(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2), inn, nokkel, ...bogeAv(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2) })
        tal++
      }
    }
    T.utvida = true
    ut.push({ inn, strekk, tal })
    nr += tal
  }
  return ut
}

/**
 * OG GODSET KRING SLISSA. Eit spor et halve overlappet; ei slisse et eit
 * hòl i ei plate, og det som står att mellom hòlet og kanten — eller
 * mellom to slisser — er det som held tappen. Lese av profilen slik han
 * vert skoren, langs lina og på tvers av henne, frå kvar vegg og ut.
 */
export function slisseGods(tapp: readonly Tapp[], skorne: readonly Pt[][]): number {
  let minst = Infinity
  for (const q of tapp) {
    if (q.slag !== "slisse") continue
    const [h0, h1, h2] = q.hjorne
    // ei slisse langs ein boge vert lesen langs bogen og tvers på han, ikkje langs korda
    const b = q.boge
    const proever: { halv: number; runs: Span[] }[] = []
    if (b) {
      const tm = (b.t0 + b.t1) / 2, sm = (b.s0 + b.s1) / 2
      const R = 1 / b.k
      const f = R / (R - sm)
      const langs = stykkeLangs(skorne, sporPunkt(b, 0, sm), b.d, 1 / (R - sm)).map(([x, y]): Span => (f > 0 ? [x * f - tm, y * f - tm] : [y * f - tm, x * f - tm]))
      const a = b.k * tm
      const o = sporPunkt(b, tm, sm)
      const n: Pt = [-(b.d[1] * Math.cos(a) + b.d[0] * Math.sin(a)), b.d[0] * Math.cos(a) - b.d[1] * Math.sin(a)]
      proever.push({ halv: (b.t1 - b.t0) / 2, runs: langs }, { halv: Math.abs(b.s1 - b.s0) / 2, runs: stykkeLangs(skorne, o, n) })
    } else {
      for (const [fraa, til] of [[h0, h1], [h1, h2]] as const) proever.push({ halv: Math.hypot(til[0] - fraa[0], til[1] - fraa[1]) / 2, runs: stykkeLangs(skorne, q.midt, ein2(til, fraa)) })
    }
    for (const { halv, runs } of proever) {
      for (const side of [1, -1]) {
        const kant = side * halv
        const run = runs.find(([lo, hi]) => Math.abs((side > 0 ? lo : hi) - kant) < 0.75)
        minst = Math.min(minst, run ? run[1] - run[0] : 0)
      }
    }
  }
  return minst
}

/**
 * FINGERLEDD I HJØRNET — der to plater sluttar mot KVARANDRE.
 *
 * Ein kasse: framsida endar i flukt med utsida av sida, og sida endar i
 * flukt med utsida av framsida. Ingen av dei går gjennom den andre, so
 * ingen av dei kan ha ei slisse. Hjørnet vert delt i eit oddetal fingrar
 * langs lina — kring seks tjukner lange, minst tre — og annakvar går til
 * kvar plate, ut til den andre si utside. Ytste fingrar høyrer til den
 * SISTE: der tre plater møtest, eig setet alle fire hjørnekubane oppå
 * sidene, og ingen av sidene tek den same. Klaringa står mellom fingrane,
 * ikkje i endane.
 *
 * Vegen inn er langs normalen til den som kjem: framsida går inn mellom
 * sidene, rett mot dei.
 */
export function fingrar(k: Ktx, A: TappFlate, B: TappFlate, lA: Line, lB: Line, sin: number, nr: number, fredt: readonly Span[] = []) {
  if (!A.omriss || !B.omriss || lA.k || lB.k) return null
  const fang = fangAv(k)
  const tb2 = k.tjukn / (2 * sin)
  const ende = (T: TappFlate, l: Line) => {
    for (const s of [-1, 1]) {
      const sp = utan(langsAv(T, l, s * (tb2 + fang)), langsAv(T, l, -s * (tb2 + fang)))
      if (sp.length) return { s, sp }
    }
    return null
  }
  const a = ende(A, lA), b = ende(B, lB)
  if (!a || !b) return null
  const strekk = utan(felles(a.sp, b.sp), fredt as Span[]).filter(([lo, hi]) => hi - lo >= tappMinAv(k))
  if (!strekk.length) return null
  const rom = tb2 + fang
  rettKant(A, lA, a.s, tb2, rom, strekk)
  rettKant(B, lB, b.s, tb2, rom, strekk)
  const retn = (T: TappFlate, l: Line, s: number): Vec3 => add3(mul3(T.r.u, s * l.d[1]), mul3(T.r.v, -s * l.d[0]))
  const innA = retn(A, lA, a.s), innB = retn(B, lB, b.s)
  let tal = 0
  for (const [c0, c1] of strekk) {
    A.tform.push(boks(lA, c0, c1, a.s * tb2, -a.s * (tb2 + fang + 1), false))
    B.tform.push(boks(lB, c0, c1, b.s * tb2, -b.s * (tb2 + fang + 1), false))
    const L = c1 - c0
    const n = Math.max(3, 2 * Math.round((L / (6 * k.tjukn) - 1) / 2) + 1)
    const f = L / n
    for (let i = 0; i < n; i++) {
      const [T, l, s, inn] = i % 2 ? [A, lA, a.s, innA] as const : [B, lB, b.s, innB] as const
      const f0 = c0 + i * f + (i ? k.klaring / 2 : 0)
      const f1 = c0 + (i + 1) * f - (i < n - 1 ? k.klaring / 2 : 0)
      T.tform.push(boks(l, f0, f1, s * (tb2 + 0.5), -s * tb2, true))
      const mot = T === A ? B : A
      T.tapp.push({ mot: mot.plan.id, slag: "tapp", midt: sporPunkt(l, (f0 + f1) / 2, 0), hjorne: hjorne(l, f0, f1, s * tb2, -s * tb2), inn, nokkel: `f${A.plan.id}-${B.plan.id}-${nr + tal}` })
      tal++
    }
  }
  A.utvida = B.utvida = true
  // den som kjem, går langs sin eigen normal inn mot den som ligg
  return { strekk, tal, innA: mul3(innB, -1), innB: mul3(innA, -1) }
}

/**
 * GJENNOMGANG — eit stag som går GJENNOM ei ribbe, ikkje i ein slisse frå kanten.
 *
 * Eit stag gjennom sju lameller: langs møtelina er staget smalt (det er
 * tverrsnittet hans), og ribba har gods langt forbi på båe sider. Halvt om
 * halvt ville skore ribba frå kanten og inn til staget — ein kanal gjennom
 * halve ribba. Rett er eit lukka hòl i ribba på storleik med tverrsnittet,
 * og staget urørt: det vert skuva gjennom langs normalen til ribba.
 *
 * `P` er plata som vert gjennomboga, `G` den som går gjennom. Null når
 * møtet ikkje er slik.
 */
export function gjennomgang(k: Ktx, P: TappFlate, G: TappFlate, lP: Line, lG: Line, sin: number, cos: number, nr: number, fredt: readonly Span[] = []) {
  if ((!G.omriss && !P.omriss) || lP.k || lG.k) return null
  const m = Math.max(2 * k.tjukn, 6)
  const rP = langsAv(P, lP, 0)
  const rG = langsAv(G, lG, 0)
  const ut: Span[] = []
  for (const [g0, g1] of rG) {
    // staget: heile breidda hans langs lina ligg inne i éin run av ribba, med gods forbi
    if (g1 - g0 < tappMinAv(k) / 2) continue
    if (!rP.some(([p0, p1]) => p0 <= g0 - m && p1 >= g1 + m)) continue
    if (utan([[g0, g1]], fredt as Span[]).length === 0) continue
    // og ribba har gods på båe sider av lina der staget går — elles er det ein kant
    const tb2 = k.tjukn / (2 * sin)
    const tvers = felles(felles(langsAv(P, lP, -(tb2 + m)), langsAv(P, lP, tb2 + m)), [[g0, g1]])
    if (!tvers.some(([a, b]) => b - a >= g1 - g0 - 1e-6)) continue
    ut.push([g0, g1])
  }
  if (!ut.length) return null
  const wP = (k.slotW + k.tjukn * cos) / sin
  const n = P.r.n
  const st = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? Math.sign(n[0]) : Math.abs(n[1]) >= Math.abs(n[2]) ? Math.sign(n[1]) : Math.sign(n[2])
  const inn = mul3(n, st || 1)
  let tal = 0
  for (const [g0, g1] of ut) {
    const a0 = g0 - k.klaring / 2, a1 = g1 + k.klaring / 2
    P.tform.push(boks(lP, a0, a1, -wP / 2, wP / 2, false))
    const nokkel = `g${G.plan.id}-${P.plan.id}-${nr + tal}`
    P.tapp.push({ mot: G.plan.id, slag: "slisse", midt: sporPunkt(lP, (a0 + a1) / 2, 0), hjorne: hjorne(lP, a0, a1, -wP / 2, wP / 2), inn, nokkel })
    G.tapp.push({ mot: P.plan.id, slag: "tapp", midt: sporPunkt(lG, (g0 + g1) / 2, 0), hjorne: hjorne(lG, g0, g1, -k.tjukn / (2 * sin), k.tjukn / (2 * sin)), inn, nokkel })
    tal++
  }
  P.utvida = true
  return { strekk: ut, tal, inn }
}

/**
 * ALLE MØTA SOM IKKJE ER HALVT OM HALVT, for eitt par: tappar begge vegar,
 * stag gjennom begge vegar, fingrar i hjørnet — i den rekkjefylgja, og kvar
 * tek sine stykke so den neste ikkje les dei om att. Snittinga får tilbake
 * talet, vegane og stykka; halvt om halvt tek resten.
 */
export function moteLedd(k: Ktx, A: TappFlate, B: TappFlate, lA: Line, lB: Line, sin: number, nr: number) {
  const cos = Math.sqrt(Math.max(0, 1 - sin * sin))
  const tekne: Span[] = []
  const vegar: [number, number, Vec3][] = []
  let tal = 0
  // A går inn langs tappane sine; B kjem ned på dei, mot den vegen dei peikar
  const pil = (del: TappFlate, mot: TappFlate, d: Vec3) => vegar.push([del.plan.id, mot.plan.id, d], [mot.plan.id, del.plan.id, mul3(d, -1)])
  for (const t of tappa(k, A, B, lA, lB, sin, cos, nr + tal, stikkUt(k, B, A, lB, lA, sin, cos))) {
    tal += t.tal
    pil(A, B, t.inn)
    tekne.push(...t.strekk)
  }
  for (const t of tappa(k, B, A, lB, lA, sin, cos, nr + tal, tekne)) {
    tal += t.tal
    pil(B, A, t.inn)
    tekne.push(...t.strekk)
  }
  // eit stag gjennom ei ribbe: lukka hòl, staget urørt — begge vegar
  for (const [P, G, lP, lG] of [[A, B, lA, lB], [B, A, lB, lA]] as const) {
    const gj = gjennomgang(k, P, G, lP, lG, sin, cos, nr + tal, tekne)
    if (!gj) continue
    tal += gj.tal
    pil(G, P, gj.inn)
    tekne.push(...gj.strekk)
  }
  // hjørnet: båe sluttar mot kvarandre, og det vert fingrar
  const fi = fingrar(k, A, B, lA, lB, sin, nr + tal, tekne)
  if (fi) {
    tal += fi.tal
    vegar.push([A.plan.id, B.plan.id, fi.innA], [B.plan.id, A.plan.id, fi.innB])
    tekne.push(...fi.strekk)
  }
  return { tal, vegar, tekne }
}

/**
 * SKØYTEN — to plater i SAME PLAN som møtest kant i kant.
 *
 * Eit delt sete, ei plate for stor for arket, ei rygglene i to: kanten på
 * den eine ligg på kanten av den andre, og ingen av dei går gjennom noko.
 * Kanten vert lina, båe vert klipte der, og langs henne går fingrar
 * annakvar veg — eit oddetal, kring tre tjukner lange og halvannan djupe,
 * med klaringa i hòla. Dei vert lagde ned i kvarandre langs normalen.
 *
 * `snudd` er når B har den motsette normalen: då er u spegla, og lina må
 * lesast spegla i B si ramme.
 */
export function skoyt(k: Ktx, A: TappFlate, B: TappFlate, snudd: boolean, nr: number) {
  if (!A.omriss || !B.omriss || A.boygd || B.boygd) return null
  const band = fangAv(k) + 0.5
  const iB = (l: Line): Line => (snudd ? { p: [-l.p[0], l.p[1]], d: [-l.d[0], l.d[1]], k: 0 } : l)
  // sida til venstre for lina i A er motsett side i B når ramma er spegla
  const sB = snudd ? -1 : 1
  const djup = 1.5 * k.tjukn
  const ut: { strekk: Span[]; tal: number } = { strekk: [], tal: 0 }
  const o = A.omriss
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 3 * k.tjukn) continue
    const l: Line = { p: a, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k: 0 }
    const lb = iB(l)
    const kant: Span[] = [[0, L]]
    // A på den eine sida, B på den andre, og ingen av dei på båe
    for (const s of [1, -1]) {
      const aInn = langsAv(A, l, s * band), aUt = langsAv(A, l, -s * band)
      const bInn = langsAv(B, lb, -s * sB * band), bUt = langsAv(B, lb, s * sB * band)
      const felt = felles(felles(utan(aInn, aUt), utan(bInn, bUt)), kant).filter(([x, y]) => y - x >= 3 * k.tjukn)
      for (const [c0, c1] of felt) {
        A.tform.push(boks(l, c0, c1, -s * 0, -s * (band + 1), false))
        B.tform.push(boks(lb, c0, c1, 0, s * sB * (band + 1), false))
        const n = Math.max(3, 2 * Math.round(((c1 - c0) / (3 * k.tjukn) - 1) / 2) + 1)
        const f = (c1 - c0) / n
        for (let j = 0; j < n; j++) {
          const f0 = c0 + j * f, f1 = c0 + (j + 1) * f
          const nokkel = `s${A.plan.id}-${B.plan.id}-${nr + ut.tal}`
          if (j % 2 === 0) {
            // A sin finger inn i B
            A.tform.push(boks(l, f0, f1, s * 0.5, -s * djup, true))
            B.tform.push(boks(lb, f0 - k.klaring / 2, f1 + k.klaring / 2, 0, -s * sB * (djup + k.klaring / 2), false))
            A.tapp.push({ mot: B.plan.id, slag: "tapp", midt: sporPunkt(l, (f0 + f1) / 2, -s * djup / 2), hjorne: hjorne(l, f0, f1, 0, -s * djup), inn: [0, 0, 0], nokkel })
          } else {
            B.tform.push(boks(lb, f0, f1, -s * sB * 0.5, s * sB * djup, true))
            A.tform.push(boks(l, f0 - k.klaring / 2, f1 + k.klaring / 2, 0, s * (djup + k.klaring / 2), false))
            B.tapp.push({ mot: A.plan.id, slag: "tapp", midt: sporPunkt(lb, (f0 + f1) / 2, s * sB * djup / 2), hjorne: hjorne(lb, f0, f1, 0, s * sB * djup), inn: [0, 0, 0], nokkel })
          }
          ut.tal++
        }
        ut.strekk.push([c0, c1])
      }
    }
  }
  if (!ut.tal) return null
  A.utvida = B.utvida = true
  return ut
}
