/**
 * Vakta over REKKJEFYLGDA i kuttfilene.
 *
 * Ei kuttfil er ikkje berre kva som skal skjerast, men i kva orden. Skjer
 * du omrisset fyrst, ligg delen laus i plata medan spora står att: han sig
 * ned i bordet, tippar, og det som skulle vore eit spor vert ei stripe ved
 * sida av eit spor. Difor står graveringa fyrst, dei innvendige kutta
 * etterpå, og omrisset heilt til slutt.
 *
 * Mange laserprogram sorterer om på dette sjølve. Ikkje alle gjer det, og
 * eit program som gjer det gjer det rett anten fila var sortert eller ei.
 *
 * Skriptet les uttaka slik ein maskin ville lese dei — teikn for teikn i
 * fila — og ikkje datastrukturane dei vart skrivne av.
 *
 *   npx tsx scripts/rekkje.ts
 */
import { inRing, shoelace, type ParamBag, type Pt } from "../lib/core"
import { VAFFEL } from "../lib/vaffel/engine"
import { makePlan } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { sheetSvg } from "../lib/vaffel/export-svg"
import { SHEET_GAP } from "../lib/vaffel/export-dxf"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

let brot = 0
const feil = (namn: string, kva: string) => {
  brot++
  console.log(`FEIL  ${namn.padEnd(24)} ${kva}`)
}

// =============================================================================
// SVG
// =============================================================================
/** Graveringa er svart (C00) og kuttet blått (C01). Sjå export-svg.ts:
 *  fargen ber rekkjefylgda, av di LightBurn tek laga i palettorden. */
const GRAV_FARGE = /stroke="#000000"/i

/** hjørna i eit «d»-attributt — banene her er berre M, L og Z */
function pathPts(d: string): Pt[] {
  return d
    .replace(/[MLZ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((q) => q.split(",").map(Number) as Pt)
}

type Steg = { grav: boolean; areal: number; y: number }

function svgSteg(namn: string, svg: string): Steg[] {
  const out: Steg[] = []
  const fargar = new Set<string>()
  for (const m of svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)) {
    const grav = GRAV_FARGE.test(m[2])
    fargar.add((m[2].match(/stroke="([^"]+)"/i)?.[1] ?? "").toLowerCase())
    out.push({ grav, areal: grav ? 0 : shoelace(pathPts(m[1])), y: 0 })
  }
  // To fargar, og ikkje ein til. Ein tredje farge er eit tredje lag i
  // LightBurn: eitt nokon må hugse å slå av, og eitt nokon ein dag
  // gløymer. Fyllingar er same saka: ei fylling ber maskina brenne heile
  // flata.
  const ulovleg = [...fargar].filter((f) => f !== "#000000" && f !== "#0000ff")
  if (ulovleg.length) feil(namn, `framande fargar: ${ulovleg.join(", ")}`)
  if (/fill="(?!none)/i.test(svg)) feil(namn, "noko er fylt")
  return out
}

/**
 * GRAVERINGA SKAL LIGGJE I SIN EIGEN DEL.
 *
 * Adressa vert plassert av nestinga, i eit rom ho har målt seg fram til
 * inne i delen. Bommar den målinga, hamnar bokstavane utanfor omrisset —
 * og då brenner du dei ned i bordet, eller på nabodelen. På skjermen ser
 * arket likt ut anten adressa ligg to millimeter innanfor kanten eller to
 * millimeter utanfor.
 *
 * Difor vert kvart einaste punkt i kvar graverte bane prøvd mot dei
 * kuttbanene som er OMRISS. Ligg eit punkt i inkje, seier vakta frå.
 *
 * Gjeld ark og passprøve. Profilarket legg adressa UNDER kvar profil med
 * vilje: det er ei teikning til å lese, ikkje ei plate til å skjere.
 */
function graveringaLiggInne(namn: string, svg: string) {
  const omriss: Pt[][] = []
  const grav: Pt[][] = []
  for (const m of svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)) {
    const pts = pathPts(m[1])
    if (GRAV_FARGE.test(m[2])) grav.push(pts)
    else omriss.push(pts)
  }
  if (!grav.length || !omriss.length) return
  // Vindinga er ikkje til å stole på her; storleiken er. Eit hòl ligg
  // inni eit omriss og er mindre, so den største banen er eit omriss, og
  // alt som går same vegen som han er det òg.
  const v = omriss.reduce((b, o) => (Math.abs(shoelace(o)) > Math.abs(shoelace(b)) ? o : b))
  const vv = shoelace(v) < 0 ? -1 : 1
  const ytre = omriss.filter((o) => shoelace(o) * vv > 0)
  let ute = 0
  for (const g of grav) {
    for (const q of g) if (!ytre.some((o) => inRing(o, q))) ute++
  }
  if (ute) feil(namn, `${ute} graverte punkt ligg utanfor alle omriss`)
}

/**
 * Kva veg vindinga går i akkurat denne fila.
 *
 * Kuttarket speglar Y i ei gruppe og let hjørna stå; profilarket bakar
 * speglinga inn i hjørna. Dei to filene har difor motsett forteikn på det
 * same polygonet, og eit hardkoda forteikn her ville berre målt kva for ei
 * fil ein såg på. Den STØRSTE bana i ei fil er alltid eit omriss — eit hòl
 * ligg inni eit omriss og er mindre enn det — so ho fortel kva veg omrissa
 * går, og hòla er dei som går andre vegen.
 */
function vinding(steg: Steg[]): number {
  let best = 0
  for (const s of steg) {
    if (!s.grav && Math.abs(s.areal) > Math.abs(best)) best = s.areal
  }
  return best < 0 ? -1 : 1
}

function sjekkSteg(namn: string, steg: Steg[]) {
  const v = vinding(steg)
  const innvendig = (s: Steg) => !s.grav && s.areal * v < 0
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

// =============================================================================
// DXF
// =============================================================================
/** entitetane i ei R12-fil, i den orden dei står: lag og areal */
function dxfSteg(dxf: string): Steg[] {
  const t = dxf.split(/\r\n/)
  const out: Steg[] = []
  let lag = ""
  let pts: Pt[] | null = null
  let x = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "0") continue
    const kind = t[i + 1]
    if (kind === "POLYLINE") {
      if (pts) out.push(steg(lag, pts))
      lag = t[i + 3] === undefined ? "" : t[i + 3]
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
  if (pts) out.push(steg(lag, pts))
  return out
}

const steg = (lag: string, pts: Pt[]): Steg => ({
  grav: lag === "GRAVER",
  areal: lag === "GRAVER" ? 0 : shoelace(pts),
  y: pts.length ? Math.min(...pts.map((q) => q[1])) : 0,
})

// =============================================================================
// SAKENE
// =============================================================================
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

/** ein torus gjev ribber med ekte hòl i, og det er hòla dette handlar om */
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
  ["kube", { ...DEFAULT_PARAMS }],
  ["kule", { ...DEFAULT_PARAMS, kjelde: "kule" }],
  ["torus ståande", { ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90 }],
  ["torus, små ark", { ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, arkB: 300, arkH: 200 }],
]

/** kuttfila er éi fil per plate, so kvar plate vert prøvd for seg */
function arkSteg(namn: string, p: Params): Steg[][] {
  const { ns } = makePlan(p, DETAIL.mid)
  const kerf = p.snittveg ? 0 : p.snitt
  return ns.sheets.map((_, i) => {
    const svg = sheetSvg(ns, i, kerf)
    graveringaLiggInne(`${namn} · ark ${i + 1}`, svg)
    return svgSteg(`${namn} · ark ${i + 1}`, svg)
  })
}

/**
 * DXF-en har alle platene i den same fila, stabla oppover med ei luke
 * imellom. Rekkjefylgda gjeld INNANFOR ei plate: at ramma til plate to
 * kjem etter kutta i plate ein er ikkje eit brot, det er neste plate.
 */
function dxfPerArk(dxf: string, arkH: number): Steg[][] {
  const pitch = arkH + SHEET_GAP
  const band: Steg[][] = []
  for (const q of dxfSteg(dxf)) {
    const i = Math.max(0, Math.floor(q.y / pitch))
    ;(band[i] ??= []).push(q)
  }
  return band.filter(Boolean)
}

for (const [namn, p] of saker) {
  const bag = p as unknown as ParamBag
  arkSteg(namn, p).forEach((steg, i, all) =>
    sjekkSteg(`${namn} · ark ${i + 1}/${all.length}`, steg),
  )
  sjekkSteg(
    `${namn} · profilar`,
    svgSteg(`${namn} · profilar`, VAFFEL.exportFile(bag, "svg").text ?? ""),
  )
  dxfPerArk(VAFFEL.exportFile(bag, "dxf").text ?? "", p.arkH).forEach((steg, i, all) =>
    sjekkSteg(`${namn} · dxf ${i + 1}/${all.length}`, steg),
  )
}

const kupong = VAFFEL.exportFile(DEFAULT_PARAMS as unknown as ParamBag, "prove").text ?? ""
graveringaLiggInne("passprøve", kupong)
sjekkSteg("passprøve", svgSteg("passprøve", kupong))

// =============================================================================
// SNITTET SKAL TAKAST NØYAKTIG EIN GONG
// =============================================================================
/**
 * Står `snittveg` på maskina, skal fila levere den nominelle konturen —
 * altso nøyaktig det same som om snittbreidda var null. Er dei to ikkje
 * like, kompenserer nokon to gonger.
 */
const teikn = (p: Partial<Params>) =>
  JSON.stringify(
    arkSteg("snittveg", { ...DEFAULT_PARAMS, ...p }).map((s) =>
      s.map((q) => q.areal.toFixed(3)),
    ),
  )

const nominell = teikn({ snitt: 0 })
const iMaskina = teikn({ snitt: 0.2, snittveg: 1 })
const iFila = teikn({ snitt: 0.2, snittveg: 0 })
if (iMaskina !== nominell) feil("snitt i maskina", "fila kompenserer likevel")
else if (iFila === nominell) feil("snitt i fila", "fila kompenserer ikkje")
else console.log("  ok   snittveg                 fila kompenserer berre når ho skal")

console.log(brot ? `\n${brot} brot` : "\ningen brot")
process.exit(brot ? 1 : 0)
