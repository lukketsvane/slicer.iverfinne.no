import { relative, resolve } from "node:path"
import { lag, type Brot, type Utfall } from "./lag"

const BRUK = "bruk: pnpm lampe:konsept <mappe|konsept.ts> [--rask] [--bilete] [--alle] [--stor] [--step] [--ut <mappe>] [--json]"
const arg = process.argv.slice(2)
const verdiAv = (n: string) => {
  const i = arg.indexOf(n)
  return i < 0 ? undefined : arg[i + 1]
}
const fri = arg.filter((a, i) => !a.startsWith("--") && arg[i - 1] !== "--ut")
const rot = process.env.INIT_CWD ?? process.cwd()
const rel = (s: string | null) => {
  if (!s) return ""
  const r = relative(rot, s)
  return (r.startsWith("..") ? s : r || ".").replace(/\\/g, "/")
}
const tal = (v: number, n = 0) => (Number.isFinite(v) ? v.toFixed(n) : "–")

function brotOrd(b: Brot): string {
  const kva = b.par?.length ? b.par.slice(0, 6).map(([x, y]) => `${x}-${y}`).join(",") : b.ids?.length ? b.ids.slice(0, 8).join(",") : b.adr?.length ? b.adr.slice(0, 8).join(",") : ""
  return `${b.regel}${kva ? `[${kva}]` : ""}`
}

function line(u: Utfall): string {
  const del = [
    `${u.ok ? "ALT OK" : "IKKJE OK"} ${u.namn}`,
    `${u.mal.map((v) => tal(v)).join("x")} mm`,
    `${u.plan} plan ${u.delar} delar ${u.ledd} ledd ${u.lause} lause ${u.ark} ark ${tal(u.kuttM, 2)} m ${tal(u.kg, 3)} kg`,
  ]
  if (u.brot.length) del.push(`brot ${u.brot.map(brotOrd).join(" ")}`)
  const okKrav = u.krav.filter((q) => q.ok).length
  del.push(`krav ${okKrav}/${u.krav.length}`)
  const fiks = u.brot.map((b) => b.fiks).filter(Boolean)
  if (fiks.length) del.push(`fiks: ${[...new Set(fiks)].join(" | ")}`)
  if (u.synFeil.length) del.push(`syn: ${u.synFeil[0].slice(0, 80)}`)
  if (u.step) del.push(u.step.split("\n")[0])
  del.push([u.filer.rapport, u.filer.ark, u.filer.zip].filter(Boolean).map((q) => rel(q)).join(" "))
  return del.join(" · ")
}

async function main() {
  if (!fri[0]) {
    console.log(BRUK)
    process.exitCode = 2
    return
  }
  const ut = verdiAv("--ut")
  const u = await lag(resolve(rot, fri[0]), {
    rask: arg.includes("--rask"),
    bilete: arg.includes("--alle") ? "alle" : arg.includes("--bilete") ? "ark" : "ingen",
    stor: arg.includes("--stor"),
    step: arg.includes("--step"),
    ...(ut ? { ut: resolve(rot, ut) } : {}),
  })
  console.log(arg.includes("--json") ? JSON.stringify(u) : line(u))
  process.exitCode = u.ok ? 0 : 1
}

main().catch((e) => {
  console.log(`FEIL ${String((e as Error).message ?? e).split("\n")[0]}`)
  process.exitCode = 2
})
