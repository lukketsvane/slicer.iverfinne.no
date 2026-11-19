import { chromium, type Browser, type Page } from "playwright"
import { createServer, type Server } from "node:http"
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HER = dirname(fileURLToPath(import.meta.url))
const TRE = process.env.SYN_THREE ?? resolve(HER, "../../node_modules/three")

export const SYNSNAMN = ["helt", "front", "side", "topp", "under", "lys", "sprengt"] as const
export type Synsnamn = (typeof SYNSNAMN)[number] | "ark"

export type Del = {
  namn?: string
  adr?: string
  tjukn?: number
  omriss?: number[][]
  hol?: number[][][]
  matrise?: number[]
  material?: string
  farge?: string
  speglSide?: 1 | -1 | 0
  krumming?: number
  ekstra?: boolean
  boygd?: { krumming?: number; nett?: number[] }
}

export type Utstyr = {
  slag: "paere" | "sokkel" | "leidning" | "sylinder" | "boks" | "kule"
  senter?: number[]
  diameter?: number
  lengd?: number
  retning?: number[]
  punkt?: number[][]
  storleik?: number[]
  matrise?: number[]
  farge?: string
  metall?: boolean
  ru?: number
  styrke?: number
}

export type Scene = {
  namn?: string
  deler?: Del[]
  delar?: Del[]
  glb?: string
  eining?: "mm" | "m"
  glbOpp?: "y" | "z"
  tjukn?: number
  material?: string
  kropp?: string
  kroppSyn?: boolean
  utstyr?: Utstyr[]
  lys?: { punkt: number[]; radius?: number; farge?: string; styrke?: number } | { punkt: number[]; radius?: number; farge?: string; styrke?: number }[]
  opp?: "z" | "y"
  fram?: number[]
  steg?: { delar: string[]; retning?: number[] | null }[]
  orden?: { delar: string[]; retning?: number[] | null }[]
  heng?: number | { tak?: number; feste?: number[]; leidning?: boolean | number; farge?: string }
  vegg?: boolean | { punkt?: number[]; normal?: number[] }
  golv?: number
  golvAvstand?: number
  veggAvstand?: number
  sprengAvstand?: number
  lysstyrke?: number
  bakgrunn?: [string, string]
  kamera?: Partial<Record<(typeof SYNSNAMN)[number], { az?: number; el?: number; linse?: number; vid?: number }>>
  atterskin?: number
}

export type SynVal = {
  ut?: string
  namn?: string
  syn?: Synsnamn[] | "alle"
  storleik?: [number, number]
  stor?: boolean
  prover?: number
  material?: string
  tjukn?: number
  eining?: "mm" | "m"
  glbOpp?: "y" | "z"
  kropp?: string
  stille?: boolean
}

export type SynSvar = { filer: Record<string, string>; ms: Record<string, number>; ramme: Record<string, number[]>; info: Record<string, unknown>; feil: string[] }

const SIDE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module" src="/side.js"></script>`

const MIME: Record<string, string> = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" }

function tenar(): Promise<{ server: Server; port: number }> {
  return new Promise((ja) => {
    const server = createServer((spr, svar) => {
      const url = new URL(spr.url ?? "/", "http://x")
      let sti = ""
      if (url.pathname === "/") {
        svar.writeHead(200, { "content-type": "text/html" })
        svar.end(SIDE)
        return
      }
      if (url.pathname === "/side.js") sti = join(HER, "syn-side.js")
      else if (url.pathname.startsWith("/three/")) sti = join(TRE, url.pathname.slice(7))
      else if (url.pathname === "/fil") sti = url.searchParams.get("sti") ?? ""
      if (!sti || !existsSync(sti) || !statSync(sti).isFile()) {
        svar.writeHead(404)
        svar.end()
        return
      }
      svar.writeHead(200, { "content-type": MIME[extname(sti)] ?? "application/octet-stream", "cache-control": "no-store" })
      createReadStream(sti).pipe(svar)
    })
    server.listen(0, "127.0.0.1", () => ja({ server, port: (server.address() as { port: number }).port }))
  })
}

const erGlb = (s: string) => /\.(glb|gltf)$/i.test(s)

export async function syn(kjelde: string | Scene, val: SynVal = {}): Promise<SynSvar> {
  let scene: Scene
  let rot = process.cwd()
  let stamme = val.namn
  if (typeof kjelde === "string") {
    const sti = resolve(kjelde)
    rot = dirname(sti)
    stamme ??= basename(sti).replace(/\.[^.]+$/, "")
    scene = erGlb(sti) ? { glb: sti } : (JSON.parse(readFileSync(sti, "utf8")) as Scene)
  } else scene = { ...kjelde }
  stamme ??= scene.namn ?? "syn"
  scene.namn ??= stamme
  if (val.material) scene.material = val.material
  if (val.tjukn) scene.tjukn = val.tjukn
  if (val.eining) scene.eining = val.eining
  if (val.glbOpp) scene.glbOpp = val.glbOpp
  if (val.kropp) scene.kropp = resolve(val.kropp)
  const ut = resolve(val.ut ?? rot)
  mkdirSync(ut, { recursive: true })
  const { server, port } = await tenar()
  const fil = (s: string) => `http://127.0.0.1:${port}/fil?sti=${encodeURIComponent(isAbsolute(s) ? s : resolve(rot, s))}`
  if (scene.glb) scene.glb = fil(scene.glb)
  if (scene.kropp) scene.kropp = fil(scene.kropp)
  const sk = val.stor ? 2 : 1
  const [b0, h0] = val.storleik ?? [1400, 1400]
  const liste: Synsnamn[] = val.syn === "alle" ? [...SYNSNAMN, "ark"] : (val.syn ?? ["ark"])
  const svar: SynSvar = { filer: {}, ms: {}, ramme: {}, info: {}, feil: [] }
  let nettlesar: Browser | null = null
  try {
    nettlesar = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
    const side: Page = await nettlesar.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })
    side.on("pageerror", (e) => svar.feil.push(String(e)))
    side.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message|GPU stall/.test(m.text())) svar.feil.push(m.text())
    })
    const t0 = Date.now()
    await side.goto(`http://127.0.0.1:${port}/`)
    await side.waitForFunction("window.klar === true", undefined, { timeout: 60000 })
    svar.info = (await side.evaluate((s) => (window as any).syn.bygg(s), scene as any)) as Record<string, unknown>
    svar.ms.bygg = Date.now() - t0
    const skriv = (namn: string, url: string) => {
      const sti = join(ut, `${stamme}-${namn}.png`)
      writeFileSync(sti, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))
      svar.filer[namn] = sti
    }
    for (const namn of liste) {
      const t1 = Date.now()
      if (namn === "ark") {
        const r = (await side.evaluate(([v]) => (window as any).syn.ark(v), [{ skala: sk, prover: val.prover ? Math.max(4, Math.round(val.prover * 0.6)) : 24, namn: scene.namn }])) as { url: string; tider: Record<string, number>; rammer: Record<string, number[]> }
        skriv("ark", r.url)
        for (const [k, v] of Object.entries(r.tider)) svar.ms["ark." + k] = v
        for (const [k, v] of Object.entries(r.rammer)) svar.ramme["ark." + k] = v
      } else {
        const r = (await side.evaluate(([n, b, h, p]) => {
          const w = window as any
          const t = w.syn.teikn(n, b, h, { prover: p, kart: 2048 })
          return { url: w.syn.bilete(), ramme: t.ramme }
        }, [namn, b0 * sk, h0 * sk, val.prover ?? 40] as const)) as { url: string; ramme: number[] }
        skriv(namn, r.url)
        svar.ramme[namn] = r.ramme
      }
      svar.ms[namn] = Date.now() - t1
    }
    const spegl = await side.evaluate(() => (window as any).syn.speglTal())
    if (spegl) svar.info.spegl = spegl
  } finally {
    await nettlesar?.close()
    server.close()
  }
  if (!val.stille) {
    const i = svar.info as { delar?: number; mal?: number[]; trekantar?: number }
    console.log(`${stamme}: ${i.delar} delar · ${i.mal?.join(" x ")} mm · ${i.trekantar} trekantar · bygg ${svar.ms.bygg} ms`)
    for (const [k, v] of Object.entries(svar.filer)) console.log(`  ${k.padEnd(8)} ${String(svar.ms[k]).padStart(6)} ms  ${v}`)
    const ruter = Object.entries(svar.ms).filter(([k]) => k.startsWith("ark."))
    if (ruter.length) console.log("  ark-ruter: " + ruter.map(([k, v]) => `${k.slice(4)} ${v}`).join(" · ") + " ms")
    const sp = (svar.info as { spegl?: Record<string, number>; speglflater?: number }).spegl
    if (sp) console.log(`  spegl: ${(svar.info as { speglflater?: number }).speglflater} flater · ${sp.straalar} strålar · ut av lampa direkte ${sp.utDirekte} % · via spegl ${sp.utViaSpegl} % (${sp.paaRomViaSpegl} % landar på golv/vegg/tak) · fyrste treff spegl ${sp.fyrstPaaSpegl} % · ${sp.ms} ms`)
    const ukj = (svar.info as { ukjende?: string[] }).ukjende ?? []
    if (ukj.length) console.log("  STEG NEMNER UKJENDE DELAR: " + ukj.join(" "))
    const ute = Object.entries(svar.ramme).filter(([, r]) => r.some((x) => Math.abs(x) > 1))
    if (ute.length) console.log("  UTANFOR RAMMA: " + ute.map(([k, r]) => `${k} [${r.join(" ")}]`).join(" · "))
    if (svar.feil.length) console.log("  FEIL: " + [...new Set(svar.feil)].slice(0, 6).join(" | "))
  }
  return svar
}

const erHovud = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (erHovud) {
  const a = process.argv.slice(2)
  const flagg = (n: string) => {
    const i = a.indexOf("--" + n)
    return i < 0 ? undefined : a[i + 1]
  }
  const kjelde = a.find((x, i) => !x.startsWith("--") && !(i > 0 && a[i - 1].startsWith("--") && !["--stor", "--stille"].includes(a[i - 1])))
  if (!kjelde) {
    console.log("bruk: pnpm lampe:syn <scene.json|modell.glb> [--ut mappe] [--syn helt,front,side,topp,under,lys,sprengt,ark|alle] [--storleik 1400x1400] [--stor] [--prover 40] [--namn x] [--material bjork] [--tjukn 3] [--eining mm|m] [--glbopp y|z] [--kropp flate.stl|glb]")
    process.exit(1)
  }
  const st = flagg("storleik")?.split("x").map(Number) as [number, number] | undefined
  const sy = flagg("syn")
  syn(kjelde, {
    ut: flagg("ut"),
    namn: flagg("namn"),
    syn: sy === "alle" ? "alle" : (sy?.split(",") as Synsnamn[] | undefined),
    storleik: st,
    stor: a.includes("--stor"),
    prover: flagg("prover") ? Number(flagg("prover")) : undefined,
    material: flagg("material"),
    tjukn: flagg("tjukn") ? Number(flagg("tjukn")) : undefined,
    eining: flagg("eining") as "mm" | "m" | undefined,
    glbOpp: flagg("glbopp") as "y" | "z" | undefined,
    kropp: flagg("kropp"),
  }).then((r) => process.exit(r.feil.length ? 2 : 0), (e) => {
    console.error(e)
    process.exit(1)
  })
}
