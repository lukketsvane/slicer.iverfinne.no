/**
 * SLICERMAN — planet.
 *
 * Eit plan er eit kutt gjennom kroppen, og det er den eine tingen heile
 * reiskapen kviler på. Du skisserer det med kameraet: medan du skisserer,
 * svingar planet med synet og ingenting er bygd. Låser du det, vert det ein
 * del — det får eit namn, ein profil, ein plass i monteringa og ei rad du
 * kan gå attende til. Etter det står det i kroppen, ikkje i kameraet: snu
 * modellen, skisser frå ei ny vinkel, lås att. Held låste plan ikkje stilt
 * når synet flyttar seg, fell heile ideen saman.
 *
 * Kva planet ER, står her. Kva det vert til — profil, spor, plass på
 * plata — står i `snitt.ts`. Denne fila kjenner korkje nettet eller
 * strålane; ho kjenner eit punkt, ei normal og eit namn.
 *
 * PLANET STÅR I KROPPEN SITT ROM, som brøkdelar av boksen kring han og ei
 * einingsnormal. Brøk og ikkje millimeter: låser du planet midt på ein
 * hund og dreg storleiken frå 80 til 300 mm, står det framleis midt på
 * hunden. Millimeter ville stått stille medan hunden voks frå dei. Ei
 * normal og ikkje to vinklar: to vinklar har ein pol der den eine ikkje
 * tyder noko, og eit plan skal kunne stå kvar som helst.
 *
 * NAMNET HØYRER TIL DELEN, IKKJE TIL PLASSEN. «X3» tydde «tredje ribba på
 * tvers» og braut i det plana vart vilkårlege. Namnet er eit tal som vert
 * gjeve når planet vert låst og aldri brukt om att, so ein del held namnet
 * sitt medan han vert flytt, vinkla om og teikna om — det er det namnet
 * som er gravert på han og lese av i ein haug på ein arbeidsbenk.
 */
import { lagFarge, shoelace, type Pt, type Vec3 } from "./core"

/** Fleire plan enn dette er ikkje eit prosjekt, det er ei lenkje som prøver seg. */
export const PLAN_TAK = 64
/** og fleire strek på eitt plan er ikkje ei redigering */
export const STREK_TAK = 24
/**
 * PUNKTTAKET I EIT OMRISS.
 *
 * Kvart punkt er eit handtak du skal kunne ta med tommelen, og handtaket er
 * fire og førti pikslar. Ein profil som fyller tre hundre pikslar på ein
 * telefon har ein omkrins kring åtte hundre, og det er atten handtak som
 * ikkje ligg oppå kvarandre. Fire og tjue er difor der forminga sluttar og
 * avteikninga byrjar: fleire punkt er punkt du ikkje kan skilje frå
 * kvarandre med ein finger.
 */
export const OMRISS_TAK = 24

/**
 * EIN HANDTEIKNA STREK I PROFILEN.
 *
 * Det nettet gjev er eit framlegg, ikkje ein dom: tjukk opp eit bein, rett
 * ut ein fot, skjer eit hòl til ein kabel. Streken ligg i planet si eiga
 * ramme og vert skoren i FELTET saman med spora — sjå `snitt.ts` — so
 * profilen framleis er éin kontur, og spora framleis veit kvar godset er.
 *
 * Måla er brøkdelar av storleiken (den lengste sida av kroppen) og ikkje
 * millimeter, av same grunn som planet sjølv: det du teikna på kroppen
 * skal fylgje kroppen når han vert skalert. Ein kabel har rett nok ei fast
 * breidd, men eit hòl som stod stille medan delen kring det voks, ville
 * hamna ein annan stad på delen enn der du sette det.
 *
 * NÅR NETTET ENDRAR SEG UNDER STREKEN, STÅR STREKEN. Det er ei avgjerd og
 * ikkje ein tilfeldig utgang: streken er det du gjorde, og reiskapen
 * kastar ikkje arbeid utan å bli beden. Han kan drive ut av lag med den
 * nye forma — og då ser du det i profilen og tek han bort sjølv.
 */
export type Strek = {
  /** legg til gods, eller skjer bort */
  slag: "gods" | "hol"
  form: "rekt" | "rund"
  /** midten, i planet si ramme, som brøkdel av storleiken */
  x: number
  y: number
  /** breidd og høgd, same eining */
  w: number
  h: number
  /** dreiing kring midten, grader */
  a: number
}

export type Plan = {
  /** namnet som vert gravert. Eit tal, gjeve ved låsing, aldri brukt om att. */
  id: number
  /** eit punkt i planet, som brøkdelar av boksen kring kroppen */
  o: Vec3
  /** einingsnormalen, i kroppen sitt rom */
  n: Vec3
  /**
   * BØYEN. Eit plan treng ikkje vera flatt.
   *
   * Ei plate av finér kan bøyast, og ei ribbe som bøyer seg fylgjer forma
   * tettare enn ei som ikkje kan. Flata vert ein SYLINDER: rett langs `v`,
   * krum langs `u`, med aksen parallell med `v`. Ein sylinder er utrullbar
   * — han rullar ut til eit flatt ark utan å strekkjast — so delen vert
   * framleis skoren flat, og du bøyer han ved montering. Det er heile
   * grunnen til at det er ein sylinder og ikkje ei kule.
   *
   * TALET ER KRUMMING GONGE STORLEIK, ikkje ein radius i millimeter. Same
   * grunn som alt anna her: det du bøygde skal fylgje kroppen når han vert
   * skalert. Radien i millimeter er `storleik / bog`, og DEN er det
   * materialet har ei meining om — sjå `bogMin` i `rules.ts`.
   *
   * Positivt bøyer flata mot +n. Null er flatt, og eit flatt plan skriv
   * ingen bøy i strengen i det heile.
   */
  bog: number
  /**
   * FIRKANTEN: profilen vert boksen kring seg sjølv.
   *
   * Ei ribbe gjennom eit dyr er ein kontur med øyre og hovar, og av og til
   * er det ikkje det du vil ha: du vil ha PLATA — heile rektangelet ribba
   * står i, med dei same ledda i dei same krysningane. Merket seier det,
   * og snittinga legg boksen til som gods før ho skjer spora.
   *
   * Han vert lagd til ETTER klippet mot biten, so boksen er boksen kring
   * det planet faktisk skjer, og ikkje kring heile kroppen.
   *
   * Merket kjem frå den tida brikka i arket sette det. No set reiskapen i
   * spalta eit OMRISS på fire punkt i staden — ein boks du kan dra i — men
   * merket vert framleis lese og skrive, so ei lenkje frå den tida opnar
   * det same objektet ho alltid har opna.
   */
  firkant?: true
  /**
   * OMRISSET: PROFILEN SOM PUNKT, SETT AV HANDA.
   *
   * Profilen er nettet lese av, og av og til er ikkje det svaret du vil ha:
   * du vil ha ribba du ser for deg. Fryser du profilen, vert han ei liste
   * punkt i planet si eiga ramme — og frå då av er det DEI som er profilen.
   * Kroppen vert ikkje lesen for dette planet lenger; streka vert teikna i
   * omrisset og spora skorne i det, som før.
   *
   * TO DIMENSJONAR, OG INGEN KONTROLLPUNKT. Eit punkt kan vera eit hjørne
   * eller ein boge (sjå `runde`), men bogen er rekna av NABOANE og ligg
   * ikkje i strengen: det er framleis berre punkt her, og kurva går
   * gjennom dei. Ei mangekant er det profilen alltid har vore — `contour`
   * gjev ei mangekant, kuttfila skriv ei mangekant, og ledda vert lesne av
   * ei mangekant — so bogane vert rekna ut til punkt (`omrissLine`) før
   * noko som helst geometri får sjå dei.
   *
   * Brøkdelar av storleiken, kring planet sitt eige punkt — same eining og
   * same nullpunkt som eit strek, og av same grunn: det du forma skal
   * fylgje kroppen når han vert skalert.
   *
   * Under tre punkt er det ikkje ei flate, og då er det ikkje eit omriss.
   */
  omriss?: Pt[]
  /**
   * KVA PUNKT I OMRISSET SOM ER BOGAR OG IKKJE HJØRNE.
   *
   * Plassane i `omriss`, ikkje punkt for seg: eit punkt er anten det eine
   * eller det andre, og eit flagg treng ikkje meir enn eit tal. Er lista
   * tom, er heile profilen hjørne — som han var før dette fanst, so ei
   * lenkje frå den tida opnar den same forma.
   *
   * Kurva er ein Catmull-Rom gjennom punkta: ho GÅR GJENNOM dei, so
   * handtaket ligg framleis på kanten det styrer. Eit hjørne står i vegen
   * for seg sjølv — naboen på den sida vert punktet sjølv — og då er
   * stykket mellom to hjørne nøyaktig ei rett line. Difor éin veg gjennom
   * rekninga og ikkje to, og difor er ei form utan bogar bit for bit den
   * same mangekanten ho alltid var.
   */
  runde?: number[]
  /**
   * MJUKINGA: kor mykje av kanten som vert runda bort, som brøkdel av den
   * lengste sida i kroppen.
   *
   * Eit nett er trekantar, og trekantane står i profilen: ein kontur som
   * hakkar seg fram langs eit bein er ikkje ein feil i snittinga, det er
   * nettet lese av. Mjukinga slører FELTET før konturen vert dregen, so
   * hjørna vert runda og hakket forsvinn — og spora vert skorne etterpå,
   * so leddet er like skarpt som før.
   *
   * Ein brøk og ikkje millimeter, av same grunn som bøyen og streka: det
   * du mjuka skal fylgje kroppen når han vert skalert.
   */
  mjuk?: number
  strek: Strek[]
  /**
   * GRUPPA. Plan som vart til i éi handling — eit rutenett, ein virvel,
   * ei spegling, ei dublering av ei gruppe — høyrer i hop, og det er
   * gruppa du tek i når du vil flytte, vinkle eller slette dei alle på ein
   * gong. Eit tal, gjeve når gruppa vert laga, aldri brukt om att; utan
   * gruppe står planet for seg. Gruppa seier ikkje noko om geometrien —
   * kvart plan er framleis sitt eige punkt og si eiga normal — ho seier
   * kven som svarar saman når handa tek i eitt av dei.
   */
  gruppe?: number
  /**
   * LAGET. Eit merke frå LightBurn sin palett (C02–C29, sjå `LAG_FARGAR`
   * i core): kuttet av dette planet går på sitt eige lag i fila, i den
   * fargen, so det kan få si eiga fart eller skjerast sist. Utan merke er
   * kuttet blått som alle andre. Merket seier ingenting om geometrien.
   */
  farge?: number
}

/** Meir enn dette er ikkje ein bøy, det er eit rør. Regelen om materialet
 *  klemmer hardare enn dette lenge før du kjem hit. */
export const BOG_TAK = 4
/**
 * MJUKINGSTAKET, som brøkdel av den lengste sida.
 *
 * To prosent er seks millimeter på ein kropp på tre hundre, og det er meir
 * enn nok til å ta hakket trekantane la att. Målt over: eit slør på fire og
 * ein halv prosent åt beina av ein krakk og la att ein kile. Ei mjuking som
 * et opp delen er ikkje ei mjuking, so taket ligg der ho framleis er ein
 * kant og ikkje ei ny form.
 */
export const MJUK_TAK = 0.02

// =============================================================================
// VEKTORAR — det vesle som trengst
// =============================================================================
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const norm3 = (a: Vec3): Vec3 => {
  const L = len3(a) || 1
  return [a[0] / L, a[1] / L, a[2] / L]
}
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
/** v dreia `ang` radianar om einingsaksen `akse` (Rodrigues) */
export function vriOm(v: Vec3, akse: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const k = cross(akse, v)
  const d = dot(akse, v) * (1 - c)
  return [v[0] * c + k[0] * s + akse[0] * d, v[1] * c + k[1] * s + akse[1] * d, v[2] * c + k[2] * s + akse[2] * d]
}
/**
 * Den minste dreiinga som tek `fraa` til `til`: aksen og vinkelen. To like
 * normalar er inga dreiing, og to motsette har inga eintydig akse — då
 * vert ei akse på tvers vald, og det er like rett som ei kvar anna.
 */
export function dreiing(fraa: Vec3, til: Vec3): { akse: Vec3; ang: number } {
  const a = norm3(fraa)
  const b = norm3(til)
  const k = cross(a, b)
  const s = len3(k)
  const c = Math.max(-1, Math.min(1, dot(a, b)))
  if (s < 1e-9) {
    if (c > 0) return { akse: [0, 0, 1], ang: 0 }
    const tvers: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    return { akse: norm3(cross(a, tvers)), ang: Math.PI }
  }
  return { akse: mul3(k, 1 / s), ang: Math.atan2(s, c) }
}

// =============================================================================
// RAMMA — planet i millimeter, med sine to aksar
// =============================================================================
/**
 * Planet slik snittinga og teikninga treng det: eit punkt i millimeter,
 * normalen, og to aksar i planet. (u, v, n) er høgrehendt, so ein profil
 * mot klokka i (u, v) gjev ei plate med flatene vende rett veg utan at
 * nokon treng spørje kva akse planet står på — det var det Y-familien
 * måtte snu vindinga for før.
 */
export type Ramme = {
  o: Vec3
  n: Vec3
  u: Vec3
  v: Vec3
  /** krumming i 1/mm, med teiknet til bøyen. Null er ei flat ramme. Sjå `bogUt`. */
  k: number
}

/**
 * u og v gjevne av normalen åleine: v er so nær «opp» som planet tillèt.
 *
 * Difor står profilen på plata slik ribba står i objektet, og namnet vert
 * gravert rett veg på ein del som står loddrett. Eit vassrett plan har
 * ikkje noko «opp» i seg; der er v nord (+y) i staden. Grensa ligg heilt
 * inntil vassrett og ikkje på tjue grader: ei vipping som skifta ramme
 * midtvegs, ville spegle delen på plata medan du dreidde på han.
 */
export function akser(n: Vec3): { u: Vec3; v: Vec3 } {
  const ref: Vec3 = Math.abs(n[2]) < 0.9999 ? [0, 0, 1] : [0, 1, 0]
  const k = dot(ref, n)
  const v = norm3(sub3(ref, mul3(n, k)))
  return { u: cross(v, n), v }
}

/** den lengste sida av boksen: same lengda `storleik` er, og det bøyen vert målt mot */
export const lengste = (min: Vec3, max: Vec3) => Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)

export function ramme(pl: { o: Vec3; n: Vec3; bog?: number }, min: Vec3, max: Vec3): Ramme {
  const n = norm3(pl.n)
  const o: Vec3 = [
    min[0] + pl.o[0] * (max[0] - min[0]),
    min[1] + pl.o[1] * (max[1] - min[1]),
    min[2] + pl.o[2] * (max[2] - min[2]),
  ]
  return { o, n, ...akser(n), k: (pl.bog ?? 0) / lengste(min, max) }
}

/**
 * BØYEN, REKNA.
 *
 * Ramma er flat i `v` og krum i `u`, med sylinderaksen parallell med `v`.
 * Punktet `u` millimeter ut langs buen ligg på
 *
 *   o + û·sin(k·u)/k + n̂·(1 − cos(k·u))/k
 *
 * og det er BUELENGDA `u` er, ikkje ei rett line: eit ark som vert rulla
 * strekkjer seg ikkje. Difor er profilen i ramma alt det flate
 * kuttmønsteret, og difor er ein sylinder det einaste som duger — ei kule
 * kan ikkje rullast ut utan å rive.
 *
 * Går k mot null, går sin(ku)/k mot u og (1−cos(ku))/k mot null, og heile
 * uttrykket vert den flate ramma att. Rekkja under gjer det same der talet
 * elles hadde vore null delt på null.
 */
const bogPar = (k: number, u: number): [number, number] => {
  const a = k * u
  if (Math.abs(a) < 1e-6) return [u * (1 - (a * a) / 6), (u * a) / 2]
  return [Math.sin(a) / k, (1 - Math.cos(a)) / k]
}

/** frå planet si ramme ut i rommet, `off` millimeter langs flatenormalen */
export const ut = (r: Ramme, q: Pt, off = 0): Vec3 => {
  if (!r.k) {
    return [
      r.o[0] + q[0] * r.u[0] + q[1] * r.v[0] + off * r.n[0],
      r.o[1] + q[0] * r.u[1] + q[1] * r.v[1] + off * r.n[1],
      r.o[2] + q[0] * r.u[2] + q[1] * r.v[2] + off * r.n[2],
    ]
  }
  // NORMALEN VRIR SEG MED FLATA: tjukna på ei bøygd ribbe står vinkelrett
  // på ho der ho er, ikkje der ho byrja. Elles vart plata tjukkare i den
  // eine enden enn i den andre.
  const a = r.k * q[0]
  const [su, sn] = bogPar(r.k, q[0])
  const c = Math.cos(a)
  const si = Math.sin(a)
  // `off` går langs +n̂ der buen byrjar, og fylgjer flata derifrå: innover
  // mot aksen. Punktet ligg då nøyaktig |R − off| frå aksen same kvar på
  // buen det står, og det er DET som gjer plata like tjukk heile vegen.
  const du = su - off * si
  const dn = sn + off * c
  return [
    r.o[0] + du * r.u[0] + q[1] * r.v[0] + dn * r.n[0],
    r.o[1] + du * r.u[1] + q[1] * r.v[1] + dn * r.n[1],
    r.o[2] + du * r.u[2] + q[1] * r.v[2] + dn * r.n[2],
  ]
}

/**
 * Frå rommet inn i planet si ramme. Flat: komponenten langs normalen fell
 * bort. Bøygd: vinkelen kring sylinderaksen vert buelengd, og avstanden
 * frå aksen seier kor langt frå flata punktet ligg — det siste fell bort
 * her, som normalkomponenten gjer i det flate tilfellet.
 */
export const inn = (r: Ramme, p: Vec3): Pt => {
  const d = sub3(p, r.o)
  const a = dot(d, r.u)
  const c = dot(d, r.v)
  if (!r.k) return [a, c]
  const R = 1 / r.k
  const b = dot(d, r.n)
  // teiknet på R inn i atan2, so vinkelen vert den same kva veg buen går
  const sg = Math.sign(R)
  return [Math.atan2(sg * a, sg * (R - b)) * R, c]
}

/** kor langt frå den bøygde flata eit punkt ligg, i millimeter langs normalen */
export const avFlata = (r: Ramme, p: Vec3): number => {
  const d = sub3(p, r.o)
  if (!r.k) return dot(d, r.n)
  const R = 1 / r.k
  return R - Math.hypot(dot(d, r.u), R - dot(d, r.n)) * Math.sign(R)
}

/** eit punkt i millimeter attende til brøkdelar av boksen */
export const broek = (p: Vec3, min: Vec3, max: Vec3): Vec3 => [
  (p[0] - min[0]) / Math.max(1e-9, max[0] - min[0]),
  (p[1] - min[1]) / Math.max(1e-9, max[1] - min[1]),
  (p[2] - min[2]) / Math.max(1e-9, max[2] - min[2]),
]

// =============================================================================
// KRYSSET — der to plan møtest
// =============================================================================
/**
 * Under dette er to plan ikkje eit kryss, dei er nesten det same planet:
 * fem grader. Eit ledd der er ei plate som skal inn i eit spor tolv gonger
 * breiare enn seg sjølv, og det held ikkje noko.
 */
export const KRYSS_MIN = Math.sin((5 * Math.PI) / 180)

/**
 * Lina to plan deler: eit punkt på henne og retninga hennar, pluss sinus
 * til vinkelen mellom plana — det er han som seier kor breitt sporet må
 * vera for at ei plate på tvers skal gå gjennom.
 */
export function kryss(a: Ramme, b: Ramme): { p: Vec3; d: Vec3; sin: number } | null {
  const d = cross(a.n, b.n)
  const L = len3(d)
  if (L < KRYSS_MIN) return null
  const da = dot(a.n, a.o)
  const db = dot(b.n, b.o)
  const c = dot(a.n, b.n)
  const den = 1 - c * c
  const ka = (da - db * c) / den
  const kb = (db - da * c) / den
  return { p: add3(mul3(a.n, ka), mul3(b.n, kb)), d: mul3(d, 1 / L), sin: L }
}

// =============================================================================
// LISTA SOM STRENG
// =============================================================================
/**
 * «3@0.5,0.5,0.5/1,0,0» — namn, punkt, normal; strek etter endå ein skråstrek.
 *
 * Ein STRENG i parameterposen, og ikkje ein tilstand ved sida av. Alt
 * reiskapen kan med parametrar gjeld då òg plana, utan ei einaste ny line:
 * angre er ein parameterpose, lenkja er ein parameterpose, prosjektfila og
 * økta er parameterposar, og nøklane som hugsar mellombygg er bygde av dei.
 *
 * Strengen kjem frå ei lenkje, og ei lenkje er skriven av kven som helst.
 * Lesinga er difor den einaste vegen inn: ho tek imot kva som helst og gjev
 * alltid ei gyldig liste — NaN, ei normal utan lengd, tusen plan og eit
 * namn som ikkje er eit tal fell alle på golvet i staden for å nå
 * geometrien.
 */
const tal4 = (v: number) => String(+v.toFixed(4))
const vec = (v: Vec3) => v.map(tal4).join(",")

const skrivStrek = (s: Strek) =>
  `${s.slag === "gods" ? "+" : "-"}${s.form === "rekt" ? "r" : "o"}:${[s.x, s.y, s.w, s.h, s.a].map(tal4).join(",")}`

/** «p:x,y,x,y,…» — punkta på rad, av di eit punkt ikkje har fleire felt enn dei to */
const skrivOmriss = (o: readonly Pt[]) => `p:${o.map((q) => `${tal4(q[0])},${tal4(q[1])}`).join(",")}`
/** «r:0,2,5» — kva plassar i omrisset som er bogar. Tomt er berre hjørne. */
const skrivRunde = (r: readonly number[]) => `r:${r.join(",")}`

export function skrivPlan(l: readonly Plan[]): string {
  return l
    .map((p) =>
      [`${p.id}@${vec(p.o)}/${vec(p.n)}`, ...(p.bog ? [`b:${+p.bog.toFixed(4)}`] : []), ...(p.firkant ? ["f:1"] : []), ...(p.mjuk ? [`m:${+p.mjuk.toFixed(4)}`] : []), ...(p.omriss?.length ? [skrivOmriss(p.omriss)] : []), ...(p.omriss?.length && p.runde?.length ? [skrivRunde(p.runde)] : []), ...(p.gruppe ? [`g:${p.gruppe}`] : []), ...(p.farge ? [`c:${p.farge}`] : []), ...p.strek.map(skrivStrek)].join("/"),
    )
    .join(";")
}

const lesVec = (s: string): Vec3 | null => {
  const v = s.split(",").map(Number)
  if (v.length !== 3 || !v.every(Number.isFinite)) return null
  return [v[0], v[1], v[2]]
}

const lesStrek = (s: string): Strek | null => {
  const m = /^([+-])([ro]):(.*)$/.exec(s)
  if (!m) return null
  const slag = m[1] === "+" ? "gods" : "hol"
  const v = m[3].split(",").map(Number)
  if (v.length !== 5 || !v.every(Number.isFinite)) return null
  const [x, y, w, h, a] = v
  // Ein strek utanfor kroppen eller utan breidd er ingen strek.
  if (Math.abs(x) > 2 || Math.abs(y) > 2 || w <= 0 || h <= 0 || w > 2 || h > 2) return null
  return {
    slag,
    form: m[2] === "r" ? "rekt" : "rund",
    x: +x.toFixed(4),
    y: +y.toFixed(4),
    w: +w.toFixed(4),
    h: +h.toFixed(4),
    a: +(((a % 360) + 360) % 360).toFixed(4),
  }
}

/**
 * OMRISSET SOM MANGEKANT, MED BOGANE REKNA UT.
 *
 * Alt nedanfor dette tek ei mangekant: feltet, kuttfila, ledda. Bogane er
 * eit flagg på eit punkt og ikkje ein ny geometri, so dei vert til punkt
 * her — éin stad — og resten av huset ser aldri anna enn det ho alltid såg.
 *
 * Catmull-Rom gjennom punkta: for stykket p1→p2 er naboen på kvar side
 * tangenten, og eit HJØRNE er sin eigen nabo. Med begge endane hjørne fell
 * kurva saman med den rette lina mellom dei — same rekninga, ingen greiner,
 * og ei form utan bogar er bit for bit den mangekanten ho var før.
 *
 * Åtte steg per boga: eit omriss står i høgda 300 px på skjermen, og eit
 * stykke av det er sjeldan meir enn hundre. Åtte gjev kortare bitar enn ein
 * piksel er brei på ein telefon, og taket på 24 punkt held heile ting under
 * 200 punkt — mindre enn ein kontur lesen av eit nett.
 */
/**
 * KOR FINT EIN BOGE VERT DELT: SÅ FINT HAN TRENG, OG IKKJE FINARE.
 *
 * Åtte faste steg var lett å skrive og dyrt å bruke. Punkta frå denne fila
 * går rett inn i feltet (`felt`/`omrissDist` i `lib/snitt.ts`), og der vert
 * KVAR KANT gått for KVAR CELLE i ei rute som kan vera 520 × 520. Åtte steg
 * gjer eit omriss på fire og tjue punkt til hundre og to og nitti, og det er
 * åtte gonger den lykkja. Målt: 32 plan gjekk frå 493 ms til 2013 ms, og det
 * er arbeidaren på nytt for kvart tal du dreg i — på ein telefon.
 *
 * Difor vert stykket delt på AVVIKET og ikkje på eit tal: står midten av
 * kurva nærare korda enn `BOGE_TOL`, er korda kurva. Ein boge på ei tett
 * ribbe treng då to stykke der han fekk åtte, og eit hjørne som er runda på
 * ein lang kant får dei han treng.
 *
 * Toleransen er ein brøk av storleiken, som punkta sjølve: to tusendelar er
 * 0,3 mm på ein kropp på 150 og under ei celle i ruta konturen vert lesen
 * av. Djupna er eit tak mot ei kurve som ikkje vil konvergere — seksten
 * stykke er dobbelt så mange som det faste talet var, og dit kjem ein berre
 * på ein boge over ein heil kropp.
 */
const BOGE_TOL = 0.002
const BOGE_DJUP = 4
const bogePkt = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const t2 = t * t
  const t3 = t2 * t
  const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3)
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]
}
/** dei fire punkta stykket etter `i` vert rekna av */
const bogeFire = (o: readonly Pt[], rund: ReadonlySet<number>, i: number): [Pt, Pt, Pt, Pt] => {
  const n = o.length
  const j = (i + 1) % n
  return [rund.has(i) ? o[(i - 1 + n) % n] : o[i], o[i], o[j], rund.has(j) ? o[(j + 1) % n] : o[j]]
}
/**
 * Stykket delt i to til kurva og korda fell saman. `p1` vert lagt til, `p0`
 * ikkje: kvart punkt kjem éin gong, og det fyrste i stykket er alt lagt til.
 */
function bogeFlat(ut: Pt[], f: (t: number) => Pt, t0: number, t1: number, p0: Pt, p1: Pt, djup: number) {
  const tm = (t0 + t1) / 2
  const m = f(tm)
  if (djup >= BOGE_DJUP || Math.hypot(m[0] - (p0[0] + p1[0]) / 2, m[1] - (p0[1] + p1[1]) / 2) <= BOGE_TOL) {
    ut.push(p1)
    return
  }
  bogeFlat(ut, f, t0, tm, p0, m, djup + 1)
  bogeFlat(ut, f, tm, t1, m, p1, djup + 1)
}
export function omrissLine(omriss: readonly Pt[], runde?: readonly number[]): Pt[] {
  const n = omriss.length
  if (n < 3 || !runde?.length) return omriss.slice()
  const rund = new Set(runde)
  const ut: Pt[] = []
  for (let i = 0; i < n; i++) {
    ut.push(omriss[i])
    const j = (i + 1) % n
    if (!rund.has(i) && !rund.has(j)) continue
    const [a, b, c, d] = bogeFire(omriss, rund, i)
    const stykke: Pt[] = []
    bogeFlat(stykke, (t) => bogePkt(a, b, c, d, t), 0, 1, omriss[i], omriss[j], 0)
    // endepunktet er neste omgang sitt fyrste punkt
    stykke.pop()
    for (const q of stykke) ut.push(q)
  }
  return ut
}
/**
 * MIDT PÅ STYKKET ETTER `i`, PÅ KURVA og ikkje på korda.
 *
 * Det er her midtmerket står og der punktet det lagar hamnar. Stod merket
 * på korda, ville det liggje av garde frå den kanten det høyrer til so
 * snart stykket bogna — og punktet det la til ville rykt forma rett.
 */
export function omrissMidt(omriss: readonly Pt[], rund: ReadonlySet<number>, i: number): Pt {
  const n = omriss.length
  const j = (i + 1) % n
  if (!rund.has(i) && !rund.has(j)) return [(omriss[i][0] + omriss[j][0]) / 2, (omriss[i][1] + omriss[j][1]) / 2]
  const [a, b, c, d] = bogeFire(omriss, rund, i)
  return bogePkt(a, b, c, d, 0.5)
}

/**
 * OMRISSET INN, FRÅ EI LENKJE KVEN SOM HELST KAN HA SKRIVE.
 *
 * Eit ODDETAL av tal er ikkje punkt; eit punkt langt utanfor kroppen er
 * ikkje eit punkt handa sette; under tre punkt er det inga flate. Alt slikt
 * fell på golvet og planet står att utan omriss — det er framleis eit
 * gyldig plan, og profilen kjem frå kroppen som han alltid har gjort.
 */
const lesOmriss = (s: string): Pt[] | null => {
  const v = s.split(",").map(Number)
  if (v.length < 6 || v.length % 2 !== 0 || !v.every(Number.isFinite)) return null
  const ut: Pt[] = []
  for (let i = 0; i + 1 < v.length && ut.length < OMRISS_TAK; i += 2) {
    if (Math.abs(v[i]) > 2 || Math.abs(v[i + 1]) > 2) return null
    ut.push([+v[i].toFixed(4), +v[i + 1].toFixed(4)])
  }
  if (ut.length < 3) return null
  // Ei mangekant utan flate er ingen profil: tre punkt på ei line, eller
  // seks komma på rad frå ei lenkje som prøver seg. Talet er ein brøk av
  // storleiken i andre, so det er ein promille av kroppen i kvadrat.
  return Math.abs(shoelace(ut)) > 1e-6 ? ut : null
}

/**
 * BOGANE INN. Plassar i omrisset, so alt som ikkje er eit heiltal innanfor
 * lista fell bort — og eit omriss utan bogar er berre hjørne, som før.
 */
const lesRunde = (s: string, n: number): number[] => {
  const v = s.split(",").map(Number)
  const ut = [...new Set(v.filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b)
  return ut
}

export function lesPlan(s: unknown): Plan[] {
  const ut: Plan[] = []
  if (typeof s !== "string" || !s) return ut
  const sett = new Set<number>()
  for (const bit of s.split(";")) {
    if (ut.length >= PLAN_TAK) break
    const [hovud, ...rest] = bit.split("/")
    const m = /^(\d{1,5})@(.*)$/.exec(hovud)
    if (!m || rest.length < 1) continue
    const id = Number(m[1])
    // Same namnet to gonger er to delar med same gravering, og det er
    // verre enn ingen: du finn ut av det med ei plate som ikkje passar.
    if (id < 1 || sett.has(id)) continue
    const o = lesVec(m[2])
    const n0 = lesVec(rest[0])
    if (!o || !n0 || len3(n0) < 1e-6) continue
    // Eit punkt langt utanfor boksen er eit plan som ikkje råkar kroppen.
    if (o.some((c) => c < -0.5 || c > 1.5)) continue
    const n = norm3(n0).map((c) => +c.toFixed(4)) as Vec3
    const strek: Strek[] = []
    let bog = 0
    let gruppe = 0
    let farge = 0
    let firkant = false
    let mjuk = 0
    let omriss: Pt[] | null = null
    let runde = ""
    for (const r of rest.slice(1)) {
      // laget: eit av dei handa får merkje med, elles ikkje noko lag
      const c = /^c:(\d{1,2})$/.exec(r)
      if (c) {
        farge = lagFarge(Number(c[1])) ?? 0
        continue
      }
      // gruppa: eit heiltal over null, elles inga gruppe
      const g = /^g:(\d{1,5})$/.exec(r)
      if (g) {
        gruppe = Number(g[1])
        continue
      }
      // bøyen står før streka og ber sitt eige teikn, so han ikkje kan
      // lesast som eit av dei
      const b = /^b:(-?[\d.]+)$/.exec(r)
      if (b) {
        const v = Number(b[1])
        if (Number.isFinite(v)) bog = Math.max(-BOG_TAK, Math.min(BOG_TAK, +v.toFixed(4)))
        continue
      }
      // firkanten er eit merke og ikkje eit tal: han står eller han står ikkje
      if (r === "f:1") {
        firkant = true
        continue
      }
      // mjukinga: ein brøk over null, klemt til taket
      const mj = /^m:([\d.]+)$/.exec(r)
      if (mj) {
        const v = Number(mj[1])
        if (Number.isFinite(v)) mjuk = Math.max(0, Math.min(MJUK_TAK, +v.toFixed(4)))
        continue
      }
      // omrisset: punkta på rad. Står det to i same planet, er det det
      // siste som gjeld — som for alle dei andre merka her.
      const om = /^p:([\d.,-]+)$/.exec(r)
      if (om) {
        omriss = lesOmriss(om[1]) ?? omriss
        continue
      }
      // bogane: rå her, av di dei berre tyder noko saman med omrisset, og
      // det kan stå etter dei i strengen
      const bg = /^r:([\d,]+)$/.exec(r)
      if (bg) {
        runde = bg[1]
        continue
      }
      if (strek.length >= STREK_TAK) break
      const st = lesStrek(r)
      if (!st) continue
      strek.push(st)
    }
    sett.add(id)
    const rd = omriss && runde ? lesRunde(runde, omriss.length) : []
    ut.push({ id, o: o.map((c) => +c.toFixed(4)) as Vec3, n, bog, ...(firkant ? { firkant: true as const } : {}), ...(mjuk ? { mjuk } : {}), ...(omriss ? { omriss } : {}), ...(rd.length ? { runde: rd } : {}), strek, ...(gruppe ? { gruppe } : {}), ...(farge ? { farge } : {}) })
  }
  return ut
}

/** neste gruppenamn: eitt over det største som finst, aldri brukt om att */
export const nyGruppe = (l: readonly Plan[]) => l.reduce((m, p) => Math.max(m, p.gruppe ?? 0), 0) + 1
/** plana i ei gruppe, i namnerekkjefylgje — det er rekkja i rada */
export const iGruppa = (l: readonly Plan[], g: number) => l.filter((p) => p.gruppe === g).sort((a, b) => a.id - b.id)
/**
 * KOR MYKJE KVART PLAN I RADA SKAL TA av det leiaren fekk. Saman: alle
 * tek alt. Fordelt: det fyrste står, leiaren tek alt, og dei imellom tek
 * sin del av vegen — so ei dreiing på leiaren vert ei vifte over rada, og
 * eit skuv vert ei jamn endring av mellomrommet. Står leiaren fyrst, er
 * det den andre enden som står. Plan forbi leiaren tek meir enn alt: dreg
 * du det tredje av seks, går det sjette dobbelt so langt, og rada er
 * framleis jamn.
 */
export function delAv(rad: readonly Plan[], leiar: number, fordel: boolean): Map<number, number> {
  const m = new Map<number, number>()
  const L = rad.findIndex((p) => p.id === leiar)
  const N = rad.length
  rad.forEach((p, k) => {
    if (!fordel || N < 2 || L < 0) m.set(p.id, 1)
    else if (L > 0) m.set(p.id, k / L)
    else m.set(p.id, (N - 1 - k) / (N - 1))
  })
  return m
}

/** ein streng inn, den same lista ut i normalform */
export const reinPlan = (s: unknown) => skrivPlan(lesPlan(s))

/** det neste namnet som aldri har vore i bruk i denne lista */
export const nyId = (l: readonly Plan[]) => l.reduce((m, p) => Math.max(m, p.id), 0) + 1

// =============================================================================
// RUTENETTET — eit framlegg, ikkje reiskapen
// =============================================================================
/**
 * Ribber på tvers av x og y, jamt fordelte: (i + ½) / n, i CELLESENTER og
 * ikkje på cellekantar. Ei ribbe på kanten av omrisset er ei ribbe med null
 * breidd: ho ville telje som ein del og ikkje bera noko.
 *
 * Det er det gamle svaret, og det er framleis eit godt fyrste gjett — men
 * det er eit framlegg du kan ta heilt, ta tre plan av, eller la liggje.
 * Namna byrjar der lista alt sluttar, so eit framlegg lagt oppå det du har
 * bygd tek ikkje namn frå det.
 */
/**
 * SPEGELBILETET AV EIT SNITT, om midtplanet i kroppen.
 *
 * Planet står som brøkdelar av boksen kring kroppen (sjå toppen av fila),
 * so midten er ein halv på kvar akse: eit spegl om x er `o.x → 1 − o.x` og
 * `n.x → −n.x`. Ingen geometri vert rørt og ingen kropp lesen — det er det
 * same snittet, teke frå hi sida.
 *
 * Normalen SNUR, og det er ikkje ein detalj: (u, v, n) er høgrehendt, so ei
 * snudd normal snur ramma og profilen kjem spegelvend på plata. Det er nett
 * det ein spegel skal gjere. Ei plate og spegelbiletet hennar er to ulike
 * delar når forma ikkje er symmetrisk, og graveringa skal stå rett veg på
 * begge.
 *
 * Punktet og normalen, og ikkje eit heilt plan: eit strek ligg i planet si
 * eiga ramme, og ei spegling som snur ramma måtte ha snudd streket med. Det
 * er ei rekning denne funksjonen ikkje gjer, so ho lovar det ikkje heller.
 */
export function spegla(o: Vec3, n: Vec3, akse: number): { o: Vec3; n: Vec3 } {
  const o2 = [...o] as Vec3
  const n2 = [...n] as Vec3
  o2[akse] = +(1 - o[akse]).toFixed(4)
  n2[akse] = -n[akse] === 0 ? 0 : -n[akse]
  return { o: o2, n: n2 }
}

/**
 * Undermengdene av dei valde aksane, identiteten fyrst. `sp` er tre
 * brytarar i eitt tal (1 er x, 2 er y, 4 er z), og kvar av dei doblar
 * lista: x åleine gjev to snitt, x og y gjev fire.
 */
export function speglingar(sp: number): number[][] {
  let ut: number[][] = [[]]
  for (let a = 0; a < 3; a++) if (sp & (1 << a)) ut = ut.flatMap((q) => [q, [...q, a]])
  return ut
}

/**
 * To snitt er det same snittet når punktet og planet fell saman. Normalen
 * tel med FORTEIKN OG UTAN: eit plan gjennom midten, på tvers av den aksen
 * du speglar om, vert seg sjølv med normalen snudd — og det er éin del og
 * ikkje to.
 */
export function sameSnitt(a: { o: Vec3; n: Vec3 }, b: { o: Vec3; n: Vec3 }, tol = 1e-3): boolean {
  for (let i = 0; i < 3; i++) if (Math.abs(a.o[i] - b.o[i]) > tol) return false
  const same = a.n.every((c, i) => Math.abs(c - b.n[i]) <= tol)
  const motsett = a.n.every((c, i) => Math.abs(c + b.n[i]) <= tol)
  return same || motsett
}

/**
 * VIRVELEN: n ribber kring loddaksen, kvar tangent til ein sirkel.
 *
 * Rutenettet er det eine ribbespråket møblane snakkar; dette er det andre.
 * Kvar ribbe står loddrett, vridd `2π·i/n` kring z, og SKOVEN UT frå aksen
 * so ho tek på ein sirkel med radius `r` i staden for å gå gjennom midten.
 * Det er skuvet som gjer det til ein virvel: går alle gjennom aksen, kryssar
 * dei kvarandre langs den same lina, og tjue plan vart to delar og seks og
 * tretti lause stykke då det vart målt.
 *
 * `r` ER EIN BRØK AV DEN SMALASTE VIDDA, og det er ikkje det same som ein
 * brøk av boksen. Punktet i eit plan er brøkar av boksen, og boksen er ikkje
 * kvadratisk: `o = [0.5 + r·cos a, 0.5 + r·sin a]` gjev ein ELLIPSE i
 * millimeter, ikkje ein sirkel. Målt på ein kropp på 450×180 mm sprikte
 * avstanden frå aksen mellom 32,4 og 81,0 mm — to og ein halv gong — og
 * virvelen stod skeiv. Difor vert kvar akse delt på si eiga vidd, og då
 * står han på 64,8 mm heile vegen rundt. På ein rund kropp er dei to
 * rekningane den same; det er berre den skeive kroppen som skil dei.
 *
 * VIDDA VERT BAKA INN, og det er med vilje. Plana er brøkar, so virvelen
 * fylgjer kroppen når han vert skalert — men endrar du FORMA på kroppen
 * etterpå, står ribbene der du la dei og kan drive ut av lag. Det er det
 * same valet som streken i eit plan tek (sjå toppen av fila): reiskapen
 * kastar ikkje arbeid utan å bli beden, og du køyrer verktyet om att.
 */
/** ein virvel er éi gruppe: ribbene kring aksen svarar saman */
export function virvel(n: number, r: number, vidd: readonly [number, number], fraa = 1): Plan[] {
  const W = Math.max(1e-6, vidd[0])
  const D = Math.max(1e-6, vidd[1])
  const d = r * Math.min(W, D)
  const ut: Plan[] = []
  let id = fraa
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const nv: Vec3 = [+Math.cos(a).toFixed(4), +Math.sin(a).toFixed(4), 0]
    ut.push({
      id: id++,
      o: [+(0.5 + (d * nv[0]) / W).toFixed(4), +(0.5 + (d * nv[1]) / D).toFixed(4), 0.5],
      n: nv,
      bog: 0, strek: [], gruppe: 1,
    })
  }
  return ut
}

/** eit rutenett er to grupper: rada på tvers og rada på langs, kvar si rekkje */
export function rutenett(nx: number, ny: number, fraa = 1, gFraa = 1): Plan[] {
  const ut: Plan[] = []
  let id = fraa
  for (let i = 0; i < nx; i++) {
    ut.push({ id: id++, o: [(i + 0.5) / nx, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [], gruppe: gFraa })
  }
  for (let j = 0; j < ny; j++) {
    ut.push({ id: id++, o: [0.5, (j + 0.5) / ny, 0.5], n: [0, 1, 0], bog: 0, strek: [], gruppe: nx ? gFraa + 1 : gFraa })
  }
  return ut
}

/**
 * KVA AV LISTA ER RUTENETTET, OG KVA ER DITT.
 *
 * Verktyet skreiv lista OM: eit rutenett var ei liste og ikkje eit tillegg,
 * so ti plan du hadde sett for hand var borte i det du tok i han. Det er
 * feil veg av same grunn som alt anna her — reiskapen kastar ikkje arbeid
 * utan å bli beden.
 *
 * So verktyet må vite kva som er hans. Han eig dei plana eit rutenett VILLE
 * LAGA, kjende att på geometrien og ingenting anna: normalen langs x eller
 * y, punktet i midten på dei to andre aksane, og dei n punkta jamt fordelte
 * på (i + ½)/n. Ingen bøy, ingen strek, ikkje noko lag — eit plan du har
 * arbeidd i er ditt, kvar det so står.
 *
 * KJENNEMERKET ER GEOMETRIEN og ikkje eit flagg i strengen. Eit flagg måtte
 * skrivast, lesast og tolast, og det ville vore ein ny ting i lenkja som
 * seier noko om eit VERKTY og ikkje om eit plan. Geometrien seier det same,
 * ho står alt i strengen, og ho held for ei lenkje frå i fjor.
 *
 * ALT ELLER INGENTING PER AKSE. Rada langs x er eit rutenett berre om HEILE
 * rada er det: flyttar du ei ribbe ut av rekkja, er ho di, og då er dei
 * andre i rada det òg — dei er ikkje lenger eit rutenett med n ribber. Då
 * held verktyet fram frå null på den aksen og legg sitt oppå.
 */
const naerNok = (a: number, b: number) => Math.abs(a - b) < 1e-3
/** ei rad er eit rutenett berre om alle n punkta står på kvar sin (i + ½)/n */
function radStaar(rad: readonly Plan[], akse: 0 | 1): boolean {
  const n = rad.length
  if (!n) return false
  const brukt = new Set<number>()
  for (const q of rad) {
    const i = Math.round(q.o[akse] * n - 0.5)
    if (i < 0 || i >= n || brukt.has(i) || !naerNok(q.o[akse], (i + 0.5) / n)) return false
    brukt.add(i)
  }
  return true
}

export function skilRute(l: readonly Plan[]): { rute: Plan[]; andre: Plan[]; nx: number; ny: number } {
  const rein = (q: Plan) => !q.bog && q.strek.length === 0 && !q.farge
  const kx = l.filter((q) => rein(q) && Math.abs(q.n[0]) > 0.999 && naerNok(q.o[1], 0.5) && naerNok(q.o[2], 0.5))
  const ky = l.filter((q) => rein(q) && Math.abs(q.n[1]) > 0.999 && naerNok(q.o[0], 0.5) && naerNok(q.o[2], 0.5))
  const okx = radStaar(kx, 0)
  const oky = radStaar(ky, 1)
  const rute = [...(okx ? kx : []), ...(oky ? ky : [])]
  const mine = new Set(rute.map((q) => q.id))
  return { rute, andre: l.filter((q) => !mine.has(q.id)), nx: okx ? kx.length : 0, ny: oky ? ky.length : 0 }
}
