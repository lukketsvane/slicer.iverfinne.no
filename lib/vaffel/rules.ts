/**
 * VAFFEL — reglane.
 *
 * Reiskapen nektar ikkje å snitte. Han snittar kva som helst, men han seier
 * kva han har snitta, og kva av det som ikkje kan skjerast eller ikkje kan
 * setjast saman.
 *
 * `hard` tyder at delane ikkje let seg lage eller ikkje let seg montere.
 * Ein mjuk regel er eit val, og eit val skal stå på papiret i staden for i
 * hovudet på den som gjorde det.
 *
 * Fire av dei harde er heile grunnen til at reiskapen finst. Ribbene må
 * gripe i kvarandre; sporet må vera breitt nok til verktøyet; det må vera
 * gods att i leddet; og delane må få plass på plata du faktisk har. Bryt
 * éin av dei, ligg det ein haug med finér på bordet og ingen vaffel.
 */
import { bbox, nn, type Fiks, type Metrics, type Rule } from "../core"
import { DETAIL } from "./ribs"
import { fitRoom } from "../pack"
import { makePlan, nestGap, type Plan } from "./plan"
import { SNITTVEGAR, type Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"
/** klaringa bur mellom 0,05 og 0,35: éin desimal gjer heile bandet til
 *  tre tal, og «0,0 mm» av noko som ikkje er null */
const mm2 = (v: number) => nn(v, 2) + " mm"

/** eit steg opp eller ned i den skyvaren tala faktisk bur i */
const snapp = (v: number, steg: number) => Math.round(v / steg) * steg

/**
 * FÆRRE RIBBER, REKNA OG IKKJE GJETTA.
 *
 * Ribbene står i cellesenter, so stigninga er spennet delt på talet, og
 * opninga er stigninga minus ei platetjukn. Vil du ha opninga G, treng du
 * spenn / (G + tjukn) ribber — og spennet står alt i den opninga du har:
 * det er (gap + tjukn) × talet du står med.
 */
const ribberFor = (n: number, gap: number, tjukn: number, mål: number) =>
  Math.max(1, Math.floor((n * (gap + tjukn)) / (mål + tjukn)))

/**
 * `plan` kan sendast inn av den som alt har rekna han.
 *
 * Reglane treng ribbene, delane og pakkinga. Utan denne opninga rekna dei
 * dei sjølve, på det FINE nivået — og knappen som leitar etter gode
 * innstillingar prøver tretten punkt, so det var tretten fine snittingar
 * ingen skulle sjå. Standarden er den same som før.
 */
export function checkRules(p: Params, m: Metrics, plan?: Plan): Rule[] {
  const { g, pl, ns } = plan ?? makePlan(p, DETAIL.mid)
  const out: Rule[] = []
  const add = (r: Rule) => out.push(r)

  /**
   * KOR MYKJE MINDRE?
   *
   * Delane er lineære i storleiken: doblar du objektet, doblar kvar ribbe
   * seg med det. So den verste delen seier kva heile objektet må gangast
   * med for å kome innanfor plata — og han seier det for begge leier, av
   * di pakkinga får snu han ein kvartsving.
   *
   * To prosent til gode, og so ned til næraste steg i skyvaren: eit råd
   * som legg seg akkurat på grensa er eit råd som ryk att på ei
   * avrunding.
   */
  const plateFiks = (): Fiks | undefined => {
    if (ns.spilt === 0) return undefined
    // Rommet er pakkinga si eiga rekning og ikkje ei gjetting her: ho
    // reserverer meir enn ei luke, og «plata minus luka» gav eit råd som
    // lét lina stå raud. Sjå `fitRoom`.
    const { w: romB, h: romH } = fitRoom(p.arkB, p.arkH, nestGap(p))
    let verst = 1
    for (const q of pl.parts) {
      const b = bbox(q.outline)
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      if (w <= 0 || h <= 0) continue
      const rett = Math.min(romB / w, romH / h)
      const snudd = Math.min(romB / h, romH / w)
      verst = Math.min(verst, Math.max(rett, snudd))
    }
    // Passar kvar del kvar for seg, er det pakkinga som ikkje fekk dei
    // ned, og då er ikkje storleiken svaret.
    if (verst >= 1) return undefined
    const ny = Math.max(40, snapp(p.storleik * verst * 0.98, 5))
    return ny < p.storleik ? { ord: `prøv ${nn(ny)} mm`, set: { storleik: ny } } : undefined
  }

  const snittFiks = (): Fiks | undefined => {
    if (p.snitt < m.slotW) return undefined
    const ny = Math.max(0.05, snapp(m.slotW * 0.5, 0.05))
    // `mm2` og ikkje `mm1`: rådet landar på skyvaren sitt eige 0,05-steg,
    // og éin desimal skreiv 1,55 som «1,6». Kontrakten er at talet på
    // knappen er talet knappen set.
    return ny < p.snitt ? { ord: `prøv ${mm2(ny)}`, set: { snitt: ny } } : undefined
  }

  const opningFiks = (): Fiks | undefined => {
    if (m.minGap >= 3) return undefined
    // 3,2 og ikkje 3: den nye ribba landar på eit heiltal, og eit heiltal
    // som er runda ned frå akkurat 3 kjem ut på 2,9.
    const nx = ribberFor(p.ribbX, g.gapX, p.tjukn, 3.2)
    const ny = ribberFor(p.ribbY, g.gapY, p.tjukn, 3.2)
    if (nx >= p.ribbX && ny >= p.ribbY) return undefined
    const sett = { ribbX: Math.min(nx, p.ribbX), ribbY: Math.min(ny, p.ribbY) }
    // Færre ribber er rekna på ei jamn stigning, og ein kropp er ikkje
    // jamn. På ein torus i ti millimeter tok «prøv 7×7» ribbene så langt
    // frå kvarandre at dei ikkje lenger møttest i gods: null ledd, null
    // delar, og to nye harde brot for å ordne ei opning som var for
    // trong. Ei opning ein kan få fingeren i er ikkje verd eit objekt som
    // ikkje finst.
    const { g: g2, pl: pl2 } = makePlan({ ...p, ...sett }, DETAIL.mid)
    if (!g2.joints || !pl2.parts.length) return undefined
    return { ord: `prøv ${sett.ribbX}×${sett.ribbY}`, set: sett }
  }

  /**
   * Ingen ledd, eller ingen delar. Begge er det same tomrommet sett frå
   * kvar si side, og begge har det same rådet: eit tettare rutenett tek
   * fleire bitar av kroppen og gjev fleire stader dei kan møtast.
   */
  const fleireRibber = (): Fiks | undefined => {
    if (m.joints > 0 && m.parts > 0) return undefined
    const nx = Math.min(32, Math.max(4, p.ribbX * 2))
    const ny = Math.min(32, Math.max(4, p.ribbY * 2))
    if (nx === p.ribbX && ny === p.ribbY) return undefined
    return { ord: `prøv ${nx}×${ny}`, set: { ribbX: nx, ribbY: ny } }
  }

  // --- 1 ribbene grip (hard) --------------------------------------------------
  add({
    id: "grip",
    rad: "ledd",
    label: "ribbene grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at nettet er for tynt der ribbene kryssar, eller at det står for få ribber til at nokon av dei møtest i gods.",
    fiks: fleireRibber(),
  })

  // --- 2 delane finst (hard) --------------------------------------------------
  add({
    id: "delar",
    rad: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen ribbe råka nettet. Anten står objektet utanfor rutenettet, eller so er nettet så tynt at kvar profil fell under minstearealet.",
    fiks: fleireRibber(),
  })

  // --- 3 kvar del heng i noko (hard) ------------------------------------------
  /**
   * Hard når du tek dei med, mjuk når du kastar dei.
   *
   * Ei laus plate i eska er ein feil. Ei laus plate du valde bort er ei
   * opplysning: du mista øyretippen, og det er verdt å vite, men fila er
   * skjerbar.
   */
  add({
    id: "lause",
    rad: "lause",
    label: p.lause ? "kasta stykke" : "delar utan ledd",
    hard: !p.lause,
    ok: p.lause ? g.kasta === 0 : pl.lause === 0,
    value: p.lause
      ? g.kasta
        ? `${nn(g.kasta)} kasta`
        : "ingen"
      : pl.lause
        ? `${nn(pl.lause)} av ${nn(pl.parts.length)}`
        : "ingen",
    why: "Eit stykke som ikkje kryssar ei einaste ribbe frå den andre familien heng ikkje i noko: det står i kuttlista, kostar plass på plata, og ligg laust i eska. Vanlegaste grunnen er at kroppen er tynnare enn luka mellom ribbene akkurat der, som på ein øyretipp eller ein hov. Fleire ribber tek han med i rutenettet; `lause` på «kast» tek han ut av fila.",
    // Rådet gjeld berre den harde vegen: står `lause` på «kast», er talet
    // ei opplysning om kva du valde bort, og eit råd om å velje det er
    // eit råd om å gjera det du alt har gjort.
    fiks: !p.lause && pl.lause > 0 ? { ord: "kast dei", set: { lause: 1 } } : undefined,
  })

  // --- 4 gods att i leddet (hard) ---------------------------------------------
  const minGods = Math.max(2, p.tjukn)

  /**
   * «DEL I MIDTEN» — MEN BERRE OM HAN FAKTISK DELER.
   *
   * Det tynnaste godset står på den sida av leddet delinga gjev minst
   * til, so halvt om halvt gjev dei to sidene like mykje. Det er det
   * einaste svaret reiskapen kan rekne seg fram til her, og det var det
   * han sa — utan å rekne etter.
   *
   * `ledd` flyttar ikkje berre sporbotnen. Han avgjer OM leddet i det
   * heile vert lagt: rommet må halde på begge sider av sporet, i den
   * høgda sporet står i, og den høgda er `ledd`. Målt på ein torus i ti
   * millimeter tok knappen godset frå 4,3 mm til ingenting, delane frå
   * fire til null, og éin broten hard regel til tre. Du sat att med
   * ingenting å skjere og ingen knapp å trykkje på.
   *
   * Difor vert han rekna før han vert tilbydd. Ein plan til er ikkje
   * gratis, men han vert berre rekna når regelen alt er broten — og
   * `makePlan` hugsar han, so sjølve trykket kostar ingenting. Søket
   * sender inn sin eigen plan og ser aldri på knappen, so det betaler
   * ingenting her.
   */
  const godsFiks = (): Fiks | undefined => {
    if (m.narrow >= minGods || Math.abs(p.ledd - 0.5) <= 0.01) return undefined
    const { g: g2 } = makePlan({ ...p, ledd: 0.5 }, DETAIL.mid)
    // Eit råd som tek ledda med seg er ikkje eit råd.
    if (!g2.joints || g2.joints < g.joints) return undefined
    const narrow = g2.ribs.reduce(
      (s, r) => (r.slots.length ? Math.min(s, r.narrow) : s),
      Infinity,
    )
    return narrow >= minGods ? { ord: "del i midten", set: { ledd: 0.5 } } : undefined
  }

  add({
    id: "gods",
    rad: "gods",
    label: "gods i leddet",
    hard: true,
    ok: m.narrow >= minGods,
    value: mm1(m.narrow),
    why: `Sporet et halve overlappet, og det som er att må bera resten av ribba. Under ${mm1(minGods)} knekk finéren i sporbotnen når du pressar delane saman. Flytt leddelinga, eller sett ribbene der nettet er tjukkare.`,
    fiks: godsFiks(),
  })

  // --- 5 delane får plass på plata (hard) -------------------------------------
  add({
    id: "plate",
    rad: "ark",
    label: "delane får plass",
    hard: true,
    ok: ns.spilt === 0,
    value: ns.spilt ? `${nn(ns.spilt)} utanfor` : `${nn(ns.sheets.length)} ark`,
    why: `Ein del er større enn plata. Anten mindre objekt, fleire ribber (kvar ribbe vert mindre), eller ei større plate enn ${nn(p.arkB)} × ${nn(p.arkH)} mm.`,
    fiks: plateFiks(),
  })

  // --- 6 klaringa (mjuk) ------------------------------------------------------
  add({
    id: "klaring",
    label: "klaring",
    hard: false,
    ok: p.klaring >= 0.05 && p.klaring <= 0.35,
    value: mm2(p.klaring),
    why: "Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast, og då treng vaffelen lim, som er nett det han ikkje skulle treng.",
    // Ikkje kanten av bandet. Ein verdi som so vidt står innanfor er ein
    // verdi som ryk av den fyrste plata som er ein tidel tjukkare enn ho
    // seier. Midt i bandet er det einaste rådet som toler noko.
    fiks:
      p.klaring < 0.05 || p.klaring > 0.35
        ? { ord: "prøv 0,15 mm", set: { klaring: 0.15 } }
        : undefined,
  })

  // --- 7 nokon tek snittbreidda (mjuk) ----------------------------------------
  /**
   * Snittbreidda må takast NØYAKTIG éin gong. `snittveg` seier kven som
   * tek henne, men ingen av vala hjelper om talet sjølv er null: då er
   * kvart spor ei snittbreidd for vidt, og eit rutenett med slike spor
   * held seg ikkje sjølv.
   */
  add({
    id: "snitt",
    label: "snittbreidd",
    hard: false,
    ok: p.snitt > 0,
    // Snittbreidda bur på eit 0,05-band, som klaringa: éin desimal gjer
    // fire skyvarsteg til to tal, og 0,05 og 0,15 les begge som «0,1».
    value: p.snitt > 0 ? `${mm2(p.snitt)} ${SNITTVEGAR[p.snittveg] ?? ""}`.trim() : "null",
    why: "Stråla har breidd, og kutten et henne ut av delen. Er snittbreidda null, kompenserer korkje fila eller maskina for henne: kvart spor kjem ut ei snittbreidd for vidt og kvar tapp ei snittbreidd for tynn. Passprøva måler henne og klaringa i eitt.",
    // To tidelar er ein vanleg laser i tynn MDF. Det er eit utgangspunkt
    // og ikkje eit mål: passprøva er der for å byte det ut med ditt eige.
    fiks: p.snitt > 0 ? undefined : { ord: "prøv 0,2 mm", set: { snitt: 0.2 } },
  })

  // --- 8 snittet et ikkje opp sporet (hard) -----------------------------------
  /**
   * Kompensasjonen skuvar omrisset UTOVER med eit halvt snitt, so sporet
   * vert teikna eit hardt snitt smalare enn det skal verta. Er snittet like
   * breitt som sporet, er det teikna sporet null breitt: dei to veggene
   * fell saman og omrisset brettar seg over seg sjølv. Fila ser ut som ei
   * fil, og maskina skjer ein sløyfe.
   *
   * Målt på ein kube i to millimeter byrjar brettinga eit stykke før
   * grensa, so dette er ei ytre grense og ikkje ei trygg sone.
   */
  add({
    id: "snittspor",
    rad: "spor",
    label: "snittet mot sporet",
    hard: true,
    ok: p.snitt < m.slotW,
    value: `${mm2(p.snitt)} mot ${mm2(m.slotW)}`,
    why: "Snittbreidda vert kompensert ved å skuve omrisset utover, og sporet vert teikna like mykje smalare. Er snittet like breitt som sporet, er det teikna sporet borte, og konturen brettar seg over seg sjølv. Anten står snittbreidda for høgt, eller so er plata for tynn til det verktøyet.",
    // Halve sporet, ikkje heile: brettinga byrjar eit stykke før grensa,
    // so eit råd som legg seg inntil henne er eit råd som ikkje held.
    fiks: snittFiks(),
  })

  // --- 9 opninga mellom ribbene (mjuk) ----------------------------------------
  add({
    id: "opning",
    rad: "opning",
    label: "opning mellom ribber",
    hard: false,
    ok: m.minGap >= 3,
    value: mm1(m.minGap),
    why: "Ribbene står så tett at fingrane ikkje kjem imellom dei når du monterer, og på plata står delane så nær kvarandre at nestinga ikkje har noko å gå på.",
    fiks: opningFiks(),
  })

  // --- 10 lukka nett (mjuk) ---------------------------------------------------
  add({
    id: "lukka",
    rad: "kantar",
    label: "lukka nett",
    hard: false,
    ok: m.openEdges === 0,
    value: m.openEdges ? `${nn(m.openEdges)} opne kantar` : "lukka",
    why: "Snittinga les nettet med strålar og tel kva veg kvar trekant vender. Eit nett med hòl i har ingen innside å telje, og då kan ein profil kome ut som eit stykke der han skulle vore to. Reiskapen snittar det likevel, men no veit du kvifor det ser rart ut.",
  })

  // --- 11 oppløysinga (mjuk) --------------------------------------------------
  add({
    id: "nett",
    rad: "nett",
    label: "nettoppløysing",
    hard: false,
    // Ein kube ER tolv trekantar, og det er ikkje for grovt — det er
    // eksakt. Regelen gjeld berre der taket har teke noko VEKK: det er
    // berre då talet fortel om ei oppløysing som er tapt.
    ok: m.tris >= 200 || m.tris >= m.srcTris,
    value: `${nn(m.tris)} av ${nn(m.srcTris)}`,
    why: "Forenklinga har teke nettet under eit par hundre trekantar, og då er det grovare enn ribbene som skal lesast av det: profilane vert fasettar i staden for kurver. Skru opp trekanttaket.",
  })

  // --- 12 utnyttinga (mjuk) ---------------------------------------------------
  add({
    id: "utnytting",
    rad: "utnytting",
    label: "utnytting",
    hard: false,
    ok: m.util >= 0.35 || m.sheets <= 1,
    value: `${nn(m.util * 100)} %`,
    // Teksten sa at pakkinga legg delane etter boksen kring dei, og at ei
    // ribbe med ei stor opning difor tel som full. Ho gjer det motsette:
    // ho rasteriserer kvart omriss med hòla i, og legg gjerne tre små
    // ribber inn i tomrommet under ein boge. Ein regel som forklarar seg
    // sjølv feil er verre enn ein som teier.
    why: "Meir enn to tredelar av plata går i søppelbøtta. Prøv ei anna plate, eller færre og større delar. Pakkinga fylgjer omrisset og reknar hòla i ein del som ledig plass, so det som står att er luft ho ikkje fann nokon del til.",
  })

  return out
}
