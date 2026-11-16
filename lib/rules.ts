import { bbox, nn, type Fiks, type Metrics, type Rule, type Vec3 } from "./core"
import { measure } from "./metrics"
import { fitRoom } from "./pack"
import { makeBygg, nestGap, type Bygg } from "./bygg"
import { makeKropp } from "./kropp"
import { buildSnitt, DETAIL, lukene, type Snitt } from "./snitt"
import { bogRadius, dot, lesPlan, skrivPlan } from "./plan"
import { bogMin as bogMinAv, rilleMal } from "./rille"
import { PARAM_RANGES, SNITTVEGAR, lesFest, skrivFest, type Params } from "./params"

const mm1 = (v: number) => nn(v, 1) + " mm"
const mm2 = (v: number) => nn(v, 2) + " mm"

const NETT_MINST = 500

const narrowOf = (s: Snitt) => s.ribber.reduce((m, r) => (r.spor.length || r.tapp.some((q) => q.slag === "slisse") ? Math.min(m, r.narrow) : m), Infinity)

type Inn = { d: Vec3; pil: boolean }
const saman = (a: Inn, b: Inn, par: number) => (a.pil && b.pil ? dot(a.d, b.d) >= par : Math.abs(dot(a.d, b.d)) >= par)

function ordna(s: Snitt): number[] | null {
  const liner = new Map<number, Map<number, Inn>>()
  for (const r of s.ribber) {
    const m = new Map<number, Inn>()
    for (const q of r.tapp) {
      if (!m.has(q.mot)) m.set(q.mot, { d: q.slag === "tapp" ? q.inn : [-q.inn[0], -q.inn[1], -q.inn[2]], pil: true })
    }
    for (const q of (r.r.k ? [] : r.spor)) {
      const d: Vec3 = [
        q.d[0] * r.r.u[0] + q.d[1] * r.r.v[0],
        q.d[0] * r.r.u[1] + q.d[1] * r.r.v[1],
        q.d[0] * r.r.u[2] + q.d[1] * r.r.v[2],
      ]
      if (!m.has(q.mot)) m.set(q.mot, { d, pil: false })
    }
    liner.set(r.plan.id, m)
  }
  const att = s.ribber.map((r) => r.plan.id)
  const lagt: number[] = []
  const par = Math.cos((3 * Math.PI) / 180)
  const klassar = (id: number) => {
    const ds: Inn[] = []
    for (const d of (liner.get(id) ?? new Map<number, Inn>()).values()) {
      if (!ds.some((e) => saman(e, d, par))) ds.push(d)
    }
    return ds.length
  }
  const kan = (id: number) => strid(id) === 0
  const strid = (id: number) => {
    const ds: Inn[] = []
    for (const [mot, d] of liner.get(id) ?? []) {
      if (!lagt.includes(mot)) continue
      ds.push(d)
    }
    let verst = 0
    for (let a = 0; a < ds.length; a++) {
      for (let b = a + 1; b < ds.length; b++) {
        if (!saman(ds[a], ds[b], par)) verst++
      }
    }
    return verst
  }
  const stengjer = (id: number) => {
    lagt.push(id)
    let n = 0
    for (const x of att) if (x !== id && strid(x) > 0) n++
    lagt.pop()
    return n
  }
  while (att.length) {
    let best = -1
    let bestSteng = Infinity
    for (let i = 0; i < att.length; i++) {
      if (!kan(att[i])) continue
      const st = stengjer(att[i])
      if (best < 0 || st < bestSteng || (st === bestSteng && klassar(att[i]) > klassar(att[best]))) {
        best = i
        bestSteng = st
      }
    }
    if (best < 0) {
      for (let i = 0; i < att.length; i++) {
        if (best < 0 || strid(att[i]) < strid(att[best])) best = i
      }
    }
    lagt.push(att.splice(best, 1)[0])
  }
  return lagt
}

const posen = (q: Params) =>
  Object.keys(q)
    .sort()
    .map((k) => `${k}=${String((q as unknown as Record<string, unknown>)[k])}`)
    .join("|")

export function fiksAlt(p: Params): { p: Params; runder: number; fiksa: string[]; att: string[] } {
  const evaluer = (q: Params) => {
    const bygg = makeBygg(q, DETAIL.mid)
    const m = measure(q, bygg)
    const rs = checkRules(q, m, bygg, true)
    let hard = 0
    let soft = 0
    for (const r of rs) {
      if (r.ok) continue
      if (r.hard) hard++
      else soft++
    }
    return { rs, hard, soft }
  }
  let naa = p
  let tilstand = evaluer(naa)
  const sett = new Set<string>([posen(naa)])
  const fiksa: string[] = []
  for (let runde = 0; runde < 16; runde++) {
    const vonde = tilstand.rs
      .filter((q) => !q.ok && q.fiks && !q.fiks.riv)
      .sort((a, b) => Number(b.hard) - Number(a.hard))
    if (!vonde.length) break
    let bestQ: (typeof vonde)[number] | null = null
    let bestP: Params | null = null
    let bestTilstand: ReturnType<typeof evaluer> | null = null
    for (const q of vonde) {
      const prov = { ...naa, ...q.fiks!.set } as Params
      const k = posen(prov)
      if (sett.has(k)) continue
      const etter = evaluer(prov)
      if (etter.hard > tilstand.hard) continue
      if (etter.hard === tilstand.hard && etter.soft >= tilstand.soft && !q.hard) continue
      if (
        !bestTilstand ||
        etter.hard < bestTilstand.hard ||
        (etter.hard === bestTilstand.hard && etter.soft < bestTilstand.soft)
      ) {
        bestQ = q
        bestP = prov
        bestTilstand = etter
        if (etter.hard === 0 && etter.soft === 0) break
      }
    }
    if (!bestP || !bestTilstand || !bestQ) break
    naa = bestP
    tilstand = bestTilstand
    sett.add(posen(naa))
    fiksa.push(bestQ.id)
  }
  const att = tilstand.rs.filter((q) => !q.ok && q.hard).map((q) => q.label)
  return { p: naa, runder: fiksa.length, fiksa, att }
}

export function checkRules(p: Params, m: Metrics, bygg?: Bygg, raad = true): Rule[] {
  const { k, s, dl, ns } = bygg ?? makeBygg(p, DETAIL.mid)
  const out: Rule[] = []
  const add = (r: Rule) => {
    if (!raad) delete r.fiks
    out.push(r)
  }

  const plateFiks = (): Fiks | undefined => {
    const f = lesFest(p.fest)
    if (ns.kross > 0) {
      for (const sh of ns.sheets) for (const q of sh.placed) if (q.slot.kross) f.delete(q.part.adr)
    }
    const slepp: Record<string, string | number> = ns.kross > 0 ? { fest: skrivFest(f) } : {}
    if (ns.spilt === 0 && ns.kross > 0) {
      return { ord: "slepp dei", set: slepp }
    }
    if (ns.spilt === 0) return undefined
    const { w: romB, h: romH } = fitRoom(p.arkB, p.arkH, nestGap(p))
    let verst = 1
    let lang = 0
    let kort = 0
    for (const q of dl.delar) {
      const b = bbox(q.outline)
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      if (w <= 0 || h <= 0) continue
      verst = Math.min(verst, Math.max(Math.min(romB / w, romH / h), Math.min(romB / h, romH / w)))
      lang = Math.max(lang, Math.max(w, h))
      kort = Math.max(kort, Math.min(w, h))
    }
    const voksArk = () => {
      const opp = (v: number) => Math.ceil(v / 50) * 50
      let B = Math.max(p.arkB, opp(lang))
      let H = Math.max(p.arkH, opp(kort))
      for (let i = 0; i < 20; i++) {
        const rom = fitRoom(B, H, nestGap(p))
        if (rom.w >= lang && rom.h >= kort) break
        if (rom.w < lang) B += 50
        if (rom.h < kort) H += 50
      }
      B = Math.min(B, PARAM_RANGES.arkB.max)
      H = Math.min(H, PARAM_RANGES.arkH.max)
      return B > p.arkB || H > p.arkH ? { ord: `prøv ${nn(B)} × ${nn(H)}`, set: { ...slepp, arkB: B, arkH: H } } : undefined
    }
    if (lesPlan(p.plan).some((q) => q.omriss)) return voksArk()
    const effVerst = verst < 1 ? verst : 0.96
    const raa = Math.min(PARAM_RANGES.storleik.max, p.storleik * effVerst * 0.98)
    const ny = Math.max(PARAM_RANGES.storleik.min, Math.floor(raa / 5) * 5)
    if (ny < p.storleik && lang * (ny / Math.max(1, p.storleik)) <= Math.max(romB, romH)) {
      return { ord: `prøv ${nn(ny)} mm`, set: { ...slepp, storleik: ny } }
    }
    return voksArk() ?? (ny < p.storleik ? { ord: `prøv ${nn(ny)} mm`, set: { ...slepp, storleik: ny } } : undefined)
  }

  const nettFiks = (): Fiks | undefined => {
    if (m.tris >= NETT_MINST || m.tris >= m.srcTris) return undefined
    for (const t of [1, 2, 5, 10, 20, 40]) {
      if (t <= p.trekant || t > PARAM_RANGES.trekant.max) continue
      const k2 = makeKropp({ ...p, trekant: t })
      if (k2.soup.tris >= NETT_MINST || k2.soup.tris >= k2.srcTris) {
        return { ord: `prøv ${nn(t)} k`, set: { trekant: t } }
      }
    }
    return undefined
  }

  const snittFiks = (): Fiks | undefined => {
    if (p.snitt < m.slotW) return undefined
    const ny = Math.max(PARAM_RANGES.snitt.min, +(Math.floor((m.slotW * 0.5) / 0.05) * 0.05).toFixed(2))
    return ny < p.snitt && ny < m.slotW ? { ord: `prøv ${mm2(ny)}`, set: { snitt: ny } } : undefined
  }

  const godsFiks = (): Fiks | undefined => {
    if (m.narrow >= minGods) return undefined
    let bestL: number | null = null
    let bestN = m.narrow
    for (const l of [0.5, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8]) {
      if (l < PARAM_RANGES.ledd.min || l > PARAM_RANGES.ledd.max || Math.abs(l - p.ledd) < 0.02) continue
      const s2 = buildSnitt(k, { ...p, ledd: l }, DETAIL.mid)
      if (!s2.ledd || s2.ledd < s.ledd) continue
      const nw = narrowOf(s2)
      if (nw >= minGods) {
        return { ord: Math.abs(l - 0.5) < 0.01 ? "del i midten" : `del ${nn(l * 100)} %`, set: { ledd: l } }
      }
      if (nw > bestN + 0.3) {
        bestN = nw
        bestL = l
      }
    }
    return bestL !== null ? { ord: `del ${nn(bestL * 100)} %`, set: { ledd: bestL } } : undefined
  }

  const bogKurveFiks = (idar: readonly number[]): Fiks | undefined => {
    const ny = skrivPlan(lesPlan(p.plan).map((q) => (idar.includes(q.id) ? { ...q, bog: 0 } : q)))
    if (ny === p.plan) return undefined
    const etter = buildSnitt(k, { ...p, plan: ny }, DETAIL.mid)
    if (etter.kurva.length || etter.ledd <= s.ledd) return undefined
    return {
      ord: idar.length === 1 ? "rett ut det eine" : `rett ut dei ${nn(idar.length)}`,
      set: { plan: ny },
      riv: true,
    }
  }

  const ordenFiks = (): Fiks | undefined => {
    const foer = s.montering.brot.length
    if (!foer) return undefined
    const plan = lesPlan(p.plan)
    const provOrden = (ids: readonly number[]) => {
      const ny = skrivPlan(ids.map((id) => plan.find((q) => q.id === id)!).filter(Boolean))
      if (ny === p.plan) return null
      const etter = buildSnitt(k, { ...p, plan: ny }, DETAIL.mid).montering.brot.length
      return etter < foer ? { ny, etter } : null
    }
    let best: { ny: string; etter: number } | null = null
    const ord = ordna(s)
    if (ord) best = provOrden(ord)
    if (!best || best.etter > 0) {
      for (const bid of s.montering.brot.slice(0, 3)) {
        for (const mot of s.montering.bunde[bid] ?? []) {
          const ids = plan.map((q) => q.id).filter((id) => id !== bid)
          const idx = ids.indexOf(mot)
          if (idx < 0) continue
          ids.splice(idx, 0, bid)
          const cand = provOrden(ids)
          if (cand && (!best || cand.etter < best.etter)) best = cand
        }
      }
    }
    if (!best) return undefined
    return { ord: best.etter ? `byt rekkjefylgje: ${foer} → ${best.etter} fast` : "byt rekkjefylgje", set: { plan: best.ny } }
  }

  const ordenRiv = (): Fiks | undefined => {
    const fast = s.montering.brot
    if (!fast.length) return undefined
    const att = lesPlan(p.plan).filter((q) => !fast.includes(q.id))
    if (!att.length) return undefined
    return { ord: `ta bort dei ${nn(fast.length)} som står fast`, set: { plan: skrivPlan(att) }, riv: true }
  }

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

  add({
    id: "grip",
    rad: "ledd",
    label: "plana grip",
    hard: true,
    ok: m.joints > 0,
    value: `${nn(m.joints)} ledd`,
    why: "Utan eit einaste kryssledd er dette ikkje eit objekt, men ein bunke laust liggjande plater. Vanlegaste grunnen er at plana ikkje kryssar kvarandre der kroppen har gods, eller at det står for få av dei til at nokon møtest. Er nokre avviste, kryssa dei — men det stod for lite gods ved sida av sporet til at noko heldt. Rutenettet på lina set kolonner og rader med to fingrar.",
  })

  add({
    id: "delar",
    rad: "delar",
    label: "delar å skjere",
    hard: true,
    ok: m.parts > 0,
    value: `${nn(m.parts)} stk`,
    why: "Ingen plan råka nettet. Anten står plana utanfor kroppen, eller so er nettet so tynt at kvar profil fell under minstearealet — eller du har ikkje låst noko enno. Rutenettet på lina set kolonner og rader med to fingrar.",
  })

  const brot = s.montering.brot
  add({
    id: "orden",
    label: "kan monterast",
    hard: true,
    ok: brot.length === 0,
    value: brot.length
      ? `${nn(brot.length)} står fast: ${brot.slice(0, 2).map((id) => { const par = s.montering.bunde[id]; return par ? `${id} mellom ${par[0]} og ${par[1]}` : String(id) }).join(", ")}${brot.length > 2 ? " …" : ""}`
      : "éin veg inn for kvar",
    why: "Ein del vert skuva inn langs spora sine, og eit spor går langs lina der dei to plana kryssar. Delen her har ledd mot to delar som alt ligg, langs liner som ikkje er parallelle, og han kan berre gå éin veg. Verdien seier kva for to han står mellom. Byt rekkjefylgja, so han kjem inn før den eine av dei; vinkle planet om, so dei to linene vert parallelle; eller flytt han ut av vegen til den eine. Med to familiar ribber som kryssar kvarandre vert det alltid éin som kjem sist, og han er bunden av båe — ei plate på tvers av eit rutenett går ikkje i hop med spor åleine.",
    fiks: raad ? (ordenFiks() ?? ordenRiv()) : undefined,
  })

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

  add({
    id: "klaring",
    label: "klaring",
    hard: false,
    ok: p.klaring >= 0.05 && p.klaring <= 0.35,
    value: mm2(p.klaring),
    why: "Sporet er tjukna pluss klaringa, so talet gjeld den MÅLTE plata: 3 mm MDF måler jamt 2,8–2,9, og set du 3 er sporet 0,2 for vidt før klaringa er talt med. Mål plata med skyvelær og set tjukna til det. Under 0,05 mm får du ikkje delane i hop utan hammar, og finér som vert slegen i hop flisar seg. Over 0,35 mm sit dei ikkje fast. Passprøva skjer heile stigen og let deg kjenne etter.",
    fiks: p.klaring < 0.05 || p.klaring > 0.35 ? { ord: "prøv 0,10 mm", set: { klaring: 0.1 } } : undefined,
  })

  add({
    id: "snitt",
    label: "snittbreidd",
    hard: false,
    ok: p.snitt > 0,
    value: p.snitt > 0 ? `${mm2(p.snitt)} ${SNITTVEGAR[p.snittveg] ?? ""}`.trim() : "null",
    why: "Stråla har breidd, og kutten et henne ut av delen. Er snittbreidda null, kompenserer korkje fila eller maskina for henne: kvart spor kjem ut ei snittbreidd for vidt. Passprøva måler henne og klaringa i eitt.",
    fiks: p.snitt > 0 ? undefined : { ord: "prøv 0,2 mm", set: { snitt: 0.2 } },
  })

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

  add({
    id: "lukka",
    rad: "kantar",
    label: "lukka nett",
    hard: false,
    ok: m.openEdges === 0,
    value: m.openEdges ? `${nn(m.openEdges)} opne kantar` : "lukka",
    why: "Snittinga les nettet med strålar og tel kva veg kvar trekant vender. Eit nett med hòl i har ingen innside å telje, og då kan ein profil kome ut som eit stykke der han skulle vore to.",
  })

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

  add({
    id: "utnytting",
    rad: "utnytting",
    label: "utnytting",
    hard: false,
    ok: m.util >= 0.35 || m.sheets <= 1,
    value: `${nn(m.util * 100)} %`,
    why: "Meir enn to tredelar av plata går i søppelbøtta. Prøv ei anna plate, eller færre og større delar. Pakkinga fylgjer omrisset og reknar hòla som ledig plass, so det som står att er luft ho ikkje fann nokon del til.",
  })

  const bogMin = bogMinAv(String(p.material), p.tjukn)
  const boygde = lesPlan(p.plan).filter((q) => q.bog)
  const strammast = boygde.reduce((m, q) => Math.min(m, bogRadius(q.bog, p.storleik)), Infinity)
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
                    ? { ...q, bog: +(Math.sign(q.bog) * (Math.floor((p.storleik / bogMin) * 10000) / 10000)).toFixed(4) }
                    : q,
                ),
              ),
            },
          }
        : undefined,
  })

  const lauseBog = s.ribber.filter((r) => !!r.r.k && !r.spor.length && !r.tapp.length)
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
          ord: lauseBog.length === boygde.length ? "rett ut alle" : "rett ut dei lause",
          set: {
            plan: skrivPlan(
              lesPlan(p.plan).map((q) => (lauseBog.some((r) => r.plan.id === q.id) ? { ...q, bog: 0 } : q)),
            ),
          },
        }
      : undefined,
  })

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
