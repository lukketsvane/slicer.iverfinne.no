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
import { nn, type Metrics, type Rule } from "../core"
import { DETAIL } from "./ribs"
import { makePlan, type Plan } from "./plan"
import { SNITTVEGAR, type Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"

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

  // --- 1 ribbene grip (hard) --------------------------------------------------
  add({
    id: "grip",
    label: "ribbene grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at nettet er for tynt der ribbene kryssar, eller at det står for få ribber til at nokon av dei møtest i gods.",
  })

  // --- 2 delane finst (hard) --------------------------------------------------
  add({
    id: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen ribbe råka nettet. Anten står objektet utanfor rutenettet, eller so er nettet så tynt at kvar profil fell under minstearealet.",
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
  })

  // --- 4 gods att i leddet (hard) ---------------------------------------------
  const minGods = Math.max(2, p.tjukn)
  add({
    id: "gods",
    label: "gods i leddet",
    hard: true,
    ok: m.narrow >= minGods,
    value: mm1(m.narrow),
    why: `Sporet et halve overlappet, og det som er att må bera resten av ribba. Under éi platetjukn (${mm1(minGods)}) knekk finéren i sporbotnen når du pressar delane saman. Flytt leddelinga, eller sett ribbene der nettet er tjukkare.`,
  })

  // --- 5 delane får plass på plata (hard) -------------------------------------
  add({
    id: "plate",
    label: "delane får plass",
    hard: true,
    ok: ns.spilt === 0,
    value: ns.spilt ? `${nn(ns.spilt)} utanfor` : `${nn(ns.sheets.length)} ark`,
    why: `Ein del er større enn plata. Anten mindre objekt, fleire ribber (kvar ribbe vert mindre), eller ei større plate enn ${nn(p.arkB)} × ${nn(p.arkH)} mm.`,
  })

  // --- 6 klaringa (mjuk) ------------------------------------------------------
  add({
    id: "klaring",
    label: "klaring",
    hard: false,
    ok: p.klaring >= 0.05 && p.klaring <= 0.35,
    value: mm1(p.klaring),
    why: "Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast, og då treng vaffelen lim, som er nett det han ikkje skulle treng.",
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
    value: p.snitt > 0 ? `${mm1(p.snitt)} ${SNITTVEGAR[p.snittveg] ?? ""}`.trim() : "null",
    why: "Stråla har breidd, og kutten et henne ut av delen. Er snittbreidda null, kompenserer korkje fila eller maskina for henne: kvart spor kjem ut ei snittbreidd for vidt og kvar tapp ei snittbreidd for tynn. Passprøva måler henne og klaringa i eitt.",
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
    label: "snittet mot sporet",
    hard: true,
    ok: p.snitt < m.slotW,
    value: `${mm1(p.snitt)} mot ${mm1(m.slotW)}`,
    why: "Snittbreidda vert kompensert ved å skuve omrisset utover, og sporet vert teikna like mykje smalare. Er snittet like breitt som sporet, er det teikna sporet borte, og konturen brettar seg over seg sjølv. Anten står snittbreidda for høgt, eller so er plata for tynn til det verktøyet.",
  })

  // --- 9 opninga mellom ribbene (mjuk) ----------------------------------------
  add({
    id: "opning",
    label: "opning mellom ribber",
    hard: false,
    ok: m.minGap >= 3,
    value: mm1(m.minGap),
    why: "Ribbene står så tett at fingrane ikkje kjem imellom dei når du monterer, og på plata står delane så nær kvarandre at nestinga ikkje har noko å gå på.",
  })

  // --- 10 lukka nett (mjuk) ---------------------------------------------------
  add({
    id: "lukka",
    label: "lukka nett",
    hard: false,
    ok: m.openEdges === 0,
    value: m.openEdges ? `${nn(m.openEdges)} opne kantar` : "lukka",
    why: "Snittinga les nettet med strålar og tel kva veg kvar trekant vender. Eit nett med hòl i har ingen innside å telje, og då kan ein profil kome ut som eit stykke der han skulle vore to. Reiskapen snittar det likevel, men no veit du kvifor det ser rart ut.",
  })

  // --- 11 oppløysinga (mjuk) --------------------------------------------------
  add({
    id: "nett",
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
    label: "utnytting",
    hard: false,
    ok: m.util >= 0.35 || m.sheets <= 1,
    value: `${nn(m.util * 100)} %`,
    why: "Meir enn to tredelar av plata går i søppelbøtta. Prøv ei anna plate, eller færre og større delar. Pakkinga her legg delane etter omrisset og ikkje etter konturen, so ei ribbe med ei stor opning i tel som full.",
  })

  return out
}
