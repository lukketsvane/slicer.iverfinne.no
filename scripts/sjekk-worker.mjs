/**
 * Vakta mot eit stumt produksjonsbrot.
 *
 * Turbopack kompilerer ikkje `new Worker(new URL("../lib/worker.ts", …))` —
 * han legg den RÅE TypeScript-fila i static/media og serverer henne som
 * video/mp2t. Arbeidaren døyr då lydlaust i nettlesaren: ingen geometri
 * kjem, og sida står «fryst» med prikken på. Feilen syner seg ikkje i
 * utviklingsmodus og ikkje i typesjekken — berre i produksjon, og berre
 * som at ingenting skjer.
 *
 * Difor: byggjeskriptet tvingar webpack, og denne fila NEKTAR å sleppe
 * gjennom eit bygg der arbeidaren ligg som .ts i media — same kva buntar
 * som laga det.
 *
 * MEN «ingen rå .ts» er ikkje det same som «arbeidaren er der».
 *
 * Vakta var berre negativ: ho leita etter noko gale, og fann ho det ikkje,
 * sa ho ok. Eit bygg som ikkje sende arbeidaren I DET HEILE — ein import
 * som fall bort, eit oppsett som slutta å kjenne att `new Worker`, ei
 * mappe som skifta namn — gjekk rett gjennom med grøn tekst. Og det er
 * den same sida som resultat: ingen geometri, prikken står.
 *
 * So ho spør no om det POSITIVE òg: finst det kompilert JavaScript i
 * bygget som kom av `lib/worker.ts`?
 *
 * Nåla vert henta ut av kjeldefila sjølv og ikkje skriven ned her. Ein
 * hardkoda tekst er ei nål som ein dag vert omskriven i worker.ts utan at
 * nokon ser at vakta slutta å finne henne — og ei vakt som leitar etter
 * noko som ikkje finst lenger, er grøn for alltid.
 */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const brot = (kva) => {
  console.error(`BYGGET ER BROTE: ${kva}`)
  process.exit(1)
}

// -- 1. arbeidaren skal ikkje liggje som rå TypeScript ------------------------
const media = join(".next", "static", "media")
const raa = existsSync(media)
  ? readdirSync(media).filter((f) => f.startsWith("worker") && f.endsWith(".ts"))
  : []
if (raa.length > 0) {
  brot(
    `arbeidaren ligg som rå TypeScript i static/media (${raa.join(", ")}).\n` +
      "Det tyder at bygget gjekk gjennom Turbopack. Bygg med `next build --webpack`.",
  )
}

// -- 2. og han skal liggje der som JavaScript ---------------------------------
/**
 * Ein tekst som berre finst i arbeidaren.
 *
 * Feilmeldingane hans er dei einaste strengane i fila som er lange nok til
 * ikkje å kunne dukke opp ved eit uhell, og dei overlever minifiseringa:
 * ein minifikator kortar namn, ikkje tekst nokon skal lese i ein konsoll.
 * Den lengste vinn, so valet er det same frå bygg til bygg.
 */
const kjelde = "lib/worker.ts"
const naal = [...readFileSync(kjelde, "utf8").matchAll(/"((?:[^"\\\n]|\\.){24,})"/g)]
  .map((m) => m[1])
  .sort((a, b) => b.length - a.length)[0]

if (!naal) {
  brot(
    `fann ingen tekst i ${kjelde} som er lang nok til å kjenne arbeidaren att på.\n` +
      "Vakta kan ikkje stadfeste at han kom med i bygget. Sjå scripts/sjekk-worker.mjs.",
  )
}

/** alt kompilert JavaScript under static, uansett kva chunk det hamna i */
function jsFiler(rot) {
  const ut = []
  const gaa = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) gaa(p)
      else if (e.endsWith(".js")) ut.push(p)
    }
  }
  if (existsSync(rot)) gaa(rot)
  return ut
}

const berarar = jsFiler(join(".next", "static")).filter((f) =>
  readFileSync(f, "utf8").includes(naal),
)

if (berarar.length === 0) {
  brot(
    `arbeidaren er ikkje å finne i bygget.\n` +
      `Ingen .js under .next/static ber teksten «${naal}» frå ${kjelde}.\n` +
      "Anten vart han aldri bunta, eller so ligg han ein stad nettlesaren ikkje ser.\n" +
      "Sida vil laste, teikne ingenting, og stå med prikken på.",
  )
}

console.log(
  `worker-vakta: ok — ingen rå .ts i static/media, ` +
    `og arbeidaren ligg i ${berarar.length === 1 ? berarar[0] : `${berarar.length} chunkar`}`,
)
