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
export const MAX_DIST = 18
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
  o: { rute: Rute; fovDeg: number; /** konturvisinga: flat teikning */ flat: boolean },
): { dist: number; y: number; fri: ReturnType<typeof fritt> } {
  const fri = fritt(o.rute)
  const vHalf = (o.fovDeg * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (fri.w / fri.h))
  // Eit objekt kan snuast, og då må innramminga halde same kva veg det
  // står: difor radien, som er den same frå alle kantar. Ei teikning kan
  // ikkje snuast, og då er radien altfor raus: ein lang, låg rad ville stå
  // og fylle halve ruta med luft over og under. Ho vert difor ramma inn i
  // breidda og i høgda kvar for seg, og den strengaste vinn.
  const raw = o.flat
    ? Math.max(fit.w / 2 / Math.tan(hHalf), fit.h / 2 / Math.tan(vHalf)) * FIT_MARGIN
    : (fit.r * FIT_MARGIN) / Math.tan(Math.min(vHalf, hHalf))
  const dist = Math.min(MAX_DIST, Math.max(MIN_DIST, raw))
  // Golvpinninga held golvlina i same skjermhøgd, men berre så lenge ho
  // ikkje kastar sikta over objektet. På eit høgt og smalt lerret vert
  // avstanden stor, og då ville siktepunktet flyge opp i lause lufta med
  // objektet langt nede. Difor eit tak på objektet si eiga midje. Ei
  // teikning har inga golvline å pinne mot: ho skal stå midt i bandet.
  const mid = GROUND_Y + fit.cy
  return {
    dist,
    y: o.flat ? mid : Math.min(GROUND_Y + dist * FLOOR_TAN, mid),
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
