/**
 * Prøvebenken. Han køyrer motoren utan nettlesar og skriv ut det ein
 * elles måtte sjå på skjermen for å vita: kor mange delar, kor mange
 * ledd, kor lang kutten er, og om kuttfilene i det heile vart til noko.
 *
 *   npx tsx scripts/probe.ts
 */
import { VAFFEL } from "../lib/vaffel/engine"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { meshToStl } from "../lib/vaffel/export-stl"
import { makeSoup } from "../lib/soup"
import { glb } from "./glbfil"
import { feltTal, klokke, lesTal, snap, type ParamBag } from "../lib/core"
import { PARAM_RANGES } from "../lib/vaffel/params"

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
  const m = VAFFEL.measure(bag)
  const r = VAFFEL.rules(bag, m)
  const tMeasure = Date.now() - t0

  const t1 = Date.now()
  const lag = VAFFEL.build(bag, "mid", "lag")
  const flate = VAFFEL.build(bag, "mid", "flate")
  const kontur = VAFFEL.build(bag, "mid", "kontur")
  const tBuild = Date.now() - t1

  const t2 = Date.now()
  const stl = VAFFEL.exportFile(bag, "stl")
  const dxf = VAFFEL.exportFile(bag, "dxf")
  const svg = VAFFEL.exportFile(bag, "svg")
  const ark = VAFFEL.exportFile(bag, "ark")
  const tExport = Date.now() - t2

  console.log(`\n=== ${name} ===`)
  console.log(
    `  nett      ${m.tris} trekantar (av ${m.srcTris}), ${m.openEdges} opne kantar`,
  )
  console.log(`  ytre      ${nn(m.envX)} x ${nn(m.envY)} x ${nn(m.envZ)} mm`)
  console.log(`  ribber    ${m.units}   ledd ${m.joints}`)
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
    } linjer`,
  )
  const bytes = (o: { text?: string; data?: ArrayBuffer }) =>
    o.text?.length ?? o.data?.byteLength ?? 0
  const prove = VAFFEL.exportFile(bag, "prove")
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
const kube = report("kube, standard", DEFAULT_PARAMS)
if (kube.m.joints !== DEFAULT_PARAMS.ribbX * DEFAULT_PARAMS.ribbY) {
  bryt(
    `venta ${DEFAULT_PARAMS.ribbX * DEFAULT_PARAMS.ribbY} ledd på ein kube, fekk ${kube.m.joints}`,
  )
}

// --- 2 tettare rutenett og tjukkare plate ---------------------------------
report("kube 400, 12x9 ribber i 6 mm", {
  ...DEFAULT_PARAMS, storleik: 400, ribbX: 12, ribbY: 9, tjukn: 6,
  arkB: 1200, arkH: 900,
})

// --- 3 tjukk plate --------------------------------------------------------
report("kube 300 i 9 mm", {
  ...DEFAULT_PARAMS, storleik: 300, tjukn: 9, arkB: 1200, arkH: 900,
})

// --- 4 vend og skaler -----------------------------------------------------
report("kube, vend 30/20/10 og 700 mm", {
  ...DEFAULT_PARAMS,
  rotX: 30, rotY: 20, rotZ: 10, storleik: 700, tjukn: 6, arkB: 1200, arkH: 900,
})

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
report("kule, importert STL", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 7, ribbY: 7 })
report("kule, glatta og forenkla", {
  ...DEFAULT_PARAMS,
  kjelde: "kule",
  glatt: 6,
  trekant: 2,
  ribbX: 7,
  ribbY: 7,
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
report("torus, staaende", { ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, ribbX: 9, ribbY: 9 })

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
  ...DEFAULT_PARAMS, kjelde: "vrengd", rotX: 90, ribbX: 9, ribbY: 9,
})
const b = report("torus, rettvend (fasit)", {
  ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, ribbX: 9, ribbY: 9,
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

  const g = report("kule frå GLB", { ...DEFAULT_PARAMS, kjelde: "glbkule", ribbX: 7, ribbY: 7 })
  const r = report("same kule, Z-opp direkte", { ...DEFAULT_PARAMS, kjelde: "rawkule", ribbX: 7, ribbY: 7 })
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
