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
import { makeKropp } from "./kropp"
import { buildGrid, DETAIL } from "./ribs"
import { buildParts } from "./parts"
import { nest } from "./nest"
import { nestGap } from "./metrics"
import type { Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"

export function checkRules(p: Params, m: Metrics): Rule[] {
  const k = makeKropp(p)
  const g = buildGrid(k, p, DETAIL.mid)
  const pl = buildParts(g)
  const ns = nest(pl.parts, p.arkB, p.arkH, nestGap(p))
  const out: Rule[] = []
  const add = (r: Rule) => out.push(r)

  // --- 1 ribbene grip (hard) -------------------------------------------------
  add({
    id: "grip",
    label: "ribbene grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at nettet er for tynt der ribbene kryssar, eller at det står for få ribber til at nokon av dei møtest i gods.",
  })

  // --- 2 delane finst (hard) -------------------------------------------------
  add({
    id: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen ribbe råka nettet. Anten står objektet utanfor rutenettet, eller so er nettet så tynt at kvar profil fell under minstearealet.",
  })

  // --- 3 kvar del heng i noko (hard) -----------------------------------------
  add({
    id: "lause",
    label: "delar utan ledd",
    hard: true,
    ok: pl.lause === 0,
    value: pl.lause ? `${nn(pl.lause)} av ${nn(pl.parts.length)}` : "ingen",
    why: "Ein del som ikkje kryssar ei einaste ribbe frå den andre familien er ei laus plate: han står i kuttlista, han kostar material, og han fell ut av stabelen når du løftar han. Vanlegaste grunnen er ei ribbe heilt ute i kanten, der objektet er for tynt til at nokon møter henne — færre ribber, eller eit anna rutenett.",
  })

  // --- 4 verktøyet kjem ned i sporet (hard) ----------------------------------
  add({
    id: "spor",
    label: "sporet tek verktøyet",
    hard: true,
    ok: p.fres <= m.slotW + 1e-6,
    value: `${nn(m.slotW, 2)} mot ${nn(p.fres, 1)} mm`,
    why: "Eit spor som er smalare enn fresen kan ikkje skjerast — verktøyet kjem ikkje ned i det. Anten tjukkare plate, eller tynnare fres. På laser står fresen på null og regelen slår aldri ut.",
  })

  // --- 5 gods att i leddet (hard) --------------------------------------------
  const minGods = Math.max(2, p.tjukn)
  add({
    id: "gods",
    label: "gods i leddet",
    hard: true,
    ok: m.narrow >= minGods,
    value: mm1(m.narrow),
    why: `Sporet et halve overlappet, og det som er att må bera resten av ribba. Under éi platetjukn (${mm1(minGods)}) knekk finéren i sporbotnen når du pressar delane saman. Flytt leddelinga, eller sett ribbene der nettet er tjukkare.`,
  })

  // --- 6 delane får plass på plata (hard) ------------------------------------
  add({
    id: "plate",
    label: "delane får plass",
    hard: true,
    ok: ns.spilt === 0,
    value: ns.spilt ? `${nn(ns.spilt)} utanfor` : `${nn(ns.sheets.length)} ark`,
    why: `Ein del er større enn plata. Anten mindre objekt, fleire ribber (kvar ribbe vert mindre), eller ei større plate enn ${nn(p.arkB)} × ${nn(p.arkH)} mm.`,
  })

  // --- 7 klaringa (mjuk) -----------------------------------------------------
  add({
    id: "klaring",
    label: "klaring",
    hard: false,
    ok: p.klaring >= 0.05 && p.klaring <= 0.35,
    value: mm1(p.klaring),
    why: "Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast, og då treng vaffelen lim — som er nett det han ikkje skulle treng.",
  })

  // --- 8 opninga mellom ribbene (mjuk) ---------------------------------------
  add({
    id: "opning",
    label: "opning mellom ribber",
    hard: false,
    ok: m.minGap >= Math.max(3, p.fres + 1),
    value: mm1(m.minGap),
    why: "Ribbene står så tett at verktøyet ikkje kjem imellom dei når du monterer — og på plata står delane så nær kvarandre at nestinga ikkje har noko å gå på.",
  })

  // --- 9 lukka nett (mjuk) ---------------------------------------------------
  add({
    id: "lukka",
    label: "lukka nett",
    hard: false,
    ok: m.openEdges === 0,
    value: m.openEdges ? `${nn(m.openEdges)} opne kantar` : "lukka",
    why: "Snittinga les nettet med strålar og tel kva veg kvar trekant vender. Eit nett med hòl i har ingen innside å telje, og då kan ein profil kome ut som eit stykke der han skulle vore to. Reiskapen snittar det likevel — men no veit du kvifor det ser rart ut.",
  })

  // --- 10 oppløysinga (mjuk) -------------------------------------------------
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

  // --- 11 utnyttinga (mjuk) --------------------------------------------------
  add({
    id: "utnytting",
    label: "utnytting",
    hard: false,
    ok: m.util >= 0.35 || m.sheets <= 1,
    value: `${nn(m.util * 100)} %`,
    why: "Meir enn to tredelar av plata går i søppelbøtta. Prøv ei anna plate, eller færre og større delar — pakkinga her legg delane etter omrisset og ikkje etter konturen, so ei ribbe med ei stor opning i tel som full.",
  })

  return out
}
