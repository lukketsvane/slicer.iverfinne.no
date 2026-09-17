import type { ParamBag } from "../lib/core"
import { measure, RADER } from "../lib/metrics"
import { checkRules, fiksAlt } from "../lib/rules"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { MOTOR } from "../lib/motor"
import { meshToStl } from "../lib/export-stl"
import { parseMesh } from "../lib/io"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { lesPlan, rutenett, skrivPlan } from "../lib/plan"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }

let brot = 0
const ok = (namn: string, sant: boolean, kva = "") => {
  if (sant) console.log(`  ok   ${namn}${kva ? " · " + kva : ""}`)
  else {
    brot++
    console.log(`  FEIL ${namn}${kva ? " · " + kva : ""}`)
  }
}

function kula(r: number, seg: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [
      r * Math.sin(ph) * Math.cos(th),
      r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph),
    ]
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  const soup = makeSoup(new Float32Array(pos))
  const nrm = new Float32Array(soup.pos.length)
  for (let i = 0; i < nrm.length; i += 3) {
    const L = Math.hypot(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]) || 1
    nrm[i] = soup.pos[i] / L
    nrm[i + 1] = soup.pos[i + 1] / L
    nrm[i + 2] = soup.pos[i + 2] / L
  }
  const bytes = meshToStl({ positions: soup.pos, normals: nrm, tris: soup.tris }, "kule")
  return parseMesh("kule.stl", bytes.buffer.slice(0) as ArrayBuffer)
}
put("kule", "kule.stl", kula(50, 48))

function torus(R: number, r: number, n: number, m: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const u = (i / n) * Math.PI * 2
    const v = (j / m) * Math.PI * 2
    return [
      (R + r * Math.cos(v)) * Math.cos(u),
      (R + r * Math.cos(v)) * Math.sin(u),
      r * Math.sin(v),
    ]
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  return makeSoup(new Float32Array(pos))
}
put("torus", "torus", torus(50, 14, 48, 24))

function opnKube(S: number) {
  const pos: number[] = []
  const kvad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  kvad([-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S])
  kvad([-S, -S, S], [-S, S, S], [S, S, S], [S, -S, S])
  kvad([-S, -S, -S], [-S, -S, S], [S, -S, S], [S, -S, -S])
  kvad([-S, S, -S], [S, S, -S], [S, S, S], [-S, S, S])
  kvad([-S, -S, -S], [-S, S, -S], [-S, S, S], [-S, -S, S])
  return makeSoup(new Float32Array(pos))
}
put("opn", "opn", opnKube(50))

put("tynnring", "tynnring", torus(50, 3, 96, 24))

const raude = new Set<string>()
const reglane = (p: Params) => {
  const r = checkRules(p, measure(p))
  for (const q of r) if (!q.ok) raude.add(q.id)
  return r
}
const finn = (p: Params, id: string) => reglane(p).find((r) => r.id === id)

function prov(namn: string, id: string, p: Params, runder = 1) {
  let no = p
  const fyrst = finn(no, id)
  if (!fyrst) return ok(namn, false, `regelen «${id}» finst ikkje`)
  if (fyrst.ok) return ok(namn, false, "regelen braut ikkje til å byrje med")
  if (!fyrst.fiks) return ok(namn, false, "ingen fiks på ein regel som braut")

  const spor: string[] = [fyrst.value]
  for (let i = 0; i < runder; i++) {
    const r = finn(no, id)
    if (!r || r.ok) break
    if (!r.fiks) return ok(namn, false, `rådet tok slutt på «${r.value}»`)
    no = { ...no, ...r.fiks.set }
    spor.push(finn(no, id)?.value ?? "?")
  }
  const slutt = finn(no, id)
  const nadd = !!slutt && (slutt.ok || (fyrst.hard && !slutt.hard))
  ok(namn, nadd, spor.join(" → "))
}

console.log("rådet rettar det det seier:")

prov("for stort til plata", "plate", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  storleik: 1200,
  plan: nett(3, 3),
  arkB: 600,
  arkH: 400,
})
prov("for stort på ei lita plate òg", "plate", {
  ...DEFAULT_PARAMS,
  storleik: 900,
  plan: nett(4, 4),
  arkB: 300,
  arkH: 200,
})
prov("så vidt for stort", "plate", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  storleik: 300,
  plan: nett(3, 3),
  arkB: 420,
  arkH: 297,
})

{
  const side = (id: number, y: number) => ({ id, o: [0.5, y, 0.5] as [number, number, number], n: [0, 1, 0] as [number, number, number], bog: 0, strek: [], omriss: [[-0.4546, -0.5], [0.4546, -0.5], [0.4546, 0.41], [-0.4546, 0.41]] as [number, number][] })
  const p: Params = { ...DEFAULT_PARAMS, storleik: 450, tjukn: 12, plan: skrivPlan([side(1, 0.167), side(2, 0.833)]), arkB: 600, arkH: 400 }
  prov("teikna sider for store til arket", "plate", p)
  const r = finn(p, "plate")
  ok("og rådet er eit større ark, ikkje eit mindre objekt", !!r?.fiks && "arkB" in r.fiks.set && !("storleik" in r.fiks.set), r?.fiks ? `«${r.fiks.ord}»` : "ingen knapp")
}

{
  const p = { ...GRUNN, fest: "1:0,0,10,10;2:0,0,20,20;3:0,0,300,200" }
  prov("to feste i kvarandre", "plate", p)
  const r = finn(p, "plate")
  const etter = r?.fiks ? String(r.fiks.set.fest) : "?"
  ok("og det tredje festet står", etter.includes("3:") && !etter.includes("2:"), etter)
}

{
  const p: Params = { ...DEFAULT_PARAMS, storleik: 100, plan: nett(24, 24) }
  prov("plana står for tett", "opning", p)
  const r = finn(p, "opning")
  ok("og rådet seier at det riv arbeid", !!r?.fiks?.riv, r?.fiks ? `«${r.fiks.ord}»` : "ingen knapp")
  ok(
    "so «fiks alt» let plana stå",
    fiksAlt(p).p.plan === p.plan,
    `${lesPlan(fiksAlt(p).p.plan).length} plan att av ${lesPlan(p.plan).length}`,
  )
}

{
  const bogpar = (n: number) =>
    skrivPlan([
      ...Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        o: [0.3 + (0.4 * i) / (n - 1), 0.5, 0.5] as [number, number, number],
        n: [1, 0, 0] as [number, number, number],
        bog: i % 2 ? -0.9 : 0.9,
        strek: [],
      })),
      { id: 99, o: [0.5, 0.5, 0.5] as [number, number, number], n: [0, 1, 0] as [number, number, number], bog: 0, strek: [] },
    ])
  const p: Params = { ...DEFAULT_PARAMS, storleik: 300, tjukn: 3, plan: bogpar(4) }
  prov("bøygde ribber som krøkjer seg mot kvarandre", "opning", p)
  const flat = measure({ ...p, plan: skrivPlan(lesPlan(p.plan).map((q) => ({ ...q, bog: 0 }))) } as Params)
  ok(
    "og det er bøyen og ikkje grunnplana som gjer det",
    flat.minGap > 30 && measure(p).minGap < 3,
    `flat ${flat.minGap.toFixed(1)} mm, krum ${measure(p).minGap.toFixed(1)} mm`,
  )
}

prov("nettet er teke for langt ned", "nett", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  trekant: 0.5,
  plan: nett(4, 4),
})

{
  const p = { ...DEFAULT_PARAMS, plan: "1@0.2,0.5,0.5/1,0,0;2@0.5,0.5,1/0.7071,0,0.7071;3@0.5,0.5,0.5/0,1,0" } as Params
  const r = finn(p, "orden")
  const orden = makeBygg(p, DETAIL.mid).s.montering.orden.join(",")
  ok("eit plan med to vegar inn får rekkjefylgja si av motoren", !!r?.ok && orden !== "1,2,3", `${r?.value} · ${orden}`)
}
prov("tre plan gjennom same punkt", "orden", {
  ...DEFAULT_PARAMS,
  plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,1,0;3@0.5,0.5,0.5/0,0,1",
})

prov("klaringa er null", "klaring", { ...DEFAULT_PARAMS, klaring: 0 })
prov("klaringa er ein halv millimeter", "klaring", { ...DEFAULT_PARAMS, klaring: 0.55 })

prov("ingen tek snittbreidda", "snitt", { ...DEFAULT_PARAMS, snitt: 0 })
prov("snittet et opp sporet", "snittspor", { ...DEFAULT_PARAMS, tjukn: 2, snitt: 3 })

prov("eit stykke heng ikkje i noko", "lause", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  storleik: 200,
  plan: nett(13, 2),
  lause: 0,
})

prov("godset er tynt", "gods", {
  ...DEFAULT_PARAMS,
  kjelde: "torus",
  storleik: 120,
  tjukn: 8,
  plan: nett(8, 8),
  ledd: 0.2,
})

{
  const p: Params = { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 200, plan: nett(1, 1) }
  const r = finn(p, "grip")
  ok("ingen plan møtest: regelen står", !!r && !r.ok, r ? r.value : "regelen finst ikkje")
  ok("og han lagar ikkje eit rutenett du ikkje bad om", !r?.fiks, r?.fiks ? `«${r.fiks.ord}»` : "ingen knapp")
  const d = finn({ ...DEFAULT_PARAMS, plan: "" }, "delar")
  ok("det same gjeld «delar å skjere»", !!d && !d.ok && !d.fiks, d?.fiks ? `«${d.fiks.ord}»` : "ingen knapp")
}

{
  const p: Params = { ...DEFAULT_PARAMS, kjelde: "opn", plan: nett(3, 3) }
  const r = finn(p, "lukka")
  ok("eit nett med hòl i seier frå", !!r && !r.ok, r?.value)
  ok("og ingen knapp lovar å lukke det", !r?.fiks, r?.fiks ? `«${r.fiks.ord}»` : "ingen knapp")
}

{
  const p: Params = { ...DEFAULT_PARAMS, kjelde: "tynnring", storleik: 900, arkB: 450, arkH: 100, plan: nett(2, 2) }
  const r = finn(p, "utnytting")
  const m = measure(p)
  ok("to ark og under ein tredel utnytta seier frå", !!r && !r.ok, `${m.sheets} ark · ${r?.value}`)
  ok("og ingen knapp lovar ei betre plate", !r?.fiks, r?.fiks ? `«${r.fiks.ord}»` : "ingen knapp")
}

{
  const p: Params = { ...DEFAULT_PARAMS, kjelde: "kule" }
  const alle = reglane(p)
  const utan = alle.filter((r) => !r.ok && !r.fiks).map((r) => r.id)
  ok(
    "ein regel utan råd ber ingen knapp",
    !alle.some((r) => r.ok && r.fiks),
    utan.length ? `utan råd: ${utan.join(", ")}` : "alle grøne",
  )
}

{
  const rader = new Set(RADER.map((r) => r.id))
  const heimlause = reglane({ ...GRUNN, klaring: 0, snitt: 0 } as Params)
    .filter((r) => r.rad && !rader.has(r.rad))
    .map((r) => `${r.id} → «${r.rad}»`)
  ok("kvar regel med ei rad peikar på ei rad som finst", heimlause.length === 0, heimlause.join(", "))
}

const boygd = (bog: number): Params =>
  ({
    ...DEFAULT_PARAMS,
    kjelde: "kule",
    storleik: 300,
    tjukn: 6,
    material: "finer",
    plan: skrivPlan(lesPlan(nett(3, 0)).map((q, i) => (i === 1 ? { ...q, bog } : q))),
  }) as Params

{
  const p = boygd(1.5)
  const r = reglane(p)
  const bogR = r.find((q) => q.id === "bog")
  const leddR = r.find((q) => q.id === "bogledd")
  ok("ein for stram bøy vert RILLA og er ikkje eit brot", !!bogR && !bogR.hard && bogR.ok && /rilla/.test(bogR.value), bogR?.value)
  ok("og eit bøygt plan seier at det ikkje ber ledd", !!leddR && leddR.hard && !leddR.ok, leddR?.value)
  for (const q of [leddR]) {
    if (!q?.fiks) { ok(`${q?.id} har eit råd`, false); continue }
    const etter = reglane({ ...p, ...q.fiks.set } as Params).find((x) => x.id === q.id)
    ok(`rådet «${q.fiks.ord}» rettar ${q.id}`, !!etter?.ok, etter?.value)
  }
  {
    const golv = (bog: number): Params =>
      ({
        ...DEFAULT_PARAMS,
        storleik: 300,
        plan: skrivPlan([
          ...lesPlan(nett(4, 4)).map((q) => (q.n[0] === 1 ? { ...q, bog } : q)),
          { id: 91, o: [0.5, 0.5, 0.35], n: [0, 0, 1], bog: 0, strek: [] },
          { id: 92, o: [0.5, 0.5, 0.65], n: [0, 0, 1], bog: 0, strek: [] },
        ]),
      }) as Params
    const skal = golv(0.3)
    ok("ribbene har spor, so den harde regelen går grøn", !!finn(skal, "bogledd")?.ok, finn(skal, "bogledd")?.value)
    ok("og golva er ledd og ikkje kurver", !!finn(skal, "bogkurve")?.ok, finn(skal, "bogkurve")?.value)
    ok("og bøyen tek ikkje eit ledd", measure(skal).joints === measure(golv(0)).joints, `${measure(skal).joints} bøygd, ${measure(golv(0)).joints} flatt`)
  }

  {
    const skra: Params = {
      ...DEFAULT_PARAMS,
      storleik: 300,
      plan: skrivPlan([
        ...lesPlan(nett(4, 4)).map((q) => (q.n[0] === 1 ? { ...q, bog: 0.3 } : q)),
        { id: 91, o: [0.5, 0.5, 0.35], n: [0, 0.7071, 0.7071], bog: 0, strek: [] },
        { id: 92, o: [0.5, 0.5, 0.65], n: [0, 0.7071, 0.7071], bog: 0, strek: [] },
      ]),
    } as Params
    const hard = finn(skra, "bogledd")
    ok("ribbene har spor, so den harde regelen går grøn", !!hard?.ok, hard?.value)
    prov("men dei skrå møta er kurver", "bogkurve", skra)
    const k = finn(skra, "bogkurve")
    ok("og rådet seier at det riv arbeid", !!k?.fiks?.riv, k?.fiks ? `«${k.fiks.ord}»` : "ingen knapp")
    const etter = measure({ ...skra, ...k!.fiks!.set } as Params)
    ok("og møta kjem attende som ledd", etter.joints > measure(skra).joints, `${measure(skra).joints} → ${etter.joints}`)
  }

  const mild = reglane(boygd(0.4)).find((q) => q.id === "bog")
  ok("ein bøy innanfor det materialet toler er ok", !!mild?.ok, mild?.value)

  const grov = { ...boygd(1.5), tjukn: 3, snitt: 2 } as Params
  const grovR = reglane(grov).find((q) => q.id === "bog")
  ok("ein fres som et rada er eit hardt brot", !!grovR && grovR.hard && !grovR.ok, grovR?.value)
  if (grovR?.fiks) {
    const etter = reglane({ ...grov, ...grovR.fiks.set } as Params).find((q) => q.id === "bog")
    ok(`rådet «${grovR.fiks.ord}» rettar bog`, !!etter?.ok, etter?.value)
  } else ok("bog har eit råd", false)

  const medTvers = {
    ...DEFAULT_PARAMS,
    kjelde: "kule",
    storleik: 300,
    tjukn: 6,
    material: "finer",
    plan: skrivPlan(lesPlan(nett(3, 3)).map((q, i) => (i === 1 ? { ...q, bog: 0.4 } : q))),
  } as Params
  const bærande = reglane(medTvers).find((q) => q.id === "bogledd")
  ok("eit bøygt plan med flate plan langs aksen ber ledd", !!bærande?.ok && !bærande.hard, bærande?.value)
}

{
  const harde = (q: Params) => reglane(q).filter((r) => r.hard && !r.ok)
  const saker2: [string, Params][] = [
    ["for stor for plata", { ...DEFAULT_PARAMS, storleik: 1200, plan: nett(3, 3), arkB: 300, arkH: 200 } as Params],
    ["snittet et opp sporet", { ...DEFAULT_PARAMS, tjukn: 1, snitt: 6, plan: nett(4, 4) } as Params],
    ["for stram bøy", boygd(1.5)],
    ["alt i orden frå før", { ...DEFAULT_PARAMS, plan: nett(4, 4) } as Params],
  ]
  for (const [namn, p] of saker2) {
    const foer = harde(p)
    const trygge = reglane(p).filter((r) => !r.ok && r.fiks && !r.fiks.riv)
    const ut = fiksAlt(p)
    const etter = harde(ut.p)
    ok(`fiks alt gjer det ikkje verre: ${namn}`, etter.length <= foer.length, `${foer.length} → ${etter.length} harde brot`)
    if (trygge.length) {
      ok(`og han tek noko når det finst eit trygt råd: ${namn}`, ut.fiksa.length > 0, `tok ${ut.fiksa.join(",") || "—"}`)
    }
  }
  const umogeleg = { ...DEFAULT_PARAMS, plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,1,0;3@0.5,0.5,0.5/0,0,1" } as Params
  const rivet = reglane(umogeleg).find((r) => r.id === "orden")
  ok("eit umogeleg sett får eit råd som RIV", !!rivet?.fiks?.riv, rivet?.fiks?.ord ?? "ingen")
  const etterAlt = fiksAlt(umogeleg)
  ok("og fiks alt rører han ikkje", etterAlt.p.plan === umogeleg.plan, `${etterAlt.fiksa.length} tekne`)
  const rivd = { ...umogeleg, ...rivet!.fiks!.set } as Params
  ok("og trykkjer du han sjølv, er montasjen open", !reglane(rivd).some((r) => r.id === "orden" && !r.ok), `${lesPlan(String(rivd.plan)).length} plan att`)
}

{
  const saker: Params[] = [
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 100, tjukn: 10, plan: nett(10, 10), ledd: 0.2 },
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 100, tjukn: 10, plan: nett(10, 10), ledd: 0.8 },
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 120, tjukn: 8, plan: nett(8, 8), ledd: 0.2 },
    { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 200, plan: nett(13, 2), lause: 0 },
    { ...DEFAULT_PARAMS, storleik: 1200, plan: nett(3, 3), arkB: 300, arkH: 200 },
    { ...DEFAULT_PARAMS, tjukn: 1, snitt: 6 },
    { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 60, plan: nett(30, 30), },
    boygd(1.5),
  ]
  const harde = (p: Params) => reglane(p).filter((r) => !r.ok && r.hard).length
  let verre: string[] = []
  for (const p of saker) {
    const før = harde(p)
    for (const r of reglane(p)) {
      if (r.ok || !r.fiks) continue
      const etter = harde({ ...p, ...r.fiks.set } as Params)
      if (etter > før) verre.push(`${r.id}/«${r.fiks.ord}»: ${før} → ${etter} harde brot`)
    }
  }
  ok("ikkje eit råd gjer det verre", verre.length === 0, verre.join("; "))
}

{
  const kantar: Params[] = [
    { ...DEFAULT_PARAMS, storleik: 1200, plan: nett(3, 3), arkB: 300, arkH: 200 },
    { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 60, plan: nett(30, 30), },
    { ...DEFAULT_PARAMS, tjukn: 1, snitt: 6 },
  ]
  let alleLovlege = true
  const sett: string[] = []
  for (const p of kantar) {
    for (const r of reglane(p)) {
      if (r.ok || !r.fiks) continue
      const bede = { ...p, ...r.fiks.set } as unknown as ParamBag
      const fekk = MOTOR.clamp(bede, p as unknown as ParamBag)
      for (const k of Object.keys(r.fiks.set)) {
        const v = r.fiks.set[k]
        const ulik = typeof v === "number" ? Math.abs((fekk[k] as number) - v) > 1e-9 : fekk[k] !== v
        if (ulik) {
          alleLovlege = false
          sett.push(`${r.id}: ${k} ${r.fiks.set[k]} → ${String(fekk[k])}`)
        }
      }
    }
  }
  ok("rådet står innanfor skyvarane", alleLovlege, sett.join("; "))
}

{
  const alle = reglane({ ...GRUNN, klaring: 0 } as Params).map((r) => r.id)
  const aldri = alle.filter((id) => !raude.has(id))
  ok("kvar regel har vore raud ein gong i denne køyringa", aldri.length === 0, aldri.length ? `aldri raud: ${aldri.join(", ")}` : `${raude.size} reglar broten og prøvd`)
}

console.log(brot === 0 ? "\nalle råd rettar\n" : `\n${brot} råd rettar ikkje\n`)
process.exit(brot === 0 ? 0 : 1)
