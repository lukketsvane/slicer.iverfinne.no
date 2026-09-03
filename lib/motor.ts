/**
 * SLICERMAN — motoren: kontrakten samla på éin stad.
 *
 * Kvar del er flat og rett, medan forma over dei er krum: ei krum flate
 * let seg ikkje bøyge av ei plate, men ho let seg TILNÆRME av kantane på
 * mange plater. Plana kryssar kvarandre og held seg sjølve — ikkje eit lim,
 * ein skrue eller ei oppspenning i heile stabelen.
 */
import { bbox, kuttCsv, MATERIALS, nn, offsetPoly, type Material, type Pt } from "./core"
import type { BuildOut, DetailKey, ExportKind, ExportOut, Group, ArkSyn, Kutt, Metrics, ParamBag, Range, Rule, Vec3, View } from "./core"
import { label as srcLabel, raw as srcRaw } from "./sources"
import { makeKropp, scenaAv } from "./kropp"
import { lesScene } from "./scene"
import { buildSnitt, DETAIL, skisseSyn, type SkisseSyn, type Snitt } from "./snitt"
import type { Plan } from "./plan"
import { contourLines, flateMesh, lagMesh } from "./mesh"
import { measure } from "./metrics"
import { checkRules } from "./rules"
import { makeBygg } from "./bygg"
import { fitSize, strokesAt } from "./stroke"
import { placedRings } from "./nest"
import { meshToStl } from "./export-stl"
import { meshToGlb } from "./export-glb"
import { meshToUsdz } from "./export-usdz"
import { partsToDxf } from "./export-dxf"
import { couponSvg, profileSvg, ring, sheetSvg } from "./export-svg"
import { zip } from "./zip"
import { DEFAULT_PARAMS, GROUPS, PARAM_KEYS, PARAM_RANGES, clampParams, type Params } from "./params"

export type EngineDef = {
  id: string
  label: string
  note: string
  ranges: Record<string, Range>
  groups: readonly Group[]
  keys: readonly string[]
  defaults: ParamBag
  clamp(o: unknown, prev: ParamBag): ParamBag
  build(p: ParamBag, detail: DetailKey, view: View): BuildOut
  measure(p: ParamBag): Metrics
  rules(p: ParamBag, m: Metrics): Rule[]
  exportFile(p: ParamBag, what: ExportKind): ExportOut
  /** kuttlista: éi line per del, med adressa, forma, målet og plata */
  liste(p: ParamBag): Kutt[]
  /** éi plate slik ho ligg, som SVG — den same teikninga uttaket gjev */
  arkSyn(p: ParamBag, i: number): ArkSyn
  /** profilane som bilete til panelet */
  preview(p: ParamBag): string
  /** skissa snitta før ho er låst: profilen og kryssa mot dei låste plana */
  skisse(p: ParamBag, plan: Plan): SkisseSyn
}

const asP = (p: ParamBag) => p as unknown as Params

/** Kor mykje snitt kuttfila skal kompensere for: NØYAKTIG éin gong. Står
 *  `snittveg` på maskina, er ho alt teken der. */
export const kerfOf = (p: Params) => (p.snittveg ? 0 : p.snitt)

/** Ein ny tom buffer kvar gong: ein delt tom Float32Array vert kopla frå
 *  fyrste gong han vert send gjennom postMessage. */
const EMPTY = () => new Float32Array(0)

/** desimalkomma i eit filnamn er bråk: 2,5 mm vert «2p5» */
const num = (v: number) => String(+v.toFixed(2)).replace(".", "p")

/** Materialet sin farge slik GLB og USDZ vil ha han: lineær, ikkje sRGB.
 *  Ein hex som vert send rett inn kjem ut for lys i kvar einaste lesar. */
const linear = (m: string): [number, number, number] => {
  const hex = MATERIALS[(m in MATERIALS ? m : "finer") as Material].hex
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return +(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(4)
  }) as [number, number, number]
}

/** Same stamme til PNG-en som til SVG-en; PNG-en vert laga på hovudtråden,
 *  so namnet må kunne lagast der òg, av ETIKETTEN. */
export const filnamnStamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

const stem = (p: Params) => filnamnStamme(srcLabel(p.kjelde))

/** kva veg ein del kjem inn, med ord */
function retningOrd(m: Vec3 | null): string {
  if (!m) return "ligg — ingen ledd mot delar som alt ligg"
  if (m[2] < -0.7) return "ovanfrå og ned"
  if (m[2] > 0.7) return "nedanfrå og opp"
  return `sidelengs, langs (${m.map((c) => nn(c, 2)).join(", ")})`
}

/**
 * MONTERINGA, SOM TEKST. Den som står ved benken med tjue delar og ein
 * telefon med tomt batteri treng det på papir: kva del fyrst, kva veg han
 * kjem inn, og mot kva. Adressa på delen er nøkkelen.
 */
function montering(p: Params, s: Snitt): string {
  const liner = s.montering.orden.map((id, i) => {
    const r = s.ribber.find((q) => q.plan.id === id)
    const mot = [...new Set((r?.spor ?? []).map((q) => q.mot))].filter((m) => s.montering.orden.indexOf(m) < i)
    const stykke = r?.outlines.length ?? 0
    const namn = `${id}${stykke > 1 ? ` (${stykke} stykke)` : ""}`
    const veg = retningOrd(s.montering.retning[id] ?? null)
    return `  ${i + 1}  ${namn}  ${veg}${mot.length ? `, mot ${mot.join(", ")}` : ""}`
  })
  return [
    `MONTERING — ${srcLabel(p.kjelde)}`,
    `${s.ribber.length} plan, ${p.tjukn} mm plate. Adressa er gravert på kvar del.`,
    "",
    "I denne rekkjefylgja. Sporet på delen som kjem opnar seg i fartsretninga; sporet på delen som ligg opnar seg mot han.",
    ...liner,
    "",
    "Sit eit ledd for hardt, er klaringa for liten: skjer passprøva i den same plata og set klaringa til det sporet avkappet går i med tommelkraft.",
    "",
  ].join("\n")
}

export const MOTOR: EngineDef = {
  id: "plan",
  label: "plan",
  note: "kryssande plan, utan lim og utan skruar",
  ranges: PARAM_RANGES,
  groups: GROUPS,
  keys: PARAM_KEYS,
  defaults: DEFAULT_PARAMS as unknown as ParamBag,

  clamp: (o, prev) => clampParams(o, asP(prev)) as unknown as ParamBag,

  build(bag: ParamBag, detail: DetailKey, view: View): BuildOut {
    const p = asP(bag)
    const k = makeKropp(p)
    if (view === "flate") {
      const m = flateMesh(k)
      // berre her: kroppen er ein kropp, og handa skal kunne peike på bitane
      return { ...m, kant: EMPTY(), del: EMPTY(), lines: EMPTY(), heavy: EMPTY(), bitar: k.bitar, skala: k.skala }
    }
    const s = buildSnitt(k, p, DETAIL[detail])
    if (view === "lag") return { ...lagMesh(s, p.tjukn), lines: EMPTY(), heavy: EMPTY(), bitar: [], skala: k.skala }
    // Konturteikninga fyller eit anna rom enn objektet; boksen vert lesen
    // av linene sjølve, so kameraet rammar inn det som vert teikna.
    const c = contourLines(s, p.tjukn)
    const min: Vec3 = [Infinity, Infinity, Infinity]
    const max: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < c.lines.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        if (c.lines[i + j] < min[j]) min[j] = c.lines[i + j]
        if (c.lines[i + j] > max[j]) max[j] = c.lines[i + j]
      }
    }
    if (!Number.isFinite(min[0])) {
      min[0] = min[1] = min[2] = 0
      max[0] = max[1] = max[2] = 1
    }
    return { positions: EMPTY(), normals: EMPTY(), tris: 0, kant: EMPTY(), del: EMPTY(), min, max, lines: c.lines, heavy: c.heavy, bitar: [], skala: k.skala }
  },

  measure: (bag) => measure(asP(bag)),
  rules: (bag, m) => checkRules(asP(bag), m),

  exportFile(bag: ParamBag, what: ExportKind): ExportOut {
    const p = asP(bag)
    const name = stem(p)
    if (what === "stl") {
      // SAME OBJEKT SOM DELANE: det midtre nivået, som kuttfilene og tavla.
      const bytes = meshToStl(lagMesh(makeBygg(p, DETAIL.mid).s, p.tjukn), name)
      return { name: `${name}.stl`, mime: "model/stl", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "glb") {
      const bytes = meshToGlb(lagMesh(makeBygg(p, DETAIL.mid).s, p.tjukn), name, linear(p.material))
      return { name: `${name}.glb`, mime: "model/gltf-binary", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "usdz") {
      const bytes = meshToUsdz(lagMesh(makeBygg(p, DETAIL.mid).s, p.tjukn), linear(p.material))
      return { name: `${name}.usdz`, mime: "model/vnd.usdz+zip", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "prove") {
      // Passprøva treng korkje plan eller nesting: ei lita plate med sju spor.
      return { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, mime: "image/svg+xml", text: couponSvg(p.tjukn, kerfOf(p), p.snitt, p.material) }
    }
    const { s, ns } = makeBygg(p, DETAIL.mid)
    const kerf = kerfOf(p)
    /** Éi plate = éi fil. Namnet seier kva for ei av kor mange. */
    const arkFiler = () => {
      const n = ns.sheets.length
      return ns.sheets.map((_, i) => ({ name: n <= 1 ? `${name}-ark.svg` : `${name}-ark-${i + 1}av${n}.svg`, text: sheetSvg(ns, i, kerf) }))
    }
    /** innstillingane som tekst — det er denne fila som gjer eit prosjekt til noko du kan opne att */
    const oppsett = () => JSON.stringify({ reiskap: "slicer.iverfinne", utgåve: 2, kjelde: srcLabel(p.kjelde), p }, null, 1)

    if (what === "alt") {
      // HEILE JOBBEN I EI NEDLASTING: alt som høyrer til det same objektet
      // i den same mappa, med kuttlista og oppsettet ved sida av.
      return {
        name: `${name}-alt.zip`,
        mime: "application/zip",
        data: zip([
          { name: `${name}.stl`, data: meshToStl(lagMesh(s, p.tjukn), name) },
          { name: `${name}.dxf`, text: partsToDxf(ns, p.tjukn, kerf) },
          { name: `${name}-profilar.svg`, text: profileSvg(s, kerf) },
          ...arkFiler(),
          { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, text: couponSvg(p.tjukn, kerf, p.snitt, p.material) },
          { name: "kuttliste.csv", text: kuttCsv(MOTOR.liste(bag)) },
          { name: "montering.txt", text: montering(p, s) },
          { name: "oppsett.json", text: oppsett() },
        ]),
      }
    }
    if (what === "prosjekt") {
      // Lenkja ber kvar innstilling utan om nettet. Denne fila ber begge —
      // kvar fil i scena, med id-en sin i namnet, so scena finn dei att.
      const filer = [{ name: "oppsett.json", text: oppsett() }]
      const idar = [...new Set([String(p.kjelde), ...lesScene(scenaAv(p)).map((b) => b.id)])]
      for (const id of idar) {
        const bytes = srcRaw(id)
        if (bytes) filer.push({ name: `nett/${id}__${srcLabel(id)}`, data: bytes } as never)
      }
      return { name: `${name}-prosjekt.zip`, mime: "application/zip", data: zip(filer) }
    }
    if (what === "svg") return { name: `${name}-profilar.svg`, mime: "image/svg+xml", text: profileSvg(s, kerf) }
    if (what === "ark") {
      const n = ns.sheets.length
      if (n <= 1) return { name: `${name}-ark.svg`, mime: "image/svg+xml", text: sheetSvg(ns, 0, kerf) }
      return { name: `${name}-ark-${n}plater.zip`, mime: "application/zip", data: zip(arkFiler()) }
    }
    return { name: `${name}.dxf`, mime: "application/dxf", text: partsToDxf(ns, p.tjukn, kerf) }
  },

  liste(bag: ParamBag): Kutt[] {
    const p = asP(bag)
    const { dl, ns } = makeBygg(p, DETAIL.mid)
    const ark = new Map<object, number>()
    ns.sheets.forEach((sh, i) => {
      for (const q of sh.placed) ark.set(q.part, i + 1)
    })
    return dl.delar.map((q) => {
      const b = bbox(q.outline)
      return { adr: q.adr, id: q.id, w: b.x1 - b.x0, h: b.y1 - b.y0, area: q.area, cutLen: q.cutLen, joints: q.joints, ark: ark.get(q) ?? 0, plan: q.plan }
    })
  },

  arkSyn(bag: ParamBag, i: number): ArkSyn {
    const p = asP(bag)
    const { ns } = makeBygg(p, DETAIL.mid)
    const tal = ns.sheets.length
    if (i < 0 || i >= tal) return { i, tal, svg: "", delar: 0, util: 0, plasser: [], arkB: ns.sheetW, arkH: ns.sheetH }
    const sheet = ns.sheets[i]
    const flate = sheet.placed.reduce((a, q) => a + q.part.area, 0)
    // SAME REKNESTYKKET SOM I TAVLA: utnytting av det du faktisk SKAR I.
    const skore = sheet.used * ns.sheetW
    const kerf = kerfOf(p)
    return {
      i,
      tal,
      svg: sheetSvg(ns, i, kerf),
      // dei same delane ein gong til, kvar for seg, so skjermen kan peike på dei
      plasser: sheet.placed.map((q) => {
        const r = placedRings(q)
        const utr = offsetPoly(r.outline, kerf / 2)
        const bb = bbox(utr)
        return {
          adr: q.part.adr,
          id: q.part.id,
          ut: ring(utr),
          inn: r.holes.map((h) => ring(offsetPoly(h, -kerf / 2))),
          boks: { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 },
          plass: { sheet: q.slot.sheet, rot: q.slot.rot, x: q.slot.sx, y: q.slot.sy },
          merke: merket(q.part.adr, q.label),
          ...(q.slot.kross ? { kross: true } : {}),
        }
      }),
      arkB: ns.sheetW,
      arkH: ns.sheetH,
      delar: sheet.placed.length,
      util: skore > 0 ? flate / skore : 0,
    }
  },

  preview(bag: ParamBag): string {
    const p = asP(bag)
    return profileSvg(buildSnitt(makeKropp(p), p, DETAIL.mid), kerfOf(p), true)
  },

  skisse(bag: ParamBag, plan: Plan): SkisseSyn {
    // det låge nivået: skissa er ein straum av punkt, og kvart av dei skal
    // svare før neste kjem
    const p = asP(bag)
    return skisseSyn(makeKropp(p), p, plan, DETAIL.lav)
  },
}

/** Adressa som bane, slik ho vert gravert: same rekning som uttaket. */
function merket(adr: string, label: { p: readonly [number, number] | Pt; room: number; wide: number }): string {
  const size = fitSize(adr, label.room, label.wide)
  if (!size) return ""
  return strokesAt(adr, label.p[0], label.p[1], size)
    .map((line) => line.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(3)},${q[1].toFixed(3)}`).join(" "))
    .join(" ")
}
