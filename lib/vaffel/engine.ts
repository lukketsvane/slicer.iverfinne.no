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
import type {
  BuildOut,
  DetailKey,
  ExportKind,
  ExportOut,
  Group,
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
import { meshToStl } from "./export-stl"
import { partsToDxf } from "./export-dxf"
import { profileSvg, sheetSvg } from "./export-svg"
import {
  DEFAULT_PARAMS,
  GROUPS,
  NUDGE_PARAMS,
  PARAM_KEYS,
  PARAM_RANGES,
  clampParams,
  randomParams,
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
  random(rnd: () => number, prev: ParamBag, locked: ReadonlySet<string>): ParamBag
  build(p: ParamBag, detail: DetailKey, view: View): BuildOut
  measure(p: ParamBag): Metrics
  rules(p: ParamBag, m: Metrics): Rule[]
  exportFile(p: ParamBag, what: ExportKind): ExportOut
  /** profilane som bilete til panelet — same teikning som SVG-uttaket,
   *  men med strek tjukk nok til å sjåast når ho er skrumpa til ei rute */
  preview(p: ParamBag): string
}

const asP = (p: ParamBag) => p as unknown as Params

/** Ein ny tom buffer kvar gong. Ein delt tom Float32Array vert kopla frå
 *  fyrste gong han vert send gjennom postMessage, og då er alle seinare
 *  visningar tomme utan at noko feilar. */
const EMPTY = () => new Float32Array(0)

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
  random: (rnd, prev, locked) => randomParams(rnd, asP(prev), locked) as unknown as ParamBag,

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
  rules: (bag, m) => checkRules(asP(bag), m),

  exportFile(bag: ParamBag, what: ExportKind): ExportOut {
    const p = asP(bag)
    const k = makeKropp(p)
    const name = stem(p)
    if (what === "stl") {
      const bytes = meshToStl(lagMesh(buildGrid(k, p, DETAIL.hog)), name)
      return {
        name: `${name}.stl`,
        mime: "model/stl",
        data: bytes.buffer.slice(0) as ArrayBuffer,
      }
    }
    const { g, ns } = makePlan(p, DETAIL.mid)
    if (what === "svg") {
      return { name: `${name}-profilar.svg`, mime: "image/svg+xml", text: profileSvg(g) }
    }
    if (what === "ark") {
      return { name: `${name}-ark.svg`, mime: "image/svg+xml", text: sheetSvg(ns, p.tjukn) }
    }
    return {
      name: `${name}.dxf`,
      mime: "application/dxf",
      text: partsToDxf(ns, p.tjukn, p.snitt),
    }
  },

  preview(bag: ParamBag): string {
    const p = asP(bag)
    return profileSvg(buildGrid(makeKropp(p), p, DETAIL.mid), true)
  },
}
