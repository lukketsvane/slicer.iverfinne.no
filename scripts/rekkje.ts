import { inRing, LAG_FARGAR, shoelace, type ParamBag, type Pt } from "../lib/core"
import { kerfOf, MOTOR } from "../lib/motor"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { sheetSvg } from "../lib/export-svg"
import { sheetDxf } from "../lib/export-dxf"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { lesPlan, rutenett, skrivPlan, type Strek } from "../lib/plan"
import { placedRings } from "../lib/nest"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))
const medFarge = (plan: string, id: number, farge: number) =>
  skrivPlan(lesPlan(plan).map((p) => (p.id === id ? { ...p, farge } : p)))
const medStrek = (plan: string, id: number, st: Strek) =>
  skrivPlan(lesPlan(plan).map((q) => (q.id === id ? { ...q, strek: [...q.strek, st] } : q)))

const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }

let brot = 0
const feil = (namn: string, kva: string) => {
  brot++
  console.log(`FEIL  ${namn.padEnd(24)} ${kva}`)
}

const GRAV_FARGE = /stroke="#000000"/i
const LOVLEG = new Set(LAG_FARGAR)

function pathPts(d: string): Pt[] {
  return d
    .replace(/[MLZ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((q) => q.split(",").map(Number) as Pt)
}

type Steg = { grav: boolean; open: boolean; areal: number; y: number; bb: [number, number, number, number] }

const boks = (pts: Pt[]): [number, number, number, number] =>
  pts.length
    ? [
        Math.min(...pts.map((q) => q[0])),
        Math.min(...pts.map((q) => q[1])),
        Math.max(...pts.map((q) => q[0])),
        Math.max(...pts.map((q) => q[1])),
      ]
    : [0, 0, 0, 0]

function svgSteg(namn: string, svg: string): Steg[] {
  const out: Steg[] = []
  const fargar = new Set<string>()
  for (const m of svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)) {
    const grav = GRAV_FARGE.test(m[2])
    fargar.add((m[2].match(/stroke="([^"]+)"/i)?.[1] ?? "").toLowerCase())
    const pts = pathPts(m[1])
    out.push({ grav, open: !/Z\s*$/i.test(m[1].trim()), areal: grav ? 0 : shoelace(pts), y: 0, bb: boks(pts) })
  }
  const ulovleg = [...fargar].filter((f) => !LOVLEG.has(f))
  if (ulovleg.length) feil(namn, `framande fargar: ${ulovleg.join(", ")}`)
  if (/fill="(?!none)/i.test(svg)) feil(namn, "noko er fylt")
  return out
}

function graveringaLiggInne(namn: string, svg: string) {
  const omriss: Pt[][] = []
  const grav: Pt[][] = []
  for (const m of svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)) {
    const pts = pathPts(m[1])
    if (GRAV_FARGE.test(m[2])) grav.push(pts)
    else omriss.push(pts)
  }
  if (!grav.length || !omriss.length) return
  let ute = 0
  for (const g of grav) {
    for (const q of g) {
      let n = 0
      for (const o of omriss) if (inRing(o, q)) n++
      if (n % 2 === 0) ute++
    }
  }
  if (ute) feil(namn, `${ute} graverte punkt ligg ikkje på gods`)
}

function innanforRamma(namn: string, svg: string) {
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number)
  if (!vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) {
    return feil(namn, "inga brukande viewBox")
  }
  const mm = svg.match(/width="([\d.-]+)mm" height="([\d.-]+)mm"/)
  if (!mm) return feil(namn, "inkje millimetermål")
  if (Math.abs(+mm[1] - vb[2]) > 0.011 || Math.abs(+mm[2] - vb[3]) > 0.011) {
    return feil(namn, `${mm[1]}×${mm[2]} mm, men ramma er ${vb[2]}×${vb[3]}`)
  }
  let ute = 0
  let verst = 0
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    for (const q of pathPts(m[1])) {
      const d = Math.max(vb[0] - q[0], vb[1] - q[1], q[0] - (vb[0] + vb[2]), q[1] - (vb[1] + vb[3]))
      if (d > 1e-9) {
        ute++
        verst = Math.max(verst, d)
      }
    }
  }
  if (ute) feil(namn, `${ute} punkt ligg opptil ${verst.toFixed(2)} mm utanfor ramma`)
}

function vinding(steg: Steg[]): number {
  let best = 0
  for (const s of steg) {
    if (!s.grav && Math.abs(s.areal) > Math.abs(best)) best = s.areal
  }
  return best < 0 ? -1 : 1
}

function sjekkSteg(namn: string, steg: Steg[]) {
  const v = vinding(steg)
  const innvendig = (s: Steg) => !s.grav && (s.open || s.areal * v < 0)
  let settKutt = false
  let settOmriss = false
  for (const s of steg) {
    if (s.grav) {
      if (settKutt) return feil(namn, "gravering etter eit kutt")
      continue
    }
    settKutt = true
    if (innvendig(s)) {
      if (settOmriss) return feil(namn, "innvendig kutt etter eit omriss")
    } else settOmriss = true
  }
  console.log(
    `  ok   ${namn.padEnd(24)} ${steg.length} baner ` +
      `(${steg.filter((q) => q.grav).length} graverte, ` +
      `${steg.filter(innvendig).length} innvendige)`,
  )
}

const DXF_LAG = new Set(["GRAVER", "KUTT"])
const MERKT_LAG = /^C(0[2-9]|[12]\d)$/
const lovlegLag = (l: string) => DXF_LAG.has(l) || MERKT_LAG.test(l)
const DXF_ENT = new Set(["POLYLINE", "VERTEX", "SEQEND"])

function dxfSteg(namn: string, dxf: string): Steg[] {
  const t = dxf.split(/\r\n/)
  const out: Steg[] = []
  let lag = ""
  let open = false
  let pts: Pt[] | null = null
  let x = 0
  let iEnt = false
  const framandeLag = new Set<string>()
  const framandeEnt = new Set<string>()
  for (let i = 0; i < t.length - 1; i += 2) {
    if (t[i] !== "0") continue
    const kind = t[i + 1]
    if (kind === "SECTION") iEnt = t[i + 3] === "ENTITIES"
    else if (kind === "ENDSEC" || kind === "EOF") iEnt = false
    else if (iEnt && !DXF_ENT.has(kind)) framandeEnt.add(kind)
    if (kind === "POLYLINE") {
      if (pts) out.push(steg(lag, pts, open))
      lag = t[i + 3] === undefined ? "" : t[i + 3]
      if (!lovlegLag(lag)) framandeLag.add(lag)
      open = t[i + 6] === "70" && t[i + 7] === "0"
      pts = []
    } else if (kind === "VERTEX" && pts) {
      for (let j = i; j < i + 14; j++) {
        if (t[j] === "10") x = Number(t[j + 1])
        if (t[j] === "20") {
          pts.push([x, Number(t[j + 1])])
          break
        }
      }
    }
  }
  if (pts) out.push(steg(lag, pts, open))
  if (framandeLag.size) feil(namn, `framande lag: ${[...framandeLag].join(", ")}`)
  if (framandeEnt.size) feil(namn, `framande entitetar: ${[...framandeEnt].join(", ")}`)
  return out
}

const steg = (lag: string, pts: Pt[], open = false): Steg => ({
  grav: lag === "GRAVER",
  open,
  areal: lag === "GRAVER" ? 0 : shoelace(pts),
  y: pts.length ? Math.min(...pts.map((q) => q[1])) : 0,
  bb: boks(pts),
})

function kule(r: number, seg: number) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  return makeSoup(new Float32Array(pos))
}

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

put("kule", "kule", kule(50, 32))
put("torus", "torus", torus(50, 18, 48, 24))

const saker: [string, Params][] = [
  ["kube", { ...GRUNN }],
  ["kule", { ...GRUNN, kjelde: "kule" }],
  ["torus ståande", { ...GRUNN, kjelde: "torus", rotX: 90 }],
  ["torus, små ark", { ...GRUNN, kjelde: "torus", rotX: 90, arkB: 300, arkH: 200 }],
  ["torus, tett og stort", { ...GRUNN, kjelde: "torus", plan: nett(13, 13), storleik: 560 }],
  ["kube, strek inni ei plate", {
    ...GRUNN,
    plan: medStrek(nett(4, 4), 2, { slag: "hol", form: "rekt", x: -0.05, y: -0.05, w: 0.3, h: 0.1, a: 20 }),
  }],
  ["kube, to plan merkte", { ...GRUNN, plan: medFarge(medFarge(nett(4, 4), 2, 3), 5, 5) }],
  ["kube, x-familien rilla", {
    ...GRUNN,
    storleik: 300,
    tjukn: 3,
    material: "finer",
    plan: skrivPlan(lesPlan(nett(3, 3)).map((q) => (q.n[0] === 1 ? { ...q, bog: 1.2 } : q))),
  }],
]

function arkSteg(namn: string, p: Params): Steg[][] {
  const { ns } = makeBygg(p, DETAIL.mid)
  const kerf = kerfOf(p)
  return ns.sheets.map((_, i) => {
    const svg = sheetSvg(ns, i, kerf)
    innanforRamma(`${namn} · ark ${i + 1}`, svg)
    graveringaLiggInne(`${namn} · ark ${i + 1}`, svg)
    return svgSteg(`${namn} · ark ${i + 1}`, svg)
  })
}

function dxfSteg1(namn: string, dxf: string, arkB: number, arkH: number): Steg[] {
  const lagOrden = [...dxf.matchAll(/\r\n2\r\n(GRAVER|KUTT)\r\n/g)].map((m) => m[1])
  if (lagOrden[0] !== "GRAVER" || lagOrden[1] !== "KUTT") {
    feil(namn, `lagtabellen står ${lagOrden.slice(0, 2).join(" før ") || "tom"}`)
  }
  const steg = dxfSteg(namn, dxf)
  const t0 = dxf.split(/\r\n/)
  for (let i = 0; i < t0.length - 1; i += 2) {
    if (t0[i] === "0" && t0[i + 1] === "POLYLINE" && t0[i + 3] === "GRAVER" && t0[i + 7] === "1") {
      feil(namn, "ei LUKKA bane på GRAVER — er plateramma attende?")
      break
    }
  }
  const omriss: Pt[][] = []
  const grav: Pt[][] = []
  {
    let lag = ""
    let pts: Pt[] | null = null
    let x = 0
    const lukk = () => { if (pts && pts.length) (lag === "GRAVER" ? grav : omriss).push(pts) }
    for (let i = 0; i < t0.length - 1; i += 2) {
      if (t0[i] !== "0") continue
      if (t0[i + 1] === "POLYLINE") { lukk(); lag = t0[i + 3] ?? ""; pts = [] }
      else if (t0[i + 1] === "VERTEX" && pts) {
        for (let j = i; j < i + 14; j++) {
          if (t0[j] === "10") x = Number(t0[j + 1])
          if (t0[j] === "20") { pts.push([x, Number(t0[j + 1])]); break }
        }
      }
    }
    lukk()
  }
  if (grav.length && omriss.length) {
    let ute = 0
    for (const g of grav) for (const q of g) {
      let n = 0
      for (const o of omriss) if (inRing(o, q)) n++
      if (n % 2 === 0) ute++
    }
    if (ute) feil(namn, `${ute} graverte punkt ligg ikkje på gods`)
  }
  let ute = 0
  let verst = 0
  const t = dxf.split(/\r\n/)
  for (let i = 0; i < t.length - 1; i += 2) {
    if (t[i] === "10") {
      const x = Number(t[i + 1])
      const y = t[i + 2] === "20" ? Number(t[i + 3]) : 0
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const d = Math.max(-x, -y, x - arkB, y - arkH)
      if (d > 1e-6) {
        ute++
        verst = Math.max(verst, d)
      }
    }
  }
  if (ute) feil(namn, `${ute} punkt ligg opptil ${verst.toFixed(2)} mm utanfor plata`)
  return steg
}

function merkteLag(namn: string, p: Params) {
  const { ns } = makeBygg(p, DETAIL.mid)
  const kerf = kerfOf(p)
  ns.sheets.forEach((sheet, i) => {
    const svg = sheetSvg(ns, i, kerf)
    const dxf = sheetDxf(ns, i, kerf)
    const vent = new Map<number, number>()
    for (const q of sheet.placed) {
      if (!q.part.farge) continue
      vent.set(q.part.farge, (vent.get(q.part.farge) ?? 0) + 1 + q.part.holes.length + q.part.rille.length)
    }
    for (const [farge, tal] of vent) {
      const hex = LAG_FARGAR[farge]
      const iSvg = (svg.match(new RegExp(`stroke="${hex}"`, "g")) ?? []).length
      if (iSvg !== tal) feil(`${namn} · ark ${i + 1}`, `lag C${farge}: ${iSvg} baner i ${hex}, venta ${tal}`)
      const lagNamn = `C${String(farge).padStart(2, "0")}`
      const iDxf = (dxf.match(new RegExp(`\\r\\n0\\r\\nPOLYLINE\\r\\n8\\r\\n${lagNamn}\\r\\n`, "g")) ?? []).length
      if (iDxf !== tal) feil(`${namn} · dxf ${i + 1}`, `lag ${lagNamn}: ${iDxf} baner, venta ${tal}`)
      const hexTal = String(parseInt(hex.slice(1), 16))
      if (!dxf.includes(`\r\n2\r\n${lagNamn}\r\n70\r\n0\r\n62\r\n`) || !dxf.includes(`\r\n420\r\n${hexTal}\r\n`)) feil(`${namn} · dxf ${i + 1}`, `laget ${lagNamn} står ikkje i tabellen med ${hex}`)
    }
    const blaa = (svg.match(/stroke="#0000ff"/g) ?? []).length
    const alle = sheet.placed.reduce((a, q) => a + 1 + q.part.holes.length + q.part.rille.length, 0)
    const merkte = [...vent.values()].reduce((a, b) => a + b, 0)
    if (blaa !== alle - merkte) feil(`${namn} · ark ${i + 1}`, `${blaa} blå baner, venta ${alle - merkte}`)
    const lagOrden = [...dxf.matchAll(/\r\n2\r\n(GRAVER|KUTT|C\d\d)\r\n70\r\n/g)].map((m) => m[1])
    if (lagOrden.slice(0, 2).join(",") !== "GRAVER,KUTT" || lagOrden.length !== 2 + vent.size) feil(`${namn} · dxf ${i + 1}`, `lagtabellen: ${lagOrden.join(" ")}`)
  })
  const prof = MOTOR.exportFile(p as unknown as ParamBag, "svg").text ?? ""
  for (const pl of lesPlan(p.plan)) {
    if (!pl.farge) continue
    if (!prof.includes(`stroke="${LAG_FARGAR[pl.farge]}"`)) feil(`${namn} · profilar`, `plan ${pl.id} har ikkje laget sitt i profilarket`)
  }
  console.log(`  ${namn}: merkte lag står i kuttarket, dxf-en og profilarket`)
}
merkteLag("kube, to plan merkte", { ...GRUNN, plan: medFarge(medFarge(nett(4, 4), 2, 3), 5, 5) })

function toSkrivarar(namn: string, svg: Steg[], dxf: Steg[]) {
  const kutt = (q: Steg[]) =>
    q
      .filter((r) => !r.grav)
      .sort((a, b) => a.bb[0] - b.bb[0] || a.bb[1] - b.bb[1] || a.areal - b.areal)
  const a = kutt(svg)
  const b = kutt(dxf)
  if (a.length !== b.length) return feil(namn, `${a.length} kuttbaner i svg, ${b.length} i dxf`)
  let verstBoks = 0
  let verstAreal = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < 4; j++) verstBoks = Math.max(verstBoks, Math.abs(a[i].bb[j] - b[i].bb[j]))
    verstAreal = Math.max(verstAreal, Math.abs(a[i].areal - b[i].areal))
  }
  if (verstBoks > 0.01) feil(namn, `boksane skil ${verstBoks.toFixed(3)} mm mellom svg og dxf`)
  else if (verstAreal > 5) feil(namn, `areala skil ${verstAreal.toFixed(2)} mm² mellom svg og dxf`)
}

function inventar(namn: string, p: Params, svg: Steg[][], dxf: Steg[][]) {
  const før = brot
  const { dl, ns } = makeBygg(p, DETAIL.mid)

  const lagde = ns.sheets.reduce((n, s) => n + s.placed.length, 0)
  if (lagde + ns.spilt !== dl.delar.length) {
    feil(namn, `pakkinga: ${dl.delar.length} delar inn, ${lagde} lagde + ${ns.spilt} spilte ut`)
  }

  const venta = ns.sheets.map((s) => s.placed.reduce((n, q) => n + 1 + q.part.holes.length + q.part.rille.length, 0))
  const talde = (steg: Steg[][]) => steg.map((q) => q.filter((r) => !r.grav).length)

  for (const [fil, fekk] of [
    ["svg", talde(svg)],
    ["dxf", talde(dxf)],
  ] as [string, number[]][]) {
    if (fekk.length !== venta.length) {
      feil(`${namn} · ${fil}`, `${venta.length} plater i nestinga, ${fekk.length} i fila`)
      continue
    }
    venta.forEach((v, i) => {
      if (fekk[i] !== v) {
        feil(`${namn} · ${fil} ark ${i + 1}`, `${v} kuttbaner venta, ${fekk[i]} skrivne`)
      }
    })
  }

  if (brot === før) {
    console.log(
      `  ok   ${(namn + " · inventar").padEnd(24)} ${dl.delar.length} delar, ` +
        `${venta.reduce((a, b) => a + b, 0)} kuttbaner på ${ns.sheets.length} plater`,
    )
  }
}

for (const [namn, p] of saker) {
  const bag = p as unknown as ParamBag
  const ark = arkSteg(namn, p)
  ark.forEach((steg, i, all) => sjekkSteg(`${namn} · ark ${i + 1}/${all.length}`, steg))
  const prof = MOTOR.exportFile(bag, "svg").text ?? ""
  innanforRamma(`${namn} · profilar`, prof)
  sjekkSteg(`${namn} · profilar`, svgSteg(`${namn} · profilar`, prof))
  const { ns } = makeBygg(p, DETAIL.mid)
  const dxf = ns.sheets.map((_, i) =>
    dxfSteg1(`${namn} · dxf ${i + 1}`, sheetDxf(ns, i, kerfOf(p)), p.arkB, p.arkH),
  )
  dxf.forEach((steg, i, all) => sjekkSteg(`${namn} · dxf ${i + 1}/${all.length}`, steg))
  dxf.forEach((steg, i) => toSkrivarar(`${namn} · ark ${i + 1} · to skrivarar`, ark[i] ?? [], steg))
  inventar(namn, p, ark, dxf)
}

const kupong = MOTOR.exportFile(GRUNN as unknown as ParamBag, "prove").text ?? ""
graveringaLiggInne("passprøve", kupong)
sjekkSteg("passprøve", svgSteg("passprøve", kupong))

const KLARINGAR = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]

function sporIKupong(svg: string) {
  const baner = [...svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map((m) => ({
    grav: GRAV_FARGE.test(m[2]),
    p: pathPts(m[1]),
  }))
  const kutt = baner.find((b) => !b.grav)
  if (!kutt) return null
  const niv = [...new Set(kutt.p.map((q) => +q[1].toFixed(3)))].sort((a, b) => a - b)
  if (niv.length !== 3) return null
  const golv = kutt.p
    .filter((q) => Math.abs(q[1] - niv[1]) < 0.001)
    .map((q) => q[0])
    .sort((a, b) => a - b)
  const spor: [number, number][] = []
  for (let i = 0; i + 1 < golv.length; i += 2) spor.push([golv[i], golv[i + 1]])
  return { spor, golvY: niv[1], grav: baner.filter((b) => b.grav) }
}

function kupongMaal(namn: string, svg: string, tjukn: number, kerf: number) {
  const k = sporIKupong(svg)
  if (!k) return feil(namn, "fann ikkje omrisset med tre y-nivå")
  if (k.spor.length !== KLARINGAR.length) {
    return feil(namn, `${KLARINGAR.length} spor venta, ${k.spor.length} i fila`)
  }

  for (let i = 0; i < KLARINGAR.length; i++) {
    const ferdig = k.spor[i][1] - k.spor[i][0] + kerf
    const skal = tjukn + KLARINGAR[i]
    if (Math.abs(ferdig - skal) > 0.011) {
      return feil(namn, `spor ${i + 1}: ${ferdig.toFixed(3)} mm ferdig, ${skal.toFixed(2)} venta`)
    }
  }

  const midt = (s: [number, number]) => (s[0] + s[1]) / 2
  const stig = midt(k.spor[1]) - midt(k.spor[0])
  const xs = k.grav
    .filter((b) => b.p.reduce((a, q) => a + q[1], 0) / b.p.length > k.golvY * 0.6)
    .map((b) => b.p.reduce((a, q) => a + q[0], 0) / b.p.length)
    .sort((a, b) => a - b)
  const klynge: number[][] = []
  for (const x of xs) {
    const sist = klynge[klynge.length - 1]
    if (sist && x - sist[sist.length - 1] < stig / 2) sist.push(x)
    else klynge.push([x])
  }
  if (klynge.length !== KLARINGAR.length) {
    return feil(namn, `${KLARINGAR.length} tal venta under spora, ${klynge.length} funne`)
  }
  for (let i = 0; i < klynge.length; i++) {
    const c = klynge[i].reduce((a, b) => a + b, 0) / klynge[i].length
    if (c <= k.spor[i][0] || c >= k.spor[i][1]) {
      return feil(namn, `tal ${i + 1} står ikkje under spor ${i + 1}`)
    }
  }

  console.log(
    `  ok   ${namn.padEnd(24)} ${k.spor.length} spor ` +
      `${(k.spor[0][1] - k.spor[0][0] + kerf).toFixed(2)}–` +
      `${(k.spor[6][1] - k.spor[6][0] + kerf).toFixed(2)} mm, kvart tal under sitt eige`,
  )
}

const proveSaker: [string, Partial<Params>][] = [
  ["passprøve 3 mm", {}],
  ["passprøve 3 mm, maskina", { snittveg: 1 }],
  ["passprøve 1,5 mm", { tjukn: 1.5, snitt: 0.1 }],
  ["passprøve 6 mm", { tjukn: 6, snitt: 0.4 }],
  ["passprøve 12 mm", { tjukn: 12, snitt: 0.5 }],
  ["passprøve utan snitt", { snitt: 0 }],
]
for (const [namn, over] of proveSaker) {
  const pp = { ...GRUNN, ...over }
  const svg = MOTOR.exportFile(pp as unknown as ParamBag, "prove").text ?? ""
  innanforRamma(namn, svg)
  graveringaLiggInne(namn, svg)
  kupongMaal(namn, svg, pp.tjukn, kerfOf(pp))
}

const teikn = (p: Partial<Params>) =>
  JSON.stringify(
    arkSteg("snittveg", { ...GRUNN, ...p }).map((s) =>
      s.map((q) => q.areal.toFixed(3)),
    ),
  )

const nominell = teikn({ snitt: 0 })
const iMaskina = teikn({ snitt: 0.2, snittveg: 1 })
const iFila = teikn({ snitt: 0.2, snittveg: 0 })
if (iMaskina !== nominell) feil("snitt i maskina", "fila kompenserer likevel")
else if (iFila === nominell) feil("snitt i fila", "fila kompenserer ikkje")
else console.log("  ok   snittveg                 fila kompenserer berre når ho skal")

for (const kind of ["ark", "dxf"] as const) {
  const iM = MOTOR.exportFile({ ...GRUNN, snitt: 0.2, snittveg: 1 } as unknown as ParamBag, kind).name
  const iF = MOTOR.exportFile({ ...GRUNN, snitt: 0.2, snittveg: 0 } as unknown as ParamBag, kind).name
  if (iM === iF) feil(`snittveg · ${kind}`, `same namn for båe vegar: ${iM}`)
  else console.log(`  ok   snittveg · ${kind.padEnd(14)} ${iM} mot ${iF}`)
}

for (const [t, mat] of [[3, "mdf"], [4, "finer"], [6, "akryl"]] as [number, string][]) {
  const n = MOTOR.exportFile({ ...GRUNN, tjukn: t, material: mat } as unknown as ParamBag, "ark").name
  if (!n.includes(`${t}mm`) || !n.includes(mat)) feil("plata i namnet", `${n} nemner ikkje ${t} mm ${mat}`)
  else console.log(`  ok   plata i namnet          ${n}`)
}

const summer = (p: Partial<Params>) =>
  arkSteg("snittveg", { ...GRUNN, ...p })
    .flat()
    .reduce((a, q) => a + q.areal, 0)

const sumNominell = summer({ snitt: 0 })
const sumIFila = summer({ snitt: 0.6, snittveg: 0 })
if (!(sumIFila > sumNominell + 1)) {
  feil(
    "snittretning",
    `kompensasjonen går feil veg: ${sumNominell.toFixed(0)} → ${sumIFila.toFixed(0)} mm²`,
  )
} else {
  console.log(
    `  ok   snittretninga            omrisset veks utover (${sumNominell.toFixed(0)} → ${sumIFila.toFixed(0)} mm²)`,
  )
}

{
  const namn = "bøyeprøve"
  const bag = { ...GRUNN, tjukn: 3, material: "finer" } as unknown as ParamBag
  const svg = MOTOR.exportFile(bag, "bogprove").text ?? ""
  graveringaLiggInne(namn, svg)
  sjekkSteg(namn, svgSteg(namn, svg))

  const opne = [...svg.matchAll(/<path d="(M[^"]+)"([^>]*)>/g)]
    .filter((m) => !GRAV_FARGE.test(m[2]) && !/Z\s*$/i.test(m[1].trim()))
    .map((m) => pathPts(m[1]))
  const xs = [...new Set(opne.map((q) => +q[0][0].toFixed(3)))].sort((a, b) => a - b)

  const VENTA = [1.5, 2.25, 3, 4.5, 6]
  const felt: number[][] = [[xs[0]]]
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > VENTA[VENTA.length - 1] * 1.5) felt.push([xs[i]])
    else felt[felt.length - 1].push(xs[i])
  }
  if (felt.length !== VENTA.length) {
    feil(namn, `${felt.length} felt i fila, venta ${VENTA.length}`)
  } else {
    let verst = 0
    let kvar = ""
    felt.forEach((f, i) => {
      const steg = f.slice(1).reduce((m, v, j) => Math.min(m, v - f[j]), Infinity)
      const av = Math.abs(steg - VENTA[i])
      if (av > verst) {
        verst = av
        kvar = `felt ${i + 1}: ${steg.toFixed(3)} mot ${VENTA[i]}`
      }
    })
    if (verst > 0.01) feil(namn, `steget stemmer ikkje med det som står gravert — ${kvar}`)
    else console.log(`  ok   ${(namn + " · steget").padEnd(24)} ${felt.map((f) => f.length).join("+")} rader over fem felt, verste avvik ${verst.toFixed(4)} mm`)
  }
}

console.log(brot ? `\n${brot} brot` : "\ningen brot")
process.exit(brot ? 1 : 0)
