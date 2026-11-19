import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { flip, makeSoup, reparer, signedVolume } from "../../lib/soup"
import { decimate } from "../../lib/mesh/simplify"
import { FILFORMER } from "../../lib/scene"
import { akser } from "../../lib/plan"
import { boks, lesNett, type Nett } from "./form"
import { lag, type Utfall } from "./lag"
import { plan as planVed, rundt } from "./plan"
import type { Konsept, Params, Plan, Registrert, Utstyr } from "./typar"

type V3 = [number, number, number]
type UtstyrTing = NonNullable<Utstyr["utstyr"]>[number]
type Lys = { punkt: number[]; radius?: number; farge?: string; styrke?: number }
type Modus = { snu?: boolean; drei?: number; vipp?: number; utstyr?: UtstyrTing[]; golv?: number; lys?: V3[]; vegg?: number }
type Gitter = { vinkel?: number; avstand?: number; tal?: number; avstand2?: number; tal2?: number; akse?: "x" | "y" | "z" | V3; fase?: number | [number, number]; fjern?: number[] }
export type Spek = {
  namn?: string
  form: string
  mm?: number
  hogd?: number
  drei?: V3
  gitter?: Gitter
  hol?: { kule: V3; r: number }[]
  tjukn?: number
  material?: string
  farge?: string
  opal?: number[]
  lys?: V3[]
  utstyr?: UtstyrTing[]
  vegg?: number
  golv?: number
  ark?: [number, number]
  modus?: Record<string, Modus>
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const FELT = ["namn", "form", "mm", "hogd", "drei", "gitter", "hol", "tjukn", "material", "farge", "opal", "lys", "utstyr", "vegg", "golv", "ark", "modus"]
const GFELT = ["vinkel", "avstand", "tal", "avstand2", "tal2", "akse", "fase", "fjern"]
const MFELT = ["snu", "drei", "vipp", "utstyr", "golv", "lys", "vegg"]
const UFELT = ["slag", "senter", "diameter", "lengd", "retning", "punkt", "storleik", "matrise", "farge", "metall", "ru", "styrke"]
const SLAG = ["paere", "sokkel", "leidning", "sylinder", "boks", "kule"]
const MATERIAL = ["graa", "bjork", "finer", "mdf", "akryl", "papp"]
const FORMLISTE = "skulptur-01..12, stolform-01..10, sau-01..04, dyr-01..05, kube eller sti til .stl/.glb/.obj/.ply"
const TRIS = 39000
const rad = (g: number) => (g * Math.PI) / 180
const prikk = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const einheit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const kryss = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const komma = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–")
const rest = (v: number, m: number) => ((v % m) + m) % m
const runda = (v: number) => +v.toFixed(2)
const erTal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const erV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(erTal)
const erHeil = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi

function krev(ok: unknown, melding: string) {
  if (!ok) throw new Error(melding)
}

function sjekkFelt(o: unknown, lov: readonly string[], kvar: string) {
  krev(o && typeof o === "object" && !Array.isArray(o), `${kvar} må vere eit objekt med felta ${lov.join(" ")}`)
  for (const k of Object.keys(o as object)) if (!lov.includes(k)) throw new Error(`ukjent felt «${k}» i ${kvar} (kjende: ${lov.join(" ")})`)
}

function sjekkUtstyr(l: unknown, kvar: string) {
  krev(Array.isArray(l), `${kvar} må vere ei liste`)
  for (const [i, u] of (l as UtstyrTing[]).entries()) {
    sjekkFelt(u, UFELT, `${kvar}[${i}]`)
    krev(SLAG.includes(u.slag), `${kvar}[${i}].slag må vere ${SLAG.join(" ")}`)
    for (const k of ["senter", "retning"] as const) krev(u[k] === undefined || erV3(u[k]), `${kvar}[${i}].${k} må vere [x,y,z]`)
    krev(u.punkt === undefined || (Array.isArray(u.punkt) && u.punkt.every(erV3)), `${kvar}[${i}].punkt må vere [[x,y,z],…]`)
    krev(u.matrise === undefined || (Array.isArray(u.matrise) && u.matrise.length === 16 && u.matrise.every(erTal)), `${kvar}[${i}].matrise må vere 16 tal, kolonnevis`)
  }
}

function sjekkLys(l: unknown, kvar: string) {
  krev(Array.isArray(l) && l.every(erV3), `${kvar} må vere [[x,y,z],…]`)
}

function lesSpek(sti: string): Spek {
  const s = JSON.parse(readFileSync(sti, "utf8")) as Spek
  sjekkFelt(s, FELT, "speken")
  krev(typeof s.form === "string", `speken manglar «form» (${FORMLISTE})`)
  for (const k of ["mm", "hogd", "vegg", "golv"] as const) krev(s[k] === undefined || erTal(s[k]), `«${k}» må vere eit tal`)
  krev(s.tjukn === undefined || (erTal(s.tjukn) && s.tjukn >= 1 && s.tjukn <= 25), "«tjukn» må vere eit tal 1–25 mm")
  krev(s.drei === undefined || erV3(s.drei), "«drei» må vere [x,y,z] grader")
  krev(s.ark === undefined || (Array.isArray(s.ark) && s.ark.length === 2 && s.ark.every((v) => erTal(v) && v > 0)), "«ark» må vere [B,H] mm")
  krev(s.opal === undefined || (Array.isArray(s.opal) && s.opal.every(Number.isInteger)), "«opal» må vere ei liste med plate-id")
  if (s.lys !== undefined) sjekkLys(s.lys, "lys")
  if (s.utstyr !== undefined) sjekkUtstyr(s.utstyr, "utstyr")
  if (s.material) krev(MATERIAL.includes(s.material), `material «${s.material}» er ukjent (${MATERIAL.join(" ")})`)
  krev(s.hol === undefined || Array.isArray(s.hol), "«hol» må vere [{kule:[x,y,z], r},…]")
  for (const [i, h] of (s.hol ?? []).entries()) {
    sjekkFelt(h, ["kule", "r"], `hol[${i}]`)
    krev(erV3(h.kule) && erTal(h.r) && h.r > 0, `hol[${i}] må ha kule [x,y,z] og r > 0`)
  }
  const g = s.gitter
  if (g !== undefined) {
    sjekkFelt(g, GFELT, "gitter")
    const tj = s.tjukn ?? 3
    for (const k of ["avstand", "avstand2"] as const) krev(g[k] === undefined || (erTal(g[k]) && g[k]! >= 3 * tj), `gitter.${k} må vere minst 3 × tjukn = ${3 * tj} mm (nærare plater står i kvarandre)`)
    for (const k of ["tal", "tal2"] as const) krev(g[k] === undefined || erHeil(g[k], 1, 80), `gitter.${k} må vere eit heiltal 1–80`)
    krev(g.vinkel === undefined || erTal(g.vinkel), "gitter.vinkel må vere grader")
    krev(g.akse === undefined || ["x", "y", "z"].includes(g.akse as string) || (erV3(g.akse) && Math.hypot(...g.akse) > 1e-6), "gitter.akse må vere \"x\", \"y\", \"z\" eller [x,y,z] ulik 0")
    krev(g.fase === undefined || erTal(g.fase) || (Array.isArray(g.fase) && g.fase.length === 2 && g.fase.every(erTal)), "gitter.fase må vere eit tal eller [a,b]")
    krev(g.fjern === undefined || (Array.isArray(g.fjern) && g.fjern.every(Number.isInteger)), "gitter.fjern må vere ei liste med plate-id")
  }
  krev(s.modus === undefined || (typeof s.modus === "object" && !Array.isArray(s.modus)), "«modus» må vere {namn: {snu, drei, vipp, …}}")
  for (const [n, m] of Object.entries(s.modus ?? {})) {
    sjekkFelt(m, MFELT, `modus.${n}`)
    krev(m.snu === undefined || typeof m.snu === "boolean", `modus.${n}.snu må vere true/false`)
    for (const k of ["drei", "vipp", "golv", "vegg"] as const) krev(m[k] === undefined || erTal(m[k]), `modus.${n}.${k} må vere eit tal`)
    if (m.lys !== undefined) sjekkLys(m.lys, `modus.${n}.lys`)
    if (m.utstyr !== undefined) sjekkUtstyr(m.utstyr, `modus.${n}.utstyr`)
  }
  return s
}

function lesForm(s: Spek, mappe: string): Nett {
  if (s.form === "kube") return boks(1, 1, 1)
  if (FILFORMER.includes(s.form)) return lesNett(join(REPO, "public", "form", `${s.form}.glb`))
  const sti = resolve(mappe, s.form)
  if (!existsSync(sti)) throw new Error(`form «${s.form}» finst ikkje: bruk ${FORMLISTE}`)
  return lesNett(sti)
}

function avgrens(pos: Nett): Nett {
  const r = reparer(makeSoup(pos))
  const d = r.idx.length / 3 > TRIS ? decimate(r, TRIS) : r
  const m = signedVolume(d) < 0 ? flip(d) : d
  const ut = new Float32Array(m.idx.length * 3)
  for (let i = 0; i < m.idx.length; i++) for (let a = 0; a < 3; a++) ut[i * 3 + a] = m.verts[m.idx[i] * 3 + a]
  return ut
}

function boksAv(pos: Nett): { mn: V3; mx: V3 } {
  const mn: V3 = [Infinity, Infinity, Infinity]
  const mx: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i + a]); mx[a] = Math.max(mx[a], pos[i + a]) }
  return { mn, mx }
}

function grunnkropp(s: Spek, mappe: string): { nett: Nett; H: number } {
  const raa = avgrens(lesForm(s, mappe))
  const [ax, ay, az] = (s.drei ?? [0, 0, 0]).map(rad)
  const R = (p: V3): V3 => {
    let [x, y, z] = p
    ;[y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)]
    ;[x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)]
    ;[x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)]
    return [x, y, z]
  }
  const nett = new Float32Array(raa.length)
  for (let i = 0; i < raa.length; i += 3) nett.set(R([raa[i], raa[i + 1], raa[i + 2]]), i)
  const { mn, mx } = boksAv(nett)
  const side = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const k = s.hogd ? s.hogd / side[2] : (s.mm ?? 200) / Math.max(...side)
  if (Math.max(...side) * k > 600 || Math.max(...side) * k < 40) throw new Error(`lengste side vert ${komma(Math.max(...side) * k, 0)} mm: må vere 40–600 (set mm eller hogd)`)
  const c: V3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]]
  for (let i = 0; i < nett.length; i += 3) for (let a = 0; a < 3; a++) nett[i + a] = (nett[i + a] - c[a]) * k
  return { nett, H: side[2] * k }
}

function inni(nett: Nett, p: V3): boolean {
  let n = 0
  for (let i = 0; i < nett.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = nett.subarray(i, i + 9)
    const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if (Math.abs(d) < 1e-12) continue
    const u = ((p[0] - ax) * (cy - ay) - (cx - ax) * (p[1] - ay)) / d
    const v = ((bx - ax) * (p[1] - ay) - (p[0] - ax) * (by - ay)) / d
    if (u < 0 || v < 0 || u + v > 1) continue
    if (az + u * (bz - az) + v * (cz - az) > p[2]) n++
  }
  return n % 2 === 1
}

type Familie = { n: V3; avstand: number; tal: number; fraa: number }
type Tilstand = { fjern: number[]; fase: [number, number]; ark: [number, number]; halv: Set<number>; nudd: Set<number> }

function familiar(g: Gitter, kropp: { nett: Nett; H: number }): [Familie, Familie] {
  const A = einheit(g.akse === "x" ? [1, 0, 0] : g.akse === "y" ? [0, 1, 0] : Array.isArray(g.akse) ? g.akse : [0, 0, 1])
  const ref: V3 = Math.abs(A[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const e1 = einheit([ref[0] - A[0] * prikk(A, ref), ref[1] - A[1] * prikk(A, ref), ref[2] - A[2] * prikk(A, ref)])
  const e2 = kryss(A, e1)
  const a = rad(g.vinkel ?? 45)
  const n1: V3 = [Math.cos(a) * e1[0] + Math.sin(a) * e2[0], Math.cos(a) * e1[1] + Math.sin(a) * e2[1], Math.cos(a) * e1[2] + Math.sin(a) * e2[2]]
  const n2: V3 = kryss(A, n1)
  const fyll = (n: V3, avstand: number) => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < kropp.nett.length; i += 3) {
      const d = n[0] * kropp.nett[i] + n[1] * kropp.nett[i + 1] + n[2] * (kropp.nett[i + 2] - kropp.H / 2)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    return Math.max(1, Math.floor((hi - lo - avstand / 2) / avstand) + 1)
  }
  const a1 = g.avstand ?? 30
  const a2 = g.avstand2 ?? a1
  const tal = g.tal ?? fyll(n1, a1)
  return [
    { n: n1, avstand: a1, tal, fraa: 1 },
    { n: n2, avstand: a2, tal: g.tal2 ?? (g.tal !== undefined ? tal : fyll(n2, a2)), fraa: tal <= 20 ? 21 : 101 },
  ]
}

type Stad = { id: number; fam: number; d: number }

function stader(fam: readonly Familie[], t: Tilstand): Stad[] {
  return fam.flatMap((f, j) => Array.from({ length: f.tal }, (_, i) => ({ id: f.fraa + i, fam: j, d: (i - (f.tal - 1) / 2) * f.avstand + t.fase[j] })))
}

function modusKonsept(s: Spek, namn: string, m: Modus, kropp: { nett: Nett; H: number }, fam: readonly Familie[], t: Tilstand): Konsept {
  const H = kropp.H
  const g = rad(m.drei ?? 0)
  const G = (p: V3): V3 => {
    const q: V3 = m.snu ? [p[0], -p[1], H - p[2]] : p
    return [q[0] * Math.cos(g) - q[1] * Math.sin(g), q[0] * Math.sin(g) + q[1] * Math.cos(g), q[2]]
  }
  const GD = (d: V3): V3 => {
    const q: V3 = m.snu ? [d[0], -d[1], -d[2]] : d
    return [q[0] * Math.cos(g) - q[1] * Math.sin(g), q[0] * Math.sin(g) + q[1] * Math.cos(g), q[2]]
  }
  const v = rad(m.vipp ?? 0)
  const R = (p: V3): V3 => [p[0], p[1] * Math.cos(v) - p[2] * Math.sin(v), p[1] * Math.sin(v) + p[2] * Math.cos(v)]
  const nett = new Float32Array(kropp.nett.length)
  for (let i = 0; i < nett.length; i += 3) nett.set(R(G([kropp.nett[i], kropp.nett[i + 1], kropp.nett[i + 2]])), i)
  const { mn, mx } = boksAv(nett)
  const S: V3 = [-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]]
  for (let i = 0; i < nett.length; i += 3) for (let a = 0; a < 3; a++) nett[i + a] += S[a]
  const P = (p: V3): V3 => { const r = R(G(p)); return [r[0] + S[0], r[1] + S[1], r[2] + S[2]] }
  const D = (d: V3): V3 => R(GD(d))
  const midt: V3 = [0, 0, H / 2]
  const plan = (k: Registrert): Plan[] =>
    stader(fam, t)
      .filter((q) => !t.fjern.includes(q.id))
      .map((q) => {
        const n0 = fam[q.fam].n
        const pl = planVed(k, q.id, P([midt[0] + n0[0] * q.d, midt[1] + n0[1] * q.d, midt[2] + n0[2] * q.d]), D(n0))
        const o: V3 = [k.min[0] + pl.o[0] * k.side[0], k.min[1] + pl.o[1] * k.side[1], k.min[2] + pl.o[2] * k.side[2]]
        const { u, v: w } = akser(pl.n)
        for (const h of s.hol ?? []) {
          const C = P(h.kule)
          const r: V3 = [C[0] - o[0], C[1] - o[1], C[2] - o[2]]
          const dl = prikk(r, pl.n)
          if (Math.abs(dl) >= h.r) continue
          pl.strek.push(rundt(k, "hol", 2 * Math.sqrt(h.r * h.r - dl * dl), prikk(r, u), prikk(r, w)))
        }
        return pl
      })
  const bag: Partial<Params> = { tjukn: s.tjukn ?? 3, material: s.material ?? "mdf", klaring: 0.1, snitt: 0.2, arkB: t.ark[0], arkH: t.ark[1] }
  const delar: NonNullable<Utstyr["delar"]> = {}
  for (const q of stader(fam, t)) delar[String(q.id)] = { ...(s.farge ? { farge: s.farge } : {}), ...((s.opal ?? []).includes(q.id) ? { material: "akryl-opal" } : {}) }
  const flyttMatrise = (M: number[]): number[] => {
    const ut = [...M]
    for (const c of [0, 4, 8]) ut.splice(c, 3, ...D([M[c], M[c + 1], M[c + 2]]))
    ut.splice(12, 3, ...P([M[12], M[13], M[14]]))
    return ut
  }
  const flyttUtstyr = (u: UtstyrTing): UtstyrTing => ({
    ...u,
    ...(u.senter ? { senter: P(u.senter as V3) } : {}),
    ...(u.retning ? { retning: D(u.retning as V3) } : {}),
    ...(u.punkt ? { punkt: u.punkt.map((q) => P(q as V3)) } : {}),
    ...(u.matrise ? { matrise: flyttMatrise(u.matrise) } : u.slag === "boks" && u.senter ? { matrise: flyttMatrise([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...u.senter, 1]) } : {}),
  })
  const lys = (m.lys ?? s.lys ?? []).map((q): Lys => ({ punkt: P(q), radius: 9, farge: "#ffcf9a", styrke: 1.4 }))
  const vegg = m.vegg ?? s.vegg
  const golv = m.golv ?? s.golv
  const utstyr: Utstyr = {
    delar,
    utstyr: (m.utstyr ?? s.utstyr ?? []).map(flyttUtstyr),
    ...(lys.length ? { lys } : {}),
    ...(vegg !== undefined ? { vegg: { punkt: [0, vegg, 0], normal: [0, -1, 0] } } : {}),
    ...(golv !== undefined ? { golv } : {}),
  }
  return { namn, kropp: () => nett, bag, plan, utstyr }
}

type Framlegg = { fjern: number[]; fase: [number, number] | null; halv: number[]; nudd: number[]; ekstra: string[] }

function framlegg(utfall: readonly Utfall[], fam: readonly Familie[], t: Tilstand): Framlegg {
  const st = new Map(stader(fam, t).map((q) => [q.id, q]))
  const ytst = (ids: readonly number[]) => [...ids].filter((i) => st.has(i)).sort((a, b) => Math.abs(st.get(b)!.d) - Math.abs(st.get(a)!.d) || b - a)[0]
  const fjern = new Set<number>()
  const df: [number, number] = [0, 0]
  const halv: number[] = []
  const nudd: number[] = []
  const ekstra = new Set<string>()
  const halver = (j: number, ids: readonly number[]) => {
    if (!t.halv.has(j) && !df[j]) { df[j] = fam[j].avstand / 2; halv.push(j) }
    else if (!t.halv.has(j)) return
    else for (const i of ids) fjern.add(i)
  }
  const paar = (par: readonly [number, number][]) => { for (const [a, c] of par) { const y = ytst([a, c]); if (y !== undefined) fjern.add(y) } }
  for (const u of utfall)
    for (const b of u.brot) {
      const ids = b.ids ?? []
      if ((b.regel === "klem" || b.regel === "spalte") && b.par?.length) paar(b.par)
      else if ((b.regel === "gods" || b.regel === "orden" || b.regel === "fin") && ids.length) { const y = ytst(ids); if (y !== undefined) fjern.add(y) }
      else if (b.regel === "lause") {
        const fj = [...new Set(ids.map((i) => st.get(i)?.fam).filter((j): j is number => j !== undefined))]
        if (fj.length) for (const j of fj) halver(j, ids.filter((i) => st.get(i)?.fam === j))
        else if (!t.halv.has(0)) halver(0, [])
        else if (!t.halv.has(1)) halver(1, [])
      } else if (b.regel === "tommeplan" && ids.length) {
        for (const j of new Set(ids.map((i) => st.get(i)?.fam).filter((j): j is number => j !== undefined))) {
          const mine = ids.filter((i) => st.get(i)?.fam === j)
          const kant = mine.filter((i) => i === fam[j].fraa || i === fam[j].fraa + fam[j].tal - 1)
          for (const i of kant) fjern.add(i)
          if (kant.length < mine.length) {
            if (!t.nudd.has(j) && !df[j]) { df[j] = 0.5; nudd.push(j) }
            else for (const i of mine) fjern.add(i)
          }
        }
      } else if (b.regel === "paaark") ekstra.add("mm ned, eller \"ark\":[B,H] om laseren tek det")
    }
  const fase: [number, number] | null = df[0] || df[1] ? [runda(rest(t.fase[0] + df[0], fam[0].avstand)), runda(rest(t.fase[1] + df[1], fam[1].avstand))] : null
  return { fjern: [...fjern].filter((i) => !t.fjern.includes(i)).sort((a, b) => a - b), fase, halv, nudd, ekstra: [...ekstra] }
}

function lapp(fjern: readonly number[], fase: [number, number] | null): string {
  const o: Gitter = {}
  if (fjern.length) o.fjern = [...new Set(fjern)].sort((a, b) => a - b)
  if (fase) o.fase = fase[0] === fase[1] ? fase[0] : fase
  return JSON.stringify(o)
}

function brotTekst(u: Utfall): string {
  const kort = (v: string) => {
    const ut: string[] = []
    for (const del of v.split(" — ")[0].split(" · ")) {
      if (ut.join(" · ").length + del.length > 60) return `${ut.join(" · ")} …`
      ut.push(del)
    }
    return ut.join(" · ")
  }
  const ord = u.brot.map((b) => {
    const ids = b.ids ?? []
    if (b.regel === "klem" && b.par?.length) return `klem ${b.par.slice(0, 6).map(([a, c]) => `${a}–${c}`).join(", ")}${b.par.length > 6 ? " …" : ""}`
    if (b.regel === "gods") return `gods ${komma(u.godsMm)} mm${ids.length ? ` [${ids.slice(0, 6).join(",")}]` : ""}`
    if (b.regel === "lause") return ids.length ? `lause plan ${ids.join(",")}` : `lause ${kort(b.verdi)}`
    if (b.regel === "tommeplan") return `tomme plan ${ids.join(",")}`
    if (b.regel === "orden") return `orden ${ids.join(",")}`
    if (b.regel === "spalte") return `spalte plan ${ids.join(",")}`
    if (b.regel === "fin") return ids.length ? `fin plan ${ids.join(",")}` : `fin ${kort(b.verdi)}`
    return `${b.regel} ${kort(b.verdi)}`
  })
  return [...new Set(ord)].join(" · ")
}

type Del = { omriss: number[][]; hol?: number[][][]; matrise: number[]; masseKg: number; tjukn: number; krumming?: number }

function iRing(r: readonly number[][], x: number, y: number): boolean {
  let inn = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn
  }
  return inn
}

function tyngdpunkt(r: readonly number[][]): [number, number, number] {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]
    a += k
    cx += (r[j][0] + r[i][0]) * k
    cy += (r[j][1] + r[i][1]) * k
  }
  return a ? [Math.abs(a / 2), cx / (3 * a), cy / (3 * a)] : [0, 0, 0]
}

function skrog(p: [number, number][]): [number, number][] {
  const q = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (q.length < 3) return q
  const x = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = []
  const hi: [number, number][] = []
  for (const v of q) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], v) <= 0) lo.pop(); lo.push(v) }
  for (const v of [...q].reverse()) { while (hi.length > 1 && x(hi[hi.length - 2], hi[hi.length - 1], v) <= 0) hi.pop(); hi.push(v) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}

function margin(h: [number, number][], c: [number, number]): number {
  const seg = (a: number[], b: number[]) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / l)) : 0
    return Math.hypot(c[0] - a[0] - t * dx, c[1] - a[1] - t * dy)
  }
  if (h.length === 1) return -Math.hypot(c[0] - h[0][0], c[1] - h[0][1])
  const d = Math.min(...h.map((a, i) => seg(a, h[(i + 1) % h.length])))
  const inne = h.length > 2 && h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) >= 0 })
  return inne ? d : -d
}

function maal(mappe: string): { staar: number; skjerm: number | null } | null {
  const fil = join(mappe, "delar.json")
  if (!existsSync(fil)) return null
  const delar = (JSON.parse(readFileSync(fil, "utf8")) as { delar: Del[] }).delar.filter((d) => !d.krumming && d.omriss?.length > 2)
  if (!delar.length) return null
  const verd = (m: number[], x: number, y: number, z: number): V3 => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
  let masse = 0
  const c: V3 = [0, 0, 0]
  const punkt: V3[] = []
  for (const d of delar) {
    const [a0, x0, y0] = tyngdpunkt(d.omriss)
    let a = a0
    let sx = a0 * x0
    let sy = a0 * y0
    for (const h of d.hol ?? []) { const [ah, xh, yh] = tyngdpunkt(h); a -= ah; sx -= ah * xh; sy -= ah * yh }
    const w = verd(d.matrise, a ? sx / a : x0, a ? sy / a : y0, d.tjukn / 2)
    for (let k = 0; k < 3; k++) c[k] += w[k] * d.masseKg
    masse += d.masseKg
    for (const [x, y] of d.omriss) punkt.push(verd(d.matrise, x, y, 0), verd(d.matrise, x, y, d.tjukn))
  }
  const zmin = Math.min(...punkt.map((p) => p[2]))
  const fot = skrog(punkt.filter((p) => p[2] < zmin + 1).map((p): [number, number] => [p[0], p[1]]))
  const staar = margin(fot, [c[0] / masse, c[1] / masse])
  const sc = join(mappe, "scene.json")
  const lys = existsSync(sc) ? ([] as Lys[]).concat((JSON.parse(readFileSync(sc, "utf8")) as { lys?: Lys | Lys[] }).lys ?? []) : []
  if (!lys.length) return { staar, skjerm: null }
  const N = 720
  let treff = 0
  let alle = 0
  for (const l of lys)
    for (let i = 0; i < N; i++) {
      const z = 1 - (2 * (i + 0.5)) / N
      if (Math.abs(z) > 0.5) continue
      const r = Math.sqrt(1 - z * z)
      const f = i * Math.PI * (3 - Math.sqrt(5))
      const dir: V3 = [r * Math.cos(f), r * Math.sin(f), z]
      alle++
      if (delar.some((d) => {
        const m = d.matrise
        const n: V3 = [m[8], m[9], m[10]]
        const o: V3 = [m[12] + (n[0] * d.tjukn) / 2, m[13] + (n[1] * d.tjukn) / 2, m[14] + (n[2] * d.tjukn) / 2]
        const nd = prikk(dir, n)
        if (Math.abs(nd) < 1e-9) return false
        const t = (prikk(o, n) - prikk(l.punkt, n)) / nd
        if (t < 0.5) return false
        const q = [l.punkt[0] + t * dir[0] - m[12], l.punkt[1] + t * dir[1] - m[13], l.punkt[2] + t * dir[2] - m[14]]
        const x = q[0] * m[0] + q[1] * m[1] + q[2] * m[2]
        const y = q[0] * m[4] + q[1] * m[5] + q[2] * m[6]
        return iRing(d.omriss, x, y) && !(d.hol ?? []).some((h) => iRing(h, x, y))
      })) treff++
    }
  return { staar, skjerm: alle ? treff / alle : null }
}

function snittAreal(p: Nett, z: number, mn: V3, mx: V3): number {
  const seg: number[][] = []
  for (let i = 0; i < p.length; i += 9) {
    const q: number[][] = []
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      const za = p[i + a + 2] - z
      const zb = p[i + b + 2] - z
      if (za > 0 === zb > 0) continue
      const t = za / (za - zb)
      q.push([p[i + a] + t * (p[i + b] - p[i + a]), p[i + a + 1] + t * (p[i + b + 1] - p[i + a + 1])])
    }
    if (q.length === 2) seg.push([...q[0], ...q[1]])
  }
  const N = 48
  const dy = (mx[1] - mn[1]) / N
  let a = 0
  for (let r = 0; r < N; r++) {
    const y = mn[1] + (r + 0.5) * dy
    const xs = seg.filter((g) => g[1] > y !== g[3] > y).map((g) => g[0] + ((y - g[1]) / (g[3] - g[1])) * (g[2] - g[0])).sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) a += (xs[k + 1] - xs[k]) * dy
  }
  return a
}

function former(): string[] {
  return ["kube", ...FILFORMER].map((f) => {
    const p = f === "kube" ? boks(1, 1, 1) : lesNett(join(REPO, "public", "form", `${f}.glb`))
    const { mn, mx } = boksAv(p)
    const s = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
    let vol = 0
    for (let i = 0; i < p.length; i += 9) vol += prikk([p[i], p[i + 1], p[i + 2]], kryss([p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]])) / 6
    const h = Array.from({ length: 9 }, (_, k) => (k + 1) / 10)
    const ar = h.map((v) => snittAreal(p, mn[2] + v * s[2] + 1e-7, mn, mx))
    const stor = Math.max(...ar) || 1
    const lo = ar.indexOf(Math.min(...ar))
    const hi = ar.indexOf(Math.max(...ar))
    return `${f.padEnd(12)} ${s.map((v) => (v / s[2]).toFixed(2)).join("×")}  fyll ${Math.round((Math.abs(vol) / (s[0] * s[1] * s[2])) * 100)} %  snitt ${ar.map((v) => Math.round((v / stor) * 9)).join("")}  smalast ${(ar[lo] / stor).toFixed(2)} ved ${h[lo].toFixed(1)} H, breiast ved ${h[hi].toFixed(1)} H`
  })
}

export type SpekVal = { auto?: boolean; bilete?: boolean; full?: boolean; ut?: string }
export type SpekSvar = { liner: string[]; ok: boolean; kode: number; filer: string[]; auto?: string }

export async function koeyrSpek(sti: string, val: SpekVal = {}, rot = process.cwd()): Promise<SpekSvar> {
  const s = lesSpek(sti)
  const mappe = dirname(sti)
  const namn = s.namn ?? basename(sti).replace(/\.(auto\.)?json$/i, "")
  const kropp = grunnkropp(s, mappe)
  const modi = Object.entries(s.modus && Object.keys(s.modus).length ? s.modus : { [namn]: {} })
  const fam = familiar(s.gitter ?? {}, kropp)
  const f0 = s.gitter?.fase
  const fase0: [number, number] = Array.isArray(f0) ? [f0[0], f0[1]] : [f0 ?? 0.1, f0 ?? 0.1]
  const t: Tilstand = { fjern: [...(s.gitter?.fjern ?? [])], fase: [...fase0], ark: s.ark ?? [600, 400], halv: new Set(), nudd: new Set() }
  for (const j of [0, 1]) {
    if (Math.abs(rest(t.fase[j], fam[j].avstand) - fam[j].avstand / 2) < 1) t.halv.add(j)
    if (Math.abs(rest(t.fase[j], 1) - 0.6) < 0.05) t.nudd.add(j)
  }
  const utRot = resolve(val.ut ?? join(mappe, "ut", namn))
  const liner: string[] = []
  const morke = [...(s.lys ?? []), ...modi.flatMap(([, m]) => m.lys ?? [])].filter((p, i, a) => a.findIndex((q) => q.join() === p.join()) === i && inni(kropp.nett, p) && !(s.hol ?? []).some((h) => Math.hypot(p[0] - h.kule[0], p[1] - h.kule[1], p[2] - h.kule[2]) < h.r))
  if (morke.length) liner.push(`åtvaring: lys ${morke.map((p) => `[${p.join(",")}]`).join(" ")} ligg i gods utan hol: platene skjer gjennom lyset`)
  let utfall: Utfall[] = []
  let rundar = 0
  let grunn = ""
  for (;;) {
    utfall = []
    for (const [mn, m] of modi) {
      const kon = modusKonsept(s, modi.length > 1 ? `${namn}-${mn}` : namn, m, kropp, fam, t)
      utfall.push(await lag(kon, { ut: join(utRot, mn), rask: !val.full, bilete: val.bilete ? "ark" : "ingen" }))
    }
    if (utfall.every((u) => u.ok) || !val.auto) break
    if (rundar >= 6) { grunn = "6 rundar"; break }
    const f = framlegg(utfall, fam, t)
    if (!f.fjern.length && !f.fase) { grunn = `ingen fleire framlegg${f.ekstra.length ? `: ${f.ekstra.join(" · ")}` : ""}`; break }
    const alle = stader(fam, t).length
    const att = alle - new Set([...t.fjern, ...f.fjern]).size
    if (att < 4 || att <= alle / 2) { grunn = `ville fjerne ${alle - att} av ${alle}`; break }
    t.fjern.push(...f.fjern)
    if (f.fase) t.fase = f.fase
    for (const j of f.halv) t.halv.add(j)
    for (const j of f.nudd) t.nudd.add(j)
    rundar++
  }
  const ok = utfall.every((u) => u.ok)
  const breidd = Math.max(...modi.map(([n]) => n.length))
  let synBrest = false
  utfall.forEach((u, i) => {
    const mn = modi[i][0].padEnd(breidd)
    const mal = `${u.mal.map((v) => komma(v, 0)).join("×")} mm`
    const utan = val.bilete && !u.filer.ark
    if (utan) synBrest = true
    const syn = u.synFeil.length || utan ? ` · syn: ${(u.synFeil[0] ?? "inga ark.png").slice(0, 60)}` : ""
    if (!u.ok) return void liner.push(`${mn}  BROT ${brotTekst(u)} · ${mal}${syn}`)
    const mm = maal(join(utRot, modi[i][0]))
    const staar = mm ? (mm.staar >= 0 ? ` · står ${komma(mm.staar, 0)} mm` : ` · VIPPAR ${komma(-mm.staar, 0)} mm`) : ""
    const skjerm = mm?.skjerm != null ? ` · skjerm ${Math.round(mm.skjerm * 100)} %` : ""
    const fin = u.finArk !== null && u.finArk !== u.ark ? ` (fin ${u.finArk})` : ""
    liner.push(`${mn}  ALT OK  ${u.delar} delar · ${u.ledd} ledd · ${u.ark} ark${fin} · ${komma(u.kg, 2)} kg · ${mal}${staar}${skjerm}${syn}`)
  })
  if (!ok && !val.auto) {
    const f = framlegg(utfall, fam, t)
    const g = f.fjern.length || f.fase ? `gitter ${lapp([...t.fjern, ...f.fjern], f.fase)}` : ""
    const fiks = utfall.flatMap((u) => u.brot).find((b) => b.fiks)?.fiks
    const ord = [g, ...f.ekstra].filter(Boolean)
    if (ord.length) liner.push(`→ prøv: ${ord.join(" · ")}  (eller --auto)`)
    else if (fiks) liner.push(`→ motoren: ${fiks}`)
    else liner.push("→ endre avstand, tal, vinkel 0↔45 eller mm")
  }
  let auto: string | undefined
  const endraFase = t.fase[0] !== fase0[0] || t.fase[1] !== fase0[1] ? t.fase : null
  if (val.auto && ok && !rundar) liner.push("auto: ingenting å rette")
  else if (val.auto && ok) {
    const g: Gitter = { ...(s.gitter ?? {}), fjern: [...new Set(t.fjern)].sort((a, b) => a - b), fase: t.fase[0] === t.fase[1] ? t.fase[0] : [t.fase[0], t.fase[1]] }
    auto = join(mappe, `${basename(sti).replace(/(\.auto)?\.json$/i, "")}.auto.json`)
    writeFileSync(auto, skrivSpek({ ...s, gitter: g }))
    liner.push(`auto: OK etter ${rundar} ${rundar === 1 ? "runde" : "rundar"} · gitter ${lapp(t.fjern, endraFase)} → ${basename(auto)}${val.full ? "" : " · køyr --full før skjering"}`)
  } else if (val.auto) liner.push(`auto: gav opp etter ${rundar} ${rundar === 1 ? "runde" : "rundar"} (${grunn}), ingen fil${rundar ? ` · linene gjeld gitter ${lapp(t.fjern, endraFase)}` : ""} → endre avstand, tal, vinkel 0↔45 eller mm`)
  const filer = utfall.flatMap((u) => [u.filer.ark, u.filer.zip, u.filer.fin].filter((q): q is string => !!q))
  if (filer.length) liner.push(`filer: ${relativ(utRot, rot).startsWith("..") || /^[a-z]:|^\//i.test(relativ(utRot, rot)) ? `<spekmappa>/${relativ(utRot, mappe)}` : relativ(utRot, rot)}/ ${filer.map((q) => relativ(q, utRot)).join(" ")}`)
  return { liner, ok, kode: ok ? (synBrest ? 2 : 0) : 1, filer, ...(auto ? { auto } : {}) }
}

export const skrivSpek = (s: Spek) => `{\n${Object.entries(s).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`

function relativ(s: string, rot: string): string {
  const r = relative(rot, s)
  return (r.startsWith("..") ? s : r || ".").replace(/\\/g, "/")
}

const BRUK = "bruk: pnpm -s lampe <spek.json> [--auto] [--bilete] [--full] [--ut <mappe>] [--feil] | pnpm -s lampe --former"
const FLAGG = ["--auto", "--bilete", "--full", "--ut", "--feil", "--former"]

async function hovud() {
  const arg = process.argv.slice(2)
  const ui = arg.indexOf("--ut")
  const fri = arg.filter((a, i) => !a.startsWith("--") && (ui < 0 || i !== ui + 1))
  const rot = process.env.INIT_CWD ?? process.cwd()
  const ukjend = arg.filter((a) => a.startsWith("--") && !FLAGG.includes(a))
  const feil = ukjend.length ? `ukjent flagg ${ukjend.join(" ")}` : ui >= 0 && (!arg[ui + 1] || arg[ui + 1].startsWith("--")) ? "--ut treng ei mappe" : fri.length > 1 ? `éin spek om gongen, fekk ${fri.join(" ")}` : ""
  if (feil || (!fri[0] && !arg.includes("--former"))) {
    console.log(feil ? `FEIL ${feil}\n${BRUK}` : BRUK)
    process.exitCode = 2
    return
  }
  try {
    if (!fri[0]) {
      console.log(former().join("\n"))
      return
    }
    const svar = await koeyrSpek(resolve(rot, fri[0]), { auto: arg.includes("--auto"), bilete: arg.includes("--bilete"), full: arg.includes("--full"), ...(ui >= 0 ? { ut: resolve(rot, arg[ui + 1]) } : {}) }, rot)
    console.log(svar.liner.join("\n"))
    process.exitCode = svar.kode
  } catch (e) {
    const m = e instanceof SyntaxError ? `speken er ikkje gyldig JSON: ${e.message}` : String((e as Error).message ?? e).split("\n")[0]
    console.log(arg.includes("--feil") ? String((e as Error).stack ?? e) : `FEIL ${m}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void hovud()
