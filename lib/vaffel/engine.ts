/**
 * VAFFEL som motor: kontrakten samla på éin stad.
 *
 * Produksjonsvegen er kryssholdte ribber i to retningar. Ei krum flate let
 * seg ikkje bøyge av ei plate, men ho let seg TILNÆRME av kantane på mange
 * plater — og ein platekant er ei rett line. Difor er kvar del her flat og
 * rett, medan forma over dei er krum i begge retningar.
 *
 * Prisen er materialet. Kvar ribbe går heilt gjennom objektet, so mange
 * plater ber det tre kunne ha bore; til gjengjeld finst det ikkje eit lim,
 * ein skrue eller ei oppspenning i heile stabelen. Rutenettet held seg
 * sjølv, og det er heile poenget.
 */
import { bbox } from "../core"
import type {
  BuildOut,
  DetailKey,
  ExportKind,
  ExportOut,
  Group,
  ArkSyn,
  Kutt,
  Metrics,
  ParamBag,
  Range,
  Rule,
  Vec3,
  View,
} from "../core"
import { label as srcLabel } from "../sources"
import { makeKropp } from "./kropp"
import { buildGrid, DETAIL } from "./ribs"
import { contourLines, flateMesh, lagMesh } from "./mesh"
import { measure } from "./metrics"
import { checkRules } from "./rules"
import { makePlan } from "./plan"
import type { Part } from "./parts"
import { meshToStl } from "./export-stl"
import { partsToDxf } from "./export-dxf"
import { couponSvg, profileSvg, sheetSvg } from "./export-svg"
import { bruk, tune, tuneSteg, type Kandidat } from "./tune"
import { zip } from "../zip"
import {
  DEFAULT_PARAMS,
  GROUPS,
  NUDGE_PARAMS,
  PARAM_KEYS,
  PARAM_RANGES,
  clampParams,
  type Params,
} from "./params"

export type EngineDef = {
  id: string
  label: string
  note: string
  ranges: Record<string, Range>
  groups: readonly Group[]
  keys: readonly string[]
  defaults: ParamBag
  nudge: { vertical: string; horizontal: string }
  unitLabel: string
  clamp(o: unknown, prev: ParamBag): ParamBag
  build(p: ParamBag, detail: DetailKey, view: View): BuildOut
  measure(p: ParamBag): Metrics
  rules(p: ParamBag, m: Metrics): Rule[]
  exportFile(p: ParamBag, what: ExportKind): ExportOut
  /** kuttlista: éi line per del, med adressa, forma, målet og plata */
  liste(p: ParamBag): Kutt[]
  /** éi plate slik ho ligg, som SVG — den same teikninga uttaket gjev */
  arkSyn(p: ParamBag, i: number): ArkSyn
  /** gode innstillingar for det nettet og den storleiken som står, sorterte */
  tune(p: ParamBag): Kandidat[]
  /** det same søket, men eitt steg om gongen: den som driv han kan sleppe
   *  tråden imellom, og då kjem framdrifta fram medan ho gjeld */
  tuneSteg(p: ParamBag): Generator<{ gjort: number; av: number }, Kandidat[], void>
  /** det n-te svaret frå ei liste som alt er rekna */
  pick(p: ParamBag, alle: Kandidat[], nth: number): ParamBag
  /** profilane som bilete til panelet — same teikning som SVG-uttaket,
   *  men med strek tjukk nok til å sjåast når ho er skrumpa til ei rute */
  preview(p: ParamBag): string
}

const asP = (p: ParamBag) => p as unknown as Params

/**
 * Kor mykje snitt kuttfila skal kompensere for.
 *
 * Snittbreidda må takast nøyaktig éin gong. Står `snittveg` på maskina,
 * er ho alt teken der, og fila skal levere den NOMINELLE konturen — legg
 * ho på òg, vert kvart spor ei snittbreidd for vidt og rutenettet held
 * seg ikkje sjølv.
 */
const kerfOf = (p: Params) => (p.snittveg ? 0 : p.snitt)

/** Ein ny tom buffer kvar gong. Ein delt tom Float32Array vert kopla frå
 *  fyrste gong han vert send gjennom postMessage, og då er alle seinare
 *  visningar tomme utan at noko feilar. */
const EMPTY = () => new Float32Array(0)

/** desimalkomma i eit filnamn er bråk: 2,5 mm vert «2p5» */
const num = (v: number) => String(+v.toFixed(2)).replace(".", "p")

/** filnamn utan mellomrom, utan aksentar og med kjelda i seg */
const stem = (p: Params) =>
  ("vaffel-" + srcLabel(p.kjelde))
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 48)

export const VAFFEL: EngineDef = {
  id: "vaffel",
  label: "vaffel",
  note: "kryssholdte ribber i to retningar, utan lim og utan skruar",
  ranges: PARAM_RANGES,
  groups: GROUPS,
  keys: PARAM_KEYS,
  defaults: DEFAULT_PARAMS as unknown as ParamBag,
  nudge: NUDGE_PARAMS,
  unitLabel: "ribber",

  clamp: (o, prev) => clampParams(o, asP(prev)) as unknown as ParamBag,

  build(bag: ParamBag, detail: DetailKey, view: View): BuildOut {
    const p = asP(bag)
    const k = makeKropp(p)

    if (view === "flate") {
      const m = flateMesh(k)
      return { ...m, kant: EMPTY(), lines: EMPTY(), heavy: EMPTY() }
    }

    const g = buildGrid(k, p, DETAIL[detail])
    if (view === "lag") {
      const m = lagMesh(g)
      return { ...m, lines: EMPTY(), heavy: EMPTY() }
    }

    // Konturteikninga legg ribbene flatt ved sida av kvarandre og fyller
    // difor eit anna rom enn objektet. Kameraet skal ramme inn det som
    // faktisk vert teikna, so boksen vert lesen av linene sjølve.
    const c = contourLines(g)
    const min: Vec3 = [Infinity, Infinity, Infinity]
    const max: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const arr of [c.lines, c.heavy]) {
      for (let i = 0; i < arr.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          if (arr[i + j] < min[j]) min[j] = arr[i + j]
          if (arr[i + j] > max[j]) max[j] = arr[i + j]
        }
      }
    }
    if (!Number.isFinite(min[0])) {
      min[0] = min[1] = min[2] = 0
      max[0] = max[1] = max[2] = 1
    }
    return {
      positions: EMPTY(),
      normals: EMPTY(),
      tris: 0,
      kant: EMPTY(),
      min,
      max,
      lines: c.lines,
      heavy: c.heavy,
    }
  },

  measure: (bag) => measure(asP(bag)),
  tune: (bag) => tune(asP(bag)),
  tuneSteg: (bag) => tuneSteg(asP(bag)),
  pick: (bag, alle, nth) => bruk(asP(bag), alle, nth) as unknown as ParamBag,
  rules: (bag, m) => checkRules(asP(bag), m),

  exportFile(bag: ParamBag, what: ExportKind): ExportOut {
    const p = asP(bag)
    const name = stem(p)
    if (what === "stl") {
      // SAME OBJEKT SOM DELANE.
      //
      // STL-en vart bygd på det finaste detaljnivået medan kuttfilene og
      // kvart tal i panelet kjem frå det midtre. Det gav elleve til
      // femogtjue prosent fleire trekantar: ein annan stabel enn den du
      // skjer. Han er til rendering og 3D-print, so skilnaden er ikkje
      // farleg — men eit uttak som viser noko anna enn resten av
      // reiskapen er nett det denne koden elles nektar for. Og det var
      // ei heil snitting til, på eit nett som kan ha ein million
      // trekantar.
      const bytes = meshToStl(lagMesh(makePlan(p, DETAIL.mid).g), name)
      return {
        name: `${name}.stl`,
        mime: "model/stl",
        data: bytes.buffer.slice(0) as ArrayBuffer,
      }
    }
    if (what === "prove") {
      // Passprøva treng korkje ribber eller nesting — ho er ei lita plate
      // med sju spor, og ho skal kunne hentast før du har bestemt deg for
      // noko som helst anna.
      return {
        name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`,
        mime: "image/svg+xml",
        text: couponSvg(p.tjukn, kerfOf(p), p.snitt, p.material),
      }
    }
    const { g, ns } = makePlan(p, DETAIL.mid)
    if (what === "svg") {
      return { name: `${name}-profilar.svg`, mime: "image/svg+xml", text: profileSvg(g, kerfOf(p)) }
    }
    if (what === "ark") {
      const n = ns.sheets.length
      const ark = (i: number) => sheetSvg(ns, i, kerfOf(p))
      // Éi plate er éi fil. Fleire er ei mappe — og ei mappe i nettlesaren
      // er ein ZIP. Alternativet er at brukaren må slette dei andre platene
      // for hand kvar einaste gong han opnar uttaket.
      if (n <= 1) {
        return { name: `${name}-ark.svg`, mime: "image/svg+xml", text: ark(0) }
      }
      const buf = zip(
        ns.sheets.map((_, i) => ({
          name: `${name}-ark-${i + 1}av${n}.svg`,
          text: ark(i),
        })),
      )
      return { name: `${name}-ark-${n}plater.zip`, mime: "application/zip", data: buf }
    }
    return {
      name: `${name}.dxf`,
      mime: "application/dxf",
      text: partsToDxf(ns, p.tjukn, kerfOf(p)),
    }
  },

  liste(bag: ParamBag): Kutt[] {
    const p = asP(bag)
    const { pl, ns } = makePlan(p, DETAIL.mid)
    // Kva plate kvar del hamna på. Pakkinga kjenner delen sjølv, so det er
    // eit oppslag og ikkje ei gjetting på adresse.
    const ark = new Map<Part, number>()
    ns.sheets.forEach((s, i) => {
      for (const q of s.placed) ark.set(q.part, i + 1)
    })
    return pl.parts.map((q) => {
      const b = bbox(q.outline)
      return {
        adr: q.from,
        id: q.id,
        w: b.x1 - b.x0,
        h: b.y1 - b.y0,
        area: q.area,
        cutLen: q.cutLen,
        joints: q.joints,
        ark: ark.get(q) ?? 0,
      }
    })
  },

  arkSyn(bag: ParamBag, i: number): ArkSyn {
    const p = asP(bag)
    const { ns } = makePlan(p, DETAIL.mid)
    const tal = ns.sheets.length
    if (i < 0 || i >= tal) return { i, tal, svg: "", delar: 0, util: 0 }
    const sheet = ns.sheets[i]
    const flate = sheet.placed.reduce((a, q) => a + q.part.area, 0)
    // SAME REKNESTYKKET SOM I TAVLA.
    //
    // «Utnytting» er kor mykje av det du faktisk SKAR I som vart del —
    // `used` og ikkje heile plata, av di resten av den siste plata ikkje
    // er svinn, han ligg der og ventar på neste jobb. Rekna på heile plata
    // gav 53 % der tavla sa 68, og to tal om det same er verre enn eitt.
    const skore = sheet.used * ns.sheetW
    return {
      i,
      tal,
      // Same teikninga som fila. Ikkje ei framsyning AV fila — fila.
      svg: sheetSvg(ns, i, kerfOf(p)),
      delar: sheet.placed.length,
      util: skore > 0 ? flate / skore : 0,
    }
  },

  preview(bag: ParamBag): string {
    const p = asP(bag)
    return profileSvg(buildGrid(makeKropp(p), p, DETAIL.mid), kerfOf(p), true)
  },
}
