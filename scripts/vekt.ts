import { readFileSync } from "node:fs"

const TAK: [string, number][] = [
  ["components/scene.tsx", 2730],
  ["components/studio.tsx", 2330],
  ["lib/snitt.ts", 1056],
  ["lib/pack.ts", 560],
]

let feil = 0
console.log("vekta på dei store filene:\n")
console.log("  " + "fil".padEnd(28) + "liner".padStart(7) + "tak".padStart(7) + "  att")
for (const [fil, tak] of TAK) {
  const tekst = readFileSync(fil, "utf8")
  const n = tekst ? tekst.split("\n").length - (tekst.endsWith("\n") ? 1 : 0) : 0
  const att = tak - n
  const over = n > tak
  if (over) feil++
  console.log(`  ${over ? "FEIL " : "ok   "}${fil.padEnd(22)}${String(n).padStart(7)}${String(tak).padStart(7)}  ${att >= 0 ? `${att}` : `${-att} FOR MYKJE`}`)
}
console.log(
  feil
    ? `\n${feil} fil(er) over taket. Senk ein annan stad, eller flytt grensa i scripts/vekt.ts og sei i bunten kvifor.`
    : "\nvekta held",
)
process.exit(feil ? 1 : 0)
