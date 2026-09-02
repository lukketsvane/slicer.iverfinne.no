/**
 * SLICERMAN — framlegga: rutenettet og det lange søket.
 *
 * Ein som slepper ei fil på sida veit kor stort objektet skal vera og kva
 * plate han har. Han veit ikkje kor mange plan nett den forma toler, eller
 * kva som får delane ned på plata. Det er ikkje kunnskap han manglar, det
 * er ei rekning — so her vert ho rekna og ikkje gjetta på: kvar kandidat
 * vert snitta for alvor, med ledd, delar og pakking, og vurdert på det som
 * kom ut.
 *
 * DET SOM KJEM UT ER EIT FRAMLEGG, IKKJE EIT SVAR. Rutenettet var
 * reiskapen: to tal, og alt fylgde. No er det ei liste over plan du kan ta
 * heilt, ta tre av, eller la liggje — ein `plan`-streng som BYTER UT lista
 * du har, namna frå 1, og handa tek over. Rangeringa, færrast delar som
 * ber mest av forma, er verd å ha med. Å avgjera for deg er det ikkje.
 *
 * EIT FRAMLEGG RØRER PLANA, og ikkje noko anna. Storleiken er DIN, tjukna
 * er plata du har, klaringa er målt med passprøva, snittet er maskina di
 * og plata er bordet ditt; eit framlegg som endra dei har bytt ut
 * spørsmålet. So òg leddelinga: før prøvde søket henne som redning når
 * godset vart tynt, no står framlegget heller med «held ikkje» på seg, og
 * regelen om gods ber sitt eige råd. «Best» er ikkje eit tal: fyrste
 * trykket er det beste, neste det nest beste, og somme tider er det det du
 * ville hatt. Eit trykk er det raske søket, eit dusin rutenett som plar
 * vera greie; eit langt trykk er djupsøket, som spør kva DENNE FORMA treng.
 */
import type { Metrics } from "./core"
import { makeBygg } from "./bygg"
import { makeKropp } from "./kropp"
import { measure } from "./metrics"
import { rutenett, skrivPlan } from "./plan"
import { checkRules } from "./rules"
import { DETAIL } from "./snitt"
import { maalProfil, plateoverslag, truskap, type Profil } from "./profil"
import type { Params } from "./params"

export type Kandidat = {
  /** plana, som strengen `params.plan` tek. Det er dette framlegget ER. */
  plan: string
  /** «6×4» */
  namn: string
  nx: number
  ny: number
  delar: number
  ark: number
  ledd: number
  /** stykke som fall av — lause, eller kasta. Stykke av forma du ikkje
   *  får, og fronten tel dei. */
  lause: number
  /** kor mykje av forma plana ber, 0..1 — sjå `profil.ts`. Berre
   *  djupsøket reknar han; det raske lèt han stå på null. */
  tro: number
  /** Held dei harde reglane. Før fanst ikkje ein kandidat som braut dei;
   *  no er han eit framlegg med grunnen synleg, bakerst i lista og utanfor
   *  fronten. Eit framlegg du kan sjå og avvise er verdt meir enn eitt du
   *  aldri fekk sjå. */
  held: boolean
  /** kor godt framlegget svarar på oppgåva, høgare er betre */
  poeng: number
  /** Står han i fronten — er det ingen som slår han på ALT? Djupsøket gjev
   *  hundre svar, og på ein telefon bladar du dei eitt om gongen; utan
   *  merket bladar du forbi det siste som kunne vore det. Det raske søket
   *  reknar ikkje form, og utan henne finst ingen front: der står alle som
   *  `true`, og merket seier ingenting — som det skal. Sjå `front`. */
  fremst: boolean
}

/** eitt rutenett å snitte for alvor, med truskapen profilen las av det */
export type Oppgave = { nx: number; ny: number; tro: number }

/** tala som rangerer, lesne av målinga */
type Maal = Pick<Metrics, "parts" | "sheets" | "joints" | "util" | "minGap" | "loose">

/** rutenetta søket ser på: frå to plan per akse til to og tretti */
const FAA = 2
const MANGE = 32

// =============================================================================
// DET RASKE SØKET
// =============================================================================
/**
 * Kandidatane som er verde å rekne på. Avstanden mellom plana avgjer om
 * noko er eit rutenett: under fire platetjukner ein kloss med riller, over
 * ein tredel av objektet eit skjelett du kan putte handa gjennom. Difor
 * vert dei valde på AVSTANDEN og ikkje på talet — ni avstandar jamt over
 * bandet, og talet i kvar retning fylgjer av objektet sitt mål; tre plan
 * den eine vegen og fjorten den andre er ein kam, ikkje eit rutenett.
 * Attpå fire skeive, eit steg opp eller ned i éi retning: somme former
 * vil ha det, og eit søk som berre ser det symmetriske finn dei aldri.
 * Tretten snittingar er kring to sekund — so lenge ventar nokon på ein knapp.
 */
function kandidatar(p: Params, spennX: number, spennY: number): [number, number][] {
  const minPitch = Math.max(p.tjukn * 4, p.tjukn + 6)
  const maxPitch = Math.max(minPitch * 1.2, Math.min(spennX, spennY) / 3)
  const tal = (spenn: number, pitch: number) => Math.max(FAA, Math.min(24, Math.round(spenn / pitch)))
  const alle: [number, number][] = []
  const N = 9
  for (let i = 0; i < N; i++) {
    const pitch = minPitch * (maxPitch / minPitch) ** (i / (N - 1))
    alle.push([tal(spennX, pitch), tal(spennY, pitch)])
  }
  const midt = Math.sqrt(minPitch * maxPitch)
  const mx = tal(spennX, midt)
  const my = tal(spennY, midt)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) alle.push([Math.max(FAA, mx + dx), Math.max(FAA, my + dy)])
  return [...new Map(alle.map((q) => [q.join(), q])).values()]
}

/**
 * Kva som gjer eit uttak godt i det raske søket — alt lese av det som kom
 * ut, kvart ledd eit spørsmål frå eit laserbord. HELD DET SAMAN: ein del i
 * eitt ledd kan vri seg laus, to eller fleire er eit grep; det tyngste
 * leddet. DELAR: under seks er det ikkje eit rutenett, over seksti ein
 * kveld med pinsett — ei mjuk klokke kring tjue. PLATER: pengar og ei
 * oppspenning til; straffa veks og flatar ut, éi mot to merkast meir enn
 * nitten mot tjue. UTNYTTING: same plata, meir objekt. OPNING: under tre
 * millimeter kjem ikkje fingrane imellom. Brotne harde reglar er ikkje eit
 * trekk i summen — dei er `held`.
 */
function poengOf(p: Params, m: Maal): number {
  const perDel = m.parts > 0 ? m.joints / m.parts : 0
  let poeng = 40 * Math.min(1, perDel / 3)
  poeng += 22 * Math.exp(-(((m.parts - 20) / 22) ** 2))
  if (m.parts < 6) poeng -= 30
  if (m.parts > 70) poeng -= 25
  poeng -= 13 * (Math.max(1, m.sheets) - 1) ** 0.55
  poeng += 12 * Math.min(1, m.util / 0.6)
  if (m.minGap < 3) poeng -= 20
  else poeng += 6 * Math.min(1, m.minGap / (p.tjukn * 3))
  // Stykke som vart kasta er stykke av objektet du ikkje får.
  poeng -= Math.min(20, m.loose * 4)
  return poeng
}

// =============================================================================
// DJUPSØKET
// =============================================================================
/**
 * DET LANGE TRYKKET STILLER EIT ANNA SPØRSMÅL. Det raske søket spør kva
 * som plar vera greitt; djupsøket spør kva NETT DENNE FORMA treng — den
 * forma som liknar mest, på so få plater som råd. Då må det sjå på langt
 * fleire rutenett enn tretten, av di svaret ofte er skeivt: ein torus som
 * står har ein dramatisk profil den eine vegen og ein roleg den andre, og
 * eit søk som held retningane like tette finn han aldri.
 *
 * KORLEIS DET HAR RÅD TIL TUSEN: ikkje ved å snitte tusen gonger. Kroppen
 * vert MÅLT éin gong — `profil.ts` — og etterpå kostar det ei summering å
 * seie kor mykje av forma eit rutenett ber og kor mykje plate det tek;
 * heile tavla, 2×2 til 32×32, går på nokre millisekund. Det er eit
 * OVERSLAG og får ikkje siste ordet: det veit ingenting om ledd, harde
 * reglar eller kva pakkinga får til. So det vel kven som er verd ei
 * snitting, og snittinga tel. Eit vidt steg som er billig, eit smalt som
 * er sant.
 *
 * KVA DJUPSØKET MEINER ER BEST, vege på det du bad om då du heldt knappen
 * nede: FORMA er det tyngste leddet og det einaste nye; PLATENE tel tyngre
 * enn i det raske søket, du held ikkje knappen nede for det vanlege
 * svaret; GREPET er framleis eit krav, eit objekt som ikkje står liknar
 * ikkje på noko; ARBEIDET, kvart plan er ein kontur å skjere og eit stykke
 * å setje i. DET SISTE LEDDET GJER SØKET FERDIG: truskapen METTAR — dei
 * fyrste plana tek heile bein og øyre, dei siste krumninga på ein mage som
 * alt er der — og utan ein pris på arbeidet stogga søket fyrst når neste
 * plate vart naudsynt; på ein torus ni og tjue plan mot sytten, femti
 * delar meir og fire prosent betre form. Delar er difor ein PRIS og ikkje
 * ei klokke: djupsøket har inga meining om ein grei kveld, det nektar
 * berre å betale meir enn forma er verd, og prisen er lik for den
 * sekstiande som for den sjette — eit tak gjer dei finaste rutenetta
 * gratis der dei kostar mest. SAME VEKTA I BEGGE STEGA: det vide sender
 * overslag inn der det smale sender målingar. Ei prefiltrering som
 * rangerer på noko anna enn det som avgjer, siler bort vinnaren usedd.
 */
function djupPoeng(m: Maal, tro: number): number {
  const perDel = m.parts > 0 ? m.joints / m.parts : 0
  let poeng = 100 * tro
  poeng -= 30 * (Math.max(1, m.sheets) - 1) ** 0.7
  poeng += 14 * Math.min(1, m.util / 0.7)
  poeng += 30 * Math.min(1, perDel / 3)
  poeng -= 14 * (m.parts / 60)
  // Eit stykke som fall av er eit tap profilen ikkje ser: han måler kvar
  // planet står, ikkje kva som vart kasta etterpå.
  poeng -= Math.min(30, m.loose * 6)
  if (m.minGap < 3) poeng -= 20
  return poeng
}

/** kor godt ei plate plar verte fylt. Berre for overslaget — det verkelege
 *  talet kjem av pakkinga, og det er den som avgjer. */
const VENTA_UTNYTT = 0.55

/**
 * HEILE TAVLA, RANGERT PÅ OVERSLAG — og so FRONTEN av henne. Kvart rutenett
 * frå 2×2 til 32×32 med den SAME vekta som avgjer til slutt, men på
 * overslag: truskapen er lesen av profilen og like sann her som seinare;
 * platene er plateforbruket delt på ei plate med venta utnytting; ledda
 * eitt per kryss; delane nx + ny, som er golvet; luka stigninga minus ei
 * platetjukn.
 *
 * SPØRSMÅLET ER «FÆRRAST DELAR SOM BER MEST AV FORMA», og det er ei front
 * og ikkje eit punkt: for kvart tal delar finst eit best rutenett. Båsen
 * er difor TALET PÅ DELAR, og i kvar bås står dei fire beste som er ulike
 * nok til å vera kvar sitt svar — 10×6 og 8×8 er to løysingar på seksten
 * delar, og pakkinga kan meine noko anna om dei enn overslaget. Budsjettet
 * går på tvers av båsane, fyrst den beste i kvar, so den nest beste: vert
 * det knapt, fell reservane og ikkje ein ende av fronten — svaret på «kva
 * får eg med tolv delar» skal ikkje forsvinne av di det finst mange svar
 * på «kva får eg med femti». Reservane er ikkje pynt: platetalet er eit
 * overslag, og utnyttinga og dei kasta stykka veit overslaget ingenting om.
 */
type Framlegg = { nx: number; ny: number; tro: number; poeng: number }

/** to rutenett som ligg dette nær kvarandre er det same svaret */
const naer = (a: Framlegg, b: Framlegg) => Math.abs(a.nx - b.nx) + Math.abs(a.ny - b.ny) < 3

/** Inn i båsen om han er betre enn det som står der ELLER er noko anna:
 *  nær ein betre er den same løysinga om att, nær ein dårlegare er den
 *  betre utgåva av han, og tek plassen. */
function leggI(b: Framlegg[], q: Framlegg, tak: number) {
  for (const r of b) if (r.poeng >= q.poeng && naer(r, q)) return
  for (let i = b.length - 1; i >= 0; i--) if (naer(b[i], q)) b.splice(i, 1)
  b.push(q)
  b.sort((x, y) => y.poeng - x.poeng)
  if (b.length > tak) b.length = tak
}

/** kor mange ulike svar kvar bås held */
const I_BAASEN = 4

function djupeKandidatar(
  p: Params,
  pr: Profil,
  s: { min: readonly number[]; max: readonly number[] },
  tak: number,
): Framlegg[] {
  const viddX = s.max[0] - s.min[0]
  const viddY = s.max[1] - s.min[1]
  const arkFlate = Math.max(1, p.arkB * p.arkH * VENTA_UTNYTT)

  // Plana langs x er dei same for kvart y-tal, so kvar akse vert rekna éin
  // gong og ikkje éin gong per rute — tavla er tusen ruter. Posisjonane er
  // lesne av `rutenett` sjølv: truskapen gjeld dei plana framlegget har.
  const troX: number[] = []
  const troY: number[] = []
  const flateX: number[] = []
  const flateY: number[] = []
  for (let n = FAA; n <= MANGE; n++) {
    const xs = rutenett(n, 0).map((q) => s.min[0] + q.o[0] * viddX)
    const ys = rutenett(0, n).map((q) => s.min[1] + q.o[1] * viddY)
    troX[n] = truskap(pr, "x", xs)
    troY[n] = truskap(pr, "y", ys)
    flateX[n] = plateoverslag(pr, xs, [])
    flateY[n] = plateoverslag(pr, [], ys)
  }

  const baas = new Map<number, Framlegg[]>()
  for (let nx = FAA; nx <= MANGE; nx++) {
    for (let ny = FAA; ny <= MANGE; ny++) {
      // plana langs x ber profilen langs x; snittet er kva heile nettet ber
      const tro = (troX[nx] + troY[ny]) / 2
      const m: Maal = {
        parts: nx + ny,
        sheets: Math.max(1, Math.ceil((flateX[nx] + flateY[ny]) / arkFlate)),
        joints: nx * ny,
        util: VENTA_UTNYTT,
        minGap: Math.min(viddX / nx, viddY / ny) - p.tjukn,
        loose: 0,
      }
      let b = baas.get(nx + ny)
      if (!b) baas.set(nx + ny, (b = []))
      leggI(b, { nx, ny, tro, poeng: djupPoeng(m, tro) }, I_BAASEN)
    }
  }

  // Rang for rang, færrast delar fyrst innanfor rangen. Budsjettet kappar
  // bakfrå, og bakerst står reservane.
  const delar = [...baas.keys()].sort((a, b) => a - b)
  const ut: Framlegg[] = []
  let brukt = 0
  for (let rang = 0; rang < I_BAASEN; rang++) {
    for (const d of delar) {
      const q = baas.get(d)?.[rang]
      if (!q) continue
      // Alltid minst éin: eit søk som ikkje har råd til noko har ikkje svart.
      if (ut.length && brukt + arbeid(q.nx, q.ny) > tak) return ut
      ut.push(q)
      brukt += arbeid(q.nx, q.ny)
    }
  }
  return ut
}

/**
 * KVA EI SNITTING KOSTAR, MÅLT: ein fast del og ein som veks, kroppen lesen
 * éin gong per PLAN og sporet skore éin gong per KRYSS. På det midtre
 * nivået med rask pakking tek ein kube på 6×6 140 ms og ei kule på 16×16
 * 330; lina gjennom dei er seksti pluss éin per plan og kryss, i
 * millisekund på maskina det vart målt på (på det grove nivået var ho førti
 * pluss ein halv). Eit budsjett som berre telde plan og kryss gjorde dei
 * fine rutenetta ti gonger dyrare enn dei er, og kappa fronten ved femti.
 */
const arbeid = (nx: number, ny: number) => 60 + 1.0 * (nx + ny + nx * ny)

/**
 * KOR MYKJE SNITTING DJUPSØKET HAR RÅD TIL, i `arbeid`. Tretti sekund på
 * ein benk er kring seksti rutenett snitta for alvor — fronten frå fire
 * delar og oppover, reserve i dei fyrste båsane; det du får for eit langt
 * trykk er at fronten er MÅLT. Eit skann er ikkje ein kube, kvart plan i
 * ein million trekantar kostar strålar gjennom heile nettet, so budsjettet
 * vert lese av nettet — og FØR fyrste snittinga: framdriftslina skal vera
 * sann frå fyrste meldinga, og ei line som ombestemmer seg er verre enn ingen.
 */
const djupTak = (tris: number) => (tris > 300000 ? 5000 : tris > 80000 ? 12000 : 30000)

/**
 * DJUPSØKET SINE OPPGÅVER: kroppen målt, tavla rangert, fronten med
 * reservane so langt budsjettet rekk. Målinga er det einaste steget som
 * ikkje er ei snitting — nokre titals millisekund — og står FØR fyrste
 * framdriftsmeldinga, so lina veit kor mange steg det vert. Kvar oppgåve er
 * ei snitting som ikkje treng vita om dei andre, so dei kan delast ut.
 */
export function djupOppgaver(
  p: Params,
  /** budsjettet, i `arbeid`. Prøvebenken set eit lite. */
  tak?: number,
): Oppgave[] {
  const k = makeKropp(p)
  const pr = maalProfil(k)
  return djupeKandidatar(p, pr, k.solid, tak ?? djupTak(k.soup.tris)).map(({ nx, ny, tro }) => ({ nx, ny, tro }))
}

/**
 * ÉI OPPGÅVE SNITTA FOR ALVOR: framlegget, eller null om ingen delar kom
 * ut — ingen delar er ikkje eit framlegg. Delar som ikkje får plass på
 * plata ER det; dei held berre ikkje. Midtre nivå og rask pakking: tala
 * som rangerer er dei same som målinga gjev, og vinnaren vert pakka for
 * alvor i det han vert teken. Festa vert sleppte — dei peikar på namn i ei
 * liste framlegget byter ut.
 */
export function prov(p: Params, o: Oppgave, djup: boolean): Kandidat | null {
  const plan = skrivPlan(rutenett(o.nx, o.ny))
  const q: Params = { ...p, plan, fest: "" }
  try {
    const bygg = makeBygg(q, DETAIL.mid, true)
    const m = measure(q, bygg)
    if (m.parts === 0) return null
    return {
      plan,
      namn: `${o.nx}×${o.ny}`,
      nx: o.nx,
      ny: o.ny,
      delar: m.parts,
      ark: m.sheets,
      ledd: m.joints,
      lause: m.loose,
      tro: o.tro,
      held: checkRules(q, m, bygg, false).every((r) => r.ok || !r.hard),
      poeng: djup ? djupPoeng(m, o.tro) : poengOf(q, m),
      // `rangert` set han: kven som står i fronten er eit spørsmål om heile lista.
      fremst: true,
    }
  } catch {
    // Ein kandidat som kastar er ein kandidat som ikkje finst.
    return null
  }
}

/**
 * FRONTEN: INGEN SOM ER SLEGEN PÅ ALT. Spørsmålet var færrast delar som
 * ber mest av forma på færrast plater, og eit svar med fleire delar, fleire
 * plater OG mindre form enn eit anna er ikkje eit svar på det, same kva
 * summen seier: summen veg òg grepet og utnyttinga, og dei kan løfte eit
 * rutenett forbi eit som er betre på alt du spurde om — på ei kule kom 9×4
 * fyrst med tretten delar og 86 % av forma, medan 6×6 hadde tolv delar og
 * meir form på like mange plater. Berre dei som held: eit framlegg som
 * bryt ein hard regel er ikkje eit svar, og skal ikkje slå eitt som er det.
 */
export function front(alle: readonly Kandidat[]): Kandidat[] {
  const slaar = (a: Kandidat, b: Kandidat) =>
    a.delar <= b.delar &&
    a.ark <= b.ark &&
    a.tro >= b.tro &&
    a.lause <= b.lause &&
    (a.delar < b.delar || a.ark < b.ark || a.tro > b.tro || a.lause < b.lause)
  const held = alle.filter((q) => q.held)
  return held.filter((b) => !held.some((a) => a !== b && slaar(a, b)))
}

/**
 * Dei sorterte, beste fyrst: dei som held før dei som ikkje gjer det, og i
 * djupsøket fronten før resten. Det fyrste svaret er aldri slege på alt,
 * og dei slegne står att å bla i — på ein kube er fronten eitt einaste
 * punkt, og ei liste på eitt er ein knapp som ikkje blar.
 */
export function rangert(alle: readonly Kandidat[], djup: boolean): Kandidat[] {
  const f = new Set(djup ? front(alle) : alle)
  for (const q of alle) q.fremst = f.has(q)
  const rang = (q: Kandidat) => (q.held ? 0 : 2) + (q.fremst ? 0 : 1)
  return [...alle].sort((a, b) => rang(a) - rang(b) || b.poeng - a.poeng)
}

/**
 * Søket, eitt steg om gongen. HAN GJEV FRÅ SEG STYRINGA MELLOM KVAR
 * KANDIDAT, og det er ikkje pynt: ei melding frå ein arbeidar midt i ei
 * lang rekning kjem ikkje fram før han er ferdig, so tolv meldingar sende
 * inni lykkja landa alle i same augeblinken som svaret. Difor ein generator
 * — den som driv han vel sjølv å sleppe tråden. Det beste so langt fylgjer
 * kvart steg, sortert: den som stoggar midt i skal ha det som er funne.
 * `djup` byter ut LISTA og VEKTA, ikkje noko anna.
 */
export function* tuneSteg(
  p: Params,
  djup = false,
  /** budsjettet for djupsøket, i `arbeid`. Prøvebenken set eit lite. */
  tak?: number,
): Generator<{ gjort: number; av: number; alle: Kandidat[] }, Kandidat[], void> {
  let liste: Oppgave[]
  if (djup) {
    liste = djupOppgaver(p, tak)
  } else {
    const k = makeKropp(p)
    const spennX = Math.max(1, k.solid.max[0] - k.solid.min[0])
    const spennY = Math.max(1, k.solid.max[1] - k.solid.min[1])
    liste = kandidatar(p, spennX, spennY).map(([nx, ny]) => ({ nx, ny, tro: 0 }))
  }
  const ut: Kandidat[] = []
  yield { gjort: 0, av: liste.length, alle: [] }
  for (let i = 0; i < liste.length; i++) {
    const q = prov(p, liste[i], djup)
    if (q) ut.push(q)
    yield { gjort: i + 1, av: liste.length, alle: rangert(ut, djup) }
  }
  return rangert(ut, djup)
}

/** heile søket i eitt jafs, for den som ikkje har bruk for framdrifta */
export function tune(p: Params, djup = false, tak?: number): Kandidat[] {
  const it = tuneSteg(p, djup, tak)
  let r = it.next()
  while (!r.done) r = it.next()
  return r.value
}

/**
 * Det n-te framlegget, teke: plana hans i staden for dine, og festa
 * sleppte. Lista vert rekna EIN gong og halden i hovudtråden, so andre
 * trykk er momentane — eitt steg ned i ei liste som alt ligg der. Finst
 * det ingen kandidat, kjem punktet du stod på attende: ein knapp som gjer
 * ingenting er betre enn ein som gjer noko gale.
 */
export function bruk(p: Params, alle: Kandidat[], nth: number): Params {
  if (!alle.length) return p
  const q = alle[((nth % alle.length) + alle.length) % alle.length]
  return { ...p, plan: q.plan, fest: "" }
}
