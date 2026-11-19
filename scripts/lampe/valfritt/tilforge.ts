import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

type P2 = [number, number]
type V3 = [number, number, number]
type Del = { namn: string; tjukn: number; omriss: P2[]; hol?: P2[][]; matrise: number[]; farge?: string; steg?: number; sprengt?: V3; krumming?: number }
type Strimmel = { u0: number; u1: number; m: number[] }
type Samling = { namn: string; delar: Del[] }
type Sirkel = { c: P2; r: number; n: number }

const FORGE = process.env.FORGECAD ?? ""

const arg = process.argv.slice(2)
const flagg = new Set(arg.filter((a) => a.startsWith("--")))
const [inn, utmappe] = arg.filter((a) => !a.startsWith("--"))
if (!inn || !utmappe) {
  console.error("bruk: tilforge.ts <samling.json> <utmappe> [--utan-bilete] [--utan-step] [--sirklar] [--toleranse=<mm>] [--feit] [--kant=off|thin|bold]")
  process.exit(2)
}
const kant = [...flagg].find((f) => f.startsWith("--kant="))?.slice(7) ?? "thin"
const toleranse = Number([...flagg].find((f) => f.startsWith("--toleranse="))?.slice(12) ?? 0)

const areal = (p: P2[]): number => {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

const punkt = (m: number[], x: number, y: number, z: number): V3 => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

function forenkla(p: P2[], tol: number): P2[] {
  if (tol <= 0 || p.length < 5) return p
  let fjern = 0
  for (let i = 1; i < p.length; i++) if (Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]) > Math.hypot(p[fjern][0] - p[0][0], p[fjern][1] - p[0][1])) fjern = i
  const hald = new Uint8Array(p.length + 1)
  const q = [...p, p[0]]
  hald[0] = hald[fjern] = hald[p.length] = 1
  const stabel: [number, number][] = [[0, fjern], [fjern, p.length]]
  while (stabel.length) {
    const [a, b] = stabel.pop() as [number, number]
    const dx = q[b][0] - q[a][0]
    const dy = q[b][1] - q[a][1]
    const l = Math.hypot(dx, dy) || 1
    let verst = 0
    let kvar = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((q[i][0] - q[a][0]) * dy - (q[i][1] - q[a][1]) * dx) / l
      if (d > verst) {
        verst = d
        kvar = i
      }
    }
    if (kvar >= 0 && verst > tol) {
      hald[kvar] = 1
      stabel.push([a, kvar], [kvar, b])
    }
  }
  return p.filter((_, i) => hald[i])
}

function stiv(m: number[]): string | null {
  if (m.length !== 16) return "matrisa har ikkje 16 tal"
  const k = [0, 1, 2].map((i) => [m[4 * i], m[4 * i + 1], m[4 * i + 2]])
  const prikk = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  for (let i = 0; i < 3; i++)
    for (let j = i; j < 3; j++)
      if (Math.abs(prikk(k[i], k[j]) - (i === j ? 1 : 0)) > 1e-4) return "matrisa er ikkje ortonormal"
  const det =
    k[0][0] * (k[1][1] * k[2][2] - k[1][2] * k[2][1]) -
    k[0][1] * (k[1][0] * k[2][2] - k[1][2] * k[2][0]) +
    k[0][2] * (k[1][0] * k[2][1] - k[1][1] * k[2][0])
  if (det < 0) return "matrisa speglar (det = -1)"
  if (Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]) + Math.abs(m[15] - 1) > 1e-6) return "siste rad er ikkje 0 0 0 1"
  return null
}

function somSirkel(p: P2[]): Sirkel | null {
  if (p.length < 12) return null
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length
  const cy = p.reduce((s, q) => s + q[1], 0) / p.length
  const rs = p.map((q) => Math.hypot(q[0] - cx, q[1] - cy))
  const r = rs.reduce((s, x) => s + x, 0) / rs.length
  if (rs.some((x) => Math.abs(x - r) > 1e-3)) return null
  const steg = (2 * Math.PI) / p.length
  for (let i = 0; i < p.length; i++) {
    const a = Math.atan2(p[i][1] - cy, p[i][0] - cx)
    const b = Math.atan2(p[(i + 1) % p.length][1] - cy, p[(i + 1) % p.length][0] - cx)
    let d = Math.abs(b - a)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (Math.abs(d - steg) > 1e-3) return null
  }
  return { c: [cx, cy], r, n: p.length }
}

const gong = (a: number[], b: number[]): number[] => {
  const ut = new Array<number>(16).fill(0)
  for (let k = 0; k < 4; k++) for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) ut[4 * k + r] += a[4 * i + r] * b[4 * k + i]
  return ut
}

const boyg = (k: number, t: number, um: number): number[] => {
  const a = k * um
  const c = Math.cos(a)
  const si = Math.sin(a)
  const px = Math.abs(a) < 1e-9 ? um : si / k
  const pz = t / 2 + (Math.abs(a) < 1e-9 ? 0 : (1 - c) / k)
  return [c, 0, si, 0, 0, 1, 0, 0, -si, 0, c, 0, px - um * c + (t / 2) * si, 0, pz - um * si - (t / 2) * c, 1]
}

function strimlar(d: Del): Strimmel[] {
  const k = d.krumming ?? 0
  if (!k) return []
  const R = Math.abs(1 / k)
  const steg = R * Math.min((8 * Math.PI) / 180, Math.max((2 * Math.PI) / 180, 2 * Math.acos(1 - 0.05 / R)))
  const u0 = Math.min(...d.omriss.map((q) => q[0]))
  const u1 = Math.max(...d.omriss.map((q) => q[0]))
  const n = Math.max(1, Math.ceil((u1 - u0) / steg))
  return Array.from({ length: n }, (_, i) => {
    const a = u0 + ((u1 - u0) * i) / n
    const b = u0 + ((u1 - u0) * (i + 1)) / n
    return { u0: a - 0.01, u1: b + 0.01, m: gong(d.matrise, boyg(k, d.tjukn, (a + b) / 2)) }
  })
}

const boygPunkt = (d: Del, x: number, y: number, z: number): V3 => {
  const k = d.krumming ?? 0
  if (!k) return punkt(d.matrise, x, y, z)
  const a = k * x
  const off = z - d.tjukn / 2
  return punkt(d.matrise, Math.sin(a) / k - off * Math.sin(a), y, d.tjukn / 2 + (1 - Math.cos(a)) / k + off * Math.cos(a))
}

const samling = JSON.parse(readFileSync(inn, "utf8")) as Samling
const foer = samling.delar.reduce((n, d) => n + d.omriss.length + (d.hol ?? []).reduce((m, h) => m + h.length, 0), 0)
for (const d of samling.delar) {
  d.omriss = forenkla(d.omriss, toleranse)
  d.hol = (d.hol ?? []).map((h) => (flagg.has("--sirklar") && somSirkel(h) ? h : forenkla(h, toleranse)))
}
const etter = samling.delar.reduce((n, d) => n + d.omriss.length + (d.hol ?? []).reduce((m, h) => m + h.length, 0), 0)
const ut = resolve(utmappe)
mkdirSync(ut, { recursive: true })
const stamme = samling.namn.replace(/[^A-Za-z0-9_-]/g, "_")
const namn = new Set<string>()
const venta = samling.delar.map((d) => {
  const feil = stiv(d.matrise)
  if (feil) throw new Error(`${d.namn}: ${feil}`)
  if (namn.has(d.namn)) throw new Error(`${d.namn}: namnet er brukt to gonger`)
  namn.add(d.namn)
  const a =
    Math.abs(areal(d.omriss)) -
    (d.hol ?? []).reduce((s, h) => {
      const c = flagg.has("--sirklar") ? somSirkel(h) : null
      return s + (c ? Math.PI * c.r * c.r : Math.abs(areal(h)))
    }, 0)
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  const senter: V3 = [0, 0, 0]
  const tett: P2[] = []
  d.omriss.forEach((p, i) => {
    const q = d.omriss[(i + 1) % d.omriss.length]
    const biter = d.krumming ? Math.max(1, Math.ceil(Math.abs(q[0] - p[0]) / 2)) : 1
    for (let j = 0; j < biter; j++) tett.push([p[0] + ((q[0] - p[0]) * j) / biter, p[1] + ((q[1] - p[1]) * j) / biter])
  })
  for (const [x, y] of tett) {
    for (const z of [0, d.tjukn]) {
      const q = boygPunkt(d, x, y, z)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], q[i])
        max[i] = Math.max(max[i], q[i])
        senter[i] += q[i] / (2 * tett.length)
      }
    }
  }
  const n = d.omriss.length
  const sx = d.omriss.reduce((s, q) => s + q[0], 0) / n
  const sy = d.omriss.reduce((s, q) => s + q[1], 0) / n
  return { namn: d.namn, volum: a * d.tjukn, min, max, senter: d.krumming ? senter : punkt(d.matrise, sx, sy, d.tjukn / 2), tilnaerma: !!d.krumming }
})
const midt: V3 = [0, 1, 2].map((i) => venta.reduce((s, v) => s + v.senter[i], 0) / venta.length) as V3
const sumVolum = venta.reduce((s, v) => s + v.volum, 0)

const data = samling.delar.map((d, i) => {
  const hol = d.hol ?? []
  const sirklar = flagg.has("--sirklar") ? hol.map(somSirkel) : hol.map(() => null)
  return {
    namn: d.namn,
    tjukn: d.tjukn,
    farge: d.farge ?? "#c9a36b",
    omriss: d.omriss,
    hol: hol.filter((_, j) => !sirklar[j]),
    sirklar: sirklar.filter((s): s is Sirkel => s !== null),
    matrise: d.matrise,
    strimlar: strimlar(d),
    v0: Math.min(...d.omriss.map((q) => q[1])) - 1,
    v1: Math.max(...d.omriss.map((q) => q[1])) + 1,
    ut: d.sprengt ?? [0, 1, 2].map((k) => venta[i].senter[k] - midt[k]),
    steg: d.steg ?? 1,
  }
})

const kjelde = `const DELAR = ${JSON.stringify(data)};
const sprengt = param("Sprengt", 0, { min: 0, max: 3 });
const steg = param("Steg", ${Math.max(...data.map((d) => d.steg))}, { min: 1, max: ${Math.max(...data.map((d) => d.steg))}, integer: true });
const lag = (d) => {
  const kutt = [...d.hol.map((h) => polygon(h)), ...d.sirklar.map((s) => circle2d(s.r).translate(s.c[0], s.c[1]))];
  const flate = kutt.length ? difference2d(polygon(d.omriss), ...kutt) : polygon(d.omriss);
  const bitar = d.strimlar.map((s) => intersection2d(flate, polygon([[s.u0, d.v0], [s.u1, d.v0], [s.u1, d.v1], [s.u0, d.v1]]))).map((b, i) => (b.isEmpty() ? null : b.extrude(d.tjukn).transform(d.strimlar[i].m))).filter((b) => b);
  const stiv = d.strimlar.length ? (bitar.length > 1 ? union(...bitar) : bitar[0]) : flate.extrude(d.tjukn).transform(d.matrise);
  const flytt = sprengt ? stiv.translate(d.ut[0] * sprengt, d.ut[1] * sprengt, d.ut[2] * sprengt) : stiv;
  return flytt.color(d.farge);
};
return DELAR.filter((d) => d.steg <= steg).map((d) => ({ name: d.namn, shape: lag(d) }));
`
const fil = join(ut, `${stamme}.forge.js`)
writeFileSync(fil, kjelde)
writeFileSync(join(ut, `${stamme}.venta.json`), JSON.stringify({ namn: samling.namn, sumVolum, delar: venta }))

function forge(a: string[]): { tekst: string; s: number } {
  const t0 = Date.now()
  let tekst = ""
  try {
    tekst = execFileSync(FORGE, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 })
  } catch (e) {
    const f = e as { stdout?: string; stderr?: string; message: string }
    tekst = `${f.stdout ?? ""}${f.stderr ?? ""}\nFEIL: ${f.message.split("\n")[0]}`
  }
  return { tekst, s: (Date.now() - t0) / 1000 }
}

const diag = forge(["run", fil, "--details", "--connectivity"])
writeFileSync(join(ut, `${stamme}.diag.txt`), diag.tekst)
const volum = [...diag.tekst.matchAll(/vol=([0-9.]+)mm/g)].map((m) => Number(m[1]))
const sumDiag = volum.reduce((s, v) => s + v, 0)
console.log(`forge.js ${(statSync(fil).size / 1024).toFixed(0)} kB · ${data.length} delar · ${foer} punkt${etter === foer ? "" : ` -> ${etter} (toleranse ${toleranse} mm)`}`)
const fysisk = /(\d+) physical components? across (\d+) objects?/.exec(diag.tekst)
const overlapp = fysisk ? (fysisk[1] === fysisk[2] ? "ingen overlapp" : `OVERLAPP: ${fysisk[2]} delar heng saman i ${fysisk[1]} grupper (volum per par: lesstep.py --overlapp)`) : "overlapp ukjent"
console.log(`run ${diag.s.toFixed(1)} s · ${volum.length} objekt · volum ${sumDiag.toFixed(1)} mm3 · venta ${sumVolum.toFixed(1)} mm3 · avvik ${(sumDiag - sumVolum).toFixed(2)} · ${overlapp}`)

const stepStreng = (s: string): string =>
  [...s]
    .map((c) => (c === "'" ? "''" : c.charCodeAt(0) < 128 ? c : `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`))
    .join("")

const rgb = (hex: string): string => {
  const h = hex.replace("#", "")
  return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).join(",")
}

function slank(s: string): string {
  const start = s.indexOf("DATA;") + 5
  const slutt = s.lastIndexOf("ENDSEC;")
  const kropp = new Map<number, string>()
  for (const m of s.slice(start, slutt).matchAll(/#(\d+)\s*=\s*([^;]*);/g)) kropp.set(Number(m[1]), m[2])
  const peikar = (t: string): number[] => [...t.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))
  const peika = new Set<number>()
  for (const t of kropp.values()) for (const r of peikar(t)) peika.add(r)
  const rom = new Map<number, number>()
  for (const [id, t] of kropp) {
    const m = /^\s*(?:SURFACE_CURVE|SEAM_CURVE)\('[^']*',\s*#(\d+)/.exec(t)
    if (m) rom.set(id, Number(m[1]))
  }
  for (const [id, t] of kropp) {
    if (!/^\s*EDGE_CURVE\(/.test(t)) continue
    kropp.set(id, t.replace(/#(\d+)(\s*,\s*\.[TF]\.\s*\))/, (heil, r: string, rest: string) => (rom.has(Number(r)) ? `#${rom.get(Number(r))}${rest}` : heil)))
  }
  const levande = new Set<number>()
  const ko = [...kropp.keys()].filter((id) => !peika.has(id))
  while (ko.length) {
    const id = ko.pop() as number
    if (levande.has(id)) continue
    levande.add(id)
    for (const r of peikar(kropp.get(id) ?? "")) if (!levande.has(r)) ko.push(r)
  }
  const ut: string[] = []
  for (const [id, t] of kropp) if (levande.has(id)) ut.push(`#${id}=${t.replace(/\s*\n\s*/g, "")};`)
  return `${s.slice(0, start)}\n${ut.join("\n")}\n${s.slice(slutt)}`
}

function etterarbeid(sti: string): string {
  let s = readFileSync(sti, "utf8")
  if (!flagg.has("--feit")) s = slank(s)
  let produkt = 0
  s = s.replace(
    /PRODUCT\('Open CASCADE STEP translator [0-9.]+ 1(?:\.(\d+))?',\s*'Open CASCADE STEP translator [0-9.]+ 1(?:\.\d+)?'/g,
    (_, n?: string) => {
      const d = n ? data[Number(n) - 1] : data.length === 1 ? data[0] : null
      const t = stepStreng(d ? d.namn : samling.namn)
      if (d) produkt++
      return `PRODUCT('${t}','${t}'`
    },
  )
  s = s.replace(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('(\d+)','',''/g, (_, n: string) => {
    const t = stepStreng(data[Number(n) - 1].namn)
    return `NEXT_ASSEMBLY_USAGE_OCCURRENCE('${n}','${t}','${t}'`
  })
  const rep = [...s.matchAll(/ADVANCED_BREP_SHAPE_REPRESENTATION\('',\(\s*#\d+\s*,\s*#(\d+)\s*\)\s*,\s*#(\d+)\s*\)/g)]
  let neste = 1
  for (const m of s.matchAll(/^#(\d+)\s*=/gm)) neste = Math.max(neste, Number(m[1]) + 1)
  const linjer: string[] = []
  if (rep.length === data.length) {
    rep.forEach((m, i) => {
      const n = neste
      neste += 9
      linjer.push(
        `#${n} = COLOUR_RGB('',${rgb(data[i].farge)});`,
        `#${n + 1} = FILL_AREA_STYLE_COLOUR('',#${n});`,
        `#${n + 2} = FILL_AREA_STYLE('',(#${n + 1}));`,
        `#${n + 3} = SURFACE_STYLE_FILL_AREA(#${n + 2});`,
        `#${n + 4} = SURFACE_SIDE_STYLE('',(#${n + 3}));`,
        `#${n + 5} = SURFACE_STYLE_USAGE(.BOTH.,#${n + 4});`,
        `#${n + 6} = PRESENTATION_STYLE_ASSIGNMENT((#${n + 5}));`,
        `#${n + 7} = STYLED_ITEM('color',(#${n + 6}),#${m[1]});`,
        `#${n + 8} = MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(#${n + 7}),#${m[2]});`,
      )
    })
    s = s.replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${linjer.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`)
  }
  s = s.replace("FILE_NAME('Open CASCADE Shape Model'", `FILE_NAME('${stepStreng(samling.namn)}'`)
  writeFileSync(sti, s)
  const tel = (re: RegExp) => (s.match(re) ?? []).length
  return `${tel(/MANIFOLD_SOLID_BREP\(/g)} MANIFOLD_SOLID_BREP · ${produkt} namngjevne produkt · ${tel(/STYLED_ITEM\(/g)} fargar · ${tel(/ADVANCED_FACE\(/g)} flater (${tel(/=\s*PLANE\(/g)} plan, ${tel(/CYLINDRICAL_SURFACE\(/g)} sylinder)`
}

if (!flagg.has("--utan-step")) {
  const sti = join(ut, `${stamme}.step`)
  const r = forge(["export", "step", fil, "--output", sti])
  if (!r.tekst.includes("Exported")) console.log(r.tekst.split("\n").slice(-6).join("\n"))
  else {
    const raa = statSync(sti).size
    const t0 = Date.now()
    const funn = etterarbeid(sti)
    console.log(`step ${r.s.toFixed(1)} s + etterarbeid ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(raa / 1024).toFixed(0)} kB -> ${(statSync(sti).size / 1024).toFixed(0)} kB · ${funn}`)
  }
}

if (!flagg.has("--utan-bilete")) {
  const felles = ["--size", "1400", "--edges", kant, "--background", "#ffffff"]
  const a = forge(["render", "3d", fil, "--output", join(ut, `${stamme}.png`), "--camera", "iso", "--camera", "front", "--camera", "top", ...felles])
  const b = forge(["render", "3d", fil, "--output", join(ut, `${stamme}_sprengt.png`), "--camera", "iso", "-p", "Sprengt=0.6", ...felles])
  const bilete = [a, b].flatMap((r) => r.tekst.match(/Images:\s*(.*)/)?.[1].split(/,\s*/) ?? [`FEIL ${r.tekst.split("\n").slice(-3).join(" ")}`])
  console.log(`bilete ${(a.s + b.s).toFixed(1)} s · ${bilete.join(" ")}`)
}
console.log(ut)
