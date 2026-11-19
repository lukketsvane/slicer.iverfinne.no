import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { stlBytes } from "./form"
import { makeSoup } from "../../lib/soup"
import { label, put, raw } from "../../lib/sources"
import { kerfOf, MOTOR } from "../../lib/motor"
import { makeBygg } from "../../lib/bygg"
import { DETAIL } from "../../lib/snitt"
import { sheetDxf } from "../../lib/export-dxf"
import { sheetSvg } from "../../lib/export-svg"
import { fitSize, strokesAt } from "../../lib/stroke"
import { unzip } from "../../lib/zip"
import { inRing, type ExportKind, type ExportOut, type Kutt, type ParamBag, type Pt, type Vec3 } from "../../lib/core"
import { placedRings } from "../../lib/nest"
import { lesPlan, type Ramme } from "../../lib/plan"
import { montasjen, vegen } from "../../lib/montasje"
import type { Params } from "../../lib/params"

const krev = createRequire(import.meta.url)
const lastSharp = (): ((b: Buffer) => any) | null => {
  try {
    return createRequire(krev.resolve("next/package.json"))("sharp")
  } catch {
    return null
  }
}

export type Nett = { id: string; pos: Float32Array; etikett?: string }

export type DelUt = {
  adr: string
  form: string
  plan: number
  ark: number
  tjukn: number
  omriss: Pt[]
  hol: Pt[][]
  rille: Pt[][]
  areal: number
  masseKg: number
  kuttMm: number
  ledd: number
  matrise: number[]
  stabel: number[]
  paaArk: number[]
  normal: Vec3
  krumming: number
  steg: number
  veg: string
  retning: Vec3 | null
}

export type StegUt = { nr: number; plan: number; delar: string[]; steg: number; veg: string; retning: Vec3 | null; mot: number[]; fast: boolean }

export type DelData = {
  eining: "mm"
  ramme: "Z opp, x og y sentrert, golv z = 0"
  matrise: "4x4 kolonnevis: (x, y) i omrisset, z 0..tjukn -> kroppen"
  detalj: number
  tjukn: number
  material: string
  boks: { min: Vec3; max: Vec3 }
  delar: DelUt[]
  orden: StegUt[]
  lause: string[]
}

export type Fil = { namn: string; byte: number; detalj: number | null; kva: string }

export type Manifest = {
  namn: string
  mappe: string
  ok: boolean
  tal: {
    plan: number
    delar: number
    unike: number
    ledd: number
    avviste: number
    lause: number
    ark: number
    utnytting: number
    kuttMm: number
    gravMm: number
    tidS: number
    masseKg: number
    ytre: Vec3
    sporMm: number
    godsMm: number
  }
  harde: { id: string; label: string; value: string; why: string }[]
  mjuke: { id: string; label: string; value: string }[]
  ark: { nr: number; delar: string[]; utnytting: number; avHeileArket: number; gravMm: number; umerkte: string[]; iHol: string[]; dxf: string; svg: string; png: string | null }[]
  delar: Kutt[]
  filer: Fil[]
  fin: { celler: number; delar: number; ledd: number; ark: number; kuttMm: number; likt: boolean; filer: string[]; paaArk: string[][]; sameArk: boolean; ulike: number[] } | null
}

export function registrerNett(nett: readonly Nett[]) {
  for (const n of nett) {
    if (!/^[a-z0-9]{1,40}$/i.test(n.id)) throw new Error(`nett-id «${n.id}»: berre a-z og 0-9, elles heiter kroppen «${n.id}__…» i appen`)
    put(n.id, n.etikett ?? `${n.id}.stl`, makeSoup(n.pos), stlBytes(n.pos, n.id))
  }
}

const lengd = (l: readonly Pt[]) => l.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - l[i - 1][0], q[1] - l[i - 1][1]) : 0), 0)

function staande(r: Ramme, t: number): number[] {
  const eins = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const n = eins(r.n)
  const v = eins(r.v)
  const u: Vec3 = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]]
  return [...u, 0, ...v, 0, ...n, 0, ...r.o.map((c, k) => c - (t / 2) * n[k]), 1]
}

export function delData(bag: ParamBag, nett: readonly Nett[] = [], celler: number = DETAIL.mid): DelData {
  registrerNett(nett)
  const p = bag as unknown as Params
  const b = makeBygg(p, celler)
  const mont = celler === DETAIL.mid ? MOTOR.montasje(bag) : montasjen(b.s, b.dl.delar, b.ns, p.tjukn, b.k.solid.min, b.k.solid.max)
  const m = b.s.montering
  const paa = new Map(b.ns.sheets.flatMap((sh, i) => sh.placed.map((q) => [q.part.adr, { ark: i + 1, m: [...q.slot.m] }] as const)))
  const rammer = new Map(b.s.ribber.map((r) => [r.plan.id, r.r]))
  const delar: DelUt[] = []
  for (const d of b.dl.delar) {
    const md = mont.delar.find((q) => q.adr === d.adr)
    const r = rammer.get(d.plan)
    const plass = paa.get(d.adr)
    if (!r) continue
    delar.push({
      adr: d.adr,
      form: d.id,
      plan: d.plan,
      ark: plass?.ark ?? 0,
      tjukn: p.tjukn,
      omriss: d.outline,
      hol: d.holes,
      rille: d.rille,
      areal: d.area,
      masseKg: d.mass,
      kuttMm: d.cutLen,
      ledd: d.joints,
      matrise: staande(r, p.tjukn),
      stabel: md ? [...md.flat] : [],
      paaArk: plass ? [...plass.m] : [],
      normal: r.n,
      krumming: r.k,
      steg: md ? md.steg + 1 : 0,
      veg: vegen(m.retning[d.plan] ?? null, m.boygde.includes(d.plan)),
      retning: m.retning[d.plan] ?? null,
    })
  }
  const orden: StegUt[] = m.orden.map((id, i) => {
    const r = b.s.ribber.find((q) => q.plan.id === id)
    const eigne = delar.filter((d) => d.plan === id)
    return {
      nr: i + 1,
      plan: id,
      delar: eigne.map((d) => d.adr),
      steg: eigne[0]?.steg ?? 0,
      veg: eigne[0]?.veg ?? "",
      retning: m.retning[id] ?? null,
      mot: [...new Set([...(r?.spor ?? []), ...(r?.tapp ?? [])].map((q) => q.mot))].filter((x) => m.orden.indexOf(x) < i),
      fast: m.brot.includes(id),
    }
  })
  return {
    eining: "mm",
    ramme: "Z opp, x og y sentrert, golv z = 0",
    matrise: "4x4 kolonnevis: (x, y) i omrisset, z 0..tjukn -> kroppen",
    detalj: celler,
    tjukn: p.tjukn,
    material: String(p.material),
    boks: { min: b.k.solid.min, max: b.k.solid.max },
    delar,
    orden,
    lause: delar.filter((d) => !m.orden.includes(d.plan)).map((d) => d.adr),
  }
}

export type ArkInfo = { nr: number; delar: string[]; utnytting: number; avHeileArket: number; gravMm: number; umerkte: string[]; iHol: string[] }

export function arkInfo(bag: ParamBag): ArkInfo[] {
  const { ns } = makeBygg(bag as unknown as Params, DETAIL.mid)
  return ns.sheets.map((sh, i) => {
    const lagde = sh.placed
    const storleik = (q: (typeof lagde)[number]) => fitSize(q.part.adr, q.label.room, q.label.wide)
    const ringar = lagde.map((q) => placedRings(q))
    return {
      nr: i + 1,
      delar: lagde.map((q) => q.part.adr),
      utnytting: MOTOR.arkSyn(bag, i).util,
      avHeileArket: lagde.reduce((s, q) => s + q.part.area, 0) / (ns.sheetW * ns.sheetH),
      gravMm: lagde.reduce((s, q) => {
        const st = storleik(q)
        return st ? s + strokesAt(q.part.adr, q.label.p[0], q.label.p[1], st).reduce((a, l) => a + lengd(l), 0) : s
      }, 0),
      umerkte: lagde.filter((q) => !storleik(q)).map((q) => q.part.adr),
      iHol: lagde.filter((q, k) => ringar.some((r, j) => j !== k && r.holes.some((h) => inRing(h, ringar[k].outline[0])))).map((q) => q.part.adr),
    }
  })
}

export async function arkPng(svg: string, arkB: number, arkH: number): Promise<Uint8Array | null> {
  const sharp = lastSharp()
  if (!sharp) return null
  const pxmm = Math.min(4, 2400 / Math.max(arkB, arkH, 1))
  const w = Math.max(1, Math.round(arkB * pxmm))
  const h = Math.max(1, Math.round(arkH * pxmm))
  const kjelde = svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${w}" height="${h}"`)
  return new Uint8Array(await sharp(Buffer.from(kjelde)).flatten({ background: "#ffffff" }).png().toBuffer())
}

export function skrivFin(bag: ParamBag, mappe: string, celler: number = DETAIL.fil): NonNullable<Manifest["fin"]> {
  const p = bag as unknown as Params
  const grov = makeBygg(p, DETAIL.mid)
  const leddI = (q: typeof grov) => q.dl.delar.reduce((n, d) => n + d.joints, 0)
  const tal0 = { delar: grov.dl.delar.length, ledd: leddI(grov) }
  const b = makeBygg(p, celler)
  const kerf = kerfOf(p)
  mkdirSync(mappe, { recursive: true })
  const filer: string[] = []
  b.ns.sheets.forEach((_, i) => {
    writeFileSync(join(mappe, `ark-${i + 1}.dxf`), sheetDxf(b.ns, i, kerf))
    writeFileSync(join(mappe, `ark-${i + 1}.svg`), sheetSvg(b.ns, i, kerf))
    filer.push(`ark-${i + 1}.dxf`, `ark-${i + 1}.svg`)
  })
  writeFileSync(join(mappe, "delar.json"), JSON.stringify(delData(bag, [], celler)))
  filer.push("delar.json")
  const ledd = leddI(b)
  const paaArk = b.ns.sheets.map((sh) => sh.placed.map((q) => q.part.adr))
  const paaGrov = grov.ns.sheets.map((sh) => sh.placed.map((q) => q.part.adr))
  const sameArk = paaArk.length === paaGrov.length && paaArk.every((a, i) => [...a].sort().join(" ") === [...paaGrov[i]].sort().join(" "))
  const perPlan = (q: typeof grov) => {
    const m = new Map<number, string>()
    for (const d of q.dl.delar) {
      const [n, l] = (m.get(d.plan) ?? "0 0").split(" ").map(Number)
      m.set(d.plan, `${n + 1} ${l + d.joints}`)
    }
    return m
  }
  const pg = perPlan(grov)
  const pf = perPlan(b)
  const ulike = [...new Set([...pg.keys(), ...pf.keys()])].filter((i) => pg.get(i) !== pf.get(i)).sort((x, y) => x - y)
  return { celler, delar: b.dl.delar.length, ledd, ark: b.ns.sheets.length, kuttMm: b.dl.cutLen, likt: b.dl.delar.length === tal0.delar && ledd === tal0.ledd && !ulike.length, filer, paaArk, sameArk, ulike }
}

export async function skrivAlt(bag: ParamBag, nett: readonly Nett[], mappe: string, namn?: string, fin = true, png = false): Promise<Manifest> {
  registrerNett(nett)
  const p = bag as unknown as Params
  if (!raw(String(p.kjelde))) throw new Error(`prosjektfila ville ikkje bere nettet «${p.kjelde}»: registrer det med bytes`)
  const stamme = namn ?? label(String(p.kjelde)).replace(/\.[a-z0-9]+$/i, "")
  mkdirSync(mappe, { recursive: true })
  const filer: Fil[] = []
  const skriv = (fil: string, data: string | Uint8Array, detalj: number | null, kva: string) => {
    writeFileSync(join(mappe, fil), data)
    filer.push({ namn: fil, byte: typeof data === "string" ? Buffer.byteLength(data) : data.byteLength, detalj, kva })
    return fil
  }
  const ut = (kva: ExportKind): ExportOut => MOTOR.exportFile(bag, kva)
  const bytes = (o: ExportOut) => (o.text !== undefined ? o.text : new Uint8Array(o.data as ArrayBuffer))

  const m = MOTOR.measure(bag)
  const reglar = MOTOR.rules(bag, m)
  const liste = MOTOR.liste(bag)
  const { ns } = makeBygg(p, DETAIL.mid)
  const kerf = kerfOf(p)

  const ark: Manifest["ark"] = []
  for (let i = 0; i < ns.sheets.length; i++) {
    const syn = MOTOR.arkSyn(bag, i)
    const svg = sheetSvg(ns, i, kerf)
    const lagde = ns.sheets[i].placed
    const storleik = (q: (typeof lagde)[number]) => fitSize(q.part.adr, q.label.room, q.label.wide)
    const grav = lagde.reduce((s, q) => {
      const st = storleik(q)
      return st ? s + strokesAt(q.part.adr, q.label.p[0], q.label.p[1], st).reduce((a, l) => a + lengd(l), 0) : s
    }, 0)
    const ringar = lagde.map((q) => placedRings(q))
    ark.push({
      nr: i + 1,
      delar: syn.plasser.map((q) => q.adr),
      utnytting: syn.util,
      avHeileArket: lagde.reduce((s, q) => s + q.part.area, 0) / (ns.sheetW * ns.sheetH),
      gravMm: grav,
      umerkte: lagde.filter((q) => !storleik(q)).map((q) => q.part.adr),
      iHol: lagde.filter((q, k) => ringar.some((r, j) => j !== k && r.holes.some((h) => inRing(h, ringar[k].outline[0])))).map((q) => q.part.adr),
      dxf: skriv(`ark-${i + 1}.dxf`, sheetDxf(ns, i, kerf), DETAIL.mid, "kuttfil, R12 ASCII, mm, lag KUTT og GRAVER, snittet teke"),
      svg: skriv(`ark-${i + 1}.svg`, svg, DETAIL.mid, "kuttfil 1:1, svart graver, blaa kutt, snittet teke"),
      png: await (async () => {
        const b = png ? await arkPng(svg, ns.sheetW, ns.sheetH) : null
        return b ? skriv(`ark-${i + 1}.png`, b, DETAIL.mid, "bilete av arket, ikkje til maskina") : null
      })(),
    })
  }
  skriv("profilar.svg", bytes(ut("svg")), DETAIL.mid, "alle profilane side om side, 1:1")
  skriv("samla.glb", bytes(ut("glb")), DETAIL.fil, "montert, meter, Y opp, ein node per del")
  skriv("flat.glb", bytes(ut("flat")), DETAIL.mid, "delane flatt som paa arka, ei gruppe per ark")
  skriv("deler.3mf", bytes(ut("3mf")), DETAIL.fil, "flate delar, eitt objekt per del, mm, Z opp")
  skriv("samla.stl", bytes(ut("stl")), DETAIL.fil, "montert, ei trekantsuppe, mm, Z opp")
  skriv("samla.usdz", bytes(ut("usdz")), DETAIL.fil, "montert, AR Quick Look")
  skriv("passprove.svg", bytes(ut("prove")), null, "passprove: sju spor, 0,05 mm breiare kvar gong")
  if (lesPlan(p.plan).some((q) => q.bog)) skriv("bogprove.svg", bytes(ut("bogprove")), null, "boyeprove: fem felt")
  const alt = ut("alt")
  skriv("alt.zip", bytes(alt), DETAIL.mid, "ALT-pakka slik appen lastar ho ned")
  const iAlt = new Map(unzip(alt.data as ArrayBuffer).map((f) => [f.name, f.data]))
  skriv("montering.txt", iAlt.get("montering.txt") as Uint8Array, DETAIL.mid, "rekkjefylgja, del for del, med retning")
  skriv("deler.csv", iAlt.get("kuttliste.csv") as Uint8Array, DETAIL.mid, "kuttlista, semikolon, desimalkomma")
  skriv("reglar.txt", iAlt.get("reglar.txt") as Uint8Array, DETAIL.mid, "kvar regel, og dei harde brota med kvifor")
  const pro = ut("prosjekt")
  skriv(`${stamme}.zip`, bytes(pro), null, `prosjektfila (LAGRE)${pro.merknad ? " — " + pro.merknad : ""}`)
  const dd = delData(bag)
  skriv("delar.json", JSON.stringify(dd), DETAIL.mid, "per del: omriss, hol, tjukn, matrise; og rekkjefylgja")

  const man: Manifest = {
    namn: stamme,
    mappe,
    ok: !reglar.some((r) => r.hard && !r.ok),
    tal: {
      plan: m.units,
      delar: m.parts,
      unike: m.unique,
      ledd: m.joints,
      avviste: m.avvist,
      lause: m.loose,
      ark: m.sheets,
      utnytting: m.util,
      kuttMm: m.cutLen,
      gravMm: ark.reduce((s, a) => s + a.gravMm, 0),
      tidS: m.cutTime,
      masseKg: m.mass,
      ytre: [m.envX, m.envY, m.envZ],
      sporMm: m.slotW,
      godsMm: m.narrow,
    },
    harde: reglar.filter((r) => r.hard && !r.ok).map((r) => ({ id: r.id, label: r.label, value: r.value, why: r.why })),
    mjuke: reglar.filter((r) => !r.hard && !r.ok).map((r) => ({ id: r.id, label: r.label, value: r.value })),
    ark,
    delar: liste,
    filer,
    fin: fin ? skrivFin(bag, join(mappe, "fin")) : null,
  }
  writeFileSync(join(mappe, "manifest.json"), JSON.stringify(man, null, 1))
  return man
}
