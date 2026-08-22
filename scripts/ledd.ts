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
import { inRing, type Pt } from "../lib/core"
import { makePlan } from "../lib/vaffel/plan"
import { DETAIL, jointsIn, type Rib } from "../lib/vaffel/ribs"
import { DEFAULT_PARAMS, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"

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

function sjekk(namn: string, p: Params) {
  const { g } = makePlan(p, DETAIL.mid)
  let ledd = 0
  let tapt = 0
  let uteneskulder = 0

  for (const r of g.ribs) {
    for (const q of r.slots) {
      // Eit spor som høyrer til eit stykke som er kasta, er ikkje eit
      // spor lenger. Det er berre bokføring frå før kastinga.
      if (!r.outlines.some((o) => jointsIn([q], o) > 0)) continue
      ledd++

      // Midt i sporet, på halve djupna. Nær munnen kan konturen framleis
      // vera i ferd med å runde inn; nær botnen kan hundebeinet ha teke
      // hjørnet. Midten er det einaste punktet som er eit spor uansett.
      const z = (q.zMouth + q.zEnd) / 2
      if (gods(r, [q.t, z])) {
        tapt++
        if (tapt <= 3) {
          console.log(
            `      ${r.axis}${r.k} t=${q.t.toFixed(1)} z=${z.toFixed(1)}: ` +
              `gods midt i sporet (munn ${q.zMouth.toFixed(1)}, botn ${q.zEnd.toFixed(1)})`,
          )
        }
        continue
      }

      // Og gods på BEGGE sider, ein halv millimeter utanfor veggen. Utan
      // det er ikkje dette eit spor — det er enden av ribba, eller ei
      // kløft som alt var der.
      const ut = q.w / 2 + 0.5
      if (!gods(r, [q.t - ut, z]) || !gods(r, [q.t + ut, z])) uteneskulder++
    }
  }

  const ok = tapt === 0
  if (!ok) brot++
  console.log(
    `${ok ? "  ok " : "FEIL"}  ${namn.padEnd(26)} ` +
      `${String(ledd).padStart(4)} ledd i profilane · ` +
      `${tapt} tapte · ${uteneskulder} utan gods på begge sider`,
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

put("kule", "kule", kule(50, 40))
put("egg", "egg", kule(50, 40, 1.6))
put("torus", "torus", torus(50, 18, 48, 24))

const SAKER: [string, Partial<Params>][] = [
  ["kube, standard", {}],
  ["kube, 32 ribber", { ribbX: 32, ribbY: 32 }],
  ["kube, ei ribbe kvar veg", { ribbX: 1, ribbY: 1 }],
  ["kube, tjukk plate", { tjukn: 12, storleik: 400 }],
  ["kube, leddet høgt", { ledd: 0.8 }],
  ["kube, leddet lågt", { ledd: 0.2 }],
  ["kube, hundebein", { leddtype: 1, fres: 3, tjukn: 6 }],
  ["kube, t-bein", { leddtype: 2, fres: 3, tjukn: 6 }],
  ["kube, vend", { rotX: 30, rotY: 20, rotZ: 10 }],
  ["kule", { kjelde: "kule" }],
  ["kule, 16 ribber", { kjelde: "kule", ribbX: 16, ribbY: 16 }],
  ["egg", { kjelde: "egg" }],
  ["torus ståande", { kjelde: "torus", rotX: 90 }],
  ["torus, lause med", { kjelde: "torus", rotX: 90, lause: 0 }],
  ["kule, tett og tynt", { kjelde: "kule", ribbX: 24, ribbY: 24, tjukn: 1 }],
]

for (const [namn, over] of SAKER) sjekk(namn, { ...DEFAULT_PARAMS, ...over })

console.log(brot ? `\n${brot} brot` : "\nalle ledd står i profilane")
process.exit(brot ? 1 : 0)
