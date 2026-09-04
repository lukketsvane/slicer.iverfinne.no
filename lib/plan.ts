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
import type { Pt, Vec3 } from "./core"

/** Fleire plan enn dette er ikkje eit prosjekt, det er ei lenkje som prøver seg. */
export const PLAN_TAK = 64
/** og fleire strek på eitt plan er ikkje ei redigering */
export const STREK_TAK = 24

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
  strek: Strek[]
}

/** Meir enn dette er ikkje ein bøy, det er eit rør. Regelen om materialet
 *  klemmer hardare enn dette lenge før du kjem hit. */
export const BOG_TAK = 4

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

export function skrivPlan(l: readonly Plan[]): string {
  return l
    .map((p) =>
      [`${p.id}@${vec(p.o)}/${vec(p.n)}`, ...(p.bog ? [`b:${+p.bog.toFixed(4)}`] : []), ...p.strek.map(skrivStrek)].join("/"),
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
    for (const r of rest.slice(1)) {
      // bøyen står før streka og ber sitt eige teikn, so han ikkje kan
      // lesast som eit av dei
      const b = /^b:(-?[\d.]+)$/.exec(r)
      if (b) {
        const v = Number(b[1])
        if (Number.isFinite(v)) bog = Math.max(-BOG_TAK, Math.min(BOG_TAK, +v.toFixed(4)))
        continue
      }
      if (strek.length >= STREK_TAK) break
      const st = lesStrek(r)
      if (!st) continue
      strek.push(st)
    }
    sett.add(id)
    ut.push({ id, o: o.map((c) => +c.toFixed(4)) as Vec3, n, bog, strek })
  }
  return ut
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
      bog: 0, strek: [],
    })
  }
  return ut
}

export function rutenett(nx: number, ny: number, fraa = 1): Plan[] {
  const ut: Plan[] = []
  let id = fraa
  for (let i = 0; i < nx; i++) {
    ut.push({ id: id++, o: [(i + 0.5) / nx, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [] })
  }
  for (let j = 0; j < ny; j++) {
    ut.push({ id: id++, o: [0.5, (j + 0.5) / ny, 0.5], n: [0, 1, 0], bog: 0, strek: [] })
  }
  return ut
}
