/**
 * VAFFEL — kroppen sin eigen profil, målt éin gong.
 *
 * EI RIBBE ER EI PRØVE AV EI FORM, og eit rutenett er eit prøvesett. Det
 * som ligg mellom to naboribber vert aldri skore: står ribbene tolv
 * millimeter frå kvarandre, forsvinn eit øyre som er åtte. Objektet på
 * skjermen er framleis eit objekt — det er berre ikkje det du gav han.
 *
 * Ingen av tala reiskapen elles reknar seier noko om det. «Tolv delar, to
 * ark, seksti ledd» seier at det let seg skjere og setje saman; det seier
 * ingenting om at det ikkje lenger liknar. Difor denne fila.
 *
 * KVA HAN MÅLER
 * Tverrsnittsarealet til kroppen som ein funksjon av kvar du står langs
 * aksen: A(x) og A(y). Ei ribbe i x = a er ei prøve av A i punktet a, og
 * vaffelen sin påstand om kroppen er den STYKKEVIS KONSTANTE funksjonen
 * som held den prøva heilt fram til nabocella. Skilnaden mellom den
 * påstanden og den verkelege A-en er det som gjekk tapt, og han er eit
 * areal ein kan rekne ut.
 *
 * KVIFOR EIN GONG
 * Profilen er ein funksjon av KROPPEN, og kroppen står stille medan
 * ribbetalet vert prøvd: `tune` rører berre ribbX, ribbY og leddelinga,
 * og ingen av dei tre er med i nøkkelen kroppen er hugsa på. So han vert
 * målt éin gong, og deretter kostar kvar kandidat ei summering over ei
 * talrekkje. Det er heile grunnen til at djupsøket kan sjå på tusen
 * rutenett i staden for tretten: dei tusen er aritmetikk, og berre dei
 * beste av dei vert snitta for alvor.
 *
 * KORLEIS
 * Ein loddrett stråle per søyle i eit rutenett over golvet. Strålen gjev
 * dei stykka han ligg inne i kroppen, og lengda av dei er høgda med gods i
 * den søyla. Same søyla tel tre gonger:
 *
 *   volumet     lengd × cellearealet
 *   A(x)        lengd × cellebreidda i y, lagt i bingen søyla står i
 *   A(y)        lengd × cellebreidda i x
 *
 * Éin sveip, tre svar. Ein sveip per akse ville vore tre gonger arbeidet
 * for dei same tala.
 */
import type { Kropp } from "./kropp"

export type Profil = {
  /** midten av fyrste bingen, og kor brei kvar bing er */
  x0: number
  y0: number
  dx: number
  dy: number
  /** tverrsnittsarealet, mm², bing for bing langs kvar akse */
  ax: Float64Array
  ay: Float64Array
  /** heile volumet, mm³, lese av dei same søylene */
  vol: number
}

/**
 * Kor fint profilen vert prøvd.
 *
 * Han skal vera fin nok til at ei celle mellom to ribber har fleire
 * bingar i seg — elles måler han si eiga oppløysing i staden for forma.
 * Ribbetaket er 32, so 128 bingar gjev fire per celle på det tettaste og
 * seksti på det spinklaste.
 *
 * Kostnaden er kvadratisk: 128 × 128 er 16 384 strålar. Det er under ei
 * ribbesnitting, og det er den samanlikninga som gjeld — djupsøket
 * betalar dette éin gong for å sleppe å snitte tusen rutenett.
 */
const BINGAR = 128

export function maalProfil(k: Kropp): Profil {
  const s = k.solid
  const x0r = s.min[0]
  const y0r = s.min[1]
  const viddX = Math.max(1e-6, s.max[0] - x0r)
  const viddY = Math.max(1e-6, s.max[1] - y0r)
  const dx = viddX / BINGAR
  const dy = viddY / BINGAR
  const celle = dx * dy

  const ax = new Float64Array(BINGAR)
  const ay = new Float64Array(BINGAR)
  let vol = 0

  for (let i = 0; i < BINGAR; i++) {
    const x = x0r + (i + 0.5) * dx
    for (let j = 0; j < BINGAR; j++) {
      const y = y0r + (j + 0.5) * dy
      let lengd = 0
      for (const [lo, hi] of s.runsZ(x, y)) lengd += hi - lo
      if (lengd <= 0) continue
      vol += lengd * celle
      ax[i] += lengd * dy
      ay[j] += lengd * dx
    }
  }

  return { x0: x0r + 0.5 * dx, y0: y0r + 0.5 * dy, dx, dy, ax, ay, vol }
}

/**
 * KOR MYKJE AV FORMA RIBBENE FAKTISK BER.
 *
 * Kvar bing vert høyrande til den ribba han ligg nærast — det er nett den
 * cella ribba svarar for — og vaffelen sin påstand om den bingen er
 * arealet ribba sjølv har. Skilnaden, summert over alle bingane og delt på
 * heile profilen, er den delen av forma som ikkje er der.
 *
 * Talet som kjem ut er 1 for ein perfekt gjeven form og 0 for ein som er
 * borte. Ein kube er 1 uansett kor få ribber han har — profilen hans er
 * konstant, so éi prøve fortel alt — og det er rett svar: ein kube med to
 * ribber ER ein kube. Ein torus med tre er det ikkje.
 *
 * MERK at dette ikkje er eit volumhøve. To feil som går kvar sin veg —
 * ein mage som vert for tjukk der eit bein vert borte — gjev det same
 * volumet og ei anna form, og eit høve mellom to volum ville sagt at alt
 * var i orden. Difor absoluttverdien, bing for bing.
 */
export function truskap(pr: Profil, akse: "x" | "y", ribber: readonly number[]): number {
  const a = akse === "x" ? pr.ax : pr.ay
  const b0 = akse === "x" ? pr.x0 : pr.y0
  const db = akse === "x" ? pr.dx : pr.dy
  if (!ribber.length) return 0

  // Ribbene ligg sorterte, so bingen kan gå gjennom dei med ein peikar i
  // staden for eit søk: eit binærsøk per bing er den same rekninga gjord
  // hundre og åtte og tjue gonger for ei rekkje som berre går framover.
  let r = 0
  let sum = 0
  let feil = 0
  for (let i = 0; i < a.length; i++) {
    const x = b0 + i * db
    while (r + 1 < ribber.length && Math.abs(ribber[r + 1] - x) <= Math.abs(ribber[r] - x)) r++
    // Arealet ribba har, lese av den same profilen: bingen ho står i.
    const rb = Math.min(a.length - 1, Math.max(0, Math.round((ribber[r] - b0) / db)))
    sum += a[i]
    feil += Math.abs(a[i] - a[rb])
  }
  if (sum <= 0) return 0
  return Math.max(0, 1 - feil / sum)
}

/**
 * Kor mykje plate rutenettet kjem til å eta, mm².
 *
 * Ribba i x = a har arealet A(a) — det er det same talet profilen alt har
 * målt — so heile plateforbruket er ei summering over dei to familiane.
 * Krysset mellom to ribber vert talt to gonger, ein gong i kvar, og det er
 * RETT: dei to spora tek ei halv platetjukn kvar, og til saman står det
 * like mykje gods att som om ingen av dei var der.
 *
 * Han er eit OVERSLAG og skal ikkje vera noko anna. Han veit ikkje om ein
 * del er for stor for plata, og han veit ikkje kva pakkinga får til. Det
 * er difor djupsøket har to steg: dette talet vel kven som er verd ei
 * snitting, og snittinga er den som tel.
 */
export function plateoverslag(
  pr: Profil,
  xs: readonly number[],
  ys: readonly number[],
): number {
  const les = (a: Float64Array, b0: number, db: number, v: number) =>
    a[Math.min(a.length - 1, Math.max(0, Math.round((v - b0) / db)))]
  let sum = 0
  for (const x of xs) sum += les(pr.ax, pr.x0, pr.dx, x)
  for (const y of ys) sum += les(pr.ay, pr.y0, pr.dy, y)
  return sum
}
