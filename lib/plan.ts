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
 * PUNKT PER PLAN, over alle banene hans.
 *
 * Ein boks er fem tal og tri og førti teikn same kva du gjer med han, so
 * `STREK_TAK` heldt strengen nede av seg sjølv. Ein bane er so mange tal
 * som handa gav han, og då er det punkta som må teljast. Seks og nitti er
 * seks til ti verkelege merke på éi plate etter at handa er tynna ut, og
 * ei liste på fire og seksti plan som framleis går i ei lenkje.
 *
 * Ein bane som ville gå over taket vert forkasta HEIL og aldri kappa: ein
 * kappa bane er ei anna lukka form, og geometri som er stille ulik er
 * verre enn geometri som manglar.
 */
export const PUNKT_TAK = 96
/** og eitt segment lenger enn dette er ikkje eit merke, det er ei lenkje som prøver seg */
const BANE_TEIKN = 1600

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
export type Strek =
  | {
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
  | {
      slag: "gods" | "hol"
      /**
       * BANEN: eit merke handa drog, ei broten line med ei breidd.
       *
       * Ein boks og ein ellipse er former du set; banen er ei rørsle du
       * gjorde. Det er han som gjer konturen til noko du kan forme på:
       * vel ei plate, dra ein finger, og plata vert skoren om att med
       * merket i seg. Med minus er han ei sag — han skil ikkje gods du la
       * til frå gods nettet gav deg, og eit merke tvers over ei plate
       * deler henne i to delar.
       *
       * Han ber punkta sine og ikkje ein boks med ein vinkel: ei line har
       * si eiga retning, og eit vinkelfelt attåt ville vera ein annan
       * måte å seie det same på — og dei to ville drive frå kvarandre
       * fyrste gong nokon flytte eit punkt.
       */
      form: "bane"
      /** pennebreidda, same eining som resten: ein brøkdel av storleiken */
      br: number
      /** punkta på rad — [x0, y0, x1, y1, …] — i planet si ramme */
      p: number[]
    }

export type Plan = {
  /** namnet som vert gravert. Eit tal, gjeve ved låsing, aldri brukt om att. */
  id: number
  /** eit punkt i planet, som brøkdelar av boksen kring kroppen */
  o: Vec3
  /** einingsnormalen, i kroppen sitt rom */
  n: Vec3
  strek: Strek[]
}

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
export type Ramme = { o: Vec3; n: Vec3; u: Vec3; v: Vec3 }

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

export function ramme(pl: { o: Vec3; n: Vec3 }, min: Vec3, max: Vec3): Ramme {
  const n = norm3(pl.n)
  const o: Vec3 = [
    min[0] + pl.o[0] * (max[0] - min[0]),
    min[1] + pl.o[1] * (max[1] - min[1]),
    min[2] + pl.o[2] * (max[2] - min[2]),
  ]
  return { o, n, ...akser(n) }
}

/** frå planet si ramme ut i rommet, `off` millimeter langs normalen */
export const ut = (r: Ramme, q: Pt, off = 0): Vec3 => [
  r.o[0] + q[0] * r.u[0] + q[1] * r.v[0] + off * r.n[0],
  r.o[1] + q[0] * r.u[1] + q[1] * r.v[1] + off * r.n[1],
  r.o[2] + q[0] * r.u[2] + q[1] * r.v[2] + off * r.n[2],
]

/** frå rommet inn i planet si ramme — komponenten langs normalen fell bort */
export const inn = (r: Ramme, p: Vec3): Pt => {
  const d = sub3(p, r.o)
  return [dot(d, r.u), dot(d, r.v)]
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

/**
 * Ein bane skil punkta sine med understrek og ikkje komma. Komma er
 * reservert i ei adresse og kostar tri teikn kvar; understrek kostar eitt.
 * På eit merke med førti punkt er det seks hundre teikn mot sju hundre og
 * seksti i lenkja — ein femdel, for eitt teikn som er uvant å sjå. Alle
 * skiljeteikna UTANFOR banen står som dei stod.
 */
const skrivStrek = (s: Strek) =>
  s.form === "bane"
    ? `${s.slag === "gods" ? "+" : "-"}b:${[s.br, ...s.p].map(tal4).join("_")}`
    : `${s.slag === "gods" ? "+" : "-"}${s.form === "rekt" ? "r" : "o"}:${[s.x, s.y, s.w, s.h, s.a].map(tal4).join(",")}`

export function skrivPlan(l: readonly Plan[]): string {
  return l
    .map((p) => [`${p.id}@${vec(p.o)}/${vec(p.n)}`, ...p.strek.map(skrivStrek)].join("/"))
    .join(";")
}

const lesVec = (s: string): Vec3 | null => {
  const v = s.split(",").map(Number)
  if (v.length !== 3 || !v.every(Number.isFinite)) return null
  return [v[0], v[1], v[2]]
}

/**
 * EIN BANE INN FRÅ EI LENKJE.
 *
 * Dei andre streka har fem tal og ei fast lengd; denne har ei hale nokon
 * annan har skrive. Difor står LENGDA FYRST, før splittinga: eit segment
 * som aldri vert delt kostar ingenting, medan ein million koordinatar delt
 * fyrst og forkasta etterpå kostar alt — og eit ugyldig segment brukar
 * korkje `STREK_TAK` eller punktbudsjettet, so utan ei O(1)-port kunne éi
 * lenkje sende so mange den ville og betale null. Eit lovleg merke på seks
 * og nitti punkt er under femten hundre teikn.
 *
 * Så vert alt RUNDA før noko vert prøvd, av di det er dei runda tala som
 * vert skrivne attende: `reinPlan(reinPlan(s))` er `reinPlan(s)`, og
 * `MOTOR.clamp` køyrer `reinPlan` på kvar einaste endring.
 *
 * Alt som ikkje går opp fell på golvet HEILT — aldri klipt, aldri kappa.
 * Planet og dei andre streka hans står.
 */
function lesBane(slag: "gods" | "hol", raa: string, att: number): Strek | null {
  if (raa.length > BANE_TEIKN) return null
  const v = raa.split("_").map(Number)
  // breidda og minst to punkt, og punkta går i par
  if (v.length < 5 || v.length % 2 === 0 || !v.every(Number.isFinite)) return null
  const br = +v[0].toFixed(4)
  if (!(br > 0) || br > 2) return null
  const p: number[] = []
  let sx = NaN
  let sy = NaN
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 1; i + 1 < v.length; i += 2) {
    const x = +v[i].toFixed(4)
    const y = +v[i + 1].toFixed(4)
    // Eit punkt langt utanfor kroppen er ikkje eit merke på henne.
    if (Math.abs(x) > 2 || Math.abs(y) > 2) return null
    // To like punkt etter kvarandre er ikkje eit segment: rundinga over
    // er der dei kjem frå, og eit segment utan lengd er ei rekning på
    // null delt på null.
    if (x === sx && y === sy) continue
    sx = x
    sy = y
    p.push(x, y)
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  // eitt punkt er ikkje ei line
  if (p.length < 4) return null
  // Ruta i `snitt.ts` veks til det streka krev og vert so klipt ved 520
  // celler; ein bane sin boks er sameininga av ALLE punkta hans, so han
  // sprengjer henne mykje lettare enn eit rektangel.
  if (x1 - x0 > 2 || y1 - y0 > 2) return null
  if (p.length / 2 > att) return null
  return { slag, form: "bane", br, p }
}

const lesStrek = (s: string, att: number): Strek | null => {
  const m = /^([+-])([rob]):(.*)$/.exec(s)
  if (!m) return null
  const slag = m[1] === "+" ? "gods" : "hol"
  if (m[2] === "b") return lesBane(slag, m[3], att)
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
    let att = PUNKT_TAK
    for (const r of rest.slice(1)) {
      if (strek.length >= STREK_TAK) break
      const st = lesStrek(r, att)
      if (!st) continue
      strek.push(st)
      if (st.form === "bane") att -= st.p.length / 2
    }
    sett.add(id)
    ut.push({ id, o: o.map((c) => +c.toFixed(4)) as Vec3, n, strek })
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

export function rutenett(nx: number, ny: number, fraa = 1): Plan[] {
  const ut: Plan[] = []
  let id = fraa
  for (let i = 0; i < nx; i++) {
    ut.push({ id: id++, o: [(i + 0.5) / nx, 0.5, 0.5], n: [1, 0, 0], strek: [] })
  }
  for (let j = 0; j < ny; j++) {
    ut.push({ id: id++, o: [0.5, (j + 0.5) / ny, 0.5], n: [0, 1, 0], strek: [] })
  }
  return ut
}
