/**
 * LEDDVAKTA — står ledda i FILA?
 *
 * Panelet seier «36 ledd». Det talet er talet på ledd reiskapen VILLE
 * skjere: det vert talt når kryssa vert funne, før ein einaste kontur er
 * lesen. Mellom det talet og plata ligg heile snittinga — sporet vert
 * skore i feltet, feltet vert lese med ei marsjerande rute, og ruta vert
 * forenkla. Kvart av dei tre stega kan miste eit spor utan å seie frå:
 * eit for grunt spor forsvinn i ein celle, eit for smalt fell for
 * forenklinga, og ein profil som ikkje nådde ned dit sporet står har
 * aldri hatt det.
 *
 * Eit tapt spor er den dyraste feilen reiskapen kan gjere. Ribba ser rett
 * ut på skjermen og i kuttfila; ho er berre eit par millimeter for heil,
 * og det oppdagar du når du står med sekstifire skorne delar og to av dei
 * ikkje går i hop.
 *
 * Difor spør denne vakta profilen sjølv, og ikkje bokføringa: for kvart
 * ledd vert det målt om det finst gods i sporet. Midt i sporet skal det
 * ikkje vera gods. Ein halv millimeter utanfor kvar sporvegg, i same
 * høgd, skal det vera gods — elles er ikkje dette eit spor, det er enden
 * av ribba.
 *
 *   npx tsx scripts/ledd.ts
 */
import { inRing, shoelace, type Pt } from "../lib/core"
import { makeBygg } from "../lib/bygg"
import { newSoup, ribSolid, soupToMesh } from "../lib/mesh"
import { DETAIL, jointsIn, stykkeLangs, type Snitt, type Ribbe as Rib, type Spor } from "../lib/snitt"
import { DEFAULT_PARAMS, type Params } from "../lib/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { lesPlan, rutenett, skrivPlan, type Strek } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

/**
 * PRØVEKROPPEN. Standarden opnar UTAN plan — reiskapen er tom til du skjer
 * — so ei vakt som måler geometri må seie kva ho måler. Seks kvar veg er
 * det same rutenettet standarden hadde før, og det same objektet.
 */
const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }


let brot = 0

/** ligg punktet i gods? Innanfor ein ytterkant, og ikkje i eit hòl. */
function gods(r: Rib, p: Pt): boolean {
  for (const o of r.outlines) {
    if (!inRing(o, p)) continue
    for (const h of r.holes) if (inRing(h, p)) return false
    return true
  }
  return false
}

/**
 * SPORET SKAL IKKJE NÅ INN I NABOSTYKKET.
 *
 * Ei søyle kan treffe kroppen fleire gonger: ein torus som står har ein
 * nedre og ein øvre boge, ein hest har eit bein under ein kropp. Sporet
 * skal gå ut gjennom sin eigen kant og stogge i lufta over eller under.
 * Når det held fram inn i stykket på andre sida av lufta, vert ribba saga
 * i to i staden for å få eit hakk, og det som fell av vert ei laus plate.
 *
 * Å skjere gjennom LUFT er greitt — der er det ingenting å skjere. Det er
 * nabostykket det ikkje har noko i å gjere.
 */
function inniNabo(r: Rib): { tal: number; verst: number } {
  let tal = 0
  let verst = 0
  for (const q of r.spor) {
    const runs = stykkeLangs(r.raa, q.p, q.d)
    const i = runs.findIndex(([lo, hi]) => q.munn >= lo - 0.6 && q.munn <= hi + 0.6)
    if (i < 0) continue
    const opp = q.munn > q.botn
    const nabo = opp ? runs[i + 1] : runs[i - 1]
    if (!nabo) continue
    const inn = opp ? q.ut - nabo[0] : nabo[1] - q.ut
    if (inn > 0.01) {
      tal++
      verst = Math.max(verst, inn)
    }
  }
  return { tal, verst }
}

/**
 * STÅR DET SAME OBJEKTET PÅ SKJERMEN SOM I FILA?
 *
 * Profilen er sanninga: han er det laseren fylgjer. Klumpen på skjermen
 * vert bygd av den same profilen, so volumet hans er gjeve på førehand —
 * arealet innanfor ytterkanten, minus hòla, gonger tjukna. Er det noko
 * anna, er det ikkje den same forma.
 *
 * Det er ikkje ein teoretisk fare. Sideveggene i eit HÒL var vende
 * baklengs: `contour` gjev hòl med motsett omløp av ytterkantar, so
 * rekkjefylgja peikar rett veg av seg sjølv, og koden snudde han ein gong
 * til. Ei ribbe i den ståande torusen kom ut på 52 386,6 mm³ der ho skulle
 * vore 33 216,3 — og STL-en hadde vrengde flater rundt kvart hòl.
 */
function volumAvvik(g: Snitt, tjukn: number): { tal: number; verst: number } {
  let tal = 0
  let verst = 0
  for (const r of g.ribber) {
    if (!r.outlines.length) continue
    const s = newSoup()
    ribSolid(s, r, tjukn)
    const pos = soupToMesh(s).positions
    let V = 0
    for (let i = 0; i < pos.length; i += 9) {
      V +=
        (pos[i] * (pos[i + 4] * pos[i + 8] - pos[i + 5] * pos[i + 7]) -
          pos[i + 1] * (pos[i + 3] * pos[i + 8] - pos[i + 5] * pos[i + 6]) +
          pos[i + 2] * (pos[i + 3] * pos[i + 7] - pos[i + 4] * pos[i + 6])) /
        6
    }
    let A = 0
    for (const o of r.outlines) {
      A += Math.abs(shoelace(o))
      for (const h of r.holes) if (inRing(o, h[0])) A -= Math.abs(shoelace(h))
    }
    const venta = A * tjukn
    if (venta < 1) continue
    const av = Math.abs(Math.abs(V) - venta) / venta
    if (av > 0.01) {
      tal++
      verst = Math.max(verst, av)
    }
  }
  return { tal, verst }
}

function sjekk(namn: string, p: Params) {
  const { s: g } = makeBygg(p, DETAIL.mid)
  let ledd = 0
  let tapt = 0
  let uteneskulder = 0
  let nabo = 0
  let naboVerst = 0

  /** punktet `t` langs sporet, `s` til sides */
  const paa = (q: Spor, t: number, s = 0): Pt => [q.p[0] + q.d[0] * t - q.d[1] * s, q.p[1] + q.d[1] * t + q.d[0] * s]
  for (const r of g.ribber) {
    const n = inniNabo(r)
    nabo += n.tal
    naboVerst = Math.max(naboVerst, n.verst)
    for (const q of r.spor) {
      // Eit spor som høyrer til eit stykke som er kasta, er ikkje eit
      // spor lenger. Det er berre bokføring frå før kastinga.
      if (!r.outlines.some((o) => jointsIn([q], o) > 0)) continue
      ledd++

      // Midt i sporet, på halve djupna. Nær munnen kan konturen framleis
      // vera i ferd med å runde inn; nær botnen kan hundebeinet ha teke
      // hjørnet. Midten er det einaste punktet som er eit spor uansett.
      const z = (q.munn + q.botn) / 2
      if (gods(r, paa(q, z))) {
        tapt++
        if (tapt <= 3) {
          console.log(
            `      plan ${r.plan.id} mot ${q.mot} t=${z.toFixed(1)}: ` +
              `gods midt i sporet (munn ${q.munn.toFixed(1)}, botn ${q.botn.toFixed(1)})`,
          )
        }
        continue
      }

      // Og gods på BEGGE sider, ein halv millimeter utanfor veggen. Utan
      // det er ikkje dette eit spor — det er enden av ribba, eller ei
      // kløft som alt var der.
      //
      // Talet vart rekna og skrive, og so kasta: det stod i lina, men
      // ikkje i `ok`. Ei ribbe kunne mist skuldra på kvart einaste spor
      // og skriptet ville framleis sagt at alle ledd står. Eit spor utan
      // skulder er eit spor som ikkje held noko — den kryssande ribba sig
      // rett gjennom — og det er nett det harnesset er her for.
      const ut = q.w / 2 + 0.5
      if (!gods(r, paa(q, z, -ut)) || !gods(r, paa(q, z, ut))) {
        uteneskulder++
        if (uteneskulder <= 3) {
          console.log(
            `      plan ${r.plan.id} mot ${q.mot} t=${z.toFixed(1)}: ` +
              `ingen skulder ${ut.toFixed(1)} mm ut på ` +
              `${!gods(r, paa(q, z, -ut)) ? "venstre" : "høgre"} sida`,
          )
        }
      }
    }
  }

  // GODSET ER EI LENGD, OG EI LENGD ER IKKJE NEGATIV.
  //
  // «Minste gods» er det tynnaste som står att i eit ledd, og panelet
  // vrakar heile modellen på det talet. Det vart lese ved å slå opp
  // stykket sporet står i, og oppslaget gjekk på MUNNEN — som ligg på
  // kanten mellom to stykke når ein kropp står på bein. Då fann han
  // stykket under, og trekte frå feil veg: firbeint kom ut på −22,4 mm,
  // den harde regelen rauk, og «finn innstillingar» gav null kandidatar
  // på ein modell det ikkje var noko gale med.
  //
  // Talet er ikkje til å gjette på fortegnet til. Står det negativt, er
  // det ikkje ei tynn ribbe — det er ei måling som har spegla seg.
  let godsVerst = Infinity
  for (const r of g.ribber) if (r.spor.length) godsVerst = Math.min(godsVerst, r.narrow)
  const godsOk = !Number.isFinite(godsVerst) || godsVerst > 0

  const vol = volumAvvik(g, p.tjukn)

  const ok = tapt === 0 && uteneskulder === 0 && nabo === 0 && godsOk && vol.tal === 0
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(ledd).padStart(4)} ledd i profilane · ` +
      `${tapt} tapte · ${uteneskulder} utan gods på begge sider · ` +
      `${nabo} inn i nabostykket${nabo ? ` (verst ${naboVerst.toFixed(1)} mm)` : ""}` +
      `${godsOk ? "" : ` · GODS ${godsVerst.toFixed(1)} mm`}` +
      `${vol.tal ? ` · VOLUM ${vol.tal} ribber, verst ${(vol.verst * 100).toFixed(0)} %` : ""}`,
  )
}

// =============================================================================
// SAKENE
// =============================================================================
function kule(r: number, seg: number, strekk = 1) {
  const pos: number[] = []
  const at = (i: number, j: number): [number, number, number] => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / seg) * Math.PI
    return [
      r * Math.sin(ph) * Math.cos(th),
      r * Math.sin(ph) * Math.sin(th),
      r * Math.cos(ph) * strekk,
    ]
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

/**
 * Ein kropp på fire bein. Poenget er ikkje at han liknar ein hest, men at
 * ei loddrett søyle gjennom eit bein treffer kroppen ein gong til lenger
 * oppe, med luft imellom — og det er nett den forma sporet kan sage seg
 * gjennom.
 */
function firbeint() {
  const out: number[] = []
  const boks = (w: number, d: number, h: number, ox: number, oy: number, oz: number) => {
    const p: [number, number, number][] = [
      [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
      [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h],
    ]
    const f = [
      [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
    ]
    for (const [a, b, c] of f) out.push(...p[a], ...p[b], ...p[c])
  }
  for (const [x, y] of [[-40, -18], [22, -18], [-40, 8], [22, 8]]) boks(18, 10, 60, x, y, 0)
  boks(100, 40, 40, -50, -20, 60)
  boks(26, 24, 46, 44, -12, 88)
  return makeSoup(new Float32Array(out))
}

put("kule", "kule", kule(50, 40))
put("firbeint", "firbeint", firbeint())
put("egg", "egg", kule(50, 40, 1.6))
put("torus", "torus", torus(50, 18, 48, 24))

/** eit merke lagt i eit namngjeve plan: gjennom lesinga, so strengen er den vakta ser */
const medStrek = (plan: string, id: number, st: Strek) =>
  skrivPlan(lesPlan(plan).map((q) => (q.id === id ? { ...q, strek: [...q.strek, st] } : q)))

const SAKER: [string, Partial<Params>][] = [
  ["kube, standard", {}],
  ["kube, 32 plan kvar veg", { plan: nett(32, 32) }],
  ["kube, skrå plan", { plan: "1@0.3,0.5,0.5/1,0,0;2@0.7,0.5,0.5/1,0,0;3@0.5,0.5,0.5/0,0.7071,0.7071;4@0.5,0.5,0.25/0,0.7071,0.7071" }],
  ["kube, eitt plan kvar veg", { plan: nett(1, 1) }],
  ["kube, tjukk plate", { tjukn: 12, storleik: 400 }],
  ["kube, leddet høgt", { ledd: 0.8 }],
  ["kube, leddet lågt", { ledd: 0.2 }],
  ["kube, vend", { rotX: 30, rotY: 20, rotZ: 10 }],
  ["kule", { kjelde: "kule" }],
  ["kule, 16 ribber", { kjelde: "kule", plan: nett(16, 16) }],
  ["egg", { kjelde: "egg" }],
  ["torus ståande", { kjelde: "torus", rotX: 90 }],
  ["torus, lause med", { kjelde: "torus", rotX: 90, lause: 0 }],
  ["firbeint", { kjelde: "firbeint", lause: 0 }],
  ["firbeint, 10 ribber", { kjelde: "firbeint", plan: nett(10, 10), lause: 0 }],
  ["firbeint, tjukk plate", { kjelde: "firbeint", tjukn: 6, storleik: 300, lause: 0 }],
  ["kule, tett og tynt", { kjelde: "kule", plan: nett(24, 24), tjukn: 1 }],
  // STREK HANDA HAR SETT. Eit hòl tvers over ei plate deler henne, og eit
  // gods legg til material der nettet ikkje gav noko — begge endrar kva som
  // står att kring spora, og det er nett det denne vakta måler.
  ["kube, strek i to plan", {
    plan: medStrek(medStrek(nett(4, 4), 2, { slag: "hol", form: "rekt", x: 0, y: -0.32, w: 0.45, h: 0.04, a: 0 }),
      6, { slag: "gods", form: "rekt", x: 0, y: 0.42, w: 0.4, h: 0.06, a: 0 }),
  }],
  ["kule, strek tvers over ei plate", {
    kjelde: "kule",
    plan: medStrek(nett(6, 6), 3, { slag: "hol", form: "rekt", x: 0, y: 0.1, w: 1.2, h: 0.04, a: 0 }),
  }],
]

for (const [namn, over] of SAKER) sjekk(namn, { ...DEFAULT_PARAMS, ...over })

console.log(brot ? `\n${brot} brot` : "\nalle ledd står i profilane")
process.exit(brot ? 1 : 0)
