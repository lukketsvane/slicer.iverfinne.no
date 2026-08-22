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
import { VAFFEL } from "../lib/vaffel/engine"
import { DEFAULT_PARAMS, PARAM_RANGES, type Params } from "../lib/vaffel/params"
import { makeSoup } from "../lib/soup"
import { put } from "../lib/sources"
import type { ExportKind, ParamBag } from "../lib/core"

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

// =============================================================================
// KVA EIT SVAR MÅ HALDE
// =============================================================================
const endeleg = (v: unknown) => typeof v === "number" && Number.isFinite(v)

function sjekk(namn: string, p: Params, vis = false) {
  saker++
  const bag = p as unknown as ParamBag
  let m
  try {
    m = VAFFEL.measure(bag)
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
    r = VAFFEL.rules(bag, m)
  } catch (e) {
    return feil(namn, `reglane kasta: ${(e as Error).message}`)
  }
  for (const q of r) {
    if (/NaN|Infinity|undefined/.test(q.value)) feil(namn, `regelen «${q.label}» står som «${q.value}»`)
  }

  for (const view of ["flate", "lag", "kontur"] as const) {
    try {
      const b = VAFFEL.build(bag, "mid", view)
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
      const o = VAFFEL.exportFile(bag, kind)
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
// KØYRINGA
// =============================================================================
console.log("nett som ikkje er nett")
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
  ["ei ribbe kvar veg", { ribbX: 1, ribbY: 1 }],
  ["alt på ei ribbe", { ribbX: 32, ribbY: 1 }],
  ["tett rutenett i tjukk plate", { ribbX: 32, ribbY: 32, tjukn: 25 }],
  ["tjukkare plate enn objekt", { storleik: 40, tjukn: 25 }],
  ["fres breiare enn sporet", { fres: 12, tjukn: 2 }],
  ["snitt breiare enn godset", { snitt: 6, tjukn: 2 }],
  ["minsteark, størst objekt", { storleik: 1200, arkB: 200, arkH: 200 }],
  ["glatta i hel", { glatt: 24, trekant: 0.5 }],
  ["vend i alle tre", { rotX: 180, rotY: 180, rotZ: 180 }],
  ["lause tekne med", { lause: 0, kjelde: "v-nål" }],
  ["nål med 32 ribber", { kjelde: "v-nål", ribbX: 32, ribbY: 32 }],
  ["flatt ark, tjukk plate", { kjelde: "v-flatt ark", tjukn: 25 }],
  // Ingen del får plass på plata. Delane finst, arka gjer det ikkje, og
  // det var her DXF-en og arket kom ut som tomme dokument.
  ["for stort for plata", { storleik: 900, ribbX: 14, ribbY: 14, tjukn: 6, arkB: 400, arkH: 300 }],
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
  { ribbX: 1e9 },
  { tjukn: "tjukk" },
  { kjelde: "../../etc/passwd" },
  { kjelde: "x".repeat(400) },
  { material: "gull" },
  { lause: 99 },
  { snittveg: -3 },
  Object.fromEntries(Object.keys(PARAM_RANGES).map((k) => [k, NaN])),
]
for (const s of SØPPEL) {
  const q = VAFFEL.clamp(s, DEFAULT_PARAMS as unknown as ParamBag) as unknown as Params
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
  ["to plater", { storleik: 150 }],
  ["seks plater", { storleik: 400, ribbX: 12, ribbY: 9, tjukn: 6, arkB: 1200, arkH: 900 }],
] as [string, Partial<Params>][]) {
  saker++
  const o = VAFFEL.exportFile({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag, "ark")
  // Éi plate er éi fil og ingen pakke. Er det fleire, MÅ det vera ei
  // pakke — kjem det ei enkelt fil då, har ei plate forsvunne.
  const ark = VAFFEL.measure({ ...DEFAULT_PARAMS, ...over } as unknown as ParamBag).sheets
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
    console.log(`  ${namn.padEnd(14)} ${filer.length} filer, ${o.data.byteLength} B: ${filer.map((f) => f.name).join(", ")}`)
  } catch (e) {
    feil(namn, `pakka let seg ikkje lesa: ${(e as Error).message}`)
  }
}

console.log(brot ? `\n${saker} saker, ${brot} brot` : `\n${saker} saker, ingen brot`)
process.exit(brot ? 1 : 0)
