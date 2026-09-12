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
plan, rutenett, virvel, omriss, spor, bit og kamera inni seg. Kvar feil som er
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

`REBUILD.md` punkt 1 seier kva som kollapsar når han vert teken: rutenettet,
låsen, nålene og kvart tilfelle per akse er ei form kvar i dag og skulle vore
éi liste. Det er den store innsparinga, og han er framleis uteken.

---

## 3. Rekning for fanar som ikkje kan syne henne

`components/studio.tsx:827` køyrer `bygg("lag", "lav")` og eit avdempa
`bygg("lag", detail)` på **kvar** parameterendring, i **kvar** fane. I `kontur`
ligg lerretet gøymt; i `montasje` teiknar scena `Montasjen` i staden. Måltala
kjem frå ei eiga `maal`-spørjing, so ingenting på skjermen heng på det der.

Målt (NESTE.md): eit hakk på storleiksskyvaren kostar ~460 ms i `lag` og
~200 ms i `montasje` — der ingen ser resultatet. Eg har stadfest at rekninga
verkeleg køyrer i kvar fane, ikkje sjølve tala. Det er den same regelen økta
den 12. tok på knappane (*ein reiskap høyrer heime der du ser kva han gjorde*),
berre lagd på **arbeid**: rekn ikkje det fana ikkje kan syne.

Hopp over når `!rom`, og bygg éin gong på veg inn att. Mål på telefonen før og
etter — eit tal frå ein leigd tenar er ikkje eit tal nokon kan argumentere med.

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

## A. Eit bøygt plan ber ikkje ledd

Dette er det største **funksjonelle** holet i reiskapen, og det står skrive som
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

## B. Pakkinga: eit ekte søk, utanfor den kritiske vegen

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

## C. Taket på plana

`REBUILD.md` svarar «kring førti» på kor mange handsette plan ein telefon toler,
og det er rekna: ~10 ms per plan og ~1 ms per ledd, der ledda veks kvadratisk av
di kvart par som kryssar må finne ledda sine. 64 plan er 1,4 s her og tre til
fem gonger det på ein telefon.

Det er ikkje snittinga som er problemet — ho er lineær og målt. Det er **paret**.
732 ledd ved 64 plan, og talet går som *n²*. Ei romleg deling (kvart plan i eit
rutenett, berre par som deler ei celle vert prøvde) tek dei fleste para bort før
dei vert rekna, og dei fleste plan i eit verkeleg objekt kryssar ikkje kvarandre.

Dette er den minst hastande av dei tre: taket er nåbart, det seier frå når du når
det, og førti er mange plan. Men det er det som står mellom «ein reiskap med eit
tak» og «ein reiskap utan eitt», og `pnpm tak` måler allereie nett dette talet.

---

# Rekkjefylgja

Kvart steg har noko som seier at det verka. Eit steg utan det er ikkje eit steg.

    1  Søvnen tek ikkje imot fingrar         → panel skalet, skriven om til å
       (CSS + svelgt klikk + vakta om)          lesa VERKNADEN: raud før, grøn etter
                                                 ✓ GJORT — tre nye prøver, grøne
    2  Gjennomgang av dei 75 eigenskaps-     → kvar omskriven vakt skal vera raud
       lesingane i panel.ts                     når ho vert prøvd mot den gamle feilen
    3  Tak per fil i vakter.yml              → CI ryk på ei line over taket
                                                 ✓ GJORT — `pnpm vekt`
    4  `kvile` og montasjen                  → panel skalet: søv ikkje i montasjen
                                                 ✓ GJORT
    5  Bygg ikkje det fana ikkje kan syne    → mål hakket på skyvaren før/etter, på telefonen
    6  Vakta på taket måler arbeid           → tre køyringar under last, alle grøne
    7  Retninga inn i montasjenyttelasta     → probe: feltet står; panel: arket listar steget
    8  Steglista, tomt-meldinga, trykk på    → panel montasjen
       ein del                                   (tablist og romsyn ✓ GJORT)
    9  `toFingrar` med lag                   → dei gamle to-finger-bolkane, grøne ved 0, 6, 14
   10  Steg 1 av bøygde ledd                 → pnpm ledd: ei ny sak, bøygt kryssa av flatt
   11  Ein kanal ut av `Handa`, når du       → panel telefon + handtaka
       likevel er inne i han
   12  Pakkesøket i arbeidaren               → pnpm pakk: utnytting opp, 0 overlapp
   13  Romleg deling av leddpara             → pnpm tak: ms/ledd ned ved 64, ledd-talet likt

Ein til ni er ei økt eller to. Ti til tretten er kvar sin.

**Og det eine som ikkje står i lista:** køyr den selen som dekkjer det du rørte.
`CLAUDE.md` seier at å endre geometri, uttak eller reglar utan det er den eine
tingen dette prosjektet ikkje har nokon måte å fange opp seinare — og sak 1 på
denne sida er kva som hender når ein sel er grøn utan å prøve noko.
