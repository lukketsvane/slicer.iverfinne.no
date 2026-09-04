/**
 * VRIENPRØVA — det som ikkje skal kome inn, og det som ikkje skal setjast.
 *
 * Dei andre prøvene køyrer reiskapen på objekt han er meint for: ein kube,
 * ei kule, ein torus. Denne køyrer han på det ingen har tenkt på. Ein
 * brukar som slepper ei fil på sida har ikkje lese noko som helst, og
 * skyvarane hans står der dei står.
 *
 * Kravet er ikkje at kvart svar skal vera pent. Eit nett utan volum HAR
 * ingen delar, og null delar er rett svar. Kravet er at reiskapen svarar:
 * ingen NaN på skjermen, ingen uendeleg, inga tom fil frå ein knapp som
 * ser trykkbar ut, og ingen kast ut av motoren.
 *
 * Ein NaN er verre enn ein feil. Ein feil stoggar deg; ein NaN går
 * gjennom heile rekninga, kjem ut som ein strek i panelet, og fyrst på
 * plata ser du at noko var gale.
 *
 *   npx tsx scripts/vrient.ts
 */
import { MOTOR } from "../lib/motor"
import { DEFAULT_PARAMS, PARAM_RANGES, type Params } from "../lib/params"
import { parseMesh } from "../lib/io"
import { unzip } from "../lib/zip"
import { meshToStl } from "../lib/export-stl"
import { bounds, makeSoup, weld } from "../lib/soup"
import { taubin } from "../lib/mesh/smooth"
import { put } from "../lib/sources"
import type { ExportKind, Metrics, ParamBag } from "../lib/core"

import { rutenett, skrivPlan } from "../lib/plan"
const ruter = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

/**
 * PRØVEKROPPEN. Standarden opnar UTAN plan — reiskapen er tom til du skjer
 * — so ei vakt som måler geometri må seie kva ho måler. Seks kvar veg er
 * det same rutenettet standarden hadde før, og det same objektet.
 */
const GRUNN = { ...DEFAULT_PARAMS, plan: ruter(6, 6) }

let brot = 0
let saker = 0
const feil = (namn: string, kva: string) => {
  brot++
  console.log(`FEIL  ${namn.padEnd(34)} ${kva}`)
}

// =============================================================================
// NETT SOM IKKJE ER NETT
// =============================================================================
const tri = (...v: number[]) => new Float32Array(v)

/** eit rutenett i eitt plan: null tjukn, og difor null volum */
function flat(n: number, s: number): Float32Array {
  const pos: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i / n - 0.5) * s
      const y = (j / n - 0.5) * s
      const d = s / n
      pos.push(x, y, 0, x + d, y, 0, x + d, y + d, 0)
      pos.push(x, y, 0, x + d, y + d, 0, x, y + d, 0)
    }
  }
  return new Float32Array(pos)
}

function boks(w: number, d: number, h: number, ox = 0, oy = 0, oz = 0): Float32Array {
  const p: [number, number, number][] = [
    [ox, oy, oz],
    [ox + w, oy, oz],
    [ox + w, oy + d, oz],
    [ox, oy + d, oz],
    [ox, oy, oz + h],
    [ox + w, oy, oz + h],
    [ox + w, oy + d, oz + h],
    [ox, oy + d, oz + h],
  ]
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ]
  const out: number[] = []
  for (const [a, b, c] of f) out.push(...p[a], ...p[b], ...p[c])
  return new Float32Array(out)
}

/** to boksar som ikkje rører kvarandre: eit nett i to stykke */
function tvo(): Float32Array {
  const a = boks(40, 40, 40, -80, -20, 0)
  const b = boks(40, 40, 40, 40, -20, 0)
  return new Float32Array([...a, ...b])
}

const NETT: [string, Float32Array][] = [
  ["tomt nett", new Float32Array(0)],
  ["éin trekant", tri(0, 0, 0, 100, 0, 0, 0, 100, 0)],
  ["trekant utan areal", tri(0, 0, 0, 50, 0, 0, 100, 0, 0)],
  ["flatt ark", flat(12, 120)],
  ["nål", boks(0.4, 0.4, 200)],
  ["papirtynn plate", boks(200, 200, 0.2)],
  ["mikroskopisk", boks(0.01, 0.01, 0.01)],
  ["langt frå origo", boks(40, 40, 40, 900000, 900000, 900000)],
  ["to stykke", tvo()],
  ["kube med hól i", (() => {
    // eit ope nett: botnen mangler
    const b = boks(60, 60, 60)
    return b.slice(0, b.length - 18)
  })()],
]

for (const [namn, pos] of NETT) put(`v-${namn}`, namn, makeSoup(pos))

/** ei kule med mange nok trekantar til at forenklinga har noko å ta */
function kule(r: number, seg: number): Float32Array {
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
  return new Float32Array(pos)
}

/** ein torus som står gjev stykke utan ledd, so `lause` har noko å kaste */
function torus(R: number, r: number, n: number, m: number): Float32Array {
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
  return new Float32Array(pos)
}

put("v-kule", "kule", makeSoup(kule(50, 60)))
put("v-torus", "torus", makeSoup(torus(50, 18, 48, 24)))

// =============================================================================
// KVA EIT SVAR MÅ HALDE
// =============================================================================
const endeleg = (v: unknown) => typeof v === "number" && Number.isFinite(v)

function sjekk(namn: string, p: Params, vis = false) {
  saker++
  const bag = p as unknown as ParamBag
  let m
  try {
    m = MOTOR.measure(bag)
  } catch (e) {
    return feil(namn, `måling kasta: ${(e as Error).message}`)
  }

  for (const [k, v] of Object.entries(m)) {
    if (k === "list" || k === "unitLabel") continue
    if (!endeleg(v)) return feil(namn, `måltalet ${k} er ${v}`)
  }
  // Teksten er det som står på skjermen. Eit tal som er endeleg i
  // rekninga, men skrive ut som «NaN», er like gale for den som les.
  for (const q of m.list) {
    if (/NaN|Infinity|undefined/.test(q.text)) feil(namn, `«${q.label}» står som «${q.text}»`)
  }

  let r
  try {
    r = MOTOR.rules(bag, m)
  } catch (e) {
    return feil(namn, `reglane kasta: ${(e as Error).message}`)
  }
  for (const q of r) {
    if (/NaN|Infinity|undefined/.test(q.value)) feil(namn, `regelen «${q.label}» står som «${q.value}»`)
  }

  for (const view of ["flate", "lag"] as const) {
    try {
      const b = MOTOR.build(bag, "mid", view)
      for (let i = 0; i < 3; i++) {
        if (!endeleg(b.min[i]) || !endeleg(b.max[i])) {
          feil(namn, `boksen til «${view}» er ${b.min}..${b.max}`)
          break
        }
      }
    } catch (e) {
      feil(namn, `bygget «${view}» kasta: ${(e as Error).message}`)
    }
  }

  // Ein knapp som leverer ei tom fil er ein knapp som lyg. Har objektet
  // ingen delar, er det greitt at arket er tomt for banar — men fila skal
  // finnast, ha namn, og vera eit dokument.
  const storleik: string[] = []
  for (const kind of ["stl", "dxf", "svg", "ark", "prove"] as ExportKind[]) {
    try {
      const o = MOTOR.exportFile(bag, kind)
      const n = o.text?.length ?? o.data?.byteLength ?? 0
      storleik.push(`${kind} ${n}`)
      if (!o.name) feil(namn, `uttaket ${kind} har ikkje namn`)
      if (n === 0) feil(namn, `uttaket ${kind} er tomt`)
      if (o.text && /NaN|Infinity/.test(o.text)) feil(namn, `uttaket ${kind} inneheld NaN`)

      // Ei fil med delar i lista, men utan ei einaste bane, er den verste
      // sorten: ho lastar ned, ho opnar, og ho er tom. Panelet stengjer
      // knappen i nett dei to tilfella (`stengd` i controls-panel), so det
      // som står ATT skal alltid ha noko i seg.
      //
      // Er det fleire plater, kjem arket som ein ZIP, og då finst det ingen
      // tekst å telje banar i. Zippen vert målt i staden: ein tom ZIP er 22
      // byte, so alt over det er minst éi fil med noko i.
      const skalHaNoko =
        (kind === "svg" && m.parts > 0) ||
        ((kind === "dxf" || kind === "ark") && m.parts > 0 && m.sheets > 0)
      if (skalHaNoko) {
        if (o.text) {
          const banar = (o.text.match(/<path|POLYLINE/g) ?? []).length
          if (banar === 0) {
            feil(namn, `uttaket ${kind} har ${m.parts} delar i lista og null banar i fila`)
          }
        } else if ((o.data?.byteLength ?? 0) < 200) {
          feil(namn, `uttaket ${kind} er ein tom pakke (${o.data?.byteLength ?? 0} B)`)
        }
      }
    } catch (e) {
      feil(namn, `uttaket ${kind} kasta: ${(e as Error).message}`)
    }
  }
  if (vis) {
    console.log(
      `  ${namn}  ${String(m.parts).padStart(3)} delar · ` +
        `${(m.cutLen / 1000).toFixed(1)} m · ${m.sheets} ark · ` +
        `${m.loose} kasta · ${storleik.join(", ")}`,
    )
  }
}

// =============================================================================
// SAME GEOMETRI, SAME SVAR
// =============================================================================
/**
 * REKKJEFYLGDA I FILA ER IKKJE EIN OPPLYSNING OM FORMA.
 *
 * Strålen tel skal: han går gjennom nettet, legg til for kvar flate som
 * vender mot han og trekkjer frå for kvar som vender vekk, og det som er
 * over null er gods. Eit skal som sluttar nett der det neste byrjar — ein
 * kropp på bein, to klossar oppå kvarandre, ein skann sydd av to delar —
 * gjev ei utgang og ei inngang på NØYAKTIG same koordinaten, og då avgjer
 * sorteringa kva som kjem fyrst.
 *
 * To like klossar som deler planet z = 100 gav [[0,100],[100,200]] med den
 * nedre fyrst i fila og [[0,200]] med den øvre fyrst. Same geometri, to
 * svar — og eit skøytepunkt som er to køyrar er eit spor til, lagt der det
 * ikkje er noka opning.
 */
/**
 * EI LUKKA FLATE SKAL MELDAST LUKKA.
 *
 * «Opne kantar» er kantar som berre høyrer til éin trekant, og talet står
 * i panelet med ein mjuk regel bak seg. Ein trekant med to like hjørne har
 * inga flate — men berre den samanfalne kanten vart hoppa over, so dei to
 * andre (som er den same kanten, gått kvar sin veg) vart begge talde. Ei
 * UV-kule har ein slik trekant per rute ved kvar pol: `kule(50, 40)` er
 * tett, og vart meld med 80 opne kantar.
 */
/**
 * UTJAMNINGA SKAL IKKJE ETE KANTEN.
 *
 * README-en seier at glattinga tek skannarstøy «without shrinking», og
 * koden har ei grein som skal halde randa i ro. Ho prøvde GRADEN — under
 * to naboar — og grad er ikkje rand: eit hjørne på ein open kant har tre
 * eller fire naboar. Ei open plate på hundre millimeter kraup til 93,3
 * etter fire og tjue rundar, tre millimeter av kvar kant.
 */
console.log("randa står stille")
{
  saker++
  const n = 10
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => [(i / n) * 100 - 50, (j / n) * 100 - 50, 0]
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  // Rett på nettet: ei flat plate har ingen ribber å måle gjennom motoren.
  const plate = weld(makeSoup(new Float32Array(pos)))
  const breidd = (rundar: number) => {
    const b = bounds(taubin(plate, rundar).verts)
    return b.max[0] - b.min[0]
  }
  const rein = breidd(0)
  const glatta = breidd(24)
  if (rein - glatta > 0.05) feil("open plate, glatta", `krympa ${(rein - glatta).toFixed(2)} mm`)
  console.log(`  open plate, 0 mot 24 rundar: ${rein.toFixed(3)} → ${glatta.toFixed(3)} mm`)
}

console.log("\nlukka nett skal meldast lukka")
{
  saker++
  const seg = 40
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [50 * Math.sin(ph) * Math.cos(th), 50 * Math.sin(ph) * Math.sin(th), 50 * Math.cos(ph)]
  }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  put("v-tett-kule", "tett-kule", makeSoup(new Float32Array(pos)))
  const m = MOTOR.measure({ ...DEFAULT_PARAMS, kjelde: "v-tett-kule" } as unknown as ParamBag)
  if (m.openEdges !== 0) feil("tett kule", `${m.openEdges} opne kantar på ei lukka flate`)
  console.log(`  ei UV-kule med polar: ${m.openEdges} opne kantar`)
}

console.log("\nsame geometri, same svar")
{
  const kloss = (out: number[], w: number, d: number, h: number, ox: number, oy: number, oz: number) => {
    const q: [number, number, number][] = [
      [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
      [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h]]
    const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
    for (const [a, b, c] of f) out.push(...q[a], ...q[b], ...q[c])
  }
  const ned: number[] = []; kloss(ned, 100, 100, 100, 0, 0, 0); kloss(ned, 100, 100, 100, 0, 0, 100)
  const opp: number[] = []; kloss(opp, 100, 100, 100, 0, 0, 100); kloss(opp, 100, 100, 100, 0, 0, 0)
  put("v-skøyt-ned", "skøyt-ned", makeSoup(new Float32Array(ned)))
  put("v-skøyt-opp", "skøyt-opp", makeSoup(new Float32Array(opp)))
  saker++
  const tal = (kjelde: string) => {
    const m = MOTOR.measure({ ...DEFAULT_PARAMS, kjelde } as unknown as ParamBag)
    return `${m.parts} delar · ${m.joints} ledd · ${m.cutLen.toFixed(1)} mm kutt · ${m.envZ.toFixed(1)} mm høg`
  }
  const a = tal("v-skøyt-ned")
  const b = tal("v-skøyt-opp")
  if (a !== b) feil("skøytte klossar", `${a}  mot  ${b}`)
  console.log(`  to klossar som deler eit plan: ${a}`)
  console.log(`  same to, motsett rekkjefylgje:  ${b}`)

  /**
   * OG DET SAME NETTET FLYTTA.
   *
   * «Eit nett frå ein skannar har origo der skannaren stod», seier `place`
   * sin eigen kommentar. Vendingsvakta spurde om summen av
   * divergensleddet var negativ, og for ei OPEN flate er den summen ikkje
   * uavhengig av kvar origo ligg: den same, rett vunde kuben utan ei
   * sideflate gav +1 000 000 med origo i hjørnet og −666 667 med origo
   * 500 mm unna — og då vart han snudd ut-inn, som les som ingen ting.
   */
  const opneBoks = (ox: number) => {
    const out: number[] = []
    const q: [number, number, number][] = [
      [ox, 0, 0], [ox + 100, 0, 0], [ox + 100, 100, 0], [ox, 100, 0],
      [ox, 0, 100], [ox + 100, 0, 100], [ox + 100, 100, 100], [ox, 100, 100]]
    // −x-flata er borte: eit ope nett med rett vinding heile vegen
    const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6]]
    for (const [i, j, k] of f) out.push(...q[i], ...q[j], ...q[k])
    return makeSoup(new Float32Array(out))
  }
  saker++
  const svar: string[] = []
  for (const ox of [0, -300, -500, 700]) {
    put(`v-open-${ox}`, `open-${ox}`, opneBoks(ox))
    svar.push(tal(`v-open-${ox}`))
  }
  if (new Set(svar).size !== 1) feil("ope nett flytta", svar.join("  |  "))
  console.log(`  ope nett, fire origo:          ${svar[0]}`)
}

// =============================================================================
// DET DU LAGRAR ER DET DU OPNAR
// =============================================================================
/**
 * Lenkja ber kvar innstilling utan om nettet, av di ein URL ikkje kan bera
 * hundre megabyte. Prosjektfila kan: oppsettet og fila du slepte inn, i
 * lag. Kravet er ikkje at ho opnar — det er at ho gjev DEN SAME
 * KUTTFILA. Ei lagring som kjem attende med eit anna objekt er verre enn
 * ingen lagring: du oppdagar det når platene ikkje går i hop.
 */
console.log("det du lagrar er det du opnar")
{
  // Ei kjelde som er IMPORTERT, slik arbeidaren gjer det: nettet og bytane
  // det kom av. Ei kjelde utan bytar — kuben, eller eit nett laga i koden —
  // ber seg sjølv i `kjelde`, og då er oppsettet heile prosjektet.
  saker++
  const soup = makeSoup(kule(50, 24))
  const nrm = new Float32Array(soup.pos.length)
  for (let i = 0; i < nrm.length; i += 3) {
    const L = Math.hypot(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]) || 1
    nrm[i] = soup.pos[i] / L
    nrm[i + 1] = soup.pos[i + 1] / L
    nrm[i + 2] = soup.pos[i + 2] / L
  }
  const stl = meshToStl({ positions: soup.pos, normals: nrm, tris: soup.tris }, "kule")
  const lest = parseMesh("kule.stl", stl.buffer.slice(0) as ArrayBuffer)
  put("v-lagra", "kule.stl", lest, new Uint8Array(stl))

  const p: Params = { ...DEFAULT_PARAMS, kjelde: "v-lagra", storleik: 220, plan: ruter(7, 7), tjukn: 4 }
  const bag = p as unknown as ParamBag
  const pro = MOTOR.exportFile(bag, "prosjekt")
  const inni = unzip(pro.data as ArrayBuffer)
  const opp = inni.find((f) => f.name === "oppsett.json")
  const nett = inni.find((f) => f.name.startsWith("nett/"))
  if (!opp) feil("prosjekt", "arkivet manglar oppsett.json")
  else if (!nett) feil("prosjekt", "arkivet manglar nettet")
  else {
    const lese = (JSON.parse(new TextDecoder().decode(opp.data)) as { p: ParamBag }).p
    const attende = parseMesh(nett.name.slice(5), new Uint8Array(nett.data).buffer.slice(0) as ArrayBuffer)
    put("v-attende", "attende", attende)
    // DXF-en er éi fil per plate, og denne saka gjev sju av dei — altso
    // ein ZIP. `.text` er tom då, og to tomme strengar er like: prøva
    // hadde stått og sagt «same DXF: true» utan å prøve noko. So teksten
    // vert henta ut av arkivet når det er eit arkiv, og prøva krev at ho
    // finst.
    const dxfTekst = (o: ReturnType<typeof MOTOR.exportFile>) =>
      o.text ?? unzip(o.data as ArrayBuffer).map((f) => new TextDecoder().decode(f.data)).join("")
    const b = dxfTekst(MOTOR.exportFile({ ...lese, kjelde: "v-attende" }, "dxf"))
    const a = dxfTekst(MOTOR.exportFile(bag, "dxf"))
    if (!a.length) feil("prosjekt", "DXF-en er tom — prøva ville ikkje prøvd noko")
    if (a !== b) feil("prosjekt", `DXF-en er ein annan etter opning (${a.length} mot ${b.length} teikn)`)
    console.log(`  prosjekt: ${inni.length} filer, ${attende.tris} trekantar attende, same DXF: ${a === b} (${a.length} teikn)`)
  }

  // og «alt» skal ha kvar einaste fil i seg
  saker++
  const alt = MOTOR.exportFile(bag, "alt")
  const filer = unzip(alt.data as ArrayBuffer).map((f) => f.name)
  const mangler = ["stl", "dxf", "profilar.svg", "passprove", "kuttliste.csv", "oppsett.json"].filter(
    (q) => !filer.some((n) => n.includes(q)),
  )
  if (mangler.length) feil("alt", `manglar ${mangler.join(", ")}`)
  if (!filer.some((n) => n.includes("-ark"))) feil("alt", "manglar platene")
  console.log(`  alt: ${filer.length} filer — ${filer.join(", ")}`)
}

// =============================================================================
// FILER SOM IKKJE ER FILER
// =============================================================================
/**
 * Ei fil kjem utanfrå, og ho kan seie kva som helst om seg sjølv.
 *
 * PLY-hovudet skriv kor mange rader kroppen har, og talet vart lese rett
 * inn som lykkjegrense. Ei fil på to hundre byte med «element foo 1e18»
 * sette arbeidaren til å telje til ein trillion: sida stod på «les fila …»
 * for alltid, og einaste vegen ut var å laste henne på nytt.
 *
 * Kravet er ikkje at fila skal lesast. Det er at reiskapen skal KOME
 * ATTENDE — anten med eit nett eller med eit ord om at han ikkje kunne
 * lese henne. Går ein av desse i lykkje att, stoggar heile prøvebenken her,
 * og det er òg eit svar.
 */
console.log("filer som ikkje er filer")
{
  const tekst = new TextEncoder()
  const bygg = (hovud: string, hale = 0) => {
    const h = tekst.encode(hovud)
    const b = new Uint8Array(h.length + hale)
    b.set(h, 0)
    return b.buffer.slice(0) as ArrayBuffer
  }
  const FILER: [string, string, ArrayBuffer][] = [
    ["ply: element 1e18", "vond.ply", bygg("ply\nformat binary_little_endian 1.0\nelement foo 1e18\nproperty float bar\nend_header\n", 100)],
    ["ply: milliard toppunkt", "vond.ply", bygg("ply\nformat binary_little_endian 1.0\nelement vertex 1000000000\nproperty float x\nproperty float y\nproperty float z\nend_header\n", 100)],
    ["ply: tekst, milliard", "vond.ply", bygg("ply\nformat ascii 1.0\nelement vertex 1000000000\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n")],
    ["ply: negativt tal", "vond.ply", bygg("ply\nformat ascii 1.0\nelement vertex -5\nproperty float x\nend_header\n")],
    ["ply: utan hovudslutt", "vond.ply", bygg("ply\nformat ascii 1.0\nelement vertex 3\n")],
    ["stl: berre hovudet", "vond.stl", bygg("", 84)],
    ["stl: lyg om talet", "vond.stl", (() => { const b = new Uint8Array(84); new DataView(b.buffer).setUint32(80, 1e6, true); return b.buffer.slice(0) as ArrayBuffer })()],
    ["obj: berre søppel", "vond.obj", bygg("f 1 2 3\nf 9 9 9\nv nei nei nei\n")],
    ["glb: for kort", "vond.glb", bygg("glTF", 4)],
    ["tomt", "vond.stl", bygg("")],
  ]
  for (const [namn, filnamn, buf] of FILER) {
    saker++
    const t0 = Date.now()
    let svar: string
    try {
      const m = parseMesh(filnamn, buf)
      svar = `${m.tris} trekantar`
    } catch (e) {
      svar = `sa frå: ${(e as Error).message.slice(0, 46)}`
    }
    const brukt = Date.now() - t0
    if (brukt > 1000) feil(namn, `tok ${brukt} ms på ${buf.byteLength} byte`)
    console.log(`  ${namn.padEnd(24)} ${String(buf.byteLength).padStart(5)} B → ${svar} (${brukt} ms)`)
  }
}

// =============================================================================
// KØYRINGA
// =============================================================================
console.log("\nnett som ikkje er nett")
for (const [namn] of NETT) {
  sjekk(namn.padEnd(20), { ...DEFAULT_PARAMS, kjelde: `v-${namn}` }, true)
}

console.log("\nskyvarane i kvar sin ende")
// Kvar skyvar heilt ned og heilt opp, éin om gongen, på kuben. Ein
// parameter som berre er prøvd i midten er ein parameter som ikkje er
// prøvd: det er endane reglane og geometrien knekk i.
for (const k of Object.keys(PARAM_RANGES)) {
  const r = PARAM_RANGES[k]
  for (const [enden, v] of [["min", r.min], ["max", r.max]] as const) {
    sjekk(`${k} = ${v} (${enden})`, { ...DEFAULT_PARAMS, [k]: v })
  }
}

console.log("\nvriene kombinasjonar")
const KOMBI: [string, Partial<Params>][] = [
  ["eitt plan kvar veg", { plan: ruter(1, 1) }],
  ["alt på eitt plan", { plan: ruter(32, 1) }],
  ["ingen plan", { plan: "" }],
  ["berre skrå plan", { plan: "1@0.5,0.5,0.5/0.577,0.577,0.577;2@0.5,0.5,0.5/-0.577,0.577,0.577;3@0.5,0.5,0.5/0.577,-0.577,0.577" }],
  ["plan utanfor kroppen", { plan: "1@1.4,0.5,0.5/1,0,0;2@0.5,-0.4,0.5/0,1,0" }],
  ["tett rutenett i tjukk plate", { plan: ruter(32, 32), tjukn: 25 }],
  ["tjukkare plate enn objekt", { storleik: 40, tjukn: 25 }],
  ["snitt breiare enn godset", { snitt: 6, tjukn: 2 }],
  ["minsteark, størst objekt", { storleik: 1200, arkB: 200, arkH: 200 }],
  ["glatta i hel", { glatt: 24, trekant: 0.5 }],
  ["vend i alle tre", { rotX: 180, rotY: 180, rotZ: 180 }],
  ["lause tekne med", { lause: 0, kjelde: "v-nål" }],
  ["nål med 32 plan", { kjelde: "v-nål", plan: ruter(32, 32) }],
  ["flatt ark, tjukk plate", { kjelde: "v-flatt ark", tjukn: 25 }],
  // Ingen del får plass på plata. Delane finst, arka gjer det ikkje, og
  // det var her DXF-en og arket kom ut som tomme dokument.
  ["for stort for plata", { storleik: 900, plan: ruter(14, 14), tjukn: 6, arkB: 400, arkH: 300 }],
]
for (const [namn, over] of KOMBI) sjekk(namn.padEnd(20), { ...DEFAULT_PARAMS, ...over })

console.log("\nlenkja tåler kva som helst")
// Hashen er ikkje til å stole på. Ho skal aldri kunne skyve NaN inn i
// snittinga, uansett kva som står i henne.
const SØPPEL: unknown[] = [
  null,
  "kube",
  42,
  [],
  { storleik: NaN },
  { storleik: Infinity },
  { storleik: -Infinity },
  { plan: "1@0.5,0.5,0.5/0,0,0" },
  { scene: "kube@1e9,0,0/1/0" },
  { scene: "x".repeat(4000) },
  { scene: "kule@0,0,0/NaN/0;../../etc@0,0,0/1/0" },
  { plan: "1@0.5,0.5,0.5/1,0,0;1@0.5,0.5,0.5/0,1,0" },
  { plan: "x".repeat(5000) },
  { plan: "1@NaN,0,0/1,0,0;2@0.5,0.5,0.5/Infinity,0,0" },
  // Botnen på ribbene er to. Ei lenkje som ber 1 — eller 0, eller eit
  // negativt tal — skal kome ut på to og ikkje på det ho bad om: sløyfa
  // under les kvart band og ville teke det.
  { plan: ruter(1, 1) },
  { plan: Array.from({ length: 300 }, (_, i) => `${i + 1}@0.5,0.5,0.5/1,0,0`).join(";") },
  // EIT MERKE FRÅ EI GAMMAL LENKJE. Handteikna baner (`b`) fanst ein
  // periode og er borte. Ein slik hale skal difor falle på REGELEN, før
  // noko vert splitta — ein million koordinatar kostar eitt regexbom, og
  // tida under er det som seier frå om det ikkje er sant lenger.
  { plan: `1@0.5,0.5,0.5/1,0,0/-b:0.04_${Array.from({ length: 1000000 }, () => "0.1").join("_")}` },
  { plan: `1@0.5,0.5,0.5/1,0,0/${Array.from({ length: 400 }, () => `-b:0.04_${"0.1_".repeat(600)}0.1`).join("/")}` },
  { plan: "1@0.5,0.5,0.5/1,0,0/-b:Infinity_0_0_0.1_0.1" },
  { plan: "1@0.5,0.5,0.5/1,0,0/-b:0.04_-5_-5_5_5" },
  { plan: "1@0.5,0.5,0.5/1,0,0/-b:0.04,0,0,0.1,0.1" },
  { tjukn: "tjukk" },
  { kjelde: "../../etc/passwd" },
  { kjelde: "x".repeat(400) },
  { material: "gull" },
  { lause: 99 },
  { snittveg: -3 },
  Object.fromEntries(Object.keys(PARAM_RANGES).map((k) => [k, NaN])),
]
const t0Soppel = Date.now()
for (const s of SØPPEL) {
  const q = MOTOR.clamp(s, DEFAULT_PARAMS as unknown as ParamBag) as unknown as Params
  const daarleg = Object.entries(q).filter(
    ([k, v]) => typeof v === "number" && !Number.isFinite(v as number) && k !== "list",
  )
  if (daarleg.length) feil("hash", `${JSON.stringify(s).slice(0, 40)} gav ${JSON.stringify(daarleg)}`)
  for (const k of Object.keys(PARAM_RANGES)) {
    const r = PARAM_RANGES[k]
    const v = q[k as keyof Params] as number
    if (v < r.min || v > r.max) feil("hash", `${k} hamna på ${v}, utanfor ${r.min}..${r.max}`)
  }
  if (!(q.material in { finer: 1, mdf: 1, akryl: 1, papp: 1 })) {
    feil("hash", `materialet vart «${q.material}»`)
  }
}
// Og HEILE lista skal vera lesen på under hundre millisekund. Porten er det
// som vert prøvd, og ein port som ikkje er der syner seg som TID og ikkje
// som feil: målt 10 ms med henne, 395 utan, og `MOTOR.clamp` køyrer på
// kvar einaste endring.
const tSoppel = Date.now() - t0Soppel
if (tSoppel > 100) feil("hash", `søppelet tok ${tSoppel} ms å lese`)
console.log(`  søppelet lese på ${tSoppel} ms`)

// =============================================================================
// KVAR SKYVAR MÅ RØRE NOKO
// =============================================================================
/**
 * Eit hugsa mellombygg som er nøkla på for få parametrar er den verste
 * feilen denne koden kan gjere: skyvaren rører seg, talet står stille, og
 * ingenting feilar. Det har hendt tre gonger no — sist med materialet,
 * der massen fraus på det fyrste du valde av di rutenettet var hugsa utan
 * materialet i nøkkelen og massen vart lesen ut av rutenettet.
 *
 * Difor står det her, som ei liste over kva kvar skyvar MÅ røre. Ho er
 * ikkje uttømmande, og han skal ho ikkje vera: ho dekkjer den eine
 * eigenskapen kvar parameter finst for.
 */
type Rørt = {
  k: string
  v: unknown
  les: (m: Metrics, uttak: number) => number
  /** kva objekt skyvaren har noko å seie på. Kuben har tolv trekantar og
   *  ingen lause stykke, so han kan ikkje prøve forenkling eller kasting. */
  kjelde?: string  /** og kva plan, om ikkje rutenettet */
  plan?: string
}
const RØRER: Rørt[] = [
  { k: "material", v: "papp", les: (m) => m.mass },
  { k: "tjukn", v: 6, les: (m) => m.slotW },
  { k: "plan", v: ruter(9, 9), les: (m) => m.parts },
  // TO KUBAR VED SIDA AV KVARANDRE, og ikkje oppå: `storleik` normaliserer
  // den LENGSTE sida, so ein stabel er like høg som éin kube er. Legg du dei
  // langs x, er x det lengste, og då fell høgda — det er den einaste vegen
  // scena kan syne seg i eit einaste tal.
  { k: "scene", v: "kube@0,0,0/1/0;kube@200,0,0/1/0", les: (m) => m.envZ },
  { k: "plan", v: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.5/0,0.7071,0.7071", les: (m) => m.parts },
  { k: "storleik", v: 300, les: (m) => m.envX },
  { k: "klaring", v: 0.4, les: (m) => m.slotW },
  // Mindre plate, ikkje større: standarden er 600 x 400, og kuben får
  // plass på like mange plater uansett kor mykje større ho vert.
  { k: "arkB", v: 300, les: (m) => m.sheets },
  { k: "arkH", v: 300, les: (m) => m.sheets },
  { k: "fart", v: 60, les: (m) => m.cutTime },
  { k: "glatt", v: 12, les: (m) => m.cutLen, kjelde: "v-kule" },
  { k: "trekant", v: 1, les: (m) => m.tris, kjelde: "v-kule" },
  // Eit ståande torus-ledd: eitt loddrett plan gjev to øyer, og eit lågt
  // vassrett plan gjev berre den nedste eit ledd. Den øvste er ei laus øy,
  // og det er berre ØYER «kast» tek — eit heilt plan utan ledd står.
  { k: "lause", v: 0, les: (m) => m.parts, kjelde: "v-torus", plan: "1@0.5,0.5,0.5/1,0,0;2@0.5,0.5,0.15/0,0,1" },
  { k: "snitt", v: 0.5, les: (_m, uttak) => uttak },
  { k: "snittveg", v: 1, les: (_m, uttak) => uttak },
]

console.log("\nkvar skyvar må røre noko")
{
  const grunn = { ...GRUNN, kjelde: "kube" }
  const les = (p: Params) => {
    const bag = p as unknown as ParamBag
    const m = MOTOR.measure(bag)
    // Uttaket er summen av teiknetala i profilarket: han flyttar seg når
    // snittkompensasjonen gjer det, og står stille elles.
    const svg = MOTOR.exportFile(bag, "svg").text ?? ""
    let sum = 0
    for (const t of svg.match(/-?\d+\.\d+/g) ?? []) sum += Number(t)
    return { m, uttak: sum }
  }
  for (const r of RØRER) {
    saker++
    const base = { ...grunn, ...(r.kjelde ? { kjelde: r.kjelde, rotX: 90 } : {}), ...(r.plan ? { plan: r.plan } : {}) } as Params
    const fyrst = les(base)
    const etter = les({ ...base, [r.k]: r.v } as Params)
    const a = r.les(fyrst.m, fyrst.uttak)
    const b = r.les(etter.m, etter.uttak)
    if (Math.abs(a - b) < 1e-6) {
      feil(`${r.k} = ${r.v}`, `talet står stille på ${a} — er noko hugsa på feil nøkkel?`)
    }
  }
  console.log(`  ${RØRER.length} skyvarar, alle rører sitt eige tal`)
}

// =============================================================================
// PAKKA MÅ KUNNE OPNAST
// =============================================================================
/**
 * ZIP-en er femti liner skrivne for hand, og ein ZIP med feil offset er
 * ikkje ein ZIP med ein liten feil — han er ei fil ingenting opnar. Verre:
 * han lastar ned utan eit pip, og brukaren står med ei arkivfil
 * nettlesaren nektar å pakke ut.
 *
 * Difor vert han lesen tilbake her, gjennom den sentrale katalogen slik
 * eit ekte program les han, og innhaldet samanlikna med det som gjekk inn.
 */
function lesZip(buf: ArrayBuffer): { name: string; text: string }[] {
  const b = new DataView(buf)
  const u8 = new Uint8Array(buf)
  const tekst = (fra: number, n: number) =>
    new TextDecoder().decode(u8.subarray(fra, fra + n))

  // EOCD ligg sist, med kommentaren etter seg. Han vert leita opp bakfrå.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (b.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("ingen EOCD: dette er ikkje ein ZIP")
  const tal = b.getUint16(eocd + 10, true)
  let p = b.getUint32(eocd + 16, true)

  const ut: { name: string; text: string }[] = []
  for (let i = 0; i < tal; i++) {
    if (b.getUint32(p, true) !== 0x02014b50) throw new Error(`katalogpost ${i} har feil signatur`)
    const nLen = b.getUint16(p + 28, true)
    const eLen = b.getUint16(p + 30, true)
    const kLen = b.getUint16(p + 32, true)
    const size = b.getUint32(p + 24, true)
    const lokal = b.getUint32(p + 42, true)
    const name = tekst(p + 46, nLen)
    if (b.getUint32(lokal, true) !== 0x04034b50) {
      throw new Error(`«${name}» peikar på noko som ikkje er ein lokal hovudpost`)
    }
    const lnLen = b.getUint16(lokal + 26, true)
    const leLen = b.getUint16(lokal + 28, true)
    ut.push({ name, text: tekst(lokal + 30 + lnLen + leLen, size) })
    p += 46 + nLen + eLen + kLen
  }
  return ut
}

console.log("\npakka må kunne opnast")
for (const [namn, over] of [
  ["seks små plater", { storleik: 150, arkB: 400, arkH: 300 }],
  ["seks store plater", { storleik: 400, plan: ruter(12, 9), tjukn: 6, arkB: 1200, arkH: 900 }],
] as [string, Partial<Params>][]) {
  saker++
  const o = MOTOR.exportFile({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag, "ark")
  // Éi plate er éi fil og ingen pakke. Er det fleire, MÅ det vera ei
  // pakke — kjem det ei enkelt fil då, har ei plate forsvunne.
  const ark = MOTOR.measure({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag).sheets
  if (!o.data) {
    if (ark > 1) feil(namn, `${ark} plater, men uttaket er éi enkelt fil`)
    else console.log(`  ${namn.padEnd(14)} ${ark} plate, ingen pakke`)
    continue
  }
  try {
    const filer = lesZip(o.data)
    const tomme = filer.filter((f) => !f.text.includes("<path"))
    if (!filer.length) feil(namn, "pakka er tom")
    if (tomme.length) feil(namn, `${tomme.length} filer i pakka har ingen banar`)
    for (const f of filer) {
      if (!f.text.startsWith("<svg") || !f.text.trimEnd().endsWith("</svg>")) {
        feil(namn, `«${f.name}» er ikkje eit heilt SVG-dokument`)
      }
    }
    /**
     * OG FIL NUMMER k SKAL VERA PLATE NUMMER k.
     *
     * Overskrifta her lovar at «innhaldet vert samanlikna med det som gjekk
     * inn». Det gjorde det ikkje: kvar fil vart prøvd for seg, som eit heilt
     * SVG med banar i. Seks like kopiar av plate ein hadde gått rett
     * gjennom — og den som skjer plate fire av seks ut av kopi nummer fire
     * skjer plate ein om att, med adressene til plate ein gravert på.
     */
    if (filer.length !== ark) feil(namn, `${ark} plater, ${filer.length} filer i pakka`)
    for (let i = 0; i < Math.min(filer.length, ark); i++) {
      const fasit = MOTOR.arkSyn({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag, i).svg
      if (filer[i].text !== fasit) {
        // kva plate ER det, om det ikkje er den rette?
        let er = -1
        for (let k = 0; k < ark; k++) {
          if (filer[i].text === MOTOR.arkSyn({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag, k).svg) er = k
        }
        feil(
          namn,
          `fil ${i + 1} er ${er >= 0 ? `plate ${er + 1}` : "ikkje nokon av platene"}, ikkje plate ${i + 1}`,
        )
      }
    }
    console.log(`  ${namn.padEnd(14)} ${filer.length} filer, ${o.data.byteLength} B: ${filer.map((f) => f.name).join(", ")}`)
  } catch (e) {
    feil(namn, `pakka let seg ikkje lesa: ${(e as Error).message}`)
  }
}

console.log(brot ? `\n${saker} saker, ${brot} brot` : `\n${saker} saker, ingen brot`)
process.exit(brot ? 1 : 0)
