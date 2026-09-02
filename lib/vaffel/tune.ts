/**
 * VAFFEL — knappen som finn innstillingane.
 *
 * Ein som slepper ei fil på sida veit kor stort objektet skal vera og kva
 * plate han har liggjande. Han veit ikkje kor mange ribber ein vaffel av
 * nett den forma toler, kvar leddelinga bør liggje, eller kva av det som
 * gjer at delane får plass på plata. Det er ikkje kunnskap han manglar —
 * det er ei rekning, og rekningar er reiskapen sitt arbeid.
 *
 * So her vert dei rekna. Kandidatane vert snitta for alvor, ikkje gjetta
 * på: kvar av dei går gjennom heile rekninga med ribber, ledd, delar og
 * pakking, og vert vurdert på det som kom ut.
 *
 * KVA HAN RØRER
 * Ribbetalet i begge retningar, og leddelinga. Ikkje noko anna.
 *
 * Storleiken er DIN — du sa kor stort det skulle vera. Tjukna er plata du
 * har liggjande. Klaringa er målt med passprøva. Snittet er maskina di, og
 * plata er bordet ditt. Ein knapp som endrar dei tala har ikkje funne
 * noko, han har berre bytt ut spørsmålet.
 *
 * KVIFOR EIN LISTE OG IKKJE EITT SVAR
 * «Best» er ikkje eit tal. Ein vaffel med mange ribber er stivare og tek
 * meir plate; ein med få er open og lettare å setje saman. Difor kjem
 * kandidatane sorterte, og knappen går eitt steg ned i lista for kvart
 * trykk. Fyrste trykket er det beste svaret; det andre er det nest beste,
 * og somme tider er det det du ville hatt.
 *
 * TO SØK, OG DEI SPØR OM ULIKE TING
 * Eit trykk er det raske søket over. Eit LANGT trykk er djupsøket, og han
 * står nedanfor: han spør kva forma treng, ikkje kva som plar vera greitt.
 */
import { DETAIL } from "./ribs"
import { makeKropp } from "./kropp"
import { makePlan } from "./plan"
import { checkRules } from "./rules"
import { maalProfil, plateoverslag, truskap, type Profil } from "./profil"
import { lesLaas, plasser, PARAM_RANGES, type Params } from "./params"

export type Kandidat = {
  ribbX: number
  ribbY: number
  ledd: number
  /** kor godt dette punktet svarar på oppgåva, høgare er betre */
  poeng: number
  parts: number
  sheets: number
  joints: number
  util: number
  /** stykke som fall av — lause, eller kasta av rutenettet. Det er
   *  stykke av forma du ikkje får, og fronten tel dei. */
  loose: number
  /** kor mykje av forma ribbene ber, 0..1 — sjå `profil.ts`. Berre
   *  djupsøket reknar han; det raske søket lèt han stå på null. */
  troskap: number
}

/**
 * Kandidatane som er verde å rekne på.
 *
 * Ribbeavstanden er det som avgjer om noko er ein vaffel. Under fire
 * platetjukner står ribbene så tett at objektet er ein kloss med riller;
 * over ein tredel av objektet er det eit skjelett du kan putte handa
 * gjennom. Mellom dei to ligg svaret.
 *
 * Kandidatane vert difor valde på AVSTANDEN og ikkje på talet: ni
 * avstandar jamt fordelte over det bandet, og ribbetalet i kvar retning
 * fylgjer av objektet sitt eige mål. Då er dei to retningane like tette av
 * seg sjølv — ein vaffel med tre ribber den eine vegen og fjorten den
 * andre er ikkje eit rutenett, det er ein kam.
 *
 * Attpå kjem fire skeive: eit steg opp eller ned i den eine retninga.
 * Somme former vil ha det, og eit søk som berre ser på det symmetriske
 * finn dei aldri.
 *
 * Kvar kandidat kostar ei snitting. Tretten er kring to sekund på ein
 * vanleg modell, og det er så lenge nokon vil vente på ein knapp.
 */
function kandidatar(p: Params, spennX: number, spennY: number): [number, number][] {
  const minPitch = Math.max(p.tjukn * 4, p.tjukn + 6)
  const maxPitch = Math.max(minPitch * 1.2, Math.min(spennX, spennY) / 3)
  const tal = (spenn: number, pitch: number) =>
    Math.max(2, Math.min(24, Math.round(spenn / pitch)))

  const sett = new Set<string>()
  const ut: [number, number][] = []
  const legg = (x: number, y: number) => {
    const key = `${x},${y}`
    if (sett.has(key)) return
    sett.add(key)
    ut.push([x, y])
  }

  const N = 9
  for (let i = 0; i < N; i++) {
    const pitch = minPitch * (maxPitch / minPitch) ** (i / (N - 1))
    legg(tal(spennX, pitch), tal(spennY, pitch))
  }
  // Dei skeive: rundt den midtre avstanden.
  const midt = Math.sqrt(minPitch * maxPitch)
  const mx = tal(spennX, midt)
  const my = tal(spennY, midt)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    legg(Math.max(2, mx + dx), Math.max(2, my + dy))
  }
  return ut
}

/**
 * Kva som gjer eit uttak godt.
 *
 * Alt her er lese av det som faktisk kom ut av rekninga, og kvart ledd i
 * summen svarar på eit spørsmål nokon har stilt ved eit laserbord.
 *
 *   held det saman?   Ein del som heng i eitt ledd kan vri seg laus. To
 *                     eller fleire er eit grep. Dette er det tyngste
 *                     leddet: ein vaffel som ikkje står er ikkje ein
 *                     vaffel.
 *   kor mange delar?  Under seks er det ikkje eit rutenett. Over seksti
 *                     er det ein kveld med pinsett. Midt imellom er det
 *                     ein kveld.
 *   kor mange plater? Kvar plate er pengar og ei oppspenning til.
 *   utnytting         Same plata, meir objekt.
 *   opning            Kjem fingrane imellom når du monterer?
 *
 * Brotne harde reglar er ikkje eit trekk i poengsummen. Dei er eit nei:
 * kandidaten finst ikkje.
 */
function poengOf(
  p: Params,
  m: { parts: number; sheets: number; joints: number; util: number; minGap: number; loose: number },
): number {
  const perDel = m.parts > 0 ? m.joints / m.parts : 0
  let poeng = 0

  // Grepet. To ledd per del er nok; fire er godt; over det er det berre
  // fleire spor i den same plata.
  poeng += 40 * Math.min(1, perDel / 3)

  // Talet på delar, som ei mjuk klokke kring tjue.
  const d = m.parts
  poeng += 22 * Math.exp(-(((d - 20) / 22) ** 2))
  if (d < 6) poeng -= 30
  if (d > 70) poeng -= 25

  // Plater. Kvar plate er pengar, ei oppspenning til, og ti minutt til
  // ved maskina. Straffa er difor ikkje ein liten justering: ho veks med
  // talet, men flatar ut, av di skilnaden på ei og to plater merkast meir
  // enn skilnaden på nitten og tjue.
  poeng -= 13 * (Math.max(1, m.sheets) - 1) ** 0.55
  poeng += 12 * Math.min(1, m.util / 0.6)

  // Opninga mellom ribbene: under tre millimeter kjem ikkje fingrane til.
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
 * DET LANGE TRYKKET STILLER EIT ANNA SPØRSMÅL.
 *
 * Det raske søket spør kva som plar vera greitt: tjue delar, eit rutenett
 * som ikkje er for tett og ikkje for ope, plater det ikkje vert for mange
 * av. Det er ein god standard, og det er ikkje det same som å spørje kva
 * NETT DENNE FORMA treng.
 *
 * Djupsøket spør det. Han vil ha den forma som liknar mest, på så få
 * plater som råd — og for å svare på det må han sjå på langt fleire
 * rutenett enn tretten, av di svaret ofte er skeivt. Ein torus som står
 * har ein dramatisk profil den eine vegen og ein roleg den andre, og eit
 * søk som held dei to retningane like tette finn han aldri.
 *
 * KORLEIS HAN RÅD TIL Å SJÅ PÅ TUSEN
 * Ikkje ved å snitte tusen gonger. Kroppen vert MÅLT éin gong — sjå
 * `profil.ts` — og etterpå kostar det ei summering over ei talrekkje å
 * seie kor mykje av forma eit rutenett ber, og kor mykje plate det tek.
 * Heile ribbetavla, frå 2×2 til 32×32, vert difor rekna gjennom på nokre
 * få millisekund.
 *
 * Det er eit OVERSLAG, og det får ikkje siste ordet. Overslaget veit
 * ingenting om ledd, om harde reglar, eller om kva pakkinga faktisk får
 * til på plata. So det vel kven som er verd ei snitting, og snittinga er
 * den som tel. To steg: eit vidt som er billig, og eit smalt som er sant.
 */

/** kor godt ei plate plar verte fylt. Berre for overslaget — det verkelege
 *  talet kjem av pakkinga, og det er den som avgjer til slutt. */
const VENTA_UTNYTT = 0.55

/**
 * Kva djupsøket meiner er best.
 *
 * Same slags tal som over, men vegne på det du bad om då du heldt knappen
 * nede:
 *
 *   forma      det tyngste leddet, og det einaste som er nytt. Sjå
 *              `truskap` i `profil.ts`.
 *   platene    tyngre enn i det raske søket. Du held ikkje knappen nede
 *              for å få det vanlege svaret.
 *   grepet     framleis eit krav og ikkje ein smak: ein vaffel som ikkje
 *              står, liknar ikkje på noko.
 *   arbeidet   kvar ribbe er ein kontur til å skjere og eit stykke til å
 *              setje i.
 *
 * DET SISTE LEDDET ER DET SOM GJER SØKET FERDIG. Truskapen METTAR: dei
 * fyrste ribbene tek heile bein og øyre, dei siste tek krumninga på ein
 * mage som alt er der. Utan ein pris på arbeidet stoggar difor søket fyrst
 * når neste plate vert naudsynt — på ein torus gav det ni og tjue ribber
 * mot sytten, femti delar meir og fire prosent betre form. Fire prosent er
 * ikkje verd femti delar, og det står her.
 *
 * Talet på delar er difor ein PRIS og ikkje ei klokke. Det raske søket har
 * ei klokke kring tjue av di tjue er ein grei kveld; djupsøket har inga
 * meining om kva som er greitt, det berre nektar å betale meir enn forma
 * er verd. Det er skilnaden på dei to knappane.
 *
 * SAME VEKTA I BEGGE STEGA. Funksjonen er den same for det vide steget og
 * det smale — det vide sender berre overslag inn der det smale sender
 * målingar. Ein prefiltrering som rangerer på noko anna enn det som til
 * slutt avgjer, siler bort vinnaren før nokon har sett på han.
 */
function djupPoeng(
  m: { parts: number; sheets: number; joints: number; util: number; minGap: number; loose: number },
  tro: number,
): number {
  const perDel = m.parts > 0 ? m.joints / m.parts : 0
  let poeng = 100 * tro

  // Platene. Same forma på straffa som i det raske søket — ho veks og
  // flatar ut — men brattare, og ho tel mot eit tungt formledd i staden
  // for eit lett.
  poeng -= 30 * (Math.max(1, m.sheets) - 1) ** 0.7
  poeng += 14 * Math.min(1, m.util / 0.7)

  // Grepet.
  poeng += 30 * Math.min(1, perDel / 3)

  // Arbeidet. Kvar del er ein kontur å skjere og eit stykke å setje i, og
  // prisen er den same for den sekstiande som for den sjette: søket ser
  // no heile tavla for alvor, og eit tak her ville gjort dei finaste
  // rutenetta gratis der dei kostar mest.
  poeng -= 14 * (m.parts / 60)

  // Eit stykke som fall av er eit stykke av forma du ikkje får — og det er
  // eit tap profilen ikkje ser: han måler kvar planet står, ikkje kva som
  // vart kasta etterpå.
  poeng -= Math.min(30, m.loose * 6)

  // Fingrane skal imellom når du monterer.
  if (m.minGap < 3) poeng -= 20

  return poeng
}

/**
 * HEILE RIBBETAVLA, RANGERT PÅ OVERSLAG — og so FRONTEN av henne.
 *
 * Kvart einaste rutenett frå 2×2 til 32×32 vert rekna gjennom her: tusen
 * av dei, med den SAME vekta som avgjer til slutt, men på overslag i
 * staden for målingar. Truskapen er ikkje eit overslag — han er lesen av
 * profilen og er like sann her som seinare. Resten er:
 *
 *   plater   plateforbruket delt på ei plate med venta utnytting
 *   ledd     eitt per kryss, nx × ny
 *   delar    nx + ny, som er golvet: ein kropp som deler seg gjev fleire
 *   luke     stigninga minus ei platetjukn
 *
 * SPØRSMÅLET ER «FÆRRAST DELAR SOM BER MEST AV FORMA», og det er ei
 * front og ikkje eit punkt: for kvart tal delar finst det eit best
 * rutenett, og fleire delar gjev meir form for meir arbeid. Båsen er
 * difor TALET PÅ DELAR, ikkje plata, og i kvar bås står dei fire beste
 * som er ulike nok til å vera kvar sitt svar — 10×6 og 8×8 er to ulike
 * løysingar på seksten delar, og pakkinga kan meine noko anna om dei enn
 * overslaget gjer.
 *
 * Alle får ei snitting, så langt budsjettet rekk, og budsjettet vert brukt
 * på tvers av båsane: fyrst den beste i kvar bås, so den nest beste i
 * kvar. Vert det knapt, er det reservane som fell og ikkje ein ende av
 * fronten — svaret på «kva får eg med tolv delar» skal ikkje forsvinne
 * av di det finst mange svar på «kva får eg med femti».
 *
 * Reservane er ikkje pynt: platetalet her er eit overslag, og pakkinga kan
 * svare noko anna. Utnyttinga og dei kasta stykka veit overslaget
 * ingenting om i det heile.
 */
type Framlegg = { nx: number; ny: number; tro: number; poeng: number }

/** to rutenett som ligg dette nær kvarandre er det same svaret */
const naer = (a: Framlegg, b: Framlegg) => Math.abs(a.nx - b.nx) + Math.abs(a.ny - b.ny) < 3

/**
 * Inn i båsen, om han er betre enn det som alt står der ELLER er noko
 * anna. Ein som ligg nær ein betre er den same løysinga ein gong til; ein
 * som ligg nær ein dårlegare er den betre utgåva av han, og tek plassen.
 */
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
  const laas = lesLaas(p.laas)
  const viddX = s.max[0] - s.min[0]
  const viddY = s.max[1] - s.min[1]
  const arkFlate = Math.max(1, p.arkB * p.arkH * VENTA_UTNYTT)
  const lo = PARAM_RANGES.ribbX.min
  const hi = PARAM_RANGES.ribbX.max

  // Ribbeplasseringane langs x er dei same for kvart y-tal, so dei vert
  // rekna éin gong per akse i staden for éin gong per rute i tavla. Tavla
  // er tusen ruter; utan dette er det tusen kall til `plasser` og tusen
  // gjennomgangar av profilen for seksti svar.
  const troX: number[] = []
  const troY: number[] = []
  const flateX: number[] = []
  const flateY: number[] = []
  for (let n = lo; n <= hi; n++) {
    const xs = plasser(n, laas.x).map((t) => s.min[0] + t * viddX)
    const ys = plasser(n, laas.y).map((t) => s.min[1] + t * viddY)
    troX[n] = truskap(pr, "x", xs)
    troY[n] = truskap(pr, "y", ys)
    flateX[n] = plateoverslag(pr, xs, [])
    flateY[n] = plateoverslag(pr, [], ys)
  }

  /** dei beste og mest ulike, per tal delar */
  const baas = new Map<number, Framlegg[]>()
  for (let nx = lo; nx <= hi; nx++) {
    for (let ny = lo; ny <= hi; ny++) {
      // Ribbene langs x ber profilen langs x. Snittet av dei to er kor
      // mykje av forma heile rutenettet ber.
      const tro = (troX[nx] + troY[ny]) / 2
      const ark = Math.max(1, Math.ceil((flateX[nx] + flateY[ny]) / arkFlate))
      const poeng = djupPoeng(
        {
          parts: nx + ny,
          sheets: ark,
          joints: nx * ny,
          util: VENTA_UTNYTT,
          minGap: Math.min(viddX / nx, viddY / ny) - p.tjukn,
          loose: 0,
        },
        tro,
      )
      const delar = nx + ny
      let b = baas.get(delar)
      if (!b) {
        b = []
        baas.set(delar, b)
      }
      leggI(b, { nx, ny, tro, poeng }, I_BAASEN)
    }
  }

  // På tvers av båsane, rang for rang: den beste i kvar bås fyrst, med
  // færrast delar fyrst innanfor rangen. Budsjettet kappar bakfrå, og
  // bakerst står reservane — ikkje ein ende av fronten.
  const delar = [...baas.keys()].sort((a, b) => a - b)
  const ut: Framlegg[] = []
  let brukt = 0
  for (let rang = 0; rang < I_BAASEN; rang++) {
    for (const d of delar) {
      const q = baas.get(d)?.[rang]
      if (!q) continue
      // Alltid minst éin: eit søk som ikkje har råd til noko har ikkje
      // svart, og då er knappen ein knapp som ikkje gjer noko.
      if (ut.length && brukt + arbeid(q.nx, q.ny) > tak) return ut
      ut.push(q)
      brukt += arbeid(q.nx, q.ny)
    }
  }
  return ut
}

/**
 * KVA EI SNITTING KOSTAR, MÅLT.
 *
 * Ein fast del og ein del som veks: kroppen vert lesen éin gong per RIBBE
 * og sporet skore éin gong per KRYSS, men det meste av tida er det faste —
 * rasteret som kvar ribbe vert lesen av, og pakkinga. Målt på det grove
 * nivået med rask pakking: ein kube på 6×6 tok 130 ms, ei kule på 16×16
 * tok 230. Ei rett line gjennom dei to er hundre og ti millisekund pluss
 * fire tidelar per ribbe og kryss, og det er den lina budsjettet vert
 * rekna i — i millisekund på maskina det vart målt på.
 *
 * Eit budsjett som berre telde ribber og kryss gjorde dei fine rutenetta
 * ti gonger dyrare enn dei er, og kappa fronten ved femti delar.
 */
const arbeid = (nx: number, ny: number) => 110 + 0.4 * (nx + ny + nx * ny)

/**
 * KOR MYKJE SNITTING DJUPSØKET HAR RÅD TIL.
 *
 * Det vide steget er gratis. Snittinga er ikkje, og ho vert målt i
 * `arbeid` — millisekund på ein benk. Tretti sekund der er kring hundre
 * og tjue rutenett snitta for alvor, heile fronten frå fire delar og
 * oppover og ei reserve i dei fyrste båsane: eit langt trykk er eit langt
 * trykk, og det du får for det er at fronten er MÅLT og ikkje gjetta.
 * Ringen kring knappen syner kor langt det er kome, og eit trykk til
 * stoggar søket der det er og held det beste det har funne.
 *
 * Eit skann er ikkje ein kube: kvar ribbe i eit nett på ein million
 * trekantar kostar strålar gjennom heile det nettet, so den same eininga
 * er dyrare. Difor vert budsjettet lese av nettet, og det vert lese FØR
 * fyrste snittinga: framdriftslina skal vera sann frå fyrste meldinga, og
 * ei line som fyrst seier hundre og so ombestemmer seg er verre enn ingen
 * line.
 */
const djupTak = (tris: number) => (tris > 300000 ? 5000 : tris > 80000 ? 12000 : 30000)

/**
 * Rekna gjennom kandidatane, og gjev dei sorterte.
 *
 * Snittinga går på det GROVE detaljnivået. Det er ikkje ein snarveg: talet
 * på delar, ledd og plater er det same der, og det er dei tala som avgjer.
 * Det fine nivået ville berre gjort dei same konklusjonane seinare — og på
 * eit skann er «seinare» eit halvt minutt.
 *
 * To rundar. Fyrst ribbetala, alle med leddelinga midt på. So vert
 * leddelinga prøvd på dei to beste: ho flyttar sporbotnen, og på ei form
 * der godset er tynt kan ho vera skilnaden på ein regel som held og ein
 * som brest. Å prøve henne på alle ville tredoble rekninga for eit tal som
 * står stille på dei fleste former.
 *
 * HAN GJEV FRÅ SEG STYRINGA MELLOM KVAR KANDIDAT, og det er ikkje pynt.
 * Ei melding frå ein arbeidar som står midt i ei lang rekning kjem ikkje
 * fram: nettlesaren tømer røyret fyrst når arbeidaren er ferdig med det
 * han held på med, so tolv framdriftsmeldingar sende inni lykkja landa
 * alle tolv i same augeblinken som svaret. Ein ring som hoppar frå null
 * til ferdig er ikkje framdrift. Difor eit steg om gongen, med ei
 * generatorlykkje: den som driv han vel sjølv å sleppe tråden imellom.
 *
 * `djup` byter ut LISTA og VEKTA, og ikkje noko anna. Snittinga, dei harde
 * reglane og redninga med leddelinga er dei same — det er berre kven som
 * vert snitta, og kva som gjer eit svar godt, som er eit anna spørsmål.
 */
/** eitt rutenett å snitte for alvor, med truskapen profilen las av det */
export type Oppgave = { nx: number; ny: number; tro: number }

/**
 * DJUPSØKET SINE OPPGÅVER: kroppen målt, tavla rangert, og fronten med
 * reservane so langt budsjettet rekk. Målinga av kroppen er det einaste
 * steget som ikkje er ei snitting, og det einaste som ikkje kan skippast:
 * alt under er aritmetikk på det ho fann. Ho tek nokre titals millisekund
 * — under ein tredel av éin kandidat — og ho står FØR fyrste
 * framdriftsmeldinga, so lina veit kor mange steg det vert.
 *
 * Oppgåvene er det som kan delast ut: kvar av dei er ei snitting som
 * ikkje treng vita om dei andre, so fleire arbeidarar kan ta kvar sine.
 */
export function djupOppgaver(
  p: Params,
  /** budsjettet, i `arbeid`. Prøvebenken set eit lite. */
  tak?: number,
): Oppgave[] {
  const k = makeKropp(p)
  const pr = maalProfil(k)
  const front = djupeKandidatar(p, pr, k.solid, tak ?? djupTak(k.soup.tris))
  return front.map((q) => ({ nx: q.nx, ny: q.ny, tro: q.tro }))
}

/**
 * ÉI OPPGÅVE SNITTA FOR ALVOR: kandidaten om han held, elles null.
 *
 * Grovt nivå og rask pakking: tala som rangerer — delar, ledd, plater —
 * er sanne nok der, og vinnaren vert snitta og pakka for alvor i det han
 * vert sett. Dei harde reglane er eit ja eller nei, ikkje eit trekk i
 * summen.
 *
 * Leddelinga står midt på. Ho rører ingen av tala i summen — ho flyttar
 * sporbotnen, og det ser du berre i godset — so å prøve henne på alle er
 * å rekne det same tre gonger. Men på ei form der godset er tynt kan ho
 * vera skilnaden på ein hard regel som held og ein som brest, og DÅ er
 * ho verd ei rekning. Difor: berre som redning, og berre for dei som
 * fall på nett det. Fall kandidaten på noko anna — for få ledd, for lite
 * plass på plata — hjelper det ikkje å flytte sporbotnen, og då er dei
 * to ekstra rekningane berre venting.
 */
export function prov(p: Params, o: Oppgave, djup: boolean): Kandidat | null {
  /** kandidaten, eller kva harde reglar som fall */
  const ein = (ledd: number): Kandidat | string[] => {
    const q: Params = { ...p, ribbX: o.nx, ribbY: o.ny, ledd }
    try {
      const plan = makePlan(q, DETAIL.lav, true)
      const m = {
        parts: plan.pl.parts.length,
        sheets: plan.ns.sheets.length,
        joints: plan.g.joints,
        util: plan.ns.util,
        minGap: Math.min(plan.g.gapX, plan.g.gapY),
        loose: plan.pl.lause + plan.g.kasta,
      }
      if (m.parts === 0 || m.sheets === 0) return ["tom"]
      const fall = checkRules(q, maal(q, plan), plan, false)
        .filter((r) => r.hard && !r.ok)
        .map((r) => r.id)
      if (fall.length) return fall
      return {
        ribbX: o.nx,
        ribbY: o.ny,
        ledd,
        poeng: djup ? djupPoeng(m, o.tro) : poengOf(q, m),
        troskap: o.tro,
        ...m,
      }
    } catch {
      // Ein kandidat som kastar er ein kandidat som ikkje finst.
      return ["kasta"]
    }
  }
  const a = ein(0.5)
  if (!Array.isArray(a)) return a
  if (a.length === 1 && a[0] === "gods") {
    const b = ein(0.35)
    if (!Array.isArray(b)) return b
    const c = ein(0.65)
    if (!Array.isArray(c)) return c
  }
  return null
}

/**
 * Dei sorterte, beste fyrst. I djupsøket fronten fyrst, og so resten: det
 * fyrste svaret er aldri slege på alt, og dei slegne står att å bla i —
 * på ein kube er fronten eitt einaste punkt, og ei liste på eitt er ein
 * knapp som ikkje blar.
 */
export function rangert(alle: readonly Kandidat[], djup: boolean): Kandidat[] {
  const etterPoeng = (a: Kandidat, b: Kandidat) => b.poeng - a.poeng
  if (!djup) return [...alle].sort(etterPoeng)
  const f = new Set(front(alle))
  return [
    ...alle.filter((q) => f.has(q)).sort(etterPoeng),
    ...alle.filter((q) => !f.has(q)).sort(etterPoeng),
  ]
}

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
  // Det beste so langt fylgjer kvart steg: den som stoggar søket midt i
  // skal ha det som er funne, sortert — hundre ekte snittingar er eit
  // svar, om det var to hundre som var planen.
  const ut: Kandidat[] = []
  yield { gjort: 0, av: liste.length, alle: [] }
  for (let i = 0; i < liste.length; i++) {
    const q = prov(p, liste[i], djup)
    if (q) ut.push(q)
    yield { gjort: i + 1, av: liste.length, alle: rangert(ut, djup) }
  }
  return rangert(ut, djup)
}

/**
 * FRONTEN: INGEN SOM ER SLEGEN PÅ ALT.
 *
 * Spørsmålet var færrast delar som ber mest av forma på færrast plater.
 * Eit svar som har fleire delar, fleire plater OG mindre form enn eit
 * anna — eller like mykje på to av dei og verre på den tredje — er ikkje
 * eit svar på det spørsmålet, uansett kva summen seier: summen veg òg
 * grepet og utnyttinga, og dei kan løfte eit rutenett forbi eit som er
 * betre på alt du spurde om. På ei kule kom 9×4 fyrst, med tretten delar
 * og 86 % av forma, medan 6×6 hadde tolv delar og meir form på like
 * mange plater.
 *
 * So fronten står fyrst: for kvart tal delar det beste som finst, og
 * ingen som ein annan slår på alt. Dei slegne kjem etter, til å bla i.
 * Berre djupsøket — det raske reknar ikkje form, og utan henne ville
 * fronten vore det minste rutenettet åleine.
 */
export function front(alle: readonly Kandidat[]): Kandidat[] {
  const slaar = (a: Kandidat, b: Kandidat) =>
    a.parts <= b.parts &&
    a.sheets <= b.sheets &&
    a.troskap >= b.troskap &&
    a.loose <= b.loose &&
    (a.parts < b.parts || a.sheets < b.sheets || a.troskap > b.troskap || a.loose < b.loose)
  return alle.filter((b) => !alle.some((a) => a !== b && slaar(a, b)))
}

/** heile søket i eitt jafs, for den som ikkje har bruk for framdrifta */
export function tune(p: Params, djup = false, tak?: number): Kandidat[] {
  const it = tuneSteg(p, djup, tak)
  let r = it.next()
  while (!r.done) r = it.next()
  return r.value
}

/** måltala reglane vil ha, henta ut av ein plan som alt er rekna */
function maal(p: Params, plan: ReturnType<typeof makePlan>) {
  // measure() ville rekna planen ein gong til på eit anna detaljnivå.
  // Her er han alt rekna, so tala vert lesne rett ut av han.
  const { g, pl, ns } = plan
  const narrow = g.ribs.reduce((s, r) => (r.slots.length ? Math.min(s, r.narrow) : s), Infinity)
  return {
    envX: 0,
    envY: 0,
    envZ: 0,
    parts: pl.parts.length,
    unique: pl.ids.length,
    loose: pl.lause + g.kasta,
    joints: g.joints,
    units: g.ribs.length,
    unitLabel: "ribber",
    mass: pl.mass,
    plyArea: pl.area,
    sheets: ns.sheets.length,
    util: ns.util,
    cutLen: pl.cutLen,
    cutTime: p.fart > 0 ? pl.cutLen / p.fart : 0,
    // Søket rangerer ikkje på nodar, so han vert ikkje talt her: det er
    // ei summering over kvar einaste ring, gonga med eit titals kandidatar.
    nodes: 0,
    narrow: Number.isFinite(narrow) ? narrow : 0,
    minGap: Math.min(g.gapX, g.gapY),
    slotW: g.slotW,
    tris: g.k.soup.tris,
    srcTris: g.k.srcTris,
    openEdges: g.k.openEdges,
    list: [],
  }
}

/**
 * Det n-te beste svaret, som ein ferdig parametersats.
 *
 * Lista vert rekna EIN gong og halden i hovudtråden. Andre trykk på
 * knappen er difor momentant: han går berre eitt steg ned i ei liste som
 * alt ligg der.
 *
 * Finst det ingen kandidat i det heile — eit nett som ikkje kan verte ein
 * vaffel i den plata — kjem punktet du stod på attende. Ein knapp som gjer
 * ingenting er betre enn ein knapp som gjer noko gale.
 */
export function bruk(p: Params, alle: Kandidat[], nth: number): Params {
  if (!alle.length) return p
  const q = alle[((nth % alle.length) + alle.length) % alle.length]
  return { ...p, ribbX: q.ribbX, ribbY: q.ribbY, ledd: q.ledd }
}
