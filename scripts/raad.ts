/**
 * Vakta over RÅDA.
 *
 * Ein regel som ryk ber eit råd, og rådet er ein knapp med eit tal på.
 * Trykk han, og talet går rett inn i parametrane.
 *
 * Eit råd som ikkje rettar det det seier det rettar er verre enn ingen
 * knapp i det heile: du trykte, noko endra seg, og lina står framleis
 * raud. Då er det ikkje eit råd — det er ein bryter som flyttar objektet
 * ditt tilfeldig og let deg sitje att med spørsmålet.
 *
 * Skriptet gjer det brukaren gjer. Det byggjer eit uttak som BRYT ein
 * regel, hentar rådet regelen sjølv la ved, set det, og reknar heile
 * kjeda om att frå botnen. Regelen skal vera grøn etterpå.
 *
 *   npx tsx scripts/raad.ts
 */
import type { ParamBag } from "../lib/core"
import { measure } from "../lib/metrics"
import { checkRules } from "../lib/rules"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { MOTOR } from "../lib/motor"
import { meshToStl } from "../lib/export-stl"
import { parseMesh } from "../lib/io"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))


let brot = 0
const ok = (namn: string, sant: boolean, kva = "") => {
  if (sant) console.log(`  ok   ${namn}${kva ? " · " + kva : ""}`)
  else {
    brot++
    console.log(`  FEIL ${namn}${kva ? " · " + kva : ""}`)
  }
}

/** ei kule som eit importert nett: noko med kurve i, so ribbene får ulik
 *  lengd og delane ulik storleik */
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

/** ein torus har hòl i midten, og det er der ei einsam ribbe frå kvar
 *  familie ville ha kryssa den andre */
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

const reglane = (p: Params) => checkRules(p, measure(p))
const finn = (p: Params, id: string) => reglane(p).find((r) => r.id === id)

/**
 * Éin prøve: bryt ein regel, ta rådet, og sjå at han sluttar å stengje.
 *
 * «Sluttar å stengje» og ikkje «vert grøn», av di eit av råda med vilje
 * ikkje gjer regelen grøn: «kast dei» tek dei lause stykka ut av fila og
 * gjer den harde regelen til ei mjuk opplysning om kva du valde bort.
 * Talet står framleis der. Det er heile skilnaden mellom ein feil og eit
 * val, og eit råd som gøymde valet ville vore verre enn ingen knapp.
 *
 * For alt anna er kravet det strenge: grøn.
 *
 * `runder` er der av di eit råd kan vera eit steg og ikkje eit sprang.
 * Færre ribber er rekna på ei jamn stigning, og kroppen er ikkje jamn:
 * kjem du ikkje heilt fram i fyrste trykket, skal DET nye rådet ta deg
 * resten av vegen. Eit råd som ikkje kjem nærare er framleis eit brot.
 */
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

// --- delane får plass ------------------------------------------------------
// Det brukaren såg: ein klyp gjorde objektet så stort at kvar einaste del
// var større enn plata, og båe kuttuttaka var strekne over. Ingen veg ut.
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
// AKKURAT PÅ KANTEN.
//
// Dei to over er langt over: kvar del er fleire gonger plata, og eit råd
// som bommar med tre millimeter treffer likevel. Denne ligg like utanfor,
// og då er det den siste millimeteren som avgjer. Rådet rekna på «plata
// minus ei luke»; pakkinga reserverer meir enn det, og svaret vart eit
// tal som framleis lét to delar liggje utanfor. Du trykte på knappen, noko
// endra seg, og lina stod raud.
prov("så vidt for stort", "plate", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  storleik: 300,
  plan: nett(3, 3),
  arkB: 420,
  arkH: 297,
})

// --- to feste i kvarandre --------------------------------------------------
// Handa sette to delar i kvarandre. Rådet slepper nett dei, og lèt det
// tredje festet stå.
{
  const p = { ...DEFAULT_PARAMS, fest: "1:0,0,10,10;2:0,0,20,20;3:0,0,300,200" }
  prov("to feste i kvarandre", "plate", p)
  const r = finn(p, "plate")
  const etter = r?.fiks ? String(r.fiks.set.fest) : "?"
  ok("og det tredje festet står", etter.includes("3:") && !etter.includes("2:"), etter)
}

// --- opning mellom ribbene -------------------------------------------------
// Tettleiken er rekna på ei jamn stigning over eit ujamnt legeme, so her
// er to runder tillatne: fyrste rådet skal ta deg mesteparten av vegen.
// Plan 1 og 2 kryssar kvarandre utanfor kroppen og har ikkje ledd; plan 3
// kryssar begge, langs to liner som ikkje er parallelle. Sist i lista har
// det to vegar inn; fyrst i lista kjem dei to andre inn på det, kvar sin veg.
prov("eit plan har to vegar inn", "orden", {
  ...DEFAULT_PARAMS,
  plan: "1@0.2,0.5,0.5/1,0,0;2@0.5,0.5,1/0.7071,0,0.7071;3@0.5,0.5,0.5/0,1,0",
})

// --- klaringa --------------------------------------------------------------
prov("klaringa er null", "klaring", { ...DEFAULT_PARAMS, klaring: 0 })
prov("klaringa er ein halv millimeter", "klaring", { ...DEFAULT_PARAMS, klaring: 0.55 })

// --- snittbreidda ----------------------------------------------------------
prov("ingen tek snittbreidda", "snitt", { ...DEFAULT_PARAMS, snitt: 0 })
prov("snittet et opp sporet", "snittspor", { ...DEFAULT_PARAMS, tjukn: 2, snitt: 3 })

// --- laust stykke ----------------------------------------------------------
// Ein torus står med hòl i midten: eit rutenett som treffer ringen på
// tvers gjev stykke som ikkje kryssar noko.
prov("eit stykke heng ikkje i noko", "lause", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  storleik: 200,
  plan: nett(13, 2),
  lause: 0,
})

// --- godset i leddet -------------------------------------------------------
// Leddelinga langt ute gjev den eine sida av sporet nesten ingenting. Rådet
// er å dele i midten, og på denne forma gjer det jobben: 5,1 mm vert 12,7.
prov("godset er tynt", "gods", {
  ...DEFAULT_PARAMS,
  kjelde: "torus",
  storleik: 120,
  tjukn: 8,
  plan: nett(8, 8),
  ledd: 0.2,
})

// --- ingen ledd ------------------------------------------------------------
prov("ingen plan møtest", "grip", {
  ...DEFAULT_PARAMS,
  kjelde: "torus",
  storleik: 200,
  plan: nett(1, 1),
})

// =============================================================================
// OG DER DET IKKJE FINST NOKO RÅD, SKAL DET IKKJE STÅ EIN KNAPP
// =============================================================================
// Eit nett med hòl i vert ikkje lukka av eit tal. Ein knapp som lova det
// ville vore ei løgn, og ei løgn i den raude lina er verre enn tomrommet.
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

/**
 * EIT RÅD SKAL IKKJE GJERE DET VERRE.
 *
 * Det strengaste kravet, og det billegaste å bryte: trykk kva som helst
 * som står der, og tel dei harde brota att. Vert dei fleire, har knappen
 * teke deg lenger frå ei fil enn du var.
 *
 * Det var ikkje teoretisk. «Del i midten» på ein torus i ti millimeter
 * tok godset frå 4,3 mm til ingenting, delane frå fire til null, og eitt
 * brot til tre — av di `ledd` ikkje berre flyttar sporbotnen, han
 * avgjer om leddet i det heile vert lagt.
 */
{
  const saker: Params[] = [
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 100, tjukn: 10, plan: nett(10, 10), ledd: 0.2 },
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 100, tjukn: 10, plan: nett(10, 10), ledd: 0.8 },
    { ...DEFAULT_PARAMS, kjelde: "torus", storleik: 120, tjukn: 8, plan: nett(8, 8), ledd: 0.2 },
    { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 200, plan: nett(13, 2), lause: 0 },
    { ...DEFAULT_PARAMS, storleik: 1200, plan: nett(3, 3), arkB: 300, arkH: 200 },
    { ...DEFAULT_PARAMS, tjukn: 1, snitt: 6 },
    { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 60, plan: nett(30, 30), },
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

// Rådet skal vera eit LOVLEG punkt i parameterrommet: klemmer motoren det
// bort att, er knappen ein knapp som ikkje gjer det han seier.
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
        // Eit tal skal stå innanfor bandet; ein streng skal stå som han er.
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

console.log(brot === 0 ? "\nalle råd rettar\n" : `\n${brot} råd rettar ikkje\n`)
process.exit(brot === 0 ? 0 : 1)
