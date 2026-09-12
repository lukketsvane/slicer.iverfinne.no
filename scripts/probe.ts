/**
 * Prøvebenken. Han køyrer motoren utan nettlesar og skriv ut det ein
 * elles måtte sjå på skjermen for å vita: kor mange delar, kor mange
 * ledd, kor lang kutten er, og om kuttfilene i det heile vart til noko.
 *
 *   npx tsx scripts/probe.ts
 */
import { MOTOR, montering } from "../lib/motor"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { meshToStl } from "../lib/export-stl"
import { makeSoup } from "../lib/soup"
import { unzip } from "../lib/zip"
import { glb } from "./glbfil"
import { feltTal, klokke, lesTal, snap, type ParamBag } from "../lib/core"
import { PARAM_RANGES } from "../lib/params"
import { lesPlan, rutenett, skrivPlan, virvel } from "../lib/plan"
import { makeKropp } from "../lib/kropp"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { flatDelar, lagDelar, lagMesh } from "../lib/mesh"
import { STABEL_LUFT } from "../lib/montasje"
import { placedRings } from "../lib/nest"
import { FILFORMER } from "../lib/scene"
import { KUBE } from "../lib/sources"
import { existsSync, readFileSync } from "node:fs"
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
  console.log(`  nett      lag ${lag.tris} tri, flate ${flate.tris} tri`)
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
 * --- 4c LAGET SOM BAND: EIT PLAN SOM HØYRER TIL EIN BIT ---------------------
 *
 * To figurar som går i kvarandre er éin kropp, og eit plan tvers gjennom gav
 * éi ribbe som strekte seg frå den eine, over glipa, og inn i den andre —
 * éin del som held to figurar i hop der du ville hatt to.
 *
 * Merkjer du biten med eit lag og planet med det same laget, høyrer planet
 * til biten: profilen vert klipt til boksen hans. Vakta måler BREIDDA på
 * delen, av di det er ho spørsmålet handlar om — og ho krev at eit umerkt
 * plan, og eit plan merkt med eit lag ingen bit har, er nøyaktig som før.
 */
{
  // to kubar på hundre millimeter som overlappar ti: éin kropp, 190 brei
  const scene = (a: string, b: string) => `kube@-45,0,0/1/0${a};kube@45,0,0/1/0${b}`
  const langs = skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5], n: [0, 1, 0], bog: 0, strek: [] }])
  const merkt = skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5], n: [0, 1, 0], bog: 0, strek: [], farge: 3 }])
  const breidd = (p: Params) => {
    const l = MOTOR.liste(p as unknown as ParamBag)
    return { n: l.length, w: Math.max(0, ...l.map((q) => q.w)), areal: l.reduce((s, q) => s + q.area, 0) }
  }
  const heil = breidd({ ...GRUNN, storleik: 190, plan: langs, scene: scene("", "") } as Params)
  console.log(`\n=== laget som band ===\n  utan merke        ${heil.n} del, ${heil.w.toFixed(0)} mm brei`)
  if (heil.n !== 1 || heil.w < 150) bryt(`to kubar som overlappar skulle gje éi brei ribbe, fekk ${heil.n} delar på ${heil.w.toFixed(0)} mm`)

  // planet merkt, men ingen bit ber laget: alt står som før
  const utan = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("", "") } as Params)
  if (utan.n !== heil.n || Math.abs(utan.w - heil.w) > 0.01) {
    bryt(`eit lag ingen bit har skulle ikkje klippe noko: ${utan.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  } else console.log(`  lag utan eigar    ${utan.n} del, ${utan.w.toFixed(0)} mm brei — urørt`)

  // biten merkt, men ikkje planet: heller ikkje noko klipp
  const berreBit = breidd({ ...GRUNN, storleik: 190, plan: langs, scene: scene("/c:3", "") } as Params)
  if (berreBit.n !== heil.n || Math.abs(berreBit.w - heil.w) > 0.01) {
    bryt(`eit umerkt plan skulle skjere heile kroppen: ${berreBit.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  } else console.log(`  berre biten merkt ${berreBit.n} del, ${berreBit.w.toFixed(0)} mm brei — urørt`)

  // begge merkte: ribba vert klipt til den eine boksen
  const bunde = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("/c:3", "") } as Params)
  console.log(`  begge merkte      ${bunde.n} del, ${bunde.w.toFixed(0)} mm brei`)
  if (bunde.w > heil.w * 0.62 || bunde.w < heil.w * 0.4) {
    bryt(`ribba skulle klippast til den eine boksen (kring halve breidda), fekk ${bunde.w.toFixed(1)} av ${heil.w.toFixed(1)} mm`)
  }
  if (bunde.areal >= heil.areal) bryt(`ei klipt ribbe skal ha mindre flate enn ei heil: ${bunde.areal.toFixed(0)} mot ${heil.areal.toFixed(0)} mm²`)

  // og ber BEGGE bitane laget, eig laget båe: ribba er heil att
  const to = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("/c:3", "/c:3") } as Params)
  console.log(`  begge bitane      ${to.n} del, ${to.w.toFixed(0)} mm brei`)
  if (Math.abs(to.w - heil.w) > heil.w * 0.02) {
    bryt(`to bitar på same laget skulle gje heile ribba att: ${to.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  }
}

/**
 * --- 4d VIRVELEN: RIBBER KRING EIN AKSE -------------------------------------
 *
 * Det andre ribbespråket møblane snakkar. n ribber kring loddaksen, kvar
 * vridd og SKOVEN UT frå han. Skuvet er heile saka: går alle gjennom aksen,
 * kryssar dei kvarandre langs den same lina, og då er det ikkje eit møbel.
 * Difor står det utarta tilfellet her ved sida av det som verkar — ei grense
 * som ikkje er prøvd er ei grense nokon flyttar.
 */
{
  const kropp = { ...GRUNN, scene: "sylinder@0,0,0/1/0", storleik: 300, tjukn: 9 }
  const vidd: [number, number] = (() => {
    const k = makeKropp({ ...kropp, plan: "" } as Params)
    return [k.solid.max[0] - k.solid.min[0], k.solid.max[1] - k.solid.min[1]]
  })()
  const paa = (n: number, r: number) => report(`virvel ${n} ribber, r ${r}`, { ...kropp, plan: skrivPlan(virvel(n, r, vidd)) } as Params)
  const open = paa(20, 0.3)
  if (open.m.parts === 0 || open.m.joints === 0 || open.m.loose > 0 || open.m.openEdges > 0) {
    bryt(`virvelen heng ikkje saman: ${open.m.parts} delar, ${open.m.joints} ledd, ${open.m.loose} lause, ${open.m.openEdges} opne kantar`)
  }
  // og gjennom aksen fell han frå kvarandre — målt, ikkje gjetta
  const midt = report("virvel gjennom aksen (utarta)", { ...kropp, plan: skrivPlan(virvel(20, 0, vidd)) } as Params)
  if (midt.m.loose <= open.m.loose) {
    bryt(`ribber gjennom aksen skulle falle frå kvarandre: ${midt.m.loose} lause mot ${open.m.loose}`)
  }
  // trebeint: det låge talet skal òg gje eit møbel som held
  const tre = report("virvel 3 ribber, r 0.18", { ...kropp, plan: skrivPlan(virvel(3, 0.18, vidd)) } as Params)
  if (tre.m.parts !== 3 || tre.m.joints === 0 || tre.m.loose > 0) {
    bryt(`tre ribber heng ikkje saman: ${tre.m.parts} delar, ${tre.m.joints} ledd, ${tre.m.loose} lause`)
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

  /**
   * OG OBJEKTFILENE ER FINARE LESNE ENN KUTTFILENE.
   *
   * Ei fil du tek med deg ut av reiskapen vert skriven éin gong; eit
   * skyvarhakk vert rekna på kvart drag. Dei to har ikkje same budsjettet,
   * og difor ikkje same oppløysinga: `DETAIL.fil` mot `DETAIL.mid`.
   *
   * Prøva les det av TREKANTTALET og ikkje av ein konstant. Eit tal i ei
   * fil kan stå medan koden sluttar å bruke det — og då er «høgare
   * oppløysing» ein påstand og ikkje ein eigenskap.
   *
   * OG HO MÅ PRØVAST PÅ NOKO KRUMT. Ein kube har rette omriss, og eit rett
   * omriss vinn ingenting på fleire celler — målt: 3072 mot 2688 trekantar,
   * som er avrunding og ikkje oppløysing. Det er ikkje ein feil i tiltaket,
   * det er heile poenget med det: oppløysing er noko KURVER treng.
   *
   * Og grensa er sett lågt med vilje. Det oppløysinga fyrst og fremst kjøper
   * er NØYAKTIGHEIT og ikkje trekantar: `tol` fylgjer rutesteget, so fila
   * går frå eit omriss som får vike 0,11 mm frå forma til eitt som får vike
   * 0,021 mm. Forenklaren held berre dei punkta han treng for å halde seg
   * innanfor, so trekanttalet stig mykje mindre enn nøyaktigheita gjer. Det
   * er rett veg: eit punkt som ikkje seier noko nytt er ein kant maskina
   * bremsar for.
   */
  const krum = { ...GRUNN, kjelde: "kule", storleik: 200 } as unknown as Params
  const finStl = MOTOR.exportFile(krum as unknown as ParamBag, "stl")
  const fin = parseMesh("fin.stl", finStl.data as ArrayBuffer)
  const grovStl = meshToStl(lagMesh(makeBygg(krum, DETAIL.mid).s, krum.tjukn), "grov")
  const grov = parseMesh("grov.stl", grovStl.buffer.slice(0) as ArrayBuffer)
  if (!(fin.tris > grov.tris * 1.25)) {
    bryt(`objektfila har ${fin.tris} trekantar mot ${grov.tris} på kuttnivået — ho er ikkje finare lesen`)
  } else {
    console.log(`  oppløysing  ei kule: objektfila ${fin.tris} trekantar mot ${grov.tris} på kuttnivået (${(fin.tris / grov.tris).toFixed(1)}×)`)
  }
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

// --- 9b GLB som SCENE: ein node per del, og dei same delane lagde flatt ---
/**
 * EIN MONTASJE DU KAN TA FRÅ KVARANDRE.
 *
 * GLB-en er ikkje eitt nett: han er eit tre. Vakta spør treet om det same
 * kuttlista svarar på — kor mange delar, og kva dei heiter — av di det er
 * NAMNET som gjer fila til noko meir enn eit bilete. Er dei to lister
 * ulike, har fila delar som ikkje finst på plata, eller delar utan namn.
 *
 * Og «flat» er den same lista ein gong til, lagd ned på plata: ei gruppe
 * per ark, og kvar del med begge flatene sine mellom null og tjukna. Ligg
 * ein del utanfor det bandet, står han ikkje flatt.
 */
{
  const bag = GRUNN as unknown as ParamBag
  const p = GRUNN as Params
  const liste = MOTOR.liste(bag)
  console.log(`\n=== glb som scene ===`)

  const montasje = tre(MOTOR.exportFile(bag, "glb").data as ArrayBuffer)
  const rot = montasje.grupper
  if (rot.length !== 1) bryt(`GLB har ${rot.length} rotnodar og ikkje éin`)
  const namn = rot.flatMap((g) => g.barn)
  console.log(`  glb       ${rot.length} gruppe «${rot[0]?.namn}», ${namn.length} nodar`)
  if (namn.length !== liste.length) bryt(`GLB har ${namn.length} delnodar der kuttlista har ${liste.length} delar`)
  const ulike = namn.filter((q, i) => q !== liste[i]?.adr)
  if (ulike.length) bryt(`GLB-nodane heiter ikkje det kuttlista gjer: ${ulike.slice(0, 4).join(", ")}`)
  else console.log(`  glb       kvar node ber adressa si — ${namn.slice(0, 4).join(", ")} …`)

  const flatUt = MOTOR.exportFile(bag, "flat")
  const flat = tre(flatUt.data as ArrayBuffer)
  const paaArk = liste.filter((k) => k.ark > 0)
  const ark = [...new Set(paaArk.map((k) => k.ark))].length
  const flatNamn = flat.grupper.flatMap((g) => g.barn)
  console.log(`  flat      ${flatUt.name}, ${flat.grupper.length} grupper (${flat.grupper.map((g) => g.namn).join(", ")}), ${flatNamn.length} nodar`)
  if (flat.grupper.length !== ark) bryt(`«flat» har ${flat.grupper.length} grupper der nestinga la delane på ${ark} ark`)
  if (flatNamn.length !== paaArk.length) bryt(`«flat» har ${flatNamn.length} nodar der ${paaArk.length} delar ligg på plata`)
  if ([...flatNamn].sort().join() !== paaArk.map((k) => k.adr).sort().join()) bryt("«flat» ber andre adresser enn dei som ligg på plata")
  // glTF er Y opp, so verkstaden si z — tjukna — er y i fila, i meter
  const t = p.tjukn / 1000
  if (flat.lo < -1e-6 || flat.hog > t + 1e-6) {
    bryt(`«flat» går frå ${nn(flat.lo * 1000, 3)} til ${nn(flat.hog * 1000, 3)} mm og ikkje frå 0 til ${nn(p.tjukn, 2)}`)
  } else {
    console.log(`  flat      alle delane ligg mellom 0 og ${nn(p.tjukn, 2)} mm — plata står på golvet`)
  }

  /**
   * EI DELT RIBBE HAR EI ADRESSE MED BOKSTAV I, og det er den saka som
   * ryk fyrst om nodane skulle finne delane sine ein annan veg enn
   * kuttlista gjer. To kubar med luft imellom: kvart plan tvers over dei
   * skjer to lause stykke, og dei heiter «4a» og «4b».
   */
  /**
   * 3MF: DET SAME, I DET FORMATET EIN SLICER OPNAR.
   *
   * Ein slicer les ikkje GLB, so «flat» er rett geometri i feil format.
   * Fila er ein OPC-pakke — tre filer i ein ZIP — og innhaldet er XML som
   * ein kan lesa. Vakta spør om det som gjer at Bambu Studio opnar henne
   * utan å klage: at pakka har dei tre filene, at eininga er millimeter,
   * at kvart objekt står i bygglista, at namna er adressene, og at ingen
   * trekant peikar utanfor si eiga hjørneliste eller på seg sjølv.
   *
   * OG AT TALA IKKJE ER DELTE PÅ TUSEN. 3MF er millimeter og z opp, som
   * verkstaden; GLB er meter og y opp. To formata som ser like ut i koden
   * og ikkje i fila, og ein del på 0,003 mm er ein del du ikkje ser.
   */
  const mfUt = MOTOR.exportFile(bag, "3mf")
  const pakke = unzip(mfUt.data as ArrayBuffer)
  const filer = pakke.map((f) => f.name).sort()
  console.log(`  3mf       ${mfUt.name}, ${(mfUt.data as ArrayBuffer).byteLength} B, ${filer.join(" ")}`)
  if (filer.join(" ") !== "3D/3dmodel.model [Content_Types].xml _rels/.rels") bryt(`3MF-pakka ber ${filer.join(", ")}`)
  const mf = new TextDecoder().decode(pakke.find((f) => f.name === "3D/3dmodel.model")?.data ?? new Uint8Array())
  if (!/unit="millimeter"/.test(mf)) bryt("3MF seier ikkje at eininga er millimeter")
  const mfNamn = [...mf.matchAll(/<object id="(\d+)"[^>]*name="([^"]*)"/g)].map((m) => ({ id: m[1], namn: m[2] }))
  const mfBygg = [...mf.matchAll(/<item objectid="(\d+)"/g)].map((m) => m[1])
  console.log(`  3mf       ${mfNamn.length} objekt, ${mfBygg.length} i bygglista`)
  if (mfNamn.length !== paaArk.length) bryt(`3MF har ${mfNamn.length} objekt der ${paaArk.length} delar ligg på plata`)
  if (mfBygg.join() !== mfNamn.map((q) => q.id).join()) bryt("3MF sin byggliste og objektlista er ikkje den same")
  if (mfNamn.map((q) => q.namn).sort().join() !== paaArk.map((k) => k.adr).sort().join()) bryt("3MF ber andre namn enn adressene på plata")
  // hjørna: same høgda som «flat», og i MILLIMETER
  const zar = [...mf.matchAll(/<vertex [^>]*z="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
  const zLo = Math.min(...zar)
  const zHog = Math.max(...zar)
  if (Math.abs(zLo) > 1e-3 || Math.abs(zHog - p.tjukn) > 1e-3) {
    bryt(`3MF går frå ${nn(zLo, 3)} til ${nn(zHog, 3)} og ikkje frå 0 til ${nn(p.tjukn, 2)} mm`)
  } else {
    console.log(`  3mf       millimeter og z opp: plata står frå 0 til ${nn(zHog, 2)}`)
  }
  /**
   * OG AT KVAR DEL ER EIN LUKKA KROPP.
   *
   * Det er dette som avgjer om slicaren opnar fila eller melder «ikkje
   * manifold — reparer?». Prøva er kantane: i eit lukka nett med rett
   * vinding går kvar kant nøyaktig éin gong den eine vegen og éin gong
   * den andre. Ein kant utan makker er eit hòl i skalet; ein kant som
   * går same vegen to gonger er to flater som vender kvar sin veg.
   *
   * Volumet seier kva veg heile skalet vender. Positivt er ut. Eit nett
   * som er vrengt har same kantane og er like fullt eit hòl i lufta.
   */
  let vondt = 0
  let opne = 0
  let dobble = 0
  let vrengde = 0
  for (const bit of mf.split("<object ").slice(1)) {
    const V = [...bit.matchAll(/<vertex x="(-?[\d.]+)" y="(-?[\d.]+)" z="(-?[\d.]+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
    const kant = new Set<string>()
    let vol = 0
    for (const t of bit.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)) {
      const a = Number(t[1])
      const b = Number(t[2])
      const c = Number(t[3])
      if (a === b || b === c || c === a || a >= V.length || b >= V.length || c >= V.length) {
        vondt++
        continue
      }
      for (const [u, w] of [[a, b], [b, c], [c, a]]) {
        if (kant.has(`${u}>${w}`)) dobble++
        kant.add(`${u}>${w}`)
      }
      const [A, B, C] = [V[a], V[b], V[c]]
      vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6
    }
    for (const k of kant) {
      const [u, w] = k.split(">")
      if (!kant.has(`${w}>${u}`)) opne++
    }
    if (vol <= 0) vrengde++
  }
  if (vondt) bryt(`3MF har ${vondt} trekantar som peikar på seg sjølve eller utanfor hjørnelista`)
  if (opne || dobble) bryt(`3MF er ikkje lukka: ${opne} kantar utan makker, ${dobble} kantar same veg to gonger`)
  if (vrengde) bryt(`3MF har ${vrengde} delar med volum ≤ 0 — skalet vender inn`)
  if (!vondt && !opne && !dobble && !vrengde) console.log(`  3mf       kvar del er ein lukka kropp som vender ut — slicaren har ingenting å reparere`)

  const delt = { ...GRUNN, scene: "kube@-60,0,0/1/0;kube@60,0,0/1/0", plan: nett(3, 3) } as unknown as ParamBag
  const dl = MOTOR.liste(delt)
  const dNamn = tre(MOTOR.exportFile(delt, "glb").data as ArrayBuffer).grupper.flatMap((g) => g.barn)
  const dFlat = tre(MOTOR.exportFile(delt, "flat").data as ArrayBuffer).grupper.flatMap((g) => g.barn)
  const dPaa = dl.filter((k) => k.ark > 0).map((k) => k.adr)
  console.log(`  delte     to kubar, ${dl.length} delar: ${dl.map((k) => k.adr).join(" ")}`)
  if (!dl.some((k) => /[a-z]$/.test(k.adr))) bryt("prøva på delte ribber deler ingen ribbe lenger")
  if (dNamn.join() !== dl.map((k) => k.adr).join()) bryt(`GLB-nodane er ${dNamn.join(" ")} der kuttlista er ${dl.map((k) => k.adr).join(" ")}`)
  else if ([...dFlat].sort().join() !== [...dPaa].sort().join()) bryt(`«flat» er ${dFlat.join(" ")} der plata ber ${dPaa.join(" ")}`)
  else console.log(`  delte     stykka har kvar sin node, i begge filene`)
}

/**
 * Scena i ein GLB, lese rett av JSON-blokka: gruppene, borna deira, og kor
 * høgt geometrien går. `lib/io/glb.ts` les TREKANTANE og gløymer treet —
 * det er rett der, og feil her, av di det er treet vakta spør om.
 */
function tre(buf: ArrayBuffer): { grupper: { namn: string; barn: string[] }[]; lo: number; hog: number } {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  const g = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as {
    scenes?: { nodes?: number[] }[]
    nodes?: { name?: string; children?: number[] }[]
    accessors?: { min?: number[]; max?: number[] }[]
  }
  const nodes = g.nodes ?? []
  const grupper = (g.scenes?.[0]?.nodes ?? []).map((i) => ({
    namn: nodes[i]?.name ?? "",
    barn: (nodes[i]?.children ?? []).map((k) => nodes[k]?.name ?? ""),
  }))
  let lo = Infinity
  let hog = -Infinity
  for (const a of g.accessors ?? []) {
    if (a.min) lo = Math.min(lo, a.min[1])
    if (a.max) hog = Math.max(hog, a.max[1])
  }
  return { grupper, lo, hog }
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

/**
 * DEI INNEBYGDE FORMENE LIGG SOM FILER, og ei fil som manglar er ikkje ein
 * feil du ser: `source` fell attende på kuben, og menyen tilbyr ei form som
 * gjev deg noko anna enn ho seier. Vakta krev at kvar id i `FILFORMER` har
 * fila si, at ho let seg lese, at ho har trekantar under taket bygget
 * likevel skjer henne ned til, og at ho har ei utstrekning i alle tre
 * retningane — ei form som er flat i ei akse er ei form som vart snudd feil
 * på vegen ut av `scripts/former.ts`.
 */
{
  console.log("\n=== dei innebygde formene ===")
  for (const id of FILFORMER) {
    const sti = `public/form/${id}.glb`
    if (!existsSync(sti)) {
      bryt(`${id}: fila finst ikkje (${sti})`)
      continue
    }
    const b = readFileSync(sti)
    const soup = parseMesh(`${id}.glb`, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    const boks = soup.max.map((c, i) => c - soup.min[i])
    const flat = boks.some((c) => !(c > 0))
    const tak = DEFAULT_PARAMS.trekant * 1000
    if (soup.tris < 1) bryt(`${id}: ingen trekantar`)
    else if (soup.tris > tak) bryt(`${id}: ${soup.tris} trekantar, over taket på ${tak}`)
    else if (flat) bryt(`${id}: boksen er ${boks.join(" × ")} — flat i ei akse`)
    else console.log(`  ${id.padEnd(13)} ${String(soup.tris).padStart(6)} tri   ${(b.length / 1024).toFixed(0)} kB   ${boks.map((c) => +c.toPrecision(3)).join(" × ")}`)
  }
}

/**
 * BØYEN: BUELENGDA ER LENGDA.
 *
 * Ei bøygd ribbe vert skoren FLAT og bøygd ved montering, so det flate
 * mønsteret må vera flata rulla ut — buelengda, ikkje korda. Går det gale,
 * kjem delen ut for kort, og ingenting på skjermen seier frå: profilen ser
 * heilt rett ut, plata ser heilt rett ut, og du finn det når delen ikkje
 * når fram.
 *
 * Difor eit tal som kan reknast for hand. Ein kube på 300 mm, kutta av ein
 * sylinder med radius R gjennom midten: korda er 300, halvvinkelen er
 * asin(150/R), og buen er 2·R·asin(150/R). Ved R = 600 er det 303,3 mm.
 */
{
  console.log("\n=== bøyen ===")
  const S = 300
  const grunn = { ...DEFAULT_PARAMS, kjelde: KUBE, storleik: S, tjukn: 6, plan: skrivPlan(rutenett(1, 0)) } as Params
  for (const bog of [0, 0.25, 0.5, 1]) {
    const l = lesPlan(grunn.plan).map((q) => ({ ...q, bog }))
    const bag = { ...grunn, plan: skrivPlan(l) } as unknown as ParamBag
    const k = MOTOR.liste(bag)[0]
    if (!k) {
      bryt(`bog ${bog}: ingen del`)
      continue
    }
    const R = bog ? S / bog : Infinity
    const vent = bog ? 2 * R * Math.asin(Math.min(1, S / 2 / R)) : S
    const av = Math.abs(k.w - vent)
    // ei cellebreidd mon: profilen vert lesen av ei rute, ikkje av formelen
    if (av > 3) bryt(`bog ${bog}: mønsteret er ${nn(k.w, 2)} mm breitt, buen er ${nn(vent, 2)} mm`)
    else console.log(`  bog ${String(bog).padEnd(5)} R ${bog ? nn(R, 0).padStart(5) : " flat"} mm   mønster ${nn(k.w, 1)} mm, bue ${nn(vent, 1)} mm`)
  }
  // og ein bøy som ikkje er der skal gje NØYAKTIG det same som ingen bøy:
  // eit tal som snik seg inn i nøkkelen er eit bygg som vert rekna om att
  const flat = MOTOR.measure({ ...grunn } as unknown as ParamBag)
  const null0 = MOTOR.measure({ ...grunn, plan: skrivPlan(lesPlan(grunn.plan).map((q) => ({ ...q, bog: 0 }))) } as unknown as ParamBag)
  if (flat.cutLen !== null0.cutLen || flat.parts !== null0.parts) bryt("bog 0 gjev eit anna svar enn ingen bog")
  else console.log(`  bog 0 er det same som ingen bog: ${nn(flat.cutLen, 0)} mm kutt`)
}

/**
 * MONTASJEN — vegen frå plata til objektet.
 *
 * Heile reiskapen kviler på éin påstand: at ein del ligg på plata og står i
 * objektet som DET SAME nettet, flytt stivt. Held han, treng montasjen
 * berre eitt nett og to matriser, og alt imellom er ei interpolering. Held
 * han ikkje, er animasjonen ei løgn om ein del som ikkje passar.
 *
 * So prøva reknar det ut: ho tek delen sitt eige nett, gonger det med kvar
 * av dei to matrisene, og krev at svaret er NØYAKTIG dei to nettverka
 * motoren byggjer kvar for seg — det same GLB-en og den flate GLB-en er.
 */
{
  console.log("\n=== montasjen ===")
  const bag = { ...GRUNN, storleik: 300, tjukn: 6 } as unknown as ParamBag
  const m = MOTOR.montasje(bag)
  const b = makeBygg(bag as unknown as Params, DETAIL.mid)
  const staaende = new Map(lagDelar(b.s, b.dl.delar, 6).map((d) => [d.adr, d.positions]))
  /**
   * DEN FLATE FASITEN, FLYTT INN I STABELEN.
   *
   * `flatDelar` sprer platene bortover x — det er ei fil du ser gjennom.
   * Montasjen legg dei i stabel midt under kroppen, av di det er benken.
   * Skilnaden er eit kjent skuv per plate og ingenting anna, so fasiten er
   * framleis den same geometrien motoren skriv til fila: er ho det ikkje,
   * ligg delen ein annan stad på plata enn der laseren skjer han.
   */
  const bk = b.k.solid
  // det same «brukt»-området montasjen sentrerer stabelen på
  const brukt = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const sh of b.ns.sheets) {
    for (const q of sh.placed) {
      for (const pt of placedRings(q).outline) {
        brukt.x0 = Math.min(brukt.x0, pt[0])
        brukt.y0 = Math.min(brukt.y0, pt[1])
        brukt.x1 = Math.max(brukt.x1, pt[0])
        brukt.y1 = Math.max(brukt.y1, pt[1])
      }
    }
  }
  const liggjande = new Map(
    flatDelar(b.ns, 6).flatMap((g) =>
      g.delar.map((d) => {
        const i = g.ark - 1
        const skuv: [number, number, number] = [
          -i * b.ns.sheetW * 1.1 + (bk.min[0] + bk.max[0]) / 2 - (brukt.x0 + brukt.x1) / 2,
          (bk.min[1] + bk.max[1]) / 2 - (brukt.y0 + brukt.y1) / 2,
          bk.min[2] + i * 6 * STABEL_LUFT,
        ]
        const q = new Float32Array(d.positions.length)
        for (let j = 0; j < q.length; j++) q[j] = d.positions[j] + skuv[j % 3]
        return [d.adr, q] as const
      }),
    ),
  )
  const liste = MOTOR.liste(bag)
  if (m.delar.length !== liste.length) bryt(`montasjen har ${m.delar.length} delar, kuttlista ${liste.length}`)
  else console.log(`  ${m.delar.length} delar, ${m.steg} steg, ${new Set(m.delar.map((d) => d.ark)).size} plate(r)`)

  /** eit punkt gjennom ei 4×4 i kolonnerekkjefylgje */
  const gjennom = (M: Float32Array, x: number, y: number, z: number) => [
    M[0] * x + M[4] * y + M[8] * z + M[12],
    M[1] * x + M[5] * y + M[9] * z + M[13],
    M[2] * x + M[6] * y + M[10] * z + M[14],
  ]
  /** determinanten til dei tre fyrste kolonnene: +1 er ei ekte rotasjon */
  const det = (M: Float32Array) =>
    M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5])
  let verst = 0
  let skeiv = 0
  for (const d of m.delar) {
    // ingen spegling og inga skalering: elles er «flytt stivt» ikkje sant,
    // og ein del som er spegla er ein del som ikkje passar i hòlet sitt
    if (Math.abs(det(d.ferdig) - 1) > 1e-4 || Math.abs(det(d.flat) - 1) > 1e-4) skeiv++
    for (const [M, fasit] of [[d.ferdig, staaende.get(d.adr)], [d.flat, liggjande.get(d.adr)]] as const) {
      if (!fasit || fasit.length !== d.positions.length) {
        bryt(`${d.adr}: nettet er ${d.positions.length / 3} punkt, fasiten ${(fasit?.length ?? 0) / 3}`)
        break
      }
      for (let i = 0; i < d.positions.length; i += 3) {
        const q = gjennom(M, d.positions[i], d.positions[i + 1], d.positions[i + 2])
        for (let k = 0; k < 3; k++) verst = Math.max(verst, Math.abs(q[k] - fasit[i + k]))
      }
    }
  }
  if (skeiv) bryt(`${skeiv} delar er spegla eller skalerte av matrisa si`)
  // ein tidel av ein mikrometer: dette er den same rekninga gjord to gonger,
  // so avviket er float32 og ikkje geometri
  if (verst > 1e-3) bryt(`matrisene bommar med ${verst.toExponential(1)} mm på nettet motoren byggjer`)
  else console.log(`  matrisene råkar begge netta: verste avvik ${verst.toExponential(1)} mm, alle stive`)

  /**
   * OG STEGA ER RETNINGANE. Eit rutenett er to gjengar ribber som ikkje
   * kryssar sine eigne: to steg, kva veg du enn snur det. Ein virvel har
   * inga to parallelle ribber, og då er kvar ribbe sitt eige steg — som er
   * sant om ein virvel: han vert bygd éi om gongen.
   */
  for (const [nx, ny, vent] of [[6, 6, 2], [4, 0, 1]] as const) {
    const g = MOTOR.montasje({ ...GRUNN, plan: nett(nx, ny) } as unknown as ParamBag)
    if (g.steg !== vent) bryt(`rutenett ${nx}×${ny}: ${g.steg} steg, venta ${vent}`)
    else console.log(`  rutenett ${nx}×${ny}: ${g.steg} steg`)
  }
  /**
   * OG STEGA MOTSEIER ALDRI `montering.txt`.
   *
   * Rekkjefylgja delane KAN monterast i er motoren si — han reknar henne av
   * ledda, hardregelen «kan monterast» vaktar henne, og ho ligg i eska som
   * `montering.txt`. Montasjen reknar ikkje ei ny: han klumpar hennar i
   * retningar. So går ein gjennom ordenen frå ende til annan, skal steget
   * aldri gå NEDOVER — gjer det det, syner animasjonen ei anna montering
   * enn arket, og då er det animasjonen som lyg.
   */
  const orden = b.s.montering.orden
  const plan2steg = new Map<number, number>()
  for (const d of b.dl.delar) {
    const md = m.delar.find((q) => q.adr === d.adr)
    if (md) plan2steg.set(d.plan, md.steg)
  }
  let fall = 0
  let foerre = -1
  for (const id of orden) {
    const st = plan2steg.get(id)
    if (st === undefined) continue
    if (st < foerre) fall++
    foerre = st
  }
  if (fall) bryt(`${fall} stader går steget nedover i monteringsordenen`)
  else console.log(`  og stega fylgjer montering.txt: ${orden.length} plan, aldri eit steg attende`)

  /**
   * OG VEGEN INN HØYRER RETT DEL TIL.
   *
   * At ORDLYDEN stemmer, er det ingen prøve som treng å seie: båe utgåvene
   * spør `vegen` om det same, so dei kan ikkje verta usamde. Ein prøve på
   * det ville vore ein prøve på at koden er den koden han er.
   *
   * Det som KAN ryke er kopla. Arket går gjennom monteringsordenen og
   * nummererer plan; fana går gjennom delar og finn dei på ADRESSE, og ein
   * plan kan verta fleire delar. Ei bom der gjev kvar del vegen til
   * nabodelen — kvart ord rett, kvart ord på feil rad — og ingenting anna
   * i huset ville sagt frå. Det er den kopla denne prøva går gjennom.
   */
  const arket = montering(bag as unknown as Params, b.s)
  const ORD: Record<string, RegExp> = {
    ned: /ovanfrå og ned/,
    opp: /nedanfrå og opp/,
    side: /sidelengs/,
    ligg: /^ligg\b|ligg —/,
  }
  let ulike = 0
  let prøvde = 0
  for (const [i, id] of orden.entries()) {
    const del = b.dl.delar.find((d) => d.plan === id)
    const md = del ? m.delar.find((q) => q.adr === del.adr) : undefined
    if (!md) continue
    // lina i arket er nummerert med plassen i ordenen
    const line = arket.split("\n").find((l) => new RegExp(`^\\s*${i + 1}\\s+${id}\\b`).test(l))
    if (!line) continue
    prøvde++
    if (!ORD[md.veg]?.test(line)) ulike++
  }
  /**
   * OG EIN MONTASJE SOM IKKJE GÅR OPP SEIER DET I FILA.
   *
   * Den harde regelen `orden` seier det på skjermen. Skjermen står ikkje ved
   * benken. `montering.txt` er fila som gjer det, og ho listar eit plan med
   * nummer på — so ho skal ikkje gje deg ei liste som ser ut som ein plan
   * når motoren veit ho stoggar.
   *
   * Tre plan gjennom det same senteret er tilfellet: kvart par kryssar langs
   * si eiga line, og den tredje kjem ikkje inn same kva rekkjefylgje du tek
   * dei i.
   */
  {
    const umogeleg = {
      ...DEFAULT_PARAMS,
      plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,1,0;3@0.5,0.5,0.5/0,0,1",
    } as unknown as Params
    const b2 = makeBygg(umogeleg, DETAIL.mid)
    const tekst = montering(umogeleg, b2.s)
    const fast = b2.s.montering.brot
    if (!fast.length) bryt("tre plan gjennom senteret vart ikkje meldt som umogeleg å montere")
    else if (!tekst.includes("DETTE GÅR IKKJE OPP")) bryt("montering.txt listar ei rekkjefylgje som ikkje går, utan å seie det")
    else if (!tekst.includes("STÅR FAST")) bryt("montering.txt seier frå, men merkjer ikkje kva line som stoggar")
    else console.log(`  og ein montasje som ikkje går opp seier det i fila: ${fast.length} del(ar) står fast`)
    // og eit rutenett skal IKKJE bera varselet
    const greitt = montering(GRUNN as unknown as Params, makeBygg(GRUNN, DETAIL.mid).s)
    if (greitt.includes("DETTE GÅR IKKJE OPP")) bryt("eit rutenett som går opp fekk varselet likevel")
  }

  if (!prøvde) bryt("fann ingen liner i montering.txt å samanlikne vegen med")
  else if (ulike) bryt(`${ulike} av ${prøvde} delar har vegen til ein annan del enn seg sjølv`)
  else console.log(`  og vegen inn høyrer rett del til: ${prøvde} delar`)

  const v = { ...DEFAULT_PARAMS, plan: skrivPlan(virvel(9, 0.3, [1, 1])) } as unknown as ParamBag
  const vm = MOTOR.montasje(v)
  const vplan = new Set(vm.delar.map((d) => d.steg)).size
  if (vplan !== 9) bryt(`virvel med 9 ribber: ${vplan} steg`)
  else console.log(`  virvel med 9 ribber: ${vplan} steg — éi om gongen`)
}

console.log(brot ? `\n${brot} påstandar held ikkje` : "\nalle påstandar held")
process.exit(brot ? 1 : 0)
