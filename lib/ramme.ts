/**
 * INNRAMMINGA — kor langt attende kameraet skal stå, og kva det skal sjå på.
 *
 * Objektet vert alltid skalert til den same ramma, so «kor stort er det»
 * er ikkje eit spørsmål her. Spørsmålet er kor mykje RUTE det har: eit
 * kontrollark som er ope tek nedste halvdelen, og eit objekt som er ramma
 * inn i heile ruta står då bak arket.
 *
 * Rekninga står her og ikkje i scena av éin grunn: eit objekt som gøymer
 * seg bak menyen er ein feil som ikkje kastar, ikkje loggar og ikkje syner
 * att på noko måltal. Det einaste som fangar han er å rekne kvar objektet
 * hamnar på skjermen — og det kan berre gjerast på tal som let seg lesa
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
 * Kor mykje av ruta arket får ta før innramminga sluttar å ta omsyn.
 *
 * Eit ark som tek to tredelar er ikkje eit ark nokon les objektet gjennom;
 * det er eit ark nokon arbeider i. Å sende objektet til himmels for å berge
 * dei siste pikslane gjer begge delar verre.
 */
export const MAX_DEKKE = 0.45

export function ramme(
  fit: Fit,
  o: {
    /** kor stor del av ruta kontrollarket dekkjer, 0 til 1 */
    dekke: number
    /** breidd delt på høgd */
    aspect: number
    fovDeg: number
    /** konturvisinga: flat teikning, ikkje objekt i eit rom */
    flat: boolean
  },
): { dist: number; y: number; viewH: number } {
  const vHalf = (o.fovDeg * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (o.aspect || 1))
  // Bandet som er fritt, og synsvinkelen i nett det bandet.
  const band = 1 - Math.min(MAX_DEKKE, Math.max(0, o.dekke))
  const vFri = Math.atan(Math.tan(vHalf) * band)
  // Eit objekt kan snuast, og då må innramminga halde same kva veg det
  // står: difor radien, som er den same frå alle kantar. Ei teikning kan
  // ikkje snuast, og då er radien altfor raus — ein lang, låg rad ville stå
  // og fylle halve ruta med luft over og under. Ho vert difor ramma inn i
  // breidda og i høgda kvar for seg, og den strengaste vinn.
  const raw = o.flat
    ? Math.max(fit.w / 2 / Math.tan(hHalf), fit.h / 2 / Math.tan(vFri)) * FIT_MARGIN
    : (fit.r * FIT_MARGIN) / Math.tan(Math.min(vFri, hHalf))
  const dist = Math.min(MAX_DIST, Math.max(MIN_DIST, raw))
  const viewH = 2 * dist * Math.tan(vHalf)
  // Golvpinninga held golvlina i same skjermhøgd, men berre så lenge ho
  // ikkje kastar sikta over objektet. På eit høgt og smalt lerret vert
  // avstanden stor, og då ville siktepunktet flyge opp i lause lufta med
  // objektet langt nede. Difor eit tak på objektet si eiga midje. Ei
  // teikning har inga golvline å pinne mot: ho skal stå midt i bandet.
  const mid = GROUND_Y + fit.cy
  const sikte = o.flat ? mid : Math.min(GROUND_Y + dist * FLOOR_TAN, mid)
  // …og so opp i midten av det frie bandet, målt i det synsfeltet kameraet
  // faktisk har på den avstanden.
  return { dist, y: sikte - (1 - band) * viewH * 0.5, viewH }
}

/**
 * Kvar objektet hamnar på skjermen, som brøkdel av høgda ovanfrå.
 *
 * 0 er øvste kanten og 1 er nedste. Kula kring objektet er det einaste som
 * held same kva veg det er snutt, so ho er det som vert målt.
 */
export function paaSkjermen(fit: Fit, r: { y: number; viewH: number }) {
  const midt = GROUND_Y + fit.cy
  const del = (y: number) => 0.5 - (y - r.y) / r.viewH
  return { topp: del(midt + fit.r), botn: del(midt - fit.r) }
}
