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
import { bbox, offsetPoly, type Pt } from "../lib/core"
import { apply, pack } from "../lib/pack"
import { makePlan, nestGap } from "../lib/vaffel/plan"
import { DETAIL } from "../lib/vaffel/ribs"
import { placedRings } from "../lib/vaffel/nest"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

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
  const { pl, ns } = makePlan(p, DETAIL.mid)
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
          for (const u of komp[a]) {
            for (const v of komp[c]) {
              const d = Math.hypot(u[0] - v[0], u[1] - v[1]) - p.snitt
              if (d < gods) gods = d
            }
          }
        }
        const ra = placedRings(sheet.placed[a]).outline
        const rb = placedRings(sheet.placed[c]).outline
        const ba = bbox(ra)
        const bb2 = bbox(rb)
        if (ba.x0 > bb2.x1 + gap * 3 || bb2.x0 > ba.x1 + gap * 3) continue
        if (ba.y0 > bb2.y1 + gap * 3 || bb2.y0 > ba.y1 + gap * 3) continue
        for (const u of ra) {
          for (const v of rb) {
            const d = Math.hypot(u[0] - v[0], u[1] - v[1])
            if (d < naer) naer = d
          }
        }
      }
    }
  }

  const areal = pl.parts.reduce((s, q) => s + q.area, 0)
  // Delar som ikkje fekk plass står ikkje på noka plate, so overlappstesten
  // ser dei aldri. Utan denne lina kan skriptet melde «ok» medan to delar
  // stille har forsvunne ut av kuttlista.
  const lagd = ns.sheets.reduce((n, q) => n + q.placed.length, 0)
  // Ein millimeter gods er det minste som held ei plate saman medan resten
  // vert skoren. Under det går dei to kutta i kvarandre.
  const ok =
    overlapp === 0 &&
    utanfor === 0 &&
    lagd + ns.spilt === pl.parts.length &&
    (!Number.isFinite(gods) || gods >= 1)
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(pl.parts.length).padStart(3)} delar · ${ns.sheets.length} ark · ` +
      `${ns.spilt ? `${ns.spilt} utanfor · ` : ""}` +
      `${Math.round(ns.util * 100)} % · ` +
      `overlapp ${overlapp} · utanfor ${utanfor} · ` +
      `næraste ${Number.isFinite(naer) ? naer.toFixed(1) : "–"} mm (luke ${gap}) · ` +
      `gods ${Number.isFinite(gods) ? gods.toFixed(1) : "–"} mm · ` +
      `areal ${(areal / 1e4).toFixed(0)} vs teikna ${((dekt * RES * RES) / 1e4).toFixed(0)} cm²`,
  )
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

sjekk("kube 6x6", DEFAULT_PARAMS)
sjekk("kube 400, 12x9 i 12 mm", {
  ...DEFAULT_PARAMS, storleik: 400, ribbX: 12, ribbY: 9, tjukn: 12,
  arkB: 1200, arkH: 900,
})
sjekk("kube vend/700", {
  ...DEFAULT_PARAMS, rotX: 30, rotY: 20, rotZ: 10, storleik: 700, tjukn: 6,
  arkB: 1200, arkH: 900,
})
sjekk("kule 7x7", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 7, ribbY: 7 })
sjekk("egg 8x8", { ...DEFAULT_PARAMS, kjelde: "egg", ribbX: 8, ribbY: 8 })
sjekk("torus staaende", { ...DEFAULT_PARAMS, kjelde: "torus", rotX: 90, ribbX: 9, ribbY: 9 })
sjekk("kule stor plate", { ...DEFAULT_PARAMS, kjelde: "kule", ribbX: 10, ribbY: 10, arkB: 2500, arkH: 1250 })
sjekk("hundebein", { ...DEFAULT_PARAMS, kjelde: "egg", leddtype: 1, fres: 6, ribbX: 7, ribbY: 7 })
// Ein fres på seks, med snittet sett rett. Her var godset mellom to delar
// minus ein komma tre millimeter: dei to kutta gjekk i kvarandre.
sjekk("fres 6 mm, snitt 6", {
  ...DEFAULT_PARAMS, kjelde: "kule", fres: 6, snitt: 6, tjukn: 12,
  storleik: 400, arkB: 1200, arkH: 900,
})

pakkarenSjolv()

console.log(brot ? `\n${brot} PAKKINGAR ER BROTNE` : "\nalle pakkingar held")
process.exit(brot ? 1 : 0)
