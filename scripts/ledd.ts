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
import { inRing, shoelace, type Pt, type Vec3 } from "../lib/core"
import { makeBygg } from "../lib/bygg"
import { newSoup, ribSolid, soupToMesh } from "../lib/mesh"
import { DETAIL, jointsIn, sporPunkt, stykkeLangs, tappIn, type Snitt, type Ribbe as Rib, type Spor } from "../lib/snitt"
import { DEFAULT_PARAMS, leddNokkel, type Params } from "../lib/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { ein2, lesPlan, rutenett, skrivPlan, ut, type Strek } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

/**
 * EIT NETT DER DEN EINE FAMILIEN ER BØYGD.
 *
 * Ei bøygd flate er ein sylinder med aksen langs `v`, og for eit plan med
 * normalen langs x er `v` loddrett. Y-familien har normalen sin vassrett og
 * ligg difor PARALLELT med den aksen — og eit plan langs aksen skjer
 * sylinderen i generatorlinene hans, som er rette både i rommet og utbretta.
 * Det er «krumt skal med flate ribber på tvers», og det er tilfellet steg
 * éin av dei bøygde ledda dekkjer.
 */
const bogNett = (nx: number, ny: number, bog: number) =>
  skrivPlan(rutenett(nx, ny).map((q) => (q.n[0] === 1 ? { ...q, bog } : q)))

/**
 * OG DET SAME MED GOLV I.
 *
 * Steg to: eit flatt plan VINKELRETT på sylinderaksen møter flata i ein
 * SIRKEL med sylinderradien. Sporet på den bøygde delen er ei rett line i
 * det utbretta mønsteret — `u` er buelengd — medan sporet i golvet er ein
 * BOGE. Det er den eine staden i huset ei sporline ikkje er rett, og difor
 * den eine saka denne vakta ikkje kunne sjå før.
 */
const bogGolv = (nx: number, ny: number, bog: number, golv: readonly number[]) =>
  skrivPlan([
    ...lesPlan(bogNett(nx, ny, bog)),
    ...golv.map((z, i) => ({ id: 90 + i, o: [0.5, 0.5, z] as [number, number, number], n: [0, 0, 1] as [number, number, number], bog: 0, strek: [] })),
  ])

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
    const runs = stykkeLangs(r.raa, q.p, q.d, q.k)
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
    // ei bøygd ribbe er ei fasettert skål i nettet: volumet hennar er
    // biletet sitt og ikkje kuttet sitt — kuttet er flatt og vert målt over
    if (!r.outlines.length || r.r.k) continue
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

function sjekk(namn: string, p: Params): number {
  const { s: g } = makeBygg(p, DETAIL.mid)
  let ledd = 0
  let tapt = 0
  let uteneskulder = 0
  let nabo = 0
  let naboVerst = 0

  /** punktet `t` langs sporet, `s` til sides — og sporet kan vera ein BOGE */
  const paa = (q: Spor, t: number, s = 0): Pt => sporPunkt(q, t, s)
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

  /**
   * NUMMERET I NØKKELEN TEL LEDD, IKKJE FORSØK.
   *
   * Tredje feltet i ein leddnøkkel er kva møte på kryssingslina det er, og
   * `snitt.ts` seier i sin eigen kommentar at det er talt over dei som VART
   * LEDD. Det er handa si adresse: `deling` skriv «5-12-1:0.35», og hoppar
   * nummeret over eit møte som fall på skuldra, landar brøken på eit anna
   * ledd enn det du stilte — eitt spor djupt og makkeren grunn, som er nett
   * det den delte nøkkelen finst for å hindre.
   *
   * So numra på kvar kryssingsline skal vera 0, 1, 2 … utan hopp. Prøva er
   * billeg og fangar heile klassen; ho stod ikkje her før, og det er difor
   * teljinga kunne stå på feil side av to prøver utan at nokon såg det.
   */
  const liner = new Map<string, number[]>()
  for (const r of g.ribber) {
    for (const q of r.spor) {
      if (!r.outlines.some((o) => jointsIn([q], o) > 0)) continue
      const i = q.nokkel.lastIndexOf("-")
      const line = q.nokkel.slice(0, i)
      const nr = Number(q.nokkel.slice(i + 1))
      const a = liner.get(line) ?? []
      if (!a.includes(nr)) a.push(nr)
      liner.set(line, a)
    }
  }
  let hopp = 0
  for (const [line, nr] of liner) {
    nr.sort((a, b) => a - b)
    if (nr.some((v, i) => v !== i)) {
      hopp++
      if (hopp <= 3) console.log(`      kryssingslina ${line}: nummer ${nr.join(",")} — ikkje 0..${nr.length - 1}`)
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

  /**
   * OG DEI TO SIDENE AV EIT LEDD SKAL VERA DET SAME LEDDET.
   *
   * Alt over prøver kvar ribbe FOR SEG: at sporet står i profilen, at det er
   * gods på begge sider, at det ikkje går inn i nabostykket. Ingenting av det
   * spør om det andre sporet — og eit ledd er to spor som skal møtast.
   *
   * Påstanden ligg i `Spor`: «buelengd er òg det som gjer at dei to sidene av
   * eit ledd kan lesa det same talet». Han vert prøvd slik: botnen på kvar
   * side, ført ut i ROMMET gjennom kvar si ramme. To tal som tyder det same
   * skal gje det same punktet.
   *
   * DET ER HER EIT BØYGT LEDD KAN RYKE UTAN AT NOKO ANNA SEIER FRÅ. På flate
   * plan er lengd lengd og påstanden er triviell. På ei bøygd flate er `u`
   * BUELENGD, og at han framleis tyder det same på den andre sida av leddet
   * er ei rekning — ikkje ein definisjon. Går ho gale, kjem begge delane ut
   * med spor som ser rette ut kvar for seg, og møtest ikkje i verkstaden.
   *
   * Og `t` — kvar i overlappet botnen står — skal vera det same talet på båe
   * sidene. Det er det som gjer at eit djupare spor i den eine er eit
   * grunnare i den andre, utan at nokon reknar det om.
   */
  const par = new Map<string, { r: Rib; q: Spor }[]>()
  for (const r of g.ribber) {
    for (const q of r.spor) {
      if (!r.outlines.some((o) => jointsIn([q], o) > 0)) continue
      const l = par.get(q.nokkel)
      if (l) l.push({ r, q })
      else par.set(q.nokkel, [{ r, q }])
    }
  }
  let motVerst = 0
  let motUlikT = 0
  let motTal = 0
  for (const [, sider] of par) {
    if (sider.length !== 2) continue
    const [A, B] = sider
    const pa = ut(A.r.r, paa(A.q, A.q.botn))
    const pb = ut(B.r.r, paa(B.q, B.q.botn))
    motVerst = Math.max(motVerst, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]))
    const ta = (A.q.botn - A.q.lo) / (A.q.hi - A.q.lo || 1)
    const tb = (B.q.botn - B.q.lo) / (B.q.hi - B.q.lo || 1)
    if (Math.abs(ta - tb) > 1e-9) motUlikT++
    motTal++
  }
  // ein tidels snittbreidd: under det maskina kan halde, og fire storleiksordenar
  // over det rekninga faktisk kjem ut på (1,6e−6 mm på eit bøygt skal)
  const motOk = motVerst < 0.02 && motUlikT === 0

  const ok = tapt === 0 && uteneskulder === 0 && nabo === 0 && godsOk && vol.tal === 0 && hopp === 0 && motOk
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(ledd).padStart(4)} ledd i profilane · ` +
      `${tapt} tapte · ${uteneskulder} utan gods på begge sider · ` +
      `${nabo} inn i nabostykket${nabo ? ` (verst ${naboVerst.toFixed(1)} mm)` : ""}` +
      `${godsOk ? "" : ` · GODS ${godsVerst.toFixed(1)} mm`}` +
      `${vol.tal ? ` · VOLUM ${vol.tal} ribber, verst ${(vol.verst * 100).toFixed(0)} %` : ""}` +
      `${motOk ? ` · ${motTal} par møtest` : ` · PAR ${motVerst.toFixed(3)} mm frå kvarandre, ${motUlikT} med ulik t`}` +
      `${hopp ? ` · HOPP i nummereringa på ${hopp} kryssingsliner` : ""}` +
      `${g.avvist ? ` · ${g.avvist} avviste av skuldra` : ""}`,
  )
  return g.avvist
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
  // DELINGA SETT MED HANDA på eitt ledd: spora flyttar seg, og vakta krev
  // at dei framleis står i profilane og møtest der dei skal.
  ["kube, eitt ledd delt for hand", {
    plan: nett(4, 4),
    deling: [leddNokkel(1, 5, 0), 0.72].join(":") + ";" + [leddNokkel(2, 6, 0), 0.28].join(":"),
  }],
  // BØYGDE LEDD, STEG EIN: ein sylinder kryssa av flate plan som ligg langs
  // aksen hans. Møtet er ein generator — rett i rommet OG utbretta — so
  // spora skal stå i profilane som alle andre.
  ["kube, x-familien bøygd", { plan: bogNett(4, 4, 0.3) }],
  ["kule, x-familien bøygd", { kjelde: "kule", plan: bogNett(4, 4, 0.25) }],
  ["kule, x-familien bøygd, tett", { kjelde: "kule", plan: bogNett(8, 8, 0.2) }],
  /**
   * BØYGDE LEDD, STEG TO: sylindrar med GOLV på tvers av aksen.
   *
   * Møtet er ein sirkelboge, og sporet i golvet fylgjer han. Vakta måler
   * luft midt i sporet og gods ein halv millimeter utanfor kvar vegg — og
   * ho gjer det langs BOGEN, so eit spor som stod att som ei KORDE ville
   * slått ut med gods midt i sporet. Det er prøva på at bogen er rekna og
   * ikkje rett ut.
   *
   * TO FAMILIAR OG IKKJE TRE. Eit rutenett med x, y OG golv er noko anna
   * enn eit bøyespørsmål: tre familiar halvved-spor som kryssar kvarandre
   * sagar kvar ribbe i lause øyer, av di kvart spor går til midten og to
   * spor som kryssar der tek godset to gonger. Det gjer dei like mykje
   * FLATT som bøygt — målt, med det same settet og `bog: 0`: 32 av 64 ledd
   * utan skulder, båe vegar. Det er den saka `orden`, `klem` og delinga er
   * til for, og ho høyrer ikkje heime i ei prøve på om ein boge er rekna
   * rett.
   */
  ["kube, bøygd med to golv", { plan: bogGolv(4, 0, 0.3, [0.35, 0.65]) }],
  ["kule, bøygd med tre golv", { kjelde: "kule", plan: bogGolv(4, 0, 0.25, [0.3, 0.5, 0.7]) }],
  ["egg, bøygd med golv, tjukk plate", { kjelde: "egg", plan: bogGolv(3, 0, 0.4, [0.4, 0.6]), tjukn: 12, storleik: 400 }],

  ["kule, strek tvers over ei plate", {
    kjelde: "kule",
    plan: medStrek(nett(6, 6), 3, { slag: "hol", form: "rekt", x: 0, y: 0.1, w: 1.2, h: 0.04, a: 0 }),
  }],
]

let avvistIAlt = 0
for (const [namn, over] of SAKER) avvistIAlt += sjekk(namn, { ...GRUNN, ...over })

// =============================================================================
// TAPP OG SLISSE
// =============================================================================
/**
 * DEI SAME SPØRSMÅLA TIL EIT MØTE DER EIN KANT SLUTTAR MOT EI FLATE.
 *
 * Tavla tel tappar når dei vert lagde ut; profilen er det laseren fylgjer.
 * For kvar tapp: gods midt i tappen og like innanfor tuppen, luft like
 * forbi tuppen og like ved sida av han — elles er kanten ikkje klipt ved
 * skuldra, og plata står i setet. For kvar slisse: luft midt i, gods på
 * alle fire sider. Og dei to skal vera same staden i rommet: tappen sin
 * midt, lagd ut gjennom si ramme, er slissa sin midt lagd ut gjennom si.
 */
function sjekkTapp(namn: string, p: Params, venta: { tappar: number; brot?: number }): void {
  const { s: g } = makeBygg(p, DETAIL.mid)
  let feil = 0
  const seg = (m: string) => {
    feil++
    if (feil <= 4) console.log(`      ${m}`)
  }
  const par = new Map<string, Vec3[]>()
  let tappar = 0
  for (const r of g.ribber) {
    for (const q of r.tapp) {
      if (!r.outlines.some((o) => tappIn([q], o).length)) continue
      const [h0, h1, h2] = q.hjorne
      const langs = ein2(h1, h0)
      const tvers = ein2(h2, h1)
      const L = q.boge ? q.boge.t1 - q.boge.t0 : Math.hypot(h1[0] - h0[0], h1[1] - h0[1])
      const W = q.boge ? Math.abs(q.boge.s1 - q.boge.s0) : Math.hypot(h2[0] - h1[0], h2[1] - h1[1])
      // langs ein boge: `a` er buelengd frå starten, `b` er avstand frå den fyrste sida
      const bg = q.boge
      const pk = (a: number, b: number): Pt => (bg ? sporPunkt(bg, bg.t0 + a, bg.s0 + Math.sign(bg.s1 - bg.s0) * b) : [h0[0] + langs[0] * a + tvers[0] * b, h0[1] + langs[1] * a + tvers[1] * b])
      if (q.slag === "tapp") {
        tappar++
        if (!gods(r, pk(L / 2, q.kile ? MOBEL.tjukn - 1 : W / 2))) seg(`${q.nokkel}: tappen manglar i profilen til ${r.plan.id}`)
        // kilen: hòlet står like innanfor den fjerne flata, og det står gods utanfor det
        if (q.kile) {
          const tb2 = MOBEL.tjukn / 2
          if (gods(r, pk(L / 2, 2 * tb2 - 0.5 + q.kile.w / 2))) seg(`${q.nokkel}: kilehòlet manglar`)
          if (gods(r, pk(L / 2 - MOBEL.tjukn, 2 * tb2 - 0.5 + q.kile.w / 2)) === false) seg(`${q.nokkel}: kilehòlet er for langt langs tappen`)
          if (!gods(r, pk(L / 2, 2 * tb2 - 0.5 + q.kile.w + MOBEL.tjukn * 0.9))) seg(`${q.nokkel}: for lite gods utanfor kilehòlet`)
        }
        if (!gods(r, pk(L / 2, W - 0.3))) seg(`${q.nokkel}: tappen når ikkje fram til den fjerne flata`)
        // eit stag som går gjennom held fram forbi flata — det er heile poenget
        if (!/^[gs]/.test(q.nokkel) && gods(r, pk(L / 2, W + 0.3))) seg(`${q.nokkel}: tappen stikk ut forbi den fjerne flata`)
        for (const a of [-0.4, L + 0.4]) if (gods(r, pk(a, W / 2))) seg(`${q.nokkel}: kanten ved tappen er ikkje klipt ved skuldra`)
        if (!q.nokkel.startsWith("g") && !gods(r, pk(L / 2, -0.3))) seg(`${q.nokkel}: tappen heng ikkje i plata`)
      } else {
        if (gods(r, pk(L / 2, W / 2))) seg(`${q.nokkel}: slissa manglar i ${r.plan.id}`)
        for (const [a, b] of [[L / 2, -0.4], [L / 2, W + 0.4], [-0.4, W / 2], [L + 0.4, W / 2]]) {
          if (!gods(r, pk(a, b))) seg(`${q.nokkel}: ingen vegg kring slissa i ${r.plan.id}`)
        }
      }
      const l = par.get(q.nokkel) ?? []
      l.push(ut(r.r, q.midt))
      par.set(q.nokkel, l)
    }
  }
  let verst = 0
  for (const [nk, l] of par) {
    // ein finger i eit hjørne har ingen makker: han fyller hakket i den andre
    if (nk.startsWith("f") || nk.startsWith("s")) {
      if (l.length !== 1) seg(`${nk}: ${l.length} fingrar med same namn`)
      continue
    }
    if (l.length !== 2) seg(`${nk}: ${l.length} sider og ikkje to`)
    else verst = Math.max(verst, Math.hypot(l[0][0] - l[1][0], l[0][1] - l[1][1], l[0][2] - l[1][2]))
  }
  if (verst > 0.02) seg(`tapp og slisse ${verst.toFixed(3)} mm frå kvarandre`)
  if (tappar !== g.tappar || tappar !== venta.tappar) seg(`${tappar} tappar i profilane, ${g.tappar} talde, ${venta.tappar} venta`)
  if (venta.brot !== undefined && g.montering.brot.length !== venta.brot) seg(`${g.montering.brot.length} står fast, ${venta.brot} venta`)
  const vol = volumAvvik(g, p.tjukn)
  if (vol.tal) seg(`volum: ${vol.tal} ribber, verst ${(vol.verst * 100).toFixed(0)} %`)
  if (g.montering.klem.length) seg(`${g.montering.klem.length} par står i kvarandre`)
  if (feil) brot++
  console.log(`${feil ? "FEIL" : "  ok "}  ${namn.padEnd(26)} ${String(tappar).padStart(4)} tappar i profilane · ${par.size} par møtest, verst ${verst.toFixed(4)} mm`)
}

/**
 * KRAKKEN FRÅ REFERANSEBILETET: to sider med ein fot i kvar ende, eit sete
 * oppå, tre stag imellom. Alt er teikna omriss i brøk av 450 mm, med
 * sidene i rekkjefylgja folk set dei saman — side, stag, side, sete.
 */
const S = 450
const bf = (mm: number) => +(mm / S).toFixed(4)
const plate = (id: number, o: [number, number, number], n: [number, number, number], pts: [number, number][]) =>
  ({ id, o, n, bog: 0, strek: [], omriss: pts.map(([a, c]) => [bf(a), bf(c)] as Pt) })
const side = (topp = 438, fot = 190, tak = 150): [number, number][] =>
  [[-tak, topp - 225], [tak, topp - 225], [fot, -225], [60, -225], [0, -120], [-60, -225], [-fot, -225]]
const stag = (z0: number, z1: number, y = 150): [number, number][] => [[-y, z0 - 225], [y, z0 - 225], [y, z1 - 225], [-y, z1 - 225]]
const firkant = (h: number, b = h): [number, number][] => [[-b, -h], [b, -h], [b, h], [-b, h]]
const krakk = (o: { setaZ?: number; stagY?: number; sideTopp?: number; sete?: number } = {}) =>
  skrivPlan([
    plate(1, [0.5, (225 - 150) / S, 0.5], [0, 1, 0], side(o.sideTopp)),
    plate(4, [(225 + 120) / S, 0.5, 0.5], [1, 0, 0], stag(80, 130, o.stagY)),
    plate(5, [(225 - 120) / S, 0.5, 0.5], [1, 0, 0], stag(80, 130, o.stagY)),
    plate(6, [(225 + 120) / S, 0.5, 0.5], [1, 0, 0], stag(380, 430, o.stagY)),
    plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], side(o.sideTopp)),
    plate(3, [0.5, 0.5, (o.setaZ ?? 444) / S], [0, 0, 1], firkant(175, o.sete ?? 175)),
  ])
const MOBEL = { ...DEFAULT_PARAMS, storleik: S, tjukn: 12, skal: false, arkB: 1000, arkH: 1000 }
sjekkTapp("krakk, tappar og stag", { ...MOBEL, plan: krakk() }, { tappar: 10, brot: 0 })
// setet tre millimeter for høgt: kanten vert løfta opp til flata
sjekkTapp("krakk, setet over sidene", { ...MOBEL, plan: krakk({ setaZ: 447 }) }, { tappar: 10, brot: 0 })
// staga teikna til ytterflata på sidene: kanten vert retta til skuldra
sjekkTapp("krakk, staga for lange", { ...MOBEL, plan: krakk({ stagY: 156 }) }, { tappar: 10, brot: 0 })
// setet smalare enn toppen på sidene: tappane står der setet er
sjekkTapp("krakk, smalt sete", { ...MOBEL, plan: krakk({ sete: 110 }) }, { tappar: 8, brot: 0 })
// i tre millimeter: modellen på bordet før møbelet
sjekkTapp("krakk, 3 mm modell", { ...MOBEL, tjukn: 3, plan: krakk({ setaZ: 439.5 }) }, { tappar: 10, brot: 0 })
// i LISTEREKKJEFYLGJA ein teiknar — sider, sete, stag — går lista ikkje
// opp: staga står fast mellom to sider. Motoren les då ei anna rekkjefylgje
// av dei same vegane, og ho er side, stag, side, sete.
{
  const p = { ...MOBEL, plan: skrivPlan([1, 2, 3, 4, 5, 6].map((id) => lesPlan(krakk()).find((q) => q.id === id)!)) }
  sjekkTapp("krakk, teikna rekkjefylgje", p, { tappar: 10, brot: 0 })
  const orden = makeBygg(p, DETAIL.mid).s.montering.orden.join(",")
  if (orden !== "1,4,5,6,2,3") {
    brot++
    console.log(`FEIL  krakk, rekkjefylgja       ${orden}, venta 1,4,5,6,2,3`)
  }
}
/**
 * SKRÅ BEIN: sidene lener ti grader innover, og tappen går skrått gjennom
 * setet. Slissa må vera breiare enn plata — ho ser tappen på to stader —
 * og vakta krev framleis at tapp og slisse er same staden.
 */
{
  const v = (10 * Math.PI) / 180
  // sidene lener INN: toppen står nærare midten enn foten, og den skrå
  // høgda er lengre enn den loddrette
  const topp = 225 + 213 / Math.cos(v)
  // SETET FYRST: tappane på dei to sidene peikar tjue grader frå
  // kvarandre, so setet kan ikkje trykkjast ned på båe. Snudd, går kvar
  // side inn langs sin eigen tapp — og det er rekkjefylgja vakta krev.
  const skraa = skrivPlan([
    plate(3, [0.5, 0.5, 444 / S], [0, 0, 1], firkant(175, 200)),
    plate(1, [0.5, (225 - 150) / S, 0.5], [0, Math.cos(v), -Math.sin(v)], side(topp)),
    plate(2, [0.5, (225 + 150) / S, 0.5], [0, Math.cos(v), Math.sin(v)], side(topp)),
  ].map((q) => ({ ...q, n: q.n.map((c) => +c.toFixed(4)) as [number, number, number] })))
  sjekkTapp("krakk, skrå sider", { ...MOBEL, plan: skraa }, { tappar: 4, brot: 0 })
  // og i den rekkjefylgja ein teiknar dei: sidene fyrst
  const snudd = skrivPlan([...lesPlan(skraa).slice(1), lesPlan(skraa)[0]])
  sjekkTapp("krakk, skrå sider, sete sist", { ...MOBEL, plan: snudd }, { tappar: 4, brot: 0 })
}
/**
 * KRYSSBEIN: to sider som går gjennom kvarandre, halvt om halvt, og eit
 * sete oppå båe. Dei to slaga møte i det same objektet, og ingen av dei
 * skal ta det andre.
 */
{
  const x = skrivPlan([
    plate(1, [0.5, 0.5, 0.5], [0, 1, 0], [[-180, 213], [180, 213], [180, -225], [-180, -225]]),
    plate(2, [0.5, 0.5, 0.5], [1, 0, 0], [[-180, 213], [180, 213], [180, -225], [-180, -225]]),
    plate(3, [0.5, 0.5, 444 / S], [0, 0, 1], firkant(200)),
  ])
  const { s: g } = makeBygg({ ...MOBEL, plan: x }, DETAIL.mid)
  const halvt = g.ledd - g.tappar
  if (halvt !== 1) {
    brot++
    console.log(`FEIL  kryssbein                  ${halvt} halvt-om-halvt, 1 venta`)
  }
  sjekkTapp("kryssbein med sete", { ...MOBEL, plan: x }, { tappar: 4, brot: 0 })

  sjekk("kryssbein, spora", { ...MOBEL, plan: x })
}
/**
 * BUNDE AV NETTET: eit omriss dobbelt so stort som kuben gjev kuben sitt
 * snitt med merket, og omrisset utan.
 */
{
  const stort = (nett: boolean) => skrivPlan([{ id: 1, o: [0.5, 0.5, 0.5], n: [1, 0, 0], bog: 0, strek: [], omriss: [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]], ...(nett ? { nett: true as const } : {}) }])
  const areal = (nett: boolean) => { const { s: g } = makeBygg({ ...MOBEL, plan: stort(nett) }, DETAIL.mid); return g.ribber[0].outlines.reduce((a, o) => a + Math.abs(shoelace(o)), 0) }
  const fri = areal(false), bunde = areal(true)
  const venta = S * S
  if (Math.abs(fri - (1.6 * S) ** 2) > 0.01 * fri || Math.abs(bunde - venta) > 0.02 * venta) {
    brot++
    console.log(`FEIL  bunde av nettet              fritt ${fri.toFixed(0)} mm², bunde ${bunde.toFixed(0)} mm², venta ${venta}`)
  } else console.log(`  ok   bunde av nettet            fritt ${(fri / 1e6).toFixed(3)} m², bunde ${(bunde / 1e6).toFixed(3)} m² (kuben ${(venta / 1e6).toFixed(3)})`)
}
/**
 * LAMELLANE: sju ribber og eit stag gjennom alle. Ribbene får eit lukka hòl
 * kvar, staget ingen spor — og ingen ribbe vert skoren frå kanten.
 */
{
  const rib: [number, number][] = [[-200, -225], [200, -225], [200, 0], [-100, 50], [-150, 200], [-200, 200]]
  const l = [
    ...Array.from({ length: 7 }, (_, i) => plate(i + 1, [(225 - 150 + i * 50) / S, 0.5, 0.5], [1, 0, 0], rib)),
    plate(8, [0.5, 0.5, 100 / S], [0, 0, 1], firkant(15, 190)),
  ]
  const plan = skrivPlan(l)
  sjekkTapp("lameller med stag gjennom", { ...MOBEL, plan }, { tappar: 7, brot: 0 })
  const { s: g } = makeBygg({ ...MOBEL, plan }, DETAIL.mid)
  const kanalar = g.ribber.reduce((n, r) => n + r.spor.length, 0)
  const hol = g.ribber.filter((r) => r.plan.id <= 7).every((r) => r.holes.length === 1)
  if (kanalar || !hol) {
    brot++
    console.log(`FEIL  lameller                    ${kanalar} spor frå kanten, hòl i alle: ${hol}`)
  }
}
/**
 * KASSA: fire sider som endar i flukt med utsida av kvarandre, og eit sete
 * i flukt oppå. Kvart hjørne er fingrar, og ingen hjørnekube har to eigarar.
 */
{
  const W = 170
  const s4 = (id: number, o: [number, number, number], n: [number, number, number]) => plate(id, o, n, firkant(0, W + 6).map(([a], i): [number, number] => [a, i < 2 ? 175 : -225]))
  const kasse = skrivPlan([
    s4(1, [0.5, (225 - W) / S, 0.5], [0, -1, 0]),
    s4(2, [(225 + W) / S, 0.5, 0.5], [1, 0, 0]),
    s4(3, [0.5, (225 + W) / S, 0.5], [0, 1, 0]),
    s4(4, [(225 - W) / S, 0.5, 0.5], [-1, 0, 0]),
    plate(5, [0.5, 0.5, 406 / S], [0, 0, 1], firkant(W + 6)),
  ])
  sjekkTapp("kasse med fingrar", { ...MOBEL, plan: kasse }, { tappar: 40, brot: 0 })
}
/**
 * SADELSETET: ei bøygd plate som endar i to flate sider. Møtet er ei
 * generatorline — rett i båe — og tappane går langs tangenten der ho er.
 */
{
  const R = 400
  const sider: [number, number][] = [[-170, 245], [170, 245], [190, -225], [-190, -225]]
  const sadel = (L: number) => skrivPlan([
    { ...plate(1, [(225 - 150) / S, 0.5, 0.5], [-1, 0, 0], sider) },
    { ...plate(2, [(225 + 150) / S, 0.5, 0.5], [1, 0, 0], sider) },
    { ...plate(3, [0.5, 0.5, 400 / S], [0, 0, 1], firkant(120, L)), bog: +(S / R).toFixed(4) },
  ])
  sjekkTapp("sadelsete i flukt", { ...MOBEL, plan: sadel(160) }, { tappar: 4 })
  sjekkTapp("sadelsete, tappar ut", { ...MOBEL, plan: sadel(172) }, { tappar: 4 })
}
/**
 * SETET SOM BØYER SEG MELLOM SIDENE: aksen står vinkelrett på sidene, so
 * møtet er ein boge i sida og ei rett line i setet. Slissene fylgjer bogen.
 */
{
  const sider: [number, number][] = [[-200, -225], [200, -225], [200, 175], [-200, 175]]
  for (const [namn, y] of [["bogesete i flukt", 156], ["bogesete, tappar ut", 170]] as const) {
    const plan = skrivPlan([
      plate(1, [0.5, (225 - 150) / S, 0.5], [0, -1, 0], sider),
      plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], sider),
      { ...plate(3, [0.5, 0.5, 300 / S], [0, 0, 1], firkant(y, 150)), bog: +(S / 400).toFixed(4) },
    ])
    sjekkTapp(namn, { ...MOBEL, plan }, { tappar: 4 })
  }
}
/**
 * DET DELTE SETET: to halvdelar i same plan, kant i kant. Fingrane går
 * annakvar veg; kvar finger er gods i si plate og hòl i den andre, og ingen
 * punkt er gods i båe — òg når den eine halvdelen har snudd normal.
 */
{
  const sider: [number, number][] = [[-150, -225], [150, -225], [150, 213], [-150, 213]]
  for (const snu of [false, true]) {
    const halv = (y0: number, y1: number, sp = 1): [number, number][] => [[-175 * sp, y0], [175 * sp, y0], [175 * sp, y1], [-175 * sp, y1]]
    const plan = skrivPlan([
      plate(1, [0.5, (225 - 150) / S, 0.5], [0, -1, 0], sider),
      plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], sider),
      plate(3, [0.5, 0.5, 444 / S], [0, 0, 1], halv(-175, 0)),
      snu ? plate(4, [0.5, 0.5, 444 / S], [0, 0, -1], halv(0, 175, -1)) : plate(4, [0.5, 0.5, 444 / S], [0, 0, 1], halv(0, 175)),
    ])
    const namn = snu ? "delt sete, snudd halvdel" : "delt sete med fingrar"
    const { s: g } = makeBygg({ ...MOBEL, plan }, DETAIL.mid)
    const A = g.ribber.find((r) => r.plan.id === 3)!, B = g.ribber.find((r) => r.plan.id === 4)!
    const i4 = (p: Pt): Pt => (snu ? [-p[0], p[1]] : p)
    let feil = 0, tal = 0
    for (const [R, Q, inn] of [[A, B, i4], [B, A, i4]] as const) {
      for (const q of R.tapp.filter((t) => t.nokkel.startsWith("s"))) {
        tal++
        const m = q.midt
        if (!gods(R, m)) feil++
        if (gods(Q, inn(m))) feil++
      }
    }
    // ingen punkt langs lina er gods i båe, og alle er gods i éin
    for (let x = -170; x <= 170; x += 1.7) for (const y of [-10, -3, 3, 10]) {
      const a = gods(A, [x, y]), b = gods(B, i4([x, y]))
      if (a === b) feil++
    }
    if (feil || tal < 5 || g.montering.klem.length) {
      brot++
      console.log(`FEIL  ${namn.padEnd(26)} ${feil} feil, ${tal} fingrar, ${g.montering.klem.length} klem`)
    } else console.log(`  ok   ${namn.padEnd(26)} ${String(tal).padStart(4)} fingrar, kvar i si plate og hòl i den andre`)
  }
}
/**
 * KILANE: eit sete som stikk nesten to tjukner gjennom sidene får kilehòl
 * i tappane og ein kile per tapp i kuttlista, gravert med tappen sitt namn.
 */
{
  const plan = skrivPlan([
    plate(1, [0.5, (225 - 150) / S, 0.5], [0, 1, 0], side()),
    plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], side()),
    plate(3, [0.5, 0.5, 300 / S], [0, 0, 1], firkant(178, 140)),
  ])
  sjekkTapp("sete med kilar", { ...MOBEL, plan }, { tappar: 4, brot: 0 })
  const { s: g, dl } = makeBygg({ ...MOBEL, plan }, DETAIL.mid)
  const kilar = dl.delar.filter((d) => d.plan === 0)
  const med = g.ribber.find((r) => r.plan.id === 3)!.tapp.filter((q) => q.kile)
  const feil = kilar.length !== 4 || med.length !== 4 || dl.lause !== 0 || !kilar.every((d) => /^k3-[12]-\d+$/.test(d.adr) && Math.abs(Math.abs(shoelace(d.outline)) - 48 * med[0].kile!.w) < 1)
  if (feil) brot++
  console.log(`${feil ? "FEIL" : "  ok "}  ${"kilar".padEnd(26)} ${String(kilar.length).padStart(4)} kilar i lista, ${med.length} tappar med hòl, ${dl.lause} lause`)
  /**
   * KILAR PÅ: det same setet i flukt med utsida får òg kilar — kvar tapp
   * gjennom stikk ut ei halv millimeter under to tjukner, og det står ei
   * tjukn gods utanfor kilehòlet. Med kilar av er det same setet i flukt.
   */
  const flukt = skrivPlan([
    plate(1, [0.5, (225 - 150) / S, 0.5], [0, 1, 0], side()),
    plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], side()),
    plate(3, [0.5, 0.5, 300 / S], [0, 0, 1], firkant(156, 140)),
  ])
  sjekkTapp("kilar på, sete i flukt", { ...MOBEL, plan: flukt, kilar: 1 }, { tappar: 4, brot: 0 })
  const paa = makeBygg({ ...MOBEL, plan: flukt, kilar: 1 }, DETAIL.mid)
  const av = makeBygg({ ...MOBEL, plan: flukt, kilar: 0 }, DETAIL.mid)
  const medPaa = paa.s.ribber.find((r) => r.plan.id === 3)!.tapp.filter((q) => q.kile)
  const feilPaa = medPaa.length !== 4 || paa.dl.delar.filter((d) => d.plan === 0).length !== 4 || Math.abs(medPaa[0].kile!.w - MOBEL.tjukn) > 1e-9 || av.dl.delar.some((d) => d.plan === 0) || av.s.ribber.some((r) => r.tapp.some((q) => q.kile))
  if (feilPaa) brot++
  console.log(`${feilPaa ? "FEIL" : "  ok "}  ${"kilar på".padEnd(26)} ${String(medPaa.length).padStart(4)} tappar med hòl på ${medPaa[0]?.kile?.w} mm, ingen med kilar av`)
}
/**
 * SETET MELLOM SIDENE: i flukt med utsida, og femten millimeter forbi —
 * då er det synlege tappar og ikkje halvt om halvt.
 */
{
  for (const [namn, y] of [["sete mellom, i flukt", 156], ["sete mellom, tappar ut", 171]] as const) {
    const l = skrivPlan([
      plate(1, [0.5, (225 - 150) / S, 0.5], [0, 1, 0], side()),
      plate(2, [0.5, (225 + 150) / S, 0.5], [0, 1, 0], side()),
      plate(3, [0.5, 0.5, 300 / S], [0, 0, 1], firkant(y, 140)),
    ])
    const { s: g } = makeBygg({ ...MOBEL, plan: l }, DETAIL.mid)
    if (g.ledd !== g.tappar) {
      brot++
      console.log(`FEIL  ${namn.padEnd(26)} ${g.ledd - g.tappar} halvt-om-halvt, 0 venta`)
    }
    sjekkTapp(namn, { ...MOBEL, plan: l }, { tappar: 4, brot: 0 })
    const r = g.ribber.find((q) => q.plan.id === 3)!
    const ytst = Math.max(...r.outlines[0].map((q) => Math.abs(q[1])))
    if (Math.abs(ytst - y) > 0.05) {
      brot++
      console.log(`FEIL  ${namn.padEnd(26)} tappen endar på ${ytst.toFixed(2)} mm, ${y} venta`)
    }
  }
}

/**
 * OG TELJAREN SKAL VERA LEVANDE.
 *
 * «Avviste» er talet på møte som kryssa, var lange nok, og likevel ikkje
 * fekk gods nok ved sida av sporet til å halde. Det er eit tal som SKAL
 * vera null på ein kube — difor ser ingen det der — og som er eit kvart av
 * alle møte på dei innebygde formene. Ein teljar som alltid står på null er
 * ein teljar ingen oppdagar er kopla frå; dette prosjektet har nett brukt
 * ein commit på å finne fire konstantar av det slaget.
 *
 * So: minst éi av sakene skal ha avvist noko. To av dei gjer det i dag —
 * kuben med 32 plan kvar veg, og den vende kuben.
 */
if (avvistIAlt === 0) {
  brot++
  console.log("FEIL  avviste                   ingen av sakene avviste eit einaste møte — er teljaren kopla frå?")
} else {
  console.log(`  ok   avviste                   ${avvistIAlt} møte avviste av skuldra over alle sakene`)
}

console.log(brot ? `\n${brot} brot` : "\nalle ledd står i profilane")
process.exit(brot ? 1 : 0)
