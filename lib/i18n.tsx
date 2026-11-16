"use client"

import { createContext, useContext, useEffect, type ReactNode } from "react"
import type { ExportKind, Material, Metric, Rule } from "./core"

export type Maal = "en" | "nn"

const MaalKontekst = createContext<Maal>("en")

export function lesMaal(sti?: string): Maal {
  if (!sti) return "en"
  return sti === "/nn" || sti.startsWith("/nn/") ? "nn" : "en"
}

export function MaalProvider({ maal, children }: { maal: Maal; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = maal
  }, [maal])

  return <MaalKontekst.Provider value={maal}>{children}</MaalKontekst.Provider>
}

export function useMaal(): Maal {
  return useContext(MaalKontekst)
}

export function mt<T>(m: Maal, en: T, nn: T): T {
  return m === "nn" ? nn : en
}

export const ord = mt

const MAT_EN: Record<Material, string> = {
  graa: "grey",
  bjork: "birch",
  finer: "plywood",
  mdf: "mdf",
  akryl: "acrylic",
  papp: "cardboard",
}

export function omsetMat(m: Maal, k: Material, nnLabel: string): string {
  return m === "nn" ? nnLabel : (MAT_EN[k] ?? nnLabel)
}

const PARAM_EN: Record<string, string> = {
  storleik: "size",
  rotX: "tilt x",
  rotY: "tilt y",
  rotZ: "tilt z",
  glatt: "smooth",
  trekant: "cap",
  forenkl: "tolerance",
  hol: "min hole",
  tjukn: "thickness",
  lause: "loose",
  merk: "labels",
  snapp: "snap",
  klaring: "clearance",
  ledd: "split",
  kilar: "wedges",
  snitt: "kerf",
  snittveg: "kerf mode",
  fart: "speed",
  arkB: "width",
  arkH: "height",
  mjuk: "fillet",
  virr: "scatter",
}

export function omsetParam(m: Maal, k: string, nnLabel: string): string {
  return m === "nn" ? nnLabel : (PARAM_EN[k] ?? nnLabel)
}

const VERDI_EN: Record<string, string> = {
  "ta med": "keep",
  kast: "drop",
  utan: "none",
  nummer: "number",
  av: "off",
  på: "on",
  "i fila": "in file",
  "i maskina": "on machine",
}

export function omsetVerdi(m: Maal, v: string): string {
  return m === "nn" ? v : (VERDI_EN[v] ?? v)
}

const GRUPPE_EN: Record<string, string> = {
  form: "shape",
  nett: "mesh",
  delar: "parts",
  snapp: "snap",
  forenkling: "simplify",
  ledd: "joints",
  kutt: "cutting",
  plate: "sheet",
}

export function omsetGruppe(m: Maal, id: string, nnLabel: string): string {
  return m === "nn" ? nnLabel : (GRUPPE_EN[id] ?? nnLabel)
}

const METRIKK_EN: Record<string, string> = {
  delar: "parts · unique",
  ledd: "joints",
  lause: "loose pieces",
  tid: "cut time",
  masse: "mass",
  ark: "sheets",
  utnytting: "utilization",
  gods: "min wall",
  opning: "min gap",
  spor: "slot width",
  nodar: "nodes",
  nett: "triangles",
  kantar: "open edges",
}

export function omsetMetrikk(m: Maal, q: { id: string; label: string; text: string }): { label: string; text: string } {
  if (m === "nn") return { label: q.label, text: q.text }
  const label = METRIKK_EN[q.id] ?? q.label
  const text = q.text.replace(/ avviste$/, " rejected").replace(/ av /, " of ")
  return { label, text }
}

const REGEL_LABEL_EN: Record<string, string> = {
  grip: "planes interlock",
  delar: "parts to cut",
  orden: "assemblable",
  klem: "no overlapping parts",
  lause: "loose pieces",
  gods: "joint wall",
  plate: "parts fit on sheet",
  klaring: "clearance",
  snitt: "kerf width",
  snittspor: "kerf vs slot",
  opning: "plane gap",
  lukka: "watertight mesh",
  nett: "mesh resolution",
  utnytting: "sheet utilization",
  bog: "bend radius",
  bogledd: "bent plane joints",
  bogkurve: "bent intersections",
}

const REGEL_WHY_EN: Record<string, string> = {
  grip: "Without cross-joints this is a loose stack of plates. Add intersecting planes or use the grid tool.",
  delar: "No planes intersect the mesh. Move the planes into the body or add planes with the grid tool.",
  orden: "A part slides in along its slots. Reorder planes or adjust angles so every part has a clear assembly path.",
  klem: "Two planes cross where both have material, but the joint was too narrow for a slot.",
  lause: "A piece without any joints is unconnected. Add a crossing plane or set loose to drop.",
  gods: "The slot removes half the overlap; remaining wall is too thin and may snap during assembly.",
  plate: "A part exceeds the sheet size or overlaps another pinned part. Increase sheet dimensions or shrink the model.",
  klaring: "Measure your sheet with calipers. Below 0.05 mm is too tight; above 0.35 mm is loose.",
  snitt: "Laser beam kerf width is zero; slots will cut wider by one kerf unless compensated.",
  snittspor: "Kerf width exceeds or equals slot width, collapsing the slot profile.",
  opning: "Two nearly parallel planes are too close for fingers during assembly.",
  lukka: "Mesh has open edges; inside/outside ray casting may merge separate islands.",
  nett: "Triangle cap is at its minimum while source mesh has more detail.",
  utnytting: "Less than 35% of sheet area is used across multiple sheets.",
  bog: "Tight bends are automatically kerf-scored; if kerf is too wide for the score pitch, relax the bend.",
  bogledd: "Bent planes only carry slots along generators or perpendicular floor rings.",
  bogkurve: "Slanted plane intersections against a bent cylinder are conic curves and do not receive slots.",
}

export function omsetRegel(m: Maal, r: Rule): Rule {
  if (m === "nn") return r
  const label = r.id === "lause" ? (r.label.includes("kasta") ? "unjoined · dropped" : "unjoined parts") : (REGEL_LABEL_EN[r.id] ?? r.label)
  const value = r.value
    .replace(/ ledd$/, " joints")
    .replace(/ stk$/, " pcs")
    .replace("éin veg inn for kvar", "clear path for each")
    .replace(" står fast:", " stuck:")
    .replace(/ mellom /g, " between ")
    .replace(/ og /g, " and ")
    .replace("ingen klemmer", "none")
    .replace(" par klemmer:", " pairs collide:")
    .replace(/ utan ledd/g, " unjoined")
    .replace(/ kasta/g, " dropped")
    .replace(/^ingen$/, "none")
    .replace(" utanfor", " outside")
    .replace(" i kvarandre", " overlapping")
    .replace(/ ark$/, " sheets")
    .replace(/^null$/, "zero")
    .replace(" i fila", " in file")
    .replace(" i maskina", " on machine")
    .replace(" mot ", " vs ")
    .replace(" opne kantar", " open edges")
    .replace(/^lukka$/, "closed")
    .replace(" av minst ", " of min ")
    .replace(" av ", " of ")
    .replace("ingen bøygde plan", "no bent planes")
    .replace("ingen bøygde", "no bent planes")
    .replace(" — rilla, ", " — kerf-scored, ")
    .replace(" mm steg", " mm pitch")
    .replace(" plan utan ledd", " planes without joints")
    .replace(" bøygde, alle med ledd", " bent, all joined")
    .replace(" møte er kurver", " intersections are curved")
  const ordFiks = r.fiks?.ord
    .replace(/^prøv /, "try ")
    .replace(/^del i midten$/, "split 50 %")
    .replace(/^del /, "split ")
    .replace(/^rett ut det eine$/, "flatten 1")
    .replace(/^rett ut dei /, "flatten ")
    .replace(/^rett ut alle$/, "flatten all")
    .replace(/^rett ut dei lause$/, "flatten unjoined")
    .replace(/^rett ut til /, "flatten to ")
    .replace(/^byt rekkjefylgje/, "reorder")
    .replace(/ fast$/, " stuck")
    .replace(/^ta bort dei (\S+) som står fast$/, "remove $1 stuck")
    .replace(/^ta bort dei (\S+) som står for tett$/, "remove $1 too close")
    .replace(/^ta bort plan /, "remove plane ")
    .replace(/ av /g, " of ")
    .replace(/ par$/, " pairs")
    .replace(/^kast dei$/, "drop them")
  return {
    ...r,
    label,
    value,
    why: REGEL_WHY_EN[r.id] ?? r.why,
    fiks: r.fiks && ordFiks ? { ...r.fiks, ord: ordFiks } : r.fiks,
  }
}

export const UTTAK_EN: Record<ExportKind, { label: string; hint: string }> = {
  stl: { label: "stl", hint: "parts as triangle mesh, for rendering and 3D printing" },
  glb: { label: "glb", hint: "the same mesh in meters, Y up — one node per part named by address" },
  flat: { label: "flat", hint: "parts laid flat as nested on sheets, one group per sheet in 3D" },
  "3mf": { label: "3mf", hint: "flat parts for 3D printing: one object per part, named by address" },
  usdz: { label: "usdz", hint: "AR assembly in space: open on iPhone to place on your table" },
  dxf: { label: "dxf", hint: "nested sheets as R12 drawing, one file per sheet" },
  svg: { label: "svg", hint: "all part profiles side by side, 1:1 scale" },
  ark: { label: "sheet", hint: "nested sheets as SVG, one file per sheet" },
  png: { label: "png", hint: "nested sheets as raster image for sharing" },
  prove: { label: "fit test", hint: "seven slots, each 0.05 mm wider — cut in your sheet to find clearance" },
  bogprove: { label: "bend test", hint: "five kerf-scored strips with varying pitch — bend to pick the sturdiest" },
  alt: { label: "all", hint: "complete job bundle: STL, DXF, profiles, sheets, test coupons, cut list, settings" },
  prosjekt: { label: "save", hint: "settings and mesh bundle — drop it back in to resume where you left off" },
}

export function omsetBolk(m: Maal, bolk: string): string {
  if (m === "nn") return bolk
  if (bolk === "plate") return "sheet"
  if (bolk === "rom") return "3d"
  if (bolk === "alt") return "bundle"
  return bolk
}
