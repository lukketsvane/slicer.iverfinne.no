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
  // +62 den 12.: den fyrste fingeren vert halden att frå orbiten til han har
  // gått tolv pikslar. Det meste er grunngjevinga — kvifor ein orbit ikkje
  // kan målast på avstand, og kvifor grensa er px og ikkje ei klokke
  // −22 den 12.: virvelen er ute. Fyrste gongen eit tak her gjeng NED
  // +60 den 12.: snappet i omrisset. Eit punkt som vert drege les kva det
  // sikta på — eit anna punkt, ei kant, aksen til ein nabo — og seier frå i
  // blekk medan fingeren går. Sjølve geometrien ligg i `plan.ts` og vert
  // prøvd av `pnpm hand`; det som står her er omrekninga frå pikslar til
  // omrisset sine einingar, og grunngjevinga for at radien er i pikslar
  // +12 den 12.: radien til snappet vert delt på storleiken. `paaFlata`
  // svarar i millimeter og omrisset står i brøk, so han var to hundre gonger
  // for stor og eit heilt vanleg drag åt opp eit hjørne. Grunngjevinga er
  // lengre enn rettinga, av di neste mann elles rettar henne attende
  ["components/scene.tsx", 3577],
  // +7 den 12.: målinga som viser at det grove byggjepasset kosta full pris
  // står i fila, og eit tal utan grunngjevinga si er eit tal ingen tør røre
  // +4 den 12.: montasjen og steget hans ned i arket, og lina som seier
  // «ingen delar» — to prop-liner og to kommentarliner
  // +13 den 12.: ribba handa peika på i montasjen — kva lina svarar med, og
  // kva som fell når lista delar er ei anna
  // +28 den 12.: «fiks alt» — handlaren som sender, og svarbolken som set
  // posen og seier kva han tok og kva som står att. Ein knapp som endrar
  // seks ting i stillheit er ein knapp ingen tør trykkje to gonger
  // −82 den 12.: virvelen er ute — knappen, dei to konstantane, staten,
  // tasten og heile blokka som rekna vifta ut. Ein kanal mindre i `Handa`
  // +25 den 12.: montasjefana vert slegen av når objektet ikkje går i hop.
  // Animasjonen synte delane kome inn éin etter éin sjølv om ein del stod
  // fast eller to delar stod i kvarandre — ein film som seier at det gjekk.
  // Det meste er grunngjevinga for kvifor fana vert stengd medan uttaka
  // ikkje vert det
  // +75 den 12.: mellomrommet skjer, og høgremenyen på ei planrad. Menyen
  // legg ikkje til ei einaste handling — kvar line er ein tast som fanst
  // frå før — so det meste er grunngjevinga for kvifor han likevel er verdt
  // plassen, og for kvifor ein knapp som er teken eig mellomrommet sitt
  // +100 den 12.: fleire filer på ein gong, biblioteket i menyen, og
  // skift-trykk på ei planrad. Dei to fyrste heng i hop: du hentar inn det
  // du har, og plukkar etterpå — og då må det du henta inn STÅ ein stad.
  // Skiftet lagar ei gruppe og ikkje eit nytt slag utval: det finst ikkje
  // «fleire valde» i denne reiskapen, det finst grupper
  ["components/studio.tsx", 3092],
  // +48 den 12.: bøygde ledd, steg éin. Møtet mellom to flater er ei LISTE
  // no og ikkje eitt svar — ein sylinder kan skjerast på to generatorar — og
  // det er den generaliseringa som let ei bøygd ribbe gripe i noko
  // +22 den 12.: tabellen over kva oppløysinga kostar og kjøper, målt. Han
  // står over `DETAIL`, av di eit nivå utan tala sine er eit tal nokon
  // kjem til å setje etter kjensle
  // +56 den 12.: møta som er kurver vert talde. Eit flatt plan som skrår mot
  // sylinderaksen fall bort i stille — ribba hadde spor frå dei rette møta,
  // so den harde regelen gjekk grøn — og eit krumt skal med tak og botn
  // melde fire og tjue ledd utan å nemne dei åtte som heldt golva. Tjue av
  // linene er teljinga; resten er kvifor talet ikkje tel det som aldri var
  // der, og kva som med vilje står utanfor det
  // +79 den 12.: luka mellom to bøygde ribber vert målt på MIDTLINA og ikkje
  // langs normalen. Normalen til ei bøygd flate er normalen der buen byrjar,
  // og to ribber som krøkte seg mot kvarandre las 33,0 mm medan dei stod
  // 0,4 mm frå kvarandre. Skanninga er femten liner; resten er grunngjevinga
  // og grensa som gjer at ho berre vert køyrd der ho kan endre svaret
  // +29 den 12.: lukemålinga er flytt ut av `buildSnitt` og er ein eksportert
  // funksjon. Rådet som tek plan bort les den SAME rekninga som talet i tavla;
  // stod dei med kvar si, tok knappen plan regelen ikkje klaga på — eller
  // fanst ikkje medan lina var raud, som han ikkje gjorde på bøygde ribber
  // +59 den 12.: klemma — to delar som har gods på den same lina etter at
  // spora er skorne. Regelen «kan monterast» stod grøn på alle dei tjue
  // innebygde formene medan nitten av dei hadde delar som skulle vera same
  // staden, so dette er ei avlesing som mangla og ikkje ei som er finare.
  // Det meste er grunngjevinga: kvifor ho vert lesen på dei FERDIGE
  // profilane og ikkje på møta som vart nekta
  ["lib/snitt.ts", 1527],
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
