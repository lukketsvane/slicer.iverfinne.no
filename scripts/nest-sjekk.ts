/**
 * Vakta over pakkinga.
 *
 * Ei pakking som legg to delar oppå kvarandre ser heilt fin ut i eit
 * bilete og er verdlaus på ei plate: du får éin del og eitt skrapstykke.
 * Difor vert kvar plate teikna opp att her, i eit finmaska rutenett, og
 * kvar celle talt. Ei celle som vert dekt to gonger er ein feil, og
 * skriptet seier frå kor mange og kor.
 *
 * Rutenettet er finare enn det pakkaren sjølv brukte, so testen er ikkje
 * berre pakkaren som får seg sjølv i tale.
 *
 *   npx tsx scripts/nest-sjekk.ts
 */
import { bbox, inRing, offsetPoly, type Pt } from "../lib/core"
import { fitSize } from "../lib/stroke"
import { anchor, apply, pack } from "../lib/pack"
import { makeBygg, nestGap } from "../lib/bygg"
import { DETAIL } from "../lib/snitt"
import { placedRings } from "../lib/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/params"

/**
 * AVSTANDEN MELLOM TO OMRISS, MÅLT SOM AVSTANDEN MELLOM TO OMRISS.
 *
 * Ho vart målt hjørne mot hjørne. Eit hjørne som ligg inntil ei lang, rett
 * side er då usynleg: vakta las ei plate der to kompenserte kutt gjekk i
 * kvarandre og skreiv «ok». På kube 500 i 12 mm med 3,5 mm snitt gav
 * hjørne-mot-hjørne 1,06 mm gods der det verkelege talet var −0,55.
 *
 * Punkt mot LINESTYKKE, båe vegar, er den same rekninga med ei projeksjon
 * inni — og det er den einaste som svarar på spørsmålet.
 */
const punktTilLine = (p: Pt, a: Pt, b: Pt) => {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const L = vx * vx + vy * vy
  let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}

const ringAvstand = (A: readonly Pt[], B: readonly Pt[]) => {
  let d = Infinity
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j]
      const b1 = B[(j + 1) % B.length]
      const a0 = A[i]
      const a1 = A[(i + 1) % A.length]
      const u = punktTilLine(a0, b0, b1)
      if (u < d) d = u
      const v = punktTilLine(b0, a0, a1)
      if (v < d) d = v
    }
  }
  return d
}
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import { rutenett, skrivPlan } from "../lib/plan"
const nett = (nx: number, ny: number) => skrivPlan(rutenett(nx, ny))

/**
 * PRØVEKROPPEN. Standarden opnar UTAN plan — reiskapen er tom til du skjer
 * — so ei vakt som måler geometri må seie kva ho måler. Seks kvar veg er
 * det same rutenettet standarden hadde før, og det same objektet.
 */
const GRUNN = { ...DEFAULT_PARAMS, plan: nett(6, 6) }


const RES = 0.6

/** cellene ein ring dekkjer, med partals-regelen */
function fill(
  rings: Pt[][],
  hit: (i: number, j: number) => void,
  w: number,
  h: number,
) {
  const b = bbox(rings[0])
  const j0 = Math.max(0, Math.floor(b.y0 / RES))
  const j1 = Math.min(h - 1, Math.ceil(b.y1 / RES))
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) * RES
    const xs: number[] = []
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        if (p[1] === q[1]) continue
        if (y >= Math.min(p[1], q[1]) && y < Math.max(p[1], q[1])) {
          xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
        }
      }
    }
    xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / RES - 0.5))
      const i1 = Math.min(w - 1, Math.floor(xs[k + 1] / RES - 0.5))
      for (let i = i0; i <= i1; i++) hit(i, j)
    }
  }
}

let brot = 0

// =============================================================================
// PAKKAREN SJØLV
// =============================================================================
/**
 * Rasteret er felles for like former, og det SKAL det vera: eit kuttark med
 * femti ribber har ofte ti former, og å rasterisere kvar del for seg er ni
 * tidelar bortkasta. Men forma hugsa òg kvar det FYRSTE stykket med den
 * nøkkelen låg, og den koordinaten høyrer til stykket og ikkje til forma.
 *
 * To like ribber kan liggje kvar sin stad i sitt eige rom — to like tårn,
 * to bein under ein kropp — og det andre stykket kom då ut skuva med
 * skilnaden mellom dei to. To hundre millimeter utanfor ei plate på fire
 * hundre, medan pakkinga melde null delar utanfor.
 *
 * Vegen gjennom nettet nådde han ikkje: signaturen som avgjer kva som er
 * «same form» tek omsyn til kvar konturen startar, so to stykke som ligg
 * ulikt får ulik nøkkel i praksis. Det er flaks og ikkje design, og han
 * ville falle bort i det sekundet nokon gjorde signaturen betre. Difor
 * vert pakkaren prøvd her, rett på, med nøklar som er like med vilje.
 */
function pakkarenSjolv() {
  const rekt = (x: number, y: number, w: number, h: number): Pt[] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
  const saker: [string, number, number, Pt[][]][] = [
    [
      "same form, tre opphav",
      400,
      300,
      [rekt(0, 0, 80, 60), rekt(500, 300, 80, 60), rekt(-900, -700, 80, 60)],
    ],
    [
      "same form, kvartsving",
      300,
      120,
      [rekt(0, 0, 80, 200), rekt(500, 300, 80, 200), rekt(-900, -700, 80, 200)],
    ],
  ]
  // Merket er ein EIGENSKAP VED FORMA, og difor hugsa per form. Då må
  // svaret vera relativt til delen sin eigen boks: same ring flytta ein
  // halv meter skal gje same svar. Er det absolutt, peikar det hugsa
  // svaret inn i det fyrste stykket sitt rom, og adressa hamnar på
  // nabodelen.
  //
  // Denne vegen når ikkje nettet i dag: signaturen som avgjer kva som er
  // «same form» tek omsyn til kvar konturen startar, so to stykke som
  // ligg ulikt får ulik nøkkel i praksis — prøvd på tolv oppsett av ein
  // kam med tre like tindar, utan eitt tilfelle. Det er flaks, og han
  // fell bort i det sekundet nokon gjer signaturen betre.
  {
    const a = anchor([rekt(0, 0, 90, 60)])
    const b = anchor([rekt(500, -300, 90, 60)])
    const like =
      Math.abs(a.p[0] - b.p[0]) < 1e-6 &&
      Math.abs(a.p[1] - b.p[1]) < 1e-6 &&
      Math.abs(a.room - b.room) < 1e-6
    if (!like) brot++
    console.log(
      `${like ? "  ok " : "FEIL"}  ${"merket fylgjer forma".padEnd(26)} ` +
        `[${a.p.map((v) => v.toFixed(1))}] mot [${b.p.map((v) => v.toFixed(1))}]`,
    )
  }

  for (const [namn, W, H, rings] of saker) {
    const pieces = rings.map((r) => ({ key: "same", rings: [r] }))
    const out = pack(pieces, W, H, 5)
    let ute = 0
    let verst = 0
    for (const q of out.slots) {
      const b = bbox(pieces[q.piece].rings[0].map((pt) => apply(q.m, pt)))
      const av = Math.max(-b.x0, -b.y0, b.x1 - W, b.y1 - H)
      if (av > 0.01) {
        ute++
        verst = Math.max(verst, av)
      }
    }
    const ok = ute === 0 && out.slots.length + out.spilt.length === pieces.length
    if (!ok) brot++
    console.log(
      `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
        `${out.slots.length} lagde på ${out.sheets} plater · ` +
        `${ute} utanfor${ute ? ` (verst ${verst.toFixed(1)} mm)` : ""}`,
    )
  }
}


function sjekk(namn: string, p: Params) {
  const { dl, ns } = makeBygg(p, DETAIL.mid)
  const w = Math.ceil(p.arkB / RES)
  const h = Math.ceil(p.arkH / RES)
  let overlapp = 0
  let utanfor = 0
  let dekt = 0
  let naer = Infinity
  let gods = Infinity
  const gap = nestGap(p)

  for (const sheet of ns.sheets) {
    const grid = new Int32Array(w * h)
    for (const q of sheet.placed) {
      const r = placedRings(q)
      const b = bbox(r.outline)
      if (b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > p.arkB + 0.01 || b.y1 > p.arkH + 0.01) {
        utanfor++
      }
      // Cellene vert samla per DEL fyrst. Utan det steget tel ein profil
      // som kryssar seg sjølv — noko som skjer når ribbene er tjukkare enn
      // opninga mellom dei — som eit overlapp mot seg sjølv, og då melder
      // vakta feil på pakkinga for noko pakkinga ikkje har gjort.
      const mine = new Set<number>()
      fill([r.outline, ...r.holes], (i, j) => mine.add(j * w + i), w, h)
      for (const c of mine) {
        if (grid[c]++ > 0) overlapp++
        dekt++
      }
    }
    // Kortaste avstand mellom to delar på plata, målt frå dei banene
    // maskina FAKTISK fylgjer — altso dei kompenserte. Godset som står att
    // er den avstanden minus ei snittbreidd til, av di kvart kutt et eit
    // halvt snitt på kvar side. Det er det talet som avgjer om dei to
    // kutta går i kvarandre.
    const komp = sheet.placed.map((q) => offsetPoly(placedRings(q).outline, p.snitt / 2))
    for (let a = 0; a < sheet.placed.length; a++) {
      for (let c = a + 1; c < sheet.placed.length; c++) {
        const ba2 = bbox(komp[a])
        const bb3 = bbox(komp[c])
        if (
          ba2.x0 <= bb3.x1 + gap * 3 &&
          bb3.x0 <= ba2.x1 + gap * 3 &&
          ba2.y0 <= bb3.y1 + gap * 3 &&
          bb3.y0 <= ba2.y1 + gap * 3
        ) {
          const d = ringAvstand(komp[a], komp[c]) - p.snitt
          if (d < gods) gods = d
        }
        const ra = placedRings(sheet.placed[a]).outline
        const rb = placedRings(sheet.placed[c]).outline
        const ba = bbox(ra)
        const bb2 = bbox(rb)
        if (ba.x0 > bb2.x1 + gap * 3 || bb2.x0 > ba.x1 + gap * 3) continue
        if (ba.y0 > bb2.y1 + gap * 3 || bb2.y0 > ba.y1 + gap * 3) continue
        const dn = ringAvstand(ra, rb)
        if (dn < naer) naer = dn
      }
    }
  }

  const areal = dl.delar.reduce((s, q) => s + q.area, 0)
  // Delar som ikkje fekk plass står ikkje på noka plate, so overlappstesten
  // ser dei aldri. Utan denne lina kan skriptet melde «ok» medan to delar
  // stille har forsvunne ut av kuttlista.
  const lagd = ns.sheets.reduce((n, q) => n + q.placed.length, 0)
  // ADRESSA SKAL LIGGJE I SIN EIGEN DEL.
  //
  // Ikkje «i ein del» — i SIN. Merket vert rekna per FORM, av di to like
  // ribber har det på same staden i seg sjølve, og same form kan liggje
  // fleire stader i objektet: tre bein under ein kropp gjev tre like
  // stykke i kvar tverribbe. Vert svaret lese som ein absolutt koordinat,
  // får alle tre adressa til det fyrste — altso på nabodelen, eller på
  // bert bord.
  //
  // Vakta i `rekkje.ts` ser på fila og kan berre spørje om punktet ligg i
  // NOKON del. Her finst delen, so her kan ein spørje om rett del.
  let feilmerkt = 0
  for (const sheet of ns.sheets) {
    for (const q of sheet.placed) {
      if (!fitSize(q.part.adr, q.label.room, q.label.wide)) continue
      if (!inRing(placedRings(q).outline, q.label.p)) feilmerkt++
    }
  }

  // Ein millimeter gods er det minste som held ei plate saman medan resten
  // vert skoren. Under det går dei to kutta i kvarandre.
  const ok =
    overlapp === 0 &&
    utanfor === 0 &&
    lagd + ns.spilt === dl.delar.length &&
    feilmerkt === 0 &&
    (!Number.isFinite(gods) || gods >= 1) &&
    // Luka er ein LOVNAD, ikkje ei opplysning. Ho stod berre skriven ut.
    // Ein tjuandedels millimeter slingring: rasteret landar på luka på
    // hundredelen, og ei flyttalsrekning skal ikkje vera eit brot.
    (!Number.isFinite(naer) || naer >= gap - 0.05)
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(dl.delar.length).padStart(3)} delar · ${ns.sheets.length} ark · ` +
      `${ns.spilt ? `${ns.spilt} utanfor · ` : ""}` +
      `${Math.round(ns.util * 100)} % · ` +
      `overlapp ${overlapp} · utanfor ${utanfor} · ` +
      `næraste ${Number.isFinite(naer) ? naer.toFixed(1) : "–"} mm (luke ${gap}) · ` +
      `gods ${Number.isFinite(gods) ? gods.toFixed(1) : "–"} mm · ` +
      `${feilmerkt} feilmerkte · ` +
      `areal ${(areal / 1e4).toFixed(0)} vs teikna ${((dekt * RES * RES) / 1e4).toFixed(0)} cm²`,
  )
}

/** tre like tindar under ein rygg */
function kam() {
  const out: number[] = []
  const boks = (w: number, d: number, h: number, ox: number, oy: number, oz: number) => {
    const q: [number, number, number][] = [
      [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
      [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h],
    ]
    const f = [
      [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
    ]
    for (const [a, b, c] of f) out.push(...q[a], ...q[b], ...q[c])
  }
  for (const x of [-50, -10, 30]) boks(20, 40, 90, x, -20, 0)
  boks(100, 40, 12, -50, -20, 90)
  return makeSoup(new Float32Array(out))
}

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
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
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

put("kule", "kule", kule(50, 48))
put("egg", "egg", kule(50, 48, 1.7))
put("torus", "torus", torus(60, 22, 64, 32))
put("kam", "kam", kam())

sjekk("kube 6x6", GRUNN)
sjekk("kube 400, 12x9 i 12 mm", {
  ...GRUNN, storleik: 400, plan: nett(12, 9), tjukn: 12,
  arkB: 1200, arkH: 900,
})
sjekk("kube vend/700", {
  ...GRUNN, rotX: 30, rotY: 20, rotZ: 10, storleik: 700, tjukn: 6,
  arkB: 1200, arkH: 900,
})
sjekk("kule 7x7", { ...GRUNN, kjelde: "kule", plan: nett(7, 7), })
sjekk("egg 8x8", { ...GRUNN, kjelde: "egg", plan: nett(8, 8), })
sjekk("torus staaende", { ...GRUNN, kjelde: "torus", rotX: 90, plan: nett(9, 9), })
sjekk("kule stor plate", { ...GRUNN, kjelde: "kule", plan: nett(10, 10), arkB: 2500, arkH: 1250 })
// PLATENE MELLOM DEI TO GOLVA.
//
// Oppløysinga vert vald som `max(luke/3, plata/620, 1)`. Er plata stor nok
// til å dra res forbi ein tredels luke, men ikkje forbi HEILE luka, fell
// utvidinga til éi celle og den verkelege avstanden til res. Med ei luke
// på fire millimeter er det plater mellom 827 og 2480 mm — altso dei
// fleste store laserbord, og heile finérplata på 2440. Prøvene over låg
// tilfeldigvis på kvar si side av det vindauget: 800 under, 2500 over.
sjekk("kule 1600x1000", { ...GRUNN, kjelde: "kule", plan: nett(12, 12), storleik: 400, arkB: 1600, arkH: 1000 })
sjekk("kube finerplate", { ...GRUNN, storleik: 700, plan: nett(10, 10), arkB: 2440, arkH: 1220 })
sjekk("egg i 6 mm", { ...GRUNN, kjelde: "egg", tjukn: 6, plan: nett(7, 7), })
// Ein kam: tre like tindar under ein rygg. Kvar tverribbe vert delt i tre
// stykke med NØYAKTIG same form, som ligg tre ulike stader. Det er den
// eine forma der eit merke rekna per form kan hamne på nabodelen.
sjekk("kam med tre tindar", { ...GRUNN, kjelde: "kam", plan: nett(5, 4), lause: 0 })
// Eit breitt snitt et av luka frå begge sider. Her var godset mellom to
// delar minus ein komma tre millimeter: dei to kutta gjekk i kvarandre.
sjekk("breitt snitt", {
  ...GRUNN, kjelde: "kule", snitt: 6, tjukn: 12,
  storleik: 400, arkB: 1200, arkH: 900,
})

/**
 * TO PLANAR SOM BERRE SKIL SEG I SNITTET.
 *
 * Kvar sak over står på sitt eige punkt i parameterrommet, so ingen av dei
 * spør nokon gong om det same objektet TO gonger med ulik snittbreidd — og
 * det var nett det som gjekk gale: snittet stod ikkje i plannøkkelen, so
 * den andre spørjinga fekk servert pakkinga frå den fyrste. Luka gjekk frå
 * 4 til 14 mm utan at ei einaste plate flytta seg, og uttaket la delane
 * like tett som før.
 *
 * Same objekt, same plate, same ribber. Berre snittet. Rekkjefylgja er
 * poenget: den smale fyrst, so den breie må hente ei ny pakking.
 */
// Plata står eksplisitt: på standardplata på 600 × 400 er ei kule på 420
// for stor, og ei prøve der halvparten av delane ligg utanfor prøver
// spilt og ikkje snittet.
sjekk("same objekt, smalt snitt", {
  ...GRUNN, kjelde: "kule", storleik: 420, plan: nett(8, 8), snitt: 0.2,
  arkB: 800, arkH: 600,
})
sjekk("same objekt, breitt snitt", {
  ...GRUNN, kjelde: "kule", storleik: 420, plan: nett(8, 8), snitt: 6,
  arkB: 800, arkH: 600,
})

pakkarenSjolv()

console.log(brot ? `\n${brot} PAKKINGAR ER BROTNE` : "\nalle pakkingar held")
process.exit(brot ? 1 : 0)
