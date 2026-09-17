import { clampBag, type Group, type ParamBag, type Range } from "./core"
import type { Fest } from "./pack"
import { reinPlan } from "./plan"
import { reinScene } from "./scene"

export type Params = {
  kjelde: string
  scene: string

  storleik: number // lengste side etter skalering, mm
  rotX: number // rotasjon kring X, grader
  rotY: number
  rotZ: number

  glatt: number // glattingsrunder — Taubin, volumet står
  trekant: number // tak på tal trekantar, tusen

  forenkl: number
  hol: number

  tjukn: number // platetjukn MÅLT med skyvelær, mm — ikkje det ho heiter
  lause: number // 0 tek med stykke utan ledd, 1 kastar dei
  merk: number // 0 glatte delar i 3D-filene, 1 med adressa skoren ned i framsida
  snapp: number // kva steg snappet kjenner: plassen i `SNAPPSTEG`

  klaring: number // sporet breiare enn den MÅLTE plata, mm
  ledd: number // kvar i overlappet delinga ligg, 0,5 er halvt om halvt
  kilar: number // 0 tappar i flukt som teikna, 1 kvar tapp gjennom stikk ut og får kile

  snitt: number // snittbreidd, mm
  snittveg: number // 0 kompenserer i fila, 1 lèt maskina gjera det
  fart: number // kuttfart, mm/s — berre til tidsoverslaget
  arkB: number // plata, mm
  arkH: number

  material: string

  plan: string

  fest: string
  deling: string
}

export const SNITTVEGAR = ["i fila", "i maskina"] as const

export const LAUSE = ["ta med", "kast"] as const
export const MERK = ["utan", "nummer"] as const
export const KILAR = ["av", "på"] as const

export const SNAPPSTEG = [0, 15, 45, 90] as const
export const SNAPP_NAMN = ["av", "15°", "45°", "90°"] as const

export const PARAM_RANGES: Record<string, Range> = {
  storleik: { min: 40, max: 1200, step: 1, label: "storleik", unit: "mm" },
  rotX: { min: -180, max: 180, step: 1, label: "vend x", unit: "°" },
  rotY: { min: -180, max: 180, step: 1, label: "vend y", unit: "°" },
  rotZ: { min: -180, max: 180, step: 1, label: "vend z", unit: "°" },

  glatt: { min: 0, max: 24, step: 1, label: "glatting", int: true },
  trekant: { min: 0.5, max: 60, step: 0.5, label: "tak", unit: "k" },

  forenkl: { min: 0, max: 10, step: 0.05, label: "toleranse", unit: "mm" },
  hol: { min: 0, max: 80, step: 1, label: "minste hòl", unit: "mm" },

  tjukn: { min: 1, max: 25, step: 0.05, label: "tjukn", unit: "mm" },
  lause: { min: 0, max: 1, step: 1, label: "lause", int: true, names: LAUSE },
  merk: { min: 0, max: 1, step: 1, label: "merk", int: true, names: MERK },
  snapp: { min: 0, max: SNAPPSTEG.length - 1, step: 1, label: "snapp", int: true, names: SNAPP_NAMN },

  klaring: { min: 0, max: 0.6, step: 0.01, label: "klaring", unit: "mm" },
  ledd: { min: 0.2, max: 0.8, step: 0.01, label: "deling" },
  kilar: { min: 0, max: 1, step: 1, label: "kilar", int: true, names: KILAR },

  snitt: { min: 0, max: 6, step: 0.05, label: "snitt", unit: "mm" },
  snittveg: { min: 0, max: 1, step: 1, label: "snittveg", int: true, names: SNITTVEGAR },
  fart: { min: 1, max: 200, step: 1, label: "fart", unit: "mm/s", int: true },
  arkB: { min: 100, max: 3000, step: 1, label: "breidd", unit: "mm" },
  arkH: { min: 100, max: 2000, step: 1, label: "høgd", unit: "mm" },
}

export const GROUPS: readonly Group[] = [
  { id: "form", label: "form", keys: ["storleik", "rotX", "rotY", "rotZ"] },
  { id: "nett", label: "nett", keys: ["glatt", "trekant"] },
  { id: "delar", label: "delar", keys: ["tjukn", "lause", "merk"] },
  { id: "snapp", label: "snapp", keys: ["snapp"] },
  { id: "forenkling", label: "forenkling", keys: ["forenkl", "hol"] },
  { id: "ledd", label: "ledd", keys: ["klaring", "ledd", "kilar"] },
  { id: "kutt", label: "kutt", keys: ["snitt", "snittveg", "fart"] },
  { id: "plate", label: "plate", keys: ["arkB", "arkH"] },
]

export const PARAM_KEYS = GROUPS.flatMap((g) => g.keys)

export const ALLE_KEYS: readonly string[] = [...PARAM_KEYS, "kjelde", "scene", "material", "plan", "fest", "deling"]

const FEST_TAK = 128
const FEST_MM = 5000

export function lesFest(s: unknown): Map<string, Fest> {
  const ut = new Map<string, Fest>()
  if (typeof s !== "string" || !s) return ut
  for (const bit of s.split(";")) {
    if (ut.size >= FEST_TAK) break
    const m = /^(\d{1,5}[a-z]{0,3}):(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(bit)
    if (!m) continue
    const sheet = Number(m[2])
    const rot = Number(m[3])
    const x = Number(m[4])
    const y = Number(m[5])
    if (!Number.isInteger(sheet) || sheet < 0 || sheet > 255) continue
    if (!Number.isInteger(rot) || rot < 0 || rot > 3) continue
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= FEST_MM)) continue
    ut.set(m[1], { sheet, rot: rot as 0 | 1 | 2 | 3, x: +x.toFixed(2), y: +y.toFixed(2) })
  }
  return ut
}

export const skrivFest = (m: ReadonlyMap<string, Fest>): string =>
  [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "nn", { numeric: true }))
    .map(([adr, f]) => `${adr}:${f.sheet},${f.rot},${f.x},${f.y}`)
    .join(";")

export const reinFest = (s: unknown) => skrivFest(lesFest(s))

export type Deling = number
const DELING_TAK = 256
export const DELING_MIN = 0.2
export const DELING_MAX = 0.8

export function lesDeling(s: unknown): Map<string, Deling> {
  const ut = new Map<string, Deling>()
  if (typeof s !== "string" || !s) return ut
  for (const bit of s.split(";")) {
    if (ut.size >= DELING_TAK) break
    const m = /^(\d{1,5})-(\d{1,5})-(\d{1,2}):([\d.]+)$/.exec(bit)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    const k = Number(m[3])
    const t = Number(m[4])
    if (!(a < b) || !Number.isFinite(t)) continue
    if (t < DELING_MIN || t > DELING_MAX) continue
    ut.set(`${a}-${b}-${k}`, +t.toFixed(3))
  }
  return ut
}

export const skrivDeling = (m: ReadonlyMap<string, Deling>): string =>
  [...m.entries()]
    .sort((x, y) => x[0].localeCompare(y[0], "nn", { numeric: true }))
    .map(([k, t]) => `${k}:${+t.toFixed(3)}`)
    .join(";")

export const reinDeling = (s: unknown) => skrivDeling(lesDeling(s))

export const leddNokkel = (a: number, b: number, k: number) =>
  `${Math.min(a, b)}-${Math.max(a, b)}-${k}`

const BERRE_FIL = ["snittveg", "fart"] as const
const BERRE_ARK = ["arkB", "arkH"] as const
const UTANFOR_SNITTET = ["snitt", "fest", ...BERRE_FIL] as const

export type NettParams = Omit<
  Params,
  (typeof UTANFOR_SNITTET)[number] | (typeof BERRE_ARK)[number]
>

const nokkel = (p: ParamBag, keys: readonly string[], cells: number) =>
  cells + "|" + keys.map((k) => p[k]).join("|")

const utan = (drop: readonly string[]) => {
  const s = new Set<string>(drop)
  return ALLE_KEYS.filter((k) => !s.has(k))
}

export const byggKey = (p: ParamBag, cells: number) => nokkel(p, utan(BERRE_FIL), cells)

export const snittKey = (p: ParamBag, cells: number) =>
  nokkel(p, utan([...UTANFOR_SNITTET, ...BERRE_ARK]), cells)

export const DEFAULT_PARAMS: Params = {
  kjelde: "kube",
  scene: "",

  storleik: 150,
  rotX: 0,
  rotY: 0,
  rotZ: 0,

  glatt: 0,
  trekant: 40,

  forenkl: 0,
  hol: 0,

  tjukn: 3,
  lause: 1,
  merk: 0,
  snapp: 3,

  klaring: 0.1,
  ledd: 0.5,
  kilar: 0,

  snitt: 0.2,
  snittveg: 0,
  fart: 20,
  arkB: 600,
  arkH: 400,

  material: "bjork",
  plan: "",
  fest: "",
  deling: "",
}

export function clampParams(o: unknown, prev: Params): Params {
  const ut = clampBag(o, prev, PARAM_RANGES, PARAM_KEYS)
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>
    if (typeof rec.plan === "string") ut.plan = reinPlan(rec.plan)
    if (typeof rec.fest === "string") ut.fest = reinFest(rec.fest)
    if (typeof rec.deling === "string") ut.deling = reinDeling(rec.deling)
    if (typeof rec.scene === "string") ut.scene = reinScene(rec.scene)
  }
  return ut
}
