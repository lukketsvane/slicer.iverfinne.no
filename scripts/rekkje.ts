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
import { kerfOf, MOTOR } from "../lib/motor"
import { makeBygg } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { sheetSvg } from "../lib/export-svg"
import { SHEET_GAP } from "../lib/export-dxf"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))


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
 * ALT SOM ER TEIKNA, SKAL LIGGJE INNANFOR RAMMA.
 *
 * `viewBox` er teikninga sitt eige mål på seg sjølv, og millimetermålet
 * ved sida er lovnaden om at ho kan skrivast ut 1:1. Ligg ein bane utanfor
 * ramma, er begge to feil: ein nettlesar klipper banen bort, og eit
 * laserprogram som les dokumentstorleiken får ei plate som er mindre enn
 * det som står i henne.
 *
 * Kompensasjonen er staden det skjer. Ho skuvar kvart omriss ein halv
 * snittbreidd utover, og ei ramme rekna på den nominelle forma veks ikkje
 * med. På kuttarket merkast det ikkje — delane ligg inne på plata med luft
 * rundt — men passprøva ER omrisset sitt, og på seks tidels snitt stod
 * ytterkanten hennar tre tidelar utanfor si eiga ramme.
 */
function innanforRamma(namn: string, svg: string) {
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number)
  if (!vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) {
    return feil(namn, "inga brukande viewBox")
  }
  // Millimetermålet skal vera det same talet som ramma. Er dei ikkje like,
  // er ikkje teikninga 1:1, same kva ho seier.
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
/**
 * TO LAG, OG INGENTING ANNA — OG BERRE STREKAR.
 *
 * SVG-sida nektar ein tredje farge og alt som er fylt: ein farge er ei
 * operasjon i laserprogrammet, so eit lag til er eitt nokon må hugse å slå
 * av og eitt nokon ein dag gløymer, og ei fylling ber maskina brenne heile
 * flata.
 *
 * DXF-sida hadde ingen slik regel. Ho las «GRAVER» som gravering og ALT
 * ANNA som kutt — so eit lag som dukka opp, eller eit lag som skreiv seg
 * feil, vart stille om til eit kutt gjennom plata. Og ho såg berre etter
 * POLYLINE: ein SOLID eller ein HATCH — det er DXF-en sitt ord for ei
 * fylling — var usynleg for henne heilt fram til maskina.
 *
 * Difor kvitlister: laga skal vera GRAVER og KUTT, og entitetane i
 * ENTITIES skal vera POLYLINE, VERTEX og SEQEND.
 */
const DXF_LAG = new Set(["GRAVER", "KUTT"])
const DXF_ENT = new Set(["POLYLINE", "VERTEX", "SEQEND"])

/** entitetane i ei R12-fil, i den orden dei står: lag og areal */
function dxfSteg(namn: string, dxf: string): Steg[] {
  const t = dxf.split(/\r\n/)
  const out: Steg[] = []
  let lag = ""
  let pts: Pt[] | null = null
  let x = 0
  let iEnt = false
  const framandeLag = new Set<string>()
  const framandeEnt = new Set<string>()
  // Ei DXF-fil er strengt par av gruppekode og verdi. Ein «0» på ein
  // VERDI-plass er ikkje ein entitetsstart — det er eit tal som er null —
  // so pariteten må haldast, elles les ein koordinatar som entitetsnamn.
  for (let i = 0; i < t.length - 1; i += 2) {
    if (t[i] !== "0") continue
    const kind = t[i + 1]
    if (kind === "SECTION") iEnt = t[i + 3] === "ENTITIES"
    else if (kind === "ENDSEC" || kind === "EOF") iEnt = false
    else if (iEnt && !DXF_ENT.has(kind)) framandeEnt.add(kind)
    if (kind === "POLYLINE") {
      if (pts) out.push(steg(lag, pts))
      lag = t[i + 3] === undefined ? "" : t[i + 3]
      if (!DXF_LAG.has(lag)) framandeLag.add(lag)
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
  if (framandeLag.size) feil(namn, `framande lag: ${[...framandeLag].join(", ")}`)
  if (framandeEnt.size) feil(namn, `framande entitetar: ${[...framandeEnt].join(", ")}`)
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
  // ADRESSA MOT SPORVEGGEN.
  //
  // Ribbene her er kammar med lange, tette rader av spor, og dei er store
  // nok til at adressa vert sett i full storleik. Det er den kombinasjonen
  // som fekk teksten utanfor kuttlina: rasteret som leitar etter det
  // feitaste punktet på delen hoppa over eit spor, fylte tvers over det,
  // og la adressa midt på veggen mellom to spor. Ein millimeter utanfor,
  // og heilt usynleg på skjermen.
  ["torus, tett og stort", { ...DEFAULT_PARAMS, kjelde: "torus", plan: nett(13, 13), storleik: 560 }],
]

/** kuttfila er éi fil per plate, so kvar plate vert prøvd for seg */
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

/**
 * DXF-en har alle platene i den same fila, stabla oppover med ei luke
 * imellom. Rekkjefylgda gjeld INNANFOR ei plate: at ramma til plate to
 * kjem etter kutta i plate ein er ikkje eit brot, det er neste plate.
 */
function dxfPerArk(namn: string, dxf: string, arkH: number): Steg[][] {
  const pitch = arkH + SHEET_GAP
  const band: Steg[][] = []
  for (const q of dxfSteg(namn, dxf)) {
    const i = Math.max(0, Math.floor(q.y / pitch))
    ;(band[i] ??= []).push(q)
  }
  return band.filter(Boolean)
}

// =============================================================================
// INVENTAR
// =============================================================================
/**
 * KVAR DEL, OG KVART HÒL, SKAL VERE I FILA.
 *
 * Alt over spør om filene er RETTE: rett orden, rett farge, rett veg på
 * kompensasjonen. Ingenting spør om dei er HEILE. Ei kuttfil som manglar
 * ei ribbe er ei feilfri fil etter alle prøvene over — ho har to fargar,
 * graveringa fyrst og omrisset sist — heilt til plata er skoren og
 * fireogseksti ledd skal setjast saman med treogseksti delar.
 *
 * Eit hòl som fell bort er verre enn ein del som fell bort, av di du ikkje
 * ser det. Plata kjem ut av maskina med rett tal delar; det er fyrst når
 * ribbe elleve ikkje vil gå ned over ribbe fem at det kjem fram at sporet
 * aldri vart skore.
 *
 * Fasiten er nestinga: kvar del på ei plate krev nøyaktig éi omrissbane og
 * éi bane per hòl. Og nestinga sjølv vert målt mot delelista ho fekk — ein
 * pakkar som mistar ein del utan å telje han som spilt, ville elles hatt
 * fasiten på si side.
 *
 * SVG og DXF vert prøvde kvar for seg mot den same fasiten. Dei er to
 * uavhengige skrivarar over den same nestinga, so ein skilnad mellom dei
 * er ein av dei som tek feil.
 */
function inventar(namn: string, p: Params, svg: Steg[][], dxf: Steg[][]) {
  const før = brot
  const { dl, ns } = makeBygg(p, DETAIL.mid)

  // Pakkinga skal gjere greie for kvar einaste del ho fekk: han ligg på ei
  // plate, eller han er talt som spilt. Det er ingen tredje stad.
  const lagde = ns.sheets.reduce((n, s) => n + s.placed.length, 0)
  if (lagde + ns.spilt !== dl.delar.length) {
    feil(namn, `pakkinga: ${dl.delar.length} delar inn, ${lagde} lagde + ${ns.spilt} spilte ut`)
  }

  const venta = ns.sheets.map((s) => s.placed.reduce((n, q) => n + 1 + q.part.holes.length, 0))
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
  const dxf = dxfPerArk(`${namn} · dxf`, MOTOR.exportFile(bag, "dxf").text ?? "", p.arkH)
  dxf.forEach((steg, i, all) => sjekkSteg(`${namn} · dxf ${i + 1}/${all.length}`, steg))
  inventar(namn, p, ark, dxf)
}

const kupong = MOTOR.exportFile(DEFAULT_PARAMS as unknown as ParamBag, "prove").text ?? ""
graveringaLiggInne("passprøve", kupong)
sjekkSteg("passprøve", svgSteg("passprøve", kupong))

// =============================================================================
// PASSPRØVA SKAL MÅLAST
// =============================================================================
/**
 * SJU SPOR, OG DET ER BREIDDA PÅ DEI SOM ER HEILE POENGET.
 *
 * Passprøva er kalibreringa til heile byggjet. Du skjer henne, skyv eit
 * avkapp av den same plata ned i kvart spor, finn det som går inn med
 * tommelkraft, og les talet under. Det talet vert `klaring`, og klaringa
 * går inn i kvart einaste av dei fireogseksti ledda.
 *
 * Er sporet under «15» eigentleg 0,20 breitt, kalibrerer du mot ei løgn.
 * Kvar einaste tapp vert fem hundredelar for laus, heile stabelen sig, og
 * du finn det ikkje att i noko — du har jo MÅLT.
 *
 * Prøvene over ser på prøva som ei kuttfil: rett orden, to fargar, ingen
 * gravering utanfor. Ingen av dei bryr seg om kor breie spora er. Ei prøve
 * med sju like spor ville gått rett gjennom heile skriptet.
 *
 * Difor vert breidda MÅLT, i fila, slik ein maskin ville lese henne.
 *
 * FERDIG breidd, ikkje breidda i fila. Spora er hakk i omrisset, og
 * omrisset er skuve ein halv snittbreidd ut — so i fila er kvart spor ei
 * heil snittbreidd for smalt, og stråla et det opp att. Det er summen som
 * skal stemme, og det er summen tommelen kjenner.
 *
 * Toleransen er ein hundredel: fila ber to desimalar, so eit hjørne kan
 * runde av ein halv hundredel kvar veg. Stega er fem hundredelar frå
 * kvarandre og tommelen kjenner ikkje ein hundredel, so det er langt nok
 * unna til å ikkje tyde noko — men det er grunnen til at talet ikkje er
 * null.
 */
const KLARINGAR = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]

/** dei to endane av kvart spor, målte i golvet på hakket */
function sporIKupong(svg: string) {
  const baner = [...svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map((m) => ({
    grav: GRAV_FARGE.test(m[2]),
    p: pathPts(m[1]),
  }))
  const kutt = baner.find((b) => !b.grav)
  if (!kutt) return null
  // Tre y-nivå i omrisset: botnen, golvet i spora, og overkanten der spora
  // opnar seg. Golvet er det midtre, og det er der hakka kan målast.
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

/**
 * OG TALET SKAL STÅ UNDER SITT EIGE SPOR.
 *
 * Sju rette spor med talrekkja forskjøve eitt hakk er den verste av alle
 * feila her: prøva er heilt rett, ho er berre feilmerkt, og du les 0,15
 * der du skulle lese 0,20. Talrekkja er den graveringa som ligg nærast
 * spora — under golvet i dei og over dei to bilinene — og kvart tal skal
 * ha tyngdepunktet sitt innanfor sitt eige spor.
 */
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

  // Digitala i eitt tal står nærare kvarandre enn to tal gjer. Halve
  // avstanden mellom to spor skil dei to utan å vite kor stor skrifta er.
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

// Tynt og tjukt, med og utan kompensasjon i fila. Cella, djupna og
// skuldra skalerer alle med tjukna, so ei prøve som stemmer på tre mm er
// ikkje eit svar for ei på tolv.
const proveSaker: [string, Partial<Params>][] = [
  ["passprøve 3 mm", {}],
  ["passprøve 3 mm, maskina", { snittveg: 1 }],
  ["passprøve 1,5 mm", { tjukn: 1.5, snitt: 0.1 }],
  ["passprøve 6 mm", { tjukn: 6, snitt: 0.4 }],
  ["passprøve 12 mm", { tjukn: 12, snitt: 0.5 }],
  ["passprøve utan snitt", { snitt: 0 }],
]
for (const [namn, over] of proveSaker) {
  const pp = { ...DEFAULT_PARAMS, ...over }
  const svg = MOTOR.exportFile(pp as unknown as ParamBag, "prove").text ?? ""
  innanforRamma(namn, svg)
  graveringaLiggInne(namn, svg)
  kupongMaal(namn, svg, pp.tjukn, kerfOf(pp))
}

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

/**
 * OG HAN SKAL KOMPENSERE RETT VEG.
 *
 * Prøven over spør berre om fila er ei ANNA fil. Snu forteiknet på
 * kompensasjonen, og ho er framleis ei anna fil — men kvar einaste del
 * kjem ut ei heil snittbreidd for lita, kvart spor for smalt, og
 * rutenettet held seg ikkje sjølv. Det er ein feil du finn med sekstifire
 * skorne delar framfor deg.
 *
 * Retninga er gjeven: omrisset skal skuvast UT og hòla INN, so stråla et
 * seg inn til den nominelle lina frå begge sider. Arealet med forteikn
 * fangar begge: eit omriss som veks gjev meir positivt, eit hòl som
 * krympar gjev mindre negativt. Summen må opp.
 */
const summer = (p: Partial<Params>) =>
  arkSteg("snittveg", { ...DEFAULT_PARAMS, ...p })
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

console.log(brot ? `\n${brot} brot` : "\ningen brot")
process.exit(brot ? 1 : 0)
