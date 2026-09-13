# Ein plan for massiv betring

Skriven ved å køyre selane, ikkje ved å lesa dei. Kvart tal under er målt på
denne maskina i dag, og står med talet sitt so det kan motseiast.

Der ei sak kjem frå `NESTE.md`, står det. Koden bak kvar av dei er lesen og
stadfest her; tre tidsmålingar er ikkje køyrde om att, og dei er merkte
«(NESTE.md)» der dei står. Alt anna er mitt eige og køyrt i dag.

Rekkjefylgja er kva det kostar: fyrst det som lyg, so det som veks, so det som
manglar, so det som ikkje finst enno.

---

## Kva som held

Alt dette er køyrt på nytt, og det står:

    sjekk     6 s     tsc, ingen feil
    probe     7 s     talfeltet, dei fjorten formene, bøyen, montasjen
    rekkje    3 s     kuttfilene lesne attende: gravering, hòl, omriss, i orden
    vrient    9 s     93 saker — nett som ikkje er nett, skyvarar i endane
    ledd      7 s     998 ledd over fem saker, 0 tapte, 0 utan gods
    raad      5 s     kvar regel broten, kvart råd prøvt
    hand      4 s     planstrengen: fiendtleg inndata, eitt namn aldri brukt om att
    pakk     14 s     0 overlapp, 0 utanfor, 0 feilmerkte over seks pakkingar
    glb       1 s     seks filer skrivne og lesne attende
    panel   375 s     seksten bolkar i ein ekte nettlesar, 366 prøver

Panelet fordeler seg slik, og det er tal å argumentere med:

    telefon 161,7 s   grupper 50,7 s   benk 29,7 s   forma 24,2 s   boyen 19,4 s
    virvelen 17,3 s   skalet 16,5 s    montasjen 13,1 s   handtaka 11,1 s
    taket 7,6 s   flyt 6,5 s   symmetri 4,7 s   reglar 4,5 s   uttaka 3,1 s
    andrefingeren 3,0 s   mork 1,8 s

`telefon` er 43 % av heile køyringa åleine. `CLAUDE.md` seier allereie at ein
skal køyre éin bolk medan ein arbeider; `telefon` er no stor nok til at
kroppsverktyet bør ut av han og verta sin eigen bolk.

Målinga er frå den 12. `virvelen` er sidan teken bort med verktyet sitt, so
køyringa er 17,3 s kortare enn tabellen seier.

**Køyrd om att seinare same dag**, etter dei fire sakene under D–G. Alt grønt,
og kroppsverktyet er sidan teke ut av `telefon` og har vorte sin eigen bolk, so
framlegget over er gjennomført:

    sjekk 2 s   probe 27 s   rekkje 3 s   vrient 19 s   ledd 8 s   raad 9 s
    hand 4 s    pakk 13 s    glb 0 s      enkel 2 s
    panel 428 s, 373 prøver over seksten bolkar, null feil

    telefon 146,7 s   grupper 58,9 s   skalet 41,1 s   benk 31,0 s
    kroppen 25,7 s    forma 25,4 s     boyen 21,3 s    montasjen 20,4 s
    handtaka 12,4 s   reglar 11,3 s    taket 11,1 s    flyt 7,9 s
    symmetri 5,3 s    uttaka 4,8 s     andrefingeren 3,1 s   mork 1,8 s

`raad` er den som voks: 5 s → 9 s og 48 prøver, av di han no bryt kvar einaste
regel og seier frå om ein av dei ikkje let seg bryte.

CI er grøn på `main` (køyring 70). Typehygiena er uvanleg god: **ein** einaste
`as any`/`@ts-ignore` i 19 297 liner kjelde. Motoren er rask og lineær der ho
skal vera:

     plan   parallelle   ledd   ms/plan   ms/ledd
        8         88 ms    12      11,0      2,50
       32        332 ms   180      10,4      1,26
       64        628 ms   732       9,8      1,07

Doblinga frå 32 til 64 plan er **×1,84–1,95** over tre køyringar. Teorien seier
2,00. Snittinga er lineær, og det er det `pnpm tak` er til for å vita.

Dette er eit friskt prosjekt. Det som står under er ikkje forfall — det er
ting som har vakse fortare enn det som skulle halde dei i sjakk.

---

## 1. Ei vakt som prøver mekanismen og ikkje verknaden

**Dette er den viktigaste saka på sida, og det er ikkje feilen sjølv.**

Feilen fyrst. Regelen er skriven tre stader — *medan det søv tek det ikkje imot
fingrar; det fyrste trykket vekkjer og gjer elles ingenting*. Han held ikkje:

    app/globals.css:643   main[data-sov] .tumme  { pointer-events: none }
    app/globals.css:442   .tumme > *             { pointer-events: auto }

Ein `none` hjå forelderen overlever ikkje ein `auto` hjå barnet. Same forma i
`.handtak [data-handtak]`, `.sider button`, `.spor button`, `.punkt button`.
Berre arket er verkeleg dødt.

Målt i dag, på 390×844, to køyringar som berre skil seg i eitt trykk — og lese
av det appen SJØLV skreiv til lagringa si, ikkje av eit bilete:

    utan trykk   sov=true   plan ""  →  ""
    med  trykk   sov=true   plan ""  →  "1@0.5,0.5,0.5/-0.9363,-0.3511,0"

Eitt trykk på ein skjerm som syner ingenting, og eit plan er skore, namngjeve og
lagra. `skjer.disabled` er `false` heile tida, og `elementFromPoint` gjev knappen
medan `data-sov` står.

**Og no det som betyr noko.** Vakta som skal fange nett dette står i
`scripts/panel.ts:2463`:

```
sjekk("og tek ikkje imot fingrar medan det søv", sovande.peik === "none")
```

`sovande.peik` er `getComputedStyle(document.querySelector(".tumme")).pointerEvents`
— på **forelderen**. Han ER `none`. Vakta er grøn. Ho har vore grøn heile tida,
og ho vil vera grøn uansett kva barna gjer, av di ho aldri spør barna.

Vakta prøver at **regelen er skriven**. Feilen er at **trykket verkar**. Det er
to ulike påstandar, og berre den eine er den vi bryr oss om.

`CLAUDE.md` seier det allereie, om tal: *kvart tal denne reiskapen skriv er lese
av geometrien; det same er kvar prøve*. Ei prøve som les ein CSS-eigenskap i
staden for ein verknad er nett det motsette — ho les det vi skreiv, ikkje det
som skjedde.

**Tiltak, i to delar — og den fyrste er ikkje den ein trur.**

CSS-en åleine rettar det ikkje, og det synte seg fyrst då vakta vart skriven om.
Rekkjefylgja er heile saka: vekkjaren høyrer `pointerdown`, og nettlesaren lagar
`click` fyrst ved `touchend`. Fingeren vekkjer altso grensesnittet, `data-sov`
fell bort, knappane er levande att — og so kjem klikket og landar på ein knapp
som stod usynleg då fingeren gjekk ned. Med berre CSS-en på plass var vakta
framleis raud, av nett den grunnen.

So fingeren som vekkjer må svelgje sitt eige klikk — same grepet scena alt gjer
med det klikket eit drag lagar. CSS-en skal med likevel, og er ikkje overflødig:
utan han tek eit handtak fingeren og eit drag byrjar med det same, og der finst
det ikkje noko klikk å svelgje.

Det andre er det som er verdt mest: skriv vakta om so ho les verknaden.

    lat det sovne
    for kvar overlagd kontroll:
        les tilstanden (plantal, valt plan, vri, steg)
        trykk der han står
        krev at tilstanden er den same
    og so: eitt trykk vekkjer, og gjer heller ikkje noko

Den vakta hadde vore raud i dag. Den som står der har aldri kunna verta det.

Og for å seie kor mykje det tyder: heile `pnpm panel` er **grøn** medan feilen
over er live. 374,9 s, 366 prøver, seksten bolkar, `skalet` iblant dei. Ein sel
som er grøn medan ein knapp du ikkje ser skjer i objektet ditt er ikkje ein sel
som tok feil — han er ein sel som svarte på eit anna spørsmål enn det som vart
stilt.

**Og so gjennomgangen.** `panel.ts` har 366 `sjekk`-kall og 75 lesingar av
`getComputedStyle`/`getAttribute`. Dei fleste er rette — ei ugjennomsikt på 0 ER
det vi meiner med «borte». To påstår at noko er **dødt** ved å lesa ein
eigenskap: linje 2463 og linje 868. Den på 868 gjeld ei SVG-gruppe med liner og
tal og ingen born som tek fingrar, so ho er sann av lukke. Gå gjennom alle 75 og
spør om kvar av dei: *kva ville ha stått raudt om koden var gal?* Der svaret er
«ingenting», skriv ho om til å lesa ein verknad.

---

## 2. Koden veks 42 % på åtte dagar, mot ein plan som seier ein tredel

`REBUILD.md` vart sist rørt 4. september, og skreiv storleiken sin inn i seg
sjølv: 14 323 liner kjelde, med målet **«under ein tredel av dette»** — kring
4 500. Målt i dag, på kvar tredje bunt sidan:

(Tala under tel `.ts` og `.tsx` under `lib/`, `components/` og `app/`, so dei
ligg litt under `REBUILD.md` sine, som tek CSS-en med. Banen er den same.)

    3. sep   13 675 liner kjelde    5 901 selar
    4. sep   15 138                 7 262
    8. sep   15 807                 7 683
    9. sep   17 546                 8 582
   10. sep   19 111                 9 444
   12. sep   19 297                 9 577

Ni dagar, **+41 %**, og ikkje éin bunt med netto nedgang. Kring 625 liner om
dagen. Målet er ein tredel; banen er fire gonger målet og stig.

Dette er ikkje eit argument for å slutte å byggje. Kvar av dei ni dagane la til
noko som verkar, og selane voks med koden — det er rett gjort. Men *«sikt mot
ein tredel»* er eit ynske, og eit ynske har aldri stogga ei line. Vekta ligg to
stader:

    components/scene.tsx    3 436 liner    ← Handa: 925 liner, 30 parametrar
    components/studio.tsx   2 868 liner    ← ein komponent frå linje 220 til slutt

Dei to er **44 % av all kjelde i eit prosjekt med 43 filer.** `Handa` er éin
funksjon med ein `useEffect` som koplar åtte lyttarar og skil mellom skisse,
plan, rutenett, omriss, spor, bit og kamera inni seg. Kvar feil som er
retta i gestane dei siste to vekene — klypet mot kameraet, prikken på sida,
sporhandtaket som høyrde på feil peikar — er den same feilen på nytt: **ein
kanal las ei hending som høyrde ein annan til**. Det er ikkje uflaks. Det er
forma på ein funksjon der alle kanalane deler eitt skop.

**Tiltak.** Ikkje ei omskriving. To mekanismar, av di ein mekanisme held og eit
ynske ikkje gjer det:

1. **Eit tak per fil, i CI.** Ei line i `vakter.yml` som ryk når `scene.tsx`
   eller `studio.tsx` veks. Set taket på det dei er i dag, ikkje lågare — det
   skal ikkje blokkere arbeid, det skal gjera vokster til ei **avgjerd** nokon
   tek med opne auge i staden for noko som berre skjer. Vil du over, senk ein
   annan stad fyrst.
2. **Skil éin kanal ut av `Handa` om gongen**, og berre når du likevel er inne i
   han for å rette noko. Kvar kanal er det same: kva ho eig, kva ho melder, kva
   ho slepper. Det er `arbitrering`, og i dag er ho fordelt utover 925 liner.

   **Gjort den 13., for STREKHANDTAKA.** `Handa` 976 → 921 liner, og `Streket`
   er 126. To ting kom ut av det som er verdt meir enn dei femti linene:

   - **Arbitreringa er eitt ord.** `arb` seier kven som held gesten, og `Handa`
     les han i `handtakGaar()`. Det var `mode` som gjorde den jobben, og `mode`
     er eit delt skop — nett det ein kanal utanfor ikkje kan nå. Kanal nummer
     to treng ikkje finne opp mønsteret på nytt.
   - **Grepet må liggje i ein ref, ikkje i ein `let` inni effekten.** Fyrste
     utgåva mista det: køyrde effekten om att medan fingeren var nede, vart
     closuren riven ned, og rørslene etterpå fann ingenting å flytte. Det
     gjeld kvar einaste kanal som vert flytta ut.

   **Og vakta kom FØRST.** Kanalen har tre modus, og berre «flytt» var prøvd —
   storleik og vri stod utan dekning, medan alle tre deler stat og slepp. Ei
   utflytting utan dei to hadde vore ein refaktor i blinde på to tredelar av
   koden. Dei to nye prøvene felte utflyttinga med ein gong, og det er heile
   grunnen til at rekkjefylgja er det ho er.

`REBUILD.md` punkt 1 seier kva som kollapsar når han vert teken: rutenettet,
låsen, nålene og kvart tilfelle per akse er ei form kvar i dag og skulle vore
éi liste. Det er den store innsparinga, og han er framleis uteken.

---

## 3. ~~Rekning for fanar som ikkje kan syne henne~~ — feil premiss, og den ekte kostnaden låg ein annan stad

**Denne saka stod feil på sida, og målinga tok henne.** Ho står att som ho vart
retta, av di ein plan som stryk feila sine lærer ingen noko.

Påstanden var: `bygg("lag", …)` køyrer i kvar fane, og i `kontur` og `montasje`
ser ingen resultatet, so hopp over det. To ting ved han heldt ikkje.

**Måltala kjem ikkje frå ei eiga spørjing.** `maal` vert posta hundre
millisekund etter kvart BYGG, inne i bygg-greina (`lib/worker.ts:213`). Å
hoppe over bygget i `kontur` og `montasje` ville teke topplina — plan, delar,
ark og tid — bort i dei to fanene.

**Og det ville ikkje spart noko.** Snittinga er memoisert og delt av alt som
spør. Målt på ei kule med seksten plan:

    montasje åleine            213 ms
    bygg + maal + montasje     210 ms
    ark åleine                 228 ms
    bygg + maal + ark          220 ms

Rombygget oppå det fana alt treng er gratis, av di snittinga alt er rekna.
Innsparinga er null, og prisen er topplina.

**Den ekte kostnaden stod ei line unna.** Koden bygde TO gonger på kvar
parameterendring — `lav` med det same, `mid` tre hundre millisekund etter —
og det er ei avveging som berre løner seg om det grove er raskare. Det er det
ikkje:

    60 celler   230 ms        lav so mid (som det stod)   452 ms
   120 celler   212 ms        mid åleine                  224 ms
   220 celler   211 ms        mid to gonger               219 ms
   320 celler   215 ms

Snittinga er **flat i celletalet** — arbeidet ligg i trekantane per plan og
ikkje i feltet — so `DETAIL` styrer kor fint resultatet vert og ingenting anna.
Det grove passet kjøpte eit dårlegare omriss til full pris, og buffernøkkelen
har celletalet i seg, so dei to bygga delte ingenting. Eit andre bygg på same
posen er derimot gratis.

Eitt nivå i staden for to: **452 → 224 ms per parameterhakk, i kvar fane**, og
det du ser fyrst er det laseren får. På ein telefon, tre til fem gonger
tregare, er det halvsekundet eit heilt sekund.

Lærdomen er den same som sak 1: eit tal som ikkje er målt er ei gjetting med
sifre i. NESTE.md sitt «~460 ms» var rett i storleik og feil i årsak, og ei
retting etter årsaka ville kosta topplina og spart null.

## 4. `kvile` gjeld ikkje montasjen

`components/studio.tsx:2065` tek `kontur` ut av søvnen, men ikkje `montasje` —
lese i koden i dag. Målt (NESTE.md): fana søv ikkje ved 1,2 s, og søv ved
3,8 s — midt i animasjonen, med den einaste kontrollen sin på veg ut. Å sjå på noko som rører seg er ikkje kvile.
`view !== "montasje"`, eller hald han av so lenge `montSpel` står.

## 5. Vakta på taket ryk på last, ikkje på kode

Fyrste køyringa mi av `pnpm tak` var raud:

    FEIL snittinga er lineær ... 320 → 816 ms (×2,55, lineært er 2,00)

Han køyrde medan `pnpm build` åt fire kjernar. Åleine, tre gonger på rad:
**×1,84, ×1,95, ×1,90**. Grensa er 2,3. Koden er lineær; vakta las trengsel.

Kommentaren over grensa er rekna og ikkje gjeten — 2,40 for eit halvt kvadratisk
ledd, 2,67 for eit heilt — og det er godt arbeid. Men brøken er to veggklokke-
målingar med kvar sin støy, og han står i CI, der naboen er ukjend. `CLAUDE.md`
krev at dei hovudlause held seg grøne; ei vakt som kan verta raud av ein
travel tenar lærer folk å køyre henne om att, og ei vakt folk køyrer om att er
ikkje lenger ei vakt.

Mål **arbeid** i staden for tid — pakkinga tel allereie kolonnar og spenn, eit
tal som er det same på kvar maskin. Tel det snittinga gjer per plan, og prøv
doblinga på det. Går ikkje det, køyr doblinga tre gonger og ta den beste: støy
gjer tal større, aldri mindre, so den beste av tre er den reinaste målinga.

---

## 6. Montasjen har biletet, men ikkje notatet

Det største **ufullførte**, til skilnad frå det mest brotne.

`montering.txt` (`lib/motor.ts:105`) skriv allereie nett det ein person treng
medan han skrur: ordenen, adressa som står gravert på delen, vegen han kjem inn
(`ned`, `frå sida`), og kva som alt ligg der han skal møte. I dag finst det berre
inni ALT-pakka — so telefonen i handa syner rørsla, og orda ligg i ei fil på ei
anna maskin.

`MontDel` (`lib/montasje.ts:43`) ber `adr`, `steg` og `ark`. Han ber **ikkje**
vegen inn; det er `snitt.montering.retning[id]`, som motoren reknar ut og berre
nokon gong skriv inn i tekst. Eitt felt til i nyttelasta, og arket i
montasjefana kan liste delane i steget som står, med adresse og veg, og rulle
med animasjonen.

Det rettar tre ting til på ein gong:

- **Planlista er ein blindveg i montasjen.** Trykk på ei rad: ho merkjer seg
  vald, og ingenting hender nokon stad — rett nok, av di montasjen ikkje endrar
  eit einaste tal. Men arket byr framleis fram eit val fana ikkje kan svare på.
  Byt henne med steglista når `view === "montasje"`.
- **Ein tom montasje seier ingenting.** Ingen plan → blank skjerm og
  `steg 1/1 · 0`. Sei `ingen delar`, slik lina i arket allereie gjer.
- **Eit trykk på ein del gjer ingenting.** Det er den sjølvsagde gesten i den
  fana: trykk på ei ribbe, få adressa og steget hennar.

## 7. Å forlate montasjen gløymer kvar du kom frå

`romsyn` (`components/studio.tsx:243`) fylgjer den siste **rom**-fana — `if (rom)
romsyn.current = view`, so `kontur` skriv han aldri. Målt (NESTE.md):
`kontur` → `M` → `Esc` landar i `lag`. Anten fylg den siste fana av kva slag som
helst, eller sei rett ut at montasjen alltid kjem attende til rommet. To liner
kvar veg; poenget er å velja på føremon.

## 8. `toFingrar` set to fingrar ned i den same hendinga

`scripts/panel.ts:127` sender éin `touchStart` med båe punkta. Det er rett når
båe høyrer til den same gesten — men det er ikkje slik ei hand verkar, og det er
grunnen til at feilen med kameraet på sideprikkane levde gjennom ei grøn vakt so
lenge han gjorde. Gjev han ein `lag`-parameter: fyrste fingeren ned, *n* bilete
med rørsle, so den andre.

Dette er den same saka som **1**, i ei anna drakt: ei vakt som prøver noko
lettare enn det verkelegheita gjer.

## 9. Dei fire fanane er knappar og ikkje ein tablist

`components/toppline.tsx:149` gjev fire `aria-pressed`-knappar. VoiceOver les
fire brytarar i staden for «fane 2 av 4». `role="tablist"` / `role="tab"` /
`aria-selected` kostar ingenting og er sant.

---

# Vidareutvikling

Det over er å rette. Dette er å byggje. Tre saker, etter kva dei opnar.

## A. ~~Eit bøygt plan ber ikkje ledd~~ — steg 1 og 2a står; att er det SKRÅ planet

**Gjort den 13.** Steg 1 (`kryssBoygd`) og steg 2a (`kryssRing`) er skrivne.
Eit bøygt plan ber ledd mot flate ribber LANGS aksen sin og mot golv
VINKELRETT på han, og dei to er ytterpunkta av kvarandre. Prisen låg der
analysen under sa han låg — «å la eit spor vera ein boge» — og det er `Spor.k`
i `lib/snitt.ts`.

Målt, med `pnpm probe`: eit krumt skal med fire bøygde plan, fire flate langs
aksen og to golv teljer no **32 ledd, akkurat som det same settet flatt**, mot
24 før. Radien i golvet sitt spor vert lesen attende av sporet sjølv: 1000,0 mm
mot sylinderen sine 1000,0 mm, verst 1,4e−12 mm. Og i det utbretta mønsteret er
dei same ledda rette, av di `u` er buelengd.

`pnpm ledd` har tre nye saker med bogna spor; `pnpm raad` prøver både at golva
er grøne og at dei SKRÅ plana framleis vert talde.

**Att står 2b: kva vinkel som helst.** Ein ellipse mot ei sinuskurve, og
monteringsspørsmålet der er ekte. Og steg 3, to bøygde plan. Analysen under
står som han var — han er grunnen til at steg 2 delte seg i to, og til at det
eine var mykje billegare enn det andre.

---

Dette var det største **funksjonelle** holet i reiskapen, og det stod skrive som
ein hard regel (`lib/rules.ts:376`):

> Eit bøygt plan vert skore rett, men det får ingen spor: kryssinga mellom to
> bøygde flater er ei kurve, og den finnaren er ikkje skriven enno. Ribba kjem
> ut som ei laus plate du må feste sjølv.

Bøyen er ferdig overalt elles. Geometrien står (`pnpm probe`: mønster 300,8 mm
mot bue 300,8 mm ved bog 0,25), kuttfilene kjem ut, regelen om kva materialet
toler er rekna og prøvd, og `pnpm tak` held bogane under det doble. Alt saman —
og delen kan ikkje gripe i noko. Ein bøygd del er i dag ein pynt.

**Og han er nærare enn regelen let det høyrast.** Eit bøygt plan er ein sylinder,
og ein sylinder er **utbrettbar**: bogelengda langs krumminga er bevart nøyaktig,
so avbildinga frå eit punkt på flata til plassen hans i det flate omrisset er
den same avbildinga kuttfila allereie bruker. Finnaren treng ingen ny geometri.
Han treng å prøve kryssingskurva punkt for punkt, køyre kvart punkt gjennom den
avbildinga, og få ei brotne line i den flate ramma. Sporet fylgjer henne i
staden for ei rett line.

Men ikkje alle kryssingar let seg setje saman, og det er truleg difor dette ikkje
er skrive: to flater som møtest langs ei kurve kan berre skuvast i hop om kurva
er **rett i den vegen dei kjem frå**. Eit spor som bognar er eit spor ingenting
kjem inn i.

So ta det i tre steg, og la den harde regelen stå til kvart steg er dekt:

1. **Eit bøygt plan kryssa av eit flatt, med normalen langs bøyeaksen.** Då er
   kryssinga ei generatorline på sylinderen, ho brettar ut til ei **rett** line,
   og alt under er som i dag. Det er tilfellet «krumt skal med flate ribber»,
   som er det folk faktisk lagar. Hard regel berre for resten.
2. **Eit bøygt plan kryssa av eit flatt i kva vinkel som helst.** Kurva er ein
   kjeglesnitt, ho brettar ut til noko bogeforma, og spørsmålet om det let seg
   montere vert ekte. Reglane har allereie forma for dette: rekn det ut, og la
   `orden`-regelen seie nei når det ikkje går.
3. **To bøygde plan.** Ei generell romkurve. Sist, og kanskje aldri.

Verifikasjon finst allereie: `pnpm ledd` prøver at kvart ledd panelet talde
finst att i kuttprofilane. Steg 1 er ei ny sak i den selen, ikkje ein ny sel.

**OG STEG 2 DELER SEG I TO, DER DET EINE ER MYKJE BILLEGARE ENN DET ANDRE.**

Målt, ikkje gjeten. Eit bøygt plan med aksen langs z og eit GOLV vinkelrett på
aksen — det motsette ytterpunktet av steg 1, og nett det eit krumt skal med tak
og botn er. Kryssingskurva rekna i 49 punkt og lese frå båe sidene:

    i det bøygde mønsteret   w er KONSTANT, spenn 0,0e+0 mm
    i golvet si ramme        sirkelboge, radius 333,33 mm
                             (sylinderen sin R er 333,33)
                             største avvik frå bogen 5,7e-14 mm
                             bogen er 33,2 × 290,0 mm

Planet z = c skjer sylinderen der `w = c`, og `w` er millimeter langs aksen —
so i det UTBRETTA mønsteret er møtet ei rett line, nett som i steg 1. Sporet på
den bøygde delen er eit spor som alle andre: eitt punkt, éi retning.

Det som manglar er sporet på den ANDRE sida: ein sirkelboge med nøyaktig
sylinderradien. Og montasjen går opp — skalet vert skuve rett ned langs aksen
sin, og bogen i golvet er tverrsnittet hans.

So steg 2 er eigentleg:

    2a  golvet vinkelrett på aksen     éin rett spor og ÉIN BOGE.
                                       Kjeglesnittet er ein sirkel, og
                                       delen let seg skuve inn.
    2b  kva vinkel som helst           ellipse mot sinuskurve, og
                                       monteringsspørsmålet vert ekte.

`snitt.ts` sa sjølv kvifor ingen av dei var skrivne: «spor-maskineriet
byggjer heilt igjennom på at møtet er ei RETT LINE, med eitt punkt og éi
retning». Prisen for 2a var ikkje geometrien — ho er rekna over — det var å la
eit spor vera ein boge. Det er `Spor`, feltet som skjer spora inn i profilen,
nettet, uttaka og `pnpm ledd`.

Men 2a er det som stod mellom reiskapen og «krumt skal med golv», som er den
vanlegaste bøygde forma som finst, og som misste ein fjerdedel av ledda sine i
stille (sjå G).

**OG DET VISTE SEG Å KOSTE 198 LINER I `snitt.ts`, DER OM LAG SEKSTI ER
REKNING.** Sporet fekk ei krumming, og fire rekningar måtte fylgje henne:
punktet på lina, punktet attende, stykka ei line går gjennom gods i, og lina
som brotne line til teikning. Alt anna — feltet, uttaka, montasjen, plata,
rommet — les dei fire og treng ingen ny grein.

Éi ting til kom fram undervegs, og ho var ikkje i planen: **ein bøygd del vert
ikkje SKUVA inn, han vert BØYGD inn.** Ein sylinder har berre to slag ledd, og
rullinga tek båe — generatoren står still medan flata krummar seg, bogen grip
som ein glidelås. Utan det ville kvar einaste bøygd ribbe med golv gått rett i
«kan monterast» og stått raud for ein montasje som går heilt fint.

## B. ~~Pakkinga: eit ekte søk~~ — fem hundre rekkjefylgjer sparte ikkje éi plate

`lib/pack.ts:502` seier det sjølv, ærleg:

> Platetalet stod stille på alle — det er grensa for det ein handfull grådige
> passasjar kan; **ei plate mindre krev tusen.**

Målt i dag: utnytting **53 %, 59 %, 55 %** over tre pakkingar. Kvart prosentpoeng
er material, og ei plate er ei plate.

Grunnen søket ikkje finst er rett og god: platetalet står i panelet og skal fylgje
skyvaren, og ein pakkar som er fire gonger tregare er fire gonger for sein der.
`BUDSJETT = 12 000 000` er nett den avveginga, og han er rett — **for den
pakkinga som svarar på ein skyvar**.

Men det er to spørsmål her, ikkje eitt:

    kor mange plater vert dette?     → må svare medan fingeren dreg
    kva er den beste lada?           → skal svare når du har bestemt deg

Det andre har ingen tidsfrist. Du dreg i skyvarane, og når du sluttar, går eit
ekte søk — tusen rekkjefylgjer, i arbeidaren, medan du ser på det du alt har —
og arket vert betre medan du ser på det. Ingen ventar på noko: det grådige
svaret står med det same, som no, og det gode kjem etter. Er det ikkje betre,
seier ingen noko.

Det høver dessutan huset: `REBUILD.md` seier at å leggje ut delane **er**
designarbeidet, og at plata får heile skjermen. Det er den einaste flata der å
vente to sekund på eit betre svar er noko ein person gjerne gjer.

Måltalet er allereie definert og allereie prøvd: `pnpm pakk` skriv utnytting og
platetal per sak. Ein plan med eit tal å slå.

---

**OG SO VART DET PRØVT, OG SVARET VAR NEI.**

Strategilista vart mellombels utvida frå fire til **502** rekkjefylgjer, med
budsjettet ope, og `pnpm pakk` køyrt på alle fjorten sakene sine:

    objekt                    ark (4 → 502)   utnytting
    kube 6×6                       2 → 2        68 → 68
    kube 400, 12×9 i 12 mm         6 → 6        53 → 53
    kube vend/700                  3 → 3        56 → 56
    kule 7×7                       2 → 2        53 → 53
    egg 8×8                        1 → 1        56 → 59
    torus ståande                  1 → 1        46 → 46
    kule stor plate                1 → 1        53 → 53
    kule 1600×1000                 2 → 2        63 → 68
    kube finerplate                7 → 7        79 → 79
    egg i 6 mm                     1 → 1        51 → 54
    kam med tre tindar             1 → 1        44 → 44
    breitt snitt                   2 → 2        53 → 54
    same objekt, smalt snitt       6 → 6        59 → 59
    same objekt, breitt snitt      6 → 6        55 → 55

**Platetalet stod stille på alle fjorten.** Utnyttinga flytta seg på fire av
dei, med eitt til fem poeng — ei ryddigare siste plate, ikkje material spart.
Kostnaden var 12 s → 112 s, ni gonger.

`pack.ts` sa «ei plate mindre krev tusen». Fem hundre gav null, so tusen gjev
det truleg òg. Grådig botn-venstre med fire vendingar er alt på platået sitt
for desse formene, og det som står mellom oss og ei plate mindre er ikkje
FLEIRE rekkjefylgjer — det er ein annan algoritme.

To lovande retningar, båe umålte:

- **Fleire vendingar.** Pakkinga prøver fire. Ei ribbe frå eit krumt objekt er
  ei tunge; to tunger som ligg 15° mot kvarandre kan gripe i kvarandre slik
  fire rette vendingar aldri får dei til. Dette er den billegaste å prøve.
- **Ekte nesting med no-fit-polygon.** Det er det kommersielle pakkarar gjer,
  og det er ei anna mengd arbeid enn dette.

Å byggje søket slik det stod skildra ville kosta arbeidarplass, ei ny melding,
og ein stat som bryt «eitt bygg, éi sanning» — for null plater.

## C. ~~Taket på plana~~ — og kvifor ei romleg deling ikkje er svaret

**Framlegget her var å luke bort par før dei vert rekna. Tala seier at det ikkje
er noko å luke.**

Påstanden var: ledda veks kvadratisk, so ei romleg deling som berre prøver par
som deler ei celle tek dei fleste bort. Det fyrste er sant; det andre fylgjer
ikkje av det.

Sjå på dei to kolonnane `pnpm tak` allereie skriv. Ved 64 plan:

    parallelle (2016 par prøvde, 0 kryssar)      628 ms
    rutenett   (1024 par kryssar, 732 ledd)     1359 ms

Dei parallelle prøver kvart einaste par og forkastar alle: `kryss` reknar eit
kryssprodukt og gjev null når normalane er parallelle. Det er O(1) per par, og
64 plan rein snitting er kring 640 ms åleine — so dei 2016 avvisingane kostar
ikkje målbart noko. **Å luke bort eit par er allereie gratis.**

Det som kostar er ledda SJØLVE: 732 av dei ved 64 plan, kring ei millisekund
kvar. Dei er ikkje bortkasta arbeid — dei er svaret. Ei deling kan ikkje fjerne
eit ledd som finst.

Det står att eit mindre stykke: kring 300 av dei 1024 kryssande para gjev
ingenting likevel (for lite overlapp, eller skuldra seier nei), og dei betaler
for `stykkeLangs` på båe ribbene fyrst. Det er ekte, men det er ikkje det
kvadratiske leddet, og det er ikkje skilnaden mellom førti og hundre plan.

**So taket står, og grunnen er ærleg: eit objekt med hundre plan HAR tusenvis
av ledd, og dei må reknast.** Vil nokon heve taket, er vegen å gjera kvart ledd
billegare, ikkje å prøve færre par.

---

# Det som kom fram då planen vart køyrt om att

Fire saker, alle funne ved å køyre selane og lesa kva dei IKKJE spør om. Dei
tre fyrste er den same saka som nummer 1 på denne sida, i tre nye drakter: ei
prøve som er grøn av di ho ikkje kan verta raud. Den fjerde er eit tal
reiskapen hadde og ikkje sa.

## D. «For tett» var den einaste raude lina utan ein knapp

Regelen om opninga mellom plana (nr. 10 i `rules.ts`) sa «flytt det eine, eller
ta det bort», og lét deg gjere båe delar sjølv. Kvar annan mjuk regel som HAR
eit botemiddel ber det som eit trykk.

Rådet reknar no kva som fell: lukene vert målte nøyaktig slik `minGap` måler
dei — same vinkelbandet på ti grader, same uttrykket, same rekkjefylgja — og
ribbene ligg i lista i den rekkjefylgja plana står. Éin gjennomgang, og det som
står att har luke nok mot kvart av dei andre. Det er den same rekninga regelen
les etterpå, so knappen kan ikkje bomme.

    kube 100 mm i 3 mm, 24×24     1,2 mm → 5,3 mm     48 plan → 24
    same, 40×40                  -0,5 mm → 4,5 mm     64 plan → 22
    kube 60 mm i 6 mm, 12×12     -1,0 mm → 4,0 mm     24 plan → 12

`riv`, av di det tek plan du har sett: knappen står, angre tek han, og «fiks
alt» rører han ikkje.

## E. Ei line om nettoppløysinga som aldri kunne verta raud

Regelen stod på «under to hundre trekantar». Skyvaren botnar på eit halvt
tusen, `budsjett` gjev heile taket til ei einsam kjelde, og forenklinga stoggar
NÅR ho har nådd budsjettet — ho held ikkje fram under det:

    kule 18 432 trekantar → 384      sylinder 1 024 → 224
    kule  4 608 → 384                rutekube 3 072 → 432
    kule  1 152 → 408                rutekube   768 → 432

Botnen ligg kring tre hundre og femti. Og eit nett som ER under to hundre har
ikkje fleire å miste — då er `tris >= srcTris`, og lina er grøn av den andre
grunnen. Lina kunne altso ikkje verta raud i nokon tilstand reiskapen kan koma
i.

Taket sjølv er talet no, og det er sant nett på det lågaste hakket. Kva hakket
kostar, målt på ei kule på 200 mm med fire og fire plan: kuttet 7,413 m mot
7,495 og massen 0,3651 kg mot 0,3759 — tre prosent gods lese av eit nett som
ikkje er der.

## F. Og so mekanismen: kvar regel må ha vore raud ein gong

D og E var to enkelttilfelle. Det som tek det tredje er ikkje å finne det —
det er å gjera det umogeleg å leggje til eit fjerde i stillheit.

`pnpm raad` prøvde at eit råd rettar det det seier. Han prøvde ikkje at
regelen kan brytast i det heile. No samlar `reglane` kvar regel som har vore
raud undervegs, og den siste vakta i fila listar dei som aldri var det.
Prøvd ved å setje nettaket attende til to hundre: **«aldri raud: nett»**.

To reglar hadde ikkje ei sak før:

- **«lukka nett»** — kommentaren i fila lova ein prøve på eit nett med hòl i,
  og køyrde ei kule som er lukka. No er det ein kube med ei flate borte.
- **«utnytting»** — regelen slepper alt som får plass på EI plate, so ein sak
  måtte ha to: åtte tynne ringar på 450 × 100 mm, 27 % over to ark.

Seksten reglar, seksten broten og prøvde. Legg du til ein regel, må du leggje
til saka som bryt han.

## G. Åtte møte fall bort i stille

Det største av dei fire, og det einaste som er geometri.

Eit bøygt plan er ein sylinder. Eit flatt plan LANGS aksen hans møter han i ei
generatorline og vert eit ledd — steg éin, gjort. Eit flatt plan som SKRÅR mot
aksen møter han i eit kjeglesnitt, og den finnaren er ikkje skriven.

Det stod i den harde regelen, men han tel ribber UTAN SPOR. Ei bøygd ribbe som
har eit plan langs aksen sin ER festa, og gjekk difor grøn — medan kvart skrå
plan fall bort utan eit ord. Målt på det folk faktisk lagar, eit krumt skal med
tak og botn (fire bøygde plan, fire flate langs aksen, to golv på tvers):

    bøygd   24 ledd, 8 møte som er kurver
    rett    32 ledd, 0 møte som er kurver

Åtte av to og tretti ledd — ein fjerdedel av grepet i objektet — borte, og
topplina sa fire og tjue og ingenting meir. Det er den same saka som `avvist`,
og svaret er det same: tel dei, og sei talet.

`Snitt.kurva` ber det bøygde planet sin id for kvart møte som fell, ein mjuk
regel seier kor mange, og rådet rettar ut nett dei plana som misser møte.
Talet tel ikkje det som aldri var der: kurva
`w(u) = (n·o − n·ut(kr,[u,0]))/(n·v)` vert skanna over spennet profilen har, og
møtet er ekte berre om eit punkt på henne ligg INNE i profilen.

Berre bøygd mot flat vert talt. To bøygde flater møtest i ei romkurve, og å
avgjera om dei i det heile møtest er ei anna rekning; dei står att hjå den
harde regelen.

Kosta ingenting målbart: 24 bøygde og 24 skrå plan, 1468 ms med teljinga og
1501 ms utan.

**Og no er det eit tal på kva steg 2 i sak A er verdt.** Framlegget der stod
utan pris; det står med ein no, og prisen er ein fjerdedel av ledda på den
vanlegaste bøygde forma som finst.

**Og det talet vart teke inn den 13.** Golva stod VINKELRETT på aksen, ikkje
skrått, og då er kjeglesnittet ein SIRKEL med sylinderradien — steg 2a. Same
settet no:

    bøygd   32 ledd, 0 møte som er kurver
    rett    32 ledd, 0 møte som er kurver

Teljinga står, og ho tel framleis: eit plan som SKRÅR mot aksen er det som er
att, og `pnpm raad` bryt regelen med to plan på 45°.

---

## H. ~~Ein bøygd del kan ikkje vera strammare enn plata toler~~ — no vert han RILLA

**Gjort den 13.** `lib/rille.ts`, 237 liner.

Sak A gav den bøygde delen ledd. Han hadde framleis ei grense som ingenting kom
forbi: `bog`-regelen. Tre millimeter finér toler 300 mm radius, seks toler 600,
og under det stod lina hard med eitt einaste råd — «rett ut bøyen». Ein
krakksete i den radien folk faktisk sit på fanst ikkje i reiskapen.

Regelen sa sjølv kvar vegen gjekk, og det hadde han sagt sidan han vart
skriven: *«Bøyeplate og kerfsnitt kjem under dette — og det er den vegen steg
to går.»*

No gjer det det. Under grensa får plata RADER MED SNITT på tvers av bøyen, eit
steg på ei platetjukn, anna kvar rad forskuva ein halv periode so bruene ikkje
står på line. Plata bøyer seg ikkje lenger som ei plate; ho bøyer seg som eit
hengsle.

**OG SPERRESONA ER IKKJE EIN FUNKSJON — HO ER DET SOM HELD RESTEN SANT.** Eit
band langs heile sporlina, tre tjukner til kvar side, der ingen snitt kjem.
Fysisk er det opplagt: godset som ber eit ledd skal ikkje vera perforert. Men
det er samstundes det einaste som gjer at leddrekninga framleis stemmer —
`stykkeLangs` les godset LANGS sporlina, og eit rillesnitt som kryssa henne
ville gjeve leddet ein skulder som ikkje finst. `pnpm ledd` er prøva, og ho
står: 0 tapte, 0 utan gods på begge sider, i alle 26 sakene.

Tre ting kom fram undervegs som ikkje stod i planen:

**Eit rillesnitt er ei LINE og ikkje ein ring.** Fyrste utgåva la snitta blant
`holes`. Då rauk `pnpm ledd` på volum — 20 % — av di øyreklippet ikkje greier
seks hundre tynne hòl i eitt polygon. Og kuttlengda vart dobbel: ein ring vert
gått ned den eine sida og attende den andre. Målt på eit krumt skal i 3 mm
finér: 44 meter som ringar, 22 som liner. So rilla vart ein TREDJE SLAGS BANE i
kuttfila — open, utan kompensasjon, av di opninga ER snittbreidda — og
`pnpm rekkje` måtte lære han: vakta las areal null som «ikkje eit hòl» og
dimed som eit omriss.

**Materialet rører geometrien no, og det gjorde det ikkje før.** `snittKey`
heldt materialet utanfor med vilje — «det rører ikkje geometrien» — og det er
ikkje sant lenger: kva materialet toler avgjer OM det er eit mønster. Eit
snitt hugsa utan materialet i nøkkelen gav papp sitt mønster, altso ingen, til
ei finérplate, og ingenting feila. `params.ts` åtvarar mot nett den feilen og
seier at ho har hendt to gonger; dette var den tredje, og ho vart fanga av at
tala ikkje endra seg når materialet gjorde det.

**Og tidsvakta måtte gjevast opp, tre gonger, før ho vart til noko anna.**
Fyrste freistnad varma opp med den same saka og las eit bufra null. Andre dropp
oppvarminga og målte JIT-en: 1,1 s fyrste kallet, 0,3 s andre, same kva for eit
material som kom fyrst — talet sa 2,6× og meinte «V8 hadde ikkje sett denne
koden før». Tredje bygde kroppen inni målinga, og han vert bufra mellom dei to,
so det RILLA bygget kom ut RASKARE enn det urilla. Tida er målt ved å kalle
mønsteret direkte — 50 ms for 3000 snitt, mot ei snitting på kring 300 — og ho
står i `tak.ts` som eit TAL. Vakta tel snittliner i staden, og måler at radene
ligg eit heilt tal steg frå kvarandre. Det er determinert, og det prøver
mekanismen.

**Kva reiskapen ikkje seier, og det står i regelen:** om brua held. Det er
vriding i eit materiale som ikkje er likt i to retningar, og det talet er ikkje
lese av geometrien. Regelen går raud berre når mønsteret ikkje LET SEG LEGGJE —
når verktyet er so grovt at snittet et rada. Alt anna er ein prøvestrimmel.

**Og so bøyeprøva, same dagen.** Rilla la eit tal reiskapen GJETTAR på inn i
kvar bøygd del: steget mellom to rader. Alt anna er målt — radien kjem av
bøyen, brua er tjukna du har med skyvelæret, lengda fylgjer brua — men steget
kjem av ein verkstadstabell som ikkje veit noko om DI plate. Og det er nett det
talet som avgjer om delen ryk.

Svaret er det same svaret passprøva alt var: skjer det ut og sjå etter. Fem
felt med kvart sitt steg — ein halv, tre fjerdedels, eitt, halvanna og to
gonger tabellen — talet gravert under kvart, og mønsteret lagt av `rilla`, den
same funksjonen delen vert skoren av. Ei prøve teikna for seg ville prøvt noko
anna enn det du får.

`pnpm rekkje` les henne attende: 29+19+15+10+8 rader over fem felt, verste
avvik frå det som står gravert 0,0000 mm. To ting kom fram: feltet måtte vera
TRE PERIODAR høgt før murforbandet i det heile fanst — fyrste utgåva var 1,3 og
prøvde noko anna enn delen — og strekfonten har korkje Ø, Æ eller Å, so «BØY»
kom ut som «B Y». `strokesAt` slepp det han ikkje kjenner i stille; teksten er
omskriven, og hòlet i alfabetet står att som noko nokon bør sjå på.

**Att står dei fem andre konstruksjonsprinsippa**, og dei er eit anna slag
arbeid enn dette: kryss-lask, kile, glidande spor, bøy-til-lås, og hud på
waffle. Rilla var føresetnaden for dei fire fyrste av dei.

---

# Rekkjefylgja

Kvart steg har noko som seier at det verka. Eit steg utan det er ikkje eit steg.

    1  Søvnen tek ikkje imot fingrar         → panel skalet, skriven om til å
       (CSS + svelgt klikk + vakta om)          lesa VERKNADEN: raud før, grøn etter
                                                 ✓ GJORT — tre nye prøver, grøne
    2  Gjennomgang av dei 79 eigenskaps-     → dei fleste er rette: huset SEIER at
       lesingane i panel.ts                     ein knapp skal vera flat, so å lesa
                                                 skuggen ER verknaden. Éi var ein
                                                 proxy for åtferd (målruta), og ho
                                                 trykkjer no. ✓ GJORT
    3  Tak per fil i vakter.yml              → CI ryk på ei line over taket
                                                 ✓ GJORT — `pnpm vekt`
    4  `kvile` og montasjen                  → panel skalet: søv ikkje i montasjen
                                                 ✓ GJORT
    5  Eitt byggjenivå og ikkje to           → målt: 452 → 224 ms per hakk
                                                 ✓ GJORT (og premissen retta: å
                                                 hoppe over fana sparar null)
    6  Vakta på taket tek den beste av tre   → prøvd under to samtidige bygg:
                                                 ×2,20 ×2,17 ×1,61 → held
                                                 ✓ GJORT
    7  Retninga inn i montasjenyttelasta     → probe: kopla del↔line held
                                                 ✓ GJORT
    8  Steglista, tomt-meldinga, trykk på    → panel montasjen
       ein del, tablist, romsyn                  ✓ GJORT (trykket og vakta hans
                                                 kom frå den andre økta)
    9  `toFingrar` med lag                   → `LAG` er ein miljøvariabel med
                                                 standard 6, på ALLE to-finger-
                                                 gestane ✓ GJORT (den andre økta;
                                                 betre enn framlegget her)
   10  Steg 1 av bøygde ledd                 → pnpm ledd: tre nye saker, 32/24/92
                                                 ledd, alle i profilane ✓ GJORT
   11  Ein kanal ut av `Handa`, når du       → panel telefon + handtaka
       likevel er inne i han                     ← DET EINASTE SOM STÅR ATT
   12  ~~Pakkesøket i arbeidaren~~           → strøken: 502 rekkjefylgjer sparte
                                                 null plater på 14 objekt (sjå B)
   13  ~~Romleg deling av leddpara~~         → strøken: å avvise eit par er
                                                 alt gratis (sjå C)
   14  Eit råd på «for tett» (D)             → pnpm raad: 1,2 mm → 5,3 mm, og
                                                 «fiks alt» let plana stå ✓ GJORT
   15  Nettaket kan verta raudt (E)          → pnpm raad: 384 av 4608 →
                                                 «prøv 1 k» → 992 ✓ GJORT
   16  Kvar regel må ha vore raud (F)        → prøvd med taket attende på 200:
                                                 «aldri raud: nett» ✓ GJORT
   17  Møta som er kurver vert talde (G)     → pnpm probe: 24 + 8 = 32 ledd når
                                                 bøyen er borte ✓ GJORT

   18  Rilla, og den stive øya (H)          → pnpm ledd: 0 tapte i 26 saker ·
                                                 pnpm rekkje: 660 opne baner i
                                                 den innvendige bunken, SVG og
                                                 DXF like · pnpm tak: 53 rader,
                                                 eit heilt steg frå kvarandre,
                                                 verst 0,0000 mm ✓ GJORT
   19  Bøyeprøva (H)                        → pnpm rekkje les henne attende:
                                                 29+19+15+10+8 rader over fem
                                                 felt, verste avvik frå det
                                                 graverte 0,0000 mm ✓ GJORT

Seksten av nitten er gjorde. To er strøkne av målingar — pakkesøket og den
romlege delinga — og begge står att på sida med tala som tok dei, av di ein
plan som stryk feila sine lærer ingen noko. Elleve står att, og han er
strukturell: han har ingen frist, og han vert billegare kvar gong nokon
likevel er inne i fila.

Og A steg 2 står att med ein pris no, og ikkje berre med ei skildring: ein
fjerdedel av ledda på eit krumt skal med tak og botn (sjå G). Han har dessutan
delt seg i to, og den eine halvparten — golvet vinkelrett på bøyeaksen — treng
ikkje eit kjeglesnitt i det heile: eitt rett spor og éin sirkelboge, målte i
sak A. Det er neste steg som er verdt noko, og det er det einaste som står
mellom reiskapen og eit krumt skal med golv.

**Og det eine som ikkje står i lista:** køyr den selen som dekkjer det du rørte.
`CLAUDE.md` seier at å endre geometri, uttak eller reglar utan det er den eine
tingen dette prosjektet ikkje har nokon måte å fange opp seinare — og sak 1 på
denne sida er kva som hender når ein sel er grøn utan å prøve noko.
