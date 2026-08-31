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
 */
import { DETAIL } from "./ribs"
import { makeKropp } from "./kropp"
import { makePlan } from "./plan"
import { checkRules } from "./rules"
import type { Params } from "./params"

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
 */
export function* tuneSteg(
  p: Params,
): Generator<{ gjort: number; av: number }, Kandidat[], void> {
  const k = makeKropp(p)
  const spennX = Math.max(1, k.solid.max[0] - k.solid.min[0])
  const spennY = Math.max(1, k.solid.max[1] - k.solid.min[1])

  const ut: Kandidat[] = []
  /** kva harde reglar som fall, eller tom liste om han held */
  const prov = (ribbX: number, ribbY: number, ledd: number): string[] => {
    const q: Params = { ...p, ribbX, ribbY, ledd }
    try {
      const plan = makePlan(q, DETAIL.lav)
      const m = {
        parts: plan.pl.parts.length,
        sheets: plan.ns.sheets.length,
        joints: plan.g.joints,
        util: plan.ns.util,
        minGap: Math.min(plan.g.gapX, plan.g.gapY),
        loose: plan.pl.lause + plan.g.kasta,
      }
      if (m.parts === 0 || m.sheets === 0) return ["tom"]
      // Dei harde reglane er eit ja eller nei, ikkje eit trekk i summen.
      const fall = checkRules(q, maal(q, plan), plan)
        .filter((r) => r.hard && !r.ok)
        .map((r) => r.id)
      if (fall.length) return fall
      ut.push({ ribbX, ribbY, ledd, poeng: poengOf(q, m), ...m })
      return []
    } catch {
      // Ein kandidat som kastar er ein kandidat som ikkje finst.
      return ["kasta"]
    }
  }

  const liste = kandidatar(p, spennX, spennY)
  yield { gjort: 0, av: liste.length }
  for (let i = 0; i < liste.length; i++) {
    const [x, y] = liste[i]
    // Leddelinga står midt på. Ho rører ingen av tala i summen — ho
    // flyttar sporbotnen, og det ser du berre i godset — so å prøve
    // henne på alle er å rekne det same tre gonger. Men på ei form der
    // godset er tynt kan ho vera skilnaden på ein hard regel som held og
    // ein som brest, og DÅ er ho verd ei rekning. Difor: berre som
    // redning, og berre for dei som fall.
    const fall = prov(x, y, 0.5)
    // Berre EIN ting leddelinga kan berge: godset under sporbotnen. Fall
    // kandidaten på noko anna — for få ledd, for lite plass på plata —
    // hjelper det ikkje å flytte sporbotnen, og då er dei to ekstra
    // rekningane berre venting.
    if (fall.length === 1 && fall[0] === "gods") {
      if (prov(x, y, 0.35).length) prov(x, y, 0.65)
    }
    yield { gjort: i + 1, av: liste.length }
  }
  ut.sort((a, b) => b.poeng - a.poeng)
  return ut
}

/** heile søket i eitt jafs, for den som ikkje har bruk for framdrifta */
export function tune(p: Params): Kandidat[] {
  const it = tuneSteg(p)
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
