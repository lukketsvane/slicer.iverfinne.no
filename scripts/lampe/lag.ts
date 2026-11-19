import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { MOTOR } from "../../lib/motor"
import { makeBygg } from "../../lib/bygg"
import { DETAIL } from "../../lib/snitt"
import { DEFAULT_PARAMS, type Params } from "../../lib/params"
import { avFlata, inn, lesPlan, skrivPlan, type Plan, type Ramme } from "../../lib/plan"
import { inRing, shoelace, type ParamBag, type Pt, type Rule, type Vec3 } from "../../lib/core"
import { sporPunkt } from "../../lib/stykke"
import { lesNett, registrer, sjekkNett, skrivStl, type Nett, type Registrert } from "./form"
import { arkInfo, delData, skrivAlt, type DelData, type Manifest } from "./skriv"
import { syn, SYNSNAMN, type Scene } from "./syn"
import { ekstraDxf, ekstraSvg } from "./ekstra"
import type { Hol, Konsept, Kontekst, Krav } from "./typar"

const HER = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HER, "../..")
const MAT: Record<string, string> = { graa: "poppel", bjork: "bjork", finer: "poppel", mdf: "mdf", akryl: "akryl-opal", papp: "papp" }
const FARGE = ["#c9a36b", "#6b8fc9", "#8fc96b", "#c96b8f", "#6bc9c0", "#b9a0d8", "#d8b46b", "#8f8fd8"]

export type LagVal = { ut?: string; rask?: boolean; bilete?: "ingen" | "ark" | "alle"; stor?: boolean; step?: boolean }
export type Brot = { regel: string; kjelde: "regel" | "krav"; verdi: string; kvifor?: string; ids?: number[]; par?: [number, number][]; adr?: string[]; fiks?: string }
export type Utfall = {
  ok: boolean
  namn: string
  id: string
  mal: [number, number, number]
  plan: number
  delar: number
  ledd: number
  tappar: number
  avviste: number
  lause: number
  ark: number
  finArk: number | null
  kg: number
  kuttM: number
  godsMm: number
  brot: Brot[]
  krav: Krav[]
  mjuke: { regel: string; verdi: string }[]
  synFeil: string[]
  step: string
  filer: { rapport: string; json: string; ark: string | null; zip: string | null; fin: string | null; montering: string | null; step: string | null }
  tid: Record<string, number>
}

async function lesKonsept(kjelde: string | Konsept): Promise<{ kon: Konsept; mappe: string }> {
  if (typeof kjelde !== "string") return { kon: kjelde, mappe: process.cwd() }
  const sti = resolve(kjelde)
  const fil = /\.ts$/.test(sti) ? sti : join(sti, "konsept.ts")
  if (!existsSync(fil)) throw new Error(`finn ikkje ${fil}`)
  return { kon: (await import(pathToFileURL(fil).href)) as Konsept, mappe: dirname(fil) }
}

function hyppigast(par: readonly [number, number][]): number[] {
  const n = new Map<number, number>()
  for (const [a, b] of par) for (const q of [a, b]) n.set(q, (n.get(q) ?? 0) + 1)
  return [...n.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]).map(([q]) => q)
}

const f1 = (v: number, n = 1) => v.toFixed(n)
const vec = (v: readonly number[], n = 1) => v.map((c) => f1(c, n)).join(", ")

function senterAv(r: readonly Pt[]): Pt {
  let a = 0
  let x = 0
  let y = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i]
    const q = r[(i + 1) % r.length]
    const k = p[0] * q[1] - q[0] * p[1]
    a += k
    x += (p[0] + q[0]) * k
    y += (p[1] + q[1]) * k
  }
  return Math.abs(a) < 1e-9 ? r[0] : [x / (3 * a), y / (3 * a)]
}

function tilKant(ringar: readonly (readonly Pt[])[], p: Pt): number {
  let best = Infinity
  for (const r of ringar) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    }
  }
  return best
}

const punktMat = (m: readonly number[], u: number, v: number, w: number): Vec3 => [m[0] * u + m[4] * v + m[8] * w + m[12], m[1] * u + m[5] * v + m[9] * w + m[13], m[2] * u + m[6] * v + m[10] * w + m[14]]

function kontekst(k: Registrert, p: Params, data: DelData, rammer: Map<number, Ramme>, tappar: number): Kontekst {
  const bag = p as unknown as ParamBag
  const m = MOTOR.measure(bag)
  const del = (adr: string) => data.delar.find((d) => d.adr === adr)
  const hol = (adr: string): Hol[] => {
    const d = del(adr)
    if (!d) return []
    return d.hol.map((h, nr) => {
      const c = senterAv(h)
      const iLuft = d.hol.some((g, j) => j !== nr && inRing(g, c))
      const rs = h.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))
      let flate = Infinity
      for (let i = 0; i < h.length; i++) {
        const a = h[i]
        const b = h[(i + 1) % h.length]
        flate = Math.min(flate, Math.hypot((a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]))
      }
      return { d: 2 * Math.sqrt(Math.abs(shoelace(h)) / Math.PI), rMin: Math.min(flate, ...rs), rMax: Math.max(...rs), senter: c, iKroppen: punktMat(d.matrise, c[0], c[1], d.tjukn / 2), punkt: h.length, iLuft }
    })
  }
  const fri = (a: Vec3, b: Vec3, utan: readonly string[] = []) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(1, Math.ceil(l / 2))
    let best = { mm: Infinity, del: "-" }
    for (const d of data.delar) {
      if (utan.includes(d.adr)) continue
      const r = rammer.get(d.plan)
      if (!r) continue
      const ringar = [d.omriss, ...d.hol]
      for (let i = 0; i <= n; i++) {
        const q: Vec3 = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2] + ((b[2] - a[2]) * i) / n]
        const uv = inn(r, q)
        const w = Math.max(0, Math.abs(avFlata(r, q)) - d.tjukn / 2)
        const inne = inRing(d.omriss, uv) && !d.hol.some((h) => inRing(h, uv))
        const avst = inne ? w : Math.hypot(tilKant(ringar, uv), w)
        if (avst < best.mm) best = { mm: avst, del: d.adr }
      }
    }
    return best
  }
  const krav = (namn: string, ok: boolean, verdi: string): Krav => ({ namn, ok, verdi })
  return {
    k,
    p,
    m,
    liste: MOTOR.liste(bag),
    tappar,
    data,
    del,
    hol,
    fri,
    krav,
    holKrav: (adr, d, minus = 0.5, pluss = 1) => {
      const alle = hol(adr)
      if (!alle.length) return krav(`hol ø${d} i del ${adr}`, false, del(adr) ? "delen har ingen hol" : "delen finst ikkje")
      const h = alle.reduce((x, y) => (Math.abs(y.d - d) < Math.abs(x.d - d) ? y : x))
      if (h.iLuft) return krav(`hol ø${d} i del ${adr}`, false, `ø${f1(h.d, 2)} ligg i eit anna hol i delen: godset rundt det heng ikkje i delen og er kasta (rekk gods-streken heilt ut i ringen?)`)
      const ok = 2 * h.rMin >= d - minus && 2 * h.rMax <= d + pluss
      return krav(`hol ø${d} i del ${adr}`, ok, `ø${f1(h.d, 2)} likt areal · r ${f1(h.rMin, 2)}..${f1(h.rMax, 2)} · ${h.punkt} punkt · senter ${vec(h.iKroppen)}${ok ? "" : ` · utanfor ø${f1(d - minus, 1)}..ø${f1(d + pluss, 1)} (opnar eit spor seg i holet?)`}`)
    },
    friKrav: (namn, a, b, minst, utan = []) => {
      const f = fri(a, b, utan)
      return krav(namn, f.mm >= minst, `${f1(f.mm)} mm til del ${f.del}, kravet er ${minst} mm`)
    },
  }
}

type SporRad = { p: Pt; d: Pt; k: number; munn: number; botn: number; w: number; nokkel: string }

function spalter(delar: readonly { adr: string; plan: number; outline: Pt[]; holes: Pt[][]; spor: SporRad[] }[]): { adr: string; plan: number; par: [number, number]; nokkel: string; mm: number }[] {
  const ut: { adr: string; plan: number; par: [number, number]; nokkel: string; mm: number }[] = []
  for (const d of delar) {
    const gods = (q: Pt) => inRing(d.outline, q) && !d.holes.some((h) => inRing(h, q))
    const xs = d.outline.map((q) => q[0])
    const ys = d.outline.map((q) => q[1])
    const rekk = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    for (const v of d.spor) {
      const veg = Math.sign(v.munn - v.botn) || 1
      const side = v.w / 2 + 1.5
      let mm = 0
      for (let x = 1; x <= rekk; x += 0.5) {
        const t = v.munn + veg * x
        const c = sporPunkt(v, t, 0)
        if (gods(c) || !gods(sporPunkt(v, t, side)) || !gods(sporPunkt(v, t, -side))) continue
        const iAnna = d.spor.some((o) => {
          if (o === v) return false
          const lo = Math.min(o.munn, o.botn) - 0.5
          const hi = Math.max(o.munn, o.botn) + 0.5
          for (let u = lo; u <= hi; u += 1) {
            const q = sporPunkt(o, u, 0)
            if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= o.w / 2 + 0.75) return true
          }
          return false
        })
        if (!iAnna) mm += 0.5
      }
      const [a, b] = v.nokkel.split("-").map(Number)
      if (mm > 5) ut.push({ adr: d.adr, plan: d.plan, par: [a, b], nokkel: v.nokkel, mm })
    }
  }
  return ut
}

function monteringsliner(data: DelData, orden: Rule | undefined): string[] {
  if (!data.orden.length) return ["  ingen: ingen plan har ledd"]
  const ut: string[] = []
  if (orden && !orden.ok) ut.push(`  GÅR IKKJE OPP: ${orden.value}`, `  ${orden.why}`)
  type Gr = { nr0: number; nr1: number; delar: string[]; veg: string; mot: string; retn: (Vec3 | null)[]; fast: string[] }
  const gr: Gr[] = []
  for (const s of data.orden) {
    const mot = s.mot.join(",")
    const sist = gr[gr.length - 1]
    if (sist && sist.veg === s.veg && sist.mot === mot) {
      sist.nr1 = s.nr
      sist.delar.push(...s.delar)
      sist.retn.push(s.retning)
      if (s.fast) sist.fast.push(String(s.plan))
    } else gr.push({ nr0: s.nr, nr1: s.nr, delar: [...s.delar], veg: s.veg, mot, retn: [s.retning], fast: s.fast ? [String(s.plan)] : [] })
  }
  for (const g of gr) {
    const retn = g.retn.length === 1 ? (g.retn[0] ? ` langs (${vec(g.retn[0], 2)})` : "") : g.veg === "side" ? " kvar langs sitt eige spor" : ""
    ut.push(`  ${g.nr0 === g.nr1 ? g.nr0 : `${g.nr0}-${g.nr1}`}  ${g.veg}${retn}${g.mot ? ` mot ${g.mot}` : ""}: ${g.delar.join(" ")}${g.fast.length ? `  << STÅR FAST: ${g.fast.join(" ")}` : ""}`)
  }
  if (data.lause.length) ut.push(`  utan ledd, ikkje i rekkjefylgja: ${data.lause.join(" ")}`)
  return ut
}

export async function lag(kjelde: string | Konsept, val: LagVal = {}): Promise<Utfall> {
  const t0 = Date.now()
  const tid: Record<string, number> = {}
  const klokke = async <T>(namn: string, f: () => T | Promise<T>): Promise<T> => {
    const t = Date.now()
    const r = await f()
    tid[namn] = Date.now() - t
    return r
  }
  const { kon, mappe } = await lesKonsept(kjelde)
  const rask = !!val.rask
  const bileteVal = val.bilete ?? "ingen"
  const step = !!val.step
  if (typeof kon.namn !== "string" || typeof kon.kropp !== "function" || kon.plan === undefined) throw new Error("konsept.ts må eksportere namn, kropp() og plan")
  const ut = resolve(val.ut ?? join(mappe, "ut"))
  mkdirSync(ut, { recursive: true })
  const id = kon.namn.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) || "lampe"

  const raa = await klokke("kropp", () => kon.kropp())
  const nett: Nett = typeof raa === "string" ? (/\.(glb|gltf)$/i.test(raa) ? lesNett(raa).map((v) => v * 1000) : lesNett(raa)) : raa
  const sj = sjekkNett(nett)
  skrivStl(join(ut, "kropp.stl"), nett, id)
  const k = registrer(id, nett)
  const eigen = kon.bag ?? {}
  const rot = ["rotX", "rotY", "rotZ"].filter((q) => (eigen as Record<string, unknown>)[q])
  const planInn = typeof kon.plan === "function" ? kon.plan(k) : kon.plan
  const planTal = typeof planInn === "string" ? planInn.split(";").filter(Boolean).length : planInn.length
  const planStreng = typeof planInn === "string" ? skrivPlan(lesPlan(planInn)) : skrivPlan(planInn as Plan[])
  const lesne = lesPlan(planStreng)
  const p: Params = { ...DEFAULT_PARAMS, tjukn: 4, material: "bjork", ...eigen, kjelde: k.kjelde, scene: "", storleik: eigen.storleik ?? +k.storleik.toFixed(3), plan: planStreng }
  const bag = p as unknown as ParamBag

  const b = await klokke("motor", () => makeBygg(p, DETAIL.mid))
  const m = MOTOR.measure(bag)
  const reglar = MOTOR.rules(bag, m)
  const liste = MOTOR.liste(bag)
  const data = delData(bag)
  const rammer = new Map(b.s.ribber.map((r) => [r.plan.id, r.r]))
  const x = kontekst(k, p, data, rammer, b.s.tappar)
  const ark = arkInfo(bag)

  const krav: Krav[] = []
  const kr = (id: string, q: Krav): Krav => ({ id, ...q })
  const volM = b.k.solid.volume()
  const sentrert = Math.abs(sj.min[0] + sj.max[0]) < 0.02 && Math.abs(sj.min[1] + sj.max[1]) < 0.02 && Math.abs(sj.min[2]) < 0.02
  const volN = sj.volum * (p.storleik / k.storleik) ** 3
  const volOk = Math.abs(volM - volN) <= 0.01 * Math.abs(volN)
  const heilt = sj.lukka && sj.samstemt && sj.utover && sj.skal.every((v) => v > 0)
  krav.push(kr("lukka", x.krav(heilt || !volOk ? "nettet er lukka og vender ut" : "nettet er ope, men motoren les same volum", heilt || volOk, `${sj.tris} trekantar · ${sj.opne} opne · ${sj.mangfaldige} mangfaldige · ${sj.vrengde} vrengde · ${sj.skal.length} skal`)))
  krav.push(kr("budsjett", x.krav("nettet held trekantbudsjettet", sj.tris <= p.trekant * 1000, `${sj.tris} av ${p.trekant * 1000}: over det vert nettet forenkla`)))
  krav.push(kr("sentrert", x.krav("kroppen står sentrert på z = 0", sentrert, sentrert ? "ja" : `boks ${vec(sj.min)} .. ${vec(sj.max)}: pakk kroppen i sentrer()`)))
  krav.push(kr("eittilein", x.krav("1:1", Math.abs(p.storleik - k.storleik) < 0.01 && !rot.length && !p.glatt && !p.forenkl && !p.hol, rot.length ? `${rot.join(" ")} er ikkje 0` : `storleik ${p.storleik} mot lengste side ${f1(k.storleik, 2)} · glatt ${p.glatt} forenkl ${p.forenkl} tett ${p.hol}`)))
  krav.push(kr("volum", x.krav("motoren les same volum som nettet", volOk, `${f1(volM / 1000, 0)} cm3 mot ${f1(volN / 1000, 0)} cm3${Math.abs(volM - volN) > 0.01 * Math.abs(volN) ? " — eit lukka holrom er fylt, eller skal overlappar" : ""}`)))
  krav.push(kr("alleplan", x.krav("alle plan kom med", lesne.length === planTal && m.units === planTal, `${planTal} skrivne · ${lesne.length} lesne · ${m.units} i motoren`)))
  const klemt = MOTOR.clamp(bag, bag) as Record<string, unknown>
  const endra = Object.keys(klemt).filter((q) => q !== "kjelde" && klemt[q] !== (bag as Record<string, unknown>)[q])
  krav.push(kr("posen", x.krav("appen opnar posen uendra", !endra.length, endra.length ? endra.map((q) => `${q} ${(bag as Record<string, unknown>)[q]} -> ${klemt[q]}`).join(" · ") : "ja")))
  krav.push(kr("lause", x.krav("ingen lause eller kasta stykke", m.loose === 0 && data.lause.length === 0, `${m.loose} lause${data.lause.length ? ` · ${data.lause.join(" ")}` : ""}`)))
  krav.push(kr("paaark", x.krav("alle delar ligg på eit ark", liste.every((d) => d.ark > 0), liste.filter((d) => !d.ark).map((d) => d.adr).join(" ") || "ja")))
  const tomme = lesne.filter((q) => !data.delar.some((d) => d.plan === q.id)).map((q) => q.id)
  krav.push(kr("tommeplan", x.krav("kvart plan gjev minst éin del", !tomme.length, tomme.length ? `plan utan del: ${tomme.join(" ")} — ei teikna ribbe som endar ved ei plate vert tappa og klipt bort` : "ja")))
  const lange = spalter(b.dl.delar as unknown as Parameters<typeof spalter>[0])
  krav.push(kr("spalte", x.krav("ingen spalte held fram gjennom gods forbi munnen", !lange.length, lange.length ? `${lange.map((q) => `del ${q.adr} spor ${q.nokkel}: ${f1(q.mm, 0)} mm`).join(" · ")} — sporet opnar seg mot fylt gods (gods-strek, nav) og er skore vidare til neste kant` : "ja")))
  let eigneFeil = ""
  try {
    if (kon.krav) krav.push(...kon.krav(x).map((q) => kr(`eige:${q.namn}`, q)))
  } catch (e) {
    eigneFeil = String((e as Error).message ?? e)
    krav.push(kr("eige", x.krav("krav() i konsept.ts", false, eigneFeil)))
  }

  const harde = reglar.filter((r) => r.hard)
  const brot = harde.filter((r) => !r.ok)
  const mjuke = reglar.filter((r) => !r.hard && !r.ok)
  const ordenRegel = reglar.find((r) => r.id === "orden")

  writeFileSync(join(ut, "delar.json"), JSON.stringify(data))
  const utstyr = kon.utstyr ?? {}
  const { delar: delVal, steg: eigneSteg, ekstra = [], ...scenen } = utstyr
  const opptekne = new Set(data.delar.map((d) => d.adr))
  for (const e of ekstra) if (opptekne.has(e.namn) || !/^[A-Za-z0-9_-]+$/.test(e.namn)) throw new Error(`ekstra «${e.namn}»: namnet må vere a-z, 0-9, - eller _ og ikkje ei adresse motoren brukar`)
  const scene: Scene = {
    namn: kon.namn,
    material: MAT[String(p.material)] ?? "bjork",
    tjukn: p.tjukn,
    ...scenen,
    delar: [...data.delar.map((d) => ({ ...d, ...(delVal?.[String(d.plan)] ?? {}), ...(delVal?.[d.adr] ?? {}) })), ...ekstra.map((e) => ({ ...e, hol: e.hol ?? [], ekstra: true }))],
    steg: eigneSteg ?? data.orden.map((s) => ({ delar: s.delar, retning: s.retning, steg: s.steg })),
    ...(utstyr.kroppSyn ? { kropp: join(ut, "kropp.stl") } : {}),
  }
  writeFileSync(join(ut, "scene.json"), JSON.stringify(scene))
  let synFeil: string[] = []
  const bilete: Record<string, string> = {}
  if (bileteVal !== "ingen") await klokke("ark", async () => {
    try {
      const r = await syn(scene, { ut, namn: "x", syn: ["ark"], stille: true })
      const fraa = r.filer.ark
      if (fraa) {
        const til = join(ut, "ark.png")
        renameSync(fraa, til)
        bilete.ark = til
      }
      synFeil = [...new Set(r.feil)]
      const ute = Object.entries(r.ramme).filter(([, q]) => q.some((v) => Math.abs(v) > 1)).map(([n]) => n)
      if (ute.length) synFeil.push(`utanfor ramma: ${ute.join(" ")}`)
      const ukj = (r.info as { ukjende?: string[] }).ukjende ?? []
      if (ukj.length) synFeil.push(`steg nemner ukjende delar: ${ukj.join(" ")}`)
    } catch (e) {
      synFeil = [`syn feila: ${String((e as Error).message ?? e).split("\n")[0]}`]
    }
  })

  let man: Manifest | null = null
  let stepLine = ""
  if (!rask) {
    man = await klokke("produksjon", () => skrivAlt(bag, [], join(ut, "produksjon"), id, true, bileteVal !== "ingen"))
    for (const e of ekstra) {
      writeFileSync(join(ut, "produksjon", `ekstra-${e.namn}.svg`), ekstraSvg(e))
      writeFileSync(join(ut, "produksjon", `ekstra-${e.namn}.dxf`), ekstraDxf(e))
    }
    if (man.fin) krav.push(kr("fin", x.krav("fine kuttfiler (1200 celler) gjev same delar og ledd", man.fin.likt, `${man.fin.delar} delar · ${man.fin.ark} ark · ${f1(man.fin.kuttMm / 1000, 2)} m`)))
    if (bileteVal === "alle") await klokke("bilete", async () => {
      try {
        const r = await syn(scene, { ut: join(ut, "bilete"), namn: id, syn: [...SYNSNAMN], stille: true, stor: !!val.stor })
        Object.assign(bilete, r.filer)
        for (const f of new Set(r.feil)) synFeil.push(f)
      } catch (e) {
        synFeil.push(`syn feila: ${String((e as Error).message ?? e).split("\n")[0]}`)
      }
    })
    const py = process.env.LAMPE_PY ?? ""
    if (step && !(process.env.FORGECAD && existsSync(process.env.FORGECAD) && py && existsSync(py))) stepLine = "step hoppa over: FORGECAD eller LAMPE_PY manglar"
    else if (step) {
      stepLine = await klokke("step", () => {
        const fin = delData(bag, [], DETAIL.fil)
        const mal = Math.max(...fin.boks.max.map((v, i) => v - fin.boks.min[i]))
        const boygde = [...fin.delar.filter((d) => d.krumming).map((d) => d.adr), ...ekstra.filter((e) => e.krumming).map((e) => e.namn)]
        const samling = {
          namn: id,
          delar: [
            ...fin.delar.map((d) => ({
              namn: d.adr,
              tjukn: d.tjukn,
              omriss: d.omriss,
              hol: d.hol,
              matrise: d.matrise,
              ...(d.krumming ? { krumming: d.krumming } : {}),
              steg: d.steg || 1,
              farge: FARGE[(Math.max(1, d.steg) - 1) % FARGE.length],
              ...(d.retning ? { sprengt: d.retning.map((v) => -v * mal * 0.5) } : {}),
            })),
            ...ekstra.map((e) => ({ namn: e.namn, tjukn: e.tjukn, omriss: e.omriss, hol: e.hol ?? [], matrise: e.matrise, ...(e.krumming ? { krumming: e.krumming } : {}), steg: 1, farge: e.farge ?? "#e9e6dc" })),
          ],
        }
        const sm = join(ut, "step")
        mkdirSync(sm, { recursive: true })
        writeFileSync(join(sm, "samling.json"), JSON.stringify(samling))
        const liner: string[] = []
        try {
          const o = execFileSync(process.execPath, [createRequire(import.meta.url).resolve("tsx/cli"), join(HER, "valfritt", "tilforge.ts"), join(sm, "samling.json"), sm, "--sirklar"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 })
          liner.push(...o.trim().split("\n").filter((l) => /^(run|step|bilete)/.test(l)))
          const les = execFileSync(py, ["-I", join(HER, "valfritt", "lesstep.py"), join(sm, `${id}.step`), join(sm, `${id}.venta.json`), "--overlapp"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 })
          liner.push(...les.trim().split("\n").filter((l) => /^(les|volum|verste|boygde|overlapp)/.test(l)))
        } catch (e) {
          const f = e as { stdout?: string; stderr?: string; message: string }
          liner.push(`STEP FEILA: ${`${f.stdout ?? ""}${f.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ") || f.message.split("\n")[0]}`)
        }
        if (boygde.length) liner.push(`bøygde delar ${boygde.join(" ")} er i STEP som flate strimlar langs bogen, utan riller`)
        const fil = join(sm, `${id}.step`)
        const ok = existsSync(fil) && !liner.some((l) => l.startsWith("STEP FEILA"))
        krav.push(kr("step", x.krav("STEP-samlinga er skriven og lesen attende", ok, ok ? `${f1(statSync(fil).size / 1e6, 1)} MB · ${samling.delar.length} delar${boygde.length ? ` · ${boygde.length} bøygde som strimlar` : ""}` : "feila")))
        return liner.join("\n")
      })
    }
  }

  const ok = brot.length === 0 && krav.every((q) => q.ok)
  const minGods = Math.max(2, p.tjukn)
  const brotListe: Brot[] = [
    ...brot.map((r): Brot => {
      const q: Brot = { regel: r.id, kjelde: "regel", verdi: r.value, kvifor: r.why, ...(r.fiks ? { fiks: r.fiks.ord } : {}) }
      if (r.id === "klem") {
        q.par = b.s.montering.klem.map(([a, c]) => [a, c] as [number, number])
        q.ids = hyppigast(q.par)
      } else if (r.id === "orden") q.ids = [...b.s.montering.brot]
      else if (r.id === "gods") q.ids = b.s.ribber.filter((g) => (g.spor.length || g.tapp.some((t) => t.slag === "slisse")) && g.narrow < minGods).map((g) => g.plan.id)
      else if (r.id === "lause") {
        const l = b.dl.delar.filter((d) => d.joints === 0)
        q.adr = l.map((d) => d.adr)
        q.ids = [...new Set([...l.map((d) => d.plan), ...b.s.kastaPlan])]
      }
      return q
    }),
    ...krav.filter((q) => !q.ok).map((q): Brot => ({ regel: q.id ?? q.namn, kjelde: "krav", verdi: q.verdi, ...(q.id === "tommeplan" ? { ids: tomme } : q.id === "fin" && man?.fin ? { ids: man.fin.ulike } : q.id === "lause" ? { adr: data.lause, ids: [...new Set([...b.dl.delar.filter((d) => d.joints === 0 || data.lause.includes(d.adr)).map((d) => d.plan), ...b.s.kastaPlan])] } : q.id === "spalte" ? { ids: [...new Set(lange.map((l) => l.plan))], par: lange.map((l) => l.par) } : {}) })),
  ]
  const pct = (v: number) => `${Math.round(v * 100)} %`
  const linje: string[] = []
  linje.push(`${kon.namn} — ${f1(m.envX, 0)} x ${f1(m.envY, 0)} x ${f1(m.envZ, 0)} mm · ${p.material} ${p.tjukn} mm · klaring ${p.klaring} · snitt ${p.snitt} · ${ok ? "ALT OK" : "IKKJE OK"}`)
  linje.push(`nett     ${sj.tris} trekantar · ${sj.lukka ? "lukka" : "OPE"} · ${sj.skal.length} skal · ${f1(sj.volum / 1000, 0)} cm3 · boks ${vec(sj.min, 0)} .. ${vec(sj.max, 0)}`)
  linje.push(`tal      ${m.units} plan · ${m.parts} delar (${m.unique} unike) · ${m.joints} ledd (${b.s.tappar} tapp, ${m.avvist} avviste) · ${m.loose} lause`)
  linje.push(`kutt     ${f1(m.cutLen / 1000, 2)} m · ${f1(m.cutTime / 60)} min ved ${p.fart} mm/s · ${m.sheets} ark ${p.arkB} x ${p.arkH} · utnytting ${pct(m.util)} · ${f1(m.mass, 3)} kg · spor ${f1(m.slotW, 2)} mm · minste gods ${f1(m.narrow)} mm`)
  linje.push("harde reglar")
  for (const r of harde) linje.push(`  ${r.ok ? "ok  " : "BROT"} ${r.id.padEnd(10)} ${r.label.padEnd(24)} ${r.value}`)
  const boygReglar = reglar.filter((r) => r.id.startsWith("bog"))
  const riller = data.delar.filter((d) => d.krumming).map((d) => `del ${d.adr}: R ${f1(Math.abs(1 / d.krumming))} mm, ${d.rille.length} riller`)
  if (riller.length) linje.push(`bøygd    ${riller.join(" · ")} · ${boygReglar.map((r) => `${r.id}: ${r.value}`).join(" · ")}`)
  linje.push(mjuke.length ? "mjuke reglar som bryt" : "mjuke reglar: ingen bryt")
  for (const r of mjuke) linje.push(`  ${r.id.padEnd(10)} ${r.label.padEnd(24)} ${r.value}`)
  linje.push("ark")
  for (const a of ark) linje.push(`  ${a.nr}  ${a.delar.join(" ")} · ${pct(a.utnytting)} av brukt hogd, ${pct(a.avHeileArket)} av arket${a.umerkte.length ? ` · UTAN GRAVERT ADRESSE: ${a.umerkte.join(" ")}` : ""}${a.iHol.length ? ` · inni holet til ein annan: ${a.iHol.join(" ")}` : ""}`)
  linje.push("delar    adr    form   b x h mm        ledd  ark")
  const sett = new Set<string>()
  for (const d of liste) {
    const like = liste.filter((q) => q.id === d.id)
    if (sett.has(d.id)) continue
    sett.add(d.id)
    linje.push(`         ${(like.length > 1 ? `${like[0].adr}..${like[like.length - 1].adr} (${like.length})` : d.adr).padEnd(14)} ${d.id.padEnd(5)} ${`${f1(d.w)} x ${f1(d.h)}`.padEnd(15)} ${String(d.joints).padEnd(5)} ${[...new Set(like.map((q) => q.ark))].join(",")}`)
  }
  if (ekstra.length) {
    linje.push("ekstra   (ikkje frå motoren: ingen reglar, ingen ledd, ikkje på arka)")
    for (const e of ekstra) {
      const xs = e.omriss.map((q) => q[0])
      const ys = e.omriss.map((q) => q[1])
      linje.push(`         ${e.namn.padEnd(14)} ${f1(Math.max(...xs) - Math.min(...xs))} x ${f1(Math.max(...ys) - Math.min(...ys))} mm flatt · ${e.tjukn} mm ${e.material ?? ""}${e.krumming ? ` · bøygd R ${f1(Math.abs(1 / e.krumming))}` : ""}`)
    }
  }
  linje.push("montering (motoren si eiga rekkjefylgje)")
  linje.push(...monteringsliner(data, ordenRegel))
  linje.push("krav")
  for (const q of krav) linje.push(`  ${q.ok ? "ok  " : "BROT"} ${q.namn}: ${q.verdi}`)
  if (man?.fin) linje.push(`fin      produksjon/fin/: ${man.fin.celler} celler · ${man.fin.delar} delar · ${man.fin.ark} ark · ${f1(man.fin.kuttMm / 1000, 2)} m · ${man.fin.likt ? "same delar og ledd som ved 220" : "ULIKT 220-BYGGET"}${man.fin.sameArk ? " · same delar på kvart ark" : ` · DELANE LIGG PÅ ANDRE ARK ENN LISTA OVER: ${man.fin.paaArk.map((a, i) => `fin/ark-${i + 1}: ${a.join(" ")}`).join(" · ")}`}`)
  if (stepLine) linje.push("step", ...stepLine.split("\n").map((l) => "  " + l))
  if (synFeil.length) linje.push("bilete   " + synFeil.slice(0, 4).join(" | "))
  const kvifor = [...harde.filter((r) => !r.ok), ...mjuke]
  if (kvifor.length) linje.push("kvifor", ...kvifor.map((r) => `  ${r.id}: ${r.why}`))
  tid.alt = Date.now() - t0
  linje.push(`tid      ${Object.entries(tid).map(([n, v]) => `${n} ${f1(v / 1000)} s`).join(" · ")}`)
  writeFileSync(join(ut, "rapport.txt"), linje.join("\n") + "\n")

  const rapport = {
    namn: kon.namn,
    id,
    mappe,
    ok,
    rask,
    brot: brotListe,
    nett: { ...sj, motorVolum: volM },
    pose: p,
    plan: planStreng,
    tal: { plan: m.units, delar: m.parts, unike: m.unique, ledd: m.joints, tappar: b.s.tappar, avviste: m.avvist, lause: m.loose, ark: m.sheets, utnytting: m.util, kuttMm: m.cutLen, tidS: m.cutTime, masseKg: m.mass, ytre: [m.envX, m.envY, m.envZ], sporMm: m.slotW, godsMm: m.narrow },
    reglar: reglar.map((r) => ({ id: r.id, label: r.label, hard: r.hard, ok: r.ok, value: r.value, why: r.why, ...(r.fiks ? { fiks: r.fiks } : {}) })),
    harde: brot.map((r) => r.id),
    mjuke: mjuke.map((r) => r.id),
    krav,
    ark,
    delar: liste,
    orden: data.orden,
    lause: data.lause,
    ekstra: ekstra.map((e) => e.namn),
    fin: man?.fin ?? null,
    bilete,
    synFeil,
    tid,
    filer: { rapport: join(ut, "rapport.txt"), delar: join(ut, "delar.json"), scene: join(ut, "scene.json"), kropp: join(ut, "kropp.stl"), ark: bilete.ark ?? null, produksjon: man ? join(ut, "produksjon") : null, bilete: bileteVal === "alle" ? join(ut, "bilete") : null, step: step && !rask && existsSync(join(ut, "step", `${id}.step`)) ? join(ut, "step", `${id}.step`) : null },
  }
  writeFileSync(join(ut, "rapport.json"), JSON.stringify(rapport, null, 1))

  const fil = (q: string | null | undefined) => (q && existsSync(q) ? q : null)
  const pro = join(ut, "produksjon")
  return {
    ok,
    namn: kon.namn,
    id,
    mal: [m.envX, m.envY, m.envZ],
    plan: m.units,
    delar: m.parts,
    ledd: m.joints,
    tappar: b.s.tappar,
    avviste: m.avvist,
    lause: m.loose,
    ark: m.sheets,
    finArk: man?.fin ? man.fin.ark : null,
    kg: m.mass,
    kuttM: m.cutLen / 1000,
    godsMm: m.narrow,
    brot: brotListe,
    krav,
    mjuke: mjuke.map((r) => ({ regel: r.id, verdi: r.value })),
    synFeil,
    step: stepLine,
    filer: {
      rapport: join(ut, "rapport.txt"),
      json: join(ut, "rapport.json"),
      ark: fil(bilete.ark),
      zip: man ? fil(join(pro, `${id}.zip`)) : null,
      fin: man?.fin ? fil(join(pro, "fin")) : null,
      montering: man ? fil(join(pro, "montering.txt")) : null,
      step: fil(step && !rask ? join(ut, "step", `${id}.step`) : null),
    },
    tid,
  }
}
