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
import { felles, sporPunkt, stykkeLangs, utan, type Line } from "./stykke"

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
}

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

type Ktx = { tjukn: number; klaring: number; slotW: number }

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
/** stykka langs lina, `off` millimeter til venstre for henne */
const langsAv = (a: TappFlate, l: Line, off: number) => stykkeLangs(a.ringar, [l.p[0] - l.d[1] * off, l.p[1] + l.d[0] * off], l.d)
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
  if (!T.omriss || T.boygd || M.boygd) return []
  const mKryss = felles(felles(langsAv(M, lM, 0), langsAv(M, lM, -(wM / 2 + 0.5))), langsAv(M, lM, wM / 2 + 0.5))
  if (!mKryss.length) return []
  const ut: { s: number; strekk: Span[] }[] = []
  for (const s of [-1, 1]) {
    const naer = langsAv(T, lT, s * (tb2 + fang))
    const fjern = langsAv(T, lT, -s * (tb2 + fang))
    const strekk = felles(utan(naer, fjern), mKryss)
      .filter(([lo, hi]) => hi - lo >= tappMin)
      .sort((a, b) => a[0] - b[0])
    if (strekk.length) ut.push({ s, strekk })
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
export function tappa(k: Ktx, T: TappFlate, M: TappFlate, lT: Line, lM: Line, sin: number, cos: number, nr: number) {
  const fang = fangAv(k)
  const tb2 = k.tjukn / (2 * sin)
  // SLISSA ER BREIARE ENN PLATA NÅR PLATA STÅR PÅ SKRÅ: tappen går gjennom
  // heile tjukna på M, og kvar flate hans ser han ein annan stad
  const wM = (k.slotW + k.tjukn * cos) / sin
  const ut: { inn: Vec3; strekk: Span[]; tal: number }[] = []
  for (const { s, strekk } of sluttar(k, T, M, lT, lM, tb2, wM)) {
    let tal = 0
    const inn2: Pt = [s * lT.d[1], -s * lT.d[0]]
    const inn: Vec3 = add3(mul3(T.r.u, inn2[0]), mul3(T.r.v, inn2[1]))
    /**
     * KANTEN VERT RETTA I OMRISSET, og ikkje berre i feltet: kvart punkt i
     * fangbandet vert flytt ut på den nære flata. Då står sidene rette opp
     * til skuldra, der eit fyll ville ha stukke ut som eit øyre der sida
     * skrår — og ein kant som vart teikna tre hundredelar under setet får
     * ikkje ei trapp ved rota av kvar tapp.
     */
    const rom = tb2 + fang
    if (T.omriss) {
      const nx = -lT.d[1]
      const ny = lT.d[0]
      const rett = (q: Pt): Pt => {
        const rx = q[0] - lT.p[0]
        const ry = q[1] - lT.p[1]
        const off = rx * nx + ry * ny
        if (Math.abs(off) >= rom) return q
        const lam = rx * lT.d[0] + ry * lT.d[1]
        if (!strekk.some(([a, b]) => lam >= a - rom && lam <= b + rom)) return q
        return [lT.p[0] + lT.d[0] * lam + nx * s * tb2, lT.p[1] + lT.d[1] * lam + ny * s * tb2]
      }
      T.omriss = T.omriss.map(rett)
      T.hjorne = T.hjorne.map(rett)
    }
    const retta = T.omriss ? [T.omriss] : T.ringar
    for (const [c0, c1] of strekk) {
      // KLIPPET: det som står forbi den nære flata, er i vegen for M
      T.tform.push(boks(lT, c0, c1, s * tb2, -s * (tb2 + fang + 1), false))
      // FYLLET: der kanten framleis står under flata — der hjørna låg
      // utanfor møtet og ikkje vart flytte — vert han løfta opp til henne.
      // Eit hol kortare enn fangbandet er ikkje ein kant som står lågt, men
      // ei side som skrår inn mot toppen, og ho skal stå som ho er.
      const naer = s * (tb2 + 0.01)
      for (const [g0, g1] of utan([[c0, c1]], stykkeLangs(retta, [lT.p[0] - lT.d[1] * naer, lT.p[1] + lT.d[0] * naer], lT.d))) {
        if (g1 - g0 > rom) T.tform.push(boks(lT, g0, g1, s * (tb2 + fang + 0.5), s * tb2, true))
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
        T.tform.push(boks(lT, a0, a1, s * (tb2 + 0.5), -s * tb2, true))
        M.tform.push(boks(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2, false))
        const nokkel = `t${T.plan.id}-${M.plan.id}-${nr + tal}`
        T.tapp.push({ mot: M.plan.id, slag: "tapp", midt: sporPunkt(lT, (a0 + a1) / 2, 0), hjorne: hjorne(lT, a0, a1, s * tb2, -s * tb2), inn, nokkel })
        M.tapp.push({ mot: T.plan.id, slag: "slisse", midt: sporPunkt(lM, (a0 + a1) / 2, 0), hjorne: hjorne(lM, a0 - k.klaring / 2, a1 + k.klaring / 2, -wM / 2, wM / 2), inn, nokkel })
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
    for (const [fraa, til] of [[h0, h1], [h1, h2]] as const) {
      const halv = Math.hypot(til[0] - fraa[0], til[1] - fraa[1]) / 2
      const runs = stykkeLangs(skorne, q.midt, ein2(til, fraa))
      for (const side of [1, -1]) {
        const kant = side * halv
        const run = runs.find(([lo, hi]) => Math.abs((side > 0 ? lo : hi) - kant) < 0.75)
        minst = Math.min(minst, run ? run[1] - run[0] : 0)
      }
    }
  }
  return minst
}
