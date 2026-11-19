import type { Params } from "../../lib/params"
import type { Plan } from "../../lib/plan"
import type { Kutt, Metrics, Pt, Vec3 } from "../../lib/core"
import type { Nett, Registrert } from "./form"
import type { DelData, DelUt } from "./skriv"
import type { Scene } from "./syn"
import type { Ekstra } from "./ekstra"

export type { Params, Plan, Pt, Vec3, Nett, Registrert, DelData, DelUt, Ekstra }

export type Krav = { id?: string; namn: string; ok: boolean; verdi: string }

export type Hol = { d: number; rMin: number; rMax: number; senter: Pt; iKroppen: Vec3; punkt: number; iLuft: boolean }

export type Kontekst = {
  k: Registrert
  p: Params
  m: Metrics
  liste: Kutt[]
  tappar: number
  data: DelData
  del(adr: string): DelUt | undefined
  hol(adr: string): Hol[]
  fri(a: Vec3, b: Vec3, utan?: readonly string[]): { mm: number; del: string }
  krav(namn: string, ok: boolean, verdi: string): Krav
  holKrav(adr: string, d: number, minus?: number, pluss?: number): Krav
  friKrav(namn: string, a: Vec3, b: Vec3, minst: number, utan?: readonly string[]): Krav
}

export type Utstyr = Omit<Scene, "delar" | "deler" | "steg" | "orden" | "glb" | "namn"> & {
  delar?: Record<string, { material?: string; farge?: string; speglSide?: 1 | -1 | 0 }>
  ekstra?: Ekstra[]
  steg?: { delar: string[]; retning?: number[] | null }[]
}

export type Konsept = {
  namn: string
  kropp(): Nett | string
  bag?: Partial<Params>
  plan: Plan[] | string | ((k: Registrert) => Plan[] | string)
  utstyr?: Utstyr
  krav?(x: Kontekst): Krav[]
}
