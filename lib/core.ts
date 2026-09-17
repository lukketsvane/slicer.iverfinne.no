
export type Pt = [number, number]
export type Vec3 = [number, number, number]

export type Material = "bjork" | "finer" | "mdf" | "akryl" | "papp"

export const MATERIALS: Record<
  Material,
  { label: string; rho: number; hex: string }
> = {
  bjork: { label: "bjørk", rho: 670, hex: "#dbb589" },
  finer: { label: "kryssfinér", rho: 680, hex: "#e9dcc0" },
  mdf: { label: "mdf", rho: 750, hex: "#c9a889" },
  akryl: { label: "akryl", rho: 1190, hex: "#dfe7ea" },
  papp: { label: "papp", rho: 220, hex: "#d8c9ac" },
}

export const TJUKNER = [2, 2.5, 3, 4, 6, 9, 12, 15, 18, 24] as const

export const MIN_AREA = 400

export type Range = {
  min: number
  max: number
  step: number
  label: string
  unit?: string
  int?: boolean
  names?: readonly string[]
}

export type Group = { id: string; label: string; keys: readonly string[] }

export type ParamBag = Record<string, number | string>

const clamp1 = (v: number, r: Range) => {
  if (!Number.isFinite(v)) return NaN
  const c = Math.min(r.max, Math.max(r.min, v))
  return r.int ? Math.round(c) : +c.toFixed(4)
}

export const snap = (v: number, r: Range) => {
  const c = clamp1(v, r)
  return Number.isFinite(c) ? c : r.min
}

export const lesTal = (raw: string) => Number(String(raw).replace(",", ".").replace(/\s+/g, ""))

export const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3)

export const feltTal = (v: number, step: number) => {
  for (let d = decimals(step); d < 4; d++) if (+v.toFixed(d) === v) return v.toFixed(d)
  return v.toFixed(4)
}

export function clampBag<P extends ParamBag>(
  o: unknown,
  prev: P,
  ranges: Record<string, Range>,
  keys: readonly string[],
): P {
  if (!o || typeof o !== "object") return prev
  const rec = o as Record<string, unknown>
  const out = { ...prev } as Record<string, number | string>
  for (const k of keys) {
    const raw = rec[k]
    if (typeof raw !== "number") continue
    const v = clamp1(raw, ranges[k])
    if (Number.isFinite(v)) out[k] = v
  }
  if (typeof rec.material === "string" && rec.material in MATERIALS) {
    out.material = rec.material
  }
  if (typeof rec.kjelde === "string" && /^[a-z0-9_-]{1,40}$/i.test(rec.kjelde)) {
    out.kjelde = rec.kjelde
  }
  return out as P
}

export const nn = (v: number, d = 0) =>
  Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–"

export const klokke = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "–"
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const r = t % 60
  const pad = (v: number) => String(v).padStart(2, "0")
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export type Metric = {
  id: string
  label: string
  value: number
  unit: string
  text: string
}

export type Metrics = {
  envX: number // ytre mål på det ferdige objektet, mm
  envY: number
  envZ: number

  parts: number // tal delar i kuttlista
  unique: number // kor mange av dei som er ULIKE — det er oppspenningane
  loose: number // stykke utan eit einaste ledd: kasta, eller med i lista
  joints: number // kryssledd som faktisk vart skorne
  avvist: number
  units: number // plan i alt
  unitLabel: string

  mass: number // ferdig masse, kg
  plyArea: number // plateareal delane dekkjer, mm²
  sheets: number // ark som trengst
  util: number // utnytting av arka, 0–1
  cutLen: number // samla kuttlengd, mm — laseren si eiga tid
  cutTime: number // kuttetid, sekund: kuttlengda delt på kuttfarta

  nodes: number

  narrow: number // smalaste gods som er att i eit ledd, mm
  minGap: number // minste opning mellom to naboribber, mm
  slotW: number // sporbreidd, mm

  tris: number // trekantar i kjeldenettet etter forenkling
  srcTris: number // trekantar i kjeldenettet slik det kom inn
  openEdges: number // kantar som berre høyrer til éin trekant

  list: Metric[]
}

export type Kutt = {
  adr: string
  id: string
  w: number
  h: number
  area: number
  cutLen: number
  joints: number
  ark: number
  plan: number
}

export const LAG_FARGAR: readonly string[] = [
  "#000000", "#0000ff", "#ff0000", "#00e000", "#d0d000", "#ff8000", "#00e0e0", "#ff00ff", "#b4b4b4", "#0000a0",
  "#a00000", "#00a000", "#a0a000", "#c08000", "#00a0ff", "#a000a0", "#808080", "#7d87b9", "#bb7784", "#4a6fe3",
  "#d33f6a", "#8cd78c", "#f0b98d", "#f6c4e1", "#fa9ed4", "#500a78", "#b45a00", "#004754", "#86fa88", "#ffdb66",
]
export const FARGE_MIN = 2
export const lagFarge = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= FARGE_MIN && v < LAG_FARGAR.length ? v : null

export type Delplass = {
  adr: string
  id: string
  ut: string
  inn: string[]
  rille: string
  boks: { x: number; y: number; w: number; h: number }
  plass: { sheet: number; rot: 0 | 1 | 2 | 3; x: number; y: number }
  kross?: boolean
  farge?: number
  merke: string
  spor: { nokkel: string; munn: Pt; botn: Pt; lo: Pt; hi: Pt; boge?: Pt[] }[]
}

export type ArkSyn = {
  i: number
  tal: number
  svg: string
  delar: number
  util: number
  plasser: Delplass[]
  arkB: number
  arkH: number
}

export type Rule = {
  id: string
  label: string
  ok: boolean
  hard: boolean
  value: string
  why: string
  rad?: string
  fiks?: Fiks
}

export type Fiks = {
  ord: string
  set: Record<string, number | string>
  riv?: true
}

export type DetailKey = "lav" | "mid" | "hog"

export type Rom = "flate" | "lag"
export type View = Rom | "kontur" | "montasje"

export type ExportKind =
  | "stl"
  | "glb"
  | "flat"
  | "3mf"
  | "usdz"
  | "dxf"
  | "svg"
  | "ark"
  | "png"
  | "prove"
  | "bogprove"
  | "alt"
  | "prosjekt"

export function kuttCsv(liste: readonly Kutt[]): string {
  return [
    "adresse;form;breidd_mm;hogd_mm;flate_cm2;kutt_mm;ledd;plate",
    ...liste.map((k) =>
      [
        k.adr,
        k.id,
        nn(k.w, 2),
        nn(k.h, 2),
        nn(k.area / 100, 2),
        nn(k.cutLen, 1),
        String(k.joints),
        k.ark ? String(k.ark) : "",
      ].join(";"),
    ),
  ].join("\n")
}

export type BuildOut = {
  positions: Float32Array<ArrayBufferLike>
  normals: Float32Array<ArrayBufferLike>
  tris: number
  min: Vec3
  max: Vec3
  kant: Float32Array<ArrayBufferLike>
  del: Float32Array<ArrayBufferLike>
  bitar: { id: string; min: Vec3; max: Vec3 }[]
  skala: number
}

export type ExportOut = {
  name: string
  mime: string
  text?: string
  data?: ArrayBuffer
  merknad?: string
}

export function shoelace(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const b = poly[(i + 1) % poly.length]
    a += poly[i][0] * b[1] - b[0] * poly[i][1]
  }
  return a / 2
}

export function bbox(poly: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const q of poly) {
    if (q[0] < x0) x0 = q[0]
    if (q[0] > x1) x1 = q[0]
    if (q[1] < y0) y0 = q[1]
    if (q[1] > y1) y1 = q[1]
  }
  return { x0, y0, x1, y1 }
}

export function inRing(ring: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      if (p[0] < x) inside = !inside
    }
  }
  return inside
}

export function perimeter(ring: Pt[]): number {
  let L = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    L += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return L
}

export function metric(
  id: string,
  label: string,
  value: number,
  unit: string,
  text: string,
): Metric {
  return { id, label, value, unit, text }
}

export function offsetPoly(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  if (n < 3 || Math.abs(d) < 1e-6) return poly
  const ccw = shoelace(poly) > 0
  const s = ccw ? d : -d
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const n1 = norm(a, b)
    const n2 = norm(b, c)
    let mx = n1[0] + n2[0]
    let my = n1[1] + n2[1]
    const L = Math.hypot(mx, my)
    if (L < 1e-9) {
      out.push(b)
      continue
    }
    mx /= L
    my /= L
    const k = Math.max(0.4, n1[0] * mx + n1[1] * my || 1)
    out.push([b[0] + (s * mx) / k, b[1] + (s * my) / k])
  }
  return out
}

function norm(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return [dy / L, -dx / L]
}

export function keep<T>(size = 3): (key: string, make: () => T) => T {
  const m = new Map<string, T>()
  return (key, make) => {
    if (m.has(key)) {
      const hit = m.get(key) as T
      m.delete(key)
      m.set(key, hit)
      return hit
    }
    const v = make()
    m.set(key, v)
    if (m.size > size) m.delete(m.keys().next().value as string)
    return v
  }
}
