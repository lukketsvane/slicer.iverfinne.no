/**
 * INNRAMMINGA — kor langt attende kameraet skal stå, og kva del av ruta
 * objektet skal stå midt i.
 *
 * Objektet vert alltid skalert til den same ramma, so «kor stort er det» er
 * ikkje eit spørsmål her. Spørsmålet er kva del av ruta som er FRI: eit
 * kontrollark nedst tek den nedste halvdelen, og to veggar tek kvar sin
 * kant. Eit objekt som er ramma inn i heile ruta står bak dei.
 *
 * Rekninga står her og ikkje i scena av éin grunn: eit objekt som gøymer
 * seg bak menyen er ein feil som ikkje kastar, ikkje loggar og ikkje syner
 * att på noko måltal. Det einaste som fangar han er å rekne kvar objektet
 * hamnar på skjermen, og det kan berre gjerast på tal som let seg lesa
 * utanfor ein nettlesar.
 */
export type Fit = {
  /** rotasjonsfast radius i sceneeiningar */
  r: number
  /** breidd og høgd, for ei teikning som ikkje kan snuast */
  w: number
  h: number
  /** halve høgda: der midten av objektet ligg over golvet */
  cy: number
}

/** ruta og kva som ligg over henne, i CSS-pikslar */
export type Rute = {
  W: number
  H: number
  venstre: number
  hogre: number
  topp: number
  botn: number
}

/** golvet i scena */
export const GROUND_Y = -0.9
/** luft kring objektet */
export const FIT_MARGIN = 1.35
/** Golvlina står i same skjermhøgd same kor stort objektet er: siktepunktet
 *  stig i takt med kameraavstanden, so vinkelen ned mot golvet er fast. */
export const FLOOR_TAN = 0.1637
export const MIN_DIST = 3.2
/**
 * KOR LANGT ATTENDE DU FÅR KOME.
 *
 * Taket stod på 18. Innramminga treng aldri meir enn 14,5 av dei — det er
 * det verste tilfellet, ein like brei som høg kropp på ein telefonskjerm —
 * so ho var aldri i vegen. Men handa var: hadde du fyrst ramma inn, var det
 * berre 1,27 gonger att å dra seg attende på, og på ein kropp med mange
 * plan er det for lite til å sjå kva du held på med.
 *
 * No er det 3,4 gonger. Kroppen fyller 41 % av det frie bandet innramma og
 * 12 % heilt ute; under det er han ein prikk, og eit tak som slepper deg
 * til ein prikk er eit tak som ikkje gjer nytte.
 *
 * DETTE TALET HENG SAMAN MED SKODDA. Ho stod på faste tal, 22 til 48, og
 * eit kamera forbi 22 tynna kroppen ut mot bakgrunnen. Taket på 18 låg
 * akkurat under den kanten, so ingen fann det. Skal taket opp, må skodda
 * fylgje kameraet — sjå `SKODDE_NAER`.
 */
export const MAX_DIST = 48
/**
 * SKODDA LIGG EI FAST DJUPN BAK KROPPEN, ikkje på ein fast avstand frå null.
 *
 * Same lufta bak objektet kvar du enn står. Tala er dei same som dei faste
 * var på den innramma avstanden på ein telefon — 14,1 pluss 7,9 og 33,9 —
 * so synet er uendra der du alt var, og kroppen kan ikkje lenger tynnast
 * ut av å verte sett på frå langt unna.
 *
 * Kroppen sin eigen radius er kring 1,6; `SKODDE_NAER` må vera større enn
 * han, elles byrjar skodda inne i det ho skulle liggje bak.
 */
export const SKODDE_NAER = 8
export const SKODDE_FJERN = 34
/**
 * Kor lite det frie bandet får verte før innramminga sluttar å ta omsyn.
 *
 * Eit ark som tek to tredelar er ikkje eit ark nokon les objektet gjennom;
 * det er eit ark nokon arbeider i. Å sende objektet til himmels for å berge
 * dei siste pikslane gjer begge delar verre.
 */
export const MIN_FRITT = 0.5

/** det frie bandet i piksel, med kvar akse klemt for seg */
export function fritt(rute: Rute) {
  const takX = rute.W * (1 - MIN_FRITT)
  const takY = rute.H * (1 - MIN_FRITT)
  const sumX = Math.max(0, rute.venstre) + Math.max(0, rute.hogre)
  const sumY = Math.max(0, rute.topp) + Math.max(0, rute.botn)
  // Klemminga må halde FORHALDET mellom kantane, elles hoppar objektet
  // sidelengs når det eine panelet veks.
  const kx = sumX > takX ? takX / sumX : 1
  const ky = sumY > takY ? takY / sumY : 1
  const L = Math.max(0, rute.venstre) * kx
  const T = Math.max(0, rute.topp) * ky
  return {
    L,
    T,
    w: Math.max(1, rute.W - sumX * kx),
    h: Math.max(1, rute.H - sumY * ky),
  }
}

export function ramme(
  fit: Fit,
  o: { rute: Rute; fovDeg: number },
): { dist: number; y: number; fri: ReturnType<typeof fritt> } {
  const fri = fritt(o.rute)
  const vHalf = (o.fovDeg * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (fri.w / fri.h))
  // Eit objekt kan snuast, og då må innramminga halde same kva veg det
  // står: difor radien, som er den same frå alle kantar.
  const raw = (fit.r * FIT_MARGIN) / Math.tan(Math.min(vHalf, hHalf))
  const dist = Math.min(MAX_DIST, Math.max(MIN_DIST, raw))
  // Golvpinninga held golvlina i same skjermhøgd, men berre så lenge ho
  // ikkje kastar sikta over objektet. På eit høgt og smalt lerret vert
  // avstanden stor, og då ville siktepunktet flyge opp i lause lufta med
  // objektet langt nede. Difor eit tak på objektet si eiga midje.
  return {
    dist,
    y: Math.min(GROUND_Y + dist * FLOOR_TAN, GROUND_Y + fit.cy),
    fri,
  }
}

/**
 * Kvar objektet hamnar i det FRIE bandet, som brøkdel ovanfrå.
 *
 * 0 er øvste kanten av bandet og 1 er nedste. Kula kring objektet er det
 * einaste som held same kva veg det er snutt, so ho er det som vert målt.
 */
export function paaSkjermen(
  fit: Fit,
  r: { dist: number; y: number },
  fovDeg: number,
) {
  const viewH = 2 * r.dist * Math.tan((fovDeg * Math.PI) / 360)
  const midt = GROUND_Y + fit.cy
  const del = (y: number) => 0.5 - (y - r.y) / viewH
  return { topp: del(midt + fit.r), botn: del(midt - fit.r) }
}
