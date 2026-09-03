/**
 * SLICERMAN — reglane.
 *
 * Reiskapen nektar ikkje å snitte. Han snittar kva som helst, men han seier
 * kva han har snitta, og kva av det som ikkje kan skjerast eller ikkje kan
 * setjast saman. `hard` tyder at delane ikkje let seg lage eller montere;
 * ein mjuk regel er eit val, og eit val skal stå på papiret.
 *
 * Fem av dei harde er heile grunnen til at reiskapen finst: plana må gripe
 * i kvarandre; kvar del må kunne skuvast inn éin veg; det må vera gods att
 * i leddet; sporet må overleve snittet; og delane må få plass på plata du
 * faktisk har.
 */
import { bbox, nn, type Fiks, type Metrics, type Rule, type Vec3 } from "./core"
import { fitRoom } from "./pack"
import { makeBygg, nestGap, type Bygg } from "./bygg"
import { DETAIL, type Snitt } from "./snitt"
import { dot, lesPlan, rutenett, skrivPlan } from "./plan"
import { SNITTVEGAR, lesFest, skrivFest, type Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"
/** klaringa bur mellom 0,05 og 0,35: éin desimal gjer heile bandet til tre tal */
const mm2 = (v: number) => nn(v, 2) + " mm"
/** eit steg opp eller ned i den skyvaren tala faktisk bur i */
const snapp = (v: number, steg: number) => Math.round(v / steg) * steg

const narrowOf = (s: Snitt) => s.ribber.reduce((m, r) => (r.spor.length ? Math.min(m, r.narrow) : m), Infinity)

/**
 * EI REKKJEFYLGJE SOM GÅR OPP, OM HO FINST.
 *
 * Kvar del skal ha éi retning inn mot dei som alt ligg. Grådig: av delane
 * som kan leggjast no, den med flest retningar i ledda sine — han må inn
 * før alle utanom éi av dei, so han går fyrst. Går det til botns, er det
 * ei rekkjefylgje å tilby; står det fast, finst det truleg inga: tre plan
 * som kryssar kvarandre i gods utan å dele ei line går ikkje i hop i
 * nokon rekkjefylgje, og det er planet og ikkje lista som må endrast.
 */
function ordna(s: Snitt): number[] | null {
  const liner = new Map<number, Map<number, Vec3>>()
  for (const r of s.ribber) {
    const m = new Map<number, Vec3>()
    for (const q of r.spor) {
      // sporet si line i rommet: retninga i ramma, lagd ut gjennom u og v
      const d: Vec3 = [
        q.d[0] * r.r.u[0] + q.d[1] * r.r.v[0],
        q.d[0] * r.r.u[1] + q.d[1] * r.r.v[1],
        q.d[0] * r.r.u[2] + q.d[1] * r.r.v[2],
      ]
      if (!m.has(q.mot)) m.set(q.mot, d)
    }
    liner.set(r.plan.id, m)
  }
  const att = s.ribber.map((r) => r.plan.id)
  const lagt: number[] = []
  const par = Math.cos((3 * Math.PI) / 180)
  /** kor mange retningar delen har ledd i. Ein del med to eller fleire må
   *  inn FØR alle utanom éi av retningane sine, so han går fyrst. */
  const klassar = (id: number) => {
    const ds: Vec3[] = []
    for (const d of (liner.get(id) ?? new Map<number, Vec3>()).values()) {
      if (!ds.some((e) => Math.abs(dot(e, d)) >= par)) ds.push(d)
    }
    return ds.length
  }
  const kan = (id: number) => {
    let d0: Vec3 | null = null
    for (const [mot, d] of liner.get(id) ?? []) {
      if (!lagt.includes(mot)) continue
      if (!d0) d0 = d
      else if (Math.abs(dot(d0, d)) < par) return false
    }
    return true
  }
  while (att.length) {
    let best = -1
    for (let i = 0; i < att.length; i++) {
      if (!kan(att[i])) continue
      if (best < 0 || klassar(att[i]) > klassar(att[best])) best = i
    }
    if (best < 0) return null
    lagt.push(att.splice(best, 1)[0])
  }
  return lagt
}

/** `bygg` kan sendast inn av den som alt har rekna det; `raad` er om
 *  reglane skal rekne ut råda sine — søket spør berre om dei harde held. */
export function checkRules(p: Params, m: Metrics, bygg?: Bygg, raad = true): Rule[] {
  const { s, dl, ns } = bygg ?? makeBygg(p, DETAIL.mid)
  const out: Rule[] = []
  const add = (r: Rule) => {
    if (!raad) delete r.fiks
    out.push(r)
  }

  /**
   * KOR MYKJE MINDRE? Delane er lineære i storleiken, so den verste delen
   * seier kva heile objektet må gangast med for å kome innanfor plata —
   * for begge leier, av di pakkinga får snu han. To prosent til gode, so
   * ned til næraste steg: eit råd på grensa ryk att på ei avrunding.
   */
  const plateFiks = (): Fiks | undefined => {
    if (ns.spilt === 0 && ns.kross > 0) {
      const f = lesFest(p.fest)
      for (const sh of ns.sheets) for (const q of sh.placed) if (q.slot.kross) f.delete(q.part.adr)
      return { ord: "slepp dei", set: { fest: skrivFest(f) } }
    }
    if (ns.spilt === 0) return undefined
    const { w: romB, h: romH } = fitRoom(p.arkB, p.arkH, nestGap(p))
    let verst = 1
    for (const q of dl.delar) {
      const b = bbox(q.outline)
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      if (w <= 0 || h <= 0) continue
      verst = Math.min(verst, Math.max(Math.min(romB / w, romH / h), Math.min(romB / h, romH / w)))
    }
    if (verst >= 1) return undefined
    const ny = Math.max(40, snapp(p.storleik * verst * 0.98, 5))
    return ny < p.storleik ? { ord: `prøv ${nn(ny)} mm`, set: { storleik: ny } } : undefined
  }

  const snittFiks = (): Fiks | undefined => {
    if (p.snitt < m.slotW) return undefined
    const ny = Math.max(0.05, snapp(m.slotW * 0.5, 0.05))
    return ny < p.snitt ? { ord: `prøv ${mm2(ny)}`, set: { snitt: ny } } : undefined
  }

  /** Ingen ledd, eller ingen delar: same tomrommet frå kvar si side. Rådet
   *  er eit framlegg — rutenettet, som du kan ta heilt eller la liggje.
   *
   *  Men aldri når handa har teikna i eit plan: rutenettet BYTER UT lista,
   *  og eit råd som kastar arbeidet ditt er ikkje eit råd. Då står regelen
   *  med grunnen sin og utan knapp, og du gjer det du vil med han. */
  const framlegg = (): Fiks | undefined => {
    if (m.joints > 0 && m.parts > 0) return undefined
    if (lesPlan(p.plan).some((q) => q.strek.length)) return undefined
    const n = lesPlan(p.plan).length < 8 ? 6 : 8
    const plan = skrivPlan(rutenett(n, n))
    return plan === p.plan ? undefined : { ord: `prøv ${n}×${n}`, set: { plan, fest: "" } }
  }

  /**
   * «DEL I MIDTEN» — MEN BERRE OM HAN FAKTISK DELER. `ledd` avgjer òg OM
   * leddet vert lagt, so rådet vert rekna før det vert tilbydd: eit råd
   * som tek ledda med seg er ikkje eit råd.
   */
  const godsFiks = (): Fiks | undefined => {
    if (m.narrow >= minGods || Math.abs(p.ledd - 0.5) <= 0.01) return undefined
    const { s: s2 } = makeBygg({ ...p, ledd: 0.5 }, DETAIL.mid)
    if (!s2.ledd || s2.ledd < s.ledd) return undefined
    return narrowOf(s2) >= minGods ? { ord: "del i midten", set: { ledd: 0.5 } } : undefined
  }

  const ordenFiks = (): Fiks | undefined => {
    if (!s.montering.brot.length) return undefined
    const orden = ordna(s)
    if (!orden) return undefined
    const plan = lesPlan(p.plan)
    const ny = skrivPlan(orden.map((id) => plan.find((q) => q.id === id)!).filter(Boolean))
    if (ny === p.plan) return undefined
    // rekna, ikkje lova: retningane vert valde på nytt i den nye rekkjefylgja
    return makeBygg({ ...p, plan: ny }, DETAIL.mid).s.montering.brot.length
      ? undefined
      : { ord: "byt rekkjefylgje", set: { plan: ny } }
  }

  // --- 1 plana grip (hard) ----------------------------------------------------
  add({
    id: "grip",
    rad: "ledd",
    label: "plana grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at plana ikkje kryssar kvarandre der kroppen har gods, eller at det står for få av dei til at nokon møtest.",
    fiks: raad ? framlegg() : undefined,
  })

  // --- 2 delane finst (hard) --------------------------------------------------
  add({
    id: "delar",
    rad: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen plan råka nettet. Anten står plana utanfor kroppen, eller so er nettet so tynt at kvar profil fell under minstearealet — eller du har ikkje låst noko enno.",
    fiks: raad ? framlegg() : undefined,
  })

  // --- 3 kvar del kan skuvast inn (hard) --------------------------------------
  /**
   * Ein del med spor kan berre gå inn langs spora sine. Har han ledd mot to
   * alt lagde delar som ikkje er parallelle, kjem han ikkje inn same kva
   * du gjer. Rutenettet kunne aldri bryte denne; eit sett plan for hand kan.
   */
  const brot = s.montering.brot
  add({
    id: "orden",
    label: "kan monterast",
    hard: true,
    ok: brot.length === 0,
    value: brot.length ? `${brot.length} står fast: ${brot.join(", ")}` : "éin veg inn for kvar",
    why: "Ein del vert skuva inn langs spora sine, og ei plate kan berre gå éin veg. Delen har ledd mot to delar som alt ligg, langs liner som ikkje er parallelle. Byt rekkjefylgja, so han kjem inn før den eine av dei — eller vinkle planet om.",
    fiks: raad ? ordenFiks() : undefined,
  })

  // --- 4 kvar del heng i noko -------------------------------------------------
  /**
   * Hard når du tek dei lause øyene med, mjuk når du kastar dei. Eit heilt
   * plan utan ledd vert aldri kasta — det er det fyrste planet du låste —
   * og står her som eit tal til det får eit ledd.
   */
  const utan = dl.lause
  add({
    id: "lause",
    rad: "lause",
    label: p.lause ? "utan ledd · kasta" : "delar utan ledd",
    hard: !p.lause && utan > 0,
    ok: utan === 0 && s.kasta === 0,
    value: utan || s.kasta ? [utan ? `${nn(utan)} utan ledd` : "", s.kasta ? `${nn(s.kasta)} kasta` : ""].filter(Boolean).join(", ") : "ingen",
    why: "Eit stykke som ikkje kryssar eit einaste anna plan heng ikkje i noko: det står i kuttlista, kostar plass på plata, og ligg laust i eska. Eit plan til gjennom stykket gjev det eit ledd; `lause` på «kast» tek lause øyer ut av fila.",
    fiks: !p.lause && utan > 0 ? { ord: "kast dei", set: { lause: 1 } } : undefined,
  })

  // --- 5 gods att i leddet (hard) ---------------------------------------------
  const minGods = Math.max(2, p.tjukn)
  add({
    id: "gods",
    rad: "gods",
    label: "gods i leddet",
    hard: true,
    ok: m.narrow >= minGods,
    value: mm1(m.narrow),
    why: `Sporet et halve overlappet, og det som er att må bera resten av delen. Under ${mm1(minGods)} knekk finéren i sporbotnen når du pressar delane saman. Flytt leddelinga, eller set planet der nettet er tjukkare.`,
    fiks: raad ? godsFiks() : undefined,
  })

  // --- 6 delane får plass på plata (hard) -------------------------------------
  add({
    id: "plate",
    rad: "ark",
    label: "delane får plass",
    hard: true,
    ok: ns.spilt === 0 && ns.kross === 0,
    value: ns.spilt ? `${nn(ns.spilt)} utanfor` : ns.kross ? `${nn(ns.kross)} i kvarandre` : `${nn(ns.sheets.length)} ark`,
    why: ns.kross
      ? "Ein festa del ligg i ein annan festa del, og to kutt som går i kvarandre gjev to stykke skrap. Dra den eine vekk, eller slepp han so pakkinga får leggje han."
      : `Ein del er større enn plata. Anten mindre objekt, fleire plan (kvar del vert mindre), eller ei større plate enn ${nn(p.arkB)} × ${nn(p.arkH)} mm.`,
    fiks: raad ? plateFiks() : undefined,
  })

  // --- 7 klaringa (mjuk) ------------------------------------------------------
  add({
    id: "klaring",
    label: "klaring",
    hard: false,
    ok: p.klaring >= 0.05 && p.klaring <= 0.35,
    value: mm2(p.klaring),
    why: "Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast, og då treng bygget lim, som er nett det det ikkje skulle treng.",
    fiks: p.klaring < 0.05 || p.klaring > 0.35 ? { ord: "prøv 0,15 mm", set: { klaring: 0.15 } } : undefined,
  })

  // --- 8 nokon tek snittbreidda (mjuk) ----------------------------------------
  add({
    id: "snitt",
    label: "snittbreidd",
    hard: false,
    ok: p.snitt > 0,
    value: p.snitt > 0 ? `${mm2(p.snitt)} ${SNITTVEGAR[p.snittveg] ?? ""}`.trim() : "null",
    why: "Stråla har breidd, og kutten et henne ut av delen. Er snittbreidda null, kompenserer korkje fila eller maskina for henne: kvart spor kjem ut ei snittbreidd for vidt. Passprøva måler henne og klaringa i eitt.",
    fiks: p.snitt > 0 ? undefined : { ord: "prøv 0,2 mm", set: { snitt: 0.2 } },
  })

  // --- 9 snittet et ikkje opp sporet (hard) -----------------------------------
  add({
    id: "snittspor",
    rad: "spor",
    label: "snittet mot sporet",
    hard: true,
    ok: p.snitt < m.slotW,
    value: `${mm2(p.snitt)} mot ${mm2(m.slotW)}`,
    why: "Snittbreidda vert kompensert ved å skuve omrisset utover, og sporet vert teikna like mykje smalare. Er snittet like breitt som sporet, er det teikna sporet borte, og konturen brettar seg over seg sjølv.",
    fiks: raad ? snittFiks() : undefined,
  })

  // --- 10 opninga mellom plan (mjuk) ------------------------------------------
  add({
    id: "opning",
    rad: "opning",
    label: "opning mellom plan",
    hard: false,
    ok: m.minGap >= 3,
    value: mm1(m.minGap),
    why: "To nesten parallelle plan står so tett at fingrane ikkje kjem imellom dei når du monterer. Flytt det eine, eller ta det bort.",
  })

  // --- 11 lukka nett (mjuk) ---------------------------------------------------
  add({
    id: "lukka",
    rad: "kantar",
    label: "lukka nett",
    hard: false,
    ok: m.openEdges === 0,
    value: m.openEdges ? `${nn(m.openEdges)} opne kantar` : "lukka",
    why: "Snittinga les nettet med strålar og tel kva veg kvar trekant vender. Eit nett med hòl i har ingen innside å telje, og då kan ein profil kome ut som eit stykke der han skulle vore to.",
  })

  // --- 12 oppløysinga (mjuk) --------------------------------------------------
  add({
    id: "nett",
    rad: "nett",
    label: "nettoppløysing",
    hard: false,
    ok: m.tris >= 200 || m.tris >= m.srcTris,
    value: `${nn(m.tris)} av ${nn(m.srcTris)}`,
    why: "Forenklinga har teke nettet under eit par hundre trekantar, og då er det grovare enn plana som skal lesast av det. Skru opp trekanttaket.",
  })

  // --- 13 utnyttinga (mjuk) ---------------------------------------------------
  add({
    id: "utnytting",
    rad: "utnytting",
    label: "utnytting",
    hard: false,
    ok: m.util >= 0.35 || m.sheets <= 1,
    value: `${nn(m.util * 100)} %`,
    why: "Meir enn to tredelar av plata går i søppelbøtta. Prøv ei anna plate, eller færre og større delar. Pakkinga fylgjer omrisset og reknar hòla som ledig plass, so det som står att er luft ho ikkje fann nokon del til.",
  })

  return out
}

