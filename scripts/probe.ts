/**
 * Prøvebenken. Han køyrer motoren utan nettlesar og skriv ut det ein
 * elles måtte sjå på skjermen for å vita: kor mange delar, kor mange
 * ledd, kor lang kutten er, og om kuttfilene i det heile vart til noko.
 *
 *   npx tsx scripts/probe.ts
 */
import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { meshToStl } from "../lib/export-stl"
import { makeSoup } from "../lib/soup"
import { unzip } from "../lib/zip"
import { glb } from "./glbfil"
import { feltTal, klokke, lesTal, snap, type ParamBag } from "../lib/core"
import { PARAM_RANGES } from "../lib/params"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

/**
 * PRØVEKROPPEN. Standarden opnar UTAN plan — reiskapen er tom til du skjer
 * — so ei vakt som måler geometri må seie kva ho måler. Seks kvar veg er
 * det same rutenettet standarden hadde før, og det same objektet.
 */
const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }


const nn = (v: number, d = 1) => v.toFixed(d)

/**
 * TRE PÅSTANDAR, OG EIN UTGANGSKODE.
 *
 * Prøvebenken skreiv `!!` framfor kvar påstand som ikkje heldt, og
 * avslutta med null uansett. Ein grøn `pnpm probe` tydde difor berre at
 * skriptet kom til enden — ikkje at ein kube har seks og tretti ledd, at
 * eit vrengd nett gjev det same som eit rettvendt, eller at ein GLB og det
 * same nettet Z-opp gjev det same objektet. Tre påstandar som ingen
 * maskin las.
 */
let brot = 0
const bryt = (kva: string) => {
  brot++
  console.log(`  !! ${kva}`)
}

function report(name: string, p: Params) {
  const t0 = Date.now()
  const bag = p as unknown as ParamBag
  const m = MOTOR.measure(bag)
  const r = MOTOR.rules(bag, m)
  const tMeasure = Date.now() - t0

  const t1 = Date.now()
  const lag = MOTOR.build(bag, "mid", "lag")
  const flate = MOTOR.build(bag, "mid", "flate")
  const kontur = MOTOR.build(bag, "mid", "kontur")
  const tBuild = Date.now() - t1

  const t2 = Date.now()
  const stl = MOTOR.exportFile(bag, "stl")
  const dxf = MOTOR.exportFile(bag, "dxf")
  const svg = MOTOR.exportFile(bag, "svg")
  const ark = MOTOR.exportFile(bag, "ark")
  const tExport = Date.now() - t2

  console.log(`\n=== ${name} ===`)
  console.log(
    `  nett      ${m.tris} trekantar (av ${m.srcTris}), ${m.openEdges} opne kantar`,
  )
  console.log(`  ytre      ${nn(m.envX)} x ${nn(m.envY)} x ${nn(m.envZ)} mm`)
  console.log(`  plan      ${m.units}   ledd ${m.joints}`)
  console.log(`  delar     ${m.parts} (${m.unique} unike)`)
  console.log(
    `  kutt      ${nn(m.cutLen / 1000, 2)} m   ${klokke(m.cutTime)} ved ${p.fart} mm/s   ` +
      `spor ${nn(m.slotW, 2)} mm`,
  )
  console.log(`  gods      ${nn(m.narrow)} mm   opning ${nn(m.minGap)} mm`)
  console.log(
    `  masse     ${nn(m.mass, 3)} kg   ark ${m.sheets} (${nn(m.util * 100, 0)} %)`,
  )
  console.log(
    `  nett      lag ${lag.tris} tri, flate ${flate.tris} tri, kontur ${
      (kontur.lines.length + kontur.heavy.length) / 6
    } linjer, ${kontur.plater.length} plater`,
  )
  /**
   * KVAR PLATE EIG SI EIGA SPALTE I TEIKNINGA.
   *
   * Handa vel ei plate ved å peike på ein boks, so boksane må flise
   * strimmelen: kvar line i ribbe k skal liggje i boks k, og ingen line
   * frå ei anna ribbe skal gjera det. Ingen ting i treet sa noko om dette
   * før — konturen bar ikkje namn i det heile.
   */
  {
    const L = kontur.lines
    let ute = 0
    let inne = 0
    for (const q of kontur.plater) {
      for (let i = 0; i < L.length; i += 3) {
        const x = L[i]
        const z = L[i + 2]
        const mi = i / 3 >= q.fraa && i / 3 < q.fraa + q.tal
        const iBoks = x >= q.min[0] && x <= q.max[0] && z >= q.min[1] && z <= q.max[1]
        if (mi && !iBoks) ute++
        else if (!mi && iBoks) inne++
      }
    }
    if (ute || inne) bryt(`konturboksane held ikkje: ${ute} eigne liner utanfor, ${inne} framande inni`)
  }
  const bytes = (o: { text?: string; data?: ArrayBuffer }) =>
    o.text?.length ?? o.data?.byteLength ?? 0
  const prove = MOTOR.exportFile(bag, "prove")
  console.log(
    `  filer     stl ${bytes(stl)} B, dxf ${bytes(dxf)} B, svg ${bytes(svg)} B, ` +
      `${ark.name.endsWith(".zip") ? "zip" : "ark"} ${bytes(ark)} B, ` +
      `prøve ${bytes(prove)} B`,
  )
  console.log(`  tid       mål ${tMeasure} ms, bygg ${tBuild} ms, eksport ${tExport} ms`)
  const brot = r.filter((q) => !q.ok)
  if (brot.length) {
    for (const q of brot) {
      console.log(`  ${q.hard ? "BRYT" : "merk"}  ${q.label}: ${q.value}`)
    }
  } else {
    console.log("  reglar    alle held")
  }
  return { m, r, lag }
}

// --- 1 standarden: kuben --------------------------------------------------
const kube = report("kube, standard", GRUNN)
if (kube.m.joints !== 36) {
  bryt(
    `venta 36 ledd på ein kube, fekk ${kube.m.joints}`,
  )
}

// --- 2 tettare rutenett og tjukkare plate ---------------------------------
report("kube 400, 12x9 ribber i 6 mm", {
  ...GRUNN, storleik: 400, plan: nett(12, 9), tjukn: 6,
  arkB: 1200, arkH: 900,
})

// --- 3 tjukk plate --------------------------------------------------------
report("kube 300 i 9 mm", {
  ...GRUNN, storleik: 300, tjukn: 9, arkB: 1200, arkH: 900,
})

// --- 4 vend og skaler -----------------------------------------------------
report("kube, vend 30/20/10 og 700 mm", {
  ...GRUNN,
  rotX: 30, rotY: 20, rotZ: 10, storleik: 700, tjukn: 6, arkB: 1200, arkH: 900,
})

// --- 4b scena: kroppen sett saman av bitar ---------------------------------
// Ein kube med ei kule oppå og ein sylinder på skrå inn i sida er éin kropp:
// strålane tel skal, so overlappet er gods. Skala vert ikkje sydd, og treng
// ikkje det.
{
  const alle = ["kube", "kule", "sylinder", "kjegle", "torus"].map((id) => report(`primitiv: ${id}`, { ...GRUNN, scene: `${id}@0,0,0/1/0` }))
  if (alle.some((r) => r.m.parts === 0 || r.m.joints === 0 || r.m.openEdges > 0)) bryt("eit primitiv snittar ikkje til ein lukka kropp med ledd")
  const sett = report("scene: kube + kule oppå + sylinder på skrå", {
    ...GRUNN,
    scene: "kube@0,0,0/1/0;kule@0,0,80/0.6/0;sylinder@40,0,0/0.5/30",
  })
  if (sett.m.openEdges > 0 || sett.m.joints === 0 || sett.m.envZ <= sett.m.envX) {
    bryt(`scena gav ${sett.m.openEdges} opne kantar, ${sett.m.joints} ledd, ${sett.m.envX.toFixed(0)}×${sett.m.envZ.toFixed(0)} — ei kule oppå ein kube skal vera høgare enn brei`)
  }
}

/**
 * --- 4c SYMMETRIEN: EI SPEGLING ER EIN BIT TIL, RETT VEND --------------------
 *
 * Brytaren skriv eitt tal i scenestrengen, og resten skal vera nøyaktig som
 * om du hadde sett biten sjølv. Difor vert dei to rekna og samanlikna: ein
 * kube som står ut på minus x og er vridd tretti grader, spegla om x —
 * mot den same kuben pluss ein til, sett på pluss x og vridd tretti grader
 * ANDRE vegen. M·R(30)·M er R(−30), so det er den same kroppen, og alt
 * målinga svarar med skal vera det same talet.
 *
 * Og det er her vindinga vert prøvd. Ei spegling snur kvar trekant, og eit
 * halvt snudd nett vert ikkje retta av noko seinare: strålane ville telt
 * feil, godset stått på feil side, og delane kome ut som noko anna. Ein
 * kube vridd tretti grader er ikkje sin eigen spegelbilete-plassering, so
 * prøva merkar det.
 */
{
  const spegla = report("symmetri: éin kube, spegla om x", {
    ...GRUNN,
    scene: "kube@-40,0,0/1/30/1",
  })
  const forHand = report("symmetri: to kubar, sette for hand (fasit)", {
    ...GRUNN,
    scene: "kube@-40,0,0/1/30;kube@40,0,0/1/330",
  })
  const like = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
  if (
    spegla.m.parts !== forHand.m.parts ||
    spegla.m.joints !== forHand.m.joints ||
    spegla.m.openEdges > 0 ||
    !like(spegla.m.cutLen, forHand.m.cutLen, Math.max(1, forHand.m.cutLen * 0.001)) ||
    !like(spegla.m.envX, forHand.m.envX, 0.05) ||
    !like(spegla.m.envY, forHand.m.envY, 0.05)
  ) {
    bryt(
      `speglinga er ikkje den same kroppen: ${spegla.m.parts}/${forHand.m.parts} delar, ` +
        `${spegla.m.joints}/${forHand.m.joints} ledd, ${nn(spegla.m.cutLen)}/${nn(forHand.m.cutLen)} mm kutt, ` +
        `${spegla.m.openEdges} opne kantar`,
    )
  }
  /**
   * OG ALLE FIRE UNDERMENGDENE. To brytarar gjev fire bitar — han sjølv,
   * spegla om x, om y, og om begge — og den siste er ikkje ei spegling i
   * det heile, ho er ei halvsving. Fasiten set alle fire for hand: fire
   * bein under eit bord, av eitt.
   */
  const beina = report("symmetri: eitt bein, spegla om x og y", {
    ...GRUNN,
    scene: "kube@-40,-40,0/0.6/30/3",
  })
  const fireForHand = report("symmetri: fire bein, sette for hand (fasit)", {
    ...GRUNN,
    scene: "kube@-40,-40,0/0.6/30;kube@40,-40,0/0.6/330;kube@-40,40,0/0.6/330;kube@40,40,0/0.6/30",
  })
  if (
    beina.m.parts !== fireForHand.m.parts ||
    beina.m.joints !== fireForHand.m.joints ||
    beina.m.openEdges > 0 ||
    !like(beina.m.cutLen, fireForHand.m.cutLen, Math.max(1, fireForHand.m.cutLen * 0.001)) ||
    !like(beina.m.envX, fireForHand.m.envX, 0.05) ||
    !like(beina.m.envY, fireForHand.m.envY, 0.05)
  ) {
    bryt(
      `x og y gav ikkje fire bein: ${beina.m.parts}/${fireForHand.m.parts} delar, ` +
        `${beina.m.joints}/${fireForHand.m.joints} ledd, ${nn(beina.m.cutLen)}/${nn(fireForHand.m.cutLen)} mm kutt, ` +
        `${nn(beina.m.envX)}×${nn(beina.m.envY)} mot ${nn(fireForHand.m.envX)}×${nn(fireForHand.m.envY)} mm`,
    )
  }
}

// --- 5 eit importert nett: ei kule som STL --------------------------------
function sphereStl(r: number, seg: number): ArrayBuffer {
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
  return bytes.buffer.slice(0) as ArrayBuffer
}

const stl = sphereStl(50, 48)
const kule = parseMesh("kule.stl", stl)
console.log(`\nles att STL: ${kule.tris} trekantar, boks ${kule.min} .. ${kule.max}`)
put("kule", "kule.stl", kule)
report("kule, importert STL", { ...GRUNN, kjelde: "kule", plan: nett(7, 7), })
report("kule, glatta og forenkla", {
  ...GRUNN,
  kjelde: "kule",
  glatt: 6,
  trekant: 2,
  plan: nett(7, 7),
})

// --- 6 ein torus: to stykke i same søyle, og eit hòl gjennom ---------------
function torusSoup(R: number, r: number, n: number, m: number) {
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
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  return makeSoup(new Float32Array(pos))
}
put("torus", "torus", torusSoup(60, 22, 64, 32))
report("torus, staaende", { ...GRUNN, kjelde: "torus", rotX: 90, plan: nett(9, 9), })

// --- 7 eit nett som er snudd ut-inn ---------------------------------------
// Ein eksport som gløymde å snu normalane er ei heilt vanleg fil, og
// stråleskytinga les henne som tom luft om ingen tek tak i det. Ho skal gje
// nøyaktig det same objektet som den rettvende.
const vrengd = makeSoup(
  (() => {
    const src = torusSoup(60, 22, 64, 32).pos
    const out = new Float32Array(src.length)
    for (let t = 0; t < src.length; t += 9) {
      for (let c = 0; c < 3; c++) {
        out[t + c] = src[t + c]
        out[t + 3 + c] = src[t + 6 + c]
        out[t + 6 + c] = src[t + 3 + c]
      }
    }
    return out
  })(),
)
put("vrengd", "vrengd", vrengd)
const a = report("torus, snudd ut-inn", {
  ...GRUNN, kjelde: "vrengd", rotX: 90, plan: nett(9, 9),
})
const b = report("torus, rettvend (fasit)", {
  ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, plan: nett(9, 9),
})
if (a.m.parts !== b.m.parts || a.m.joints !== b.m.joints) {
  bryt(
    `eit vrengd nett gav ${a.m.parts}/${a.m.joints} der det rettvende gav ` +
      `${b.m.parts}/${b.m.joints}`,
  )
}

// --- 8 same forma som GLB og som STL ---------------------------------------
// Ein GLB er Y-opp og ei STL er som ho er lagd. Same kule, skriven begge
// vegar, skal difor gje NØYAKTIG same objekt — elles er vendinga feil.
{
  const seg = 32
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    // Y opp, som glTF krev
    return [
      50 * Math.sin(ph) * Math.cos(th),
      50 * Math.cos(ph) * 1.6,
      50 * Math.sin(ph) * Math.sin(th),
    ]
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      // Y opp er venstrehendt sett frå Z-opp-verda, so vindinga vert snudd
      // her for at kula skal vende utover etter vendinga.
      pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  }
  const yup = new Float32Array(pos)
  put("glbkule", "kule.glb", parseMesh("k.glb", glb(yup, null, [{ mesh: 0 }], [0])))

  // den same kula, men allereie Z-opp, rett inn som trekantsuppe
  const zup = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 3) {
    zup[i] = pos[i]
    zup[i + 1] = -pos[i + 2]
    zup[i + 2] = pos[i + 1]
  }
  put("rawkule", "kule.raw", makeSoup(zup))

  const g = report("kule frå GLB", { ...GRUNN, kjelde: "glbkule", plan: nett(7, 7), })
  const r = report("same kule, Z-opp direkte", { ...GRUNN, kjelde: "rawkule", plan: nett(7, 7), })
  const likt =
    g.m.parts === r.m.parts &&
    g.m.joints === r.m.joints &&
    Math.abs(g.m.envZ - r.m.envZ) < 0.5 &&
    Math.abs(g.m.cutLen - r.m.cutLen) < 1
  if (likt) console.log("  GLB og Z-opp gjev same objekt")
  else {
    bryt(
      `GLB gav ${g.m.parts}/${g.m.joints}/${g.m.envZ.toFixed(1)}, ` +
        `Z-opp gav ${r.m.parts}/${r.m.joints}/${r.m.envZ.toFixed(1)}`,
    )
  }
}

// --- 9 GLB og USDZ ut: same objektet, lese attende ------------------------
/**
 * Eit uttak ingen les attende er eit uttak ingen veit noko om. STL-en er
 * millimeter og Z opp, GLB-en er meter og Y opp, og USDZ-en er millimeter
 * og Y opp — tre skrivemåtar for det SAME objektet, og skil dei seg med
 * meir enn tusendelen, er vendinga eller skalaen feil i ein av dei.
 *
 * USDZ er i tillegg ein ZIP med reglar: fyrste fila skal vera USD-en, og
 * kvar fil skal byrje på ei adresse som går opp i 64.
 */
{
  const bag = GRUNN as unknown as ParamBag
  const stlUt = MOTOR.exportFile(bag, "stl")
  const glbUt = MOTOR.exportFile(bag, "glb")
  const usdzUt = MOTOR.exportFile(bag, "usdz")
  const fasit = parseMesh("ut.stl", stlUt.data as ArrayBuffer)
  const les = parseMesh("ut.glb", glbUt.data as ArrayBuffer)
  console.log(`\n=== glb og usdz ===`)
  console.log(`  glb       ${glbUt.name}, ${(glbUt.data as ArrayBuffer).byteLength} B, ${les.tris} trekantar`)
  if (les.tris !== fasit.tris) bryt(`GLB har ${les.tris} trekantar der STL-en har ${fasit.tris}`)
  const avvik = Math.max(
    ...[0, 1, 2].map((a) => Math.max(Math.abs(les.min[a] * 1000 - fasit.min[a]), Math.abs(les.max[a] * 1000 - fasit.max[a]))),
  )
  if (avvik > 0.05) bryt(`GLB-boksen ligg ${nn(avvik, 3)} mm frå STL-boksen etter tusendelen`)
  else console.log(`  glb       same boks som STL-en, på ${nn(avvik, 3)} mm nær`)

  const bytar = new Uint8Array(usdzUt.data as ArrayBuffer)
  const dv = new DataView(usdzUt.data as ArrayBuffer)
  const start = 30 + dv.getUint16(26, true) + dv.getUint16(28, true)
  if (start % 64 !== 0) bryt(`USDZ: fyrste fila byrjar på ${start}, som ikkje går opp i 64`)
  const filer = unzip(usdzUt.data as ArrayBuffer)
  if (filer.length !== 1 || !filer[0].name.endsWith(".usda")) {
    bryt(`USDZ ber ${filer.map((f) => f.name).join(", ")} og ikkje éi usda`)
  } else {
    const usda = new TextDecoder().decode(filer[0].data)
    const punkt = (usda.match(/point3f\[\] points = \[(.*)\]/)?.[1] ?? "").split("), (").length
    console.log(`  usdz      ${usdzUt.name}, ${bytar.length} B, ${punkt} punkt, fyrste fila på ${start}`)
    if (punkt !== fasit.tris * 3) bryt(`USDZ har ${punkt} punkt der nettet har ${fasit.tris * 3} hjørne`)
    if (!/metersPerUnit = 0.001/.test(usda) || !/upAxis = "Y"/.test(usda)) bryt("USDZ manglar eininga eller opp-aksen")
    // ekstenten er Y opp og i millimeter: høgda står i det andre talet
    const ext = usda.match(/extent = \[\((.+?)\), \((.+?)\)\]/)
    const hog = ext ? Number(ext[2].split(", ")[1]) - Number(ext[1].split(", ")[1]) : 0
    if (Math.abs(hog - (fasit.max[2] - fasit.min[2])) > 0.05) {
      bryt(`USDZ er ${nn(hog, 2)} mm høg der nettet er ${nn(fasit.max[2] - fasit.min[2], 2)} mm`)
    }
  }
}

// =============================================================================
// FELTET SKAL SYNE DET MOTOREN REKNAR MED
// =============================================================================
/**
 * Talfeltet finst for å koma forbi steget til skyvaren: den som har målt
 * plata si til 2,87 skal kunne skrive 2,87, av di klaringa i kvart einaste
 * spor kjem av det talet.
 *
 * Men feltet skreiv talet med STEGET si oppløysing, og la det som stod der
 * inn i utkastet når det vart teke. Eit klikk i feltet og eit klikk ut att
 * las difor «2,9» og skreiv 2,9. Målinga gjekk tapt av å bli sedd på, og
 * ingenting sa frå: oppsettet i verktykassa synte framleis 2.87.
 *
 * Runden nedanfor er akkurat den handlinga — klemme, skrive ut, lese
 * attende, klemme — og han skal ende der han byrja. For KVART band, og for
 * verdiar som med vilje ligg mellom to steg.
 */
{
  let sett = 0
  const runde = (k: string, v: number) => {
    const r = PARAM_RANGES[k]
    const lagra = snap(v, r)
    const attende = snap(lesTal(feltTal(lagra, r.step).replace(".", ",")), r)
    sett++
    if (attende !== lagra) {
      bryt(`feltet: ${k} = ${lagra} vert ${attende} av å bli sedd på`)
    }
  }
  for (const k of Object.keys(PARAM_RANGES)) {
    const r = PARAM_RANGES[k]
    // Endane, midten, og fire punkt som med vilje ikkje ligg på eit steg.
    const mid = (r.min + r.max) / 2
    for (const v of [
      r.min,
      r.max,
      mid,
      mid + r.step / 3,
      mid - r.step / 7,
      r.min + r.step * 1.5,
      r.max - r.step / 2.5,
    ]) {
      runde(k, v)
    }
  }
  console.log(`\n=== talfeltet ===\n  ${sett} verdiar over ${Object.keys(PARAM_RANGES).length} band`)
}

console.log(brot ? `\n${brot} påstandar held ikkje` : "\nalle påstandar held")
process.exit(brot ? 1 : 0)
