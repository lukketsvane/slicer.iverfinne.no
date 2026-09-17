import { bbox, kuttCsv, MATERIALS, nn, offsetPoly, type Material, type Pt } from "./core"
import type { BuildOut, DetailKey, ExportKind, ExportOut, Group, ArkSyn, Kutt, Metrics, ParamBag, Range, Rom, Rule, Vec3 } from "./core"
import { erPrimitiv, label as srcLabel, raw as srcRaw } from "./sources"
import { makeKropp, scenaAv } from "./kropp"
import { erFilform, lesScene } from "./scene"
import { buildSnitt, DETAIL, skisseSyn, sporBoge, sporPunkt, type SkisseSyn, type Snitt, type Spor } from "./snitt"
import type { Plan } from "./plan"
import { lesPlan } from "./plan"
import { flatDelar, flateMesh, lagDelar, lagMesh, type DelMesh } from "./mesh"
import { measure } from "./metrics"
import { checkRules, fiksAlt } from "./rules"
import { makeBygg } from "./bygg"
import { montasjen, vegen, type Montasje } from "./montasje"
import { fitSize, strokesAt } from "./stroke"
import { placedRings } from "./nest"
import { apply } from "./pack"
import { meshToStl } from "./export-stl"
import { meshToGlb } from "./export-glb"
import { delarTo3mf } from "./export-3mf"
import { meshToUsdz } from "./export-usdz"
import { sheetDxf } from "./export-dxf"
import { bane, bendCouponSvg, couponSvg, profileSvg, ring, sheetSvg } from "./export-svg"
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
  build(p: ParamBag, detail: DetailKey, view: Rom): BuildOut
  measure(p: ParamBag): Metrics
  fiksAlt(p: ParamBag): { p: ParamBag; fiksa: string[]; att: string[] }
  rules(p: ParamBag, m: Metrics): Rule[]
  exportFile(p: ParamBag, what: ExportKind): ExportOut
  liste(p: ParamBag): Kutt[]
  arkSyn(p: ParamBag, i: number): ArkSyn
  montasje(p: ParamBag): Montasje
  skisse(p: ParamBag, plan: Plan): SkisseSyn
}

const asP = (p: ParamBag) => p as unknown as Params

export const kerfOf = (p: Params) => (p.snittveg ? 0 : p.snitt)

const EMPTY = () => new Float32Array(0)

const num = (v: number) => String(+v.toFixed(2)).replace(".", "p")

const linear = (m: string): [number, number, number] => {
  const hex = MATERIALS[(m in MATERIALS ? m : "finer") as Material].hex
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return +(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(4)
  }) as [number, number, number]
}

export const filnamnStamme = (label: string) =>
  ("slicer-" + label).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 48)

const stem = (p: Params) => filnamnStamme(srcLabel(p.kjelde))

const nodar = (delar: readonly DelMesh[]) => delar.map((d) => ({ namn: d.adr, positions: d.positions, tris: d.tris }))

function retningOrd(m: Vec3 | null, boygd = false): string {
  switch (vegen(m, boygd)) {
    case "boygd":
      return "bøygd på plass — rull han ned i spora, dei grip etter kvart"
    case "ligg":
      return "ligg — ingen ledd mot delar som alt ligg"
    case "ned":
      return "ovanfrå og ned"
    case "opp":
      return "nedanfrå og opp"
    default:
      return `sidelengs, langs (${(m as Vec3).map((c) => nn(c, 2)).join(", ")})`
  }
}

function reglarTxt(p: Params): string {
  const m = measure(p)
  const r = checkRules(p, m, undefined, false)
  const harde = r.filter((q) => q.hard && !q.ok)
  const mjuke = r.filter((q) => !q.hard && !q.ok)
  const line = (q: Rule) => `  ${q.ok ? "  " : "!!"} ${q.label.padEnd(22)} ${q.value}`
  return [
    `REGLAR — ${srcLabel(p.kjelde)}`,
    "",
    harde.length
      ? `${harde.length} HARDT BROT. Delane let seg ikkje lage eller setje saman slik dei står. Filene i denne pakka er skrivne likevel — reiskapen avgjer ikkje for deg — men dette er kva han veit:`
      : "Ingen harde brot: delane let seg lage og setje saman.",
    "",
    ...harde.flatMap((q) => [line(q), `     ${q.why}`, ""]),
    ...(mjuke.length ? ["Og desse kan gå betre:", "", ...mjuke.map(line), ""] : []),
    "Alle linene:",
    "",
    ...r.map(line),
    "",
  ].join("\n")
}

export function montering(p: Params, s: Snitt): string {
  const liner = s.montering.orden.map((id, i) => {
    const r = s.ribber.find((q) => q.plan.id === id)
    const mot = [...new Set([...(r?.spor ?? []), ...(r?.tapp ?? [])].map((q) => q.mot))].filter((m) => s.montering.orden.indexOf(m) < i)
    const stykke = r?.outlines.length ?? 0
    const namn = `${id}${stykke > 1 ? ` (${stykke} stykke)` : ""}`
    const veg = retningOrd(s.montering.retning[id] ?? null, s.montering.boygde.includes(id))
    const fast = s.montering.brot.includes(id) ? "  << STÅR FAST" : ""
    return `  ${i + 1}  ${namn}  ${veg}${mot.length ? `, mot ${mot.join(", ")}` : ""}${fast}`
  })
  const brotne = s.montering.brot
  const varsel = brotne.length
    ? [
        "DETTE GÅR IKKJE OPP.",
        "",
        `Desse delane kjem ikkje inn: ${brotne.join(", ")}.`,
        "Ein del vert skuva inn langs spora sine, og ei plate kan berre gå éin veg. Desse har ledd mot to delar som alt ligg, langs liner som ikkje er parallelle — så dei står fast same kva du gjer.",
        "",
        "Rekkjefylgja under er den reiskapen ville ha brukt. Ho stoggar på den fyrste av dei over. Skjer du dette, får du delar som ikkje let seg setje saman.",
        "Byt rekkjefylgja så ein slik del kjem inn FØR den eine han står fast mot, eller vinkle planet om. Reiskapen syner kva for eitt under «kan monterast».",
        "",
        "---",
        "",
      ]
    : []
  return [
    `MONTERING — ${srcLabel(p.kjelde)}`,
    `${s.ribber.length} plan, ${p.tjukn} mm plate. Adressa er gravert på kvar del.`,
    "",
    ...varsel,
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

  build(bag: ParamBag, detail: DetailKey, view: Rom): BuildOut {
    const p = asP(bag)
    const k = makeKropp(p)
    if (view === "flate") {
      const m = flateMesh(k)
      return { ...m, kant: EMPTY(), del: EMPTY(), bitar: k.bitar, skala: k.skala }
    }
    const s = buildSnitt(k, p, DETAIL[detail])
    return { ...lagMesh(s, p.tjukn), bitar: [], skala: k.skala }
  },

  measure: (bag) => measure(asP(bag)),
  fiksAlt(bag) {
    const ut = fiksAlt(asP(bag))
    return { p: ut.p as unknown as ParamBag, fiksa: ut.fiksa, att: ut.att }
  },
  rules: (bag, m) => checkRules(asP(bag), m),

  exportFile(bag: ParamBag, what: ExportKind): ExportOut {
    const p = asP(bag)
    const name = stem(p)
    if (what === "stl") {
      const bytes = meshToStl(lagMesh(makeBygg(p, DETAIL.fil).s, p.tjukn), name)
      return { name: `${name}.stl`, mime: "model/stl", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "glb") {
      const b = makeBygg(p, DETAIL.fil)
      const bytes = meshToGlb([{ namn: name, delar: nodar(lagDelar(b.s, b.dl.delar, p.tjukn, !!p.merk)) }], name, linear(p.material))
      return { name: `${name}.glb`, mime: "model/gltf-binary", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "flat") {
      const { ns } = makeBygg(p, DETAIL.mid)
      const grupper = flatDelar(ns, p.tjukn, !!p.merk).map((g) => ({ namn: `ark-${g.ark}`, delar: nodar(g.delar) }))
      const bytes = meshToGlb(grupper, name, linear(p.material))
      return { name: `${name}-${num(p.tjukn)}mm-${p.material}-flat.glb`, mime: "model/gltf-binary", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "3mf") {
      const { ns } = makeBygg(p, DETAIL.fil)
      const delar = flatDelar(ns, p.tjukn, !!p.merk).flatMap((g) => nodar(g.delar))
      return { name: `${name}-${num(p.tjukn)}mm-delar.3mf`, mime: "model/3mf", data: delarTo3mf(delar, name).buffer.slice(0) as ArrayBuffer }
    }
    if (what === "usdz") {
      const bytes = meshToUsdz(lagMesh(makeBygg(p, DETAIL.fil).s, p.tjukn), linear(p.material))
      return { name: `${name}.usdz`, mime: "model/vnd.usdz+zip", data: bytes.buffer.slice(0) as ArrayBuffer }
    }
    if (what === "bogprove") {
      return { name: `bogprove-${num(p.tjukn)}mm-${p.material}.svg`, mime: "image/svg+xml", text: bendCouponSvg(p.tjukn, kerfOf(p), p.snitt, p.material) }
    }
    if (what === "prove") {
      return { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, mime: "image/svg+xml", text: couponSvg(p.tjukn, kerfOf(p), p.snitt, p.material) }
    }
    const { s, ns } = makeBygg(p, DETAIL.mid)
    const kerf = kerfOf(p)
    const plate = `${num(p.tjukn)}mm-${p.material}-${p.snittveg ? "maskinsnitt" : `k${num(p.snitt)}`}`
    const arkFiler = () => {
      const n = ns.sheets.length
      return ns.sheets.map((_, i) => ({ name: n <= 1 ? `${name}-${plate}-ark.svg` : `${name}-${plate}-ark-${i + 1}av${n}.svg`, text: sheetSvg(ns, i, kerf) }))
    }
    const dxfFiler = () => {
      const n = ns.sheets.length
      return ns.sheets.map((_, i) => ({ name: n <= 1 ? `${name}-${plate}.dxf` : `${name}-${plate}-ark-${i + 1}av${n}.dxf`, text: sheetDxf(ns, i, kerf) }))
    }
    const oppsett = (utan?: string[]) =>
      JSON.stringify({ reiskap: "slicer.iverfinne", utgåve: 2, kjelde: srcLabel(p.kjelde), ...(utan?.length ? { utan } : {}), p }, null, 1)

    if (what === "alt") {
      return {
        name: `${name}-alt.zip`,
        mime: "application/zip",
        data: zip([
          { name: `${name}.stl`, data: meshToStl(lagMesh(s, p.tjukn), name) },
          ...dxfFiler(),
          { name: `${name}-profilar.svg`, text: profileSvg(s, kerf) },
          ...arkFiler(),
          { name: `passprove-${num(p.tjukn)}mm-${p.material}.svg`, text: couponSvg(p.tjukn, kerf, p.snitt, p.material) },
          ...(lesPlan(p.plan).some((q) => q.bog)
            ? [{ name: `bogprove-${num(p.tjukn)}mm-${p.material}.svg`, text: bendCouponSvg(p.tjukn, kerf, p.snitt, p.material) }]
            : []),
          { name: "kuttliste.csv", text: kuttCsv(MOTOR.liste(bag)) },
          { name: "montering.txt", text: montering(p, s) },
          { name: "reglar.txt", text: reglarTxt(p) },
          { name: "oppsett.json", text: oppsett() },
        ]),
      }
    }
    if (what === "prosjekt") {
      const idar = [...new Set([String(p.kjelde), ...lesScene(scenaAv(p)).map((b) => b.id)])]
      const kravde = idar.filter((id) => !erPrimitiv(id) && !erFilform(id))
      const utan = kravde.filter((id) => !srcRaw(id)).map((id) => srcLabel(id))
      const filer = [{ name: "oppsett.json", text: oppsett(utan) }]
      for (const id of idar) {
        const bytes = srcRaw(id)
        if (bytes) filer.push({ name: `nett/${id}__${srcLabel(id)}`, data: bytes } as never)
      }
      const tomt = kravde.length > 0 && utan.length === kravde.length
      return {
        name: `${name}-${tomt ? "oppsett" : "prosjekt"}.zip`,
        mime: "application/zip",
        data: zip(filer),
        ...(utan.length ? { merknad: `nettet er for stort til å leggjast ved: ${utan.join(", ")}` } : {}),
      }
    }
    if (what === "svg") return { name: `${name}-profilar.svg`, mime: "image/svg+xml", text: profileSvg(s, kerf) }
    if (what === "ark") {
      const n = ns.sheets.length
      if (n <= 1) return { name: `${name}-${plate}-ark.svg`, mime: "image/svg+xml", text: sheetSvg(ns, 0, kerf) }
      return { name: `${name}-${plate}-ark-${n}plater.zip`, mime: "application/zip", data: zip(arkFiler()) }
    }
    const dxf = dxfFiler()
    if (dxf.length <= 1) return { name: dxf[0]?.name ?? `${name}-${plate}.dxf`, mime: "image/vnd.dxf", text: dxf[0]?.text ?? sheetDxf(ns, 0, kerf) }
    return { name: `${name}-${plate}-dxf-${dxf.length}plater.zip`, mime: "application/zip", data: zip(dxf) }
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
    const langs = (v: Spor, t: number): Pt => sporPunkt(v, t)
    const p = asP(bag)
    const { ns } = makeBygg(p, DETAIL.mid)
    const tal = ns.sheets.length
    if (i < 0 || i >= tal) return { i, tal, svg: "", delar: 0, util: 0, plasser: [], arkB: ns.sheetW, arkH: ns.sheetH }
    const sheet = ns.sheets[i]
    const flate = sheet.placed.reduce((a, q) => a + q.part.area, 0)
    const skore = sheet.used * ns.sheetW
    const kerf = kerfOf(p)
    return {
      i,
      tal,
      svg: sheetSvg(ns, i, kerf),
      plasser: sheet.placed.map((q) => {
        const r = placedRings(q)
        const utr = offsetPoly(r.outline, kerf / 2)
        const bb = bbox(utr)
        return {
          adr: q.part.adr,
          id: q.part.id,
          ut: ring(utr),
          inn: r.holes.map((h) => ring(offsetPoly(h, -kerf / 2))),
          rille: r.rille.map((l) => bane(l)).join(" "),
          boks: { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 },
          plass: { sheet: q.slot.sheet, rot: q.slot.rot, x: q.slot.sx, y: q.slot.sy },
          merke: merket(q.part.adr, q.label),
          spor: q.part.spor.map((v) => ({
            nokkel: v.nokkel,
            munn: apply(q.slot.m, langs(v, v.munn)),
            botn: apply(q.slot.m, langs(v, v.botn)),
            lo: apply(q.slot.m, langs(v, v.lo)),
            hi: apply(q.slot.m, langs(v, v.hi)),
            ...(v.k ? { boge: sporBoge(v, v.lo, v.hi).map((b) => apply(q.slot.m, b)) } : {}),
          })),
          ...(q.slot.kross ? { kross: true } : {}),
          ...(q.part.farge ? { farge: q.part.farge } : {}),
        }
      }),
      arkB: ns.sheetW,
      arkH: ns.sheetH,
      delar: sheet.placed.length,
      util: skore > 0 ? flate / skore : 0,
    }
  },

  montasje(bag: ParamBag): Montasje {
    const p = asP(bag)
    const b = makeBygg(p, DETAIL.mid)
    return montasjen(b.s, b.dl.delar, b.ns, p.tjukn, b.k.solid.min, b.k.solid.max)
  },

  skisse(bag: ParamBag, plan: Plan): SkisseSyn {
    const p = asP(bag)
    return skisseSyn(makeKropp(p), p, plan, DETAIL.lav)
  },
}

function merket(adr: string, label: { p: readonly [number, number] | Pt; room: number; wide: number }): string {
  const size = fitSize(adr, label.room, label.wide)
  if (!size) return ""
  return strokesAt(adr, label.p[0], label.p[1], size)
    .map((line) => line.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(3)},${q[1].toFixed(3)}`).join(" "))
    .join(" ")
}
