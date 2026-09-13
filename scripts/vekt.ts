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
  // +12 den 13.: snappet sitt steg er eit tal og ikkje ein konstant — det
  // gjeld både punkta i eit omriss og vridinga av eit plan, av di det er
  // den same avgjerda: kva vinklar reiskapen kjenner
  // +131 den 13.: `Teikninga`. Alt anna i fila teiknar noko motoren har
  // rekna; denne teiknar noko som ENNO IKKJE FINST — ei kjede av punkt på
  // eit frose skisseplan, som vert eit plan fyrst når du lukkar henne.
  // Difor ligg linene på hovudtråden: dei er inndata, som skisseplanet
  // sjølv, og ikkje eit resultat. Han er ein EIGEN komponent og ikkje ein
  // kanal til i `Handa`, av di det er den eine vegen som ikkje gjer den
  // funksjonen større
  // +118 den 13.: fyrste kanalen UT AV `Handa` — strekhandtaka. `PLAN.md`
  // punkt 2: kvar gest er den same saka, og alle seks låg i eitt skop på ni
  // hundre liner. `Handa` gjeng 976 → 921, og `Streket` er 126 med
  // grunngjeving.
  //
  // FILA VERT STØRRE AV EI UTFLYTTING, og det er ærleg: koden som flytta
  // seg bar lite med seg, medan kanalen fekk skrive ned kva han EIG, kva
  // han MELDER og kva han SLEPP — og arbitreringa, som var eit delt `mode`
  // og no er eitt ord (`arb`) båe kan lesa. Det er den skrivinga som gjer
  // at kanal nummer to kan flyttast utan å finne opp mønsteret på nytt
  // +16 den 13.: bandet eit spor-handtak kan dragast i fylgjer BOGEN når
  // leddet ligg mot eit bøygt plan. Punkta kjem ferdig rekna frå motoren
  // (`spor.boge`), so det som står her er berre at ei line er fleire bitar
  // +9 den 13.: teiknereiskapen les EITT DRAG og ikkje ei kjede av trykk.
  // Ein firkant frå hjørne til hjørne krev tre handlarar der eit trykk
  // greidde seg med to, og orbiten må stå av so lenge dragat varer. Resten
  // er grunngjevinga for at «trykk og ikkje drag» vart snudd
  ["components/scene.tsx", 3915],
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
  // +54 den 13.: fire former å stemple, og snappknappen. Formene er ein
  // runddans på den knappen som fanst — eitt trykk frys, to gjev boksen, og
  // trykket etter det byter form — so det er ingen ny knapp for dei. Snappet
  // ER ein ny knapp, og han seier eit TAL: eit ikon for «45 grader» er ei
  // teikning av eit tal
  // +29 den 13.: grensene som batt teikninga til kroppen. Eit plan utanfor
  // boksen vart STILT teke bort når strengen vart lesen, og ei teikna flate
  // fekk ikkje vera større enn halvanna storleik. Begge kom frå den tida ei
  // flate berre kunne frysast ut av kroppen. Tala er målte og ikkje gjetta:
  // kva ei flate kostar heng ikkje saman med kor stor ho er
  // +76 den 13.: teiknereiskapen. Skisseplanet vert FROSE i det du tek han
  // — teiknar du mot eit plan som fylgjer kameraet, flyttar flata seg under
  // handa kvar gong du snur synet — og det meste her er grunngjevinga for
  // det og for at ei teikna flate IKKJE vert spegla av symmetrien
  // +16 den 13.: den andre halvparten av den same saka. `teikn` er ein BOKS
  // og ikkje ei kjede, og dei fire hjørna vert rekna i `teiknLukk`. Kring
  // ti av linene er grunngjevinga: kvifor kjeda ikkje gav noko handtaka i
  // `Omrisset` ikkje alt gjev, og kvifor firkanten står oppreist
  ["components/studio.tsx", 3273],
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
  // +224 den 13.: bøygde ledd, steg TO — golvet. Eit flatt plan vinkelrett
  // på sylinderaksen møter den bøygde flata i ein SIRKEL med sylinderradien,
  // og då er ei sporline ikkje lenger alltid ei rett line. `Spor` får ei
  // krumming, og fire rekningar må fylgje henne: punktet på lina
  // (`sporPunkt`), punktet attende (`sporInn`), stykka ei line går gjennom
  // gods i (`stykkeBoge`), og lina som brotne line til teikning
  // (`sporBoge`). Det er den eine staden i huset ei sporline er bogna, og
  // `PLAN.md` punkt A seier kvifor prisen ligg her og ikkje i geometrien:
  // «det er å la eit spor vera ein boge».
  //
  // (og `ein2` gjekk den andre vegen: han fanst i to kopiar, og den eine er
  // borte — `moteInn` treng den same, so han bur i `plan.ts` no)
  //
  // Tretti og fem av linene er MÅLINGA over den eine lykkja som vert køyrd
  // for kvar celle i ruta: kva tre måtar å skrive henne på kostar, og kvifor
  // den som ser styggast ut er den som står. Utan tala er det ein kommentar
  // nokon «ryddar» neste veke.
  //
  // Kring seksti av dei er rekningane, resten er grunngjeving: kvifor eit
  // golv er reint der eit SKRÅ plan ikkje er det, kvifor buelengd er det
  // eine talet båe sidene av eit ledd kan lesa, kvifor ein lukka sirkel må
  // ha pariteten lesen éin stad når ei open line ikkje treng det, og kvifor
  // ein bøygd del ikkje vert skuva inn men BØYGD inn.
  //
  // +60 den 13.: RILLA, og den stive øya rundt kvart spor. Sjølve mønsteret
  // bur i `lib/rille.ts` og vart lagt der med vilje — han kunne ikkje lege
  // her, og ikkje berre av vekt: mønsteret kan reknast av eit omriss, ei
  // krumming og ein tabell, og det er heile det han treng vita. Det som
  // MÅTTE lege her er koplinga, og ho er tre ting: kva for ribber som er
  // strammare enn plata toler, SPERRESONA kvart spor får, og at ei
  // rillelinje kostar kuttlengd og ikkje areal. Sperresona er dei fleste
  // linene, og ho er grunngjeving: ho held `stykkeLangs` sant, og det er
  // ikkje synleg av koden som les henne.
  // +16 den 13.: eit ledd mot ein BØYGD partnar bind inga retning, og det
  // gjeld begge vegar. Fritaket stod her frå før på den eine sida. Linene er
  // tre; resten er grunngjevinga, og ho er heile verdien: at eit golv med
  // fire bogar mot huda og fire rette mot ribbene HAR ein veg inn er ikkje
  // synleg av koden, det er noko nokon har målt.
  ["lib/snitt.ts", 1827],
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
