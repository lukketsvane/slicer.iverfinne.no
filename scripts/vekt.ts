/**
 * VEKTA — kva dei store filene får lov til å vega.
 *
 * `REBUILD.md` skreiv storleiken sin inn i seg sjølv den 4. september —
 * 14 323 liner — og sette målet til «under ein tredel av dette». Målt den
 * 12.: 19 297. Ni dagar, førti prosent opp, og ikkje éin bunt med netto
 * nedgang. Eit ynske har aldri stogga ei line.
 *
 * So dette er ikkje eit mål, det er ei GRENSE, og ho står på det filene er
 * i dag og ikkje på det nokon vil at dei skal vera. Ho er ikkje her for å
 * gjera koden mindre — ho er her for å gjera det å gjera han større til ei
 * avgjerd nokon tek med opne auge. Treng du meir plass, senk ein annan
 * stad fyrst, eller flytt grensa i denne fila og sei i bunten kvifor.
 *
 * BERRE DEI STORE STÅR HER. Ei grense på kvar fil ville vore ein regel som
 * ropar på kvart einaste tillegg; desse fire er dei som faktisk ber vekta —
 * `scene.tsx` og `studio.tsx` er åleine 44 % av all kjelde — og dei er
 * dermed dei einaste der ei line til er verdt eit spørsmål.
 *
 * OG INGEN SEL STÅR HER. `REBUILD.md` seier det rett ut: vaktene er minnet
 * til prosjektet, og dei kan godt ikkje krympe. Eit tak på `panel.ts` ville
 * gjort det dyrare å prøve meir, og det er det motsette av det denne fila
 * er til for.
 *
 * Kommentarane tel med. Dei er kunnskap og ikkje fyll, og dei er ein stor
 * del av kvifor denne koden lèt seg lesa — men ein fil som veks på grunn av
 * dei er framleis ein fil som veks, og det er forma på fila grensa handlar
 * om.
 */
import { readFileSync } from "node:fs"

/** fila, og kor mange liner ho får vega. Sett den 12. september 2026. */
const TAK: [string, number][] = [
  // +29 den 12.: ei ribbe i montasjen er til å peike på. Fana synte rørsla og
  // svara ikkje på «kva er DEN der» — no seier lina adressa og steget, og
  // ribba står i blekk. Ein `tak()`-handlar på kvart nett, og fargen som seier
  // kva ein du tok
  ["components/scene.tsx", 3465],
  // +7 den 12.: målinga som viser at det grove byggjepasset kosta full pris
  // står i fila, og eit tal utan grunngjevinga si er eit tal ingen tør røre
  // +4 den 12.: montasjen og steget hans ned i arket, og lina som seier
  // «ingen delar» — to prop-liner og to kommentarliner
  // +13 den 12.: ribba handa peika på i montasjen — kva lina svarar med, og
  // kva som fell når lista delar er ei anna
  ["components/studio.tsx", 2940],
  // +48 den 12.: bøygde ledd, steg éin. Møtet mellom to flater er ei LISTE
  // no og ikkje eitt svar — ein sylinder kan skjerast på to generatorar — og
  // det er den generaliseringa som let ei bøygd ribbe gripe i noko
  ["lib/snitt.ts", 1282],
  ["lib/pack.ts", 955],
]

let feil = 0
console.log("vekta på dei store filene:\n")
console.log("  " + "fil".padEnd(28) + "liner".padStart(7) + "tak".padStart(7) + "  att")
for (const [fil, tak] of TAK) {
  // som `wc -l`: talet på linjeskift, ikkje talet på stykke mellom dei —
  // elles tel ei fil som sluttar med linjeskift ei tom line til slutt
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
