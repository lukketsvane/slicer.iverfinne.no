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
import { measure } from "./metrics"
import { fitRoom } from "./pack"
import { makeBygg, nestGap, type Bygg } from "./bygg"
import { makeKropp } from "./kropp"
import { DETAIL, lukene, type Snitt } from "./snitt"
import { dot, lesPlan, skrivPlan } from "./plan"
import { bogMin as bogMinAv, rilleMal } from "./rille"
import { SNITTVEGAR, lesFest, skrivFest, type Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"
/** klaringa bur mellom 0,05 og 0,35: éin desimal gjer heile bandet til tre tal */
const mm2 = (v: number) => nn(v, 2) + " mm"
/** eit steg opp eller ned i den skyvaren tala faktisk bur i */
const snapp = (v: number, steg: number) => Math.round(v / steg) * steg

/**
 * NÅR NETTET ER FOR GROVT — OG KVIFOR TALET IKKJE ER TO HUNDRE.
 *
 * Regelen stod på «under to hundre trekantar», og den lina kunne aldri
 * verta raud. Skyvaren botnar på eit halvt tusen, `budsjett` gjev heile
 * taket til ei einsam kjelde, og forenklinga stoggar NÅR ho har nådd
 * budsjettet — ho held ikkje fram under det. Målt på det lågaste hakket:
 *
 *     kule 18 432 trekantar → 384      sylinder 1 024 → 224
 *     kule  4 608 →  384               rutekube 3 072 → 432
 *     kule  1 152 →  408               rutekube   768 → 432
 *
 * Botnen ligg kring tre hundre og femti, og eit nett som ER under to
 * hundre har ikkje fleire å miste — då er `tris >= srcTris` og lina er
 * grøn av den andre grunnen. Ei vakt som ikkje kan verta raud svarar på
 * eit anna spørsmål enn det som vart stilt.
 *
 * Taket sjølv er talet: lina står når forenklinga har teke nettet under
 * det MINSTE skyvaren kan be om, og den er sann nett på det hakket. Kva
 * det kostar, målt på ei kule på to hundre millimeter med fire og fire
 * plan: kuttet 7,413 m mot 7,495 og massen 0,3651 kg mot 0,3759 — tre
 * prosent gods lese av eit nett som ikkje er der.
 */
const NETT_MINST = 500

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
    // EIN BØYGD DEL VERT IKKJE SKUVA INN, HAN VERT BØYGD INN, og rullinga
    // tek generatorane og bogane hans på ein gong (sjå `Montering.boygde`).
    // Han melder difor inga retning, og står ikkje i strid med nokon.
    for (const q of (r.r.k ? [] : r.spor)) {
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
  const kan = (id: number) => strid(id) === 0
  /**
   * KOR MANGE RETNINGAR DELEN STÅR I STRID MED, mot dei som alt ligg. Null
   * er «han kjem inn»; alt over er kor ille det er.
   *
   * Dette var ein ja/nei før, og lykkja under gav opp — `return null` — i
   * det ingen del kunne leggjast. Alt eller ingenting: eit objekt der EI
   * rekkjefylgje ville teke deg frå førti fastlåste til fem fekk ikkje eit
   * råd i det heile, av di rådet ikkje kunne love null.
   *
   * No held ho fram med den MINST DÅRLEGE. Ei rekkjefylgje som er betre er
   * betre, og `ordenFiks` måler etterpå kor mykje ho tok — ho lovar
   * framleis ingenting ho ikkje har rekna.
   */
  const strid = (id: number) => {
    const ds: Vec3[] = []
    for (const [mot, d] of liner.get(id) ?? []) {
      if (!lagt.includes(mot)) continue
      ds.push(d)
    }
    let verst = 0
    for (let a = 0; a < ds.length; a++) {
      for (let b = a + 1; b < ds.length; b++) {
        if (Math.abs(dot(ds[a], ds[b])) < par) verst++
      }
    }
    return verst
  }
  while (att.length) {
    let best = -1
    for (let i = 0; i < att.length; i++) {
      if (!kan(att[i])) continue
      if (best < 0 || klassar(att[i]) > klassar(att[best])) best = i
    }
    if (best < 0) {
      // ingen kjem reint inn: ta den som står i strid med færrast, og gå vidare
      for (let i = 0; i < att.length; i++) {
        if (best < 0 || strid(att[i]) < strid(att[best])) best = i
      }
    }
    lagt.push(att.splice(best, 1)[0])
  }
  return lagt
}

/** `bygg` kan sendast inn av den som alt har rekna det; `raad` er om
 *  reglane skal rekne ut råda sine — søket spør berre om dei harde held. */
/**
 * ALLE RÅDA, TRYKTE FOR DEG — til det ikkje er fleire å trykkje.
 *
 * Kvar regel har alltid hatt rådet sitt, og kvart råd har alltid vore éin
 * knapp. Det held so lenge det er eitt som er gale. Eit objekt med åtte og
 * fyrti plan kan ha seks brot på ein gong, og då er det seks knappar du
 * skal finne, i ei rekkjefylgje ingen har fortalt deg, der kvar av dei
 * endrar kva dei andre svarar.
 *
 * So: EIN runde om gongen, og reglane vert rekna på nytt mellom kvar. Eit
 * råd er ei endring i posen, og posen er alt eit råd nummer to les.
 *
 * TRE REGLAR FOR SJØLVE LYKKJA:
 *
 * Han gjer det ALDRI verre. Kvart råd vert prøvt, og talet på harde brot
 * lese etterpå; steig det, vert rådet kasta og lykkja går vidare til det
 * neste. `pnpm raad` har alltid prøvt dette per råd — her gjeld det for
 * kjeda.
 *
 * Han stoggar når ingenting endrar seg. Eit råd som set det same talet om
 * att er ikkje framgang, og to råd som dreg kvar sin veg ville elles bytt
 * på i det uendelege.
 *
 * Og han har eit tak. Tolv rundar er meir enn nok når kvar runde tek minst
 * eitt brot — og eit tak er det einaste som skil ei lykkje frå ein hengelås
 * når nokon seinare legg til eit råd som ikkje oppfører seg.
 *
 * Han lovar ikkje å fikse ALT, og kan ikkje: «plana grip» og «delar å
 * skjere» har ingen råd, av di svaret er å skjere fleire plan, og det er
 * ikkje reiskapen sitt val. Han fiksar det som HAR eit råd, og seier kva
 * som står att.
 */
/** posen som streng, med nøklane i orden: to posar er like når dette er likt */
const posen = (q: Params) =>
  Object.keys(q)
    .sort()
    .map((k) => `${k}=${String((q as unknown as Record<string, unknown>)[k])}`)
    .join("|")

export function fiksAlt(p: Params): { p: Params; runder: number; fiksa: string[]; att: string[] } {
  const harde = (q: Params) => checkRules(q, measure(q), undefined, false).filter((r) => r.hard && !r.ok).length
  let naa = p
  let brot = harde(naa)
  const fiksa: string[] = []
  for (let runde = 0; runde < 12; runde++) {
    const r = checkRules(naa, measure(naa))
    const vonde = r.filter((q) => !q.ok && q.fiks && !q.fiks.riv)
    if (!vonde.length) break
    let tok = false
    for (const q of vonde) {
      const prov = { ...naa, ...q.fiks!.set } as Params
      if (posen(prov) === posen(naa)) continue
      const etter = harde(prov)
      // ALDRI VERRE: eit råd som lagar fleire harde brot enn det tek, vert kasta
      if (etter > brot) continue
      naa = prov
      brot = etter
      fiksa.push(q.id)
      tok = true
      break
    }
    if (!tok) break
  }
  const att = checkRules(naa, measure(naa), undefined, false)
    .filter((q) => !q.ok && q.hard)
    .map((q) => q.label)
  return { p: naa, runder: fiksa.length, fiksa, att }
}

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

  /**
   * EITT HAKK OPP, OG REKNA I STADEN FOR LOVA. Forenklinga stoggar på
   * budsjettet, so eitt hakk opp doblar det — men nettet vert bygt og talt
   * før knappen vert tilbydd, av di ei kjelde som er tom for trekantar
   * ikkje vert finare av eit høgare tak.
   */
  const nettFiks = (): Fiks | undefined => {
    if (m.tris >= NETT_MINST || m.tris >= m.srcTris) return undefined
    for (const t of [1, 2, 5]) {
      if (t <= p.trekant) continue
      const k = makeKropp({ ...p, trekant: t })
      if (k.soup.tris >= NETT_MINST || k.soup.tris >= k.srcTris) {
        return { ord: `prøv ${nn(t)} k`, set: { trekant: t } }
      }
    }
    return undefined
  }

  const snittFiks = (): Fiks | undefined => {
    if (p.snitt < m.slotW) return undefined
    const ny = Math.max(0.05, snapp(m.slotW * 0.5, 0.05))
    return ny < p.snitt ? { ord: `prøv ${mm2(ny)}`, set: { snitt: ny } } : undefined
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

  /**
   * RETT UT DEI SOM MISSER MØTE, og berre dei. Rekna og ikkje lova: snittet
   * vert bygt om att med bøyen borte, og knappen står berre om møta faktisk
   * kjem attende som ledd.
   */
  const bogKurveFiks = (idar: readonly number[]): Fiks | undefined => {
    const ny = skrivPlan(lesPlan(p.plan).map((q) => (idar.includes(q.id) ? { ...q, bog: 0 } : q)))
    if (ny === p.plan) return undefined
    const etter = makeBygg({ ...p, plan: ny }, DETAIL.mid).s
    if (etter.kurva.length || etter.ledd <= s.ledd) return undefined
    return {
      ord: idar.length === 1 ? "rett ut det eine" : `rett ut dei ${nn(idar.length)}`,
      set: { plan: ny },
      riv: true,
    }
  }

  const ordenFiks = (): Fiks | undefined => {
    if (!s.montering.brot.length) return undefined
    const orden = ordna(s)
    if (!orden) return undefined
    const plan = lesPlan(p.plan)
    const ny = skrivPlan(orden.map((id) => plan.find((q) => q.id === id)!).filter(Boolean))
    if (ny === p.plan) return undefined
    // rekna, ikkje lova: retningane vert valde på nytt i den nye rekkjefylgja
    const foer = s.montering.brot.length
    const etter = makeBygg({ ...p, plan: ny }, DETAIL.mid).s.montering.brot.length
    // ...og eit råd som tek NOKRE er framleis eit råd. Ordet seier kva han
    // faktisk gjer, so du ikkje trur han lovar meir enn han kan.
    if (etter < foer) {
      return { ord: etter ? `byt rekkjefylgje: ${foer} → ${etter} fast` : "byt rekkjefylgje", set: { plan: ny } }
    }
    return undefined
  }

  /**
   * OG NÅR INGA REKKJEFYLGJE HJELPER: TA DEI BORT.
   *
   * Ein del som har ledd mot to som alt ligg, langs liner som ikkje er
   * parallelle, kjem ikkje inn i NOKON orden. Regelen sitt eige «kvifor»
   * seier dei to botemidla: byt rekkjefylgje, eller vinkle planet om. Det
   * fyrste er prøvt over. Det andre kan reiskapen ikkje gjere for deg — han
   * veit ikkje kva du ville med planet.
   *
   * Det tredje kan han: ta dei ut. Det gjev alltid eit objekt som let seg
   * setje saman, og det er alltid eit tap. Difor `riv`: knappen står, ordet
   * seier kor mange, angre tek dei attende — og «fiks alt» rører han ikkje.
   */
  const ordenRiv = (): Fiks | undefined => {
    const fast = s.montering.brot
    if (!fast.length) return undefined
    const att = lesPlan(p.plan).filter((q) => !fast.includes(q.id))
    if (!att.length) return undefined
    return { ord: `ta bort dei ${nn(fast.length)} som står fast`, set: { plan: skrivPlan(att) }, riv: true }
  }

  /**
   * TO PLAN SOM STÅR FOR TETT: TA BORT DET EINE.
   *
   * Regelen sitt eige «kvifor» seier dei to botemidla: flytt det eine,
   * eller ta det bort. Det fyrste kan reiskapen ikkje gjere for deg — han
   * veit ikkje kva du ville med planet, og å skuve eit plan er noko du
   * gjer med fingeren på det.
   *
   * Det andre kan han. Lukene vert målte med DEN SAME funksjonen som talet
   * i tavla er rekna med — `lukene` i `snitt.ts` — og ribbene ligg i lista
   * i den rekkjefylgja plana står. So går han gjennom dei ein gong: eit
   * plan som står for tett på eitt som alt er halde, fell. Det som står att
   * har luke nok mot kvart av dei andre, og det er den same rekninga
   * regelen les etterpå.
   *
   * To rekningar her ville vore verre enn ingen knapp: han ville teke plan
   * regelen ikkje klaga på, eller late dei stå medan lina var raud. Ei
   * bøygd flate er nett der dei to ville skilt lag — normalen hennar er
   * normalen der buen byrjar, og flata sjølv ligg ein annan stad.
   *
   * `riv`: knappen står, ordet seier kor mange, angre tek dei attende — og
   * «fiks alt» rører han ikkje. Eit trykk som tek tjuefire plan du har sett
   * skal vera eit trykk du meinte.
   */
  const opningRiv = (): Fiks | undefined => {
    if (m.minGap >= 3) return undefined
    const maal = lukene(s.ribber.map((r) => ({ r: r.r, ringar: r.raa })), p.tjukn)
    const heldt: number[] = []
    const ute = new Set<number>()
    for (let i = 0; i < s.ribber.length; i++) {
      if (heldt.some((h) => maal.luka(h, i, 3) < 3)) ute.add(s.ribber[i].plan.id)
      else heldt.push(i)
    }
    if (!ute.size) return undefined
    const att = lesPlan(p.plan).filter((q) => !ute.has(q.id))
    if (!att.length) return undefined
    return { ord: `ta bort dei ${nn(ute.size)} som står for tett`, set: { plan: skrivPlan(att) }, riv: true }
  }

  /**
   * OG NÅR TO DELAR STÅR I KVARANDRE: TA EITT PLAN UT — EITT.
   *
   * Fyrste utgåva tok alle på ein gong, grådig, og `pnpm raad` felte henne:
   * to nye harde brot i staden for eitt. Grunnen er at KLEMMA HENG I SPORA.
   * Tek du eit plan bort, misser naboane spora dei hadde mot det, godset
   * kjem attende, og par som stod fritt klemmer no. Ei liste rekna på den
   * gamle geometrien seier ikkje noko om den nye — og tek du nok plan til
   * at alle dei gamle para er borte, grip ingenting lenger.
   *
   * Difor eitt plan: det som er med i flest par. Målt over dei nitten
   * innebygde formene som klemmer, rutenett 6×6, ved å trykkje knappen om
   * att til talet er null: åtte og førti steg, og talet FALL i sju og
   * førti av dei og stod stille i eitt. Det steig aldri. Kvar form er
   * klemmefri etter høgst fem trykk, og har enno sju plan att av tolv.
   *
   * Som `ordenFiks` er dette eit råd som gjer det betre og ikkje ferdig.
   * `riv` av di det tek eit plan du sette — «fiks alt» skal ikkje rive
   * arbeid — og ordet seier kva som ryk.
   */
  const klemRiv = (): Fiks | undefined => {
    const par = s.montering.klem
    if (!par.length) return undefined
    const tel = new Map<number, number>()
    for (const [a, b] of par) {
      tel.set(a, (tel.get(a) ?? 0) + 1)
      tel.set(b, (tel.get(b) ?? 0) + 1)
    }
    let verst = 0
    let flest = 0
    for (const [id, n] of tel) if (n > flest || (n === flest && id > verst)) { flest = n; verst = id }
    const blir = lesPlan(p.plan).filter((q) => q.id !== verst)
    if (!blir.length) return undefined
    return { ord: `ta bort plan ${verst} · ${nn(flest)} av ${nn(par.length)} par`, set: { plan: skrivPlan(blir) }, riv: true }
  }

  // --- 1 plana grip (hard) ----------------------------------------------------
  add({
    id: "grip",
    rad: "ledd",
    label: "plana grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at plana ikkje kryssar kvarandre der kroppen har gods, eller at det står for få av dei til at nokon møtest. Er nokre avviste, kryssa dei — men det stod for lite gods ved sida av sporet til at noko heldt. Rutenettet på lina set kolonner og rader med to fingrar.",
  })

  // --- 2 delane finst (hard) --------------------------------------------------
  add({
    id: "delar",
    rad: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen plan råka nettet. Anten står plana utanfor kroppen, eller so er nettet so tynt at kvar profil fell under minstearealet — eller du har ikkje låst noko enno. Rutenettet på lina set kolonner og rader med to fingrar.",
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
    fiks: raad ? (ordenFiks() ?? ordenRiv()) : undefined,
  })

  // --- 3b ingen delar står i kvarandre (hard) ---------------------------------
  /**
   * «Kan monterast» spør om ein del har ÉI retning inn. Denne spør om det
   * finst ein stad å gjere av han når han er komen: to delar som har gods
   * på den same lina etter at spora er skorne, står i kvarandre.
   *
   * Det er eit anna brot, og eit langt vanlegare. Møtet deira vart nekta av
   * skuldra — det stod ikkje gods nok ved sida av sporet — so ingen av dei
   * fekk spor, og båe står att med fullt gods der dei kryssar. Målt på dei
   * tjue innebygde formene med rutenett 6×6: nitten har minst eitt slikt
   * par, og «kan monterast» stod grøn på alle tjue.
   */
  const klem = s.montering.klem
  add({
    id: "klem",
    label: "ingen står i kvarandre",
    hard: true,
    ok: klem.length === 0,
    value: klem.length ? `${nn(klem.length)} par klemmer: ${klem.slice(0, 4).map(([a, b]) => `${a}–${b}`).join(", ")}${klem.length > 4 ? " …" : ""}` : "ingen klemmer",
    why: "To plan kryssar der begge har gods, men møtet fekk ikkje spor: det stod for lite gods ved sida av sporet til at noko heldt. Godset står difor att i båe, og dei to delane skal vera same staden — det går ikkje i hop, same rekkjefylgje du tek. Eit grovare rutenett er det som hjelper oftast; tynnare plate gjev færre, tjukkare gjev fleire.",
    fiks: raad ? klemRiv() : undefined,
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
    why: "Sporet er tjukna pluss klaringa, so talet gjeld den MÅLTE plata: 3 mm MDF måler jamt 2,8–2,9, og set du 3 er sporet 0,2 for vidt før klaringa er talt med. Mål plata med skyvelær og set tjukna til det. Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast. Passprøva skjer heile stigen og let deg kjenne etter.",
    fiks: p.klaring < 0.05 || p.klaring > 0.35 ? { ord: "prøv 0,10 mm", set: { klaring: 0.1 } } : undefined,
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
    fiks: raad ? opningRiv() : undefined,
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
    ok: m.tris >= NETT_MINST || m.tris >= m.srcTris,
    value: `${nn(m.tris)} av ${nn(m.srcTris)}`,
    why: "Trekanttaket står på det lågaste hakket sitt, og nettet hadde meir å gje. Plana vert lesne av nett desse trekantane, so profilen er so grov som dei er. Skru opp taket.",
    fiks: raad ? nettFiks() : undefined,
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

  /**
   * BØYEN, MOT DET MATERIALET FAKTISK TOLER (hard).
   *
   * Ei plate som vert bøygd strekkjer ytterfiberen: `ε = t / 2R`. Går han
   * forbi det materialet toler, sprekk plata — og ho sprekk i verkstaden,
   * ikkje på skjermen. Difor er dette ein HARD regel og ikkje eit råd.
   *
   * Faktorane er `R_min / t`, og dei er kaldbøying utan damp:
   *
   *   kryssfinér  100   ε 0,5 %   på tvers av fiberen i ytterlaget
   *   mdf         200   ε 0,25 %  sprøtt, og bøyer seg dårleg utan snitt
   *   akryl       230   ε 0,2 %   kaldt krakelerer han; varmt er ei anna sak
   *   papp         10   ε 5 %
   *
   * Talet er konservativt med vilje: langs fiberen toler finéren under
   * halvparten av det han gjer på tvers, og verkstaden veit ikkje kva veg
   * plata ligg.
   *
   * OG DEN VEGEN GJEKK STEG TO: kerfsnitta er skrivne, og tabellen bur i
   * `rille.ts` saman med mønsteret som er svaret på han. To kopiar av dette
   * talet ville vore to meiningar om kva finér toler.
   *
   * REGELEN ER DIFOR IKKJE LENGER HARD. Under grensa vert plata RILLA, og
   * det er ei avgjerd og ikkje ein feil: du får ei flate som bøyer seg, mot
   * mindre gods og ein lengre køyretur. Regelen seier kva det kostar. Han
   * står raud berre når mønsteret ikkje KAN leggjast — når fasetten vert
   * grovare enn plata er tjukk, og forma du ser ikkje er den du får.
   */
  const bogMin = bogMinAv(String(p.material), p.tjukn)
  const boygde = lesPlan(p.plan).filter((q) => q.bog)
  /** den strammaste radien i lista, i millimeter */
  const strammast = boygde.reduce((m, q) => Math.min(m, p.storleik / Math.abs(q.bog)), Infinity)
  /**
   * OG KVA MØNSTERET KOSTAR, NÅR HAN FYRST VERT LAGD.
   *
   * Under grensa vert plata rilla, og då er spørsmålet ikkje lenger om ho
   * sprekk — det er om mønsteret i det heile LET SEG LEGGJE. Éin ting
   * stengjer for det, og han er geometri: SNITTET ET RADA. Er avstanden
   * mellom to rader ikkje romsleg større enn snittet er breitt, er det ikkje
   * eit hengsle — det er ei rad hòl med ingenting imellom. Ein grov fres i ei
   * tynn plate kjem hit, og han er den einaste som gjer det.
   *
   * KVA REGELEN IKKJE SEIER: om brua held. Det er eit vridingsproblem i eit
   * materiale som ikkje er likt i to retningar, og det talet står ikkje her,
   * av di det ikkje er lese av geometrien. Skjer ein prøvestrimmel.
   */
  const mal = rilleMal(strammast, p.tjukn, String(p.material))
  const kanRilla = mal.steg > 3 * p.snitt
  const stram = boygde.length > 0 && strammast < bogMin
  add({
    id: "bog",
    label: "bøyeradius",
    hard: stram && !kanRilla,
    ok: !stram || kanRilla,
    value: !boygde.length
      ? "ingen bøygde plan"
      : !stram
        ? `${mm1(strammast)} av minst ${mm1(bogMin)}`
        : kanRilla
          ? `${mm1(strammast)} — rilla, ${nn(mal.steg, 1)} mm steg`
          : `${mm1(strammast)} av minst ${mm1(bogMin)}`,
    why: stram && !kanRilla
      ? `Ei plate som vert bøygd strekkjer ytterfiberen med t/2R, og ${nn(p.tjukn, 1)} mm ${p.material} toler ned til ${mm1(bogMin)}. Strammare enn det må ho RILLAST — rader med snitt på tvers av bøyen tek vekk godset som elles vart strekt — og her går ikkje det: snittbreidda på ${nn(p.snitt, 1)} mm et opp ei rad på ${nn(mal.steg, 1)} mm. Rett ut bøyen, ta eit finare snitt, eller ei tjukkare plate — rada fylgjer tjukna.`
      : `Under ${mm1(bogMin)} vert plata RILLA: rader med snitt på tvers av bøyen, ${nn(mal.steg, 1)} mm mellom kvar, som tek vekk godset som elles vart strekt. Rundt kvart spor står ei stiv øy — godset som ber eit ledd skal ikkje vera perforert. Prisen er kuttlengd og mindre gods. Om brua held er ikkje rekna her: skjer ein prøvestrimmel.`,
    fiks:
      stram && !kanRilla
        ? {
            ord: `rett ut til ${nn(bogMin)} mm`,
            set: {
              plan: skrivPlan(
                lesPlan(p.plan).map((q) =>
                  q.bog && p.storleik / Math.abs(q.bog) < bogMin
                    ? { ...q, bog: +(Math.sign(q.bog) * (p.storleik / bogMin)).toFixed(4) }
                    : q,
                ),
              ),
            },
          }
        : undefined,
  })

  /**
   * OG EI BØYGD RIBBE UTAN LEDD HENG IKKJE I NOKO (hard).
   *
   * Spor-maskineriet byggjer på at møtet har éi line og éi krumming. To
   * plan møtest alltid i ei line. Ein sylinder og eit plan gjer det i to
   * tilfelle, og dei er ytterpunkta av kvarandre: ligg planet LANGS
   * sylinderaksen er møtet ein generator (`kryssBoygd`), og står det
   * VINKELRETT på han er møtet ein sirkel med sylinderradien
   * (`kryssRing`). Det fyrste er «krumt skal med flate ribber på tvers»,
   * det andre er «krumt skal med golv», og saman er dei det eit skal
   * faktisk vert halde av.
   *
   * Resten står att: eit plan som SKRÅR mot aksen møter sylinderen i eit
   * kjeglesnitt som korkje rettar seg ut eller vert ein sirkel, og to
   * bøygde flater i ei romkurve. Ei bøygd ribbe som ikkje fann eit einaste
   * ledd kjem ut som ei laus plate, og regelen seier det i staden for å
   * late deg finne det i eska.
   *
   * Difor tel han RIBBER UTAN SPOR og ikkje bøygde plan: det er skilnaden
   * på «bøygd» og «laus», og etter steg éin er dei to ikkje lenger det same.
   */
  const lauseBog = s.ribber.filter((r) => !!r.r.k && !r.spor.length)
  add({
    id: "bogledd",
    label: "ledd på bøygde plan",
    hard: lauseBog.length > 0,
    ok: lauseBog.length === 0,
    value: lauseBog.length
      ? `${nn(lauseBog.length)} plan utan ledd`
      : boygde.length
        ? `${nn(boygde.length)} bøygde, alle med ledd`
        : "ingen",
    why: "Ei bøygd ribbe får spor på to måtar: eit flatt plan LANGS sylinderaksen hennar møter henne i ei rett line, og eit flatt plan VINKELRETT på aksen — eit golv — møter henne i ein sirkelboge med sylinderradien. Desse ribbene fann ingen av delane: eit plan som SKRÅR mot aksen møter flata i ei kurve som korkje er det eine eller det andre, og den finnaren er ikkje skriven. Dei kjem ut som lause plater du må feste sjølv. Rett ut bøyen, legg eit plan langs aksen, eller eit golv på tvers av han.",
    fiks: lauseBog.length
      ? {
          // berre DEI SOM HENG LAUST. Å rette ut alle ville teke bøyen av
          // ribber som gjer nett det dei skal.
          ord: lauseBog.length === boygde.length ? "rett ut alle" : "rett ut dei lause",
          set: {
            plan: skrivPlan(
              lesPlan(p.plan).map((q) => (lauseBog.some((r) => r.plan.id === q.id) ? { ...q, bog: 0 } : q)),
            ),
          },
        }
      : undefined,
  })

  /**
   * OG DEI MØTA SOM ER KURVER (mjuk).
   *
   * Den harde regelen over tel ribber UTAN SPOR. Ei bøygd ribbe som har eit
   * plan langs aksen sin ER festa, og gjekk difor grøn gjennom han — medan
   * kvart plan som SKRÅR mot aksen fall bort i stille. Eit krumt skal med
   * tak og botn melde fire og tjue ledd og sa ingenting om dei åtte som
   * skulle halde golva. Dei åtte er ledd no (`kryssRing`); talet står att
   * for det som framleis fell, og det er dei SKRÅ plana.
   *
   * Difor står dette talet ved sida av det harde: ikkje «ribba heng laust»,
   * men «so mange møte vart ikkje ledd, og delane kjem ut utan spor for
   * kvarandre der». Mjuk, av di delane framleis let seg skjere og setje
   * saman — dei grip berre i færre stader enn du sikta på.
   */
  const kurvePlan = [...new Set(s.kurva)]
  add({
    id: "bogkurve",
    label: "møte på bøygde plan",
    hard: false,
    ok: s.kurva.length === 0,
    value: s.kurva.length
      ? `${nn(s.kurva.length)} møte er kurver`
      : boygde.length
        ? "ingen"
        : "ingen bøygde",
    why: "Eit flatt plan som SKRÅR mot sylinderaksen til eit bøygt plan møter det i eit kjeglesnitt, og den finnaren er ikkje skriven. Møta er talde her og vart ikkje ledd: dei to delane kjem ut utan spor for kvarandre. Legg planet LANGS aksen, eller VINKELRETT på han — då er møtet ei line eller ein sirkelboge, og båe ber spor — eller rett ut bøyen.",
    fiks: raad && kurvePlan.length ? bogKurveFiks(kurvePlan) : undefined,
  })

  return out
}

