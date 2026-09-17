import { MOTOR, montering } from "../lib/motor"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { parseMesh } from "../lib/io"
import { put } from "../lib/sources"
import { meshToStl } from "../lib/export-stl"
import { makeSoup } from "../lib/soup"
import { unzip } from "../lib/zip"
import { glb } from "./glbfil"
import { feltTal, klokke, lesTal, snap, type ParamBag, type Pt, type Vec3 } from "../lib/core"
import { PARAM_RANGES } from "../lib/params"
import { lesPlan, rutenett, skrivPlan, ut, type Plan } from "../lib/plan"
import { makeKropp } from "../lib/kropp"
import { makeBygg } from "../lib/bygg"
import { DETAIL, stykkeLangs } from "../lib/snitt"
import { flatDelar, lagDelar, lagMesh, merkeFor } from "../lib/mesh"
import { STABEL_LUFT } from "../lib/montasje"
import { placedRings } from "../lib/nest"
import { FILFORMER } from "../lib/scene"
import { KUBE } from "../lib/sources"
import { areal, merkeFlater } from "../lib/merke"
import { checkRules } from "../lib/rules"
import { existsSync, readFileSync } from "node:fs"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

const vifte = (n: number, r: number, vidd: readonly [number, number], fraa = 1): Plan[] => {
  const W = Math.max(1e-6, vidd[0])
  const D = Math.max(1e-6, vidd[1])
  const d = r * Math.min(W, D)
  const ut: Plan[] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const nv: [number, number, number] = [+Math.cos(a).toFixed(4), +Math.sin(a).toFixed(4), 0]
    ut.push({
      id: fraa + i,
      o: [+(0.5 + (d * nv[0]) / W).toFixed(4), +(0.5 + (d * nv[1]) / D).toFixed(4), 0.5],
      n: nv, bog: 0, strek: [], gruppe: 1,
    })
  }
  return ut
}

const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }

const nn = (v: number, d = 1) => v.toFixed(d)

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

const kube = report("kube, standard", GRUNN)
if (kube.m.joints !== 36) {
  bryt(
    `venta 36 ledd på ein kube, fekk ${kube.m.joints}`,
  )
}

report("kube 400, 12x9 ribber i 6 mm", {
  ...GRUNN, storleik: 400, plan: nett(12, 9), tjukn: 6,
  arkB: 1200, arkH: 900,
})

report("kube 300 i 9 mm", {
  ...GRUNN, storleik: 300, tjukn: 9, arkB: 1200, arkH: 900,
})

report("kube, vend 30/20/10 og 700 mm", {
  ...GRUNN,
  rotX: 30, rotY: 20, rotZ: 10, storleik: 700, tjukn: 6, arkB: 1200, arkH: 900,
})

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

{
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

  const utan = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("", "") } as Params)
  if (utan.n !== heil.n || Math.abs(utan.w - heil.w) > 0.01) {
    bryt(`eit lag ingen bit har skulle ikkje klippe noko: ${utan.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  } else console.log(`  lag utan eigar    ${utan.n} del, ${utan.w.toFixed(0)} mm brei — urørt`)

  const berreBit = breidd({ ...GRUNN, storleik: 190, plan: langs, scene: scene("/c:3", "") } as Params)
  if (berreBit.n !== heil.n || Math.abs(berreBit.w - heil.w) > 0.01) {
    bryt(`eit umerkt plan skulle skjere heile kroppen: ${berreBit.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  } else console.log(`  berre biten merkt ${berreBit.n} del, ${berreBit.w.toFixed(0)} mm brei — urørt`)

  const bunde = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("/c:3", "") } as Params)
  console.log(`  begge merkte      ${bunde.n} del, ${bunde.w.toFixed(0)} mm brei`)
  if (bunde.w > heil.w * 0.62 || bunde.w < heil.w * 0.4) {
    bryt(`ribba skulle klippast til den eine boksen (kring halve breidda), fekk ${bunde.w.toFixed(1)} av ${heil.w.toFixed(1)} mm`)
  }
  if (bunde.areal >= heil.areal) bryt(`ei klipt ribbe skal ha mindre flate enn ei heil: ${bunde.areal.toFixed(0)} mot ${heil.areal.toFixed(0)} mm²`)

  const to = breidd({ ...GRUNN, storleik: 190, plan: merkt, scene: scene("/c:3", "/c:3") } as Params)
  console.log(`  begge bitane      ${to.n} del, ${to.w.toFixed(0)} mm brei`)
  if (Math.abs(to.w - heil.w) > heil.w * 0.02) {
    bryt(`to bitar på same laget skulle gje heile ribba att: ${to.w.toFixed(1)} mot ${heil.w.toFixed(1)} mm`)
  }
}

{
  const kropp = { ...GRUNN, scene: "sylinder@0,0,0/1/0", storleik: 300, tjukn: 9 }
  const vidd: [number, number] = (() => {
    const k = makeKropp({ ...kropp, plan: "" } as Params)
    return [k.solid.max[0] - k.solid.min[0], k.solid.max[1] - k.solid.min[1]]
  })()
  const paa = (n: number, r: number) => report(`vifte ${n} plan, r ${r}`, { ...kropp, plan: skrivPlan(vifte(n, r, vidd)) } as Params)
  const open = paa(20, 0.3)
  if (open.m.parts === 0 || open.m.joints === 0 || open.m.loose > 0 || open.m.openEdges > 0) {
    bryt(`vifta heng ikkje saman: ${open.m.parts} delar, ${open.m.joints} ledd, ${open.m.loose} lause, ${open.m.openEdges} opne kantar`)
  }
  const midt = report("vifte gjennom aksen (utarta)", { ...kropp, plan: skrivPlan(vifte(20, 0, vidd)) } as Params)
  if (midt.m.loose <= open.m.loose) {
    bryt(`ribber gjennom aksen skulle falle frå kvarandre: ${midt.m.loose} lause mot ${open.m.loose}`)
  }
  const tre = report("vifte, 3 plan, r 0.18", { ...kropp, plan: skrivPlan(vifte(3, 0.18, vidd)) } as Params)
  if (tre.m.parts !== 3 || tre.m.joints === 0 || tre.m.loose > 0) {
    bryt(`tre ribber heng ikkje saman: ${tre.m.parts} delar, ${tre.m.joints} ledd, ${tre.m.loose} lause`)
  }
}

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

{
  const seg = 32
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
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
      pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  }
  const yup = new Float32Array(pos)
  put("glbkule", "kule.glb", parseMesh("k.glb", glb(yup, null, [{ mesh: 0 }], [0])))

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

{
  const bag = GRUNN as unknown as ParamBag
  const stlUt = MOTOR.exportFile(bag, "stl")
  const glbUt = MOTOR.exportFile(bag, "glb")
  const usdzUt = MOTOR.exportFile(bag, "usdz")
  const fasit = parseMesh("ut.stl", stlUt.data as ArrayBuffer)
  const les = parseMesh("ut.glb", glbUt.data as ArrayBuffer)
  console.log(`\n=== glb og usdz ===`)

  const krum = { ...GRUNN, kjelde: "kule", storleik: 200, plan: nett(1, 0) } as unknown as Params
  const finStl = MOTOR.exportFile(krum as unknown as ParamBag, "stl")
  const fin = parseMesh("fin.stl", finStl.data as ArrayBuffer)
  const grovStl = meshToStl(lagMesh(makeBygg(krum, DETAIL.mid).s, krum.tjukn), "grov")
  const grov = parseMesh("grov.stl", grovStl.buffer.slice(0) as ArrayBuffer)
  const sentrum = makeBygg(krum, DETAIL.mid).k.solid
  const cy = (sentrum.min[1] + sentrum.max[1]) / 2
  const cz = (sentrum.min[2] + sentrum.max[2]) / 2
  const kurveAvvik = (nett: ReturnType<typeof parseMesh>) => {
    const punkt = new Map<string, Pt>()
    for (let i = 0; i < nett.pos.length; i += 3) {
      const p: Pt = [nett.pos[i + 1], nett.pos[i + 2]]
      punkt.set(p.map(v => v.toFixed(7)).join(","), p)
    }
    const ring = [...punkt.values()].sort((a, b) => Math.atan2(a[1] - cz, a[0] - cy) - Math.atan2(b[1] - cz, b[0] - cy))
    let verst = 0
    for (let i = 0; i < 720; i++) {
      const a = ((i + 0.5) / 720) * 2 * Math.PI
      const steg = Math.PI / 48
      const radius = 100 * Math.cos(steg / 2) / Math.cos(a % steg - steg / 2)
      const maal = stykkeLangs([ring], [cy, cz], [Math.cos(a), Math.sin(a)]).find(([lo, hi]) => lo <= 0 && hi >= 0)?.[1] ?? Infinity
      verst = Math.max(verst, Math.abs(maal - radius))
    }
    return verst
  }
  const finFeil = kurveAvvik(fin), grovFeil = kurveAvvik(grov)
  if (!(finFeil < 0.03 && finFeil < grovFeil / 3)) bryt(`kurveavvik i STL: fin ${finFeil.toFixed(4)} mm, kutt ${grovFeil.toFixed(4)} mm — krev under 0,03 mm og minst 3× betre`)
  else console.log(`  oppløysing  eksportert kule: avvik ${grovFeil.toFixed(4)} → ${finFeil.toFixed(4)} mm (${fin.tris} mot ${grov.tris} trekantar)`)
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
    const ext = usda.match(/extent = \[\((.+?)\), \((.+?)\)\]/)
    const hog = ext ? Number(ext[2].split(", ")[1]) - Number(ext[1].split(", ")[1]) : 0
    if (Math.abs(hog - (fasit.max[2] - fasit.min[2])) > 0.05) {
      bryt(`USDZ er ${nn(hog, 2)} mm høg der nettet er ${nn(fasit.max[2] - fasit.min[2], 2)} mm`)
    }
  }
}

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
  const t = p.tjukn / 1000
  if (flat.lo < -1e-6 || flat.hog > t + 1e-6) {
    bryt(`«flat» går frå ${nn(flat.lo * 1000, 3)} til ${nn(flat.hog * 1000, 3)} mm og ikkje frå 0 til ${nn(p.tjukn, 2)}`)
  } else {
    console.log(`  flat      alle delane ligg mellom 0 og ${nn(p.tjukn, 2)} mm — plata står på golvet`)
  }

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
  const zar = [...mf.matchAll(/<vertex [^>]*z="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
  const zLo = Math.min(...zar)
  const zHog = Math.max(...zar)
  if (Math.abs(zLo) > 1e-3 || Math.abs(zHog - p.tjukn) > 1e-3) {
    bryt(`3MF går frå ${nn(zLo, 3)} til ${nn(zHog, 3)} og ikkje frå 0 til ${nn(p.tjukn, 2)} mm`)
  } else {
    console.log(`  3mf       millimeter og z opp: plata står frå 0 til ${nn(zHog, 2)}`)
  }
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
    else {
      put(id, id, soup)
      const fp = { ...DEFAULT_PARAMS, kjelde: id, storleik: 200, plan: nett(3, 3) } as unknown as ParamBag
      const fm = MOTOR.measure(fp)
      const kutt = fm.parts > 0 && fm.joints > 0
      console.log(
        `  ${id.padEnd(13)} ${String(soup.tris).padStart(6)} tri   ${(b.length / 1024).toFixed(0)} kB   ` +
          `${boks.map((c) => +c.toPrecision(3)).join(" × ")}   ${String(fm.parts).padStart(2)} delar, ${String(fm.joints).padStart(2)} ledd`,
      )
      if (!kutt) bryt(`${id}: eit rutenett gjev ${fm.parts} delar og ${fm.joints} ledd — forma skjer ikkje`)
    }
  }
}

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
    if (av > 3) bryt(`bog ${bog}: mønsteret er ${nn(k.w, 2)} mm breitt, buen er ${nn(vent, 2)} mm`)
    else console.log(`  bog ${String(bog).padEnd(5)} R ${bog ? nn(R, 0).padStart(5) : " flat"} mm   mønster ${nn(k.w, 1)} mm, bue ${nn(vent, 1)} mm`)
  }
  const flat = MOTOR.measure({ ...grunn } as unknown as ParamBag)
  const null0 = MOTOR.measure({ ...grunn, plan: skrivPlan(lesPlan(grunn.plan).map((q) => ({ ...q, bog: 0 }))) } as unknown as ParamBag)
  if (flat.cutLen !== null0.cutLen || flat.parts !== null0.parts) bryt("bog 0 gjev eit anna svar enn ingen bog")
  else console.log(`  bog 0 er det same som ingen bog: ${nn(flat.cutLen, 0)} mm kutt`)

  for (const bog of [0, 0.3, 0.9]) {
    const bag = { ...grunn, plan: skrivPlan(lesPlan(grunn.plan).map((q) => ({ ...q, bog }))) } as unknown as ParamBag
    const m = MOTOR.measure(bag)
    const sn = makeBygg(bag as unknown as Params, DETAIL.mid).s
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const r of sn.ribber) {
      for (const ring of r.raa) {
        for (const q of ring) {
          for (const off of [-3, 3]) {
            const P = ut(r.r, q, off)
            for (let i = 0; i < 3; i++) {
              if (P[i] < lo[i]) lo[i] = P[i]
              if (P[i] > hi[i]) hi[i] = P[i]
            }
          }
        }
      }
    }
    const av = Math.abs(m.envX - (hi[0] - lo[0]))
    if (av > 1) bryt(`bog ${bog}: ytremålet seier ${nn(m.envX, 1)} mm, ringane seier ${nn(hi[0] - lo[0], 1)} mm`)
    else console.log(`  bog ${String(bog).padEnd(5)} ytremål ${nn(m.envX, 1).padStart(6)} mm   ringane ${nn(hi[0] - lo[0], 1).padStart(6)} mm`)
  }
}

{
  console.log("\n=== luka mellom to bøygde ===")
  const S = 300
  const T = 3
  const par = (b1: number, b2: number, dx: number) =>
    skrivPlan([
      { id: 1, o: [0.5 - dx, 0.5, 0.5] as Vec3, n: [1, 0, 0] as Vec3, bog: b1, strek: [] },
      { id: 2, o: [0.5 + dx, 0.5, 0.5] as Vec3, n: [1, 0, 0] as Vec3, bog: b2, strek: [] },
      { id: 3, o: [0.5, 0.5, 0.5] as Vec3, n: [0, 1, 0] as Vec3, bog: 0, strek: [] },
    ])
  for (const [namn, b1, b2, dx] of [
    ["flate", 0, 0, 0.1],
    ["mot kvarandre", 0.6, -0.6, 0.1],
    ["mot kvarandre, tett", 0.9, -0.9, 0.06],
  ] as const) {
    const p = { ...DEFAULT_PARAMS, storleik: S, tjukn: T, plan: par(b1, b2, dx) } as Params
    const sn = makeBygg(p as unknown as Params, DETAIL.mid).s
    const rib = [1, 2].map((id) => sn.ribber.find((r) => r.plan.id === id))
    if (!rib[0] || !rib[1]) {
      bryt(`${namn}: ribbene kom ikkje ut`)
      continue
    }
    const sky = rib.map((r) => r!.raa.flatMap((ring) => ring.map((q) => ut(r!.r, q, 0))))
    let naer = Infinity
    for (const a of sky[0]) for (const b of sky[1]) naer = Math.min(naer, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
    const ekte = naer - T
    const av = Math.abs(sn.minGap - ekte)
    if (av > 1) bryt(`${namn}: luka er ${nn(sn.minGap, 1)} mm, punkta seier ${nn(ekte, 1)} mm`)
    else console.log(`  ${namn.padEnd(22)} luke ${nn(sn.minGap, 1).padStart(6)} mm   punkta ${nn(ekte, 1).padStart(6)} mm`)
  }
  const flat = makeBygg({ ...DEFAULT_PARAMS, storleik: S, tjukn: T, plan: par(0, 0, 0.06) } as Params, DETAIL.mid).s
  const krum = makeBygg({ ...DEFAULT_PARAMS, storleik: S, tjukn: T, plan: par(0.9, -0.9, 0.06) } as Params, DETAIL.mid).s
  if (!(krum.minGap < 3 && flat.minGap > 30)) {
    bryt(`same avstand mellom grunnplana, men luka skal skilje dei: flat ${nn(flat.minGap, 1)}, krum ${nn(krum.minGap, 1)}`)
  } else {
    console.log(`  same grunnplan, ulik bøy: flat ${nn(flat.minGap, 1)} mm, krum ${nn(krum.minGap, 1)} mm`)
  }
}

{
  console.log("\n=== krumt skal med golv ===")
  const bogna = (bog: number) =>
    skrivPlan([
      ...lesPlan(nett(4, 4)).map((q) => (q.n[0] === 1 ? { ...q, bog } : q)),
      { id: 91, o: [0.5, 0.5, 0.35] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] },
      { id: 92, o: [0.5, 0.5, 0.65] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] },
    ])
  const bag = { ...DEFAULT_PARAMS, storleik: 300, plan: bogna(0.3) } as unknown as ParamBag
  const krum = MOTOR.measure(bag)
  const rett = MOTOR.measure({ ...bag, plan: bogna(0) } as unknown as ParamBag)
  const s = makeBygg(bag as unknown as Params, DETAIL.mid).s
  const flate = makeBygg({ ...bag, plan: bogna(0) } as unknown as Params, DETAIL.mid).s
  console.log(`  bøygd     ${krum.joints} ledd, ${s.kurva.length} møte som er kurver`)
  console.log(`  rett      ${rett.joints} ledd, ${flate.kurva.length} møte som er kurver`)
  const R = 300 / 0.3
  const golv = s.ribber.find((r) => r.plan.id === 91)
  const skal = s.ribber.find((r) => r.plan.id === 1)
  const bogna2 = golv?.spor.filter((q) => q.k) ?? []
  const verst = bogna2.reduce((m, q) => Math.max(m, Math.abs(Math.abs(1 / q.k) - R)), 0)
  if (s.kurva.length || flate.kurva.length) bryt(`ingen av dei to sette skulle ha eit kurva møte: ${s.kurva.length} bøygd, ${flate.kurva.length} flatt`)
  else if (krum.joints !== rett.joints) bryt(`bøyen endra talet på ledd: ${krum.joints} bøygd mot ${rett.joints} flatt`)
  else if (bogna2.length !== 4) bryt(`golvet skulle ha fire bogna spor, eitt per bøygt plan, ikkje ${bogna2.length}`)
  else if (verst > 0.5) bryt(`sporet i golvet har radius ${nn(Math.abs(1 / bogna2[0].k), 1)} mm og sylinderen ${nn(R, 1)} mm`)
  else if ((skal?.spor ?? []).some((q) => q.k)) bryt(`sporet i den bøygde delen skulle vera rett i det utbretta mønsteret`)
  else {
    console.log(`  og dei er like: ${krum.joints} ledd båe vegar — bøyen tek ikkje eit ledd og finn ikkje opp eitt`)
    console.log(`  golvet sine fire bogna spor: R ${nn(Math.abs(1 / bogna2[0].k), 1)} mm mot sylinderen ${nn(R, 1)} mm, verst ${verst.toExponential(1)} mm`)
    console.log(`  og i det utbretta mønsteret er dei same ledda rette: ${skal?.spor.length ?? 0} spor, alle med krumming 0`)
  }
}

{
  console.log("\n=== hud på waffle ===")
  const waffle = (bog: number) =>
    skrivPlan([
      ...lesPlan(nett(4, 4)).map((q) => (q.n[0] === 1 ? { ...q, bog } : q)),
      { id: 91, o: [0.5, 0.5, 0.2] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] },
      { id: 92, o: [0.5, 0.5, 0.8] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] },
    ])
  const bag = { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 300, tjukn: 3, material: "finer", plan: waffle(1.2) } as unknown as ParamBag
  const b = makeBygg(bag as unknown as Params, DETAIL.mid)
  const m = MOTOR.measure(bag)
  const rilla = b.s.ribber.filter((r) => r.rille.length)
  const hud = b.s.ribber.filter((r) => r.r.k)
  const golv = b.s.ribber.filter((r) => r.plan.id === 91 || r.plan.id === 92)
  const bogSpor = golv.reduce((a, r) => a + r.spor.filter((q) => q.k).length, 0)
  const rettSpor = golv.reduce((a, r) => a + r.spor.filter((q) => !q.k).length, 0)
  console.log(`  ${b.dl.delar.length} delar, ${m.joints} ledd, ${b.dl.lause} lause · ${(b.dl.cutLen / 1000).toFixed(1)} m kutt`)
  console.log(`  huda er rilla: ${rilla.length} av ${hud.length} bøygde ribber, ${rilla.reduce((a, r) => a + r.rille.length, 0)} snittliner`)
  console.log(`  golva: ${bogSpor} bogna spor mot huda, ${rettSpor} rette mot ribbene`)
  if (rilla.length !== hud.length) bryt(`${hud.length} bøygde ribber, berre ${rilla.length} rilla — under bogMin skal alle vera det`)
  else if (b.dl.lause) bryt(`${b.dl.lause} del(ar) heng i ingenting`)
  else if (bogSpor !== 8 || rettSpor !== 8) bryt(`golva skulle ha fire bogar og fire rette kvar, ikkje ${bogSpor} og ${rettSpor}`)
  else if (b.s.montering.brot.length) bryt(`${b.s.montering.brot.length} del(ar) står fast: ${b.s.montering.brot.join(", ")} — waffelen vert bygd flat og huda bøygd kring han`)
  else console.log(`  og han let seg montere: 0 står fast, ${b.s.montering.orden.length} plan i orden`)

  let naer = Infinity
  for (const r of rilla) {
    for (const sp of r.spor) {
      for (const l of r.rille) {
        for (const q of l) {
          const dx = q[0] - sp.p[0]
          const dy = q[1] - sp.p[1]
          naer = Math.min(naer, Math.abs(-dx * sp.d[1] + dy * sp.d[0]))
        }
      }
    }
  }
  const KRAV = 3 * 3 // tre platetjukner, sona sin halve breidd
  if (naer < KRAV - 0.01) bryt(`eit rillesnitt ligg ${nn(naer, 2)} mm frå ei sporline, og sona er ${KRAV} mm`)
  else console.log(`  og den stive øya held: næraste rillesnitt ${nn(naer, 1)} mm frå ei sporline, krav ${KRAV} mm`)
}

{
  console.log("\n=== lamellar ===")
  const V3 = (x: number, y: number, z: number) => [x, y, z] as Vec3
  const lamell = (n: number, bog: number, glipe: number): Plan[] => {
    const ut: Plan[] = []
    const w = (0.8 / n) * (1 - glipe)
    for (let i = 0; i < n; i++) {
      const v0 = -0.4 + (0.8 * i) / n
      ut.push({ id: i + 1, o: V3(0.5, 0.5, 0.5), n: V3(1, 0, 0), bog, strek: [],
        omriss: [[-0.4, v0], [0.4, v0], [0.4, v0 + w], [-0.4, v0 + w]] })
    }
    return ut
  }
  const tvers = (n: number, fraa: number): Plan[] =>
    Array.from({ length: n }, (_, i) => ({ id: fraa + i, o: V3(0.5, 0.15 + (0.7 * i) / (n - 1), 0.5), n: V3(0, 1, 0), bog: 0, strek: [] }))

  const bag = { ...DEFAULT_PARAMS, kjelde: "kube", storleik: 300, tjukn: 3, material: "finer",
    plan: skrivPlan([...lamell(6, 1.2, 0.25), ...tvers(3, 90)]) } as unknown as ParamBag
  const b = makeBygg(bag as unknown as Params, DETAIL.mid)
  const m = MOTOR.measure(bag)
  const raude = checkRules(bag as unknown as Params, m, b).filter((r) => !r.ok)
  const rilla = b.s.ribber.filter((r) => r.rille.length)
  console.log(`  ${b.dl.delar.length} delar, ${m.joints} ledd, ${b.dl.lause} lause · ${(b.dl.cutLen / 1000).toFixed(1)} m kutt`)
  console.log(`  ${rilla.length} rilla lamellar, ${rilla.reduce((a, r) => a + r.rille.length, 0)} snittliner`)
  if (b.dl.delar.length !== 9) bryt(`seks lamellar og tre ribber skulle gje ni delar, ikkje ${b.dl.delar.length}`)
  else if (!m.joints) bryt("lamellane greip ikkje ribbene")
  else if (b.dl.lause) bryt(`${b.dl.lause} lamell(ar) heng i ingenting`)
  else if (b.s.montering.brot.length) bryt(`${b.s.montering.brot.length} står fast`)
  else if (raude.length) bryt(`lamellar skal ikkje bryte ein regel: ${raude.map((r) => `${r.id} ${r.value}`).join(", ")}`)
  else console.log(`  og han let seg montere utan at ein einaste regel ryk: 0 står fast, 0 raude liner`)

  const hud = { ...DEFAULT_PARAMS, kjelde: "kule", storleik: 300, tjukn: 3, material: "finer",
    plan: skrivPlan([...lesPlan(nett(4, 4)).map((q) => (q.n[0] === 1 ? { ...q, bog: 1.2 } : q)),
      { id: 91, o: [0.5, 0.5, 0.2] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] },
      { id: 92, o: [0.5, 0.5, 0.8] as Vec3, n: [0, 0, 1] as Vec3, bog: 0, strek: [] }]) } as unknown as ParamBag
  const hb = makeBygg(hud as unknown as Params, DETAIL.mid)
  console.log(`  mot rilla hud: ${(b.dl.cutLen / 1000).toFixed(1)} m lamellar mot ${(hb.dl.cutLen / 1000).toFixed(1)} m hud — ${(hb.dl.cutLen / b.dl.cutLen).toFixed(1)}× kortare køyretur`)
}

{
  console.log("\n=== montasjen ===")
  const bag = { ...GRUNN, storleik: 300, tjukn: 6 } as unknown as ParamBag
  const m = MOTOR.montasje(bag)
  const b = makeBygg(bag as unknown as Params, DETAIL.mid)
  const staaende = new Map(lagDelar(b.s, b.dl.delar, 6).map((d) => [d.adr, d.positions]))
  const bk = b.k.solid
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

  const gjennom = (M: Float32Array, x: number, y: number, z: number) => [
    M[0] * x + M[4] * y + M[8] * z + M[12],
    M[1] * x + M[5] * y + M[9] * z + M[13],
    M[2] * x + M[6] * y + M[10] * z + M[14],
  ]
  const det = (M: Float32Array) =>
    M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5])
  let verst = 0
  let skeiv = 0
  for (const d of m.delar) {
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
  if (verst > 1e-3) bryt(`matrisene bommar med ${verst.toExponential(1)} mm på nettet motoren byggjer`)
  else console.log(`  matrisene råkar begge netta: verste avvik ${verst.toExponential(1)} mm, alle stive`)

  for (const [nx, ny, vent] of [[6, 6, 2], [4, 0, 1]] as const) {
    const g = MOTOR.montasje({ ...GRUNN, plan: nett(nx, ny) } as unknown as ParamBag)
    if (g.steg !== vent) bryt(`rutenett ${nx}×${ny}: ${g.steg} steg, venta ${vent}`)
    else console.log(`  rutenett ${nx}×${ny}: ${g.steg} steg`)
  }
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
    const line = arket.split("\n").find((l) => new RegExp(`^\\s*${i + 1}\\s+${id}\\b`).test(l))
    if (!line) continue
    prøvde++
    if (!ORD[md.veg]?.test(line)) ulike++
  }
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
    const greitt = montering(GRUNN as unknown as Params, makeBygg(GRUNN, DETAIL.mid).s)
    if (greitt.includes("DETTE GÅR IKKJE OPP")) bryt("eit rutenett som går opp fekk varselet likevel")

    const pakka = unzip(MOTOR.exportFile(umogeleg as unknown as ParamBag, "alt").data as ArrayBuffer)
    const reglar = pakka.find((f) => f.name === "reglar.txt")
    if (!reglar) bryt("alt-pakka ber ingen reglar.txt")
    else {
      const t = new TextDecoder().decode(reglar.data)
      if (!/HARDT BROT/.test(t)) bryt("reglar.txt melder ikkje det harde brotet")
      else if (!/kan monterast/.test(t)) bryt("reglar.txt namngjev ikkje regelen som er broten")
      else console.log(`  og domen fylgjer med i pakka: reglar.txt, ${t.length} teikn`)
    }
  }

  if (!prøvde) bryt("fann ingen liner i montering.txt å samanlikne vegen med")
  else if (ulike) bryt(`${ulike} av ${prøvde} delar har vegen til ein annan del enn seg sjølv`)
  else console.log(`  og vegen inn høyrer rett del til: ${prøvde} delar`)

  const v = { ...DEFAULT_PARAMS, plan: skrivPlan(vifte(9, 0.3, [1, 1])) } as unknown as ParamBag
  const vm = MOTOR.montasje(v)
  const vplan = new Set(vm.delar.map((d) => d.steg)).size
  if (vplan !== 9) bryt(`ei vifte med 9 plan: ${vplan} steg`)
  else console.log(`  ei vifte med 9 plan: ${vplan} steg — eitt om gongen`)
}

{
  console.log("\n=== klemma ===")
  const rein = makeBygg(GRUNN as unknown as Params, DETAIL.mid).s.montering.klem
  if (rein.length) bryt(`eit rutenett på ein kube klemmer ikkje, men lesinga fann ${rein.length} par`)
  else console.log(`  eit rutenett på ein kube: ingen par i kvarandre`)

  const sti = "public/form/stolform-03.glb"
  if (!existsSync(sti)) bryt(`${sti} finst ikkje`)
  else {
    const b = readFileSync(sti)
    put("klemform", "klemform", parseMesh("stolform-03.glb", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
    const kp = { ...DEFAULT_PARAMS, kjelde: "klemform", storleik: 200, plan: nett(6, 6) } as unknown as Params
    const k = makeBygg(kp, DETAIL.mid).s
    if (!k.montering.klem.length) bryt("ei form med avviste møte klemmer, men lesinga fann ingen par")
    else if (k.montering.brot.length) bryt("denne forma skal bryte KLEMMA og ikkje rekkjefylgja")
    else {
      console.log(`  og ei form med ${k.avvist} avviste møte: ${k.montering.klem.length} par i kvarandre, ${k.montering.klem.slice(0, 3).map(([x, y]) => `${x}–${y}`).join(", ")}`)

      let q = kp
      const spor: number[] = []
      for (let i = 0; i < 10; i++) {
        const kl = makeBygg(q, DETAIL.mid).s.montering.klem
        spor.push(kl.length)
        if (!kl.length) break
        const r = checkRules(q, MOTOR.measure(q as unknown as ParamBag), undefined, true).find((x) => x.id === "klem")
        if (!r?.fiks) { bryt("regelen klem melder brot utan å tilby eit råd"); break }
        q = { ...q, ...r.fiks.set } as unknown as Params
      }
      const steig = spor.some((n, i) => i > 0 && n > spor[i - 1])
      if (steig) bryt(`rådet gjorde klemma verre: ${spor.join(" → ")}`)
      else if (spor[spor.length - 1] !== 0) bryt(`rådet kom ikkje fram til null: ${spor.join(" → ")}`)
      else console.log(`  og rådet kjem fram, eitt plan om gongen: ${spor.join(" → ")}`)
    }
  }
}

{
  console.log("\n=== merket ===")
  const mp = { ...DEFAULT_PARAMS, plan: nett(3, 3), storleik: 200, merk: 1 } as unknown as Params
  const mb = makeBygg(mp, DETAIL.mid)
  const utan = lagDelar(mb.s, mb.dl.delar, mp.tjukn, false)
  const med = lagDelar(mb.s, mb.dl.delar, mp.tjukn, true)

  const maal = (pos: Float32Array) => {
    let V = 0
    const kant = new Map<string, number>()
    const id = new Map<string, number>()
    const nid = (i: number) => {
      const k = `${pos[i].toFixed(3)},${pos[i + 1].toFixed(3)},${pos[i + 2].toFixed(3)}`
      let v = id.get(k)
      if (v === undefined) { v = id.size; id.set(k, v) }
      return v
    }
    for (let i = 0; i < pos.length; i += 9) {
      V += (pos[i] * (pos[i + 4] * pos[i + 8] - pos[i + 5] * pos[i + 7]) - pos[i + 1] * (pos[i + 3] * pos[i + 8] - pos[i + 5] * pos[i + 6]) + pos[i + 2] * (pos[i + 3] * pos[i + 7] - pos[i + 4] * pos[i + 6])) / 6
      const [A, B, C] = [nid(i), nid(i + 3), nid(i + 6)]
      for (const [u, v] of [[A, B], [B, C], [C, A]]) {
        const k = `${Math.min(u, v)}|${Math.max(u, v)}`
        kant.set(k, (kant.get(k) ?? 0) + 1)
      }
    }
    let opne = 0
    for (const n of kant.values()) if (n !== 2) opne++
    return { V, opne }
  }

  let opne = 0
  let teke = 0
  let venta = 0
  for (let i = 0; i < med.length; i++) {
    const a = maal(utan[i].positions)
    const c = maal(med[i].positions)
    const m = merkeFor(mb.dl.delar[i], mp.tjukn)
    opne += c.opne
    teke += a.V - c.V
    if (m) venta += m.flater.reduce((x, f) => x + Math.abs(areal(f.ytre)) - f.indre.reduce((y, q) => y + Math.abs(areal(q)), 0), 0) * m.djup
  }
  if (!venta) bryt("ingen del vart merkt i det heile")
  else if (opne) bryt(`${opne} kantar i dei merkte delane er ikkje delte av to flater`)
  else if (Math.abs(teke / venta - 1) > 0.01) bryt(`lomma tok ${teke.toFixed(1)} mm³ der flata seier ${venta.toFixed(1)}`)
  else console.log(`  ${med.length} merkte delar: 0 opne kantar, lomma tok ${teke.toFixed(1)} mm³ mot ${venta.toFixed(1)} venta`)

  let auge = 0
  for (const t of ["0", "4", "6", "8", "A", "9"]) {
    const f = merkeFlater(t, 0, 0, 6, 0.8)
    if (f.length !== 1 || !f[0].indre.length) bryt(`«${t}» skal vera éi flate med minst eitt auge, fekk ${f.length} flate(r) og ${f[0]?.indre.length ?? 0} auge`)
    else auge += f[0].indre.length
  }
  if (auge) console.log(`  og bokstavane med auge har dei: ${auge} augo over seks teikn`)

  const a3 = MOTOR.exportFile({ ...mp, merk: 0 } as unknown as ParamBag, "3mf").data as ArrayBuffer
  const b3 = MOTOR.exportFile(mp as unknown as ParamBag, "3mf").data as ArrayBuffer
  if (a3.byteLength >= b3.byteLength) bryt(`3mf med merke er ikkje større: ${a3.byteLength} → ${b3.byteLength} B`)
  else console.log(`  og valet står i fila: 3mf ${a3.byteLength} → ${b3.byteLength} B`)
}

console.log(brot ? `\n${brot} påstandar held ikkje` : "\nalle påstandar held")
process.exit(brot ? 1 : 0)
